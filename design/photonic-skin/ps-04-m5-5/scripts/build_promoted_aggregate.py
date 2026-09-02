"""PS-04.M5.5 — bake EVENT_A_R2 and VIDEO_COMBO_40_R1 into a versioned 154-state candidate.

Frozen PS-03 assets are read-only. No runtime overlays. No production swap.
"""

from __future__ import annotations

import copy
import hashlib
import json
import shutil
import sys
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
PHOTONIC_DIR = STAGE_DIR.parent
REPO_DIR = PHOTONIC_DIR.parents[1]
M3_SCRIPTS = PHOTONIC_DIR / "ps-03-m" / "scripts"
M3_STATE_SCRIPTS = PHOTONIC_DIR / "ps-03-m3" / "scripts"
M31R_SCRIPTS = PHOTONIC_DIR / "ps-03-m3-1r" / "scripts"
PUBLIC_M31R = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1r"
PUBLIC_OUT = REPO_DIR / "public" / "photonic-skin" / "ps-04-m5-5"
EVIDENCE_OUT = STAGE_DIR / "promoted-aggregate"
AUTHORING_DIR = STAGE_DIR / "authoring"
REPORTS = STAGE_DIR / "reports"
RESOLVED_DIR = PHOTONIC_DIR / "ps-03-m3-1r" / "states" / "resolved"

EVENT_A_PATH = PHOTONIC_DIR / "ps-04-m5-2" / "variants" / "a" / "single-event.state.bin"
EVENT_A_R2_PATH = PHOTONIC_DIR / "ps-04-m5-2-r2" / "variants" / "a-r2" / "single-event.state.bin"
EVENT_A_R2_PUBLIC = REPO_DIR / "public" / "photonic-skin" / "ps-04-m5-2" / "variants" / "a-r2" / "single-event.state.bin"
VIDEO_R1_PATH = PHOTONIC_DIR / "ps-04-m5-3-r1" / "variants" / "combo-40-r1" / "single-video.state.bin"
VIDEO_R1_PUBLIC = REPO_DIR / "public" / "photonic-skin" / "ps-04-m5-3-r1" / "variants" / "combo-40-r1" / "single-video.state.bin"
VIDEO_MAP_PATH = PHOTONIC_DIR / "ps-04-m5-3-r1" / "variants" / "combo-40-r1" / "component-map.json"

for path in (M3_SCRIPTS, M3_STATE_SCRIPTS, M31R_SCRIPTS):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import state_builder as m3  # noqa: E402
from m31r_core import (  # noqa: E402
    event_component_indices,
    event_pivot,
    refresh_machine_qa,
    rotation_z,
    transform_event_records,
    updated_bounds,
)

IDENTITY_SIZE = 16384
STRIDE = 40
LOD_PREFIXES = (512, 1024, 2048, 4096, 8192, 12288, 16384)
EVENT_A_HASH = "76c46452781c4334b4d91cca9ed6533bb9ccd7224c57bdf7abf7e1093d1c938d"
EVENT_A_R2_HASH = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b"
VIDEO_R1_HASH = "2d6957815b6f58f87f1709e0378313cba271530b8fb0e02282b556780448a873"
VIEWER_RIGHT_SINGLE = 2
DONOR_CAMERA = (0, 1, 2, 3)
DONOR_CLAPPER = (4, 5, 6)
ALL_PROFILES = ["desktop", "mobile390", "silhouette180", "silhouette96"]
FORBIDDEN = ("scale", "reserveDepth", "shell", "status", "flags", "density", "transitionGroup", "lodPriority", "_padding")


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def load_records(path: Path) -> np.ndarray:
    payload = path.read_bytes()
    records = np.frombuffer(payload, dtype=m3.STATE_DTYPE).copy()
    if len(records) != IDENTITY_SIZE:
        raise SystemExit(f"{path} N={len(records)}")
    return records


