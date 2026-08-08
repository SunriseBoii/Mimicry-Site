"""Compose Blender evidence frames into compact review boards."""

from __future__ import annotations

from pathlib import Path
import json
import shutil

from PIL import Image, ImageDraw, ImageFont


M3_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = Path(__file__).resolve().parents[4]
RENDER_DIR = M3_DIR / "renders"


def font(size: int):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def board(name: str, title: str, items: list[tuple[str, str]], columns: int) -> None:
    cell = 360
    label = 42
    rows = (len(items) + columns - 1) // columns
    canvas = Image.new("RGB", (columns * cell, 56 + rows * (cell + label)), "#090b0c")
    draw = ImageDraw.Draw(canvas)
    draw.text((18, 15), title, fill="#eef1ef", font=font(24))
    for index, (filename, caption) in enumerate(items):
        x = (index % columns) * cell
        y = 56 + (index // columns) * (cell + label)
        image = Image.open(RENDER_DIR / filename).convert("RGB").resize((cell, cell), Image.Resampling.LANCZOS)
        canvas.paste(image, (x, y))
        draw.text((x + 12, y + cell + 10), caption, fill="#c7ceca", font=font(18))
    destination = RENDER_DIR / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, optimize=True)


def state_caption(entry: dict) -> str:
    abbreviations = {
        "content": "CON", "design": "DES", "digital": "DIG", "event": "EVT",
        "games": "GAM", "merch": "MER", "video": "VID",
    }
    members = "+".join(abbreviations[value] for value in entry["competencyIds"])
    focus = entry.get("focusCompetencyId")
    return f"{members} · F:{abbreviations[focus]}" if focus else members


def main() -> None:
    for generated_directory in (RENDER_DIR / "family-boards", RENDER_DIR / "transition-boards"):
        if generated_directory.exists():
            shutil.rmtree(generated_directory)
    manifest = json.loads((REPO_DIR / "public" / "photonic-skin" / "ps-03-m3" / "manifest.json").read_text(encoding="utf-8"))
    singles = [(f"single-{value}.png", value.upper()) for value in ("content", "design", "digital", "event", "games", "merch", "video")]
    board("board-singles.png", "PS-03.M3 / HUMAN-APPROVED SINGLE ENDPOINTS", singles, 4)
    board("board-compositions.png", "PS-03.M3 / UNIVERSAL COMPOSITION MODES", [
        ("master-neutral.png", "MASTER"),
        ("complex-focus-content-design-digital-event-focus-content.png", "FOCUS / 4-way"),
        ("brand-wide-gather-content-design-digital-event-games-merch-video.png", "GATHER / 7-way"),
        ("brand-wide-drive-content-design-digital-event-games-merch-video.png", "DRIVE / 7-way"),
    ], 4)
    board("board-transition.png", "PS-03.M3 / COMPILED BRAND-WIDE -> MASTER", [
        (f"transition-{value:03d}.png", f"t={value / 100:.2f}") for value in (0, 25, 50, 75, 100)
    ], 5)
    gather = "brand-wide-gather-content-design-digital-event-games-merch-video"
    board("board-cameras.png", "PS-03.M3 / CANONICAL CAMERA REVIEW", [
        (f"{gather}-{preset}.png", preset.upper()) for preset in ("canonical", "opposite", "side", "top")
    ], 4)
    canonical = [entry for entry in manifest["states"] if entry["isCanonicalCombination"] and entry["stateRole"] != "master"]
    for cardinality in range(1, 8):
        entries = [entry for entry in canonical if len(entry["competencyIds"]) == cardinality]
        board(
            f"family-boards/cardinality-{cardinality}.png",
            f"PS-03.M3 / CANONICAL FAMILY / CARDINALITY {cardinality}",
            [(f"family/{entry['stateId']}.png", state_caption(entry)) for entry in entries],
            min(5, max(1, len(entries))),
        )
    for entry in manifest["transitions"]:
        board(
            f"transition-boards/{entry['transitionId']}.png",
            f"PS-03.M3 / {entry['routeKind'].upper()} / {entry['transitionId']}",
            [(f"transition-frames/{entry['transitionId']}/t-{value:03d}.png", f"t={value / 100:.2f}") for value in (0, 10, 25, 50, 75, 90, 100)],
            7,
        )
    board("board-worst-cases.png", "PS-03.M3 / GATE A WORST CASES", [
        ("family/single-digital.png", "MAX SURFACE / 2.6113x"),
        ("family/complex-focus-digital-merch-focus-digital.png", "MAX ASPECT / 5.8304"),
        ("family/complex-focus-content-design-digital-event-games-merch-focus-content.png", "MIN THICKNESS / 4.0 modules"),
    ], 3)
    print("created overview, 7 cardinality and 18 transition review boards")


if __name__ == "__main__":
    main()
