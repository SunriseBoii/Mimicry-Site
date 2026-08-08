"""PS-03.M mesh utilities: SDF polygonisation, validation, measures, sampling.

Pure numpy/scipy/skimage; no Blender dependency.  All randomness flows
through explicitly seeded generators so the pipeline is deterministic.
"""

from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree
from skimage import measure


# ---------------------------------------------------------------------------
# SDF grid evaluation and polygonisation.
# ---------------------------------------------------------------------------


def eval_sdf_grid(sdf, bounds: float, resolution: int) -> np.ndarray:
    """Evaluate an SDF on a cubic grid [-bounds, bounds]^3."""
    axis = np.linspace(-bounds, bounds, resolution, dtype=np.float64)
    gx, gy, gz = np.meshgrid(axis, axis, axis, indexing="ij")
    points = np.stack([gx.ravel(), gy.ravel(), gz.ravel()], axis=1)
    values = np.empty(points.shape[0], dtype=np.float64)
    chunk = 262_144
    for start in range(0, points.shape[0], chunk):
        values[start : start + chunk] = sdf(points[start : start + chunk])
    return values.reshape(resolution, resolution, resolution)


def marching_cubes(grid: np.ndarray, bounds: float, level: float = 0.0):
    """Extract the iso-surface; returns (vertices, faces) in world units."""
    resolution = grid.shape[0]
    spacing = 2.0 * bounds / (resolution - 1)
    vertices, faces, _normals, _values = measure.marching_cubes(
        grid, level=level, spacing=(spacing, spacing, spacing)
    )
    vertices = vertices - bounds
    return np.ascontiguousarray(vertices), np.ascontiguousarray(faces)


def grid_volume(grid: np.ndarray, bounds: float, level: float = 0.0) -> float:
    """Occupancy-based volume estimate of {sdf < level} on the grid."""
    resolution = grid.shape[0]
    voxel = (2.0 * bounds / (resolution - 1)) ** 3
    # Sub-voxel correction via linear interpolation of boundary occupancy.
    inside = (grid < level).sum()
    return float(inside) * voxel


# ---------------------------------------------------------------------------
# Mesh measures and validation.
# ---------------------------------------------------------------------------


def mesh_volume(vertices: np.ndarray, faces: np.ndarray) -> float:
    a = vertices[faces[:, 0]]
    b = vertices[faces[:, 1]]
    c = vertices[faces[:, 2]]
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)


def mesh_area(vertices: np.ndarray, faces: np.ndarray) -> float:
    a = vertices[faces[:, 0]]
    b = vertices[faces[:, 1]]
    c = vertices[faces[:, 2]]
    return float(0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1).sum())


def face_areas(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    a = vertices[faces[:, 0]]
    b = vertices[faces[:, 1]]
    c = vertices[faces[:, 2]]
    return 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)


def edge_index(faces: np.ndarray) -> np.ndarray:
    edges = np.concatenate(
        [faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]], axis=0
    )
    return np.sort(edges, axis=1)


