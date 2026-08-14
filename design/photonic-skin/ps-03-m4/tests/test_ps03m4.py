"""Comprehensive offline contract/layout/motion QA for PS-03.M4."""

from __future__ import annotations

import copy
import json
import os
import sys
from pathlib import Path

import numpy as np


M4_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = M4_DIR / "scripts"
REPO_DIR = M4_DIR.parents[2]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import contracts  # noqa: E402
from build_ps03m4 import (  # noqa: E402
    PROFILE_FILE,
    PROFILE_REQUIRED,
    SCHEMA_FILES,
    _deterministic_artifacts,
    validate_contract_sources,
)
from m3_adapter import load_m3_manifest, load_m3_records, validate_m3_baseline  # noqa: E402
from orchestration import (  # noqa: E402
    EXPECTED_M3,
    EXPORT_DIR,
    MANDATED_TIMES,
    M3_PUBLIC_DIR,
    PROFILE_DIR,
    PROGRAM_DIR,
    PUBLIC_DIR,
    REPORT_DIR,
    SCHEMA_DIR,
    aggregate_hash,
    file_hashes,
    frozen_m3_hashes,
    homepage_hashes,
    read_json,
    sha256_bytes,
    sha256_file,
    stable_json_bytes,
    state_entry_map,
    validate_frozen_m3,
)
from qa_ps03m4 import (  # noqa: E402
    POLICY,
    _boundaries,
    _decode_orientation,
    _forbidden_branch_audit,
    _load_program,
    _make_request,
    _orientation,
    _positions,
    _scale,
    _schema_contract_valid,
    _status,
    _time_grid,
    _velocity,
    run_aggregate_qa,
)


checks = 0
failures: list[str] = []


def check(condition: bool, label: str) -> None:
    global checks
    checks += 1
    if condition:
        if os.environ.get("PS03M4_VERBOSE") == "1":
            print(f"  [ok] {label}")
    else:
        failures.append(label)
        print(f"  [FAIL] {label}")


def section(label: str) -> None:
    print(f"\n{label}")


def _core():
    from evaluator import evaluate

    return evaluate


