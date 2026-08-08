"""PS-03.M2 geometry measurement utilities.

Generic mesh/field measures used by the target library: topology integrity,
self-intersection testing, local thickness probing and per-component
labelling.  Nothing here knows which subject form it is looking at.
"""

from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree


# ---------------------------------------------------------------------------
# Topology.
# ---------------------------------------------------------------------------


def euler_report(vertices: np.ndarray, faces: np.ndarray,
                 labels: np.ndarray) -> dict:
    """Per-component Euler characteristic and genus.

    A closed orientable surface satisfies V - E + F = 2 - 2g.  A non-integer
    or negative genus means the extracted shell is not a clean closed surface.
    """
    edges = np.sort(
        np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]),
        axis=1,
    )
    unique_edges = np.unique(edges, axis=0)
    face_label = labels[faces[:, 0]]
    edge_label = labels[unique_edges[:, 0]]
    out = []
    for component in range(int(labels.max()) + 1):
        v = int((labels == component).sum())
        e = int((edge_label == component).sum())
        f = int((face_label == component).sum())
        chi = v - e + f
        genus = (2 - chi) / 2.0
        out.append(
            {
                "component": component,
                "vertices": v,
                "edges": e,
                "faces": f,
                "euler": chi,
                "genus": genus,
                "genusIsInteger": abs(genus - round(genus)) < 1e-9,
            }
        )
    return {"components": out}


def _signed_plane_distance(points: np.ndarray, normal: np.ndarray,
                           offset: np.ndarray) -> np.ndarray:
    return np.einsum("ij,ij->i", points, normal) + offset


def self_intersections(vertices: np.ndarray, faces: np.ndarray) -> dict:
    """Exact triangle-triangle intersection test for non-adjacent faces.

    Broad phase: KD-tree on face centroids with a radius covering the largest
    triangle.  Narrow phase: Moller's interval-overlap test, vectorised.
    Face pairs sharing a vertex are excluded (they touch by construction).
    Coplanar pairs are counted separately rather than silently ignored.
    """
    tri = vertices[faces]
    centroids = tri.mean(axis=1)
    radii = np.linalg.norm(tri - centroids[:, None, :], axis=2).max(axis=1)
    search = float(radii.max()) * 2.0

    empty = {
        "tested_pairs": 0, "intersecting_pairs": 0, "coplanar_pairs": 0,
        "coplanar_overlapping_pairs": 0,
    }
    tree = cKDTree(centroids)
    pairs = tree.query_pairs(search, output_type="ndarray")
    if not len(pairs):
        return empty

    # Drop pairs whose bounding spheres cannot touch.
    gap = np.linalg.norm(centroids[pairs[:, 0]] - centroids[pairs[:, 1]], axis=1)
    pairs = pairs[gap <= radii[pairs[:, 0]] + radii[pairs[:, 1]]]
    if not len(pairs):
        return empty

    fa = faces[pairs[:, 0]]
    fb = faces[pairs[:, 1]]
    shares_vertex = (fa[:, :, None] == fb[:, None, :]).any(axis=(1, 2))
    pairs = pairs[~shares_vertex]
    if not len(pairs):
        return empty

    a = vertices[faces[pairs[:, 0]]]          # (m, 3, 3)
    b = vertices[faces[pairs[:, 1]]]

    def plane(t):
        n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
        norm = np.linalg.norm(n, axis=1, keepdims=True)
        n = n / np.maximum(norm, 1e-30)
        return n, -np.einsum("ij,ij->i", n, t[:, 0])

    na, da = plane(a)
    nb, db = plane(b)
    eps = 1e-12

    db_a = np.stack(
        [_signed_plane_distance(a[:, i], nb, db) for i in range(3)], axis=1
    )
    da_b = np.stack(
        [_signed_plane_distance(b[:, i], na, da) for i in range(3)], axis=1
    )
    db_a[np.abs(db_a) < eps] = 0.0
    da_b[np.abs(da_b) < eps] = 0.0

    reject = ((db_a > 0).all(axis=1) | (db_a < 0).all(axis=1)) | (
        (da_b > 0).all(axis=1) | (da_b < 0).all(axis=1)
    )
    coplanar = (np.abs(db_a).max(axis=1) == 0.0) & ~reject
    live = ~reject & ~coplanar
    coplanar_overlaps = int(
        _coplanar_overlaps(a[coplanar], b[coplanar], na[coplanar])
    )
    if not live.any():
        return {
            "tested_pairs": int(len(pairs)),
            "intersecting_pairs": coplanar_overlaps,
            "coplanar_pairs": int(coplanar.sum()),
            "coplanar_overlapping_pairs": coplanar_overlaps,
        }

    a, b = a[live], b[live]
    na, nb = na[live], nb[live]
    db_a, da_b = db_a[live], da_b[live]

    direction = np.cross(na, nb)
    axis = np.argmax(np.abs(direction), axis=1)
    rows = np.arange(len(a))

    def interval(tri_pts, dist):
        """Parameter interval of the triangle on the intersection line."""
        proj = tri_pts[rows[:, None], np.arange(3)[None, :], axis[:, None]]
        # The odd vertex is the one alone on its side of the other plane.
        sign = np.sign(dist)
        odd = np.zeros(len(tri_pts), dtype=np.int64)
        for i in range(3):
            j, k = (i + 1) % 3, (i + 2) % 3
            alone = (sign[:, i] != sign[:, j]) & (sign[:, i] != sign[:, k])
            odd[alone] = i
        others = np.stack([(odd + 1) % 3, (odd + 2) % 3], axis=1)
        p_odd = proj[rows, odd]
        d_odd = dist[rows, odd]
        limits = []
        for column in range(2):
            other = others[:, column]
            p_other = proj[rows, other]
            d_other = dist[rows, other]
            denominator = d_odd - d_other
            safe = np.abs(denominator) > 1e-30
            value = np.where(
                safe,
                p_odd + (p_other - p_odd) * d_odd / np.where(safe, denominator, 1.0),
                p_odd,
            )
            limits.append(value)
        lo = np.minimum(limits[0], limits[1])
        hi = np.maximum(limits[0], limits[1])
        return lo, hi

    lo_a, hi_a = interval(a, db_a)
    lo_b, hi_b = interval(b, da_b)
    overlap = (lo_a <= hi_b + 1e-12) & (lo_b <= hi_a + 1e-12)
    return {
        "tested_pairs": int(len(pairs)),
        "intersecting_pairs": int(overlap.sum()) + coplanar_overlaps,
        "coplanar_pairs": int(coplanar.sum()),
        "coplanar_overlapping_pairs": coplanar_overlaps,
    }


