"""Rebuild PS-03.M3.1 and verify stable definitions, buffers, and fingerprint."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
M31_DIR = SCRIPT_DIR.parent
REPO_DIR = M31_DIR.parents[2]
MANIFEST_PATH = M31_DIR / "exports" / "ps03m31-manifest.json"
PUBLIC_DIR = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1"
REPORT_PATH = M31_DIR / "reports" / "ps03m31-determinism.json"


def read_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def snapshot() -> dict:
    manifest = read_manifest()
    states = {}
    for entry in manifest["states"]:
        payload = (PUBLIC_DIR / entry["bufferPath"]).read_bytes()
        states[entry["stateId"]] = {
            "definitionHash": entry["definitionHash"],
            "contentHash": entry["contentHash"],
            "fileSha256": hashlib.sha256(payload).hexdigest(),
            "bufferBytes": len(payload),
        }
    return {
        "deterministicFingerprint": manifest["deterministicFingerprint"],
        "descriptorHash": manifest["descriptorHash"],
        "stateVersion": manifest["stateVersion"],
        "states": states,
    }


def main() -> int:
    before = snapshot()
    completed = subprocess.run(
        [sys.executable, str(SCRIPT_DIR / "build_ps03m31.py")],
        cwd=REPO_DIR,
        check=False,
        capture_output=True,
        text=True,
    )
    after = snapshot() if completed.returncode == 0 else None
    stable = completed.returncode == 0 and before == after
    report = {
        "stage": "PS-03.M3.1",
        "passed": stable,
        "builderExitCode": completed.returncode,
        "fingerprintBefore": before["deterministicFingerprint"],
        "fingerprintAfter": after["deterministicFingerprint"] if after else None,
        "stateCount": len(before["states"]),
        "stableStateCount": sum(before["states"].get(key) == (after or {"states": {}})["states"].get(key) for key in before["states"]),
        "descriptorHashStable": bool(after and before["descriptorHash"] == after["descriptorHash"]),
        "stderr": completed.stderr[-2000:],
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if stable else 1


if __name__ == "__main__":
    raise SystemExit(main())
