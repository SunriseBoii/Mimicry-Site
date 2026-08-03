"""Checksum snapshots proving PS-03.3 and PS-03.4 D-R2 stay untouched.

Run with mode=before once prior to any D-R3 authoring and mode=after when the
D-R3 pass is complete.  The D-R3 revision lives entirely inside
design/photonic-skin/ps-03-4/d-r3/, which is excluded from the protected
PS-03.4 tree.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve()
D_R3_DIR = SCRIPT_PATH.parent.parent
PS034_DIR = D_R3_DIR.parent
REPO_DIR = PS034_DIR.parents[2]
PS033_DIR = REPO_DIR / "design" / "photonic-skin" / "ps-03-3"
OUTPUT = D_R3_DIR / "exports" / "ps03-4-d-r3-checksums.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def checksum_tree(root: Path, exclude: Path | None = None) -> dict[str, str]:
    result = {}
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if exclude is not None and exclude in path.parents:
            continue
        result[str(path.relative_to(REPO_DIR)).replace("\\", "/")] = sha256_file(path)
    return result


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "before"
    if mode not in ("before", "after"):
        raise SystemExit("mode must be 'before' or 'after'")
    snapshot = {
        "ps03_3": checksum_tree(PS033_DIR),
        "ps03_4_d_r2": checksum_tree(PS034_DIR, exclude=D_R3_DIR),
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT.exists():
        report = json.loads(OUTPUT.read_text(encoding="utf8"))
    else:
        report = {
            "stage": "PS-03.4 D-R3",
            "algorithm": "SHA-256",
            "protected_sources": ["PS-03.3 D-R1", "PS-03.4 D-R2 (excluding d-r3/)"],
            "before": None,
            "after": None,
            "unchanged": None,
        }
    report[mode] = {
        "captured_at": snapshot["captured_at"],
        "ps03_3_file_count": len(snapshot["ps03_3"]),
        "ps03_4_d_r2_file_count": len(snapshot["ps03_4_d_r2"]),
        "ps03_3_files": snapshot["ps03_3"],
        "ps03_4_d_r2_files": snapshot["ps03_4_d_r2"],
    }
    if report["before"] is not None and report["after"] is not None:
        report["unchanged"] = (
            report["before"]["ps03_3_files"] == report["after"]["ps03_3_files"]
            and report["before"]["ps03_4_d_r2_files"]
            == report["after"]["ps03_4_d_r2_files"]
        )
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    print(
        "PS034_DR3_CHECKSUMS",
        mode,
        {
            "ps03_3": len(snapshot["ps03_3"]),
            "ps03_4_d_r2": len(snapshot["ps03_4_d_r2"]),
            "unchanged": report["unchanged"],
        },
    )


if __name__ == "__main__":
    main()
