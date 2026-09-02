"""PS-04.M6.1 — offline exact GATHER/DRIVE authoring for all 120 multi-sets.

Writes only the 230 missing project-complex definitions. Frozen M5.5 prefix
GATHER/DRIVE and MASTER/SINGLE stay referenced, never copied. No runtime overlay.
"""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import sys
import time
from itertools import combinations
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
PHOTONIC_DIR = STAGE_DIR.parent
REPO_DIR = PHOTONIC_DIR.parents[1]
M3_DIR = PHOTONIC_DIR / "ps-03-m3"
M31_DIR = PHOTONIC_DIR / "ps-03-m3-1"
M31R_DIR = PHOTONIC_DIR / "ps-03-m3-1r"
M55_DIR = PHOTONIC_DIR / "ps-04-m5-5"
PUBLIC_M55 = REPO_DIR / "public" / "photonic-skin" / "ps-04-m5-5"
PUBLIC_OUT = REPO_DIR / "public" / "photonic-skin" / "ps-04-m6-1"
REPORTS = STAGE_DIR / "reports"
AUTHORING = STAGE_DIR / "authoring"
RESOLVED = STAGE_DIR / "states" / "resolved"

for path in (M3_DIR / "scripts", M31_DIR / "scripts", M31R_DIR / "scripts", M55_DIR / "scripts"):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import state_builder as m3  # noqa: E402
import build_ps03m31 as m31  # noqa: E402
import build_promoted_aggregate as m55  # noqa: E402
from m31r_core import (  # noqa: E402
    presentation_frame,
    refresh_machine_qa,
    transform_event_records,
    updated_bounds,
)

ORDER = ("content", "design", "digital", "event", "games", "merch", "video")
EXISTING_PREFIX = {
    ("content", "design"),
    ("content", "design", "digital"),
    ("content", "design", "digital", "event"),
    ("content", "design", "digital", "event", "games"),
    ("content", "design", "digital", "event", "games", "merch"),
}
ALL_SEVEN = tuple(ORDER)
EVENT_YAW = 18.0
IDENTITY_SIZE = 16384
STRIDE = 40
LOD_PREFIXES = (512, 1024, 2048, 4096, 8192, 12288, 16384)
STAGE = "PS-04.M6.1"
BUILD_VERSION = "ps04m61-project-complex-builder-v1"


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def pretty_json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n").encode("utf-8")


def write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == payload:
        return
    path.write_bytes(payload)


def write_json(path: Path, value: object) -> None:
    write_bytes(path, pretty_json_bytes(value))


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def multi_sets() -> list[tuple[str, ...]]:
    output: list[tuple[str, ...]] = []
    for cardinality in range(2, 8):
        output.extend(combinations(ORDER, cardinality))
    return output


def state_id(mode: str, competencies: tuple[str, ...]) -> str:
    return f"complex-{mode.lower()}-{'-'.join(competencies)}"


def finite_geometry(records: np.ndarray) -> bool:
    normals = records["normal"].astype(np.float64) / 32767.0
    return bool(
        np.isfinite(records["position"]).all()
        and np.isfinite(normals).all()
        and np.isfinite(records["orientation"]).all()
    )


def owners_from_map(component_map: list[dict]) -> list[str]:
    owners: list[str] = []
    for item in component_map:
        owner = item.get("competencyId")
        if owner and owner not in owners:
            owners.append(owner)
    return owners


def required_new_jobs() -> list[tuple[str, tuple[str, ...], str]]:
    jobs: list[tuple[str, tuple[str, ...], str]] = []
    for competencies in multi_sets():
        reuse_m55 = competencies in EXISTING_PREFIX
        for mode in ("GATHER", "DRIVE"):
            if reuse_m55:
                continue
            kind = "brand-wide-reuse" if competencies == ALL_SEVEN else "assemble"
            jobs.append((mode, competencies, kind))
    return jobs


