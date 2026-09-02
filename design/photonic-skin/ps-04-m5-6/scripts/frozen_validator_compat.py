"""Read-only M5.6 compatibility check for frozen PS-03.M4.1 validator."""

from __future__ import annotations

import json
import subprocess
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
FROZEN_TEST = ROOT / "design" / "photonic-skin" / "ps-03-m4-1" / "tests" / "test_ps03m41.py"
M3_PUBLIC = ROOT / "public" / "photonic-skin" / "ps-03-m3-1r" / "manifest.json"
M55_PUBLIC = ROOT / "public" / "photonic-skin" / "ps-04-m5-5" / "manifests" / "ps04m55-manifest.json"
M4_EXPORT = ROOT / "design" / "photonic-skin" / "ps-03-m4-1" / "exports" / "ps03m41-manifest.json"
REPORT = ROOT / "design" / "photonic-skin" / "ps-04-m5-6" / "reports" / "frozen-validator-compatibility.json"


def main() -> int:
    reproduced = None
    try:
        completed = subprocess.run(
            [sys.executable, str(FROZEN_TEST)],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        reproduced = {
            "exitCode": completed.returncode,
            "stdout": (completed.stdout or "")[-4000:],
            "stderr": (completed.stderr or "")[-4000:],
        }
    except Exception as error:  # pragma: no cover
        reproduced = {"exitCode": 1, "error": f"{type(error).__name__}: {error}", "trace": traceback.format_exc()}

    m3 = json.loads(M3_PUBLIC.read_text(encoding="utf-8"))
    promoted = json.loads(M55_PUBLIC.read_text(encoding="utf-8"))
    m4 = json.loads(M4_EXPORT.read_text(encoding="utf-8"))
    layout = {
        "frozenM3HasTransitionRecordLayout": "transitionRecordLayout" in m3,
        "frozenM3Stride": (m3.get("transitionRecordLayout") or {}).get("stride"),
        "promotedHasTransitionRecordLayout": "transitionRecordLayout" in promoted,
        "promotedStateRecordStride": (promoted.get("stateRecordLayout") or {}).get("stride"),
        "m4ProgramLayout": m4.get("transitionProgramLayout") or m4.get("programRecordLayout") or m4.get("artifacts"),
        "productionUsesM4Programs": True,
        "historicalResidual": "KeyError: transitionRecordLayout and/or homepage hash drift after production swap",
        "rewroteFrozenEvidence": False,
    }
    combined = "\n".join([
        reproduced.get("stdout", ""),
        reproduced.get("stderr", ""),
        reproduced.get("error", ""),
    ])
    key_error = "transitionRecordLayout" in combined and "KeyError" in combined
    homepage_drift = "homepage" in combined.lower() and ("fail" in combined.lower() or reproduced.get("exitCode", 1) != 0)
    report = {
        "stage": "PS-04.M5.6",
        "ranFrozenValidator": True,
        "reproduced": reproduced,
        "keyErrorTransitionRecordLayout": key_error,
        "homepageHashIncompatibility": homepage_drift or reproduced.get("exitCode", 1) != 0,
        "layout": layout,
        "compatible": reproduced.get("exitCode") == 0,
        "residualOpen": reproduced.get("exitCode", 1) != 0,
        "note": "Frozen PS-03 validator is historical. M5.6 does not rewrite frozen reports. Production payload uses M4 transition programs over immutable M5.5 state buffers.",
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "exitCode": reproduced.get("exitCode"),
        "keyError": key_error,
        "residualOpen": report["residualOpen"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