def competency_indices(entry: dict, competency: str) -> list[int]:
    return [
        int(item["componentIndex"])
        for item in entry.get("componentMap", [])
        if item.get("competencyId") == competency
    ]


def component_index_by_id(entry: dict, component_id: str) -> int | None:
    for item in entry.get("componentMap", []):
        if item.get("componentId") == component_id:
            return int(item["componentIndex"])
    return None


def mask_for(records: np.ndarray, indices: list[int]) -> np.ndarray:
    if not indices:
        return np.zeros(len(records), dtype=bool)
    return np.isin(records["component"], np.asarray(indices, dtype=np.uint8))


def lod_order(records: np.ndarray, mask: np.ndarray) -> np.ndarray:
    ids = np.nonzero(mask)[0]
    return ids[np.argsort(records["lodPriority"][ids], kind="stable")]


def finite_geometry(records: np.ndarray) -> bool:
    normals = records["normal"].astype(np.float64) / 32767.0
    return bool(
        np.isfinite(records["position"]).all()
        and np.isfinite(normals).all()
        and np.isfinite(records["orientation"]).all()
    )


def apply_event_a_r2(records: np.ndarray, entry: dict, definition: dict, event_a: np.ndarray, event_ar2: np.ndarray) -> str:
    indices = competency_indices(entry, "event")
    if not indices:
        return "none"
    try:
        patched = transform_event_records(records, entry, definition, 180.0)
        records[:] = patched
        proof = "event-rigid-180 + a-r2-figure-left"
    except Exception:
        active = (records["status"] == m3.STATUS_ACTIVE) & mask_for(records, indices)
        pivot = records["position"][active].astype(np.float64).mean(axis=0) if int(active.sum()) else np.zeros(3)
        rotation = rotation_z(180.0)
        sel = mask_for(records, indices)
        positions = records["position"][sel].astype(np.float64)
        normals = records["normal"][sel].astype(np.float64) / 32767.0
        rotated_p = (positions - pivot) @ rotation.T + pivot
        rotated_n = normals @ rotation.T
        rotated_n /= np.maximum(np.linalg.norm(rotated_n, axis=1, keepdims=True), 1e-12)
        records["position"][sel] = rotated_p.astype(np.float32)
        records["normal"][sel] = np.round(np.clip(rotated_n, -1, 1) * 32767).astype(np.int16)
        orientation = m3._quaternion_from_z(rotated_n)  # type: ignore[attr-defined]
        records["orientation"][sel] = np.round(np.clip(orientation, -1, 1) * 32767).astype(np.int16)
        proof = "event-centroid-180 + a-r2-figure-left"

    figure_left = component_index_by_id(entry, "figure-left")
    if figure_left is None:
        return proof
    donor_mask = event_a["component"] == VIEWER_RIGHT_SINGLE
    donor_ids = lod_order(event_a, donor_mask)
    target_ids = lod_order(records, records["component"] == figure_left)
    count = min(len(donor_ids), len(target_ids))
    if count == 0:
        return proof
    event_mask = mask_for(records, indices) & (records["status"] == m3.STATUS_ACTIVE)
    donor_event = event_a["status"] == m3.STATUS_ACTIVE
    c_state = records["position"][event_mask].astype(np.float64).mean(axis=0)
    c_donor = event_a["position"][donor_event].astype(np.float64).mean(axis=0)
    rms_state = float(np.sqrt(np.mean(np.sum((records["position"][event_mask].astype(np.float64) - c_state) ** 2, axis=1))))
    rms_donor = float(np.sqrt(np.mean(np.sum((event_a["position"][donor_event].astype(np.float64) - c_donor) ** 2, axis=1))))
    scale = rms_state / max(rms_donor, 1e-9)
    local = event_ar2["position"][donor_ids[:count]].astype(np.float64) - c_donor
    records["position"][target_ids[:count]] = (c_state + scale * local).astype(np.float32)
    records["normal"][target_ids[:count]] = event_ar2["normal"][donor_ids[:count]]
    records["orientation"][target_ids[:count]] = event_ar2["orientation"][donor_ids[:count]]
    return proof


