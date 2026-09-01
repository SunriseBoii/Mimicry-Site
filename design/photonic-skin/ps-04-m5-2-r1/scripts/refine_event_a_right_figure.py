"""PS-04.M5.2.R1 — selective figure-right refinement of EVENT_A.

Chain:
    frozen BASELINE
    → EVENT_A rigid +180° Z
    → selective figure-right refinement
    → EVENT_A_R1

Only geometric fields of figure-right records are rewritten. Every other
record is copied byte-for-byte from EVENT_A. Persistent IDs, statuses,
component membership, shells, flags, transition groups and LOD prefix
presence are preserved.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from scipy.ndimage import binary_closing, label
from scipy.spatial import cKDTree
from skimage import measure

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
M52_DIR = STAGE_DIR.parent / "ps-04-m5-2"
PHOTONIC_DIR = STAGE_DIR.parent
REPO_DIR = PHOTONIC_DIR.parents[1]
M_SCRIPTS = PHOTONIC_DIR / "ps-03-m" / "scripts"
M2_SCRIPTS = PHOTONIC_DIR / "ps-03-m2" / "scripts"
M3_SCRIPTS = PHOTONIC_DIR / "ps-03-m3" / "scripts"
M31R_SCRIPTS = PHOTONIC_DIR / "ps-03-m3-1r" / "scripts"
PUBLIC_VARIANTS = REPO_DIR / "public" / "photonic-skin" / "ps-04-m5-2" / "variants"

for path in (M_SCRIPTS, M2_SCRIPTS, M3_SCRIPTS, M31R_SCRIPTS):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import geometry_providers as gp  # noqa: E402
import mesh_ops as mo  # noqa: E402
import state_builder as m3  # noqa: E402
from m31r_core import projected_splats, read_json, render_projection  # noqa: E402

IDENTITY_SIZE = 16384
STRIDE = 40
LOD_PREFIXES = (512, 1024, 2048, 4096, 8192, 12288, 16384)
EXPECTED_RIGHT_LOD = {
    512: 42,
    1024: 78,
    2048: 155,
    4096: 325,
    8192: 566,
    12288: 809,
    16384: 890,
}
EVENT_A_HASH = "76c46452781c4334b4d91cca9ed6533bb9ccd7224c57bdf7abf7e1093d1c938d"
BASELINE_HASH = "b14a3b2f8571e3e7d39be074aecbdeb6dd4ca51097c6433db25b622c3394a933"
COMPONENT_RIGHT = 4
EVENT_PART_RIGHT = 3
SEED = 20260901
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
PART_NAMES = ("stage", "figure-centre", "figure-left", "figure-right")
COMPONENT_TO_PART = {0: "stage", 1: "stage", 2: "figure-left", 3: "figure-centre", 4: "figure-right"}


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


def load_records(path: Path) -> np.ndarray:
    payload = path.read_bytes()
    records = np.frombuffer(payload, dtype=m3.STATE_DTYPE).copy()
    if len(records) != IDENTITY_SIZE:
        raise SystemExit(f"{path}: N={len(records)}")
    if records.nbytes != IDENTITY_SIZE * STRIDE:
        raise SystemExit(f"{path}: stride mismatch {records.nbytes}")
    return records


def part_of(component: np.ndarray) -> np.ndarray:
    mapping = np.array([0, 0, 2, 1, 3], dtype=np.uint8)
    return mapping[component]


def active_mask(records: np.ndarray, part: str | None = None) -> np.ndarray:
    live = records["status"] == m3.STATUS_ACTIVE
    if part is None:
        return live
    return live & (np.array([COMPONENT_TO_PART[int(c)] for c in records["component"]]) == part)


def measure_cloud(points: np.ndarray) -> dict:
    if len(points) == 0:
        raise SystemExit("empty cloud")
    low = points.min(axis=0)
    high = points.max(axis=0)
    centroid = points.mean(axis=0)
    xy = points[:, :2]
    xy_c = xy.mean(axis=0)
    radial = np.linalg.norm(xy - xy_c, axis=1)
    cov = np.cov(xy.T)
    evals, evecs = np.linalg.eigh(cov)
    axis = evecs[:, int(np.argmax(evals))]
    yaw = float(np.degrees(np.arctan2(axis[1], axis[0])))
    z = points[:, 2]
    edges = np.linspace(float(z.min()), float(z.max()), 13)
    profile = []
    for index in range(12):
        lo, hi = edges[index], edges[index + 1]
        selected = (z >= lo) & (z <= hi if index == 11 else z < hi)
        if int(selected.sum()) < 4:
            profile.append({"z": float(0.5 * (lo + hi)), "width": 0.0, "count": int(selected.sum())})
            continue
        slice_xy = points[selected][:, :2]
        width = float(2.0 * np.quantile(np.linalg.norm(slice_xy - slice_xy.mean(axis=0), axis=1), 0.9))
        profile.append({"z": float(0.5 * (lo + hi)), "width": width, "count": int(selected.sum())})
    head_band = z >= (z.min() + 0.72 * (z.max() - z.min()))
    torso_band = z <= (z.min() + 0.55 * (z.max() - z.min()))
    head_width = float(2.0 * np.quantile(radial[head_band], 0.9)) if int(head_band.sum()) >= 4 else 0.0
    torso_width = float(2.0 * np.quantile(radial[torso_band], 0.9)) if int(torso_band.sum()) >= 4 else 0.0
    return {
        "count": int(len(points)),
        "bbox": {"min": [float(v) for v in low], "max": [float(v) for v in high], "size": [float(v) for v in high - low]},
        "centroid": [float(v) for v in centroid],
        "height": float(high[2] - low[2]),
        "width": float(2.0 * np.quantile(radial, 0.9)),
        "baseZ": float(low[2]),
        "topZ": float(high[2]),
        "yawDegrees": yaw,
        "headWidth": head_width,
        "torsoWidth": torso_width,
        "widthProfile": profile,
    }


def figure_provider(params: dict) -> dict:
    head_r = params["headRadius"]
    shoulder_r = params["shoulderRadius"]
    base_r = params["baseRadius"]
    torso_top = params["torsoTop"]
    head_z = params["headCenterZ"]
    neck_r = params["neckRadius"]
    neck_a = params["neckA"]
    neck_b = params["neckB"]
    return {
        "provider": "smooth_union",
        "params": {"k": params["smoothK"]},
        "transform": {
            "translate": params["translate"],
            "rotateDeg": params["rotateDeg"],
            "scale": 1.0,
        },
        "children": [
            {
                "provider": "tapered_capsule",
                "params": {
                    "a": [0.0, 0.0, params["torsoBase"]],
                    "b": [0.0, 0.0, torso_top],
                    "radiusA": base_r,
                    "radiusB": shoulder_r,
                },
            },
            {
                "provider": "capsule",
                "params": {"a": [0.0, 0.0, neck_a], "b": [0.0, 0.0, neck_b], "radius": neck_r},
            },
            {
                "provider": "ellipsoid",
                "params": {"radii": [head_r, head_r * 0.92, head_r * 1.06], "center": [0.0, 0.0, head_z]},
            },
        ],
    }


def derive_grammar(left: dict, centre: dict, right: dict, deck_z: float) -> dict:
    height = float(np.clip(0.52 * left["height"] + 0.48 * centre["height"], min(left["height"], centre["height"]), 0.97 * centre["height"]))
    width = float(0.54 * left["width"] + 0.46 * centre["width"])
    # Head and torso come from the left–centre range. The previous 0.22*width shoulder
    # cap produced a lollipop (head twice as wide as the body). Upper torso should be
    # slightly narrower than or equal to the head, then hold or widen toward a rounded base.
    head_r = float(0.52 * (left["headWidth"] / 2.0) + 0.48 * (centre["headWidth"] / 2.0))
    torso_r_ref = float(0.52 * (left["torsoWidth"] / 2.0) + 0.48 * (centre["torsoWidth"] / 2.0))
    shoulder_r = float(min(head_r * 0.96, torso_r_ref * 0.88))
    base_r = float(max(shoulder_r * 1.16, min(torso_r_ref * 0.98, head_r * 1.10)))
    # Local z=0 is the bottom of the torso cap so world baseZ stays on the deck.
    torso_base = base_r
    torso_top = height - 1.72 * head_r
    head_z = torso_top + head_r * 0.52
    neck_a = torso_top - 0.012 * height
    neck_b = head_z - 0.22 * head_r
    neck_r = float(max(shoulder_r * 0.76, head_r * 0.58))
    yaw = float(right["yawDegrees"])
    if abs(yaw - (-left["yawDegrees"])) < 8:
        yaw = yaw + 11.0
    base_z = float(right["baseZ"])
    if base_z - deck_z > 0.04:
        base_z = deck_z - 0.008
    if base_z - deck_z < -0.04:
        base_z = deck_z - 0.012
    translate = [float(right["centroid"][0]), float(right["centroid"][1]), base_z]
    return {
        "kind": "smooth-union sphere/ellipsoid head + tapered-capsule torso + short neck",
        "seed": SEED,
        "derivedFrom": "EVENT_A figure-right pose; proportions from left/centre range",
        "targetHeight": height,
        "targetWidth": width,
        "headRadius": head_r,
        "shoulderRadius": shoulder_r,
        "baseRadius": base_r,
        "torsoBase": torso_base,
        "torsoTop": torso_top,
        "headCenterZ": head_z,
        "neckA": neck_a,
        "neckB": neck_b,
        "neckRadius": neck_r,
        "smoothK": 0.048 * height,
        "translate": translate,
        "rotateDeg": [0.0, 0.0, yaw],
        "keptRightCentroidXY": [float(right["centroid"][0]), float(right["centroid"][1])],
        "deckZ": deck_z,
        "baseZ": base_z,
        "transformChain": [
            "frozen BASELINE",
            "EVENT_A rigid +180° Z",
            "selective figure-right refinement",
            "EVENT_A_R1",
        ],
    }


def eval_sdf_box(sdf, center: np.ndarray, half: float, resolution: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
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
    return np.ascontiguousarray(verts), np.ascontiguousarray(faces), grid


def farthest_point_order(points: np.ndarray, count: int, start: int) -> np.ndarray:
    n = len(points)
    selected = np.empty(count, dtype=np.int64)
    selected[0] = start
    dist = np.full(n, np.inf, dtype=np.float64)
    for index in range(1, count):
        last = points[selected[index - 1]]
        delta = points - last
        dist = np.minimum(dist, np.einsum("ij,ij->i", delta, delta))
        dist[selected[:index]] = -1.0
        selected[index] = int(np.argmax(dist))
    return selected


def encode_normals(normals: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    unit = normals / np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
    encoded = np.round(np.clip(unit, -1.0, 1.0) * 32767).astype(np.int16)
    quat = m3._quaternion_from_z(unit)
    orientation = np.round(np.clip(quat, -1.0, 1.0) * 32767).astype(np.int16)
    return encoded, orientation


def lod_presence(records: np.ndarray) -> dict:
    parts = np.array([COMPONENT_TO_PART[int(c)] for c in records["component"]])
    live = records["status"] == m3.STATUS_ACTIVE
    out = {}
    for prefix in LOD_PREFIXES:
        slice_live = live[:prefix]
        slice_parts = parts[:prefix]
        out[str(prefix)] = {name: int(np.count_nonzero(slice_live & (slice_parts == name))) for name in PART_NAMES}
    return out


def status_counts(records: np.ndarray) -> dict:
    return {
        "active": int(np.count_nonzero(records["status"] == m3.STATUS_ACTIVE)),
        "reserve": int(np.count_nonzero(records["status"] == m3.STATUS_RESERVE)),
        "subsurface": int(np.count_nonzero(records["status"] == m3.STATUS_SUBSURFACE)),
    }


def component_counts(records: np.ndarray) -> dict:
    live = records["status"] == m3.STATUS_ACTIVE
    return {str(index): int(np.count_nonzero(live & (records["component"] == index))) for index in range(5)}


def silhouette_metrics(mask: np.ndarray) -> dict:
    occupied = mask.max(axis=2) > 0 if mask.ndim == 3 else mask > 0
    pixels = int(occupied.sum())
    rows = np.where(occupied.any(axis=1))[0]
    cols = np.where(occupied.any(axis=0))[0]
    max_row_gap = 0
    if len(rows) >= 2:
        max_row_gap = int(np.max(np.diff(rows)) - 1)
    closed = binary_closing(occupied, iterations=1)
    labels, count = label(closed)
    sizes = np.bincount(labels.ravel()) if count else np.array([0])
    sizes[0] = 0
    main = int(sizes.max()) if len(sizes) else 0
    return {
        "occupied": pixels,
        "bboxRows": [int(rows[0]), int(rows[-1])] if len(rows) else [0, 0],
        "bboxCols": [int(cols[0]), int(cols[-1])] if len(cols) else [0, 0],
        "maxInternalRowGap": max_row_gap,
        "componentsRawClosed": int(count),
        "mainShare": float(main / max(pixels, 1)),
        "connected": bool(count <= 2 and main >= 0.92 * max(pixels, 1) and max_row_gap <= 3),
    }


def force_visible(entry: dict) -> dict:
    clone = json.loads(json.dumps(entry))
    profiles = ["desktop", "mobile390", "silhouette180", "silhouette96"]
    for item in clone["componentMap"]:
        item["visibleProfiles"] = list(profiles)
    return clone


def render_isolated(records: np.ndarray, entry: dict, manifest: dict, profile: str) -> np.ndarray:
    isolated = records.copy()
    keep = (isolated["component"] == COMPONENT_RIGHT) & (isolated["status"] == m3.STATUS_ACTIVE)
    isolated["status"][~keep] = m3.STATUS_RESERVE
    projected = projected_splats(manifest, force_visible(entry), isolated, "canonical", profile)
    rgb = render_projection(projected, silhouette=True)
    return rgb


def connectivity_3d(points: np.ndarray) -> dict:
    if len(points) < 4:
        return {"components": 0, "orphanCount": int(len(points)), "remoteIsland": True, "pass": False}
    tree = cKDTree(points)
    nn = tree.query(points, k=2, workers=1)[0][:, 1]
    radius = float(max(2.6 * np.median(nn), 0.055))
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
    orphan = int(sum(size for size in sizes[1:] if size <= 4))
    remote = bool(len(sizes) > 1 and sizes[1] >= 8)
    return {
        "components": int(len(sizes)),
        "largest": int(sizes[0]),
        "orphanCount": orphan,
        "remoteIsland": remote,
        "linkRadius": radius,
        "pass": bool(sizes[0] >= 0.96 * len(points) and orphan == 0 and not remote),
    }


def main() -> int:
    event_a_path = M52_DIR / "variants" / "a" / "single-event.state.bin"
    part_path = M52_DIR / "variants" / "a" / "event-part.u8.bin"
    event_a_bytes = event_a_path.read_bytes()
    actual_hash = sha256_bytes(event_a_bytes)
    if actual_hash != EVENT_A_HASH:
        raise SystemExit(f"EVENT_A hash mismatch: {actual_hash}")
    records_a = np.frombuffer(event_a_bytes, dtype=m3.STATE_DTYPE).copy()
    parts = np.frombuffer(part_path.read_bytes(), dtype=np.uint8).copy()
    if len(parts) != IDENTITY_SIZE:
        raise SystemExit("event-part length")
    right = (parts == EVENT_PART_RIGHT) & (records_a["component"] == COMPONENT_RIGHT)
    if not np.array_equal(right, records_a["component"] == COMPONENT_RIGHT):
        raise SystemExit("figure-right != eventPart 3 == component 4")
    if int(np.count_nonzero(right & (records_a["status"] == m3.STATUS_ACTIVE))) != 890:
        raise SystemExit("figure-right active != 890")

    left_pts = records_a["position"][active_mask(records_a, "figure-left")].astype(np.float64)
    centre_pts = records_a["position"][active_mask(records_a, "figure-centre")].astype(np.float64)
    right_pts = records_a["position"][right & (records_a["status"] == m3.STATUS_ACTIVE)].astype(np.float64)
    deck_pts = records_a["position"][(records_a["component"] == 0) & (records_a["status"] == m3.STATUS_ACTIVE)].astype(np.float64)
    left_m = measure_cloud(left_pts)
    centre_m = measure_cloud(centre_pts)
    right_m = measure_cloud(right_pts)
    near = np.linalg.norm(deck_pts[:, :2] - np.asarray(right_m["centroid"][:2]), axis=1) < max(right_m["width"], 0.35)
    deck_z = float(np.quantile(deck_pts[near][:, 2], 0.92)) if int(near.sum()) >= 8 else float(np.quantile(deck_pts[:, 2], 0.85))
    grammar = derive_grammar(left_m, centre_m, right_m, deck_z)
    sdf = gp.compile_node(figure_provider(grammar))

    world_center = np.array([
        grammar["translate"][0],
        grammar["translate"][1],
        grammar["translate"][2] + 0.52 * grammar["targetHeight"],
    ], dtype=np.float64)
    half = 0.72 * grammar["targetHeight"] + 0.22
    verts, faces, _grid = eval_sdf_box(sdf, world_center, half, 96)
    if len(verts) < 80 or len(faces) < 80:
        raise SystemExit(f"collapsed mesh v={len(verts)} f={len(faces)}")

    rng = np.random.default_rng(SEED)
    candidates, _face_index = mo.sample_surface(verts, faces, 7200, rng)
    candidates = mo.project_to_iso(sdf, candidates, iterations=8)
    spacing = grammar["targetHeight"] / 26.0
    candidates = mo.relax_points(candidates, sdf, spacing=spacing, iterations=6)
    start = int(np.argmax(candidates[:, 2]))
    order = farthest_point_order(candidates, 890, start)
    surface = candidates[order]
    normals = mo.sdf_gradient(sdf, surface)

    out = records_a.copy()
    right_active_ids = np.flatnonzero(right & (records_a["status"] == m3.STATUS_ACTIVE))
    right_active_ids = right_active_ids[np.argsort(out["lodPriority"][right_active_ids], kind="stable")]
    if len(right_active_ids) != 890:
        raise SystemExit("active right id count")
    encoded, orientation = encode_normals(normals)
    out["position"][right_active_ids] = surface.astype(np.float32)
    out["normal"][right_active_ids] = encoded
    out["orientation"][right_active_ids] = orientation

    right_inactive = np.flatnonzero(right & (records_a["status"] != m3.STATUS_ACTIVE))
    if len(right_inactive):
        inactive_order = right_inactive[np.argsort(out["lodPriority"][right_inactive], kind="stable")]
        anchors = surface[np.arange(len(inactive_order)) % len(surface)]
        inward = mo.sdf_gradient(sdf, anchors)
        depth = 0.045 + 0.04 * ((np.arange(len(inactive_order)) * 2654435761 % 65521) / 65521.0)
        interior = anchors - inward * depth[:, None]
        interior = mo.project_to_iso(sdf, interior, level=0.035, iterations=5)
        n_in, o_in = encode_normals(mo.sdf_gradient(sdf, interior))
        out["position"][inactive_order] = interior.astype(np.float32)
        out["normal"][inactive_order] = n_in
        out["orientation"][inactive_order] = o_in

    if not np.array_equal(out["component"], records_a["component"]):
        raise SystemExit("component mutated")
    if not np.array_equal(out["status"], records_a["status"]):
        raise SystemExit("status mutated")
    if not np.array_equal(out["lodPriority"], records_a["lodPriority"]):
        raise SystemExit("lodPriority mutated")
    if not np.array_equal(out["shell"], records_a["shell"]):
        raise SystemExit("shell mutated")
    if not np.array_equal(out["flags"], records_a["flags"]):
        raise SystemExit("flags mutated")
    if not np.array_equal(out["transitionGroup"], records_a["transitionGroup"]):
        raise SystemExit("transitionGroup mutated")

    a_bytes = np.frombuffer(records_a.tobytes(), dtype=np.uint8).reshape(IDENTITY_SIZE, STRIDE)
    r_bytes = np.frombuffer(out.tobytes(), dtype=np.uint8).reshape(IDENTITY_SIZE, STRIDE)
    non_right = ~right
    non_right_diff = int(np.max(np.abs(a_bytes[non_right].astype(np.int16) - r_bytes[non_right].astype(np.int16)))) if np.any(non_right) else 0
    if non_right_diff != 0:
        raise SystemExit(f"non-right byte difference {non_right_diff}")
    changed = np.any(a_bytes != r_bytes, axis=1)
    if np.any(changed & non_right):
        raise SystemExit("non-right record changed")

    payload = out.tobytes()
    r1_hash = sha256_bytes(payload)
    design_bin = STAGE_DIR / "variants" / "a-r1" / "single-event.state.bin"
    public_bin = PUBLIC_VARIANTS / "a-r1" / "single-event.state.bin"
    write_bytes(design_bin, payload)
    write_bytes(public_bin, payload)
    write_bytes(STAGE_DIR / "variants" / "a-r1" / "event-part.u8.bin", parts.tobytes())
    write_bytes(PUBLIC_VARIANTS / "a-r1" / "event-part.u8.bin", parts.tobytes())

    sidecar = {
        "variant": "a-r1",
        "eventPartNames": list(PART_NAMES),
        "activeCounts": {
            name: int(np.count_nonzero(active_mask(out, name)))
            for name in PART_NAMES
        },
        "lodPrefixPresence": lod_presence(out),
    }
    write_json(STAGE_DIR / "variants" / "a-r1" / "event-part.json", sidecar)
    write_json(PUBLIC_VARIANTS / "a-r1" / "event-part.json", sidecar)

    new_right = out["position"][right & (out["status"] == m3.STATUS_ACTIVE)].astype(np.float64)
    new_m = measure_cloud(new_right)
    finite = bool(np.isfinite(out["position"]).all() and np.isfinite(out["normal"]).all())
    conn = connectivity_3d(new_right)
    centre_new = out["position"][active_mask(out, "figure-centre")].astype(np.float64)
    arch = out["position"][(out["component"] == 1) & (out["status"] == m3.STATUS_ACTIVE)].astype(np.float64)
    min_centre = float(cKDTree(centre_new).query(new_right, k=1, workers=1)[0].min())
    min_arch = float(cKDTree(arch).query(new_right, k=1, workers=1)[0].min()) if len(arch) else 1.0
    base_clearance = float(new_m["baseZ"] - deck_z)

    public_m31r = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1r"
    manifest = read_json(public_m31r / "manifest.json")
    entry = next(item for item in manifest["states"] if item["stateId"] == "single-event")
    sil180 = render_isolated(out, entry, manifest, "silhouette180")
    sil96 = render_isolated(out, entry, manifest, "silhouette96")
    sil180_m = silhouette_metrics(sil180)
    sil96_m = silhouette_metrics(sil96)

    lod = lod_presence(out)
    lod_ok = all(lod[str(prefix)]["figure-right"] == EXPECTED_RIGHT_LOD[prefix] for prefix in LOD_PREFIXES)
    a_lod = lod_presence(records_a)
    lod_same_as_a = lod == a_lod

    forbidden_changed = []
    for field in FORBIDDEN_FIELDS:
        if not np.array_equal(out[field], records_a[field]):
            forbidden_changed.append(field)

    changed_right = int(np.count_nonzero(changed & right))
    right_ids = np.flatnonzero(right)
    id_ranges = []
    start = int(right_ids[0])
    prev = start
    for value in right_ids[1:]:
        if int(value) == prev + 1:
            prev = int(value)
            continue
        id_ranges.append([start, prev])
        start = prev = int(value)
    id_ranges.append([start, prev])

    metrics = {
        "n": IDENTITY_SIZE,
        "activeCount": int(np.count_nonzero(out["status"] == m3.STATUS_ACTIVE)),
        "figureRightActive": 890,
        "finite": finite,
        "noNaNInf": finite,
        "collapsedVolume": bool(new_m["height"] < 0.15 or new_m["width"] < 0.08),
        "bbox": new_m["bbox"],
        "centroid": new_m["centroid"],
        "before": right_m,
        "after": new_m,
        "left": left_m,
        "centre": centre_m,
        "deckZ": deck_z,
        "baseClearance": base_clearance,
        "minDistanceToCentre": min_centre,
        "minDistanceToArch": min_arch,
        "connectivity3d": conn,
        "silhouette180": sil180_m,
        "silhouette96": sil96_m,
        "lodPrefixPresence": lod,
        "lodMatchesEventA": lod_same_as_a,
        "lodCountsOk": lod_ok,
        "contentHash": r1_hash,
        "eventAHash": EVENT_A_HASH,
        "sourceUnchanged": sha256_file(event_a_path) == EVENT_A_HASH,
    }
    gates = {
        "finite": finite,
        "notCollapsed": not metrics["collapsedVolume"],
        "noOrphans": conn["pass"],
        "sameIds": bool(np.array_equal(out["lodPriority"], records_a["lodPriority"])),
        "sameStatus": bool(np.array_equal(out["status"], records_a["status"])),
        "active890": metrics["figureRightActive"] == 890,
        "lodCounts": lod_ok and lod_same_as_a,
        "silhouetteConnected180": sil180_m["connected"] and sil180_m["maxInternalRowGap"] <= 3,
        "silhouetteConnected96": sil96_m["connected"] and sil96_m["maxInternalRowGap"] <= 2,
        "baseNotFloating": base_clearance <= 0.045,
        "baseNotSunk": base_clearance >= -0.06,
        "noCentreIntersect": min_centre >= 0.045,
        "noArchIntersect": min_arch >= 0.04,
        "nonRightIdentity": non_right_diff == 0,
        "forbiddenUnchanged": len(forbidden_changed) == 0,
        "torsoNotStem": new_m["torsoWidth"] >= 0.78 * new_m["headWidth"],
        "headDistinct": new_m["headWidth"] >= 0.62 * new_m["torsoWidth"],
        "massVsLeft": new_m["width"] >= 0.82 * left_m["width"],
    }
    metrics["gates"] = gates
    metrics["machinePass"] = all(gates.values())

    proof = {
        "eventAHash": EVENT_A_HASH,
        "eventAR1Hash": r1_hash,
        "recordCount": IDENTITY_SIZE,
        "rightFigureRecordCount": int(np.count_nonzero(right)),
        "rightFigureActiveCount": 890,
        "changedRecordCount": changed_right,
        "allowedChangedFields": list(ALLOWED_FIELDS),
        "forbiddenFields": list(FORBIDDEN_FIELDS),
        "forbiddenFieldsUnchanged": forbidden_changed == [],
        "maxByteDifferenceNonRightRecords": non_right_diff,
        "nonRightByteDifference": non_right_diff,
        "changedPersistentIdRanges": id_ranges,
        "changedPersistentIdCount": changed_right,
        "statusCountsBefore": status_counts(records_a),
        "statusCountsAfter": status_counts(out),
        "componentCountsBefore": component_counts(records_a),
        "componentCountsAfter": component_counts(out),
        "lodPresenceBefore": a_lod,
        "lodPresenceAfter": lod,
        "bboxBefore": right_m["bbox"],
        "bboxAfter": new_m["bbox"],
        "centroidBefore": right_m["centroid"],
        "centroidAfter": new_m["centroid"],
        "eventASourceUnchanged": sha256_file(event_a_path) == EVENT_A_HASH,
        "eventAPublicUnchanged": sha256_file(PUBLIC_VARIANTS / "a" / "single-event.state.bin") == EVENT_A_HASH,
        "baselineUnchanged": sha256_file(M52_DIR / "variants" / "baseline" / "single-event.state.bin") == BASELINE_HASH,
        "pass": non_right_diff == 0 and forbidden_changed == [] and sha256_file(event_a_path) == EVENT_A_HASH,
    }

    extra = {
        "kind": "selective-figure-right-refinement",
        "displayName": "EVENT_A_R1 — selected A direction, refined right figure",
        "derivedFrom": "EVENT_A",
        "ownerDirectionSelected": True,
        "canonicalSelectionPendingHumanReview": True,
        "modifiedPart": "figure-right",
        "eventPart": EVENT_PART_RIGHT,
        "component": COMPONENT_RIGHT,
        "transformChain": grammar["transformChain"],
        "rigidProofInheritedFromEventA": True,
    }
    manifest = {
        "variant": "a-r1",
        "identitySize": IDENTITY_SIZE,
        "bufferBytes": len(payload),
        "bufferPath": "variants/a-r1/single-event.state.bin",
        "n": IDENTITY_SIZE,
        "activeCount": metrics["activeCount"],
        "reserveCount": int(np.count_nonzero(out["status"] == m3.STATUS_RESERVE)),
        "subsurfaceCount": int(np.count_nonzero(out["status"] == m3.STATUS_SUBSURFACE)),
        "finite": finite,
        "bbox": {
            "min": [float(v) for v in out["position"][out["status"] == m3.STATUS_ACTIVE].min(axis=0)],
            "max": [float(v) for v in out["position"][out["status"] == m3.STATUS_ACTIVE].max(axis=0)],
        },
        "centroid": [float(v) for v in out["position"][out["status"] == m3.STATUS_ACTIVE].mean(axis=0)],
        "componentCounts": component_counts(out),
        "contentHash": r1_hash,
        "lodPriorityIsIdentity": bool(np.array_equal(out["lodPriority"], np.arange(IDENTITY_SIZE, dtype=np.uint16))),
        **extra,
        "activePartCounts": sidecar["activeCounts"],
        "lodPrefixPresence": lod,
    }
    write_json(STAGE_DIR / "variants" / "a-r1" / "manifest.json", manifest)
    write_json(PUBLIC_VARIANTS / "a-r1" / "manifest.json", manifest)
    write_json(STAGE_DIR / "authoring" / "parameters.json", grammar)
    write_json(STAGE_DIR / "authoring" / "measurements.json", {"left": left_m, "centre": centre_m, "rightBefore": right_m, "rightAfter": new_m, "deckZ": deck_z})
    write_json(STAGE_DIR / "authoring" / "export-log.json", {
        "stage": "PS-04.M5.2.R1",
        "seed": SEED,
        "eventAHash": EVENT_A_HASH,
        "eventAR1Hash": r1_hash,
        "grammar": grammar,
        "changedFields": list(ALLOWED_FIELDS),
        "rightActiveMapped": 890,
        "mesh": {"vertices": int(len(verts)), "faces": int(len(faces))},
        "deterministic": True,
    })
    write_json(STAGE_DIR / "reports" / "selective-edit-proof.json", proof)
    write_json(STAGE_DIR / "reports" / "a-r1-metrics.json", metrics)

    sil_dir = STAGE_DIR / "renders" / "silhouettes"
    sil_dir.mkdir(parents=True, exist_ok=True)
    from PIL import Image
    Image.fromarray(sil180, "RGB").save(sil_dir / "a-r1-isolated-right-180.png")
    Image.fromarray(sil96, "RGB").save(sil_dir / "a-r1-isolated-right-96.png")

    again = sha256_file(design_bin)
    if again != r1_hash:
        raise SystemExit("written hash mismatch")
    print(json.dumps({
        "hash": r1_hash,
        "nonRightByteDifference": non_right_diff,
        "changedRight": changed_right,
        "gates": gates,
        "machinePass": metrics["machinePass"],
        "silhouette96Gap": sil96_m["maxInternalRowGap"],
        "silhouette180Gap": sil180_m["maxInternalRowGap"],
        "baseClearance": base_clearance,
        "minCentre": min_centre,
        "minArch": min_arch,
    }, indent=2))
    return 0 if metrics["machinePass"] and proof["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
