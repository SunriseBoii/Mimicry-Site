"""Offline A / A-R1 / A-R2 boards, silhouettes, and coverage diagnostics."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

PHOTONIC_DIR = SCRIPT_DIR.parent.parent
for extra in (PHOTONIC_DIR / "ps-03-m3" / "scripts", PHOTONIC_DIR / "ps-03-m3-1r" / "scripts"):
    if str(extra) not in sys.path:
        sys.path.insert(0, str(extra))

import state_builder as m3  # noqa: E402
from m31r_core import projected_splats, read_json, render_projection  # noqa: E402
from r2_common import (  # noqa: E402
    EXPECTED_VIEWER_RIGHT_LOD,
    LOD_PREFIXES,
    M52_DIR,
    M52R1_DIR,
    PUBLIC_M31R,
    REPO_DIR,
    STAGE_DIR,
    figure_mask,
    load_event_a,
    load_event_a_r1,
    presentation_frame,
    project_centroid,
    single_event_entry,
    write_json,
)

VIEWS = ("canonical", "alternate", "opposite", "side", "top")
OPPOSITE = [-5.6, 6.4, 4.1]
VIEWER_RIGHT_COMPONENT = 2
VIEWER_LEFT_COMPONENT = 4


def save_rgb(path: Path, array: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(array, "RGB").save(path)


def force_visible(entry: dict) -> dict:
    clone = json.loads(json.dumps(entry))
    profiles = ["desktop", "mobile390", "silhouette180", "silhouette96"]
    for item in clone["componentMap"]:
        item["visibleProfiles"] = list(profiles)
    return clone


def force_viewer_right_only(entry: dict) -> dict:
    clone = json.loads(json.dumps(entry))
    profiles = ["desktop", "mobile390", "silhouette180", "silhouette96"]
    for item in clone["componentMap"]:
        item["visibleProfiles"] = list(profiles) if int(item["componentIndex"]) == VIEWER_RIGHT_COMPONENT else []
    return clone


def cameras_with_opposite(contract: dict) -> dict:
    cameras = dict(contract["cameras"])
    cameras["opposite"] = list(OPPOSITE)
    return cameras


def isolate(records: np.ndarray, component: int) -> np.ndarray:
    clone = records.copy()
    keep = (clone["component"] == component) & (clone["status"] == m3.STATUS_ACTIVE)
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


def load_r2() -> np.ndarray:
    return np.fromfile(STAGE_DIR / "variants" / "a-r2" / "single-event.state.bin", dtype=m3.STATE_DTYPE)


def main() -> int:
    manifest = read_json(PUBLIC_M31R / "manifest.json")
    raw_entry = next(item for item in manifest["states"] if item["stateId"] == "single-event")
    visible_entry = force_visible(raw_entry)
    r2_entry = json.loads(json.dumps(raw_entry))
    for item in r2_entry["componentMap"]:
        if int(item["componentIndex"]) == VIEWER_RIGHT_COMPONENT:
            item["visibleProfiles"] = ["desktop", "mobile390", "silhouette180", "silhouette96"]
    contract = json.loads(json.dumps(manifest["presentationContract"]))
    contract["cameras"] = cameras_with_opposite(contract)
    manifest_view = json.loads(json.dumps(manifest))
    manifest_view["presentationContract"] = contract

    boards = STAGE_DIR / "renders" / "boards"
    silhouettes = STAGE_DIR / "renders" / "silhouettes"
    diagnostics = STAGE_DIR / "renders" / "diagnostics"
    lod_dir = STAGE_DIR / "renders" / "lod"
    for path in (boards, silhouettes, diagnostics, lod_dir):
        path.mkdir(parents=True, exist_ok=True)

    records = {
        "a": load_event_a(),
        "a-r1": load_event_a_r1(),
        "a-r2": load_r2(),
    }
    entries = {"a": raw_entry, "a-r1": raw_entry, "a-r2": r2_entry}
    labels = {
        "a": "A — viewer-right point cloud",
        "a-r1": "A‑R1 — wrong viewer-left edit",
        "a-r2": "A‑R2 — correct viewer-right edit",
    }

    mapping = json.loads((STAGE_DIR / "reports" / "screen-space-part-map.json").read_text(encoding="utf-8"))
    frame = presentation_frame(raw_entry)
    a_plain = None

    for name, current in records.items():
        for view in VIEWS:
            packed_entry = r2_entry if name == "a-r2" else visible_entry
            packed = projected_splats(manifest_view, packed_entry, current, view, "desktop")
            plain = render_projection(packed, component_debug=False)
            labelled = render_projection(projected_splats(manifest_view, visible_entry, current, view, "desktop"), component_debug=True)
            save_rgb(boards / f"{name}-{view}-unlabelled.png", plain)
            save_rgb(boards / f"{name}-{view}-labelled.png", labelled)
            if name == "a" and view == "canonical":
                save_rgb(diagnostics / "a-canonical-force-visible.png", plain)
                save_rgb(diagnostics / "a-canonical-as-packed.png", render_projection(
                    projected_splats(manifest_view, raw_entry, current, view, "desktop"), component_debug=False
                ))
            if name == "a-r2" and view == "canonical":
                save_rgb(diagnostics / "a-r2-canonical-overlay-visible.png", plain)
        for profile, dest_name in (("silhouette180", f"{name}-silhouette180-canonical.png"), ("silhouette96", f"{name}-silhouette96-canonical.png")):
            projected = projected_splats(manifest_view, visible_entry, current, "canonical", profile)
            save_rgb(silhouettes / dest_name, binary_mask(render_projection(projected, silhouette=True)))
        isolated = isolate(current, VIEWER_RIGHT_COMPONENT)
        iso_entry = force_visible(raw_entry)
        for profile, dest_name in (
            ("desktop", f"{name}-isolated-viewer-right-full.png"),
            ("silhouette180", f"{name}-isolated-viewer-right-180.png"),
            ("silhouette96", f"{name}-isolated-viewer-right-96.png"),
        ):
            projected = projected_splats(manifest_view, iso_entry, isolated, "canonical", profile)
            rgb = render_projection(projected, silhouette=profile != "desktop")
            dest = silhouettes if profile != "desktop" else diagnostics
            save_rgb(dest / dest_name, binary_mask(rgb) if profile != "desktop" else rgb)
        actor = render_projection(projected_splats(manifest_view, iso_entry, isolated, "canonical", "desktop"), silhouette=True)
        save_rgb(diagnostics / f"{name}-isolated-viewer-right-actor-mask.png", binary_mask(actor))
        unlit = render_projection(projected_splats(manifest_view, iso_entry, isolated, "canonical", "desktop"), component_debug=False)
        save_rgb(diagnostics / f"{name}-isolated-viewer-right-unlit.png", unlit)
        normal = render_projection(projected_splats(manifest_view, iso_entry, isolated, "canonical", "desktop"), component_debug=True)
        save_rgb(diagnostics / f"{name}-isolated-viewer-right-component.png", normal)

    # Mapping overlay on original A force-visible canonical.
    overlay = Image.fromarray(render_projection(
        projected_splats(manifest_view, visible_entry, records["a"], "canonical", "desktop"),
        component_debug=True,
    ), "RGB").copy()
    draw = ImageDraw.Draw(overlay)
    font = ImageFont.load_default()
    for figure in mapping["figures"]:
        cx = int(round(figure["canonicalProjectedCentroid"]["screenX"]))
        cy = int(round(figure["canonicalProjectedCentroid"]["screenY"]))
        role = figure["viewerSpaceRole"]
        draw.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), outline=(255, 255, 0))
        draw.text((cx + 6, cy - 8), f"{role}\n{figure['semanticName']} c{figure['componentId']}", fill=(255, 255, 0), font=font)
    overlay.save(diagnostics / "a-canonical-screen-space-labels.png")

    compose_row(
        [
            Image.open(boards / "a-canonical-unlabelled.png"),
            Image.open(boards / "a-r1-canonical-unlabelled.png"),
            Image.open(boards / "a-r2-canonical-unlabelled.png"),
        ],
        [labels["a"], labels["a-r1"], labels["a-r2"]],
        tile=280,
    ).save(boards / "a-vs-ar1-vs-ar2-canonical.png")
    compose_row(
        [
            Image.open(boards / "a-alternate-unlabelled.png"),
            Image.open(boards / "a-r1-alternate-unlabelled.png"),
            Image.open(boards / "a-r2-alternate-unlabelled.png"),
        ],
        [labels["a"], labels["a-r1"], labels["a-r2"]],
        tile=280,
    ).save(boards / "a-vs-ar1-vs-ar2-alternate.png")
    compose_row(
        [
            Image.open(diagnostics / "a-isolated-viewer-right-full.png"),
            Image.open(diagnostics / "a-r1-isolated-viewer-right-full.png"),
            Image.open(diagnostics / "a-r2-isolated-viewer-right-full.png"),
        ],
        ["A viewer-right", "A-R1 viewer-right (unchanged)", "A-R2 viewer-right"],
        tile=280,
    ).save(boards / "isolated-viewer-right-comparison.png")

    lod_images = []
    presence = {}
    r2 = records["a-r2"]
    for prefix in LOD_PREFIXES:
        projected = projected_splats(manifest_view, r2_entry, prefix_records(r2, prefix), "canonical", "desktop")
        rgb = render_projection(projected, component_debug=True)
        save_rgb(lod_dir / f"a-r2-lod-{prefix}.png", rgb)
        lod_images.append(Image.fromarray(rgb, "RGB"))
        live = r2["status"][:prefix] == m3.STATUS_ACTIVE
        presence[str(prefix)] = int(np.count_nonzero(live & (r2["component"][:prefix] == VIEWER_RIGHT_COMPONENT)))
    compose_row(lod_images, [str(prefix) for prefix in LOD_PREFIXES], tile=160).save(boards / "a-r2-all-lod-prefixes.png")
    write_json(STAGE_DIR / "reports" / "lod-validation.json", {
        "stage": "PS-04.M5.2.R2",
        "expected": EXPECTED_VIEWER_RIGHT_LOD,
        "actual": {int(k): v for k, v in presence.items()},
        "pass": presence == {str(k): v for k, v in EXPECTED_VIEWER_RIGHT_LOD.items()},
        "viewerLeftUnchanged": int(np.count_nonzero((r2["status"] == m3.STATUS_ACTIVE) & (r2["component"] == VIEWER_LEFT_COMPONENT))) == 890,
    })

    occupied = {
        "aForceVisibleIsolated": occupancy(np.array(Image.open(diagnostics / "a-isolated-viewer-right-full.png"))),
        "aR2Isolated": occupancy(np.array(Image.open(diagnostics / "a-r2-isolated-viewer-right-full.png"))),
        "aR2Canonical": occupancy(np.array(Image.open(boards / "a-r2-canonical-unlabelled.png"))),
    }
    write_json(STAGE_DIR / "reports" / "offline-occupancy.json", occupied)
    print(json.dumps({"lod": presence, "occupied": occupied}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
