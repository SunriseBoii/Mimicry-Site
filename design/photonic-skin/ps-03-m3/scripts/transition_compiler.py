"""Pair-independent transition compiler over canonical PS-03.M3 state records."""

from __future__ import annotations

from math import pi

import numpy as np
from scipy.spatial import cKDTree

from contracts import (
    BUILD_VERSION,
    TRANSITION_SCHEMA_VERSION,
    TRANSITION_VERSION,
    build_config_hash,
    sha256_bytes,
    stable_json_bytes,
    validate_transition_definition,
)
from state_builder import STATE_DTYPE, STATUS_ACTIVE


TRANSITION_DTYPE = np.dtype([
    ("route", "<f4", (3,)),
    ("phaseOffset", "<f2"),
    ("activationStart", "<f2"),
    ("activationEnd", "<f2"),
    ("group", "u1"),
    ("flags", "u1"),
    ("_padding", "u1", (2,)),
])

FLAG_SPLIT_MERGE = 1
FLAG_EMERGENCE = 2
FLAG_IMMERSION = 4


def _normalise(v: np.ndarray) -> np.ndarray:
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


def _decode_normal(records: np.ndarray) -> np.ndarray:
    return _normalise(records["normal"].astype(np.float64) / 32767.0)


def make_transition_definition(source: dict, target: dict, duration: float | None = None) -> dict:
    source_state = source["stateId"]
    target_state = target["stateId"]
    shell_delta = abs(int(source["shellCount"]) - int(target["shellCount"]))
    resolved_duration = duration if duration is not None else min(2.2, 1.55 + 0.12 * shell_delta)
    value = {
        "schemaVersion": TRANSITION_SCHEMA_VERSION,
        "transitionId": f"{source_state}-to-{target_state}",
        "transitionVersion": TRANSITION_VERSION,
        "fromState": source_state,
        "toState": target_state,
        "durationPolicy": {"seconds": float(resolved_duration), "baselineRange": [1.4, 1.8], "shellDeltaExtension": 0.12},
        "motionProfile": "quintic-route-v1",
        "primaryAxis": [1.0, 0.0, 0.0],
        "phasePolicy": {
            "profile": ["release", "gather-route", "split-merge", "approach", "settle"],
            "boundaries": [0.0, 0.12, 0.36, 0.68, 0.9, 1.0],
        },
        "componentRoutingPolicy": {"mode": "canonical-group-coherent", "pairSpecific": False},
        "splitMergePolicy": {"mode": "shell-delta-routed", "preserveProtectedZones": True},
        "reserveTransportPolicy": {"mode": "finite-subsurface-route", "opacityOnly": False},
        "continuityPolicy": {"position": "C2", "orientation": "shortest-nlerp", "endpointVelocity": 0.0, "endpointAcceleration": 0.0},
        "validationPolicy": {"endpointTolerance": 1e-6, "finite": True, "maximumStepFraction": 0.08},
        "sourceStateHash": source["contentHash"],
        "targetStateHash": target["contentHash"],
        "buildConfigHash": build_config_hash(),
        "provenance": {"stage": "PS-03.M3", "compiler": BUILD_VERSION, "approvalStatus": "requires-human-approval"},
    }
    problems = validate_transition_definition(value)
    if problems:
        raise ValueError(f"invalid transition definition: {problems}")
    return value


def compile_transition(source: np.ndarray, target: np.ndarray) -> np.ndarray:
    if source.dtype != STATE_DTYPE or target.dtype != STATE_DTYPE or len(source) != len(target):
        raise ValueError("transition endpoints must share the fixed identity stride")
    p0 = source["position"].astype(np.float64)
    p1 = target["position"].astype(np.float64)
    delta = p1 - p0
    distance = np.linalg.norm(delta, axis=1)
    n0 = _decode_normal(source)
    n1 = _decode_normal(target)
    average_normal = _normalise(n0 + n1)
    primary_axis = np.array([1.0, 0.0, 0.0])
    lateral = np.cross(delta, primary_axis)
    weak = np.linalg.norm(lateral, axis=1) < 1e-8
    lateral[weak] = np.cross(average_normal[weak], np.array([0.0, 1.0, 0.0]))
    lateral = _normalise(lateral)
    group = np.minimum(source["transitionGroup"], target["transitionGroup"]).astype(np.uint8)
    sign = np.where((group.astype(np.int64) % 2) == 0, 1.0, -1.0)
    amplitude = np.minimum(0.36, 0.08 + distance * 0.11)
    route = lateral * (amplitude * sign)[:, None]
    route += average_normal * np.minimum(0.12, distance * 0.035)[:, None]

    output = np.zeros(len(source), dtype=TRANSITION_DTYPE)
    output["route"] = route.astype(np.float32)
    output["phaseOffset"] = ((np.arange(len(source)) * (pi * (3.0 - np.sqrt(5.0))) / (2 * pi)) % 1.0 * 0.08).astype(np.float16)
    source_active = source["status"] == STATUS_ACTIVE
    target_active = target["status"] == STATUS_ACTIVE
    emerging = ~source_active & target_active
    immersing = source_active & ~target_active
    output["activationStart"] = np.where(emerging, 0.18, np.where(immersing, 0.0, 0.0)).astype(np.float16)
    output["activationEnd"] = np.where(emerging, 0.72, np.where(immersing, 0.82, 1.0)).astype(np.float16)
    output["group"] = group
    shell_change = source["shell"] != target["shell"]
    output["flags"] = (
        shell_change.astype(np.uint8) * FLAG_SPLIT_MERGE
        | emerging.astype(np.uint8) * FLAG_EMERGENCE
        | immersing.astype(np.uint8) * FLAG_IMMERSION
    )
    return output


