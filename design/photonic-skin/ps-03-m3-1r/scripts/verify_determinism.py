"""Rebuild PS-03.M3.1R and verify stable definitions, buffers, and fingerprint."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys

from m31r_core import M31R_DIR, PUBLIC_M31R, read_json, write_json


MANIFEST_PATH = M31R_DIR / "exports" / "ps03m31r-manifest.json"
REPORT_PATH = M31R_DIR / "reports" / "ps03m31r-determinism.json"


def snapshot() -> dict:
    manifest = read_json(MANIFEST_PATH)
    return {
        "deterministicFingerprint": manifest["deterministicFingerprint"],
        "descriptorHash": manifest["descriptorHash"],
        "stateVersion": manifest["stateVersion"],
        "states": {
            entry["stateId"]: {
                "definitionHash": entry["definitionHash"],
                "contentHash": entry["contentHash"],
                "fileSha256": hashlib.sha256((PUBLIC_M31R / entry["bufferPath"]).read_bytes()).hexdigest(),
            }
            for entry in manifest["states"]
        },
    }


def main() -> int:
    before = snapshot()
    completed = subprocess.run([sys.executable, str(M31R_DIR / "scripts" / "build_ps03m31r.py")], cwd=M31R_DIR.parents[2], capture_output=True, text=True, check=False)
    after = snapshot() if completed.returncode == 0 else None
    stable = completed.returncode == 0 and before == after
    report = {
        "stage": "PS-03.M3.1R", "passed": stable, "builderExitCode": completed.returncode,
        "fingerprintBefore": before["deterministicFingerprint"],
        "fingerprintAfter": after["deterministicFingerprint"] if after else None,
        "stateCount": len(before["states"]),
        "stableStateCount": sum(before["states"].get(key) == (after or {"states": {}})["states"].get(key) for key in before["states"]),
        "descriptorHashStable": bool(after and before["descriptorHash"] == after["descriptorHash"]),
        "stderr": completed.stderr[-2000:],
    }
    write_json(REPORT_PATH, report)
    print(json.dumps(report, indent=2))
    return 0 if stable else 1


if __name__ == "__main__":
    raise SystemExit(main())
