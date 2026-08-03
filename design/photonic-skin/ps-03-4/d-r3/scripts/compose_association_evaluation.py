"""Compose ps03-4-d-r3-association-evaluation.json from the target manifest.

The verdict fields record the honest internal visual-gate review performed on
the rendered candidate sheets and final boards; the numeric fields come from
the generated manifest so the file is reproducible.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "exports" / "ps03-4-d-r3-target-manifest.json"
OUTPUT = ROOT / "exports" / "ps03-4-d-r3-association-evaluation.json"

FIRST_IMPRESSIONS = {
    "SINGLE_CONTENT_SEQUENCE": "open editorial spread: two page fields at different opening angles around a central hinge valley",
    "SINGLE_DESIGN_TORSION": "low working slab with an asymmetric side bite and one lifted forming corner",
    "SINGLE_EVENT_CONVERGENCE": "wide low sheltering roof with one clearly offset apex and eave flares",
    "SINGLE_GAMES_BRANCH": "flat decision board: entry stem into a fan whose leading edge splits into three route fingers",
    "SINGLE_VIDEO_TEMPORAL": "tilted curved screen plate with one temporal sweep edge, depth far smaller than width",
    "SINGLE_DIGITAL_SIGNAL": "directed routing substrate with a blunt input and a deep macro Y-fork convergence",
    "SINGLE_MERCH_WRAP": "compact blocky parcel with four unequal corners held by one diagonal wrap overlap",
}

ELIMINATED_ASSOCIATIONS = {
    "SINGLE_CONTENT_SEQUENCE": "no longer a capsule/pillow; hinge valley and unequal page angles survive 96 px",
    "SINGLE_DESIGN_TORSION": "not a bowl/spoon/leaf; the side bite lives in the outer silhouette",
    "SINGLE_EVENT_CONVERGENCE": "no longer a sail/dune/leaf; planar tent faces and offset apex read as roof",
    "SINGLE_GAMES_BRANCH": "no longer a leaf/oblong mass; the three routes carve the outer contour",
    "SINGLE_VIDEO_TEMPORAL": "not a capsule/soap bar; the screen face dominates the canonical view",
    "SINGLE_DIGITAL_SIGNAL": "no longer a fish/beak; blunt parallel branches with convergence notch",
    "SINGLE_MERCH_WRAP": "not a stone/capsule; blocky corner zones plus wrap overlap read as parcel",
}


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    singles = [
        t for t in manifest["targets"] if t["stable_name"].startswith("SINGLE_")
    ]
    targets = {}
    for entry in singles:
        name = entry["stable_name"]
        targets[name] = {
            "association": entry["association"],
            "selected_candidate": entry["selected_candidate"],
            "principle": entry["principle"],
            "main_risk": entry["main_risk"],
            "risk_level": entry["risk_level"],
            "first_impression_neutral_render": FIRST_IMPRESSIONS[name],
            "eliminated_wrong_associations": ELIMINATED_ASSOCIATIONS[name],
            "score_components": entry["score_components"],
            "score_total": entry["score_total"],
            "gate_passed": entry["gate_passed"],
        }
    report = {
        "stage": "PS-03.4R",
        "system": "D-R3 / Final Associative Form Lock recovery",
        "direction": "D only",
        "candidate_state_count": 29,
        "candidate_variants_per_single": "3 base each (21) + refinement variants: EVENT R1-R3, GAMES R1-R3, DIGITAL R1-R2",
        "refinement_cycles": 5,
        "authoring_change": "shared superellipsoid_point donor body and stabilize_shared_extrema retired; each SINGLE is an independent macro-first lofted surface with target-specific plan, cross-section and height field; uniform >=0.88 per-axis fill normalization replaced by relaxed floor 0.22 with silhouette-presence control",
        "gate_thresholds": {
            "total_100": 90,
            "object_readability_25": 22,
            "mimic_core_dna_20": 18,
            "mobile_96px_10": 8,
            "association_safety_5": 4,
        },
        "unlabelled_gate": {
            "board": "renders/ps03-4_d-r3_unlabelled_lock_board.png",
            "answer_key": "renders/ps03-4_d-r3_answer_key_board.png",
            "verdict": "PASSED (internal)",
            "reason": "all seven SINGLE states expose distinct macro-grammar in neutral canonical render, top/side risk view and 96 px silhouette; author-run review is not fully blind, final user confirmation required",
            "reviewer_caveat": "the author knows the target mapping; this internal gate cannot count as a blind test",
        },
        "targets": targets,
        "content_digital_games_distinction": {
            "geometry": "CONTENT opens as a hinged two-field folio; DIGITAL narrows into one blunt input with a macro Y-fork; GAMES fans from one entry stem into a flat board with three notch-separated route fingers",
            "unlabelled_96px": "three different macro-grammars: hinged fields vs forked substrate vs notched fan board; closest residual pair GAMES/DIGITAL separates via fan-vs-fork plan",
            "passed": True,
        },
        "production_status": "LOCKED (pending final user confirmation)",
        "passed": True,
    }
    OUTPUT.write_text(json.dumps(report, indent=2), encoding="utf8")
    print("PS034_DR3_ASSOCIATION_EVALUATION", OUTPUT)


if __name__ == "__main__":
    main()
