"""Geometry validation utilities for PS-03.2.

This module is intentionally Blender-native.  It validates endpoint meshes,
all direct terminal-to-terminal blends, interrupted retarget chains and the
additive TRANSITION_TENSION layer without changing the authored topology.
"""

from __future__ import annotations

import hashlib
import json
import math
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


TARGET_BBOX = (6.8, 3.6, 3.2)
# Shape-key coordinates are serialized as float32 by Blender/GLB.  These
# tolerances distinguish numerical serialization drift from a designed escape
# beyond the canonical envelope or below its desirable 88% axis fill.
ENVELOPE_ABSOLUTE_TOLERANCE = 0.0015
CANONICAL_FILL_TOLERANCE = 0.001
EXPECTED_VERTICES = 8322
EXPECTED_FACES = 8480
EXPECTED_TRIANGLES = 16640
EXPECTED_EDGES = 16800
EXPECTED_TOPOLOGY_HASH = "8883e7698bbd3a6aafef5a4a8a4ea5f04ee96d7ad7cc41cee841a94986e1e462"
EXPECTED_UV_HASH = "c5eff463ac2b978f0470e1fef6fffc4eb5a01fe06f66262b3effba5518e67683"
EXPECTED_MASTER_POSITION_HASH = "2cd522cd9a1d0e90f10fc072835db1cd54a9ad1072478911713884646fc89bd8"
EXPECTED_MASK_FACE_COUNT = 2526
EXPECTED_MASK_HASH = "67c2dd582fcbdb25d9905b98357340c7313292bfb20db6fdd5675e88d1f71c58"

TERMINAL_NAMES = (
    "MASTER",
    "BRAND_WIDE",
    "SINGLE_CONTENT_SEQUENCE",
    "SINGLE_DESIGN_TORSION",
    "SINGLE_EVENT_CONVERGENCE",
    "SINGLE_GAMES_BRANCH",
    "SINGLE_VIDEO_TEMPORAL",
    "SINGLE_DIGITAL_SIGNAL",
    "SINGLE_MERCH_WRAP",
    "COMPLEX_FOCUS",
    "COMPLEX_GATHER",
    "COMPLEX_DRIVE",
)

TARGET_NAMES = TERMINAL_NAMES[1:] + ("TRANSITION_TENSION",)

MANDATORY_EXPANDED_PAIRS = {
    frozenset(("SINGLE_CONTENT_SEQUENCE", "SINGLE_GAMES_BRANCH")),
    frozenset(("SINGLE_DESIGN_TORSION", "SINGLE_MERCH_WRAP")),
    frozenset(("SINGLE_EVENT_CONVERGENCE", "COMPLEX_GATHER")),
    frozenset(("SINGLE_VIDEO_TEMPORAL", "COMPLEX_DRIVE")),
    frozenset(("SINGLE_DIGITAL_SIGNAL", "COMPLEX_FOCUS")),
    frozenset(("SINGLE_GAMES_BRANCH", "SINGLE_EVENT_CONVERGENCE")),
    frozenset(("BRAND_WIDE", "COMPLEX_DRIVE")),
}

RETARGET_CHAINS = (
    ("SINGLE_CONTENT_SEQUENCE", "SINGLE_DESIGN_TORSION", "SINGLE_EVENT_CONVERGENCE"),
    ("SINGLE_GAMES_BRANCH", "SINGLE_DIGITAL_SIGNAL", "SINGLE_VIDEO_TEMPORAL"),
    ("COMPLEX_FOCUS", "COMPLEX_GATHER", "COMPLEX_DRIVE"),
    ("BRAND_WIDE", "SINGLE_MERCH_WRAP", "MASTER"),
)


def polygon_triangles(face: Sequence[int]) -> Iterable[tuple[int, int, int]]:
    for index in range(1, len(face) - 1):
        yield face[0], face[index], face[index + 1]


def triangle_area(a: Vector, b: Vector, c: Vector) -> float:
    return (b - a).cross(c - a).length * 0.5


def polygon_area_normal(positions, face) -> tuple[float, Vector]:
    points = [Vector(positions[index]) for index in face]
    total_area = 0.0
    normal_sum = Vector((0.0, 0.0, 0.0))
    for index in range(1, len(points) - 1):
        cross = (points[index] - points[0]).cross(points[index + 1] - points[0])
        total_area += cross.length * 0.5
        normal_sum += cross
    normal = normal_sum.normalized() if normal_sum.length else Vector((0.0, 0.0, 0.0))
    return total_area, normal


