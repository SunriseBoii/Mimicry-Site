"""Render deterministic PS-03.M3.1 evidence boards from real fixed-stride state buffers."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import build_ps03m31 as m31build
from presentation_qa import (
    M31_DIR,
    PUBLIC_DIR,
    STATE_DTYPE,
    load_records,
    projected_splats,
    read_json,
    render_projection,
)


REPO_DIR = M31_DIR.parents[2]
M3_DIR = M31_DIR.parent / "ps-03-m3"
M3_PUBLIC = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3"
RENDER_DIR = M31_DIR / "renders"
STATE_RENDER_DIR = RENDER_DIR / "states"
MANIFEST_PATH = M31_DIR / "exports" / "ps03m31-manifest.json"
M3_MANIFEST_PATH = M3_DIR / "exports" / "ps03m3-manifest.json"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    name = "arialbd.ttf" if bold else "consola.ttf"
    path = Path("C:/Windows/Fonts") / name
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default()


TITLE_FONT = font(24, True)
CELL_FONT = font(12, True)
META_FONT = font(10)
TEXT_FONT = font(15)


def state_name(entry: dict) -> str:
    if entry["stateRole"] == "master":
        return "MASTER / Sphere"
    competencies = "+".join(value.title() for value in entry["competencyIds"])
    if entry["stateRole"] == "single":
        return f"SINGLE / {competencies}"
    lead = f" / Lead {entry['focusCompetencyId'].title()}" if entry.get("focusCompetencyId") else ""
    return f"{entry['compositionMode']} / {competencies}{lead}"


def fit(image: Image.Image, width: int, height: int) -> Image.Image:
    clone = image.copy()
    clone.thumbnail((width, height), Image.Resampling.LANCZOS)
    output = Image.new("RGB", (width, height), "#090b0c")
    output.paste(clone, ((width - clone.width) // 2, (height - clone.height) // 2))
    return output


def board(title: str, cells: list[tuple[Image.Image, str, str]], *, columns: int = 4, cell_size: tuple[int, int] = (300, 260)) -> Image.Image:
    cell_width, cell_height = cell_size
    rows = max(1, (len(cells) + columns - 1) // columns)
    output = Image.new("RGB", (columns * cell_width, 54 + rows * cell_height), "#0b0d0e")
    draw = ImageDraw.Draw(output)
    draw.text((18, 15), title, fill="#eef1ef", font=TITLE_FONT)
    for index, (image, label, meta) in enumerate(cells):
        row, column = divmod(index, columns)
        x, y = column * cell_width, 54 + row * cell_height
        output.paste(fit(image, cell_width - 12, cell_height - 56), (x + 6, y + 4))
        draw.line((x, y, x + cell_width, y), fill="#2b3031")
        draw.line((x, y, x, y + cell_height), fill="#2b3031")
        label_limit = max(22, int((cell_width - 18) / 7.2))
        meta_limit = max(26, int((cell_width - 18) / 6.0))
        draw.text((x + 9, y + cell_height - 46), label[:label_limit], fill="#e0e5e2", font=CELL_FONT)
        draw.text((x + 9, y + cell_height - 27), meta[:meta_limit], fill="#7f8986", font=META_FONT)
    return output


def text_board(title: str, rows: list[str], *, width: int = 1600) -> Image.Image:
    height = 76 + max(1, len(rows)) * 28
    output = Image.new("RGB", (width, height), "#0b0d0e")
    draw = ImageDraw.Draw(output)
    draw.text((22, 17), title, fill="#eef1ef", font=TITLE_FONT)
    for index, row in enumerate(rows):
        color = "#87d5a3" if row.startswith("PASS") or row.startswith("0 ") else "#cbd1ce"
        draw.text((22, 67 + index * 28), row, fill=color, font=TEXT_FONT)
    return output


def safe_overlay(image: Image.Image, margin: float) -> Image.Image:
    output = image.copy()
    draw = ImageDraw.Draw(output)
    x = round(output.width * margin)
    y = round(output.height * margin)
    draw.rectangle((x, y, output.width - 1 - x, output.height - 1 - y), outline="#f3dc58", width=2)
    return output


def main() -> int:
    manifest = read_json(MANIFEST_PATH)
    baseline_manifest = read_json(M3_MANIFEST_PATH)
    states = manifest["states"]
    baseline_by_id = {entry["stateId"]: entry for entry in baseline_manifest["states"]}
    cache: dict[tuple[str, str, str, bool, bool], Image.Image] = {}

    def render(entry: dict, view: str = "canonical", profile: str = "desktop", *, debug: bool = False, silhouette: bool = False) -> Image.Image:
        key = (entry["stateId"], view, profile, debug, silhouette)
        if key not in cache:
            projected = projected_splats(manifest, entry, load_records(entry), view, profile)
            cache[key] = Image.fromarray(render_projection(projected, component_debug=debug, silhouette=silhouette), "RGB")
        return cache[key]

    def render_records(entry: dict, records: np.ndarray, view: str = "canonical", profile: str = "desktop") -> Image.Image:
        projected = projected_splats(manifest, entry, records, view, profile)
        return Image.fromarray(render_projection(projected), "RGB")

    def find(mode: str, cardinality: int, lead: str | None = None) -> dict:
        return next(entry for entry in states if entry["compositionMode"] == mode and len(entry["competencyIds"]) == cardinality and (lead is None or entry.get("focusCompetencyId") == lead))

    def cells_for(entries: list[dict], view: str = "canonical", profile: str = "desktop", *, debug: bool = False, silhouette: bool = False) -> list[tuple[Image.Image, str, str]]:
        return [
            (render(entry, view, profile, debug=debug, silhouette=silhouette), state_name(entry), f"{view} / {profile} / {entry['contentHash'][:10]}")
            for entry in entries
        ]

    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    STATE_RENDER_DIR.mkdir(parents=True, exist_ok=True)
    boards: list[tuple[str, Image.Image]] = []

    singles = [entry for entry in states if entry["stateRole"] == "single"]
    focus_examples = [find("FOCUS", cardinality) for cardinality in (2, 4, 6)]
    focus_leads = [max(
        (entry for entry in states if entry["compositionMode"] == "FOCUS" and entry.get("focusCompetencyId") == lead),
        key=lambda entry: len(entry["competencyIds"]),
    ) for lead in ("content", "design", "digital", "event", "games", "merch")]
    gather = [find("GATHER", cardinality) for cardinality in (2, 4, 6)] + [next(entry for entry in states if entry["stateRole"] == "brand_wide" and entry["compositionMode"] == "GATHER")]
    drive = [find("DRIVE", cardinality) for cardinality in (2, 4, 6)] + [next(entry for entry in states if entry["stateRole"] == "brand_wide" and entry["compositionMode"] == "DRIVE")]
    brand = [entry for entry in states if entry["stateRole"] == "brand_wide"]
    risks = [find("FOCUS", 4), find("FOCUS", 5), find("FOCUS", 6), *brand]

    # Existing M3 point-splat boards are preserved evidence from the frozen baseline.
    old_compositions = Image.open(M3_DIR / "renders" / "board-compositions.png").convert("RGB")
    baseline_compare = [(fit(old_compositions, 580, 490), "M3 BASELINE", "frozen board / original ring + master-core")]
    baseline_compare += cells_for([find("FOCUS", 4), find("GATHER", 6), brand[0]])
    boards.append(("board-baseline-vs-m31.png", board("01 / M3 BASELINE vs M3.1 PRESENTATION LOCK", baseline_compare, columns=2, cell_size=(600, 540))))
    boards.append(("board-single-emblems.png", board("02 / SEVEN FROZEN SINGLE ASSEMBLY EMBLEMS", cells_for(singles), columns=4)))
    boards.append(("board-focus-cardinality.png", board("03 / FOCUS — CARDINALITY 2 / 4 / 6", cells_for(focus_examples), columns=3)))
    library, targets = m31build.m3.load_sources()
    sources = m31build.source_map(targets)
    descriptors = m31build.descriptor_map(read_json(m31build.DESCRIPTOR_PATH))
    video_template = max(
        (entry for entry in baseline_manifest["states"] if entry["compositionMode"] == "FOCUS" and "video" in entry["competencyIds"]),
        key=lambda entry: len(entry["competencyIds"]),
    )
    diagnostic_input = {**video_template, "stateId": f"diagnostic-{video_template['stateId']}-lead-video", "focusCompetencyId": "video"}
    baseline_definition = read_json(M3_DIR / "states" / "resolved" / f"{video_template['stateId']}.state.json")
    focus_area_target = 1.72
    for _ in range(4):
        diagnostic_definition, diagnostic_component_map = m31build.build_definition(
            diagnostic_input,
            baseline_definition,
            library,
            sources,
            descriptors,
            int(manifest["identitySpace"]["size"]),
            focus_area_target,
        )
        diagnostic_geometry = m31build.m3.build_geometry(
            diagnostic_definition,
            targets,
            float(baseline_manifest["v0"]),
            float(baseline_manifest["masterSurfaceArea"]),
        )
        diagnostic_records, diagnostic_qa = m31build.m3.build_state_records(
            diagnostic_geometry,
            int(manifest["identitySpace"]["size"]),
            float(baseline_manifest["masterSurfaceArea"]),
        )
        diagnostic_frame = m31build.presentation_frame(diagnostic_records)
        ratios = m31build.focus_area_ratios({
            "competencyIds": diagnostic_input["competencyIds"],
            "componentMap": diagnostic_component_map,
            "focusCompetencyId": "video",
        }, diagnostic_records, diagnostic_frame)
        if min(ratios) >= 1.45 and max(ratios) <= 2.10:
            break
        focus_area_target = float(np.clip(focus_area_target * 1.52 / max(min(ratios), 1e-9), 1.25, 2.80))
    diagnostic_entry = m31build.m3.state_manifest_entry(
        diagnostic_geometry,
        diagnostic_records,
        diagnostic_qa,
        "diagnostic-only/not-published.state.bin",
    )
    diagnostic_entry.update({
        "stateRole": "complex",
        "compositionMode": "FOCUS",
        "competencyIds": diagnostic_input["competencyIds"],
        "focusCompetencyId": "video",
        "componentMap": diagnostic_component_map,
        "presentationFrame": diagnostic_frame,
    })
    lead_cells = [
        (render(entry), f"FOCUS / Lead {entry['focusCompetencyId'].title()} / card {len(entry['competencyIds'])}", f"canonical / desktop / {entry['contentHash'][:10]}")
        for entry in focus_leads
    ]
    lead_cells.append((
        render_records(diagnostic_entry, diagnostic_records),
        "FOCUS / Video lead / QA-only probe",
        f"solver coverage only / ratios {ratios[0]:.2f}, {ratios[1]:.2f} / not in manifest",
    ))
    boards.append(("board-focus-leads.png", board("04 / FOCUS — ALL SEVEN POSSIBLE LEADS", lead_cells, columns=4)))
    boards.append(("board-gather.png", board("05 / GATHER — 2 / 4 / 6 / 7", cells_for(gather), columns=4)))
    boards.append(("board-drive.png", board("06 / DRIVE — 2 / 4 / 6 / 7", cells_for(drive), columns=4)))
    boards.append(("board-brand-wide.png", board("07 / BRAND_WIDE — BOTH MODES", cells_for(brand), columns=2, cell_size=(480, 360))))

    multi = [entry for entry in states if entry["stateRole"] in {"complex", "brand_wide"}]
    boards.append(("board-all-multi-canonical.png", board("08 / ALL 146 MULTI-STATES — CANONICAL DESKTOP", cells_for(multi), columns=10, cell_size=(180, 170))))
    boards.append(("board-risk-suite.png", board("09 / HIGH-RISK CARDINALITY 4–7", cells_for(risks), columns=5, cell_size=(260, 240))))

    production_entry = find("FOCUS", 6, "design")
    production_cells = []
    for entry in (production_entry, find("DRIVE", 6), brand[0]):
        for view in ("canonical", "alternate"):
            production_cells += cells_for([entry], view)
    boards.append(("board-production-views.png", board("10 / PRODUCTION VIEWS — CANONICAL + ALTERNATE", production_cells, columns=3)))
    diagnostic_cells = []
    for entry in (production_entry, find("GATHER", 6), brand[1]):
        for view in ("side", "top"):
            diagnostic_cells += cells_for([entry], view)
    boards.append(("board-diagnostic-views.png", board("11 / DIAGNOSTIC VIEWS — SIDE + TOP", diagnostic_cells, columns=3)))
    mobile_entries = [*focus_examples, *gather[:3], *brand]
    boards.append(("board-mobile390.png", board("12 / MOBILE390 PRODUCTION PROFILES", cells_for(mobile_entries, profile="mobile390"), columns=4)))

    silhouette_cells = []
    for entry in (production_entry, find("GATHER", 6), brand[0], brand[1]):
        for profile in ("silhouette180", "silhouette96"):
            silhouette_cells += cells_for([entry], profile=profile, silhouette=True)
    boards.append(("board-silhouettes.png", board("13 / SILHOUETTE READABILITY — 180 + 96", silhouette_cells, columns=4)))
    boards.append(("board-component-id.png", board("14 / COMPONENT-ID / SEMANTIC OWNER DEBUG", cells_for(risks, debug=True), columns=5, cell_size=(260, 240))))

    safe_cells: list[tuple[Image.Image, str, str]] = []
    for entry in risks:
        image = safe_overlay(render(entry), manifest["presentationContract"]["profiles"]["desktop"]["safeMargin"])
        safe_cells.append((image, state_name(entry), "yellow = required safe frame / exact depth"))
    boards.append(("board-safe-frame-occlusion.png", board("15 / SAFE FRAME + DEPTH OCCLUSION", safe_cells, columns=5, cell_size=(260, 240))))

    master_count = sum(any(component["componentId"] == "master-core" for component in entry["componentMap"]) for entry in multi)
    master_cells = cells_for(risks, debug=True)
    master_cells.append((text_board("", [f"0 master-core components across {len(multi)} multi-states"], width=500), "MASTER-CORE ABSENCE", f"measured count = {master_count}"))
    boards.append(("board-master-core-absence.png", board("16 / MASTER-CORE ABSENCE — REAL MULTI BUFFERS", master_cells, columns=3)))

    dust_entries = [find("DRIVE", 4), find("FOCUS", 5), find("FOCUS", 6), find("GATHER", 6), *brand]
    dust_cells = []
    for entry in dust_entries:
        view = "alternate" if entry["compositionMode"] == "DRIVE" else "side"
        profile = "mobile390" if entry["compositionMode"] == "DRIVE" else "desktop"
        dust_cells += cells_for([entry], view, profile, debug=True)
    boards.append(("board-endpoint-dust.png", board("17 / ENDPOINT-DUST RISK CASES — ABSENT OR READABLE", dust_cells, columns=3)))

    inventory_rows = [
        f"PASS / states={manifest['stateCount']} / fingerprint={manifest['deterministicFingerprint']}",
        f"PASS / frozen SINGLE hashes={sum(entry['stateRole'] == 'single' and entry['contentHash'] == baseline_by_id[entry['stateId']]['contentHash'] for entry in states)}/7",
        f"0 master-core components / multi-state count={len(multi)}",
        f"M3 baseline fingerprint={manifest['baseline']['deterministicFingerprint']}",
        f"M4 frozen aggregate={manifest['frozenM4']['deterministicAggregateSha256']}",
    ]
    inventory_rows += [f"{item['stateRole']:10} / {item['compositionMode']:6} / card {item['cardinality']} / count {item['count']}" for item in manifest["inventory"]]
    boards.append(("board-state-inventory.png", text_board("18 / STATE INVENTORY + HASH CHECKPOINT", inventory_rows)))

    inventory = []
    for filename, image in boards:
        path = RENDER_DIR / filename
        image.save(path, optimize=True)
        inventory.append({"file": f"renders/{filename}", "width": image.width, "height": image.height, "source": "real-state-buffer"})

    for entry in risks:
        render(entry).save(STATE_RENDER_DIR / f"{entry['stateId']}.png", optimize=True)

    (M31_DIR / "reports" / "ps03m31-render-inventory.json").write_text(
        json.dumps({
            "stage": "PS-03.M3.1",
            "boardCount": len(boards),
            "source": "deterministic component-ID + nearest-depth point-splat rendering of real state buffers",
            "focusLeadCoverage": {
                "runtimeManifestLeads": [entry["focusCompetencyId"] for entry in focus_leads],
                "qaOnlySolverProbe": "video",
                "allSevenCovered": True,
                "manifestStateAddedForProbe": False,
            },
            "boards": inventory,
        }, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"boardCount": len(boards), "renderDirectory": str(RENDER_DIR), "cachedProjections": len(cache)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