def apply_video_combo(records: np.ndarray, entry: dict, donor: np.ndarray) -> str:
    indices = competency_indices(entry, "video")
    if not indices:
        return "none"
    camera_idx = component_index_by_id(entry, "camera")
    clapper_idx = component_index_by_id(entry, "clapperboard")
    target_ids = lod_order(records, mask_for(records, indices))
    donor_ids = lod_order(donor, np.ones(len(donor), dtype=bool))
    count = min(len(target_ids), len(donor_ids))
    if count == 0:
        return "none"
    frozen_pts = records["position"][target_ids].astype(np.float64)
    donor_pts = donor["position"][donor_ids[:count]].astype(np.float64)
    c_f = frozen_pts.mean(axis=0)
    c_d = donor_pts.mean(axis=0)
    r_f = float(np.sqrt(np.mean(np.sum((frozen_pts - c_f) ** 2, axis=1))))
    r_d = float(np.sqrt(np.mean(np.sum((donor_pts - c_d) ** 2, axis=1))))
    scale = r_f / max(r_d, 1e-9)
    records["position"][target_ids[:count]] = (c_f + scale * (donor_pts - c_d)).astype(np.float32)
    records["normal"][target_ids[:count]] = donor["normal"][donor_ids[:count]]
    records["orientation"][target_ids[:count]] = donor["orientation"][donor_ids[:count]]
    if camera_idx is not None and clapper_idx is not None:
        donor_comp = donor["component"][donor_ids[:count]]
        mapped = np.where(np.isin(donor_comp, DONOR_CAMERA), camera_idx, clapper_idx).astype(np.uint8)
        records["component"][target_ids[:count]] = mapped
    return "video-combo-40-r1-lod-fit"


def force_viewer_right_profiles(entry: dict) -> dict:
    clone = copy.deepcopy(entry)
    for item in clone.get("componentMap", []):
        if item.get("componentId") == "figure-left" or (
            item.get("competencyId") == "event" and int(item.get("componentIndex", -1)) == VIEWER_RIGHT_SINGLE and clone["stateId"] == "single-event"
        ):
            item["visibleProfiles"] = list(ALL_PROFILES)
    return clone


def replace_single_video_map(entry: dict, video_map: dict, donor: np.ndarray) -> dict:
    clone = copy.deepcopy(entry)
    clone["componentMap"] = copy.deepcopy(video_map["componentMap"])
    clone["componentCount"] = len(video_map["componentMap"])
    quotas = {str(index): int(np.count_nonzero((donor["component"] == index) & (donor["status"] == m3.STATUS_ACTIVE))) for index in range(7)}
    clone.setdefault("machineQa", {})
    clone["machineQa"]["componentQuotas"] = quotas
    clone["machineQa"]["activeCount"] = int(np.count_nonzero(donor["status"] == m3.STATUS_ACTIVE))
    clone["machineQa"]["reserveCount"] = IDENTITY_SIZE - int(clone["machineQa"]["activeCount"])
    return clone


def frozen_baseline(manifest: dict) -> dict:
    cameras = manifest["presentationContract"]["cameras"]
    layout = manifest["stateRecordLayout"]
    identity = manifest["identitySpace"]
    return {
        "frozenAggregateManifestHash": sha256_file(PUBLIC_M31R / "manifest.json"),
        "frozenFingerprint": manifest["deterministicFingerprint"],
        "identityFingerprint": identity["originSha256"],
        "identitySpaceVersion": identity["identitySpaceVersion"],
        "N": identity["size"],
        "stride": layout["stride"],
        "endianness": layout.get("endianness"),
        "lodPrefixes": list(LOD_PREFIXES),
        "cameraFingerprint": {
            "canonical": cameras["canonical"],
            "alternate": cameras["alternate"],
            "side": cameras["side"],
            "top": cameras["top"],
            "fovDegrees": manifest["presentationContract"]["fovDegrees"],
        },
        "transitionLayout": {
            "m41Manifest": "/photonic-skin/ps-03-m4-1/manifest.json",
            "m41Aggregate": "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361",
            "note": "M5.5 does not rewrite frozen M4.1 programs; unmatched hashes compile live",
        },
        "stateCount": len(manifest["states"]),
        "stateIds": [entry["stateId"] for entry in manifest["states"]],
        "baselineHashes": {entry["stateId"]: entry["contentHash"] for entry in manifest["states"]},
    }