def signed_volume(positions, faces) -> float:
    total = 0.0
    vectors = [Vector(point) for point in positions]
    for face in faces:
        for a, b, c in polygon_triangles(face):
            total += vectors[a].dot(vectors[b].cross(vectors[c])) / 6.0
    return total


def bounding_box(positions) -> dict:
    minima = [min(point[axis] for point in positions) for axis in range(3)]
    maxima = [max(point[axis] for point in positions) for axis in range(3)]
    sizes = [maxima[index] - minima[index] for index in range(3)]
    return {
        "min": [round(value, 6) for value in minima],
        "max": [round(value, 6) for value in maxima],
        "size": [round(value, 6) for value in sizes],
        "fill": [round(sizes[index] / TARGET_BBOX[index], 6) for index in range(3)],
    }


def positions_hash(positions) -> str:
    payload = ";".join(
        f"{point[0]:.8f},{point[1]:.8f},{point[2]:.8f}" for point in positions
    ).encode("ascii")
    return hashlib.sha256(payload).hexdigest()


def topology_hash(faces) -> str:
    return hashlib.sha256(
        json.dumps(faces, separators=(",", ":")).encode("utf8")
    ).hexdigest()


def mask_index_hash(active_faces) -> str:
    return hashlib.sha256(
        json.dumps(list(sorted(active_faces)), separators=(",", ":")).encode("ascii")
    ).hexdigest()


def rms_displacement(source, target) -> tuple[float, float]:
    distances = [(Vector(right) - Vector(left)).length for left, right in zip(source, target)]
    return math.sqrt(statistics.fmean(value * value for value in distances)), max(distances)


def interpolate(left, right, progress: float):
    inverse = 1.0 - progress
    return [
        (
            a[0] * inverse + b[0] * progress,
            a[1] * inverse + b[1] * progress,
            a[2] * inverse + b[2] * progress,
        )
        for a, b in zip(left, right)
    ]


def add_delta(base, delta, weight: float):
    return [
        (
            point[0] + offset[0] * weight,
            point[1] + offset[1] * weight,
            point[2] + offset[2] * weight,
        )
        for point, offset in zip(base, delta)
    ]


def convex_hull(points):
    unique = sorted(set(points))
    if len(unique) <= 1:
        return unique

    def cross(origin, left, right):
        return (left[0] - origin[0]) * (right[1] - origin[1]) - (
            left[1] - origin[1]
        ) * (right[0] - origin[0])

    lower = []
    for point in unique:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0.0:
            lower.pop()
        lower.append(point)
    upper = []
    for point in reversed(unique):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0.0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def polygon_2d_area(points) -> float:
    if len(points) < 3:
        return 0.0
    return abs(
        sum(
            points[index][0] * points[(index + 1) % len(points)][1]
            - points[(index + 1) % len(points)][0] * points[index][1]
            for index in range(len(points))
        )
        * 0.5
    )


def silhouette_metrics(positions) -> dict:
    camera = Vector((9.0, -12.0, 6.5))
    forward = (-camera).normalized()
    right = forward.cross(Vector((0.0, 0.0, 1.0))).normalized()
    up = right.cross(forward).normalized()
    projected = []
    for point in positions:
        relative = Vector(point) - camera
        depth = max(1e-6, relative.dot(forward))
        projected.append((relative.dot(right) / depth, relative.dot(up) / depth))
    hull = convex_hull(projected)
    minima = [min(point[axis] for point in projected) for axis in range(2)]
    maxima = [max(point[axis] for point in projected) for axis in range(2)]
    center = [statistics.fmean(point[axis] for point in projected) for axis in range(2)]
    return {
        "projected_width": round(maxima[0] - minima[0], 8),
        "projected_height": round(maxima[1] - minima[1], 8),
        "hull_area": round(polygon_2d_area(hull), 8),
        "centroid": [round(value, 8) for value in center],
        "hull_vertices": len(hull),
    }


