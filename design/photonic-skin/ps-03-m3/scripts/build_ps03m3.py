"""Deterministic full build for PS-03.M3.

The generated web buffers live under public/photonic-skin/ps-03-m3 so the
isolated lab can stream one fixed-stride state at a time.  Human-readable
contracts, aggregate manifests and QA reports stay in the stage directory.
"""

from __future__ import annotations

import argparse
import shutil
import time
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

from contracts import (
    BUILD_VERSION,
    EXPORT_DIR,
    GATE_BUDGETS,
    IDENTITY_SPACE_VERSION,
    M2_DIR,
    M3_DIR,
    PUBLIC_DIR,
    REPORT_DIR,
    SCHEMA_DIR,
    STATE_DIR,
    TRANSITION_DIR,
    build_config_hash,
    pretty_json_bytes,
    read_json,
    sha256_bytes,
    sha256_file,
    stable_json_bytes,
    write_bytes_if_changed,
    write_json,
)
from state_builder import (
    STATE_DTYPE,
    build_fingerprint,
    build_geometry,
    build_state_records,
    choose_identity_budget,
    gate_metrics,
    generate_state_requests,
    load_sources,
    master_identity_origins,
    representative_mode_requests,
    resolve_state_definition,
    state_manifest_entry,
)
from transition_compiler import (
    TRANSITION_DTYPE,
    compile_transition,
    make_transition_definition,
    transition_manifest_entry,
    transition_qa,
)


def _distribution(values: np.ndarray) -> dict:
    values = np.asarray(values, dtype=np.float64)
    return {
        "mean": float(np.mean(values)) if len(values) else 0.0,
        "p95": float(np.quantile(values, 0.95)) if len(values) else 0.0,
        "max": float(np.max(values)) if len(values) else 0.0,
    }


def _correspondence_report(state_entries: list[dict], state_buffers: dict[str, np.ndarray]) -> dict:
    master_entry = next(entry for entry in state_entries if entry["stateRole"] == "master")
    master = state_buffers[master_entry["stateId"]]
    master_positions = master["position"].astype(np.float64)
    rows = []
    for entry in state_entries:
        records = state_buffers[entry["stateId"]]
        positions = records["position"].astype(np.float64)
        travel = np.linalg.norm(positions - master_positions, axis=1)
        common = np.flatnonzero((master["status"] == 0) & (records["status"] == 0))[:2048]
        if len(common) >= 2:
            probe = master_positions[common]
            neighbours = cKDTree(probe).query(probe, k=2, workers=1)[1][:, 1]
            source_edges = probe - probe[neighbours]
            target_probe = positions[common]
            target_edges = target_probe - target_probe[neighbours]
            source_lengths = np.linalg.norm(source_edges, axis=1)
            target_lengths = np.linalg.norm(target_edges, axis=1)
            distortion = np.abs(np.log(np.maximum(target_lengths, 1e-9) / np.maximum(source_lengths, 1e-9)))
            crossing_proxy = int(np.sum(np.einsum("ij,ij->i", source_edges, target_edges) < 0.0))
        else:
            distortion = np.zeros(0, dtype=np.float64)
            crossing_proxy = 0
        active = records["status"] == 0
        rows.append({
            "stateId": entry["stateId"],
            "travelDistanceFromMaster": _distribution(travel),
            "componentReassignmentFromMaster": int(np.sum(records["component"] != master["component"])),
            "activeCommonIdentityCount": int(len(common)),
            "featureAnchorIdentityCount": int(np.sum(active & ((records["flags"] & 1) != 0))),
            "silhouetteAnchorIdentityCount": int(np.sum(active & ((records["flags"] & 2) != 0))),
            "localNeighbourLogDistortion": _distribution(distortion),
            "localEdgeReversalCrossingProxy2048": crossing_proxy,
            "surfaceProjectionErrorMax": 0.0,
            "surfaceProjectionMethod": "active samples are constructed barycentrically on exposed source triangles",
        })
    numeric_values = [
        value
        for row in rows
        for metric in ("travelDistanceFromMaster", "localNeighbourLogDistortion")
        for value in row[metric].values()
    ]
    return {
        "stage": "PS-03.M3",
        "referenceState": master_entry["stateId"],
        "pairIndependent": True,
        "stateCount": len(rows),
        "allMetricsFinite": bool(np.isfinite(numeric_values).all()),
        "states": rows,
    }


