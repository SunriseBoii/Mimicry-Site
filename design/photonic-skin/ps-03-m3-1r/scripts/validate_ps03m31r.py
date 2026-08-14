"""Run full screen-space and rigid-transform validation for PS-03.M3.1R."""

from __future__ import annotations

import json
import time
from collections import Counter

import numpy as np

from m31r_core import (
    BASELINE_MANIFEST_PATH,
    CAMERAS,
    M31R_DIR,
    M31_DIR,
    PUBLIC_M31,
    PUBLIC_M31R,
    STATE_DTYPE,
    event_component_indices,
    event_pivot,
    read_json,
    rotation_z,
    sha256_bytes,
    stable_json_bytes,
    write_json,
)
from presentation_qa import analyze_projection, load_records, projected_splats


MANIFEST_PATH = M31R_DIR / "exports" / "ps03m31r-manifest.json"
DESCRIPTOR_PATH = M31R_DIR / "descriptors" / "presentation-descriptors.json"
REPORT_PATH = M31R_DIR / "reports" / "ps03m31r-screen-validation.json"
RIGID_PATH = M31R_DIR / "reports" / "ps03m31r-rigid-invariants.json"
SUMMARY_PATH = M31R_DIR / "reports" / "ps03m31r-qa-summary.json"
YAW = 18.0
TRANSLATIONS = read_json(M31R_DIR / "descriptors" / "orientation-contract.json")["eventOrientation"].get("translationOverrides", {})


def ratio_threshold(entry: dict, competency: str) -> float:
    if entry["compositionMode"] == "FOCUS":
        return 0.85 if competency == entry.get("focusCompetencyId") else 0.60
    if entry["compositionMode"] == "GATHER":
        return 0.72
    if entry["compositionMode"] == "DRIVE":
        return 0.68
    return 0.0


def old_records(entry: dict) -> np.ndarray:
    return np.fromfile(PUBLIC_M31 / entry["bufferPath"], dtype=STATE_DTYPE)


def orientation_problems(entry: dict, definition: dict, descriptors: dict[str, dict]) -> list[str]:
    problems: list[str] = []
    for selection, component in zip(definition["componentSelections"], entry["componentMap"]):
        competency = component["competencyId"]
        if competency not in descriptors:
            continue
        actual = tuple(float(value) for value in selection["canonicalTransform"]["rotateEulerDegrees"])
        expected = tuple(float(value) for value in descriptors[competency]["canonicalEulerDegrees"])
        if actual != expected:
            problems.append(f"{competency}: descriptor/definition orientation mismatch")
    return problems


def validate_rigid(entry: dict, before: np.ndarray, after: np.ndarray, old_definition: dict) -> dict:
    event_present = "event" in entry["competencyIds"]
    exact_fields = ["scale", "reserveDepth", "component", "shell", "status", "flags", "density", "transitionGroup", "lodPriority", "_padding"]
    exact_static = all(np.array_equal(before[field], after[field]) for field in exact_fields)
    if not event_present:
        identical = before.tobytes() == after.tobytes()
        return {
            "stateId": entry["stateId"], "eventPresent": False, "passed": identical,
            "bufferByteIdentical": identical, "exactStaticFields": exact_static,
            "maximumInversePositionError": 0.0, "maximumInverseNormalError": 0.0,
        }
    indices = event_component_indices(entry)
    active_event = (after["status"] == 0) & np.isin(after["component"], list(indices))
    unchanged = ~active_event
    pivot = event_pivot(old_definition)
    inverse = rotation_z(-YAW)
    translation = np.asarray(TRANSLATIONS.get(entry["stateId"], [0.0, 0.0, 0.0]), dtype=np.float64)
    inverse_positions = (after["position"][active_event].astype(np.float64) - translation - pivot) @ inverse.T + pivot
    before_normals = before["normal"][active_event].astype(np.float64) / 32767.0
    after_normals = after["normal"][active_event].astype(np.float64) / 32767.0
    inverse_normals = after_normals @ inverse.T
    position_error = float(np.max(np.abs(inverse_positions - before["position"][active_event].astype(np.float64))))
    normal_error = float(np.max(np.abs(inverse_normals - before_normals)))
    unchanged_non_event = all(
        np.array_equal(before[field][unchanged], after[field][unchanged])
        for field in before.dtype.names
    )
    before_centered = before["position"][active_event].astype(np.float64) - pivot
    after_centered = after["position"][active_event].astype(np.float64) - pivot - translation
    radial_error = float(np.max(np.abs(np.linalg.norm(before_centered, axis=1) - np.linalg.norm(after_centered, axis=1))))
    passed = exact_static and unchanged_non_event and position_error < 2e-6 and normal_error < 7e-5 and radial_error < 2e-6
    return {
        "stateId": entry["stateId"], "eventPresent": True, "passed": passed,
        "bufferByteIdentical": before.tobytes() == after.tobytes(),
        "exactStaticFields": exact_static, "nonEventAndInactiveRecordsByteIdentical": unchanged_non_event,
        "maximumInversePositionError": position_error, "maximumInverseNormalError": normal_error,
        "maximumPivotRadiusError": radial_error, "rotationDeterminant": float(np.linalg.det(rotation_z(YAW))),
        "reflection": False, "pitchDegrees": 0.0, "rollDegrees": 0.0,
        "translation": translation.tolist(),
    }


