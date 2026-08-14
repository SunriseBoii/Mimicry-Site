"""Build the PS-03.M3.1R camera-promotion and rigid Event-yaw patch."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import numpy as np

from m31r_core import (
    BASELINE_MANIFEST_PATH,
    CAMERAS,
    M31R_DIR,
    M31_DIR,
    ORIENTATION_CONTRACT_PATH,
    PUBLIC_M31,
    PUBLIC_M31R,
    STATE_DTYPE,
    patch_definition,
    patch_descriptor_payload,
    presentation_frame,
    read_json,
    refresh_machine_qa,
    sha256_bytes,
    sha256_file,
    stable_json_bytes,
    transform_event_records,
    updated_bounds,
    write_bytes,
    write_json,
)


STAGE = "PS-03.M3.1R"
STATE_VERSION = "3.1.1"
BUILD_VERSION = "ps03m31r-presentation-builder-v1"
BASELINE_FINGERPRINT = "21a78652d529eb0b1d34765aad42f0ae8379aa3f7fb9d3ec5af698548464d6e5"


def selected_yaw() -> float:
    contract = read_json(ORIENTATION_CONTRACT_PATH)
    return float(contract["eventOrientation"]["selectedEulerDegrees"][2])


def load_records(entry: dict) -> np.ndarray:
    path = PUBLIC_M31 / entry["bufferPath"]
    records = np.fromfile(path, dtype=STATE_DTYPE)
    if len(records) != entry["recordCount"]:
        raise ValueError(f"record mismatch: {entry['stateId']}")
    return records


def fingerprint_payload(manifest: dict) -> dict:
    return {
        "stage": manifest["stage"],
        "stateVersion": manifest["stateVersion"],
        "buildVersion": manifest["buildVersion"],
        "baselineM31Fingerprint": manifest["baselineM31"]["deterministicFingerprint"],
        "descriptorHash": manifest["descriptorHash"],
        "identitySpace": manifest["identitySpace"],
        "presentationContract": manifest["presentationContract"],
        "eventOrientationContract": manifest["eventOrientationContract"],
        "states": [
            {
                "stateId": entry["stateId"],
                "contentHash": entry["contentHash"],
                "definitionHash": entry["definitionHash"],
                "bufferPath": entry["bufferPath"],
            }
            for entry in manifest["states"]
        ],
    }


def build() -> dict:
    baseline = read_json(BASELINE_MANIFEST_PATH)
    if baseline["deterministicFingerprint"] != BASELINE_FINGERPRINT:
        raise ValueError("M3.1 baseline fingerprint changed")
    yaw = selected_yaw()
    orientation_contract = read_json(ORIENTATION_CONTRACT_PATH)["eventOrientation"]
    translation_overrides = orientation_contract.get("translationOverrides", {})
    descriptor = patch_descriptor_payload(yaw)
    descriptor_hash = sha256_bytes(stable_json_bytes(descriptor))
    descriptor_paths = [
        M31R_DIR / "descriptors" / "presentation-descriptors.json",
        PUBLIC_M31R / "presentation-descriptors.json",
    ]
    for path in descriptor_paths:
        write_json(path, descriptor)

    mapping: list[dict] = []
    new_states: list[dict] = []
    event_count = 0
    identical_count = 0
    for baseline_entry in baseline["states"]:
        state_id = baseline_entry["stateId"]
        event_present = "event" in baseline_entry["competencyIds"]
        old_records = load_records(baseline_entry)
        old_bytes = old_records.tobytes()
        definition_path = M31_DIR / "states" / "resolved" / f"{state_id}.state.json"
        old_definition = read_json(definition_path)
        translation = translation_overrides.get(state_id, [0.0, 0.0, 0.0])
        definition = patch_definition(old_definition, yaw, event_present=event_present, translation=translation)
        records = transform_event_records(old_records, baseline_entry, old_definition, yaw, translation=translation) if event_present else old_records
        payload = records.tobytes()
        content_hash = sha256_bytes(payload)
        definition_hash = sha256_bytes(stable_json_bytes(definition))
        buffer_path = f"states/{state_id}.state.bin"
        write_bytes(PUBLIC_M31R / buffer_path, payload)
        write_bytes(M31R_DIR / "states" / f"{state_id}.state.bin", payload)
        write_json(M31R_DIR / "states" / "resolved" / f"{state_id}.state.json", definition)

        entry = copy.deepcopy(baseline_entry)
        entry.update({
            "stateVersion": STATE_VERSION,
            "contentHash": content_hash,
            "definitionHash": definition_hash,
            "presentationDescriptorHash": descriptor_hash,
            "geometryChangedFromM31": event_present,
            "baselineM31ContentHash": baseline_entry["contentHash"],
            "baselineM31DefinitionHash": baseline_entry["definitionHash"],
            "eventOrientationPatch": {
                "applied": event_present,
                "rigidYawDegrees": yaw if event_present else 0.0,
                "pitchDegrees": 0.0,
                "rollDegrees": 0.0,
                "translation": translation if event_present else [0.0, 0.0, 0.0],
            },
            "machineValidationStatus": "geometry-pass-screen-pending",
        })
        if event_present:
            entry["bounds"] = updated_bounds(records)
            entry["presentationFrame"] = copy.deepcopy(baseline_entry["presentationFrame"])
            entry["machineQa"] = refresh_machine_qa(records, baseline_entry["machineQa"])
            event_count += 1
        else:
            identical_count += int(payload == old_bytes)
        new_states.append(entry)
        mapping.append({
            "stateId": state_id,
            "eventPresent": event_present,
            "geometryChanged": content_hash != baseline_entry["contentHash"],
            "bufferByteIdentical": payload == old_bytes,
            "m31ContentHash": baseline_entry["contentHash"],
            "m31rContentHash": content_hash,
            "m31DefinitionHash": baseline_entry["definitionHash"],
            "m31rDefinitionHash": definition_hash,
            "m31BufferPath": f"/photonic-skin/ps-03-m3-1/{buffer_path}",
            "m31rBufferPath": f"/photonic-skin/ps-03-m3-1r/{buffer_path}",
        })

    identity_source = PUBLIC_M31 / "runtime" / "ps03m31-identity-origins.f32.bin"
    identity_target = PUBLIC_M31R / "runtime" / "ps03m31r-identity-origins.f32.bin"
    write_bytes(identity_target, identity_source.read_bytes())

    manifest = copy.deepcopy(baseline)
    manifest.update({
        "schemaVersion": "1.0.1",
        "stage": STAGE,
        "stateVersion": STATE_VERSION,
        "buildVersion": BUILD_VERSION,
        "descriptorHash": descriptor_hash,
        "descriptorPath": "/photonic-skin/ps-03-m3-1r/presentation-descriptors.json",
        "stateMapping": "/photonic-skin/ps-03-m3-1r/state-mapping.json",
        "states": new_states,
        "baselineM31": {
            "stage": baseline["stage"],
            "stateVersion": baseline["stateVersion"],
            "deterministicFingerprint": baseline["deterministicFingerprint"],
            "manifestPath": "/photonic-skin/ps-03-m3-1/manifest.json",
        },
        "eventOrientationContract": {
            "semanticUp": [0.0, 0.0, 1.0],
            "semanticForward": [0.0, -1.0, 0.0],
            "selectedEulerDegrees": [0.0, 0.0, yaw],
            "transform": "single rigid yaw around each state's semantic Event pivot",
            "components": ["stage-deck", "portal-arch", "figure-left", "figure-centre", "figure-right"],
            "pitchApplied": False,
            "rollApplied": False,
            "reflectionApplied": False,
            "translationPolicy": orientation_contract["translationPolicy"],
            "translationOverrides": translation_overrides,
        },
        "approval": {
            "status": "MACHINE PASS / HUMAN REVIEW REQUIRED",
            "humanReviewRequired": True,
            "m4Recompiled": False,
            "commitCreated": False,
            "deployed": False,
        },
    })
    manifest["presentationContract"]["cameras"] = copy.deepcopy(CAMERAS)
    manifest["presentationContract"]["productionViews"] = ["canonical", "alternate"]
    manifest["presentationContract"]["cameraAnimated"] = False
    manifest["identitySpace"]["m31rVersion"] = STATE_VERSION
    manifest["identitySpace"]["m31Version"] = baseline["stateVersion"]
    manifest["identitySpace"]["originSha256"] = sha256_file(identity_target)
    manifest["identitySpace"]["preservedByteForByte"] = True
    manifest["deterministicFingerprint"] = sha256_bytes(stable_json_bytes(fingerprint_payload(manifest)))

    mapping_payload = {
        "stage": STAGE,
        "stateVersion": STATE_VERSION,
        "baselineFingerprint": BASELINE_FINGERPRINT,
        "m31rFingerprint": manifest["deterministicFingerprint"],
        "stateCount": len(mapping),
        "eventContainingStateCount": event_count,
        "nonEventByteIdenticalCount": identical_count,
        "states": mapping,
    }
    summary = {
        "stage": STAGE,
        "builderVersion": BUILD_VERSION,
        "selectedEventEulerDegrees": [0.0, 0.0, yaw],
        "baselineFingerprint": BASELINE_FINGERPRINT,
        "deterministicFingerprint": manifest["deterministicFingerprint"],
        "stateCount": len(new_states),
        "complexAndBrandWideCount": sum(entry["stateRole"] in ("complex", "brand_wide") for entry in new_states),
        "eventContainingStatesRebuilt": event_count,
        "nonEventBuffersByteIdentical": identical_count,
        "eventContentHashesChanged": sum(item["eventPresent"] and item["geometryChanged"] for item in mapping),
        "eventTranslationOverrideCount": len(translation_overrides),
        "semanticStateIdsPreserved": [entry["stateId"] for entry in new_states] == [entry["stateId"] for entry in baseline["states"]],
        "cameraContract": manifest["presentationContract"],
        "status": "GEOMETRY BUILT / SCREEN QA PENDING",
    }
    write_json(M31R_DIR / "exports" / "ps03m31r-manifest.json", manifest)
    write_json(M31R_DIR / "exports" / "ps03m31r-state-mapping.json", mapping_payload)
    write_json(M31R_DIR / "reports" / "ps03m31r-build-summary.json", summary)
    write_json(PUBLIC_M31R / "manifest.json", manifest)
    write_json(PUBLIC_M31R / "state-mapping.json", mapping_payload)
    print(json.dumps(summary, indent=2))
    return manifest


if __name__ == "__main__":
    build()
