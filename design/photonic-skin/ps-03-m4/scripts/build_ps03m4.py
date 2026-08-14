"""Deterministic PS-03.M4 orchestration build.

The build validates the frozen M3 contract, compiles only the risk/approval
suite, runs the 23,562-pair lightweight probe plus all 154 no-op probes, emits
golden evaluator fixtures and publishes M4-owned runtime assets.  It never
copies or rewrites an M3 state buffer.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np


SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from orchestration import (  # noqa: E402
    EXPECTED_M3,
    EXPORT_DIR,
    M3_MANIFEST_PATH,
    M4_DIR,
    PROFILE_DIR,
    PROGRAM_DIR,
    PUBLIC_DIR,
    REPORT_DIR,
    REPO_DIR,
    SCHEMA_DIR,
    aggregate_hash,
    deterministic_environment,
    file_hashes,
    frozen_m3_hashes,
    homepage_hashes,
    pretty_json_bytes,
    read_json,
    relative,
    safe_clean_outputs,
    select_risk_suite,
    sha256_bytes,
    sha256_file,
    stable_json_bytes,
    sync_public_m4,
    validate_frozen_m3,
    write_bytes,
    write_json,
)


BUILD_VERSION = "ps03m4-build-v2.0.0"
LAYOUT_VERSION = "ps03m4.program.v2"
PROFILE_FILE = PROFILE_DIR / "directed-plastic-release.profile.json"
SCHEMA_FILES = {
    "motionProfile": SCHEMA_DIR / "motion-profile.schema.json",
    "transitionRequest": SCHEMA_DIR / "transition-request.schema.json",
    "transitionProgram": SCHEMA_DIR / "transition-program.schema.json",
}

PROFILE_REQUIRED = {
    "schemaVersion",
    "profileId",
    "profileVersion",
    "triggerMode",
    "timingPolicy",
    "phasePolicy",
    "globalPosePolicy",
    "groupCoherencePolicy",
    "routeFieldPolicy",
    "splitMergePolicy",
    "reserveTransportPolicy",
    "featureProtectionPolicy",
    "orientationPolicy",
    "scalePolicy",
    "settlePolicy",
    "retargetPolicy",
    "lodPolicy",
    "reducedMotionPolicy",
    "validationPolicy",
    "provenance",
}

REQUEST_COMMON_REQUIRED = {
    "schemaVersion",
    "targetStateId",
    "identitySpaceVersion",
    "motionProfileId",
    "triggerMode",
    "viewportProfile",
    "directionIntent",
    "deterministicSeed",
}


def _load_core():
    import contracts as core_contracts
    from evaluator import evaluate
    from transition_compiler_v2 import compile_transition, decode_program, encode_program

    return core_contracts, compile_transition, encode_program, decode_program, evaluate


def _dtype_layout(dtype: np.dtype) -> dict[str, Any]:
    fields = []
    for name in dtype.names or ():
        field_dtype, offset = dtype.fields[name][:2]
        if field_dtype.subdtype is None:
            base_dtype = field_dtype
            shape: list[int] = []
        else:
            base_dtype, subshape = field_dtype.subdtype
            shape = [int(value) for value in subshape]
        fields.append({"name": name, "offset": int(offset), "dtype": base_dtype.str, "shape": shape})
    return {"stride": int(dtype.itemsize), "endianness": "little", "fields": fields}


def _as_payload(value: Any) -> bytes:
    if isinstance(value, bytes):
        return value
    if isinstance(value, bytearray):
        return bytes(value)
    if isinstance(value, memoryview):
        return value.tobytes()
    if isinstance(value, np.ndarray):
        return value.tobytes()
    raise TypeError(f"expected binary program payload, got {type(value).__name__}")


def _normalise_encoded(encoded: dict[str, Any]) -> tuple[dict[str, Any], bytes, bytes]:
    metadata = encoded.get("metadata")
    groups = encoded.get("groupTracks", encoded.get("group_bytes"))
    per_id = encoded.get("perId", encoded.get("perIdRecords", encoded.get("per_id_bytes")))
    if not isinstance(metadata, dict) or groups is None or per_id is None:
        raise ValueError("encode_program must return metadata, groupTracks and perId")
    # JSON round-trip catches numpy scalars or accidental non-contract objects.
    metadata = json.loads(pretty_json_bytes(metadata).decode("utf-8"))
    return metadata, _as_payload(groups), _as_payload(per_id)


def validate_contract_sources(profile: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    schema_hashes: dict[str, str] = {}
    schema_contracts: dict[str, Any] = {}
    for label, path in SCHEMA_FILES.items():
        if not path.is_file():
            errors.append(f"missing schema: {relative(path)}")
            continue
        schema = read_json(path)
        schema_contracts[label] = schema
        schema_hashes[label] = sha256_file(path)
        if schema.get("type") != "object":
            errors.append(f"{label} schema root type is not object")
        if not isinstance(schema.get("required"), list) or not schema.get("required"):
            errors.append(f"{label} schema has no required contract")
    missing_profile = sorted(PROFILE_REQUIRED - set(profile))
    if missing_profile:
        errors.append(f"motion profile missing fields: {missing_profile}")
    if not isinstance(profile.get("validationPolicy"), dict):
        errors.append("motion profile validationPolicy must be an object")
    profile_schema_required = set(schema_contracts.get("motionProfile", {}).get("required", []))
    if profile_schema_required and not profile_schema_required <= set(profile):
        errors.append("motion profile does not satisfy its schema required set")
    if errors:
        raise RuntimeError("M4 contract validation failed: " + "; ".join(errors))
    return {
        "motionProfileSchemaValid": True,
        "transitionRequestSchemaPresent": True,
        "transitionProgramSchemaPresent": True,
        "schemaHashes": schema_hashes,
        "motionProfileHash": sha256_bytes(stable_json_bytes(profile)),
        "profileRequiredFieldCount": len(PROFILE_REQUIRED),
    }


def build_config_hash(contract_validation: dict[str, Any], profile: dict[str, Any]) -> str:
    return sha256_bytes(
        stable_json_bytes(
            {
                "buildVersion": BUILD_VERSION,
                "layoutVersion": LAYOUT_VERSION,
                "m3": EXPECTED_M3,
                "schemas": contract_validation["schemaHashes"],
                "profileHash": contract_validation["motionProfileHash"],
                "profileVersion": profile["profileVersion"],
                "pairProbe": {"identityCount": 512, "directedPairCount": 23562, "selfPairCount": 154},
                "fullNSuiteMinimum": 32,
            }
        )
    )


def make_request(
    source_id: str,
    target_id: str,
    profile: dict[str, Any],
    *,
    trigger: str = "qa",
    viewport: str = "desktop",
    probe_count: int | None = None,
    source_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    seed_hash = sha256_bytes(f"{source_id}\0{target_id}\0{trigger}\0{viewport}".encode("utf-8"))
    request: dict[str, Any] = {
        "schemaVersion": "1.0.0",
        "sourceStateId": source_id,
        "targetStateId": target_id,
        "identitySpaceVersion": EXPECTED_M3["identitySpaceVersion"],
        "motionProfileId": profile["profileId"],
        "triggerMode": trigger,
        "viewportProfile": viewport,
        # "auto" is resolved from endpoint/group geometry by the compiler.
        # An explicit vector is an optional Lab override, never the core default.
        "directionIntent": "auto",
        "deterministicSeed": int(seed_hash[:8], 16),
    }
    if probe_count is not None:
        request["probeIdentityCount"] = int(probe_count)
    if source_snapshot is not None:
        request.pop("sourceStateId", None)
        request["sourceSnapshot"] = source_snapshot
    missing = REQUEST_COMMON_REQUIRED - set(request)
    if missing:
        raise AssertionError(f"internal TransitionRequest missing fields: {sorted(missing)}")
    if ("sourceStateId" in request) == ("sourceSnapshot" in request):
        raise AssertionError("TransitionRequest requires exactly one of sourceStateId/sourceSnapshot")
    return request


def _program_paths(program_id: str) -> tuple[Path, Path, Path]:
    root = PROGRAM_DIR / "approval"
    return (
        root / f"{program_id}.program.json",
        root / f"{program_id}.groups.bin",
        root / f"{program_id}.ids.bin",
    )


def compile_approval_programs(
    manifest: dict[str, Any],
    profile: dict[str, Any],
    suite: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    core_contracts, compile_transition, encode_program, _, _ = _load_core()
    from m3_adapter import load_m3_state

    by_id = {entry["stateId"]: entry for entry in manifest["states"]}
    program_entries: list[dict[str, Any]] = []
    compiled_cache: dict[str, Any] = {}
    compile_seconds: list[float] = []
    for row in suite:
        index = int(row["suiteIndex"])
        source_entry = by_id[row["sourceStateId"]]
        target_entry = by_id[row["targetStateId"]]
        _, source = load_m3_state(source_entry)
        _, target = load_m3_state(target_entry)
        request = make_request(source_entry["stateId"], target_entry["stateId"], profile)
        started = time.perf_counter()
        program = compile_transition(request, source_entry, source, target_entry, target, profile)
        compile_seconds.append(time.perf_counter() - started)
        encoded = encode_program(program)
        metadata, group_payload, per_id_payload = _normalise_encoded(encoded)
        artifact_id = f"p{index:03d}-{sha256_bytes(stable_json_bytes(request))[:12]}"
        metadata = dict(metadata)
        program_id = str(metadata.get("programId", artifact_id))
        metadata_path, group_path, per_id_path = _program_paths(artifact_id)
        metadata_payload = pretty_json_bytes(metadata)
        write_bytes(metadata_path, metadata_payload)
        write_bytes(group_path, group_payload)
        write_bytes(per_id_path, per_id_payload)
        content_hash = sha256_bytes(
            stable_json_bytes(
                {
                    "metadata": sha256_bytes(metadata_payload),
                    "groupTracks": sha256_bytes(group_payload),
                    "perId": sha256_bytes(per_id_payload),
                }
            )
        )
        entry = {
            "programId": program_id,
            "artifactId": artifact_id,
            "sourceStateId": source_entry["stateId"],
            "targetStateId": target_entry["stateId"],
            "sourceStateHash": source_entry["contentHash"],
            "targetStateHash": target_entry["contentHash"],
            "motionProfileHash": sha256_bytes(stable_json_bytes(profile)),
            "requestHash": sha256_bytes(stable_json_bytes(request)),
            "metadataPath": metadata_path.relative_to(M4_DIR).as_posix(),
            "metadataBytes": len(metadata_payload),
            "metadataSha256": sha256_bytes(metadata_payload),
            "groupTrackPath": group_path.relative_to(M4_DIR).as_posix(),
            "groupTrackBytes": len(group_payload),
            "groupTrackSha256": sha256_bytes(group_payload),
            "perIdPath": per_id_path.relative_to(M4_DIR).as_posix(),
            "perIdBytes": len(per_id_payload),
            "perIdSha256": sha256_bytes(per_id_payload),
            "contentHash": content_hash,
            "coverage": row["coverage"],
            "risk": row["risk"],
            "identityCount": len(source),
        }
        program_entries.append(entry)
        compiled_cache[program_id] = program
    program_entries.sort(key=lambda item: item["programId"])
    return program_entries, {
        "programs": compiled_cache,
        "compileSeconds": compile_seconds,
        "groupTrackStride": int(core_contracts.GROUP_TRACK_DTYPE.itemsize),
        "perIdStride": int(core_contracts.PER_ID_DTYPE.itemsize),
    }


def _deterministic_artifacts() -> list[Path]:
    paths: list[Path] = []
    for root in (SCHEMA_DIR, PROFILE_DIR, PROGRAM_DIR, EXPORT_DIR / "runtime"):
        if root.exists():
            paths.extend(path for path in root.rglob("*") if path.is_file())
    for name in (
        "ps03m4-input-guards.json",
        "ps03m4-risk-suite.json",
        "ps03m4-pair-probe-summary.json",
        "ps03m4-self-transition-qa.json",
        "ps03m4-full-n-qa.json",
        "ps03m4-m3-vs-m4.json",
        "ps03m4-qa-summary.json",
    ):
        path = REPORT_DIR / name
        if path.exists():
            paths.append(path)
    return sorted(set(paths))


def build(*, clean: bool = False, skip_pair_probe: bool = False) -> dict[str, Any]:
    started = time.perf_counter()
    m3_hashes_before = frozen_m3_hashes()
    homepage_before = homepage_hashes()
    if clean:
        safe_clean_outputs(include_renders=False)

    manifest_m3, determinism_m3, baseline_checks = validate_frozen_m3()
    if not PROFILE_FILE.is_file():
        raise RuntimeError(f"missing motion profile: {relative(PROFILE_FILE)}")
    profile = read_json(PROFILE_FILE)
    contract_validation = validate_contract_sources(profile)
    config_hash = build_config_hash(contract_validation, profile)

    input_guard = {
        "stage": "PS-03.M4",
        "guardVersion": "1.0.0",
        "m3ManifestPath": relative(M3_MANIFEST_PATH),
        "m3Expected": EXPECTED_M3,
        "m3Checks": baseline_checks,
        "m3FrozenFileCount": len(m3_hashes_before),
        "m3FrozenAggregateSha256": aggregate_hash(m3_hashes_before),
        "homepageFileCount": len(homepage_before),
        "homepageAggregateSha256": aggregate_hash(homepage_before),
        "motionProfileHash": contract_validation["motionProfileHash"],
        "schemaHashes": contract_validation["schemaHashes"],
        "buildConfigHash": config_hash,
    }
    write_json(REPORT_DIR / "ps03m4-input-guards.json", input_guard)

    suite = select_risk_suite(manifest_m3, minimum=32)
    suite_report = {
        "stage": "PS-03.M4",
        "selectionVersion": "ps03m4-risk-v1",
        "minimumRequired": 32,
        "selectedCount": len(suite),
        "selectionUsesOnlyMeasuredStateMetrics": True,
        "nameUse": "approval/report labels only; compiler receives declarative records",
        "coverage": sorted({label for row in suite for label in row["coverage"]}),
        "transitions": suite,
    }
    write_json(REPORT_DIR / "ps03m4-risk-suite.json", suite_report)
    program_entries, compile_stats = compile_approval_programs(manifest_m3, profile, suite)

    from qa_ps03m4 import (  # local import avoids a build/QA import cycle
        build_golden_fixtures,
        run_full_n_qa,
        run_pair_probe,
        run_self_transition_probe,
    )

    if skip_pair_probe:
        pair_probe = {
            "stage": "PS-03.M4",
            "status": "not-run",
            "reason": "--skip-pair-probe is a developer-only partial build and is not acceptance evidence",
            "directedPairCount": 0,
            "expectedDirectedPairCount": 23562,
        }
    else:
        pair_probe = run_pair_probe(manifest_m3, profile)
    write_json(REPORT_DIR / "ps03m4-pair-probe-summary.json", pair_probe)

    self_report = run_self_transition_probe(manifest_m3, profile)
    write_json(REPORT_DIR / "ps03m4-self-transition-qa.json", self_report)
    full_n_report = run_full_n_qa(manifest_m3, profile, program_entries)
    write_json(REPORT_DIR / "ps03m4-full-n-qa.json", full_n_report)
    golden = build_golden_fixtures(manifest_m3, profile, program_entries)
    write_json(EXPORT_DIR / "runtime" / "ps03m4-golden-fixtures.json", golden)

    core_contracts, _, _, _, _ = _load_core()
    runtime_layout = {
        "layoutVersion": LAYOUT_VERSION,
        "endianness": "little",
        "groupTracks": _dtype_layout(core_contracts.GROUP_TRACK_DTYPE),
        "perId": _dtype_layout(core_contracts.PER_ID_DTYPE),
        "stateInput": {"owner": "frozen PS-03.M3", "stride": EXPECTED_M3["stateRecordStride"]},
        "loadPolicy": "source/target M3 states and M4 program loaded on demand; no M3 states copied into M4",
    }
    write_json(EXPORT_DIR / "runtime" / "ps03m4-runtime-layout.json", runtime_layout)

    # Aggregate only deterministic sources and measurements.  Wall clock/media
    # evidence are written separately and excluded by construction.
    pre_manifest_hashes = file_hashes(_deterministic_artifacts())
    content_hash = aggregate_hash(pre_manifest_hashes)
    aggregate = {
        "stage": "PS-03.M4",
        "schemaVersion": "1.0.0",
        "buildVersion": BUILD_VERSION,
        "buildConfigHash": config_hash,
        "aggregateContentHash": content_hash,
        "deterministicArtifactCount": len(pre_manifest_hashes),
        "status": "machine-valid if ps03m4-qa-summary.json passes; requires human approval to close PS-03",
        "frozenM3": {
            "manifestPath": "/photonic-skin/ps-03-m3/manifest.json",
            "manifestSha256": EXPECTED_M3["manifestSha256"],
            "deterministicFingerprint": manifest_m3["deterministicFingerprint"],
            "deterministicAggregateSha256": determinism_m3["secondAggregateSha256"],
            "identitySpaceVersion": manifest_m3["identitySpace"]["identitySpaceVersion"],
            "identityCount": manifest_m3["identitySpace"]["size"],
            "stateCount": manifest_m3["stateCount"],
            "stateRecordStride": manifest_m3["stateRecordLayout"]["stride"],
            "stateBuffersCopiedIntoM4": False,
        },
        "motionProfile": {
            "profileId": profile["profileId"],
            "profileVersion": profile["profileVersion"],
            "path": f"motion-profiles/{PROFILE_FILE.name}",
            "contentHash": contract_validation["motionProfileHash"],
        },
        "schemas": {
            label: {"path": f"schemas/{path.name}", "sha256": contract_validation["schemaHashes"][label]}
            for label, path in SCHEMA_FILES.items()
        },
        "programLayout": runtime_layout,
        "precompiledProgramPolicy": "approval and QA risk suite only; arbitrary pairs compile on demand",
        "precompiledProgramCount": len(program_entries),
        "programs": program_entries,
        "pairCoverage": {
            "directedNonSelfExpected": 23562,
            "directedNonSelfProbed": pair_probe.get("directedPairCount", 0),
            "probeIdentityCount": pair_probe.get("probeIdentityCount", 512),
            "selfExpected": 154,
            "selfProbed": self_report.get("selfTransitionCount", 0),
            "fullNRiskSuiteMinimum": 32,
            "fullNRiskSuiteCount": len(program_entries),
        },
        "goldenFixtures": {
            "path": "runtime/ps03m4-golden-fixtures.json",
            "contentHash": sha256_file(EXPORT_DIR / "runtime" / "ps03m4-golden-fixtures.json"),
            "timeGrid": golden["timeGrid"],
            "programCount": golden["programCount"],
        },
        "reports": {
            "inputGuards": "reports/ps03m4-input-guards.json",
            "riskSuite": "reports/ps03m4-risk-suite.json",
            "pairProbe": "reports/ps03m4-pair-probe-summary.json",
            "selfTransitions": "reports/ps03m4-self-transition-qa.json",
            "fullNQa": "reports/ps03m4-full-n-qa.json",
            "qaSummary": "reports/ps03m4-qa-summary.json",
            "m3VsM4": "reports/ps03m4-m3-vs-m4.json",
            "visualEvidence": "reports/ps03m4-visual-evidence.json",
        },
        "lod": {"levels": [512, 1024, 2048, 4096, 8192, 12288, 16384], "idsRenumbered": False},
        "approval": {
            "machineStatus": "pending aggregate QA",
            "visualStatus": "pending offline/browser review",
            "humanStatus": "requires human approval",
        },
    }
    write_json(EXPORT_DIR / "ps03m4-manifest.json", aggregate)

    copied = sync_public_m4()
    write_bytes(PUBLIC_DIR / "manifest.json", pretty_json_bytes(aggregate))

    from qa_ps03m4 import run_aggregate_qa

    qa_summary, comparison = run_aggregate_qa(write=True)
    aggregate["approval"]["machineStatus"] = "machine-valid" if qa_summary["allRequiredChecksPassed"] else "machine-invalid"
    aggregate["approval"]["visualStatus"] = "requires render_ps03m4.py and model review"
    aggregate["reportsContentHashes"] = {
        "qaSummary": sha256_file(REPORT_DIR / "ps03m4-qa-summary.json"),
        "m3VsM4": sha256_file(REPORT_DIR / "ps03m4-m3-vs-m4.json"),
    }
    # QA reports are deterministic and are now part of the aggregate content
    # hash.  The manifest itself remains outside its own hash closure.
    final_hashes = file_hashes(_deterministic_artifacts())
    aggregate["aggregateContentHash"] = aggregate_hash(final_hashes)
    aggregate["deterministicArtifactCount"] = len(final_hashes)
    write_json(EXPORT_DIR / "ps03m4-manifest.json", aggregate)
    write_bytes(PUBLIC_DIR / "manifest.json", pretty_json_bytes(aggregate))

    m3_hashes_after = frozen_m3_hashes()
    homepage_after = homepage_hashes()
    if m3_hashes_before != m3_hashes_after:
        raise RuntimeError("M4 build mutated frozen M3 files")
    if homepage_before != homepage_after:
        raise RuntimeError("M4 build mutated production homepage/package inputs")

    performance = {
        "stage": "PS-03.M4",
        "measurementScope": "local CPU offline build only",
        "measured": True,
        "wallSeconds": time.perf_counter() - started,
        "programCompileSeconds": {
            "count": len(compile_stats["compileSeconds"]),
            "median": float(np.median(compile_stats["compileSeconds"])),
            "p95": float(np.quantile(compile_stats["compileSeconds"], 0.95)),
            "max": float(np.max(compile_stats["compileSeconds"])),
        },
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "environment": deterministic_environment(),
        "browserGpuPerformance": "not measured by offline build",
        "mediaEncoding": "not measured; excluded from deterministic contract",
        "publicM4AssetCount": len([path for path in PUBLIC_DIR.rglob("*") if path.is_file()]),
        "publicSyncInitialCopyCount": len(copied),
    }
    write_json(REPORT_DIR / "ps03m4-build-performance.json", performance)
    print(
        "PS-03.M4 built: "
        f"programs={len(program_entries)} pairs={pair_probe.get('directedPairCount', 0)} "
        f"self={self_report.get('selfTransitionCount', 0)} hash={aggregate['aggregateContentHash']}"
    )
    return aggregate


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--clean", action="store_true", help="remove only generated M4 programs/exports/reports/public assets")
    parser.add_argument("--skip-pair-probe", action="store_true", help="developer partial build; not valid acceptance evidence")
    args = parser.parse_args()
    build(clean=args.clean, skip_pair_probe=args.skip_pair_probe)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
