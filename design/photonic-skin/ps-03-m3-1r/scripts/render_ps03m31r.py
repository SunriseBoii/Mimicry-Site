"""Render the PS-03.M3.1R comparison-board review pack from real buffers."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from m31r_core import (
    BASELINE_MANIFEST_PATH,
    M31R_DIR,
    PUBLIC_M31,
    PUBLIC_M31R,
    STATE_DTYPE,
    projected_splats,
    read_json,
    render_projection,
    write_json,
)


OUT = M31R_DIR / "renders"


def font(size: int, bold: bool = False):
    path = Path("C:/Windows/Fonts") / ("arialbd.ttf" if bold else "consola.ttf")
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default()


TITLE = font(26, True)
LABEL = font(13, True)
META = font(10)


def records(root: Path, entry: dict) -> np.ndarray:
    return np.fromfile(root / entry["bufferPath"], dtype=STATE_DTYPE)


def render(manifest: dict, entry: dict, root: Path, view: str, profile: str = "desktop", *, debug: bool = False, silhouette: bool = False) -> Image.Image:
    projected = projected_splats(manifest, entry, records(root, entry), view, profile)
    return Image.fromarray(render_projection(projected, component_debug=debug, silhouette=silhouette), "RGB")


def fit(image: Image.Image, width: int, height: int) -> Image.Image:
    clone = image.copy()
    clone.thumbnail((width, height), Image.Resampling.LANCZOS)
    result = Image.new("RGB", (width, height), "#080a0b")
    result.paste(clone, ((width - clone.width) // 2, (height - clone.height) // 2))
    return result


def board(filename: str, title: str, rows: list[tuple[str, list[tuple[str, Image.Image, str]]]], *, cell_width: int = 350, cell_height: int = 330) -> dict:
    columns = max(len(cells) for _, cells in rows)
    canvas = Image.new("RGB", (columns * cell_width, 78 + len(rows) * cell_height), "#0b0d0e")
    draw = ImageDraw.Draw(canvas)
    draw.text((18, 15), title, fill="#eef1ef", font=TITLE)
    draw.text((18, 50), "PS-03.M3.1R / real endpoint buffers / fixed cameras / FOV 33deg", fill="#87918e", font=META)
    for row_index, (row_name, cells) in enumerate(rows):
        for column_index, (heading, image, meta) in enumerate(cells):
            x = column_index * cell_width
            y = 78 + row_index * cell_height
            canvas.paste(fit(image, cell_width - 12, cell_height - 73), (x + 6, y + 4))
            draw.line((x, y, x + cell_width, y), fill="#343a3b")
            draw.line((x, y, x, y + cell_height), fill="#343a3b")
            draw.text((x + 8, y + cell_height - 62), f"{row_name} / {heading}"[:54], fill="#e2e6e4", font=LABEL)
            draw.text((x + 8, y + cell_height - 38), meta[:72], fill="#a3adaa", font=META)
    path = OUT / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path, optimize=True)
    return {"file": filename, "title": title, "width": canvas.width, "height": canvas.height, "cells": sum(len(cells) for _, cells in rows)}


def find(states: list[dict], predicate) -> dict:
    return next(entry for entry in states if predicate(entry))


def main() -> int:
    baseline = read_json(BASELINE_MANIFEST_PATH)
    final = read_json(M31R_DIR / "exports" / "ps03m31r-manifest.json")
    old = {entry["stateId"]: entry for entry in baseline["states"]}
    new = {entry["stateId"]: entry for entry in final["states"]}
    outputs: list[dict] = []

    rows = []
    for competency in ("digital", "merch", "video"):
        state_id = f"single-{competency}"
        rows.append((competency.upper(), [
            ("old canonical", render(baseline, old[state_id], PUBLIC_M31, "canonical"), "[5.6,-6.4,4.1] / original orientation"),
            ("old alternate", render(baseline, old[state_id], PUBLIC_M31, "alternate"), "[2.8,-7.8,4.6] / accepted view"),
            ("new canonical", render(final, new[state_id], PUBLIC_M31R, "canonical"), "[2.8,-7.8,4.6] / no competency rotation"),
        ]))
    outputs.append(board("01-board-production-view-promotion.png", "OLD CANONICAL / OLD ALTERNATE / NEW CANONICAL", rows))

    event_ids = [
        "single-event",
        find(final["states"], lambda e: e["compositionMode"] == "FOCUS" and e.get("focusCompetencyId") == "event" and len(e["competencyIds"]) == 4)["stateId"],
        find(final["states"], lambda e: e["compositionMode"] == "FOCUS" and "event" in e["competencyIds"] and e.get("focusCompetencyId") != "event" and len(e["competencyIds"]) == 4)["stateId"],
        find(final["states"], lambda e: e["compositionMode"] == "GATHER" and "event" in e["competencyIds"] and len(e["competencyIds"]) == 4)["stateId"],
        find(final["states"], lambda e: e["compositionMode"] == "DRIVE" and "event" in e["competencyIds"] and len(e["competencyIds"]) == 4)["stateId"],
    ]
    rows = []
    for state_id in event_ids:
        rows.append((old[state_id]["compositionMode"], [
            ("before / old alt", render(baseline, old[state_id], PUBLIC_M31, "alternate"), "Euler [0,0,0] / [2.8,-7.8,4.6]"),
            ("after / new canonical", render(final, new[state_id], PUBLIC_M31R, "canonical"), "Euler [0,0,+18] / [2.8,-7.8,4.6]"),
        ]))
    outputs.append(board("02-board-event-before-after.png", "EVENT BEFORE / EVENT AFTER", rows, cell_width=430, cell_height=280))

    review_ids = ["single-event", "single-digital", event_ids[1], event_ids[3], event_ids[4]]
    rows = []
    for state_id in review_ids:
        rows.append((new[state_id]["displayName"], [
            ("new canonical", render(final, new[state_id], PUBLIC_M31R, "canonical"), "[2.8,-7.8,4.6]"),
            ("new alternate", render(final, new[state_id], PUBLIC_M31R, "alternate"), "[5.6,-6.4,4.1]"),
        ]))
    outputs.append(board("03-board-new-canonical-alternate.png", "NEW CANONICAL / NEW ALTERNATE", rows, cell_width=430, cell_height=280))

    focus_entries = [entry for entry in final["states"] if entry["compositionMode"] == "FOCUS" and len(entry["competencyIds"]) == 4][:6]
    rows = [(entry["focusCompetencyId"].upper(), [
        ("canonical", render(final, entry, PUBLIC_M31R, "canonical"), entry["stateId"]),
        ("alternate", render(final, entry, PUBLIC_M31R, "alternate"), entry["stateId"]),
    ]) for entry in focus_entries]
    outputs.append(board("04-board-focus-representatives.png", "FOCUS REPRESENTATIVE SET", rows, cell_width=430, cell_height=270))

    gather_entries = [entry for entry in final["states"] if entry["compositionMode"] == "GATHER"]
    rows = [(f"card {len(entry['competencyIds'])}", [
        ("canonical", render(final, entry, PUBLIC_M31R, "canonical"), entry["stateId"]),
        ("alternate", render(final, entry, PUBLIC_M31R, "alternate"), entry["stateId"]),
    ]) for entry in gather_entries]
    outputs.append(board("05-board-gather-representatives.png", "GATHER REPRESENTATIVE SET", rows, cell_width=430, cell_height=260))

    drive_entries = [entry for entry in final["states"] if entry["compositionMode"] == "DRIVE"]
    rows = [(f"card {len(entry['competencyIds'])}", [
        ("canonical", render(final, entry, PUBLIC_M31R, "canonical"), entry["stateId"]),
        ("alternate", render(final, entry, PUBLIC_M31R, "alternate"), entry["stateId"]),
    ]) for entry in drive_entries]
    outputs.append(board("06-board-drive-representatives.png", "DRIVE REPRESENTATIVE SET", rows, cell_width=430, cell_height=260))

    brand_entries = [entry for entry in final["states"] if entry["stateRole"] == "brand_wide"]
    rows = [(entry["compositionMode"], [
        ("canonical", render(final, entry, PUBLIC_M31R, "canonical"), entry["stateId"]),
        ("alternate", render(final, entry, PUBLIC_M31R, "alternate"), entry["stateId"]),
    ]) for entry in brand_entries]
    outputs.append(board("07-board-brand-wide.png", "BRAND_WIDE GATHER / DRIVE", rows, cell_width=480, cell_height=380))

    mobile_entries = [new["single-event"], new[event_ids[1]], new[event_ids[3]], new[event_ids[4]], *brand_entries]
    rows = [(entry["compositionMode"], [
        ("canonical mobile390", render(final, entry, PUBLIC_M31R, "canonical", "mobile390"), entry["stateId"]),
        ("alternate mobile390", render(final, entry, PUBLIC_M31R, "alternate", "mobile390"), entry["stateId"]),
    ]) for entry in mobile_entries]
    outputs.append(board("08-board-mobile390.png", "MOBILE390", rows, cell_width=410, cell_height=250))

    silhouette_entries = [new["single-event"], new[event_ids[1]], *brand_entries]
    rows = [(entry["compositionMode"], [
        ("silhouette180", render(final, entry, PUBLIC_M31R, "canonical", "silhouette180", silhouette=True), entry["stateId"]),
        ("silhouette96", render(final, entry, PUBLIC_M31R, "canonical", "silhouette96", silhouette=True), entry["stateId"]),
    ]) for entry in silhouette_entries]
    outputs.append(board("09-board-silhouettes-180-96.png", "SILHOUETTES 180 / 96", rows, cell_width=390, cell_height=260))

    debug_entries = [new[event_ids[1]], new[event_ids[2]], new[event_ids[3]], new[event_ids[4]], *brand_entries]
    rows = [(entry["compositionMode"], [
        ("canonical coverage", render(final, entry, PUBLIC_M31R, "canonical"), entry["stateId"]),
        ("component occlusion", render(final, entry, PUBLIC_M31R, "canonical", debug=True), "component-ID depth buffer"),
    ]) for entry in debug_entries]
    outputs.append(board("10-board-safe-frame-occlusion.png", "SAFE-FRAME / OCCLUSION", rows, cell_width=420, cell_height=255))

    conflict_ids = [
        "complex-focus-content-design-digital-event-merch-focus-content",
        "complex-focus-digital-event-games-merch-video-focus-digital",
    ]
    rows = []
    for state_id in conflict_ids:
        entry = new[state_id]
        rows.append(("resolved conflict", [
            ("canonical desktop", render(final, entry, PUBLIC_M31R, "canonical", debug=True), state_id),
            ("canonical mobile390", render(final, entry, PUBLIC_M31R, "canonical", "mobile390", debug=True), state_id),
            ("top desktop", render(final, entry, PUBLIC_M31R, "top", debug=True), "minimum rigid translation applied"),
        ]))
    outputs.append(board("11-board-endpoint-dust.png", "ENDPOINT DUST / RESOLVED CONFLICTS", rows, cell_width=360, cell_height=330))

    mapping = read_json(PUBLIC_M31R / "state-mapping.json")
    representatives = ["single-event", event_ids[1], event_ids[3], event_ids[4], brand_entries[0]["stateId"], brand_entries[1]["stateId"]]
    rows = []
    mapping_by_id = {item["stateId"]: item for item in mapping["states"]}
    for state_id in representatives:
        item = mapping_by_id[state_id]
        image = render(final, new[state_id], PUBLIC_M31R, "canonical", debug=True)
        rows.append((new[state_id]["compositionMode"], [("M3.1 -> M3.1R", image, f"{item['m31ContentHash'][:12]} -> {item['m31rContentHash'][:12]} / changed={item['geometryChanged']}")]))
    outputs.append(board("12-board-state-hash-mapping.png", "STATE / HASH MAPPING M3.1 -> M3.1R", rows, cell_width=740, cell_height=245))

    manifest = {
        "stage": "PS-03.M3.1R", "boardCount": len(outputs) + 1,
        "comparisonBoardCount": len(outputs), "candidateBoard": "board-event-orientation-candidates.png",
        "boards": outputs,
    }
    write_json(OUT / "render-manifest.json", manifest)
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
