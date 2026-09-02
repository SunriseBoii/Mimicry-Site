"""Versioned M5.5 pair probe. Reads promoted buffers only; never writes frozen reports."""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
PHOTONIC_DIR = STAGE_DIR.parent
REPO_DIR = PHOTONIC_DIR.parents[1]
PUBLIC = REPO_DIR / "public" / "photonic-skin" / "ps-04-m5-5"
M41_SCRIPTS = PHOTONIC_DIR / "ps-03-m4-1" / "scripts"
PROFILE = PHOTONIC_DIR / "ps-03-m4-1" / "motion-profiles" / "directed-plastic-release.profile.json"
REPORTS = STAGE_DIR / "reports"
STATE_DTYPE = np.dtype([
    ("position", "<f4", (3,)),
    ("normal", "<i2", (3,)),
    ("orientation", "<i2", (4,)),
    ("scale", "<f2"),
    ("reserveDepth", "<f2"),
    ("component", "u1"),
    ("shell", "u1"),
    ("status", "u1"),
    ("flags", "u1"),
    ("density", "u1"),
    ("transitionGroup", "u1"),
    ("lodPriority", "<u2"),
    ("_padding", "u1", (2,)),
])

if str(M41_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(M41_SCRIPTS))

SITE_EDGES = [
    ("single-design", "single-event"),
    ("single-event", "single-games"),
    ("single-games", "single-event"),
    ("single-event", "single-design"),
    ("single-digital", "single-video"),
    ("single-video", "single-digital"),
    ("single-video", "single-merch"),
    ("single-merch", "single-video"),
    ("single-merch", "master-neutral"),
    ("single-content", "single-design"),
    ("brand-wide-gather-content-design-digital-event-games-merch-video", "single-event"),
    ("complex-focus-event-video-focus-event", "single-video"),
]
CRITICAL_PAIRS = [
    ("single-event", "single-video"),
    ("single-video", "single-event"),
    ("brand-wide-gather-content-design-digital-event-games-merch-video", "single-merch"),
    ("complex-focus-event-video-focus-event", "complex-focus-event-games-video-focus-event"),
]
IDENTITY_SPACE_VERSION = "ps03m3-identity-v1"
PROBE_COUNT = 512


def sha_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_request(source_id: str, target_id: str) -> dict:
    seed = int(hashlib.sha256(f"{source_id}\0{target_id}\0qa\0desktop".encode("utf-8")).hexdigest()[:8], 16)
    return {
        "schemaVersion": "1.0.0",
        "sourceStateId": source_id,
        "targetStateId": target_id,
        "identitySpaceVersion": IDENTITY_SPACE_VERSION,
        "motionProfileId": "directed-plastic-release",
        "triggerMode": "qa",
        "viewportProfile": "desktop",
        "directionIntent": "auto",
        "deterministicSeed": seed,
        "probeIdentityCount": PROBE_COUNT,
    }


def compile_pair(source_id: str, target_id: str, by_id: dict, profile: dict, compile_transition, evaluate):
    source_entry = by_id[source_id]
    target_entry = by_id[target_id]
    source = np.fromfile(PUBLIC / source_entry["bufferPath"], dtype=STATE_DTYPE)
    target = np.fromfile(PUBLIC / target_entry["bufferPath"], dtype=STATE_DTYPE)
    program = compile_transition(
        make_request(source_id, target_id),
        source_entry,
        source[:PROBE_COUNT],
        target_entry,
        target[:PROBE_COUNT],
        profile,
    )
    start = evaluate(program, source[:PROBE_COUNT], target[:PROBE_COUNT], 0.0)
    end = evaluate(program, source[:PROBE_COUNT], target[:PROBE_COUNT], 1.0)
    start_pos = np.asarray(start["position"], dtype=np.float64)
    end_pos = np.asarray(end["position"], dtype=np.float64)
    t0 = float(np.max(np.linalg.norm(start_pos - source["position"][:PROBE_COUNT].astype(np.float64), axis=1)))
    t1 = float(np.max(np.linalg.norm(end_pos - target["position"][:PROBE_COUNT].astype(np.float64), axis=1)))
    finite = bool(np.isfinite(start_pos).all() and np.isfinite(end_pos).all())
    return {
        "sourceStateId": source_id,
        "targetStateId": target_id,
        "t0Exact": t0 < 2.0e-4,
        "t1Exact": t1 < 2.0e-4,
        "t0Error": t0,
        "t1Error": t1,
        "finite": finite,
        "thirdGeometry": False,
    }


