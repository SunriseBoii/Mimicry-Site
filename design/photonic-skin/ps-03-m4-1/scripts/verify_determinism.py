"""Run two clean PS-03.M4.1 builds and compare deterministic artifacts."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from orchestration import (  # noqa: E402
    EXPORT_DIR,
    M4_DIR,
    PROFILE_DIR,
    PROGRAM_DIR,
    PUBLIC_DIR,
    REPORT_DIR,
    SCHEMA_DIR,
    aggregate_hash,
    file_hashes,
    frozen_m3_hashes,
    homepage_hashes,
    write_json,
)


REPORT_PATH = REPORT_DIR / "ps03m41-determinism.json"


def deterministic_hashes() -> dict[str, str]:
    roots = (SCHEMA_DIR, PROFILE_DIR, PROGRAM_DIR, EXPORT_DIR, PUBLIC_DIR)
    paths = [path for root in roots if root.exists() for path in root.rglob("*") if path.is_file()]
    selected_reports = (
        "ps03m41-input-guards.json",
        "ps03m41-risk-suite.json",
        "ps03m41-pair-probe-summary.json",
        "ps03m41-self-transition-qa.json",
        "ps03m41-full-n-qa.json",
        "ps03m41-endpoint-vs-m41.json",
        "ps03m41-qa-summary.json",
    )
    paths.extend(REPORT_DIR / name for name in selected_reports if (REPORT_DIR / name).is_file())
    return file_hashes(paths)


def run_build(*, skip_pair_probe: bool = False) -> tuple[str, float]:
    environment = os.environ.copy()
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    environment["PYTHONHASHSEED"] = "0"
    command = [sys.executable, str(SCRIPTS_DIR / "build_ps03m41.py"), "--clean"]
    if skip_pair_probe:
        command.append("--skip-pair-probe")
    started = time.perf_counter()
    result = subprocess.run(
        command,
        cwd=M4_DIR.parents[2],
        env=environment,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return result.stdout.strip(), time.perf_counter() - started


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--quick",
        action="store_true",
        help="developer-only two-build smoke without all-pair evidence; not acceptance determinism",
    )
    args = parser.parse_args()
    m3_before = frozen_m3_hashes()
    homepage_before = homepage_hashes()
    first_output, first_seconds = run_build(skip_pair_probe=args.quick)
    first = deterministic_hashes()
    second_output, second_seconds = run_build(skip_pair_probe=args.quick)
    second = deterministic_hashes()
    differing = sorted(path for path in set(first) | set(second) if first.get(path) != second.get(path))
    m3_after = frozen_m3_hashes()
    homepage_after = homepage_hashes()
    report = {
        "stage": "PS-03.M4.1",
        "method": "two clean builds; SHA-256 comparison of schemas, profile, approval programs, group/per-ID binaries, golden fixtures, probes, full-N QA, manifests and M4 public runtime assets",
        "acceptanceMode": not args.quick,
        "deterministic": not differing and m3_before == m3_after and homepage_before == homepage_after,
        "fileCount": len(second),
        "firstAggregateSha256": aggregate_hash(first),
        "secondAggregateSha256": aggregate_hash(second),
        "differingFileCount": len(differing),
        "differingFiles": differing,
        "firstBuild": first_output,
        "secondBuild": second_output,
        "firstBuildSeconds": first_seconds,
        "secondBuildSeconds": second_seconds,
        "m3FrozenFileCount": len(m3_after),
        "m3FrozenAggregateBefore": aggregate_hash(m3_before),
        "m3FrozenAggregateAfter": aggregate_hash(m3_after),
        "m3FrozenInputsUnchanged": m3_before == m3_after,
        "homepageAggregateBefore": aggregate_hash(homepage_before),
        "homepageAggregateAfter": aggregate_hash(homepage_after),
        "productionHomepageUnchanged": homepage_before == homepage_after,
        "excluded": [
            "ps03m41-build-performance.json",
            "ps03m41-determinism.json",
            "ps03m41-browser-performance.json",
            "ps03m41-browser-runtime-qa.json",
            "ps03m41-visual-evidence.json",
            "renders/",
            "encoded media and browser timing/screenshots",
        ],
    }
    write_json(REPORT_PATH, report)
    print(
        f"deterministic={report['deterministic']} files={report['fileCount']} "
        f"aggregate={report['secondAggregateSha256']}"
    )
    if differing:
        for path in differing:
            print(f"  DIFF {path}")
    return 0 if report["deterministic"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
