"""Level-A visual macro gate renders for the D-R3 SINGLE candidates.

Runs inside Blender:

    blender -b --python render_candidates_dr3.py [-- TARGET ...]

For every candidate (7 targets x 3 macro passes) this renders the full
Level-A set with the exact PS-03.2/PS-03.4 neutral studio rig: canonical 3/4,
opposite 3/4, side, top, plus black silhouettes at 180 px and 96 px.
Everything goes to d-r3/renders/candidates/.  PS-03.3 and the D-R2 tree are
read-only inputs.
"""

from __future__ import annotations

import importlib.util
import json
import statistics
import sys
from pathlib import Path

import bpy


SCRIPT_PATH = Path(__file__).resolve()
SCRIPT_DIR = SCRIPT_PATH.parent
D_R3_DIR = SCRIPT_DIR.parent
PS034_DIR = D_R3_DIR.parent
REPO_DIR = PS034_DIR.parents[2]
PS032_SCRIPTS = REPO_DIR / "design" / "photonic-skin" / "ps-03-2" / "scripts"
CANDIDATE_DIR = D_R3_DIR / "renders" / "candidates"
CANDIDATE_DIR.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(SCRIPT_DIR))


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


validation = load_module("ps032_validation_for_dr3r", PS032_SCRIPTS / "validate_ps03_2.py")
baseline_build = load_module("ps032_build_for_dr3r", PS032_SCRIPTS / "build_ps03_2.py")
dr3_baseline = load_module("dr3_baseline_for_render", SCRIPT_DIR / "dr3_baseline.py")

import dr3_geometry as geo  # noqa: E402


def studio_lights(lights):
    for light in lights:
        if light.name.endswith("Key"):
            light.data.size, light.data.energy = 2.6, 860.0
        elif light.name.endswith("Fill"):
            light.data.size, light.data.energy = 5.2, 190.0
        elif light.name.endswith("Rim"):
            light.data.size, light.data.energy = 3.0, 570.0


def render_state(scene, actor, camera, floor, lights, materials, source,
                 state_name, path, width, height, view, mode, transparent):
    baseline_build.set_weights(actor, {} if state_name == "MASTER" else {state_name: 1.0})
    baseline_build.assign_render_mode(actor, materials, source, mode)
    baseline_build.set_camera(camera, view)
    baseline_build.canonical_roll(actor, camera, view == "canonical")
    floor.hide_render = transparent or view == "top" or mode == "silhouette"
    for light in lights:
        light.hide_render = mode == "silhouette"
    baseline_build.set_world(scene, transparent, mode == "silhouette")
    baseline_build.render_still(scene, path, width, height, transparent)


def main():
    argv = sys.argv
    wanted = argv[argv.index("--") + 1:] if "--" in argv else []
    targets = [n for n in geo.SINGLE_NAMES if not wanted or n in wanted]

    raw = dr3_baseline.read_baseline()
    active_slots = {}
    for face_index in raw["active_faces"]:
        values = [raw["point_slot"][i] for i in raw["faces"][face_index]]
        active_slots[face_index] = max(1, min(3, int(round(statistics.fmean(values)))))
    source = dict(raw, active_slots=active_slots)
    tension_delta = [
        (t[0] - m[0], t[1] - m[1], t[2] - m[2])
        for m, t in zip(raw["master"], raw["positions"]["TRANSITION_TENSION"])
    ]
    parameters = geo.topology_parameters()

    positions_by_name = {
        name: raw["positions"][name] for name in validation.TARGET_NAMES
    }
    scene, actor, camera, floor, lights, materials = baseline_build.create_scene(
        source, positions_by_name
    )
    studio_lights(lights)
    neutral_bsdf = materials["neutral"].node_tree.nodes.get("Principled BSDF")
    if neutral_bsdf:
        neutral_bsdf.inputs["Roughness"].default_value = 0.48
        if "Coat Weight" in neutral_bsdf.inputs:
            neutral_bsdf.inputs["Coat Weight"].default_value = 0.12

    rendered = []
    for name in targets:
        key = actor.data.shape_keys.key_blocks[name]
        for variant in sorted(geo.variants(name)):
            positions = geo.build_single(name, variant, parameters, tension_delta)
            for destination, value in zip(key.data, positions):
                destination.co = value
            slug = baseline_build.slug(name)
            stem = f"{slug}_{variant}"
            views = (
                ("canonical", "neutral", 720, 540, False),
                ("opposite", "neutral", 600, 450, False),
                ("side", "neutral", 600, 450, False),
                ("top", "neutral", 600, 450, False),
            )
            for view, mode, width, height, transparent in views:
                render_state(
                    scene, actor, camera, floor, lights, materials, source,
                    name, CANDIDATE_DIR / f"{stem}_{view}.png",
                    width, height, view, mode, transparent,
                )
            for size in (180, 96):
                render_state(
                    scene, actor, camera, floor, lights, materials, source,
                    name, CANDIDATE_DIR / f"{stem}_sil{size}.png",
                    size, size, "canonical", "silhouette", True,
                )
            rendered.append(stem)
            print("PS034_DR3_CANDIDATE_RENDERED", stem)

    print("PS034_DR3_RENDER_DONE", json.dumps(rendered))


if __name__ == "__main__":
    main()