def topology_metrics(vertex_count: int, faces) -> dict:
    edge_counts = {}
    used = set()
    adjacency = [set() for _ in range(vertex_count)]
    for face in faces:
        used.update(face)
        for index, start in enumerate(face):
            end = face[(index + 1) % len(face)]
            edge = tuple(sorted((start, end)))
            edge_counts[edge] = edge_counts.get(edge, 0) + 1
            adjacency[start].add(end)
            adjacency[end].add(start)
    unseen = set(range(vertex_count))
    components = 0
    while unseen:
        components += 1
        stack = [unseen.pop()]
        while stack:
            current = stack.pop()
            for neighbor in adjacency[current]:
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    stack.append(neighbor)
    boundary = sum(1 for count in edge_counts.values() if count == 1)
    non_manifold = sum(1 for count in edge_counts.values() if count != 2)
    return {
        "vertex_count": vertex_count,
        "face_count": len(faces),
        "triangle_count": sum(len(face) - 2 for face in faces),
        "edge_count": len(edge_counts),
        "connected_components": components,
        "loose_vertices": vertex_count - len(used),
        "boundary_edges": boundary,
        "non_manifold_edges": non_manifold,
        "euler_characteristic": vertex_count - len(edge_counts) + len(faces),
    }


@dataclass
class GeometryValidator:
    master: list
    faces: list
    active_faces: list

    def __post_init__(self):
        self.master_vectors = [Vector(point) for point in self.master]
        self.face_sets = [set(face) for face in self.faces]
        self.master_areas = []
        self.master_normals = []
        for face in self.faces:
            area, normal = polygon_area_normal(self.master, face)
            self.master_areas.append(area)
            self.master_normals.append(normal)
        self.master_volume = signed_volume(self.master, self.faces)
        self.master_silhouette = silhouette_metrics(self.master)
        self.topology = topology_metrics(len(self.master), self.faces)

    def intersections(self, positions) -> int:
        tree = BVHTree.FromPolygons(
            [Vector(point) for point in positions],
            self.faces,
            all_triangles=False,
            epsilon=1e-7,
        )
        pairs = set()
        for left, right in tree.overlap(tree):
            if left == right:
                continue
            pair = tuple(sorted((left, right)))
            if pair in pairs:
                continue
            pairs.add(pair)
        return sum(
            1
            for left, right in pairs
            if self.face_sets[left].isdisjoint(self.face_sets[right])
        )

    def metrics(self, positions, include_intersections=True) -> dict:
        finite = all(math.isfinite(value) for point in positions for value in point)
        areas = []
        normal_dots = []
        zero_area = 0
        min_triangle = float("inf")
        vectors = [Vector(point) for point in positions]
        for face_index, face in enumerate(self.faces):
            area, normal = polygon_area_normal(positions, face)
            areas.append(area)
            normal_dots.append(normal.dot(self.master_normals[face_index]))
            if area <= 1e-10:
                zero_area += 1
            for a, b, c in polygon_triangles(face):
                value = triangle_area(vectors[a], vectors[b], vectors[c])
                min_triangle = min(min_triangle, value)
                if value <= 1e-10:
                    zero_area += 1
        total_area = sum(areas)
        active_area = sum(areas[index] for index in self.active_faces)
        bbox = bounding_box(positions)
        volume = signed_volume(positions, self.faces)
        rms, maximum = rms_displacement(self.master, positions)
        silhouette = silhouette_metrics(positions)
        intersections = self.intersections(positions) if include_intersections else -1
        min_area_ratio = min(
            area / source if source > 1e-12 else 0.0
            for area, source in zip(areas, self.master_areas)
        )
        return {
            "finite_coordinates": finite,
            "bounding_box": bbox,
            "signed_volume": round(volume, 6),
            "volume_ratio_to_master": round(volume / self.master_volume, 6),
            "minimum_triangle_area": round(min_triangle, 9),
            "minimum_face_area_ratio_to_master": round(min_area_ratio, 6),
            "zero_area_or_degenerate": zero_area,
            "minimum_master_normal_dot": round(min(normal_dots), 6),
            "inverted_or_folded_faces": sum(1 for value in normal_dots if value <= 0.0),
            "nonadjacent_self_intersections": intersections,
            "active_surface_ratio": round(active_area / total_area, 6),
            "rms_displacement_from_master": round(rms, 6),
            "max_displacement_from_master": round(maximum, 6),
            "position_hash": positions_hash(positions),
            "silhouette": silhouette,
        }

    def checks(self, metrics, strict_mask=True) -> dict:
        bbox = metrics["bounding_box"]
        low, high = (0.32, 0.36) if strict_mask else (0.31, 0.37)
        return {
            "finite_coordinates": metrics["finite_coordinates"],
            "positive_volume": metrics["signed_volume"] > 0.0,
            "no_degenerate_triangles": metrics["zero_area_or_degenerate"] == 0
            and metrics["minimum_triangle_area"] > 1e-8,
            "no_normal_inversion": metrics["inverted_or_folded_faces"] == 0,
            "no_local_collapse": metrics["minimum_face_area_ratio_to_master"] > 0.20,
            "no_self_intersections": metrics["nonadjacent_self_intersections"] == 0,
            "inside_canonical_envelope": all(
                size <= target + ENVELOPE_ABSOLUTE_TOLERANCE
                for size, target in zip(bbox["size"], TARGET_BBOX)
            ),
            "canonical_fill": all(
                value >= 0.88 - CANONICAL_FILL_TOLERANCE for value in bbox["fill"]
            ),
            "mask_area": low <= metrics["active_surface_ratio"] <= high,
        }


