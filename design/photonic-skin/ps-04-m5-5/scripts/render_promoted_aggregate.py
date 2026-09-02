"""Offline 154-state unlabelled inventory and LOD boards for PS-04.M5.5."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
PHOTONIC_DIR = STAGE_DIR.parent
REPO_DIR = PHOTONIC_DIR.parents[1]
PUBLIC = REPO_DIR / "public" / "photonic-skin" / "ps-04-m5-5"
FROZEN = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1r"
REPORTS = STAGE_DIR / "reports"
RENDERS = STAGE_DIR / "renders"

for extra in (PHOTONIC_DIR / "ps-03-m3" / "scripts", PHOTONIC_DIR / "ps-03-m3-1r" / "scripts"):
    if str(extra) not in sys.path:
        sys.path.insert(0, str(extra))

import state_builder as m3  # noqa: E402
from m31r_core import projected_splats, read_json, render_projection  # noqa: E402

LOD_PREFIXES = (512, 1024, 2048, 4096, 8192, 12288, 16384)
KEY_STATES = (
    "single-event",
    "single-video",
    "single-merch",
    "brand-wide-gather-content-design-digital-event-games-merch-video",
    "brand-wide-drive-content-design-digital-event-games-merch-video",
    "master-neutral",
    "complex-focus-event-video-focus-event",
    "complex-focus-design-event-games-video-focus-design",
)


def save_rgb(path: Path, array: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(array, "RGB").save(path)


def prefix_records(records: np.ndarray, prefix: int) -> np.ndarray:
    clone = records.copy()
    order = np.argsort(clone["lodPriority"], kind="stable")
    keep = np.zeros(len(clone), dtype=bool)
    keep[order[:prefix]] = True
    clone["status"][~keep] = m3.STATUS_RESERVE
    return clone


def contact_sheet(paths: list[Path], labels: list[str], cols: int, tile: int) -> Image.Image:
    rows = (len(paths) + cols - 1) // cols
    pad = 18
    canvas = Image.new("RGB", (cols * tile, rows * (tile + pad)), (10, 12, 14))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    for index, (path, label) in enumerate(zip(paths, labels)):
        row, col = divmod(index, cols)
        image = Image.open(path).convert("RGB").resize((tile, tile), Image.Resampling.NEAREST)
        canvas.paste(image, (col * tile, row * (tile + pad) + pad))
        draw.text((col * tile + 4, row * (tile + pad) + 2), label[:28], fill=(220, 220, 220), font=font)
    return canvas


def main() -> int:
    manifest = read_json(PUBLIC / "manifests" / "ps04m55-manifest.json")
    frozen_manifest = read_json(FROZEN / "manifest.json")
    impact = json.loads((REPORTS / "promotion-state-impact.json").read_text(encoding="utf-8"))
    states_dir = RENDERS / "states"
    states_dir.mkdir(parents=True, exist_ok=True)
    (RENDERS / "boards").mkdir(parents=True, exist_ok=True)
    paths = []
    labels = []
    for entry in manifest["states"]:
        records = np.fromfile(PUBLIC / entry["bufferPath"], dtype=m3.STATE_DTYPE)
        projected = projected_splats(frozen_manifest, entry, records, "canonical", "desktop")
        rgb = render_projection(projected, silhouette=False)
        out = states_dir / f"{entry['stateId']}-canonical.png"
        save_rgb(out, rgb)
        paths.append(out)
        labels.append(entry["stateId"].replace("complex-focus-", "cf-")[:28])
    contact_sheet(paths, labels, 11, 96).save(RENDERS / "boards" / "01-154-candidate-inventory.png")

    changed = [row["stateId"] for row in impact["states"] if row["changed"]]
    unchanged = [row["stateId"] for row in impact["states"] if not row["changed"]]
    by_id = {entry["stateId"]: entry for entry in manifest["states"]}

    def sheet_for(ids: list[str], name: str) -> None:
        selected = [states_dir / f"{state_id}-canonical.png" for state_id in ids[:44]]
        selected_labels = [state_id.replace("complex-focus-", "cf-")[:28] for state_id in ids[:44]]
        if selected:
            contact_sheet(selected, selected_labels, 8, 120).save(RENDERS / "boards" / name)

    sheet_for(changed, "02-changed-states.png")
    sheet_for(impact["eventOnly"], "03-event-only.png")
    sheet_for(impact["videoOnly"], "04-video-only.png")
    sheet_for(impact["eventAndVideoIntersection"], "05-intersection.png")
    sheet_for(unchanged, "06-unaffected.png")
    sheet_for(["single-event", "single-video", "single-merch"], "07-singles.png")
    sheet_for([
        "brand-wide-gather-content-design-digital-event-games-merch-video",
        "brand-wide-drive-content-design-digital-event-games-merch-video",
    ], "08-brand-wide.png")

    lod_dir = RENDERS / "boards"
    lod_dir.mkdir(parents=True, exist_ok=True)
    for state_id in ("single-event", "single-video", "complex-focus-event-video-focus-event"):
        entry = by_id[state_id]
        records = np.fromfile(PUBLIC / entry["bufferPath"], dtype=m3.STATE_DTYPE)
        tiles = []
        names = []
        for prefix in LOD_PREFIXES:
            projected = projected_splats(frozen_manifest, entry, prefix_records(records, prefix), "canonical", "desktop")
            rgb = render_projection(projected, silhouette=False)
            path = RENDERS / "states" / f"{state_id}-lod-{prefix}.png"
            save_rgb(path, rgb)
            tiles.append(path)
            names.append(str(prefix))
        contact_sheet(tiles, names, 7, 160).save(lod_dir / f"10-lod-{state_id[:24]}.png")

    print(f"rendered {len(paths)} candidate states")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
