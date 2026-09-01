"""Shared camera, buffer, and figure helpers for PS-04.M5.2.R2."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
M52_DIR = STAGE_DIR.parent / "ps-04-m5-2"
M52R1_DIR = STAGE_DIR.parent / "ps-04-m5-2-r1"
PHOTONIC_DIR = STAGE_DIR.parent
REPO_DIR = PHOTONIC_DIR.parents[1]
M3_SCRIPTS = PHOTONIC_DIR / "ps-03-m3" / "scripts"
M31R_SCRIPTS = PHOTONIC_DIR / "ps-03-m3-1r" / "scripts"
PUBLIC_M31R = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1r"
PUBLIC_VARIANTS = REPO_DIR / "public" / "photonic-skin" / "ps-04-m5-2" / "variants"

for path in (M3_SCRIPTS, M31R_SCRIPTS):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import state_builder as m3  # noqa: E402
from m31r_core import CAMERAS, read_json  # noqa: E402

IDENTITY_SIZE = 16384
STRIDE = 40
LOD_PREFIXES = (512, 1024, 2048, 4096, 8192, 12288, 16384)
EXPECTED_VIEWER_RIGHT_LOD = {
    512: 50,
    1024: 84,
    2048: 181,
    4096: 371,
    8192: 651,
    12288: 915,
    16384: 1014,
}
EVENT_A_HASH = "76c46452781c4334b4d91cca9ed6533bb9ccd7224c57bdf7abf7e1093d1c938d"
EVENT_A_R1_HASH = "89f50d4c83b15de21b753f98d6ab368e974c20a91ed135668bbaf05445b898cc"
BASELINE_HASH = "b14a3b2f8571e3e7d39be074aecbdeb6dd4ca51097c6433db25b622c3394a933"
SEMANTIC_NAMES = {0: "stage-deck", 1: "portal-arch", 2: "figure-left", 3: "figure-centre", 4: "figure-right"}
COMPONENT_TO_PART = {0: "stage", 1: "stage", 2: "figure-left", 3: "figure-centre", 4: "figure-right"}
PART_TO_COMPONENT = {"figure-left": 2, "figure-centre": 3, "figure-right": 4}
PART_TO_EVENT_PART = {"stage": 0, "figure-centre": 1, "figure-left": 2, "figure-right": 3}
FIGURE_COMPONENTS = (2, 3, 4)
OCTAHEDRON_RADIUS = 0.035
MINIMUM_GEOMETRIC_SCALE = 0.18
PHOTONIC_FOV_DEGREES = 33.0
PHOTONIC_NEAR = 0.01
PHOTONIC_FAR = 100.0
DESKTOP_SIZE = 512
SEED = 20260902
ALLOWED_FIELDS = ("position", "normal", "orientation")
FORBIDDEN_FIELDS = (
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
)


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def load_event_a() -> np.ndarray:
    path = M52_DIR / "variants" / "a" / "single-event.state.bin"
    payload = path.read_bytes()
    digest = sha256_bytes(payload)
    if digest != EVENT_A_HASH:
        raise SystemExit(f"EVENT_A hash mismatch: {digest}")
    records = np.frombuffer(payload, dtype=m3.STATE_DTYPE).copy()
    if len(records) != IDENTITY_SIZE:
        raise SystemExit(f"EVENT_A N={len(records)}")
    return records


def load_event_a_r1() -> np.ndarray:
    path = M52R1_DIR / "variants" / "a-r1" / "single-event.state.bin"
    payload = path.read_bytes()
    digest = sha256_bytes(payload)
    if digest != EVENT_A_R1_HASH:
        raise SystemExit(f"EVENT_A_R1 hash mismatch: {digest}")
    return np.frombuffer(payload, dtype=m3.STATE_DTYPE).copy()


def event_part_of(records: np.ndarray) -> np.ndarray:
    mapping = np.array([0, 0, 2, 1, 3], dtype=np.uint8)
    return mapping[records["component"]]


def single_event_entry() -> dict:
    manifest = read_json(PUBLIC_M31R / "manifest.json")
    return next(item for item in manifest["states"] if item["stateId"] == "single-event")


def presentation_frame(entry: dict) -> dict:
    frame = entry["presentationFrame"]
    return {
        "translate": [float(v) for v in frame["translate"]],
        "scale": float(frame["scale"]),
        "anchor": [float(v) for v in frame.get("anchor", [0, 0, 0])],
    }


def unit(vector: np.ndarray) -> np.ndarray:
    return vector / max(float(np.linalg.norm(vector)), 1e-12)


def look_at_view_matrix(eye: np.ndarray, target: np.ndarray, up: np.ndarray) -> np.ndarray:
    """Three.js Matrix4.lookAt / matrixWorldInverse for a camera at `eye`."""
    z = unit(eye - target)
    x = unit(np.cross(up, z))
    y = np.cross(z, x)
    view = np.eye(4, dtype=np.float64)
    view[0, :3] = x
    view[1, :3] = y
    view[2, :3] = z
    view[0, 3] = -float(np.dot(x, eye))
    view[1, 3] = -float(np.dot(y, eye))
    view[2, 3] = -float(np.dot(z, eye))
    return view


def perspective_projection_matrix(fov_degrees: float, aspect: float, near: float, far: float) -> np.ndarray:
    """Three.js PerspectiveCamera projectionMatrix (WebGL, clip Z in [-1, 1] via makePerspective path)."""
    top = near * np.tan(np.radians(fov_degrees) * 0.5)
    height = 2.0 * top
    width = aspect * height
    left = -0.5 * width
    right = 0.5 * width
    bottom = -0.5 * height
    x = 2.0 * near / (right - left)
    y = 2.0 * near / (top - bottom)
    a = (right + left) / (right - left)
    b = (top + bottom) / (top - bottom)
    c = -(far + near) / (far - near)
    d = (-2.0 * far * near) / (far - near)
    proj = np.zeros((4, 4), dtype=np.float64)
    proj[0, 0] = x
    proj[0, 2] = a
    proj[1, 1] = y
    proj[1, 2] = b
    proj[2, 2] = c
    proj[2, 3] = d
    proj[3, 2] = -1.0
    return proj


def camera_matrices(view: str, aspect: float = 1.0) -> dict:
    eye = np.asarray(CAMERAS[view], dtype=np.float64)
    view_matrix = look_at_view_matrix(eye, np.zeros(3, dtype=np.float64), np.asarray([0.0, 0.0, 1.0]))
    projection = perspective_projection_matrix(PHOTONIC_FOV_DEGREES, aspect, PHOTONIC_NEAR, PHOTONIC_FAR)
    view_projection = projection @ view_matrix
    return {
        "viewName": view,
        "eye": [float(v) for v in eye],
        "up": [0.0, 0.0, 1.0],
        "target": [0.0, 0.0, 0.0],
        "fovDegrees": PHOTONIC_FOV_DEGREES,
        "aspect": aspect,
        "near": PHOTONIC_NEAR,
        "far": PHOTONIC_FAR,
        "viewMatrix": view_matrix.reshape(-1).tolist(),
        "projectionMatrix": projection.reshape(-1).tolist(),
        "viewProjectionMatrix": view_projection.reshape(-1).tolist(),
        "viewMatrix4x4": view_matrix.tolist(),
        "projectionMatrix4x4": projection.tolist(),
        "viewProjectionMatrix4x4": view_projection.tolist(),
    }


def present_points(points: np.ndarray, frame: dict) -> np.ndarray:
    translate = np.asarray(frame["translate"], dtype=np.float64)
    scale = float(frame["scale"])
    return (points.astype(np.float64) + translate) * scale


def project_points(points: np.ndarray, frame: dict, view: str, *, aspect: float = 1.0, width: int = DESKTOP_SIZE, height: int = DESKTOP_SIZE) -> dict:
    presented = present_points(points, frame)
    mats = camera_matrices(view, aspect)
    vp = np.asarray(mats["viewProjectionMatrix4x4"], dtype=np.float64)
    homo = np.concatenate([presented, np.ones((len(presented), 1), dtype=np.float64)], axis=1)
    clip = homo @ vp.T
    w = np.maximum(np.abs(clip[:, 3]), 1e-12)
    ndc = clip[:, :3] / w[:, None]
    screen_x = (ndc[:, 0] * 0.5 + 0.5) * (width - 1)
    screen_y = (0.5 - ndc[:, 1] * 0.5) * (height - 1)
    return {
        "ndc": ndc,
        "clipW": clip[:, 3],
        "screenX": screen_x,
        "screenY": screen_y,
        "presented": presented,
        "matrices": mats,
        "width": width,
        "height": height,
    }


def project_centroid(centroid: np.ndarray, frame: dict, view: str) -> dict:
    projected = project_points(np.asarray(centroid, dtype=np.float64).reshape(1, 3), frame, view)
    ndc = projected["ndc"][0]
    return {
        "ndc": [float(v) for v in ndc],
        "screenX": float(projected["screenX"][0]),
        "screenY": float(projected["screenY"][0]),
        "presented": [float(v) for v in projected["presented"][0]],
        "inFront": bool(projected["clipW"][0] > 0),
    }


def figure_mask(records: np.ndarray, component: int, *, active_only: bool = True) -> np.ndarray:
    live = records["component"] == component
    if active_only:
        live = live & (records["status"] == m3.STATUS_ACTIVE)
    return live


def field_stats(values: np.ndarray) -> dict:
    flat = np.asarray(values, dtype=np.float64).reshape(len(values), -1)
    reduced = np.linalg.norm(flat, axis=1) if flat.shape[1] > 1 else flat[:, 0]
    return {
        "min": float(np.min(reduced)),
        "max": float(np.max(reduced)),
        "mean": float(np.mean(reduced)),
        "median": float(np.median(reduced)),
        "unique": int(len(np.unique(np.round(reduced, 6)))),
    }


def nearest_neighbour(points: np.ndarray) -> dict:
    if len(points) < 2:
        return {"median": None, "mean": None, "p95": None, "min": None}
    dist = cKDTree(points).query(points, k=2, workers=1)[0][:, 1]
    return {
        "min": float(dist.min()),
        "median": float(np.median(dist)),
        "mean": float(dist.mean()),
        "p95": float(np.quantile(dist, 0.95)),
        "max": float(dist.max()),
    }


def shader_radius(scale: np.ndarray, *, visible: bool, frame_scale: float) -> np.ndarray:
    activation = 1.0 if visible else 0.0
    geometric = scale.astype(np.float64)
    finite = MINIMUM_GEOMETRIC_SCALE if not visible else 1.0
    if visible:
        finite = 1.0
    else:
        finite = MINIMUM_GEOMETRIC_SCALE
    return geometric * finite * OCTAHEDRON_RADIUS * frame_scale


def component_visible(entry: dict, component: int, profile: str = "desktop") -> bool:
    for item in entry.get("componentMap", []):
        if int(item["componentIndex"]) == component:
            return profile in item.get("visibleProfiles", [])
    return True
