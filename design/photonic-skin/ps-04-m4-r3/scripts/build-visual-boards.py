from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "renders" / "browser"
SHEETS = SOURCE / "contact-sheets"
OUTPUT = ROOT / "renders" / "boards"
INK = "#F1F2EF"
MUTED = "#9AA09F"
BOARD_BG = "#090B0D"
PANEL_BG = "#15181B"


def font(size: int, bold: bool = False):
    candidates = [
        Path("C:/Windows/Fonts") / ("arialbd.ttf" if bold else "arial.ttf"),
        Path("C:/Windows/Fonts") / ("segoeuib.ttf" if bold else "segoeui.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


TITLE_FONT = font(28, True)
LABEL_FONT = font(14, True)
META_FONT = font(12)


def load_named(name: str) -> Image.Image | None:
    path = SOURCE / f"{name}.png"
    if not path.exists():
        path = SHEETS / f"{name}.png"
    return Image.open(path).convert("RGB") if path.exists() else None


def fit(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    canvas = Image.new("RGB", size, PANEL_BG)
    thumb = image.copy()
    thumb.thumbnail(size, Image.Resampling.LANCZOS)
    canvas.paste(thumb, ((size[0] - thumb.width) // 2, (size[1] - thumb.height) // 2))
    return canvas


def board(filename: str, title: str, names: list[str], columns: int = 5, panel_size: tuple[int, int] = (280, 158)) -> None:
    items = [(name, load_named(name)) for name in names]
    items = [(name, image) for name, image in items if image is not None]
    if not items:
        return
    rows = (len(items) + columns - 1) // columns
    gap, left, top, label_h = 14, 28, 86, 32
    width = left * 2 + columns * panel_size[0] + (columns - 1) * gap
    height = top + rows * (panel_size[1] + label_h) + max(0, rows - 1) * gap + 52
    output = Image.new("RGB", (width, height), BOARD_BG)
    draw = ImageDraw.Draw(output)
    draw.text((left, 22), title, fill=INK, font=TITLE_FONT)
    draw.line((left, 64, width - left, 64), fill="#313639", width=1)
    for index, (name, image) in enumerate(items):
        row, column = divmod(index, columns)
        x = left + column * (panel_size[0] + gap)
        y = top + row * (panel_size[1] + label_h + gap)
        output.paste(fit(image, panel_size), (x, y))
        draw.rectangle((x, y, x + panel_size[0] - 1, y + panel_size[1] - 1), outline="#343A3D")
        draw.text((x, y + panel_size[1] + 8), name.upper(), fill=INK, font=LABEL_FONT)
    draw.text((left, height - 28), "REAL BROWSER / WEBGL · PS-04.M4.R3 · TRANSITION CONTINUITY", fill=MUTED, font=META_FONT)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    output.save(OUTPUT / filename, optimize=True)
    print(f"wrote {filename} ({len(items)} panels)")


def sheet(prefix: str) -> list[str]:
    return [path.stem for path in sorted(SHEETS.glob(f"{prefix}-t*.png"))]


def main() -> None:
    board("01-user-sequence-settled.png", "User sequence settled endpoints", [
        "cases-master", "content-settled", "design-settled", "event-settled", "games-settled", "video-settled",
    ], columns=3, panel_size=(420, 236))
    board("02-master-content-sheet.png", "MASTER → Content contact sheet", sheet("master-content") or sheet("mask-master-content"))
    board("03-content-design-sheet.png", "Content → Design contact sheet", sheet("content-design") or sheet("mask-content-design"))
    board("04-design-event-sheet.png", "Design → Event contact sheet", sheet("design-event") or sheet("mask-design-event"))
    board("05-event-games-sheet.png", "Event → Games contact sheet", sheet("event-games"))
    board("06-games-video-sheet.png", "Games → Video contact sheet", sheet("games-video"))
    board("07-merch-master-sheet.png", "Merch → MASTER contact sheet", sheet("merch-master"))
    board("08-tasks-palette.png", "Tasks and palette-only", [
        "task-focus", "task-gather", "task-drive", "task-brand-wide", "palette-only-content", "palette-only-three",
    ], columns=3, panel_size=(420, 236))
    board("09-slot-theme-lifecycle.png", "Slot, theme, reduced, footer, restore", [
        "left-single", "right-master", "hero-light", "hero-dark", "reduced-design", "footer-no-mimic", "footer-return", "context-restore",
    ], columns=4, panel_size=(320, 180))
    board("10-production-preview.png", "Preview and production homepage", [
        "preview-hero", "production-homepage-untouched", "about-brand-wide", "master-after-merch",
    ], columns=2, panel_size=(520, 292))


if __name__ == "__main__":
    main()
