"""Two independent authoring runs must emit the same EVENT_A_R2 hash."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
STAGE = ROOT / "design" / "photonic-skin" / "ps-04-m5-2-r2"
SCRIPT = STAGE / "scripts" / "refine_event_a_viewer_right.py"
BIN = STAGE / "variants" / "a-r2" / "single-event.state.bin"
PUBLIC = ROOT / "public" / "photonic-skin" / "ps-04-m5-2" / "variants" / "a-r2" / "single-event.state.bin"
EXPECTED = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run() -> str:
    completed = subprocess.run([sys.executable, str(SCRIPT)], cwd=str(ROOT), check=True, capture_output=True, text=True)
    sys.stdout.write(completed.stdout)
    if completed.stderr:
        sys.stderr.write(completed.stderr)
    return sha(BIN)


def main() -> int:
    hash1 = run()
    hash2 = run()
    payload = {
        "hashRun1": hash1,
        "hashRun2": hash2,
        "expected": EXPECTED,
        "identical": hash1 == hash2,
        "matchesExpected": hash1 == EXPECTED and hash2 == EXPECTED,
        "publicMatches": sha(PUBLIC) == hash1,
        "source": "original EVENT_A",
    }
    (STAGE / "reports" / "two-run-identity.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2))
    return 0 if payload["identical"] and payload["matchesExpected"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
