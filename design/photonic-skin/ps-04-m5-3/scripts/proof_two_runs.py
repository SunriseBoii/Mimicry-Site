"""Second authoring run must reproduce the first Video candidate hashes."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
VARIANTS = ("baseline", "combo-20", "combo-30", "combo-40", "camera-20", "camera-30", "camera-40")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def hashes() -> dict[str, str]:
    out: dict[str, str] = {}
    for name in VARIANTS:
        design = STAGE_DIR / "variants" / name / "single-video.state.bin"
        public = STAGE_DIR.parents[2] / "public" / "photonic-skin" / "ps-04-m5-3" / "variants" / name / "single-video.state.bin"
        out[name] = sha(design)
        out[f"public:{name}"] = sha(public)
    return out


def main() -> int:
    run1 = hashes()
    builder = SCRIPT_DIR / "build_video_candidates.py"
    subprocess.check_call([sys.executable, str(builder)], cwd=str(STAGE_DIR.parents[2]))
    run2 = hashes()
    mismatches = {key: {"run1": run1[key], "run2": run2[key]} for key in run1 if run1[key] != run2[key]}
    payload = {
        "stage": "PS-04.M5.3",
        "method": "hash existing buffers, re-run build_video_candidates.py, hash again",
        "run1": run1,
        "run2": run2,
        "identical": not mismatches,
        "mismatches": mismatches,
        "combo30": run2["combo-30"],
        "baseline": run2["baseline"],
    }
    (STAGE_DIR / "reports" / "two-run-identity.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"identical": payload["identical"], "combo30": payload["combo30"], "mismatches": list(mismatches)}))
    return 0 if not mismatches else 1


if __name__ == "__main__":
    raise SystemExit(main())
