"""Offline Video-candidate boards, silhouettes, LOD, and isolated anatomy."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
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
VARIANTS = ("baseline", "combo-20", "combo-30", "combo-40", "camera-20", "camera-30", "camera-40")
COMBO = ("combo-20", "combo-30", "combo-40")
CAMERA = ("camera-20", "camera-30", "camera-40")
LOD_PREFIXES = (512, 1024, 2048, 4096, 8192, 12288, 16384)
OPPOSITE = [-5.6, 6.4, 4.1]
LABELS = {
    "baseline": "BASELINE",
    "combo-20": "COMBO 20",
    "combo-30": "COMBO 30",
    "combo-40": "COMBO 40",
    "camera-20": "CAM 20",
    "camera-30": "CAM 30",
    "camera-40": "CAM 40",
}


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def save_rgb(path: Path, array: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(array, "RGB").save(path)


def binary_mask(rgb: np.ndarray) -> np.ndarray:
    occupied = rgb.max(axis=2) > 0
    out = np.zeros_like(rgb)
    out[occupied] = 255
    return out


def occupancy(rgb: np.ndarray) -> int:
    return int((rgb.max(axis=2) > 0).sum())


def force_visible(entry: dict, keep: set[int] | None = None) -> dict:
    clone = json.loads(json.dumps(entry))
    profiles = ["desktop", "mobile390", "silhouette180", "silhouette96"]
    for item in clone["componentMap"]:
        item["visibleProfiles"] = list(profiles) if keep is None or item["componentIndex"] in keep else []
    return clone


def variant_entry(base: dict, name: str, keep: set[int] | None = None) -> dict:
    sidecar = read_json(STAGE_DIR / "variants" / name / "component-map.json")
    clone = json.loads(json.dumps(base))
    clone["componentMap"] = sidecar["componentMap"]
    return force_visible(clone, keep)


def cameras_with_opposite(contract: dict) -> dict:
    cameras = dict(contract["cameras"])
    cameras["opposite"] = list(OPPOSITE)
    return cameras


def load_records(name: str) -> np.ndarray:
    return np.fromfile(STAGE_DIR / "variants" / name / "single-video.state.bin", dtype=m3.STATE_DTYPE)


def prefix_records(records: np.ndarray, prefix: int) -> np.ndarray:
    clone = records.copy()
    clone["status"][prefix:] = m3.STATUS_RESERVE
    return clone


def isolate_records(records: np.ndarray, indices: set[int]) -> np.ndarray:
    clone = records.copy()
    mask = np.ones(len(clone), dtype=bool)
    for index in indices:
        mask &= clone["component"] != index
    clone["status"][mask] = m3.STATUS_RESERVE
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


def connected_components(mask: np.ndarray) -> int:
    from scipy import ndimage
    labeled, count = ndimage.label(mask)
    return int(count)


def main() -> int:
    manifest = read_json(PUBLIC_M31R / "manifest.json")
    entry = next(item for item in manifest["states"] if item["stateId"] == "single-video")
    contract = json.loads(json.dumps(manifest["presentationContract"]))
    contract["cameras"] = cameras_with_opposite(contract)
    manifest_view = json.loads(json.dumps(manifest))
    manifest_view["presentationContract"] = contract

    boards = STAGE_DIR / "renders" / "boards"
    silhouettes = STAGE_DIR / "renders" / "silhouettes"
    lod_dir = STAGE_DIR / "renders" / "lod"
    isolated = STAGE_DIR / "renders" / "isolated"
    diagnostics = STAGE_DIR / "renders" / "diagnostics"
    for folder in (boards, silhouettes, lod_dir, isolated, diagnostics):
        folder.mkdir(parents=True, exist_ok=True)

    lod_report: dict[str, object] = {"stage": "PS-04.M5.3", "prefixes": list(LOD_PREFIXES), "variants": {}}
    metrics: dict[str, object] = {"stage": "PS-04.M5.3", "variants": {}}
    view_images: dict[str, dict[str, Image.Image]] = {view: {} for view in VIEWS}
    unlabelled_canonical: dict[str, Image.Image] = {}
    labelled_canonical: dict[str, Image.Image] = {}

    for name in VARIANTS:
        records = load_records(name)
        variant_manifest = read_json(STAGE_DIR / "variants" / name / "manifest.json")
        ids = variant_manifest["componentIds"] if "componentIds" in variant_manifest else list(variant_manifest["componentCounts"])
        presence = variant_manifest["lodPrefixPresence"]
        required = ("camera-body", "camera-lens", "slate-board", "slate-hinged-bar") if name.startswith("combo") else (("camera-body", "camera-lens") if name.startswith("camera") else ("camera", "clapperboard"))
        extra = ("camera-top", "camera-rear") if name.startswith("camera") else ()
        missing = {
            prefix: [part for part in (*required, *extra) if presence.get(str(prefix), {}).get(part, 0) <= 0]
            for prefix in LOD_PREFIXES
        }
        lod_report["variants"][name] = {
            "presence": presence,
            "missingPartsAtPrefix": missing,
            "strictPrefix": variant_manifest["lodPriorityIsIdentity"],
            "pass": variant_manifest["lodPriorityIsIdentity"] and all(not parts for parts in missing.values()),
        }
        for view in VIEWS:
            projected = projected_splats(manifest_view, variant_entry(entry, name), records, view, "desktop")
            labelled = render_projection(projected, component_debug=True)
            plain = render_projection(projected, component_debug=False)
            save_rgb(boards / f"{name}-{view}-labelled.png", labelled)
            save_rgb(boards / f"{name}-{view}-unlabelled.png", plain)
            view_images[view][name] = Image.fromarray(plain, "RGB")
            if view == "canonical":
                labelled_canonical[name] = Image.fromarray(labelled, "RGB")
                unlabelled_canonical[name] = Image.fromarray(plain, "RGB")
        for profile in ("silhouette180", "silhouette96"):
            projected = projected_splats(manifest_view, variant_entry(entry, name), records, "canonical", profile)
            rgb = render_projection(projected, silhouette=True)
            mask = binary_mask(rgb)
            save_rgb(silhouettes / f"{name}-{profile}-canonical.png", mask)
            metrics.setdefault(name, {})
            if not isinstance(metrics[name], dict):
                metrics[name] = {}
            metrics[name][f"{profile}Occupied"] = occupancy(mask)
            metrics[name][f"{profile}Islands"] = connected_components(mask[:, :, 0] > 0)
        if name.startswith("combo") or name.startswith("camera"):
            for prefix in LOD_PREFIXES:
                projected = projected_splats(manifest_view, variant_entry(entry, name), prefix_records(records, prefix), "canonical", "desktop")
                rgb = render_projection(projected, component_debug=True)
                save_rgb(lod_dir / f"{name}-lod-{prefix}.png", rgb)

    compose_row([unlabelled_canonical[name] for name in COMBO], ["20", "30", "40"]).save(boards / "02-combo-20-30-40-canonical-unlabelled.png")
    compose_row([unlabelled_canonical[name] for name in CAMERA], ["20", "30", "40"]).save(boards / "03-camera-20-30-40-canonical-unlabelled.png")
    compose_row([labelled_canonical[name] for name in VARIANTS], [LABELS[name] for name in VARIANTS], tile=180).save(boards / "04-seven-up-labelled.png")
    compose_row([unlabelled_canonical["baseline"]], ["BASELINE"]).save(boards / "01-baseline-video.png")
    for view, number in (("alternate", "05"), ("opposite", "06"), ("side", "07"), ("top", "08")):
        compose_row([view_images[view][name] for name in COMBO], ["20", "30", "40"]).save(boards / f"{number}-combo-{view}.png")
    sil180 = [Image.open(silhouettes / f"{name}-silhouette180-canonical.png") for name in VARIANTS]
    sil96 = [Image.open(silhouettes / f"{name}-silhouette96-canonical.png") for name in VARIANTS]
    compose_row(sil180, [LABELS[name] for name in VARIANTS], tile=180).save(boards / "13-silhouettes-180.png")
    compose_row(sil96, [LABELS[name] for name in VARIANTS], tile=96).save(boards / "14-silhouettes-96.png")
    lod_combo = [Image.open(lod_dir / f"combo-30-lod-{prefix}.png") for prefix in LOD_PREFIXES]
    compose_row(lod_combo, [str(prefix) for prefix in LOD_PREFIXES], tile=160).save(boards / "15-combo-30-all-lod-prefixes.png")

    combo_records = load_records("combo-30")
    isolates = {
        "camera": {0, 1, 2, 3},
        "clapperboard": {4, 5, 6},
        "hinged-bar": {6},
        "board": {4},
        "full": {0, 1, 2, 3, 4, 5, 6},
    }
    isolated_images = {}
    for key, indices in isolates.items():
        rec = isolate_records(combo_records, indices)
        projected = projected_splats(manifest_view, variant_entry(entry, "combo-30", indices), rec, "canonical", "desktop")
        rgb = render_projection(projected, component_debug=True)
        save_rgb(isolated / f"combo-30-{key}.png", rgb)
        isolated_images[key] = Image.fromarray(rgb, "RGB")
        save_rgb(diagnostics / f"combo-30-{key}-debug.png", rgb)
    compose_row([isolated_images["camera"], isolated_images["clapperboard"], isolated_images["hinged-bar"], isolated_images["full"]],
                ["camera", "clapper", "bar", "full"]).save(boards / "10-isolated-camera-anatomy.png")
    compose_row([isolated_images["clapperboard"], isolated_images["board"], isolated_images["hinged-bar"]],
                ["clapper", "board", "bar"]).save(boards / "11-isolated-clapperboard-anatomy.png")
    compose_row([isolated_images["board"], isolated_images["hinged-bar"]],
                ["board", "hinged-bar"]).save(boards / "12-board-vs-hinged-bar.png")

    write_json(STAGE_DIR / "reports" / "lod-validation.json", lod_report)
    write_json(STAGE_DIR / "reports" / "offline-occupancy.json", metrics)
    print(json.dumps({"lodPass": {name: lod_report["variants"][name]["pass"] for name in VARIANTS}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
