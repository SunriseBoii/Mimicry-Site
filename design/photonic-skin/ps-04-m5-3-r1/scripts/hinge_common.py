"""Shared kinematics, I/O and constants for PS-04.M5.3.R1 clapperboard hinge."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree
from skimage import measure

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
M53_DIR = STAGE_DIR.parent / "ps-04-m5-3"
PHOTONIC_DIR = STAGE_DIR.parent
REPO_DIR = PHOTONIC_DIR.parents[1]
M_SCRIPTS = PHOTONIC_DIR / "ps-03-m" / "scripts"
M2_SCRIPTS = PHOTONIC_DIR / "ps-03-m2" / "scripts"
M3_SCRIPTS = PHOTONIC_DIR / "ps-03-m3" / "scripts"
M31R_SCRIPTS = PHOTONIC_DIR / "ps-03-m3-1r" / "scripts"
PUBLIC_R1 = REPO_DIR / "public" / "photonic-skin" / "ps-04-m5-3-r1" / "variants"
PUBLIC_M53 = REPO_DIR / "public" / "photonic-skin" / "ps-04-m5-3" / "variants"
OWNER_SPEC = STAGE_DIR / "references" / "clapperboard-anatomy-spec.md"
OWNER_SPEC_HASH = "4f7d67fb8ee37a0fb1fb024a8e68b6bf39486db414b6016edbc7fbcb41ba018e"

for path in (M_SCRIPTS, M2_SCRIPTS, M3_SCRIPTS, M31R_SCRIPTS):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import geometry_providers as gp  # noqa: E402
import mesh_ops as mo  # noqa: E402
import state_builder as m3  # noqa: E402
import target_library as tl  # noqa: E402
from m31r_core import rotation_z  # noqa: E402

IDENTITY_SIZE = 16384
STRIDE = 40
LOD_PREFIXES = (512, 1024, 2048, 4096, 8192, 12288, 16384)
OPEN_ANGLE_DEG = 30.0
OVERLAP_FRACTION = 0.05
SEED = 0x4D35335231
COMPONENT_BOARD = 4
COMPONENT_RAIL = 5
COMPONENT_BAR = 6
CAMERA_COMPONENTS = (0, 1, 2, 3)
CLAPPER_COMPONENTS = (4, 5, 6)
TARGET_COMPONENTS = (5, 6)
COMBO_IDS = (
    "camera-body",
    "camera-lens",
    "camera-top",
    "camera-rear",
    "slate-board",
    "slate-fixed-rail",
    "slate-hinged-bar",
)
ORIGINAL_HASHES = {
    "baseline": "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b",
    "combo-20": "ed88723a879416d4302d0146770c46956019c6941229a0fb28db0d843f67032f",
    "combo-30": "4e9f22ae50cb581951decedf2d479ef3670f504ffdc93abb909befda2c7d7cdb",
    "combo-40": "5efc8dbf7e65928c05727185dd6ef8ee13ccf7f080320bf4bde675c03befe726",
    "camera-20": "db4a0e7f05ab591b22e11413a7dd3aad29d2fba1acf3da081ca87132cc8b6b64",
    "camera-30": "a04c36a24b9f61f536fbc2fea9d74b7aaa1393d61b2e4494b023164ef84ded83",
    "camera-40": "0d08273d1c485b82ae994d32a240fd3c7994f8046d92feeace28c1d13f259d6c",
}
EVENT_A_R2 = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b"
FROZEN_VIDEO = ORIGINAL_HASHES["baseline"]
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
BOARD_HALF = np.asarray([0.50, 0.055, 0.32], dtype=np.float64)
RAIL_HALF = np.asarray([0.50, 0.045, 0.055], dtype=np.float64)
RAIL_CENTER = np.asarray([0.0, -0.02, 0.355], dtype=np.float64)
BAR_HALF = np.asarray([0.48, 0.042, 0.050], dtype=np.float64)
H_LOCAL = np.asarray([-0.48, -0.02, 0.355], dtype=np.float64)
U_LOCAL = np.asarray([1.0, 0.0, 0.0], dtype=np.float64)
V_LOCAL = np.asarray([0.0, 0.0, 1.0], dtype=np.float64)
N_LOCAL = np.asarray([0.0, 1.0, 0.0], dtype=np.float64)
KNUCKLE_RADIUS = 0.078
KNUCKLE_HALF = 0.062
BOARD_CANONICAL = {
    "translate": np.asarray([0.10, -0.78, 0.04], dtype=np.float64),
    "rotateDeg": np.asarray([8.0, 0.0, 12.0], dtype=np.float64),
}
OLD_BAR_TRANSLATE = np.asarray([0.02, -0.22, 0.52], dtype=np.float64)
OLD_BAR_ROTATE = np.asarray([-34.0, 0.0, 0.0], dtype=np.float64)
OLD_HINGE = np.asarray([-0.48, -0.02, 0.36], dtype=np.float64)


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def jsonable(value):
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(item) for item in value]
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, (np.floating, np.integer, np.bool_)):
        return value.item()
    if isinstance(value, Path):
        return str(value).replace("\\", "/")
    return value


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(jsonable(value), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def load_records(path: Path) -> np.ndarray:
    payload = path.read_bytes()
    records = np.frombuffer(payload, dtype=m3.STATE_DTYPE).copy()
    if len(records) != IDENTITY_SIZE:
        raise SystemExit(f"{path}: N={len(records)}")
    if records.nbytes != IDENTITY_SIZE * STRIDE:
        raise SystemExit(f"{path}: stride {records.nbytes}")
    return records


def owner_spec_proof() -> dict:
    if not OWNER_SPEC.exists():
        raise SystemExit(f"owner specification missing: {OWNER_SPEC}")
    payload = OWNER_SPEC.read_bytes()
    digest = sha256_bytes(payload)
    if digest != OWNER_SPEC_HASH:
        raise SystemExit(f"owner specification hash mismatch: {digest}")
    text = payload.decode("utf-8")
    markers = (
        "documentId: PS04-M53R1-CLAPPERBOARD-ANATOMY",
        "Pivot-aware construction",
        "slate-hinged-bar",
        "openAngleDegrees: 30",
        "Human-review target",
    )
    missing = [item for item in markers if item not in text]
    if missing:
        raise SystemExit(f"owner specification not fully read, missing {missing}")
    return {
        "path": str(OWNER_SPEC.relative_to(REPO_DIR)).replace("\\", "/"),
        "hash": digest,
        "bytes": len(payload),
        "ownerSpecRead": True,
        "ownerSpecHash": digest,
        "ownerSpecIsSourceOfTruth": True,
        "readFully": True,
        "markersFound": list(markers),
    }


def rodrigues(vector: np.ndarray, axis: np.ndarray, degrees: float) -> np.ndarray:
    axis_u = axis / max(float(np.linalg.norm(axis)), 1e-12)
    radians = np.radians(degrees)
    cosine, sine = np.cos(radians), np.sin(radians)
    return (
        vector * cosine
        + np.cross(axis_u, vector) * sine
        + axis_u * np.dot(axis_u, vector) * (1.0 - cosine)
    )


def board_rotation() -> np.ndarray:
    return gp.euler_matrix(BOARD_CANONICAL["rotateDeg"])


def board_local_axes_auth() -> dict[str, np.ndarray]:
    rotation = board_rotation()
    return {
        "u": rotation[:, 0].copy(),
        "n": rotation[:, 1].copy(),
        "v": rotation[:, 2].copy(),
    }


def signed_open_angle(normal: np.ndarray, vertical: np.ndarray) -> float:
    plus = rodrigues(U_LOCAL, normal, OPEN_ANGLE_DEG)
    minus = rodrigues(U_LOCAL, normal, -OPEN_ANGLE_DEG)
    plus_lift = float(np.dot(plus, vertical))
    minus_lift = float(np.dot(minus, vertical))
    if plus_lift > minus_lift and plus_lift > 0:
        return OPEN_ANGLE_DEG
    if minus_lift > 0:
        return -OPEN_ANGLE_DEG
    raise SystemExit("no signed open angle lifts the bar along +v")


def clapper_kinematics() -> dict:
    axes = board_local_axes_auth()
    angle = signed_open_angle(N_LOCAL, V_LOCAL)
    direction = rodrigues(U_LOCAL, N_LOCAL, angle)
    length = float(2.0 * BAR_HALF[0])
    overlap = OVERLAP_FRACTION * length
    bar_center = H_LOCAL + direction * (length / 2.0 - overlap)
    bar_root = bar_center - direction * (length / 2.0)
    bar_tip = bar_center + direction * (length / 2.0)
    box_yaw = angle
    return {
        "uLocal": U_LOCAL,
        "vLocal": V_LOCAL,
        "nLocal": N_LOCAL,
        "uAuth": axes["u"],
        "vAuth": axes["v"],
        "nAuth": axes["n"],
        "hingeLocal": H_LOCAL,
        "rotationAxisLocal": N_LOCAL,
        "signedOpenAngle": angle,
        "openBarDirection": direction,
        "barLength": length,
        "overlap": overlap,
        "barCenter": bar_center,
        "barRoot": bar_root,
        "barTip": bar_tip,
        "boxRotateDeg": np.asarray([0.0, box_yaw, 0.0], dtype=np.float64),
        "rootToHingeDistance": float(np.linalg.norm(bar_root - H_LOCAL)),
        "tipRiseLocal": float(np.dot(bar_tip - bar_root, V_LOCAL)),
        "expectedTipRiseLocal": float(length * np.sin(np.radians(OPEN_ANGLE_DEG))),
        "dotOpenV": float(np.dot(direction, V_LOCAL)),
    }


def rail_provider(kin: dict) -> dict:
    hinge = np.asarray(kin["hingeLocal"], dtype=np.float64)
    normal = np.asarray(kin["nLocal"], dtype=np.float64)
    return {
        "provider": "smooth_union",
        "params": {"k": 0.028},
        "children": [
            {
                "provider": "rounded_box",
                "params": {"half": RAIL_HALF.tolist(), "radius": 0.03, "center": RAIL_CENTER.tolist()},
            },
            {
                "provider": "capsule",
                "params": {
                    "a": (hinge - normal * KNUCKLE_HALF).tolist(),
                    "b": (hinge + normal * KNUCKLE_HALF).tolist(),
                    "radius": KNUCKLE_RADIUS,
                },
            },
            {
                "provider": "sphere",
                "params": {"radius": KNUCKLE_RADIUS + 0.006, "center": hinge.tolist()},
            },
        ],
    }


def bar_provider(kin: dict) -> dict:
    return {
        "provider": "rounded_box",
        "params": {"half": BAR_HALF.tolist(), "radius": 0.03},
        "transform": {
            "translate": np.asarray(kin["barCenter"]).tolist(),
            "rotateDeg": np.asarray(kin["boxRotateDeg"]).tolist(),
            "scale": 1.0,
        },
    }


def hinge_mask_provider(kin: dict) -> dict:
    hinge = np.asarray(kin["hingeLocal"], dtype=np.float64)
    normal = np.asarray(kin["nLocal"], dtype=np.float64)
    return {
        "provider": "smooth_union",
        "params": {"k": 0.02},
        "children": [
            {
                "provider": "capsule",
                "params": {
                    "a": (hinge - normal * KNUCKLE_HALF).tolist(),
                    "b": (hinge + normal * KNUCKLE_HALF).tolist(),
                    "radius": KNUCKLE_RADIUS,
                },
            },
            {
                "provider": "sphere",
                "params": {"radius": KNUCKLE_RADIUS + 0.006, "center": hinge.tolist()},
            },
        ],
    }


def board_provider() -> dict:
    return {"provider": "rounded_box", "params": {"half": BOARD_HALF.tolist(), "radius": 0.04}}


def wrap_canonical(node: dict):
    return tl._wrap_transform(gp.compile_node(node), {
        "translate": BOARD_CANONICAL["translate"].tolist(),
        "rotateDeg": BOARD_CANONICAL["rotateDeg"].tolist(),
        "scale": 1.0,
    })


def inverse_yaw_points(points: np.ndarray, yaw_degrees: float) -> np.ndarray:
    return points.astype(np.float64) @ rotation_z(yaw_degrees)


def yaw_points(points: np.ndarray, yaw_degrees: float) -> np.ndarray:
    return points.astype(np.float64) @ rotation_z(yaw_degrees).T


def recover_origin_offset(board_world: np.ndarray, scale: float, board_field) -> np.ndarray:
    translate = BOARD_CANONICAL["translate"]
    offset = board_world.mean(axis=0) - scale * translate
    for _ in range(10):
        authoring = (board_world - offset) / scale
        signed = board_field(authoring)
        gradient = mo.sdf_gradient(board_field, authoring)
        matrix = gradient / scale
        delta, *_ = np.linalg.lstsq(matrix, signed, rcond=None)
        offset = offset + delta
        if float(np.linalg.norm(delta)) < 1e-8:
            break
    return offset


def local_to_world(points_local: np.ndarray, scale: float, offset: np.ndarray) -> np.ndarray:
    rotation = board_rotation()
    authoring = points_local.astype(np.float64) @ rotation.T + BOARD_CANONICAL["translate"]
    return scale * authoring + offset


def local_dir_to_world(direction: np.ndarray, scale: float) -> np.ndarray:
    del scale
    rotation = board_rotation()
    return direction.astype(np.float64) @ rotation.T


def world_sdf_from_auth(auth_field, scale: float, offset: np.ndarray, yaw_degrees: float):
    rotation = rotation_z(yaw_degrees)

    def field(points_yawed: np.ndarray) -> np.ndarray:
        world = points_yawed.astype(np.float64) @ rotation
        authoring = (world - offset) / scale
        return scale * auth_field(authoring)

    return field


def encode_normals(normals: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    unit = normals / np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
    encoded = np.round(np.clip(unit, -1.0, 1.0) * 32767).astype(np.int16)
    quat = m3._quaternion_from_z(unit)
    orientation = np.round(np.clip(quat, -1.0, 1.0) * 32767).astype(np.int16)
    return encoded, orientation


def farthest_point_order(points: np.ndarray, count: int, start: int) -> np.ndarray:
    total = len(points)
    selected = np.empty(count, dtype=np.int64)
    selected[0] = start
    distance = np.full(total, np.inf, dtype=np.float64)
    for index in range(1, count):
        last = points[selected[index - 1]]
        delta = points - last
        distance = np.minimum(distance, np.einsum("ij,ij->i", delta, delta))
        distance[selected[:index]] = -1.0
        selected[index] = int(np.argmax(distance))
    return selected


def eval_sdf_box(sdf, center: np.ndarray, half: float, resolution: int) -> tuple[np.ndarray, np.ndarray]:
    axis = np.linspace(-half, half, resolution, dtype=np.float64)
    gx, gy, gz = np.meshgrid(axis, axis, axis, indexing="ij")
    points = np.stack([gx.ravel() + center[0], gy.ravel() + center[1], gz.ravel() + center[2]], axis=1)
    values = np.empty(len(points), dtype=np.float64)
    chunk = 262_144
    for start in range(0, len(points), chunk):
        values[start:start + chunk] = sdf(points[start:start + chunk])
    grid = values.reshape(resolution, resolution, resolution)
    spacing = (2.0 * half) / (resolution - 1)
    verts, faces, _, _ = measure.marching_cubes(grid, level=0.0, spacing=(spacing, spacing, spacing))
    verts = verts + (center - half)
    return np.ascontiguousarray(verts), np.ascontiguousarray(faces)


def voxel_overlap(field_a, field_b, center: np.ndarray, half: float, resolution: int = 40) -> dict:
    axis = np.linspace(-half, half, resolution, dtype=np.float64)
    gx, gy, gz = np.meshgrid(axis, axis, axis, indexing="ij")
    points = np.stack([gx.ravel() + center[0], gy.ravel() + center[1], gz.ravel() + center[2]], axis=1)
    inside_a = field_a(points) < 0.0
    inside_b = field_b(points) < 0.0
    both = inside_a & inside_b
    return {
        "insideA": int(inside_a.sum()),
        "insideB": int(inside_b.sum()),
        "overlapVoxels": int(both.sum()),
        "intersects": bool(both.any()),
    }


def connectivity_3d(points: np.ndarray, radius_scale: float = 2.6) -> dict:
    if len(points) < 4:
        return {"components": 0, "orphanCount": int(len(points)), "remoteIsland": True, "mainShare": 0.0, "pass": False}
    tree = cKDTree(points)
    nearest = tree.query(points, k=2, workers=1)[0][:, 1]
    radius = float(max(radius_scale * np.median(nearest), 1e-4))
    graph = tree.query_ball_tree(tree, radius)
    seen = np.zeros(len(points), dtype=bool)
    sizes = []
    for start in range(len(points)):
        if seen[start]:
            continue
        stack = [start]
        seen[start] = True
        size = 0
        while stack:
            node = stack.pop()
            size += 1
            for other in graph[node]:
                if not seen[other]:
                    seen[other] = True
                    stack.append(other)
        sizes.append(size)
    sizes.sort(reverse=True)
    main = int(sizes[0])
    remote = bool(len(sizes) > 1 and sizes[1] >= 8)
    orphan = int(sum(size for size in sizes[1:] if size <= 4))
    share = float(main / max(len(points), 1))
    return {
        "components": int(len(sizes)),
        "largest": main,
        "sizes": [int(value) for value in sizes[:8]],
        "orphanCount": orphan,
        "remoteIsland": remote,
        "linkRadius": radius,
        "medianNN": float(np.median(nearest)),
        "mainShare": share,
        "morphologicalClosingUsed": False,
        "pass": bool(share >= 0.98 and not remote),
    }


def active_mask(records: np.ndarray, component: int | None = None) -> np.ndarray:
    live = records["status"] == m3.STATUS_ACTIVE
    if component is None:
        return live
    return live & (records["component"] == component)


def lod_presence(records: np.ndarray) -> dict:
    live = records["status"] == m3.STATUS_ACTIVE
    out = {}
    for prefix in LOD_PREFIXES:
        slice_live = live[:prefix]
        slice_comp = records["component"][:prefix]
        out[str(prefix)] = {
            name: int(np.count_nonzero(slice_live & (slice_comp == index)))
            for index, name in enumerate(COMBO_IDS)
        }
    return out
