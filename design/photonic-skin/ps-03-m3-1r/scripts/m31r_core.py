"""Shared rigid Event-orientation helpers for PS-03.M3.1R."""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
from scipy.spatial import cKDTree


SCRIPT_DIR = Path(__file__).resolve().parent
M31R_DIR = SCRIPT_DIR.parent
PHOTONIC_DIR = M31R_DIR.parent
REPO_DIR = PHOTONIC_DIR.parents[1]
M31_DIR = PHOTONIC_DIR / "ps-03-m3-1"
M3_DIR = PHOTONIC_DIR / "ps-03-m3"
PUBLIC_M31 = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1"
PUBLIC_M31R = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1r"
BASELINE_MANIFEST_PATH = M31_DIR / "exports" / "ps03m31-manifest.json"
ORIENTATION_CONTRACT_PATH = M31R_DIR / "descriptors" / "orientation-contract.json"
BASELINE_DESCRIPTOR_PATH = M31_DIR / "descriptors" / "presentation-descriptors.json"
STATE_DTYPE = np.dtype([
    ("position", "<f4", (3,)),
    ("normal", "<i2", (3,)),
    ("orientation", "<i2", (4,)),
    ("scale", "<f2"),
    ("reserveDepth", "<f2"),
    ("component", "u1"),
    ("shell", "u1"),
    ("status", "u1"),
    ("flags", "u1"),
    ("density", "u1"),
    ("transitionGroup", "u1"),
    ("lodPriority", "<u2"),
    ("_padding", "u1", (2,)),
])
CAMERAS = {
    "canonical": [2.8, -7.8, 4.6],
    "alternate": [5.6, -6.4, 4.1],
    "side": [8.8, 0.0, 1.4],
    "top": [0.01, -0.01, 9.4],
}


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


M3_SCRIPTS = M3_DIR / "scripts"
if str(M3_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(M3_SCRIPTS))
import state_builder as m3  # noqa: E402

baseline_qa = _load_module("ps03m31_baseline_qa", M31_DIR / "scripts" / "presentation_qa.py")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def stable_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def pretty_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n").encode("utf-8")


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == payload:
        return
    path.write_bytes(payload)


def write_json(path: Path, value: Any) -> None:
    write_bytes(path, pretty_json_bytes(value))


def rotation_z(yaw_degrees: float) -> np.ndarray:
    angle = np.radians(float(yaw_degrees))
    cosine, sine = np.cos(angle), np.sin(angle)
    return np.asarray([[cosine, -sine, 0.0], [sine, cosine, 0.0], [0.0, 0.0, 1.0]], dtype=np.float64)


def unit(value: np.ndarray) -> np.ndarray:
    return value / max(float(np.linalg.norm(value)), 1e-12)


