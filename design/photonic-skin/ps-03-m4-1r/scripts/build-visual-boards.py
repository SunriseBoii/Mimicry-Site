from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / "design/photonic-skin/ps-03-m4-1r/renders/browser"
OUTPUT = ROOT / "design/photonic-skin/ps-03-m4-1r/renders/approval-pack"
REPORT = ROOT / "design/photonic-skin/ps-03-m4-1r/reports/presentation-parity-report.json"
OUTPUT.mkdir(parents=True, exist_ok=True)

BG = "#090b0c"
PANEL = "#111516"
LINE = "#303738"
TEXT = "#e6ebe8"
MUTED = "#8f9b97"
PASS = "#b9ce69"
FONT_PATH = Path("C:/Windows/Fonts/consola.ttf")
FONT_BOLD_PATH = Path("C:/Windows/Fonts/consolab.ttf")


def font(size: int, bold: bool = False):
    target = FONT_BOLD_PATH if bold else FONT_PATH
    return ImageFont.truetype(str(target), size) if target.exists() else ImageFont.load_default()


def source(name: str):
    return Image.open(SOURCE / name).convert("RGB")


def crop(name: str, rect=(181, 82, 512, 512)):
    image = source(name)
    x, y, width, height = rect
    return image.crop((x, y, x + width, y + height))


