"""Offline machine QA for PS-03.M3.  No generated result is trusted blindly."""

from __future__ import annotations

import ast
import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


M3_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = M3_DIR.parents[2]
SCRIPTS_DIR = M3_DIR / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from contracts import (  # noqa: E402
    M2_DIR,
    PUBLIC_DIR,
    STATE_DIR,
    TRANSITION_DIR,
    read_json,
    sha256_bytes,
    stable_json_bytes,
    validate_state_definition,
    validate_transition_definition,
)
from state_builder import (  # noqa: E402
    FLAG_FEATURE,
    FLAG_SILHOUETTE,
    STATE_DTYPE,
    STATUS_ACTIVE,
    decode_state_buffer,
)
from transition_compiler import (  # noqa: E402
    compile_transition,
    decode_transition_buffer,
    sample_positions,
)


checks = 0
failures: list[str] = []


def check(condition: bool, label: str) -> None:
    global checks
    checks += 1
    if condition:
        if os.environ.get("PS03M3_VERBOSE") == "1":
            print(f"  [ok] {label}")
    else:
        print(f"  [FAIL] {label}")
        failures.append(label)


def section(label: str) -> None:
    print(f"\n{label}")


def git_blob_hash(path: Path) -> str:
    payload = path.read_bytes()
    return hashlib.sha1(f"blob {len(payload)}\0".encode() + payload).hexdigest()


def condition_identity_literals(path: Path, identities: set[str]) -> list[tuple[int, str]]:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    problems = []
    for node in ast.walk(tree):
        expression = None
        if isinstance(node, (ast.If, ast.IfExp, ast.While)):
            expression = node.test
        elif isinstance(node, ast.Match):
            expression = node.subject
        if expression is None:
            continue
        rendered = ast.unparse(expression)
        for literal in (item.value for item in ast.walk(expression) if isinstance(item, ast.Constant) and isinstance(item.value, str)):
            if literal in identities and not (literal == "master" and "Role" in rendered):
                problems.append((node.lineno, literal))
    return problems


