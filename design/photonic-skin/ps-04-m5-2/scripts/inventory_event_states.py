"""Inventory frozen states that contain Event. Does not mutate canonical buffers."""

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


def risk_level(state: dict, event_active: int) -> str:
    role = state.get("stateRole")
    mode = state.get("compositionMode")
    if state["stateId"] == "single-event":
        return "high"
    if event_active <= 0:
        return "low"
    if role == "master":
        return "medium"
    if role == "brand_wide":
        return "medium"
    if mode == "FOCUS" and state.get("focusCompetencyId") == "event":
        return "high"
    if mode in {"FOCUS", "GATHER", "DRIVE"}:
        return "medium"
    return "medium"


def future_update(state: dict) -> str:
    if state["stateId"] == "single-event":
        return "Replace SINGLE Event endpoint buffer after human variant choice, then recompile M4.1 programs that use single-event."
    if state.get("compositionMode") == "MASTER":
        return "Do not replace MASTER wholesale. Re-run M3.1R Event-component patch inside the 154-state builder after selection."
    if state.get("stateRole") == "brand_wide":
        return "Recompile brand-wide Event-owned IDs via the existing M3.1R Event rigid group; keep non-Event components byte-identical."
    return (
        "Recompile Event-owned components in this COMPLEX/task-family state via the M3.1R builder; "
        "preserve non-Event IDs; then regenerate only dependent M4.1 transition programs."
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
        event_components = [
            {
                "componentId": item["componentId"],
                "componentIndex": int(item["componentIndex"]),
                "visibleProfiles": list(item.get("visibleProfiles", [])),
            }
            for item in entry.get("componentMap", [])
            if item.get("competencyId") == "event"
        ]
        event_present = "event" in entry.get("competencyIds", []) or bool(event_components)
        quotas = entry.get("machineQa", {}).get("componentQuotas", {})
        event_owned = 0
        for item in event_components:
            event_owned += int(quotas.get(str(item["componentIndex"]), 0))
        row = {
            "stateId": entry["stateId"],
            "stateKind": entry.get("compositionMode") or entry.get("stateRole"),
            "stateRole": entry.get("stateRole"),
            "compositionMode": entry.get("compositionMode"),
            "eventMembership": {
                "present": event_present,
                "asSingle": entry["stateId"] == "single-event",
                "asMasterComponent": entry.get("stateRole") == "master" and event_present,
                "asBrandWideComponent": entry.get("stateRole") == "brand_wide" and event_present,
                "asComplexComponent": entry.get("stateRole") == "complex" and event_present,
                "focusCompetencyId": entry.get("focusCompetencyId"),
                "shellOrReserve": entry.get("stateRole") != "single" and event_present,
            },
            "eventOwnedIds": {
                "resolution": "componentMap competencyId=event plus machineQa.componentQuotas by componentIndex; IDs remain 0…16383 stratified, not contiguous Event blocks",
                "componentIndices": [item["componentIndex"] for item in event_components],
                "componentIds": [item["componentId"] for item in event_components],
                "activeOwnedCount": event_owned,
            },
            "activeCount": entry.get("machineQa", {}).get("activeCount"),
            "reserveCount": entry.get("machineQa", {}).get("reserveCount"),
            "subsurfaceCount": entry.get("machineQa", {}).get("subsurfaceCount"),
            "transitionDependencies": sorted(transitions.get(entry["stateId"], [])),
            "futureUpdatePath": future_update(entry) if event_present else "No Event geometry; leave frozen.",
            "m52Action": "inventory-only; do not regenerate this canonical state on M5.2",
            "riskLevel": risk_level(entry, event_owned) if event_present else "none",
        }
        states.append(row)

    event_states = [row for row in states if row["eventMembership"]["present"]]
    payload = {
        "stage": "PS-04.M5.2",
        "canonicalLibrary": "PS-03.M3.1R",
        "stateCount": len(states),
        "eventContainingStateCount": len(event_states),
        "mappingEventContainingStateCount": mapping.get("eventContainingStateCount"),
        "canonicalAggregateUntouched": True,
        "variantsNotPromoted": True,
        "membershipKinds": {
            "SINGLE": sum(1 for row in event_states if row["eventMembership"]["asSingle"]),
            "MASTER": sum(1 for row in event_states if row["eventMembership"]["asMasterComponent"]),
            "BRAND_WIDE": sum(1 for row in event_states if row["eventMembership"]["asBrandWideComponent"]),
            "COMPLEX": sum(1 for row in event_states if row["eventMembership"]["asComplexComponent"]),
        },
        "states": states,
        "eventStates": [row["stateId"] for row in event_states],
    }
    dest = STAGE_DIR / "reports" / "event-state-impact.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "wrote": str(dest.relative_to(REPO_DIR)).replace("\\", "/"),
        "eventContaining": len(event_states),
        "total": len(states),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
