"""Compose PS-03.3 review boards exclusively from real Blender renders."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


SCRIPT = Path(__file__).resolve()
STAGE = SCRIPT.parent.parent
REPO = STAGE.parents[2]
RENDERS = STAGE / "renders"
PANELS = RENDERS / "_panels"
PROTOTYPES = RENDERS / "prototypes"
MOBILE_SOURCES = RENDERS / "_mobile_sources"
MOBILE = RENDERS / "mobile"
EXPORTS = STAGE / "exports"
PS032_PANELS = REPO / "design" / "photonic-skin" / "ps-03-2" / "renders" / "_panels"
MOBILE.mkdir(parents=True, exist_ok=True)

BG = "#E7E3DA"
CARD = "#F3F0E9"
INK = "#17191B"
MUTED = "#66645F"
LINE = "#CBC6BA"
FONT = Path("C:/Windows/Fonts/arial.ttf")
BOLD = Path("C:/Windows/Fonts/arialbd.ttf")

TERMINALS = [
    "MASTER", "BRAND_WIDE", "SINGLE_CONTENT_SEQUENCE", "SINGLE_DESIGN_TORSION",
    "SINGLE_EVENT_CONVERGENCE", "SINGLE_GAMES_BRANCH", "SINGLE_VIDEO_TEMPORAL",
    "SINGLE_DIGITAL_SIGNAL", "SINGLE_MERCH_WRAP", "COMPLEX_FOCUS",
    "COMPLEX_GATHER", "COMPLEX_DRIVE",
]
SINGLES = TERMINALS[2:9]
META = {
    "SINGLE_CONTENT_SEQUENCE": ("Editorial Folio", "two connected page fields + central fold", "pillow / shell / literal book"),
    "SINGLE_DESIGN_TORSION": ("Forming Palette", "wide asymmetric forming plane + counter-torsion", "drapery / shell / accessory"),
    "SINGLE_EVENT_CONVERGENCE": ("Gathering Canopy", "broad base + planes meeting at one crest", "flower / volcano / portal"),
    "SINGLE_GAMES_BRANCH": ("Decision Field", "three broad routes + two asymmetric zones", "controller / crown / PCB"),
    "SINGLE_VIDEO_TEMPORAL": ("Frame Sweep", "soft frame field + leading/trailing thirds", "eye / car body / camera"),
    "SINGLE_DIGITAL_SIGNAL": ("Routing Substrate", "three converging routes + two large nodes", "micro-detail PCB / alien hardware"),
    "SINGLE_MERCH_WRAP": ("Wrapped Parcel", "compact enclosed core + diagonal overlap", "box / capsule / coffin"),
}


def slug(name: str) -> str:
    return name.lower().replace("single_", "").replace("complex_", "complex-").replace("_", "-")


def font(size: int, bold: bool = False):
    return ImageFont.truetype(str(BOLD if bold else FONT), size)


def text(draw, xy, value, size=24, bold=False, fill=INK, anchor=None):
    draw.text(xy, value, font=font(size, bold), fill=fill, anchor=anchor)


def fit(path: Path, size: tuple[int, int], contain=True) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    method = Image.Resampling.LANCZOS
    if contain:
        image.thumbnail(size, method)
        canvas = Image.new("RGBA", size, CARD)
        canvas.alpha_composite(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
        return canvas
    return ImageOps.fit(image, size, method=method, centering=(0.5, 0.5))


def card(canvas, path: Path, box, label=None, contain=True):
    x, y, w, h = box
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((x, y, x + w, y + h), 18, fill=CARD, outline=LINE, width=2)
    inset = 10
    image_h = h - (48 if label else 20)
    image = fit(path, (w - inset * 2, image_h - inset), contain)
    canvas.alpha_composite(image, (x + inset, y + inset))
    if label:
        text(draw, (x + 18, y + h - 26), label, 20, True, anchor="lm")


def save(image: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path, "PNG", optimize=True)


def sha256(path: Path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_mobile():
    outputs = []
    for name in TERMINALS:
        state_slug = slug(name)
        canvas = Image.new("RGBA", (390, 844), BG)
        draw = ImageDraw.Draw(canvas)
        text(draw, (24, 28), "MIMICRY / PHOTONIC SKIN", 14, True, MUTED)
        text(draw, (24, 64), name.replace("SINGLE_", "").replace("COMPLEX_", "").replace("_", " "), 25, True)
        if name in META:
            text(draw, (24, 100), META[name][0], 18, False, MUTED)
        actor = Image.open(MOBILE_SOURCES / f"mobile_actor_{state_slug}.png").convert("RGBA")
        actor.thumbnail((430, 430), Image.Resampling.LANCZOS)
        canvas.alpha_composite(actor, ((390 - actor.width) // 2, 215))
        draw.line((24, 722, 366, 722), fill=LINE, width=2)
        text(draw, (24, 754), "390 × 844 canonical crop", 15, False, MUTED)
        text(draw, (24, 790), "same actor / same topology / neutral ivory", 14, False, MUTED)
        path = MOBILE / f"mobile_{state_slug}_390.png"
        save(canvas, path)
        outputs.append(path)
    board = Image.new("RGBA", (1680, 2760), BG)
    draw = ImageDraw.Draw(board)
    text(draw, (60, 46), "PS-03.3 / MOBILE 390 × 844 / 12 TERMINAL STATES", 36, True)
    for index, path in enumerate(outputs):
        image = Image.open(path).convert("RGBA").resize((312, 675), Image.Resampling.LANCZOS)
        x = 48 + (index % 4) * 408
        y = 120 + (index // 4) * 840
        board.alpha_composite(image, (x, y))
        text(draw, (x, y + 705), TERMINALS[index], 16, True)
    out = RENDERS / "ps03-3_mobile_390_board.png"
    save(board, out)
    return outputs + [out]


def make_ad_board():
    canvas = Image.new("RGBA", (1660, 2880), BG)
    draw = ImageDraw.Draw(canvas)
    text(draw, (60, 42), "PS-03.2 ABSTRACT → PS-03.3 ASSOCIATIVE", 42, True)
    text(draw, (432, 105), "A / PS-03.2", 24, True, MUTED, "mm")
    text(draw, (1228, 105), "D / PS-03.3", 24, True, MUTED, "mm")
    for index, name in enumerate(SINGLES):
        y = 150 + index * 385
        state_slug = slug(name)
        card(canvas, PANELS / f"comparison_ps032_{state_slug}.png", (60, y, 750, 330), "abstract baseline")
        card(canvas, PANELS / f"canonical_{state_slug}.png", (850, y, 750, 330), META[name][0])
        text(draw, (70, y + 355), name, 18, True)
    path = RENDERS / "ps03-3_a-d_comparison_board.png"
    save(canvas, path)
    return path


def make_full_system():
    canvas = Image.new("RGBA", (1780, 1420), BG)
    draw = ImageDraw.Draw(canvas)
    text(draw, (60, 42), "PS-03.3 / CONTROLLED ASSOCIATIVE HIERARCHY", 40, True)
    for index, name in enumerate(TERMINALS):
        x = 50 + (index % 4) * 430
        y = 120 + (index // 4) * 420
        label = META[name][0] if name in META else name.replace("_", " ")
        card(canvas, PANELS / f"canonical_{slug(name)}.png", (x, y, 400, 340), label)
    path = RENDERS / "ps03-3_full_system_board.png"
    save(canvas, path)
    return path


def make_readability_boards():
    outputs = []
    for name in SINGLES:
        state_slug = slug(name)
        association, desired, risk = META[name]
        canvas = Image.new("RGBA", (1840, 1320), BG)
        draw = ImageDraw.Draw(canvas)
        text(draw, (60, 38), f"{name} / {association}", 38, True)
        text(draw, (60, 88), f"DESIRED: {desired}", 19, True, MUTED)
        text(draw, (60, 118), f"RISK CONTROL: {risk}", 19, False, MUTED)
        views = [
            ("canonical 3/4", PANELS / f"canonical_{state_slug}.png"),
            ("opposite 3/4", PANELS / f"control_{state_slug}_opposite.png"),
            ("top", PANELS / f"control_{state_slug}_top.png"),
            ("side risk-control", PANELS / f"control_{state_slug}_side.png"),
        ]
        for index, (label, path) in enumerate(views):
            card(canvas, path, (50 + index * 445, 165, 410, 350), label)
        card(canvas, PANELS / f"silhouette180_{state_slug}.png", (50, 570, 320, 320), "black silhouette / 180 px")
        card(canvas, PANELS / f"silhouette96_{state_slug}.png", (410, 570, 320, 320), "black silhouette / 96 px")
        card(canvas, MOBILE / f"mobile_{state_slug}_390.png", (770, 570, 390, 700), "mobile / 390 × 844")
        card(canvas, PANELS / f"mask_{state_slug}.png", (1200, 570, 580, 440), "fixed photonic mask / 2 526 faces")
        text(draw, (1220, 1055), "Neutral ivory only. No competence colour, shader coding or caption is used inside the actor image.", 18, False, MUTED)
        path = RENDERS / f"ps03-3_object_readability_{state_slug}.png"
        save(canvas, path)
        outputs.append(path)
    return outputs


def make_prototype_board():
    states = ["SINGLE_DESIGN_TORSION", "SINGLE_GAMES_BRANCH", "SINGLE_VIDEO_TEMPORAL", "SINGLE_MERCH_WRAP", "COMPLEX_GATHER"]
    canvas = Image.new("RGBA", (2050, 2050), BG)
    draw = ImageDraw.Draw(canvas)
    text(draw, (60, 40), "HIGH-RISK REFINEMENT / PS-03.2 → v1 → v2 → FINAL", 40, True)
    headers = ["PS-03.2 abstract", "v1", "v2", "final D"]
    for index, label in enumerate(headers): text(draw, (290 + index * 500, 105), label, 22, True, MUTED, "mm")
    for row, name in enumerate(states):
        y = 140 + row * 375
        state_slug = slug(name)
        paths = [
            PS032_PANELS / f"canonical_{state_slug}.png",
            PROTOTYPES / f"v1_{state_slug}.png",
            PROTOTYPES / f"v2_{state_slug}.png",
            PROTOTYPES / f"final_{state_slug}.png",
        ]
        for column, path in enumerate(paths): card(canvas, path, (50 + column * 500, y, 470, 320))
        text(draw, (60, y + 340), name, 18, True)
    path = RENDERS / "ps03-3_high-risk_refinement_board.png"
    save(canvas, path)
    return path


def make_mask_board(technical):
    canvas = Image.new("RGBA", (1780, 1420), BG)
    draw = ImageDraw.Draw(canvas)
    text(draw, (60, 42), "FIXED PHOTONIC MASK / 2 526 FACES / ALL TERMINALS", 38, True)
    for index, name in enumerate(TERMINALS):
        x = 50 + (index % 4) * 430
        y = 120 + (index // 4) * 420
        ratio = technical["endpoint_validation"][name]["metrics"]["active_surface_ratio"] * 100
        card(canvas, PANELS / f"mask_{slug(name)}.png", (x, y, 400, 340), f"{name} / {ratio:.2f}%")
    path = RENDERS / "ps03-3_photonic_mask_board.png"
    save(canvas, path)
    return path


def make_storyboards():
    sequences = ["master-content", "content-digital", "design-merch", "games-event", "video-complex-drive", "retarget-content-design-event", "transition-tension"]
    outputs = []
    for sequence in sequences:
        canvas = Image.new("RGBA", (1890, 500), BG)
        draw = ImageDraw.Draw(canvas)
        text(draw, (45, 28), sequence.upper().replace("-", " → "), 27, True)
        prefix = "transition-transition-tension" if sequence == "transition-tension" else f"transition_{sequence}"
        for frame in range(5):
            card(canvas, PANELS / f"{prefix}_{frame}.png", (30 + frame * 372, 82, 350, 350), f"t = {frame / 4:.2f}")
        path = RENDERS / f"ps03-3_transition_{sequence}_storyboard.png"
        save(canvas, path)
        outputs.append(path)
    board = Image.new("RGBA", (1890, 3570), BG)
    draw = ImageDraw.Draw(board)
    text(draw, (50, 30), "PS-03.3 / DIRECT MORPH + RETARGET + ADDITIVE STORYBOARDS", 34, True)
    for index, path in enumerate(outputs):
        board.alpha_composite(Image.open(path).convert("RGBA"), (0, 80 + index * 495))
    out = RENDERS / "ps03-3_transition_board.png"
    save(board, out)
    return outputs + [out]


def silhouette_mask(path: Path):
    image = Image.open(path).convert("L").resize((256, 192), Image.Resampling.LANCZOS)
    return [value < 80 for value in image.getdata()]


def iou(left, right):
    intersection = sum(a and b for a, b in zip(left, right))
    union = sum(a or b for a, b in zip(left, right))
    return intersection / union if union else 1.0


def main():
    technical = json.loads((EXPORTS / "ps03-3-technical-validation.json").read_text(encoding="utf8"))
    outputs = []
    outputs.extend(make_mobile())
    outputs.append(make_ad_board())
    outputs.append(make_full_system())
    outputs.extend(make_readability_boards())
    outputs.append(make_prototype_board())
    outputs.append(make_mask_board(technical))
    outputs.extend(make_storyboards())

    ad_metrics = {}
    new_masks = {}
    for name in SINGLES:
        state_slug = slug(name)
        old = silhouette_mask(PS032_PANELS / f"silhouette_{state_slug}.png")
        new = silhouette_mask(PANELS / f"silhouette_{state_slug}.png")
        overlap = iou(old, new)
        ad_metrics[name] = {"silhouette_iou": round(overlap, 6), "silhouette_distance": round(1 - overlap, 6)}
        new_masks[name] = new
    pairwise = {}
    for index, left in enumerate(SINGLES):
        for right in SINGLES[index + 1:]:
            overlap = iou(new_masks[left], new_masks[right])
            pairwise[f"{left}__{right}"] = {"iou": round(overlap, 6), "distance": round(1 - overlap, 6)}

    metadata = {
        "stage": "PS-03.3", "system": "D / Controlled Associative Hierarchy",
        "source_policy": "all actor images are Blender renders; PIL is used only for layout, labels and crop composition",
        "camera_material_contract": "same 55 mm camera, canonical roll, neutral ivory, lights and exposure for A/D",
        "mobile_viewport": [390, 844], "fixed_mask_face_count": 2526,
        "a_d_silhouette_metrics": ad_metrics, "new_single_pairwise_silhouette_metrics": pairwise,
        "content_digital": pairwise["SINGLE_CONTENT_SEQUENCE__SINGLE_DIGITAL_SIGNAL"],
        "outputs": [{"file": str(path.relative_to(STAGE)).replace('\\', '/'), "sha256": sha256(path), "size_bytes": path.stat().st_size} for path in outputs],
        "passed": all(path.exists() and path.stat().st_size > 0 for path in outputs),
    }
    path = EXPORTS / "ps03-3-composition-metadata.json"
    path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf8")
    print("PS033_COMPOSE", {"passed": metadata["passed"], "boards": len(outputs), "content_digital_distance": metadata["content_digital"]["distance"]})


if __name__ == "__main__":
    main()