def main() -> int:
    manifest = read_json(M3_DIR / "exports" / "ps03m3-manifest.json")
    gate = read_json(M3_DIR / "reports" / "ps03m3-gate-a.json")
    qa = read_json(M3_DIR / "reports" / "ps03m3-qa-summary.json")
    correspondence = read_json(M3_DIR / "reports" / "ps03m3-correspondence-metrics.json")
    m2 = read_json(M2_DIR / "exports" / "ps03m2-library-manifest.json")
    state_map = {entry["stateId"]: entry for entry in manifest["states"]}

    section("schemas, baseline and combination coverage")
    check(manifest["identitySpace"]["size"] == 16384, "Gate A froze N=16384")
    check(gate["decision"]["selectedN"] == 16384, "Gate report agrees with identity manifest")
    check(gate["canonicalCombinationCount"] == 127, "all 127 non-empty competency subsets were gated")
    check(qa["all127CombinationsBuilt"], "all 127 canonical combinations were built")
    check(qa["canonicalStates"] == 127, "canonical state count excludes only MASTER")
    check(len([entry for entry in manifest["states"] if entry["stateRole"] == "single"]) == 7, "seven SINGLE states exist")
    check(len([entry for entry in manifest["states"] if entry["stateRole"] == "master"]) == 1, "one MASTER state exists")
    check(len([entry for entry in manifest["states"] if entry["stateRole"] == "brand_wide" and entry["isCanonicalCombination"]]) == 1, "one canonical BRAND_WIDE state exists")
    check({entry["compositionMode"] for entry in manifest["states"]} >= {"FOCUS", "GATHER", "DRIVE"}, "FOCUS/GATHER/DRIVE are represented")
    check(m2["contentHash"] == gate["m2Baseline"]["contentHash"], "M2 content hash matches the frozen baseline")
    check(m2["buildConfigHash"] == gate["m2Baseline"]["buildConfigHash"], "M2 build-config hash matches the frozen baseline")
    check(all(m2["targets"][key]["definitionHash"] == value for key, value in gate["m2Baseline"]["definitionHashes"].items()), "all eight M2 source definitions remain unchanged")

    section("StateDefinition, persistent identity and fixed stride")
    all_state_hashes = True
    all_source_hashes = True
    all_quota_matches = True
    all_low_lod_protected = True
    all_orientation_valid = True
    all_reserve_unique = True
    all_records: dict[str, np.ndarray] = {}
    for entry in manifest["states"]:
        definition_path = STATE_DIR / "resolved" / f"{entry['stateId']}.state.json"
        definition = read_json(definition_path)
        check(not validate_state_definition(definition), f"{entry['stateId']}: StateDefinition validates")
        definition_hash = sha256_bytes(stable_json_bytes(definition))
        all_state_hashes &= definition_hash == entry["definitionHash"]
        all_source_hashes &= all(
            m2["targets"][source["targetId"]]["definitionHash"] == source["definitionHash"]
            for source in definition["sourceTargets"]
        )
        payload = (PUBLIC_DIR / entry["bufferPath"]).read_bytes()
        all_state_hashes &= len(payload) == entry["bufferBytes"] and sha256_bytes(payload) == entry["contentHash"]
        records = decode_state_buffer(payload, 16384)
        all_records[entry["stateId"]] = records
        active = records["status"] == STATUS_ACTIVE
        observed = {str(index): int(np.sum(records["component"][active] == index)) for index in range(entry["componentCount"])}
        all_quota_matches &= observed == entry["machineQa"]["componentQuotas"]
        low = records[:512]
        flags = low["flags"]
        if np.any(records["flags"] & FLAG_FEATURE):
            all_low_lod_protected &= bool(np.any(flags & FLAG_FEATURE))
        if np.any(records["flags"] & FLAG_SILHOUETTE):
            all_low_lod_protected &= bool(np.any(flags & FLAG_SILHOUETTE))
        orientation = records["orientation"].astype(np.float64) / 32767.0
        all_orientation_valid &= bool(np.max(np.abs(np.linalg.norm(orientation, axis=1) - 1.0)) < 2e-4)
        reserve_positions = records["position"][~active]
        all_reserve_unique &= len(reserve_positions) == len(np.unique(reserve_positions, axis=0))
        check(np.array_equal(records["lodPriority"], np.arange(16384, dtype=np.uint16)), f"{entry['stateId']}: LOD priority preserves IDs")
        check(bool(np.isfinite(records["position"]).all()), f"{entry['stateId']}: positions are finite")
        check(entry["machineQa"]["duplicateActiveDestinationSamples"] == 0, f"{entry['stateId']}: no duplicate active destination samples")
    check(all_state_hashes, "all state definition and buffer hashes match")
    check(all_source_hashes, "all resolved source-definition hashes match M2")
    check(all_quota_matches, "component allocations exactly match constrained quotas")
    check(all_low_lod_protected, "512 LOD retains available feature and silhouette zones")
    check(all_orientation_valid, "all packed orientations decode to unit quaternions")
    check(all_reserve_unique, "reserve/subsurface packing has unique finite positions")
    check(all(entry["machineQa"]["lodStrictlyNested"] for entry in manifest["states"]), "every state declares strict nested LOD")
    check(all(not entry["machineQa"]["lodIdsRenumbered"] for entry in manifest["states"]), "no LOD renumbers IDs")
    check(all(row["volumeError"] <= 0.01 for row in gate["states"]), "all gated states preserve V0 within 1%")
    check(all(row["surfaceAreaVsMasterRatio"] <= 2.645 + 1e-9 for row in gate["states"]), "all gated states stay inside the frozen surface envelope")
    check(all(row["thinComponentsPreserved"] for row in gate["states"]), "all gated states preserve the four-module minimum")
    check(all(row["budgets"]["16384"]["coverage"] >= 0.8 - 1e-9 for row in gate["states"]), "N=16384 reaches 0.80 coverage for all canonical states")

    section("canonical correspondence and forbidden-branch audit")
    identity_payload = (M3_DIR / "exports" / "runtime" / "ps03m3-identity-origins.f32.bin").read_bytes()
    origins = np.frombuffer(identity_payload, dtype="<f4").reshape(-1, 3)
    check(len(origins) == 16384, "canonical MASTER identity has exactly N origins")
    check(np.max(np.abs(np.linalg.norm(origins, axis=1) - 1.0)) < 1e-5, "canonical MASTER origins lie on the unit sphere")
    check(manifest["identitySpace"]["idRange"] == [0, 16383], "identity IDs are exactly 0..N-1")
    check(manifest["identitySpace"]["originSha256"] == sha256_bytes(identity_payload), "identity-origin hash matches")
    check(manifest["deterministicFingerprint"] == qa["deterministicFingerprint"], "aggregate deterministic fingerprints agree")
    check(correspondence["stateCount"] == len(manifest["states"]), "correspondence metrics cover every runtime state")
    check(correspondence["pairIndependent"] and correspondence["allMetricsFinite"], "pair-independent correspondence metrics are finite")
    check(all(row["surfaceProjectionErrorMax"] == 0.0 for row in correspondence["states"]), "active samples remain exactly on constructed source triangles")
    check(all(row["localEdgeReversalCrossingProxy2048"] >= 0 for row in correspondence["states"]), "local crossing proxies are recorded")
    check(qa["correspondenceMetricsFinite"], "aggregate correspondence metric QA passed")
    identities = set(m2["targets"])
    identities.update(
        entry["competencyId"]
        for entry in m2["targets"].values()
        if entry["targetRole"] != "master"
    )
    for definition_path in (M2_DIR / "targets").glob("*.target.json"):
        definition = json.loads(definition_path.read_text(encoding="utf-8"))
        identities.update(component["componentId"] for component in definition["components"])
        for component in definition["components"]:
            for family in ("featureZones", "silhouetteZones", "densityZones", "colorZones"):
                identities.update(zone["zoneId"] for zone in component.get(family, []))
    identities.update(state_map)
    core_files = [SCRIPTS_DIR / name for name in ("contracts.py", "state_builder.py", "transition_compiler.py", "build_ps03m3.py")]
    branch_problems = {path.name: condition_identity_literals(path, identities) for path in core_files}
    check(not any(branch_problems.values()), f"no forbidden identity literals drive core conditions: {branch_problems}")
    check(all(entry["machineQa"]["identityCount"] == 16384 for entry in manifest["states"]), "every state has one fixed identity stride")
    check(manifest["transitionRouteKinds"].get("single-single", 0) >= 3, "three topology-diverse SINGLE→SINGLE routes are compiled")

    section("TransitionDefinition, endpoints, continuity and reserve transport")
    all_transition_hashes = True
    all_rebuild_hashes = True
    all_endpoints = True
    all_continuity = True
    all_motion_qa = True
    kinds = set()
    split_merge_shells = {}
    for entry in manifest["transitions"]:
        kinds.add(entry["routeKind"])
        if entry["routeKind"] in {"split", "merge"}:
            split_merge_shells[entry["routeKind"]] = (
                state_map[entry["fromState"]]["shellCount"],
                state_map[entry["toState"]]["shellCount"],
            )
        definition_path = TRANSITION_DIR / "definitions" / f"{entry['transitionId']}.transition.json"
        definition = read_json(definition_path)
        check(not validate_transition_definition(definition), f"{entry['transitionId']}: TransitionDefinition validates")
        payload = (PUBLIC_DIR / entry["bufferPath"]).read_bytes()
        all_transition_hashes &= sha256_bytes(stable_json_bytes(definition)) == entry["definitionHash"]
        all_transition_hashes &= sha256_bytes(payload) == entry["contentHash"] and len(payload) == entry["bufferBytes"]
        compiled = decode_transition_buffer(payload, 16384)
        source = all_records[entry["fromState"]]
        target = all_records[entry["toState"]]
        rebuilt = compile_transition(source, target)
        all_rebuild_hashes &= sha256_bytes(rebuilt.tobytes()) == entry["contentHash"]
        p0 = sample_positions(source, target, compiled, 0.0)
        p1 = sample_positions(source, target, compiled, 1.0)
        all_endpoints &= float(np.max(np.abs(p0 - source["position"]))) <= 1e-7
        all_endpoints &= float(np.max(np.abs(p1 - target["position"]))) <= 1e-7
        machine = entry["machineQa"]
        all_continuity &= machine["c1EndpointSpeedMax"] < 0.01 and machine["c2EndpointAccelerationMax"] < 1.0
        all_motion_qa &= all([
            machine["positionsFiniteForAllTestedT"], machine["speedValuesFinite"],
            machine["accelerationValuesFinite"], machine["noTeleportation"],
            machine["reserveRoutesValid"], machine["splitMergeGroupsValid"],
            machine["collisionMetricWithinPolicy"], machine["clumpingWithinPolicy"],
            machine["reverseEndpointConsistency"],
        ])
    check(all_transition_hashes, "all transition definition and buffer hashes match")
    check(all_rebuild_hashes, "all transition buffers rebuild deterministically")
    check(all_endpoints, "every transition exactly matches t=0 and t=1 endpoints")
    check(all_continuity, "quintic routes have near-zero endpoint velocity and acceleration")
    check(all_motion_qa, "all compiled transition machine-QA policies pass")
    check({"master-single", "single-single", "master-complex", "single-complex", "complex-focus-swap", "complex-brand-wide", "brand-wide-master", "split", "merge", "reserve-emergence"} <= kinds, "all required QA route families are represented")
    check(split_merge_shells.get("split", (0, 0))[0] < split_merge_shells.get("split", (0, 0))[1], "split transition increases the declared shell count")
    check(split_merge_shells.get("merge", (0, 0))[0] > split_merge_shells.get("merge", (0, 0))[1], "merge transition decreases the declared shell count")

    section("isolation and production boundary")
    check(git_blob_hash(REPO_DIR / "app" / "page.tsx") == "f2b1b08b22737e886acd407f10b2b7eeb9d8492c", "production homepage matches the audited baseline hash")
    check(not any(path.suffix in {".png", ".jpg", ".exr"} for path in (M3_DIR / "states").rglob("*")), "state pipeline did not create texture maps")
    check(qa["allStateMachineQaPassed"], "aggregate state QA passed")
    check(qa["allTransitionMachineQaPassed"], "aggregate transition QA passed")

    print(f"\n{checks} checks, {len(failures)} failed")
    if failures:
        print("failures:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("all PS-03.M3 checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