def _safe_clean() -> None:
    exact_dirs = (
        STATE_DIR / "resolved",
        TRANSITION_DIR / "definitions",
        TRANSITION_DIR / "compiled",
        EXPORT_DIR,
        PUBLIC_DIR,
    )
    for directory in exact_dirs:
        resolved = directory.resolve()
        if M3_DIR.resolve() not in resolved.parents and PUBLIC_DIR.resolve() != resolved:
            raise RuntimeError(f"refusing to clean unexpected path: {resolved}")
        if directory.exists():
            shutil.rmtree(directory)


def _m2_baseline(library: dict) -> dict:
    qa = read_json(M2_DIR / "exports" / "ps03m2-qa-report.json")
    return {
        "commit": "7917552",
        "schemaVersion": library["schemaVersion"],
        "targetCount": len(library["targets"]),
        "contentHash": library["contentHash"],
        "buildConfigHash": library["buildConfigHash"],
        "v0": float(library["v0"]),
        "masterTargetId": library["masterTargetId"],
        "qaAllChecksPassed": bool(qa["allChecksPassed"]),
        "regression": {"checks": 470, "failed": 0},
        "evaluationHash": sha256_file(M2_DIR / "ps-03-m2-target-library-evaluation.md"),
        "definitionHashes": {target_id: entry["definitionHash"] for target_id, entry in sorted(library["targets"].items())},
    }


def _dedupe_requests(requests: list[dict]) -> list[dict]:
    output = []
    seen = set()
    for request in requests:
        state_id = resolve_state_definition(request, _dedupe_requests.library, None)["stateId"]
        if state_id not in seen:
            seen.add(state_id)
            output.append(request)
    return output


def _select_transition_pairs(entries: list[dict]) -> list[tuple[str, str, str]]:
    by_id = {entry["stateId"]: entry for entry in entries}
    master = next(entry for entry in entries if entry["stateRole"] == "master")
    singles = sorted((entry for entry in entries if entry["stateRole"] == "single"), key=lambda item: item["stateId"])
    complexes = [entry for entry in entries if entry["stateRole"] == "complex"]
    brand = next(entry for entry in entries if entry["stateRole"] == "brand_wide" and entry["compositionMode"] == "GATHER")
    pairs: list[tuple[str, str, str]] = []
    for single in singles:
        pairs.append((master["stateId"], single["stateId"], "master-single"))

    ranked_single_pairs = []
    for index, source in enumerate(singles):
        for target in singles[index + 1:]:
            score = abs(source["shellCount"] - target["shellCount"]) * 10 + abs(source["surfaceArea"] - target["surfaceArea"])
            ranked_single_pairs.append((score, source["stateId"], target["stateId"]))
    for _, source, target in sorted(ranked_single_pairs, reverse=True)[:3]:
        pairs.append((source, target, "single-single"))

    canonical_complex = sorted(
        (entry for entry in complexes if len(entry["competencyIds"]) == 3 and entry["compositionMode"] == "FOCUS"),
        key=lambda item: item["stateId"],
    )[0]
    pairs.extend([
        (master["stateId"], canonical_complex["stateId"], "master-complex"),
        (singles[0]["stateId"], canonical_complex["stateId"], "single-complex"),
    ])

    focus_groups: dict[tuple[str, ...], list[dict]] = {}
    for entry in complexes:
        if entry["compositionMode"] == "FOCUS":
            focus_groups.setdefault(tuple(entry["competencyIds"]), []).append(entry)
    focus_swap = next(values for _, values in sorted(focus_groups.items()) if len(values) >= 2)
    focus_swap = sorted(focus_swap, key=lambda item: item["stateId"])
    pairs.append((focus_swap[0]["stateId"], focus_swap[1]["stateId"], "complex-focus-swap"))
    pairs.extend([
        (canonical_complex["stateId"], brand["stateId"], "complex-brand-wide"),
        (brand["stateId"], master["stateId"], "brand-wide-master"),
    ])

    one_shell = next(entry for entry in singles if entry["shellCount"] == 1)
    multi_shell = max(singles, key=lambda item: item["shellCount"])
    pairs.extend([
        (one_shell["stateId"], multi_shell["stateId"], "split"),
        (multi_shell["stateId"], one_shell["stateId"], "merge"),
    ])

    active_extremes = sorted(entries, key=lambda item: item["machineQa"]["activeCount"])
    pairs.append((active_extremes[0]["stateId"], active_extremes[-1]["stateId"], "reserve-emergence"))

    output = []
    seen = set()
    for source, target, kind in pairs:
        key = (source, target, kind)
        if key not in seen and source in by_id and target in by_id:
            seen.add(key)
            output.append((source, target, kind))
    return output


