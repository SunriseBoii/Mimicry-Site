"""Run full machine validation for the PS-03.M3.1 endpoint library."""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from collections import Counter
from pathlib import Path

import numpy as np

from presentation_qa import M31_DIR, PUBLIC_DIR, analyze_projection, load_records, projected_splats, read_json


REPO_DIR = M31_DIR.parents[2]
MANIFEST_PATH = M31_DIR / "exports" / "ps03m31-manifest.json"
BASELINE_PATH = M31_DIR.parent / "ps-03-m3" / "exports" / "ps03m3-manifest.json"
M4_PATH = M31_DIR.parent / "ps-03-m4" / "exports" / "ps03m4-manifest.json"
DESCRIPTOR_PATH = M31_DIR / "descriptors" / "presentation-descriptors.json"
REPORT_PATH = M31_DIR / "reports" / "ps03m31-screen-validation.json"
SUMMARY_PATH = M31_DIR / "reports" / "ps03m31-qa-summary.json"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def ratio_threshold(entry: dict, competency: str) -> float:
    if entry["compositionMode"] == "FOCUS":
        return 0.85 if competency == entry.get("focusCompetencyId") else 0.60
    if entry["compositionMode"] == "GATHER":
        return 0.72
    if entry["compositionMode"] == "DRIVE":
        return 0.68
    return 0.0


