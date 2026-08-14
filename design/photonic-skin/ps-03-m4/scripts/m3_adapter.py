"""Read-only adapter for frozen PS-03.M3 manifests and state buffers."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

import numpy as np

try:  # direct script/test imports and package-style imports are both supported
    from contracts import (
        IDENTITY_COUNT,
        IDENTITY_SPACE_VERSION,
        M3_BUILD_CONFIG_HASH,
        M3_DETERMINISTIC_FINGERPRINT,
        M3_IDENTITY_MANIFEST_PATH,
        M3_MANIFEST_PATH,
        M3_PUBLIC_DIR,
        M3_STATE_COUNT,
        M3_STATE_STRIDE,
        STATE_DTYPE,
        STATUS_ACTIVE,
        canonical_hash,
        decode_records,
        read_json,
        sha256_bytes,
    )
except ImportError:  # pragma: no cover - package import path
    from .contracts import (
        IDENTITY_COUNT,
        IDENTITY_SPACE_VERSION,
        M3_BUILD_CONFIG_HASH,
        M3_DETERMINISTIC_FINGERPRINT,
        M3_IDENTITY_MANIFEST_PATH,
        M3_MANIFEST_PATH,
        M3_PUBLIC_DIR,
        M3_STATE_COUNT,
        M3_STATE_STRIDE,
        STATE_DTYPE,
        STATUS_ACTIVE,
        canonical_hash,
        decode_records,
        read_json,
        sha256_bytes,
    )


def _normalise(values: np.ndarray, fallback: tuple[float, ...]) -> np.ndarray:
    result = np.asarray(values, dtype=np.float64)
    lengths = np.linalg.norm(result, axis=-1, keepdims=True)
    weak = lengths[..., 0] < 1e-12
    result = result / np.maximum(lengths, 1e-12)
    if np.any(weak):
        result[weak] = np.asarray(fallback, dtype=np.float64)
    return result


def decode_normals(records: np.ndarray | Mapping[str, Any]) -> np.ndarray:
    values = records["normal"]
    array = np.asarray(values)
    if np.issubdtype(array.dtype, np.integer):
        array = array.astype(np.float64) / 32767.0
    return _normalise(array, (0.0, 0.0, 1.0))


def decode_orientations(records: np.ndarray | Mapping[str, Any]) -> np.ndarray:
    values = records["orientation"]
    array = np.asarray(values)
    if np.issubdtype(array.dtype, np.integer):
        array = array.astype(np.float64) / 32767.0
    return _normalise(array, (0.0, 0.0, 0.0, 1.0))


def load_m3_manifest(path: str | Path = M3_MANIFEST_PATH) -> dict[str, Any]:
    return read_json(path)


def validate_m3_baseline(
    manifest: Mapping[str, Any] | None = None,
    *,
    strict: bool = True,
    verify_state_buffers: bool = False,
) -> dict[str, Any]:
    """Validate the frozen identity/version/stride/hash guard used by M4.

    ``verify_state_buffers`` is opt-in because checking all 154 buffers is an
    audit/build operation, not a normal on-demand compile operation.
    """

    value = dict(manifest or load_m3_manifest())
    identity = value.get("identitySpace", {})
    layout = value.get("stateRecordLayout", {})
    problems: list[str] = []
    checks = {
        "identitySpaceVersion": identity.get("identitySpaceVersion") == IDENTITY_SPACE_VERSION,
        "identityCount": identity.get("size") == IDENTITY_COUNT,
        "idRange": identity.get("idRange") == [0, IDENTITY_COUNT - 1],
        "stateCount": value.get("stateCount") == M3_STATE_COUNT and len(value.get("states", [])) == M3_STATE_COUNT,
        "stateStride": layout.get("stride") == M3_STATE_STRIDE == STATE_DTYPE.itemsize,
        "endianness": layout.get("endianness") == "little",
        "deterministicFingerprint": value.get("deterministicFingerprint") == M3_DETERMINISTIC_FINGERPRINT,
        "buildConfigHash": value.get("buildConfigHash") == M3_BUILD_CONFIG_HASH,
    }
    for name, passed in checks.items():
        if not passed:
            problems.append(f"frozen M3 guard failed: {name}")

    verified_buffers = 0
    if verify_state_buffers and not problems:
        for entry in value["states"]:
            path = resolve_state_buffer_path(entry)
            if not path.is_file():
                problems.append(f"missing M3 state buffer: {path}")
                continue
            payload = path.read_bytes()
            if len(payload) != int(entry["bufferBytes"]):
                problems.append(f"M3 buffer byte size changed: {entry['stateId']}")
                continue
            if sha256_bytes(payload) != entry["contentHash"]:
                problems.append(f"M3 buffer hash changed: {entry['stateId']}")
                continue
            verified_buffers += 1

    identity_manifest = read_json(M3_IDENTITY_MANIFEST_PATH)
    if identity_manifest.get("identitySpaceVersion") != IDENTITY_SPACE_VERSION:
        problems.append("M3 identity manifest version mismatch")
    if identity_manifest.get("size") != IDENTITY_COUNT:
        problems.append("M3 identity manifest size mismatch")

    report = {
        "valid": not problems,
        "problems": problems,
        "checks": checks,
        "verifiedStateBufferCount": verified_buffers,
        "identitySpaceVersion": identity.get("identitySpaceVersion"),
        "identityCount": identity.get("size"),
        "stateCount": value.get("stateCount"),
        "stateStride": layout.get("stride"),
        "deterministicFingerprint": value.get("deterministicFingerprint"),
        "buildConfigHash": value.get("buildConfigHash"),
    }
    if strict and problems:
        raise ValueError("; ".join(problems))
    return report


def find_state_entry(state_id: str, manifest: Mapping[str, Any] | None = None) -> dict[str, Any]:
    value = manifest or load_m3_manifest()
    for entry in value.get("states", []):
        if entry.get("stateId") == state_id:
            return dict(entry)
    raise KeyError(f"unknown frozen M3 stateId: {state_id}")


def resolve_state_buffer_path(entry: Mapping[str, Any]) -> Path:
    path = Path(str(entry["bufferPath"]))
    if path.is_absolute():
        return path
    return M3_PUBLIC_DIR / path


def decode_state_buffer(payload: bytes, expected_count: int | None = None) -> np.ndarray:
    return decode_records(payload, STATE_DTYPE, expected_count)


def _synthetic_entry(path: Path, payload: bytes, records: np.ndarray) -> dict[str, Any]:
    active = records[records["status"] == STATUS_ACTIVE]
    shell_count = len(np.unique(active["shell"])) if len(active) else 0
    return {
        "stateId": path.name.removesuffix(".state.bin"),
        "contentHash": sha256_bytes(payload),
        "bufferPath": path.as_posix(),
        "bufferBytes": len(payload),
        "recordCount": len(records),
        "recordStride": STATE_DTYPE.itemsize,
        "shellCount": int(shell_count),
        "componentCount": int(len(np.unique(active["component"]))) if len(active) else 0,
        "stateRole": "transient",
        "compositionMode": "TRANSIENT",
    }


def load_m3_state(
    entry_or_id_or_path: Mapping[str, Any] | str | Path,
    manifest: Mapping[str, Any] | None = None,
    *,
    verify_hash: bool = True,
) -> tuple[dict[str, Any], np.ndarray]:
    """Return ``(manifest_entry, copied_records)`` for a frozen M3 state."""

    if isinstance(entry_or_id_or_path, Mapping):
        entry = dict(entry_or_id_or_path)
        path = resolve_state_buffer_path(entry)
    else:
        candidate = Path(entry_or_id_or_path)
        if candidate.is_file() or candidate.suffix == ".bin":
            path = candidate
            entry = {}
        else:
            entry = find_state_entry(str(entry_or_id_or_path), manifest)
            path = resolve_state_buffer_path(entry)

    payload = path.read_bytes()
    expected_count = int(entry["recordCount"]) if entry else None
    records = decode_state_buffer(payload, expected_count)
    if entry:
        if int(entry.get("recordStride", STATE_DTYPE.itemsize)) != STATE_DTYPE.itemsize:
            raise ValueError(f"unexpected M3 stride for {entry.get('stateId')}")
        if verify_hash and sha256_bytes(payload) != entry.get("contentHash"):
            raise ValueError(f"frozen M3 content hash mismatch for {entry.get('stateId')}")
    else:
        entry = _synthetic_entry(path, payload, records)
    return entry, records


def load_m3_records(
    entry_or_id_or_path: Mapping[str, Any] | str | Path,
    manifest: Mapping[str, Any] | None = None,
    *,
    verify_hash: bool = True,
) -> np.ndarray:
    return load_m3_state(entry_or_id_or_path, manifest, verify_hash=verify_hash)[1]


def _array_hash_parts(snapshot: Mapping[str, Any]) -> str:
    digest = hashlib_sha256()
    for name in (
        "position",
        "velocity",
        "normal",
        "orientation",
        "scale",
        "scaleVelocity",
        "status",
        "flags",
        "component",
        "shell",
        "transitionGroup",
        "reserveDepth",
        "activation",
        "bridge",
        "role",
    ):
        if name not in snapshot:
            continue
        value = np.ascontiguousarray(snapshot[name])
        digest.update(name.encode("ascii"))
        digest.update(value.dtype.str.encode("ascii"))
        digest.update(np.asarray(value.shape, dtype="<u8").tobytes())
        digest.update(value.tobytes())
    digest.update(canonical_hash(snapshot.get("actorPose", {})).encode("ascii"))
    return digest.hexdigest()


def hashlib_sha256():
    """Small indirection kept local so snapshot hashing stays streaming."""

    import hashlib

    return hashlib.sha256()


def validate_runtime_snapshot(snapshot: Mapping[str, Any], expected_count: int | None = None) -> list[str]:
    problems: list[str] = []
    required = ("position", "velocity", "normal", "orientation", "scale")
    for name in required:
        if name not in snapshot:
            problems.append(f"snapshot missing {name}")
    if problems:
        return problems
    count = len(np.asarray(snapshot["position"]))
    if expected_count is not None and count != expected_count:
        problems.append(f"snapshot record count {count} != {expected_count}")
    shapes = {
        "position": (count, 3),
        "velocity": (count, 3),
        "normal": (count, 3),
        "orientation": (count, 4),
        "scale": (count,),
    }
    for name, shape in shapes.items():
        array = np.asarray(snapshot[name])
        if array.shape != shape:
            problems.append(f"snapshot {name} shape {array.shape} != {shape}")
        elif not np.isfinite(array).all():
            problems.append(f"snapshot {name} contains NaN/Inf")
    for name, shape in (("activation", (count,)), ("bridge", (count,)), ("role", (count, 3))):
        if name not in snapshot:
            continue
        array = np.asarray(snapshot[name])
        if array.shape != shape:
            problems.append(f"snapshot {name} shape {array.shape} != {shape}")
        elif not np.isfinite(array).all():
            problems.append(f"snapshot {name} contains NaN/Inf")
    if "role" in snapshot:
        role = np.asarray(snapshot["role"], dtype=np.float64)
        if role.shape == (count, 3) and (
            np.any(role < -1e-9)
            or np.any(role > 1.0 + 1e-9)
            or np.max(np.abs(np.sum(role, axis=1) - 1.0)) > 1e-7
        ):
            problems.append("snapshot role weights must be finite normalized active/reserve/bridge weights")
    return problems


def snapshot_from_evaluation(
    evaluation: Mapping[str, Any],
    context_records: np.ndarray | Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Create a finite transient retarget source without exporting a new state."""

    position = np.asarray(evaluation["position"], dtype=np.float64).copy()
    count = len(position)
    context = context_records if context_records is not None else evaluation

    def context_value(name: str, default: Any, dtype: Any) -> np.ndarray:
        # Evaluated context is instantaneous and therefore wins. Frozen endpoint
        # records are only a fallback for channels an evaluator did not expose.
        if name in evaluation:
            value = evaluation[name]
        elif isinstance(context, Mapping):
            value = context.get(name, default)
        elif getattr(context.dtype, "names", None) and name in context.dtype.names:
            value = context[name]
        else:
            value = default
        array = np.asarray(value, dtype=dtype)
        if array.ndim == 0:
            array = np.full(count, array, dtype=dtype)
        return array.copy()

    activation = np.asarray(
        evaluation.get("activation", np.ones(count, dtype=np.float64)), dtype=np.float64
    ).copy()
    bridge = np.asarray(
        evaluation.get("bridge", evaluation.get("bridgeWeight", np.zeros(count))), dtype=np.float64
    ).copy()
    role = np.asarray(
        evaluation.get(
            "role",
            np.column_stack((activation * (1.0 - bridge), (1.0 - activation) * (1.0 - bridge), bridge)),
        ),
        dtype=np.float64,
    ).copy()
    blended_status = context_value("status", np.zeros(count), np.float64)
    inactive_code = np.where(np.rint(blended_status).astype(np.uint8) == 2, 2, 1).astype(np.uint8)
    instantaneous_status = np.where(activation >= 0.5, STATUS_ACTIVE, inactive_code).astype(np.uint8)
    snapshot: dict[str, Any] = {
        "position": position,
        "velocity": np.asarray(evaluation["velocity"], dtype=np.float64).copy(),
        "normal": np.asarray(evaluation["normal"], dtype=np.float64).copy(),
        "orientation": np.asarray(evaluation["orientation"], dtype=np.float64).copy(),
        "scale": np.asarray(evaluation["scale"], dtype=np.float64).copy(),
        "scaleVelocity": np.asarray(evaluation.get("scaleVelocity", np.zeros(count)), dtype=np.float64).copy(),
        "status": instantaneous_status,
        "flags": context_value("flags", np.zeros(count), np.uint8),
        "component": context_value("component", np.zeros(count), np.uint8),
        "shell": context_value("shell", np.zeros(count), np.uint8),
        "transitionGroup": context_value("transitionGroup", np.zeros(count), np.uint8),
        "reserveDepth": context_value("reserveDepth", np.zeros(count), np.float64),
        "activation": activation,
        "bridge": bridge,
        "role": role,
        "actorPose": dict(evaluation.get("actorPose", {})),
    }
    problems = validate_runtime_snapshot(snapshot, count)
    if problems:
        raise ValueError(f"invalid runtime snapshot: {problems}")
    snapshot["snapshotHash"] = _array_hash_parts(snapshot)
    return snapshot


