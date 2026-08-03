"""Compose the cross-target selection review board from candidate renders.

Rows: the seven selected SINGLE variants.  Columns: canonical / opposite /
side / top / sil180 / sil96.  Internal review artifact (labelled).
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import dr3_geometry as geo  # noqa: E402

CANDIDATE_DIR = SCRIPT_DIR.parent / "renders" / "candidates"
CELL_W, CELL_H, PAD, HEADER = 340, 255, 10, 30
BG = (240, 239, 236)
INK = (32, 32, 36)
VIEWS = ("canonical", "opposite", "side", "top", "sil180", "sil96")


def slug(name: str) -> str:
    return name.lower().replace("single_", "").replace("_", "-")


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
    canvas.paste(img, (x + (CELL_W - img.width) // 2, y + (CELL_H - img.height) // 2))


def main():
    names = list(geo.SINGLE_NAMES)
    width = PAD + len(VIEWS) * (CELL_W + PAD)
    height = PAD + len(names) * (CELL_H + HEADER + PAD)
    canvas = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(canvas)
    y = PAD + HEADER
    for name in names:
        variant = geo.SELECTED[name]
        draw.text((PAD, y - 22), f"{name}  [{variant}]", fill=INK)
        for column, view in enumerate(VIEWS):
            x = PAD + column * (CELL_W + PAD)
            paste_cell(canvas, CANDIDATE_DIR / f"{slug(name)}_{variant}_{view}.png", x, y)
        y += CELL_H + HEADER + PAD
    out = CANDIDATE_DIR / "_selection_review.png"
    canvas.save(out)
    print("PS034_DR3_SELECTION_REVIEW", out)


if __name__ == "__main__":
    main()
