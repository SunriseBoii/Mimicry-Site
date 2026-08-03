"""Standalone (non-Blender) Level-B-lite numeric gate for D-R3 candidates.

Checks per candidate: finite coordinates, positive volume, bbox inside the
canonical envelope with the relaxed D-R3 fill floor, no face-normal
inversion versus MASTER, minimum face-area ratio (local collapse), mask
physical-area ratio and projected silhouette presence.  BVH self-intersection
tests still require Blender and run in the candidate/build scripts.
"""

from __future__ import annotations

import json
import math
import statistics
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import dr3_geometry as geo  # noqa: E402

CACHE_PATH = SCRIPT_DIR.parent / "exports" / "_baseline_cache.json"
TARGET_BBOX = geo.TARGET_BBOX
RELAXED_FILL_FLOOR = 0.22
SILHOUETTE_PRESENCE_FLOOR = 0.30


def vsub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm(a):
    return math.sqrt(dot(a, a))


def face_area_normal(positions, face):
    pts = [positions[i] for i in face]
    area = 0.0
    nsum = [0.0, 0.0, 0.0]
    for i in range(1, len(pts) - 1):
        c = cross(vsub(pts[i], pts[0]), vsub(pts[i + 1], pts[0]))
        area += norm(c) * 0.5
        nsum[0] += c[0]
        nsum[1] += c[1]
        nsum[2] += c[2]
    length = norm(nsum)
    if length > 0.0:
        nsum = [v / length for v in nsum]
    return area, tuple(nsum)


def signed_volume(positions, faces):
    total = 0.0
    for face in faces:
        p0 = positions[face[0]]
        for i in range(1, len(face) - 1):
            p1, p2 = positions[face[i]], positions[face[i + 1]]
            total += dot(p0, cross(p1, p2)) / 6.0
    return total


def silhouette_hull_area(positions):
    cam = (9.0, -12.0, 6.5)
    fwd = tuple(-c for c in cam)
    fl = norm(fwd)
    fwd = tuple(c / fl for c in fwd)
    right = cross(fwd, (0.0, 0.0, 1.0))
    rl = norm(right)
    right = tuple(c / rl for c in right)
    up = cross(right, fwd)
    projected = []
    for p in positions:
        rel = vsub(p, cam)
        depth = max(1e-6, dot(rel, fwd))
        projected.append((dot(rel, right) / depth, dot(rel, up) / depth))
    pts = sorted(set(projected))
    if len(pts) < 3:
        return 0.0

    def cr(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cr(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cr(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    hull = lower[:-1] + upper[:-1]
    return abs(
        sum(
            hull[i][0] * hull[(i + 1) % len(hull)][1]
            - hull[(i + 1) % len(hull)][0] * hull[i][1]
            for i in range(len(hull))
        )
        * 0.5
    )


class QuickChecker:
    def __init__(self):
        cache = json.loads(CACHE_PATH.read_text(encoding="utf8"))
        self.master = [tuple(p) for p in cache["master"]]
        self.faces = [tuple(f) for f in cache["faces"]]
        self.active_faces = set(cache["active_faces"])
        self.tension_delta = [tuple(d) for d in cache["tension_delta"]]
        self.master_areas = []
        self.master_normals = []
        for face in self.faces:
            area, normal = face_area_normal(self.master, face)
            self.master_areas.append(area)
            self.master_normals.append(normal)
        self.master_hull = silhouette_hull_area(self.master)
        self.parameters = geo.topology_parameters()

    def face_location(self, face):
        us = [ (self.parameters[i][0] + 1.0) * 0.5 for i in face ]
        phis = [ self.parameters[i][1] for i in face ]
        cy = statistics.fmean(math.cos(p) for p in phis)
        cz = statistics.fmean(math.sin(p) for p in phis)
        return (round(statistics.fmean(us), 3), round(cy, 2), round(cz, 2))

    def evaluate(self, positions):
        finite = all(math.isfinite(v) for p in positions for v in p)
        min_ratio = float("inf")
        min_ratio_face = None
        min_dot = float("inf")
        min_dot_face = None
        inverted = 0
        total_area = 0.0
        active_area = 0.0
        worst_faces = []
        for idx, face in enumerate(self.faces):
            area, normal = face_area_normal(positions, face)
            total_area += area
            if idx in self.active_faces:
                active_area += area
            ratio = area / self.master_areas[idx] if self.master_areas[idx] > 1e-12 else 0.0
            d = dot(normal, self.master_normals[idx])
            if ratio < min_ratio:
                min_ratio = ratio
                min_ratio_face = self.face_location(face)
            if d < min_dot:
                min_dot = d
                min_dot_face = self.face_location(face)
            if d <= 0.0:
                inverted += 1
                if len(worst_faces) < 6:
                    worst_faces.append(self.face_location(face) + (round(d, 3),))
        volume = signed_volume(positions, self.faces)
        minima = [min(p[a] for p in positions) for a in range(3)]
        maxima = [max(p[a] for p in positions) for a in range(3)]
        size = [maxima[a] - minima[a] for a in range(3)]
        fill = [size[a] / TARGET_BBOX[a] for a in range(3)]
        hull = silhouette_hull_area(positions)
        mask_ratio = active_area / total_area if total_area else 0.0
        checks = {
            "finite": finite,
            "volume": volume > 0.0,
            "normals": inverted == 0,
            "collapse": min_ratio > 0.20,
            "envelope": all(size[a] <= TARGET_BBOX[a] + 0.0015 for a in range(3)),
            "fill_floor": all(f >= RELAXED_FILL_FLOOR for f in fill),
            "mask": 0.32 <= mask_ratio <= 0.36,
            "presence": hull / self.master_hull >= SILHOUETTE_PRESENCE_FLOOR,
        }
        return {
            "size": [round(v, 4) for v in size],
            "fill": [round(v, 4) for v in fill],
            "volume": round(volume, 3),
            "mask_ratio": round(mask_ratio, 5),
            "min_face_area_ratio": round(min_ratio, 4),
            "min_face_area_at": min_ratio_face,
            "min_normal_dot": round(min_dot, 4),
            "min_normal_at": min_dot_face,
            "inverted_faces": inverted,
            "worst_faces": worst_faces,
            "hull_ratio_to_master": round(hull / self.master_hull, 4),
            "checks": checks,
            "passed": all(checks.values()),
        }


def main():
    checker = QuickChecker()
    names = sys.argv[1:] or list(geo.SINGLE_NAMES)
    for name in names:
        for variant in sorted(geo.variants(name)):
            positions = geo.build_single(
                name, variant, checker.parameters, checker.tension_delta
            )
            report = checker.evaluate(positions)
            status = "PASS" if report["passed"] else "FAIL"
            failed = [k for k, v in report["checks"].items() if not v]
            print(
                f"{status} {name} {variant} size={report['size']} fill={report['fill']} "
                f"mask={report['mask_ratio']} minArea={report['min_face_area_ratio']}@{report['min_face_area_at']} "
                f"minDot={report['min_normal_dot']}@{report['min_normal_at']} inv={report['inverted_faces']} "
                f"hull={report['hull_ratio_to_master']}"
                + (f" failed={failed}" if failed else "")
                + (f" worst={report['worst_faces']}" if report["worst_faces"] else "")
            )


if __name__ == "__main__":
    main()