def compact_sample(metrics, progress: float) -> dict:
    inside_envelope = all(
        size <= target + ENVELOPE_ABSOLUTE_TOLERANCE
        for size, target in zip(metrics["bounding_box"]["size"], TARGET_BBOX)
    )
    canonical_fill = all(
        value >= 0.88 - CANONICAL_FILL_TOLERANCE
        for value in metrics["bounding_box"]["fill"]
    )
    checks = {
        "finite": metrics["finite_coordinates"],
        "volume": metrics["signed_volume"] > 0.0,
        "degenerate": metrics["zero_area_or_degenerate"] == 0,
        "normals": metrics["inverted_or_folded_faces"] == 0,
        "collapse": metrics["minimum_face_area_ratio_to_master"] > 0.20,
        "intersections": metrics["nonadjacent_self_intersections"] == 0,
        "bbox": canonical_fill and inside_envelope,
        "mask": 0.31 <= metrics["active_surface_ratio"] <= 0.37,
    }
    return {
        "t": round(progress, 6),
        "bbox_size": metrics["bounding_box"]["size"],
        "bbox_fill": metrics["bounding_box"]["fill"],
        "signed_volume": metrics["signed_volume"],
        "mask_area": metrics["active_surface_ratio"],
        "minimum_triangle_area": metrics["minimum_triangle_area"],
        "minimum_normal_dot": metrics["minimum_master_normal_dot"],
        "minimum_face_area_ratio": metrics["minimum_face_area_ratio_to_master"],
        "self_intersections": metrics["nonadjacent_self_intersections"],
        "silhouette_area": metrics["silhouette"]["hull_area"],
        "inside_canonical_envelope": inside_envelope,
        "canonical_fill_desirable": canonical_fill,
        "checks": checks,
        "passed": all(checks.values()),
    }


def pair_danger(left, right, validator: GeometryValidator, risk_map: dict) -> dict:
    rms, maximum = rms_displacement(left, right)
    left_metrics = silhouette_metrics(left)
    right_metrics = silhouette_metrics(right)
    silhouette_delta = abs(right_metrics["hull_area"] - left_metrics["hull_area"]) / max(
        left_metrics["hull_area"], 1e-9
    )
    normal_dots = []
    for face in validator.faces:
        _, left_normal = polygon_area_normal(left, face)
        _, right_normal = polygon_area_normal(right, face)
        normal_dots.append(left_normal.dot(right_normal))
    minimum_normal_dot = min(normal_dots)
    association = max(risk_map.get("left", 0), risk_map.get("right", 0))
    score = rms * 2.1 + maximum * 0.55 + silhouette_delta * 1.8 + (
        1.0 - minimum_normal_dot
    ) * 1.4 + association * 0.08
    return {
        "rms_displacement": round(rms, 6),
        "max_displacement": round(maximum, 6),
        "minimum_endpoint_normal_dot": round(minimum_normal_dot, 6),
        "silhouette_delta": round(silhouette_delta, 6),
        "association_risk": association,
        "danger_score": round(score, 6),
    }


