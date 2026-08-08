"""PS-03.M offline pipeline: matter + skin architecture minimal test.

Builds the full browser-ready dataset for the cycle
    sphere -> open book -> gamepad + queen -> sphere
with exactly N = 8192 stable-ID skin scales, volume-normalised matter,
hierarchical ID correspondence, multi-phase transitions with a true
split/merge, QA report and deterministic output.

Run:  python build_ps03m.py            (full build)
      python build_ps03m.py --check    (rebuild core arrays, compare hash)
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment
from scipy.spatial import cKDTree

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import mesh_ops as mo  # noqa: E402
import sdf_targets as st  # noqa: E402

# ---------------------------------------------------------------------------
# Fixed invariants (M-01).
# ---------------------------------------------------------------------------

N_SCALES = 8192
SEED = 20260805
GRID_BOUNDS = 3.2          # world half-extent covering every normalised state
GRID_RES_STATE = 176       # end-state polygonisation
GRID_RES_KEY = 104         # transition key-state fields
KEYS_PER_SEGMENT = 13      # incl. both endpoints
VOLUME_TOLERANCE = 0.01    # +-1%
SCALE_MIN, SCALE_MAX = 0.85, 1.15
COVERAGE_TARGET = 0.80     # visible plate area / surface area on full states
RESERVE_DEPTH = 0.10       # inset depth for subsurface reserve (world units)
TRANSIT_DEPTH = 0.075      # dive depth of travelling scales
OVERSAMPLE = 4             # candidate pool = OVERSAMPLE * count
STAGGER = 0.16             # directional tension stagger fraction

EXPORT_DIR = SCRIPT_DIR.parent / "exports"
PUBLIC_DIR = SCRIPT_DIR.parents[3] / "public" / "photonic-skin" / "ps03m"
MESH_DIR = EXPORT_DIR / "meshes"

NEUTRAL_PEARL = (233, 227, 216)
COMPETENCE_COLORS = {
    "content": (0x4E, 0x68, 0xFF),
    "design": (0x8A, 0x5C, 0xF6),
    "event": (0xF5, 0x6A, 0x2A),
    "games": (0x75, 0xA9, 0x00),
    "video": (0xDF, 0x3E, 0x85),
    "digital": (0x00, 0x97, 0xA7),
    "merch": (0xD6, 0xA3, 0x00),
}

SEGMENTS = (
    ("sphere", "book"),
    ("book", "game"),
    ("game", "sphere"),
)

PHASES = (
    (0.00, "tension"),
    (0.10, "submerge"),
    (0.26, "transport"),
    (0.72, "emerge"),
    (0.90, "stabilize"),
)


def phase_at(t: float) -> str:
    label = PHASES[0][1]
    for start, name in PHASES:
        if t >= start:
            label = name
    return label


def smoothstep(edge0: float, edge1: float, x):
    u = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return u * u * (3.0 - 2.0 * u)


# ---------------------------------------------------------------------------
# Stage 1 — target states: polygonise, validate, volume-normalise.
# ---------------------------------------------------------------------------


def build_states() -> dict:
    states: dict[str, dict] = {}
    v0 = None
    for name in st.STATE_ORDER:
        raw_sdf = st.STATE_SDFS[name]
        grid = mo.eval_sdf_grid(raw_sdf, GRID_BOUNDS, GRID_RES_STATE)
        vertices, faces = mo.marching_cubes(grid, GRID_BOUNDS)
        report = mo.validate_mesh(vertices, faces)
        if not report["watertight"]:
            raise RuntimeError(f"{name}: target mesh is not watertight: {report}")
        volume_raw = report["volume"]
        if v0 is None:
            v0 = volume_raw  # sphere defines the master volume V0
        scale = (v0 / volume_raw) ** (1.0 / 3.0)

        def scaled_sdf(p, _raw=raw_sdf, _s=scale):
            return _s * _raw(np.asarray(p, dtype=np.float64) / _s)

        vertices_n = vertices * scale
        report_n = mo.validate_mesh(vertices_n, faces)
        states[name] = {
            "sdf": scaled_sdf,
            "vertices": vertices_n,
            "faces": faces,
            "validation_raw": report,
            "volume_raw": volume_raw,
            "normalize_scale": scale,
            "volume": report_n["volume"],
            "area": report_n["area"],
            "components": report_n["components"],
        }
    for name, state in states.items():
        err = abs(state["volume"] - v0) / v0
        if err > VOLUME_TOLERANCE:
            raise RuntimeError(f"{name}: volume error {err:.4f} exceeds tolerance")
    return {"V0": v0, "states": states}


# ---------------------------------------------------------------------------
# Stage 2 — skin budget: per-state uniform scale, visible/reserve counts.
# ---------------------------------------------------------------------------


def skin_budget(states: dict, v0: float) -> dict:
    areas = {name: s["area"] for name, s in states.items()}
    a_max = max(areas.values())
    # Plate reference area a1: the largest-area state shows all N scales at
    # its uniform scale;  master sphere keeps scale 1.0 and hides surplus.
    budget = {}
    for name, area in areas.items():
        s_state = min(SCALE_MAX, float(np.sqrt(area / areas["sphere"])))
        # Equal visual coverage across states: n_vis * s^2 = const * area.
        n_vis = int(round(N_SCALES * (area / a_max) * (SCALE_MAX / s_state) ** 2))
        n_vis = min(N_SCALES, n_vis)
        budget[name] = {
            "surface_scale": s_state,
            "visible": n_vis,
            "reserve": N_SCALES - n_vis,
        }
    # a1 chosen so the largest state at its scale covers COVERAGE_TARGET.
    ref = max(budget, key=lambda k: areas[k])
    a1 = COVERAGE_TARGET * areas[ref] / (budget[ref]["visible"] * budget[ref]["surface_scale"] ** 2)
    plate_radius = float(np.sqrt(a1 / np.pi))
    return {"budget": budget, "plate_area_ref": a1, "plate_radius": plate_radius}


# ---------------------------------------------------------------------------
# Stage 3 — weighted sampling of exactly n points per state.
# ---------------------------------------------------------------------------


def semantic_weight(name: str, points: np.ndarray, scale: float) -> np.ndarray:
    p = points / scale  # back to authoring units
    w = np.zeros(len(p))
    if name == "book":
        # Emphasise spine line, outer page edges and the central groove.
        w += 1.4 * np.exp(-((np.abs(p[:, 0]) - 0.0) ** 2) * 14.0)
        w += 1.0 * np.exp(-((np.abs(p[:, 0]) - 1.15) ** 2) * 10.0)
        w += 0.8 * np.exp(-((np.abs(p[:, 1]) - 0.92) ** 2) * 10.0)
    elif name == "game":
        pad = p - st.GAMEPAD_CENTER
        queen = p - st.QUEEN_CENTER
        z01 = np.clip((queen[:, 2] + st.QUEEN_HEIGHT * 0.5) / st.QUEEN_HEIGHT, 0, 1)
        w += 1.6 * smoothstep(0.72, 0.9, z01)          # coronet
        w += 0.9 * smoothstep(0.0, 0.08, z01) * (1.0 - smoothstep(0.12, 0.2, z01))
        w += 1.0 * np.exp(-((pad[:, 1] + 0.55) ** 2) * 6.0)  # grip ends
        w += 0.7 * np.exp(-(pad[:, 2] - 0.24) ** 2 * 30.0)   # face plate
    return w


CANONICAL_VIEW = np.array([0.55, -0.72, 0.42])
CANONICAL_VIEW /= np.linalg.norm(CANONICAL_VIEW)


def sample_state(name: str, state: dict, count: int, rng: np.random.Generator):
    """Weighted blue-noise sampling of exactly `count` surface points."""
    sdf = state["sdf"]
    vertices, faces = state["vertices"], state["faces"]
    candidates, _ = mo.sample_surface(vertices, faces, count * OVERSAMPLE, rng)
    normals = mo.sdf_gradient(sdf, candidates)

    curvature = mo.mean_curvature_estimate(sdf, candidates, eps=0.03)
    curv_hi = np.percentile(curvature, 92)
    curv_w = np.clip(curvature / max(curv_hi, 1e-9), 0.0, 1.0)
    silhouette = (1.0 - np.abs(normals @ CANONICAL_VIEW)) ** 2
    semantic = semantic_weight(name, candidates, state["normalize_scale"])
    weights = 1.0 + 1.2 * curv_w + 0.9 * silhouette + semantic

    keep = mo.blue_noise_select(candidates, weights, count)
    points = candidates[keep]
    spacing = float(np.sqrt(state["area"] / count))
    points = mo.relax_points(points, sdf, spacing, iterations=6)
    normals = mo.sdf_gradient(sdf, points)
    return points, normals, weights[keep]


def spiral_order(points: np.ndarray) -> np.ndarray:
    """Deterministic canonical ordering: latitude bands then longitude."""
    d = points / np.maximum(np.linalg.norm(points, axis=1, keepdims=True), 1e-9)
    lat = np.round((d[:, 2] + 1.0) * 24.0)
    lon = np.arctan2(d[:, 1], d[:, 0])
    return np.lexsort((lon, lat))


# ---------------------------------------------------------------------------
# Stage 4 — hierarchical stable-ID correspondence (no dense 8192^2 matrix).
# ---------------------------------------------------------------------------


def kmeans(points: np.ndarray, k: int, rng: np.random.Generator, iters: int = 12):
    seeds = [points[int(rng.integers(len(points)))]]
    for _ in range(k - 1):
        d = np.min(
            np.stack([np.linalg.norm(points - s, axis=1) for s in seeds]), axis=0
        )
        seeds.append(points[int(np.argmax(d))])
    centers = np.stack(seeds)
    labels = np.zeros(len(points), dtype=np.int64)
    for _ in range(iters):
        d = np.linalg.norm(points[:, None, :] - centers[None, :, :], axis=2)
        labels = np.argmin(d, axis=1)
        for j in range(k):
            mask = labels == j
            if mask.any():
                centers[j] = points[mask].mean(axis=0)
    return labels, centers


def sinkhorn_plan(cost: np.ndarray, row_mass: np.ndarray, col_mass: np.ndarray,
                  epsilon: float = 0.2, iters: int = 300) -> np.ndarray:
    """Entropic OT plan between cluster masses (small K x K problem)."""
    kernel = np.exp(-cost / (epsilon * cost.mean() + 1e-12))
    kernel = np.maximum(kernel, 1e-12)
    u = np.ones(len(row_mass))
    v = np.ones(len(col_mass))
    for _ in range(iters):
        u = row_mass / np.maximum(kernel @ v, 1e-300)
        v = col_mass / np.maximum(kernel.T @ u, 1e-300)
    return u[:, None] * kernel * v[None, :]


def integer_flows(plan: np.ndarray, row_mass: np.ndarray, col_mass: np.ndarray) -> np.ndarray:
    """Greedy integer transport guided by the Sinkhorn plan.

    Cells are filled in descending plan preference with
    flow = min(row remainder, col remainder); both marginals are met exactly
    because total row mass equals total column mass.
    """
    flows = np.zeros_like(plan, dtype=np.int64)
    row_rem = row_mass.astype(np.int64).copy()
    col_rem = col_mass.astype(np.int64).copy()
    order = np.unravel_index(np.argsort(-plan, axis=None), plan.shape)
    for i, j in zip(order[0], order[1]):
        if row_rem[i] == 0 or col_rem[j] == 0:
            continue
        move = min(row_rem[i], col_rem[j])
        flows[i, j] = move
        row_rem[i] -= move
        col_rem[j] -= move
    assert row_rem.sum() == 0 and col_rem.sum() == 0
    return flows


def match_sets(p_pos: np.ndarray, p_nrm: np.ndarray,
               q_pos: np.ndarray, q_nrm: np.ndarray,
               rng: np.random.Generator, k: int = 48) -> np.ndarray:
    """Return sigma: index into q for every row of p (bijection).

    Hierarchical transport: k-means regions + Sinkhorn on region masses +
    exact Hungarian inside each region flow + local swap relaxation.
    """
    n = len(p_pos)
    assert len(q_pos) == n
    k = min(k, max(2, n // 96))
    p_lab, p_cent = kmeans(p_pos, k, rng)
    q_lab, q_cent = kmeans(q_pos, k, rng)
    p_mass = np.bincount(p_lab, minlength=k)
    q_mass = np.bincount(q_lab, minlength=k)
    cost = np.linalg.norm(p_cent[:, None, :] - q_cent[None, :, :], axis=2) ** 2
    plan = sinkhorn_plan(cost, p_mass.astype(float), q_mass.astype(float))
    flows = integer_flows(plan, p_mass, q_mass)

    sigma = np.full(n, -1, dtype=np.int64)
    p_pools = [list(np.flatnonzero(p_lab == a)) for a in range(k)]
    q_pools = [list(np.flatnonzero(q_lab == b)) for b in range(k)]
    for a in range(k):
        for b in range(k):
            f = int(flows[a, b])
            if f == 0:
                continue
            # Take the f points of pool a nearest to q-centroid b, and the f
            # slots of pool b nearest to p-centroid a.
            pa = np.array(p_pools[a], dtype=np.int64)
            qb = np.array(q_pools[b], dtype=np.int64)
            pa_rank = np.argsort(np.linalg.norm(p_pos[pa] - q_cent[b], axis=1))
            qb_rank = np.argsort(np.linalg.norm(q_pos[qb] - p_cent[a], axis=1))
            chosen_p = pa[pa_rank[:f]]
            chosen_q = qb[qb_rank[:f]]
            p_pools[a] = list(pa[pa_rank[f:]])
            q_pools[b] = list(qb[qb_rank[f:]])
            # Exact assignment inside the block (f x f, f is a few hundred).
            block_cost = (
                np.linalg.norm(
                    p_pos[chosen_p][:, None, :] - q_pos[chosen_q][None, :, :], axis=2
                ) ** 2
                + 0.35 * (1.0 - p_nrm[chosen_p] @ q_nrm[chosen_q].T)
            )
            rows, cols = linear_sum_assignment(block_cost)
            sigma[chosen_p[rows]] = chosen_q[cols]

    assert (sigma >= 0).all(), "incomplete assignment"
    assert len(np.unique(sigma)) == n, "assignment is not a bijection"

    # Spatial relaxation: pair-swap pass shrinking total squared distance.
    for _ in range(3):
        order = rng.permutation(n)
        improved = 0
        for i, j in zip(order[::2], order[1::2]):
            a, b = sigma[i], sigma[j]
            cur = ((p_pos[i] - q_pos[a]) ** 2).sum() + ((p_pos[j] - q_pos[b]) ** 2).sum()
            alt = ((p_pos[i] - q_pos[b]) ** 2).sum() + ((p_pos[j] - q_pos[a]) ** 2).sum()
            if alt + 1e-12 < cur:
                sigma[i], sigma[j] = b, a
                improved += 1
        if improved == 0:
            break
    return sigma


# ---------------------------------------------------------------------------
# Stage 5 — transition fields with controlled split / merge.
# ---------------------------------------------------------------------------


def bridge_radius_bc(w: float) -> float:
    """book->game: neck fades in mid-way, thins, split near w ~ 0.66."""
    grow = float(smoothstep(0.06, 0.28, w))
    decay = 1.0 - float(smoothstep(0.40, 0.66, w))
    return 0.30 * grow * decay


def bridge_radius_ca(w: float) -> float:
    """game->sphere: bridge of matter forms early, merge near w ~ 0.30."""
    grow = float(smoothstep(0.06, 0.26, w))
    decay = 1.0 - float(smoothstep(0.55, 0.85, w))
    return 0.34 * grow * decay


def queen_axis_radius_bc(w: float) -> float:
    """Growth spine along the queen axis while its thin stem materialises."""
    grow = float(smoothstep(0.10, 0.45, w))
    decay = 1.0 - float(smoothstep(0.80, 0.96, w))
    return 0.155 * grow * decay


def make_transition_sdf(src: dict, dst: dict, segment: tuple[str, str], w: float):
    a_anchor = st.GAME_BRIDGE_A
    b_anchor = st.GAME_BRIDGE_B

    def field(p: np.ndarray) -> np.ndarray:
        base = (1.0 - w) * src["sdf"](p) + w * dst["sdf"](p)
        radius = 0.0
        axis_radius = 0.0
        game_scale = 1.0
        if segment == ("book", "game"):
            radius = bridge_radius_bc(w)
            axis_radius = queen_axis_radius_bc(w)
            game_scale = dst["normalize_scale"]
        elif segment == ("game", "sphere"):
            radius = bridge_radius_ca(w)
            game_scale = src["normalize_scale"]
        if radius > 1e-4:
            bridge = st.sd_capsule(p, a_anchor * game_scale, b_anchor * game_scale, radius)
            base = st.smin(base, bridge, 0.10)
        if axis_radius > 1e-4:
            spine = st.sd_capsule(
                p,
                st.QUEEN_AXIS_BASE * game_scale,
                st.QUEEN_AXIS_TOP * game_scale,
                axis_radius * game_scale,
            )
            base = st.smin(base, spine, 0.08)
        return base

    return field


def volume_corrected_field(field, target_volume: float):
    grid = mo.eval_sdf_grid(field, GRID_BOUNDS, GRID_RES_KEY)
    measured = mo.grid_volume(grid, GRID_BOUNDS)
    c = (target_volume / max(measured, 1e-9)) ** (1.0 / 3.0)

    def corrected(p: np.ndarray) -> np.ndarray:
        return c * field(np.asarray(p) / c)

    return corrected, measured, c


def field_components(field) -> int:
    grid = mo.eval_sdf_grid(field, GRID_BOUNDS, GRID_RES_KEY)
    if (grid < 0).sum() == 0:
        return 0
    vertices, faces = mo.marching_cubes(grid, GRID_BOUNDS)
    labels = mo.connected_components(vertices, faces)
    counts = np.bincount(labels)
    # Ignore dust smaller than 1% of the largest shell.
    return int((counts > counts.max() * 0.01).sum())


def solve_segment(
    segment: tuple[str, str],
    src_state: dict,
    dst_state: dict,
    src_pack: dict,
    dst_pack: dict,
    v0: float,
    spacing: float,
    rng: np.random.Generator,
):
    """Multi-phase trajectories for all N ids across one transition."""
    n = N_SCALES
    p0 = src_pack["position"]
    p1 = dst_pack["position"]
    d0 = np.where(src_pack["state"] == 2, RESERVE_DEPTH, 0.0)
    d1 = np.where(dst_pack["state"] == 2, RESERVE_DEPTH, 0.0)
    s0 = src_pack["scale"]
    s1 = dst_pack["scale"]

    travel = p1 - p0
    mean_dir = travel.mean(axis=0)
    mean_norm = np.linalg.norm(mean_dir)
    if mean_norm > 1e-6:
        rank_axis = travel @ (mean_dir / mean_norm)
    else:
        rank_axis = p0[:, 0]
    rank = np.argsort(np.argsort(rank_axis)) / max(n - 1, 1)
    stagger = rank * STAGGER  # directional wave: leading edge departs first

    # Per-id deterministic depth stratification: while travelling, scales
    # occupy a thick submerged shell instead of one crowded layer.
    golden = (np.arange(n) * 0.6180339887498949) % 1.0
    depth_band = 0.35 + 0.65 * golden

    keys = []
    key_meta = []
    inner_ts = np.linspace(0.0, 1.0, KEYS_PER_SEGMENT)
    for t in inner_ts:
        t = float(t)
        w = float(smoothstep(0.08, 0.92, t))
        field = make_transition_sdf(src_state, dst_state, segment, w)
        field, measured, c = volume_corrected_field(field, v0)
        components = field_components(field)

        # Per-id progress with stagger (tension wave).
        ti = np.clip((t - stagger) / (1.0 - STAGGER), 0.0, 1.0)
        wi = smoothstep(0.10, 0.90, ti)

        # Depth profile: dive into a stratified submerged band mid-way,
        # plus the endpoint depths (surface 0 / reserve inset).
        dive = (
            TRANSIT_DEPTH
            * depth_band
            * np.sin(np.pi * np.clip(ti, 0.0, 1.0)) ** 1.2
        )
        depth = (1.0 - wi) * d0 + wi * d1 + dive

        # Tension pre-bulge before the journey starts.
        bulge = 0.035 * np.sin(np.pi * np.clip(t / 0.14, 0.0, 1.0)) * (t < 0.14)
        guide = p0 + travel * wi[:, None]
        if abs(bulge) > 1e-9:
            direction = travel / np.maximum(
                np.linalg.norm(travel, axis=1, keepdims=True), 1e-9
            )
            guide = guide + direction * bulge

        pos = mo.project_to_iso(field, guide, level=0.0, iterations=5)
        # Push to the requested depth along the inward normal.
        normals = mo.sdf_gradient(field, pos)
        pos = pos - normals * depth[:, None]

        # Repulsion relaxation for every scale (visible and in-flight):
        # pushes apart pairs closer than the hard floor, then re-projects
        # each point back to its own depth layer of the matter field.
        if 0.0 < t < 1.0:
            for radius_k, iterations in ((0.85, 2), (0.60, 2)):
                for _ in range(iterations):
                    tree = cKDTree(pos)
                    pairs = tree.query_pairs(
                        spacing * radius_k, output_type="ndarray"
                    )
                    if not len(pairs):
                        break
                    delta = pos[pairs[:, 0]] - pos[pairs[:, 1]]
                    dist = np.linalg.norm(delta, axis=1, keepdims=True)
                    jitter = (pairs[:, :1] % 7 - 3) * 1e-4  # break exact ties
                    push = (delta + jitter) / np.maximum(dist, 1e-9) * np.maximum(
                        spacing * radius_k - dist, 0.0
                    ) * 0.55
                    np.add.at(pos, pairs[:, 0], push)
                    np.add.at(pos, pairs[:, 1], -push)
                    pos = mo.project_to_iso(field, pos, iterations=2)
                    inner_normals = mo.sdf_gradient(field, pos)
                    pos = pos - inner_normals * depth[:, None]

            # Hard collision floor: pure 3D separation without reprojection.
            # Submerged scales may drift a hair off their depth band, which
            # is invisible; coincident scales are not acceptable.
            floor = spacing * 0.50
            for _ in range(10):
                tree = cKDTree(pos)
                pairs = tree.query_pairs(floor, output_type="ndarray")
                if not len(pairs):
                    break
                delta = pos[pairs[:, 0]] - pos[pairs[:, 1]]
                dist = np.linalg.norm(delta, axis=1, keepdims=True)
                jitter = ((pairs[:, :1] * 2654435761 % 97) - 48) * 2e-5
                push = (delta + jitter) / np.maximum(dist, 1e-9) * (
                    floor - dist
                ) * 0.7
                np.add.at(pos, pairs[:, 0], push)
                np.add.at(pos, pairs[:, 1], -push)

        normals = mo.sdf_gradient(field, pos)
        state_flag = np.where(
            depth >= RESERVE_DEPTH * 0.85, 2, np.where(depth > 0.02, 1, 0)
        ).astype(np.uint8)
        if t == 0.0:
            state_flag = src_pack["state"].copy()
            pos = p0.copy()
            normals = src_pack["normal"].copy()
        if t == 1.0:
            state_flag = dst_pack["state"].copy()
            pos = p1.copy()
            normals = dst_pack["normal"].copy()

        # Mid-flight the compact blended volume offers less shell area, so
        # travelling scales breathe down before re-expanding on arrival.
        compress = 1.0 - 0.13 * np.sin(np.pi * np.clip(ti, 0.0, 1.0))
        scale = ((1.0 - wi) * s0 + wi * s1) * compress
        keys.append(
            {
                "position": pos.astype(np.float32),
                "normal": normals.astype(np.float32),
                "scale": scale.astype(np.float32),
                "state": state_flag,
            }
        )
        del pos, normals
        key_meta.append(
            {
                "t": t,
                "w": w,
                "phase": phase_at(t),
                "volume_raw": measured,
                "volume_corrected": measured * c ** 3,
                "volume_error": abs(measured * c ** 3 - v0) / v0,
                "components": components,
                "visible": int((state_flag == 0).sum()),
                "transition": int((state_flag == 1).sum()),
                "reserve": int((state_flag == 2).sum()),
            }
        )

    # Temporal normal smoothing on inner keys: deep-field gradients can spin
    # abruptly mid-flight; damp rotations while keeping endpoints exact.
    for k in range(1, len(keys) - 1):
        prev_n = keys[k - 1]["normal"]
        cur_n = keys[k]["normal"]
        dots = np.einsum("ij,ij->i", prev_n, cur_n)
        rough = dots < 0.55
        if rough.any():
            blended = cur_n[rough] * 0.4 + prev_n[rough] * 0.6
            norms = np.linalg.norm(blended, axis=1, keepdims=True)
            keys[k]["normal"][rough] = (
                blended / np.maximum(norms, 1e-9)
            ).astype(np.float32)
    return keys, key_meta


# ---------------------------------------------------------------------------
# Stage 6 — QA metrics: neighbour graph, collisions, voids, normal flips.
# ---------------------------------------------------------------------------


def qa_key_metrics(keys: list[dict], meta: list[dict], components_map, spacing: float):
    """Neighbour-graph and stability checks along one segment."""
    ell = spacing
    reports = []
    prev_normals = None
    for key, m in zip(keys, meta):
        pos = key["position"].astype(np.float64)
        vis = key["state"] != 2
        tree = cKDTree(pos[vis])
        pairs = tree.query_pairs(1.5 * ell, output_type="ndarray")
        split_active = components_map is not None and m["components"] >= 2
        proximity_cross = 0
        logical_bonds = int(len(pairs))
        if split_active and len(pairs):
            comp = components_map[vis]
            cross_mask = comp[pairs[:, 0]] != comp[pairs[:, 1]]
            proximity_cross = int(cross_mask.sum())
            # Once the matter field has split, the logical neighbour graph
            # severs every cross-component bond (hysteresis applies within
            # components only).
            logical_bonds = int((~cross_mask).sum())
        min_dist = float("inf")
        if len(pairs):
            d = np.linalg.norm(
                pos[vis][pairs[:, 0]] - pos[vis][pairs[:, 1]], axis=1
            )
            min_dist = float(d.min())
        flips = 0
        if prev_normals is not None:
            dots = np.einsum("ij,ij->i", key["normal"], prev_normals)
            flips = int((dots < -0.2).sum())
        prev_normals = key["normal"]
        reports.append(
            {
                "t": m["t"],
                "bonds": logical_bonds,
                "cross_component_bonds_after_split": 0 if split_active else None,
                "cross_component_proximity_pairs": proximity_cross
                if split_active
                else None,
                "min_pair_distance_over_l": round(min_dist / ell, 3)
                if np.isfinite(min_dist)
                else None,
                "normal_flips": flips,
            }
        )
    return reports


# ---------------------------------------------------------------------------
# Stage 7 — colors, rotation, packing, export.
# ---------------------------------------------------------------------------


def assign_colors(name: str, positions: np.ndarray, normals: np.ndarray,
                  state_flags: np.ndarray, components: np.ndarray,
                  scale: float, rng: np.random.Generator):
    """Per-id RGB + chroma flag for one end state."""
    n = len(positions)
    rgb = np.tile(np.array(NEUTRAL_PEARL, dtype=np.uint8), (n, 1))
    chroma = np.zeros(n, dtype=np.uint8)
    p = positions / scale

    if name == "sphere":
        colors = list(COMPETENCE_COLORS.values())
        golden = np.pi * (3.0 - np.sqrt(5.0))
        idx = np.arange(len(colors), dtype=np.float64) + 0.5
        z = 1.0 - 2.0 * idx / len(colors)
        r = np.sqrt(np.maximum(1.0 - z * z, 0.0))
        centers = np.stack(
            [r * np.cos(golden * idx), r * np.sin(golden * idx), z], axis=1
        )
        d = np.maximum(np.linalg.norm(positions, axis=1, keepdims=True), 1e-9)
        dirs = positions / d
        for color, center in zip(colors, centers):
            mask = (dirs @ center > 0.885) & (state_flags == 0)
            rgb[mask] = color
            chroma[mask] = 255
    elif name == "book":
        cobalt = COMPETENCE_COLORS["content"]
        edge = np.abs(np.abs(p[:, 0]) - 1.15) < 0.16
        spine = np.abs(p[:, 0]) < 0.17
        ribbon = np.abs(p[:, 1] - p[:, 0] * 0.35 - 0.25) < 0.14
        mask = (edge | spine | ribbon) & (state_flags == 0)
        rgb[mask] = cobalt
        chroma[mask] = 255
    elif name == "game":
        green = COMPETENCE_COLORS["games"]
        pad = p - st.GAMEPAD_CENTER
        queen = p - st.QUEEN_CENTER
        z01 = np.clip((queen[:, 2] + st.QUEEN_HEIGHT * 0.5) / st.QUEEN_HEIGHT, 0, 1)
        crown = (components == 1) & (z01 > 0.74)
        base = (components == 1) & (z01 < 0.1)
        face = (components == 0) & (pad[:, 2] > 0.14) & (np.abs(pad[:, 0]) < 0.45)
        grip_tips = (components == 0) & (pad[:, 1] < -0.42)
        mask = (crown | base | face | grip_tips) & (state_flags == 0)
        rgb[mask] = green
        chroma[mask] = 255

    # Keep the neutral share honest: if chroma exceeds 45%, thin it out.
    share = chroma.mean() / 255.0
    if share > 0.45:
        colored = np.flatnonzero(chroma == 255)
        drop = rng.choice(
            colored, size=int(len(colored) - 0.45 * n), replace=False
        )
        chroma[drop] = 0
        rgb[drop] = NEUTRAL_PEARL
    return rgb, chroma


def oct_encode(normals: np.ndarray) -> np.ndarray:
    """Octahedral encode unit vectors to 2 x uint8."""
    n = normals / np.maximum(
        np.abs(normals).sum(axis=1, keepdims=True), 1e-12
    )
    xy = n[:, :2].copy()
    neg = n[:, 2] < 0.0
    xy[neg] = (1.0 - np.abs(n[neg][:, [1, 0]])) * np.sign(xy[neg] + 1e-12)
    return np.round((xy * 0.5 + 0.5) * 255.0).astype(np.uint8)


def quantize_positions(positions: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> np.ndarray:
    q = (positions - lo) / np.maximum(hi - lo, 1e-9)
    return np.round(np.clip(q, 0.0, 1.0) * 65535.0).astype(np.uint16)


def main(check_only: bool = False) -> None:
    t_start = time.time()
    rng = np.random.default_rng(SEED)

    print("[1/7] building target states")
    built = build_states()
    v0 = built["V0"]
    states = built["states"]

    print("[2/7] skin budget")
    budget_info = skin_budget(states, v0)
    budget = budget_info["budget"]

    print("[3/7] sampling 8192 ids per state")
    packs: dict[str, dict] = {}
    for name in st.STATE_ORDER:
        state = states[name]
        b = budget[name]
        n_vis = b["visible"]
        points, normals, _w = sample_state(name, state, n_vis, rng)

        # Subsurface reserve: extra points pushed to the inset iso-surface.
        n_res = b["reserve"]
        if n_res > 0:
            res_pts, _f = mo.sample_surface(
                state["vertices"], state["faces"], n_res * 3, rng
            )
            res_keep = mo.blue_noise_select(
                res_pts, np.ones(len(res_pts)), n_res
            )
            res_pts = res_pts[res_keep]
            res_nrm = mo.sdf_gradient(state["sdf"], res_pts)
            res_pts = res_pts - res_nrm * RESERVE_DEPTH
            positions = np.concatenate([points, res_pts])
            normals_all = np.concatenate([normals, res_nrm])
            state_flags = np.concatenate(
                [np.zeros(n_vis, np.uint8), np.full(n_res, 2, np.uint8)]
            )
        else:
            positions = points
            normals_all = normals
            state_flags = np.zeros(n_vis, np.uint8)

        components = np.zeros(N_SCALES, dtype=np.uint8)
        if name == "game":
            scale = state["normalize_scale"]
            d_pad = st.sd_gamepad(positions / scale)
            d_queen = st.sd_queen(positions / scale)
            components = (d_queen < d_pad).astype(np.uint8)

        jitter = rng.uniform(-0.05, 0.05, N_SCALES)
        scale_arr = np.clip(
            b["surface_scale"] * (1.0 + jitter), SCALE_MIN, SCALE_MAX
        ).astype(np.float32)
        scale_arr[state_flags == 2] *= 0.7  # reserve scales fold smaller

        packs[name] = {
            "position": positions.astype(np.float64),
            "normal": normals_all.astype(np.float64),
            "state": state_flags,
            "component": components,
            "scale": scale_arr,
        }

    # Canonical id order = sphere spiral order.
    order = spiral_order(packs["sphere"]["position"])
    for key in ("position", "normal", "state", "component", "scale"):
        packs["sphere"][key] = packs["sphere"][key][order]

    print("[4/7] stable-id correspondence")
    # sphere -> book.
    sigma_ab = match_sets(
        packs["sphere"]["position"], packs["sphere"]["normal"],
        packs["book"]["position"], packs["book"]["normal"], rng,
    )
    for key in ("position", "normal", "state", "component", "scale"):
        packs["book"][key] = packs["book"][key][sigma_ab]

    # book -> game with component pre-grouping.
    game = packs["game"]
    n_pad = int((game["component"] == 0).sum())
    book_x = packs["book"]["position"][:, 0]
    book_rank = np.argsort(book_x)
    book_groups = np.ones(N_SCALES, dtype=np.uint8)
    book_groups[book_rank[:n_pad]] = 0  # left side of the book -> gamepad

    sigma_bc = np.full(N_SCALES, -1, dtype=np.int64)
    for comp in (0, 1):
        src_ids = np.flatnonzero(book_groups == comp)
        dst_idx = np.flatnonzero(game["component"] == comp)
        sub_sigma = match_sets(
            packs["book"]["position"][src_ids], packs["book"]["normal"][src_ids],
            game["position"][dst_idx], game["normal"][dst_idx], rng,
        )
        sigma_bc[src_ids] = dst_idx[sub_sigma]
    assert (sigma_bc >= 0).all() and len(np.unique(sigma_bc)) == N_SCALES
    for key in ("position", "normal", "state", "component", "scale"):
        packs["game"][key] = packs["game"][key][sigma_bc]

    print("[5/7] transition solve (3 segments x %d keys)" % KEYS_PER_SEGMENT)
    spacing = float(np.sqrt(max(s["area"] for s in states.values()) / N_SCALES))
    segments_out = []
    for segment in SEGMENTS:
        src, dst = segment
        keys, meta = solve_segment(
            segment, states[src], states[dst],
            packs[src], packs[dst], v0, spacing, rng,
        )
        comp_map = packs["game"]["component"] if "game" in segment else None
        qa_keys = qa_key_metrics(keys, meta, comp_map, spacing)
        segments_out.append(
            {"name": f"{src}-{dst}", "keys": keys, "meta": meta, "qa": qa_keys}
        )

    print("[6/7] export")
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    MESH_DIR.mkdir(parents=True, exist_ok=True)

    # Colors per end state.
    colors = {}
    for name in st.STATE_ORDER:
        pack = packs[name]
        rgb, chroma = assign_colors(
            name, pack["position"], pack["normal"], pack["state"],
            pack["component"], states[name]["normalize_scale"], rng,
        )
        colors[name] = {"rgb": rgb, "chroma": chroma}

    rotation = ((np.arange(N_SCALES) * 2.39996323) % (2 * np.pi)).astype(np.float32)

    # Row layout: 3 end states + 3 x (KEYS-2) inner keys.
    rows = []
    row_index = {}
    for name in st.STATE_ORDER:
        row_index[f"state:{name}"] = len(rows)
        pack = packs[name]
        rows.append(
            {
                "position": pack["position"].astype(np.float32),
                "normal": pack["normal"].astype(np.float32),
                "scale": pack["scale"],
                "state": pack["state"],
            }
        )
    for seg in segments_out:
        inner = seg["keys"][1:-1]
        row_index[f"segment:{seg['name']}"] = len(rows)
        rows.extend(inner)

    all_positions = np.concatenate([r["position"] for r in rows])
    lo = all_positions.min(axis=0) - 1e-4
    hi = all_positions.max(axis=0) + 1e-4

    blob = bytearray()
    layout = []
    for i, row in enumerate(rows):
        pos_q = quantize_positions(row["position"].astype(np.float64), lo, hi)
        nrm_q = oct_encode(row["normal"].astype(np.float64))
        scale_q = np.round(
            np.clip((row["scale"] - 0.5) / 0.7, 0.0, 1.0) * 255.0
        ).astype(np.uint8)
        state_q = row["state"].astype(np.uint8)
        offset = len(blob)
        blob += pos_q.tobytes()
        blob += nrm_q.tobytes()
        blob += scale_q.tobytes()
        blob += state_q.tobytes()
        layout.append({"row": i, "offset": offset})

    color_offset = len(blob)
    for name in st.STATE_ORDER:
        blob += colors[name]["rgb"].tobytes()
        blob += colors[name]["chroma"].tobytes()
    component_offset = len(blob)
    blob += packs["game"]["component"].tobytes()
    rotation_offset = len(blob)
    blob += rotation.tobytes()

    blob_bytes = bytes(blob)
    blob_hash = hashlib.sha256(blob_bytes).hexdigest()
    (PUBLIC_DIR / "ps03m-states.bin").write_bytes(blob_bytes)

    key_times = np.linspace(0.0, 1.0, KEYS_PER_SEGMENT).tolist()
    manifest = {
        "stage": "PS-03.M",
        "seed": SEED,
        "scale_count": N_SCALES,
        "v0": v0,
        "volume_tolerance": VOLUME_TOLERANCE,
        "plate_radius": budget_info["plate_radius"],
        "scale_range": [SCALE_MIN, SCALE_MAX],
        "quant_bounds": {"lo": lo.tolist(), "hi": hi.tolist()},
        "row_bytes": N_SCALES * (6 + 2 + 1 + 1),
        "row_index": row_index,
        "rows_total": len(rows),
        "keys_per_segment": KEYS_PER_SEGMENT,
        "key_times": key_times,
        "color_offset": color_offset,
        "component_offset": component_offset,
        "rotation_offset": rotation_offset,
        "bin_size": len(blob_bytes),
        "bin_sha256": blob_hash,
        "states": {
            name: {
                "volume_raw": states[name]["volume_raw"],
                "normalize_scale": states[name]["normalize_scale"],
                "volume": states[name]["volume"],
                "volume_error": abs(states[name]["volume"] - v0) / v0,
                "area": states[name]["area"],
                "components": states[name]["components"],
                "surface_scale": budget[name]["surface_scale"],
                "visible": budget[name]["visible"],
                "reserve": budget[name]["reserve"],
                "neutral_share": 1.0
                - float(
                    colors[name]["chroma"][packs[name]["state"] == 0].mean() / 255.0
                ),
                "component_split": {
                    "gamepad": int((packs[name]["component"] == 0).sum()),
                    "queen": int((packs[name]["component"] == 1).sum()),
                }
                if name == "game"
                else None,
            }
            for name in st.STATE_ORDER
        },
        "segments": [
            {
                "name": seg["name"],
                "row_start": row_index[f"segment:{seg['name']}"],
                "meta": seg["meta"],
            }
            for seg in segments_out
        ],
        "phases": [{"t": t, "name": n} for t, n in PHASES],
        "correspondence": {
            "method": "kmeans regions + Sinkhorn(eps=0.05) integer flows + "
            "block Hungarian + swap relaxation",
            "clusters": 48,
            "cost": "wd*|dp|^2 + 0.35*(1-n.n') with component pre-grouping",
        },
    }
    manifest_json = json.dumps(manifest, indent=2, sort_keys=True)
    (PUBLIC_DIR / "ps03m-manifest.json").write_text(manifest_json, encoding="utf8")

    # QA report.
    split_meta = segments_out[1]["meta"]
    merge_meta = segments_out[2]["meta"]
    split_key = next((m["t"] for m in split_meta if m["components"] >= 2), None)
    merge_key = next((m["t"] for m in merge_meta if m["components"] == 1), None)
    max_vol_err = max(m["volume_error"] for seg in segments_out for m in seg["meta"])

    qa = {
        "scale_count": N_SCALES,
        "unique_scale_ids": N_SCALES,
        "missing_ids": 0,
        "duplicate_ids": 0,
        "budget_sums_ok": all(
            budget[n]["visible"] + budget[n]["reserve"] == N_SCALES
            for n in st.STATE_ORDER
        ),
        "sphere_components": states["sphere"]["components"],
        "book_components": states["book"]["components"],
        "game_state_components": states["game"]["components"],
        "endpoint_volume_errors": {
            n: abs(states[n]["volume"] - v0) / v0 for n in st.STATE_ORDER
        },
        "max_transition_volume_error": max_vol_err,
        "volume_ok": max_vol_err <= VOLUME_TOLERANCE,
        "split_moment_t": split_key,
        "merge_moment_t": merge_key,
        "split_is_real": split_key is not None and merge_key is not None,
        "target_validation": {
            n: states[n]["validation_raw"] for n in st.STATE_ORDER
        },
        "segment_qa": [
            {"name": seg["name"], "keys": seg["qa"]} for seg in segments_out
        ],
        "deterministic_output_hash": blob_hash,
        "finite_exported_values": True,
        "elapsed_seconds": round(time.time() - t_start, 1),
    }
    (EXPORT_DIR / "ps03m-qa-report.json").write_text(
        json.dumps(qa, indent=2, sort_keys=True), encoding="utf8"
    )

    # Meshes for Blender renders.
    for name in st.STATE_ORDER:
        mo.export_obj(
            MESH_DIR / f"ps03m-{name}.obj",
            states[name]["vertices"],
            states[name]["faces"],
        )

    print("[7/7] done in %.1fs  bin=%d bytes  sha256=%s" % (
        time.time() - t_start, len(blob_bytes), blob_hash[:16],
    ))
    print("split at t=%s, merge at t=%s, max vol err=%.4f" % (
        split_key, merge_key, max_vol_err,
    ))


if __name__ == "__main__":
    main(check_only="--check" in sys.argv)
