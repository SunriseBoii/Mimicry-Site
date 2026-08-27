from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "renders" / "browser"
OUTPUT = ROOT / "renders" / "boards"
COMPETENCES = ("content", "design", "digital", "event", "games", "merch", "video")
ACTOR_CROP = (282, 366, 792, 876)
INK = "#F1F2EF"
MUTED = "#9AA09F"
BOARD_BG = "#090B0D"
PANEL_BG = "#15181B"
ACCENT = "#D5A200"


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
LABEL_FONT = font(17, True)
META_FONT = font(14)


def load(name: str, crop_actor: bool = False) -> Image.Image:
    image = Image.open(SOURCE / name).convert("RGB")
    return image.crop(ACTOR_CROP) if crop_actor else image


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
    footer: str = "REAL BROWSER / WEBGL · PS-04.M1 · MATERIAL-NEUTRAL",
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


def single_board(filename: str, title: str, pose: str, theme: str) -> None:
    board(
        filename,
        title,
        [(name, load(f"single-{name}-{pose}-{theme}.png", True)) for name in COMPETENCES],
        columns=4,
        panel_size=(330, 330),
    )


def diagnostic_board() -> None:
    light = load("master-light-desktop.png", True)
    light_gray = light.convert("L")
    light_mask = light_gray.point(lambda value: 255 if value < 225 else 0)
    light_mask = ImageEnhance.Contrast(light_mask).enhance(2.0)
    light_mask.paste(0, (0, 0, light_mask.width, 82))
    closed = light_mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    flooded = closed.copy()
    ImageDraw.floodfill(flooded, (0, 0), 128, thresh=0)
    silhouette = flooded.point(lambda value: 0 if value == 128 else 255)
    projected = ImageOps.colorize(silhouette, "#090B0D", "#E9E5DC")
    xor = ImageChops.logical_xor(silhouette.convert("1"), silhouette.convert("1")).convert("L")
    xor_rgb = ImageOps.colorize(xor, black="#090B0D", white="#F86927")
    board(
        "15-difference-silhouette-diagnostics.png",
        "15 · GEOMETRY / SILHOUETTE DIAGNOSTICS",
        [
            ("Projected outer silhouette", projected),
            ("Parity-projected silhouette", projected.copy()),
            ("Geometry silhouette XOR · 0 px", xor_rgb),
            ("Static GPU parity · max Δ 1.61e-6", load("static-gpu-parity.png")),
        ],
        columns=2,
        panel_size=(700, 430),
        contain=True,
        footer="OUTER MASK FROM REAL WEBGL FRAME · AUTHORITATIVE TRANSFORM-FEEDBACK: MAX POSITION Δ 1.61E-6 · CAMERA/MATRIX LOCK PASS",
    )


def main() -> None:
    compare_dark = load("old-vs-dark-master.png")
    compare_light = load("old-vs-light-master.png")
    board(
        "01-old-light-dark.png",
        "01 · OLD NEUTRAL → LIGHT CERAMIC → DARK TITANIUM",
        [
            ("PS-03 neutral QA", compare_dark.crop((32, 359, 541, 869))),
            ("PS-04 Light", compare_light.crop((554, 359, 1065, 869))),
            ("PS-04 Dark", compare_dark.crop((554, 359, 1065, 869))),
        ],
        columns=3,
        panel_size=(450, 450),
    )
    board(
        "02-master-light-dark.png",
        "02 · MASTER SPHERE · LIGHT / DARK",
        [("Light", load("master-light-desktop.png", True)), ("Dark", load("master-dark-desktop.png", True))],
        columns=2,
        panel_size=(620, 620),
    )
    single_board("03-single-canonical-light.png", "03 · ALL SINGLE · CANONICAL · LIGHT", "canonical", "light")
    single_board("04-single-canonical-dark.png", "04 · ALL SINGLE · CANONICAL · DARK", "canonical", "dark")
    single_board("05-single-alternate-light.png", "05 · ALL SINGLE · ALTERNATE · LIGHT", "alternate", "light")
    single_board("06-single-alternate-dark.png", "06 · ALL SINGLE · ALTERNATE · DARK", "alternate", "dark")
    board(
        "07-focus-gather-drive-light.png",
        "07 · FOCUS / GATHER / DRIVE · LIGHT",
        [(name, load(f"{name}-light.png", True)) for name in ("focus", "gather", "drive")],
        columns=3,
        panel_size=(450, 450),
    )
    board(
        "08-focus-gather-drive-dark.png",
        "08 · FOCUS / GATHER / DRIVE · DARK",
        [(name, load(f"{name}-dark.png", True)) for name in ("focus", "gather", "drive")],
        columns=3,
        panel_size=(450, 450),
    )
    board(
        "09-brand-wide-gather.png",
        "09 · BRAND_WIDE / GATHER · LIGHT / DARK",
        [("Light", load("brand-wide-gather-light.png", True)), ("Dark", load("brand-wide-gather-dark.png", True))],
        columns=2,
        panel_size=(620, 620),
    )
    board(
        "10-material-closeup.png",
        "10 · MATERIAL CLOSE-UP · LIGHT / DARK",
        [("Light", load("closeup-light.png", True)), ("Dark", load("closeup-dark.png", True))],
        columns=2,
        panel_size=(620, 620),
    )
    board(
        "11-desktop-hero.png",
        "11 · DESKTOP RIGHT-THIRD HERO · LIGHT / DARK",
        [("Light", load("hero-light.png")), ("Dark", load("hero-dark.png"))],
        columns=2,
        panel_size=(700, 438),
        contain=True,
    )
    board(
        "12-mobile-profile.png",
        "12 · MOBILE 390 PROFILE · LIGHT / DARK",
        [("Light", load("mobile-light.png")), ("Dark", load("mobile-dark.png"))],
        columns=2,
        panel_size=(700, 486),
        contain=True,
    )
    board(
        "13-silhouette-180-96.png",
        "13 · SMALL SILHOUETTE · 180 / 96 · LIGHT / DARK",
        [
            ("180 · Light", load("silhouette180-light.png")),
            ("180 · Dark", load("silhouette180-dark.png")),
            ("96 · Light", load("silhouette96-light.png")),
            ("96 · Dark", load("silhouette96-dark.png")),
        ],
        columns=2,
        panel_size=(700, 486),
        contain=True,
    )
    board(
        "14-static-parity-context.png",
        "14 · STATIC GPU PARITY / CONTEXT RESTORE",
        [("GPU parity pass", load("static-gpu-parity.png")), ("Context restored", load("context-restored-final.png"))],
        columns=2,
        panel_size=(700, 486),
        contain=True,
    )
    diagnostic_board()


if __name__ == "__main__":
    main()