def validate_pairwise(positions_by_name, validator, risk_levels, output_path: Path) -> dict:
    pairs = []
    for left_index, left_name in enumerate(TERMINAL_NAMES):
        for right_name in TERMINAL_NAMES[left_index + 1 :]:
            danger = pair_danger(
                positions_by_name[left_name],
                positions_by_name[right_name],
                validator,
                {"left": risk_levels.get(left_name, 0), "right": risk_levels.get(right_name, 0)},
            )
            pairs.append({"source": left_name, "target": right_name, **danger})

    ranked = sorted(pairs, key=lambda item: item["danger_score"], reverse=True)
    expanded_names = {
        frozenset((item["source"], item["target"])) for item in ranked[:10]
    } | MANDATORY_EXPANDED_PAIRS

    all_passed = True
    for pair in pairs:
        left_name, right_name = pair["source"], pair["target"]
        samples = []
        for step in range(11):
            progress = step / 10.0
            positions = interpolate(
                positions_by_name[left_name], positions_by_name[right_name], progress
            )
            metrics = validator.metrics(positions, include_intersections=True)
            sample = compact_sample(metrics, progress)
            samples.append(sample)
            all_passed = all_passed and sample["passed"]
        pair["samples_11"] = samples
        pair_key = frozenset((left_name, right_name))
        pair["expanded_45"] = pair_key in expanded_names
        pair["risk_reasons"] = []
        if pair in ranked[:10]:
            pair["risk_reasons"].append("automatic top-10 geometric danger score")
        if pair_key in MANDATORY_EXPANDED_PAIRS:
            pair["risk_reasons"].append("mandatory semantic risk pair")
        if pair["expanded_45"]:
            expanded = []
            for step in range(45):
                progress = step / 44.0
                positions = interpolate(
                    positions_by_name[left_name], positions_by_name[right_name], progress
                )
                metrics = validator.metrics(positions, include_intersections=True)
                sample = compact_sample(metrics, progress)
                expanded.append(sample)
                all_passed = all_passed and sample["passed"]
            pair["samples_45"] = expanded
        pair["passed"] = all(sample["passed"] for sample in samples) and all(
            sample["passed"] for sample in pair.get("samples_45", [])
        )

    report = {
        "stage": "PS-03.2",
        "terminal_count": len(TERMINAL_NAMES),
        "pair_count": len(pairs),
        "base_samples_per_pair": 11,
        "expanded_samples_per_risky_pair": 45,
        "expanded_pair_count": sum(1 for pair in pairs if pair["expanded_45"]),
        "selection_method": "mandatory semantic list union automatic top-10 displacement/normal/silhouette/association score",
        "pairs": pairs,
        "passed": all_passed and len(pairs) == 66,
    }
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    return report


def validate_retarget(positions_by_name, validator, output_path: Path) -> dict:
    chains = []
    all_passed = True
    for first, second, third in RETARGET_CHAINS:
        chain = {"states": [first, second, third], "switches": []}
        for switch_progress in (0.25, 0.50, 0.75):
            snapshot = interpolate(
                positions_by_name[first], positions_by_name[second], switch_progress
            )
            samples = []
            previous = snapshot
            max_step_rms = 0.0
            for step in range(11):
                progress = step / 10.0
                current = interpolate(snapshot, positions_by_name[third], progress)
                step_rms, _ = rms_displacement(previous, current)
                max_step_rms = max(max_step_rms, step_rms)
                metrics = validator.metrics(current, include_intersections=True)
                sample = compact_sample(metrics, progress)
                sample["step_rms"] = round(step_rms, 7)
                samples.append(sample)
                previous = current
                all_passed = all_passed and sample["passed"]
            switch = {
                "first_transition_progress": switch_progress,
                "source_snapshot_weights": {first: 1.0 - switch_progress, second: switch_progress},
                "retarget_rule": "retain current weights and multiply them by (1-t); set destination weight to t",
                "coordinate_jump_at_switch": 0.0,
                "normal_jump_at_switch": 0.0,
                "max_step_rms": round(max_step_rms, 7),
                "samples": samples,
                "passed": all(sample["passed"] for sample in samples),
            }
            chain["switches"].append(switch)
        chain["passed"] = all(item["passed"] for item in chain["switches"])
        chains.append(chain)
    report = {
        "stage": "PS-03.2",
        "chain_count": len(chains),
        "switch_progress_values": [0.25, 0.5, 0.75],
        "chains": chains,
        "passed": all_passed,
    }
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    return report


