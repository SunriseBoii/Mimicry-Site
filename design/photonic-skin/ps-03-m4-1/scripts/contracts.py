"""PS-03.M4.1 contracts, deterministic JSON and compact runtime layouts.

This module deliberately duplicates only the *binary contract* of frozen M3.
It never imports the M3 builder and never mutates M3 or public artifacts.
All algorithms consuming these contracts must remain target and pair agnostic.
"""

from __future__ import annotations

from dataclasses import asdict, is_dataclass
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping

import numpy as np


MOTION_PROFILE_SCHEMA_VERSION = "1.0.0"
TRANSITION_REQUEST_SCHEMA_VERSION = "1.0.0"
TRANSITION_PROGRAM_SCHEMA_VERSION = "1.1.0"
TRANSITION_PROGRAM_VERSION = "2.1.0"
COMPILER_VERSION = "ps03m41-transition-compiler-v2.1"
IDENTITY_SPACE_VERSION = "ps03m3-identity-v1"
IDENTITY_COUNT = 16_384
M3_STATE_COUNT = 154
M3_STATE_STRIDE = 40
M3_ENDPOINT_STAGE = "PS-03.M3.1R"
M3_ENDPOINT_VERSION = "3.1.1"
M3_DETERMINISTIC_FINGERPRINT = (
    "0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2"
)
M3_MANIFEST_SHA256 = (
    "530ca41e0faecf291ea9f674a7e383ae8739af0bddad578a765a7c264129ea82"
)
M3_BUILD_CONFIG_HASH = (
    "7478c81082666451d9592efa13769709af4f9dd2ce5df54c7b0c509682ab720a"
)

M4_DIR = Path(__file__).resolve().parents[1]
M3_DIR = M4_DIR.parent / "ps-03-m3-1r"
REPO_DIR = M4_DIR.parents[2]
PUBLIC_DIR = REPO_DIR / "public" / "photonic-skin" / "ps-03-m4-1"
M3_PUBLIC_DIR = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1r"
SCHEMA_DIR = M4_DIR / "schemas"
PROFILE_DIR = M4_DIR / "motion-profiles"
PROGRAM_DIR = M4_DIR / "programs"
REPORT_DIR = M4_DIR / "reports"
M3_EXPORT_DIR = M3_DIR / "exports"
M3_MANIFEST_PATH = M3_EXPORT_DIR / "ps03m31r-manifest.json"
M3_IDENTITY_MANIFEST_PATH = M3_MANIFEST_PATH
MOTION_PROFILE_PATH = PROFILE_DIR / "directed-plastic-release.profile.json"


# Frozen M3 state records. Explicit offsets make accidental native alignment
# impossible and are also the authoritative decoder contract for the browser.
STATE_DTYPE = np.dtype(
    {
        "names": [
            "position",
            "normal",
            "orientation",
            "scale",
            "reserveDepth",
            "component",
            "shell",
            "status",
            "flags",
            "density",
            "transitionGroup",
            "lodPriority",
            "_padding",
        ],
        "formats": [
            ("<f4", (3,)),
            ("<i2", (3,)),
            ("<i2", (4,)),
            "<f2",
            "<f2",
            "u1",
            "u1",
            "u1",
            "u1",
            "u1",
            "u1",
            "<u2",
            ("u1", (2,)),
        ],
        "offsets": [0, 12, 18, 26, 28, 30, 31, 32, 33, 34, 35, 36, 38],
        "itemsize": 40,
    }
)


# One 64-byte record per source/target (transitionGroup, shell) macro pair.
GROUP_TRACK_DTYPE = np.dtype(
    {
        "names": [
            "sourceCenter",
            "targetCenter",
            "routeControl",
            "direction",
            "releaseStart",
            "releaseEnd",
            "revealStart",
            "revealEnd",
            "bridgeStart",
            "bridgeEnd",
            "sourceMacro",
            "targetMacro",
            "flags",
            "memberCount",
            "_padding",
        ],
        "formats": [
            ("<f4", (3,)),
            ("<f4", (3,)),
            ("<f4", (3,)),
            ("<f2", (3,)),
            "<f2",
            "<f2",
            "<f2",
            "<f2",
            "<f2",
            "<f2",
            "<u2",
            "<u2",
            "<u2",
            "<u2",
            ("u1", (2,)),
        ],
        "offsets": [0, 12, 24, 36, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62],
        "itemsize": 64,
    }
)


