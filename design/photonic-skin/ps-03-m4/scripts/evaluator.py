"""Phase-aware Python reference evaluator for PS-03.M4 TransitionProgram."""

from __future__ import annotations

from typing import Any, Mapping

import numpy as np

try:
    from contracts import (
        PER_ID_FLAG_BRIDGE,
        PER_ID_FLAG_EMERGENCE,
        PER_ID_FLAG_IMMERSION,
        STATUS_ACTIVE,
        VIEWPORT_PROFILES,
    )
    from m3_adapter import decode_normals, decode_orientations
except ImportError:  # pragma: no cover - package import path
    from .contracts import (
        PER_ID_FLAG_BRIDGE,
        PER_ID_FLAG_EMERGENCE,
        PER_ID_FLAG_IMMERSION,
        STATUS_ACTIVE,
        VIEWPORT_PROFILES,
    )
    from .m3_adapter import decode_normals, decode_orientations


def smooth5(value: np.ndarray | float) -> np.ndarray | float:
    """Quintic smoothstep with zero first and second derivatives at 0/1."""

    return value * value * value * (10.0 + value * (-15.0 + 6.0 * value))


def smooth5_derivative(value: np.ndarray | float) -> np.ndarray | float:
    return 30.0 * value * value * (1.0 - value) * (1.0 - value)


def quintic_window(
    t: float, start: np.ndarray | float, end: np.ndarray | float
) -> np.ndarray:
    start_value = np.asarray(start, dtype=np.float64)
    end_value = np.asarray(end, dtype=np.float64)
    local = np.clip((t - start_value) / np.maximum(end_value - start_value, 1e-9), 0.0, 1.0)
    return np.asarray(smooth5(local), dtype=np.float64)


def c2_bump(t: float, start: np.ndarray | float, end: np.ndarray | float) -> np.ndarray:
    """Unit-height compact bump whose value/velocity/acceleration vanish at bounds."""

    start_value = np.asarray(start, dtype=np.float64)
    end_value = np.asarray(end, dtype=np.float64)
    local = np.clip((t - start_value) / np.maximum(end_value - start_value, 1e-9), 0.0, 1.0)
    inside = (t > start_value) & (t < end_value)
    bump = 64.0 * local**3 * (1.0 - local) ** 3
    return np.where(inside, bump, 0.0)


