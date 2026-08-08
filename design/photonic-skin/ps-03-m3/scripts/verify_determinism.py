"""Run the PS-03.M3 generator twice and compare every deterministic artifact."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path


M3_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = Path(__file__).resolve().parents[4]
PUBLIC_DIR = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3"
REPORT_PATH = M3_DIR / "reports" / "ps03m3-determinism.json"


def file_hashes() -> dict[str, str]:
    roots = [
        M3_DIR / "states" / "resolved",
        M3_DIR / "transitions" / "definitions",
        M3_DIR / "exports",
        PUBLIC_DIR,
    ]
    selected = [
        M3_DIR / "reports" / "ps03m3-gate-a.json",
        M3_DIR / "reports" / "ps03m3-qa-summary.json",
        M3_DIR / "reports" / "ps03m3-correspondence-metrics.json",
    ]
    files = [path for root in roots for path in root.rglob("*") if path.is_file()]
    files.extend(path for path in selected if path.is_file())
    return {
        path.relative_to(REPO_DIR).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(set(files))
    }


def run_build() -> str:
    environment = os.environ.copy()
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    result = subprocess.run(
        [sys.executable, str(M3_DIR / "scripts" / "build_ps03m3.py"), "--clean"],
        cwd=REPO_DIR,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return result.stdout.strip()


def aggregate(values: dict[str, str]) -> str:
    payload = json.dumps(values, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def main() -> int:
    first_output = run_build()
    first = file_hashes()
    second_output = run_build()
    second = file_hashes()
    differing = sorted(set(first) | set(second))
    differing = [path for path in differing if first.get(path) != second.get(path)]
    report = {
        "stage": "PS-03.M3",
        "method": "two clean builds; SHA-256 comparison of state, transition, identity, manifest, Gate A and QA artifacts",
        "deterministic": not differing,
        "fileCount": len(second),
        "firstAggregateSha256": aggregate(first),
        "secondAggregateSha256": aggregate(second),
        "differingFiles": differing,
        "firstBuild": first_output,
        "secondBuild": second_output,
        "excluded": ["ps03m3-build-performance.json", "ps03m3-browser-performance.json", "renders"],
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"deterministic={report['deterministic']} files={report['fileCount']} aggregate={report['secondAggregateSha256']}")
    if differing:
        print("differing:", *differing, sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
