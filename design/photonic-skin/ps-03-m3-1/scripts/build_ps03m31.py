"""Build the isolated PS-03.M3.1 endpoint presentation library.

The M3 and M4 directories are read-only inputs.  MASTER and all seven SINGLE
buffers are copied byte-for-byte; only multi-competency endpoint buffers are
rebuilt.  No transition programs are emitted by this stage.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import time
from collections import Counter
from math import ceil
from pathlib import Path
from typing import Any

import numpy as np


M31_DIR = Path(__file__).resolve().parents[1]
PHOTONIC_DIR = M31_DIR.parent
REPO_DIR = PHOTONIC_DIR.parents[1]
M3_DIR = PHOTONIC_DIR / "ps-03-m3"
M4_DIR = PHOTONIC_DIR / "ps-03-m4"
M3_SCRIPTS = M3_DIR / "scripts"
if str(M3_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(M3_SCRIPTS))

import state_builder as m3  # noqa: E402
from presentation_qa import analyze_projection, projected_splats  # noqa: E402


PUBLIC_M3 = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3"
PUBLIC_M31 = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1"
EXPORT_DIR = M31_DIR / "exports"
STATE_DIR = M31_DIR / "states" / "resolved"
REPORT_DIR = M31_DIR / "reports"
DESCRIPTOR_PATH = M31_DIR / "descriptors" / "presentation-descriptors.json"
BASELINE_MANIFEST_PATH = M3_DIR / "exports" / "ps03m3-manifest.json"
M4_MANIFEST_PATH = M4_DIR / "exports" / "ps03m4-manifest.json"

STAGE = "PS-03.M3.1"
STATE_VERSION = "3.1.0"
BUILD_VERSION = "ps03m31-presentation-builder-v1"
CAMERAS = {
    "canonical": [5.6, -6.4, 4.1],
    "alternate": [2.8, -7.8, 4.6],
    "side": [8.8, 0.0, 1.4],
    "top": [0.01, -0.01, 9.4],
}
PROFILE_ORDER = ("desktop", "mobile390", "silhouette180", "silhouette96")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def stable_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def pretty_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n").encode("utf-8")


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == payload:
        return
    path.write_bytes(payload)


def write_json(path: Path, value: Any) -> None:
    write_bytes(path, pretty_json_bytes(value))


def unit(value: np.ndarray) -> np.ndarray:
    return value / max(float(np.linalg.norm(value)), 1e-12)


def camera_basis(camera_position: list[float]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    camera = np.asarray(camera_position, dtype=np.float64)
    forward = unit(-camera)
    right = unit(np.cross(forward, np.asarray([0.0, 0.0, 1.0])))
    up = unit(np.cross(right, forward))
    return right, up, forward


CANONICAL_RIGHT, CANONICAL_UP, CANONICAL_FORWARD = camera_basis(CAMERAS["canonical"])


def validate_descriptors(payload: dict, targets: dict[str, m3.SourceTarget]) -> list[str]:
    problems: list[str] = []
    required = {
        "competencyId", "singleStateRef", "assemblyEmblem", "rigidComponentGroups",
        "semanticPivot", "semanticUp", "semanticForward", "canonicalEulerDegrees",
        "preferredCanonicalThreeQuarter", "allowedTiltDegrees", "allowedScale",
        "depthBudget", "flatness", "aspectRatio", "minimumProjectedFootprintPx",
        "projectedAreaCalibration",
        "protectedRecognizabilityFeatures", "profileComponents",
        "forbiddenOrientations", "reflectionAllowed",
    }
    descriptors = payload.get("descriptors", [])
    order = payload.get("competencyOrder", [])
    if payload.get("schemaVersion") != "1.0.0" or payload.get("stage") != STAGE:
        problems.append("descriptor header must be schema 1.0.0 / PS-03.M3.1")
    if len(descriptors) != 7 or len(order) != 7 or len(set(order)) != 7:
        problems.append("exactly seven unique competency descriptors are required")
    by_competency = {
        target.definition["competencyId"]: target
        for target in targets.values()
        if target.definition["targetRole"] != "master"
    }
    for descriptor in descriptors:
        missing = required - descriptor.keys()
        if missing:
            problems.append(f"{descriptor.get('competencyId', '?')}: missing {sorted(missing)}")
            continue
        competency = descriptor["competencyId"]
        if competency not in by_competency:
            problems.append(f"{competency}: no source target")
            continue
        if descriptor["reflectionAllowed"] is not False:
            problems.append(f"{competency}: reflection must be forbidden")
        components = {component.component_id for component in by_competency[competency].components}
        emblem = descriptor["assemblyEmblem"]
        if not emblem or set(emblem) - components:
            problems.append(f"{competency}: invalid assemblyEmblem references")
        rigid = {value for group in descriptor["rigidComponentGroups"] for value in group}
        if set(emblem) != rigid:
            problems.append(f"{competency}: rigid groups must cover the emblem exactly")
        for profile in PROFILE_ORDER:
            visible = descriptor["profileComponents"].get(profile, [])
            if not visible or set(visible) - set(emblem):
                problems.append(f"{competency}: invalid {profile} simplification")
        up = np.asarray(descriptor["semanticUp"], dtype=np.float64)
        forward = np.asarray(descriptor["semanticForward"], dtype=np.float64)
        if abs(float(np.linalg.norm(up)) - 1.0) > 1e-6 or abs(float(np.linalg.norm(forward)) - 1.0) > 1e-6:
            problems.append(f"{competency}: semantic axes must be unit length")
        if abs(float(np.dot(up, forward))) > 1e-6:
            problems.append(f"{competency}: semantic axes must be orthogonal")
    if [item.get("competencyId") for item in descriptors] != order:
        problems.append("descriptor ordering must equal competencyOrder")
    return problems


def descriptor_map(payload: dict) -> dict[str, dict]:
    return {item["competencyId"]: item for item in payload["descriptors"]}


def source_map(targets: dict[str, m3.SourceTarget]) -> dict[str, m3.SourceTarget]:
    return {
        target.definition["competencyId"]: target
        for target in targets.values()
        if target.definition["targetRole"] != "master"
    }


def projected_unit_area(source: m3.SourceTarget, descriptor: dict) -> float:
    del source
    calibration = descriptor["projectedAreaCalibration"]
    return max(float(np.sqrt(float(calibration["canonical"]) * float(calibration["alternate"]))), 1e-6)


def competency_weights(
    competencies: list[str],
    mode: str,
    focus: str | None,
    sources: dict[str, m3.SourceTarget],
    descriptors: dict[str, dict],
    focus_area_target: float = 1.72,
) -> dict[str, float]:
    desired_area = {competency: 1.0 for competency in competencies}
    if mode == "FOCUS" and focus:
        desired_area[focus] = focus_area_target
    elif mode == "DRIVE":
        for index, competency in enumerate(competencies):
            desired_area[competency] = 0.94 + 0.12 * index / max(len(competencies) - 1, 1)
    raw = {
        competency: (desired_area[competency] / projected_unit_area(sources[competency], descriptors[competency])) ** 1.5
        for competency in competencies
    }
    total = sum(raw.values())
    weights = {competency: value / total for competency, value in raw.items()}
    return weights


def emblem_half_extents(
    competency: str,
    weight: float,
    sources: dict[str, m3.SourceTarget],
    descriptors: dict[str, dict],
) -> tuple[float, float]:
    source = sources[competency]
    rotation = m3._rotation_matrix(descriptors[competency]["canonicalEulerDegrees"])
    vertices = source.vertices @ rotation.T * (weight ** (1.0 / 3.0))
    return max(float(np.ptp(vertices @ CANONICAL_RIGHT)) * 0.5, 0.12), max(float(np.ptp(vertices @ CANONICAL_UP)) * 0.5, 0.12)


def grid_slots(count: int, cell_x: float, cell_y: float) -> list[tuple[float, float]]:
    columns = 2 if count <= 4 else 3 if count <= 6 else 4
    rows = ceil(count / columns)
    output: list[tuple[float, float]] = []
    for index in range(count):
        row = index // columns
        items_in_row = min(columns, count - row * columns)
        column = index % columns
        x = (column - (items_in_row - 1) * 0.5) * cell_x
        y = ((rows - 1) * 0.5 - row) * cell_y
        output.append((x, y))
    return output


def layout_slots(
    competencies: list[str],
    mode: str,
    focus: str | None,
    weights: dict[str, float],
    sources: dict[str, m3.SourceTarget],
    descriptors: dict[str, dict],
) -> dict[str, np.ndarray]:
    extents = {competency: emblem_half_extents(competency, weights[competency], sources, descriptors) for competency in competencies}
    max_x = max(value[0] for value in extents.values())
    max_y = max(value[1] for value in extents.values())
    gap = 0.34
    positions_2d: dict[str, tuple[float, float]] = {}
    if mode == "FOCUS" and focus:
        supports = [value for value in competencies if value != focus]
        support_x = max(extents[focus][0] + max_x + gap, 1.2)
        if len(supports) <= 3:
            slots = [(support_x, (len(supports) - 1 - index * 2) * (max_y + gap * 0.5)) for index in range(len(supports))]
        else:
            slots = []
            columns = 2
            rows = ceil(len(supports) / columns)
            for index in range(len(supports)):
                column = index % columns
                row = index // columns
                slots.append((support_x + column * (2 * max_x + gap), ((rows - 1) * 0.5 - row) * (2 * max_y + gap)))
        positions_2d[focus] = (-max(extents[focus][0] * 0.35, 0.28), 0.0)
        positions_2d.update({competency: slots[index] for index, competency in enumerate(supports)})
    elif mode == "DRIVE":
        step = max(2.0 * max_x + gap, 0.95)
        for index, competency in enumerate(competencies):
            x = (index - (len(competencies) - 1) * 0.5) * step
            y = 0.38 * np.sin(index * 0.92) + (index - (len(competencies) - 1) * 0.5) * 0.13
            positions_2d[competency] = (float(x), float(y))
    else:
        slots = grid_slots(len(competencies), max(2.0 * max_x + gap, 1.0), max(2.0 * max_y + gap, 0.92))
        positions_2d.update({competency: slots[index] for index, competency in enumerate(competencies)})

    weighted_center = sum((positions_2d[value][0] * weights[value] for value in competencies))
    weighted_height = sum((positions_2d[value][1] * weights[value] for value in competencies))
    output: dict[str, np.ndarray] = {}
    for index, competency in enumerate(competencies):
        x, y = positions_2d[competency]
        depth = 0.0
        if mode == "GATHER":
            depth = ((index % 3) - 1) * min(descriptors[competency]["depthBudget"], 0.30)
        elif mode == "DRIVE":
            depth = (index - (len(competencies) - 1) * 0.5) * 0.045
        output[competency] = (
            CANONICAL_RIGHT * (x - weighted_center)
            + CANONICAL_UP * (y - weighted_height)
            + CANONICAL_FORWARD * depth
        )
    return output


def display_name(entry: dict) -> str:
    names = " + ".join(value.title() for value in entry["competencyIds"])
    if entry["stateRole"] == "master":
        return "MASTER / Neutral"
    if entry["stateRole"] == "single":
        return f"SINGLE / {entry['competencyIds'][0].title()}"
    role = "BRAND WIDE" if entry["stateRole"] == "brand_wide" else "COMPLEX"
    mode = entry["compositionMode"].title()
    lead = f" / Lead: {entry['focusCompetencyId'].title()}" if entry.get("focusCompetencyId") else ""
    return f"{role} / {mode} / {names}{lead}"


def build_definition(
    baseline_entry: dict,
    baseline_definition: dict,
    library: dict,
    sources: dict[str, m3.SourceTarget],
    descriptors: dict[str, dict],
    identity_size: int,
    focus_area_target: float = 1.72,
) -> tuple[dict, list[dict]]:
    competencies = list(baseline_entry["competencyIds"])
    mode = baseline_entry["compositionMode"]
    focus = baseline_entry.get("focusCompetencyId")
    weights = competency_weights(competencies, mode, focus, sources, descriptors, focus_area_target)
    poses = layout_slots(competencies, mode, focus, weights, sources, descriptors)
    selections: list[dict] = []
    component_map: list[dict] = []
    component_index = 0
    source_targets: list[dict] = []
    for source_index, competency in enumerate(competencies):
        source = sources[competency]
        descriptor = descriptors[competency]
        by_id = {component.component_id: component for component in source.components}
        source_targets.append({
            "targetId": source.definition["targetId"],
            "targetVersion": source.manifest["targetVersion"],
            "definitionHash": source.manifest["definitionHash"],
        })
        source_total = sum(by_id[value].measured_volume_share for value in descriptor["assemblyEmblem"])
        for component_id in descriptor["assemblyEmblem"]:
            component = by_id[component_id]
            mass = weights[competency] * component.measured_volume_share / source_total
            scale = (mass / max(component.measured_volume_share, 1e-12)) ** (1.0 / 3.0)
            selection = {
                "targetId": component.target_id,
                "targetVersion": component.target_version,
                "componentId": component.component_id,
                "semanticRole": component.semantic_role,
                "assemblyRole": "lead" if competency == focus else "emblem",
                "massWeight": float(mass),
                "minimumMassWeight": float(min(mass, component.minimum_mass * weights[competency])),
                "surfaceImportance": 1.18 if competency == focus else 1.0,
                "canonicalTransform": {
                    "translate": [float(value) for value in poses[competency]],
                    "rotateEulerDegrees": [float(value) for value in descriptor["canonicalEulerDegrees"]],
                    "scale": float(scale),
                },
                "parentAssemblyNode": f"m31-{source_index}-shell-{component_index}",
                "connectivityIntent": "preserve-emblem",
                "featureRetentionPolicy": {"protected": True, "minimumLodQuota": 24},
                "silhouetteRetentionPolicy": {"protected": True, "minimumLodQuota": 24},
                "mobilePolicy": {
                    "eligible": component_id in descriptor["profileComponents"]["mobile390"],
                    "minimumLod": 512,
                },
                "transitionAnchors": list(component.transition_anchors),
            }
            selections.append(selection)
            visible_profiles = [profile for profile in PROFILE_ORDER if component_id in descriptor["profileComponents"][profile]]
            if mode == "DRIVE" and competency == "event" and component_id == "figure-right":
                visible_profiles = [profile for profile in visible_profiles if profile != "mobile390"]
            component_map.append({
                "componentIndex": component_index,
                "competencyId": competency,
                "componentId": component_id,
                "semanticOwner": competency,
                "assemblyRole": selection["assemblyRole"],
                "visibleProfiles": visible_profiles,
            })
            component_index += 1
    value = {
        "schemaVersion": "1.0.0",
        "stateId": baseline_entry["stateId"],
        "stateVersion": STATE_VERSION,
        "displayName": display_name(baseline_entry),
        "stateRole": baseline_entry["stateRole"],
        "competencyIds": competencies,
        "focusCompetencyId": focus,
        "compositionMode": mode,
        "sourceTargets": source_targets,
        "componentSelections": selections,
        "assemblyProfile": {
            "profileVersion": STATE_VERSION,
            "placement": f"semantic-{mode.lower()}-solver-v1",
            "componentSelection": "descriptor-assembly-emblem",
            "exposurePolicy": "source-surface-preserving-no-master-core",
        },
        "canonicalCoordinateSystem": library["canonicalCoordinateSystem"],
        "canonicalTransform": {"translate": [0.0, 0.0, 0.0], "rotateEulerDegrees": [0.0, 0.0, 0.0], "scale": 1.0},
        "normalizationPolicy": {"mode": "preserve-v0-with-presentation-frame", "targetVolume": float(library["v0"]), "tolerance": 0.01},
        "surfaceEnvelopePolicy": {"maximumAreaRatio": 8.0, "preferredAreaRatio": 6.0, "contactCull": False},
        "identityPolicy": {"spaceVersion": baseline_definition["identityPolicy"]["spaceVersion"], "size": identity_size, "mapping": "canonical-master-stratified"},
        "lodPolicy": {"nested": True, "levels": [512, 1024, 2048, 4096, 8192, 12288, 16384], "priority": "protected-zones-weighted-round-robin"},
        "reservePolicy": {"mode": "canonical-subsurface-pack-hidden", "depthRange": [0.16, 0.32], "emergenceOrder": "lod-priority"},
        "transitionAffordances": {"primaryAxis": [1.0, 0.0, 0.0], "inheritTargetAnchors": True, "allowedInternalTransport": True},
        "validationPolicy": {"volumeTolerance": 0.01, "surfaceEnvelope": 8.0, "allowDeclaredFusionOverlap": False},
        "provenance": {
            "stage": STAGE,
            "builder": BUILD_VERSION,
            "baselineStateId": baseline_entry["stateId"],
            "baselineDefinitionHash": baseline_entry["definitionHash"],
            "baselineContentHash": baseline_entry["contentHash"],
            "sourceDefinitionHashes": {item["targetId"]: item["definitionHash"] for item in source_targets},
            "approvalStatus": "requires-human-approval",
        },
    }
    problems = m3.validate_state_definition(value)
    if problems:
        raise ValueError(f"invalid M3.1 state definition {value['stateId']}: {problems}")
    return value, component_map


def copied_definition(baseline_definition: dict, baseline_entry: dict) -> dict:
    value = json.loads(json.dumps(baseline_definition))
    value["stateVersion"] = STATE_VERSION
    value["displayName"] = display_name(baseline_entry)
    value["provenance"] = {
        **value["provenance"],
        "stage": STAGE,
        "builder": BUILD_VERSION,
        "baselineStateId": baseline_entry["stateId"],
        "baselineDefinitionHash": baseline_entry["definitionHash"],
        "baselineContentHash": baseline_entry["contentHash"],
        "approvalStatus": "human-approved-source" if baseline_entry["stateRole"] == "single" else "baseline-master",
    }
    return value


def component_map_for_definition(definition: dict, descriptors: dict[str, dict]) -> list[dict]:
    output = []
    for index, selection in enumerate(definition["componentSelections"]):
        competency = next((value for value in definition["competencyIds"] if selection["targetId"].startswith(value)), "master")
        profile_components = descriptors.get(competency, {}).get("profileComponents", {})
        output.append({
            "componentIndex": index,
            "competencyId": competency,
            "componentId": selection["componentId"],
            "semanticOwner": competency,
            "assemblyRole": selection["assemblyRole"],
            "visibleProfiles": [profile for profile in PROFILE_ORDER if selection["componentId"] in profile_components.get(profile, [selection["componentId"]])],
        })
    return output


def presentation_frame(records: np.ndarray) -> dict:
    active = records[records["status"] == m3.STATUS_ACTIVE]
    points = active["position"].astype(np.float64)
    center = points.mean(axis=0)
    centered = points - center
    tan_half = np.tan(np.radians(33.0) * 0.5)

    def maximum_ndc(candidate: float) -> float:
        maximum = 0.0
        scaled = centered * candidate
        for camera_values in CAMERAS.values():
            camera = np.asarray(camera_values, dtype=np.float64)
            right, up, forward = camera_basis(camera_values)
            relative = scaled - camera
            depth = np.maximum(relative @ forward, 1e-9)
            maximum = max(
                maximum,
                float(np.max(np.abs((relative @ right) / (depth * tan_half)))),
                float(np.max(np.abs((relative @ up) / (depth * tan_half)))),
            )
        return maximum

    low, high = 0.0, 1.8
    for _ in range(28):
        middle = (low + high) * 0.5
        if maximum_ndc(middle) <= 0.80:
            low = middle
        else:
            high = middle
    scale = low
    return {
        "anchor": [float(value) for value in center],
        "translate": [float(-value) for value in center],
        "scale": float(scale),
        "targetNdcHalfSpan": 0.80,
        "cameraRig": "production-fixed-v1",
    }


def inventory_matrix(states: list[dict]) -> list[dict]:
    counts = Counter((item["stateRole"], item["compositionMode"], len(item["competencyIds"])) for item in states)
    return [
        {"stateRole": role, "compositionMode": mode, "cardinality": cardinality, "count": count}
        for (role, mode, cardinality), count in sorted(counts.items())
    ]


def focus_area_ratios(entry: dict, records: np.ndarray, frame: dict) -> list[float]:
    probe_entry = {
        **entry,
        "presentationFrame": frame,
    }
    probe_manifest = {
        "presentationContract": {
            "fovDegrees": 33.0,
            "cameras": CAMERAS,
            "profiles": {"desktop": {"width": 512, "height": 512, "safeMargin": 0.06}},
        }
    }
    ratios = []
    for view in ("canonical", "alternate"):
        report = analyze_projection(
            projected_splats(probe_manifest, probe_entry, records, view, "desktop"),
            probe_entry,
            "desktop",
            view,
        )
        lead = next(row for row in report["owners"] if row["competencyId"] == entry["focusCompetencyId"])
        supports = [row for row in report["owners"] if row["competencyId"] != entry["focusCompetencyId"]]
        ratios.append(float(lead["visibleAreaPx"] / max(max(row["visibleAreaPx"] for row in supports), 1)))
    return ratios


def build() -> dict:
    started = time.perf_counter()
    baseline = read_json(BASELINE_MANIFEST_PATH)
    frozen_m4 = read_json(M4_MANIFEST_PATH)
    library, targets = m3.load_sources()
    sources = source_map(targets)
    descriptor_payload = read_json(DESCRIPTOR_PATH)
    descriptor_problems = validate_descriptors(descriptor_payload, targets)
    if descriptor_problems:
        raise ValueError(f"presentation descriptor validation failed: {descriptor_problems}")
    descriptors = descriptor_map(descriptor_payload)
    descriptor_hash = sha256_bytes(stable_json_bytes(descriptor_payload))
    baseline_by_id = {item["stateId"]: item for item in baseline["states"]}
    identity_size = int(baseline["identitySpace"]["size"])
    master_area = float(baseline["masterSurfaceArea"])
    state_entries: list[dict] = []
    mapping: list[dict] = []
    for baseline_entry in sorted(baseline["states"], key=lambda item: item["stateId"]):
        state_id = baseline_entry["stateId"]
        baseline_definition = read_json(M3_DIR / "states" / "resolved" / f"{state_id}.state.json")
        output_relative = f"states/{state_id}.state.bin"
        output_path = PUBLIC_M31 / output_relative
        if baseline_entry["stateRole"] in {"master", "single"}:
            source_path = PUBLIC_M3 / baseline_entry["bufferPath"]
            payload = source_path.read_bytes()
            write_bytes(output_path, payload)
            records = np.frombuffer(payload, dtype=m3.STATE_DTYPE).copy()
            definition = copied_definition(baseline_definition, baseline_entry)
            component_map = component_map_for_definition(definition, descriptors)
            geometry_changed = False
            qa = dict(baseline_entry["machineQa"])
            entry = dict(baseline_entry)
            entry["bufferPath"] = output_relative
            entry["definitionHash"] = sha256_bytes(stable_json_bytes(definition))
        else:
            focus_area_target = 1.72
            focus_calibration = None
            for calibration_iteration in range(4):
                definition, component_map = build_definition(
                    baseline_entry,
                    baseline_definition,
                    library,
                    sources,
                    descriptors,
                    identity_size,
                    focus_area_target,
                )
                geometry = m3.build_geometry(definition, targets, float(library["v0"]), master_area)
                records, qa = m3.build_state_records(geometry, identity_size, master_area)
                if baseline_entry["compositionMode"] != "FOCUS":
                    break
                frame_probe = presentation_frame(records)
                probe_entry = {
                    "competencyIds": baseline_entry["competencyIds"],
                    "componentMap": component_map,
                    "focusCompetencyId": baseline_entry["focusCompetencyId"],
                }
                ratios = focus_area_ratios(probe_entry, records, frame_probe)
                focus_calibration = {
                    "iterations": calibration_iteration + 1,
                    "areaTarget": focus_area_target,
                    "canonicalRatio": ratios[0],
                    "alternateRatio": ratios[1],
                }
                minimum, maximum = min(ratios), max(ratios)
                if minimum >= 1.45 and maximum <= 2.10:
                    break
                lower_correction = 1.52 / max(minimum, 1e-9)
                upper_correction = 2.02 / max(maximum, 1e-9)
                if lower_correction <= upper_correction:
                    correction = float(np.sqrt(lower_correction * upper_correction))
                else:
                    correction = float(np.sqrt((1.40 / max(minimum, 1e-9)) * (2.20 / max(maximum, 1e-9))))
                focus_area_target = float(np.clip(focus_area_target * correction, 1.25, 2.80))
            write_bytes(output_path, records.tobytes())
            entry = m3.state_manifest_entry(geometry, records, qa, output_relative)
            entry["isCanonicalCombination"] = bool(baseline_entry["isCanonicalCombination"])
            geometry_changed = True
        write_bytes(STATE_DIR / f"{state_id}.state.json", pretty_json_bytes(definition))
        frame = presentation_frame(records)
        entry.update({
            "displayName": display_name(baseline_entry),
            "stateVersion": STATE_VERSION,
            "baselineStateId": state_id,
            "baselineDefinitionHash": baseline_entry["definitionHash"],
            "baselineContentHash": baseline_entry["contentHash"],
            "geometryChangedFromM3": geometry_changed,
            "componentMap": component_map,
            "presentationFrame": frame,
            "presentationDescriptorHash": descriptor_hash,
            "machineValidationStatus": "geometry-pass-screen-pending",
        })
        if geometry_changed and baseline_entry["compositionMode"] == "FOCUS":
            entry["focusCalibration"] = focus_calibration
        if not geometry_changed and entry["contentHash"] != baseline_entry["contentHash"]:
            raise AssertionError(f"frozen buffer hash changed for {state_id}")
        if geometry_changed and any(value["componentId"] == "master-core" for value in component_map):
            raise AssertionError(f"master-core leaked into {state_id}")
        state_entries.append(entry)
        mapping.append({
            "stateId": state_id,
            "m3": {"definitionHash": baseline_entry["definitionHash"], "contentHash": baseline_entry["contentHash"], "bufferPath": f"/photonic-skin/ps-03-m3/{baseline_entry['bufferPath']}"},
            "m31": {"definitionHash": entry["definitionHash"], "contentHash": entry["contentHash"], "bufferPath": f"/photonic-skin/ps-03-m3-1/{output_relative}"},
            "geometryChanged": geometry_changed,
        })

    identity_source = M3_DIR / "exports" / "runtime" / "ps03m3-identity-origins.f32.bin"
    identity_payload = identity_source.read_bytes()
    write_bytes(EXPORT_DIR / "runtime" / "ps03m31-identity-origins.f32.bin", identity_payload)
    write_bytes(PUBLIC_M31 / "runtime" / "ps03m31-identity-origins.f32.bin", identity_payload)
    identity_manifest = {
        **baseline["identitySpace"],
        "m31Version": STATE_VERSION,
        "baselineIdentitySpaceVersion": baseline["identitySpace"]["identitySpaceVersion"],
        "originSha256": sha256_bytes(identity_payload),
        "preservedByteForByte": True,
    }
    mapping_payload = pretty_json_bytes({"stage": STAGE, "version": STATE_VERSION, "states": mapping})
    write_bytes(EXPORT_DIR / "ps03m31-state-mapping.json", mapping_payload)
    write_bytes(PUBLIC_M31 / "state-mapping.json", mapping_payload)
    fingerprint_payload = {
        "stage": STAGE,
        "version": STATE_VERSION,
        "buildVersion": BUILD_VERSION,
        "descriptorHash": descriptor_hash,
        "identityOriginHash": identity_manifest["originSha256"],
        "states": [{"stateId": item["stateId"], "definitionHash": item["definitionHash"], "contentHash": item["contentHash"]} for item in state_entries],
    }
    fingerprint = sha256_bytes(stable_json_bytes(fingerprint_payload))
    aggregate = {
        "stage": STAGE,
        "schemaVersion": "1.0.0",
        "stateVersion": STATE_VERSION,
        "buildVersion": BUILD_VERSION,
        "deterministicFingerprint": fingerprint,
        "descriptorPath": "/photonic-skin/ps-03-m3-1/presentation-descriptors.json",
        "descriptorHash": descriptor_hash,
        "identitySpace": identity_manifest,
        "stateRecordLayout": baseline["stateRecordLayout"],
        "canonicalCoordinateSystem": baseline["canonicalCoordinateSystem"],
        "v0": baseline["v0"],
        "stateCount": len(state_entries),
        "states": state_entries,
        "inventory": inventory_matrix(state_entries),
        "baseline": {
            "stage": "PS-03.M3",
            "manifestPath": "/photonic-skin/ps-03-m3/manifest.json",
            "manifestSha256": sha256_file(BASELINE_MANIFEST_PATH),
            "deterministicFingerprint": baseline["deterministicFingerprint"],
            "stateCount": len(baseline["states"]),
        },
        "frozenM4": frozen_m4["frozenM3"],
        "stateMapping": "/photonic-skin/ps-03-m3-1/state-mapping.json",
        "presentationContract": {
            "cameraAnimated": False,
            "fovDegrees": 33.0,
            "cameras": CAMERAS,
            "profiles": {
                "desktop": {"width": 512, "height": 512, "safeMargin": 0.06},
                "mobile390": {"width": 390, "height": 390, "safeMargin": 0.05},
                "silhouette180": {"width": 180, "height": 180, "safeMargin": 0.05},
                "silhouette96": {"width": 96, "height": 96, "safeMargin": 0.05},
            },
            "productionViews": ["canonical", "alternate"],
            "diagnosticViews": ["side", "top"],
            "normalization": "per-state presentation anchor and uniform scale; camera rig is fixed",
        },
        "approval": {
            "sourceSingles": "geometry-preserved-byte-for-byte",
            "complexAndBrandWide": "requires-human-approval",
            "m4Recompiled": False,
        },
    }
    manifest_payload = pretty_json_bytes(aggregate)
    write_bytes(EXPORT_DIR / "ps03m31-manifest.json", manifest_payload)
    write_bytes(PUBLIC_M31 / "manifest.json", manifest_payload)
    descriptor_public = pretty_json_bytes(descriptor_payload)
    write_bytes(PUBLIC_M31 / "presentation-descriptors.json", descriptor_public)
    inventory = {
        "stage": STAGE,
        "baselineStateCount": len(baseline["states"]),
        "m31StateCount": len(state_entries),
        "counts": inventory_matrix(state_entries),
        "masterCoreCause": {
            "confirmed": True,
            "builderRule": "baseSource=master for cardinality >= 4; master-core appended as anchor",
            "shares": {"4": 0.18, "5": 0.36, "6": 0.46, "7": 0.46},
            "m31Fix": "no master source or component is selected in any multi-competency endpoint",
        },
        "frozenContracts": {
            "m3Fingerprint": baseline["deterministicFingerprint"],
            "m3IdentityOriginSha256": baseline["identitySpace"]["originSha256"],
            "m4AggregateContentHash": frozen_m4["aggregateContentHash"],
            "m4FrozenM3": frozen_m4["frozenM3"],
        },
        "singleContentHashes": {
            item["stateId"]: item["contentHash"] for item in state_entries if item["stateRole"] == "single"
        },
        "descriptorHash": descriptor_hash,
        "deterministicFingerprint": fingerprint,
        "wallSeconds": time.perf_counter() - started,
    }
    write_json(REPORT_DIR / "ps03m31-inventory.json", inventory)
    write_json(REPORT_DIR / "ps03m31-build-summary.json", {
        "stage": STAGE,
        "status": "geometry-pass-screen-pending",
        "stateCount": len(state_entries),
        "copiedFrozenStates": sum(not item["geometryChangedFromM3"] for item in state_entries),
        "rebuiltMultiStates": sum(item["geometryChangedFromM3"] for item in state_entries),
        "descriptorProblems": descriptor_problems,
        "visibleMasterCoreInMultiStateDefinitions": 0,
        "fingerprint": fingerprint,
        "wallSeconds": time.perf_counter() - started,
    })
    return aggregate


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    manifest = build()
    print(json.dumps({
        "stage": manifest["stage"],
        "stateCount": manifest["stateCount"],
        "fingerprint": manifest["deterministicFingerprint"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