# One 32-byte record per persistent ID. Endpoint positions/orientations/scales
# remain in frozen M3 buffers; these values contain only local hierarchy data,
# small residuals and continuous role windows.
PER_ID_DTYPE = np.dtype(
    {
        "names": [
            "localSource",
            "localTarget",
            "residual",
            "depth",
            "activationStart",
            "activationEnd",
            "scaleBias",
            "groupIndex",
            "flags",
            "phaseOffset",
            "_padding",
        ],
        "formats": [
            ("<f2", (3,)),
            ("<f2", (3,)),
            ("<f2", (3,)),
            "<f2",
            "<f2",
            "<f2",
            "<f2",
            "<u2",
            "<u2",
            "u1",
            "u1",
        ],
        "offsets": [0, 6, 12, 18, 20, 22, 24, 26, 28, 30, 31],
        "itemsize": 32,
    }
)


STATUS_ACTIVE = 0
STATUS_RESERVE = 1
STATUS_SUBSURFACE = 2
STATE_FLAG_FEATURE = 1
STATE_FLAG_SILHOUETTE = 2
STATE_FLAG_DENSITY = 4

GROUP_FLAG_SPLIT = 1 << 0
GROUP_FLAG_MERGE = 1 << 1
GROUP_FLAG_REGROUP = 1 << 2
GROUP_FLAG_PROTECTED = 1 << 3
GROUP_FLAG_BRIDGE = 1 << 4

PER_ID_FLAG_EMERGENCE = 1 << 0
PER_ID_FLAG_IMMERSION = 1 << 1
PER_ID_FLAG_BRIDGE = 1 << 2
PER_ID_FLAG_PROTECTED = 1 << 3
PER_ID_FLAG_SHELL_CHANGE = 1 << 4
PER_ID_FLAG_SOURCE_ACTIVE = 1 << 5
PER_ID_FLAG_TARGET_ACTIVE = 1 << 6
PER_ID_FLAG_SUBSURFACE = 1 << 7

TRIGGER_MODES = ("route", "lab-scroll-scrub", "preview", "qa")
VIEWPORT_PROFILES = ("desktop", "mobile")


def _jsonable(value: Any) -> Any:
    if is_dataclass(value):
        value = asdict(value)
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, Path):
        return value.as_posix()
    if isinstance(value, Mapping):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value


