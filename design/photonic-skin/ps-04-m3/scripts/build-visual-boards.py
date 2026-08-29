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
YAWS = ("0", "90", "179", "180", "270", "359")
PHASES = ("pre", "release", "regroup", "reveal", "approach", "settle")


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
    footer: str = "REAL BROWSER / WEBGL · PS-04.M3 · SURFACE MOTION",
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
    print(filename)


def main() -> None:
    board(
        "01-baseline-m2-vs-m3-off.png",
        "01 · BASELINE · M2 ROUTE ↔ M3 OVERLAY-OFF / IDENTITY",
        [
            ("M2 route Light", load("m2-route-master-light")),
            ("M3 M2-ref Light", load("bypass-m2ref-master-light")),
            ("M3 identity overlay Light", load("bypass-identity-master-light")),
            ("M3 M2-ref Dark", load("bypass-m2ref-master-dark")),
        ],
        columns=2,
        panel_size=(420, 420),
        contain=True,
    )
    board(
        "02-master-breath.png",
        "02 · MASTER BREATH · MIN / BASE / MAX · LIGHT / DARK",
        [(f"{theme} · {name}", load(f"master-{theme}-breath-{name}")) for theme in ("light", "dark") for name in ("min", "base", "max")],
        columns=3,
        panel_size=(320, 320),
    )
    board(
        "03-master-yaw.png",
        "03 · MASTER YAW CHECKPOINTS · LIGHT / DARK",
        [(f"{theme} · {yaw}°", load(f"master-{theme}-yaw-{yaw}")) for theme in ("light", "dark") for yaw in YAWS],
        columns=6,
        panel_size=(240, 240),
    )
    board(
        "04-single-canonical-light.png",
        "04 · ALL SINGLE · CANONICAL · LIGHT · ROCK ENVELOPE",
        [(name, load(f"single-{name}-canonical-light")) for name in SINGLES],
        columns=4,
        panel_size=(330, 330),
    )
    board(
        "05-single-canonical-dark.png",
        "05 · ALL SINGLE · CANONICAL · DARK · ROCK ENVELOPE",
        [(name, load(f"single-{name}-canonical-dark")) for name in SINGLES],
        columns=4,
        panel_size=(330, 330),
    )
    board(
        "06-single-alternate-both.png",
        "06 · ALL SINGLE · ALTERNATE · LIGHT / DARK",
        [(f"{name} · {theme}", load(f"single-{name}-alternate-{theme}")) for name in SINGLES for theme in ("light", "dark")],
        columns=4,
        panel_size=(300, 300),
    )
    board(
        "07-compound-hierarchy.png",
        "07 · FOCUS / GATHER / DRIVE / BRAND_WIDE · SHARED PIVOT",
        [
            ("FOCUS L", load("compound-focus-light")),
            ("GATHER L", load("compound-gather-light")),
            ("DRIVE L", load("compound-drive-light")),
            ("BRAND L", load("compound-brand-light")),
            ("FOCUS D", load("compound-focus-dark")),
            ("GATHER D", load("compound-gather-dark")),
            ("DRIVE D", load("compound-drive-dark")),
            ("BRAND D", load("compound-brand-dark")),
        ],
        columns=4,
        panel_size=(320, 320),
    )
    board(
        "08-m4-phase-boundaries.png",
        "08 · REAL M4 PHASE BOUNDARIES · MASTER→EVENT LIGHT",
        [(label, load(f"phase-{label}-light")) for label in PHASES],
        columns=3,
        panel_size=(360, 360),
        footer="WINDOWS: anticipation 0–0.11 · release 0.07–0.38 · regroup 0.24–0.68 · reveal 0.40–0.82 · approach 0.62–0.94 · settle 0.86–1",
    )
    board(
        "09-handoff-179.png",
        "09 · HANDOFF · MASTER YAW 179° BEFORE CLICK",
        [("Before request", load("handoff-179-before"))],
        columns=1,
        panel_size=(640, 640),
        footer="CONTINUOUS 30 FPS CLIP: renders/browser/sequences/handoff-179 + video/handoff-179-realtime.webm",
    )
    board(
        "10-small-hero.png",
        "10 · 180 / 96 / MOBILE / HERO EXTREMES",
        [
            ("180 Light", load("silhouette180-light")),
            ("180 Dark", load("silhouette180-dark")),
            ("96 Light", load("silhouette96-light")),
            ("96 Dark", load("silhouette96-dark")),
            ("390 Light", load("mobile390-light")),
            ("390 Dark", load("mobile390-dark")),
            ("Hero desktop Light", load("hero-desktop-light")),
            ("Hero desktop Dark", load("hero-desktop-dark")),
            ("Hero mobile Light", load("hero-mobile-light")),
            ("Hero mobile Dark", load("hero-mobile-dark")),
            ("Hero first Dark", load("hero-first-frame-dark")),
        ],
        columns=4,
        panel_size=(300, 300),
        contain=True,
    )
    board(
        "11-lifecycle.png",
        "11 · REDUCED / PAUSE / CONTEXT RESTORE DURING RETARGET",
        [
            ("Reduced motion", load("reduced-motion")),
            ("Pause all", load("pause-all")),
            ("Hidden freeze", load("hidden-freeze")),
            ("Context restore Dark retarget", load("context-restore-retarget-dark")),
            ("DPR 1", load("dpr-1")),
            ("DPR 2", load("dpr-2")),
            ("Side by side", load("side-by-side")),
        ],
        columns=3,
        panel_size=(400, 400),
        contain=True,
    )


if __name__ == "__main__":
    main()