def validate_additive(positions_by_name, validator, output_path: Path) -> dict:
    master = positions_by_name["MASTER"]
    tension = positions_by_name["TRANSITION_TENSION"]
    delta = [
        (right[0] - left[0], right[1] - left[1], right[2] - left[2])
        for left, right in zip(master, tension)
    ]
    weights = (0.0, 0.04, 0.06, 0.25, 0.50, 1.0)
    terminals = []
    all_passed = True
    for name in TERMINAL_NAMES:
        base = positions_by_name[name]
        base_volume = signed_volume(base, validator.faces)
        samples = []
        for weight in weights:
            current = add_delta(base, delta, weight)
            metrics = validator.metrics(current, include_intersections=True)
            sample = compact_sample(metrics, weight)
            sample["weight"] = sample.pop("t")
            sample["volume_change_from_terminal"] = round(
                metrics["signed_volume"] / base_volume - 1.0, 7
            )
            runtime = weight in (0.04, 0.06)
            sample["runtime_subtle_volume"] = (
                abs(sample["volume_change_from_terminal"]) <= 0.01 if runtime else True
            )
            # Runtime weights must retain the complete terminal envelope/fill
            # contract.  Diagnostic weights up to 1.0 are intentionally much
            # stronger and are required to preserve mesh integrity and stay
            # inside the maximum envelope; their minimum axis fill is recorded
            # but is not a destruction criterion in the approved brief.
            diagnostic_mesh_integrity = all(
                value
                for key, value in sample["checks"].items()
                if key != "bbox"
            ) and sample["inside_canonical_envelope"]
            sample["diagnostic_mesh_integrity"] = diagnostic_mesh_integrity
            sample["passed"] = (
                sample["passed"] if runtime else diagnostic_mesh_integrity
            ) and sample["runtime_subtle_volume"]
            samples.append(sample)
            all_passed = all_passed and sample["passed"]
        terminals.append(
            {
                "terminal": name,
                "samples": samples,
                "passed": all(sample["passed"] for sample in samples),
            }
        )
    report = {
        "stage": "PS-03.2",
        "target": "TRANSITION_TENSION",
        "runtime_weights": [0.04, 0.06],
        "diagnostic_weights": [0.0, 0.25, 0.5, 1.0],
        "combination_count": len(TERMINAL_NAMES) * len(weights),
        "terminals": terminals,
        "passed": all_passed,
    }
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    return report


def extract_positions_from_shape_keys(obj) -> dict:
    if obj.data.shape_keys is None:
        raise RuntimeError("Production object has no shape keys")
    result = {}
    for key in obj.data.shape_keys.key_blocks:
        result[key.name] = [tuple(point.co) for point in key.data]
    if "MASTER" not in result and "Basis" in result:
        result["MASTER"] = result.pop("Basis")
    return result


def run_from_production_blend():
    script_path = Path(__file__).resolve()
    stage_dir = script_path.parent.parent
    blend_path = stage_dir / "blender" / "photonic-skin-c-r1-morph-system.blend"
    export_dir = stage_dir / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one production actor mesh, found {len(meshes)}")
    obj = meshes[0]
    faces = [tuple(poly.vertices) for poly in obj.data.polygons]
    active_faces = json.loads(obj.get("photonicMaskFaceIndices", "[]"))
    positions = extract_positions_from_shape_keys(obj)
    missing = [name for name in (TERMINAL_NAMES + ("TRANSITION_TENSION",)) if name not in positions]
    if missing:
        raise RuntimeError(f"Missing shape keys: {missing}")
    validator = GeometryValidator(positions["MASTER"], faces, active_faces)
    risk_levels = json.loads(obj.get("targetRiskLevels", "{}"))
    pairwise = validate_pairwise(
        positions, validator, risk_levels, export_dir / "ps03-2-pairwise-validation.json"
    )
    retarget = validate_retarget(
        positions, validator, export_dir / "ps03-2-retarget-validation.json"
    )
    additive = validate_additive(
        positions, validator, export_dir / "ps03-2-additive-validation.json"
    )
    passed = pairwise["passed"] and retarget["passed"] and additive["passed"]
    print("PS032_VALIDATION", {"pairwise": pairwise["passed"], "retarget": retarget["passed"], "additive": additive["passed"]})
    if not passed:
        raise RuntimeError("PS-03.2 transition validation failed")


if __name__ == "__main__":
    run_from_production_blend()