def snapshot_descriptor(
    snapshot: Mapping[str, Any],
    *,
    source_program_hash: str | None = None,
    captured_progress: float | None = None,
    generation: int = 0,
) -> dict[str, Any]:
    problems = validate_runtime_snapshot(snapshot)
    if problems:
        raise ValueError(f"invalid runtime snapshot: {problems}")
    result: dict[str, Any] = {
        "snapshotHash": str(snapshot.get("snapshotHash") or _array_hash_parts(snapshot)),
        "recordCount": len(np.asarray(snapshot["position"])),
        "generation": int(generation),
    }
    if source_program_hash is not None:
        result["sourceProgramHash"] = source_program_hash
    if captured_progress is not None:
        result["capturedProgress"] = float(captured_progress)
    return result


def snapshot_entry(snapshot: Mapping[str, Any]) -> dict[str, Any]:
    descriptor = snapshot_descriptor(snapshot)
    shell = np.asarray(snapshot.get("shell", np.zeros(descriptor["recordCount"])), dtype=np.uint8)
    status = np.asarray(snapshot.get("status", np.zeros(descriptor["recordCount"])), dtype=np.uint8)
    active = status == STATUS_ACTIVE
    return {
        "stateId": f"snapshot-{descriptor['snapshotHash'][:16]}",
        "contentHash": descriptor["snapshotHash"],
        "recordCount": descriptor["recordCount"],
        "recordStride": 0,
        "shellCount": int(len(np.unique(shell[active]))) if np.any(active) else 0,
        "componentCount": int(len(np.unique(np.asarray(snapshot.get("component", shell))[active]))) if np.any(active) else 0,
        "stateRole": "transient",
        "compositionMode": "TRANSIENT",
    }
