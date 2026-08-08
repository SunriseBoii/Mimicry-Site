"""Full Blender-native transition validation for PS-03.3.

The proven PS-03.2 validators are reused as the technical baseline.  This
wrapper changes only the production input/output paths, the stage metadata and
the mandatory associative risk-pair set required by the PS-03.3 brief.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import bpy


SCRIPT_PATH = Path(__file__).resolve()
STAGE_DIR = SCRIPT_PATH.parent.parent
REPO_DIR = STAGE_DIR.parents[2]
BASE_VALIDATOR = (
    REPO_DIR / "design" / "photonic-skin" / "ps-03-2" / "scripts" / "validate_ps03_2.py"
)
BLEND_PATH = (
    STAGE_DIR / "blender" / "photonic-skin-c-r1-associative-morph-system.blend"
)
EXPORT_DIR = STAGE_DIR / "exports"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


validation = load_module("ps032_validation_for_ps033_full", BASE_VALIDATOR)
validation.MANDATORY_EXPANDED_PAIRS = {
    frozenset(("SINGLE_CONTENT_SEQUENCE", "SINGLE_DIGITAL_SIGNAL")),
    frozenset(("SINGLE_CONTENT_SEQUENCE", "SINGLE_GAMES_BRANCH")),
    frozenset(("SINGLE_DESIGN_TORSION", "SINGLE_MERCH_WRAP")),
    frozenset(("SINGLE_EVENT_CONVERGENCE", "SINGLE_GAMES_BRANCH")),
    frozenset(("SINGLE_EVENT_CONVERGENCE", "COMPLEX_GATHER")),
    frozenset(("SINGLE_VIDEO_TEMPORAL", "COMPLEX_DRIVE")),
    frozenset(("SINGLE_DIGITAL_SIGNAL", "COMPLEX_FOCUS")),
    frozenset(("BRAND_WIDE", "SINGLE_MERCH_WRAP")),
}


def restage(path: Path, additions: dict) -> dict:
    report = json.loads(path.read_text(encoding="utf8"))
    report["stage"] = "PS-03.3"
    report["system"] = "D / Controlled Associative Hierarchy"
    report.update(additions)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    return report


def main():
    if not BLEND_PATH.exists():
        raise FileNotFoundError(BLEND_PATH)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(BLEND_PATH))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one production actor mesh, found {len(meshes)}")
    actor = meshes[0]
    faces = [tuple(poly.vertices) for poly in actor.data.polygons]
    active_faces = json.loads(actor.get("photonicMaskFaceIndices", "[]"))
    positions = validation.extract_positions_from_shape_keys(actor)
    required = validation.TERMINAL_NAMES + ("TRANSITION_TENSION",)
    missing = [name for name in required if name not in positions]
    if missing:
        raise RuntimeError(f"Missing shape keys: {missing}")

    validator = validation.GeometryValidator(positions["MASTER"], faces, active_faces)
    risk_levels = json.loads(actor.get("targetRiskLevels", "{}"))
    pair_path = EXPORT_DIR / "ps03-3-pairwise-validation.json"
    retarget_path = EXPORT_DIR / "ps03-3-retarget-validation.json"
    additive_path = EXPORT_DIR / "ps03-3-additive-validation.json"

    pairwise = validation.validate_pairwise(positions, validator, risk_levels, pair_path)
    pairwise = restage(
        pair_path,
        {
            "interpolation_contract": "direct endpoint-to-endpoint; no return through MASTER",
            "mandatory_associative_pairs": [
                sorted(list(pair)) for pair in sorted(
                    validation.MANDATORY_EXPANDED_PAIRS, key=lambda item: sorted(item)
                )
            ],
            "visual_risk_gate": "storyboards reviewed for mouths, eyes, horns, arrows, organs and accidental objects",
        },
    )
    retarget = validation.validate_retarget(positions, validator, retarget_path)
    retarget = restage(
        retarget_path,
        {"runtime_contract": "retain current endpoint mixture at switch; blend snapshot directly to destination"},
    )
    additive = validation.validate_additive(positions, validator, additive_path)
    additive = restage(
        additive_path,
        {
            "transition_target_coordinate_identity": "unchanged from PS-03.2",
            "runtime_state_count": 24,
            "full_combination_count": 72,
        },
    )

    passed = pairwise["passed"] and retarget["passed"] and additive["passed"]
    print(
        "PS033_VALIDATION",
        {
            "pairwise": pairwise["passed"],
            "pairs": pairwise["pair_count"],
            "expanded": pairwise["expanded_pair_count"],
            "retarget": retarget["passed"],
            "additive": additive["passed"],
        },
    )
    if not passed:
        raise RuntimeError("PS-03.3 transition validation failed")


if __name__ == "__main__":
    main()
