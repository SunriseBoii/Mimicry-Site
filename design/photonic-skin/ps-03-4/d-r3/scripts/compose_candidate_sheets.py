"""Compose per-target D-R3 candidate contact sheets for the Level-A review.

Pure PIL, no Blender.  One sheet per SINGLE target: rows A/B/C, columns
canonical / opposite / side / top / sil180 / sil96.  These sheets are internal
review material and are deliberately labelled; the final lock board is not.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import dr3_geometry as geo  # noqa: E402

CANDIDATE_DIR = SCRIPT_DIR.parent / "renders" / "candidates"
CELL_W, CELL_H, PAD, HEADER = 360, 270, 10, 34
BG = (240, 239, 236)
INK = (32, 32, 36)
VIEWS = ("canonical", "opposite", "side", "top", "sil180", "sil96")


def slug(name: str) -> str:
    return (
        name.lower()
        .replace("single_", "")
        .replace("complex_", "complex-")
        .replace("_", "-")
    )


def paste_cell(canvas, image_path: Path, x: int, y: int):
    if not image_path.exists():
        return
    img = Image.open(image_path)
    if img.mode == "RGBA":
        backdrop = Image.new("RGB", img.size, (255, 255, 255))
        backdrop.paste(img, mask=img.split()[3])
        img = backdrop
    else:
        img = img.convert("RGB")
    img.thumbnail((CELL_W, CELL_H), Image.LANCZOS)
    ox = x + (CELL_W - img.width) // 2
    oy = y + (CELL_H - img.height) // 2
    canvas.paste(img, (ox, oy))


def main():
    names = sys.argv[1:] or list(geo.SINGLE_NAMES)
    for name in names:
        s = slug(name)
        variants = sorted(geo.variants(name))
        width = PAD + len(VIEWS) * (CELL_W + PAD)
        height = HEADER + PAD + len(variants) * (CELL_H + HEADER + PAD)
        canvas = Image.new("RGB", (width, height), BG)
        draw = ImageDraw.Draw(canvas)
        draw.text((PAD, 8), f"D-R3 candidates - {name}", fill=INK)
        y = HEADER + PAD
        for variant in variants:
            draw.text((PAD, y - 22), f"variant {variant}", fill=INK)
            for column, view in enumerate(VIEWS):
                x = PAD + column * (CELL_W + PAD)
                paste_cell(canvas, CANDIDATE_DIR / f"{s}_{variant}_{view}.png", x, y)
            y += CELL_H + HEADER + PAD
        out = CANDIDATE_DIR / f"_sheet_{s}.png"
        canvas.save(out)
        print("PS034_DR3_SHEET", out)


if __name__ == "__main__":
    main()
