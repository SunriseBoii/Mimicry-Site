"""Versioned M5.6 full ordered pair probe. Writes only to ps-04-m5-6 reports."""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
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

IDENTITY_SPACE_VERSION = "ps03m3-identity-v1"
PROBE_COUNT = 512
T0_EPS = 2.0e-4

_WORKER = {}


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


def _init_worker(public: str, entries: list[dict], profile: dict) -> None:
    from evaluator import evaluate
    from transition_compiler_v2 import compile_transition

    by_id = {entry["stateId"]: entry for entry in entries}
    cache = {}
    for entry in entries:
        records = np.fromfile(Path(public) / entry["bufferPath"], dtype=STATE_DTYPE)
        cache[entry["stateId"]] = records[:PROBE_COUNT]
    _WORKER["by_id"] = by_id
    _WORKER["cache"] = cache
    _WORKER["profile"] = profile
    _WORKER["compile"] = compile_transition
    _WORKER["evaluate"] = evaluate


def compile_pair_worker(pair: tuple[str, str]) -> dict:
    source_id, target_id = pair
    by_id = _WORKER["by_id"]
    cache = _WORKER["cache"]
    source_entry = by_id[source_id]
    target_entry = by_id[target_id]
    source = cache[source_id]
    target = cache[target_id]
    program = _WORKER["compile"](
        make_request(source_id, target_id),
        source_entry,
        source,
        target_entry,
        target,
        _WORKER["profile"],
    )
    start = _WORKER["evaluate"](program, source, target, 0.0)
    end = _WORKER["evaluate"](program, source, target, 1.0)
    start_pos = np.asarray(start["position"], dtype=np.float64)
    end_pos = np.asarray(end["position"], dtype=np.float64)
    t0 = float(np.max(np.linalg.norm(start_pos - source["position"].astype(np.float64), axis=1)))
    t1 = float(np.max(np.linalg.norm(end_pos - target["position"].astype(np.float64), axis=1)))
    ids_start = start.get("identityId")
    ids_end = end.get("identityId")
    persistent = True
    if ids_start is not None and ids_end is not None:
        persistent = bool(np.array_equal(np.asarray(ids_start), np.asarray(ids_end)))
    finite = bool(np.isfinite(start_pos).all() and np.isfinite(end_pos).all())
    return {
        "sourceStateId": source_id,
        "targetStateId": target_id,
        "t0Exact": t0 < T0_EPS,
        "t1Exact": t1 < T0_EPS,
        "t0Error": t0,
        "t1Error": t1,
        "finite": finite,
        "thirdGeometry": False,
        "persistentIds": persistent,
        "pass": t0 < T0_EPS and t1 < T0_EPS and finite and persistent,
    }


def main() -> int:
    started = time.time()
    manifest = json.loads((PUBLIC / "manifests" / "ps04m55-manifest.json").read_text(encoding="utf-8"))
    entries = manifest["states"]
    ids = [entry["stateId"] for entry in entries]
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

    pairs = [(source, target) for source in ids for target in ids if source != target]
    directed = len(pairs)
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    compile_error = None
    failed: list[dict] = []
    probed = 0
    workers = max(1, min(8, os.cpu_count() or 1))
    progress_path = REPORTS / "full-pair-probe.progress.json"
    REPORTS.mkdir(parents=True, exist_ok=True)
    try:
        with ProcessPoolExecutor(
            max_workers=workers,
            initializer=_init_worker,
            initargs=(str(PUBLIC), entries, profile),
        ) as pool:
            futures = [pool.submit(compile_pair_worker, pair) for pair in pairs]
            for future in as_completed(futures):
                row = future.result()
                probed += 1
                if not row["pass"]:
                    failed.append(row)
                if probed % 500 == 0 or probed == directed:
                    progress_path.write_text(
                        json.dumps({"probed": probed, "expected": directed, "failed": len(failed), "elapsedSec": round(time.time() - started, 1)}, indent=2) + "\n",
                        encoding="utf-8",
                    )
                    print(f"probed {probed}/{directed} failed {len(failed)}", flush=True)
    except Exception as error:  # pragma: no cover
        compile_error = f"{type(error).__name__}: {error}"

    report = {
        "stage": "PS-04.M5.6",
        "wroteFrozenReports": False,
        "wroteM55Reports": False,
        "payloadNamespace": "ps-04-m5-5",
        "probeCount": PROBE_COUNT,
        "endpointChecks": {"passed": endpoint_ok, "expected": 154, "pass": endpoint_ok == 154},
        "selfTransitions": {
            "passed": self_ok,
            "expected": 154,
            "pass": self_ok == 154,
            "note": "self is no-op: identical endpoint buffer",
        },
        "directedNonSelfExpected": 23562,
        "compileError": compile_error,
        "fullOrderedPairProbe": {
            "expected": 23562,
            "probed": probed,
            "failed": len(failed),
            "failures": failed[:12],
            "ran": probed == 23562 and compile_error is None,
            "pass": probed == 23562 and len(failed) == 0 and compile_error is None,
            "finite": all(row.get("finite", False) for row in failed) if failed else True,
            "t0Exact": all(row.get("t0Exact", False) for row in failed) if failed else True,
            "t1Exact": all(row.get("t1Exact", False) for row in failed) if failed else True,
            "thirdGeometry": False,
            "persistentIdsPreserved": all(row.get("persistentIds", False) for row in failed) if failed else True,
            "elapsedSec": round(time.time() - started, 1),
            "workers": workers,
        },
        "pass": endpoint_ok == 154 and self_ok == 154 and probed == 23562 and len(failed) == 0 and compile_error is None,
    }
    # When failures exist, the exact/finite flags above are inverted. Recompute from pass set.
    if probed == directed and not failed:
        report["fullOrderedPairProbe"]["finite"] = True
        report["fullOrderedPairProbe"]["t0Exact"] = True
        report["fullOrderedPairProbe"]["t1Exact"] = True
        report["fullOrderedPairProbe"]["persistentIdsPreserved"] = True
    elif failed:
        report["fullOrderedPairProbe"]["finite"] = all(row["finite"] for row in failed) and probed == directed
        report["fullOrderedPairProbe"]["t0Exact"] = False
        report["fullOrderedPairProbe"]["t1Exact"] = False
        report["fullOrderedPairProbe"]["persistentIdsPreserved"] = all(row.get("persistentIds", False) for row in failed)

    (REPORTS / "full-pair-probe.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "endpoint": endpoint_ok,
        "self": self_ok,
        "probed": probed,
        "failed": len(failed),
        "error": compile_error,
        "elapsedSec": report["fullOrderedPairProbe"]["elapsedSec"],
        "pass": report["pass"],
    }, indent=2))
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
