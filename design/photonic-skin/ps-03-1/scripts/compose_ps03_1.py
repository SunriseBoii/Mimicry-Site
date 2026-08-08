"""Compose PS-03.1 evaluation boards and offline desktop/mobile mockups."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps


SCRIPT_PATH = Path(__file__).resolve()
PS03_DIR = SCRIPT_PATH.parent.parent
REPO_DIR = PS03_DIR.parents[2]
RENDER_DIR = PS03_DIR / "renders"
PANEL_DIR = RENDER_DIR / "_panels"
EXPORT_DIR = PS03_DIR / "exports"

FONT_REGULAR = Path("C:/Windows/Fonts/arial.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/arialbd.ttf")
BG = "#F4F5F2"
INK = "#17181A"
MUTED = "#696D72"
RULE = "#A3A6A3"
ACCENT = "#4C7AFF"


def font(size: int, bold: bool = False):
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REGULAR), size=size)


def text(draw, xy, value, size=24, fill=INK, bold=False, anchor=None):
    draw.text(xy, value, font=font(size, bold), fill=fill, anchor=anchor)


def header(canvas: Image.Image, title: str, subtitle: str):
    draw = ImageDraw.Draw(canvas)
    text(draw, (70, 50), "PS-03.1 / C-R1", 23, MUTED, True)
    text(draw, (70, 88), title, 50, INK, True)
    text(draw, (70, 154), subtitle, 21, MUTED)
    draw.line((70, 205, canvas.width - 70, 205), fill=RULE, width=2)


def fit_panel(path: Path, size: tuple[int, int], background=BG):
    image = Image.open(path).convert("RGB")
    return ImageOps.fit(image, size, Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def grid_board(
    filename: str,
    title: str,
    subtitle: str,
    cells,
    columns: int,
    panel_size=(760, 560),
):
    margin, gap, label_height = 70, 24, 62
    rows = (len(cells) + columns - 1) // columns
    width = margin * 2 + columns * panel_size[0] + (columns - 1) * gap
    height = 235 + rows * (panel_size[1] + label_height) + (rows - 1) * gap + 45
    canvas = Image.new("RGB", (width, height), BG)
    header(canvas, title, subtitle)
    draw = ImageDraw.Draw(canvas)
    for index, cell in enumerate(cells):
        path, label, detail, recommended = cell
        row, column = divmod(index, columns)
        x = margin + column * (panel_size[0] + gap)
        y = 235 + row * (panel_size[1] + label_height + gap)
        panel = fit_panel(path, panel_size)
        canvas.paste(panel, (x, y))
        border = ACCENT if recommended else RULE
        draw.rectangle((x, y, x + panel_size[0], y + panel_size[1]), outline=border, width=5 if recommended else 1)
        text(draw, (x, y + panel_size[1] + 12), label, 24, INK, True)
        text(draw, (x + panel_size[0], y + panel_size[1] + 15), detail, 18, ACCENT if recommended else MUTED, False, "ra")
    canvas.save(RENDER_DIR / filename, quality=96)


def compose_variant_board():
    cells = [
        (PANEL_DIR / "comparison_A.png", "A / DIRECTED FOLD", "DIRECTION CONTROL", False),
        (PANEL_DIR / "comparison_C.png", "C / TENSIONED CORE", "SOURCE MASS", False),
        (PANEL_DIR / "comparison_R1A.png", "C-R1A", "15% PERCEIVED DIRECTION", False),
        (PANEL_DIR / "comparison_R1B.png", "C-R1B", "20% / BALANCED", True),
        (PANEL_DIR / "comparison_R1C.png", "C-R1C", "25% / UPPER LIMIT", False),
        (PANEL_DIR / "comparison_FINAL.png", "C-R1 / RECOMMENDED", "C-R1B GEOMETRY", True),
    ]
    grid_board(
        "ps03-1_variant_comparison_board.png",
        "A / C / C-R1A / C-R1B / C-R1C",
        "IDENTICAL 55 MM CAMERA / BBOX / LIGHT / MATERIAL / SCALE / SUBDIVISION 0",
        cells,
        3,
    )


def compose_view_board():
    labels = [
        ("canonical", "CANONICAL 3/4", "APPROVED MASTER ORIENTATION"),
        ("opposite", "OPPOSITE 3/4", "REVERSE-SIDE CONTROL"),
        ("front", "FRONT", "POLAR CONVERGENCE CONTROL"),
        ("side", "SIDE", "TAPER / AUTOMOTIVE CONTROL"),
        ("top", "TOP", "MASS DISTRIBUTION"),
        ("risk", "WEAK / RISK ANGLE", "ANIMAL / ALIEN-TECH CONTROL"),
    ]
    cells = [
        (PANEL_DIR / f"final_{key}.png", label, detail, key == "canonical")
        for key, label, detail in labels
    ]
    grid_board(
        "ps03-1_c-r1_view_board.png",
        "C-R1 / CONTROLLED VIEW SET",
        "NEUTRAL IVORY CERAMIC / NO EMISSION / NO BLOOM / NO FINAL SHADER",
        cells,
        3,
        (760, 590),
    )


def silhouette_with_insets(path: Path, size=(960, 700)):
    panel = fit_panel(path, size, "#FFFFFF")
    draw = ImageDraw.Draw(panel)
    source = Image.open(path).convert("RGB")
    small = ImageOps.contain(source, (180, 132), Image.Resampling.LANCZOS)
    tiny = ImageOps.contain(source, (96, 70), Image.Resampling.LANCZOS)
    draw.rectangle((25, 25, 245, 205), fill="#FFFFFF", outline="#B5B7B4", width=2)
    panel.paste(small, (45, 50))
    text(draw, (135, 180), "~180 px", 17, MUTED, False, "mm")
    draw.rectangle((270, 25, 406, 155), fill="#FFFFFF", outline="#B5B7B4", width=2)
    panel.paste(tiny, (290, 45))
    text(draw, (338, 132), "96 px", 17, MUTED, False, "mm")
    return panel


def compose_diagnostics_board():
    margin, gap = 70, 28
    panel_size = (960, 700)
    width = margin * 2 + panel_size[0] * 2 + gap
    height = 235 + panel_size[1] * 2 + 72 * 2 + gap + 45
    canvas = Image.new("RGB", (width, height), BG)
    header(
        canvas,
        "C-R1 / SILHOUETTE, WIREFRAME, MASK, RISK",
        "ONE CLOSED SURFACE / SHARED CONNECTIVITY / FIXED 2 526-FACE PHOTONIC REGION",
    )
    draw = ImageDraw.Draw(canvas)
    cells = [
        (silhouette_with_insets(PANEL_DIR / "final_silhouette.png", panel_size), "SILHOUETTE", "LARGE / 180 PX / 96 PX"),
        (fit_panel(PANEL_DIR / "final_wire.png", panel_size), "WIREFRAME", "8 322 VERTICES / 16 640 TRIANGLES"),
        (fit_panel(PANEL_DIR / "final_mask.png", panel_size), "PHOTONIC MASK", "SAME FACE INDICES / 35.03% AREA"),
        (fit_panel(PANEL_DIR / "final_risk.png", panel_size), "WEAK / RISK ANGLE", "INTENTIONAL REJECTED ORIENTATION"),
    ]
    for index, (panel, label, detail) in enumerate(cells):
        row, column = divmod(index, 2)
        x = margin + column * (panel_size[0] + gap)
        y = 235 + row * (panel_size[1] + 72 + gap)
        canvas.paste(panel, (x, y))
        draw.rectangle((x, y, x + panel_size[0], y + panel_size[1]), outline=RULE, width=1)
        text(draw, (x, y + panel_size[1] + 12), label, 24, INK, True)
        text(draw, (x + panel_size[0], y + panel_size[1] + 15), detail, 17, MUTED, False, "ra")
    canvas.save(RENDER_DIR / "ps03-1_c-r1_diagnostics_board.png", quality=96)


def arrow(draw, start, end, color=ACCENT, width=5):
    draw.line((start, end), fill=color, width=width)
    x1, y1 = start
    x2, y2 = end
    angle = __import__("math").atan2(y2 - y1, x2 - x1)
    for offset in (2.55, -2.55):
        x = x2 + 18 * __import__("math").cos(angle + offset)
        y = y2 + 18 * __import__("math").sin(angle + offset)
        draw.line((x2, y2, x, y), fill=color, width=width)


def compose_c_to_final_board():
    c = fit_panel(PANEL_DIR / "c_to_final_C.png", (960, 700))
    final = fit_panel(PANEL_DIR / "c_to_final_FINAL.png", (960, 700))
    overlay = Image.blend(c, final, 0.50)
    annotated = final.copy()
    draw = ImageDraw.Draw(annotated)
    arrow(draw, (260, 440), (540, 245))
    text(draw, (80, 455), "DIRECTED AXIS", 21, ACCENT, True)
    draw.ellipse((465, 165, 710, 390), outline="#9E64EE", width=5)
    text(draw, (610, 140), "ONE DOMINANT RIDGE", 19, "#7D45C8", True, "mm")
    draw.ellipse((665, 255, 855, 470), outline="#009FAC", width=5)
    text(draw, (760, 495), "BLUNT LEADING SHOULDER", 18, "#007E88", True, "mm")
    draw.ellipse((315, 280, 570, 520), outline="#D5A200", width=5)
    text(draw, (300, 545), "CENTRAL CONCAVITY REDISTRIBUTED", 18, "#9A7600", True)
    draw.ellipse((135, 250, 355, 500), outline="#5E7568", width=4)
    text(draw, (245, 220), "PRESERVED C REAR MASS", 18, "#4D6457", True, "mm")

    margin, gap = 70, 28
    panel_size = (960, 700)
    width = margin * 2 + panel_size[0] * 2 + gap
    height = 235 + panel_size[1] * 2 + 72 * 2 + gap + 45
    canvas = Image.new("RGB", (width, height), BG)
    header(
        canvas,
        "C → C-R1 / CONTROLLED LOCAL REFINEMENT",
        "NO GLOBAL A/C BLEND / UNCHANGED REAR DNA, CONNECTIVITY, UV AND MASK INDICES",
    )
    board_draw = ImageDraw.Draw(canvas)
    cells = [
        (c, "SOURCE C", "PROTECTED MASTER COORDINATES"),
        (final, "C-R1", "RECOMMENDED R1B GEOMETRY"),
        (overlay, "50/50 IMAGE OVERLAY", "VISIBLE SILHOUETTE AND MASS DELTA"),
        (annotated, "AUTHORED CHANGE FIELDS", "RIDGE / AXIS / SHOULDER / CENTRAL ZONE"),
    ]
    for index, (panel, label, detail) in enumerate(cells):
        row, column = divmod(index, 2)
        x = margin + column * (panel_size[0] + gap)
        y = 235 + row * (panel_size[1] + 72 + gap)
        canvas.paste(panel, (x, y))
        board_draw.rectangle((x, y, x + panel_size[0], y + panel_size[1]), outline=RULE, width=1)
        text(board_draw, (x, y + panel_size[1] + 12), label, 24, INK, True)
        text(board_draw, (x + panel_size[0], y + panel_size[1] + 15), detail, 17, MUTED, False, "ra")
    canvas.save(RENDER_DIR / "ps03-1_c-to-c-r1_board.png", quality=96)


def prepare_actor() -> Image.Image:
    actor = Image.open(PANEL_DIR / "composition_actor.png").convert("RGBA")
    bbox = actor.getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError("Composition actor has no alpha content")
    actor = actor.crop(bbox)
    # Offline layout rotation represents a further view-axis actor roll. Geometry
    # remains the unpainted Blender render; no generative or raster deformation.
    return actor.rotate(-38, Image.Resampling.BICUBIC, expand=True)


def fit_actor(actor: Image.Image, max_size: tuple[int, int]) -> Image.Image:
    copy = actor.copy()
    copy.thumbnail(max_size, Image.Resampling.LANCZOS)
    return copy


def paste_actor(base: Image.Image, actor: Image.Image, center, opacity=0.68):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    alpha = actor.getchannel("A").point(lambda value: int(value * opacity))
    actor = actor.copy()
    actor.putalpha(alpha)
    x = round(center[0] - actor.width / 2)
    y = round(center[1] - actor.height / 2)
    layer.alpha_composite(actor, (x, y))
    base.alpha_composite(layer)
    return x, y, actor.width, actor.height


def overlay_interface_ink(composite: Image.Image, source: Image.Image):
    rgb = source.convert("RGB")
    background = Image.new("RGB", rgb.size, rgb.getpixel((10, min(100, rgb.height - 1))))
    difference = ImageChops.difference(rgb, background).convert("L")
    ink_mask = difference.point(lambda value: 255 if value > 18 else 0)
    ink_mask = ink_mask.filter(ImageFilter.MaxFilter(3))
    overlay = source.copy()
    overlay.putalpha(ink_mask)
    composite.alpha_composite(overlay)


def crop_percent(rect, viewport):
    x, y, width, height = rect
    viewport_width, viewport_height = viewport
    right = max(0, x + width - viewport_width) / width
    bottom = max(0, y + height - viewport_height) / height
    return round(right * 100, 2), round(bottom * 100, 2)


def compose_interface_mockups():
    actor = prepare_actor()
    desktop_source = Image.open(
        REPO_DIR / "artifacts" / "color-grammar-v0.2" / "home-light-1440.png"
    ).convert("RGBA")
    mobile_source = Image.open(
        REPO_DIR / "artifacts" / "color-grammar-v0.2" / "home-light-390.png"
    ).convert("RGBA")
    desktop_source = desktop_source.resize(
        (1440, round(desktop_source.height * 1440 / desktop_source.width)),
        Image.Resampling.LANCZOS,
    )
    mobile_source = mobile_source.resize(
        (390, round(mobile_source.height * 390 / mobile_source.width)),
        Image.Resampling.LANCZOS,
    )

    desktop = desktop_source.copy()
    desktop_actor = fit_actor(actor, (900, 850))
    desktop_rect = paste_actor(
        desktop,
        desktop_actor,
        (desktop.width * 0.81, desktop.height * 0.54),
        0.70,
    )
    # Existing UI remains above the actor; explicit blocks stay opaque.
    overlay_interface_ink(desktop, desktop_source)
    desktop.alpha_composite(desktop_source.crop((0, 0, desktop.width, 78)), (0, 0))
    desktop.alpha_composite(desktop_source.crop((0, 85, 825, 755)), (0, 85))
    desktop.alpha_composite(desktop_source.crop((925, 450, 1350, 725)), (925, 450))
    desktop.alpha_composite(
        desktop_source.crop((0, 755, desktop.width, desktop.height)), (0, 755)
    )
    desktop_path = RENDER_DIR / "ps03-1_desktop_composition_1440.png"
    desktop.convert("RGB").save(desktop_path, quality=96)

    mobile = mobile_source.copy()
    mobile_actor = fit_actor(actor, (520, 520))
    mobile_rect = paste_actor(
        mobile,
        mobile_actor,
        (mobile.width * 0.75, mobile.height * 0.78),
        0.84,
    )
    # A restrained scrim keeps the real H1/body/CTA safe while retaining the
    # object as a continuous viewport background rather than a card.
    scrim = Image.new("RGBA", mobile.size, (0, 0, 0, 0))
    scrim_draw = ImageDraw.Draw(scrim)
    scrim_draw.rectangle((0, 65, mobile.width, 430), fill=(247, 247, 244, 232))
    scrim_draw.rectangle((0, 430, mobile.width, 620), fill=(247, 247, 244, 90))
    mobile.alpha_composite(scrim)
    overlay_interface_ink(mobile, mobile_source)
    mobile.alpha_composite(mobile_source.crop((0, 0, mobile.width, 65)), (0, 0))
    mobile_path = RENDER_DIR / "ps03-1_mobile_composition_390.png"
    mobile.convert("RGB").save(mobile_path, quality=96)

    desktop_crop = crop_percent(desktop_rect, desktop.size)
    mobile_crop = crop_percent(mobile_rect, mobile.size)
    metadata = {
        "camera": {"location": [9.0, -12.0, 6.5], "lens_mm": 55.0},
        "canonical_orientation": {
            "blender_view_axis_roll_deg": 34.0,
            "offline_layout_roll_deg": -38.0,
            "geometry_baked_rotation": [0.0, 0.0, 0.0],
        },
        "desktop": {
            "viewport": list(desktop.size),
            "actor_rect_px": list(desktop_rect),
            "actor_center_vw_vh": [81.0, 54.0],
            "projected_width_vw": round(desktop_rect[2] / desktop.width * 100, 2),
            "projected_height_vh": round(desktop_rect[3] / desktop.height * 100, 2),
            "right_crop_percent_of_actor": desktop_crop[0],
            "bottom_crop_percent_of_actor": desktop_crop[1],
            "safe_text_zone": "x 0–57.3vw / y 8.6–76.3vh, restored from current UI screenshot",
            "cta_zone": "preserved opaque; actor remains behind UI",
        },
        "mobile": {
            "viewport": list(mobile.size),
            "actor_rect_px": list(mobile_rect),
            "actor_center_vw_vh": [75.0, 78.0],
            "projected_width_vw": round(mobile_rect[2] / mobile.width * 100, 2),
            "projected_height_vh": round(mobile_rect[3] / mobile.height * 100, 2),
            "right_crop_percent_of_actor": mobile_crop[0],
            "bottom_crop_percent_of_actor": mobile_crop[1],
            "safe_text_zone": "x 0–100vw / y 7.7–73.5vh with graduated neutral scrim",
            "cta_zone": "CTA ink, outline and black fill restored above actor",
        },
    }
    (EXPORT_DIR / "ps03-1-composition-metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf8"
    )
    return desktop_path, mobile_path


def compose_composition_board(desktop_path: Path, mobile_path: Path):
    desktop = Image.open(desktop_path).convert("RGB")
    mobile = Image.open(mobile_path).convert("RGB")
    desktop.thumbnail((1360, 935), Image.Resampling.LANCZOS)
    mobile.thumbnail((430, 935), Image.Resampling.LANCZOS)
    margin, gap = 70, 42
    width = margin * 2 + desktop.width + mobile.width + gap
    height = 235 + max(desktop.height, mobile.height) + 82
    canvas = Image.new("RGB", (width, height), BG)
    header(
        canvas,
        "C-R1 / DESKTOP 1440 + MOBILE 390",
        "OFFLINE COMPOSITE USING CURRENT INTERFACE SCREENSHOTS / ACTOR REMAINS A VIEWPORT BACKGROUND",
    )
    draw = ImageDraw.Draw(canvas)
    x1, y = margin, 235
    x2 = x1 + desktop.width + gap
    canvas.paste(desktop, (x1, y))
    canvas.paste(mobile, (x2, y))
    draw.rectangle((x1, y, x1 + desktop.width, y + desktop.height), outline=RULE, width=2)
    draw.rectangle((x2, y, x2 + mobile.width, y + mobile.height), outline=RULE, width=2)
    text(draw, (x1, y + desktop.height + 14), "DESKTOP / 1440 PX", 23, INK, True)
    text(draw, (x2, y + mobile.height + 14), "MOBILE / 390 PX", 23, INK, True)
    canvas.save(RENDER_DIR / "ps03-1_composition_board.png", quality=96)


def main():
    required = [
        PANEL_DIR / "comparison_A.png",
        PANEL_DIR / "comparison_C.png",
        PANEL_DIR / "comparison_R1A.png",
        PANEL_DIR / "comparison_R1B.png",
        PANEL_DIR / "comparison_R1C.png",
        PANEL_DIR / "comparison_FINAL.png",
        PANEL_DIR / "final_canonical.png",
        PANEL_DIR / "final_silhouette.png",
        PANEL_DIR / "final_wire.png",
        PANEL_DIR / "final_mask.png",
        PANEL_DIR / "composition_actor.png",
    ]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing Blender panels: " + ", ".join(missing))
    compose_variant_board()
    compose_view_board()
    compose_diagnostics_board()
    compose_c_to_final_board()
    desktop, mobile = compose_interface_mockups()
    compose_composition_board(desktop, mobile)
    print("PS031_BOARDS_DONE")


if __name__ == "__main__":
    main()