def validate_orientation(entry: dict, state_definition: dict, descriptors: dict[str, dict]) -> list[str]:
    problems: list[str] = []
    if entry["stateRole"] in {"master", "single"}:
        return problems
    transforms: dict[str, set[tuple[float, float, float]]] = {}
    for selection, component in zip(state_definition["componentSelections"], entry["componentMap"]):
        competency = component["competencyId"]
        euler = tuple(float(value) for value in selection["canonicalTransform"]["rotateEulerDegrees"])
        transforms.setdefault(competency, set()).add(euler)
    for competency, values in transforms.items():
        expected = tuple(float(value) for value in descriptors[competency]["canonicalEulerDegrees"])
        if values != {expected}:
            problems.append(f"{competency}: rigid emblem orientation mismatch")
        low, high = descriptors[competency]["allowedTiltDegrees"]
        if not low <= expected[2] <= high:
            problems.append(f"{competency}: tilt outside descriptor")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--focus-production", action="store_true", help="fast corrective-cycle probe")
    args = parser.parse_args()
    started = time.perf_counter()
    manifest = read_json(MANIFEST_PATH)
    baseline = read_json(BASELINE_PATH)
    m4 = read_json(M4_PATH)
    descriptors_payload = read_json(DESCRIPTOR_PATH)
    descriptors = {item["competencyId"]: item for item in descriptors_payload["descriptors"]}
    baseline_by_id = {item["stateId"]: item for item in baseline["states"]}
    cases = [
        ("canonical", "desktop"),
        ("alternate", "desktop"),
        ("canonical", "mobile390"),
        ("alternate", "mobile390"),
        ("canonical", "silhouette180"),
        ("canonical", "silhouette96"),
        ("side", "desktop"),
        ("top", "desktop"),
    ]
    entries = manifest["states"]
    report_path = REPORT_PATH
    summary_path = SUMMARY_PATH
    if args.focus_production:
        cases = cases[:4]
        entries = [entry for entry in entries if entry["compositionMode"] == "FOCUS"]
        report_path = M31_DIR / "reports" / "ps03m31-focus-production-probe.json"
        summary_path = M31_DIR / "reports" / "ps03m31-focus-production-probe-summary.json"
    state_reports = []
    failure_counts: Counter[str] = Counter()
    checked_views = 0
    checked_owner_rows = 0
    checked_components = 0
    for state_index, entry in enumerate(entries):
        records = load_records(entry)
        state_definition = read_json(M31_DIR / "states" / "resolved" / f"{entry['stateId']}.state.json")
        problems = validate_orientation(entry, state_definition, descriptors)
        if len(records) != manifest["identitySpace"]["size"]:
            problems.append("identity count mismatch")
        if entry["stateRole"] in {"complex", "brand_wide"} and any(item["componentId"] == "master-core" for item in entry["componentMap"]):
            problems.append("visible master-core component present")
        view_reports = []
        for view, profile in cases:
            report = analyze_projection(projected_splats(manifest, entry, records, view, profile), entry, profile, view)
            checked_views += 1
            checked_owner_rows += len(report["owners"])
            checked_components += len(report["components"])
            required_margin = float(manifest["presentationContract"]["profiles"][profile]["safeMargin"])
            if report["clippingParticles"]:
                problems.append(f"{view}/{profile}: clipping={report['clippingParticles']}")
                failure_counts["clipping"] += 1
            if report["safeMarginRatio"] + 1e-9 < required_margin:
                problems.append(f"{view}/{profile}: safe margin {report['safeMarginRatio']:.4f} < {required_margin:.4f}")
                failure_counts["safeMargin"] += 1
            for owner in report["owners"]:
                threshold = ratio_threshold(entry, owner["competencyId"])
                if view in {"canonical", "alternate"} and profile in {"desktop", "mobile390"} and owner["visibleIsolatedRatio"] + 1e-9 < threshold:
                    problems.append(f"{view}/{profile}/{owner['competencyId']}: visibility {owner['visibleIsolatedRatio']:.4f} < {threshold:.2f}")
                    failure_counts["visibility"] += 1
                if owner["visibleAreaPx"] <= 0:
                    problems.append(f"{view}/{profile}/{owner['competencyId']}: missing emblem")
                    failure_counts["missingEmblem"] += 1
                if profile in descriptors.get(owner["competencyId"], {}).get("minimumProjectedFootprintPx", {}):
                    footprint = descriptors[owner["competencyId"]]["minimumProjectedFootprintPx"][profile]
                    if owner["visibleAreaPx"] < footprint:
                        problems.append(f"{view}/{profile}/{owner['competencyId']}: footprint {owner['visibleAreaPx']} < {footprint}")
                        failure_counts["footprint"] += 1
            component_floor = {"desktop": 4, "mobile390": 3, "silhouette180": 2, "silhouette96": 1}[profile]
            for component in report["components"]:
                if 0 < component["visibleAreaPx"] < component_floor:
                    problems.append(f"{view}/{profile}/{component['componentId']}: endpoint dust {component['visibleAreaPx']}px")
                    failure_counts["endpointDust"] += 1
            if entry["compositionMode"] == "FOCUS" and view in {"canonical", "alternate"} and profile in {"desktop", "mobile390"}:
                lead = next(row for row in report["owners"] if row["competencyId"] == entry["focusCompetencyId"])
                supports = [row for row in report["owners"] if row["competencyId"] != entry["focusCompetencyId"]]
                if supports:
                    ratio = lead["visibleAreaPx"] / max(max(row["visibleAreaPx"] for row in supports), 1)
                    report["focusLeadAreaRatio"] = ratio
                    if not 1.4 <= ratio <= 2.2:
                        problems.append(f"{view}/{profile}: focus lead area ratio {ratio:.3f} outside 1.4..2.2")
                        failure_counts["focusLeadAreaRatio"] += 1
            view_reports.append(report)
        baseline_entry = baseline_by_id[entry["stateId"]]
        if entry["stateRole"] in {"master", "single"} and entry["contentHash"] != baseline_entry["contentHash"]:
            problems.append("frozen geometry content hash changed")
            failure_counts["singleGeometryHash"] += 1
        state_reports.append({
            "stateId": entry["stateId"],
            "stateVersion": entry["stateVersion"],
            "contentHash": entry["contentHash"],
            "definitionHash": entry["definitionHash"],
            "passed": not problems,
            "problems": problems,
            "views": view_reports,
        })
        if state_index % 20 == 0:
            print(f"validated {state_index + 1}/{len(entries)}", flush=True)

    passed_states = sum(bool(item["passed"]) for item in state_reports)
    report = {
        "stage": "PS-03.M3.1",
        "method": "deterministic component-ID + nearest-depth point-splat buffers",
        "stateCount": len(state_reports),
        "caseCount": len(cases),
        "checkedStateViews": checked_views,
        "checkedOwnerRows": checked_owner_rows,
        "checkedComponents": checked_components,
        "passedStates": passed_states,
        "failedStates": len(state_reports) - passed_states,
        "failureCounts": dict(sorted(failure_counts.items())),
        "states": state_reports,
        "wallSeconds": time.perf_counter() - started,
    }
    write_json(report_path, report)
    summary = {
        "stage": "PS-03.M3.1",
        "machinePass": passed_states == len(state_reports),
        "stateCount": len(state_reports),
        "checkedStateViews": checked_views,
        "checkedOwnerRows": checked_owner_rows,
        "checkedComponents": checked_components,
        "failureCounts": dict(sorted(failure_counts.items())),
        "descriptorCount": len(descriptors),
        "semanticAxesValid": all(not validate_orientation(
            entry,
            read_json(M31_DIR / "states" / "resolved" / f"{entry['stateId']}.state.json"),
            descriptors,
        ) for entry in manifest["states"]),
        "singleGeometryHashesPreserved": all(
            entry["contentHash"] == baseline_by_id[entry["stateId"]]["contentHash"]
            for entry in manifest["states"] if entry["stateRole"] == "single"
        ),
        "multiStateMasterCoreCount": sum(
            any(component["componentId"] == "master-core" for component in entry["componentMap"])
            for entry in manifest["states"] if entry["stateRole"] in {"complex", "brand_wide"}
        ),
        "baselineM3Available": BASELINE_PATH.exists() and manifest["baseline"]["deterministicFingerprint"] == baseline["deterministicFingerprint"],
        "baselineM4Available": M4_PATH.exists() and manifest["frozenM4"] == m4["frozenM3"],
        "m4Recompiled": False,
        "screenReport": str(report_path.relative_to(M31_DIR)).replace("\\", "/"),
        "wallSeconds": time.perf_counter() - started,
    }
    write_json(summary_path, summary)
    if not args.focus_production:
        write_json(PUBLIC_DIR / "qa-summary.json", {
            "stage": summary["stage"],
            "status": "machine-pass" if summary["machinePass"] else "machine-fail",
            "passed": summary["machinePass"],
            "stateCount": summary["stateCount"],
            "stateViewCount": summary["checkedStateViews"],
            "ownerRowCount": summary["checkedOwnerRows"],
            "componentRowCount": summary["checkedComponents"],
            "failureCount": sum(summary["failureCounts"].values()),
            "failureCounts": summary["failureCounts"],
            "singleGeometryHashesPreserved": summary["singleGeometryHashesPreserved"],
            "multiStateMasterCoreCount": summary["multiStateMasterCoreCount"],
            "m4Recompiled": summary["m4Recompiled"],
        })
    print(json.dumps(summary, indent=2))
    return 0 if summary["machinePass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