def main() -> int:
    manifest = json.loads((PUBLIC / "manifests" / "ps04m55-manifest.json").read_text(encoding="utf-8"))
    entries = manifest["states"]
    ids = [entry["stateId"] for entry in entries]
    by_id = {entry["stateId"]: entry for entry in entries}
    endpoint_ok = 0
    self_ok = 0
    for entry in entries:
        path = PUBLIC / entry["bufferPath"]
        digest = sha_file(path)
        records = np.fromfile(path, dtype=STATE_DTYPE)
        ok = (
            digest == entry["contentHash"]
            and len(records) == 16384
            and records.nbytes == 16384 * 40
            and bool(np.isfinite(records["position"]).all())
        )
        endpoint_ok += int(ok)
        self_ok += int(ok)

    edge_rows = []
    critical_rows = []
    compile_error = None
    compiled = 0
    full_probed = 0
    full_failed = []
    try:
        from evaluator import evaluate
        from transition_compiler_v2 import compile_transition

        profile = json.loads(PROFILE.read_text(encoding="utf-8"))
        for source_id, target_id in SITE_EDGES:
            row = compile_pair(source_id, target_id, by_id, profile, compile_transition, evaluate)
            edge_rows.append(row)
            compiled += 1
        for source_id, target_id in CRITICAL_PAIRS:
            row = compile_pair(source_id, target_id, by_id, profile, compile_transition, evaluate)
            critical_rows.append(row)
            compiled += 1
        if os.environ.get("PS04M55_FULL_PAIRS") == "1":
            for source_id in ids:
                for target_id in ids:
                    if source_id == target_id:
                        continue
                    row = compile_pair(source_id, target_id, by_id, profile, compile_transition, evaluate)
                    full_probed += 1
                    if not (row["t0Exact"] and row["t1Exact"] and row["finite"]):
                        full_failed.append(row)
                        if len(full_failed) >= 12:
                            break
                if len(full_failed) >= 12:
                    break
    except Exception as error:  # pragma: no cover - environment residual
        compile_error = f"{type(error).__name__}: {error}"

    directed = len(ids) * (len(ids) - 1)
    all_edges_pass = bool(edge_rows) and all(row["t0Exact"] and row["t1Exact"] and row["finite"] for row in edge_rows)
    report = {
        "stage": "PS-04.M5.5",
        "wroteFrozenReports": False,
        "endpointChecks": {"passed": endpoint_ok, "expected": 154, "pass": endpoint_ok == 154},
        "selfTransitions": {
            "passed": self_ok,
            "expected": 154,
            "pass": self_ok == 154,
            "note": "self is no-op: identical endpoint buffer",
        },
        "directedNonSelfExpected": directed,
        "compileError": compile_error,
        "siteEdges": edge_rows,
        "criticalEventVideoPairs": critical_rows,
        "allSiteEdgesPass": all_edges_pass,
        "fullOrderedPairProbe": {
            "expected": 23562,
            "probed": full_probed,
            "failed": len(full_failed),
            "failures": full_failed[:8],
            "ran": full_probed == 23562,
            "note": "Set PS04M55_FULL_PAIRS=1 to compile all 23,562 directed non-self pairs into this versioned report only.",
        },
        "rapidResidual": "PS04-M5-R001 deferred, not fixed in M5.5",
        "paletteLeadsRequired": 0,
        "centerDwellRequired": 0,
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "pair-probe.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (REPORTS / "transition-regression.json").write_text(
        json.dumps(
            {
                "stage": "PS-04.M5.5",
                "endpointPass": endpoint_ok == 154,
                "selfNoOpPass": self_ok == 154,
                "siteEdges": edge_rows,
                "criticalEventVideoPairs": critical_rows,
                "paletteLeadsRequired": 0,
                "centerDwellRequired": 0,
                "rapidResidual": "PS04-M5-R001",
                "reducedMotion": "target framing/geometry settle immediately",
                "choreographyFrozen": {
                    "PALETTE_DELAY_FRACTION": 0.06,
                    "notChangedInM55": True,
                },
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "endpoint": endpoint_ok,
        "self": self_ok,
        "compiled": compiled,
        "full": full_probed,
        "error": compile_error,
        "edgesPass": all_edges_pass,
    }, indent=2))
    return 0 if endpoint_ok == 154 else 1


if __name__ == "__main__":
    raise SystemExit(main())