def local_handoff_windows(
    header: Mapping[str, Any],
    group: np.ndarray,
    per_id: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return the narrow, spatially ordered C2 handoff for every ID.

    Outside this finite window an ID stays exactly on its source or target
    local skin. Only the coherent moving band uses the macro route, avoiding a
    whole-object half-morph into an unstructured cloud.
    """

    policy = header.get("activationPolicy", {})
    phase_range = float(policy.get("phaseOffsetRange", 0.0))
    width = max(float(policy.get("localMorphWidthFraction", 0.12)), 1e-4)
    phase_offset = per_id["phaseOffset"].astype(np.float64) / 255.0 * phase_range
    release_end = group["releaseEnd"].astype(np.float64)
    reveal_end = group["revealEnd"].astype(np.float64)
    latest_start = np.maximum(release_end, reveal_end - width)
    local_start = np.minimum(release_end + phase_offset, latest_start)
    local_end = np.minimum(local_start + width, reveal_end)
    local_end = np.maximum(local_end, local_start + 1e-4)
    return local_start, local_end, phase_offset


def quintic_initial_velocity_basis(t: float) -> float:
    """h10 for p(0), v(0), a(0), p(1), v(1)=0, a(1)=0 closure."""

    return t - 6.0 * t**3 + 8.0 * t**4 - 3.0 * t**5


def _program_value(program: Any, snake: str, camel: str | None = None) -> Any:
    if hasattr(program, snake):
        return getattr(program, snake)
    if isinstance(program, Mapping):
        if snake in program:
            return program[snake]
        if camel is not None and camel in program:
            return program[camel]
    raise KeyError(snake)


def _count(records: np.ndarray | Mapping[str, Any]) -> int:
    return len(np.asarray(records["position"])) if isinstance(records, Mapping) else len(records)


def _field(
    records: np.ndarray | Mapping[str, Any],
    name: str,
    count: int,
    default: Any,
    dtype: Any,
) -> np.ndarray:
    if isinstance(records, Mapping):
        value = records.get(name, default)
    elif records.dtype.names and name in records.dtype.names:
        value = records[name]
    else:
        value = default
    array = np.asarray(value, dtype=dtype)
    if array.ndim == 0:
        array = np.full(count, array, dtype=dtype)
    if len(array) < count:
        raise ValueError(f"endpoint field {name} count {len(array)} < {count}")
    return array[:count]


def _normalise(values: np.ndarray, fallback: tuple[float, ...]) -> np.ndarray:
    result = np.asarray(values, dtype=np.float64)
    lengths = np.linalg.norm(result, axis=-1, keepdims=True)
    weak = lengths[..., 0] < 1e-12
    result = result / np.maximum(lengths, 1e-12)
    if np.any(weak):
        result[weak] = np.asarray(fallback, dtype=np.float64)
    return result


def _slerp(q0: np.ndarray, q1: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    source = _normalise(q0, (0.0, 0.0, 0.0, 1.0))
    target = _normalise(q1, (0.0, 0.0, 0.0, 1.0))
    dot = np.sum(source * target, axis=1)
    target = np.where((dot < 0.0)[:, None], -target, target)
    dot = np.clip(np.abs(dot), 0.0, 1.0)
    theta = np.arccos(dot)
    sine = np.sin(theta)
    a = np.asarray(alpha, dtype=np.float64)
    weight0 = np.empty_like(a)
    weight1 = np.empty_like(a)
    regular = sine > 1e-7
    weight0[regular] = np.sin((1.0 - a[regular]) * theta[regular]) / sine[regular]
    weight1[regular] = np.sin(a[regular] * theta[regular]) / sine[regular]
    weight0[~regular] = 1.0 - a[~regular]
    weight1[~regular] = a[~regular]
    return _normalise(source * weight0[:, None] + target * weight1[:, None], (0.0, 0.0, 0.0, 1.0))


def _slerp_single(q0: np.ndarray, q1: np.ndarray, alpha: float) -> np.ndarray:
    return _slerp(np.asarray(q0, dtype=np.float64)[None, :], np.asarray(q1, dtype=np.float64)[None, :], np.array([alpha]))[0]


def _quat_axis_angle(axis: np.ndarray, angle: float) -> np.ndarray:
    axis_value = np.asarray(axis, dtype=np.float64)
    length = np.linalg.norm(axis_value)
    if length < 1e-12 or abs(angle) < 1e-15:
        return np.array([0.0, 0.0, 0.0, 1.0])
    axis_value = axis_value / length
    half = 0.5 * angle
    return np.concatenate((axis_value * np.sin(half), [np.cos(half)]))


def _quat_multiply(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    """Hamilton product, broadcasting either operand over N."""

    a = np.asarray(left, dtype=np.float64)
    b = np.asarray(right, dtype=np.float64)
    ax, ay, az, aw = np.moveaxis(a, -1, 0)
    bx, by, bz, bw = np.moveaxis(b, -1, 0)
    result = np.stack(
        (
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz,
        ),
        axis=-1,
    )
    return _normalise(result, (0.0, 0.0, 0.0, 1.0))


def _quat_rotate(quaternion: np.ndarray, vector: np.ndarray) -> np.ndarray:
    q = np.asarray(quaternion, dtype=np.float64)
    v = np.asarray(vector, dtype=np.float64)
    qv = q[..., :3]
    qw = q[..., 3:4]
    twice = 2.0 * np.cross(qv, v)
    return v + qw * twice + np.cross(qv, twice)


def _orientation_normal(orientation: np.ndarray) -> np.ndarray:
    z = np.zeros((len(orientation), 3), dtype=np.float64)
    z[:, 2] = 1.0
    return _normalise(_quat_rotate(orientation, z), (0.0, 0.0, 1.0))


def _actor_state(header: Mapping[str, Any], t: float) -> tuple[dict[str, np.ndarray], np.ndarray, np.ndarray]:
    track = header["actorTrack"]
    source_pose = track.get("sourcePose", {})
    source_position = np.asarray(source_pose.get("position", [0.0, 0.0, 0.0]), dtype=np.float64)
    source_orientation = np.asarray(source_pose.get("orientation", [0.0, 0.0, 0.0, 1.0]), dtype=np.float64)
    identity = np.array([0.0, 0.0, 0.0, 1.0])
    closure = float(smooth5(t))
    base_orientation = _slerp_single(source_orientation, identity, closure)
    start, end = track.get("window", [0.0, 1.0])
    pulse = float(c2_bump(t, float(start), float(end)))
    pulse_quaternion = _quat_axis_angle(
        np.asarray(track.get("rotationAxis", [0.0, 0.0, 1.0]), dtype=np.float64),
        float(track.get("rotationRadians", 0.0)) * pulse,
    )
    actor_orientation = _quat_multiply(base_orientation, pulse_quaternion)
    pulse_translation = (
        np.asarray(track.get("translationAxis", [0.0, 0.0, 0.0]), dtype=np.float64)
        * float(track.get("translationAmplitude", 0.0))
        * pulse
    )
    actor_position = source_position * (1.0 - closure) + pulse_translation
    return (
        {"position": actor_position, "orientation": actor_orientation},
        pulse_translation,
        pulse_quaternion,
    )


def _source_endpoint(
    source: np.ndarray | Mapping[str, Any], snapshot: Mapping[str, Any] | None
) -> np.ndarray | Mapping[str, Any]:
    return snapshot if snapshot is not None else source


def _position_at(
    program: Any,
    source: np.ndarray | Mapping[str, Any],
    target: np.ndarray | Mapping[str, Any],
    t: float,
    snapshot: Mapping[str, Any] | None,
) -> tuple[np.ndarray, dict[str, np.ndarray], np.ndarray, np.ndarray, np.ndarray]:
    header = _program_value(program, "header")
    groups = _program_value(program, "group_tracks", "groupTracks")
    per_id = _program_value(program, "per_id", "perId")
    count = int(header["identityCount"])
    effective_source = _source_endpoint(source, snapshot)
    p0 = _field(effective_source, "position", count, 0.0, np.float64)
    p1 = _field(target, "position", count, 0.0, np.float64)
    if header["isNoOp"]:
        actor_pose, _, actor_quaternion = _actor_state(header, 0.0)
        return p0.copy(), actor_pose, np.zeros(count), np.zeros(count), actor_quaternion

    group_index = per_id["groupIndex"].astype(np.int64)
    group = groups[group_index]
    center0 = group["sourceCenter"].astype(np.float64)
    center1 = group["targetCenter"].astype(np.float64)
    route = group["routeControl"].astype(np.float64)
    local_start, local_end, _ = local_handoff_windows(header, group, per_id)
    local_alpha = quintic_window(t, local_start, local_end)
    route_weight = c2_bump(t, local_start, local_end)
    flags = per_id["flags"].astype(np.uint16)
    bridge = ((flags & PER_ID_FLAG_BRIDGE) != 0).astype(np.float64) * c2_bump(
        t,
        group["bridgeStart"].astype(np.float64),
        group["bridgeEnd"].astype(np.float64),
    )
    bridge = np.clip(bridge, 0.0, 1.0)
    center = center0 + (center1 - center0) * local_alpha[:, None] + route * route_weight[:, None]
    local0 = p0 - center0
    local1 = p1 - center1
    local = local0 + (local1 - local0) * local_alpha[:, None]
    # Bridge IDs remain real skin elements.  At the finite bridge pulse they
    # contract only transverse to the directed route, producing a tube/neck
    # with non-zero axial extent instead of an isotropic point clump.
    direction = _normalise(group["direction"].astype(np.float64), (1.0, 0.0, 0.0))
    axial = np.sum(local * direction, axis=1, keepdims=True) * direction
    transverse = local - axial
    bridge_thickness = float(header.get("activationPolicy", {}).get("bridgeThickness", 1.0))
    bridge_contraction = bridge * (1.0 - bridge_thickness)
    # Subtractive form is algebraically identical to axial+transverse*factor,
    # while preserving the original local bits exactly when bridge == 0.
    local = local - transverse * bridge_contraction[:, None]
    position = center + local
    position += per_id["residual"].astype(np.float64) * route_weight[:, None]

    activation_start = per_id["activationStart"].astype(np.float64)
    activation_end = per_id["activationEnd"].astype(np.float64)
    transport_weight = c2_bump(t, activation_start, activation_end)
    source_normals = decode_normals(effective_source)[:count]
    target_normals = decode_normals(target)[:count]
    normal_blend = _normalise(
        source_normals * (1.0 - local_alpha[:, None]) + target_normals * local_alpha[:, None],
        (0.0, 0.0, 1.0),
    )
    emerging = (flags & PER_ID_FLAG_EMERGENCE) != 0
    immersing = (flags & PER_ID_FLAG_IMMERSION) != 0
    depth_sign = immersing.astype(np.float64) - emerging.astype(np.float64)
    depth_fraction = float(header.get("activationPolicy", {}).get("depthRouteFraction", 0.0))
    position += (
        normal_blend
        * (per_id["depth"].astype(np.float64) * depth_fraction * transport_weight * depth_sign)[:, None]
    )

    settle = header.get("settlePolicy", {})
    settle_window = settle.get("window", [1.0, 1.0])
    settle_weight = float(c2_bump(t, float(settle_window[0]), float(settle_window[1])))
    residual_direction = per_id["residual"].astype(np.float64)
    residual_length = np.linalg.norm(residual_direction, axis=1, keepdims=True)
    residual_direction = np.where(
        residual_length > 1e-12,
        residual_direction / np.maximum(residual_length, 1e-12),
        normal_blend,
    )
    displacement = np.linalg.norm(p1 - p0, axis=1)
    position += residual_direction * (
        displacement * float(settle.get("maximumAmplitudeFraction", 0.0)) * settle_weight
    )[:, None]

    duration = float(header["durationSeconds"])
    source_velocity = _field(effective_source, "velocity", count, 0.0, np.float64)
    if source_velocity.shape != (count, 3):
        source_velocity = np.zeros((count, 3), dtype=np.float64)
    position += source_velocity * (duration * quintic_initial_velocity_basis(t))

    actor_pose, actor_translation, actor_quaternion = _actor_state(header, t)
    actor_center0 = np.asarray(header["actorTrack"].get("centerStart", [0.0, 0.0, 0.0]), dtype=np.float64)
    actor_center1 = np.asarray(header["actorTrack"].get("centerEnd", [0.0, 0.0, 0.0]), dtype=np.float64)
    actor_center = actor_center0 + (actor_center1 - actor_center0) * float(smooth5(t))
    position = _quat_rotate(actor_quaternion, position - actor_center) + actor_center + actor_translation
    return position, actor_pose, local_alpha, bridge, actor_quaternion


def _phase(header: Mapping[str, Any], t: float) -> tuple[str, float]:
    phase_policy = header["phasePolicy"]
    windows = phase_policy["windows"]
    if t >= 1.0:
        return "idle-handoff", 1.0
    candidates = [
        ("anticipation", windows["anticipation"]),
        ("release", windows["release"]),
        ("regroup", windows["regroup"]),
        ("reveal", windows["reveal"]),
        ("approach", windows["approach"]),
        ("settle", windows["settle"]),
    ]
    active_name, active_window = candidates[0]
    for name, window in candidates:
        if t >= float(window[0]):
            active_name, active_window = name, window
    progress = float(np.clip((t - float(active_window[0])) / max(float(active_window[1]) - float(active_window[0]), 1e-9), 0.0, 1.0))
    return active_name, progress


def _static_result(
    records: np.ndarray | Mapping[str, Any],
    count: int,
    actor_pose: Mapping[str, Any] | None,
    phase: str,
) -> dict[str, Any]:
    position = _field(records, "position", count, 0.0, np.float64).copy()
    orientation = decode_orientations(records)[:count]
    normal = decode_normals(records)[:count]
    scale = _field(records, "scale", count, 1.0, np.float64).copy()
    status_endpoint = _field(records, "status", count, STATUS_ACTIVE, np.uint8)
    activation = (status_endpoint == STATUS_ACTIVE).astype(np.float64)
    bridge = np.zeros(count, dtype=np.float64)
    role = np.column_stack((activation, 1.0 - activation, bridge))
    if isinstance(records, Mapping):
        if "activation" in records:
            activation = _field(records, "activation", count, activation, np.float64).copy()
        if "bridge" in records:
            bridge = _field(records, "bridge", count, bridge, np.float64).copy()
        if "role" in records:
            candidate = np.asarray(records["role"], dtype=np.float64)[:count]
            if candidate.shape == (count, 3):
                role = candidate.copy()
        else:
            role = np.column_stack((activation * (1.0 - bridge), (1.0 - activation) * (1.0 - bridge), bridge))
    pose = dict(actor_pose or {"position": np.zeros(3), "orientation": np.array([0.0, 0.0, 0.0, 1.0])})
    return {
        "position": position,
        "velocity": np.zeros_like(position),
        "normal": normal,
        "orientation": orientation,
        "scale": scale,
        "scaleVelocity": np.zeros(count, dtype=np.float64),
        "activation": activation,
        "bridge": bridge,
        "bridgeWeight": bridge,
        "role": role,
        "status": status_endpoint.astype(np.float64),
        "groupPhase": np.zeros(count, dtype=np.float64),
        "phase": phase,
        "phaseProgress": 1.0 if phase == "idle-handoff" else 0.0,
        "actorPose": pose,
        "component": _field(records, "component", count, 0, np.uint8).copy(),
        "shell": _field(records, "shell", count, 0, np.uint8).copy(),
        "transitionGroup": _field(records, "transitionGroup", count, 0, np.uint8).copy(),
        "flags": _field(records, "flags", count, 0, np.uint8).copy(),
        "reserveDepth": _field(records, "reserveDepth", count, 0.0, np.float64).copy(),
    }


def evaluate(
    program: Any,
    source: np.ndarray | Mapping[str, Any],
    target: np.ndarray | Mapping[str, Any],
    t: float,
    snapshot: Mapping[str, Any] | None = None,
    viewport: str = "desktop",
    reduced: bool = False,
    *,
    _skip_velocity: bool = False,
) -> dict[str, Any]:
    """Evaluate normalized progress and return all geometry/runtime channels.

    Velocity is in geometry units/second. A supplied snapshot contributes the
    quintic Hermite initial-velocity basis, so a retarget starts with the exact
    evaluated position and velocity instead of snapping or resetting to zero.
    """

    if viewport not in VIEWPORT_PROFILES:
        raise ValueError(f"unsupported viewport: {viewport}")
    if not np.isfinite(t):
        raise ValueError("transition progress must be finite")
    progress = float(np.clip(t, 0.0, 1.0))
    header = _program_value(program, "header")
    count = int(header["identityCount"])
    effective_source = _source_endpoint(source, snapshot)
    if _count(effective_source) < count or _count(target) < count:
        raise ValueError("endpoint buffers do not contain the compiled ID prefix")

    source_pose = header.get("actorTrack", {}).get("sourcePose")
    if header["isNoOp"]:
        return _static_result(effective_source, count, source_pose, "idle-handoff")
    if reduced or bool(header.get("reducedMotion", False)):
        if progress <= 0.0:
            return _static_result(effective_source, count, source_pose, "anticipation")
        return _static_result(target, count, None, "idle-handoff")

    position, actor_pose, group_phase, bridge, actor_quaternion = _position_at(
        program, source, target, progress, snapshot
    )
    duration = float(header["durationSeconds"])
    source_velocity = _field(effective_source, "velocity", count, 0.0, np.float64)
    if _skip_velocity:
        velocity = np.zeros_like(position)
    elif progress <= 0.0:
        velocity = source_velocity.copy() if source_velocity.shape == (count, 3) else np.zeros_like(position)
    elif progress >= 1.0 or duration <= 0.0:
        velocity = np.zeros_like(position)
    else:
        epsilon = min(1e-4, 0.25 * progress, 0.25 * (1.0 - progress))
        before = _position_at(program, source, target, progress - epsilon, snapshot)[0]
        after = _position_at(program, source, target, progress + epsilon, snapshot)[0]
        velocity = (after - before) / (2.0 * epsilon * duration)

    per_id = _program_value(program, "per_id", "perId")
    groups = _program_value(program, "group_tracks", "groupTracks")
    group_index = per_id["groupIndex"].astype(np.int64)
    group = groups[group_index]
    local_start, local_end, _ = local_handoff_windows(header, group, per_id)
    orientation_alpha = quintic_window(progress, local_start, local_end)
    q0 = decode_orientations(effective_source)[:count]
    q1 = decode_orientations(target)[:count]
    orientation = _slerp(q0, q1, orientation_alpha)
    orientation = _quat_multiply(actor_quaternion, orientation)
    normal = _orientation_normal(orientation)
    if _skip_velocity:
        scale_velocity = np.zeros(count, dtype=np.float64)
    elif progress <= 0.0:
        orientation = q0.copy()
        normal = decode_normals(effective_source)[:count]
    elif progress >= 1.0:
        orientation = q1.copy()
        normal = decode_normals(target)[:count]

    scale0 = _field(effective_source, "scale", count, 1.0, np.float64)
    scale1 = _field(target, "scale", count, 1.0, np.float64)
    scale_alpha = orientation_alpha
    scale = scale0 + (scale1 - scale0) * scale_alpha
    bridge_pulse = float(header.get("activationPolicy", {}).get("bridgePulseMaximum", 0.0))
    scale *= 1.0 + bridge * bridge_pulse
    source_scale_velocity = _field(effective_source, "scaleVelocity", count, 0.0, np.float64)
    scale += source_scale_velocity * (duration * quintic_initial_velocity_basis(progress))
    scale = np.maximum(scale, 0.0)
    if progress <= 0.0:
        scale = scale0.copy()
        scale_velocity = source_scale_velocity.copy()
    elif progress >= 1.0:
        scale = scale1.copy()
        scale_velocity = np.zeros(count, dtype=np.float64)
    else:
        epsilon = min(1e-4, 0.25 * progress, 0.25 * (1.0 - progress))

        def scale_at(value: float) -> np.ndarray:
            alpha = quintic_window(value, local_start, local_end)
            result = scale0 + (scale1 - scale0) * alpha
            local_bridge = ((per_id["flags"].astype(np.uint16) & PER_ID_FLAG_BRIDGE) != 0).astype(np.float64) * c2_bump(
                value, group["bridgeStart"].astype(np.float64), group["bridgeEnd"].astype(np.float64)
            )
            result *= 1.0 + local_bridge * bridge_pulse
            result += source_scale_velocity * (duration * quintic_initial_velocity_basis(value))
            return np.maximum(result, 0.0)

        scale_velocity = (scale_at(progress + epsilon) - scale_at(progress - epsilon)) / (2.0 * epsilon * duration)

    flags = per_id["flags"].astype(np.uint16)
    activation_alpha = quintic_window(
        progress,
        per_id["activationStart"].astype(np.float64),
        per_id["activationEnd"].astype(np.float64),
    )
    source_status = _field(effective_source, "status", count, STATUS_ACTIVE, np.uint8)
    target_status = _field(target, "status", count, STATUS_ACTIVE, np.uint8)
    source_active = source_status == STATUS_ACTIVE
    target_active = target_status == STATUS_ACTIVE
    activation = np.where(
        source_active & target_active,
        1.0,
        np.where(~source_active & ~target_active, 0.0, np.where(target_active, activation_alpha, 1.0 - activation_alpha)),
    )
    if progress <= 0.0:
        activation = source_active.astype(np.float64)
    elif progress >= 1.0:
        activation = target_active.astype(np.float64)
    bridge = np.clip(bridge, 0.0, 1.0)
    role = np.column_stack((activation * (1.0 - bridge), (1.0 - activation) * (1.0 - bridge), bridge))
    if isinstance(effective_source, Mapping) and any(
        name in effective_source for name in ("activation", "bridge", "role")
    ):
        retarget_end = float(np.max(local_end))
        retarget_closure = float(quintic_window(progress, 0.0, max(retarget_end, 1e-4)))
        source_activation = _field(effective_source, "activation", count, activation, np.float64)
        source_bridge = _field(effective_source, "bridge", count, bridge, np.float64)
        source_role = np.asarray(
            effective_source.get(
                "role",
                np.column_stack(
                    (
                        source_activation * (1.0 - source_bridge),
                        (1.0 - source_activation) * (1.0 - source_bridge),
                        source_bridge,
                    )
                ),
            ),
            dtype=np.float64,
        )[:count]
        activation = source_activation + (activation - source_activation) * retarget_closure
        bridge = source_bridge + (bridge - source_bridge) * retarget_closure
        role = source_role + (role - source_role) * retarget_closure
    status_alpha = group_phase
    status = source_status.astype(np.float64) + (
        target_status.astype(np.float64) - source_status.astype(np.float64)
    ) * status_alpha
    phase_name, phase_progress = _phase(header, progress)
    choose_target = group_phase >= 0.5

    def context_blend(name: str, dtype: Any) -> np.ndarray:
        source_value = _field(effective_source, name, count, 0, dtype)
        target_value = _field(target, name, count, 0, dtype)
        return np.where(choose_target, target_value, source_value).astype(dtype)

    reserve0 = _field(effective_source, "reserveDepth", count, 0.0, np.float64)
    reserve1 = _field(target, "reserveDepth", count, 0.0, np.float64)
    reserve_depth = reserve0 + (reserve1 - reserve0) * group_phase
    return {
        "position": position,
        "velocity": velocity,
        "normal": normal,
        "orientation": orientation,
        "scale": scale,
        "scaleVelocity": scale_velocity,
        "activation": activation,
        "bridge": bridge,
        "bridgeWeight": bridge,
        "role": role,
        "status": status,
        "groupPhase": group_phase,
        "phase": phase_name,
        "phaseProgress": phase_progress,
        "actorPose": actor_pose,
        "component": context_blend("component", np.uint8),
        "shell": context_blend("shell", np.uint8),
        "transitionGroup": context_blend("transitionGroup", np.uint8),
        "flags": (
            _field(effective_source, "flags", count, 0, np.uint8)
            | _field(target, "flags", count, 0, np.uint8)
        ),
        "reserveDepth": reserve_depth,
    }


def evaluate_time_grid(
    program: Any,
    source: np.ndarray | Mapping[str, Any],
    target: np.ndarray | Mapping[str, Any],
    times: Any,
    snapshot: Mapping[str, Any] | None = None,
    viewport: str = "desktop",
    reduced: bool = False,
) -> dict[str, Any]:
    """Evaluate an ordered time grid with one geometry pass per sample.

    Geometry/orientation/scale/role channels are identical to scalar
    :func:`evaluate`. Grid velocities use deterministic finite differences over
    those exact samples, with the transient source and target endpoint
    velocities restored exactly. This avoids the two extra position evaluations
    used by each standalone scalar velocity query.
    """

    grid = np.asarray(times, dtype=np.float64)
    if grid.ndim != 1 or len(grid) == 0 or not np.isfinite(grid).all():
        raise ValueError("times must be a non-empty finite 1D sequence")
    if np.any(np.diff(grid) <= 0.0):
        raise ValueError("times must be strictly increasing")
    if grid[0] < 0.0 or grid[-1] > 1.0:
        raise ValueError("time-grid progress must stay in 0..1")
    header = _program_value(program, "header")
    duration = float(header.get("durationSeconds", 0.0))
    effective_source = _source_endpoint(source, snapshot)
    count = int(header["identityCount"])
    if viewport not in VIEWPORT_PROFILES:
        raise ValueError(f"unsupported viewport: {viewport}")

    # Static/reduced grids are uncommon and cheap; keeping them on the scalar
    # path also makes their intentional one-render-step discontinuity explicit.
    if reduced or bool(header.get("reducedMotion", False)) or header["isNoOp"]:
        samples = [
            evaluate(
                program,
                source,
                target,
                float(value),
                snapshot=snapshot,
                viewport=viewport,
                reduced=reduced,
                _skip_velocity=True,
            )
            for value in grid
        ]
        array_keys = (
            "position", "normal", "orientation", "scale", "activation", "bridge",
            "bridgeWeight", "role", "status", "groupPhase", "component", "shell",
            "transitionGroup", "flags", "reserveDepth",
        )
        result: dict[str, Any] = {
            key: np.stack([np.asarray(sample[key]) for sample in samples], axis=0)
            for key in array_keys
        }
        velocity = np.zeros_like(result["position"])
        scale_velocity = np.zeros_like(result["scale"])
        result["phase"] = [sample["phase"] for sample in samples]
        result["phaseProgress"] = np.asarray([sample["phaseProgress"] for sample in samples], dtype=np.float64)
        result["actorPose"] = {
            "position": np.stack([np.asarray(sample["actorPose"]["position"]) for sample in samples], axis=0),
            "orientation": np.stack([np.asarray(sample["actorPose"]["orientation"]) for sample in samples], axis=0),
        }
    else:
        per_id = _program_value(program, "per_id", "perId")
        groups = _program_value(program, "group_tracks", "groupTracks")
        group_index = per_id["groupIndex"].astype(np.int64)
        group = groups[group_index]
        p0 = _field(effective_source, "position", count, 0.0, np.float64)
        p1 = _field(target, "position", count, 0.0, np.float64)
        center0 = group["sourceCenter"].astype(np.float64)
        center1 = group["targetCenter"].astype(np.float64)
        route = group["routeControl"].astype(np.float64)
        local_start, local_end, _ = local_handoff_windows(header, group, per_id)
        time_column = grid[:, None]
        local_alpha = quintic_window(time_column, local_start, local_end)
        route_weight = c2_bump(time_column, local_start, local_end)
        flags = per_id["flags"].astype(np.uint16)
        bridge = ((flags & PER_ID_FLAG_BRIDGE) != 0).astype(np.float64)[None, :] * c2_bump(
            time_column,
            group["bridgeStart"].astype(np.float64),
            group["bridgeEnd"].astype(np.float64),
        )
        bridge = np.clip(bridge, 0.0, 1.0)
        center = (
            center0[None, :, :]
            + (center1 - center0)[None, :, :] * local_alpha[:, :, None]
            + route[None, :, :] * route_weight[:, :, None]
        )
        local0 = p0 - center0
        local1 = p1 - center1
        local = local0[None, :, :] + (local1 - local0)[None, :, :] * local_alpha[:, :, None]
        direction = _normalise(group["direction"].astype(np.float64), (1.0, 0.0, 0.0))
        axial = np.sum(local * direction[None, :, :], axis=2, keepdims=True) * direction[None, :, :]
        transverse = local - axial
        bridge_thickness = float(header.get("activationPolicy", {}).get("bridgeThickness", 1.0))
        bridge_contraction = bridge * (1.0 - bridge_thickness)
        local = local - transverse * bridge_contraction[:, :, None]
        position = center + local
        position += per_id["residual"].astype(np.float64)[None, :, :] * route_weight[:, :, None]

        activation_start = per_id["activationStart"].astype(np.float64)
        activation_end = per_id["activationEnd"].astype(np.float64)
        transport_weight = c2_bump(time_column, activation_start, activation_end)
        source_normals = decode_normals(effective_source)[:count]
        target_normals = decode_normals(target)[:count]
        normal_blend = _normalise(
            source_normals[None, :, :] * (1.0 - local_alpha[:, :, None])
            + target_normals[None, :, :] * local_alpha[:, :, None],
            (0.0, 0.0, 1.0),
        )
        emerging = (flags & PER_ID_FLAG_EMERGENCE) != 0
        immersing = (flags & PER_ID_FLAG_IMMERSION) != 0
        depth_sign = immersing.astype(np.float64) - emerging.astype(np.float64)
        depth_fraction = float(header.get("activationPolicy", {}).get("depthRouteFraction", 0.0))
        depth = per_id["depth"].astype(np.float64) * depth_fraction * depth_sign
        position += normal_blend * (transport_weight * depth[None, :])[:, :, None]

        settle = header.get("settlePolicy", {})
        settle_window = settle.get("window", [1.0, 1.0])
        settle_weight = c2_bump(grid, float(settle_window[0]), float(settle_window[1]))
        residual_direction = per_id["residual"].astype(np.float64)
        residual_length = np.linalg.norm(residual_direction, axis=1, keepdims=True)
        fallback_normal = 0.5 * (source_normals + target_normals)
        fallback_normal = _normalise(fallback_normal, (0.0, 0.0, 1.0))
        residual_direction = np.where(
            residual_length > 1e-12,
            residual_direction / np.maximum(residual_length, 1e-12),
            fallback_normal,
        )
        displacement = np.linalg.norm(p1 - p0, axis=1)
        settle_amplitude = displacement * float(settle.get("maximumAmplitudeFraction", 0.0))
        position += (
            settle_weight[:, None, None]
            * residual_direction[None, :, :]
            * settle_amplitude[None, :, None]
        )
        source_velocity = _field(effective_source, "velocity", count, 0.0, np.float64)
        if source_velocity.shape != (count, 3):
            source_velocity = np.zeros((count, 3), dtype=np.float64)
        velocity_basis = grid - 6.0 * grid**3 + 8.0 * grid**4 - 3.0 * grid**5
        position += velocity_basis[:, None, None] * duration * source_velocity[None, :, :]

        actor_states = [_actor_state(header, float(value)) for value in grid]
        actor_positions = np.stack([item[0]["position"] for item in actor_states], axis=0)
        actor_orientations = np.stack([item[0]["orientation"] for item in actor_states], axis=0)
        actor_translations = [item[1] for item in actor_states]
        actor_quaternions = [item[2] for item in actor_states]
        actor_center0 = np.asarray(header["actorTrack"].get("centerStart", [0.0, 0.0, 0.0]), dtype=np.float64)
        actor_center1 = np.asarray(header["actorTrack"].get("centerEnd", [0.0, 0.0, 0.0]), dtype=np.float64)
        for time_index, value in enumerate(grid):
            actor_center = actor_center0 + (actor_center1 - actor_center0) * float(smooth5(float(value)))
            position[time_index] = (
                _quat_rotate(actor_quaternions[time_index], position[time_index] - actor_center)
                + actor_center
                + actor_translations[time_index]
            )
        zero_rows = np.flatnonzero(grid == 0.0)
        one_rows = np.flatnonzero(grid == 1.0)
        position[zero_rows] = p0
        position[one_rows] = p1

        q0 = decode_orientations(effective_source)[:count]
        q1 = decode_orientations(target)[:count]
        orientation = np.empty((len(grid), count, 4), dtype=np.float64)
        normal = np.empty((len(grid), count, 3), dtype=np.float64)
        for time_index, value in enumerate(grid):
            current_orientation = _slerp(q0, q1, local_alpha[time_index])
            current_orientation = _quat_multiply(actor_quaternions[time_index], current_orientation)
            current_normal = _orientation_normal(current_orientation)
            if value == 0.0:
                current_orientation = q0.copy()
                current_normal = source_normals.copy()
            elif value == 1.0:
                current_orientation = q1.copy()
                current_normal = target_normals.copy()
            orientation[time_index] = current_orientation
            normal[time_index] = current_normal

        scale0 = _field(effective_source, "scale", count, 1.0, np.float64)
        scale1 = _field(target, "scale", count, 1.0, np.float64)
        scale = scale0[None, :] + (scale1 - scale0)[None, :] * local_alpha
        bridge_pulse = float(header.get("activationPolicy", {}).get("bridgePulseMaximum", 0.0))
        scale *= 1.0 + bridge * bridge_pulse
        source_scale_velocity = _field(effective_source, "scaleVelocity", count, 0.0, np.float64)
        scale += velocity_basis[:, None] * duration * source_scale_velocity[None, :]
        scale = np.maximum(scale, 0.0)
        scale[zero_rows] = scale0
        scale[one_rows] = scale1

        activation_alpha = quintic_window(time_column, activation_start, activation_end)
        source_status = _field(effective_source, "status", count, STATUS_ACTIVE, np.uint8)
        target_status = _field(target, "status", count, STATUS_ACTIVE, np.uint8)
        source_active = source_status == STATUS_ACTIVE
        target_active = target_status == STATUS_ACTIVE
        activation = np.where(
            (source_active & target_active)[None, :],
            1.0,
            np.where(
                (~source_active & ~target_active)[None, :],
                0.0,
                np.where(target_active[None, :], activation_alpha, 1.0 - activation_alpha),
            ),
        )
        activation[zero_rows] = source_active.astype(np.float64)
        activation[one_rows] = target_active.astype(np.float64)
        role = np.stack(
            (
                activation * (1.0 - bridge),
                (1.0 - activation) * (1.0 - bridge),
                bridge,
            ),
            axis=-1,
        )
        if isinstance(effective_source, Mapping) and any(
            name in effective_source for name in ("activation", "bridge", "role")
        ):
            retarget_end = float(np.max(local_end))
            retarget_closure = quintic_window(grid, 0.0, max(retarget_end, 1e-4))
            source_activation_context = _field(
                effective_source, "activation", count, activation[0], np.float64
            )
            source_bridge_context = _field(
                effective_source, "bridge", count, bridge[0], np.float64
            )
            source_role_context = np.asarray(
                effective_source.get(
                    "role",
                    np.column_stack(
                        (
                            source_activation_context * (1.0 - source_bridge_context),
                            (1.0 - source_activation_context) * (1.0 - source_bridge_context),
                            source_bridge_context,
                        )
                    ),
                ),
                dtype=np.float64,
            )[:count]
            activation = source_activation_context[None, :] + (
                activation - source_activation_context[None, :]
            ) * retarget_closure[:, None]
            bridge = source_bridge_context[None, :] + (
                bridge - source_bridge_context[None, :]
            ) * retarget_closure[:, None]
            role = source_role_context[None, :, :] + (
                role - source_role_context[None, :, :]
            ) * retarget_closure[:, None, None]
        status = source_status.astype(np.float64)[None, :] + (
            target_status.astype(np.float64) - source_status.astype(np.float64)
        )[None, :] * local_alpha
        choose_target = local_alpha >= 0.5

        def context_grid(name: str, dtype: Any) -> np.ndarray:
            source_value = _field(effective_source, name, count, 0, dtype)
            target_value = _field(target, name, count, 0, dtype)
            return np.where(choose_target, target_value[None, :], source_value[None, :]).astype(dtype)

        reserve0 = _field(effective_source, "reserveDepth", count, 0.0, np.float64)
        reserve1 = _field(target, "reserveDepth", count, 0.0, np.float64)
        reserve_depth = reserve0[None, :] + (reserve1 - reserve0)[None, :] * local_alpha
        combined_flags = (
            _field(effective_source, "flags", count, 0, np.uint8)
            | _field(target, "flags", count, 0, np.uint8)
        )
        result = {
            "position": position,
            "normal": normal,
            "orientation": orientation,
            "scale": scale,
            "activation": activation,
            "bridge": bridge,
            "bridgeWeight": bridge.copy(),
            "role": role,
            "status": status,
            "groupPhase": local_alpha,
            "component": context_grid("component", np.uint8),
            "shell": context_grid("shell", np.uint8),
            "transitionGroup": context_grid("transitionGroup", np.uint8),
            "flags": np.broadcast_to(combined_flags[None, :], (len(grid), count)).copy(),
            "reserveDepth": reserve_depth,
        }
        result["phase"] = [_phase(header, float(value))[0] for value in grid]
        result["phaseProgress"] = np.asarray([_phase(header, float(value))[1] for value in grid], dtype=np.float64)
        result["actorPose"] = {"position": actor_positions, "orientation": actor_orientations}
        if len(grid) == 1:
            velocity = np.zeros_like(position)
            scale_velocity = np.zeros_like(scale)
        else:
            seconds = grid * duration
            edge_order = 2 if len(grid) >= 3 else 1
            velocity = np.gradient(position, seconds, axis=0, edge_order=edge_order)
            scale_velocity = np.gradient(scale, seconds, axis=0, edge_order=edge_order)
    source_velocity = _field(effective_source, "velocity", count, 0.0, np.float64)
    source_scale_velocity = _field(effective_source, "scaleVelocity", count, 0.0, np.float64)
    if grid[0] == 0.0:
        velocity[0] = source_velocity if source_velocity.shape == (count, 3) else 0.0
        scale_velocity[0] = source_scale_velocity
    if grid[-1] == 1.0:
        velocity[-1] = 0.0
        scale_velocity[-1] = 0.0
    result["velocity"] = velocity
    result["scaleVelocity"] = scale_velocity
    result["times"] = grid.copy()
    return result