def copy_brand_wide(mode: str, m55_manifest: dict) -> tuple[bytes, dict, list[dict], dict]:
    source_id = f"brand-wide-{mode.lower()}-{'-'.join(ALL_SEVEN)}"
    source = next(item for item in m55_manifest["states"] if item["stateId"] == source_id)
    payload = (PUBLIC_M55 / source["bufferPath"]).read_bytes()
    if sha256_bytes(payload) != source["contentHash"]:
        raise SystemExit(f"M5.5 {source_id} hash mismatch")
    donors = source.get("promotion", {}).get("donors", [])
    if "EVENT_A_R2" not in donors or "VIDEO_COMBO_40_R1" not in donors:
        raise SystemExit(f"{source_id} is missing frozen Event/Video donors")
    entry = copy.deepcopy(source)
    new_id = state_id(mode, ALL_SEVEN)
    entry["stateId"] = new_id
    entry["stateRole"] = "complex"
    entry["baselineStateId"] = source_id
    entry["displayName"] = f"COMPLEX / {mode.title()} / " + " + ".join(item.title() for item in ALL_SEVEN)
    entry["bufferPath"] = f"states/{new_id}.state.bin"
    entry["promotion"] = {
        "donors": donors,
        "changed": False,
        "proof": ["brand-wide-geometry-reused-as-project-complex"],
        "sourceStateId": source_id,
    }
    map_path = PUBLIC_M55 / "component-maps" / f"{source_id}.json"
    component_map = read_json(map_path)["componentMap"] if map_path.exists() else source.get("componentMap", [])
    entry["componentMap"] = copy.deepcopy(component_map)
    definition = {
        "stateId": new_id,
        "stateRole": "complex",
        "compositionMode": mode,
        "competencyIds": list(ALL_SEVEN),
        "focusCompetencyId": None,
        "provenance": {
            "stage": STAGE,
            "builder": BUILD_VERSION,
            "reuse": source_id,
        },
    }
    return payload, entry, copy.deepcopy(component_map), definition


def assemble_complex(
    mode: str,
    competencies: tuple[str, ...],
    *,
    library: dict,
    targets: dict,
    sources: dict,
    descriptors: dict,
    identity_size: int,
    master_area: float,
    baseline_definition: dict,
    event_a: np.ndarray,
    event_ar2: np.ndarray,
    video_donor: np.ndarray,
) -> tuple[bytes, dict, list[dict], dict]:
    new_id = state_id(mode, competencies)
    baseline_entry = {
        "stateId": new_id,
        "stateRole": "complex",
        "compositionMode": mode,
        "competencyIds": list(competencies),
        "focusCompetencyId": None,
        "definitionHash": "m61-new",
        "contentHash": "m61-new",
        "isCanonicalCombination": True,
    }
    definition, component_map = m31.build_definition(
        baseline_entry,
        baseline_definition,
        library,
        sources,
        descriptors,
        identity_size,
    )
    definition["provenance"]["stage"] = STAGE
    definition["provenance"]["builder"] = BUILD_VERSION
    definition["stateVersion"] = "3.1.1"
    geometry = m3.build_geometry(definition, targets, float(library["v0"]), master_area)
    records, qa = m3.build_state_records(geometry, identity_size, master_area)
    entry = m3.state_manifest_entry(geometry, records, qa, f"states/{new_id}.state.bin")
    entry["isCanonicalCombination"] = True
    entry["componentMap"] = component_map
    entry["displayName"] = m31.display_name(baseline_entry)
    entry["stateVersion"] = "3.1.1"

    if "event" in competencies:
        records = transform_event_records(records, entry, definition, EVENT_YAW)
        proof_event = m55.apply_event_a_r2(records, entry, definition, event_a, event_ar2)
        entry = m55.force_viewer_right_profiles(entry)
        event_proof = ["event-m31r-yaw-18", proof_event]
    else:
        event_proof = []
    if "video" in competencies:
        video_proof = m55.apply_video_combo(records, entry, video_donor)
        video_proofs = [video_proof]
    else:
        video_proofs = []

    if not finite_geometry(records):
        raise SystemExit(f"non-finite geometry: {new_id}")
    if len(records) != IDENTITY_SIZE or records.nbytes != IDENTITY_SIZE * STRIDE:
        raise SystemExit(f"identity/stride changed: {new_id}")

    owners = owners_from_map(entry["componentMap"])
    if owners != list(competencies):
        raise SystemExit(f"owner mismatch {new_id}: {owners} != {list(competencies)}")

    payload = records.tobytes()
    entry["contentHash"] = sha256_bytes(payload)
    entry["bufferBytes"] = len(payload)
    entry["bounds"] = updated_bounds(records)
    entry["machineQa"] = refresh_machine_qa(records, entry.get("machineQa", qa))
    entry["presentationFrame"] = presentation_frame(records)
    entry["promotion"] = {
        "donors": (
            (["EVENT_A_R2"] if "event" in competencies else [])
            + (["VIDEO_COMBO_40_R1"] if "video" in competencies else [])
        ),
        "changed": True,
        "proof": event_proof + video_proofs or ["assembled-exact-selected-set"],
    }
    return payload, entry, entry["componentMap"], definition


