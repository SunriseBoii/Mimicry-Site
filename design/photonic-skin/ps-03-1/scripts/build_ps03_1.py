"""PS-03.1 production refinement pipeline for C-R1 / Directed Tensioned Core.

The script reads the protected PS-02 .blend, extracts A and C together with the
shared topology, UVs and photonic mask, then creates three coordinate-only
refinements of C. No operation is allowed to change connectivity, vertex order,
UV loop order or the active face set.

Run from the repository root:

    blender --background --factory-startup --python \
      design/photonic-skin/ps-03-1/scripts/build_ps03_1.py
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import statistics
from pathlib import Path
from typing import Iterable, Sequence

import bpy
from mathutils import Quaternion, Vector
from mathutils.bvhtree import BVHTree


SCRIPT_PATH = Path(__file__).resolve()
PS03_DIR = SCRIPT_PATH.parent.parent
PS02_DIR = PS03_DIR.parent / "ps-02"
SOURCE_BLEND = PS02_DIR / "blender" / "ps-02-mimic-core.blend"
SOURCE_VALIDATION = PS02_DIR / "exports" / "ps02-technical-validation.json"

BLEND_DIR = PS03_DIR / "blender"
EXPORT_DIR = PS03_DIR / "exports"
RENDER_DIR = PS03_DIR / "renders"
PANEL_DIR = RENDER_DIR / "_panels"
for directory in (BLEND_DIR, EXPORT_DIR, RENDER_DIR, PANEL_DIR):
    directory.mkdir(parents=True, exist_ok=True)

SEGMENTS = 160
INTERIOR_RINGS = 52
TARGET_BBOX = (6.8, 3.6, 3.2)
EXPECTED_VERTICES = 8322
EXPECTED_TRIANGLES = 16640
EXPECTED_ACTIVE_FACES = 2526
EXPECTED_TOPOLOGY_HASH = "8883e7698bbd3a6aafef5a4a8a4ea5f04ee96d7ad7cc41cee841a94986e1e462"
EXPECTED_UV_HASH = "c5eff463ac2b978f0470e1fef6fffc4eb5a01fe06f66262b3effba5518e67683"
DIRECTED_AXIS = Vector((0.86, 0.28, 0.42)).normalized()
RECOMMENDED_KEY = "R1B"

REFINEMENTS = {
    "R1A": {"label": "C-R1A / 15%", "visual_direction": 15, "strength": 0.74},
    "R1B": {"label": "C-R1B / 20%", "visual_direction": 20, "strength": 1.00},
    "R1C": {"label": "C-R1C / 25%", "visual_direction": 25, "strength": 1.28},
}

COLORS = {
    "ivory": "#DED8CC",
    "dark": "#202329",
    "content": "#4C7AFF",
    "design": "#9E64EE",
    "digital": "#009FAC",
    "light_bg": "#F4F5F2",
    "dark_bg": "#111214",
}


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    t = clamp((value - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def angular_distance(value: float, center: float) -> float:
    return math.atan2(math.sin(value - center), math.cos(value - center))


def shaped_axis(value: float, power: float) -> float:
    return math.copysign(abs(value) ** power, value)


def photonic_zone_field(s: float, phi: float) -> float:
    """Continuous approximation of the inherited mask region for deformation.

    This is only a smooth mass/tension field. The actual photonic membership and
    face indices remain the exact protected PS-02 values.
    """

    u = (s + 1.0) * 0.5
    radial = max(0.0, 1.0 - s * s) ** 0.25
    top = math.sin(phi)
    camera_side = -math.cos(phi)
    score = radial * (
        0.50 * top
        + 0.34 * camera_side
        + 0.18 * math.sin(math.pi * u)
        + 0.12 * u
        + 0.055 * math.sin(phi * 3.0 + u * 8.0)
    )
    return smoothstep(-0.18, 0.62, score)


def hex_rgba(value: str) -> tuple[float, float, float, float]:
    value = value.lstrip("#")
    return (
        int(value[0:2], 16) / 255.0,
        int(value[2:4], 16) / 255.0,
        int(value[4:6], 16) / 255.0,
        1.0,
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parameters_for_shared_topology() -> list[tuple[float, float]]:
    parameters: list[tuple[float, float]] = [(-1.0, 0.0)]
    for ring in range(1, INTERIOR_RINGS + 1):
        s = -1.0 + 2.0 * ring / (INTERIOR_RINGS + 1)
        for segment in range(SEGMENTS):
            parameters.append((s, math.tau * segment / SEGMENTS))
    parameters.append((1.0, 0.0))
    if len(parameters) != EXPECTED_VERTICES:
        raise RuntimeError(f"Parameter count mismatch: {len(parameters)}")
    return parameters


def topology_hash(faces: Sequence[tuple[int, ...]]) -> str:
    payload = json.dumps(faces, separators=(",", ":")).encode("utf8")
    return hashlib.sha256(payload).hexdigest()


def uv_hash_values(values: Sequence[tuple[float, float]]) -> str:
    payload = ";".join(f"{u:.8f},{v:.8f}" for u, v in values).encode("ascii")
    return hashlib.sha256(payload).hexdigest()


def mask_index_hash(indices: Sequence[int]) -> str:
    payload = json.dumps(list(indices), separators=(",", ":")).encode("ascii")
    return hashlib.sha256(payload).hexdigest()


def positions_hash(positions: Sequence[tuple[float, float, float]]) -> str:
    payload = ";".join(f"{x:.8f},{y:.8f},{z:.8f}" for x, y, z in positions).encode("ascii")
    return hashlib.sha256(payload).hexdigest()


def extract_master_positions(obj: bpy.types.Object) -> list[tuple[float, float, float]]:
    keys = obj.data.shape_keys
    if not keys or "MASTER" not in keys.key_blocks:
        raise RuntimeError(f"{obj.name} does not contain MASTER")
    return [tuple(point.co) for point in keys.key_blocks["MASTER"].data]


def read_protected_ps02_source() -> dict:
    if not SOURCE_BLEND.exists() or not SOURCE_VALIDATION.exists():
        missing = [str(path) for path in (SOURCE_BLEND, SOURCE_VALIDATION) if not path.exists()]
        raise FileNotFoundError("Missing critical PS-02 inputs: " + ", ".join(missing))

    source_hashes = {
        "blend_sha256": sha256_file(SOURCE_BLEND),
        "validation_sha256": sha256_file(SOURCE_VALIDATION),
    }
    ps02_validation = json.loads(SOURCE_VALIDATION.read_text(encoding="utf8"))
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE_BLEND))

    names = {
        "A": "MimicCore_A_directed-fold",
        "C": "MimicCore_C_tensioned-core",
    }
    if any(name not in bpy.data.objects for name in names.values()):
        raise RuntimeError("Protected PS-02 .blend does not contain expected A/C objects")
    obj_a = bpy.data.objects[names["A"]]
    obj_c = bpy.data.objects[names["C"]]
    faces_a = [tuple(polygon.vertices) for polygon in obj_a.data.polygons]
    faces_c = [tuple(polygon.vertices) for polygon in obj_c.data.polygons]
    if faces_a != faces_c:
        raise RuntimeError("A and C no longer share the same face/index order")

    uv_layer = obj_c.data.uv_layers.get("MimicCoreUV")
    if uv_layer is None:
        raise RuntimeError("MimicCoreUV missing from candidate C")
    uv_values = [tuple(item.uv) for item in uv_layer.data]

    mask_attribute = obj_c.data.attributes.get("_PHOTONIC_MASK")
    slot_attribute = obj_c.data.attributes.get("_PHOTONIC_SLOT")
    if mask_attribute is None or slot_attribute is None:
        raise RuntimeError("Photonic point attributes are missing from candidate C")
    point_mask = [float(item.value) for item in mask_attribute.data]
    point_slot = [float(item.value) for item in slot_attribute.data]

    active_slots = {
        polygon.index: int(polygon.material_index)
        for polygon in obj_c.data.polygons
        if polygon.material_index > 0
    }
    active_faces = sorted(active_slots)
    result = {
        "positions": {
            "A": extract_master_positions(obj_a),
            "C": extract_master_positions(obj_c),
        },
        "faces": faces_c,
        "uv_values": uv_values,
        "point_mask": point_mask,
        "point_slot": point_slot,
        "active_slots": active_slots,
        "active_faces": active_faces,
        "source_hashes": source_hashes,
        "ps02_validation": ps02_validation,
    }

    computed_topology = topology_hash(faces_c)
    computed_uv = uv_hash_values(uv_values)
    if computed_topology != EXPECTED_TOPOLOGY_HASH:
        raise RuntimeError(f"Unexpected PS-02 topology hash: {computed_topology}")
    if computed_uv != EXPECTED_UV_HASH:
        raise RuntimeError(f"Unexpected PS-02 UV hash: {computed_uv}")
    if len(active_faces) != EXPECTED_ACTIVE_FACES:
        raise RuntimeError(f"Unexpected PS-02 active face count: {len(active_faces)}")
    return result


def normalize_positions(
    positions: Sequence[tuple[float, float, float]],
) -> list[tuple[float, float, float]]:
    minima = [min(point[axis] for point in positions) for axis in range(3)]
    maxima = [max(point[axis] for point in positions) for axis in range(3)]
    centers = [(minima[axis] + maxima[axis]) * 0.5 for axis in range(3)]
    scales = [TARGET_BBOX[axis] / (maxima[axis] - minima[axis]) for axis in range(3)]
    return [
        tuple((point[axis] - centers[axis]) * scales[axis] for axis in range(3))
        for point in positions
    ]


def ring_mean_x(
    positions: Sequence[tuple[float, float, float]],
    parameters: Sequence[tuple[float, float]],
) -> dict[float, float]:
    groups: dict[float, list[float]] = {}
    for (x, _y, _z), (s, _phi) in zip(positions, parameters):
        groups.setdefault(round(s, 9), []).append(x)
    return {key: statistics.fmean(values) for key, values in groups.items()}


def ring_profiles(
    positions: Sequence[tuple[float, float, float]],
    parameters: Sequence[tuple[float, float]],
) -> dict[float, tuple[float, float, float]]:
    groups: dict[float, list[tuple[float, float, float]]] = {}
    for point, (s, _phi) in zip(positions, parameters):
        groups.setdefault(round(s, 9), []).append(point)
    return {
        key: (
            statistics.fmean(point[0] for point in values),
            max(abs(point[1]) for point in values),
            max(abs(point[2]) for point in values),
        )
        for key, values in groups.items()
    }


def refine_c_positions(
    source_c: Sequence[tuple[float, float, float]],
    parameters: Sequence[tuple[float, float]],
    point_mask: Sequence[float],
    strength: float,
) -> list[tuple[float, float, float]]:
    """Apply controlled local fields to C while keeping connectivity untouched.

    The fields deliberately avoid a global A/C vertex interpolation:
    - ring-local x smoothing reduces the central concavity/paired fold;
    - a broad moving angular lobe creates one dominant tension ridge;
    - local front-ring translation creates a blunt leading shoulder;
    - low-amplitude mass shear creates the directed axis;
    - a smooth compression inside the inherited mask keeps its area in range.
    """

    profiles = ring_profiles(source_c, parameters)
    output: list[tuple[float, float, float]] = []
    cleanup_amount = 0.43 + 0.030 * strength

    for source, (s, phi), mask_weight in zip(source_c, parameters, point_mask):
        x, y, z = source
        if abs(s) > 0.999:
            output.append((x, y, z))
            continue

        u = (s + 1.0) * 0.5
        body = max(0.0, 1.0 - s * s)
        y_dir = math.cos(phi)
        z_dir = math.sin(phi)

        # 1. Remove the mouth/eye-like paired concavity without flattening C.
        central_zone = (
            body
            * smoothstep(-0.72, -0.10, s)
            * (1.0 - smoothstep(0.76, 0.96, s))
        )
        x_mean, ring_y, ring_z = profiles[round(s, 9)]
        x += (x_mean - x) * cleanup_amount * central_zone

        # The inherited front had radial folds converging into an eye-like star.
        # Blend only the leading rings toward a broad regular shoulder profile.
        leading_cleanup = smoothstep(0.16, 0.48, s) * (1.0 - smoothstep(0.91, 0.985, s))
        ideal_y = ring_y * shaped_axis(y_dir, 0.76)
        ideal_z = ring_z * shaped_axis(z_dir, 0.78)
        face_smoothing = (0.66 + 0.020 * strength) * leading_cleanup
        y += (ideal_y - y) * face_smoothing
        z += (ideal_z - z) * face_smoothing
        x += (x_mean - x) * 0.78 * leading_cleanup

        # 2. Calm secondary bilateral muscle-like undulation.
        competing_center = 0.78 - 0.10 * s
        competing = math.exp(-(angular_distance(phi, competing_center) / 0.62) ** 2)
        calm = 0.035 * (0.85 + 0.15 * strength) * body * competing
        radial = math.sqrt(y * y + z * z)
        if radial > 1e-8:
            y *= 1.0 - calm
            z *= 1.0 - calm

        # 3. One broad dominant ridge; its angular center drifts along x.
        ridge_center = 2.31 - 0.24 * s
        ridge_angular = math.exp(-(angular_distance(phi, ridge_center) / 0.63) ** 2)
        ridge_long = body * math.exp(-((s - 0.08) / 0.67) ** 2)
        ridge = ridge_angular * ridge_long
        x += strength * 0.115 * ridge * (0.38 + 0.62 * u)
        y -= strength * 0.080 * ridge
        z += strength * 0.220 * ridge

        # 4. Directed mass distribution along the approved object-space axis.
        directed = body * smoothstep(-0.82, 0.42, s) * (0.32 + 0.68 * u)
        x += strength * 0.130 * directed * DIRECTED_AXIS.x
        y += strength * 0.068 * directed * DIRECTED_AXIS.y
        z += strength * 0.125 * directed * DIRECTED_AXIS.z

        # 5. Widen and advance the rings behind the leading pole: blunt shoulder.
        leading = math.exp(-((s - 0.69) / 0.245) ** 2) * body
        x += strength * 0.380 * leading
        shoulder_scale = 1.0 + strength * 0.085 * leading
        y *= shoulder_scale
        z *= 1.0 + strength * 0.070 * leading
        z += strength * 0.050 * leading

        # 6. Preserve C's compact rear mass and prevent an aerodynamic taper.
        rear = math.exp(-((s + 0.38) / 0.42) ** 2) * body
        y *= 1.0 + 0.026 * rear
        z *= 1.0 + 0.021 * rear

        rear_shoulder = math.exp(-((s + 0.72) / 0.245) ** 2) * body
        x -= strength * 0.240 * rear_shoulder
        y *= 1.0 + strength * 0.050 * rear_shoulder
        z *= 1.0 + strength * 0.040 * rear_shoulder

        central_mass = math.exp(-((s - 0.02) / 0.58) ** 2) * body
        y *= 1.0 - 0.012 * central_mass
        z *= 1.0 + 0.038 * central_mass

        directed_crest = (
            body
            * math.exp(-((s - 0.20) / 0.50) ** 2)
            * smoothstep(0.04, 0.72, z_dir)
        )
        x += strength * 0.040 * directed_crest
        z += strength * 0.078 * directed_crest

        # 7. Controlled compositional asymmetry, broad enough to avoid anatomy.
        y += strength * 0.034 * body * z_dir * (0.22 + 0.78 * u)
        z += strength * 0.021 * body * y_dir * (0.82 - 0.45 * u)

        # 8. The inherited mask remains fixed. A broad continuous field—not the
        # discrete membership weights—keeps physical area inside 32–36% without
        # engraving the mask boundary into the geometry.
        zone_tension = photonic_zone_field(s, phi)
        surface_tension = 1.0 - 0.140 * zone_tension * body * (0.94 + 0.06 * strength)
        y *= surface_tension
        z *= surface_tension

        output.append((x, y, z))

    return normalize_positions(output)


def polygon_triangles(face: Sequence[int]) -> Iterable[tuple[int, int, int]]:
    for index in range(1, len(face) - 1):
        yield face[0], face[index], face[index + 1]


def triangle_area(a: Vector, b: Vector, c: Vector) -> float:
    return (b - a).cross(c - a).length * 0.5


def face_area(positions, face) -> float:
    points = [Vector(positions[index]) for index in face]
    return sum(
        triangle_area(points[0], points[index], points[index + 1])
        for index in range(1, len(points) - 1)
    )


def minimum_triangle_area(positions, faces) -> float:
    minimum = float("inf")
    for face in faces:
        for a, b, c in polygon_triangles(face):
            minimum = min(
                minimum,
                triangle_area(Vector(positions[a]), Vector(positions[b]), Vector(positions[c])),
            )
    return minimum


def signed_volume(positions, faces) -> float:
    total = 0.0
    for face in faces:
        for a, b, c in polygon_triangles(face):
            va, vb, vc = Vector(positions[a]), Vector(positions[b]), Vector(positions[c])
            total += va.dot(vb.cross(vc)) / 6.0
    return total


def polygon_normal(positions, face) -> Vector:
    a, b, c = (Vector(positions[index]) for index in face[:3])
    result = (b - a).cross(c - a)
    return result.normalized() if result.length else Vector((0.0, 0.0, 0.0))


def nonadjacent_intersections(positions, faces) -> int:
    tree = BVHTree.FromPolygons(
        [Vector(point) for point in positions], faces, all_triangles=False, epsilon=1e-7
    )
    face_sets = [set(face) for face in faces]
    unique: set[tuple[int, int]] = set()
    for left, right in tree.overlap(tree):
        if left == right:
            continue
        pair = tuple(sorted((left, right)))
        unique.add(pair)
    return sum(1 for left, right in unique if face_sets[left].isdisjoint(face_sets[right]))


def topology_metrics(vertex_count: int, faces: Sequence[tuple[int, ...]]) -> dict:
    edge_counts: dict[tuple[int, int], int] = {}
    used: set[int] = set()
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
    return {
        "vertex_count": vertex_count,
        "face_count": len(faces),
        "triangle_count": sum(len(face) - 2 for face in faces),
        "edge_count": len(edge_counts),
        "connected_components": components,
        "loose_vertices": vertex_count - len(used),
        "non_manifold_edges": sum(1 for count in edge_counts.values() if count != 2),
        "euler_characteristic": vertex_count - len(edge_counts) + len(faces),
    }


def bounding_box(positions) -> dict:
    minima = [min(point[axis] for point in positions) for axis in range(3)]
    maxima = [max(point[axis] for point in positions) for axis in range(3)]
    return {
        "min": [round(value, 6) for value in minima],
        "max": [round(value, 6) for value in maxima],
        "size": [round(maxima[i] - minima[i], 6) for i in range(3)],
    }


def rms_displacement(source, target) -> tuple[float, float]:
    distances = [(Vector(b) - Vector(a)).length for a, b in zip(source, target)]
    rms = math.sqrt(statistics.fmean(value * value for value in distances))
    return rms, max(distances)


def angular_x_variation(positions, parameters) -> float:
    values_by_ring: dict[float, list[float]] = {}
    for (x, _y, _z), (s, _phi) in zip(positions, parameters):
        if -0.10 <= s <= 0.70:
            values_by_ring.setdefault(round(s, 9), []).append(x)
    deviations = [statistics.pstdev(values) for values in values_by_ring.values()]
    return statistics.fmean(deviations)


def validate_geometry(
    key: str,
    positions,
    source_c,
    parameters,
    faces,
    active_faces,
) -> dict:
    metrics = topology_metrics(len(positions), faces)
    source_normals = [polygon_normal(source_c, face) for face in faces]
    current_normals = [polygon_normal(positions, face) for face in faces]
    normal_dots = [a.dot(b) for a, b in zip(source_normals, current_normals)]
    total_area = sum(face_area(positions, face) for face in faces)
    active_area = sum(face_area(positions, faces[index]) for index in active_faces)
    min_area = minimum_triangle_area(positions, faces)
    zero_area = sum(
        1
        for face in faces
        for a, b, c in polygon_triangles(face)
        if triangle_area(Vector(positions[a]), Vector(positions[b]), Vector(positions[c])) <= 1e-10
    )
    volume = signed_volume(positions, faces)
    intersections = nonadjacent_intersections(positions, faces)
    bbox = bounding_box(positions)
    rms, maximum = rms_displacement(source_c, positions)
    source_variation = angular_x_variation(source_c, parameters)
    current_variation = angular_x_variation(positions, parameters)
    active_ratio = active_area / total_area
    checks = {
        "vertex_count": metrics["vertex_count"] == EXPECTED_VERTICES,
        "triangle_count": metrics["triangle_count"] == EXPECTED_TRIANGLES,
        "connected_surface": metrics["connected_components"] == 1,
        "manifold": metrics["non_manifold_edges"] == 0,
        "no_loose_vertices": metrics["loose_vertices"] == 0,
        "positive_volume": volume > 0.0,
        "no_degenerate_triangles": zero_area == 0 and min_area > 1e-8,
        "normals_not_inverted": min(normal_dots) > 0.0,
        "no_self_intersections": intersections == 0,
        "bounding_box_exact": bbox["size"] == list(TARGET_BBOX),
        "mask_area_in_range": 0.32 <= active_ratio <= 0.36,
    }
    return {
        "key": key,
        "metrics": metrics,
        "bounding_box": bbox,
        "signed_volume": round(volume, 6),
        "minimum_triangle_area": round(min_area, 9),
        "zero_area_triangles": zero_area,
        "minimum_source_normal_dot": round(min(normal_dots), 6),
        "nonadjacent_self_intersections": intersections,
        "active_surface_ratio": round(active_ratio, 6),
        "rms_displacement_from_c": round(rms, 6),
        "max_displacement_from_c": round(maximum, 6),
        "central_angular_x_variation": round(current_variation, 6),
        "central_variation_reduction": round(1.0 - current_variation / source_variation, 6),
        "position_hash": positions_hash(positions),
        "checks": checks,
        "passed": all(checks.values()),
    }


def make_material(name: str, color: str, roughness: float, metallic: float, coat=0.16):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = hex_rgba(color)
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_rgba(color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = 1.46
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
    if "Coat Roughness" in bsdf.inputs:
        bsdf.inputs["Coat Roughness"].default_value = 0.34
    return material


def make_silhouette_material():
    material = bpy.data.materials.new("PS031_Silhouette_Black")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    diffuse = nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (0.003, 0.003, 0.003, 1.0)
    diffuse.inputs["Roughness"].default_value = 1.0
    links.new(diffuse.outputs["BSDF"], output.inputs["Surface"])
    return material


def build_materials() -> dict:
    return {
        "light": [
            make_material("PS031_Ivory_Ceramic", COLORS["ivory"], 0.42, 0.04, 0.22),
            make_material("PS031_Content_Mask", COLORS["content"], 0.36, 0.12, 0.24),
            make_material("PS031_Design_Mask", COLORS["design"], 0.36, 0.12, 0.24),
            make_material("PS031_Digital_Mask", COLORS["digital"], 0.36, 0.12, 0.24),
        ],
        "dark": [make_material("PS031_Dark_Titanium", COLORS["dark"], 0.38, 0.46, 0.18)],
        "silhouette": [make_silhouette_material()],
        "wire_base": [make_material("PS031_Wire_Base", "#D9D6CD", 0.55, 0.0, 0.0)],
        "wire_line": [make_material("PS031_Wire_Line", "#202329", 0.48, 0.0, 0.0)],
        "floor": [make_material("PS031_Floor", "#C9CBC7", 0.68, 0.0, 0.0)],
    }


def create_mesh_object(
    name: str,
    positions,
    faces,
    uv_values,
    point_mask,
    point_slot,
    active_slots,
    materials,
    collection,
    master_key: bool,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(positions, [], faces)
    mesh.update(calc_edges=True)
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    uv_layer = mesh.uv_layers.new(name="MimicCoreUV")
    if len(uv_layer.data) != len(uv_values):
        raise RuntimeError("UV loop count changed while copying PS-02 topology")
    for item, value in zip(uv_layer.data, uv_values):
        item.uv = value

    for attribute_name, values in (
        ("_PHOTONIC_MASK", point_mask),
        ("_PHOTONIC_SLOT", point_slot),
    ):
        attribute = mesh.attributes.new(name=attribute_name, type="FLOAT", domain="POINT")
        for item, value in zip(attribute.data, values):
            item.value = value

    for material in materials["light"]:
        mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.material_index = active_slots.get(polygon.index, 0)

    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    group = obj.vertex_groups.new(name="PhotonicActive_34")
    for index, weight in enumerate(point_mask):
        if weight > 0.0:
            group.add([index], weight, "REPLACE")
    if master_key:
        obj.shape_key_add(name="MASTER", from_mix=False)
    return obj


def assign_mode(obj, materials, active_slots, mode: str):
    obj.data.materials.clear()
    if mode == "neutral":
        slots = [materials["light"][0]]
    elif mode == "active":
        slots = materials["light"]
    elif mode == "silhouette":
        slots = materials["silhouette"]
    elif mode == "wire_base":
        slots = materials["wire_base"]
    else:
        raise ValueError(mode)
    for material in slots:
        obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = active_slots.get(polygon.index, 0) if mode == "active" else 0


def point_at(obj: bpy.types.Object, location, target=(0.0, 0.0, 0.0)):
    obj.location = location
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def set_camera(camera: bpy.types.Object, view: str):
    presets = {
        "canonical": ((9.0, -12.0, 6.5), (0.0, 0.0, 0.0)),
        "opposite": ((-9.0, 12.0, 6.5), (0.0, 0.0, 0.0)),
        "front": ((15.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        "side": ((0.0, -15.0, 0.0), (0.0, 0.0, 0.0)),
        "top": ((0.0, 0.0, 15.0), (0.0, 0.0, 0.0)),
        "risk": ((-11.5, -6.0, 3.8), (0.0, 0.0, 0.0)),
    }
    location, target = presets[view]
    point_at(camera, location, target)
    camera.data.lens = 55.0
    camera.data.sensor_width = 36.0
    camera.data.shift_x = 0.0
    camera.data.shift_y = 0.0


def set_world(scene: bpy.types.Scene, transparent: bool = False):
    scene.render.film_transparent = transparent
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = hex_rgba(COLORS["light_bg"])
    background.inputs["Strength"].default_value = 0.34


def show_only(objects: dict[str, bpy.types.Object], selected: bpy.types.Object):
    for obj in objects.values():
        visible = obj == selected
        obj.hide_render = not visible
        obj.hide_set(not visible)


def render_still(scene, path: Path, width: int, height: int, rgba: bool = False):
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.color_mode = "RGBA" if rgba else "RGB"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print("PS031_RENDER", path)


def render_wire(scene, obj, collection, materials, path):
    assign_mode(obj, materials, {}, "wire_base")
    wire_obj = obj.copy()
    wire_obj.data = obj.data.copy()
    wire_obj.name = obj.name + "_WireRender"
    collection.objects.link(wire_obj)
    wire_obj.data.materials.clear()
    wire_obj.data.materials.append(materials["wire_line"][0])
    for polygon in wire_obj.data.polygons:
        polygon.material_index = 0
    modifier = wire_obj.modifiers.new(name="PS031_Topology_Wire", type="WIREFRAME")
    modifier.thickness = 0.0065
    modifier.use_even_offset = True
    modifier.use_boundary = False
    modifier.use_replace = True
    render_still(scene, path, 960, 700)
    mesh = wire_obj.data
    bpy.data.objects.remove(wire_obj, do_unlink=True)
    bpy.data.meshes.remove(mesh)


def render_all_panels(
    scene,
    camera,
    floor,
    objects,
    materials,
    active_slots,
    mesh_collection,
):
    comparison = ["A", "C", "R1A", "R1B", "R1C", "FINAL"]
    floor.hide_render = False
    set_world(scene, False)
    for key in comparison:
        obj = objects[key]
        show_only(objects, obj)
        assign_mode(obj, materials, active_slots, "neutral")
        set_camera(camera, "canonical")
        render_still(scene, PANEL_DIR / f"comparison_{key}.png", 760, 560)

    final_obj = objects["FINAL"]
    views = ("canonical", "opposite", "front", "side", "top", "risk")
    show_only(objects, final_obj)
    assign_mode(final_obj, materials, active_slots, "neutral")
    for view in views:
        set_camera(camera, view)
        floor.hide_render = view == "top"
        render_still(scene, PANEL_DIR / f"final_{view}.png", 900, 700)

    floor.hide_render = True
    show_only(objects, final_obj)
    assign_mode(final_obj, materials, active_slots, "silhouette")
    set_world(scene, False)
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    background.inputs["Strength"].default_value = 1.0
    for light in [obj for obj in scene.objects if obj.type == "LIGHT"]:
        light.hide_render = True
    set_camera(camera, "canonical")
    render_still(scene, PANEL_DIR / "final_silhouette.png", 960, 700)

    for light in [obj for obj in scene.objects if obj.type == "LIGHT"]:
        light.hide_render = False
    set_world(scene, False)
    assign_mode(final_obj, materials, active_slots, "wire_base")
    set_camera(camera, "canonical")
    render_wire(scene, final_obj, mesh_collection, materials, PANEL_DIR / "final_wire.png")

    show_only(objects, final_obj)
    assign_mode(final_obj, materials, active_slots, "active")
    set_camera(camera, "canonical")
    render_still(scene, PANEL_DIR / "final_mask.png", 960, 700)

    for key in ("C", "FINAL"):
        obj = objects[key]
        show_only(objects, obj)
        assign_mode(obj, materials, active_slots, "neutral")
        set_camera(camera, "canonical")
        floor.hide_render = False
        render_still(scene, PANEL_DIR / f"c_to_final_{key}.png", 960, 700)

    show_only(objects, final_obj)
    assign_mode(final_obj, materials, active_slots, "neutral")
    floor.hide_render = False
    set_camera(camera, "canonical")
    render_still(scene, RENDER_DIR / "ps03-1_c-r1_canonical.png", 1920, 1200)

    # Transparent, physically re-lit actor for the offline interface composites.
    floor.hide_render = True
    set_world(scene, True)
    set_camera(camera, "canonical")
    final_obj.rotation_mode = "QUATERNION"
    view_axis = camera.location.normalized()
    final_obj.rotation_quaternion = Quaternion(view_axis, math.radians(34.0))
    render_still(scene, PANEL_DIR / "composition_actor.png", 1200, 1200, rgba=True)
    final_obj.rotation_mode = "XYZ"
    final_obj.rotation_euler = (0.0, 0.0, 0.0)
    set_world(scene, False)


def export_final_glb(obj, materials, active_slots, active_faces, topology_digest, mask_digest):
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.hide_render = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    obj["schemaVersion"] = "ps-03.1-v1"
    obj["canonicalState"] = "MASTER"
    obj["topologyHash"] = topology_digest
    obj["connectivityIndexHash"] = topology_digest
    obj["uvHash"] = EXPECTED_UV_HASH
    obj["boundingBox"] = json.dumps(TARGET_BBOX)
    obj["directedAxis"] = json.dumps([round(value, 8) for value in DIRECTED_AXIS])
    obj["maskFaceCount"] = len(active_faces)
    obj["maskFaceIndexHash"] = mask_digest
    obj["photonicMaskFaceIndices"] = json.dumps(active_faces, separators=(",", ":"))

    assign_mode(obj, materials, active_slots, "neutral")
    path = EXPORT_DIR / "c-r1-directed-tensioned-core.glb"
    properties = {item.identifier for item in bpy.ops.export_scene.gltf.get_rna_type().properties}
    requested = {
        "filepath": str(path),
        "export_format": "GLB",
        "use_selection": True,
        "export_apply": False,
        "export_morph": True,
        "export_morph_normal": True,
        "export_morph_tangent": False,
        "export_attributes": True,
        "export_materials": "EXPORT",
        "export_animations": False,
        "export_yup": True,
        "export_extras": True,
    }
    bpy.ops.export_scene.gltf(**{key: value for key, value in requested.items() if key in properties})
    assign_mode(obj, materials, active_slots, "active")
    print("PS031_EXPORT", path)
    return path


def save_workbench_and_final(scene, objects, final_obj, materials, active_slots):
    try:
        bpy.context.preferences.filepaths.save_version = 0
    except Exception:
        pass
    for key, obj in objects.items():
        obj.hide_set(key != "FINAL")
        obj.hide_render = key != "FINAL"
    assign_mode(final_obj, materials, active_slots, "active")
    workbench = BLEND_DIR / "ps-03-1-c-r1-refinement-workbench.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(workbench))

    for key, obj in list(objects.items()):
        if key == "FINAL":
            continue
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    final_obj.name = "MimicCore_C-R1_Directed_Tensioned_Core"
    final_obj.data.name = "MimicCore_C-R1_Directed_Tensioned_Core_Mesh"
    final_obj.hide_set(False)
    final_obj.hide_render = False
    final_path = BLEND_DIR / "c-r1-directed-tensioned-core.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(final_path))
    return workbench, final_path


def validate_glb_reimport(glb_path: Path, source_validation: dict) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one GLB mesh, found {len(meshes)}")
    obj = meshes[0]
    positions = [tuple(vertex.co) for vertex in obj.data.vertices]
    triangle_count = sum(len(polygon.vertices) - 2 for polygon in obj.data.polygons)
    bbox = bounding_box(positions)
    min_area = min(
        triangle_area(
            Vector(positions[polygon.vertices[0]]),
            Vector(positions[polygon.vertices[1]]),
            Vector(positions[polygon.vertices[2]]),
        )
        for polygon in obj.data.polygons
    )
    attrs = sorted(attribute.name for attribute in obj.data.attributes)
    extras = {key: obj[key] for key in obj.keys() if key != "_RNA_UI"}
    expected_position_hash = source_validation["variants"][RECOMMENDED_KEY]["position_hash"]
    checks = {
        "one_mesh": len(meshes) == 1,
        "triangle_count": triangle_count == EXPECTED_TRIANGLES,
        "bounding_box_exact": bbox["size"] == list(TARGET_BBOX),
        "no_degenerate_triangles": min_area > 1e-8,
        "uv_present": bool(obj.data.uv_layers),
        "mask_attribute_present": "_PHOTONIC_MASK" in attrs,
        "slot_attribute_present": "_PHOTONIC_SLOT" in attrs,
        "topology_extra_matches": extras.get("topologyHash") == EXPECTED_TOPOLOGY_HASH,
        "mask_count_extra_matches": extras.get("maskFaceCount") == EXPECTED_ACTIVE_FACES,
        "canonical_state_master": extras.get("canonicalState") == "MASTER",
    }
    report = {
        "blender_version": bpy.app.version_string,
        "file": str(glb_path),
        "file_sha256": sha256_file(glb_path),
        "mesh_name": obj.name,
        "runtime_vertex_count_after_seam_splits": len(obj.data.vertices),
        "triangle_count": triangle_count,
        "bounding_box": bbox,
        "minimum_triangle_area": round(min_area, 9),
        "attributes": attrs,
        "extras": extras,
        "source_master_position_hash": expected_position_hash,
        "checks": checks,
        "passed": all(checks.values()),
    }
    path = EXPORT_DIR / "ps03-1-glb-reimport-validation.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    if not report["passed"]:
        raise RuntimeError("GLB re-import validation failed")
    return report


def build_scene():
    protected = read_protected_ps02_source()
    source_blend_hash_before = protected["source_hashes"]["blend_sha256"]
    parameters = parameters_for_shared_topology()
    faces = protected["faces"]
    positions = dict(protected["positions"])
    for key, meta in REFINEMENTS.items():
        positions[key] = refine_c_positions(
            positions["C"], parameters, protected["point_mask"], meta["strength"]
        )
    positions["FINAL"] = list(positions[RECOMMENDED_KEY])

    topology_digest = topology_hash(faces)
    uv_digest = uv_hash_values(protected["uv_values"])
    mask_digest = mask_index_hash(protected["active_faces"])
    topology = topology_metrics(EXPECTED_VERTICES, faces)
    variant_validation = {
        key: validate_geometry(
            key,
            positions[key],
            positions["C"],
            parameters,
            faces,
            protected["active_faces"],
        )
        for key in REFINEMENTS
    }

    common_checks = {
        "source_topology_hash_matches": topology_digest == EXPECTED_TOPOLOGY_HASH,
        "source_uv_hash_matches": uv_digest == EXPECTED_UV_HASH,
        "source_active_face_count_matches": len(protected["active_faces"]) == EXPECTED_ACTIVE_FACES,
        "source_validation_topology_matches": (
            protected["ps02_validation"]["common_topology"]["topology_hash"]
            == EXPECTED_TOPOLOGY_HASH
        ),
        "all_variants_pass": all(report["passed"] for report in variant_validation.values()),
    }
    validation = {
        "stage": "PS-03.1",
        "asset": "C-R1 / Directed Tensioned Core",
        "blender_version": bpy.app.version_string,
        "source": {
            "blend": str(SOURCE_BLEND),
            "validation": str(SOURCE_VALIDATION),
            **protected["source_hashes"],
        },
        "common_topology": {
            **topology,
            "connectivity_index_hash": topology_digest,
            "uv_hash": uv_digest,
            "mask_face_count": len(protected["active_faces"]),
            "mask_face_index_hash": mask_digest,
            "directed_axis": [round(value, 8) for value in DIRECTED_AXIS],
        },
        "refinement": {
            "method": "coordinate-only local deformation fields derived from C; no global A/C blend",
            "recommended": RECOMMENDED_KEY,
            "variants": REFINEMENTS,
        },
        "variants": variant_validation,
        "common_checks": common_checks,
        "passed": all(common_checks.values()),
    }
    validation_path = EXPORT_DIR / "ps03-1-technical-validation.json"
    validation_path.write_text(json.dumps(validation, ensure_ascii=False, indent=2), encoding="utf8")
    if not validation["passed"]:
        failed = [key for key, value in common_checks.items() if not value]
        variant_failed = [key for key, value in variant_validation.items() if not value["passed"]]
        raise RuntimeError(f"PS-03.1 validation failed: common={failed}, variants={variant_failed}")

    if os.environ.get("PS031_VALIDATE_ONLY") == "1":
        print("PS031_VALIDATE_ONLY_PASS", validation_path)
        return

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 24
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.world = bpy.data.worlds.new("PS031_Studio_World")

    root = bpy.data.collections.new("PS031_C-R1")
    meshes = bpy.data.collections.new("PS031_Meshes")
    rig = bpy.data.collections.new("PS031_RenderRig")
    scene.collection.children.link(root)
    root.children.link(meshes)
    root.children.link(rig)
    materials = build_materials()

    objects: dict[str, bpy.types.Object] = {}
    for key in ("A", "C", "R1A", "R1B", "R1C", "FINAL"):
        master_key = key in {"R1A", "R1B", "R1C", "FINAL"}
        display_name = {
            "A": "Reference_A_Directed_Fold",
            "C": "Protected_Copy_C_Tensioned_Core",
            "R1A": "MimicCore_C-R1A_15",
            "R1B": "MimicCore_C-R1B_20",
            "R1C": "MimicCore_C-R1C_25",
            "FINAL": "MimicCore_C-R1_Recommended",
        }[key]
        obj = create_mesh_object(
            display_name,
            positions[key],
            faces,
            protected["uv_values"],
            protected["point_mask"],
            protected["point_slot"],
            protected["active_slots"],
            materials,
            meshes,
            master_key,
        )
        obj["stage"] = "PS-03.1"
        obj["variant"] = key
        obj["topologyHash"] = topology_digest
        obj["uvHash"] = uv_digest
        obj["maskFaceIndexHash"] = mask_digest
        obj["maskFaceCount"] = EXPECTED_ACTIVE_FACES
        obj["subdivisionLevel"] = 0
        objects[key] = obj

    camera_data = bpy.data.cameras.new("PS031_Camera_55mm")
    camera = bpy.data.objects.new("PS031_Camera_55mm", camera_data)
    rig.objects.link(camera)
    scene.camera = camera
    set_camera(camera, "canonical")

    light_specs = (
        ("PS031_Key", (4.5, -5.5, 7.5), 5.0, 660.0),
        ("PS031_Fill", (-5.5, -2.0, 3.0), 4.0, 340.0),
        ("PS031_Rim", (1.0, 5.5, 5.0), 3.5, 500.0),
    )
    for name, location, size, energy in light_specs:
        data = bpy.data.lights.new(name, type="AREA")
        data.shape = "DISK"
        data.size = size
        data.energy = energy
        data.color = (1.0, 0.97, 0.91)
        light = bpy.data.objects.new(name, data)
        light.location = location
        point_at(light, location)
        rig.objects.link(light)

    bpy.ops.mesh.primitive_plane_add(size=30.0, location=(0.0, 0.0, -1.62))
    floor = bpy.context.object
    floor.name = "PS031_Studio_Floor"
    for collection in list(floor.users_collection):
        collection.objects.unlink(floor)
    rig.objects.link(floor)
    floor.data.materials.append(materials["floor"][0])

    render_all_panels(
        scene,
        camera,
        floor,
        objects,
        materials,
        protected["active_slots"],
        meshes,
    )

    final_obj = objects["FINAL"]
    glb_path = export_final_glb(
        final_obj,
        materials,
        protected["active_slots"],
        protected["active_faces"],
        topology_digest,
        mask_digest,
    )
    workbench, final_blend = save_workbench_and_final(
        scene, objects, final_obj, materials, protected["active_slots"]
    )

    source_blend_hash_after = sha256_file(SOURCE_BLEND)
    if source_blend_hash_after != source_blend_hash_before:
        raise RuntimeError("Protected PS-02 source blend changed during PS-03.1")
    validation["outputs"] = {
        "workbench_blend": str(workbench),
        "final_blend": str(final_blend),
        "glb": str(glb_path),
        "workbench_blend_sha256": sha256_file(workbench),
        "final_blend_sha256": sha256_file(final_blend),
        "glb_sha256": sha256_file(glb_path),
    }
    validation["source"]["blend_sha256_after"] = source_blend_hash_after
    validation_path.write_text(json.dumps(validation, ensure_ascii=False, indent=2), encoding="utf8")
    reimport = validate_glb_reimport(glb_path, validation)
    print("PS031_WORKBENCH", workbench)
    print("PS031_FINAL_BLEND", final_blend)
    print("PS031_VALIDATION", validation_path)
    print("PS031_REIMPORT_PASS", reimport["passed"])
    print("PS031_DONE")


if __name__ == "__main__":
    build_scene()
