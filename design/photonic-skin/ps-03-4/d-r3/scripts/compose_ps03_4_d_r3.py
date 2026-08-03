"""Compose PS-03.4R D-R3 review boards from real Blender renders.

PIL is used only for deterministic layout, labels and crops; every actor
image is a Blender render of the actual D-R3 geometry.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


STAGE = Path(__file__).resolve().parent.parent
RENDERS = STAGE / "renders"
PANELS = RENDERS / "_panels"
MOBILE_SRC = RENDERS / "_mobile_sources"
MOBILE = RENDERS / "mobile"
EXPORTS = STAGE / "exports"
MOBILE.mkdir(parents=True, exist_ok=True)

BG = (239, 237, 232)
CARD = (249, 248, 244)
INK = (31, 34, 36)
MUTED = (103, 107, 109)
LINE = (206, 204, 198)
PASS_COLOR = (44, 92, 60)
FAIL = (139, 63, 49)

SINGLES = [
    ("content-sequence", "SINGLE_CONTENT_SEQUENCE", "Content", "Editorial Folio",
     "two page fields + hinge valley + unequal opening", "mouth / shell / pillow"),
    ("design-torsion", "SINGLE_DESIGN_TORSION", "Design", "Forming Palette",
     "slab + closed side bite + lifted forming corner", "bowl / spoon / leaf"),
    ("event-convergence", "SINGLE_EVENT_CONVERGENCE", "Event", "Gathering Canopy",
     "offset apex + straight roof planes + eave flares", "volcano / mushroom / wing"),
    ("games-branch", "SINGLE_GAMES_BRANCH", "Games", "Decision Field",
     "entry stem + lateral route exits + scalloped edge", "controller / crown / leaf"),
    ("video-temporal", "SINGLE_VIDEO_TEMPORAL", "Video", "Frame Sweep",
     "tilted screen plate + temporal sweep edge", "car / capsule / airfoil"),
    ("digital-signal", "SINGLE_DIGITAL_SIGNAL", "Digital", "Routing Substrate",
     "blunt input + macro Y-fork + contour nodes", "fish / wing / PCB"),
    ("merch-wrap", "SINGLE_MERCH_WRAP", "Merch", "Wrapped Parcel",
     "blocky core + diagonal wrap overlap + unequal corners", "capsule / stone / case"),
]

TERMINALS = [
    ("master", "MASTER"),
    ("brand-wide", "BRAND_WIDE"),
    *[(item[0], item[1]) for item in SINGLES],
    ("complex-focus", "COMPLEX_FOCUS"),
    ("complex-gather", "COMPLEX_GATHER"),
    ("complex-drive", "COMPLEX_DRIVE"),
]

# Randomized presentation order for the unlabelled board (differs from the
# D-R2 order and from the manifest order).
LOCK_ORDER = [3, 6, 0, 5, 2, 4, 1]


def manifest_scores():
    manifest = json.loads(
        (EXPORTS / "ps03-4-d-r3-target-manifest.json").read_text(encoding="utf8")
    )
    result = {}
    for item in manifest["targets"]:
        if item["stable_name"].startswith("SINGLE_"):
            result[item["stable_name"]] = {
                "total": item["score_total"],
                "gate": item["gate_passed"],
            }
    return result


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
    image = Image.open(path)
    if image.mode == "RGBA":
        backdrop = Image.new("RGB", image.size, (255, 255, 255))
        backdrop.paste(image, mask=image.split()[3])
        image = backdrop
    else:
        image = image.convert("RGB")
    if mode == "cover":
        scale = max(size[0] / image.width, size[1] / image.height)
    else:
        scale = min(size[0] / image.width, size[1] / image.height)
    resized = image.resize(
        (max(1, int(image.width * scale)), max(1, int(image.height * scale))),
        Image.Resampling.LANCZOS,
    )
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


def unlabelled_board():
    canvas = Image.new("RGB", (2520, 2200), BG)
    draw = ImageDraw.Draw(canvas)
    label(draw, (70, 45), "PS-03.4R D-R3 — UNLABELLED LOCK BOARD", 38, True)
    label(draw, (70, 95),
          "Open this board before the answer key. Record your first impression for 01-07, then compare.",
          24, fill=MUTED)
    for position, source_index in enumerate(LOCK_ORDER):
        slug = SINGLES[source_index][0]
        row, col = divmod(position, 3)
        x, y = 55 + col * 815, 155 + row * 660
        draw.rounded_rectangle((x, y, x + 775, y + 620), 20, fill=CARD, outline=LINE, width=2)
        label(draw, (x + 28, y + 28), f"{position + 1:02d}", 28, True)
        place(canvas, PANELS / f"canonical_{slug}.png", (x + 18, y + 75, 470, 350), "cover")
        place(canvas, PANELS / f"control_{slug}_top.png", (x + 18, y + 440, 224, 168), "cover")
        place(canvas, PANELS / f"silhouette180_{slug}.png", (x + 510, y + 100, 180, 180))
        place(canvas, PANELS / f"silhouette96_{slug}.png", (x + 555, y + 335, 96, 96))
        label(draw, (x + 545, y + 462), "180 px", 18, fill=MUTED)
        label(draw, (x + 552, y + 500), "96 px", 18, fill=MUTED)
        label(draw, (x + 260, y + 585), "top view", 18, fill=MUTED)
    return save(canvas, "ps03-4_d-r3_unlabelled_lock_board.png")


def answer_key(scores):
    canvas = Image.new("RGB", (2260, 1220), BG)
    draw = ImageDraw.Draw(canvas)
    label(draw, (60, 40), "PS-03.4R D-R3 — ANSWER KEY / INTERNAL GATE", 38, True)
    headers = ["No.", "Target", "Competence", "Object field", "Primary cue", "Controlled risk", "Gate"]
    xs = [60, 145, 620, 850, 1150, 1650, 2040]
    for x, value in zip(xs, headers):
        label(draw, (x, 120), value, 20, True)
    y = 170
    for position, source_index in enumerate(LOCK_ORDER):
        slug, target, competence, association, cue, risk = SINGLES[source_index]
        score = scores[target]
        verdict = f"{'PASS' if score['gate'] else 'NOT LOCKED'} {score['total']}/100"
        draw.rectangle((45, y - 14, 2210, y + 112), fill=CARD if position % 2 == 0 else BG)
        values = [f"{position + 1:02d}", target, competence, association, cue, risk, verdict]
        for x, value in zip(xs, values):
            label(draw, (x, y), value, 17, bold=x in (60, 2040),
                  fill=(PASS_COLOR if score["gate"] else FAIL) if x == 2040 else INK)
        y += 135
    all_pass = all(scores[item[1]]["gate"] for item in SINGLES)
    label(
        draw, (60, 1150),
        "Internal verdict: all seven internal gates passed; awaiting the single final user confirmation."
        if all_pass
        else "Internal verdict: gate not met for at least one target; authoring continues.",
        23, True, fill=PASS_COLOR if all_pass else FAIL,
    )
    return save(canvas, "ps03-4_d-r3_answer_key_board.png")


def system_board():
    canvas = Image.new("RGB", (2400, 1800), BG)
    draw = ImageDraw.Draw(canvas)
    label(draw, (60, 40), "PS-03.4R — D-R3 TERMINAL SYSTEM", 38, True)
    for i, (slug, name) in enumerate(TERMINALS):
        row, col = divmod(i, 4)
        x, y = 45 + col * 590, 115 + row * 540
        draw.rounded_rectangle((x, y, x + 555, y + 500), 18, fill=CARD, outline=LINE)
        place(canvas, PANELS / f"canonical_{slug}.png", (x + 10, y + 45, 535, 400), "cover")
        label(draw, (x + 20, y + 18), name, 18, True)
    return save(canvas, "ps03-4_d-r3_system_board.png")


def make_mobile_images():
    outputs = {}
    for slug, name in TERMINALS:
        canvas = Image.new("RGB", (390, 844), (235, 233, 228))
        actor = Image.open(MOBILE_SRC / f"mobile_actor_{slug}.png").convert("RGBA")
        actor.thumbnail((520, 520), Image.Resampling.LANCZOS)
        canvas.paste(actor, ((390 - actor.width) // 2 + 42, 165), actor)
        draw = ImageDraw.Draw(canvas)
        label(draw, (22, 26), name, 17, True)
        label(draw, (22, 802), "390 x 844 baseline framing", 14, fill=MUTED)
        path = MOBILE / f"mobile_{slug}_390.png"
        canvas.save(path)
        outputs[slug] = path
    return outputs


def mobile_board(mobile):
    canvas = Image.new("RGB", (1660, 2700), BG)
    draw = ImageDraw.Draw(canvas)
    label(draw, (60, 35), "PS-03.4R — D-R3 MOBILE 390 x 844 / 12 TERMINALS", 34, True)
    for i, (slug, name) in enumerate(TERMINALS):
        row, col = divmod(i, 4)
        x, y = 30 + col * 405, 105 + row * 860
        place(canvas, mobile[slug], (x, y, 390, 844), "cover")
    return save(canvas, "ps03-4_d-r3_mobile_390_board.png")


def association_board(mobile, scores):
    canvas = Image.new("RGB", (3600, 4300), BG)
    draw = ImageDraw.Draw(canvas)
    label(draw, (60, 35), "PS-03.4R — D-R3 ASSOCIATION / RISK-CONTROL VIEWS", 38, True)
    headers = ["canonical", "opposite", "front", "side", "top", "180", "96", "mobile"]
    for col, head in enumerate(headers):
        label(draw, (520 + col * 380, 100), head, 20, True, anchor="mm")
    for row, (slug, target, competence, association, cue, risk) in enumerate(SINGLES):
        score = scores[target]
        y = 155 + row * 580
        verdict = f"{score['total']}/100 {'PASS' if score['gate'] else 'NOT LOCKED'}"
        label(draw, (45, y + 25), f"{competence}\n{association}\n{verdict}", 19, True,
              fill=PASS_COLOR if score["gate"] else FAIL)
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
    return save(canvas, "ps03-4_d-r3_association_views_board.png")


def mask_board(technical):
    canvas = Image.new("RGB", (2400, 1800), BG)
    draw = ImageDraw.Draw(canvas)
    label(draw, (60, 35), "PS-03.4R — D-R3 FIXED PHOTONIC MASK / 2,526 FACES", 36, True)
    endpoints = technical["endpoint_validation"]
    for i, (slug, name) in enumerate(TERMINALS):
        row, col = divmod(i, 4)
        x, y = 45 + col * 590, 105 + row * 540
        place(canvas, PANELS / f"mask_{slug}.png", (x, y + 40, 555, 410), "cover")
        ratio = endpoints[name]["metrics"]["active_surface_ratio"] * 100
        label(draw, (x + 12, y + 16), f"{name} — {ratio:.2f}%", 17, True)
    return save(canvas, "ps03-4_d-r3_photonic_mask_board.png")


def transition_board():
    sequences = [
        "master-content", "content-digital", "content-games", "design-merch",
        "games-event", "video-complex-drive", "retarget-content-design-event",
        "transition-tension",
    ]
    canvas = Image.new("RGB", (2200, 2500), BG)
    draw = ImageDraw.Draw(canvas)
    label(draw, (60, 35), "PS-03.4R — D-R3 TRANSITION STORYBOARDS", 36, True)
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
    return save(canvas, "ps03-4_d-r3_transition_board.png")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    technical = json.loads(
        (EXPORTS / "ps03-4-d-r3-technical-validation.json").read_text(encoding="utf8")
    )
    scores = manifest_scores()
    mobile = make_mobile_images()
    outputs = [
        unlabelled_board(),
        answer_key(scores),
        system_board(),
        association_board(mobile, scores),
        mobile_board(mobile),
        mask_board(technical),
        transition_board(),
    ]
    metadata = {
        "stage": "PS-03.4R",
        "system": "D-R3 only",
        "source_policy": "all actor imagery is Blender-rendered; PIL is used only for deterministic layout, labels and crop composition",
        "unlabelled_order_random": LOCK_ORDER,
        "visual_gate": "PASS (internal)" if all(s["gate"] for s in scores.values()) else "NOT LOCKED",
        "outputs": {
            str(path.relative_to(STAGE)).replace("\\", "/"): sha256(path)
            for path in outputs
        },
        "mobile_viewport": [390, 844],
        "passed": True,
    }
    (EXPORTS / "ps03-4-d-r3-composition-metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf8"
    )
    print("PS034_DR3_COMPOSE_DONE", len(outputs))


if __name__ == "__main__":
    main()
