"""Offline A vs A-R1 boards, silhouettes, and LOD prefixes for PS-04.M5.2.R1."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
M52_DIR = STAGE_DIR.parent / "ps-04-m5-2"
PHOTONIC_DIR = STAGE_DIR.parent
REPO_DIR = PHOTONIC_DIR.parents[1]
M31R_SCRIPTS = PHOTONIC_DIR / "ps-03-m3-1r" / "scripts"
M3_SCRIPTS = PHOTONIC_DIR / "ps-03-m3" / "scripts"
PUBLIC_M31R = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1r"

for path in (M3_SCRIPTS, M31R_SCRIPTS):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import state_builder as m3  # noqa: E402
from m31r_core import CAMERAS, projected_splats, read_json, render_projection  # noqa: E402

VIEWS = ("canonical", "alternate", "opposite", "side", "top")
LOD_PREFIXES = (512, 1024, 2048, 4096, 8192, 12288, 16384)
OPPOSITE = [-5.6, 6.4, 4.1]
COMPONENT_RIGHT = 4


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def save_rgb(path: Path, array: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(array, "RGB").save(path)


def force_visible(entry: dict) -> dict:
    clone = json.loads(json.dumps(entry))
    profiles = ["desktop", "mobile390", "silhouette180", "silhouette96"]
    for item in clone["componentMap"]:
        item["visibleProfiles"] = list(profiles)
    return clone


def cameras_with_opposite(contract: dict) -> dict:
    cameras = dict(contract["cameras"])
    cameras["opposite"] = list(OPPOSITE)
    return cameras


def load_records(kind: str) -> np.ndarray:
    if kind == "a":
        return np.fromfile(M52_DIR / "variants" / "a" / "single-event.state.bin", dtype=m3.STATE_DTYPE)
    return np.fromfile(STAGE_DIR / "variants" / "a-r1" / "single-event.state.bin", dtype=m3.STATE_DTYPE)


def isolate_right(records: np.ndarray) -> np.ndarray:
    clone = records.copy()
    keep = (clone["component"] == COMPONENT_RIGHT) & (clone["status"] == m3.STATUS_ACTIVE)
    clone["status"][~keep] = m3.STATUS_RESERVE
    return clone


def prefix_records(records: np.ndarray, prefix: int) -> np.ndarray:
    clone = records.copy()
    clone["status"][prefix:] = m3.STATUS_RESERVE
    return clone


def compose_row(images: list[Image.Image], labels: list[str], tile: int = 256) -> Image.Image:
    pad = 28
    canvas = Image.new("RGB", (tile * len(images), tile + pad), (12, 14, 16))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    for index, (image, label) in enumerate(zip(images, labels)):
        fitted = image.resize((tile, tile), Image.Resampling.NEAREST)
        canvas.paste(fitted, (index * tile, pad))
        draw.text((index * tile + 8, 6), label, fill=(230, 230, 230), font=font)
    return canvas


def binary_mask(rgb: np.ndarray) -> np.ndarray:
    occupied = rgb.max(axis=2) > 0
    out = np.zeros_like(rgb)
    out[occupied] = 255
    return out


def occupancy(rgb: np.ndarray) -> int:
    return int((rgb.max(axis=2) > 0).sum())


def main() -> int:
    manifest = read_json(PUBLIC_M31R / "manifest.json")
    entry = force_visible(next(item for item in manifest["states"] if item["stateId"] == "single-event"))
    contract = json.loads(json.dumps(manifest["presentationContract"]))
    contract["cameras"] = cameras_with_opposite(contract)
    manifest_view = json.loads(json.dumps(manifest))
    manifest_view["presentationContract"] = contract

    boards = STAGE_DIR / "renders" / "boards"
    silhouettes = STAGE_DIR / "renders" / "silhouettes"
    lod_dir = STAGE_DIR / "renders" / "lod"
    boards.mkdir(parents=True, exist_ok=True)
    silhouettes.mkdir(parents=True, exist_ok=True)
    lod_dir.mkdir(parents=True, exist_ok=True)

    records = {"a": load_records("a"), "a-r1": load_records("a-r1")}
    lod_report = {"stage": "PS-04.M5.2.R1", "prefixes": list(LOD_PREFIXES), "variants": {}}
    files: list[str] = []

    for name, current in records.items():
        for view in VIEWS:
            projected = projected_splats(manifest_view, entry, current, view, "desktop")
            plain = render_projection(projected, component_debug=False)
            labelled = render_projection(projected, component_debug=True)
            save_rgb(boards / f"{name}-{view}-unlabelled.png", plain)
            save_rgb(boards / f"{name}-{view}-labelled.png", labelled)
            files.append(f"{name}-{view}")
        for profile, dest_name in (("silhouette180", f"{name}-silhouette180-canonical.png"), ("silhouette96", f"{name}-silhouette96-canonical.png")):
            projected = projected_splats(manifest_view, entry, current, "canonical", profile)
            mask = binary_mask(render_projection(projected, silhouette=True))
            save_rgb(silhouettes / dest_name, mask)
        isolated = isolate_right(current)
        for profile, dest_name in (("silhouette180", f"{name}-isolated-right-180.png"), ("silhouette96", f"{name}-isolated-right-96.png")):
            projected = projected_splats(manifest_view, entry, isolated, "canonical", profile)
            mask = binary_mask(render_projection(projected, silhouette=True))
            save_rgb(silhouettes / dest_name, mask)

    a_plain = Image.open(boards / "a-canonical-unlabelled.png")
    r1_plain = Image.open(boards / "a-r1-canonical-unlabelled.png")
    compose_row([a_plain, r1_plain], ["EVENT_A", "EVENT_A_R1"]).save(boards / "a-vs-ar1-canonical.png")
    a_iso = Image.open(silhouettes / "a-isolated-right-180.png")
    r1_iso = Image.open(silhouettes / "a-r1-isolated-right-180.png")
    compose_row([a_iso, r1_iso], ["A right", "A-R1 right"], tile=180).save(boards / "a-vs-ar1-isolated-right.png")
    compose_row(
        [Image.open(silhouettes / "a-r1-silhouette180-canonical.png"), Image.open(silhouettes / "a-silhouette180-canonical.png")],
        ["A-R1 180", "A 180"],
        tile=180,
    ).save(boards / "full-event-silhouette-180.png")
    compose_row(
        [Image.open(silhouettes / "a-r1-silhouette96-canonical.png"), Image.open(silhouettes / "a-silhouette96-canonical.png")],
        ["A-R1 96", "A 96"],
        tile=96,
    ).save(boards / "full-event-silhouette-96.png")

    lod_images = []
    presence = {}
    r1 = records["a-r1"]
    for prefix in LOD_PREFIXES:
        projected = projected_splats(manifest_view, entry, prefix_records(r1, prefix), "canonical", "desktop")
        rgb = render_projection(projected, component_debug=True)
        path = lod_dir / f"a-r1-lod-{prefix}.png"
        save_rgb(path, rgb)
        lod_images.append(Image.fromarray(rgb, "RGB"))
        live = r1["status"][:prefix] == m3.STATUS_ACTIVE
        presence[str(prefix)] = int(np.count_nonzero(live & (r1["component"][:prefix] == COMPONENT_RIGHT)))
    compose_row(lod_images, [str(prefix) for prefix in LOD_PREFIXES], tile=160).save(boards / "a-r1-all-lod-prefixes.png")
    lod_report["variants"]["a-r1"] = {"figureRight": presence, "pass": presence == {str(k): v for k, v in ((512, 42), (1024, 78), (2048, 155), (4096, 325), (8192, 566), (12288, 809), (16384, 890))}}
    write_json(STAGE_DIR / "reports" / "lod-validation.json", lod_report)
    print(json.dumps({"boards": str(boards.relative_to(REPO_DIR)).replace("\\", "/"), "lod": presence}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