def _coplanar_overlaps(a: np.ndarray, b: np.ndarray, normal: np.ndarray) -> int:
    """2D separating-axis test for coplanar triangle pairs."""
    if not len(a):
        return 0
    dominant = np.argmax(np.abs(normal), axis=1)
    keep = np.array([[1, 2], [0, 2], [0, 1]])[dominant]
    rows = np.arange(len(a))
    a2 = a[rows[:, None, None], np.arange(3)[None, :, None], keep[:, None, :]]
    b2 = b[rows[:, None, None], np.arange(3)[None, :, None], keep[:, None, :]]

    separated = np.zeros(len(a), dtype=bool)
    for tri, other in ((a2, b2), (b2, a2)):
        for i in range(3):
            edge = tri[:, (i + 1) % 3] - tri[:, i]
            axis = np.stack([-edge[:, 1], edge[:, 0]], axis=1)
            pa = np.einsum("ijk,ik->ij", tri, axis)
            pb = np.einsum("ijk,ik->ij", other, axis)
            separated |= (pa.min(axis=1) >= pb.max(axis=1) - 1e-12) | (
                pb.min(axis=1) >= pa.max(axis=1) - 1e-12
            )
    return int((~separated).sum())


# ---------------------------------------------------------------------------
# Thickness.
# ---------------------------------------------------------------------------


def local_thickness(field, points: np.ndarray, normals: np.ndarray,
                    max_depth: float, steps: int = 24) -> np.ndarray:
    """Local wall thickness at surface points.

    Marches inward along -n and records the deepest (most negative) field
    value reached before the field starts rising again; thickness is twice
    that depth, which is exact for a slab and a good proxy elsewhere.
    """
    offsets = np.linspace(0.0, max_depth, steps)[1:]
    deepest = np.zeros(len(points))
    rising = np.zeros(len(points), dtype=bool)
    previous = np.zeros(len(points))
    for offset in offsets:
        value = field(points - normals * offset)
        turned = value > previous + 1e-9
        rising |= turned
        update = ~rising
        deepest[update] = np.minimum(deepest[update], value[update])
        previous = value
    return 2.0 * np.abs(deepest)


# ---------------------------------------------------------------------------
# Component labelling.
# ---------------------------------------------------------------------------


def label_by_nearest_field(fields: list, points: np.ndarray) -> np.ndarray:
    """Assign every point to the component whose field is smallest there."""
    stacked = np.stack([f(points) for f in fields], axis=1)
    return np.argmin(stacked, axis=1).astype(np.int64)


def interior_voxel_centres(grid: np.ndarray, bounds: float):
    """Interior voxel centres, their field values and the voxel volume."""
    resolution = grid.shape[0]
    axis = np.linspace(-bounds, bounds, resolution)
    spacing = axis[1] - axis[0]
    inside = np.argwhere(grid < 0.0)
    centres = axis[inside]
    values = grid[inside[:, 0], inside[:, 1], inside[:, 2]]
    return centres, values, float(spacing ** 3)
