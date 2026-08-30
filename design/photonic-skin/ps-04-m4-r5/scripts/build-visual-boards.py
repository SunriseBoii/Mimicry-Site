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
    draw.text((left, height - 28), "REAL BROWSER / WEBGL · PS-04.M4.R5 · GEOMETRY ENDPOINT AUTHORITY", fill=MUTED, font=META_FONT)
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
    board("11-settled-singles-light.png", "Settled SINGLE Light", [
        "content-settled", "design-settled", "event-settled", "games-settled", "video-settled", "digital-settled", "merch-settled",
    ], columns=4, panel_size=(360, 202))
    board("12-settled-singles-dark.png", "Settled SINGLE Dark", [
        "content-dark-settled", "design-dark-settled", "event-dark-settled", "games-dark-settled",
        "video-dark-settled", "digital-dark-settled", "merch-dark-settled",
    ], columns=4, panel_size=(360, 202))
    board("13-video-digital-sheet.png", "Video → Digital contact sheet", sheet("video-digital") or sheet("mask-video-digital"))
    board("14-digital-merch-sheet.png", "Digital → Merch contact sheet", sheet("digital-merch") or sheet("mask-digital-merch"))
    board("15-ab-continuity-lift.png", "A/B radius lift off vs on", [
        "content-design-lift-off-t04", "content-design-lift-on-t04",
        "design-event-lift-off-t04", "design-event-lift-on-t04",
        "games-video-lift-off-t04", "games-video-lift-on-t04",
    ], columns=3, panel_size=(420, 236))
    board("16-master-similarity-masks.png", "Actor-mask MASTER-similarity frames", sheet("mask-content-design") or sheet("content-design"))
    board("17-r4-geometry-rollback.png", "R4 geometry rollback reproduction", [
        "r4-repro-digital-settled", "r4-repro-video-instant", "r4-repro-video-assembled",
        "r4-repro-video-rollback", "r4-repro-games-instant-video", "r4-repro-games-morph",
    ], columns=3, panel_size=(420, 236))
    board("18-five-second-hold.png", "Digital endpoint after settle and 5s hold", [
        "digital-settled", "digital-settled-5s", "video-settled", "games-settled",
    ], columns=2, panel_size=(520, 292))
    board("19-r5-content-design.png", "R5 Content → Design", sheet("content-design") or sheet("mask-content-design"))
    board("20-footer-production.png", "Footer and production freeze", [
        "footer-no-mimic", "footer-return", "production-homepage-untouched", "preview-hero",
    ], columns=2, panel_size=(520, 292))
    board("21-r5-digital-video.png", "R5 Digital → Video", sheet("video-digital") or sheet("mask-video-digital"))
    board("22-r5-video-games.png", "R5 Video → Games", sheet("games-video"))
    board("23-r5-games-event.png", "R5 Games → Event", sheet("event-games"))
    board("24-endpoint-seam.png", "Endpoint seam old@1 / new@0", [
        "content-design-t00", "content-design-t01", "design-event-t00", "design-event-t01",
        "event-games-t00", "event-games-t01", "games-video-t00", "games-video-t01",
    ], columns=4, panel_size=(320, 180))
    board("25-dpr-mobile.png", "DPR and emulated mobile", [
        "dpr-1-hero", "dpr-1.5-hero", "dpr-2-hero", "viewport-390x844-hero",
    ], columns=2, panel_size=(520, 292))
    board("26-five-second-all-singles.png", "Settled SINGLEs after 5s Digital hold", [
        "content-settled", "design-settled", "event-settled", "games-settled",
        "video-settled", "digital-settled", "digital-settled-5s", "merch-settled",
    ], columns=4, panel_size=(360, 202))


if __name__ == "__main__":
    main()