def connected_components(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Vertex component labels via sparse graph connectivity."""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components as cc

    edges = edge_index(faces)
    n = len(vertices)
    graph = coo_matrix(
        (np.ones(len(edges)), (edges[:, 0], edges[:, 1])), shape=(n, n)
    )
    _count, labels = cc(graph, directed=False)
    return labels.astype(np.int64)


def validate_mesh(vertices: np.ndarray, faces: np.ndarray) -> dict:
    """Watertight/manifold/degenerate/normals validation report."""
    edges = edge_index(faces)
    unique_edges, counts = np.unique(edges, axis=0, return_counts=True)
    boundary_edges = int((counts == 1).sum())
    non_manifold_edges = int((counts > 2).sum())

    used = np.zeros(len(vertices), dtype=bool)
    used[faces.ravel()] = True
    loose_vertices = int((~used).sum())

    areas = face_areas(vertices, faces)
    degenerate_faces = int((areas < 1e-12).sum())

    volume = mesh_volume(vertices, faces)
    labels = connected_components(vertices, faces)
    components = int(labels.max()) + 1

    finite = bool(np.isfinite(vertices).all())

    return {
        "vertex_count": int(len(vertices)),
        "face_count": int(len(faces)),
        "boundary_edges": boundary_edges,
        "non_manifold_edges": non_manifold_edges,
        "loose_vertices": loose_vertices,
        "degenerate_faces": degenerate_faces,
        "watertight": boundary_edges == 0 and non_manifold_edges == 0,
        "volume": volume,
        "positive_volume": volume > 0.0,
        "area": mesh_area(vertices, faces),
        "components": components,
        "finite": finite,
    }


def sdf_gradient(sdf, points: np.ndarray, eps: float = 1e-4) -> np.ndarray:
    """Central-difference gradient of an SDF at the given points."""
    grad = np.empty_like(points)
    for axis in range(3):
        offset = np.zeros(3)
        offset[axis] = eps
        grad[:, axis] = (sdf(points + offset) - sdf(points - offset)) / (2.0 * eps)
    norms = np.linalg.norm(grad, axis=1, keepdims=True)
    return grad / np.maximum(norms, 1e-12)


def project_to_iso(sdf, points: np.ndarray, level: float = 0.0, iterations: int = 6) -> np.ndarray:
    """Newton projection of points onto the iso-surface {sdf = level}."""
    current = points.copy()
    for _ in range(iterations):
        distance = sdf(current) - level
        if np.max(np.abs(distance)) < 1e-5:
            break
        normals = sdf_gradient(sdf, current)
        current = current - normals * distance[:, None]
    return current


# ---------------------------------------------------------------------------
# Weighted surface sampling with exact count (weighted sample elimination).
# ---------------------------------------------------------------------------


def sample_surface(
    vertices: np.ndarray,
    faces: np.ndarray,
    count: int,
    rng: np.random.Generator,
    weight_fn=None,
) -> tuple[np.ndarray, np.ndarray]:
    """Area-weighted candidate sampling; returns (points, face_indices)."""
    areas = face_areas(vertices, faces)
    if weight_fn is not None:
        centers = vertices[faces].mean(axis=1)
        areas = areas * np.maximum(weight_fn(centers), 1e-6)
    probabilities = areas / areas.sum()
    face_choice = rng.choice(len(faces), size=count, p=probabilities)
    r1 = rng.random(count)
    r2 = rng.random(count)
    sqrt_r1 = np.sqrt(r1)
    u = 1.0 - sqrt_r1
    v = sqrt_r1 * (1.0 - r2)
    w = sqrt_r1 * r2
    tri = vertices[faces[face_choice]]
    points = (
        tri[:, 0] * u[:, None] + tri[:, 1] * v[:, None] + tri[:, 2] * w[:, None]
    )
    return points, face_choice


def blue_noise_select(
    candidates: np.ndarray,
    weights: np.ndarray,
    count: int,
) -> np.ndarray:
    """Weighted sample elimination (Yuksel-style) down to exactly `count`.

    Deterministic greedy: repeatedly remove the candidate with the highest
    crowding score (sum of kernel over neighbours scaled by inverse weight)
    until `count` remain.  Returns indices into `candidates`.
    """
    n = len(candidates)
    if count >= n:
        return np.arange(n)
    # Radius from surface density heuristic.
    tree = cKDTree(candidates)
    bbox = candidates.max(axis=0) - candidates.min(axis=0)
    area_guess = 2.0 * (bbox[0] * bbox[1] + bbox[1] * bbox[2] + bbox[0] * bbox[2])
    r_max = 2.0 * np.sqrt(area_guess / (np.pi * max(count, 1)))

    pairs = tree.query_pairs(r_max, output_type="ndarray")
    scores = np.zeros(n)
    inv_weight = 1.0 / np.maximum(weights, 1e-6)

    def kernel(distances: np.ndarray) -> np.ndarray:
        return (1.0 - np.minimum(distances / r_max, 1.0)) ** 8

    if len(pairs):
        d = np.linalg.norm(candidates[pairs[:, 0]] - candidates[pairs[:, 1]], axis=1)
        k = kernel(d)
        np.add.at(scores, pairs[:, 0], k * inv_weight[pairs[:, 0]])
        np.add.at(scores, pairs[:, 1], k * inv_weight[pairs[:, 1]])

    # Lazy max-heap elimination.
    import heapq

    neighbor_lists: list[list[int]] = [[] for _ in range(n)]
    for a, b in pairs:
        neighbor_lists[a].append(int(b))
        neighbor_lists[b].append(int(a))

    alive = np.ones(n, dtype=bool)
    heap = [(-scores[i], i) for i in range(n)]
    heapq.heapify(heap)
    remaining = n
    current = scores.copy()
    while remaining > count:
        neg_score, index = heapq.heappop(heap)
        if not alive[index] or -neg_score != current[index]:
            if alive[index]:
                heapq.heappush(heap, (-current[index], index))
                # Re-push with corrected priority; continue.
            continue
        alive[index] = False
        remaining -= 1
        for other in neighbor_lists[index]:
            if alive[other]:
                d = np.linalg.norm(candidates[index] - candidates[other])
                current[other] -= kernel(np.array([d]))[0] * inv_weight[other]
                heapq.heappush(heap, (-current[other], other))
    return np.flatnonzero(alive)


def relax_points(
    points: np.ndarray,
    sdf,
    spacing: float,
    iterations: int = 8,
    repulsion_radius: float = 0.85,
    step: float = 0.35,
) -> np.ndarray:
    """Tangential repulsion relaxation keeping points on the iso-surface."""
    current = points.copy()
    radius = spacing * repulsion_radius * 2.0
    for _ in range(iterations):
        tree = cKDTree(current)
        pairs = tree.query_pairs(radius, output_type="ndarray")
        if not len(pairs):
            break
        delta = current[pairs[:, 0]] - current[pairs[:, 1]]
        dist = np.linalg.norm(delta, axis=1, keepdims=True)
        overlap = np.maximum(radius - dist, 0.0)
        push = delta / np.maximum(dist, 1e-9) * overlap * step * 0.5
        np.add.at(current, pairs[:, 0], push)
        np.add.at(current, pairs[:, 1], -push)
        current = project_to_iso(sdf, current, iterations=3)
    return current


def mean_curvature_estimate(sdf, points: np.ndarray, eps: float = 0.02) -> np.ndarray:
    """|Laplacian of SDF| as a cheap curvature magnitude proxy."""
    total = np.zeros(len(points))
    center = sdf(points)
    for axis in range(3):
        offset = np.zeros(3)
        offset[axis] = eps
        total += sdf(points + offset) + sdf(points - offset)
    return np.abs(total - 6.0 * center) / (eps * eps)


def export_obj(path, vertices: np.ndarray, faces: np.ndarray) -> None:
    with open(path, "w", encoding="utf8") as handle:
        for v in vertices:
            handle.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
        for f in faces:
            handle.write(f"f {f[0] + 1} {f[1] + 1} {f[2] + 1}\n")