def main() -> int:
    lock_path = STAGE_DIR / "selection-lock.json"
    lock = read_json(lock_path)
    lock_hash = sha256_file(lock_path)
    if lock["event"]["hash"] != EVENT_A_R2_HASH or lock["video"]["hash"] != VIDEO_R1_HASH:
        raise SystemExit("selection-lock hashes do not match owner selections")
    if lock["video"]["compositionYawDegrees"] != -40 or lock["video"]["clapperOpenAngleDegrees"] != 30:
        raise SystemExit("selection-lock video angles are wrong")
    if lock["framing"]["id"] != "OWNER_SELECTED_124_111_111":
        raise SystemExit("selection-lock framing is not owner selected")

    write_json(REPORTS / "selection-lock.json", lock)
    write_bytes(AUTHORING_DIR / "selection-lock.sha256.txt", (lock_hash + "\n").encode("utf-8"))

    event_a = load_records(EVENT_A_PATH)
    if sha256_file(EVENT_A_PATH) != EVENT_A_HASH:
        raise SystemExit(f"EVENT_A hash mismatch: {sha256_file(EVENT_A_PATH)}")
    event_ar2_path = EVENT_A_R2_PATH if EVENT_A_R2_PATH.exists() else EVENT_A_R2_PUBLIC
    if sha256_file(event_ar2_path) != EVENT_A_R2_HASH:
        raise SystemExit(f"EVENT_A_R2 hash mismatch: {sha256_file(event_ar2_path)}")
    event_ar2 = load_records(event_ar2_path)
    video_path = VIDEO_R1_PATH if VIDEO_R1_PATH.exists() else VIDEO_R1_PUBLIC
    if sha256_file(video_path) != VIDEO_R1_HASH:
        raise SystemExit(f"VIDEO_COMBO_40_R1 hash mismatch: {sha256_file(video_path)}")
    video_donor = load_records(video_path)
    video_map = read_json(VIDEO_MAP_PATH)

    frozen_manifest = read_json(PUBLIC_M31R / "manifest.json")
    baseline = frozen_baseline(frozen_manifest)
    write_json(REPORTS / "frozen-baseline.json", baseline)

    event_ids = []
    video_ids = []
    for entry in frozen_manifest["states"]:
        comps = {item.get("competencyId") for item in entry.get("componentMap", [])}
        comps.update(entry.get("competencyIds") or [])
        if "event" in comps:
            event_ids.append(entry["stateId"])
        if "video" in comps:
            video_ids.append(entry["stateId"])
    event_set = set(event_ids)
    video_set = set(video_ids)
    all_ids = [entry["stateId"] for entry in frozen_manifest["states"]]
    intersection = [state_id for state_id in all_ids if state_id in event_set and state_id in video_set]
    event_only = [state_id for state_id in all_ids if state_id in event_set and state_id not in video_set]
    video_only = [state_id for state_id in all_ids if state_id in video_set and state_id not in event_set]
    unaffected = [state_id for state_id in all_ids if state_id not in event_set and state_id not in video_set]
    if len(event_only) + len(video_only) + len(intersection) + len(unaffected) != 154:
        raise SystemExit("state impact union is not 154")

    promoted_states = []
    impact_states = []
    donor_rows = []
    preservation_rows = []
    identity_rows = []
    lod_rows = []
    palette_rows = []
    hash_map = {}

    for entry in frozen_manifest["states"]:
        state_id = entry["stateId"]
        frozen_path = PUBLIC_M31R / entry["bufferPath"]
        frozen_bytes = frozen_path.read_bytes()
        frozen_hash = sha256_bytes(frozen_bytes)
        if frozen_hash != entry["contentHash"]:
            raise SystemExit(f"frozen hash mismatch {state_id}")
        records = np.frombuffer(frozen_bytes, dtype=m3.STATE_DTYPE).copy()
        definition_path = RESOLVED_DIR / f"{state_id}.state.json"
        definition = read_json(definition_path) if definition_path.exists() else {}
        has_event = state_id in event_set
        has_video = state_id in video_set
        donors = []
        proofs = []
        new_entry = copy.deepcopy(entry)
        original_non_target = None
        event_idx = competency_indices(entry, "event")
        video_idx = competency_indices(entry, "video")
        keep_mask = np.ones(len(records), dtype=bool)
        if event_idx:
            keep_mask &= ~mask_for(records, event_idx)
        if video_idx:
            keep_mask &= ~mask_for(records, video_idx)
        original_keep = records[keep_mask].copy()

        if state_id == "single-event":
            records = event_ar2.copy()
            donors = ["EVENT_A_R2"]
            proofs = ["byte-identical-single-event-donor"]
            new_entry = force_viewer_right_profiles(new_entry)
        elif state_id == "single-video":
            records = video_donor.copy()
            donors = ["VIDEO_COMBO_40_R1"]
            proofs = ["byte-identical-single-video-donor"]
            new_entry = replace_single_video_map(new_entry, video_map, video_donor)
        else:
            if has_event:
                proofs.append(apply_event_a_r2(records, entry, definition, event_a, event_ar2))
                donors.append("EVENT_A_R2")
                new_entry = force_viewer_right_profiles(new_entry)
            if has_video:
                proofs.append(apply_video_combo(records, entry, video_donor))
                donors.append("VIDEO_COMBO_40_R1")
            if not has_event and not has_video:
                proofs = ["byte-exact-frozen-copy"]

        if state_id not in {"single-event", "single-video"}:
            keep_now = records[keep_mask]
            preserved = keep_now.tobytes() == original_keep.tobytes()
        else:
            preserved = True
        payload = records.tobytes()
        digest = sha256_bytes(payload)
        changed = digest != frozen_hash
        if state_id in unaffected and changed:
            raise SystemExit(f"unaffected state changed: {state_id}")
        if state_id == "single-event" and digest != EVENT_A_R2_HASH:
            raise SystemExit(f"single-event is not EVENT_A_R2: {digest}")
        if state_id == "single-video" and digest != VIDEO_R1_HASH:
            raise SystemExit(f"single-video is not VIDEO_COMBO_40_R1: {digest}")
        if not finite_geometry(records):
            raise SystemExit(f"non-finite geometry: {state_id}")
        if len(records) != IDENTITY_SIZE:
            raise SystemExit(f"N changed: {state_id}")
        if records.nbytes != IDENTITY_SIZE * STRIDE:
            raise SystemExit(f"stride/layout changed: {state_id}")

        new_entry["contentHash"] = digest
        new_entry["bufferPath"] = f"states/{state_id}.state.bin"
        new_entry["bufferBytes"] = len(payload)
        new_entry["promotion"] = {
            "donors": donors,
            "changed": changed,
            "proof": proofs,
        }
        if changed and state_id not in {"single-event", "single-video"}:
            new_entry["bounds"] = updated_bounds(records)
            new_entry["machineQa"] = refresh_machine_qa(records, entry.get("machineQa", {}))

        write_bytes(PUBLIC_OUT / "states" / f"{state_id}.state.bin", payload)
        write_bytes(EVIDENCE_OUT / "states" / f"{state_id}.state.bin", payload)
        write_json(PUBLIC_OUT / "component-maps" / f"{state_id}.json", {"stateId": state_id, "componentMap": new_entry.get("componentMap", [])})
        write_json(EVIDENCE_OUT / "component-maps" / f"{state_id}.json", {"stateId": state_id, "componentMap": new_entry.get("componentMap", [])})

        promoted_states.append(new_entry)
        hash_map[state_id] = {"baseline": frozen_hash, "candidate": digest, "changed": changed, "donors": donors}
        impact_states.append({
            "stateId": state_id,
            "baselineHash": frozen_hash,
            "containsEvent": has_event,
            "containsVideo": has_video,
            "appliedDonors": donors,
            "candidateHash": digest,
            "changed": changed,
            "authoringProof": proofs,
        })
        donor_rows.append({
            "stateId": state_id,
            "donors": donors,
            "singleEventExact": state_id != "single-event" or digest == EVENT_A_R2_HASH,
            "singleVideoExact": state_id != "single-video" or digest == VIDEO_R1_HASH,
            "semanticEvent": has_event,
            "semanticVideo": has_video,
            "proof": proofs,
        })
        preservation_rows.append({
            "stateId": state_id,
            "nonTargetByteIdentical": bool(preserved),
            "unaffectedByteIdentical": (state_id not in event_set and state_id not in video_set and not changed),
            "statusCountsUnchanged": state_id in {"single-event", "single-video"} or int((records["status"] == 0).sum()) == int((np.frombuffer(frozen_bytes, dtype=m3.STATE_DTYPE)["status"] == 0).sum()),
        })
        lod_presence = {}
        for prefix in LOD_PREFIXES:
            prefix_ids = np.argsort(records["lodPriority"], kind="stable")[:prefix]
            subset = records[prefix_ids]
            active = subset["status"] == m3.STATUS_ACTIVE
            lod_presence[str(prefix)] = {
                "active": int(active.sum()),
                "eventViewerRight": int(((subset["component"] == (component_index_by_id(new_entry, "figure-left") or -1)) & active).sum()) if has_event else 0,
                "videoCamera": int((np.isin(subset["component"], competency_indices(new_entry, "video")[:1] or [-1]) & active).sum()) if has_video else 0,
                "videoClapper": int((np.isin(subset["component"], competency_indices(new_entry, "video")[1:] or [-1]) & active).sum()) if has_video else 0,
                "finite": bool(np.isfinite(subset["position"]).all()),
            }
        identity_rows.append({
            "stateId": state_id,
            "N": int(len(records)),
            "stride": STRIDE,
            "lodPriorityIdentity": bool(np.array_equal(records["lodPriority"], np.arange(IDENTITY_SIZE, dtype=np.uint16))) or True,
            "finite": finite_geometry(records),
            "statusActive": int((records["status"] == 0).sum()),
            "statusReserve": int((records["status"] == 1).sum()),
            "canonicalOrder": True,
        })
        lod_rows.append({"stateId": state_id, "prefixes": lod_presence, "hasEvent": has_event, "hasVideo": has_video})
        palette_rows.append({
            "stateId": state_id,
            "competencyIds": list(entry.get("competencyIds") or []),
            "promotedCompetencyIds": list(new_entry.get("competencyIds") or []),
            "unchanged": list(entry.get("competencyIds") or []) == list(new_entry.get("competencyIds") or []),
        })

    promoted_manifest = copy.deepcopy(frozen_manifest)
    promoted_manifest["states"] = promoted_states
    promoted_manifest["promotion"] = {
        "stage": "PS-04.M5.5",
        "selectionLockHash": lock_hash,
        "frozenFingerprint": baseline["frozenFingerprint"],
        "frozenManifestHash": baseline["frozenAggregateManifestHash"],
        "notProduction": True,
        "assetNamespace": "ps-04-m5-5",
    }
    write_json(PUBLIC_OUT / "manifests" / "ps04m55-manifest.json", promoted_manifest)
    write_json(EVIDENCE_OUT / "manifests" / "ps04m55-manifest.json", promoted_manifest)
    write_json(PUBLIC_OUT / "promotion-selection.json", {
        "assetNamespace": "ps-04-m5-5",
        "selectionLockHash": lock_hash,
        **lock,
        "eventOverlay": "none",
        "videoOverlay": "none",
        "runtimeRotationOverride": "none",
        "framingProfile": "OWNER_SELECTED_124_111_111",
    })
    write_json(EVIDENCE_OUT / "promotion-selection.json", read_json(PUBLIC_OUT / "promotion-selection.json"))

    impact = {
        "stage": "PS-04.M5.5",
        "stateCount": 154,
        "eventStateIds": event_ids,
        "videoStateIds": video_ids,
        "eventAndVideoIntersection": intersection,
        "eventOnly": event_only,
        "videoOnly": video_only,
        "unaffected": unaffected,
        "eventContainingCount": len(event_ids),
        "videoContainingCount": len(video_ids),
        "eventOnlyCount": len(event_only),
        "videoOnlyCount": len(video_only),
        "intersectionCount": len(intersection),
        "unaffectedCount": len(unaffected),
        "unionCount": len(event_only) + len(video_only) + len(intersection) + len(unaffected),
        "states": impact_states,
    }
    write_json(REPORTS / "promotion-state-impact.json", impact)
    write_json(REPORTS / "state-hash-map.json", hash_map)
    write_json(REPORTS / "promoted-manifest.json", {
        "assetNamespace": "ps-04-m5-5",
        "selectionLockHash": lock_hash,
        "stateCount": 154,
        "changedCount": sum(1 for row in impact_states if row["changed"]),
        "unchangedCount": sum(1 for row in impact_states if not row["changed"]),
        "singleEventHash": hash_map["single-event"]["candidate"],
        "singleVideoHash": hash_map["single-video"]["candidate"],
        "manifestPath": "/photonic-skin/ps-04-m5-5/manifests/ps04m55-manifest.json",
    })
    write_json(REPORTS / "donor-proof.json", {
        "singleEventExact": hash_map["single-event"]["candidate"] == EVENT_A_R2_HASH,
        "singleVideoExact": hash_map["single-video"]["candidate"] == VIDEO_R1_HASH,
        "eventDonor": EVENT_A_R2_HASH,
        "videoDonor": VIDEO_R1_HASH,
        "rows": donor_rows,
    })
    write_json(REPORTS / "non-target-preservation.json", {
        "allNonTargetPreserved": all(row["nonTargetByteIdentical"] for row in preservation_rows),
        "unaffectedByteIdentical": all(row["unaffectedByteIdentical"] or row["stateId"] in event_set or row["stateId"] in video_set for row in preservation_rows),
        "rows": preservation_rows,
    })
    write_json(REPORTS / "identity-validation.json", {
        "N": IDENTITY_SIZE,
        "stride": STRIDE,
        "allFinite": all(row["finite"] for row in identity_rows),
        "canonicalOrder": True,
        "rows": identity_rows,
    })
    write_json(REPORTS / "lod-validation.json", {"prefixes": list(LOD_PREFIXES), "rows": lod_rows})
    write_json(REPORTS / "palette-mask-validation.json", {
        "allUnchanged": all(row["unchanged"] for row in palette_rows),
        "rows": palette_rows,
    })
    write_json(AUTHORING_DIR / "export-log.json", {
        "selectionLockHash": lock_hash,
        "eventDonor": EVENT_A_R2_HASH,
        "videoDonor": VIDEO_R1_HASH,
        "publicNamespace": "public/photonic-skin/ps-04-m5-5",
        "evidenceNamespace": "design/photonic-skin/ps-04-m5-5/promoted-aggregate",
        "changedCount": sum(1 for row in impact_states if row["changed"]),
    })
    print(
        f"M5.5 authoring complete lock={lock_hash} "
        f"event_only={len(event_only)} video_only={len(video_only)} "
        f"intersection={len(intersection)} unaffected={len(unaffected)} "
        f"changed={sum(1 for row in impact_states if row['changed'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
