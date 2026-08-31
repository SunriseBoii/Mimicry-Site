"""Offline Event-variant projection boards, silhouettes, and LOD gates.

Uses the frozen M3.1R presentation_qa projector. Does not mutate canonical states.
"""

from __future__ import annotations

import hashlib
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
VARIANTS = ("baseline", "a", "b", "c")
LOD_PREFIXES = (512, 1024, 2048, 4096, 8192, 12288, 16384)
OPPOSITE = [-5.6, 6.4, 4.1]
PART_NAMES = ("stage", "figure-centre", "figure-left", "figure-right")
COMPONENT_TO_PART = {0: "stage", 1: "stage", 2: "figure-left", 3: "figure-centre", 4: "figure-right"}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


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


def load_records(name: str) -> np.ndarray:
    path = STAGE_DIR / "variants" / name / "single-event.state.bin"
    return np.fromfile(path, dtype=m3.STATE_DTYPE)


def prefix_records(records: np.ndarray, prefix: int) -> np.ndarray:
    clone = records.copy()
    clone["status"][prefix:] = m3.STATUS_RESERVE
    return clone


def occupancy(rgb: np.ndarray) -> int:
    return int((rgb.max(axis=2) > 0).sum())


def part_presence(records: np.ndarray, prefix: int) -> dict[str, int]:
    slice_ = records[:prefix]
    live = slice_["status"] == m3.STATUS_ACTIVE
    counts = {name: 0 for name in PART_NAMES}
    for index, part in COMPONENT_TO_PART.items():
        counts[part] += int(np.count_nonzero(live & (slice_["component"] == index)))
    return counts


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


