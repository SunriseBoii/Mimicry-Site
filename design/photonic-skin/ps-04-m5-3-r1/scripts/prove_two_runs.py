"""Two independent R1 authoring runs must emit identical hashes."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
STAGE = ROOT / "design" / "photonic-skin" / "ps-04-m5-3-r1"
SCRIPT = STAGE / "scripts" / "refine_clapperboard_hinge.py"
NAMES = ("combo-20-r1", "combo-30-r1", "combo-40-r1")


def sha(path: Path) -> str:
    import hashlib
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot() -> dict[str, str]:
    out = {}
    for name in NAMES:
        out[name] = sha(STAGE / "variants" / name / "single-video.state.bin")
        out[f"public:{name}"] = sha(ROOT / "public" / "photonic-skin" / "ps-04-m5-3-r1" / "variants" / name / "single-video.state.bin")
    return out


def run() -> dict[str, str]:
    completed = subprocess.run([sys.executable, str(SCRIPT)], cwd=str(ROOT), check=True, capture_output=True, text=True)
    sys.stdout.write(completed.stdout)
    if completed.stderr:
        sys.stderr.write(completed.stderr)
    return snapshot()


def main() -> int:
    first = run()
    second = run()
    payload = {
        "hashRun1": first,
        "hashRun2": second,
        "identical": first == second,
        "combo30r1": second["combo-30-r1"],
    }
    (STAGE / "reports" / "two-run-identity.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"identical": payload["identical"], "combo30r1": payload["combo30r1"]}, indent=2))
    return 0 if payload["identical"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
