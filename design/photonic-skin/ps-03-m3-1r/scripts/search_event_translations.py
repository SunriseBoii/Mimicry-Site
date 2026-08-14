"""Find the smallest rule-based Event-only translations for proven dust conflicts."""

from __future__ import annotations

import copy
import json

import numpy as np

from m31r_core import M31R_DIR, PUBLIC_M31R, STATE_DTYPE, event_component_indices, read_json, write_json
from presentation_qa import analyze_projection, projected_splats


TARGETS = (
    "complex-focus-content-design-digital-event-merch-focus-content",
    "complex-focus-digital-event-games-merch-video-focus-digital",
)
CASES = (
    ("canonical", "desktop"), ("alternate", "desktop"),
    ("canonical", "mobile390"), ("alternate", "mobile390"),
    ("canonical", "silhouette180"), ("canonical", "silhouette96"),
    ("side", "desktop"), ("top", "desktop"),
)


def ratio_threshold(entry: dict, competency: str) -> float:
    if entry["compositionMode"] == "FOCUS":
        return 0.85 if competency == entry.get("focusCompetencyId") else 0.60
    if entry["compositionMode"] == "GATHER": return 0.72
    if entry["compositionMode"] == "DRIVE": return 0.68
    return 0.0


def problems(manifest: dict, entry: dict, records: np.ndarray) -> list[str]:
    result: list[str] = []
    for view, profile in CASES:
        report = analyze_projection(projected_splats(manifest, entry, records, view, profile), entry, profile, view)
        margin = float(manifest["presentationContract"]["profiles"][profile]["safeMargin"])
        if report["clippingParticles"]: result.append(f"{view}/{profile}:clipping")
        if report["safeMarginRatio"] + 1e-9 < margin: result.append(f"{view}/{profile}:margin")
        for owner in report["owners"]:
            threshold = ratio_threshold(entry, owner["competencyId"])
            if view in ("canonical", "alternate") and profile in ("desktop", "mobile390") and owner["visibleIsolatedRatio"] + 1e-9 < threshold:
                result.append(f"{view}/{profile}/{owner['competencyId']}:visibility")
        floor = {"desktop": 4, "mobile390": 3, "silhouette180": 2, "silhouette96": 1}[profile]
        for component in report["components"]:
            if 0 < component["visibleAreaPx"] < floor:
                result.append(f"{view}/{profile}/{component['componentId']}:dust")
        if entry["compositionMode"] == "FOCUS" and view in ("canonical", "alternate") and profile in ("desktop", "mobile390"):
            lead = next(row for row in report["owners"] if row["competencyId"] == entry["focusCompetencyId"])
            supports = [row for row in report["owners"] if row["competencyId"] != entry["focusCompetencyId"]]
            ratio = lead["visibleAreaPx"] / max(max(row["visibleAreaPx"] for row in supports), 1)
            if not 1.4 <= ratio <= 2.2: result.append(f"{view}/{profile}:focus-ratio")
    return result


def translated(records: np.ndarray, component_indices: set[int], offset: np.ndarray) -> np.ndarray:
    result = records.copy()
    active = (result["status"] == 0) & np.isin(result["component"], list(component_indices))
    result["position"][active] = (result["position"][active].astype(np.float64) + offset).astype(np.float32)
    return result


def directions(records: np.ndarray, indices: set[int]) -> list[np.ndarray]:
    event_mask = (records["status"] == 0) & np.isin(records["component"], list(indices))
    other_mask = (records["status"] == 0) & ~np.isin(records["component"], list(indices))
    outward = records["position"][event_mask, :2].mean(axis=0) - records["position"][other_mask, :2].mean(axis=0)
    outward = outward / max(float(np.linalg.norm(outward)), 1e-9)
    perpendicular = np.asarray([-outward[1], outward[0]])
    candidates = [outward, -outward, perpendicular, -perpendicular]
    return [np.asarray([value[0], value[1], 0.0], dtype=np.float64) for value in candidates]


def main() -> int:
    manifest = read_json(M31R_DIR / "exports" / "ps03m31r-manifest.json")
    by_id = {entry["stateId"]: entry for entry in manifest["states"]}
    report = {"stage": "PS-03.M3.1R", "policy": "smallest outward/perpendicular Event-only rigid translation resolving all 8 QA cases", "states": {}}
    for state_id in TARGETS:
        entry = by_id[state_id]
        records = np.fromfile(PUBLIC_M31R / entry["bufferPath"], dtype=STATE_DTYPE)
        indices = event_component_indices(entry)
        before = problems(manifest, entry, records)
        selected = None
        probes = []
        for magnitude in np.arange(0.01, 0.251, 0.01):
            for direction_index, direction in enumerate(directions(records, indices)):
                offset = direction * float(magnitude)
                after = problems(manifest, entry, translated(records, indices, offset))
                probes.append({"offset": offset.tolist(), "magnitude": float(magnitude), "directionIndex": direction_index, "failureCount": len(after), "failures": after})
                if not after:
                    selected = probes[-1]
                    break
            if selected is not None:
                break
        report["states"][state_id] = {"failuresBefore": before, "selected": selected, "probeCount": len(probes), "probes": probes}
        if selected is None:
            write_json(M31R_DIR / "reports" / "ps03m31r-event-translation-search.json", report)
            print(json.dumps(report, indent=2))
            return 1
    write_json(M31R_DIR / "reports" / "ps03m31r-event-translation-search.json", report)
    print(json.dumps({state_id: item["selected"] for state_id, item in report["states"].items()}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
