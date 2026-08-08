"""PS-02 Mimic Core generator for Blender 4.5 LTS.

Creates three coordinate variants from one indexed topology, adds technical
shape keys and a shared 34% photonic-zone attribute, validates all intermediate
morph states, exports GLB candidates, saves the editable .blend source, and
renders deterministic comparison panels.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Iterable, Sequence

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


SCRIPT_PATH = Path(__file__).resolve()
PS02_DIR = SCRIPT_PATH.parent.parent
BLEND_DIR = PS02_DIR / "blender"
EXPORT_DIR = PS02_DIR / "exports"
RENDER_DIR = PS02_DIR / "renders"
PANEL_DIR = RENDER_DIR / "_panels"

for directory in (BLEND_DIR, EXPORT_DIR, RENDER_DIR, PANEL_DIR):
    directory.mkdir(parents=True, exist_ok=True)

SEGMENTS = 160
INTERIOR_RINGS = 52
TARGET_BBOX = (6.8, 3.6, 3.2)
ACTIVE_ZONE_TARGET = 0.34
SHAPE_KEYS = ("MASTER", "SINGLE_TEST", "COMPLEX_TEST", "BRAND_WIDE_TEST")
MORPH_STEPS = (0.0, 0.25, 0.5, 0.75, 1.0)

CANDIDATES = {
    "A": {"slug": "directed-fold", "label": "Directed Fold"},
    "B": {"slug": "lifted-crest", "label": "Lifted Crest"},
    "C": {"slug": "tensioned-core", "label": "Tensioned Core"},
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


def shaped_axis(value: float, power: float) -> float:
    return math.copysign(abs(value) ** power, value)


def hex_rgba(value: str) -> tuple[float, float, float, float]:
    value = value.lstrip("#")
    return (
        int(value[0:2], 16) / 255.0,
        int(value[2:4], 16) / 255.0,
        int(value[4:6], 16) / 255.0,
        1.0,
    )


def build_topology() -> tuple[list[tuple[float, float]], list[tuple[int, ...]]]:
    """Return shared (s, phi) parameters and a closed manifold face list."""
    parameters: list[tuple[float, float]] = [(-1.0, 0.0)]
    for ring in range(1, INTERIOR_RINGS + 1):
        s = -1.0 + 2.0 * ring / (INTERIOR_RINGS + 1)
        for segment in range(SEGMENTS):
            phi = math.tau * segment / SEGMENTS
            parameters.append((s, phi))
    front_index = len(parameters)
    parameters.append((1.0, 0.0))

    faces: list[tuple[int, ...]] = []
    first_ring = 1
    for segment in range(SEGMENTS):
        current = first_ring + segment
        following = first_ring + (segment + 1) % SEGMENTS
        faces.append((0, following, current))

    for ring in range(INTERIOR_RINGS - 1):
        ring_a = 1 + ring * SEGMENTS
        ring_b = ring_a + SEGMENTS
        for segment in range(SEGMENTS):
            following = (segment + 1) % SEGMENTS
            a = ring_a + segment
            d = ring_a + following
            c = ring_b + following
            b = ring_b + segment
            faces.append((a, d, c, b))

    last_ring = 1 + (INTERIOR_RINGS - 1) * SEGMENTS
    for segment in range(SEGMENTS):
        current = last_ring + segment
        following = last_ring + (segment + 1) % SEGMENTS
        faces.append((current, following, front_index))

    return parameters, faces


def raw_candidate_point(candidate: str, s: float, phi: float) -> tuple[float, float, float]:
    u = (s + 1.0) * 0.5
    radial = math.sqrt(max(0.0, 1.0 - s * s))
    y_dir = math.cos(phi)
    z_dir = math.sin(phi)
    body = max(0.0, 1.0 - s * s)
    facet = 1.0 + 0.034 * math.sin(phi * 7.0 + s * 4.0) * math.sin(phi * 3.0 - s * 5.0)

    if candidate == "A":
        rear_mass = 1.0 + 0.44 * (1.0 - u) ** 1.35
        front_taper = 1.0 - 0.32 * smoothstep(0.38, 0.98, u)
        longitudinal_profile = rear_mass * front_taper
        x = 3.68 * s + 0.17 * body * (0.28 - 0.72 * y_dir) + 0.10 * body
        y = (
            1.92
            * radial
            * shaped_axis(y_dir, 0.76)
            * longitudinal_profile
            * (1.0 + 0.09 * math.sin(phi * 2.0 + u * 4.0))
            * facet
        )
        z = (
            1.10
            * radial
            * shaped_axis(z_dir, 0.84)
            * longitudinal_profile
            * (1.0 + 0.10 * math.sin(phi * 3.0 - u * 3.0))
            * facet
        )
        convergence = body * smoothstep(0.12, 0.96, u)
        y += 0.19 * convergence * math.sin(phi * 2.0 + u * 5.6)
        z += 0.24 * convergence * math.sin(phi * 3.0 - u * 4.6)
        z += 0.15 * body * (1.0 - 0.45 * u) * (-y_dir)
    elif candidate == "B":
        front_taper = 1.0 - 0.24 * smoothstep(0.56, 0.99, u)
        x = 3.30 * s + 0.13 * body * y_dir + 0.13 * body
        y = (
            1.46
            * radial
            * shaped_axis(y_dir, 0.88)
            * (1.0 + 0.13 * (1.0 - u))
            * front_taper
            * facet
        )
        z = (
            1.56
            * radial
            * shaped_axis(z_dir, 0.70)
            * (1.0 + 0.25 * u * max(0.0, z_dir))
            * front_taper
            * facet
        )
        crest = body * math.exp(-((s - 0.16) / 0.72) ** 2)
        forward_lift = body * smoothstep(0.10, 0.88, u)
        z += 0.62 * crest * (0.55 + 0.45 * max(0.0, z_dir))
        z += 0.24 * forward_lift
        y -= 0.16 * crest * z_dir
        x += 0.10 * crest * max(0.0, z_dir)
    else:
        core_mass = 1.0 + 0.48 * math.exp(-(s / 0.48) ** 2)
        rear_notch = 1.0 - 0.10 * math.exp(-((s + 0.60) / 0.25) ** 2)
        front_taper = 1.0 - 0.21 * smoothstep(0.62, 0.99, u)
        longitudinal_profile = core_mass * rear_notch * front_taper
        x = 2.72 * s + 0.58 * s**3 + 0.26 * body * (0.48 - 0.52 * y_dir)
        y = (
            1.78
            * radial
            * shaped_axis(y_dir, 0.72)
            * longitudinal_profile
            * (1.0 + 0.08 * math.sin(phi * 3.0 - u * 2.0))
            * facet
        )
        z = (
            1.46
            * radial
            * shaped_axis(z_dir, 0.76)
            * longitudinal_profile
            * (1.0 + 0.08 * math.cos(phi * 3.0 + s))
            * facet
        )
        tension = body * math.exp(-((s - 0.22) / 0.52) ** 2)
        x += 0.34 * tension * max(0.0, -y_dir)
        y += 0.18 * tension * math.sin(phi * 2.0 - u * 3.2)
        z += 0.22 * tension * (-y_dir + 0.38 * z_dir)

    return (x, y, z)


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


def candidate_positions(candidate: str, parameters: Sequence[tuple[float, float]]):
    return normalize_positions(
        [raw_candidate_point(candidate, s, phi) for s, phi in parameters]
    )


def morph_positions(
    candidate: str,
    master: Sequence[tuple[float, float, float]],
    parameters: Sequence[tuple[float, float]],
    key_name: str,
) -> list[tuple[float, float, float]]:
    if key_name == "MASTER":
        return list(master)

    output: list[tuple[float, float, float]] = []
    for point, (s, phi) in zip(master, parameters):
        x, y, z = point
        u = (s + 1.0) * 0.5
        body = max(0.0, 1.0 - s * s)
        y_dir = math.cos(phi)
        z_dir = math.sin(phi)

        if key_name == "SINGLE_TEST":
            focus = body * (0.72 + 0.28 * smoothstep(0.2, 0.9, u))
            y *= 1.0 - 0.13 * focus
            z *= 1.0 - 0.10 * focus
            x += 0.17 * focus * (0.28 + 0.72 * u)
            z += 0.065 * focus * (-y_dir)
        elif key_name == "COMPLEX_TEST":
            convergence = body * smoothstep(0.08, 0.95, u)
            if candidate == "A":
                convergence *= 0.76 * (1.0 - 0.80 * smoothstep(0.52, 0.98, u))
            wave_a = math.sin(phi * 2.0 + u * 6.2)
            wave_b = math.sin(phi * 3.0 - u * 4.8)
            y *= 1.0 - 0.09 * convergence
            z *= 1.0 - 0.075 * convergence
            x += 0.20 * convergence * (0.25 + 0.75 * u)
            y += 0.13 * convergence * wave_a
            z += 0.15 * convergence * wave_b
            if candidate == "A":
                z += 0.10 * convergence * math.sin(phi * 4.0 + u * 4.0)
            elif candidate == "B":
                z += 0.13 * convergence * (0.35 + max(0.0, z_dir))
            else:
                x += 0.10 * convergence * (1.0 - y_dir)
                y += 0.065 * convergence * wave_b
        else:
            release = body * (0.76 + 0.24 * (1.0 - u))
            y *= 1.0 + 0.13 * release
            z *= 1.0 + 0.115 * release
            x -= 0.075 * release * (0.3 + u)
            z += 0.052 * release * z_dir

        output.append((x, y, z))
    return output


def polygon_triangles(face: Sequence[int]) -> Iterable[tuple[int, int, int]]:
    for index in range(1, len(face) - 1):
        yield (face[0], face[index], face[index + 1])


def triangle_area(a: Vector, b: Vector, c: Vector) -> float:
    return (b - a).cross(c - a).length * 0.5


def face_area(positions: Sequence[tuple[float, float, float]], face: Sequence[int]) -> float:
    vectors = [Vector(positions[index]) for index in face]
    return sum(triangle_area(vectors[0], vectors[index], vectors[index + 1]) for index in range(1, len(vectors) - 1))


def zone_score(s: float, phi: float) -> float:
    u = (s + 1.0) * 0.5
    radial = max(0.0, 1.0 - s * s) ** 0.25
    top = math.sin(phi)
    camera_side = -math.cos(phi)
    return radial * (
        0.50 * top
        + 0.34 * camera_side
        + 0.18 * math.sin(math.pi * u)
        + 0.12 * u
        + 0.055 * math.sin(phi * 3.0 + u * 8.0)
    )


def build_active_zone(
    parameters: Sequence[tuple[float, float]],
    faces: Sequence[tuple[int, ...]],
    all_positions: dict[str, Sequence[tuple[float, float, float]]],
):
    average_areas = []
    scores = []
    for face in faces:
        average_areas.append(
            sum(face_area(all_positions[key], face) for key in CANDIDATES) / len(CANDIDATES)
        )
        scores.append(sum(zone_score(*parameters[index]) for index in face) / len(face))

    target_area = sum(average_areas) * ACTIVE_ZONE_TARGET
    ranked = sorted(range(len(faces)), key=lambda index: scores[index], reverse=True)
    active_faces: set[int] = set()
    accumulated = 0.0
    for face_index in ranked:
        if accumulated >= target_area:
            break
        active_faces.add(face_index)
        accumulated += average_areas[face_index]

    adjacency_total = [0] * len(parameters)
    adjacency_active = [0] * len(parameters)
    for face_index, face in enumerate(faces):
        for vertex_index in face:
            adjacency_total[vertex_index] += 1
            if face_index in active_faces:
                adjacency_active[vertex_index] += 1

    point_mask = [
        adjacency_active[index] / adjacency_total[index] if adjacency_total[index] else 0.0
        for index in range(len(parameters))
    ]
    point_slot = [clamp(((s + 1.0) * 0.5)) for s, _ in parameters]

    active_slots: dict[int, int] = {}
    for face_index in active_faces:
        u = sum((parameters[index][0] + 1.0) * 0.5 for index in faces[face_index]) / len(faces[face_index])
        active_slots[face_index] = 1 if u < 0.36 else 2 if u < 0.68 else 3

    return active_faces, active_slots, point_mask, point_slot


def uv_for_loop(
    face: Sequence[int],
    vertex_index: int,
    parameters: Sequence[tuple[float, float]],
) -> tuple[float, float]:
    non_pole_v = [
        (parameters[index][1] / math.tau) % 1.0
        for index in face
        if abs(parameters[index][0]) < 0.999
    ]
    seam = non_pole_v and min(non_pole_v) < 0.25 and max(non_pole_v) > 0.75
    s, phi = parameters[vertex_index]
    u = (s + 1.0) * 0.5
    if abs(s) > 0.999:
        values = [value + 1.0 if seam and value < 0.25 else value for value in non_pole_v]
        v = sum(values) / len(values) if values else 0.5
    else:
        v = (phi / math.tau) % 1.0
        if seam and v < 0.25:
            v += 1.0
    return (u, v)


def make_material(
    name: str,
    color: str,
    roughness: float,
    metallic: float,
    coat: float = 0.16,
) -> bpy.types.Material:
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


def make_silhouette_material() -> bpy.types.Material:
    material = bpy.data.materials.new("PS02_Silhouette_Black")
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


def build_materials():
    return {
        "light": [
            make_material("PS02_Ivory_Ceramic", COLORS["ivory"], 0.42, 0.04, 0.22),
            make_material("PS02_Content_Light", COLORS["content"], 0.36, 0.12, 0.24),
            make_material("PS02_Design_Light", COLORS["design"], 0.36, 0.12, 0.24),
            make_material("PS02_Digital_Light", COLORS["digital"], 0.36, 0.12, 0.24),
        ],
        "dark": [
            make_material("PS02_Dark_Titanium", COLORS["dark"], 0.38, 0.46, 0.18),
            make_material("PS02_Content_Dark", COLORS["content"], 0.34, 0.30, 0.20),
            make_material("PS02_Design_Dark", COLORS["design"], 0.34, 0.30, 0.20),
            make_material("PS02_Digital_Dark", COLORS["digital"], 0.34, 0.30, 0.20),
        ],
        "silhouette": [make_silhouette_material()],
        "wire_base": [make_material("PS02_Wire_Base", "#D9D6CD", 0.55, 0.0, 0.0)],
        "wire_line": [make_material("PS02_Wire_Line", "#202329", 0.48, 0.0, 0.0)],
        "floor_light": [make_material("PS02_Floor_Light", "#C9CBC7", 0.68, 0.0, 0.0)],
        "floor_dark": [make_material("PS02_Floor_Dark", "#090B0E", 0.62, 0.12, 0.0)],
    }


def create_candidate_object(
    candidate: str,
    master: Sequence[tuple[float, float, float]],
    parameters: Sequence[tuple[float, float]],
    faces: Sequence[tuple[int, ...]],
    point_mask: Sequence[float],
    point_slot: Sequence[float],
    active_slots: dict[int, int],
    materials,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    meta = CANDIDATES[candidate]
    mesh = bpy.data.meshes.new(f"MimicCore_{candidate}_{meta['slug']}_Mesh")
    mesh.from_pydata(master, [], faces)
    mesh.update(calc_edges=True)
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    uv_layer = mesh.uv_layers.new(name="MimicCoreUV")
    for polygon in mesh.polygons:
        face = faces[polygon.index]
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = uv_for_loop(face, vertex_index, parameters)

    for name, values in (("_PHOTONIC_MASK", point_mask), ("_PHOTONIC_SLOT", point_slot)):
        attribute = mesh.attributes.new(name=name, type="FLOAT", domain="POINT")
        for item, value in zip(attribute.data, values):
            item.value = value

    for material in materials["light"]:
        mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.material_index = active_slots.get(polygon.index, 0)

    obj = bpy.data.objects.new(f"MimicCore_{candidate}_{meta['slug']}", mesh)
    collection.objects.link(obj)
    obj["candidate"] = candidate
    obj["direction"] = meta["label"]
    obj["topology_source"] = "PS02_SHARED_PARAMETRIC_BASE_V1"
    obj["active_zone_target"] = ACTIVE_ZONE_TARGET
    obj["subdivision_level"] = 0

    mask_group = obj.vertex_groups.new(name="PhotonicActive_34")
    for index, weight in enumerate(point_mask):
        if weight > 0.0:
            mask_group.add([index], weight, "REPLACE")

    obj.shape_key_add(name="MASTER", from_mix=False)
    for key_name in SHAPE_KEYS[1:]:
        key_block = obj.shape_key_add(name=key_name, from_mix=False)
        target = morph_positions(candidate, master, parameters, key_name)
        for index, position in enumerate(target):
            key_block.data[index].co = position
        key_block.value = 0.0
    return obj


def topology_hash(faces: Sequence[tuple[int, ...]]) -> str:
    payload = json.dumps(faces, separators=(",", ":")).encode("utf8")
    return hashlib.sha256(payload).hexdigest()


def uv_hash(obj: bpy.types.Object) -> str:
    uv_data = obj.data.uv_layers["MimicCoreUV"].data
    payload = ";".join(f"{item.uv.x:.8f},{item.uv.y:.8f}" for item in uv_data).encode("ascii")
    return hashlib.sha256(payload).hexdigest()


def topology_metrics(vertex_count: int, faces: Sequence[tuple[int, ...]]):
    edge_counts: dict[tuple[int, int], int] = {}
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

    components = 0
    unseen = set(range(vertex_count))
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


def positions_from_key(obj: bpy.types.Object, key_name: str):
    return [tuple(point.co) for point in obj.data.shape_keys.key_blocks[key_name].data]


def interpolate_positions(master, target, progress: float):
    return [
        tuple(a[axis] + (b[axis] - a[axis]) * progress for axis in range(3))
        for a, b in zip(master, target)
    ]


def polygon_normal(positions, face) -> Vector:
    a, b, c = (Vector(positions[index]) for index in face[:3])
    normal = (b - a).cross(c - a)
    return normal.normalized() if normal.length else Vector((0.0, 0.0, 0.0))


def signed_volume(positions, faces) -> float:
    total = 0.0
    for face in faces:
        for a_index, b_index, c_index in polygon_triangles(face):
            a = Vector(positions[a_index])
            b = Vector(positions[b_index])
            c = Vector(positions[c_index])
            total += a.dot(b.cross(c)) / 6.0
    return total


def minimum_triangle_area(positions, faces) -> float:
    minimum = float("inf")
    for face in faces:
        for a_index, b_index, c_index in polygon_triangles(face):
            area = triangle_area(Vector(positions[a_index]), Vector(positions[b_index]), Vector(positions[c_index]))
            minimum = min(minimum, area)
    return minimum


def nonadjacent_intersections(positions, faces) -> int:
    tree = BVHTree.FromPolygons([Vector(point) for point in positions], faces, all_triangles=False, epsilon=1e-7)
    overlaps = tree.overlap(tree)
    unique = set()
    face_sets = [set(face) for face in faces]
    for left, right in overlaps:
        if left == right:
            continue
        pair = tuple(sorted((left, right)))
        if pair in unique:
            continue
        unique.add(pair)
    return sum(1 for left, right in unique if face_sets[left].isdisjoint(face_sets[right]))


def bounding_box(positions):
    minima = [min(point[axis] for point in positions) for axis in range(3)]
    maxima = [max(point[axis] for point in positions) for axis in range(3)]
    return {
        "min": [round(value, 6) for value in minima],
        "max": [round(value, 6) for value in maxima],
        "size": [round(maxima[axis] - minima[axis], 6) for axis in range(3)],
    }


def validate_candidates(objects, faces, active_faces):
    common = topology_metrics(len(objects["A"].data.vertices), faces)
    common["topology_hash"] = topology_hash(faces)
    common["uv_hashes"] = {key: uv_hash(obj) for key, obj in objects.items()}
    common["uv_identical"] = len(set(common["uv_hashes"].values())) == 1
    common["shape_keys"] = list(SHAPE_KEYS)
    common["active_face_count"] = len(active_faces)

    candidate_reports = {}
    for candidate, obj in objects.items():
        master = positions_from_key(obj, "MASTER")
        master_normals = [polygon_normal(master, face) for face in faces]
        total_area = sum(face_area(master, face) for face in faces)
        active_area = sum(face_area(master, faces[index]) for index in active_faces)
        checks = []
        for key_name in SHAPE_KEYS[1:]:
            target = positions_from_key(obj, key_name)
            for progress in MORPH_STEPS:
                current = interpolate_positions(master, target, progress)
                normal_dots = [
                    polygon_normal(current, face).dot(master_normals[index])
                    for index, face in enumerate(faces)
                ]
                checks.append(
                    {
                        "target": key_name,
                        "progress": int(progress * 100),
                        "signed_volume": round(signed_volume(current, faces), 6),
                        "min_triangle_area": round(minimum_triangle_area(current, faces), 9),
                        "min_master_normal_dot": round(min(normal_dots), 6),
                        "nonadjacent_self_intersections": nonadjacent_intersections(current, faces),
                    }
                )
        passed = all(
            item["signed_volume"] > 0.0
            and item["min_triangle_area"] > 1e-8
            and item["min_master_normal_dot"] > 0.0
            and item["nonadjacent_self_intersections"] == 0
            for item in checks
        )
        candidate_reports[candidate] = {
            "label": CANDIDATES[candidate]["label"],
            "bounding_box": bounding_box(master),
            "active_surface_ratio": round(active_area / total_area, 6),
            "morph_validation_passed": passed,
            "morph_checks": checks,
        }
    return {
        "blender_version": bpy.app.version_string,
        "common_topology": common,
        "candidates": candidate_reports,
    }


def select_only(obj: bpy.types.Object):
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def export_glb(candidate: str, obj: bpy.types.Object):
    select_only(obj)
    path = EXPORT_DIR / f"mimic-core-{candidate.lower()}-{CANDIDATES[candidate]['slug']}.glb"
    operator_properties = {item.identifier for item in bpy.ops.export_scene.gltf.get_rna_type().properties}
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
    }
    kwargs = {key: value for key, value in requested.items() if key in operator_properties}
    bpy.ops.export_scene.gltf(**kwargs)
    print("PS02_EXPORT", path)


def point_camera(camera: bpy.types.Object, location, target=(0.0, 0.0, 0.0)):
    camera.location = location
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def set_camera(camera: bpy.types.Object, view: str, hero: bool = False):
    presets = {
        "three-quarter": ((9.0, -12.0, 6.5), (0.0, 0.0, 0.0)),
        "profile": ((0.0, -15.0, 0.0), (0.0, 0.0, 0.0)),
        "front": ((15.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        "top": ((0.0, 0.0, 15.0), (0.0, 0.0, 0.0)),
    }
    location, target = presets[view]
    point_camera(camera, location, target)
    camera.data.lens = 55.0
    camera.data.sensor_width = 36.0
    camera.data.shift_x = -0.19 if hero else 0.0
    camera.data.shift_y = 0.02 if hero else 0.0


def set_world(scene: bpy.types.Scene, theme: str):
    color = COLORS["light_bg"] if theme == "light" else COLORS["dark_bg"]
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = hex_rgba(color)
    background.inputs["Strength"].default_value = 0.34 if theme == "light" else 0.16


def configure_lights(lights, theme: str, enabled: bool = True):
    values = (660.0, 340.0, 500.0) if theme == "light" else (840.0, 520.0, 700.0)
    for light, energy in zip(lights, values):
        light.hide_render = not enabled
        light.data.energy = energy
        light.data.color = (1.0, 0.97, 0.91) if theme == "light" else (0.88, 0.93, 1.0)


def assign_material_mode(obj, materials, active_slots, mode: str, theme: str = "light"):
    mesh = obj.data
    mesh.materials.clear()
    slots = materials[theme] if mode in {"active", "neutral"} else materials[mode]
    for material in slots:
        mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.material_index = active_slots.get(polygon.index, 0) if mode == "active" else 0


def reset_shape_keys(obj, key_name: str | None = None, value: float = 0.0):
    for block in obj.data.shape_keys.key_blocks:
        block.value = 0.0
    if key_name and key_name != "MASTER":
        obj.data.shape_keys.key_blocks[key_name].value = value


def show_only(objects, selected: bpy.types.Object):
    for obj in objects.values():
        visible = obj == selected
        obj.hide_render = not visible
        obj.hide_set(not visible)


def render_still(scene, path: Path, width: int, height: int):
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print("PS02_RENDER", path)


def render_panels(scene, camera, lights, floor, objects, materials, active_slots, collection):
    views = ("three-quarter", "profile", "front", "top")
    for candidate, obj in objects.items():
        show_only(objects, obj)
        reset_shape_keys(obj)
        assign_material_mode(obj, materials, active_slots, "neutral", "light")
        set_world(scene, "light")
        configure_lights(lights, "light", True)
        floor.hide_render = False
        floor.data.materials.clear()
        floor.data.materials.append(materials["floor_light"][0])
        for view in views:
            set_camera(camera, view)
            render_still(scene, PANEL_DIR / f"comparison_{candidate}_{view}.png", 800, 600)

    for candidate, obj in objects.items():
        show_only(objects, obj)
        reset_shape_keys(obj)
        assign_material_mode(obj, materials, active_slots, "silhouette")
        set_world(scene, "light")
        background = scene.world.node_tree.nodes.get("Background")
        background.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        background.inputs["Strength"].default_value = 1.0
        configure_lights(lights, "light", False)
        floor.hide_render = True
        set_camera(camera, "three-quarter")
        render_still(scene, PANEL_DIR / f"silhouette_{candidate}.png", 960, 700)

    for theme in ("light", "dark"):
        for candidate, obj in objects.items():
            show_only(objects, obj)
            reset_shape_keys(obj)
            assign_material_mode(obj, materials, active_slots, "active", theme)
            set_world(scene, theme)
            configure_lights(lights, theme, True)
            floor.hide_render = False
            floor.data.materials.clear()
            floor.data.materials.append(materials["floor_light" if theme == "light" else "floor_dark"][0])
            set_camera(camera, "three-quarter")
            render_still(scene, PANEL_DIR / f"active_{theme}_{candidate}.png", 900, 640)

    for candidate, obj in objects.items():
        show_only(objects, obj)
        assign_material_mode(obj, materials, active_slots, "neutral", "light")
        set_world(scene, "light")
        configure_lights(lights, "light", True)
        floor.hide_render = False
        floor.data.materials.clear()
        floor.data.materials.append(materials["floor_light"][0])
        set_camera(camera, "three-quarter")
        for progress in MORPH_STEPS:
            reset_shape_keys(obj, "COMPLEX_TEST", progress)
            render_still(
                scene,
                PANEL_DIR / f"morph_{candidate}_{int(progress * 100):03d}.png",
                640,
                480,
            )
        reset_shape_keys(obj)

    for candidate, obj in objects.items():
        show_only(objects, obj)
        reset_shape_keys(obj)
        assign_material_mode(obj, materials, active_slots, "wire_base")
        set_world(scene, "light")
        configure_lights(lights, "light", True)
        floor.hide_render = True
        set_camera(camera, "three-quarter")

        wire_obj = obj.copy()
        wire_obj.data = obj.data.copy()
        wire_obj.name = f"{obj.name}_WireRender"
        collection.objects.link(wire_obj)
        wire_obj.data.materials.clear()
        wire_obj.data.materials.append(materials["wire_line"][0])
        for polygon in wire_obj.data.polygons:
            polygon.material_index = 0
        wire_modifier = wire_obj.modifiers.new(name="PS02_Topology_Wire", type="WIREFRAME")
        wire_modifier.thickness = 0.0065
        wire_modifier.use_even_offset = True
        wire_modifier.use_boundary = False
        wire_modifier.use_replace = True
        render_still(scene, PANEL_DIR / f"wire_{candidate}.png", 960, 700)
        wire_mesh = wire_obj.data
        bpy.data.objects.remove(wire_obj, do_unlink=True)
        bpy.data.meshes.remove(wire_mesh)

    for candidate, obj in objects.items():
        show_only(objects, obj)
        reset_shape_keys(obj)
        assign_material_mode(obj, materials, active_slots, "active", "light")
        set_world(scene, "light")
        configure_lights(lights, "light", True)
        floor.hide_render = False
        floor.data.materials.clear()
        floor.data.materials.append(materials["floor_light"][0])
        set_camera(camera, "three-quarter", hero=True)
        render_still(scene, RENDER_DIR / f"ps02_hero_{candidate.lower()}_{CANDIDATES[candidate]['slug']}.png", 1920, 1200)


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 24
    scene.render.film_transparent = False
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass

    scene.world = bpy.data.worlds.new("PS02_Studio_World")
    root_collection = bpy.data.collections.new("PS02_MimicCore")
    scene.collection.children.link(root_collection)
    candidate_collection = bpy.data.collections.new("PS02_Candidates")
    rig_collection = bpy.data.collections.new("PS02_RenderRig")
    root_collection.children.link(candidate_collection)
    root_collection.children.link(rig_collection)

    materials = build_materials()
    parameters, faces = build_topology()
    all_positions = {key: candidate_positions(key, parameters) for key in CANDIDATES}
    active_faces, active_slots, point_mask, point_slot = build_active_zone(parameters, faces, all_positions)

    objects = {
        key: create_candidate_object(
            key,
            all_positions[key],
            parameters,
            faces,
            point_mask,
            point_slot,
            active_slots,
            materials,
            candidate_collection,
        )
        for key in CANDIDATES
    }

    bpy.ops.object.camera_add(location=(9.0, -12.0, 6.5))
    camera = bpy.context.object
    camera.name = "PS02_Camera_55mm"
    for collection in list(camera.users_collection):
        collection.objects.unlink(camera)
    rig_collection.objects.link(camera)
    scene.camera = camera

    light_specs = (
        ("PS02_Key", (4.5, -5.5, 7.5), 5.0),
        ("PS02_Fill", (-5.5, -2.0, 3.0), 4.0),
        ("PS02_Rim", (1.0, 5.5, 5.0), 3.5),
    )
    lights = []
    for name, location, size in light_specs:
        data = bpy.data.lights.new(name, type="AREA")
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new(name, data)
        light.location = location
        point_camera(light, location, (0.0, 0.0, 0.0))
        rig_collection.objects.link(light)
        lights.append(light)

    bpy.ops.mesh.primitive_plane_add(size=30.0, location=(0.0, 0.0, -1.62))
    floor = bpy.context.object
    floor.name = "PS02_Studio_Floor"
    for collection in list(floor.users_collection):
        collection.objects.unlink(floor)
    rig_collection.objects.link(floor)
    floor.data.materials.append(materials["floor_light"][0])

    validation = validate_candidates(objects, faces, active_faces)
    validation_path = EXPORT_DIR / "ps02-technical-validation.json"
    validation_path.write_text(json.dumps(validation, ensure_ascii=False, indent=2), encoding="utf8")
    print("PS02_VALIDATION", validation_path)

    failures = [key for key, report in validation["candidates"].items() if not report["morph_validation_passed"]]
    if failures:
        raise RuntimeError(f"Morph validation failed for: {', '.join(failures)}")
    if validation["common_topology"]["non_manifold_edges"] != 0:
        raise RuntimeError("Shared topology is non-manifold")
    if not validation["common_topology"]["uv_identical"]:
        raise RuntimeError("Candidate UV maps are not identical")

    for key, obj in objects.items():
        export_glb(key, obj)

    render_panels(scene, camera, lights, floor, objects, materials, active_slots, candidate_collection)

    for key, obj in objects.items():
        reset_shape_keys(obj)
        assign_material_mode(obj, materials, active_slots, "active", "light")
        obj.hide_render = key != "A"
        obj.hide_set(key != "A")
        obj.hide_viewport = False
    floor.hide_render = False
    configure_lights(lights, "light", True)
    set_world(scene, "light")
    set_camera(camera, "three-quarter")
    blend_path = BLEND_DIR / "ps-02-mimic-core.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    print("PS02_BLEND", blend_path)
    print("PS02_DONE")


if __name__ == "__main__":
    build_scene()