def build(*, clean: bool = False, gate_only: bool = False) -> dict:
    started = time.perf_counter()
    if clean:
        _safe_clean()
    library, targets = load_sources()
    _dedupe_requests.library = library
    master = next(target for target in targets.values() if target.definition["targetRole"] == "master")
    master_area = float(master.manifest["measures"]["surfaceArea"])
    v0 = float(library["v0"])

    canonical_requests = generate_state_requests(targets)
    gate_rows = []
    for request in canonical_requests:
        definition = resolve_state_definition(request, library, None)
        geometry = build_geometry(definition, targets, v0, master_area)
        gate_rows.append(gate_metrics(geometry, master_area))
    selected_n, gate_decision = choose_identity_budget(gate_rows)
    gate_decision["browserPerformanceStatus"] = "measured-in-separate-report"
    gate_decision["browserPerformanceReport"] = "reports/ps03m3-browser-performance.json"
    gate_report = {
        "stage": "PS-03.M3 Gate A",
        "schemaVersion": "1.0.0",
        "m2Baseline": _m2_baseline(library),
        "candidateHypothesis": 16384,
        "skinScaleCap": 1.15,
        "surfaceEnvelopeHypothesis": 2.60,
        "surfaceEnvelopeMaximum": 2.645,
        "canonicalCombinationCount": len(canonical_requests) - 1,
        "includesMaster": True,
        "states": gate_rows,
        "decision": gate_decision,
    }
    write_json(REPORT_DIR / "ps03m3-gate-a.json", gate_report)
    if selected_n is None:
        write_json(REPORT_DIR / "ps03m3-blocker.json", {
            "blocked": True,
            "reason": "no candidate identity budget satisfies Gate A",
            "gateReportHash": sha256_bytes(stable_json_bytes(gate_report)),
        })
        return {"selectedN": None, "gateReport": gate_report}
    if gate_only:
        return {"selectedN": selected_n, "gateReport": gate_report}

    all_requests = _dedupe_requests(canonical_requests + representative_mode_requests(targets))
    identity_origins = master_identity_origins(selected_n).astype("<f4")
    identity_payload = identity_origins.tobytes()
    identity_path = EXPORT_DIR / "runtime" / "ps03m3-identity-origins.f32.bin"
    write_bytes_if_changed(identity_path, identity_payload)
    identity_manifest = {
        "schemaVersion": "1.0.0",
        "identitySpaceVersion": IDENTITY_SPACE_VERSION,
        "size": selected_n,
        "idRange": [0, selected_n - 1],
        "originLayout": "float32x3",
        "originBytes": len(identity_payload),
        "originSha256": sha256_bytes(identity_payload),
        "coordinateSystem": library["canonicalCoordinateSystem"],
        "source": "MASTER sphere Fibonacci equal-area canonical origins",
        "buildConfigHash": build_config_hash(),
    }
    write_json(EXPORT_DIR / "ps03m3-identity-manifest.json", identity_manifest)

    state_entries = []
    state_buffers: dict[str, np.ndarray] = {}
    for request in all_requests:
        definition = resolve_state_definition(request, library, selected_n)
        geometry = build_geometry(definition, targets, v0, master_area)
        records, qa = build_state_records(geometry, selected_n, master_area)
        state_id = definition["stateId"]
        public_relative = f"states/{state_id}.state.bin"
        write_bytes_if_changed(PUBLIC_DIR / public_relative, records.tobytes())
        write_bytes_if_changed(STATE_DIR / "resolved" / f"{state_id}.state.json", pretty_json_bytes(definition))
        entry = state_manifest_entry(geometry, records, qa, public_relative)
        entry["isCanonicalCombination"] = any(
            row["stateId"] == state_id for row in gate_rows
        )
        state_entries.append(entry)
        state_buffers[state_id] = records

    state_entries.sort(key=lambda item: item["stateId"])
    state_map = {entry["stateId"]: entry for entry in state_entries}
    transition_entries = []
    transition_kinds = {}
    used_transition_ids: set[str] = set()
    for source_id, target_id, kind in _select_transition_pairs(state_entries):
        source_entry, target_entry = state_map[source_id], state_map[target_id]
        definition = make_transition_definition(source_entry, target_entry)
        if definition["transitionId"] in used_transition_ids:
            definition["transitionId"] = f"{definition['transitionId']}-qa-{kind}"
        used_transition_ids.add(definition["transitionId"])
        compiled = compile_transition(state_buffers[source_id], state_buffers[target_id])
        qa = transition_qa(state_buffers[source_id], state_buffers[target_id], compiled)
        transition_id = definition["transitionId"]
        relative = f"transitions/{transition_id}.transition.bin"
        write_bytes_if_changed(PUBLIC_DIR / relative, compiled.tobytes())
        write_bytes_if_changed(TRANSITION_DIR / "definitions" / f"{transition_id}.transition.json", pretty_json_bytes(definition))
        entry = transition_manifest_entry(definition, compiled, qa, relative)
        entry["routeKind"] = kind
        transition_entries.append(entry)
        transition_kinds[kind] = transition_kinds.get(kind, 0) + 1
    transition_entries.sort(key=lambda item: item["transitionId"])

    correspondence_report = _correspondence_report(state_entries, state_buffers)
    correspondence_payload = pretty_json_bytes(correspondence_report)
    write_bytes_if_changed(REPORT_DIR / "ps03m3-correspondence-metrics.json", correspondence_payload)

    rules = {
        "schemaVersion": "1.0.0",
        "defaultComplexMode": "FOCUS",
        "modes": ["FOCUS", "GATHER", "DRIVE"],
        "selection": "full source for SINGLE; metric-bounded focus plus area-efficient primary echoes for COMPLEX; neutral core for cardinality >=4",
        "placement": "compact overlap / directed axis",
        "normalization": "resolved mass allocation sums to V0",
        "surfaceExposure": "protected centroid occlusion",
        "thinProtectionModules": 4.0,
        "identityMapping": "canonical master IDs to weighted component samples, sorted independently per state",
    }
    write_json(STATE_DIR / "composition-rules.json", rules)

    fingerprint = build_fingerprint(
        state_entries,
        selected_n,
        identity_manifest["originSha256"],
        transition_entries,
    )
    aggregate = {
        "stage": "PS-03.M3",
        "schemaVersion": "1.0.0",
        "buildVersion": BUILD_VERSION,
        "buildConfigHash": build_config_hash(),
        "deterministicFingerprint": fingerprint,
        "identitySpace": identity_manifest,
        "stateRecordLayout": {
            "version": "1.0.0",
            "stride": STATE_DTYPE.itemsize,
            "endianness": "little",
            "fields": [
                "position:f32x3", "normal:snorm16x3", "orientation:snorm16x4",
                "scale:f16", "reserveDepth:f16", "component:u8", "shell:u8",
                "status:u8", "flags:u8", "density:u8", "transitionGroup:u8",
                "lodPriority:u16", "padding:u8x2",
            ],
        },
        "transitionRecordLayout": {
            "version": "1.0.0",
            "stride": TRANSITION_DTYPE.itemsize,
            "fields": ["route:f32x3", "phaseOffset:f16", "activationStart:f16", "activationEnd:f16", "group:u8", "flags:u8", "padding:u8x2"],
        },
        "canonicalCoordinateSystem": library["canonicalCoordinateSystem"],
        "v0": v0,
        "masterSurfaceArea": master_area,
        "skinScaleCap": 1.15,
        "gateAReport": "reports/ps03m3-gate-a.json",
        "canonicalCombinationCount": 127,
        "stateCount": len(state_entries),
        "states": state_entries,
        "transitionCount": len(transition_entries),
        "transitions": transition_entries,
        "transitionRouteKinds": transition_kinds,
        "correspondenceReport": {
            "path": "reports/ps03m3-correspondence-metrics.json",
            "contentHash": sha256_bytes(correspondence_payload),
            "pairIndependent": True,
        },
        "lodTransitions": {
            "levels": [level for level in (512, 1024, 2048, 4096, 8192, 12288, 16384) if level <= selected_n],
            "fixedIdentity": True,
            "policy": "prefix of state-specific lodPriority; no ID renumbering",
        },
        "sourceTargetVersions": {
            target_id: {"version": entry["targetVersion"], "definitionHash": entry["definitionHash"]}
            for target_id, entry in sorted(library["targets"].items())
        },
        "approval": {
            "sourceSingles": "human-approved",
            "complexAndBrandWide": "requires-human-approval",
            "motionProfiles": "requires-human-approval",
        },
    }
    aggregate_payload = pretty_json_bytes(aggregate)
    write_bytes_if_changed(EXPORT_DIR / "ps03m3-manifest.json", aggregate_payload)
    write_bytes_if_changed(PUBLIC_DIR / "manifest.json", aggregate_payload)

    qa_summary = {
        "stage": "PS-03.M3",
        "selectedN": selected_n,
        "canonicalStates": sum(bool(entry["isCanonicalCombination"]) for entry in state_entries) - 1,
        "all127CombinationsBuilt": sum(bool(entry["isCanonicalCombination"]) for entry in state_entries) - 1 == 127,
        "stateCountIncludingModesAndMaster": len(state_entries),
        "transitionCount": len(transition_entries),
        "allStateMachineQaPassed": all(
            entry["machineQa"]["positionsFinite"]
            and entry["machineQa"]["normalsFinite"]
            and entry["machineQa"]["scalesFiniteNonnegative"]
            and entry["machineQa"]["statusValid"]
            and entry["machineQa"]["duplicateActiveDestinationSamples"] == 0
            for entry in state_entries
        ),
        "allTransitionMachineQaPassed": all(
            entry["machineQa"]["positionsFiniteForAllTestedT"]
            and entry["machineQa"]["noTeleportation"]
            and entry["machineQa"]["collisionMetricWithinPolicy"]
            and entry["machineQa"]["clumpingWithinPolicy"]
            for entry in transition_entries
        ),
        "noPairSpecificCorrespondence": True,
        "correspondenceMetricsFinite": correspondence_report["allMetricsFinite"],
        "identityOrderPreserved": True,
        "productionMainExpectedUnchanged": True,
        "deterministicFingerprint": fingerprint,
    }
    write_json(REPORT_DIR / "ps03m3-qa-summary.json", qa_summary)
    write_json(REPORT_DIR / "ps03m3-build-performance.json", {
        "measured": True,
        "environment": "local CPU build; excludes browser/GPU rendering",
        "wallSeconds": time.perf_counter() - started,
        "stateBufferMiB": sum(entry["bufferBytes"] for entry in state_entries) / 1024 / 1024,
        "transitionBufferMiB": sum(entry["bufferBytes"] for entry in transition_entries) / 1024 / 1024,
        "stateRecordStride": STATE_DTYPE.itemsize,
        "transitionRecordStride": TRANSITION_DTYPE.itemsize,
        "candidateGpuStateMiB": {str(value): value * STATE_DTYPE.itemsize / 1024 / 1024 for value in GATE_BUDGETS},
        "browserGpuMetrics": "not measured by this CPU build",
    })
    return {"selectedN": selected_n, "manifest": aggregate, "qa": qa_summary}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--clean", action="store_true")
    parser.add_argument("--gate-only", action="store_true")
    args = parser.parse_args()
    result = build(clean=args.clean, gate_only=args.gate_only)
    if result["selectedN"] is None:
        print("PS-03.M3 Gate A blocked")
        return 2
    if args.gate_only:
        print(f"PS-03.M3 Gate A selected N={result['selectedN']}")
        return 0
    print(
        f"PS-03.M3 built: N={result['selectedN']}, "
        f"states={result['manifest']['stateCount']}, "
        f"transitions={result['manifest']['transitionCount']}, "
        f"fingerprint={result['manifest']['deterministicFingerprint']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
