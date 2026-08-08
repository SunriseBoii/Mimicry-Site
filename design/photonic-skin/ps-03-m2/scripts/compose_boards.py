"""PS-03.M2 review boards composed from the rendered panels (Pillow).

Produces:
  ps03m2_family_board.png        all eight targets, canonical, one scale
  ps03m2_silhouette_board.png    180 px and 96 px silhouettes side by side
  ps03m2_zones_board.png         component and zone debug per target
  ps03m2_coverage_board.png      coverage previews at 8192 and 1024
  ps03m2_components_<target>.png per-component sheets for composite targets
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
RENDER_DIR = STAGE_DIR / "renders"
PANEL_DIR = RENDER_DIR / "_panels"
EXPORT_DIR = STAGE_DIR / "exports"

BACKGROUND = (18, 19, 22)
LABEL = (206, 208, 214)
DIM = (132, 136, 146)


def label(draw: ImageDraw.ImageDraw, xy, text: str, colour=LABEL) -> None:
    draw.text(xy, text, fill=colour)


def grid(images: list[tuple[str, Path]], columns: int, cell: tuple[int, int],
         title: str, output: Path, caption_height: int = 26) -> None:
    rows = (len(images) + columns - 1) // columns
    width = columns * cell[0]
    height = rows * (cell[1] + caption_height) + 46
    board = Image.new("RGB", (width, height), BACKGROUND)
    draw = ImageDraw.Draw(board)
    label(draw, (16, 14), title)
    for index, (name, path) in enumerate(images):
        column, row = index % columns, index // columns
        x = column * cell[0]
        y = 46 + row * (cell[1] + caption_height)
        if path.exists():
            tile = Image.open(path).convert("RGB")
            tile.thumbnail(cell, Image.LANCZOS)
            board.paste(tile, (x + (cell[0] - tile.width) // 2, y))
        else:
            label(draw, (x + 12, y + 12), f"missing: {path.name}", DIM)
        label(draw, (x + 10, y + cell[1] + 6), name, DIM)
    output.parent.mkdir(parents=True, exist_ok=True)
    board.save(output)
    print(f"  {output.name}  {board.width}x{board.height}")


def main() -> None:
    manifest = json.loads(
        (EXPORT_DIR / "ps03m2-library-manifest.json").read_text("utf8")
    )
    entries = sorted(
        manifest["targets"].items(),
        key=lambda kv: (kv[1]["targetRole"] != "master", kv[0]),
    )
    ids = [target_id for target_id, _ in entries]

    grid(
        [(f"{e['displayName']} ({e['competencyId']})",
          PANEL_DIR / f"family_{t}.png") for t, e in entries],
        4, (420, 315),
        "PS-03.M2 target library — canonical 3/4, one shared camera scale, "
        "every target normalised to the same V0",
        RENDER_DIR / "ps03m2_family_board.png",
    )
    grid(
        [(f"{e['displayName']} ({e['competencyId']})",
          RENDER_DIR / f"ps03m2_{t}_canonical.png") for t, e in entries],
        4, (420, 315),
        "PS-03.M2 target library — canonical 3/4, per-target framing",
        RENDER_DIR / "ps03m2_framing_board.png",
    )

    silhouettes: list[tuple[str, Path]] = []
    for target_id in ids:
        silhouettes.append((f"{target_id} 180", PANEL_DIR / f"silhouette_{target_id}_180.png"))
        silhouettes.append((f"{target_id} 96", PANEL_DIR / f"silhouette_{target_id}_96.png"))
    grid(silhouettes, 8, (190, 145),
         "PS-03.M2 silhouettes — 180 px and 96 px",
         RENDER_DIR / "ps03m2_silhouette_board.png")

    debug: list[tuple[str, Path]] = []
    for target_id in ids:
        debug.append((f"{target_id} components",
                      RENDER_DIR / f"ps03m2_{target_id}_debug_components.png"))
        debug.append((f"{target_id} zones",
                      RENDER_DIR / f"ps03m2_{target_id}_debug_zones.png"))
    grid(debug, 4, (400, 300),
         "PS-03.M2 debug — component assignment and feature/silhouette/density zones",
         RENDER_DIR / "ps03m2_zones_board.png")

    coverage: list[tuple[str, Path]] = []
    for target_id in ids:
        coverage.append((f"{target_id} 8192",
                         RENDER_DIR / f"ps03m2_{target_id}_coverage_8192.png"))
        coverage.append((f"{target_id} 1024",
                         RENDER_DIR / f"ps03m2_{target_id}_coverage_1024.png"))
    grid(coverage, 4, (400, 300),
         "PS-03.M2 coverage previews — anonymous sampling at 8192 and 1024 plates",
         RENDER_DIR / "ps03m2_coverage_board.png")

    for target_id, entry in entries:
        component_ids = entry["componentIds"]
        if len(component_ids) < 2:
            continue
        measures = {c["componentId"]: c for c in entry["measures"]["components"]}
        tiles = []
        for component_id in component_ids:
            component = measures[component_id]
            tiles.append(
                (
                    "%s  mass %.2f (decl %.2f)  %.1f modules"
                    % (component_id, component["measuredMassShare"],
                       component["declaredMassWeight"],
                       component["bulkThicknessModules"]),
                    PANEL_DIR / f"component_{target_id}_{component_id}.png",
                )
            )
        tiles.append((f"{target_id} full composition",
                      RENDER_DIR / f"ps03m2_{target_id}_canonical.png"))
        grid(tiles, 3, (400, 300),
             f"PS-03.M2 {entry['displayName']} — atomic components and composition",
             RENDER_DIR / f"ps03m2_components_{target_id}.png")


if __name__ == "__main__":
    main()
