from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "renders" / "browser"
OUTPUT = ROOT / "renders" / "boards"
INK = "#F1F2EF"
MUTED = "#9AA09F"
BOARD_BG = "#090B0D"
PANEL_BG = "#15181B"
SINGLES = ("05.1", "05.2", "05.3", "05.4", "05.5", "05.6", "05.7")


def font(size: int, bold: bool = False):
    candidates = [
        Path("C:/Windows/Fonts") / ("arialbd.ttf" if bold else "arial.ttf"),
        Path("C:/Windows/Fonts") / ("segoeuib.ttf" if bold else "segoeui.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


TITLE_FONT = font(30, True)
LABEL_FONT = font(16, True)
META_FONT = font(13)


def load(name: str) -> Image.Image:
    return Image.open(SOURCE / f"{name}.png").convert("RGB")


def fit(image: Image.Image, size: tuple[int, int], contain: bool = False) -> Image.Image:
    if contain:
        canvas = Image.new("RGB", size, PANEL_BG)
        thumb = image.copy()
        thumb.thumbnail(size, Image.Resampling.LANCZOS)
        canvas.paste(thumb, ((size[0] - thumb.width) // 2, (size[1] - thumb.height) // 2))
        return canvas
    return ImageOps.fit(image, size, Image.Resampling.LANCZOS)


def board(filename: str, title: str, panels: Iterable[tuple[str, Image.Image]], columns: int, panel_size: tuple[int, int] = (420, 236)) -> None:
    items = list(panels)
    rows = (len(items) + columns - 1) // columns
    gap = 18
    left = 32
    top = 92
    label_h = 38
    width = left * 2 + columns * panel_size[0] + (columns - 1) * gap
    height = top + rows * (panel_size[1] + label_h) + max(0, rows - 1) * gap + 58
    output = Image.new("RGB", (width, height), BOARD_BG)
    draw = ImageDraw.Draw(output)
    draw.text((left, 24), title, fill=INK, font=TITLE_FONT)
    draw.line((left, 70, width - left, 70), fill="#313639", width=1)
    for index, (label, image) in enumerate(items):
        row, column = divmod(index, columns)
        x = left + column * (panel_size[0] + gap)
        y = top + row * (panel_size[1] + label_h + gap)
        output.paste(fit(image, panel_size, contain=True), (x, y))
        draw.rectangle((x, y, x + panel_size[0] - 1, y + panel_size[1] - 1), outline="#343A3D")
        draw.text((x, y + panel_size[1] + 10), label.upper(), fill=INK, font=LABEL_FONT)
    draw.text((left, height - 31), "REAL BROWSER / WEBGL · PS-04.M4 · SITE COMPOSITION", fill=MUTED, font=META_FONT)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    output.save(OUTPUT / filename, optimize=True)


def maybe(name: str) -> Image.Image | None:
    path = SOURCE / f"{name}.png"
    return Image.open(path).convert("RGB") if path.exists() else None


def required(name: str) -> Image.Image:
    image = maybe(name)
    if image is None:
        raise FileNotFoundError(name)
    return image


def main() -> None:
    board("01-hero-themes.png", "01 Hero Light / Dark + anchors", [
        ("hero light", required("hero-light")),
        ("hero dark", required("hero-dark")),
        ("anchor build", required("hero-anchor-build")),
        ("anchor competence", required("hero-anchor-competence")),
    ], 2)
    board("02-flow-unlock.png", "02 Task unlock, brief, contact, success", [
        ("task locked", required("task-locked-graph")),
        ("unlock 03.2", required("unlock-competencies")),
        ("unlock 03.3", required("unlock-brief")),
        ("contact", required("brief-contact")),
        ("success", required("brief-success")),
        ("cases", required("cases-carousel")),
    ], 3)
    board("03-competencies-light.png", "03 Competency screens Light, actor left", [
        (item, required(f"competence-{item}-light")) for item in SINGLES
    ], 4)
    board("04-competencies-dark.png", "04 Competency screens Dark, actor left", [
        (item, required(f"competence-{item}-dark")) for item in SINGLES
    ], 4)
    board("05-studio-footer.png", "05 Studio chapter, contact, footer exit/return", [
        ("team", required("studio-team")),
        ("partners", required("studio-partners")),
        ("clients", required("studio-clients")),
        ("contact", required("contact")),
        ("footer no mimic", required("footer-no-mimic")),
        ("return 07", required("footer-return")),
    ], 3)
    board("06-viewports.png", "06 Approval viewports and DPR", [
        ("1920 hero", required("viewport-1920x1080-hero")),
        ("1440 event", required("viewport-1440x900-event")),
        ("1366 footer", required("viewport-1366x768-footer")),
        ("390 event", required("viewport-390x844-event")),
        ("dpr 1.5", required("dpr-1.5-hero")),
        ("dpr 2", required("dpr-2-hero")),
    ], 3)
    board("07-a11y-lifecycle.png", "07 Reduced, forced colors, zoom, restore, preview", [
        ("reduced footer", required("reduced-motion-footer")),
        ("forced colors", required("forced-colors-task")),
        ("zoom 200", required("zoom-200")),
        ("context restore", required("context-restore")),
        ("preview", required("preview-hero")),
        ("production home", required("production-homepage-untouched")),
    ], 3)
    print(f"wrote {len(list(OUTPUT.glob('*.png')))} boards")


if __name__ == "__main__":
    main()
