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
SINGLES = ("content", "design", "event", "games", "video", "digital", "merch")
PHASES = ("0", "025", "05", "075")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
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


def board(
    filename: str,
    title: str,
    panels: Iterable[tuple[str, Image.Image]],
    columns: int,
    panel_size: tuple[int, int] = (360, 360),
    footer: str = "REAL BROWSER / WEBGL · PS-04.M2 · PHOTONIC COLOR FIELD",
    contain: bool = False,
) -> None:
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
        panel = fit(image, panel_size, contain=contain)
        output.paste(panel, (x, y))
        draw.rectangle((x, y, x + panel_size[0] - 1, y + panel_size[1] - 1), outline="#343A3D")
        draw.text((x, y + panel_size[1] + 10), label.upper(), fill=INK, font=LABEL_FONT)
    draw.text((left, height - 31), footer, fill=MUTED, font=META_FONT)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    output.save(OUTPUT / filename, optimize=True)


def main() -> None:
    board(
        "01-m1-neutral-to-m2-color.png",
        "01 · M1 NEUTRAL → M2 COLOR · SAME STATE / POSE / PHASE",
        [
            ("M1 renderer Light", load("m1-renderer-light")),
            ("M2 color-off Light", load("m1-bypass-light")),
            ("M2 color Light", load("master-light-color")),
            ("M1 renderer Dark", load("m1-renderer-dark")),
            ("M2 color-off Dark", load("m1-bypass-dark")),
            ("M2 color Dark", load("master-dark-color")),
        ],
        columns=3,
        panel_size=(420, 420),
    )
    board(
        "02-master-phases.png",
        "02 · MASTER · LIGHT / DARK · FOUR FIXED PHASES",
        [(f"{theme} · {phase}", load(f"master-{theme}-phase-{phase}")) for theme in ("light", "dark") for phase in PHASES],
        columns=4,
        panel_size=(320, 320),
    )
    board(
        "03-single-canonical-light.png",
        "03 · ALL SINGLE · CANONICAL · LIGHT",
        [(name, load(f"single-{name}-canonical-light")) for name in SINGLES],
        columns=4,
        panel_size=(330, 330),
    )
    board(
        "04-single-canonical-dark.png",
        "04 · ALL SINGLE · CANONICAL · DARK",
        [(name, load(f"single-{name}-canonical-dark")) for name in SINGLES],
        columns=4,
        panel_size=(330, 330),
    )
    board(
        "05-single-alternate-both.png",
        "05 · ALL SINGLE · ALTERNATE · LIGHT / DARK",
        [(f"{name} · {theme}", load(f"single-{name}-alternate-{theme}")) for name in SINGLES for theme in ("light", "dark")],
        columns=4,
        panel_size=(300, 300),
    )
    board(
        "06-single-slash-phases.png",
        "06 · SINGLE CONTENT SLASH · FOUR PHASES · LIGHT / DARK",
        [(f"{theme} · {phase}", load(f"slash-content-{theme}-phase-{phase}")) for theme in ("light", "dark") for phase in PHASES],
        columns=4,
        panel_size=(320, 320),
    )
    board(
        "07-two-competences.png",
        "07 · FOCUS / GATHER / DRIVE · TWO COLORS",
        [
            ("FOCUS content+design L", load("two-focus-light")),
            ("GATHER content+design L", load("two-gather-light")),
            ("DRIVE content+design L", load("two-drive-light")),
            ("FOCUS event+digital L", load("two-focusContrast-light")),
            ("FOCUS content+design D", load("two-focus-dark")),
            ("GATHER content+design D", load("two-gather-dark")),
            ("DRIVE content+design D", load("two-drive-dark")),
            ("FOCUS event+digital D", load("two-focusContrast-dark")),
        ],
        columns=4,
        panel_size=(320, 320),
        footer="FROZEN IDS: complex-focus-content-design-focus-content · complex-gather-content-design · complex-drive-content-design · complex-focus-digital-event-focus-digital",
    )
    board(
        "08-three-competences.png",
        "08 · FOCUS / GATHER / DRIVE · THREE COLORS",
        [
            ("FOCUS L", load("three-focus-light")),
            ("GATHER L", load("three-gather-light")),
            ("DRIVE L", load("three-drive-light")),
            ("FOCUS D", load("three-focus-dark")),
            ("GATHER D", load("three-gather-dark")),
            ("DRIVE D", load("three-drive-dark")),
        ],
        columns=3,
        panel_size=(420, 420),
        footer="FROZEN IDS: complex-focus-content-design-digital-focus-content · complex-gather-content-design-digital · complex-drive-content-design-digital",
    )
    board(
        "09-four-competences.png",
        "09 · FOCUS / GATHER / DRIVE · FOUR COLORS",
        [
            ("FOCUS L", load("four-focus-light")),
            ("GATHER L", load("four-gather-light")),
            ("DRIVE L", load("four-drive-light")),
            ("FOCUS D", load("four-focus-dark")),
            ("GATHER D", load("four-gather-dark")),
            ("DRIVE D", load("four-drive-dark")),
        ],
        columns=3,
        panel_size=(420, 420),
        footer="FROZEN IDS: complex-focus-content-design-digital-event-focus-content · complex-gather-content-design-digital-event · complex-drive-content-design-digital-event",
    )
    board(
        "10-brand-wide-phases.png",
        "10 · BRAND_WIDE · SEVEN COLORS · FOUR PHASES",
        [(f"{theme} · {phase}", load(f"brand-wide-{theme}-phase-{phase}")) for theme in ("light", "dark") for phase in PHASES],
        columns=4,
        panel_size=(320, 320),
        footer="FROZEN ID: brand-wide-gather-content-design-digital-event-games-merch-video",
    )
    board(
        "11-material-closeup.png",
        "11 · MATERIAL CLOSE-UP · NEUTRAL / ACTIVE",
        [
            ("Neutral Light", load("closeup-neutral-light")),
            ("Active Light", load("closeup-full-light")),
            ("Neutral Dark", load("closeup-neutral-dark")),
            ("Active Dark", load("closeup-full-dark")),
        ],
        columns=2,
        panel_size=(520, 520),
    )
    board(
        "12-hero-desktop-mobile.png",
        "12 · HERO DESKTOP / MOBILE · LIGHT / DARK",
        [
            ("Desktop Light", load("hero-desktop-light")),
            ("Desktop Dark", load("hero-desktop-dark")),
            ("Mobile Light", load("hero-mobile-light")),
            ("Mobile Dark", load("hero-mobile-dark")),
        ],
        columns=2,
        panel_size=(700, 430),
        contain=True,
    )
    board(
        "13-silhouette-180-96.png",
        "13 · PROFILES 180 / 96 · DRIVE / BRAND_WIDE",
        [
            ("180 Drive Light", load("silhouette180-light")),
            ("180 Drive Dark", load("silhouette180-dark")),
            ("96 Drive Light", load("silhouette96-light")),
            ("96 Drive Dark", load("silhouette96-dark")),
            ("96 Gather Light", load("silhouette96-gather-light")),
            ("96 Gather Dark", load("silhouette96-gather-dark")),
        ],
        columns=3,
        panel_size=(360, 360),
        contain=True,
        footer="DARKEST SMALL COMPONENTS: brand-wide-drive and brand-wide-gather at 180/96",
    )
    board(
        "14-field-diagnostics.png",
        "14 · ACTOR-SPACE / COVERAGE / SEMANTIC DIAGNOSTICS",
        [
            ("Coordinate canonical", load("field-camera-canonical")),
            ("Coordinate side", load("field-camera-side")),
            ("Coordinate top", load("field-camera-top")),
            ("Coverage envelope", load("field-coverage")),
            ("Semantic tokens", load("field-semantic")),
            ("Custom mask on SINGLE", load("custom-mismatch")),
        ],
        columns=3,
        panel_size=(400, 400),
    )
    board(
        "15-lifecycle-parity.png",
        "15 · RETARGET / REDUCED / CONTEXT / M1 BYPASS",
        [
            ("Reduced motion", load("reduced-motion")),
            ("Context restored", load("context-restored")),
            ("M2 color-off Light", load("m1-bypass-light")),
            ("M1 renderer Light", load("m1-renderer-light")),
            ("Resize narrow", load("resize-narrow")),
            ("Resize wide", load("resize-wide")),
            ("Legacy M1 route", load("legacy-m1-route")),
            ("Legacy M4.1R route", load("legacy-m41r-route")),
        ],
        columns=4,
        panel_size=(340, 260),
        contain=True,
    )


if __name__ == "__main__":
    main()
