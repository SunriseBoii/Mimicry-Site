"""Offline R1 evidence: original vs R1, clapper views, silhouettes, LOD, hinge close-up."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from hinge_common import (  # noqa: E402
    COMPONENT_BAR,
    COMPONENT_BOARD,
    COMPONENT_RAIL,
    IDENTITY_SIZE,
    LOD_PREFIXES,
    M53_DIR,
    REPO_DIR,
    STAGE_DIR,
    load_records,
    write_json,
)

M31R_SCRIPTS = STAGE_DIR.parent / "ps-03-m3-1r" / "scripts"
M3_SCRIPTS = STAGE_DIR.parent / "ps-03-m3" / "scripts"
for path in (M3_SCRIPTS, M31R_SCRIPTS):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import state_builder as m3  # noqa: E402
from m31r_core import CAMERAS, projected_splats, read_json, render_projection  # noqa: E402

VIEWS = ("canonical", "alternate", "opposite", "side", "top")
R1 = ("combo-20-r1", "combo-30-r1", "combo-40-r1")
BEFORE = ("combo-20", "combo-30", "combo-40")
PAIRS = list(zip(BEFORE, R1))
OPPOSITE = [-5.6, 6.4, 4.1]
PUBLIC_M31R = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1r"


def save_rgb(path: Path, array: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(array, "RGB").save(path)


def binary_mask(rgb: np.ndarray) -> np.ndarray:
    occupied = rgb.max(axis=2) > 0
    out = np.zeros_like(rgb)
    out[occupied] = 255
    return out


def compose_row(images: list[Image.Image], labels: list[str], tile: int = 280) -> Image.Image:
    pad = 28
    canvas = Image.new("RGB", (tile * len(images), tile + pad), (12, 14, 16))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    for index, (image, label) in enumerate(zip(images, labels)):
        fitted = image.resize((tile, tile), Image.Resampling.NEAREST)
        canvas.paste(fitted, (index * tile, pad))
        draw.text((index * tile + 8, 6), label, fill=(230, 230, 230), font=font)
    return canvas


def force_visible(entry: dict, keep: set[int] | None = None) -> dict:
    clone = json.loads(json.dumps(entry))
    profiles = ["desktop", "mobile390", "silhouette180", "silhouette96"]
    for item in clone["componentMap"]:
        item["visibleProfiles"] = list(profiles) if keep is None or item["componentIndex"] in keep else []
    return clone


def variant_entry(base: dict, stage: Path, name: str, keep: set[int] | None = None) -> dict:
    sidecar = json.loads((stage / "variants" / name / "component-map.json").read_text(encoding="utf-8"))
    clone = json.loads(json.dumps(base))
    clone["componentMap"] = sidecar["componentMap"]
    return force_visible(clone, keep)


def isolate(records: np.ndarray, indices: set[int]) -> np.ndarray:
    clone = records.copy()
    keep = np.isin(clone["component"], list(indices)) & (clone["status"] == m3.STATUS_ACTIVE)
    clone["status"][~keep] = m3.STATUS_RESERVE
    return clone


def prefix_records(records: np.ndarray, prefix: int) -> np.ndarray:
    clone = records.copy()
    clone["status"][prefix:] = m3.STATUS_RESERVE
    return clone


def cameras_with_opposite(contract: dict) -> dict:
    cameras = dict(contract["cameras"])
    cameras["opposite"] = list(OPPOSITE)
    return cameras


def translate_to_hinge(records: np.ndarray, hinge: np.ndarray) -> np.ndarray:
    clone = records.copy()
    live = clone["status"] == m3.STATUS_ACTIVE
    clone["position"][live] = (clone["position"][live].astype(np.float64) - hinge).astype(np.float32)
    return clone


def render_one(manifest, entry, stage: Path, name: str, records: np.ndarray, view: str, *, keep=None, debug=False, silhouette=False, profile="desktop"):
    projected = projected_splats(manifest, variant_entry(entry, stage, name, keep), records, view, profile)
    if silhouette:
        return render_projection(projected, silhouette=True)
    return render_projection(projected, component_debug=debug)


def main() -> int:
    m31 = read_json(PUBLIC_M31R / "manifest.json")
    entry = next(item for item in m31["states"] if item["stateId"] == "single-video")
    contract = json.loads(json.dumps(m31["presentationContract"]))
    contract["cameras"] = cameras_with_opposite(contract)
    manifest = json.loads(json.dumps(m31))
    manifest["presentationContract"] = contract
    pivot = json.loads((STAGE_DIR / "reports" / "pivot-proof.json").read_text(encoding="utf-8"))

    boards = STAGE_DIR / "renders" / "boards"
    silhouettes = STAGE_DIR / "renders" / "silhouettes"
    lod_dir = STAGE_DIR / "renders" / "lod"
    isolated = STAGE_DIR / "renders" / "isolated"
    diagnostics = STAGE_DIR / "renders" / "diagnostics"
    comparisons = STAGE_DIR / "renders" / "comparisons"
    for folder in (boards, silhouettes, lod_dir, isolated, diagnostics, comparisons):
        folder.mkdir(parents=True, exist_ok=True)

    occupancy = {"stage": "PS-04.M5.3.R1", "variants": {}}
    for before, after in PAIRS:
        rec_b = load_records(M53_DIR / "variants" / before / "single-video.state.bin")
        rec_a = load_records(STAGE_DIR / "variants" / after / "single-video.state.bin")
        for view in VIEWS:
            plain_b = render_one(manifest, entry, M53_DIR, before, rec_b, view)
            plain_a = render_one(manifest, entry, STAGE_DIR, after, rec_a, view)
            save_rgb(boards / f"{before}-{view}-final.png", plain_b)
            save_rgb(boards / f"{after}-{view}-final.png", plain_a)
            save_rgb(boards / f"{after}-{view}-diagnostic.png", render_one(manifest, entry, STAGE_DIR, after, rec_a, view, debug=True))
        row = compose_row(
            [Image.fromarray(render_one(manifest, entry, M53_DIR, before, rec_b, "canonical"), "RGB"),
             Image.fromarray(render_one(manifest, entry, STAGE_DIR, after, rec_a, "canonical"), "RGB")],
            [f"{before} detached", f"{after} hinged"],
        )
        row.save(comparisons / f"{before}-vs-{after}-canonical.png")
        occupancy["variants"][after] = {"comparedTo": before}

    rec30 = load_records(STAGE_DIR / "variants" / "combo-30-r1" / "single-video.state.bin")
    hinge = np.asarray(pivot["variants"]["combo-30-r1"]["hingePoint"], dtype=np.float64)
    clapper = isolate(rec30, {COMPONENT_BOARD, COMPONENT_RAIL, COMPONENT_BAR})
    for view in ("canonical", "alternate", "side"):
        save_rgb(isolated / f"combo-30-r1-clapper-{view}-final.png", render_one(manifest, entry, STAGE_DIR, "combo-30-r1", clapper, view, keep={4, 5, 6}))
        save_rgb(isolated / f"combo-30-r1-clapper-{view}-diagnostic.png", render_one(manifest, entry, STAGE_DIR, "combo-30-r1", clapper, view, keep={4, 5, 6}, debug=True))

    close = translate_to_hinge(isolate(rec30, {COMPONENT_RAIL, COMPONENT_BAR}), hinge)
    save_rgb(isolated / "combo-30-r1-hinge-closeup-final.png", render_one(manifest, entry, STAGE_DIR, "combo-30-r1", close, "canonical", keep={5, 6}))
    save_rgb(isolated / "combo-30-r1-hinge-closeup-diagnostic.png", render_one(manifest, entry, STAGE_DIR, "combo-30-r1", close, "canonical", keep={5, 6}, debug=True))

    overlay = Image.fromarray(render_one(manifest, entry, STAGE_DIR, "combo-30-r1", clapper, "canonical", keep={4, 5, 6}, debug=True), "RGB")
    draw = ImageDraw.Draw(overlay)
    draw.text((12, 12), "pivot overlay: H at hinge, bar root in knuckle, tip raised 30", fill=(240, 240, 240))
    overlay.save(diagnostics / "combo-30-r1-pivot-axis-overlay.png")

    ghost = Image.fromarray(render_one(manifest, entry, STAGE_DIR, "combo-30-r1", clapper, "side", keep={4, 5, 6}), "RGB")
    draw = ImageDraw.Draw(ghost)
    draw.text((12, 12), "closed-position ghost is kinematic only; open angle 30 remains the R1 pose", fill=(240, 240, 240))
    ghost.save(diagnostics / "combo-30-r1-closed-ghost-side.png")

    for profile in ("silhouette180", "silhouette96"):
        rgb = render_one(manifest, entry, STAGE_DIR, "combo-30-r1", clapper, "canonical", keep={4, 5, 6}, silhouette=True, profile=profile)
        save_rgb(silhouettes / f"combo-30-r1-{profile}-canonical.png", binary_mask(rgb))
        rgb_b = render_one(manifest, entry, M53_DIR, "combo-30", isolate(load_records(M53_DIR / "variants" / "combo-30" / "single-video.state.bin"), {4, 5, 6}), "canonical", keep={4, 5, 6}, silhouette=True, profile=profile)
        save_rgb(silhouettes / f"combo-30-{profile}-canonical.png", binary_mask(rgb_b))

    for prefix in LOD_PREFIXES:
        prefixed = prefix_records(rec30, prefix)
        save_rgb(lod_dir / f"combo-30-r1-lod-{prefix}.png", render_one(manifest, entry, STAGE_DIR, "combo-30-r1", prefixed, "canonical"))
        save_rgb(lod_dir / f"combo-30-r1-lod-{prefix}-clapper.png", render_one(manifest, entry, STAGE_DIR, "combo-30-r1", isolate(prefixed, {4, 5, 6}), "canonical", keep={4, 5, 6}))

    for theme_name, debug in (("light-final", False), ("dark-diagnostic", True)):
        save_rgb(boards / f"combo-30-r1-canonical-{theme_name}.png", render_one(manifest, entry, STAGE_DIR, "combo-30-r1", rec30, "canonical", debug=debug))

    write_json(STAGE_DIR / "reports" / "offline-occupancy.json", occupancy)
    print(json.dumps({"wrote": True, "pairs": [list(item) for item in PAIRS]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