def camera_basis(camera_position: list[float]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    camera = np.asarray(camera_position, dtype=np.float64)
    forward = unit(-camera)
    right = unit(np.cross(forward, np.asarray([0.0, 0.0, 1.0])))
    up = unit(np.cross(right, forward))
    return right, up, forward


def event_component_indices(entry: dict) -> set[int]:
    return {
        int(component["componentIndex"])
        for component in entry["componentMap"]
        if component["competencyId"] == "event"
    }


def event_pivot(definition: dict) -> np.ndarray:
    translations = {
        tuple(float(value) for value in selection["canonicalTransform"]["translate"])
        for selection in definition["componentSelections"]
        if selection["targetId"].startswith("event")
    }
    if len(translations) != 1:
        raise ValueError(f"Event is not a rigid group in {definition['stateId']}: {translations}")
    return np.asarray(next(iter(translations)), dtype=np.float64)


def patch_definition(definition: dict, yaw_degrees: float, *, event_present: bool, translation: list[float] | None = None) -> dict:
    result = copy.deepcopy(definition)
    result["stateVersion"] = "3.1.1"
    provenance = dict(result.get("provenance", {}))
    provenance.update({
        "stage": "PS-03.M3.1R",
        "builder": "ps03m31r-presentation-builder-v1",
        "baselineStage": "PS-03.M3.1",
        "baselineStateVersion": "3.1.0",
        "orientationPatch": "event-rigid-yaw" if event_present else "none-buffer-preserved",
    })
    result["provenance"] = provenance
    if event_present:
        offset = np.asarray(translation or [0.0, 0.0, 0.0], dtype=np.float64)
        for selection in result["componentSelections"]:
            if selection["targetId"].startswith("event"):
                selection["canonicalTransform"]["rotateEulerDegrees"] = [0.0, 0.0, float(yaw_degrees)]
                original = np.asarray(selection["canonicalTransform"]["translate"], dtype=np.float64)
                selection["canonicalTransform"]["translate"] = [float(value) for value in original + offset]
    return result


def transform_event_records(records: np.ndarray, entry: dict, definition: dict, yaw_degrees: float, translation: list[float] | None = None) -> np.ndarray:
    result = records.copy()
    indices = event_component_indices(entry)
    if not indices:
        return result
    pivot = event_pivot(definition)
    active = (result["status"] == m3.STATUS_ACTIVE) & np.isin(result["component"], list(indices))
    rotation = rotation_z(yaw_degrees)
    positions = result["position"][active].astype(np.float64)
    normals = result["normal"][active].astype(np.float64) / 32767.0
    offset = np.asarray(translation or [0.0, 0.0, 0.0], dtype=np.float64)
    rotated_positions = (positions - pivot) @ rotation.T + pivot + offset
    rotated_normals = normals @ rotation.T
    rotated_normals /= np.maximum(np.linalg.norm(rotated_normals, axis=1, keepdims=True), 1e-12)
    result["position"][active] = rotated_positions.astype(np.float32)
    result["normal"][active] = np.round(np.clip(rotated_normals, -1, 1) * 32767).astype(np.int16)
    orientation = m3._quaternion_from_z(rotated_normals)  # type: ignore[attr-defined]
    result["orientation"][active] = np.round(np.clip(orientation, -1, 1) * 32767).astype(np.int16)
    return result


def presentation_frame(records: np.ndarray, fov_degrees: float = 33.0) -> dict:
    active = records[records["status"] == m3.STATUS_ACTIVE]
    points = active["position"].astype(np.float64)
    center = points.mean(axis=0)
    centered = points - center
    tan_half = np.tan(np.radians(fov_degrees) * 0.5)

    def maximum_ndc(candidate: float) -> float:
        maximum = 0.0
        scaled = centered * candidate
        for camera_values in CAMERAS.values():
            camera = np.asarray(camera_values, dtype=np.float64)
            right, up, forward = camera_basis(camera_values)
            relative = scaled - camera
            depth = np.maximum(relative @ forward, 1e-9)
            maximum = max(
                maximum,
                float(np.max(np.abs((relative @ right) / (depth * tan_half)))),
                float(np.max(np.abs((relative @ up) / (depth * tan_half)))),
            )
        return maximum

    low, high = 0.0, 1.8
    for _ in range(28):
        middle = (low + high) * 0.5
        if maximum_ndc(middle) <= 0.80:
            low = middle
        else:
            high = middle
    return {
        "anchor": [float(value) for value in center],
        "translate": [float(-value) for value in center],
        "scale": float(low),
        "targetNdcHalfSpan": 0.80,
        "cameraRig": "production-promoted-event-yaw-v1",
    }


def refresh_machine_qa(records: np.ndarray, baseline_qa_value: dict) -> dict:
    result = copy.deepcopy(baseline_qa_value)
    active_count = int(np.count_nonzero(records["status"] == m3.STATUS_ACTIVE))
    decoded_normals = records["normal"].astype(np.float64) / 32767.0
    sample_count = min(active_count, 2048)
    nearest = None
    if sample_count >= 2:
        probe = records["position"][:sample_count].astype(np.float64)
        values = cKDTree(probe).query(probe, k=2, workers=1)[0][:, 1]
        nearest = {
            "sampleCount": sample_count,
            "mean": float(values.mean()),
            "p95": float(np.quantile(values, 0.95)),
            "max": float(values.max()),
        }
    result.update({
        "activeCount": active_count,
        "reserveCount": int(len(records) - active_count),
        "positionsFinite": bool(np.isfinite(records["position"]).all()),
        "normalsFinite": bool(np.isfinite(decoded_normals).all()),
        "normalLengthErrorMax": float(np.max(np.abs(np.linalg.norm(decoded_normals, axis=1) - 1.0))),
        "scalesFiniteNonnegative": bool(np.isfinite(records["scale"]).all() and np.all(records["scale"] >= 0)),
        "statusValid": bool(np.isin(records["status"], [m3.STATUS_ACTIVE, m3.STATUS_RESERVE, m3.STATUS_SUBSURFACE]).all()),
        "nearestNeighbourMeasured2048": nearest,
    })
    return result


def updated_bounds(records: np.ndarray) -> dict:
    active = records[records["status"] == m3.STATUS_ACTIVE]["position"].astype(np.float64)
    low, high = active.min(axis=0), active.max(axis=0)
    return {
        "min": [float(value) for value in low],
        "max": [float(value) for value in high],
        "size": [float(value) for value in high - low],
    }


def patch_descriptor_payload(yaw_degrees: float) -> dict:
    payload = copy.deepcopy(read_json(BASELINE_DESCRIPTOR_PATH))
    payload["stage"] = "PS-03.M3.1R"
    payload["schemaVersion"] = "1.0.1"
    event = next(item for item in payload["descriptors"] if item["competencyId"] == "event")
    event["canonicalEulerDegrees"] = [0.0, 0.0, float(yaw_degrees)]
    event["orientationPatch"] = {
        "kind": "rigid-yaw-around-semantic-pivot",
        "baselineEulerDegrees": [0.0, 0.0, 0.0],
        "candidateYawDegrees": [12.0, 15.0, 18.0],
        "selectedYawDegrees": float(yaw_degrees),
        "pitchApplied": False,
        "rollApplied": False,
    }
    return payload


def forward_camera_angles(yaw_degrees: float) -> dict:
    forward = np.asarray([0.0, -1.0], dtype=np.float64) @ rotation_z(yaw_degrees)[:2, :2].T

    def difference(camera: list[float]) -> float:
        target = unit(np.asarray(camera[:2], dtype=np.float64))
        cosine = float(np.clip(np.dot(unit(forward), target), -1.0, 1.0))
        return float(np.degrees(np.arccos(cosine)))

    return {
        "yawDegrees": float(yaw_degrees),
        "forwardHorizontal": [float(value) for value in forward],
        "canonicalDifferenceDegrees": difference(CAMERAS["canonical"]),
        "alternateDifferenceDegrees": difference(CAMERAS["alternate"]),
        "rotationDeterminant": float(np.linalg.det(rotation_z(yaw_degrees))),
    }


def projected_splats(manifest: dict, entry: dict, records: np.ndarray, view: str, profile: str) -> dict:
    return baseline_qa.projected_splats(manifest, entry, records, view, profile)


def analyze_projection(projected: dict, entry: dict, profile: str, view: str) -> dict:
    return baseline_qa.analyze_projection(projected, entry, profile, view)


def render_projection(projected: dict, *, component_debug: bool = False, silhouette: bool = False) -> np.ndarray:
    return baseline_qa.render_projection(projected, component_debug=component_debug, silhouette=silhouette)
