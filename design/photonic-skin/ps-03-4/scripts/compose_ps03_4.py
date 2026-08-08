"""Compose PS-03.4 D-only review boards from real Blender renders."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


STAGE = Path(__file__).resolve().parent.parent
RENDERS = STAGE / "renders"
PANELS = RENDERS / "_panels"
CANDIDATES = RENDERS / "candidates"
MOBILE_SRC = RENDERS / "_mobile_sources"
MOBILE = RENDERS / "mobile"
EXPORTS = STAGE / "exports"
MOBILE.mkdir(parents=True, exist_ok=True)

BG = (239, 237, 232)
CARD = (249, 248, 244)
INK = (31, 34, 36)
MUTED = (103, 107, 109)
LINE = (206, 204, 198)
ACCENT = (44, 88, 92)
FAIL = (139, 63, 49)

SINGLES = [
    ("content-sequence", "SINGLE_CONTENT_SEQUENCE", "Content", "Editorial Folio", "two connected fields + central fold", "mouth / shell / chair", 85),
    ("design-torsion", "SINGLE_DESIGN_TORSION", "Design", "Forming Palette", "wide work zone + narrow control side", "bowl / shell / drapery", 81),
    ("event-convergence", "SINGLE_EVENT_CONVERGENCE", "Event", "Gathering Canopy", "offset apex + broad eaves", "volcano / mushroom / flower", 80),
    ("games-branch", "SINGLE_GAMES_BRANCH", "Games", "Decision Field", "one entry + three divergent routes", "controller / horns / crown", 80),
    ("video-temporal", "SINGLE_VIDEO_TEMPORAL", "Video", "Frame Sweep", "soft rectangular field + temporal edge", "car / capsule / airfoil", 87),
    ("digital-signal", "SINGLE_DIGITAL_SIGNAL", "Digital", "Routing Substrate", "Y-convergence + broad nodes", "generic field / alien hardware", 83),
    ("merch-wrap", "SINGLE_MERCH_WRAP", "Merch", "Wrapped Parcel", "soft block core + diagonal overlap", "capsule / stone / case", 83),
]

TERMINALS = [
    ("master", "MASTER"),
    ("brand-wide", "BRAND_WIDE"),
    *[(item[0], item[1]) for item in SINGLES],
    ("complex-focus", "COMPLEX_FOCUS"),
    ("complex-gather", "COMPLEX_GATHER"),
    ("complex-drive", "COMPLEX_DRIVE"),
]

LOCK_ORDER = [4, 0, 6, 2, 5, 1, 3]


def font(size: int, bold: bool = False):
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def label(draw, xy, value, size=24, bold=False, fill=INK, anchor=None):
    draw.text(xy, value, font=font(size, bold), fill=fill, anchor=anchor)


def fit(path: Path, size: tuple[int, int], mode="contain") -> Image.Image:
    image = Image.open(path).convert("RGB")
    if mode == "cover":
        scale = max(size[0] / image.width, size[1] / image.height)
    else:
        scale = min(size[0] / image.width, size[1] / image.height)
    resized = image.resize((max(1, int(image.width * scale)), max(1, int(image.height * scale))), Image.Resampling.LANCZOS)
    if mode == "cover":
        left = max(0, (resized.width - size[0]) // 2)
        top = max(0, (resized.height - size[1]) // 2)
        return resized.crop((left, top, left + size[0], top + size[1]))
    canvas = Image.new("RGB", size, CARD)
    canvas.paste(resized, ((size[0] - resized.width) // 2, (size[1] - resized.height) // 2))
    return canvas


def place(canvas, path, box, mode="contain"):
    x, y, w, h = box
    canvas.paste(fit(path, (w, h), mode), (x, y))


def save(image, name):
    path = RENDERS / name
    image.save(path, quality=95)
    return path


def candidate_boards():
    outputs = []
    for slug, target, competence, association, cue, risk, score in SINGLES:
        canvas = Image.new("RGB", (2200, 700), BG)
        draw = ImageDraw.Draw(canvas)
        label(draw, (60, 36), f"{competence} / {association}", 34, True)
        label(draw, (60, 82), "v1 silhouette → v2 mass/cue → final D-R2", 22, fill=MUTED)
        for col, variant in enumerate(("v1", "v2", "final")):
            x = 55 + col * 715
            draw.rounded_rectangle((x, 125, x + 675, 650), 18, fill=CARD, outline=LINE, width=2)
            place(canvas, CANDIDATES / f"{variant}_{slug}.png", (x + 12, 165, 651, 440), "cover")
            label(draw, (x + 337, 145), variant.upper() if variant != "final" else "FINAL D-R2", 22, True, anchor="mm")
        out = CANDIDATES / f"ps03-4_candidate_{slug}.png"
        canvas.save(out)
        outputs.append(str(out))
    return outputs


def unlabelled_board():
    canvas = Image.new("RGB", (2520, 2200), BG)
    draw = ImageDraw.Draw(canvas)
    label(draw, (70, 45), "PS-03.4 D-R2 — UNLABELLED LOCK BOARD", 38, True)
    label(draw, (70, 95), "Open this board before the answer key. Neutral numbering only.", 24, fill=MUTED)
    for position, source_index in enumerate(LOCK_ORDER):
        slug = SINGLES[source_index][0]
        row, col = divmod(position, 3)
        x, y = 55 + col * 815, 155 + row * 660
        draw.rounded_rectangle((x, y, x + 775, y + 620), 20, fill=CARD, outline=LINE, width=2)
        label(draw, (x + 28, y + 28), f"{position + 1:02d}", 28, True)
        place(canvas, PANELS / f"canonical_{slug}.png", (x + 18, y + 75, 470, 350), "cover")
        place(canvas, PANELS / f"silhouette180_{slug}.png", (x + 510, y + 100, 180, 180))
        place(canvas, PANELS / f"silhouette96_{slug}.png", (x + 555, y + 335, 96, 96))
        label(draw, (x + 545, y + 462), "180 px", 18, fill=MUTED)
        label(draw, (x + 552, y + 500), "96 px", 18, fill=MUTED)
    return save(canvas, "ps03-4_d_only_unlabelled_lock_board.png")


def answer_key():
    canvas = Image.new("RGB", (2200, 1180), BG)
    draw = ImageDraw.Draw(canvas)
    label(draw, (60, 40), "PS-03.4 D-R2 — ANSWER KEY / INTERNAL GATE", 38, True)
    headers = ["No.", "Target", "Competence", "Object field", "Primary cue", "Controlled risk", "Gate"]
    xs = [60, 145, 600, 830, 1120, 1570, 2010]
    for x, value in zip(xs, headers):
        label(draw, (x, 120), value, 20, True)
    y = 170
    for position, source_index in enumerate(LOCK_ORDER):
        slug, target, competence, association, cue, risk, score = SINGLES[source_index]
        draw.rectangle((45, y - 14, 2150, y + 112), fill=CARD if position % 2 == 0 else BG)
        values = [f"{position + 1:02d}", target, competence, association, cue, risk, f"NOT LOCKED {score}/100"]
        for x, value in zip(xs, values):
            label(draw, (x, y), value, 17, bold=x in (60, 2010), fill=FAIL if x == 2010 else INK)
        y += 135
    label(draw, (60, 1120), "Internal verdict: technically valid best-effort; object-readability threshold not met without labels.", 23, True, fill=FAIL)
    return save(canvas, "ps03-4_d_only_answer_key_board.png")


def system_board():
    canvas = Image.new("RGB", (2400, 1800), BG)
    draw = ImageDraw.Draw(canvas)
    label(draw, (60, 40), "PS-03.4 — D-R2 TERMINAL SYSTEM (D ONLY)", 38, True)
    for i, (slug, name) in enumerate(TERMINALS):
        row, col = divmod(i, 4)
        x, y = 45 + col * 590, 115 + row * 540
        draw.rounded_rectangle((x, y, x + 555, y + 500), 18, fill=CARD, outline=LINE)
        place(canvas, PANELS / f"canonical_{slug}.png", (x + 10, y + 45, 535, 400), "cover")
        label(draw, (x + 20, y + 18), name, 18, True)
    return save(canvas, "ps03-4_d_only_system_board.png")


def make_mobile_images():
    outputs = {}
    for slug, name in TERMINALS:
        canvas = Image.new("RGB", (390, 844), (235, 233, 228))
        actor = Image.open(MOBILE_SRC / f"mobile_actor_{slug}.png").convert("RGBA")
        actor.thumbnail((520, 520), Image.Resampling.LANCZOS)
        canvas.paste(actor, ((390 - actor.width) // 2 + 42, 165), actor)
        draw = ImageDraw.Draw(canvas)
        label(draw, (22, 26), name, 17, True)
        label(draw, (22, 802), "390 × 844 baseline framing", 14, fill=MUTED)
        path = MOBILE / f"mobile_{slug}_390.png"
        canvas.save(path)
        outputs[slug] = path
    return outputs


def mobile_board(mobile):
    canvas = Image.new("RGB", (1660, 2700), BG)
    draw = ImageDraw.Draw(canvas)
    label(draw, (60, 35), "PS-03.4 — MOBILE 390 × 844 / 12 TERMINALS", 36, True)
    for i, (slug, name) in enumerate(TERMINALS):
        row, col = divmod(i, 4)
        x, y = 30 + col * 405, 105 + row * 860
        place(canvas, mobile[slug], (x, y, 390, 844), "cover")
    return save(canvas, "ps03-4_d_only_mobile_390_board.png")


def association_board(mobile):
    canvas = Image.new("RGB", (3600, 4300), BG)
    draw = ImageDraw.Draw(canvas)
    label(draw, (60, 35), "PS-03.4 — D-R2 ASSOCIATION / RISK-CONTROL VIEWS", 38, True)
    headers = ["canonical", "opposite", "front", "side", "top", "180", "96", "mobile"]
    for col, head in enumerate(headers):
        label(draw, (520 + col * 380, 100), head, 20, True, anchor="mm")
    for row, (slug, target, competence, association, cue, risk, score) in enumerate(SINGLES):
        y = 155 + row * 580
        label(draw, (45, y + 25), f"{competence}\n{association}\n{score}/100 NOT LOCKED", 19, True, fill=FAIL)
        paths = [
            PANELS / f"canonical_{slug}.png",
            PANELS / f"control_{slug}_opposite.png",
            PANELS / f"control_{slug}_front.png",
            PANELS / f"control_{slug}_side.png",
            PANELS / f"control_{slug}_top.png",
            PANELS / f"silhouette180_{slug}.png",
            PANELS / f"silhouette96_{slug}.png",
            mobile[slug],
        ]
        for col, path in enumerate(paths):
            w, h = (340, 440) if col == 7 else (340, 300)
            place(canvas, path, (350 + col * 400, y, w, h), "cover" if col < 5 else "contain")
        label(draw, (350, y + 325), f"Cue: {cue}    Risk: {risk}", 18, fill=MUTED)
    return save(canvas, "ps03-4_d_only_association_views_board.png")


def mask_board(technical):
    canvas = Image.new("RGB", (2400, 1800), BG)
    draw = ImageDraw.Draw(canvas)
    label(draw, (60, 35), "PS-03.4 — FIXED PHOTONIC MASK / 2,526 FACES", 36, True)
    endpoints = technical["endpoint_validation"]
    for i, (slug, name) in enumerate(TERMINALS):
        row, col = divmod(i, 4)
        x, y = 45 + col * 590, 105 + row * 540
        place(canvas, PANELS / f"mask_{slug}.png", (x, y + 40, 555, 410), "cover")
        ratio = endpoints[name]["metrics"]["active_surface_ratio"] * 100
        label(draw, (x + 12, y + 16), f"{name} — {ratio:.2f}%", 17, True)
    return save(canvas, "ps03-4_d_only_photonic_mask_board.png")


def transition_board():
    sequences = ["master-content", "content-digital", "content-games", "design-merch", "games-event", "video-complex-drive", "retarget-content-design-event", "transition-tension"]
    canvas = Image.new("RGB", (2200, 2500), BG)
    draw = ImageDraw.Draw(canvas)
    label(draw, (60, 35), "PS-03.4 — D-R2 TRANSITION STORYBOARDS", 36, True)
    for row, sequence in enumerate(sequences):
        y = 110 + row * 295
        label(draw, (45, y + 120), sequence, 18, True)
        for frame in range(5):
            path = PANELS / (
                f"transition-transition-tension_{frame}.png"
                if sequence == "transition-tension"
                else f"transition_{sequence}_{frame}.png"
            )
            place(canvas, path, (290 + frame * 375, y, 355, 266), "cover")
    return save(canvas, "ps03-4_d_only_transition_board.png")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    technical = json.loads((EXPORTS / "ps03-4-technical-validation.json").read_text(encoding="utf8"))
    candidates = candidate_boards()
    mobile = make_mobile_images()
    outputs = [
        unlabelled_board(),
        answer_key(),
        system_board(),
        association_board(mobile),
        mobile_board(mobile),
        mask_board(technical),
        transition_board(),
    ]
    metadata = {
        "stage": "PS-03.4",
        "system": "D-R2 only",
        "source_policy": "all actor imagery is Blender-rendered; PIL is used only for deterministic layout, labels and crop composition",
        "candidate_state_count": 21,
        "refinement_cycles": 5,
        "unlabelled_order": [f"{i + 1:02d}" for i in range(7)],
        "visual_gate": "NOT LOCKED",
        "outputs": {str(path.relative_to(STAGE)).replace('\\', '/'): sha256(path) for path in outputs},
        "candidate_boards": candidates,
        "mobile_viewport": [390, 844],
        "passed": True,
    }
    (EXPORTS / "ps03-4-composition-metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf8")
    print("PS034_COMPOSE_DONE", len(outputs), len(candidates))


if __name__ == "__main__":
    main()