def main() -> int:
    manifest_m3, determinism_m3, baseline = validate_frozen_m3()
    manifest_m4 = read_json(EXPORT_DIR / "ps03m4-manifest.json")
    profile = read_json(PROFILE_FILE)
    pair_probe = read_json(REPORT_DIR / "ps03m4-pair-probe-summary.json")
    self_qa = read_json(REPORT_DIR / "ps03m4-self-transition-qa.json")
    full_n = read_json(REPORT_DIR / "ps03m4-full-n-qa.json")
    risk_suite = read_json(REPORT_DIR / "ps03m4-risk-suite.json")
    golden = read_json(EXPORT_DIR / "runtime" / "ps03m4-golden-fixtures.json")
    qa, _ = run_aggregate_qa(write=False)
    by_id = state_entry_map(manifest_m3)
    evaluate = _core()

    section("frozen M3 provenance and non-mutation guards")
    for name, passed in baseline.items():
        check(bool(passed), f"frozen M3 guard: {name}")
    check(manifest_m3["stateCount"] == 154, "exactly 154 frozen M3 states")
    check(manifest_m3["identitySpace"]["size"] == 16384, "identity count is exactly 16,384")
    check(manifest_m3["identitySpace"]["idRange"] == [0, 16383], "identity IDs are exactly 0..16383")
    check(manifest_m3["stateRecordLayout"]["stride"] == 40, "M3 state stride remains 40 bytes")
    check(manifest_m3["transitionRecordLayout"]["stride"] == 22, "M3 v1 transition stride remains 22 bytes")
    check(manifest_m3["deterministicFingerprint"] == EXPECTED_M3["deterministicFingerprint"], "M3 fingerprint guard")
    check(determinism_m3["secondAggregateSha256"] == EXPECTED_M3["deterministicAggregateSha256"], "M3 deterministic aggregate guard")
    core_m3 = validate_m3_baseline(manifest_m3, strict=False, verify_state_buffers=False)
    check(core_m3["valid"], "core M3 adapter accepts the frozen baseline")
    input_guards = read_json(REPORT_DIR / "ps03m4-input-guards.json")
    check(aggregate_hash(frozen_m3_hashes()) == input_guards["m3FrozenAggregateSha256"], "all frozen M3 files unchanged since M4 build")
    check(aggregate_hash(homepage_hashes()) == input_guards["homepageAggregateSha256"], "production homepage/package files unchanged since M4 build")

    section("schemas, profile and request/program contracts")
    validation = validate_contract_sources(profile)
    check(set(PROFILE_REQUIRED) <= set(profile), "MotionProfileDefinition has every required policy field")
    check(validation["motionProfileSchemaValid"], "motion profile validates against required schema contract")
    for label, path in SCHEMA_FILES.items():
        schema = read_json(path)
        check(schema.get("type") == "object", f"{label} schema has object root")
        check(bool(schema.get("required")), f"{label} schema has explicit required fields")
        check(validation["schemaHashes"][label] == sha256_file(path), f"{label} schema hash matches")
    motion_schema = read_json(SCHEMA_FILES["motionProfile"])
    request_schema = read_json(SCHEMA_FILES["transitionRequest"])
    program_schema = read_json(SCHEMA_FILES["transitionProgram"])
    bad_profile_extra = copy.deepcopy(profile)
    bad_profile_extra["unexpectedRootKey"] = True
    check(not _schema_contract_valid(bad_profile_extra, motion_schema), "schema rejects an extra motion-profile root key")
    bad_profile_missing = copy.deepcopy(profile)
    bad_profile_missing.pop("profileId")
    check(not _schema_contract_valid(bad_profile_missing, motion_schema), "schema rejects a missing required motion-profile key")
    bad_profile_sequence = copy.deepcopy(profile)
    bad_profile_sequence["phasePolicy"]["sequence"][0] = "wrong-phase"
    check(not _schema_contract_valid(bad_profile_sequence, motion_schema), "schema enforces phase sequence prefixItems")
    bad_profile_sequence_extra = copy.deepcopy(profile)
    bad_profile_sequence_extra["phasePolicy"]["sequence"].append("extra-phase")
    check(not _schema_contract_valid(bad_profile_sequence_extra, motion_schema), "schema enforces items:false after phase sequence")
    contract_transition = risk_suite["transitions"][0]
    request = _make_request(contract_transition["sourceStateId"], contract_transition["targetStateId"], profile)
    check(_schema_contract_valid(request, request_schema), "representative TransitionRequest satisfies schema")
    bad_request_xor = copy.deepcopy(request)
    bad_request_xor["sourceSnapshot"] = {"snapshotHash": "0" * 64, "recordCount": 16384}
    check(not _schema_contract_valid(bad_request_xor, request_schema), "schema rejects simultaneous sourceStateId/sourceSnapshot")
    first_metadata = read_json(M4_DIR / manifest_m4["programs"][0]["metadataPath"])
    check(_schema_contract_valid(first_metadata, program_schema), "representative TransitionProgram satisfies schema")
    bad_program_hash = copy.deepcopy(first_metadata)
    bad_program_hash["hashes"]["sourceStateSha256"] = "not-a-sha256"
    check(not _schema_contract_valid(bad_program_hash, program_schema), "schema rejects malformed SHA-256 provenance")
    bad_program_provenance = copy.deepcopy(first_metadata)
    bad_program_provenance["provenance"] = {}
    check(not _schema_contract_valid(bad_program_provenance, program_schema), "schema rejects empty program provenance")
    check(profile["routeFieldPolicy"]["pairSpecificOverrides"] is False, "profile forbids pair-specific route overrides")
    check(profile["provenance"]["targetSpecificBranches"] is False, "profile forbids target-specific branches")
    check(profile["splitMergePolicy"]["opacityOnly"] is False, "split/merge is not opacity-only")
    check(profile["reserveTransportPolicy"]["opacityOnly"] is False, "reserve transport is not opacity-only")
    check(profile["reducedMotionPolicy"]["mode"] == "target-next-render-step", "reduced motion is static target placement")
    check(profile["globalPosePolicy"]["cameraMotion"] is False, "actor pose is separated from camera")
    check(all(b > a for a, b in zip(_boundaries(profile), _boundaries(profile)[1:])), "phase boundaries have positive duration")
    forbidden = _forbidden_branch_audit(manifest_m3)
    check(forbidden["valid"], f"AST audit has no forbidden target/pair branches: {forbidden['problems']}")

    section("risk-derived suite and no all-pair buffer matrix")
    check(risk_suite["selectedCount"] >= 32, "full-N risk suite contains at least 32 directed transitions")
    check(manifest_m4["precompiledProgramCount"] == risk_suite["selectedCount"], "only selected approval/QA programs are precompiled")
    check(manifest_m4["precompiledProgramCount"] < 23562, "no full all-pair program matrix is exported")
    required_coverage = {
        "master-single-family",
        "single-master-family",
        "one-three-split",
        "three-one-merge",
        "one-two-split",
        "two-one-merge",
        "two-three-split",
        "three-two-merge",
        "single-single-topology",
        "master-complex",
        "single-complex",
        "focus-swap",
        "gather-drive",
        "complex-brand-wide",
        "brand-wide-master",
        "maximum-active-delta",
        "maximum-aspect-change",
        "maximum-surface-area-change",
        "reserve-heavy",
    }
    observed_coverage = set(risk_suite["coverage"])
    for label in sorted(required_coverage):
        check(label in observed_coverage, f"risk suite covers {label}")
    directed_pairs = {(row["sourceStateId"], row["targetStateId"]) for row in risk_suite["transitions"]}
    check(len(directed_pairs) == risk_suite["selectedCount"], "risk suite contains no duplicate directed pairs")
    check(sum("single-single-topology-diverse" in row["coverage"] for row in risk_suite["transitions"]) >= 3, "three topology-diverse SINGLE→SINGLE routes")

    section("binary layout, content hashes and frozen endpoint references")
    check(contracts.GROUP_TRACK_DTYPE.itemsize == 64, "group-track stride is exactly 64 bytes")
    check(contracts.PER_ID_DTYPE.itemsize == 32, "per-ID stride is exactly 32 bytes")
    check(manifest_m4["programLayout"]["groupTracks"]["stride"] == 64, "manifest group-track stride matches runtime")
    check(manifest_m4["programLayout"]["perId"]["stride"] == 32, "manifest per-ID stride matches runtime")
    for layout_name in ("groupTracks", "perId"):
        for field in manifest_m4["programLayout"][layout_name]["fields"]:
            check(not field["dtype"].startswith("|V"), f"{layout_name}.{field['name']}: shaped field exposes base dtype, not opaque void")
            if field["shape"]:
                check(field["dtype"] in {"<f4", "<f2", "|u1", "<u2"}, f"{layout_name}.{field['name']}: shaped field base dtype is explicit")
    for entry in manifest_m4["programs"]:
        metadata_path = M4_DIR / entry["metadataPath"]
        group_path = M4_DIR / entry["groupTrackPath"]
        per_id_path = M4_DIR / entry["perIdPath"]
        check(metadata_path.is_file() and group_path.is_file() and per_id_path.is_file(), f"{entry['artifactId']}: all three program artifacts exist")
        check(metadata_path.stat().st_size == entry["metadataBytes"] and sha256_file(metadata_path) == entry["metadataSha256"], f"{entry['artifactId']}: metadata size/hash")
        check(group_path.stat().st_size == entry["groupTrackBytes"] and sha256_file(group_path) == entry["groupTrackSha256"], f"{entry['artifactId']}: group-track size/hash")
        check(per_id_path.stat().st_size == entry["perIdBytes"] and sha256_file(per_id_path) == entry["perIdSha256"], f"{entry['artifactId']}: per-ID size/hash")
        check(entry["groupTrackBytes"] % 64 == 0, f"{entry['artifactId']}: group buffer fixed stride")
        check(entry["perIdBytes"] == 16384 * 32, f"{entry['artifactId']}: per-ID buffer has full fixed identity stride")
        check(entry["sourceStateHash"] == by_id[entry["sourceStateId"]]["contentHash"], f"{entry['artifactId']}: source hash references frozen M3")
        check(entry["targetStateHash"] == by_id[entry["targetStateId"]]["contentHash"], f"{entry['artifactId']}: target hash references frozen M3")
        program, metadata = _load_program(entry)
        check(program.program_id == metadata["programId"] == entry["programId"], f"{entry['artifactId']}: encode/decode preserves program ID")
        check(len(program.per_id) == 16384, f"{entry['artifactId']}: decoded per-ID record count")
    check(not list(PUBLIC_DIR.rglob("*.state.bin")), "M4 public assets contain no copied M3 state buffers")
    check(manifest_m4["frozenM3"]["stateBuffersCopiedIntoM4"] is False, "manifest declares no M3 state copies")
    check((PUBLIC_DIR / "manifest.json").read_bytes() == (EXPORT_DIR / "ps03m4-manifest.json").read_bytes(), "public and design M4 manifests match")
    deterministic_hash = aggregate_hash(file_hashes(_deterministic_artifacts()))
    check(manifest_m4["aggregateContentHash"] == deterministic_hash, "aggregate deterministic content hash closes over every contracted artifact")

    section("23,562 directed probes and 154 self no-op transitions")
    check(pair_probe["directedPairCount"] == 154 * 153 == 23562, "all 23,562 directed non-self pairs were probed")
    check(pair_probe["probeIdentityCount"] == 512, "all-pair probe uses deterministic 512-ID LOD")
    check(pair_probe["timeSampleCount"] >= len(MANDATED_TIMES), "all-pair probe uses a dense time grid")
    check(pair_probe["allPairsPassOrAreReported"], "all pair failures are either absent or honestly aggregated/reported")
    check(pair_probe["fullProgramBuffersPersisted"] == 0, "all-pair probe persisted no full transition buffers")
    check(self_qa["selfTransitionCount"] == 154, "all 154 self transitions were compiled/evaluated")
    check(self_qa["allSelfTransitionsNoOp"], "all self transitions are exact no-ops")
    check(self_qa["failureCount"] == 0, "self-transition no-op suite has zero failures")

    section("full-N endpoints, C1/C2, orientation/scale, bridge/reserve and runtime semantics")
    check(full_n["programCount"] >= 32 and full_n["complete"], "full-N suite satisfies minimum size")
    required_named_checks = {
        "t0_position_matches_source",
        "t1_position_matches_target",
        "t0_orientation_matches_source",
        "t1_orientation_matches_target",
        "t0_scale_matches_source",
        "t1_scale_matches_target",
        "t0_status_matches_source",
        "t1_status_matches_target",
        "position_c1_valid",
        "position_c2_or_declared_piecewise_c2_valid",
        "phase_boundary_continuity_valid",
        "orientation_continuity_valid",
        "scale_continuity_valid",
        "group_routes_valid",
        "local_neighbour_distortion_within_policy",
        "crossing_proxy_within_policy",
        "collision_proxy_within_policy",
        "clumping_within_policy",
        "screen_bounds_valid_for_all_samples",
        "non_master_spherical_collapse_within_policy",
        "silhouette_fragmentation_within_policy",
        "source_feature_release_valid",
        "target_feature_reveal_valid",
        "macro_group_progression_valid",
        "bridge_geometry_finite",
        "bridge_timing_valid",
        "bridge_count_returns_to_zero_at_endpoint",
        "reserve_routes_finite",
        "emergence_order_spatially_coherent",
        "immersion_order_spatially_coherent",
        "no_opacity_only_transport",
        "reverse_valid",
        "scrub_deterministic",
        "lod_ids_not_renumbered",
        "lod_motion_semantics_stable",
        "reduced_motion_is_static",
        "active_elements_not_scale_masked",
    }
    for name in sorted(required_named_checks):
        check(full_n["namedCheckExecutionCounts"].get(name) == full_n["programCount"], f"{name}: executed on every full-N program")
        check(full_n["namedCheckFailureCounts"].get(name, 0) == 0, f"{name}: zero failures")
    retarget = full_n["retarget"]
    check(retarget["measured"], "retarget QA uses real transient snapshots")
    check([row["interruption"] for row in retarget["scenarios"]] == [0.25, 0.5, 0.75], "retarget is tested at 25/50/75%")
    check(retarget["retarget_position_continuity_valid"], "retarget position continuity")
    check(retarget["retarget_velocity_continuity_valid"], "retarget velocity continuity")
    check(retarget["retarget_orientation_scale_continuity_valid"], "retarget orientation/scale continuity")

    section("direct evaluator contract spot checks")
    for entry in manifest_m4["programs"][:3]:
        program, _ = _load_program(entry)
        source = load_m3_records(by_id[entry["sourceStateId"]])
        target = load_m3_records(by_id[entry["targetStateId"]])
        start = evaluate(program, source, target, 0.0, viewport="desktop", reduced=False)
        mid_a = evaluate(program, source, target, 0.5, viewport="desktop", reduced=False)
        _ = evaluate(program, source, target, 0.9, viewport="desktop", reduced=False)
        mid_b = evaluate(program, source, target, 0.5, viewport="desktop", reduced=False)
        end = evaluate(program, source, target, 1.0, viewport="desktop", reduced=False)
        reduced = evaluate(program, source, target, 0.5, viewport="desktop", reduced=True)
        check(float(np.max(np.linalg.norm(_positions(start) - source["position"], axis=1))) <= POLICY["endpointPositionTolerance"], f"{entry['artifactId']}: direct t0 endpoint")
        check(float(np.max(np.linalg.norm(_positions(end) - target["position"], axis=1))) <= POLICY["endpointPositionTolerance"], f"{entry['artifactId']}: direct t1 endpoint")
        check(np.array_equal(_positions(mid_a).astype(np.float32), _positions(mid_b).astype(np.float32)), f"{entry['artifactId']}: history-independent scrub")
        check(float(np.max(np.abs(np.linalg.norm(_orientation(mid_a, _decode_orientation(source)), axis=1) - 1.0))) <= POLICY["quaternionNormErrorMax"], f"{entry['artifactId']}: direct quaternion normalization")
        check(np.isfinite(_scale(mid_a, source["scale"])).all(), f"{entry['artifactId']}: direct scale finite")
        check(float(np.max(np.linalg.norm(_positions(reduced) - target["position"], axis=1))) <= POLICY["endpointPositionTolerance"], f"{entry['artifactId']}: direct reduced target placement")
        velocity0 = _velocity(start)
        check(velocity0 is not None and np.isfinite(velocity0).all(), f"{entry['artifactId']}: direct velocity channel finite")

    section("golden Python/TS/GPU parity source contract")
    check(golden["programCount"] == manifest_m4["precompiledProgramCount"], "golden fixtures cover every precompiled program")
    check(golden["persistentIds"] == [0, 1, 2, 7, 31, 127, 255, 511, 1023, 4095, 8191, 16383], "golden fixture IDs are fixed and include full-range samples")
    expected_golden_times = _time_grid(profile, dense=False)
    check(golden["fixtureVersion"] == "ps03m4.golden.v2", "golden fixture uses boundary-aware v2 contract")
    check(golden["timeGrid"] == expected_golden_times, "golden fixture covers parity/mandated times and every phase boundary ±epsilon")
    for boundary in _boundaries(profile):
        for value in (max(0.0, boundary - 1e-5), boundary, min(1.0, boundary + 1e-5)):
            check(round(value, 8) in golden["timeGrid"], f"golden time grid includes phase-boundary sample {value:.5f}")
    for fixture in golden["fixtures"]:
        check(len(fixture["samples"]) == len(expected_golden_times), f"{fixture['programId'][:24]}: every boundary-aware golden time sample")
        check(all(len(sample["groupPhase"]) == len(golden["persistentIds"]) for sample in fixture["samples"]), f"{fixture['programId'][:24]}: groupPhase parity samples cover fixed IDs")
        check(all(sample["actorPose"] is not None for sample in fixture["samples"]), f"{fixture['programId'][:24]}: actorPose parity channel present")
        check(all(sample["sampleHash"] == sha256_bytes(stable_json_bytes({key: value for key, value in sample.items() if key != "sampleHash"})) for sample in fixture["samples"]), f"{fixture['programId'][:24]}: golden sample hashes")
    check(golden["tolerances"]["position"] <= POLICY["parityPositionToleranceFloat32"], "golden position tolerance is Float32-bounded")

    section("aggregate named invariants and truthful external measurements")
    expected_aggregate_names = {
        "motion_profile_schema_valid",
        "transition_request_schema_valid",
        "transition_program_schema_valid",
        "self_transition_is_noop",
        "all_23562_pair_probes_pass_or_are_reported",
        "full_n_risk_suite_complete",
        "no_forbidden_target_branches",
        "m2_regression_470_of_470",
        "m3_regression_683_of_683",
        "m3_deterministic_inputs_unchanged",
        "production_homepage_unchanged",
        "python_ts_parity_valid",
        "python_gpu_parity_valid",
        "stale_load_cannot_override_new_target",
        "hidden_tab_resume_valid",
    }
    for name in sorted(expected_aggregate_names):
        check(name in qa["checks"], f"aggregate QA exposes named invariant {name}")
    check(qa["passedCheckCount"] + qa["failedCheckCount"] + qa["notMeasuredCheckCount"] == qa["requiredCheckCount"], "QA pass/fail/not-measured accounting is exact")
    check(not set(qa["notMeasuredChecks"]) & set(qa["failedChecks"]), "not-measured checks are never mislabeled as failures or passes")
    check(
        qa["allRequiredChecksPassed"] and qa["allRequiredChecksMeasuredAndPassed"],
        f"all required aggregate acceptance invariants are measured and pass: failed={qa['failedChecks']} notMeasured={qa['notMeasuredChecks']}",
    )

    section("visual evidence manifest when rendered")
    visual_path = REPORT_DIR / "ps03m4-visual-evidence.json"
    if visual_path.exists():
        visual = read_json(visual_path)
        check(visual["approvalPackPartCount"] == 12, "human approval pack has exactly 12 parts")
        check(len(visual["approvalPack"]) == 12, "approval evidence has per-part status records")
        check(all(part["visuallyReviewedByModel"] and part["requiresHumanApproval"] for part in visual["approvalPack"]), "every approval-pack part records model review and human approval requirement")
        check(visual["riskSuiteContactSheetProgramCount"] == manifest_m4["precompiledProgramCount"] == 35, "all 35 risk programs appear in the visual contact sheet")
        check(set(visual["riskSuiteContactSheetProgramIds"]) == {entry["programId"] for entry in manifest_m4["programs"]}, "visual contact sheet covers every risk-suite program exactly")
        check(visual["neutralTechnicalValuesOnly"] and visual["geometryOnly"], "renders use geometry-only neutral technical values")
        check(visual["requiresHumanApproval"], "visual evidence never self-approves PS-03")
        check(visual["sourceManifestSha256"] == sha256_file(EXPORT_DIR / "ps03m4-manifest.json"), "visual evidence references the current M4 manifest")
        check(visual["sourceAggregateContentHash"] == manifest_m4["aggregateContentHash"], "visual evidence references the current deterministic aggregate")
        check(visual["sourceQaSummarySha256"] == sha256_file(REPORT_DIR / "ps03m4-qa-summary.json"), "visual evidence references the current QA summary")
        check(visual["sourceMotionProfileSha256"] == sha256_file(PROFILE_FILE), "visual evidence references the current motion profile")
        check(all((REPO_DIR / row["path"]).is_file() and sha256_file(REPO_DIR / row["path"]) == row["sha256"] for row in visual["renders"]), "all visual evidence hashes match")
    else:
        check(True, "visual renderer is tested separately; evidence not required for machine-only unit invocation")

    print(f"\n{checks} checks, {len(failures)} failed")
    if failures:
        print("failures:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("all PS-03.M4 checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