def stable_json_bytes(value: Any) -> bytes:
    """Canonical UTF-8 JSON used by every M4 content hash."""

    return (
        json.dumps(
            _jsonable(value),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")


def pretty_json_bytes(value: Any) -> bytes:
    return (
        json.dumps(
            _jsonable(value),
            ensure_ascii=False,
            sort_keys=True,
            indent=2,
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")


def read_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_bytes_if_changed(path: str | Path, payload: bytes) -> None:
    resolved = Path(path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    if resolved.exists() and resolved.read_bytes() == payload:
        return
    resolved.write_bytes(payload)


def write_json(path: str | Path, value: Any, *, pretty: bool = True) -> None:
    payload = pretty_json_bytes(value) if pretty else stable_json_bytes(value)
    write_bytes_if_changed(path, payload)


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: str | Path) -> str:
    return sha256_bytes(Path(path).read_bytes())


def canonical_hash(value: Any) -> str:
    return sha256_bytes(stable_json_bytes(value))


def dtype_layout(dtype: np.dtype) -> dict[str, Any]:
    """Return browser-readable offsets for a structured little-endian dtype."""

    fields: list[dict[str, Any]] = []
    for name in dtype.names or ():
        field_dtype, offset = dtype.fields[name][:2]
        components = 1
        scalar = field_dtype
        if field_dtype.subdtype is not None:
            scalar, shape = field_dtype.subdtype
            components = int(np.prod(shape, dtype=np.int64))
        fields.append(
            {
                "name": name,
                "offset": int(offset),
                "dtype": scalar.str,
                "components": components,
            }
        )
    return {"recordStride": int(dtype.itemsize), "fields": fields}


def runtime_byte_layout() -> dict[str, Any]:
    return {
        "endianness": "little",
        "groupTracks": dtype_layout(GROUP_TRACK_DTYPE),
        "perId": dtype_layout(PER_ID_DTYPE),
    }


def decode_records(payload: bytes, dtype: np.dtype, expected_count: int | None = None) -> np.ndarray:
    if len(payload) % dtype.itemsize:
        raise ValueError(f"payload size {len(payload)} is not divisible by stride {dtype.itemsize}")
    records = np.frombuffer(payload, dtype=dtype)
    if expected_count is not None and len(records) != expected_count:
        raise ValueError(f"record count {len(records)} != {expected_count}")
    return records.copy()


def validate_motion_profile(profile: Mapping[str, Any]) -> list[str]:
    required = {
        "schemaVersion",
        "profileId",
        "profileVersion",
        "triggerMode",
        "timingPolicy",
        "phasePolicy",
        "globalPosePolicy",
        "groupCoherencePolicy",
        "routeFieldPolicy",
        "splitMergePolicy",
        "reserveTransportPolicy",
        "featureProtectionPolicy",
        "orientationPolicy",
        "scalePolicy",
        "settlePolicy",
        "productionScrollPolicy",
        "retargetPolicy",
        "lodPolicy",
        "reducedMotionPolicy",
        "validationPolicy",
        "provenance",
    }
    problems: list[str] = []
    missing = sorted(required - set(profile))
    if missing:
        problems.append(f"missing fields: {missing}")
    if profile.get("schemaVersion") != MOTION_PROFILE_SCHEMA_VERSION:
        problems.append("unsupported motion profile schemaVersion")
    if profile.get("profileId") != "directed-plastic-release":
        problems.append("unsupported motion profileId")
    supported = profile.get("triggerMode", {}).get("supported", [])
    if tuple(supported) != TRIGGER_MODES:
        problems.append("motion profile must support route/lab-scroll-scrub/preview/qa in canonical order")
    phase = profile.get("phasePolicy", {})
    if phase.get("basis") != "quintic-c2-window-v1":
        problems.append("phase windows must use the quintic C2 basis")
    return problems


def validate_transition_request(
    request: Mapping[str, Any], profile: Mapping[str, Any] | None = None
) -> list[str]:
    problems: list[str] = []
    if request.get("schemaVersion") != TRANSITION_REQUEST_SCHEMA_VERSION:
        problems.append("unsupported transition request schemaVersion")
    has_state = isinstance(request.get("sourceStateId"), str) and bool(request.get("sourceStateId"))
    has_snapshot = isinstance(request.get("sourceSnapshot"), Mapping)
    if has_state == has_snapshot:
        problems.append("exactly one of sourceStateId/sourceSnapshot is required")
    if not isinstance(request.get("targetStateId"), str) or not request.get("targetStateId"):
        problems.append("targetStateId is required")
    if request.get("identitySpaceVersion") != IDENTITY_SPACE_VERSION:
        problems.append("identitySpaceVersion does not match frozen M3")
    if request.get("motionProfileId") != "directed-plastic-release":
        problems.append("unsupported motionProfileId")
    if request.get("triggerMode") not in TRIGGER_MODES:
        problems.append("invalid triggerMode")
    if request.get("viewportProfile") not in VIEWPORT_PROFILES:
        problems.append("invalid viewportProfile")
    intent = request.get("directionIntent")
    if intent != "auto":
        try:
            direction = np.asarray(intent, dtype=np.float64)
        except (TypeError, ValueError):
            direction = np.empty(0)
        if direction.shape != (3,) or not np.isfinite(direction).all():
            problems.append("directionIntent must be 'auto' or a finite vec3")
    seed = request.get("deterministicSeed")
    if not isinstance(seed, int) or isinstance(seed, bool) or not 0 <= seed <= 0xFFFFFFFF:
        problems.append("deterministicSeed must be uint32")
    probe_count = request.get("probeIdentityCount")
    if probe_count is not None and (
        not isinstance(probe_count, int) or isinstance(probe_count, bool) or not 1 <= probe_count <= IDENTITY_COUNT
    ):
        problems.append("probeIdentityCount must be in 1..16384")
    duration = request.get("durationOverride")
    if duration is not None:
        bounds = (profile or {}).get("timingPolicy", {}).get("durationBoundsSeconds", [0.18, 1.35])
        if not isinstance(duration, (int, float)) or isinstance(duration, bool) or not bounds[0] <= duration <= bounds[1]:
            problems.append(f"durationOverride must be in {bounds}")
    return problems


def load_motion_profile(path: str | Path = MOTION_PROFILE_PATH) -> dict[str, Any]:
    profile = read_json(path)
    problems = validate_motion_profile(profile)
    if problems:
        raise ValueError(f"invalid motion profile: {problems}")
    return profile


if STATE_DTYPE.itemsize != 40 or GROUP_TRACK_DTYPE.itemsize != 64 or PER_ID_DTYPE.itemsize != 32:
    raise RuntimeError("PS-03 binary dtype stride invariant failed")
