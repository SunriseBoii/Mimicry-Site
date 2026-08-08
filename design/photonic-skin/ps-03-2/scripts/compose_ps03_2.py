"""Compose PS-03.2 comparison boards and approved mobile-crop checks."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps


SCRIPT_PATH = Path(__file__).resolve()
STAGE_DIR = SCRIPT_PATH.parent.parent
REPO_DIR = STAGE_DIR.parents[2]
PANEL_DIR = STAGE_DIR / "renders" / "_panels"
RENDER_DIR = STAGE_DIR / "renders"
MOBILE_DIR = RENDER_DIR / "mobile"
EXPORT_DIR = STAGE_DIR / "exports"
MOBILE_DIR.mkdir(parents=True, exist_ok=True)

BG = "#F4F5F2"
INK = "#191A1B"
MUTED = "#696D71"
RULE = "#A8ACA9"
ACCENT = "#4C7AFF"

TERMINALS = (
    "MASTER",
    "BRAND_WIDE",
    "SINGLE_CONTENT_SEQUENCE",
    "SINGLE_DESIGN_TORSION",
    "SINGLE_EVENT_CONVERGENCE",
    "SINGLE_GAMES_BRANCH",
    "SINGLE_VIDEO_TEMPORAL",
    "SINGLE_DIGITAL_SIGNAL",
    "SINGLE_MERCH_WRAP",
    "COMPLEX_FOCUS",
    "COMPLEX_GATHER",
    "COMPLEX_DRIVE",
)

SINGLES = TERMINALS[2:9]
COMPLEX_BRAND = ("MASTER", "BRAND_WIDE", "COMPLEX_FOCUS", "COMPLEX_GATHER", "COMPLEX_DRIVE")

VIEW_NAMES = (
    ("canonical", "CANONICAL 3/4"),
    ("opposite", "OPPOSITE 3/4"),
    ("front", "FRONT / RISK"),
    ("side", "SIDE / RISK"),
    ("top", "TOP"),
    ("silhouette", "SILHOUETTE"),
    ("wire", "WIREFRAME"),
)


def slug(name):
    return name.lower().replace("single_", "").replace("complex_", "complex-").replace("_", "-")


def font(size, bold=False):
    path = Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf")
    return ImageFont.truetype(str(path), size)


def draw_text(draw, xy, value, size, color=INK, bold=False, anchor="la"):
    draw.text(xy, value, font=font(size, bold), fill=color, anchor=anchor)


def header(canvas, title, subtitle):
    draw = ImageDraw.Draw(canvas)
    draw_text(draw, (60, 45), "PS-03.2 / PHOTONIC SKIN", 20, MUTED, True)
    draw_text(draw, (60, 82), title, 42, INK, True)
    draw_text(draw, (60, 142), subtitle, 20, MUTED)
    draw.line((60, 188, canvas.width - 60, 188), fill=RULE, width=2)


def fit_panel(path, size, background=BG):
    source = Image.open(path).convert("RGB")
    contained = ImageOps.contain(source, size, Image.Resampling.LANCZOS)
    panel = Image.new("RGB", size, background)
    panel.paste(contained, ((size[0] - contained.width) // 2, (size[1] - contained.height) // 2))
    return panel


def canonical_path(name):
    return PANEL_DIR / f"canonical_{slug(name)}.png"


def panel_path(name, view):
    if view == "canonical":
        return canonical_path(name)
    if view in ("silhouette", "wire"):
        return PANEL_DIR / f"{view}_{slug(name)}.png"
    return PANEL_DIR / f"control_{slug(name)}_{view}.png"


def compose_full_system(manifest):
    columns, rows = 4, 3
    panel_size = (520, 390)
    label_height, gap, margin = 62, 24, 60
    width = margin * 2 + columns * panel_size[0] + (columns - 1) * gap
    height = 215 + rows * (panel_size[1] + label_height) + (rows - 1) * gap + 35
    canvas = Image.new("RGB", (width, height), BG)
    header(canvas, "MASTER + 11 TERMINAL GEOMETRIES", "IDENTICAL 55 MM CAMERA / +34 DEG VIEW-AXIS ROLL / SUBDIVISION 0")
    draw = ImageDraw.Draw(canvas)
    scores = {item["stable_name"]: item["score_total"] for item in manifest["targets"]}
    for index, name in enumerate(TERMINALS):
        row, column = divmod(index, columns)
        x = margin + column * (panel_size[0] + gap)
        y = 215 + row * (panel_size[1] + label_height + gap)
        panel = fit_panel(canonical_path(name), panel_size)
        canvas.paste(panel, (x, y))
        draw.rectangle((x, y, x + panel_size[0], y + panel_size[1]), outline=RULE, width=1)
        draw_text(draw, (x, y + panel_size[1] + 12), name, 20, INK, True)
        if name != "MASTER":
            draw_text(draw, (x + panel_size[0], y + panel_size[1] + 15), f"{scores[name]}/100", 18, ACCENT, True, "ra")
    path = RENDER_DIR / "ps03-2_full_system_board.png"
    canvas.save(path, quality=96)
    return path


def silhouette_insets(name):
    source = Image.open(PANEL_DIR / f"silhouette_{slug(name)}.png").convert("RGB")
    large = ImageOps.contain(source, (180, 135), Image.Resampling.LANCZOS)
    small = ImageOps.contain(source, (96, 72), Image.Resampling.LANCZOS)
    block = Image.new("RGB", (320, 180), "#FFFFFF")
    block.paste(large, (10, 12))
    block.paste(small, (214, 42))
    draw = ImageDraw.Draw(block)
    draw_text(draw, (100, 166), "~180 px", 14, MUTED, anchor="mm")
    draw_text(draw, (262, 128), "96 px", 14, MUTED, anchor="mm")
    return block


def compose_single_board(manifest):
    metadata = {item["stable_name"]: item for item in manifest["targets"]}
    columns, rows = 2, 4
    cell_size = (980, 590)
    gap, margin = 28, 60
    width = margin * 2 + columns * cell_size[0] + gap
    height = 215 + rows * cell_size[1] + (rows - 1) * gap + 35
    canvas = Image.new("RGB", (width, height), BG)
    header(canvas, "SEVEN SINGLE STATES", "CANONICAL FORM + 180/96 PX SILHOUETTE + PRINCIPLE + PRIMARY RISK")
    draw = ImageDraw.Draw(canvas)
    for index, name in enumerate(SINGLES):
        row, column = divmod(index, columns)
        x = margin + column * (cell_size[0] + gap)
        y = 215 + row * (cell_size[1] + gap)
        draw.rectangle((x, y, x + cell_size[0], y + cell_size[1]), fill="#ECEDE9", outline=RULE, width=1)
        canonical = fit_panel(canonical_path(name), (620, 465), "#ECEDE9")
        canvas.paste(canonical, (x, y))
        canvas.paste(silhouette_insets(name), (x + 642, y + 32))
        item = metadata[name]
        draw_text(draw, (x + 24, y + 480), name, 22, INK, True)
        draw_text(draw, (x + 24, y + 516), item["competence"].upper(), 17, ACCENT, True)
        draw_text(draw, (x + 190, y + 516), item["principle"], 15, MUTED)
        draw_text(draw, (x + 24, y + 552), "RISK: " + item["main_risk"], 15, "#8A4E3D")
    path = RENDER_DIR / "ps03-2_single_states_board.png"
    canvas.save(path, quality=96)
    return path


def compose_complex_brand_board(manifest):
    metadata = {item["stable_name"]: item for item in manifest["targets"]}
    columns, rows = 3, 2
    panel_size = (650, 488)
    gap, margin, labels = 28, 60, 94
    width = margin * 2 + columns * panel_size[0] + (columns - 1) * gap
    height = 215 + rows * (panel_size[1] + labels) + gap + 35
    canvas = Image.new("RGB", (width, height), BG)
    header(canvas, "BRAND_WIDE + COMPLEX SYSTEM", "ONE OBJECT / DIFFERENT DISTRIBUTIONS OF MASS / NO SINGLE-TARGET MIXING")
    draw = ImageDraw.Draw(canvas)
    for index, name in enumerate(COMPLEX_BRAND):
        row, column = divmod(index, columns)
        x = margin + column * (panel_size[0] + gap)
        y = 215 + row * (panel_size[1] + labels + gap)
        canvas.paste(fit_panel(canonical_path(name), panel_size), (x, y))
        draw.rectangle((x, y, x + panel_size[0], y + panel_size[1]), outline=RULE, width=1)
        draw_text(draw, (x, y + panel_size[1] + 12), name, 22, INK, True)
        principle = "approved C-R1B baseline" if name == "MASTER" else metadata[name]["principle"]
        draw_text(draw, (x, y + panel_size[1] + 48), principle, 16, MUTED)
    path = RENDER_DIR / "ps03-2_complex_brand_board.png"
    canvas.save(path, quality=96)
    return path


def compose_control_boards():
    outputs = []
    groups = [TERMINALS[index : index + 3] for index in range(0, len(TERMINALS), 3)]
    panel_size = (280, 210)
    gap, margin, label_height = 12, 50, 52
    width = margin * 2 + len(VIEW_NAMES) * panel_size[0] + (len(VIEW_NAMES) - 1) * gap
    for group_index, group in enumerate(groups, 1):
        height = 215 + len(group) * (panel_size[1] + label_height + gap) + 30
        canvas = Image.new("RGB", (width, height), BG)
        header(canvas, f"CONTROL VIEWS / SET {group_index}", "CANONICAL / OPPOSITE / FRONT / SIDE / TOP / SILHOUETTE / TOPOLOGY")
        draw = ImageDraw.Draw(canvas)
        for row, name in enumerate(group):
            y = 215 + row * (panel_size[1] + label_height + gap)
            for column, (view, label) in enumerate(VIEW_NAMES):
                x = margin + column * (panel_size[0] + gap)
                canvas.paste(fit_panel(panel_path(name, view), panel_size), (x, y))
                draw.rectangle((x, y, x + panel_size[0], y + panel_size[1]), outline=RULE, width=1)
                draw_text(draw, (x + panel_size[0] // 2, y + panel_size[1] + 9), label, 13, MUTED, view == "canonical", "ma")
            draw_text(draw, (margin, y - 7), name, 16, ACCENT, True, "ls")
        path = RENDER_DIR / f"ps03-2_control_views_{group_index}.png"
        canvas.save(path, quality=96)
        outputs.append(path)
    return outputs


def overlay_interface_ink(composite, source):
    rgb = source.convert("RGB")
    background = Image.new("RGB", rgb.size, rgb.getpixel((10, min(100, rgb.height - 1))))
    difference = ImageChops.difference(rgb, background).convert("L")
    mask = difference.point(lambda value: 255 if value > 18 else 0).filter(ImageFilter.MaxFilter(3))
    overlay = source.copy()
    overlay.putalpha(mask)
    composite.alpha_composite(overlay)


def compose_mobile_states():
    source = Image.open(REPO_DIR / "artifacts" / "color-grammar-v0.2" / "home-light-390.png").convert("RGBA")
    source = source.resize((390, round(source.height * 390 / source.width)), Image.Resampling.LANCZOS)
    metadata = []
    outputs = []
    for name in TERMINALS:
        actor = Image.open(PANEL_DIR / f"mobile_actor_{slug(name)}.png").convert("RGBA")
        bbox = actor.getchannel("A").getbbox()
        if not bbox:
            raise RuntimeError(f"Empty mobile actor for {name}")
        actor = actor.crop(bbox)
        actor.thumbnail((520, 520), Image.Resampling.LANCZOS)
        alpha = actor.getchannel("A").point(lambda value: int(value * 0.84))
        actor.putalpha(alpha)
        x = round(source.width * 0.75 - actor.width / 2)
        y = round(source.height * 0.78 - actor.height / 2)
        composite = source.copy()
        layer = Image.new("RGBA", composite.size, (0, 0, 0, 0))
        layer.alpha_composite(actor, (x, y))
        composite.alpha_composite(layer)
        scrim = Image.new("RGBA", composite.size, (0, 0, 0, 0))
        scrim_draw = ImageDraw.Draw(scrim)
        scrim_draw.rectangle((0, 65, 390, 430), fill=(247, 247, 244, 232))
        scrim_draw.rectangle((0, 430, 390, 620), fill=(247, 247, 244, 90))
        composite.alpha_composite(scrim)
        overlay_interface_ink(composite, source)
        composite.alpha_composite(source.crop((0, 0, 390, 65)), (0, 0))
        path = MOBILE_DIR / f"mobile_{slug(name)}_390.png"
        composite.convert("RGB").save(path, quality=96)
        outputs.append(path)
        right_crop = max(0, x + actor.width - 390) / actor.width * 100
        bottom_crop = max(0, y + actor.height - source.height) / actor.height * 100
        metadata.append(
            {
                "target": name,
                "viewport": [390, source.height],
                "actor_rect_px": [x, y, actor.width, actor.height],
                "center_vw_vh": [75.0, 78.0],
                "projected_width_vw": round(actor.width / 390 * 100, 2),
                "projected_height_vh": round(actor.height / source.height * 100, 2),
                "right_crop_percent": round(right_crop, 2),
                "bottom_crop_percent": round(bottom_crop, 2),
            }
        )

    columns, rows = 4, 3
    panel_size = (260, 563)
    gap, margin, label_height = 22, 50, 48
    width = margin * 2 + columns * panel_size[0] + (columns - 1) * gap
    height = 215 + rows * (panel_size[1] + label_height) + (rows - 1) * gap + 30
    board = Image.new("RGB", (width, height), BG)
    header(board, "MOBILE 390 / ALL TERMINAL GEOMETRIES", "75VW / 78VH CENTER / ~133VW WIDTH / SHARED TEXT + CTA SAFE ZONES")
    draw = ImageDraw.Draw(board)
    for index, (name, path) in enumerate(zip(TERMINALS, outputs)):
        row, column = divmod(index, columns)
        x = margin + column * (panel_size[0] + gap)
        y = 215 + row * (panel_size[1] + label_height + gap)
        board.paste(fit_panel(path, panel_size, "#FFFFFF"), (x, y))
        draw.rectangle((x, y, x + panel_size[0], y + panel_size[1]), outline=RULE, width=1)
        draw_text(draw, (x, y + panel_size[1] + 10), name, 14, INK, True)
    board_path = RENDER_DIR / "ps03-2_mobile_390_board.png"
    board.save(board_path, quality=96)
    composition_metadata = {
        "stage": "PS-03.2",
        "camera": {"location": [9.0, -12.0, 6.5], "lens_mm": 55.0},
        "canonical_view_axis_roll_deg": 34.0,
        "geometry_rotation": [0.0, 0.0, 0.0],
        "safe_text_zone": "x 0-100vw / y 7.7-73.5vh with graduated neutral scrim",
        "cta_zone": "CTA ink, outline and black fill remain above actor",
        "targets": metadata,
    }
    (EXPORT_DIR / "ps03-2-composition-metadata.json").write_text(
        json.dumps(composition_metadata, ensure_ascii=False, indent=2), encoding="utf8"
    )
    return board_path


def compose_mask_board(technical):
    endpoint = technical["endpoint_validation"]
    columns, rows = 4, 3
    panel_size = (520, 390)
    gap, margin, label_height = 24, 60, 62
    width = margin * 2 + columns * panel_size[0] + (columns - 1) * gap
    height = 215 + rows * (panel_size[1] + label_height) + (rows - 1) * gap + 35
    canvas = Image.new("RGB", (width, height), BG)
    header(canvas, "FIXED PHOTONIC MASK / ALL TERMINALS", "SAME 2 526 FACE INDICES / PHYSICAL AREA 32-36% / TECHNICAL PREVIEW")
    draw = ImageDraw.Draw(canvas)
    for index, name in enumerate(TERMINALS):
        row, column = divmod(index, columns)
        x = margin + column * (panel_size[0] + gap)
        y = 215 + row * (panel_size[1] + label_height + gap)
        canvas.paste(fit_panel(PANEL_DIR / f"mask_{slug(name)}.png", panel_size), (x, y))
        draw.rectangle((x, y, x + panel_size[0], y + panel_size[1]), outline=RULE, width=1)
        area = endpoint[name]["metrics"]["active_surface_ratio"] * 100
        draw_text(draw, (x, y + panel_size[1] + 12), name, 18, INK, True)
        draw_text(draw, (x + panel_size[0], y + panel_size[1] + 15), f"{area:.3f}%", 17, ACCENT, True, "ra")
    path = RENDER_DIR / "ps03-2_photonic_mask_board.png"
    canvas.save(path, quality=96)
    return path


def compose_transition_storyboards():
    sequences = {
        "master-content": "MASTER TO CONTENT",
        "design-merch": "DESIGN TO MERCH",
        "games-event": "GAMES TO EVENT",
        "focus-drive": "FOCUS TO DRIVE",
        "retarget-content-design-event": "RETARGET: CONTENT/DESIGN SNAPSHOT TO EVENT",
        "transition-tension": "TRANSITION_TENSION: 0 / .03 / .06 / .03 / 0",
    }
    boards = []
    for sequence, title in sequences.items():
        panel_size = (360, 270)
        gap, margin = 18, 45
        width = margin * 2 + 5 * panel_size[0] + 4 * gap
        height = 175 + panel_size[1] + 66
        canvas = Image.new("RGB", (width, height), BG)
        draw = ImageDraw.Draw(canvas)
        draw_text(draw, (45, 35), "PS-03.2 / DIRECT GEOMETRY", 17, MUTED, True)
        draw_text(draw, (45, 72), title, 30, INK, True)
        draw.line((45, 132, width - 45, 132), fill=RULE, width=2)
        for frame in range(5):
            x = margin + frame * (panel_size[0] + gap)
            y = 155
            path = PANEL_DIR / f"transition_{sequence}_{frame}.png"
            canvas.paste(fit_panel(path, panel_size), (x, y))
            draw.rectangle((x, y, x + panel_size[0], y + panel_size[1]), outline=RULE, width=1)
            draw_text(draw, (x + panel_size[0] // 2, y + panel_size[1] + 14), f"{frame * 25}%", 18, MUTED, frame in (0, 4), "ma")
        path = RENDER_DIR / f"ps03-2_transition_{sequence}_storyboard.png"
        canvas.save(path, quality=96)
        boards.append((title, path))

    columns, rows = 2, 3
    panel_size = (920, 250)
    gap, margin, label_height = 28, 50, 40
    width = margin * 2 + columns * panel_size[0] + gap
    height = 215 + rows * (panel_size[1] + label_height) + (rows - 1) * gap + 30
    canvas = Image.new("RGB", (width, height), BG)
    header(canvas, "DIRECT MORPH + RETARGET STORYBOARDS", "REAL BLENDER GEOMETRY / NO MOTION BLUR / NO SHADER MASKING")
    draw = ImageDraw.Draw(canvas)
    for index, (title, path) in enumerate(boards):
        row, column = divmod(index, columns)
        x = margin + column * (panel_size[0] + gap)
        y = 215 + row * (panel_size[1] + label_height + gap)
        canvas.paste(fit_panel(path, panel_size), (x, y))
        draw.rectangle((x, y, x + panel_size[0], y + panel_size[1]), outline=RULE, width=1)
        draw_text(draw, (x, y + panel_size[1] + 10), title, 15, INK, True)
    path = RENDER_DIR / "ps03-2_transition_storyboards.png"
    canvas.save(path, quality=96)
    return path


def main():
    manifest = json.loads((EXPORT_DIR / "ps03-2-target-manifest.json").read_text(encoding="utf8"))
    technical = json.loads((EXPORT_DIR / "ps03-2-technical-validation.json").read_text(encoding="utf8"))
    required = [canonical_path(name) for name in TERMINALS]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing Blender render panels: " + ", ".join(missing))
    outputs = [
        compose_full_system(manifest),
        compose_single_board(manifest),
        compose_complex_brand_board(manifest),
        *compose_control_boards(),
        compose_mobile_states(),
        compose_mask_board(technical),
        compose_transition_storyboards(),
    ]
    print("PS032_BOARDS_DONE", len(outputs))


if __name__ == "__main__":
    main()
