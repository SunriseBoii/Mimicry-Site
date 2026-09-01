"""PS-04.M5.2.R2 — selective VIEWER-RIGHT figure refinement of EVENT_A.

Chain:
    frozen BASELINE
    → EVENT_A rigid +180° Z
    → selective VIEWER-RIGHT figure refinement
    → EVENT_A_R2

Geometry source is byte-exact original EVENT_A (not EVENT_A_R1).
Only geometric fields of the proven viewer-right records are rewritten.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy.ndimage import binary_closing, label
from scipy.spatial import cKDTree
from skimage import measure

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

PHOTONIC_DIR = SCRIPT_DIR.parent.parent
for extra in (
    PHOTONIC_DIR / "ps-03-m" / "scripts",
    PHOTONIC_DIR / "ps-03-m2" / "scripts",
    PHOTONIC_DIR / "ps-03-m3" / "scripts",
    PHOTONIC_DIR / "ps-03-m3-1r" / "scripts",
):
    if str(extra) not in sys.path:
        sys.path.insert(0, str(extra))

import geometry_providers as gp  # noqa: E402
import mesh_ops as mo  # noqa: E402
import state_builder as m3  # noqa: E402
from m31r_core import projected_splats, render_projection  # noqa: E402

from r2_common import (  # noqa: E402
    ALLOWED_FIELDS,
    BASELINE_HASH,
    COMPONENT_TO_PART,
    EVENT_A_HASH,
    EVENT_A_R1_HASH,
    EXPECTED_VIEWER_RIGHT_LOD,
    FORBIDDEN_FIELDS,
    IDENTITY_SIZE,
    LOD_PREFIXES,
    M52_DIR,
    M52R1_DIR,
    MINIMUM_GEOMETRIC_SCALE,
    PUBLIC_M31R,
    PUBLIC_VARIANTS,
    SEED,
    SEMANTIC_NAMES,
    STAGE_DIR,
    STRIDE,
    component_visible,
    event_part_of,
    figure_mask,
    load_event_a,
    load_event_a_r1,
    nearest_neighbour,
    presentation_frame,
    present_points,
    project_centroid,
    project_points,
    read_json,
    shader_radius,
    sha256_bytes,
    sha256_file,
    single_event_entry,
    write_bytes,
    write_json,
)

PART_NAMES = ("stage", "figure-centre", "figure-left", "figure-right")
MAP_PATH = STAGE_DIR / "reports" / "screen-space-part-map.json"


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
                    "b": [0.0, 0.0, params["torsoTop"]],
                    "radiusA": params["baseRadius"],
                    "radiusB": params["shoulderRadius"],
                },
            },
            {
                "provider": "capsule",
                "params": {"a": [0.0, 0.0, params["neckA"]], "b": [0.0, 0.0, params["neckB"]], "radius": params["neckRadius"]},
            },
            {
                "provider": "ellipsoid",
                "params": {
                    "radii": [params["headRadius"], params["headRadius"] * 0.92, params["headRadius"] * 1.06],
                    "center": [0.0, 0.0, params["headCenterZ"]],
                },
            },
        ],
    }


def derive_grammar(viewer_left: dict, centre: dict, target: dict, deck_z: float) -> dict:
    height = float(np.clip(0.54 * viewer_left["height"] + 0.46 * centre["height"], min(viewer_left["height"], centre["height"]), 0.96 * centre["height"]))
    width = float(0.58 * viewer_left["width"] + 0.42 * centre["width"])
    head_r = float(0.54 * (viewer_left["headWidth"] / 2.0) + 0.46 * (centre["headWidth"] / 2.0))
    torso_r_ref = float(0.54 * (viewer_left["torsoWidth"] / 2.0) + 0.46 * (centre["torsoWidth"] / 2.0))
    shoulder_r = float(min(head_r * 0.96, torso_r_ref * 0.88))
    base_r = float(max(shoulder_r * 1.16, min(torso_r_ref * 0.98, head_r * 1.10)))
    torso_base = base_r
    torso_top = height - 1.72 * head_r
    head_z = torso_top + head_r * 0.52
    neck_a = torso_top - 0.012 * height
    neck_b = head_z - 0.22 * head_r
    neck_r = float(max(shoulder_r * 0.76, head_r * 0.58))
    yaw = float(target["yawDegrees"])
    if abs(yaw - (-viewer_left["yawDegrees"])) < 8:
        yaw = yaw + 11.0
    base_z = float(target["baseZ"])
    if base_z - deck_z > 0.04:
        base_z = deck_z - 0.008
    if base_z - deck_z < -0.04:
        base_z = deck_z - 0.012
    translate = [float(target["centroid"][0]), float(target["centroid"][1]), base_z]
    return {
        "kind": "smooth-union ellipsoid head + tapered-capsule torso + short neck",
        "seed": SEED,
        "derivedFrom": "EVENT_A viewer-right pose; proportions from viewer-left/centre range",
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
        "keptTargetCentroidXY": [float(target["centroid"][0]), float(target["centroid"][1])],
        "deckZ": deck_z,
        "baseZ": base_z,
        "transformChain": [
            "frozen BASELINE",
            "EVENT_A rigid +180° Z",
            "selective VIEWER-RIGHT figure refinement",
            "EVENT_A_R2",
        ],
    }


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
    bbox_h = int(rows[-1] - rows[0] + 1) if len(rows) else 0
    bbox_w = int(cols[-1] - cols[0] + 1) if len(cols) else 0
    bbox_area = max(bbox_h * bbox_w, 1)
    return {
        "occupied": pixels,
        "bboxRows": [int(rows[0]), int(rows[-1])] if len(rows) else [0, 0],
        "bboxCols": [int(cols[0]), int(cols[-1])] if len(cols) else [0, 0],
        "bboxOccupancyRatio": float(pixels / bbox_area),
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


def force_viewer_right_visible(entry: dict, component: int) -> dict:
    clone = json.loads(json.dumps(entry))
    profiles = ["desktop", "mobile390", "silhouette180", "silhouette96"]
    for item in clone["componentMap"]:
        if int(item["componentIndex"]) == component:
            item["visibleProfiles"] = list(profiles)
    return clone


def render_isolated(records: np.ndarray, entry: dict, manifest: dict, component: int, profile: str, *, silhouette: bool = True) -> np.ndarray:
    isolated = records.copy()
    keep = (isolated["component"] == component) & (isolated["status"] == m3.STATUS_ACTIVE)
    isolated["status"][~keep] = m3.STATUS_RESERVE
    projected = projected_splats(manifest, force_visible(entry), isolated, "canonical", profile)
    return render_projection(projected, silhouette=silhouette)


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


def coverage_for(records: np.ndarray, component: int, entry: dict, frame: dict, *, packed_visible: bool) -> dict:
    mask = figure_mask(records, component)
    points = records["position"][mask].astype(np.float64)
    scales = records["scale"][mask].astype(np.float64)
    presented = present_points(points, frame)
    nn = nearest_neighbour(presented)
    footprint = float(np.median(shader_radius(scales, visible=packed_visible, frame_scale=frame["scale"])))
    projected = project_points(points, frame, "canonical")
    screen = np.stack([projected["screenX"], projected["screenY"]], axis=1)
    screen_nn = nearest_neighbour(screen)
    return {
        "visibleInstanceCount": int(mask.sum()),
        "medianProjectedInstanceFootprint": footprint,
        "nearestNeighbourGapPresented": nn["median"],
        "nearestNeighbourGapScreenPx": screen_nn["median"],
        "coverageRatio": float(footprint / max(nn["median"] or 1.0, 1e-9)),
        "packedVisible": packed_visible,
    }


def id_ranges(ids: np.ndarray) -> list[list[int]]:
    if len(ids) == 0:
        return []
    ranges = []
    start = prev = int(ids[0])
    for value in ids[1:]:
        if int(value) == prev + 1:
            prev = int(value)
            continue
        ranges.append([start, prev])
        start = prev = int(value)
    ranges.append([start, prev])
    return ranges


def load_mapping() -> dict:
    if not MAP_PATH.exists():
        raise SystemExit("screen-space-part-map.json missing; run prove_screen_space.py first")
    mapping = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    if not mapping.get("authoringMayProceed"):
        raise SystemExit("screen-space mapping forbids automatic authoring")
    right = mapping["viewerRight"]
    if right["componentId"] != 2 or right["eventPart"] != 2 or right["activeCount"] != 1014:
        raise SystemExit(f"unexpected viewer-right mapping {right}")
    return mapping


def main() -> int:
    mapping = load_mapping()
    VIEWER_RIGHT_COMPONENT = int(mapping["viewerRight"]["VIEWER_RIGHT_COMPONENT"])
    VIEWER_RIGHT_EVENT_PART = int(mapping["viewerRight"]["VIEWER_RIGHT_EVENT_PART"])
    VIEWER_LEFT_COMPONENT = int(mapping["viewerLeft"]["componentId"])
    VIEWER_CENTRE_COMPONENT = int(mapping["viewerCentre"]["componentId"])
    TARGET_ACTIVE = int(mapping["viewerRight"]["activeCount"])

    records_a = load_event_a()
    records_r1 = load_event_a_r1()
    part_path = M52_DIR / "variants" / "a" / "event-part.u8.bin"
    parts = np.frombuffer(part_path.read_bytes(), dtype=np.uint8).copy()
    if len(parts) != IDENTITY_SIZE:
        raise SystemExit("event-part length")
    target = (parts == VIEWER_RIGHT_EVENT_PART) & (records_a["component"] == VIEWER_RIGHT_COMPONENT)
    if not np.array_equal(target, records_a["component"] == VIEWER_RIGHT_COMPONENT):
        raise SystemExit("viewer-right eventPart/component mismatch")
    if int(np.count_nonzero(target & (records_a["status"] == m3.STATUS_ACTIVE))) != TARGET_ACTIVE:
        raise SystemExit("viewer-right active count mismatch")

    viewer_left_pts = records_a["position"][figure_mask(records_a, VIEWER_LEFT_COMPONENT)].astype(np.float64)
    centre_pts = records_a["position"][figure_mask(records_a, VIEWER_CENTRE_COMPONENT)].astype(np.float64)
    target_pts = records_a["position"][target & (records_a["status"] == m3.STATUS_ACTIVE)].astype(np.float64)
    deck_pts = records_a["position"][(records_a["component"] == 0) & (records_a["status"] == m3.STATUS_ACTIVE)].astype(np.float64)
    left_m = measure_cloud(viewer_left_pts)
    centre_m = measure_cloud(centre_pts)
    target_m = measure_cloud(target_pts)
    near = np.linalg.norm(deck_pts[:, :2] - np.asarray(target_m["centroid"][:2]), axis=1) < max(target_m["width"], 0.35)
    deck_z = float(np.quantile(deck_pts[near][:, 2], 0.92)) if int(near.sum()) >= 8 else float(np.quantile(deck_pts[:, 2], 0.85))
    grammar = derive_grammar(left_m, centre_m, target_m, deck_z)
    sdf = gp.compile_node(figure_provider(grammar))

    world_center = np.array([
        grammar["translate"][0],
        grammar["translate"][1],
        grammar["translate"][2] + 0.52 * grammar["targetHeight"],
    ], dtype=np.float64)
    half = 0.72 * grammar["targetHeight"] + 0.22
    verts, faces = eval_sdf_box(sdf, world_center, half, 96)
    if len(verts) < 80 or len(faces) < 80:
        raise SystemExit(f"collapsed mesh v={len(verts)} f={len(faces)}")

    rng = np.random.default_rng(SEED)
    candidates, _face_index = mo.sample_surface(verts, faces, 7800, rng)
    candidates = mo.project_to_iso(sdf, candidates, iterations=8)
    spacing = grammar["targetHeight"] / 28.0
    candidates = mo.relax_points(candidates, sdf, spacing=spacing, iterations=6)
    start = int(np.argmax(candidates[:, 2]))
    order = farthest_point_order(candidates, TARGET_ACTIVE, start)
    surface = candidates[order]
    normals = mo.sdf_gradient(sdf, surface)

    out = records_a.copy()
    target_active_ids = np.flatnonzero(target & (records_a["status"] == m3.STATUS_ACTIVE))
    target_active_ids = target_active_ids[np.argsort(out["lodPriority"][target_active_ids], kind="stable")]
    if len(target_active_ids) != TARGET_ACTIVE:
        raise SystemExit("active viewer-right id count")
    encoded, orientation = encode_normals(normals)
    out["position"][target_active_ids] = surface.astype(np.float32)
    out["normal"][target_active_ids] = encoded
    out["orientation"][target_active_ids] = orientation

    target_inactive = np.flatnonzero(target & (records_a["status"] != m3.STATUS_ACTIVE))
    if len(target_inactive):
        inactive_order = target_inactive[np.argsort(out["lodPriority"][target_inactive], kind="stable")]
        anchors = surface[np.arange(len(inactive_order)) % len(surface)]
        inward = mo.sdf_gradient(sdf, anchors)
        depth = 0.045 + 0.04 * ((np.arange(len(inactive_order)) * 2654435761 % 65521) / 65521.0)
        interior = anchors - inward * depth[:, None]
        interior = mo.project_to_iso(sdf, interior, level=0.035, iterations=5)
        n_in, o_in = encode_normals(mo.sdf_gradient(sdf, interior))
        out["position"][inactive_order] = interior.astype(np.float32)
        out["normal"][inactive_order] = n_in
        out["orientation"][inactive_order] = o_in

    for field in ("component", "status", "lodPriority", "shell", "flags", "transitionGroup", "scale", "density", "reserveDepth"):
        if not np.array_equal(out[field], records_a[field]):
            raise SystemExit(f"{field} mutated")

    a_bytes = np.frombuffer(records_a.tobytes(), dtype=np.uint8).reshape(IDENTITY_SIZE, STRIDE)
    r_bytes = np.frombuffer(out.tobytes(), dtype=np.uint8).reshape(IDENTITY_SIZE, STRIDE)
    r1_bytes = np.frombuffer(records_r1.tobytes(), dtype=np.uint8).reshape(IDENTITY_SIZE, STRIDE)
    non_target = ~target
    non_target_diff = int(np.max(np.abs(a_bytes[non_target].astype(np.int16) - r_bytes[non_target].astype(np.int16)))) if np.any(non_target) else 0
    if non_target_diff != 0:
        raise SystemExit(f"non-target byte difference {non_target_diff}")
    changed = np.any(a_bytes != r_bytes, axis=1)
    if np.any(changed & non_target):
        raise SystemExit("non-target record changed")

    viewer_left_mask = records_a["component"] == VIEWER_LEFT_COMPONENT
    centre_mask = records_a["component"] == VIEWER_CENTRE_COMPONENT
    stage_mask = records_a["component"] <= 1
    r1_left_mask = records_r1["component"] == VIEWER_LEFT_COMPONENT
    inherited_r1 = int(np.count_nonzero(np.any(r_bytes[viewer_left_mask] != a_bytes[viewer_left_mask], axis=1)))
    r1_geometry_on_left = int(np.max(np.abs(r1_bytes[r1_left_mask].astype(np.int16) - a_bytes[viewer_left_mask].astype(np.int16))))
    r2_left_matches_a = int(np.max(np.abs(r_bytes[viewer_left_mask].astype(np.int16) - a_bytes[viewer_left_mask].astype(np.int16))))
    if r2_left_matches_a != 0:
        raise SystemExit("viewer-left (R1 wrong target) is not byte-identical to EVENT_A")

    payload = out.tobytes()
    r2_hash = sha256_bytes(payload)
    design_bin = STAGE_DIR / "variants" / "a-r2" / "single-event.state.bin"
    public_bin = PUBLIC_VARIANTS / "a-r2" / "single-event.state.bin"
    write_bytes(design_bin, payload)
    write_bytes(public_bin, payload)
    write_bytes(STAGE_DIR / "variants" / "a-r2" / "event-part.u8.bin", parts.tobytes())
    write_bytes(PUBLIC_VARIANTS / "a-r2" / "event-part.u8.bin", parts.tobytes())

    sidecar = {
        "variant": "a-r2",
        "eventPartNames": list(PART_NAMES),
        "activeCounts": {
            name: int(np.count_nonzero((out["status"] == m3.STATUS_ACTIVE) & (np.array([COMPONENT_TO_PART[int(c)] for c in out["component"]]) == name)))
            for name in PART_NAMES
        },
        "lodPrefixPresence": lod_presence(out),
    }
    write_json(STAGE_DIR / "variants" / "a-r2" / "event-part.json", sidecar)
    write_json(PUBLIC_VARIANTS / "a-r2" / "event-part.json", sidecar)

    new_target = out["position"][target & (out["status"] == m3.STATUS_ACTIVE)].astype(np.float64)
    new_m = measure_cloud(new_target)
    finite = bool(np.isfinite(out["position"]).all() and np.isfinite(out["normal"]).all())
    conn = connectivity_3d(new_target)
    centre_new = out["position"][figure_mask(out, VIEWER_CENTRE_COMPONENT)].astype(np.float64)
    arch = out["position"][(out["component"] == 1) & (out["status"] == m3.STATUS_ACTIVE)].astype(np.float64)
    min_centre = float(cKDTree(centre_new).query(new_target, k=1, workers=1)[0].min())
    min_arch = float(cKDTree(arch).query(new_target, k=1, workers=1)[0].min()) if len(arch) else 1.0
    min_left = float(cKDTree(viewer_left_pts).query(new_target, k=1, workers=1)[0].min())
    base_clearance = float(new_m["baseZ"] - deck_z)

    entry = single_event_entry()
    manifest = read_json(PUBLIC_M31R / "manifest.json")
    frame = presentation_frame(entry)
    sil180 = render_isolated(out, entry, manifest, VIEWER_RIGHT_COMPONENT, "silhouette180")
    sil96 = render_isolated(out, entry, manifest, VIEWER_RIGHT_COMPONENT, "silhouette96")
    sil180_m = silhouette_metrics(sil180)
    sil96_m = silhouette_metrics(sil96)

    packed_a = coverage_for(records_a, VIEWER_RIGHT_COMPONENT, entry, frame, packed_visible=component_visible(entry, VIEWER_RIGHT_COMPONENT))
    overlay_r2 = coverage_for(out, VIEWER_RIGHT_COMPONENT, entry, frame, packed_visible=True)
    overlay_left = coverage_for(out, VIEWER_LEFT_COMPONENT, entry, frame, packed_visible=True)
    overlay_centre = coverage_for(out, VIEWER_CENTRE_COMPONENT, entry, frame, packed_visible=True)

    lod = lod_presence(out)
    lod_ok = all(lod[str(prefix)]["figure-left"] == EXPECTED_VIEWER_RIGHT_LOD[prefix] for prefix in LOD_PREFIXES)
    a_lod = lod_presence(records_a)
    lod_same_as_a = lod == a_lod

    forbidden_changed = [field for field in FORBIDDEN_FIELDS if not np.array_equal(out[field], records_a[field])]
    changed_target = int(np.count_nonzero(changed & target))
    byte_diff_by_component = {
        str(index): {
            "semanticName": SEMANTIC_NAMES[index],
            "maxAbs": int(np.max(np.abs(a_bytes[records_a["component"] == index].astype(np.int16) - r_bytes[records_a["component"] == index].astype(np.int16)))) if np.any(records_a["component"] == index) else 0,
            "changedRecords": int(np.count_nonzero(changed & (records_a["component"] == index))),
        }
        for index in range(5)
    }

    flake_vs_left = overlay_r2["medianProjectedInstanceFootprint"] / max(overlay_left["medianProjectedInstanceFootprint"], 1e-12)
    sparse_as_packed_a = packed_a["coverageRatio"] < 0.45 * overlay_left["coverageRatio"]
    flake_like = overlay_r2["coverageRatio"] >= 0.72 * overlay_left["coverageRatio"] and flake_vs_left >= 0.92

    metrics = {
        "n": IDENTITY_SIZE,
        "activeCount": int(np.count_nonzero(out["status"] == m3.STATUS_ACTIVE)),
        "viewerRightActive": TARGET_ACTIVE,
        "VIEWER_RIGHT_COMPONENT": VIEWER_RIGHT_COMPONENT,
        "VIEWER_RIGHT_EVENT_PART": VIEWER_RIGHT_EVENT_PART,
        "SEMANTIC_FIGURE_LEFT_COMPONENT": 2,
        "finite": finite,
        "noNaNInf": finite,
        "collapsedVolume": bool(new_m["height"] < 0.15 or new_m["width"] < 0.08),
        "bbox": new_m["bbox"],
        "centroid": new_m["centroid"],
        "before": target_m,
        "after": new_m,
        "viewerLeft": left_m,
        "centre": centre_m,
        "deckZ": deck_z,
        "baseClearance": base_clearance,
        "minDistanceToCentre": min_centre,
        "minDistanceToArch": min_arch,
        "minDistanceToViewerLeft": min_left,
        "connectivity3d": conn,
        "silhouette180": sil180_m,
        "silhouette96": sil96_m,
        "lodPrefixPresence": lod,
        "lodMatchesEventA": lod_same_as_a,
        "lodCountsOk": lod_ok,
        "contentHash": r2_hash,
        "eventAHash": EVENT_A_HASH,
        "eventAR1Hash": EVENT_A_R1_HASH,
        "sourceUnchanged": sha256_file(M52_DIR / "variants" / "a" / "single-event.state.bin") == EVENT_A_HASH,
        "derivedFromEventANotR1": True,
        "coveragePackedA": packed_a,
        "coverageOverlayR2": overlay_r2,
        "coverageViewerLeft": overlay_left,
        "coverageViewerCentre": overlay_centre,
        "centreRemainsLargest": new_m["height"] <= 0.98 * centre_m["height"] and new_m["width"] <= 1.02 * centre_m["width"],
    }
    gates = {
        "finite": finite,
        "notCollapsed": not metrics["collapsedVolume"],
        "noOrphans": conn["pass"],
        "sameIds": bool(np.array_equal(out["lodPriority"], records_a["lodPriority"])),
        "sameStatus": bool(np.array_equal(out["status"], records_a["status"])),
        "active1014": metrics["viewerRightActive"] == 1014,
        "lodCounts": lod_ok and lod_same_as_a,
        "silhouetteConnected180": sil180_m["connected"] and sil180_m["maxInternalRowGap"] <= 3,
        "silhouetteConnected96": sil96_m["connected"] and sil96_m["maxInternalRowGap"] <= 2,
        "headReadable": new_m["headWidth"] >= 0.62 * new_m["torsoWidth"],
        "torsoReadable": new_m["torsoWidth"] >= 0.78 * new_m["headWidth"],
        "noInternalGap": sil180_m["maxInternalRowGap"] <= 2,
        "baseNotFloating": base_clearance <= 0.045,
        "baseNotSunk": base_clearance >= -0.06,
        "noCentreIntersect": min_centre >= 0.045,
        "noArchIntersect": min_arch >= 0.04,
        "noViewerLeftIntersect": min_left >= 0.04,
        "nonTargetIdentity": non_target_diff == 0,
        "viewerLeftRestoredToA": r2_left_matches_a == 0,
        "r1GeometryNotInherited": inherited_r1 == 0,
        "forbiddenUnchanged": len(forbidden_changed) == 0,
        "centreRemainsLargest": metrics["centreRemainsLargest"],
        "flakeFootprintVsLeft": flake_like,
        "notPointCloudWhenVisible": overlay_r2["coverageRatio"] >= 0.55,
        "packedAWasSparse": sparse_as_packed_a,
        "noGlobalScaleHack": bool(np.array_equal(out["scale"], records_a["scale"])),
    }
    # Silhouette-only is not enough: flake gate must also pass.
    visual_machine = all(gates.values()) and flake_like and overlay_r2["medianProjectedInstanceFootprint"] >= 0.92 * overlay_left["medianProjectedInstanceFootprint"]
    metrics["gates"] = gates
    metrics["machinePass"] = visual_machine
    metrics["visualMachineFailSparse"] = not flake_like

    proof = {
        "eventAHash": EVENT_A_HASH,
        "eventAR1Hash": EVENT_A_R1_HASH,
        "eventAR2Hash": r2_hash,
        "recordCount": IDENTITY_SIZE,
        "sourceChain": ["frozen BASELINE", "EVENT_A rigid +180° Z", "selective VIEWER-RIGHT figure refinement", "EVENT_A_R2"],
        "derivedDirectlyFromEventA": True,
        "derivedFromEventAR1": False,
        "VIEWER_RIGHT_COMPONENT": VIEWER_RIGHT_COMPONENT,
        "VIEWER_RIGHT_EVENT_PART": VIEWER_RIGHT_EVENT_PART,
        "SEMANTIC_FIGURE_LEFT_COMPONENT": 2,
        "targetIds": id_ranges(np.flatnonzero(target)),
        "targetRecordCount": int(np.count_nonzero(target)),
        "targetActiveCount": TARGET_ACTIVE,
        "changedRecordCount": changed_target,
        "changedFields": list(ALLOWED_FIELDS),
        "scaleDensityUnchanged": True,
        "forbiddenFields": list(FORBIDDEN_FIELDS),
        "forbiddenFieldsUnchanged": forbidden_changed == [],
        "byteDifferenceByComponent": byte_diff_by_component,
        "nonTargetByteDifference": non_target_diff,
        "viewerLeftByteDifferenceVsA": r2_left_matches_a,
        "viewerCentreByteDifferenceVsA": byte_diff_by_component[str(VIEWER_CENTRE_COMPONENT)]["maxAbs"],
        "stageByteDifferenceVsA": byte_diff_by_component["0"]["maxAbs"],
        "archByteDifferenceVsA": byte_diff_by_component["1"]["maxAbs"],
        "r1WrongTargetComponent": 4,
        "r1WrongTargetStillPresentInR1File": r1_geometry_on_left > 0,
        "r2ViewerLeftMatchesOriginalA": r2_left_matches_a == 0,
        "wrongR1GeometryNotInherited": inherited_r1 == 0,
        "idsStatusComponentShellFlagsTransitionLodUnchanged": True,
        "statusCountsBefore": status_counts(records_a),
        "statusCountsAfter": status_counts(out),
        "componentCountsBefore": component_counts(records_a),
        "componentCountsAfter": component_counts(out),
        "lodPresenceBefore": a_lod,
        "lodPresenceAfter": lod,
        "bboxBefore": target_m["bbox"],
        "bboxAfter": new_m["bbox"],
        "centroidBefore": target_m["centroid"],
        "centroidAfter": new_m["centroid"],
        "eventASourceUnchanged": sha256_file(M52_DIR / "variants" / "a" / "single-event.state.bin") == EVENT_A_HASH,
        "eventAPublicUnchanged": sha256_file(PUBLIC_VARIANTS / "a" / "single-event.state.bin") == EVENT_A_HASH,
        "eventAR1Unchanged": sha256_file(M52R1_DIR / "variants" / "a-r1" / "single-event.state.bin") == EVENT_A_R1_HASH,
        "baselineUnchanged": sha256_file(M52_DIR / "variants" / "baseline" / "single-event.state.bin") == BASELINE_HASH,
        "pass": non_target_diff == 0 and forbidden_changed == [] and r2_left_matches_a == 0 and inherited_r1 == 0,
    }

    extra = {
        "kind": "selective-viewer-right-refinement",
        "displayName": "EVENT_A_R2 — selected A direction, viewer-right figure refined",
        "derivedFrom": "EVENT_A",
        "notDerivedFrom": "EVENT_A_R1",
        "ownerDirectionSelected": True,
        "canonicalSelectionPendingHumanReview": True,
        "modifiedPart": "viewer-right",
        "semanticName": "figure-left",
        "eventPart": VIEWER_RIGHT_EVENT_PART,
        "component": VIEWER_RIGHT_COMPONENT,
        "transformChain": grammar["transformChain"],
        "rigidProofInheritedFromEventA": True,
        "visibilityOverlayRequired": True,
        "visibilityOverlayNote": "Sandbox a-r2 must add desktop/mobile/silhouette visibleProfiles for component 2. Frozen aggregate componentMap stays untouched.",
    }
    manifest_out = {
        "variant": "a-r2",
        "identitySize": IDENTITY_SIZE,
        "bufferBytes": len(payload),
        "bufferPath": "variants/a-r2/single-event.state.bin",
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
        "contentHash": r2_hash,
        "lodPriorityIsIdentity": bool(np.array_equal(out["lodPriority"], np.arange(IDENTITY_SIZE, dtype=np.uint16))),
        **extra,
        "activePartCounts": sidecar["activeCounts"],
        "lodPrefixPresence": lod,
    }
    write_json(STAGE_DIR / "variants" / "a-r2" / "manifest.json", manifest_out)
    write_json(PUBLIC_VARIANTS / "a-r2" / "manifest.json", manifest_out)
    write_json(STAGE_DIR / "authoring" / "parameters.json", grammar)
    write_json(STAGE_DIR / "authoring" / "measurements.json", {
        "viewerLeft": left_m,
        "centre": centre_m,
        "viewerRightBefore": target_m,
        "viewerRightAfter": new_m,
        "deckZ": deck_z,
    })
    write_json(STAGE_DIR / "authoring" / "export-log.json", {
        "stage": "PS-04.M5.2.R2",
        "seed": SEED,
        "eventAHash": EVENT_A_HASH,
        "eventAR2Hash": r2_hash,
        "grammar": grammar,
        "changedFields": list(ALLOWED_FIELDS),
        "viewerRightActiveMapped": TARGET_ACTIVE,
        "mesh": {"vertices": int(len(verts)), "faces": int(len(faces))},
        "deterministic": True,
        "source": "original EVENT_A",
    })
    write_json(STAGE_DIR / "reports" / "selective-edit-proof.json", proof)
    write_json(STAGE_DIR / "reports" / "a-r2-metrics.json", metrics)
    write_json(STAGE_DIR / "reports" / "lod-validation.json", {
        "expected": EXPECTED_VIEWER_RIGHT_LOD,
        "actual": {int(k): lod[str(k)]["figure-left"] for k in LOD_PREFIXES},
        "matchesEventA": lod_same_as_a,
        "pass": lod_ok and lod_same_as_a,
    })
    write_json(STAGE_DIR / "reports" / "instance-coverage.json", {
        "formula": "radius = scale * mix(0.18,1,activation) * 0.035 * presentationFrame.scale",
        "minimumGeometricScale": MINIMUM_GEOMETRIC_SCALE,
        "originalAPacked": packed_a,
        "aR2OverlayVisible": overlay_r2,
        "viewerLeft": overlay_left,
        "viewerCentre": overlay_centre,
        "flakeFootprintRatioVsLeft": flake_vs_left,
        "pointCloudOnOriginalA": sparse_as_packed_a,
        "flakeLikeOnAR2WhenVisible": flake_like,
        "silhouette180": sil180_m,
        "silhouette96": sil96_m,
        "pass": flake_like and sil180_m["connected"] and sil96_m["connected"],
    })

    sil_dir = STAGE_DIR / "renders" / "silhouettes"
    sil_dir.mkdir(parents=True, exist_ok=True)
    from PIL import Image
    Image.fromarray(sil180, "RGB").save(sil_dir / "a-r2-isolated-viewer-right-180.png")
    Image.fromarray(sil96, "RGB").save(sil_dir / "a-r2-isolated-viewer-right-96.png")

    again = sha256_file(design_bin)
    if again != r2_hash:
        raise SystemExit("written hash mismatch")
    print(json.dumps({
        "hash": r2_hash,
        "nonTargetByteDifference": non_target_diff,
        "changedTarget": changed_target,
        "viewerLeftRestored": r2_left_matches_a == 0,
        "gates": gates,
        "machinePass": metrics["machinePass"],
        "flakeFootprintRatioVsLeft": flake_vs_left,
        "silhouette96Gap": sil96_m["maxInternalRowGap"],
        "silhouette180Gap": sil180_m["maxInternalRowGap"],
        "baseClearance": base_clearance,
        "minCentre": min_centre,
        "minArch": min_arch,
    }, indent=2))
    return 0 if metrics["machinePass"] and proof["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
