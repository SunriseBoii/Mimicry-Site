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
    draw.text((left, height - 31), "REAL BROWSER / WEBGL · PS-04.M4.R2 · MAGNETISM + FULL CANVAS", fill=MUTED, font=META_FONT)
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
    board("01-square-clip-vs-full-canvas.png", "01 R1 square scissor vs R2 full-canvas", [
        ("R1 square hero", required("r1-square-hero")),
        ("R1 square mask", required("r1-square-hero-mask")),
        ("R2 dpr2 hero", required("dpr-2-hero")),
        ("R2 unclipped R-L", required("right-left-unclipped")),
    ], 2)
    board("02-unclipped-vertical.png", "02 Particles cross former slot edge", [
        ("right MASTER", required("right-master-settled")),
        ("mid right-left", required("right-left-unclipped")),
        ("left SINGLE", required("left-single-settled")),
        ("left-left", required("left-left-unclipped")),
    ], 2)
    board("03-right-settled.png", "03 Right-slot MASTER / BRAND_WIDE settled", [
        ("hero light", required("hero-light")),
        ("hero dark", required("hero-dark")),
        ("about light", required("about-light")),
        ("about dark", required("about-dark")),
    ], 2)
    board("04-left-singles.png", "04 Left-slot seven SINGLE settled", [
        (item, required(f"competence-{item}-light")) for item in SINGLES
    ], 4)
    board("05-right-left-transition.png", "05 Right to left without square frame", [
        ("cases MASTER", required("cases-master")),
        ("mid unclipped", required("right-left-unclipped")),
        ("content left", required("competence-05.1-light")),
        ("R1 left ref", required("r1-left-single")),
    ], 2)
    board("06-left-left-singles.png", "06 Left to left SINGLE without slot clipping", [
        ("05.1", required("competence-05.1-light")),
        ("mid 05.1-05.2", required("left-left-unclipped")),
        ("05.2", required("competence-05.2-light")),
        ("05.3", required("competence-05.3-light")),
    ], 2)
    board("07-footer-exit-return.png", "07 Footer exit and reverse restore", [
        ("contact", required("contact")),
        ("footer no mimic", required("footer-no-mimic")),
        ("return 07", required("footer-return")),
        ("reduced footer", required("reduced-motion-footer")),
    ], 2)
    board("08-magnet-near.png", "08 Magnetism: stop near anchor settles", [
        ("near snap", required("magnet-near-snap")),
        ("hero", required("hero-light")),
    ], 2)
    board("09-magnet-far.png", "09 Stop outside radius: no snap", [
        ("far no snap", required("magnet-far-no-snap")),
        ("near snap", required("magnet-near-snap")),
    ], 2)
    board("10-magnet-fast.png", "10 Fast scroll: no backward capture", [
        ("fast down", required("magnet-fast-no-back")),
        ("far", required("magnet-far-no-snap")),
    ], 2)
    board("11-chapter-05.png", "11 Horizontal chapter 05.1-05.7", [
        (item, required(f"competence-{item}-light")) for item in SINGLES
    ], 4)
    board("12-dynamic-unlock.png", "12 Dynamic locked / unlocked nodes", [
        ("locked 03.1", required("dynamic-locked")),
        ("unlocked 03.2", required("dynamic-unlocked")),
        ("build master", required("build-initial-master")),
        ("task focus", required("task-focus")),
    ], 2)
    board("13-dialog-suppress.png", "13 Dialog / input magnetism suppression", [
        ("brief", required("brief")),
        ("contact dialog", required("brief-contact")),
        ("dialog suppress", required("dialog-suppress")),
        ("success", required("brief-success")),
    ], 2)
    board("14-reduced-motion.png", "14 Reduced motion", [
        ("reduced footer", required("reduced-motion-footer")),
        ("hero", required("hero-light")),
    ], 2)
    board("15-desktop-viewports.png", "15 Desktop viewport matrix", [
        ("1920 hero", required("viewport-1920x1080-hero")),
        ("1440 about", required("viewport-1440x900-about")),
        ("1366 event", required("viewport-1366x768-event")),
        ("1920 footer", required("viewport-1920x1080-footer")),
    ], 2)
    board("16-mobile-390.png", "16 Mobile 390", [
        ("390 hero", required("viewport-390x844-hero")),
        ("390 about", required("viewport-390x844-about")),
        ("390 event", required("viewport-390x844-event")),
        ("390 footer", required("viewport-390x844-footer")),
    ], 2)
    board("17-dpr-matrix.png", "17 DPR matrix, CSS slot invariant", [
        ("dpr1", required("dpr-1-hero")),
        ("dpr1.25", required("dpr-1.25-hero")),
        ("dpr1.5", required("dpr-1.5-hero")),
        ("dpr2", required("dpr-2-hero")),
        ("mask1", required("dpr-1-hero-mask")),
        ("mask2", required("dpr-2-hero-mask")),
    ], 3)
    board("18-context-restore.png", "18 Context restore", [
        ("context", required("context-restore")),
        ("wide restore", required("wide-restore-1920-hero")),
    ], 2)
    board("19-diagnostic-overlay.png", "19 Envelope / bbox / Canvas overlay", [
        ("diag overlay", required("diagnostic-envelope")),
        ("diag hero", required("diag-01")),
        ("diag content", required("diag-05-1")),
        ("diag footer", required("diag-08")),
    ], 2)
    board("20-production-untouched.png", "20 Production homepage unchanged", [
        ("production /", required("production-homepage-untouched")),
        ("preview", required("preview-hero")),
        ("narrow 390", required("narrow-390-hero")),
        ("wide 1920", required("wide-1920-hero")),
    ], 2)
    print(f"wrote {len(list(OUTPUT.glob('*.png')))} boards")


if __name__ == "__main__":
    main()
