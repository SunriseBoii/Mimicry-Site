"""Inventory frozen states that contain Video. Does not mutate canonical buffers."""

from __future__ import annotations

import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
PHOTONIC_DIR = STAGE_DIR.parent
REPO_DIR = PHOTONIC_DIR.parents[1]
M31R_MANIFEST = PHOTONIC_DIR / "ps-03-m3-1r" / "exports" / "ps03m31r-manifest.json"
M41_MANIFEST = PHOTONIC_DIR / "ps-03-m4-1" / "exports" / "ps03m41-manifest.json"
MAPPING = PHOTONIC_DIR / "ps-03-m3-1r" / "exports" / "ps03m31r-state-mapping.json"


def risk_level(state: dict, video_active: int) -> str:
    role = state.get("stateRole")
    mode = state.get("compositionMode")
    if state["stateId"] == "single-video":
        return "high"
    if video_active <= 0:
        return "low"
    if role == "master":
        return "medium"
    if role == "brand_wide":
        return "medium"
    if mode == "FOCUS" and state.get("focusCompetencyId") == "video":
        return "high"
    return "medium"


def future_update(state: dict) -> str:
    if state["stateId"] == "single-video":
        return "Replace SINGLE Video endpoint buffer after human variant choice, then recompile M4.1 programs that use single-video."
    if state.get("compositionMode") == "MASTER":
        return "Do not replace MASTER wholesale. Re-run M3.1R Video-component patch inside the 154-state builder after selection."
    if state.get("stateRole") == "brand_wide":
        return "Recompile brand-wide Video-owned IDs via the existing M3.1R Video rigid group; keep non-Video components byte-identical."
    return (
        "Recompile Video-owned components in this COMPLEX/task-family state via the M3.1R builder; "
        "preserve non-Video IDs; then regenerate only dependent M4.1 transition programs."
    )


def main() -> int:
    m31r = json.loads(M31R_MANIFEST.read_text(encoding="utf-8"))
    m41 = json.loads(M41_MANIFEST.read_text(encoding="utf-8"))
    mapping = json.loads(MAPPING.read_text(encoding="utf-8"))
    transitions: dict[str, list[str]] = {}
    for program in m41.get("programs", []):
        source = program.get("sourceStateId")
        target = program.get("targetStateId")
        if source and target:
            transitions.setdefault(source, [])
            transitions.setdefault(target, [])
            if target not in transitions[source]:
                transitions[source].append(target)
            if source not in transitions[target]:
                transitions[target].append(source)

    states = []
    for entry in m31r["states"]:
        video_components = [
            {
                "componentId": item["componentId"],
                "componentIndex": int(item["componentIndex"]),
                "visibleProfiles": list(item.get("visibleProfiles", [])),
            }
            for item in entry.get("componentMap", [])
            if item.get("competencyId") == "video"
        ]
        video_present = "video" in entry.get("competencyIds", []) or bool(video_components)
        quotas = entry.get("machineQa", {}).get("componentQuotas", {})
        video_owned = 0
        for item in video_components:
            video_owned += int(quotas.get(str(item["componentIndex"]), 0))
        row = {
            "stateId": entry["stateId"],
            "stateKind": entry.get("compositionMode") or entry.get("stateRole"),
            "stateRole": entry.get("stateRole"),
            "compositionMode": entry.get("compositionMode"),
            "videoMembership": {
                "present": video_present,
                "asSingle": entry["stateId"] == "single-video",
                "asMasterComponent": entry.get("stateRole") == "master" and video_present,
                "asBrandWideComponent": entry.get("stateRole") == "brand_wide" and video_present,
                "asComplexComponent": entry.get("stateRole") == "complex" and video_present,
                "focusCompetencyId": entry.get("focusCompetencyId"),
                "shellOrReserve": entry.get("stateRole") != "single" and video_present,
            },
            "videoOwnedIds": {
                "resolution": "componentMap competencyId=video plus machineQa.componentQuotas by componentIndex",
                "componentIndices": [item["componentIndex"] for item in video_components],
                "componentIds": [item["componentId"] for item in video_components],
                "visibleProfiles": {item["componentId"]: item["visibleProfiles"] for item in video_components},
                "activeOwnedCount": video_owned,
            },
            "activeCount": entry.get("machineQa", {}).get("activeCount"),
            "reserveCount": entry.get("machineQa", {}).get("reserveCount"),
            "subsurfaceCount": entry.get("machineQa", {}).get("subsurfaceCount"),
            "transitionDependencies": sorted(transitions.get(entry["stateId"], [])),
            "futureUpdatePath": future_update(entry) if video_present else "No Video geometry; leave frozen.",
            "m53Action": "inventory-only; do not regenerate this canonical state on M5.3",
            "riskLevel": risk_level(entry, video_owned) if video_present else "none",
        }
        states.append(row)

    video_states = [row for row in states if row["videoMembership"]["present"]]
    payload = {
        "stage": "PS-04.M5.3",
        "canonicalLibrary": "PS-03.M3.1R",
        "stateCount": len(states),
        "videoContainingStateCount": len(video_states),
        "canonicalAggregateUntouched": True,
        "variantsNotPromoted": True,
        "frozenSingleVideoUntouched": True,
        "membershipKinds": {
            "SINGLE": sum(1 for row in video_states if row["videoMembership"]["asSingle"]),
            "MASTER": sum(1 for row in video_states if row["videoMembership"]["asMasterComponent"]),
            "BRAND_WIDE": sum(1 for row in video_states if row["videoMembership"]["asBrandWideComponent"]),
            "COMPLEX": sum(1 for row in video_states if row["videoMembership"]["asComplexComponent"]),
        },
        "states": [row for row in states if row["videoMembership"]["present"]],
        "videoStateIds": [row["stateId"] for row in video_states],
    }
    dest = STAGE_DIR / "reports" / "video-state-impact.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "wrote": str(dest.relative_to(REPO_DIR)).replace("\\", "/"),
        "videoContaining": len(video_states),
        "total": len(states),
        "mappingLoaded": MAPPING.exists(),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