def main() -> int:
    manifest = read_json(PUBLIC_M31R / "manifest.json")
    entry = next(item for item in manifest["states"] if item["stateId"] == "single-event")
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

    lod_report: dict[str, object] = {"stage": "PS-04.M5.2", "prefixes": list(LOD_PREFIXES), "variants": {}}
    metrics: dict[str, object] = {"stage": "PS-04.M5.2", "variants": {}}
    board_files: list[str] = []

    labelled_canonical: dict[str, Image.Image] = {}
    unlabelled_canonical: dict[str, Image.Image] = {}
    view_images: dict[str, dict[str, Image.Image]] = {view: {} for view in VIEWS}

    for name in VARIANTS:
        records = load_records(name)
        variant_manifest = read_json(STAGE_DIR / "variants" / name / "manifest.json")
        finite = bool(np.isfinite(records["position"]).all())
        ids = records["lodPriority"]
        duplicate = int(len(ids) - len(np.unique(ids)))
        prefix_ok = bool(np.array_equal(ids, np.arange(len(records), dtype=np.uint16)))
        active = records["status"] == m3.STATUS_ACTIVE
        points = records["position"][active].astype(np.float64)
        centroid = points.mean(axis=0)
        low, high = points.min(axis=0), points.max(axis=0)
        stray = float(np.max(np.linalg.norm(points - centroid, axis=1)))
        lod_presence = {str(prefix): part_presence(records, prefix) for prefix in LOD_PREFIXES}
        missing = {
            prefix: [part for part, count in counts.items() if count <= 0]
            for prefix, counts in lod_presence.items()
        }
        variant_metrics = {
            "n": int(len(records)),
            "finite": finite,
            "duplicateIds": duplicate,
            "lodPriorityIsIdentity": prefix_ok,
            "activeCount": int(active.sum()),
            "bbox": {"min": [float(v) for v in low], "max": [float(v) for v in high], "size": [float(v) for v in high - low]},
            "centroid": [float(v) for v in centroid],
            "maxDistanceFromCentroid": stray,
            "collapsed": bool(np.any(high - low < 1e-4)),
            "contentHash": variant_manifest["contentHash"],
            "lodPrefixPresence": lod_presence,
            "missingPartsAtPrefix": missing,
        }
        metrics["variants"][name] = variant_metrics
        lod_report["variants"][name] = {
            "presence": lod_presence,
            "missingPartsAtPrefix": missing,
            "strictPrefix": prefix_ok,
            "pass": prefix_ok and duplicate == 0 and finite and all(not parts for parts in missing.values()),
        }

        visible_entry = force_visible(entry)
        for view in VIEWS:
            projected = projected_splats(manifest_view, visible_entry, records, view, "desktop")
            labelled = render_projection(projected, component_debug=True)
            plain = render_projection(projected, component_debug=False)
            labelled_path = boards / f"{name}-{view}-labelled.png"
            plain_path = boards / f"{name}-{view}-unlabelled.png"
            save_rgb(labelled_path, labelled)
            save_rgb(plain_path, plain)
            board_files.extend([str(labelled_path.relative_to(REPO_DIR)).replace("\\", "/"), str(plain_path.relative_to(REPO_DIR)).replace("\\", "/")])
            view_images[view][name] = Image.fromarray(plain, "RGB")
            if view == "canonical":
                labelled_canonical[name] = Image.fromarray(labelled, "RGB")
                unlabelled_canonical[name] = Image.fromarray(plain, "RGB")

        for profile, folder in (("silhouette180", silhouettes), ("silhouette96", silhouettes)):
            projected = projected_splats(manifest_view, visible_entry, records, "canonical", profile)
            rgb = render_projection(projected, silhouette=True)
            mask = binary_mask(rgb)
            dest = folder / f"{name}-{profile}-canonical.png"
            save_rgb(dest, mask)
            variant_metrics[f"{profile}Occupied"] = occupancy(mask)

        if name in {"b", "c"}:
            for prefix in LOD_PREFIXES:
                projected = projected_splats(manifest_view, visible_entry, prefix_records(records, prefix), "canonical", "desktop")
                rgb = render_projection(projected, component_debug=True)
                dest = lod_dir / f"{name}-lod-{prefix}.png"
                save_rgb(dest, rgb)

    names = ["baseline", "a", "b", "c"]
    labels = ["BASELINE", "EVENT_A", "EVENT_B", "EVENT_C"]
    compose_row([labelled_canonical[name] for name in names], labels).save(boards / "four-up-canonical-labelled.png")
    compose_row([unlabelled_canonical[name] for name in names], labels).save(boards / "four-up-canonical-unlabelled.png")
    for view in ("opposite", "side", "top"):
        compose_row([view_images[view][name] for name in names], labels).save(boards / f"four-up-{view}.png")

    sil180 = [Image.open(silhouettes / f"{name}-silhouette180-canonical.png") for name in names]
    sil96 = [Image.open(silhouettes / f"{name}-silhouette96-canonical.png") for name in names]
    compose_row(sil180, labels, tile=180).save(boards / "four-up-silhouette-180.png")
    compose_row(sil96, labels, tile=96).save(boards / "four-up-silhouette-96.png")

    lod_b = [Image.open(lod_dir / f"b-lod-{prefix}.png") for prefix in LOD_PREFIXES]
    lod_c = [Image.open(lod_dir / f"c-lod-{prefix}.png") for prefix in LOD_PREFIXES]
    compose_row(lod_b, [str(prefix) for prefix in LOD_PREFIXES], tile=160).save(boards / "b-all-lod-prefixes.png")
    compose_row(lod_c, [str(prefix) for prefix in LOD_PREFIXES], tile=160).save(boards / "c-all-lod-prefixes.png")

    write_json(STAGE_DIR / "reports" / "lod-validation.json", lod_report)
    write_json(STAGE_DIR / "reports" / "event-variant-metrics.json", metrics)
    print(json.dumps({
        "boards": str(boards.relative_to(REPO_DIR)).replace("\\", "/"),
        "lodPass": {name: lod_report["variants"][name]["pass"] for name in VARIANTS},
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