def contain(image: Image.Image, width: int, height: int):
    copy = image.copy()
    copy.thumbnail((width, height), Image.Resampling.LANCZOS)
    frame = Image.new("RGB", (width, height), PANEL)
    frame.paste(copy, ((width - copy.width) // 2, (height - copy.height) // 2))
    return frame


def board(title: str, subtitle: str = "REAL BROWSER / WEBGL2 · PS-03.M4.1R"):
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    draw.text((42, 26), title, font=font(28, True), fill=TEXT)
    draw.text((44, 65), subtitle, font=font(14), fill=MUTED)
    draw.line((42, 96, 1558, 96), fill=LINE, width=1)
    return image, draw


def label(draw: ImageDraw.ImageDraw, xy: tuple[int, int], value: str, color=TEXT):
    draw.text(xy, value.upper(), font=font(15, True), fill=color)


def save(image: Image.Image, index: int, slug: str):
    target = OUTPUT / f"{index:02d}-{slug}.png"
    image.save(target, optimize=True)
    return target


def grid_board(index: int, slug: str, title: str, entries: list[tuple[str, Image.Image]], columns: int):
    image, draw = board(title)
    margin_x, start_y, gap = 42, 120, 18
    rows = (len(entries) + columns - 1) // columns
    cell_width = (1516 - gap * (columns - 1)) // columns
    cell_height = (740 - gap * (rows - 1)) // rows
    for position, (name, visual) in enumerate(entries):
        column = position % columns
        row = position // columns
        x = margin_x + column * (cell_width + gap)
        y = start_y + row * (cell_height + gap)
        draw.rectangle((x, y, x + cell_width, y + cell_height), fill=PANEL, outline=LINE)
        label(draw, (x + 14, y + 12), name)
        fitted = contain(visual, cell_width - 24, cell_height - 52)
        image.paste(fitted, (x + 12, y + 40))
    return save(image, index, slug)


outputs: list[Path] = []

# 01 — before/approved/after uses untouched browser screenshots as the audit record.
outputs.append(grid_board(1, "before-approved-after", "M3.1R VS M4.1 BEFORE VS M4.1R AFTER", [
    ("M4.1 BEFORE · Y-UP / WIDE", source("00-m41-before-event-canonical.png")),
    ("M3.1R APPROVED", source("01-m31r-approved-event-canonical.png")),
    ("M4.1R AFTER · Z-UP / SQUARE", source("single-event-canonical-desktop512.png")),
], 3))

single_names = ["content", "design", "digital", "event", "games", "merch", "video"]
outputs.append(grid_board(2, "all-single-canonical", "ALL 7 SINGLE · CANONICAL", [
    (name, crop(f"single-{name}-canonical-desktop512.png")) for name in single_names
], 4))
outputs.append(grid_board(3, "all-single-alternate", "ALL 7 SINGLE · ALTERNATE", [
    (name, crop(f"single-{name}-alternate-desktop512.png")) for name in single_names
], 4))

outputs.append(grid_board(4, "event-desktop-mobile", "EVENT · APPROVED ORIENTATION · DESKTOP / MOBILE", [
    ("M3.1R approved desktop", source("01-m31r-approved-event-canonical.png")),
    ("M4.1R desktop512", crop("single-event-canonical-desktop512.png")),
    ("M4.1R mobile390", crop("event-canonical-mobile390.png", (242, 143, 390, 390))),
], 3))

outputs.append(grid_board(5, "design-desktop-mobile", "DESIGN · DESKTOP / MOBILE", [
    ("desktop512", crop("single-design-canonical-desktop512.png")),
    ("mobile390", crop("design-canonical-mobile390.png", (242, 143, 390, 390))),
], 2))

outputs.append(grid_board(6, "focus-gather-drive", "FOCUS / GATHER / DRIVE · CARD 4", [
    ("FOCUS card 4", crop("focus-card4.png")),
    ("GATHER card 4", crop("gather-card4.png")),
    ("DRIVE card 4", crop("drive-card4.png")),
    ("Event lead", crop("event-lead.png")),
    ("Event support", crop("event-support.png")),
], 3))

outputs.append(grid_board(7, "brand-wide", "BRAND_WIDE · GATHER / DRIVE", [
    ("GATHER", crop("brand-wide-gather.png")),
    ("DRIVE", crop("brand-wide-drive.png")),
], 2))

outputs.append(grid_board(8, "endpoint-parity", "ENDPOINT PARITY · TWO INDEPENDENT 512×512 AREAS", [
    ("M4.1R exact endpoint", crop("parity-side-by-side.png", (120, 82, 512, 512))),
    ("Frozen M3.1R standalone", crop("parity-side-by-side.png", (632, 82, 512, 512))),
], 2))

outputs.append(grid_board(9, "difference-overlay", "DIFFERENCE OVERLAY · IDENTICAL PIPELINE", [
    ("Browser mode", source("parity-difference.png")),
    ("Expected result · black residual", crop("parity-difference.png")),
], 2))

outputs.append(grid_board(10, "silhouette-xor", "SILHOUETTE XOR / COMPONENT-ID DIFFERENCE", [
    ("Silhouette XOR", source("parity-silhouette-xor.png")),
    ("Component-ID difference", source("parity-component-difference.png")),
], 2))

profile_image, profile_draw = board("SQUARE PROFILE BOARD · 512 / 390 / 180 / 96")
profiles = [
    ("desktop512", crop("event-canonical-dpr1-5.png"), 512),
    ("mobile390", crop("event-canonical-mobile390.png", (242, 143, 390, 390)), 390),
    ("silhouette180", crop("event-canonical-silhouette180.png", (347, 248, 180, 180)), 180),
    ("silhouette96", crop("event-canonical-silhouette96.png", (389, 290, 96, 96)), 96),
]
for idx, (name, visual, native) in enumerate(profiles):
    x = 42 + idx * 379
    profile_draw.rectangle((x, 130, x + 355, 820), fill=PANEL, outline=LINE)
    label(profile_draw, (x + 16, 148), f"{name} · native {native}px")
    fitted = contain(visual, 325, 610)
    profile_image.paste(fitted, (x + 15, 190))
outputs.append(save(profile_image, 11, "square-profiles"))

outputs.append(grid_board(12, "wide-narrow-wide", "WIDE → NARROW → WIDE RECOVERY", [
    ("512 before · 768 buffer", crop("recovery-wide-before.png")),
    ("390 narrow · 585 buffer", crop("recovery-narrow.png", (242, 143, 390, 390))),
    ("512 after · 768 buffer", crop("recovery-wide-after.png")),
], 3))

outputs.append(grid_board(13, "transition-endpoints", "M4.1R TRANSITION · EXACT t=0 / t=1", [
    ("t=0 · source frame", crop("event-transition-t0.png")),
    ("t=1 · target frame", crop("event-transition-t1.png")),
], 2))

outputs.append(grid_board(14, "mid-transition", "MID-TRANSITION · MOTION LANGUAGE PRESERVED", [
    ("t=0.25", crop("event-transition-mid25.png")),
    ("t=0.50", crop("event-transition-mid50.png")),
    ("t=0.75", crop("event-transition-mid75.png")),
], 3))

outputs.append(grid_board(15, "retarget-final", "RETARGET · FINAL ENDPOINT / TARGET PRESENTATION FRAME", [
    ("snapshot 50% → BRAND_WIDE Gather · t=1", source("retarget-final-endpoint.png")),
    ("final render", crop("retarget-final-endpoint.png")),
], 2))

outputs.append(grid_board(16, "reduced-motion", "REDUCED MOTION · ONE-STEP EXACT ENDPOINT", [
    ("reduced/static ON · t=1", source("event-reduced-endpoint.png")),
    ("endpoint crop", crop("event-reduced-endpoint.png")),
], 2))

outputs.append(grid_board(17, "static-idle", "STATIC IDLE · EVENT ENDPOINT", [
    ("idle · t=1", source("event-static-idle.png")),
    ("canonical desktop512", crop("event-static-idle.png")),
], 2))

report = json.loads(REPORT.read_text(encoding="utf-8"))
diagnostic, diagnostic_draw = board("CAMERA / MATRIX DIAGNOSTIC", "MACHINE-READABLE REPORT + REAL BROWSER FRAME")
diagnostic.paste(contain(crop("single-event-canonical-desktop512.png"), 700, 700), (42, 135))
canonical_before = report["rootCauseAudit"]["legacyCamera"]["canonical"]
canonical_after = report["rootCauseAudit"]["correctedCamera"]["canonical"]
lines = [
    ("ROOT CAUSE", "Three.js default Y-up before lookAt + missing presentation frame + non-square aspect"),
    ("BEFORE UP / ASPECT", f"{canonical_before['up']} / {canonical_before['aspect']:.9f}"),
    ("AFTER UP / ASPECT", f"{canonical_after['up']} / {canonical_after['aspect']:.1f}"),
    ("AFTER QUAT XYZW", "[" + ", ".join(f"{v:.6f}" for v in canonical_after["quaternion"]) + "]"),
    ("FOV / CLIP", f"{canonical_after['fov']}° / {canonical_after['near']}–{canonical_after['far']}"),
    ("MATRIX CASES", f"{report['matrix']['passedCases']} / {report['matrix']['executedCases']} PASS"),
    ("MAX NDC / PIXEL", f"{report['matrix']['maximums']['ndcMaxAbs']} / {report['matrix']['maximums']['bboxDeltaPx']} px"),
    ("MIN SILHOUETTE IOU", str(report["matrix"]["minimums"]["silhouetteIou"])),
    ("CLIPPING", f"reference {report['matrix']['maximums']['clippedReference']} / M4.1R {report['matrix']['maximums']['clippedCandidate']}"),
    ("CASE DIGEST", report["caseDigestSha256"]),
    ("STATUS", report["status"]),
]
for idx, (name, value) in enumerate(lines):
    y = 140 + idx * 61
    diagnostic_draw.text((790, y), name, font=font(13, True), fill=MUTED)
    diagnostic_draw.text((790, y + 22), value, font=font(15), fill=PASS if name == "STATUS" else TEXT)
outputs.append(save(diagnostic, 18, "camera-matrix-diagnostic"))

print(json.dumps({"count": len(outputs), "files": [str(item.relative_to(ROOT)) for item in outputs]}, indent=2))
