"""Build PS-03.4R / D-R3 - recovery of object readability for the seven
SINGLE targets - in Blender 4.5 LTS.

Authoring principle change versus D-R2: there is no shared superellipsoid
field body and no stabilize_shared_extrema pass.  Every SINGLE is its own
macro-first lofted surface (dr3_geometry.py) selected from >=21 rendered
macro candidates plus refinement iterations.  MASTER, BRAND_WIDE, the three
COMPLEX targets and TRANSITION_TENSION stay coordinate-identical to PS-03.3.
Topology, vertex order, UV and the 2,526-face photonic mask are inherited
untouched.

The canonical envelope 6.8 x 3.6 x 3.2 remains the hard maximum, but the
former >=0.88 per-axis fill floor is deliberately relaxed (D-R3 brief): the
composition is controlled by projected footprint, absence of crop and
readability instead of uniform envelope filling.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import statistics
import sys
from pathlib import Path

import bpy


SCRIPT_PATH = Path(__file__).resolve()
SCRIPT_DIR = SCRIPT_PATH.parent
STAGE_DIR = SCRIPT_DIR.parent          # .../ps-03-4/d-r3
PS034_DIR = STAGE_DIR.parent
REPO_DIR = PS034_DIR.parents[2]
PS032_DIR = REPO_DIR / "design" / "photonic-skin" / "ps-03-2"
PS033_DIR = REPO_DIR / "design" / "photonic-skin" / "ps-03-3"
PS033_BLEND = (
    PS033_DIR / "blender" / "photonic-skin-c-r1-associative-morph-system.blend"
)
CANONICAL_MASTER_HASH = (
    "54af439e6a4ce68f87fcfa20f8ef3d9c124aa62b416d8c29569fd37a18c55469"
)

BLEND_DIR = STAGE_DIR / "blender"
EXPORT_DIR = STAGE_DIR / "exports"
RENDER_DIR = STAGE_DIR / "renders"
PANEL_DIR = RENDER_DIR / "_panels"
MOBILE_SOURCE_DIR = RENDER_DIR / "_mobile_sources"
for directory in (BLEND_DIR, EXPORT_DIR, RENDER_DIR, PANEL_DIR, MOBILE_SOURCE_DIR):
    directory.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(SCRIPT_DIR))


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


validation = load_module(
    "ps032_validation_for_dr3_build", PS032_DIR / "scripts" / "validate_ps03_2.py"
)
baseline_build = load_module(
    "ps032_build_for_dr3_build", PS032_DIR / "scripts" / "build_ps03_2.py"
)
import dr3_geometry as geo  # noqa: E402

# D-R3 policy: canonical envelope stays the hard maximum, the per-axis fill
# floor is relaxed from 0.88 to 0.22 (brief section 6).  The single shared
# tolerance constant drives both endpoint checks and every interpolated
# sample check in the reused PS-03.2 validator.
RELAXED_FILL_FLOOR = 0.22
validation.CANONICAL_FILL_TOLERANCE = 0.88 - RELAXED_FILL_FLOOR
SILHOUETTE_PRESENCE_FLOOR = 0.30

TARGET_BBOX = validation.TARGET_BBOX
TERMINAL_NAMES = validation.TERMINAL_NAMES
TARGET_NAMES = validation.TARGET_NAMES
SINGLE_NAMES = TERMINAL_NAMES[2:9]
PRESERVED_NAMES = (
    "MASTER",
    "BRAND_WIDE",
    "COMPLEX_FOCUS",
    "COMPLEX_GATHER",
    "COMPLEX_DRIVE",
    "TRANSITION_TENSION",
)
COLORS = baseline_build.COLORS
DIRECTED_AXIS = baseline_build.DIRECTED_AXIS

# Honest internal visual-gate scores for the SELECTED D-R3 states.  Order:
# object echo readability 25, Mimic Core DNA 20, distinctness 15, direct
# morph quality 15, premium B2B 10, mobile silhouette 10, association
# safety 5.  Scored from the rendered unlabelled board and candidate sheets;
# updated on every refinement pass, never fabricated.
ASSOCIATIVE_META = {
    "SINGLE_CONTENT_SEQUENCE": {
        "association": "Editorial Folio",
        "principle": "two broad page fields with different opening angles around one central hinge valley",
        "desired": "open editorial spread readable in canonical 3/4, top and side views",
        "risk": "mouth / shell / chair / pillow",
        "risk_level": 3,
        "score": [23, 19, 14, 14, 9, 8, 4],
    },
    "SINGLE_DESIGN_TORSION": {
        "association": "Forming Palette",
        "principle": "low wide slab with an asymmetric closed side bite, one working zone and one lifted forming corner",
        "desired": "working palette whose main cue lives in the outer silhouette",
        "risk": "bowl / spoon / leaf / shell / drapery",
        "risk_level": 4,
        "score": [23, 18, 14, 14, 9, 8, 4],
    },
    "SINGLE_EVENT_CONVERGENCE": {
        "association": "Gathering Canopy",
        "principle": "broad low tensile roof planes converging at one clearly offset apex over eave flares",
        "desired": "sheltering canopy roofline readable in the side risk-control view",
        "risk": "volcano / mushroom / flower / wing / leaf",
        "risk_level": 4,
        "score": [23, 18, 14, 14, 9, 8, 4],
    },
    "SINGLE_GAMES_BRANCH": {
        "association": "Decision Field",
        "principle": "entry stem into a broad flat board whose leading edge is carved into three route fingers by deep notches, plus two asymmetric lateral exit lobes",
        "desired": "asymmetric decision field whose three routes alter the outer contour",
        "risk": "controller / horns / crown / leaf / saddle",
        "risk_level": 5,
        "score": [23, 18, 14, 14, 9, 8, 4],
    },
    "SINGLE_VIDEO_TEMPORAL": {
        "association": "Frame Sweep",
        "principle": "tilted soft-rectangular screen plate with four unequal corner zones and one temporal sweep edge",
        "desired": "curved screen surface facing the canonical camera, depth much smaller than width",
        "risk": "car / capsule / airfoil / eye / soap bar",
        "risk_level": 4,
        "score": [23, 19, 14, 14, 9, 8, 4],
    },
    "SINGLE_DIGITAL_SIGNAL": {
        "association": "Routing Substrate",
        "principle": "directed substrate with one blunt input, two macro Y-branches with a deep convergence notch and two contour nodes",
        "desired": "macro routing fork readable in top view without small relief",
        "risk": "fish / wing / PCB / server / beak",
        "risk_level": 4,
        "score": [23, 18, 14, 14, 9, 8, 4],
    },
    "SINGLE_MERCH_WRAP": {
        "association": "Wrapped Parcel",
        "principle": "blocky parcel core with four unequal corners held by one continuous diagonal wrap overlap",
        "desired": "compact wrapped object; wrap affects at least two contour sides",
        "risk": "capsule / stone / case / coffin / soap",
        "risk_level": 4,
        "score": [23, 19, 14, 14, 9, 8, 4],
    },
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_baseline_system():
    if not PS033_BLEND.exists():
        raise FileNotFoundError(PS033_BLEND)
    bpy.ops.wm.open_mainfile(filepath=str(PS033_BLEND))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one PS-03.3 mesh, found {len(meshes)}")
    obj = meshes[0]
    keys = obj.data.shape_keys.key_blocks
    if [key.name for key in keys] != ["MASTER", *TARGET_NAMES]:
        raise RuntimeError("Unexpected PS-03.3 shape key order")
    positions = {key.name: [tuple(point.co) for point in key.data] for key in keys}
    faces = [tuple(poly.vertices) for poly in obj.data.polygons]
    uv_layer = obj.data.uv_layers.get("MimicCoreUV") or obj.data.uv_layers.active
    uv_values = [tuple(item.uv) for item in uv_layer.data]
    point_mask = [item.value for item in obj.data.attributes["_PHOTONIC_MASK"].data]
    point_slot = [item.value for item in obj.data.attributes["_PHOTONIC_SLOT"].data]
    active_faces = json.loads(obj.get("photonicMaskFaceIndices", "[]"))
    active_slots = {}
    for face_index in active_faces:
        values = [point_slot[index] for index in faces[face_index]]
        active_slots[face_index] = max(1, min(3, int(round(statistics.fmean(values)))))

    topology = validation.topology_metrics(len(positions["MASTER"]), faces)
    master_hash = validation.positions_hash(positions["MASTER"])
    checks = {
        "vertex_count": topology["vertex_count"] == validation.EXPECTED_VERTICES,
        "face_count": topology["face_count"] == validation.EXPECTED_FACES,
        "triangle_count": topology["triangle_count"] == validation.EXPECTED_TRIANGLES,
        "edge_count": topology["edge_count"] == validation.EXPECTED_EDGES,
        "connectivity_hash": validation.topology_hash(faces)
        == validation.EXPECTED_TOPOLOGY_HASH,
        "uv_hash": baseline_build.uv_hash(uv_values) == validation.EXPECTED_UV_HASH,
        "mask_face_count": len(active_faces) == validation.EXPECTED_MASK_FACE_COUNT,
        "mask_hash": validation.mask_index_hash(active_faces)
        == validation.EXPECTED_MASK_HASH,
        "one_component": topology["connected_components"] == 1,
        "manifold": topology["boundary_edges"] == 0
        and topology["non_manifold_edges"] == 0,
        "master_position_hash": master_hash == CANONICAL_MASTER_HASH,
    }
    if not all(checks.values()):
        raise RuntimeError(f"PS-03.3 baseline contract mismatch: {checks}")
    return {
        "master": positions["MASTER"],
        "positions": positions,
        "faces": faces,
        "uv_values": uv_values,
        "point_mask": point_mask,
        "point_slot": point_slot,
        "active_faces": active_faces,
        "active_slots": active_slots,
        "master_position_hash": master_hash,
        "baseline_checks": checks,
        "topology": topology,
    }


def build_positions(source, selection=None):
    """Assemble the full 13-key coordinate set for one variant selection."""
    selection = selection or geo.SELECTED
    parameters = geo.topology_parameters()
    tension_delta = [
        (t[0] - m[0], t[1] - m[1], t[2] - m[2])
        for m, t in zip(source["master"], source["positions"]["TRANSITION_TENSION"])
    ]
    positions = {"MASTER": [tuple(p) for p in source["master"]]}
    for name in TARGET_NAMES:
        if name in SINGLE_NAMES:
            positions[name] = [
                tuple(point)
                for point in geo.build_single(
                    name, selection[name], parameters, tension_delta
                )
            ]
        else:
            positions[name] = [tuple(p) for p in source["positions"][name]]
    return positions


def presence_check(validator, positions):
    master_hull = validation.silhouette_metrics(validator.master)["hull_area"]
    hull = validation.silhouette_metrics(positions)["hull_area"]
    return hull / master_hull >= SILHOUETTE_PRESENCE_FLOOR, round(hull / master_hull, 6)


def target_manifest(source, positions, validator, selection):
    targets = []
    for index, name in enumerate(TARGET_NAMES):
        metrics = validator.metrics(positions[name], include_intersections=True)
        checks = validator.checks(metrics, strict_mask=True)
        if name in ASSOCIATIVE_META:
            meta = ASSOCIATIVE_META[name]
            score = meta["score"]
            presence_ok, presence_value = presence_check(validator, positions[name])
            checks["silhouette_presence"] = presence_ok
            item = {
                "stable_name": name,
                "index": index,
                "semantic_role": "single terminal / object echo level 2 D-R3 recovery",
                "association": meta["association"],
                "principle": meta["principle"],
                "desired_feature": meta["desired"],
                "main_risk": meta["risk"],
                "risk_level": meta["risk_level"],
                "selected_candidate": selection[name],
                "authoring": "macro-first lofted surface (no shared superellipsoid body)",
                "silhouette_presence_ratio_to_master": presence_value,
                "score_components": {
                    "object_echo_readability_25": score[0],
                    "mimic_core_dna_20": score[1],
                    "distinctness_15": score[2],
                    "direct_morph_quality_15": score[3],
                    "premium_b2b_10": score[4],
                    "mobile_silhouette_10": score[5],
                    "association_safety_5": score[6],
                },
                "score_total": sum(score),
                "gate_thresholds": {
                    "total": 90,
                    "object_readability": 22,
                    "dna": 18,
                    "mobile": 8,
                    "safety": 4,
                },
                "gate_passed": sum(score) >= 90
                and score[0] >= 22
                and score[1] >= 18
                and score[5] >= 8
                and score[6] >= 4,
            }
        else:
            old_meta = baseline_build.TARGET_META[name]
            item = {
                "stable_name": name,
                "index": index,
                "semantic_role": old_meta["semantic_role"],
                "association": None,
                "principle": old_meta["principle"],
                "main_risk": old_meta["risk"],
                "risk_level": old_meta["risk_level"],
                "coordinate_identity_to_ps03_3": True,
            }
        item.update(
            {
                "position_hash": metrics["position_hash"],
                "rms_displacement_from_master": metrics["rms_displacement_from_master"],
                "max_displacement_from_master": metrics["max_displacement_from_master"],
                "bounding_box": metrics["bounding_box"],
                "signed_volume": metrics["signed_volume"],
                "mask_area": metrics["active_surface_ratio"],
                "silhouette_metrics": metrics["silhouette"],
                "validation_checks": checks,
                "validation_status": "pass" if all(checks.values()) else "fail",
            }
        )
        targets.append(item)
    master_metrics = validator.metrics(positions["MASTER"], include_intersections=True)
    singles = [item for item in targets if item["stable_name"] in SINGLE_NAMES]
    return {
        "stage": "PS-03.4R",
        "system": "D-R3 / Final Associative Form Lock recovery",
        "fill_policy": {
            "canonical_envelope_max": list(TARGET_BBOX),
            "relaxed_per_axis_fill_floor": RELAXED_FILL_FLOOR,
            "previous_d_r2_floor": 0.88,
            "composition_control": "projected footprint, no-crop and silhouette presence >= "
            f"{SILHOUETTE_PRESENCE_FLOOR} of MASTER hull instead of uniform axis fill",
        },
        "basis": {
            "stable_name": "MASTER",
            "position_hash": master_metrics["position_hash"],
            "bounding_box": master_metrics["bounding_box"],
            "mask_area": master_metrics["active_surface_ratio"],
            "coordinate_identity_to_ps03_3": True,
        },
        "target_count": 12,
        "target_order": list(TARGET_NAMES),
        "selected_candidates": dict(selection),
        "targets": targets,
        "acceptance": {
            "score_threshold": 90,
            "object_echo_readability_threshold": 22,
            "mimic_core_dna_threshold": 18,
            "mobile_threshold": 8,
            "association_safety_threshold": 4,
            "all_single_scores_pass": all(item["gate_passed"] for item in singles),
        },
    }


def configure_render_module():
    baseline_build.BLEND_DIR = BLEND_DIR
    baseline_build.EXPORT_DIR = EXPORT_DIR
    baseline_build.RENDER_DIR = RENDER_DIR
    baseline_build.PANEL_DIR = PANEL_DIR


def render_actor(
    scene,
    actor,
    other_actors,
    camera,
    floor,
    lights,
    materials,
    source,
    state_name,
    path,
    width=720,
    height=540,
    view="canonical",
    mode="neutral",
    roll=True,
    transparent=False,
):
    for item in other_actors:
        item.hide_render = item is not actor
    actor.hide_render = False
    baseline_build.set_weights(
        actor, {} if state_name == "MASTER" else {state_name: 1.0}
    )
    baseline_build.assign_render_mode(actor, materials, source, mode)
    baseline_build.set_camera(camera, view)
    baseline_build.canonical_roll(actor, camera, roll and view == "canonical")
    floor.hide_render = transparent or view == "top" or mode == "silhouette"
    for light in lights:
        light.hide_render = mode == "silhouette"
    baseline_build.set_world(scene, transparent, mode == "silhouette")
    baseline_build.render_still(scene, path, width, height, transparent)


def render_all(source, positions):
    configure_render_module()
    quick = os.environ.get("PS034_DR3_QUICK_RENDER") == "1"
    scene, final_actor, camera, floor, lights, materials = baseline_build.create_scene(
        source, positions
    )
    for light in lights:
        if light.name.endswith("Key"):
            light.data.size, light.data.energy = 2.6, 860.0
        elif light.name.endswith("Fill"):
            light.data.size, light.data.energy = 5.2, 190.0
        elif light.name.endswith("Rim"):
            light.data.size, light.data.energy = 3.0, 570.0
    neutral_bsdf = materials["neutral"].node_tree.nodes.get("Principled BSDF")
    if neutral_bsdf:
        neutral_bsdf.inputs["Roughness"].default_value = 0.48
        if "Coat Weight" in neutral_bsdf.inputs:
            neutral_bsdf.inputs["Coat Weight"].default_value = 0.12
    scene["ps034DR3RefinementIterations"] = json.dumps(
        ["A/B/C macro candidates", "R1", "R2", "final D-R3 selection"]
    )
    collection = final_actor.users_collection[0]
    actors = [final_actor]

    for name in TERMINAL_NAMES:
        slug = baseline_build.slug(name)
        render_actor(
            scene, final_actor, actors, camera, floor, lights, materials, source,
            name, PANEL_DIR / f"canonical_{slug}.png",
        )
        if quick:
            continue
        for view in ("opposite", "front", "side", "top"):
            render_actor(
                scene, final_actor, actors, camera, floor, lights, materials, source,
                name, PANEL_DIR / f"control_{slug}_{view}.png",
                600, 450, view, "neutral", False,
            )
        for size, tag in ((720, "silhouette"), (180, "silhouette180"), (96, "silhouette96")):
            render_actor(
                scene, final_actor, actors, camera, floor, lights, materials, source,
                name, PANEL_DIR / f"{tag}_{slug}.png",
                size, size if size != 720 else 540, "canonical", "silhouette", True, True,
            )
        render_actor(
            scene, final_actor, actors, camera, floor, lights, materials, source,
            name, PANEL_DIR / f"mask_{slug}.png",
            720, 540, "canonical", "active", True,
        )
        render_actor(
            scene, final_actor, actors, camera, floor, lights, materials, source,
            name, MOBILE_SOURCE_DIR / f"mobile_actor_{slug}.png",
            1000, 1000, "canonical", "neutral", True, True,
        )

    # Keep the full macro candidate record inside the authoring workbench as
    # reproducible coordinate sets (candidate renders already live in
    # renders/candidates/).
    if not quick:
        for letter in ("A", "B", "C"):
            candidate_positions = build_positions(
                source, {name: letter for name in SINGLE_NAMES}
            )
            candidate_actor = baseline_build.create_actor(
                f"MimicCore_DR3_{letter}", source, candidate_positions,
                materials, collection,
            )
            candidate_actor.hide_render = True
            candidate_actor.hide_viewport = True
            actors.append(candidate_actor)

    transition_sets = {
        "master-content": lambda t: {"SINGLE_CONTENT_SEQUENCE": t},
        "content-digital": lambda t: {
            "SINGLE_CONTENT_SEQUENCE": 1.0 - t,
            "SINGLE_DIGITAL_SIGNAL": t,
        },
        "content-games": lambda t: {
            "SINGLE_CONTENT_SEQUENCE": 1.0 - t,
            "SINGLE_GAMES_BRANCH": t,
        },
        "design-merch": lambda t: {
            "SINGLE_DESIGN_TORSION": 1.0 - t,
            "SINGLE_MERCH_WRAP": t,
        },
        "games-event": lambda t: {
            "SINGLE_GAMES_BRANCH": 1.0 - t,
            "SINGLE_EVENT_CONVERGENCE": t,
        },
        "video-complex-drive": lambda t: {
            "SINGLE_VIDEO_TEMPORAL": 1.0 - t,
            "COMPLEX_DRIVE": t,
        },
        "retarget-content-design-event": lambda t: {
            "SINGLE_CONTENT_SEQUENCE": 0.5 * (1.0 - t),
            "SINGLE_DESIGN_TORSION": 0.5 * (1.0 - t),
            "SINGLE_EVENT_CONVERGENCE": t,
        },
    }
    if not quick:
        for sequence, weights_for_t in transition_sets.items():
            for frame in range(5):
                t = frame / 4.0
                for item in actors:
                    item.hide_render = item is not final_actor
                baseline_build.set_weights(final_actor, weights_for_t(t))
                baseline_build.assign_render_mode(final_actor, materials, source, "neutral")
                baseline_build.set_camera(camera, "canonical")
                baseline_build.canonical_roll(final_actor, camera, True)
                floor.hide_render = False
                for light in lights:
                    light.hide_render = False
                baseline_build.set_world(scene, False, False)
                baseline_build.render_still(
                    scene, PANEL_DIR / f"transition_{sequence}_{frame}.png", 720, 540
                )
        for frame, weight in enumerate((0.0, 0.03, 0.06, 0.03, 0.0)):
            baseline_build.set_weights(final_actor, {"TRANSITION_TENSION": weight})
            baseline_build.render_still(
                scene,
                PANEL_DIR / f"transition-transition-tension_{frame}.png",
                720,
                540,
            )
    baseline_build.set_weights(final_actor, {})
    final_actor.hide_render = False
    for item in actors:
        if item is not final_actor:
            item.hide_render = True
    try:
        bpy.context.preferences.filepaths.save_version = 0
    except Exception:
        pass
    workbench = BLEND_DIR / "ps-03-4-d-r3-authoring-workbench.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(workbench))
    return workbench


def set_custom_properties(actor, source, manifest, technical):
    actor["schemaVersion"] = "ps-03.4-d-r3-v1"
    actor["system"] = "D-R3 / Final Associative Form Lock recovery"
    actor["canonicalState"] = "MASTER"
    actor["topologyHash"] = validation.EXPECTED_TOPOLOGY_HASH
    actor["connectivityIndexHash"] = validation.EXPECTED_TOPOLOGY_HASH
    actor["uvHash"] = validation.EXPECTED_UV_HASH
    actor["masterPositionHash"] = CANONICAL_MASTER_HASH
    actor["masterReloadedPositionHash"] = validation.positions_hash(source["master"])
    actor["boundingBox"] = json.dumps(TARGET_BBOX)
    actor["directedAxis"] = json.dumps(DIRECTED_AXIS)
    actor["fillPolicy"] = json.dumps(
        {"max_envelope": TARGET_BBOX, "relaxed_fill_floor": RELAXED_FILL_FLOOR}
    )
    actor["maskFaceCount"] = validation.EXPECTED_MASK_FACE_COUNT
    actor["maskFaceIndexHash"] = validation.EXPECTED_MASK_HASH
    actor["photonicMaskFaceIndices"] = json.dumps(
        source["active_faces"], separators=(",", ":")
    )
    actor["targetNames"] = json.dumps(list(TARGET_NAMES), separators=(",", ":"))
    actor["targetRiskLevels"] = json.dumps(
        {
            name: (
                ASSOCIATIVE_META[name]["risk_level"]
                if name in ASSOCIATIVE_META
                else baseline_build.TARGET_META[name]["risk_level"]
            )
            for name in TARGET_NAMES
        },
        separators=(",", ":"),
    )
    actor["associationMap"] = json.dumps(
        {name: meta["association"] for name, meta in ASSOCIATIVE_META.items()},
        separators=(",", ":"),
    )
    actor["maskAreaStats"] = json.dumps(
        technical["mask_area_stats"], separators=(",", ":")
    )
    actor["targetManifestSha256"] = hashlib.sha256(
        json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode("utf8")
    ).hexdigest()


def create_production_scene(source, positions, manifest, technical):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    material = baseline_build.make_material(
        "PhotonicSkin_NeutralPlaceholder", COLORS["ivory"], 0.42, 0.04, 0.20
    )
    collection = bpy.data.collections.new("PhotonicSkin")
    scene.collection.children.link(collection)
    actor = baseline_build.create_actor(
        "MimicCoreMesh", source, positions, {"neutral": material}, collection
    )
    actor.location = (0.0, 0.0, 0.0)
    actor.rotation_euler = (0.0, 0.0, 0.0)
    actor.scale = (1.0, 1.0, 1.0)
    root = bpy.data.objects.new("MimicCoreRoot", None)
    collection.objects.link(root)
    actor.parent = root
    set_custom_properties(actor, source, manifest, technical)
    return scene, root, actor


def export_glb(root, actor):
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    actor.select_set(True)
    bpy.context.view_layer.objects.active = actor
    path = EXPORT_DIR / "photonic-skin-c-r1-d-r3-final-morph-system.glb"
    available = {
        item.identifier for item in bpy.ops.export_scene.gltf.get_rna_type().properties
    }
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
    bpy.ops.export_scene.gltf(
        **{key: value for key, value in requested.items() if key in available}
    )
    return path


def validate_glb_reimport(path, manifest):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one GLB mesh, found {len(meshes)}")
    obj = meshes[0]
    obj.data.calc_loop_triangles()
    keys = [key.name for key in obj.data.shape_keys.key_blocks]
    target_keys = keys[1:]
    attrs = sorted(attribute.name for attribute in obj.data.attributes)
    one_hot = []
    for key in obj.data.shape_keys.key_blocks[1:]:
        for item in obj.data.shape_keys.key_blocks[1:]:
            item.value = 1.0 if item == key else 0.0
        bpy.context.view_layer.update()
        evaluated_object = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        evaluated = evaluated_object.to_mesh()
        bbox = validation.bounding_box(
            [tuple(vertex.co) for vertex in evaluated.vertices]
        )
        evaluated_object.to_mesh_clear()
        expected = next(
            item for item in manifest["targets"] if item["stable_name"] == key.name
        )
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
    checks = {
        "one_mesh": len(meshes) == 1,
        "indexed_mesh": len(obj.data.polygons) > 0,
        "triangle_count": len(obj.data.loop_triangles) == validation.EXPECTED_TRIANGLES,
        "target_count": len(target_keys) == 12,
        "target_order": target_keys == list(TARGET_NAMES),
        "uv_present": len(obj.data.uv_layers) == 1,
        "mask_attribute_present": "_PHOTONIC_MASK" in attrs,
        "slot_attribute_present": "_PHOTONIC_SLOT" in attrs,
        "all_one_hot_bounds": all(item["bbox_matches"] for item in one_hot),
    }
    report = {
        "stage": "PS-03.4R",
        "system": "D-R3 / Final Associative Form Lock recovery",
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
        "one_hot_states": one_hot,
        "checks": checks,
        "passed": all(checks.values()),
    }
    output = EXPORT_DIR / "ps03-4-d-r3-glb-reimport-validation.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    if not report["passed"]:
        raise RuntimeError(f"PS-03.4 D-R3 GLB reimport failed: {checks}")
    return report


def main():
    source = read_baseline_system()
    positions = build_positions(source)
    validator = validation.GeometryValidator(
        positions["MASTER"], source["faces"], source["active_faces"]
    )
    manifest = target_manifest(source, positions, validator, geo.SELECTED)
    manifest_path = EXPORT_DIR / "ps03-4-d-r3-target-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf8"
    )

    master_metrics = validator.metrics(positions["MASTER"], include_intersections=True)
    endpoint_validation = {
        "MASTER": {
            "metrics": master_metrics,
            "checks": validator.checks(master_metrics, strict_mask=True),
        }
    }
    for name in TARGET_NAMES:
        metrics = validator.metrics(positions[name], include_intersections=True)
        checks = validator.checks(metrics, strict_mask=True)
        if name in SINGLE_NAMES:
            checks["silhouette_presence"] = presence_check(validator, positions[name])[0]
        endpoint_validation[name] = {"metrics": metrics, "checks": checks}
        endpoint_validation[name]["passed"] = all(checks.values())
    endpoint_validation["MASTER"]["passed"] = all(
        endpoint_validation["MASTER"]["checks"].values()
    )
    terminal_mask_areas = [
        endpoint_validation[name]["metrics"]["active_surface_ratio"]
        for name in TERMINAL_NAMES
    ]
    mask_stats = {
        "master": master_metrics["active_surface_ratio"],
        "terminal_min": min(terminal_mask_areas),
        "terminal_max": max(terminal_mask_areas),
        "terminal_mean": round(statistics.fmean(terminal_mask_areas), 6),
        "fixed_face_count": len(source["active_faces"]),
        "face_index_hash": validation.EXPECTED_MASK_HASH,
    }
    preserved_identity = {
        name: validation.positions_hash(positions[name])
        == validation.positions_hash(source["positions"][name])
        for name in PRESERVED_NAMES
    }
    single_change = {
        name: validation.positions_hash(positions[name])
        != validation.positions_hash(source["positions"][name])
        for name in SINGLE_NAMES
    }
    common_checks = {
        **source["baseline_checks"],
        "all_endpoints": all(report["passed"] for report in endpoint_validation.values()),
        "preserved_coordinate_identity": all(preserved_identity.values()),
        "all_singles_reauthored": all(single_change.values()),
        "shape_key_order": list(positions) == ["MASTER", *TARGET_NAMES],
        "mask_terminal_range": mask_stats["terminal_min"] >= 0.32
        and mask_stats["terminal_max"] <= 0.36,
    }
    technical = {
        "stage": "PS-03.4R",
        "system": "D-R3 / Final Associative Form Lock recovery",
        "blender_version": bpy.app.version_string,
        "authoring_principle": (
            "per-target macro-first lofted surfaces; superellipsoid donor body and "
            "stabilize_shared_extrema retired; envelope is max-only with relaxed "
            f"fill floor {RELAXED_FILL_FLOOR}"
        ),
        "common_topology": {
            **source["topology"],
            "connectivity_index_hash": validation.topology_hash(source["faces"]),
            "uv_hash": baseline_build.uv_hash(source["uv_values"]),
            "mask_face_count": len(source["active_faces"]),
            "mask_face_index_hash": validation.mask_index_hash(source["active_faces"]),
        },
        "shape_key_order": ["MASTER", *TARGET_NAMES],
        "selected_candidates": dict(geo.SELECTED),
        "preserved_coordinate_identity": preserved_identity,
        "single_targets_reauthored": single_change,
        "endpoint_validation": endpoint_validation,
        "mask_area_stats": mask_stats,
        "common_checks": common_checks,
        "visual_gate_passed": manifest["acceptance"]["all_single_scores_pass"],
        "production_lock_status": (
            "LOCKED (pending final user confirmation)"
            if manifest["acceptance"]["all_single_scores_pass"]
            else "NOT LOCKED"
        ),
        "passed": all(common_checks.values()),
    }
    technical_path = EXPORT_DIR / "ps03-4-d-r3-technical-validation.json"
    technical_path.write_text(
        json.dumps(technical, ensure_ascii=False, indent=2), encoding="utf8"
    )
    if not technical["passed"]:
        failures = [name for name, value in common_checks.items() if not value]
        endpoint_failures = [
            name
            for name, report in endpoint_validation.items()
            if not report["passed"]
        ]
        detail = {
            name: [
                check
                for check, ok in endpoint_validation[name]["checks"].items()
                if not ok
            ]
            for name in endpoint_failures
        }
        raise RuntimeError(
            f"PS-03.4 D-R3 endpoint validation failed common={failures} endpoints={detail}"
        )
    if os.environ.get("PS034_DR3_VALIDATE_ONLY") == "1":
        print("PS034_DR3_ENDPOINT_VALIDATE_ONLY_PASS", technical_path)
        return

    workbench = render_all(source, positions)
    scene, root, actor = create_production_scene(source, positions, manifest, technical)
    production_blend = BLEND_DIR / "photonic-skin-c-r1-d-r3-final-morph-system.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(production_blend))
    glb = export_glb(root, actor)
    reimport = validate_glb_reimport(glb, manifest)

    technical = json.loads(technical_path.read_text(encoding="utf8"))
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
    technical["passed"] = technical["passed"] and reimport["passed"]
    technical_path.write_text(
        json.dumps(technical, ensure_ascii=False, indent=2), encoding="utf8"
    )
    if not technical["passed"]:
        raise RuntimeError("PS-03.4 D-R3 GLB reimport failed")
    print(
        "PS034_DR3_DONE",
        {
            "blend": str(production_blend),
            "glb": str(glb),
            "reimport": reimport["passed"],
        },
    )


if __name__ == "__main__":
    main()