def frozen_resolver_map(m55_manifest: dict) -> dict[str, dict]:
    mapping: dict[str, dict] = {}
    wanted = {"master-neutral"}
    for competency in ORDER:
        wanted.add(f"single-{competency}")
    for competencies in EXISTING_PREFIX:
        wanted.add(state_id("GATHER", competencies))
        wanted.add(state_id("DRIVE", competencies))
    by_id = {item["stateId"]: item for item in m55_manifest["states"]}
    for state in sorted(wanted):
        entry = by_id[state]
        mapping[state] = {
            "namespace": "ps-04-m5-5",
            "stateId": state,
            "contentHash": entry["contentHash"],
            "bufferPath": entry["bufferPath"],
        }
    return mapping


def main() -> int:
    started = time.perf_counter()
    jobs = required_new_jobs()
    if len(jobs) != 230:
        raise SystemExit(f"expected 230 jobs, got {len(jobs)}")

    m55_manifest = read_json(PUBLIC_M55 / "manifests" / "ps04m55-manifest.json")
    if len(m55_manifest["states"]) != 154:
        raise SystemExit("M5.5 is not 154 states")
    frozen_m55_hash = sha256_file(PUBLIC_M55 / "manifests" / "ps04m55-manifest.json")

    event_a = m55.load_records(m55.EVENT_A_PATH)
    event_ar2_path = m55.EVENT_A_R2_PATH if m55.EVENT_A_R2_PATH.exists() else m55.EVENT_A_R2_PUBLIC
    event_ar2 = m55.load_records(event_ar2_path)
    if sha256_file(event_ar2_path) != m55.EVENT_A_R2_HASH:
        raise SystemExit("EVENT_A_R2 hash mismatch")
    video_path = m55.VIDEO_R1_PATH if m55.VIDEO_R1_PATH.exists() else m55.VIDEO_R1_PUBLIC
    video_donor = m55.load_records(video_path)
    if sha256_file(video_path) != m55.VIDEO_R1_HASH:
        raise SystemExit("VIDEO_COMBO_40_R1 hash mismatch")

    library, targets = m3.load_sources()
    sources = m31.source_map(targets)
    descriptor_payload = read_json(M31_DIR / "descriptors" / "presentation-descriptors.json")
    descriptors = m31.descriptor_map(descriptor_payload)
    baseline = read_json(M3_DIR / "exports" / "ps03m3-manifest.json")
    identity_size = int(baseline["identitySpace"]["size"])
    master_area = float(baseline["masterSurfaceArea"])
    baseline_definition = read_json(M31_DIR / "states" / "resolved" / "complex-gather-content-design.state.json")

    resolver_map = frozen_resolver_map(m55_manifest)
    new_states: list[dict] = []
    asset_rows: list[dict] = []
    identity_rows: list[dict] = []
    rebuild_hashes: dict[str, str] = {}

    for index, (mode, competencies, kind) in enumerate(jobs, start=1):
        new_id = state_id(mode, competencies)
        print(f"[{index}/230] {kind} {new_id}", flush=True)
        if kind == "brand-wide-reuse":
            payload, entry, component_map, definition = copy_brand_wide(mode, m55_manifest)
        else:
            payload, entry, component_map, definition = assemble_complex(
                mode,
                competencies,
                library=library,
                targets=targets,
                sources=sources,
                descriptors=descriptors,
                identity_size=identity_size,
                master_area=master_area,
                baseline_definition=baseline_definition,
                event_a=event_a,
                event_ar2=event_ar2,
                video_donor=video_donor,
            )
        write_bytes(PUBLIC_OUT / "states" / f"{new_id}.state.bin", payload)
        write_bytes(STAGE_DIR / "promoted-aggregate" / "states" / f"{new_id}.state.bin", payload)
        write_json(PUBLIC_OUT / "component-maps" / f"{new_id}.json", {"stateId": new_id, "componentMap": component_map})
        write_json(RESOLVED / f"{new_id}.state.json", definition)
        new_states.append(entry)
        resolver_map[new_id] = {
            "namespace": "ps-04-m6-1",
            "stateId": new_id,
            "contentHash": entry["contentHash"],
            "bufferPath": entry["bufferPath"],
        }
        rebuild_hashes[new_id] = entry["contentHash"]
        records = np.frombuffer(payload, dtype=m3.STATE_DTYPE)
        owners = owners_from_map(component_map)
        unselected = [item for item in owners if item not in competencies]
        asset_rows.append({
            "stateId": new_id,
            "mode": mode,
            "competencies": list(competencies),
            "owners": owners,
            "unselectedOwners": unselected,
            "namespace": "ps-04-m6-1",
            "contentHash": entry["contentHash"],
            "donors": entry.get("promotion", {}).get("donors", []),
            "kind": kind,
            "N": int(len(records)),
            "stride": STRIDE,
            "finite": finite_geometry(records),
        })
        lod = {}
        order = np.argsort(records["lodPriority"], kind="stable")
        for prefix in LOD_PREFIXES:
            subset = records[order[:prefix]]
            lod[str(prefix)] = {
                "active": int((subset["status"] == 0).sum()),
                "finite": bool(np.isfinite(subset["position"]).all()),
            }
        identity_rows.append({
            "stateId": new_id,
            "N": IDENTITY_SIZE,
            "stride": STRIDE,
            "lodPrefixes": lod,
            "finite": finite_geometry(records),
        })

    if len(new_states) != 230:
        raise SystemExit(f"authored {len(new_states)} != 230")

    delta = {
        "stage": STAGE,
        "builder": BUILD_VERSION,
        "frozenPayloadNamespace": "ps-04-m5-5",
        "frozenManifestSha256": frozen_m55_hash,
        "frozenStateCount": 154,
        "newStateCount": 230,
        "identitySpace": m55_manifest["identitySpace"],
        "stateRecordLayout": m55_manifest["stateRecordLayout"],
        "presentationContract": m55_manifest["presentationContract"],
        "event": {"id": "EVENT_A_R2", "hash": m55.EVENT_A_R2_HASH},
        "video": {"id": "VIDEO_COMBO_40_R1", "hash": m55.VIDEO_R1_HASH},
        "states": new_states,
        "resolverMap": resolver_map,
        "notProduction": True,
        "overlays": "none",
        "runtimeRotationOverride": "none",
    }
    write_json(PUBLIC_OUT / "manifests" / "ps04m61-delta-manifest.json", delta)
    write_json(STAGE_DIR / "promoted-aggregate" / "manifests" / "ps04m61-delta-manifest.json", delta)
    write_json(AUTHORING / "required-jobs.json", {
        "count": 230,
        "jobs": [{"mode": mode, "competencies": list(competencies), "kind": kind} for mode, competencies, kind in jobs],
    })
    write_json(AUTHORING / "rebuild-hashes.json", rebuild_hashes)
    write_json(REPORTS / "asset-integrity.json", {
        "newStateCount": 230,
        "allExactOwners": all(not row["unselectedOwners"] and row["owners"] == row["competencies"] for row in asset_rows),
        "allFinite": all(row["finite"] for row in asset_rows),
        "frozenManifestSha256": frozen_m55_hash,
        "rows": asset_rows,
    })
    write_json(REPORTS / "identity-lod.json", {
        "N": IDENTITY_SIZE,
        "stride": STRIDE,
        "prefixes": list(LOD_PREFIXES),
        "allFinite": all(row["finite"] for row in identity_rows),
        "rows": identity_rows,
    })
    write_json(REPORTS / "resolver-map.json", resolver_map)
    elapsed = time.perf_counter() - started
    write_json(AUTHORING / "export-log.json", {
        "newStateCount": 230,
        "elapsedSec": elapsed,
        "publicNamespace": "public/photonic-skin/ps-04-m6-1",
        "frozenPayload": "ps-04-m5-5",
    })
    print(f"M6.1 authoring complete 230/230 elapsed={elapsed:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