def main() -> int:
    started = time.perf_counter()
    manifest = read_json(MANIFEST_PATH)
    baseline = read_json(BASELINE_MANIFEST_PATH)
    baseline_by_id = {entry["stateId"]: entry for entry in baseline["states"]}
    descriptors_payload = read_json(DESCRIPTOR_PATH)
    descriptors = {item["competencyId"]: item for item in descriptors_payload["descriptors"]}
    cases = [
        ("canonical", "desktop"), ("alternate", "desktop"),
        ("canonical", "mobile390"), ("alternate", "mobile390"),
        ("canonical", "silhouette180"), ("canonical", "silhouette96"),
        ("side", "desktop"), ("top", "desktop"),
    ]
    failures: Counter[str] = Counter()
    state_reports: list[dict] = []
    rigid_reports: list[dict] = []
    views = owners = components = 0
    for state_index, entry in enumerate(manifest["states"]):
        records = load_records(entry)
        before = old_records(entry)
        definition = read_json(M31R_DIR / "states" / "resolved" / f"{entry['stateId']}.state.json")
        old_definition = read_json(M31_DIR / "states" / "resolved" / f"{entry['stateId']}.state.json")
        problems = orientation_problems(entry, definition, descriptors)
        if problems:
            failures["orientation"] += len(problems)
        rigid = validate_rigid(entry, before, records, old_definition)
        rigid_reports.append(rigid)
        if not rigid["passed"]:
            problems.append("rigid/byte invariant failure")
            failures["rigidInvariant"] += 1
        if len(records) != manifest["identitySpace"]["size"]:
            problems.append("identity count mismatch")
            failures["identity"] += 1
        if entry["stateRole"] in ("complex", "brand_wide") and any(item["componentId"] == "master-core" for item in entry["componentMap"]):
            problems.append("visible master-core present")
            failures["masterCore"] += 1
        view_reports = []
        for view, profile in cases:
            report = analyze_projection(projected_splats(manifest, entry, records, view, profile), entry, profile, view)
            views += 1; owners += len(report["owners"]); components += len(report["components"])
            margin = float(manifest["presentationContract"]["profiles"][profile]["safeMargin"])
            if report["clippingParticles"]:
                problems.append(f"{view}/{profile}: clipping")
                failures["clipping"] += 1
            if report["safeMarginRatio"] + 1e-9 < margin:
                problems.append(f"{view}/{profile}: safe margin")
                failures["safeMargin"] += 1
            for owner in report["owners"]:
                threshold = ratio_threshold(entry, owner["competencyId"])
                if view in ("canonical", "alternate") and profile in ("desktop", "mobile390") and owner["visibleIsolatedRatio"] + 1e-9 < threshold:
                    problems.append(f"{view}/{profile}/{owner['competencyId']}: visibility")
                    failures["visibility"] += 1
                if owner["visibleAreaPx"] <= 0:
                    problems.append(f"{view}/{profile}/{owner['competencyId']}: missing")
                    failures["missingEmblem"] += 1
                footprint = descriptors.get(owner["competencyId"], {}).get("minimumProjectedFootprintPx", {}).get(profile)
                if footprint is not None and owner["visibleAreaPx"] < footprint:
                    problems.append(f"{view}/{profile}/{owner['competencyId']}: footprint")
                    failures["footprint"] += 1
            component_floor = {"desktop": 4, "mobile390": 3, "silhouette180": 2, "silhouette96": 1}[profile]
            for component in report["components"]:
                if 0 < component["visibleAreaPx"] < component_floor:
                    problems.append(f"{view}/{profile}/{component['componentId']}: dust")
                    failures["endpointDust"] += 1
            if entry["compositionMode"] == "FOCUS" and view in ("canonical", "alternate") and profile in ("desktop", "mobile390"):
                lead = next(row for row in report["owners"] if row["competencyId"] == entry["focusCompetencyId"])
                supports = [row for row in report["owners"] if row["competencyId"] != entry["focusCompetencyId"]]
                if supports:
                    ratio = lead["visibleAreaPx"] / max(max(row["visibleAreaPx"] for row in supports), 1)
                    report["focusLeadAreaRatio"] = ratio
                    if not 1.4 <= ratio <= 2.2:
                        problems.append(f"{view}/{profile}: focus ratio {ratio:.3f}")
                        failures["focusLeadAreaRatio"] += 1
            view_reports.append(report)
        state_reports.append({
            "stateId": entry["stateId"], "stateVersion": entry["stateVersion"],
            "contentHash": entry["contentHash"], "definitionHash": entry["definitionHash"],
            "passed": not problems, "problems": problems, "views": view_reports,
        })
        if state_index % 20 == 0:
            print(f"validated {state_index + 1}/{len(manifest['states'])}", flush=True)

    ids_preserved = [e["stateId"] for e in manifest["states"]] == [e["stateId"] for e in baseline["states"]]
    event_states = [e for e in manifest["states"] if "event" in e["competencyIds"]]
    non_event_states = [e for e in manifest["states"] if "event" not in e["competencyIds"]]
    mapping_checks = {
        "semanticStateIdsPreserved": ids_preserved,
        "eventContainingStateCount": len(event_states),
        "eventContentHashesChanged": sum(e["contentHash"] != baseline_by_id[e["stateId"]]["contentHash"] for e in event_states),
        "nonEventBuffersByteIdentical": sum(old_records(e).tobytes() == load_records(e).tobytes() for e in non_event_states),
        "multiStateMasterCoreCount": sum(any(c["componentId"] == "master-core" for c in e["componentMap"]) for e in manifest["states"] if e["stateRole"] in ("complex", "brand_wide")),
    }
    contract_ok = (
        manifest["presentationContract"]["cameras"] == CAMERAS
        and manifest["presentationContract"]["fovDegrees"] == 33.0
        and mapping_checks == {
            "semanticStateIdsPreserved": True,
            "eventContainingStateCount": 83,
            "eventContentHashesChanged": 83,
            "nonEventBuffersByteIdentical": 71,
            "multiStateMasterCoreCount": 0,
        }
    )
    passed_states = sum(item["passed"] for item in state_reports)
    machine_pass = passed_states == 154 and not failures and contract_ok and all(item["passed"] for item in rigid_reports)
    report = {
        "stage": "PS-03.M3.1R", "method": "deterministic component-ID + nearest-depth point-splat buffers",
        "stateCount": len(state_reports), "caseCount": len(cases), "checkedStateViews": views,
        "checkedOwnerRows": owners, "checkedComponents": components,
        "passedStates": passed_states, "failedStates": len(state_reports) - passed_states,
        "failureCounts": dict(sorted(failures.items())), "states": state_reports,
        "wallSeconds": time.perf_counter() - started,
    }
    rigid_report = {
        "stage": "PS-03.M3.1R", "selectedYawDegrees": YAW,
        "eventStateCount": len(event_states), "nonEventStateCount": len(non_event_states),
        "passedStateCount": sum(item["passed"] for item in rigid_reports),
        "failedStateCount": sum(not item["passed"] for item in rigid_reports),
        "mappingChecks": mapping_checks,
        "maximumInversePositionError": max(item["maximumInversePositionError"] for item in rigid_reports),
        "maximumInverseNormalError": max(item["maximumInverseNormalError"] for item in rigid_reports),
        "states": rigid_reports,
    }
    summary = {
        "stage": "PS-03.M3.1R", "status": "MACHINE PASS / HUMAN REVIEW REQUIRED" if machine_pass else "MACHINE FAIL",
        "machinePass": machine_pass, "stateCount": len(state_reports), "checkedStateViews": views,
        "checkedOwnerRows": owners, "checkedComponents": components,
        "failureCount": sum(failures.values()), "failureCounts": dict(sorted(failures.items())),
        "mappingChecks": mapping_checks, "rigidInvariantFailures": rigid_report["failedStateCount"],
        "cameraContractValid": manifest["presentationContract"]["cameras"] == CAMERAS,
        "semanticAxesValid": not any(orientation_problems(
            entry, read_json(M31R_DIR / "states" / "resolved" / f"{entry['stateId']}.state.json"), descriptors
        ) for entry in manifest["states"]),
        "deterministicFingerprint": manifest["deterministicFingerprint"],
        "m4Recompiled": False, "blender": "NOT RUN",
        "screenReport": str(REPORT_PATH.relative_to(M31R_DIR)).replace("\\", "/"),
        "rigidReport": str(RIGID_PATH.relative_to(M31R_DIR)).replace("\\", "/"),
        "wallSeconds": time.perf_counter() - started,
    }
    write_json(REPORT_PATH, report)
    write_json(RIGID_PATH, rigid_report)
    write_json(SUMMARY_PATH, summary)
    write_json(PUBLIC_M31R / "qa-summary.json", summary)
    print(json.dumps(summary, indent=2))
    return 0 if machine_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
