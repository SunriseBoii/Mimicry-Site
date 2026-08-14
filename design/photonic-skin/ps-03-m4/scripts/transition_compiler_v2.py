"""Target-agnostic hierarchical transition compiler for PS-03.M4.

The compiler consumes frozen M3 endpoint records (or a finite transient
snapshot as the source). It derives all routing from geometry, M3 flags,
transitionGroup/shell context and declarative profile values. There are no
competency, target, component, state-name or pair-name conditionals here.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from math import ceil
from typing import Any, Mapping

import numpy as np

try:
    from contracts import (
        COMPILER_VERSION,
        GROUP_FLAG_BRIDGE,
        GROUP_FLAG_MERGE,
        GROUP_FLAG_PROTECTED,
        GROUP_FLAG_REGROUP,
        GROUP_FLAG_SPLIT,
        GROUP_TRACK_DTYPE,
        IDENTITY_SPACE_VERSION,
        PER_ID_DTYPE,
        PER_ID_FLAG_BRIDGE,
        PER_ID_FLAG_EMERGENCE,
        PER_ID_FLAG_IMMERSION,
        PER_ID_FLAG_PROTECTED,
        PER_ID_FLAG_SHELL_CHANGE,
        PER_ID_FLAG_SOURCE_ACTIVE,
        PER_ID_FLAG_SUBSURFACE,
        PER_ID_FLAG_TARGET_ACTIVE,
        STATE_FLAG_FEATURE,
        STATE_FLAG_SILHOUETTE,
        STATUS_ACTIVE,
        STATUS_SUBSURFACE,
        TRANSITION_PROGRAM_SCHEMA_VERSION,
        TRANSITION_PROGRAM_VERSION,
        canonical_hash,
        decode_records,
        runtime_byte_layout,
        sha256_bytes,
        stable_json_bytes,
        validate_motion_profile,
        validate_transition_request,
    )
    from m3_adapter import decode_normals
except ImportError:  # pragma: no cover - package import path
    from .contracts import (
        COMPILER_VERSION,
        GROUP_FLAG_BRIDGE,
        GROUP_FLAG_MERGE,
        GROUP_FLAG_PROTECTED,
        GROUP_FLAG_REGROUP,
        GROUP_FLAG_SPLIT,
        GROUP_TRACK_DTYPE,
        IDENTITY_SPACE_VERSION,
        PER_ID_DTYPE,
        PER_ID_FLAG_BRIDGE,
        PER_ID_FLAG_EMERGENCE,
        PER_ID_FLAG_IMMERSION,
        PER_ID_FLAG_PROTECTED,
        PER_ID_FLAG_SHELL_CHANGE,
        PER_ID_FLAG_SOURCE_ACTIVE,
        PER_ID_FLAG_SUBSURFACE,
        PER_ID_FLAG_TARGET_ACTIVE,
        STATE_FLAG_FEATURE,
        STATE_FLAG_SILHOUETTE,
        STATUS_ACTIVE,
        STATUS_SUBSURFACE,
        TRANSITION_PROGRAM_SCHEMA_VERSION,
        TRANSITION_PROGRAM_VERSION,
        canonical_hash,
        decode_records,
        runtime_byte_layout,
        sha256_bytes,
        stable_json_bytes,
        validate_motion_profile,
        validate_transition_request,
    )
    from .m3_adapter import decode_normals


@dataclass(frozen=True)
class TransitionProgram:
    """In-memory program plus deterministic compact runtime buffers."""

    program_id: str
    header: dict[str, Any]
    routing_graph: tuple[dict[str, Any], ...]
    bridge_tracks: tuple[dict[str, Any], ...]
    group_tracks: np.ndarray
    per_id: np.ndarray
    hashes: dict[str, str]
    provenance: dict[str, Any]
    schema_version: str = TRANSITION_PROGRAM_SCHEMA_VERSION
    program_version: str = TRANSITION_PROGRAM_VERSION
    identity_space_version: str = IDENTITY_SPACE_VERSION

    @property
    def programId(self) -> str:
        return self.program_id

    @property
    def routingGraph(self) -> tuple[dict[str, Any], ...]:
        return self.routing_graph

    @property
    def bridgeTracks(self) -> tuple[dict[str, Any], ...]:
        return self.bridge_tracks

    @property
    def groupTracks(self) -> np.ndarray:
        return self.group_tracks

    @property
    def perId(self) -> np.ndarray:
        return self.per_id

    def metadata(self) -> dict[str, Any]:
        group_payload = self.group_tracks.tobytes(order="C")
        per_payload = self.per_id.tobytes(order="C")
        return {
            "schemaVersion": self.schema_version,
            "programVersion": self.program_version,
            "programId": self.program_id,
            "identitySpaceVersion": self.identity_space_version,
            "header": self.header,
            "routingGraph": list(self.routing_graph),
            "bridgeTracks": list(self.bridge_tracks),
            "buffers": {
                "groupTracks": {
                    "recordCount": len(self.group_tracks),
                    "recordStride": GROUP_TRACK_DTYPE.itemsize,
                    "byteLength": len(group_payload),
                    "sha256": self.hashes["groupTracksSha256"],
                },
                "perId": {
                    "recordCount": len(self.per_id),
                    "recordStride": PER_ID_DTYPE.itemsize,
                    "byteLength": len(per_payload),
                    "sha256": self.hashes["perIdSha256"],
                },
            },
            "byteLayout": runtime_byte_layout(),
            "hashes": self.hashes,
            "provenance": self.provenance,
        }

    def __getitem__(self, key: str) -> Any:
        aliases = {
            "schemaVersion": self.schema_version,
            "programVersion": self.program_version,
            "programId": self.program_id,
            "identitySpaceVersion": self.identity_space_version,
            "routingGraph": self.routing_graph,
            "bridgeTracks": self.bridge_tracks,
            "groupTracks": self.group_tracks,
            "perId": self.per_id,
        }
        if key in aliases:
            return aliases[key]
        return getattr(self, key)


def _record_count(records: np.ndarray | Mapping[str, Any]) -> int:
    if isinstance(records, Mapping):
        if "position" not in records:
            raise ValueError("record mapping must contain position")
        return len(np.asarray(records["position"]))
    return len(records)


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
        raise ValueError(f"record field {name} has {len(array)} values, expected {count}")
    return array[:count]


def _records_hash(records: np.ndarray | Mapping[str, Any], count: int) -> str:
    if not isinstance(records, Mapping):
        return sha256_bytes(np.ascontiguousarray(records[:count]).tobytes())
    import hashlib

    digest = hashlib.sha256()
    for name in sorted(key for key in records if isinstance(records[key], np.ndarray)):
        value = np.ascontiguousarray(records[name][:count])
        digest.update(name.encode("utf-8"))
        digest.update(value.dtype.str.encode("ascii"))
        digest.update(np.asarray(value.shape, dtype="<u8").tobytes())
        digest.update(value.tobytes())
    return digest.hexdigest()


def _normalise(vector: np.ndarray, fallback: np.ndarray | None = None) -> np.ndarray:
    value = np.asarray(vector, dtype=np.float64)
    length = float(np.linalg.norm(value))
    if length > 1e-12:
        return value / length
    if fallback is None:
        fallback = np.array([0.0, 0.0, 1.0])
    return np.asarray(fallback, dtype=np.float64).copy()


def _orthogonal(axis: np.ndarray) -> np.ndarray:
    basis = np.zeros(3, dtype=np.float64)
    basis[int(np.argmin(np.abs(axis)))] = 1.0
    return _normalise(np.cross(axis, basis))


def _principal_axis(p0: np.ndarray, p1: np.ndarray, intent: Any) -> np.ndarray:
    if intent != "auto":
        explicit = np.asarray(intent, dtype=np.float64)
        if explicit.shape == (3,) and np.isfinite(explicit).all() and np.linalg.norm(explicit) > 1e-10:
            return _normalise(explicit)
    centroid_delta = np.mean(p1, axis=0) - np.mean(p0, axis=0)
    if np.linalg.norm(centroid_delta) > 1e-8:
        return _normalise(centroid_delta)
    combined = np.concatenate((p0, p1), axis=0)
    centered = combined - np.mean(combined, axis=0)
    covariance = centered.T @ centered / max(len(centered), 1)
    _, vectors = np.linalg.eigh(covariance)
    axis = _normalise(vectors[:, -1])
    dominant = int(np.argmax(np.abs(axis)))
    if axis[dominant] < 0.0:
        axis = -axis
    return axis


def _weighted_centers(
    position: np.ndarray, inverse: np.ndarray, group_count: int, weight: np.ndarray
) -> np.ndarray:
    totals = np.bincount(inverse, weights=weight, minlength=group_count)
    centers = np.zeros((group_count, 3), dtype=np.float64)
    for component in range(3):
        centers[:, component] = np.bincount(
            inverse, weights=position[:, component] * weight, minlength=group_count
        )
    return centers / np.maximum(totals[:, None], 1e-12)


def _hash_u32(values: np.ndarray, seed: int) -> np.ndarray:
    value = values.astype(np.uint32) ^ np.uint32(seed)
    value ^= value >> np.uint32(16)
    value *= np.uint32(0x7FEB352D)
    value ^= value >> np.uint32(15)
    value *= np.uint32(0x846CA68B)
    value ^= value >> np.uint32(16)
    return value


def _hash_unit_vectors(count: int, seed: int) -> np.ndarray:
    ids = np.arange(count, dtype=np.uint32)
    x = _hash_u32(ids, seed ^ 0xA511E9B3).astype(np.float64) / 4294967295.0 * 2.0 - 1.0
    y = _hash_u32(ids, seed ^ 0x63D83595).astype(np.float64) / 4294967295.0 * 2.0 - 1.0
    z = _hash_u32(ids, seed ^ 0xC2B2AE35).astype(np.float64) / 4294967295.0 * 2.0 - 1.0
    vectors = np.column_stack((x, y, z))
    lengths = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.maximum(lengths, 1e-12)


def _relation(source_shell_count: int, target_shell_count: int, source_macro: int, target_macro: int) -> str:
    if source_macro == target_macro:
        return "preserve"
    if target_shell_count > source_shell_count:
        return "split"
    if target_shell_count < source_shell_count:
        return "merge"
    return "regroup"


def _duration_seconds(
    request: Mapping[str, Any],
    profile: Mapping[str, Any],
    source_entry: Mapping[str, Any],
    target_entry: Mapping[str, Any],
    p0: np.ndarray,
    p1: np.ndarray,
) -> float:
    if request.get("reducedMotion", False):
        return 0.0
    trigger = request["triggerMode"]
    viewport = request["viewportProfile"]
    timing = profile["timingPolicy"]["variants"][trigger][viewport]
    duration = float(timing["durationSeconds"])
    if trigger in {"route", "qa"}:
        shell_delta = abs(int(source_entry.get("shellCount", 1)) - int(target_entry.get("shellCount", 1)))
        displacement = np.linalg.norm(p1 - p0, axis=1)
        bounds = np.ptp(np.concatenate((p0, p1), axis=0), axis=0)
        relative = float(np.quantile(displacement, 0.75) / max(np.linalg.norm(bounds), 1e-6))
        duration += min(0.20, 0.04 * shell_delta + 0.08 * min(relative, 1.0))
    if "durationOverride" in request:
        duration = float(request["durationOverride"])
    hard_cap = float(timing.get("hardCapSeconds", profile["timingPolicy"]["durationBoundsSeconds"][1]))
    if duration > hard_cap + 1e-12:
        raise ValueError(f"duration {duration} exceeds {viewport} {trigger} hard cap {hard_cap}")
    return duration


def _program_base_metadata(program: TransitionProgram) -> dict[str, Any]:
    metadata = program.metadata()
    metadata["hashes"] = {key: value for key, value in metadata["hashes"].items() if key != "contentSha256"}
    return metadata


def _with_content_hash(program: TransitionProgram) -> TransitionProgram:
    payload = (
        stable_json_bytes(_program_base_metadata(program))
        + program.group_tracks.tobytes(order="C")
        + program.per_id.tobytes(order="C")
    )
    hashes = dict(program.hashes)
    hashes["contentSha256"] = sha256_bytes(payload)
    return TransitionProgram(
        program_id=program.program_id,
        header=program.header,
        routing_graph=program.routing_graph,
        bridge_tracks=program.bridge_tracks,
        group_tracks=program.group_tracks,
        per_id=program.per_id,
        hashes=hashes,
        provenance=program.provenance,
    )


def _make_program(
    *,
    program_id: str,
    header: dict[str, Any],
    routing_graph: list[dict[str, Any]],
    bridge_tracks: list[dict[str, Any]],
    group_tracks: np.ndarray,
    per_id: np.ndarray,
    source_entry: Mapping[str, Any],
    target_entry: Mapping[str, Any],
    source_records_hash: str,
    target_records_hash: str,
    profile: Mapping[str, Any],
    request: Mapping[str, Any],
) -> TransitionProgram:
    group_hash = sha256_bytes(group_tracks.tobytes(order="C"))
    per_hash = sha256_bytes(per_id.tobytes(order="C"))
    hashes = {
        "sourceStateSha256": str(source_entry.get("contentHash", source_records_hash)),
        "targetStateSha256": str(target_entry.get("contentHash", target_records_hash)),
        "sourceRecordsSha256": source_records_hash,
        "targetRecordsSha256": target_records_hash,
        "motionProfileSha256": canonical_hash(profile),
        "requestSha256": canonical_hash(request),
        "groupTracksSha256": group_hash,
        "perIdSha256": per_hash,
        "contentSha256": "",
    }
    program = TransitionProgram(
        program_id=program_id,
        header=header,
        routing_graph=tuple(routing_graph),
        bridge_tracks=tuple(bridge_tracks),
        group_tracks=np.ascontiguousarray(group_tracks, dtype=GROUP_TRACK_DTYPE),
        per_id=np.ascontiguousarray(per_id, dtype=PER_ID_DTYPE),
        hashes=hashes,
        provenance={
            "stage": "PS-03.M4",
            "compiler": COMPILER_VERSION,
            "geometryOnly": True,
            "pairSpecificBranches": False,
            "targetSpecificBranches": False,
            "approvalStatus": "requires-human-approval",
        },
    )
    return _with_content_hash(program)


def compile_transition(
    request: Mapping[str, Any],
    source_entry: Mapping[str, Any],
    source_records: np.ndarray | Mapping[str, Any],
    target_entry: Mapping[str, Any],
    target_records: np.ndarray | Mapping[str, Any],
    profile: Mapping[str, Any],
) -> TransitionProgram:
    """Compile one requested pair or LOD prefix; never emits an all-pair matrix."""

    profile_problems = validate_motion_profile(profile)
    request_problems = validate_transition_request(request, profile)
    if profile_problems or request_problems:
        raise ValueError(f"invalid compile inputs: {profile_problems + request_problems}")
    if request["targetStateId"] != target_entry.get("stateId"):
        raise ValueError("request targetStateId does not match target entry")
    if "sourceStateId" in request and request["sourceStateId"] != source_entry.get("stateId"):
        raise ValueError("request sourceStateId does not match source entry")

    source_available = _record_count(source_records)
    target_available = _record_count(target_records)
    available = min(source_available, target_available)
    if "probeIdentityCount" in request:
        count = int(request["probeIdentityCount"])
    elif "sourceSnapshot" in request:
        count = int(request["sourceSnapshot"]["recordCount"])
    else:
        if source_available != target_available:
            raise ValueError("unequal endpoint buffers require an explicit persistent-ID prefix count")
        count = available
    if count > available:
        raise ValueError(f"probeIdentityCount {count} exceeds supplied record count {available}")
    if "sourceSnapshot" in request:
        descriptor = request["sourceSnapshot"]
        if int(descriptor["recordCount"]) != count:
            raise ValueError("sourceSnapshot recordCount does not match compile count")
        if isinstance(source_records, Mapping) and source_records.get("snapshotHash"):
            if descriptor["snapshotHash"] != source_records["snapshotHash"]:
                raise ValueError("sourceSnapshot hash does not match supplied transient records")

    p0 = _field(source_records, "position", count, 0.0, np.float64)
    p1 = _field(target_records, "position", count, 0.0, np.float64)
    if p0.shape != (count, 3) or p1.shape != (count, 3):
        raise ValueError("endpoint positions must be Nx3")
    if not np.isfinite(p0).all() or not np.isfinite(p1).all():
        raise ValueError("endpoint positions contain NaN/Inf")

    source_records_hash = _records_hash(source_records, count)
    target_records_hash = _records_hash(target_records, count)
    same_endpoint = source_records_hash == target_records_hash
    source_id = str(source_entry.get("stateId", "transient-source"))
    target_id = str(target_entry.get("stateId", request["targetStateId"]))
    request_hash = canonical_hash(request)
    program_id = f"{source_id}-to-{target_id}-{request['triggerMode']}-{request['viewportProfile']}-{request_hash[:12]}"

    phase_policy = {
        "sequence": list(profile["phasePolicy"]["sequence"]),
        "windows": dict(profile["phasePolicy"]["windows"]),
        "basis": profile["phasePolicy"]["basis"],
    }
    if same_endpoint:
        header = {
            "compilerVersion": COMPILER_VERSION,
            "sourceStateId": source_id,
            "targetStateId": target_id,
            "sourceKind": "transient-snapshot" if "sourceSnapshot" in request else "frozen-state",
            "motionProfileId": profile["profileId"],
            "motionProfileVersion": profile["profileVersion"],
            "triggerMode": request["triggerMode"],
            "viewportProfile": request["viewportProfile"],
            "deterministicSeed": int(request["deterministicSeed"]),
            "identityCount": count,
            "groupCount": 0,
            "durationSeconds": 0.0,
            "isNoOp": True,
            "reducedMotion": bool(request.get("reducedMotion", False)),
            "directionAxis": [0.0, 0.0, 0.0],
            "phasePolicy": phase_policy,
            "actorTrack": {
                "sourcePose": {"position": [0.0, 0.0, 0.0], "orientation": [0.0, 0.0, 0.0, 1.0]},
                "centerStart": np.mean(p0, axis=0).tolist(),
                "centerEnd": np.mean(p1, axis=0).tolist(),
                "translationAxis": [0.0, 0.0, 0.0],
                "rotationAxis": [0.0, 0.0, 1.0],
                "translationAmplitude": 0.0,
                "rotationRadians": 0.0,
                "window": [0.0, 1.0],
            },
        }
        return _make_program(
            program_id=program_id,
            header=header,
            routing_graph=[],
            bridge_tracks=[],
            group_tracks=np.zeros(0, dtype=GROUP_TRACK_DTYPE),
            per_id=np.zeros(0, dtype=PER_ID_DTYPE),
            source_entry=source_entry,
            target_entry=target_entry,
            source_records_hash=source_records_hash,
            target_records_hash=target_records_hash,
            profile=profile,
            request=request,
        )

    source_status = _field(source_records, "status", count, STATUS_ACTIVE, np.uint8)
    target_status = _field(target_records, "status", count, STATUS_ACTIVE, np.uint8)
    source_flags = _field(source_records, "flags", count, 0, np.uint8)
    target_flags = _field(target_records, "flags", count, 0, np.uint8)
    source_shell = _field(source_records, "shell", count, 0, np.uint8)
    target_shell = _field(target_records, "shell", count, 0, np.uint8)
    source_group = _field(source_records, "transitionGroup", count, 0, np.uint8)
    target_group = _field(target_records, "transitionGroup", count, 0, np.uint8)
    source_depth = _field(source_records, "reserveDepth", count, 0.0, np.float64)
    target_depth = _field(target_records, "reserveDepth", count, 0.0, np.float64)
    source_normals = decode_normals(source_records)[:count]
    target_normals = decode_normals(target_records)[:count]

    protected_mask = ((source_flags | target_flags) & (STATE_FLAG_FEATURE | STATE_FLAG_SILHOUETTE)) != 0
    source_active = source_status == STATUS_ACTIVE
    target_active = target_status == STATUS_ACTIVE
    shell_changed = source_shell != target_shell
    source_macro = (source_shell.astype(np.uint16) << np.uint16(8)) | source_group.astype(np.uint16)
    target_macro = (target_shell.astype(np.uint16) << np.uint16(8)) | target_group.astype(np.uint16)
    pairs = np.column_stack((source_macro, target_macro))
    unique_pairs, inverse = np.unique(pairs, axis=0, return_inverse=True)
    group_count = len(unique_pairs)
    if group_count > np.iinfo(np.uint16).max:
        raise ValueError("macro routing exceeds uint16 group index budget")

    source_weight = np.where(source_active, 1.0, 0.25) * np.where(protected_mask, 1.35, 1.0)
    target_weight = np.where(target_active, 1.0, 0.25) * np.where(protected_mask, 1.35, 1.0)
    centers0 = _weighted_centers(p0, inverse, group_count, source_weight)
    centers1 = _weighted_centers(p1, inverse, group_count, target_weight)
    group_members = np.bincount(inverse, minlength=group_count)
    source_protected = np.bincount(inverse, weights=protected_mask.astype(np.float64), minlength=group_count) / np.maximum(group_members, 1)
    target_protected = np.bincount(inverse, weights=protected_mask.astype(np.float64), minlength=group_count) / np.maximum(group_members, 1)

    direction_axis = _principal_axis(p0, p1, request["directionIntent"])
    group_mid = 0.5 * (centers0 + centers1)
    projection = group_mid @ direction_axis
    projection_span = float(np.ptp(projection))
    group_order = (projection - float(np.min(projection))) / max(projection_span, 1e-12)

    windows = profile["phasePolicy"]["windows"]
    route_policy = profile["routeFieldPolicy"]
    feature_policy = profile["featureProtectionPolicy"]
    split_policy = profile["splitMergePolicy"]
    spatial_delay = float(profile["phasePolicy"]["spatialDelayFraction"])
    amplitude_factor = 1.0
    if request["viewportProfile"] == "mobile":
        amplitude_factor *= float(route_policy["mobileAmplitudeFactor"])
    if request["triggerMode"] == "preview":
        amplitude_factor *= float(route_policy["previewAmplitudeFactor"])

    source_shell_count = int(source_entry.get("shellCount", len(np.unique(source_shell[source_active]))))
    target_shell_count = int(target_entry.get("shellCount", len(np.unique(target_shell[target_active]))))
    group_tracks = np.zeros(group_count, dtype=GROUP_TRACK_DTYPE)
    routing_graph: list[dict[str, Any]] = []
    relation_by_group: list[str] = []
    seed = int(request["deterministicSeed"])
    for group_index, (source_macro_value, target_macro_value) in enumerate(unique_pairs):
        relation = _relation(
            source_shell_count,
            target_shell_count,
            int(source_macro_value),
            int(target_macro_value),
        )
        relation_by_group.append(relation)
        delta = centers1[group_index] - centers0[group_index]
        average_normal = _normalise(
            np.mean(0.5 * (source_normals[inverse == group_index] + target_normals[inverse == group_index]), axis=0),
            _orthogonal(direction_axis),
        )
        lateral = np.cross(delta, direction_axis)
        if np.linalg.norm(lateral) < 1e-9:
            lateral = np.cross(average_normal, direction_axis)
        if np.linalg.norm(lateral) < 1e-9:
            lateral = _orthogonal(direction_axis)
        lateral = _normalise(lateral)
        sign_hash = (int(source_macro_value) * 73856093) ^ (int(target_macro_value) * 19349663) ^ seed
        sign = 1.0 if (sign_hash & 1) == 0 else -1.0
        amplitude = min(
            float(route_policy["maximumMacroRoute"]),
            float(route_policy["baseMacroRoute"]) + np.linalg.norm(delta) * float(route_policy["distanceFactor"]),
        )
        amplitude *= amplitude_factor
        amplitude *= 1.0 + (0.18 if relation in {"split", "merge"} else 0.0)
        amplitude *= 1.0 - source_protected[group_index] * (1.0 - float(feature_policy["routeAmplitudeFactor"]))
        route_control = lateral * (amplitude * sign) + average_normal * (amplitude * 0.22)

        release_start = float(windows["release"][0]) + group_order[group_index] * spatial_delay
        release_start += source_protected[group_index] * float(feature_policy["sourceReleaseDelay"])
        release_end = max(release_start + 0.08, float(windows["release"][1]) + group_order[group_index] * spatial_delay * 0.35)
        reveal_start = float(windows["reveal"][0]) + group_order[group_index] * spatial_delay * 0.45
        reveal_start -= target_protected[group_index] * float(feature_policy["targetRevealAdvance"])
        # Local skin must finish during reveal, not remain half-morphed through
        # late approach.  A narrow per-ID handoff below keeps readable source
        # and target subsets while only a spatial band is in transit.
        reveal_end = float(windows["reveal"][1]) - target_protected[group_index] * 0.025
        release_start = float(np.clip(release_start, 0.0, 0.72))
        release_end = float(np.clip(release_end, release_start + 1e-4, 0.78))
        reveal_start = float(np.clip(reveal_start, release_start, 0.8))
        reveal_end = float(np.clip(reveal_end, max(reveal_start + 1e-4, release_end), 0.98))

        group_flag = 0
        if relation == "split":
            group_flag |= GROUP_FLAG_SPLIT
        elif relation == "merge":
            group_flag |= GROUP_FLAG_MERGE
        elif relation == "regroup":
            group_flag |= GROUP_FLAG_REGROUP
        if source_protected[group_index] > 0.0 or target_protected[group_index] > 0.0:
            group_flag |= GROUP_FLAG_PROTECTED

        group_tracks["sourceCenter"][group_index] = centers0[group_index].astype(np.float32)
        group_tracks["targetCenter"][group_index] = centers1[group_index].astype(np.float32)
        group_tracks["routeControl"][group_index] = route_control.astype(np.float32)
        group_tracks["direction"][group_index] = direction_axis.astype(np.float16)
        group_tracks["releaseStart"][group_index] = np.float16(release_start)
        group_tracks["releaseEnd"][group_index] = np.float16(release_end)
        group_tracks["revealStart"][group_index] = np.float16(reveal_start)
        group_tracks["revealEnd"][group_index] = np.float16(reveal_end)
        group_tracks["bridgeStart"][group_index] = np.float16(split_policy["bridgeWindow"][0])
        group_tracks["bridgeEnd"][group_index] = np.float16(split_policy["bridgeWindow"][1])
        group_tracks["sourceMacro"][group_index] = np.uint16(source_macro_value)
        group_tracks["targetMacro"][group_index] = np.uint16(target_macro_value)
        group_tracks["flags"][group_index] = np.uint16(group_flag)
        group_tracks["memberCount"][group_index] = np.uint16(group_members[group_index])
        routing_graph.append(
            {
                "groupIndex": group_index,
                "sourceMacroGroup": int(source_macro_value),
                "targetMacroGroup": int(target_macro_value),
                "relation": relation,
                "memberCount": int(group_members[group_index]),
            }
        )

    per_id = np.zeros(count, dtype=PER_ID_DTYPE)
    per_id["groupIndex"] = inverse.astype(np.uint16)
    local0 = p0 - centers0[inverse]
    local1 = p1 - centers1[inverse]
    per_id["localSource"] = np.clip(local0, -65504.0, 65504.0).astype(np.float16)
    per_id["localTarget"] = np.clip(local1, -65504.0, 65504.0).astype(np.float16)

    ids = np.arange(count, dtype=np.uint32)
    random_vectors = _hash_unit_vectors(count, seed)
    random_vectors -= np.sum(random_vectors * direction_axis[None, :], axis=1, keepdims=True) * direction_axis[None, :]
    random_lengths = np.linalg.norm(random_vectors, axis=1, keepdims=True)
    weak = random_lengths[:, 0] < 1e-10
    if np.any(weak):
        random_vectors[weak] = _orthogonal(direction_axis)
        random_lengths[weak] = 1.0
    random_vectors /= np.maximum(random_lengths, 1e-12)
    distance = np.linalg.norm(p1 - p0, axis=1)
    residual_amplitude = np.minimum(
        float(route_policy["maximumResidual"]),
        distance * float(route_policy["residualDistanceFraction"]),
    )
    residual_amplitude *= amplitude_factor
    residual_amplitude *= np.where(protected_mask, float(feature_policy["routeAmplitudeFactor"]), 1.0)
    residual = random_vectors * residual_amplitude[:, None]
    for component in range(3):
        sums = np.bincount(inverse, weights=residual[:, component], minlength=group_count)
        residual[:, component] -= sums[inverse] / np.maximum(group_members[inverse], 1)
    per_id["residual"] = residual.astype(np.float16)
    per_id["depth"] = np.maximum(source_depth, target_depth).astype(np.float16)

    point_projection = (0.5 * (p0 + p1)) @ direction_axis
    point_span = float(np.ptp(point_projection))
    spatial_order = (point_projection - float(np.min(point_projection))) / max(point_span, 1e-12)
    hash_order = _hash_u32(ids, seed ^ 0x9E3779B9).astype(np.float64) / 4294967295.0
    coherent_order = np.clip(0.82 * spatial_order + 0.18 * hash_order, 0.0, 1.0)
    per_id["phaseOffset"] = np.round(coherent_order * 255.0).astype(np.uint8)
    emerging = ~source_active & target_active
    immersing = source_active & ~target_active
    reserve_policy = profile["reserveTransportPolicy"]
    ordering = coherent_order * float(reserve_policy["spatialOrderingFraction"])
    activation_start = np.zeros(count, dtype=np.float64)
    activation_end = np.ones(count, dtype=np.float64)
    activation_start[emerging] = float(reserve_policy["emergenceWindow"][0]) + ordering[emerging]
    activation_end[emerging] = float(reserve_policy["emergenceWindow"][1]) + ordering[emerging] * 0.35
    activation_start[immersing] = float(reserve_policy["immersionWindow"][0]) + ordering[immersing] * 0.35
    activation_end[immersing] = float(reserve_policy["immersionWindow"][1]) + ordering[immersing]
    activation_end = np.minimum(activation_end, 0.98)
    per_id["activationStart"] = activation_start.astype(np.float16)
    per_id["activationEnd"] = activation_end.astype(np.float16)

    flags = np.zeros(count, dtype=np.uint16)
    flags |= emerging.astype(np.uint16) * PER_ID_FLAG_EMERGENCE
    flags |= immersing.astype(np.uint16) * PER_ID_FLAG_IMMERSION
    flags |= protected_mask.astype(np.uint16) * PER_ID_FLAG_PROTECTED
    flags |= shell_changed.astype(np.uint16) * PER_ID_FLAG_SHELL_CHANGE
    flags |= source_active.astype(np.uint16) * PER_ID_FLAG_SOURCE_ACTIVE
    flags |= target_active.astype(np.uint16) * PER_ID_FLAG_TARGET_ACTIVE
    flags |= ((source_status == STATUS_SUBSURFACE) | (target_status == STATUS_SUBSURFACE)).astype(np.uint16) * PER_ID_FLAG_SUBSURFACE

    bridge_tracks: list[dict[str, Any]] = []
    bridge_fraction = float(split_policy["maximumBridgeFractionPerGroup"])
    bridge_cap = int(split_policy["maximumBridgeIdsPerGroup"])
    for group_index, relation in enumerate(relation_by_group):
        if relation == "preserve":
            continue
        candidates = np.flatnonzero((inverse == group_index) & shell_changed & ~protected_mask)
        if not len(candidates):
            continue
        selected_count = min(len(candidates), bridge_cap, max(1, int(ceil(group_members[group_index] * bridge_fraction))))
        meeting = 0.5 * (centers0[group_index] + centers1[group_index])
        midpoint = 0.5 * (p0[candidates] + p1[candidates])
        jitter = _hash_u32(candidates.astype(np.uint32), seed ^ group_index).astype(np.float64) * 1e-15
        score = np.linalg.norm(midpoint - meeting, axis=1) + jitter
        selected = candidates[np.argsort(score, kind="stable")[:selected_count]]
        flags[selected] |= PER_ID_FLAG_BRIDGE
        group_tracks["flags"][group_index] |= np.uint16(GROUP_FLAG_BRIDGE)
        bridge_tracks.append(
            {
                "groupIndex": group_index,
                "mode": relation,
                "start": float(split_policy["bridgeWindow"][0]),
                "peak": float(split_policy["bridgePeak"]),
                "end": float(split_policy["bridgeWindow"][1]),
                "thickness": float(split_policy["bridgeThickness"]),
                "memberCount": int(selected_count),
            }
        )
    per_id["flags"] = flags

    duration = _duration_seconds(request, profile, source_entry, target_entry, p0, p1)
    average_normal = _normalise(np.mean(source_normals + target_normals, axis=0), _orthogonal(direction_axis))
    rotation_axis = np.cross(direction_axis, average_normal)
    if np.linalg.norm(rotation_axis) < 1e-9:
        rotation_axis = _orthogonal(direction_axis)
    rotation_axis = _normalise(rotation_axis)
    global_policy = profile["globalPosePolicy"]
    viewport = request["viewportProfile"]
    displacement_reference = min(float(np.quantile(distance, 0.65)), 1.0)
    translation_amplitude = float(global_policy["translationAmplitudeFraction"][viewport]) * displacement_reference
    topology_factor = min(1.0, abs(target_shell_count - source_shell_count) / 3.0 + float(np.mean(shell_changed)))
    rotation_radians = float(global_policy["rotationRadiansMax"][viewport]) * topology_factor
    source_pose = {"position": [0.0, 0.0, 0.0], "orientation": [0.0, 0.0, 0.0, 1.0]}
    if isinstance(source_records, Mapping) and isinstance(source_records.get("actorPose"), Mapping):
        pose = source_records["actorPose"]
        source_pose = {
            "position": np.asarray(pose.get("position", [0.0, 0.0, 0.0]), dtype=np.float64).tolist(),
            "orientation": np.asarray(pose.get("orientation", [0.0, 0.0, 0.0, 1.0]), dtype=np.float64).tolist(),
        }
    header = {
        "compilerVersion": COMPILER_VERSION,
        "sourceStateId": source_id,
        "targetStateId": target_id,
        "sourceKind": "transient-snapshot" if "sourceSnapshot" in request else "frozen-state",
        "motionProfileId": profile["profileId"],
        "motionProfileVersion": profile["profileVersion"],
        "triggerMode": request["triggerMode"],
        "viewportProfile": viewport,
        "deterministicSeed": seed,
        "identityCount": count,
        "groupCount": group_count,
        "durationSeconds": duration,
        "isNoOp": False,
        "reducedMotion": bool(request.get("reducedMotion", False)),
        "directionAxis": [round(float(value), 14) for value in direction_axis],
        "phasePolicy": phase_policy,
        "activationPolicy": {
            "depthRouteFraction": float(reserve_policy["depthRouteFraction"]),
            "minimumGeometricScale": float(reserve_policy["minimumGeometricScale"]),
            "bridgePulseMaximum": float(profile["scalePolicy"]["bridgePulseMaximum"]),
            "bridgeThickness": float(split_policy["bridgeThickness"]),
            "phaseOffsetRange": float(profile["groupCoherencePolicy"]["localHandoffSpanFraction"]),
            "localMorphWidthFraction": float(profile["groupCoherencePolicy"]["localMorphWidthFraction"]),
            "routeOnlyDuringLocalHandoff": bool(profile["groupCoherencePolicy"]["routeOnlyDuringLocalHandoff"]),
            "endpointHoldOutsideHandoff": bool(profile["groupCoherencePolicy"]["endpointHoldOutsideHandoff"]),
        },
        "settlePolicy": {
            "maximumAmplitudeFraction": float(profile["settlePolicy"]["maximumAmplitudeFraction"][viewport]),
            "window": list(windows["settle"]),
        },
        "actorTrack": {
            "sourcePose": source_pose,
            "centerStart": np.mean(p0, axis=0).tolist(),
            "centerEnd": np.mean(p1, axis=0).tolist(),
            "translationAxis": [round(float(value), 14) for value in direction_axis],
            # Canonical metadata is shared with the browser compiler.  Round
            # this derived unit vector at a scale far below float32 geometry
            # precision so NumPy/libm and JavaScript sqrt last-bit differences
            # cannot perturb the program content hash.
            "rotationAxis": [round(float(value), 14) for value in rotation_axis],
            "translationAmplitude": translation_amplitude,
            "rotationRadians": rotation_radians,
            "window": list(windows["anticipation"]),
        },
    }
    return _make_program(
        program_id=program_id,
        header=header,
        routing_graph=routing_graph,
        bridge_tracks=bridge_tracks,
        group_tracks=group_tracks,
        per_id=per_id,
        source_entry=source_entry,
        target_entry=target_entry,
        source_records_hash=source_records_hash,
        target_records_hash=target_records_hash,
        profile=profile,
        request=request,
    )


def encode_program(program: TransitionProgram) -> dict[str, Any]:
    """Encode metadata + two raw buffers without base64 expansion."""

    metadata = program.metadata()
    group_payload = program.group_tracks.tobytes(order="C")
    per_payload = program.per_id.tobytes(order="C")
    if sha256_bytes(group_payload) != metadata["hashes"]["groupTracksSha256"]:
        raise ValueError("group track hash changed before encode")
    if sha256_bytes(per_payload) != metadata["hashes"]["perIdSha256"]:
        raise ValueError("per-ID hash changed before encode")
    return {
        "metadata": metadata,
        "metadataBytes": stable_json_bytes(metadata),
        "groupTracks": group_payload,
        "perId": per_payload,
    }


def decode_program(
    metadata_or_encoded: Mapping[str, Any] | bytes,
    group_bytes: bytes | None = None,
    per_id_bytes: bytes | None = None,
) -> TransitionProgram:
    """Decode either ``encode_program`` output or explicit metadata/buffers."""

    if isinstance(metadata_or_encoded, (bytes, bytearray, memoryview)):
        metadata = json.loads(bytes(metadata_or_encoded).decode("utf-8"))
    elif "metadata" in metadata_or_encoded and group_bytes is None and per_id_bytes is None:
        metadata = dict(metadata_or_encoded["metadata"])
        group_bytes = bytes(metadata_or_encoded["groupTracks"])
        per_id_bytes = bytes(metadata_or_encoded["perId"])
    else:
        metadata = dict(metadata_or_encoded)
    if group_bytes is None or per_id_bytes is None:
        raise ValueError("decode_program requires group and per-ID payloads")
    if metadata.get("schemaVersion") != TRANSITION_PROGRAM_SCHEMA_VERSION:
        raise ValueError("unsupported TransitionProgram schemaVersion")
    if metadata.get("programVersion") != TRANSITION_PROGRAM_VERSION:
        raise ValueError("unsupported TransitionProgram programVersion")
    if metadata.get("identitySpaceVersion") != IDENTITY_SPACE_VERSION:
        raise ValueError("TransitionProgram identity space mismatch")
    group_meta = metadata["buffers"]["groupTracks"]
    per_meta = metadata["buffers"]["perId"]
    groups = decode_records(group_bytes, GROUP_TRACK_DTYPE, int(group_meta["recordCount"]))
    per_id = decode_records(per_id_bytes, PER_ID_DTYPE, int(per_meta["recordCount"]))
    if len(group_bytes) != int(group_meta["byteLength"]) or len(per_id_bytes) != int(per_meta["byteLength"]):
        raise ValueError("TransitionProgram buffer byteLength mismatch")
    if sha256_bytes(group_bytes) != metadata["hashes"]["groupTracksSha256"]:
        raise ValueError("TransitionProgram group hash mismatch")
    if sha256_bytes(per_id_bytes) != metadata["hashes"]["perIdSha256"]:
        raise ValueError("TransitionProgram per-ID hash mismatch")
    program = TransitionProgram(
        program_id=metadata["programId"],
        header=dict(metadata["header"]),
        routing_graph=tuple(dict(item) for item in metadata["routingGraph"]),
        bridge_tracks=tuple(dict(item) for item in metadata["bridgeTracks"]),
        group_tracks=groups,
        per_id=per_id,
        hashes=dict(metadata["hashes"]),
        provenance=dict(metadata["provenance"]),
    )
    expected = program.hashes["contentSha256"]
    actual = _with_content_hash(
        TransitionProgram(
            program_id=program.program_id,
            header=program.header,
            routing_graph=program.routing_graph,
            bridge_tracks=program.bridge_tracks,
            group_tracks=program.group_tracks,
            per_id=program.per_id,
            hashes={**program.hashes, "contentSha256": ""},
            provenance=program.provenance,
        )
    ).hashes["contentSha256"]
    if actual != expected:
        raise ValueError("TransitionProgram deterministic content hash mismatch")
    return program


def program_to_json(program: TransitionProgram) -> dict[str, Any]:
    """JSON-serializable manifest; raw compact tracks stay separate."""

    return program.metadata()