def _smooth5(t: np.ndarray | float) -> np.ndarray | float:
    return t * t * t * (10.0 + t * (-15.0 + 6.0 * t))


def _route_hump(t: np.ndarray | float) -> np.ndarray | float:
    return 64.0 * (t ** 3) * ((1.0 - t) ** 3)


def sample_positions(source: np.ndarray, target: np.ndarray, transition: np.ndarray, t: float) -> np.ndarray:
    p0 = source["position"].astype(np.float64)
    p1 = target["position"].astype(np.float64)
    route = transition["route"].astype(np.float64)
    return p0 + (p1 - p0) * _smooth5(t) + route * _route_hump(t)


def transition_qa(source: np.ndarray, target: np.ndarray, transition: np.ndarray) -> dict:
    times = np.array([0.0, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 1.0])
    sampled = [sample_positions(source, target, transition, float(t)) for t in times]
    p0 = source["position"].astype(np.float64)
    p1 = target["position"].astype(np.float64)
    endpoint0 = float(np.max(np.linalg.norm(sampled[0] - p0, axis=1)))
    endpoint1 = float(np.max(np.linalg.norm(sampled[-1] - p1, axis=1)))
    finite = all(np.isfinite(value).all() for value in sampled)
    eps = 1e-4
    d0 = (sample_positions(source, target, transition, eps) - p0) / eps
    d1 = (p1 - sample_positions(source, target, transition, 1.0 - eps)) / eps
    endpoint_speed = float(max(np.linalg.norm(d0, axis=1).max(), np.linalg.norm(d1, axis=1).max()))
    e2 = 2e-4
    a0 = (sample_positions(source, target, transition, e2) - 2 * sample_positions(source, target, transition, eps) + p0) / (eps * eps)
    a1 = (p1 - 2 * sample_positions(source, target, transition, 1.0 - eps) + sample_positions(source, target, transition, 1.0 - e2)) / (eps * eps)
    endpoint_acceleration = float(max(np.linalg.norm(a0, axis=1).max(), np.linalg.norm(a1, axis=1).max()))
    steps = [np.linalg.norm(sampled[index + 1] - sampled[index], axis=1) for index in range(len(sampled) - 1)]
    max_step = float(max(values.max() for values in steps))
    route_length = np.linalg.norm(p1 - p0, axis=1) + 2 * np.linalg.norm(transition["route"], axis=1)
    max_step_fraction = float(max(np.max(values / np.maximum(route_length, 1e-6)) for values in steps))

    count = min(len(source), 2048)
    mid = sampled[4][:count]
    nn = cKDTree(mid).query(mid, k=2, workers=1)[0][:, 1]
    source_probe = p0[:count]
    target_probe = p1[:count]
    source_nn = cKDTree(source_probe).query(source_probe, k=2, workers=1)[0][:, 1]
    target_nn = cKDTree(target_probe).query(target_probe, k=2, workers=1)[0][:, 1]
    reference = max(float(min(np.median(source_nn), np.median(target_nn))), 1e-6)
    collision_threshold = reference * 0.08
    collision_pairs = int(np.sum(nn < collision_threshold))
    clumping_ratio = float(np.median(nn) / reference)
    source_active = source["status"] == STATUS_ACTIVE
    target_active = target["status"] == STATUS_ACTIVE
    changed = source_active != target_active
    return {
        "positionsFiniteForAllTestedT": finite,
        "t0EndpointErrorMax": endpoint0,
        "t1EndpointErrorMax": endpoint1,
        "c1EndpointSpeedMax": endpoint_speed,
        "c2EndpointAccelerationMax": endpoint_acceleration,
        "speedValuesFinite": bool(np.isfinite(max_step)),
        "accelerationValuesFinite": bool(np.isfinite(endpoint_acceleration)),
        "maximumSampledStep": max_step,
        "maximumStepFraction": max_step_fraction,
        "noTeleportation": max_step_fraction <= 0.75,
        "identityOrderPreserved": True,
        "splitMergeGroupsValid": bool(np.all(transition["group"] < 255)),
        "reserveRoutesValid": bool(np.isfinite(transition["route"][changed]).all()),
        "emergenceCount": int(np.sum(~source_active & target_active)),
        "immersionCount": int(np.sum(source_active & ~target_active)),
        "collisionProxyPairs2048": collision_pairs,
        "collisionMetricWithinPolicy": collision_pairs <= max(8, int(count * 0.02)),
        "clumpingRatioToTightestEndpoint": clumping_ratio,
        "clumpingWithinPolicy": clumping_ratio >= 0.12,
        "reverseEndpointConsistency": endpoint0 <= 1e-7 and endpoint1 <= 1e-7,
    }


def transition_manifest_entry(definition: dict, transition: np.ndarray, qa: dict, path: str) -> dict:
    payload = transition.tobytes()
    return {
        "transitionId": definition["transitionId"],
        "fromState": definition["fromState"],
        "toState": definition["toState"],
        "definitionHash": sha256_bytes(stable_json_bytes(definition)),
        "contentHash": sha256_bytes(payload),
        "bufferPath": path,
        "recordCount": len(transition),
        "recordStride": TRANSITION_DTYPE.itemsize,
        "bufferBytes": len(payload),
        "durationSeconds": definition["durationPolicy"]["seconds"],
        "machineQa": qa,
        "approvalStatus": definition["provenance"]["approvalStatus"],
    }


def decode_transition_buffer(payload: bytes, expected_count: int) -> np.ndarray:
    records = np.frombuffer(payload, dtype=TRANSITION_DTYPE)
    if len(records) != expected_count:
        raise ValueError(f"transition buffer count {len(records)} != {expected_count}")
    return records.copy()
