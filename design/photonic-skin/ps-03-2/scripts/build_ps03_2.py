"""Build the final PS-03.2 Photonic Skin morph system in Blender 4.5 LTS.

The approved C-R1B MASTER is read verbatim from PS-03.1.  Twelve relative
shape keys are authored as deterministic coordinate-only deformation fields.
No topology, UV, face-order or mask-membership operation is performed.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import statistics
import sys
from pathlib import Path
from typing import Sequence

import bpy
from mathutils import Quaternion, Vector


SCRIPT_PATH = Path(__file__).resolve()
PS032_DIR = SCRIPT_PATH.parent.parent
REPO_DIR = PS032_DIR.parents[2]
SOURCE_DIR = REPO_DIR / "design" / "photonic-skin" / "ps-03-1"
SOURCE_BLEND = SOURCE_DIR / "blender" / "c-r1-directed-tensioned-core.blend"
SOURCE_WORKBENCH = SOURCE_DIR / "blender" / "ps-03-1-c-r1-refinement-workbench.blend"
SOURCE_GLB = SOURCE_DIR / "exports" / "c-r1-directed-tensioned-core.glb"
SOURCE_VALIDATION = SOURCE_DIR / "exports" / "ps03-1-technical-validation.json"
SOURCE_REPORT = SOURCE_DIR / "ps-03-1-c-r1-evaluation.md"
SOURCE_BUILD_SCRIPT = SOURCE_DIR / "scripts" / "build_ps03_1.py"
SOURCE_COMPOSE_SCRIPT = SOURCE_DIR / "scripts" / "compose_ps03_1.py"

BLEND_DIR = PS032_DIR / "blender"
EXPORT_DIR = PS032_DIR / "exports"
RENDER_DIR = PS032_DIR / "renders"
PANEL_DIR = RENDER_DIR / "_panels"
for directory in (BLEND_DIR, EXPORT_DIR, RENDER_DIR, PANEL_DIR):
    directory.mkdir(parents=True, exist_ok=True)

spec = importlib.util.spec_from_file_location("ps032_validate", SCRIPT_PATH.parent / "validate_ps03_2.py")
validation_module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = validation_module
spec.loader.exec_module(validation_module)

GeometryValidator = validation_module.GeometryValidator
TERMINAL_NAMES = validation_module.TERMINAL_NAMES
TARGET_NAMES = validation_module.TARGET_NAMES
TARGET_BBOX = validation_module.TARGET_BBOX
EXPECTED_TOPOLOGY_HASH = validation_module.EXPECTED_TOPOLOGY_HASH
EXPECTED_UV_HASH = validation_module.EXPECTED_UV_HASH
EXPECTED_MASTER_POSITION_HASH = validation_module.EXPECTED_MASTER_POSITION_HASH
RELOADED_MASTER_POSITION_HASH = "54af439e6a4ce68f87fcfa20f8ef3d9c124aa62b416d8c29569fd37a18c55469"
EXPECTED_MASK_HASH = validation_module.EXPECTED_MASK_HASH
EXPECTED_MASK_FACE_COUNT = validation_module.EXPECTED_MASK_FACE_COUNT
positions_hash = validation_module.positions_hash
topology_hash = validation_module.topology_hash
mask_index_hash = validation_module.mask_index_hash
topology_metrics = validation_module.topology_metrics

SEGMENTS = 160
INTERIOR_RINGS = 52
DIRECTED_AXIS = (0.86241817, 0.28078729, 0.42118093)

COLORS = {
    "ivory": "#DED8CC",
    "floor": "#C9CBC7",
    "ink": "#202329",
    "content": "#4C7AFF",
    "design": "#9E64EE",
    "event": "#F86927",
    "games": "#76A713",
    "video": "#E34992",
    "digital": "#009FAC",
    "merch": "#D5A200",
    "light_bg": "#F4F5F2",
}

TARGET_META = {
    "BRAND_WIDE": {
        "semantic_role": "brand-wide terminal",
        "competence": "Mimicry group",
        "principle": "calm lateral release with retained asymmetry",
        "risk": "pebble / cushion / generic blob",
        "risk_level": 1,
        "fill": (0.94, 1.00, 0.90),
        "score": [18, 19, 14, 13, 14, 9, 5],
    },
    "SINGLE_CONTENT_SEQUENCE": {
        "semantic_role": "single terminal",
        "competence": "Content",
        "principle": "three broad sequential beats on one directed ridge",
        "risk": "paper / pages / waveform",
        "risk_level": 2,
        "fill": (1.00, 0.92, 0.98),
        "score": [18, 19, 14, 14, 13, 9, 5],
    },
    "SINGLE_DESIGN_TORSION": {
        "semantic_role": "single terminal",
        "competence": "Design",
        "principle": "small counter-torsion of two broad surfaces",
        "risk": "fashion ribbon / shell",
        "risk_level": 2,
        "fill": (0.97, 0.96, 1.00),
        "score": [18, 19, 14, 14, 13, 9, 5],
    },
    "SINGLE_EVENT_CONVERGENCE": {
        "semantic_role": "single terminal",
        "competence": "Events",
        "principle": "lateral mass converges into one integrated crest",
        "risk": "stage / portal / flower / volcano",
        "risk_level": 2,
        "fill": (0.95, 1.00, 1.00),
        "score": [18, 18, 14, 14, 13, 9, 5],
    },
    "SINGLE_GAMES_BRANCH": {
        "semantic_role": "single terminal",
        "competence": "Games",
        "principle": "one mass distributes tension through three broad shoulders",
        "risk": "horns / crown / toy / controller",
        "risk_level": 3,
        "fill": (0.97, 1.00, 0.99),
        "score": [18, 18, 13, 15, 12, 9, 5],
    },
    "SINGLE_VIDEO_TEMPORAL": {
        "semantic_role": "single terminal",
        "competence": "Video",
        "principle": "continuous temporal S-sweep between leading and trailing thirds",
        "risk": "lens / eye / camera / film",
        "risk_level": 2,
        "fill": (1.00, 0.93, 0.98),
        "score": [18, 19, 14, 14, 13, 9, 5],
    },
    "SINGLE_DIGITAL_SIGNAL": {
        "semantic_role": "single terminal",
        "competence": "Digital",
        "principle": "three shallow longitudinal tension channels converge forward",
        "risk": "circuit / server / sci-fi hardware",
        "risk_level": 3,
        "fill": (0.99, 0.92, 0.97),
        "score": [18, 18, 13, 15, 12, 9, 5],
    },
    "SINGLE_MERCH_WRAP": {
        "semantic_role": "single terminal",
        "competence": "Merch",
        "principle": "one broad tactile wrap gesture without a seam",
        "risk": "box / package / capsule / ingot",
        "risk_level": 2,
        "fill": (0.92, 0.98, 0.88),
        "score": [18, 19, 14, 14, 12, 9, 5],
    },
    "COMPLEX_FOCUS": {
        "semantic_role": "complex terminal",
        "competence": "Focus",
        "principle": "multiple fields resolve into one clear diagonal fold",
        "risk": "arrow / lens / eye / tip",
        "risk_level": 3,
        # Keep one percent of serialization/interpolation headroom above the
        # desirable 88% canonical-fill floor.
        "fill": (1.00, 0.89, 0.98),
        "score": [19, 19, 14, 14, 12, 9, 5],
    },
    "COMPLEX_GATHER": {
        "semantic_role": "complex terminal",
        "competence": "Gather",
        "principle": "broad lateral participation gathers into a shared ridge",
        "risk": "stage / portal / flower / bowl",
        "risk_level": 2,
        "fill": (0.93, 1.00, 1.00),
        "score": [19, 19, 14, 14, 13, 9, 5],
    },
    "COMPLEX_DRIVE": {
        "semantic_role": "complex terminal",
        "competence": "Drive",
        "principle": "blunt forward mass supported by a rear crest",
        "risk": "rocket / automotive / airfoil / helmet",
        "risk_level": 3,
        "fill": (1.00, 0.89, 0.96),
        "score": [19, 18, 13, 14, 12, 9, 5],
    },
    "TRANSITION_TENSION": {
        "semantic_role": "additive transition",
        "competence": "runtime transition",
        "principle": "small axis-aligned surface organization and transverse compression",
        "risk": "breathing / organ pulse / sharpened tip",
        "risk_level": 2,
        "fill": (1.00, 0.98, 1.00),
        "score": None,
    },
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    progress = clamp((value - edge0) / (edge1 - edge0))
    return progress * progress * (3.0 - 2.0 * progress)


def angle_gaussian(phi: float, center: float, width: float) -> float:
    distance = math.atan2(math.sin(phi - center), math.cos(phi - center))
    return math.exp(-((distance / width) ** 2))


def photonic_zone_field(s: float, phi: float) -> float:
    """Smooth surface field near the inherited mask, not discrete membership."""
    u = (s + 1.0) * 0.5
    radial = max(0.0, 1.0 - s * s) ** 0.25
    score = radial * (
        0.50 * math.sin(phi)
        + 0.34 * (-math.cos(phi))
        + 0.18 * math.sin(math.pi * u)
        + 0.12 * u
        + 0.055 * math.sin(phi * 3.0 + u * 8.0)
    )
    return smoothstep(-0.18, 0.62, score)


def hex_rgba(value: str):
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) / 255.0 for index in (0, 2, 4)) + (1.0,)


def topology_parameters():
    values = [(-1.0, 0.0)]
    for ring in range(1, INTERIOR_RINGS + 1):
        s = -1.0 + 2.0 * ring / (INTERIOR_RINGS + 1)
        for segment in range(SEGMENTS):
            values.append((s, math.tau * segment / SEGMENTS))
    values.append((1.0, 0.0))
    if len(values) != validation_module.EXPECTED_VERTICES:
        raise RuntimeError("Unexpected parameter count")
    return values


def uv_hash(values) -> str:
    payload = ";".join(f"{u:.8f},{v:.8f}" for u, v in values).encode("ascii")
    return hashlib.sha256(payload).hexdigest()


def read_approved_master():
    input_paths = (
        SOURCE_REPORT,
        SOURCE_BLEND,
        SOURCE_WORKBENCH,
        SOURCE_GLB,
        SOURCE_VALIDATION,
        SOURCE_BUILD_SCRIPT,
        SOURCE_COMPOSE_SCRIPT,
        REPO_DIR / "docs" / "mimicry_photonic_skin_ps02_5_spec_2026-08-03.md",
        REPO_DIR / "docs" / "mimicry_ps02_5_reference_storyboard_2026-08-03.png",
        REPO_DIR / "design" / "photonic-skin" / "ps-02" / "blender" / "ps-02-mimic-core.blend",
        REPO_DIR / "design" / "photonic-skin" / "ps-02" / "exports" / "ps02-technical-validation.json",
    )
    missing = [str(path) for path in input_paths if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing PS-03.2 input(s): " + ", ".join(missing))
    source_hashes = {str(path): sha256_file(path) for path in input_paths}
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE_BLEND))
    candidates = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.name.startswith("MimicCore_C-R1")
    ]
    if len(candidates) != 1:
        raise RuntimeError(f"Expected one approved C-R1 actor, found {len(candidates)}")
    obj = candidates[0]
    if not obj.data.shape_keys or "MASTER" not in obj.data.shape_keys.key_blocks:
        raise RuntimeError("Approved source has no MASTER basis")
    master = [tuple(point.co) for point in obj.data.shape_keys.key_blocks["MASTER"].data]
    faces = [tuple(poly.vertices) for poly in obj.data.polygons]
    uv_values = [tuple(item.uv) for item in obj.data.uv_layers["MimicCoreUV"].data]
    point_mask = [item.value for item in obj.data.attributes["_PHOTONIC_MASK"].data]
    point_slot = [item.value for item in obj.data.attributes["_PHOTONIC_SLOT"].data]
    active_faces = json.loads(obj.get("photonicMaskFaceIndices", "[]"))
    active_slots = {index: obj.data.polygons[index].material_index for index in active_faces}
    ps031_validation = json.loads(SOURCE_VALIDATION.read_text(encoding="utf8"))
    checks = {
        "master_reloaded_position_hash": positions_hash(master) == RELOADED_MASTER_POSITION_HASH,
        "master_declared_position_hash": (
            ps031_validation["variants"]["R1B"]["position_hash"]
            == EXPECTED_MASTER_POSITION_HASH
        ),
        "topology_hash": topology_hash(faces) == EXPECTED_TOPOLOGY_HASH,
        "uv_hash": uv_hash(uv_values) == EXPECTED_UV_HASH,
        "mask_face_count": len(active_faces) == EXPECTED_MASK_FACE_COUNT,
        "mask_hash": mask_index_hash(active_faces) == EXPECTED_MASK_HASH,
    }
    if not all(checks.values()):
        raise RuntimeError(f"Approved MASTER baseline mismatch: {checks}")
    return {
        "master": master,
        "faces": faces,
        "uv_values": uv_values,
        "point_mask": point_mask,
        "point_slot": point_slot,
        "active_faces": active_faces,
        "active_slots": active_slots,
        "source_hashes": source_hashes,
        "baseline_checks": checks,
    }


def envelope_fit(positions, fill):
    minima = [min(point[axis] for point in positions) for axis in range(3)]
    maxima = [max(point[axis] for point in positions) for axis in range(3)]
    centers = [(minima[axis] + maxima[axis]) * 0.5 for axis in range(3)]
    sizes = [maxima[axis] - minima[axis] for axis in range(3)]
    desired = [TARGET_BBOX[axis] * fill[axis] for axis in range(3)]
    scales = [desired[axis] / sizes[axis] for axis in range(3)]
    return [
        tuple((point[axis] - centers[axis]) * scales[axis] for axis in range(3))
        for point in positions
    ]


def constrain_additive_delta_to_envelope(positions_by_name):
    """Clamp only TRANSITION_TENSION's delta against every terminal envelope.

    Runtime adds the MASTER-relative transition delta to arbitrary terminal
    coordinates.  A delta that is safe on MASTER can otherwise move a terminal
    extremum a fraction outside 6.8 x 3.6 x 3.2.  Per-vertex, per-axis feasible
    intervals preserve all semantic targets and topology while guaranteeing the
    additive diagnostic at weight 1.0 remains inside the canonical envelope.
    """
    master = positions_by_name["MASTER"]
    transition = positions_by_name["TRANSITION_TENSION"]
    terminals = [positions_by_name[name] for name in TERMINAL_NAMES]
    constrained = []
    for vertex_index, (base, target) in enumerate(zip(master, transition)):
        result = []
        for axis in range(3):
            half_extent = TARGET_BBOX[axis] * 0.5
            lower = max(
                -half_extent - terminal[vertex_index][axis] for terminal in terminals
            )
            upper = min(
                half_extent - terminal[vertex_index][axis] for terminal in terminals
            )
            delta = target[axis] - base[axis]
            result.append(max(lower, min(upper, delta)))
        constrained.append(tuple(base[axis] + result[axis] for axis in range(3)))
    return constrained


def target_positions(name: str, master, parameters):
    if name == "MASTER":
        return list(master)
    output = []
    for point, (s, phi) in zip(master, parameters):
        x, y, z = point
        u = (s + 1.0) * 0.5
        body = max(0.0, 1.0 - s * s)
        y_dir = math.cos(phi)
        z_dir = math.sin(phi)
        top = max(0.0, z_dir)
        lower = max(0.0, -z_dir)
        camera_side = max(0.0, -y_dir)

        if name == "BRAND_WIDE":
            release = body * (0.78 + 0.22 * (1.0 - u))
            y *= 1.0 + 0.155 * release
            z *= 1.0 - 0.085 * release
            x -= 0.080 * release * (u - 0.35)
            z -= 0.080 * release * camera_side

        elif name == "SINGLE_CONTENT_SEQUENCE":
            beat = 0.56 + 0.44 * math.cos(math.tau * 3.0 * u + 0.35)
            ridge = body * (0.35 + 0.65 * top) * (0.35 + 0.65 * camera_side)
            radial_beat = 1.0 + 0.085 * ridge * beat
            y *= radial_beat
            z *= radial_beat
            z += 0.205 * ridge * beat
            y -= 0.095 * ridge * beat
            x += 0.155 * body * (u - 0.30)
            y *= 1.0 - 0.060 * body

        elif name == "SINGLE_DESIGN_TORSION":
            angle = math.radians(15.0) * s * body + math.radians(2.8) * body
            rotated_y = y * math.cos(angle) - z * math.sin(angle)
            rotated_z = y * math.sin(angle) + z * math.cos(angle)
            y = rotated_y + 0.105 * body * s + 0.045 * body * z_dir
            z = rotated_z - 0.075 * body * s - 0.040 * body * y_dir
            x += 0.080 * body * math.sin(phi + 0.5)

        elif name == "SINGLE_EVENT_CONVERGENCE":
            crest = body * math.exp(-((s - 0.10) / 0.62) ** 2)
            y *= 1.0 + 0.105 * body * (0.55 + 0.45 * lower)
            y *= 1.0 - 0.085 * crest * top
            z += 0.355 * crest * (0.35 + 0.65 * top)
            z -= 0.065 * body * lower
            x += 0.075 * crest * top

        elif name == "SINGLE_GAMES_BRANCH":
            branch = math.cos(3.0 * phi - 0.70 + 0.45 * s)
            radial = 1.0 + 0.105 * body * branch
            y *= radial
            z *= radial
            z += 0.125 * body * (0.35 + top) * math.cos(phi - 0.35)
            y -= 0.085 * body * math.sin(phi * 2.0 + 0.60)
            x += 0.090 * body * (0.20 + 0.80 * u)

        elif name == "SINGLE_VIDEO_TEMPORAL":
            sweep = math.sin(math.pi * (s + 0.18))
            y += 0.275 * body * sweep
            z += 0.205 * body * math.sin(math.pi * (s - 0.20))
            x += 0.155 * body * (0.60 * y_dir + 0.40 * z_dir)
            y *= 1.0 - 0.045 * body

        elif name == "SINGLE_DIGITAL_SIGNAL":
            channel = math.cos(3.0 * phi + 0.55 * u + 0.20)
            gate = body * (0.25 + 0.50 * top + 0.25 * camera_side)
            radial = 1.0 + 0.095 * gate * channel
            y *= radial
            z *= radial
            x += 0.125 * body * (u - 0.25)
            y -= 0.055 * gate * math.sin(3.0 * phi + 0.55 * u)

        elif name == "SINGLE_MERCH_WRAP":
            wrap = angle_gaussian(phi, -0.52 + 0.55 * u, 0.90)
            counter = angle_gaussian(phi, -1.25 + 0.30 * u, 0.55)
            radial = 1.0 + 0.145 * body * wrap - 0.055 * body * counter
            y *= radial
            z *= radial
            y += 0.120 * body * wrap
            z -= 0.095 * body * lower
            x -= 0.100 * body * (u - 0.45)

        elif name == "COMPLEX_FOCUS":
            fold = angle_gaussian(phi, 1.10 - 1.05 * u, 0.68)
            y *= 1.0 - 0.165 * body
            z += 0.245 * body * fold
            y -= 0.135 * body * fold
            x += 0.165 * body * (0.25 + 0.75 * u) * fold
            x -= 0.055 * body * (1.0 - fold)

        elif name == "COMPLEX_GATHER":
            gather = body * math.exp(-((s + 0.02) / 0.78) ** 2)
            y *= 1.0 + 0.165 * body
            z += 0.285 * gather * (0.40 + 0.60 * top)
            y *= 1.0 - 0.060 * gather * top
            x -= 0.075 * body * (u - 0.45)
            z += 0.070 * body * camera_side

        elif name == "COMPLEX_DRIVE":
            drive = body * smoothstep(0.15, 0.90, u)
            rear = body * math.exp(-((s + 0.42) / 0.48) ** 2)
            x += 0.285 * body * (u - 0.18)
            y *= 1.0 - 0.140 * body
            z += 0.205 * rear * (0.45 + 0.55 * top)
            z -= 0.080 * drive * lower
            y -= 0.065 * drive * camera_side

        elif name == "TRANSITION_TENSION":
            ridge = body * angle_gaussian(phi, 0.95 - 0.78 * u, 0.82)
            y *= 1.0 - 0.025 * body
            z += 0.065 * ridge
            y -= 0.030 * ridge
            x += 0.055 * body * (u - 0.20)
        else:
            raise KeyError(name)

        # A shared, very low-amplitude continuous tension correction keeps the
        # fixed 2 526-face photonic region near the approved physical-area mean
        # without engraving its discrete boundary into any semantic target.
        zone_tension = photonic_zone_field(s, phi)
        surface_tension = 1.0 - 0.018 * zone_tension * body
        y *= surface_tension
        z *= surface_tension

        output.append((x, y, z))
    return envelope_fit(output, TARGET_META[name]["fill"])


def make_material(name, color, roughness, metallic, coat=0.15):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = hex_rgba(color)
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_rgba(color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
    if "Coat Roughness" in bsdf.inputs:
        bsdf.inputs["Coat Roughness"].default_value = 0.34
    return material


def make_silhouette_material():
    material = bpy.data.materials.new("PS032_Silhouette")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    diffuse = nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (0.002, 0.002, 0.002, 1.0)
    diffuse.inputs["Roughness"].default_value = 1.0
    links.new(diffuse.outputs["BSDF"], output.inputs["Surface"])
    return material


def build_materials():
    return {
        "neutral": make_material("PS032_Neutral_Ivory", COLORS["ivory"], 0.42, 0.04, 0.20),
        "content": make_material("PS032_Content", COLORS["content"], 0.36, 0.10, 0.20),
        "design": make_material("PS032_Design", COLORS["design"], 0.36, 0.10, 0.20),
        "digital": make_material("PS032_Digital", COLORS["digital"], 0.36, 0.10, 0.20),
        "silhouette": make_silhouette_material(),
        "wire": make_material("PS032_Wire", COLORS["ink"], 0.50, 0.0, 0.0),
        "floor": make_material("PS032_Floor", COLORS["floor"], 0.68, 0.0, 0.0),
    }


def create_actor(name, source, positions_by_name, materials, collection):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(source["master"], [], source["faces"])
    mesh.update(calc_edges=True)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    uv = mesh.uv_layers.new(name="MimicCoreUV")
    if len(uv.data) != len(source["uv_values"]):
        raise RuntimeError("UV loop count changed")
    for destination, value in zip(uv.data, source["uv_values"]):
        destination.uv = value
    for attribute_name, values in (
        ("_PHOTONIC_MASK", source["point_mask"]),
        ("_PHOTONIC_SLOT", source["point_slot"]),
    ):
        attribute = mesh.attributes.new(attribute_name, "FLOAT", "POINT")
        for item, value in zip(attribute.data, values):
            item.value = value
    mesh.materials.append(materials["neutral"])
    actor = bpy.data.objects.new(name, mesh)
    collection.objects.link(actor)
    actor.shape_key_add(name="MASTER", from_mix=False)
    for target_name in TARGET_NAMES:
        key = actor.shape_key_add(name=target_name, from_mix=False)
        key.relative_key = actor.data.shape_keys.key_blocks["MASTER"]
        for destination, value in zip(key.data, positions_by_name[target_name]):
            destination.co = value
        key.value = 0.0
    actor.data.shape_keys.use_relative = True
    group = actor.vertex_groups.new(name="PhotonicActive_34")
    for index, weight in enumerate(source["point_mask"]):
        if weight > 0.0:
            group.add([index], weight, "REPLACE")
    return actor


def set_weights(actor, weights=None):
    weights = weights or {}
    for key in actor.data.shape_keys.key_blocks:
        if key.name != "MASTER":
            key.value = float(weights.get(key.name, 0.0))
    bpy.context.view_layer.update()


def assign_render_mode(actor, materials, source, mode):
    actor.data.materials.clear()
    if mode == "neutral":
        actor.data.materials.append(materials["neutral"])
    elif mode == "active":
        for key in ("neutral", "content", "design", "digital"):
            actor.data.materials.append(materials[key])
    elif mode == "silhouette":
        actor.data.materials.append(materials["silhouette"])
    else:
        raise ValueError(mode)
    for polygon in actor.data.polygons:
        polygon.material_index = (
            source["active_slots"].get(polygon.index, 0) if mode == "active" else 0
        )


def point_at(obj, location, target=(0.0, 0.0, 0.0)):
    obj.location = location
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def set_camera(camera, view):
    presets = {
        "canonical": (9.0, -12.0, 6.5),
        "opposite": (-9.0, 12.0, 6.5),
        "front": (15.0, 0.0, 0.0),
        "side": (0.0, -15.0, 0.0),
        "top": (0.0, 0.0, 15.0),
    }
    point_at(camera, presets[view])
    camera.data.lens = 55.0
    camera.data.sensor_width = 36.0


def set_world(scene, transparent=False, white=False):
    scene.render.film_transparent = transparent
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (
        (1.0, 1.0, 1.0, 1.0) if white else hex_rgba(COLORS["light_bg"])
    )
    background.inputs["Strength"].default_value = 1.0 if white else 0.34


def render_still(scene, path, width, height, rgba=False):
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.color_mode = "RGBA" if rgba else "RGB"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print("PS032_RENDER", path.name)


def slug(name):
    return name.lower().replace("single_", "").replace("complex_", "complex-").replace("_", "-")


def canonical_roll(actor, camera, enabled=True):
    actor.rotation_mode = "QUATERNION"
    actor.rotation_quaternion = (
        Quaternion(camera.location.normalized(), math.radians(34.0))
        if enabled
        else Quaternion((1.0, 0.0, 0.0, 0.0))
    )


def render_wire(scene, actor, materials, path):
    duplicate = actor.copy()
    duplicate.data = actor.data.copy()
    duplicate.name = "PS032_WireOverlay"
    actor.users_collection[0].objects.link(duplicate)
    duplicate.data.materials.clear()
    duplicate.data.materials.append(materials["wire"])
    modifier = duplicate.modifiers.new("PS032_Wire", "WIREFRAME")
    modifier.thickness = 0.006
    modifier.use_replace = True
    render_still(scene, path, 720, 540)
    mesh = duplicate.data
    bpy.data.objects.remove(duplicate, do_unlink=True)
    bpy.data.meshes.remove(mesh)


def render_system(scene, actor, camera, floor, lights, materials, source):
    for state_name in TERMINAL_NAMES:
        state_slug = slug(state_name)
        set_weights(actor, {} if state_name == "MASTER" else {state_name: 1.0})
        assign_render_mode(actor, materials, source, "neutral")
        floor.hide_render = False
        set_world(scene, False, False)
        for light in lights:
            light.hide_render = False
        set_camera(camera, "canonical")
        canonical_roll(actor, camera, True)
        render_still(scene, PANEL_DIR / f"canonical_{state_slug}.png", 720, 540)

        canonical_roll(actor, camera, False)
        for view in ("opposite", "front", "side", "top"):
            set_camera(camera, view)
            floor.hide_render = view == "top"
            render_still(scene, PANEL_DIR / f"control_{state_slug}_{view}.png", 600, 450)

        floor.hide_render = True
        for light in lights:
            light.hide_render = True
        set_world(scene, False, True)
        assign_render_mode(actor, materials, source, "silhouette")
        set_camera(camera, "canonical")
        canonical_roll(actor, camera, True)
        render_still(scene, PANEL_DIR / f"silhouette_{state_slug}.png", 720, 540)

        for light in lights:
            light.hide_render = False
        set_world(scene, False, False)
        assign_render_mode(actor, materials, source, "neutral")
        render_wire(scene, actor, materials, PANEL_DIR / f"wire_{state_slug}.png")

        assign_render_mode(actor, materials, source, "active")
        render_still(scene, PANEL_DIR / f"mask_{state_slug}.png", 720, 540)

        assign_render_mode(actor, materials, source, "neutral")
        set_world(scene, True, False)
        floor.hide_render = True
        render_still(scene, PANEL_DIR / f"mobile_actor_{state_slug}.png", 1000, 1000, True)

    transition_sets = {
        "master-content": [
            ({"SINGLE_CONTENT_SEQUENCE": step / 4.0}, step) for step in range(5)
        ],
        "design-merch": [
            (
                {"SINGLE_DESIGN_TORSION": 1.0 - step / 4.0, "SINGLE_MERCH_WRAP": step / 4.0},
                step,
            )
            for step in range(5)
        ],
        "games-event": [
            (
                {"SINGLE_GAMES_BRANCH": 1.0 - step / 4.0, "SINGLE_EVENT_CONVERGENCE": step / 4.0},
                step,
            )
            for step in range(5)
        ],
        "focus-drive": [
            (
                {"COMPLEX_FOCUS": 1.0 - step / 4.0, "COMPLEX_DRIVE": step / 4.0},
                step,
            )
            for step in range(5)
        ],
        "retarget-content-design-event": [
            (
                {
                    "SINGLE_CONTENT_SEQUENCE": 0.5 * (1.0 - step / 4.0),
                    "SINGLE_DESIGN_TORSION": 0.5 * (1.0 - step / 4.0),
                    "SINGLE_EVENT_CONVERGENCE": step / 4.0,
                },
                step,
            )
            for step in range(5)
        ],
        "transition-tension": [
            ({"TRANSITION_TENSION": value}, step)
            for step, value in enumerate((0.0, 0.03, 0.06, 0.03, 0.0))
        ],
    }
    assign_render_mode(actor, materials, source, "neutral")
    set_world(scene, False, False)
    floor.hide_render = False
    for light in lights:
        light.hide_render = False
    set_camera(camera, "canonical")
    canonical_roll(actor, camera, True)
    for sequence, frames in transition_sets.items():
        for weights, frame in frames:
            set_weights(actor, weights)
            render_still(scene, PANEL_DIR / f"transition_{sequence}_{frame}.png", 720, 540)
    canonical_roll(actor, camera, False)
    set_weights(actor, {})


def create_scene(source, positions_by_name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 24
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.world = bpy.data.worlds.new("PS032_StudioWorld")
    scene.world.use_nodes = True
    actor_collection = bpy.data.collections.new("PS032_MorphSystem")
    rig_collection = bpy.data.collections.new("PS032_RenderRig")
    scene.collection.children.link(actor_collection)
    scene.collection.children.link(rig_collection)
    materials = build_materials()
    actor = create_actor("MimicCoreMesh", source, positions_by_name, materials, actor_collection)

    camera_data = bpy.data.cameras.new("PS032_Camera_55mm")
    camera = bpy.data.objects.new("PS032_Camera_55mm", camera_data)
    rig_collection.objects.link(camera)
    scene.camera = camera
    set_camera(camera, "canonical")
    lights = []
    for name, location, size, energy in (
        ("PS032_Key", (4.5, -5.5, 7.5), 5.0, 660.0),
        ("PS032_Fill", (-5.5, -2.0, 3.0), 4.0, 340.0),
        ("PS032_Rim", (1.0, 5.5, 5.0), 3.5, 500.0),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.shape = "DISK"
        data.size = size
        data.energy = energy
        data.color = (1.0, 0.97, 0.91)
        light = bpy.data.objects.new(name, data)
        point_at(light, location)
        rig_collection.objects.link(light)
        lights.append(light)
    bpy.ops.mesh.primitive_plane_add(size=30.0, location=(0.0, 0.0, -1.62))
    floor = bpy.context.object
    floor.name = "PS032_StudioFloor"
    for collection in list(floor.users_collection):
        collection.objects.unlink(floor)
    rig_collection.objects.link(floor)
    floor.data.materials.append(materials["floor"])
    return scene, actor, camera, floor, lights, materials


def set_custom_properties(actor, source, manifest, technical):
    actor["schemaVersion"] = "ps-03.2-v1"
    actor["canonicalState"] = "MASTER"
    actor["topologyHash"] = EXPECTED_TOPOLOGY_HASH
    actor["connectivityIndexHash"] = EXPECTED_TOPOLOGY_HASH
    actor["uvHash"] = EXPECTED_UV_HASH
    actor["masterPositionHash"] = EXPECTED_MASTER_POSITION_HASH
    actor["masterReloadedPositionHash"] = RELOADED_MASTER_POSITION_HASH
    actor["boundingBox"] = json.dumps(TARGET_BBOX)
    actor["directedAxis"] = json.dumps(DIRECTED_AXIS)
    actor["maskFaceCount"] = EXPECTED_MASK_FACE_COUNT
    actor["maskFaceIndexHash"] = EXPECTED_MASK_HASH
    actor["photonicMaskFaceIndices"] = json.dumps(source["active_faces"], separators=(",", ":"))
    actor["targetNames"] = json.dumps(list(TARGET_NAMES), separators=(",", ":"))
    actor["maskAreaStats"] = json.dumps(technical["mask_area_stats"], separators=(",", ":"))
    actor["targetRiskLevels"] = json.dumps(
        {name: TARGET_META[name]["risk_level"] for name in TARGET_NAMES}, separators=(",", ":")
    )
    actor["targetManifestSha256"] = hashlib.sha256(
        json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode("utf8")
    ).hexdigest()


def clean_production_scene(source, positions_by_name, manifest, technical):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    materials = {"neutral": make_material("PhotonicSkin_NeutralPlaceholder", COLORS["ivory"], 0.42, 0.04, 0.20)}
    collection = bpy.data.collections.new("PhotonicSkin")
    scene.collection.children.link(collection)
    actor = create_actor("MimicCoreMesh", source, positions_by_name, materials, collection)
    actor.location = (0.0, 0.0, 0.0)
    actor.rotation_euler = (0.0, 0.0, 0.0)
    actor.scale = (1.0, 1.0, 1.0)
    root = bpy.data.objects.new("MimicCoreRoot", None)
    collection.objects.link(root)
    actor.parent = root
    set_custom_properties(actor, source, manifest, technical)
    for polygon in actor.data.polygons:
        polygon.material_index = 0
    return scene, root, actor


def export_glb(root, actor):
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    actor.select_set(True)
    bpy.context.view_layer.objects.active = actor
    path = EXPORT_DIR / "photonic-skin-c-r1-morph-system.glb"
    available = {item.identifier for item in bpy.ops.export_scene.gltf.get_rna_type().properties}
    requested = {
        "filepath": str(path),
        "export_format": "GLB",
        "use_selection": True,
        "export_apply": False,
        "export_morph": True,
        "export_morph_normal": True,
        "export_morph_tangent": False,
        "export_tangents": True,
        "export_attributes": True,
        "export_materials": "EXPORT",
        "export_animations": False,
        "export_cameras": False,
        "export_lights": False,
        "export_yup": True,
        "export_extras": True,
    }
    bpy.ops.export_scene.gltf(**{key: value for key, value in requested.items() if key in available})
    return path


def validate_glb_reimport(path, expected_manifest):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one GLB mesh, found {len(meshes)}")
    obj = meshes[0]
    obj.data.calc_loop_triangles()
    keys = [key.name for key in obj.data.shape_keys.key_blocks] if obj.data.shape_keys else []
    target_keys = keys[1:]
    attrs = sorted(attribute.name for attribute in obj.data.attributes)
    one_hot = []
    for key in obj.data.shape_keys.key_blocks[1:]:
        for item in obj.data.shape_keys.key_blocks[1:]:
            item.value = 1.0 if item == key else 0.0
        bpy.context.view_layer.update()
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
        bbox = validation_module.bounding_box([tuple(vertex.co) for vertex in evaluated.vertices])
        obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
        expected = next(item for item in expected_manifest["targets"] if item["stable_name"] == key.name)
        one_hot.append(
            {
                "name": key.name,
                "bounding_box": bbox,
                "expected_bounding_box": expected["bounding_box"],
                "bbox_matches": all(
                    abs(left - right) <= 1e-4
                    for left, right in zip(bbox["size"], expected["bounding_box"]["size"])
                ),
            }
        )
    extras = {key: obj[key] for key in obj.keys() if key != "_RNA_UI"}
    checks = {
        "one_mesh": len(meshes) == 1,
        "triangle_count": len(obj.data.loop_triangles) == validation_module.EXPECTED_TRIANGLES,
        "target_count": len(target_keys) == 12,
        "target_order": target_keys == list(TARGET_NAMES),
        "uv_present": len(obj.data.uv_layers) == 1,
        "mask_attribute_present": "_PHOTONIC_MASK" in attrs,
        "slot_attribute_present": "_PHOTONIC_SLOT" in attrs,
        "all_one_hot_bounds": all(item["bbox_matches"] for item in one_hot),
        "topology_extra": extras.get("topologyHash") == EXPECTED_TOPOLOGY_HASH,
        "master_hash_extra": extras.get("masterPositionHash") == EXPECTED_MASTER_POSITION_HASH,
        "master_reloaded_hash_extra": extras.get("masterReloadedPositionHash")
        == RELOADED_MASTER_POSITION_HASH,
    }
    report = {
        "stage": "PS-03.2",
        "blender_version": bpy.app.version_string,
        "file": str(path),
        "file_sha256": sha256_file(path),
        "file_size_bytes": path.stat().st_size,
        "mesh_name": obj.name,
        "runtime_vertex_count_after_seam_splits": len(obj.data.vertices),
        "triangle_count": len(obj.data.loop_triangles),
        "shape_keys": keys,
        "morph_targets": target_keys,
        "attributes": attrs,
        "extras": extras,
        "one_hot_states": one_hot,
        "checks": checks,
        "passed": all(checks.values()),
    }
    output = EXPORT_DIR / "ps03-2-glb-reimport-validation.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    if not report["passed"]:
        raise RuntimeError(f"GLB reimport failed: {checks}")
    return report


def main():
    source = read_approved_master()
    parameters = topology_parameters()
    positions_by_name = {"MASTER": list(source["master"])}
    for name in TARGET_NAMES:
        positions_by_name[name] = target_positions(name, source["master"], parameters)
    positions_by_name["TRANSITION_TENSION"] = constrain_additive_delta_to_envelope(
        positions_by_name
    )

    validator = GeometryValidator(source["master"], source["faces"], source["active_faces"])
    common_topology = topology_metrics(len(source["master"]), source["faces"])
    endpoint_reports = {}
    manifest_targets = []
    for index, name in enumerate(TARGET_NAMES):
        metrics = validator.metrics(positions_by_name[name], include_intersections=True)
        checks = validator.checks(metrics, strict_mask=True)
        meta = TARGET_META[name]
        total_score = sum(meta["score"]) if meta["score"] else None
        endpoint_reports[name] = {"metrics": metrics, "checks": checks, "passed": all(checks.values())}
        manifest_targets.append(
            {
                "stable_name": name,
                "index": index,
                "semantic_role": meta["semantic_role"],
                "competence": meta["competence"],
                "principle": meta["principle"],
                "position_hash": metrics["position_hash"],
                "rms_displacement_from_master": metrics["rms_displacement_from_master"],
                "max_displacement_from_master": metrics["max_displacement_from_master"],
                "bounding_box": metrics["bounding_box"],
                "signed_volume": metrics["signed_volume"],
                "mask_area": metrics["active_surface_ratio"],
                "silhouette_metrics": metrics["silhouette"],
                "main_risk": meta["risk"],
                "risk_level": meta["risk_level"],
                "score_components": meta["score"],
                "score_total": total_score,
                "validation_status": "pass" if all(checks.values()) else "fail",
            }
        )
    master_metrics = validator.metrics(source["master"], include_intersections=True)
    terminal_mask_areas = [master_metrics["active_surface_ratio"]] + [
        endpoint_reports[name]["metrics"]["active_surface_ratio"] for name in TERMINAL_NAMES[1:]
    ]
    mask_stats = {
        "master": master_metrics["active_surface_ratio"],
        "terminal_min": min(terminal_mask_areas),
        "terminal_max": max(terminal_mask_areas),
        "terminal_mean": round(statistics.fmean(terminal_mask_areas), 6),
        "fixed_face_count": len(source["active_faces"]),
        "face_index_hash": EXPECTED_MASK_HASH,
    }
    common_checks = {
        **source["baseline_checks"],
        "vertex_count": common_topology["vertex_count"] == validation_module.EXPECTED_VERTICES,
        "face_count": common_topology["face_count"] == validation_module.EXPECTED_FACES,
        "triangle_count": common_topology["triangle_count"] == validation_module.EXPECTED_TRIANGLES,
        "edge_count": common_topology["edge_count"] == validation_module.EXPECTED_EDGES,
        "connected_components": common_topology["connected_components"] == 1,
        "boundary_edges": common_topology["boundary_edges"] == 0,
        "non_manifold_edges": common_topology["non_manifold_edges"] == 0,
        "all_endpoints": all(report["passed"] for report in endpoint_reports.values()),
        "mask_mean": abs(mask_stats["terminal_mean"] - 0.34) <= 0.0075,
    }
    manifest = {
        "stage": "PS-03.2",
        "asset": "Photonic Skin C-R1 morph system",
        "basis": {
            "stable_name": "MASTER",
            "position_hash": EXPECTED_MASTER_POSITION_HASH,
            "reloaded_float32_position_hash": positions_hash(source["master"]),
            "bounding_box": master_metrics["bounding_box"],
            "signed_volume": master_metrics["signed_volume"],
            "mask_area": master_metrics["active_surface_ratio"],
            "silhouette_metrics": master_metrics["silhouette"],
        },
        "target_count": 12,
        "target_order": list(TARGET_NAMES),
        "targets": manifest_targets,
        "score_criteria": [
            "semantic_match/20",
            "C-R1B_DNA/20",
            "premium_sculpture/15",
            "distinctness/15",
            "association_safety/15",
            "direct_morph_quality/10",
            "mobile_and_technical/5",
        ],
    }
    manifest_path = EXPORT_DIR / "ps03-2-target-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf8")
    technical = {
        "stage": "PS-03.2",
        "blender_version": bpy.app.version_string,
        "source_hashes_before": source["source_hashes"],
        "master_unchanged": positions_hash(source["master"])
        == RELOADED_MASTER_POSITION_HASH,
        "master_declared_position_hash": EXPECTED_MASTER_POSITION_HASH,
        "master_reloaded_float32_position_hash": RELOADED_MASTER_POSITION_HASH,
        "common_topology": {
            **common_topology,
            "connectivity_index_hash": topology_hash(source["faces"]),
            "uv_hash": uv_hash(source["uv_values"]),
            "mask_face_count": len(source["active_faces"]),
            "mask_face_index_hash": mask_index_hash(source["active_faces"]),
        },
        "shape_key_order": ["MASTER", *TARGET_NAMES],
        "endpoint_validation": {"MASTER": {"metrics": master_metrics, "passed": True}, **endpoint_reports},
        "mask_area_stats": mask_stats,
        "common_checks": common_checks,
        "passed": all(common_checks.values()),
    }
    technical_path = EXPORT_DIR / "ps03-2-technical-validation.json"
    technical_path.write_text(json.dumps(technical, ensure_ascii=False, indent=2), encoding="utf8")
    if not technical["passed"]:
        failed = [name for name, passed in common_checks.items() if not passed]
        failed_targets = [name for name, report in endpoint_reports.items() if not report["passed"]]
        raise RuntimeError(f"Endpoint validation failed common={failed} targets={failed_targets}")
    if os.environ.get("PS032_VALIDATE_ONLY") == "1":
        print("PS032_ENDPOINT_VALIDATE_ONLY_PASS", technical_path)
        return

    scene, actor, camera, floor, lights, materials = create_scene(source, positions_by_name)
    set_custom_properties(actor, source, manifest, technical)
    render_system(scene, actor, camera, floor, lights, materials, source)
    try:
        bpy.context.preferences.filepaths.save_version = 0
    except Exception:
        pass
    workbench = BLEND_DIR / "ps-03-2-morph-authoring-workbench.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(workbench))

    scene, root, production_actor = clean_production_scene(source, positions_by_name, manifest, technical)
    production_blend = BLEND_DIR / "photonic-skin-c-r1-morph-system.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(production_blend))
    glb = export_glb(root, production_actor)
    reimport = validate_glb_reimport(glb, manifest)

    source_hashes_after = {path: sha256_file(Path(path)) for path in source["source_hashes"]}
    unchanged = source_hashes_after == source["source_hashes"]
    technical = json.loads(technical_path.read_text(encoding="utf8"))
    technical["source_hashes_after"] = source_hashes_after
    technical["previous_stage_sources_unchanged"] = unchanged
    technical["outputs"] = {
        "workbench_blend": str(workbench),
        "production_blend": str(production_blend),
        "glb": str(glb),
        "workbench_sha256": sha256_file(workbench),
        "production_blend_sha256": sha256_file(production_blend),
        "glb_sha256": sha256_file(glb),
        "glb_size_bytes": glb.stat().st_size,
    }
    technical["glb_reimport_passed"] = reimport["passed"]
    technical["passed"] = technical["passed"] and unchanged and reimport["passed"]
    technical_path.write_text(json.dumps(technical, ensure_ascii=False, indent=2), encoding="utf8")
    if not technical["passed"]:
        raise RuntimeError("Final PS-03.2 source protection or GLB reimport failed")
    print("PS032_DONE", {"blend": str(production_blend), "glb": str(glb), "reimport": reimport["passed"]})


if __name__ == "__main__":
    main()
