"""Geometry and visibility gates for M5.3 Video candidates."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
PHOTONIC_DIR = STAGE_DIR.parent
REPO_DIR = PHOTONIC_DIR.parents[1]
M3_SCRIPTS = PHOTONIC_DIR / "ps-03-m3" / "scripts"
PUBLIC_M31R = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1r"
PUBLIC_VARIANTS = REPO_DIR / "public" / "photonic-skin" / "ps-04-m5-3" / "variants"

if str(M3_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(M3_SCRIPTS))
import state_builder as m3  # noqa: E402

FROZEN = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b"
IDENTITY = 16384
PREFIXES = (512, 1024, 2048, 4096, 8192, 12288, 16384)
COMBO = ("combo-20", "combo-30", "combo-40")
CAMERA = ("camera-20", "camera-30", "camera-40")
COMBO_REQUIRED = ("camera-body", "camera-lens", "slate-board", "slate-hinged-bar")
CAMERA_REQUIRED = ("camera-body", "camera-lens")
CAMERA_ASYM = ("camera-top", "camera-rear")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(name: str) -> np.ndarray:
    return np.fromfile(STAGE_DIR / "variants" / name / "single-video.state.bin", dtype=m3.STATE_DTYPE)


def aabb(records: np.ndarray, index: int) -> tuple[np.ndarray, np.ndarray] | None:
    live = (records["status"] == m3.STATUS_ACTIVE) & (records["component"] == index)
    if not np.any(live):
        return None
    points = records["position"][live].astype(np.float64)
    return points.min(axis=0), points.max(axis=0)


def main() -> int:
    failures: list[str] = []
    frozen = PUBLIC_M31R / "states" / "single-video.state.bin"
    baseline = STAGE_DIR / "variants" / "baseline" / "single-video.state.bin"
    if sha(frozen) != FROZEN:
        failures.append("frozen Video hash changed")
    if sha(baseline) != FROZEN:
        failures.append("VIDEO_BASELINE hash mismatch")
    if sha(frozen) != sha(PUBLIC_VARIANTS / "baseline" / "single-video.state.bin"):
        failures.append("public baseline != frozen")

    combo_ids = json.loads((STAGE_DIR / "variants" / "combo-30" / "component-map.json").read_text(encoding="utf-8"))["componentIds"]
    if combo_ids[4] != "slate-board" or combo_ids[6] != "slate-hinged-bar":
        failures.append("board and hinged bar are not separate components")

    anatomy = {"stage": "PS-04.M5.3", "variants": {}}
    for name in (*COMBO, *CAMERA, "baseline"):
        records = load(name)
        public = sha(PUBLIC_VARIANTS / name / "single-video.state.bin")
        design = sha(STAGE_DIR / "variants" / name / "single-video.state.bin")
        if public != design:
            failures.append(f"{name} public/design hash mismatch")
        if len(records) != IDENTITY:
            failures.append(f"{name} N={len(records)}")
        if not np.array_equal(records["lodPriority"], np.arange(IDENTITY, dtype=np.uint16)):
            failures.append(f"{name} lodPriority rewritten")
        if not np.isfinite(records["position"]).all():
            failures.append(f"{name} non-finite")
        manifest = json.loads((STAGE_DIR / "variants" / name / "manifest.json").read_text(encoding="utf-8"))
        cmap = manifest["componentMap"]
        empty = [item["componentId"] for item in cmap if not item["visibleProfiles"]]
        if empty:
            failures.append(f"{name} empty visibleProfiles: {empty}")
        missing_sil = [item["componentId"] for item in cmap if "silhouette180" not in item["visibleProfiles"] or "silhouette96" not in item["visibleProfiles"]]
        if name != "baseline" and missing_sil:
            failures.append(f"{name} missing silhouette profiles: {missing_sil}")
        row = {
            "hash": design,
            "signedYawDegrees": manifest.get("signedYawDegrees"),
            "activeCount": manifest["activeCount"],
            "componentCounts": manifest["componentCounts"],
            "visibleProfilesNonEmpty": not empty,
        }
        if name.startswith("combo"):
            board = aabb(records, 4)
            bar = aabb(records, 6)
            camera_body = aabb(records, 0)
            lens = aabb(records, 1)
            if not board or not bar:
                failures.append(f"{name} missing board/bar aabb")
            else:
                board_size = board[1] - board[0]
                bar_size = bar[1] - bar[0]
                board_width = max(board_size[0], board_size[1])
                board_height = board_size[2]
                bar_height = bar_size[2]
                gap_z = bar[0][2] - board[1][2]
                row["boardSize"] = [float(v) for v in board_size]
                row["barSize"] = [float(v) for v in bar_size]
                row["boardWiderThanTall"] = bool(board_width > board_height)
                row["barNarrowerThanBoard"] = bool(bar_height < 0.55 * board_height or bar_size.min() < 0.45 * board_size.min())
                row["barRaised"] = bool(bar[1][2] > board[1][2] + 0.02)
                row["notEqualPages"] = bool(abs(board_size.prod() - bar_size.prod()) / max(board_size.prod(), 1e-9) > 0.35)
                if not row["boardWiderThanTall"]:
                    failures.append(f"{name} board not landscape")
                if not row["barNarrowerThanBoard"]:
                    failures.append(f"{name} bar not narrower than board")
                if not row["barRaised"]:
                    failures.append(f"{name} bar not raised")
                if not row["notEqualPages"]:
                    failures.append(f"{name} board and bar look equal")
            presence = manifest["lodPrefixPresence"]
            for prefix in PREFIXES:
                for part in COMBO_REQUIRED:
                    if presence[str(prefix)].get(part, 0) <= 0:
                        failures.append(f"{name} missing {part} at {prefix}")
        if name.startswith("camera"):
            presence = manifest["lodPrefixPresence"]
            for prefix in PREFIXES:
                for part in CAMERA_REQUIRED:
                    if presence[str(prefix)].get(part, 0) <= 0:
                        failures.append(f"{name} missing {part} at {prefix}")
                if all(presence[str(prefix)].get(part, 0) <= 0 for part in CAMERA_ASYM):
                    failures.append(f"{name} missing asymmetric top/rear at {prefix}")
        anatomy["variants"][name] = row

    combo20 = json.loads((STAGE_DIR / "variants" / "combo-20" / "manifest.json").read_text(encoding="utf-8"))
    combo30 = json.loads((STAGE_DIR / "variants" / "combo-30" / "manifest.json").read_text(encoding="utf-8"))
    combo40 = json.loads((STAGE_DIR / "variants" / "combo-40" / "manifest.json").read_text(encoding="utf-8"))
    if not (combo20["signedYawDegrees"] == -20 and combo30["signedYawDegrees"] == -30 and combo40["signedYawDegrees"] == -40):
        failures.append("signed yaw not -20/-30/-40")
    if combo20["contentHash"] == combo30["contentHash"] or combo30["contentHash"] == combo40["contentHash"]:
        failures.append("combo hashes collided")

    anatomy["pass"] = not failures
    anatomy["failures"] = failures
    (STAGE_DIR / "reports" / "anatomy-validation.json").write_text(json.dumps(anatomy, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"pass": not failures, "failures": failures, "combo30": combo30["contentHash"]}))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
