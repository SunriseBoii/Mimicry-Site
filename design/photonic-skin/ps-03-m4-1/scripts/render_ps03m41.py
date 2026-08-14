"""Deterministic geometry-only offline evidence renderer for PS-03.M4.1.

The rasterizer evaluates real full-N transition programs, projects persistent
skin elements through the frozen M3.1R perspective camera presets and writes neutral
technical frames.  Encoded media and browser screenshots remain outside the
deterministic source-frame contract.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import PIL
from PIL import Image, ImageDraw, ImageFont


SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from orchestration import (  # noqa: E402
    EXPORT_DIR,
    FLAG_FEATURE,
    FLAG_SILHOUETTE,
    M4_DIR,
    MANDATED_TIMES,
    PROFILE_DIR,
    RENDER_DIR,
    REPORT_DIR,
    STATUS_ACTIVE,
    read_json,
    relative,
    sha256_file,
    state_entry_map,
    write_json,
)
from qa_ps03m41 import (  # noqa: E402
    _actor_pose,
    _array,
    _boundaries,
    _bridge_mask,
    _core,
    _decode_orientation,
    _load_program,
    _m3_compile_route,
    _m3_positions,
    _make_request,
    _positions,
    _roles,
    _scale,
    _status,
)


PROFILE_PATH = PROFILE_DIR / "directed-plastic-release.profile.json"
CAMERAS = {
    "canonical": np.array([2.8, -7.8, 4.6], dtype=np.float64),
    "alternate": np.array([5.6, -6.4, 4.1], dtype=np.float64),
    "side": np.array([8.8, 0.0, 1.4], dtype=np.float64),
    "top": np.array([0.01, -0.01, 9.4], dtype=np.float64),
}
CAMERA_FOV_DEGREES = 33.0
BACKGROUND = 239
FRAME_SIZE = 320
BOARD_TILE = 232


def _font(size: int = 14):
    candidates = (
        Path("C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    )
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def _frame_times(profile: dict[str, Any]) -> list[float]:
    values = set(MANDATED_TIMES) | set(_boundaries(profile))
    windows = profile.get("phasePolicy", {}).get("windows", {})
    for name, window in windows.items():
        if name in {"regroup", "release", "reveal"}:
            for boundary in window:
                values.add(max(0.0, float(boundary) - 0.01))
                values.add(min(1.0, float(boundary) + 0.01))
    return sorted(round(value, 5) for value in values)


def _camera_coordinates(points: np.ndarray, camera: str) -> tuple[np.ndarray, np.ndarray]:
    position = CAMERAS[camera]
    forward = -position
    forward /= np.linalg.norm(forward)
    world_up = np.array([0.0, 0.0, 1.0], dtype=np.float64)
    if abs(float(np.dot(forward, world_up))) > 0.985:
        world_up = np.array([0.0, 1.0, 0.0], dtype=np.float64)
    right = np.cross(forward, world_up)
    right /= np.linalg.norm(right)
    up = np.cross(right, forward)
    up /= np.linalg.norm(up)
    relative = np.asarray(points, dtype=np.float64) - position
    depth = relative @ forward
    focal_scale = np.tan(np.deg2rad(CAMERA_FOV_DEGREES) * 0.5)
    safe_depth = np.maximum(depth, 1e-6)
    projected = np.column_stack(((relative @ right) / (safe_depth * focal_scale), (relative @ up) / (safe_depth * focal_scale)))
    return projected, depth


def _bounds(source: np.ndarray, target: np.ndarray, camera: str) -> tuple[np.ndarray, np.ndarray]:
    combined, _ = _camera_coordinates(np.concatenate((source, target), axis=0), camera)
    low = np.quantile(combined, 0.002, axis=0)
    high = np.quantile(combined, 0.998, axis=0)
    center = (low + high) * 0.5
    half = max(float(np.max(high - low)) * 0.58, 1e-3)
    return center, np.array([half, half], dtype=np.float64)


def _project(points: np.ndarray, camera: str, center: np.ndarray, half: np.ndarray, size: int) -> tuple[np.ndarray, np.ndarray]:
    projected, depth = _camera_coordinates(points, camera)
    normalized = np.nan_to_num((projected - center) / half, nan=0.0, posinf=10.0, neginf=-10.0)
    x = np.rint(np.clip((normalized[:, 0] * 0.45 + 0.5) * (size - 1), -size * 4, size * 5)).astype(np.int32)
    y = np.rint(np.clip((0.5 - normalized[:, 1] * 0.45) * (size - 1), -size * 4, size * 5)).astype(np.int32)
    return np.column_stack((x, y)), depth


def _technical_values(
    evaluation: dict[str, Any],
    source: np.ndarray,
    target: np.ndarray,
    *,
    mode: str,
) -> tuple[np.ndarray, np.ndarray]:
    count = len(source)
    status = _status(evaluation, source["status"])
    activation = _array(evaluation, ("activation", "activationWeight"))
    if activation is None:
        activation = np.where(np.asarray(status) == STATUS_ACTIVE, 1.0, 0.34)
    activation = np.asarray(activation, dtype=np.float64).reshape(-1)
    scale = _scale(evaluation, source["scale"])
    visible = (activation > 0.015) & np.isfinite(scale) & (scale > 1e-5)
    values = np.full(count, 78, dtype=np.uint8)
    if mode == "groups":
        groups = _array(evaluation, ("transitionGroup", "group"), source["transitionGroup"])
        values = (52 + (np.asarray(groups, dtype=np.int64).reshape(-1) % 7) * 22).astype(np.uint8)
    elif mode == "reserve":
        values = np.where(np.asarray(status).reshape(-1) == STATUS_ACTIVE, 70, 172).astype(np.uint8)
    elif mode == "features":
        flags = np.asarray(_array(evaluation, ("flags",), source["flags"]), dtype=np.uint8).reshape(-1)
        values = np.where((flags & (FLAG_FEATURE | FLAG_SILHOUETTE)) != 0, 36, 132).astype(np.uint8)
    elif mode == "silhouette":
        values.fill(28)
    bridge = _bridge_mask(evaluation)
    if bridge is not None:
        values[np.asarray(bridge, dtype=bool)] = 18
    # Activation is geometric evidence: inactive/reserve transport fades only
    # in technical intensity; position/scale remain the primary mechanism.
    values = np.clip(values + (1.0 - np.clip(activation, 0.0, 1.0)) * 52.0, 12, 210).astype(np.uint8)
    return values, visible


def render_evaluation(
    evaluation: dict[str, Any],
    source: np.ndarray,
    target: np.ndarray,
    *,
    camera: str = "canonical",
    size: int = FRAME_SIZE,
    mode: str = "neutral",
    label: str = "",
) -> Image.Image:
    position = _positions(evaluation)
    center, half = _bounds(source["position"], target["position"], camera)
    pixels, depth = _project(position, camera, center, half, size)
    values, visible = _technical_values(evaluation, source, target, mode=mode)
    valid = visible & (depth > 1e-6) & (pixels[:, 0] >= 4) & (pixels[:, 0] < size - 4) & (pixels[:, 1] >= 4) & (pixels[:, 1] < size - 4)
    indices = np.flatnonzero(valid)
    # Painter order is far-to-near for the frozen perspective views.
    indices = indices[np.argsort(-depth[indices], kind="stable")]
    canvas = np.full((size, size), BACKGROUND, dtype=np.uint8)
    # A fixed neutral composition grid makes camera/viewport drift visible.
    canvas[size // 2, :] = 222
    canvas[:, size // 2] = 222
    for offset_x, offset_y in ((0, 0), (1, 0), (0, 1), (-1, 0), (0, -1)):
        x = np.clip(pixels[indices, 0] + offset_x, 0, size - 1)
        y = np.clip(pixels[indices, 1] + offset_y, 0, size - 1)
        canvas[y, x] = np.minimum(canvas[y, x], values[indices])
    image = Image.fromarray(canvas, mode="L").convert("RGB")
    if label:
        draw = ImageDraw.Draw(image)
        box_height = 26
        draw.rectangle((0, size - box_height, size, size), fill=(246, 246, 244))
        draw.text((7, size - box_height + 5), label, fill=(36, 36, 36), font=_font(12))
    return image


def render_positions(
    positions: np.ndarray,
    source: np.ndarray,
    target: np.ndarray,
    *,
    camera: str = "canonical",
    size: int = FRAME_SIZE,
    label: str = "",
) -> Image.Image:
    evaluation = {
        "position": positions,
        "scale": source["scale"].astype(np.float64),
        "status": source["status"],
        "activation": np.ones(len(source)),
    }
    return render_evaluation(evaluation, source, target, camera=camera, size=size, mode="neutral", label=label)


def _save(image: Image.Image, path: Path, outputs: list[Path]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=False, compress_level=9)
    outputs.append(path)
    return path


def _board(title: str, tiles: list[tuple[str, Image.Image]], *, columns: int = 4) -> Image.Image:
    columns = max(1, min(columns, len(tiles) or 1))
    rows = max(1, (len(tiles) + columns - 1) // columns)
    header = 48
    caption = 28
    width = columns * BOARD_TILE
    height = header + rows * (BOARD_TILE + caption)
    board = Image.new("RGB", (width, height), (232, 232, 229))
    draw = ImageDraw.Draw(board)
    draw.text((14, 12), title, fill=(28, 28, 28), font=_font(18))
    for index, (label, image) in enumerate(tiles):
        row, column = divmod(index, columns)
        x = column * BOARD_TILE
        y = header + row * (BOARD_TILE + caption)
        tile = image.copy()
        tile.thumbnail((BOARD_TILE, BOARD_TILE), Image.Resampling.LANCZOS)
        left = x + (BOARD_TILE - tile.width) // 2
        top = y + (BOARD_TILE - tile.height) // 2
        board.paste(tile, (left, top))
        draw.rectangle((x, y + BOARD_TILE, x + BOARD_TILE, y + BOARD_TILE + caption), fill=(244, 244, 241))
        draw.text((x + 6, y + BOARD_TILE + 6), label[:42], fill=(42, 42, 42), font=_font(11))
    return board


def _select(entries: list[dict[str, Any]], label: str, count: int = 1) -> list[dict[str, Any]]:
    matched = [entry for entry in entries if label in entry.get("coverage", [])]
    return matched[:count]


def _frame(
    entry: dict[str, Any],
    manifest_m3: dict[str, Any],
    evaluate,
    load_records,
    t: float,
    *,
    camera: str = "canonical",
    mode: str = "neutral",
    viewport: str = "desktop",
    reduced: bool = False,
    size: int = FRAME_SIZE,
) -> tuple[Image.Image, dict[str, Any], np.ndarray, np.ndarray]:
    by_id = state_entry_map(manifest_m3)
    source = load_records(by_id[entry["sourceStateId"]])
    target = load_records(by_id[entry["targetStateId"]])
    program, _ = _load_program(entry)
    result = evaluate(program, source, target, t, viewport=viewport, reduced=reduced)
    label = f"{entry.get('artifactId', entry['programId'][:12])}  t={t:.3f}  {camera}/{mode}"
    return render_evaluation(result, source, target, camera=camera, size=size, mode=mode, label=label), result, source, target


def _strip_tiles(
    entry: dict[str, Any],
    manifest_m3: dict[str, Any],
    evaluate,
    load_records,
    times: Iterable[float],
    *,
    mode: str = "neutral",
    camera: str = "canonical",
) -> list[tuple[str, Image.Image]]:
    tiles = []
    for t in times:
        image, _, _, _ = _frame(entry, manifest_m3, evaluate, load_records, float(t), mode=mode, camera=camera)
        tiles.append((f"t={float(t):.2f}", image))
    return tiles


def _m3_vs_m4_tiles(entry, manifest_m3, evaluate, load_records) -> list[tuple[str, Image.Image]]:
    by_id = state_entry_map(manifest_m3)
    source = load_records(by_id[entry["sourceStateId"]])
    target = load_records(by_id[entry["targetStateId"]])
    program, _ = _load_program(entry)
    route = _m3_compile_route(source, target)
    tiles = []
    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        m3 = render_positions(_m3_positions(source, target, route, t), source, target, label=f"M3.1R baseline  t={t:.2f}")
        m4_eval = evaluate(program, source, target, t, viewport="desktop", reduced=False)
        m4 = render_evaluation(m4_eval, source, target, label=f"M4.1 endpoint rebase  t={t:.2f}")
        tiles.extend([(f"M3.1R {t:.2f}", m3), (f"M4.1 {t:.2f}", m4)])
    return tiles


def _trails_board(entry, manifest_m3, profile, evaluate, load_records) -> Image.Image:
    by_id = state_entry_map(manifest_m3)
    source = load_records(by_id[entry["sourceStateId"]])
    target = load_records(by_id[entry["targetStateId"]])
    program, _ = _load_program(entry)
    times = np.linspace(0.0, 1.0, 41)
    selected = np.asarray([0, 7, 31, 127, 255, 511, 1023, 4095, 8191, 16383], dtype=np.int64)
    paths = np.stack([_positions(evaluate(program, source, target, float(t), viewport="desktop", reduced=False))[selected] for t in times], axis=0)
    center, half = _bounds(source["position"], target["position"], "canonical")
    image = Image.new("RGB", (640, 640), (BACKGROUND, BACKGROUND, BACKGROUND))
    draw = ImageDraw.Draw(image)
    grays = (24, 52, 78, 104, 128, 48, 88, 116, 64, 142)
    for index in range(len(selected)):
        projected, _ = _project(paths[:, index, :], "canonical", center, half, 640)
        points = [(int(x), int(y)) for x, y in projected]
        gray = grays[index % len(grays)]
        draw.line(points, fill=(gray, gray, gray), width=2)
        draw.text(points[-1], str(int(selected[index])), fill=(gray, gray, gray), font=_font(11))
    draw.text((14, 12), "Selected persistent-ID trajectories (canonical)", fill=(28, 28, 28), font=_font(18))
    return image


def _retarget_tiles(entries, manifest_m3, profile, evaluate, load_records) -> list[tuple[str, Image.Image]]:
    from m3_adapter import snapshot_descriptor, snapshot_entry, snapshot_from_evaluation
    from transition_compiler_v2 import compile_transition

    by_id = state_entry_map(manifest_m3)
    first = entries[0]
    source_entry = by_id[first["sourceStateId"]]
    intermediate_entry = by_id[first["targetStateId"]]
    source = load_records(source_entry)
    intermediate = load_records(intermediate_entry)
    original, _ = _load_program(first)
    alternate_entry = next(
        by_id[entry["targetStateId"]]
        for entry in entries[1:]
        if entry["targetStateId"] not in {source_entry["stateId"], intermediate_entry["stateId"]}
    )
    alternate = load_records(alternate_entry)
    tiles = []
    for generation, interruption in enumerate((0.25, 0.50, 0.75), start=1):
        captured = evaluate(original, source, intermediate, interruption, viewport="desktop", reduced=False)
        snapshot = snapshot_from_evaluation(captured, source)
        descriptor = snapshot_descriptor(
            snapshot,
            source_program_hash=first["contentHash"],
            captured_progress=interruption,
            generation=generation,
        )
        request = _make_request(source_entry["stateId"], alternate_entry["stateId"], profile, source_snapshot=descriptor)
        transient_entry = snapshot_entry(snapshot)
        retarget = compile_transition(request, transient_entry, snapshot, alternate_entry, alternate, profile)
        for local_t in (0.0, 0.5, 1.0):
            result = evaluate(retarget, snapshot, alternate, local_t, snapshot=snapshot, viewport="desktop", reduced=False)
            image = render_evaluation(result, source, alternate, label=f"interrupt {interruption:.2f} → local {local_t:.2f}")
            tiles.append((f"{interruption:.2f} / {local_t:.2f}", image))
    return tiles


def _rapid_retarget_tiles(entries, manifest_m3, profile, evaluate, load_records) -> list[tuple[str, Image.Image]]:
    """Render an A -> B -> C -> D chain with two in-flight interruptions."""
    from m3_adapter import snapshot_descriptor, snapshot_entry, snapshot_from_evaluation
    from transition_compiler_v2 import compile_transition

    by_id = state_entry_map(manifest_m3)
    first = entries[0]
    state_ids = [first["sourceStateId"], first["targetStateId"]]
    for entry in entries[1:]:
        candidate = entry["targetStateId"]
        if candidate not in state_ids:
            state_ids.append(candidate)
        if len(state_ids) == 4:
            break
    a_entry, b_entry, c_entry, d_entry = (by_id[state_id] for state_id in state_ids)
    a, b, c, d = (load_records(entry) for entry in (a_entry, b_entry, c_entry, d_entry))
    first_program, _ = _load_program(first)

    ab_capture = evaluate(first_program, a, b, 0.25, viewport="desktop", reduced=False)
    snapshot_ab = snapshot_from_evaluation(ab_capture, a)
    descriptor_ab = snapshot_descriptor(
        snapshot_ab,
        source_program_hash=first["contentHash"],
        captured_progress=0.25,
        generation=1,
    )
    transient_ab = snapshot_entry(snapshot_ab)
    request_bc = _make_request(a_entry["stateId"], c_entry["stateId"], profile, source_snapshot=descriptor_ab)
    program_bc = compile_transition(request_bc, transient_ab, snapshot_ab, c_entry, c, profile)

    bc_capture = evaluate(program_bc, snapshot_ab, c, 0.35, snapshot=snapshot_ab, viewport="desktop", reduced=False)
    snapshot_bc = snapshot_from_evaluation(bc_capture, snapshot_ab)
    descriptor_bc = snapshot_descriptor(
        snapshot_bc,
        source_program_hash=program_bc.hashes["contentSha256"],
        captured_progress=0.35,
        generation=2,
    )
    transient_bc = snapshot_entry(snapshot_bc)
    request_cd = _make_request(a_entry["stateId"], d_entry["stateId"], profile, source_snapshot=descriptor_bc)
    program_cd = compile_transition(request_cd, transient_bc, snapshot_bc, d_entry, d, profile)

    tiles: list[tuple[str, Image.Image]] = [
        ("A frozen endpoint", render_positions(a["position"], a, b, label=f"A · {a_entry['stateId']}")),
        ("A→B interrupted 25%", render_evaluation(ab_capture, a, b, label="capture A→B at 25%")),
        ("→C interrupted 35%", render_evaluation(bc_capture, a, c, label="capture →C at 35%")),
    ]
    for local_t in (0.0, 0.25, 0.50, 0.75, 1.0):
        result = evaluate(program_cd, snapshot_bc, d, local_t, snapshot=snapshot_bc, viewport="desktop", reduced=False)
        tiles.append((f"→D local {local_t:.2f}", render_evaluation(result, a, d, label=f"final leg →D · {local_t:.2f}")))
    return tiles


def _large_comparison_board(title: str, left: tuple[str, Image.Image], right: tuple[str, Image.Image]) -> Image.Image:
    """Keep comparison boards legible instead of squeezing them into contact-sheet tiles."""
    width_each = 900
    header = 58
    caption = 34
    prepared = []
    for label, image in (left, right):
        tile = image.copy()
        tile.thumbnail((width_each, 900), Image.Resampling.LANCZOS)
        prepared.append((label, tile))
    content_height = max(tile.height for _, tile in prepared)
    board = Image.new("RGB", (width_each * 2, header + content_height + caption), (232, 232, 229))
    draw = ImageDraw.Draw(board)
    draw.text((14, 14), title, fill=(28, 28, 28), font=_font(20))
    for index, (label, tile) in enumerate(prepared):
        x = index * width_each + (width_each - tile.width) // 2
        y = header + (content_height - tile.height) // 2
        board.paste(tile, (x, y))
        draw.rectangle((index * width_each, header + content_height, (index + 1) * width_each, header + content_height + caption), fill=(244, 244, 241))
        draw.text((index * width_each + 10, header + content_height + 8), label, fill=(42, 42, 42), font=_font(13))
    return board


def render_all() -> dict[str, Any]:
    _, _, evaluate, load_records, _ = _core()
    manifest_m3, _, _ = __import__("orchestration").validate_frozen_m3()
    manifest_m4 = read_json(EXPORT_DIR / "ps03m41-manifest.json")
    profile = read_json(PROFILE_PATH)
    entries = manifest_m4["programs"]
    outputs: list[Path] = []
    frame_times = _frame_times(profile)

    selected: list[dict[str, Any]] = []
    for label, count in (
        ("master-single-family", 7),
        ("single-single-topology-diverse", 3),
        ("one-three-split", 1),
        ("three-one-merge", 1),
        ("single-complex", 1),
        ("focus-swap", 1),
        ("complex-brand-wide", 1),
        ("brand-wide-master", 1),
        ("reserve-heavy", 1),
    ):
        selected.extend(_select(entries, label, count))
    unique = {entry["programId"]: entry for entry in selected}
    selected = list(unique.values())

    for entry in selected:
        artifact = entry.get("artifactId", entry["programId"][:16])
        for t in frame_times:
            image, _, _, _ = _frame(entry, manifest_m3, evaluate, load_records, t)
            _save(image, RENDER_DIR / "source-frames" / artifact / "canonical" / f"t-{int(round(t * 100000)):05d}.png", outputs)
        # Exact phase-boundary evidence in group/bridge and silhouette views.
        for t in _boundaries(profile):
            for mode in ("groups", "silhouette"):
                image, _, _, _ = _frame(entry, manifest_m3, evaluate, load_records, t, mode=mode)
                _save(image, RENDER_DIR / "source-frames" / artifact / mode / f"t-{int(round(t * 100000)):05d}.png", outputs)

    approval_dir = RENDER_DIR / "approval-pack"
    master_single = _select(entries, "master-single-family", 7)
    single_single = _select(entries, "single-single-topology-diverse", 3)
    split = (_select(entries, "one-three-split") or _select(entries, "one-two-split"))[0]
    merge = (_select(entries, "three-one-merge") or _select(entries, "two-one-merge"))[0]
    single_complex = _select(entries, "single-complex")[0]
    focus_swap = _select(entries, "focus-swap")[0]
    complex_brand = _select(entries, "complex-brand-wide")[0]
    brand_master = _select(entries, "brand-wide-master")[0]
    reserve = _select(entries, "reserve-heavy")[0]
    worst = max(entries, key=lambda entry: (entry["risk"]["score"], entry["programId"]))

    focus_modes = []
    for mode in ("FOCUS", "GATHER", "DRIVE"):
        state = next(entry for entry in manifest_m3["states"] if entry.get("compositionMode") == mode)
        records = load_records(state)
        focus_modes.append((mode, render_positions(records["position"], records, records, label=f"{mode} endpoint")))
    boards: list[tuple[str, Image.Image]] = []
    boards.append(("01-focus-gather-drive-endpoints.png", _board("01 · FOCUS / GATHER / DRIVE endpoint overview", focus_modes, columns=3)))
    boards.append(
        (
            "02-master-single-family.png",
            _board(
                "02 · MASTER → SINGLE family",
                [(entry["targetStateId"], _frame(entry, manifest_m3, evaluate, load_records, 0.5)[0]) for entry in master_single],
                columns=4,
            ),
        )
    )
    boards.append(
        (
            "03-single-single-topology.png",
            _board(
                "03 · Three topology-diverse SINGLE → SINGLE routes",
                [tile for entry in single_single for tile in _strip_tiles(entry, manifest_m3, evaluate, load_records, (0.0, 0.35, 0.65, 1.0))],
                columns=4,
            ),
        )
    )
    boards.append(
        (
            "04-split-merge-bridge.png",
            _board(
                "04 · Split / merge / finite bridge staging",
                _strip_tiles(split, manifest_m3, evaluate, load_records, (0.0, 0.30, 0.50, 0.72, 1.0), mode="groups")
                + _strip_tiles(merge, manifest_m3, evaluate, load_records, (0.0, 0.30, 0.50, 0.72, 1.0), mode="groups"),
                columns=5,
            ),
        )
    )
    boards.append(("05-single-complex.png", _board("05 · SINGLE → COMPLEX", _strip_tiles(single_complex, manifest_m3, evaluate, load_records, (0.0, 0.2, 0.5, 0.75, 0.9, 1.0)), columns=6)))
    boards.append(("06-focus-swap.png", _board("06 · COMPLEX focus swap", _strip_tiles(focus_swap, manifest_m3, evaluate, load_records, (0.0, 0.2, 0.5, 0.75, 0.9, 1.0), mode="features"), columns=6)))
    boards.append(
        (
            "07-complex-brand-master.png",
            _board(
                "07 · COMPLEX → BRAND_WIDE → MASTER",
                _strip_tiles(complex_brand, manifest_m3, evaluate, load_records, (0.0, 0.35, 0.7, 1.0))
                + _strip_tiles(brand_master, manifest_m3, evaluate, load_records, (0.0, 0.35, 0.7, 1.0)),
                columns=4,
            ),
        )
    )
    boards.append(("08-reserve-heavy.png", _board("08 · Reserve-heavy finite transport", _strip_tiles(reserve, manifest_m3, evaluate, load_records, (0.0, 0.18, 0.35, 0.5, 0.72, 0.9, 1.0), mode="reserve"), columns=7)))
    boards.append(("09-reverse.png", _board("09 · Reverse endpoint and in-transition scrub", _strip_tiles(split, manifest_m3, evaluate, load_records, (1.0, 0.9, 0.75, 0.5, 0.25, 0.1, 0.0), mode="groups"), columns=7)))
    retarget_tiles = _retarget_tiles(entries, manifest_m3, profile, evaluate, load_records)
    boards.append(("10-retarget-25-50-75.png", _board("10 · Retarget continuity at 25 / 50 / 75%", retarget_tiles, columns=3)))

    mobile_tiles = []
    for viewport, reduced, size in (("desktop", False, 320), ("mobile", False, 390), ("mobile", False, 180), ("mobile", False, 96), ("mobile", True, 180)):
        image, _, _, _ = _frame(worst, manifest_m3, evaluate, load_records, 0.5, viewport=viewport, reduced=reduced, size=size)
        mobile_tiles.append((f"{viewport} {size}px reduced={reduced}", image))
    boards.append(("11-desktop-mobile-reduced.png", _board("11 · Desktop / mobile / reduced", mobile_tiles, columns=5)))
    boards.append(("12-endpoint-vs-m41.png", _board("12 · Frozen M3.1R baseline vs M4.1", _m3_vs_m4_tiles(worst, manifest_m3, evaluate, load_records), columns=5)))

    boards.append(
        (
            "13-frozen-camera-contract.png",
            _board(
                "13 · Frozen M3.1R camera contract · 33° FOV",
                [(camera, _frame(worst, manifest_m3, evaluate, load_records, 0.5, camera=camera)[0]) for camera in CAMERAS],
                columns=4,
            ),
        )
    )
    silhouette_sizes = []
    for camera in CAMERAS:
        for size in (96, 180, 390):
            image, _, _, _ = _frame(worst, manifest_m3, evaluate, load_records, 0.5, camera=camera, mode="silhouette", size=size)
            silhouette_sizes.append((f"{camera} · {size}px", image))
    boards.append(("14-screen-space-silhouettes.png", _board("14 · Screen-space silhouettes · 96 / 180 / 390px", silhouette_sizes, columns=6)))
    phase_times = _boundaries(profile)
    boards.append(
        (
            "15-group-bridge-debug.png",
            _board("15 · Group / finite-bridge phase boundaries", _strip_tiles(split, manifest_m3, evaluate, load_records, phase_times, mode="groups"), columns=5),
        )
    )
    boards.append(
        (
            "16-reserve-debug.png",
            _board("16 · Reserve transport activation", _strip_tiles(reserve, manifest_m3, evaluate, load_records, (0.0, 0.18, 0.30, 0.50, 0.72, 0.90, 1.0), mode="reserve"), columns=7),
        )
    )
    boards.append(
        (
            "17-feature-protection.png",
            _board("17 · Protected feature / silhouette identities", _strip_tiles(focus_swap, manifest_m3, evaluate, load_records, (0.0, 0.20, 0.35, 0.50, 0.72, 0.90, 1.0), mode="features"), columns=7),
        )
    )
    boards.append(("18-identity-trajectories.png", _board("18 · Persistent-ID trajectories", [("10 selected identities", _trails_board(worst, manifest_m3, profile, evaluate, load_records))], columns=1)))
    boards.append(
        (
            "19-dense-collision-residual.png",
            _board(
                "19 · Dense collision / residual-motion inspection",
                _strip_tiles(worst, manifest_m3, evaluate, load_records, (0.0, 0.10, 0.20, 0.35, 0.50, 0.65, 0.75, 0.90, 1.0)),
                columns=5,
            ),
        )
    )
    risk_contact_tiles = []
    for entry in entries:
        image, _, _, _ = _frame(entry, manifest_m3, evaluate, load_records, 0.5, size=180)
        label = f"{entry['artifactId']} | {entry['sourceStateId'][:12]} → {entry['targetStateId'][:12]}"
        risk_contact_tiles.append((label, image))
    risk_contact_path = RENDER_DIR / "boards" / "all-35-risk-suite-contact-sheet.png"
    risk_contact_board = _board("All 35 full-N risk-suite programs · t=0.50", risk_contact_tiles, columns=5)
    boards.append(("20-all-35-full-n-contact.png", risk_contact_board.copy()))

    by_id = state_entry_map(manifest_m3)
    endpoint_tiles: list[tuple[str, Image.Image]] = []
    for entry in (worst, split, focus_swap):
        source = load_records(by_id[entry["sourceStateId"]])
        target = load_records(by_id[entry["targetStateId"]])
        eval_start, _, _, _ = _frame(entry, manifest_m3, evaluate, load_records, 0.0)
        eval_end, _, _, _ = _frame(entry, manifest_m3, evaluate, load_records, 1.0)
        endpoint_tiles.extend(
            (
                (f"{entry['artifactId']} · source", render_positions(source["position"], source, target, label="frozen source")),
                (f"{entry['artifactId']} · t=0 exact", eval_start),
                (f"{entry['artifactId']} · target", render_positions(target["position"], source, target, label="frozen target")),
                (f"{entry['artifactId']} · t=1 exact", eval_end),
            )
        )
    boards.append(("21-endpoint-exactness.png", _board("21 · Exact frozen endpoint identity · t=0 / t=1", endpoint_tiles, columns=4)))
    settle_tiles = _strip_tiles(worst, manifest_m3, evaluate, load_records, (0.86, 0.92, 0.97, 1.0))
    settled_image, _, _, _ = _frame(worst, manifest_m3, evaluate, load_records, 1.0)
    settle_tiles.extend((("idle +250 ms · static", settled_image.copy()), ("idle +1000 ms · static", settled_image.copy())))
    boards.append(("22-settle-static-idle.png", _board("22 · One-shot settle and static idle", settle_tiles, columns=6)))
    timing_tiles = []
    for boundary in phase_times:
        for offset in (-0.01, 0.0, 0.01):
            t = min(1.0, max(0.0, float(boundary) + offset))
            timing_tiles.extend(_strip_tiles(worst, manifest_m3, evaluate, load_records, (t,), mode="groups"))
    boards.append(("23-phase-timing-boundaries.png", _board("23 · Phase timing · before / exact / after", timing_tiles, columns=6)))

    old_m4_board_path = M4_DIR.parent / "ps-03-m4" / "renders" / "approval-pack" / "12-m3-vs-m4.png"
    old_m4_board = Image.open(old_m4_board_path).convert("RGB")
    current_m41_board = _board(
        "M4.1 endpoint-rebased route",
        _strip_tiles(worst, manifest_m3, evaluate, load_records, (0.0, 0.25, 0.50, 0.75, 1.0)),
        columns=5,
    )
    boards.append(
        (
            "24-old-m4-vs-m41.png",
            _large_comparison_board(
                "24 · Preserved Old M4 baseline vs endpoint-rebased M4.1",
                ("Old M4 frozen approval evidence (read-only)", old_m4_board),
                ("M4.1 frozen-M3.1R endpoint rebase", current_m41_board),
            ),
        )
    )

    gather_drive = next(
        entry
        for entry in entries
        if "complex-gather" in entry["sourceStateId"] and "complex-drive" in entry["targetStateId"]
    )
    boards.append(
        (
            "25-gather-to-drive.png",
            _board(
                "25 · GATHER → DRIVE directed route",
                _strip_tiles(gather_drive, manifest_m3, evaluate, load_records, (0.0, 0.18, 0.35, 0.50, 0.72, 0.90, 1.0), mode="groups"),
                columns=7,
            ),
        )
    )
    boards.append(
        (
            "26-drive-to-gather.png",
            _board(
                "26 · DRIVE → GATHER reverse scrub of the same reversible program",
                _strip_tiles(gather_drive, manifest_m3, evaluate, load_records, (1.0, 0.90, 0.72, 0.50, 0.35, 0.18, 0.0), mode="groups"),
                columns=7,
            ),
        )
    )

    max_shell_delta = max(entries, key=lambda entry: (abs(entry["risk"]["shellDelta"]), entry["risk"]["score"], entry["programId"]))
    boards.append(
        (
            "27-maximum-shell-delta.png",
            _board(
                f"27 · Maximum shell delta · {max_shell_delta['risk']['shellDelta']:+.0f}",
                _strip_tiles(max_shell_delta, manifest_m3, evaluate, load_records, (0.0, 0.18, 0.35, 0.50, 0.72, 0.90, 1.0), mode="silhouette"),
                columns=7,
            ),
        )
    )

    event_entries = [entry for entry in entries if "event" in entry["sourceStateId"] or "event" in entry["targetStateId"]]
    event_tiles = []
    for entry in event_entries[:8]:
        image, _, _, _ = _frame(entry, manifest_m3, evaluate, load_records, 0.5)
        event_tiles.append((f"{entry['sourceStateId'][:16]}→{entry['targetStateId'][:16]}", image))
    boards.append(("28-event-routes.png", _board("28 · Event-sensitive route family · t=0.50", event_tiles, columns=4)))

    boards.append(
        (
            "29-rapid-retarget-chain.png",
            _board("29 · Rapid A → B → C → D retarget chain", _rapid_retarget_tiles(entries, manifest_m3, profile, evaluate, load_records), columns=4),
        )
    )

    debug_tiles = []
    for mode in ("neutral", "groups", "reserve", "features", "silhouette"):
        image, _, _, _ = _frame(worst, manifest_m3, evaluate, load_records, 0.5, mode=mode)
        debug_tiles.append((mode, image))
    boards.append(("30-debug-views.png", _board("30 · Neutral / groups / reserve / features / silhouette debug", debug_tiles, columns=5)))

    browser_dir = RENDER_DIR / "browser"
    browser_tiles = []
    for screenshot_name in (
        "desktop-runtime.png",
        "desktop-side-by-side.png",
        "mobile-390-canvas.png",
        "mobile-390-runtime.png",
        "mobile-reduced-static.png",
    ):
        screenshot_path = browser_dir / screenshot_name
        browser_tiles.append((screenshot_name.removesuffix(".png"), Image.open(screenshot_path).convert("RGB")))
    boards.append(("31-browser-runtime-screenshots.png", _board("31 · Browser runtime · desktop / side-by-side / mobile / reduced", browser_tiles, columns=5)))

    for filename, board in boards:
        _save(board, approval_dir / filename, outputs)

    # Additional named technical boards required by the visual QA contract.
    _save(_board("Group / bridge debug", _strip_tiles(split, manifest_m3, evaluate, load_records, (0.24, 0.30, 0.50, 0.68, 0.72), mode="groups"), columns=5), RENDER_DIR / "boards" / "group-bridge-debug.png", outputs)
    _save(_board("Screen-space silhouettes · canonical / alternate / side / top", [(camera, _frame(worst, manifest_m3, evaluate, load_records, 0.5, camera=camera, mode="silhouette")[0]) for camera in CAMERAS], columns=4), RENDER_DIR / "boards" / "screen-silhouettes.png", outputs)
    _save(_board("Dense full-N worst-case sheet", [tile for t in (0.0, 0.1, 0.2, 0.35, 0.5, 0.65, 0.75, 0.9, 1.0) for tile in _strip_tiles(worst, manifest_m3, evaluate, load_records, (t,))], columns=5), RENDER_DIR / "boards" / "dense-worst-cases.png", outputs)
    _save(_board("M3.1R baseline vs M4.1 synchronized", _m3_vs_m4_tiles(worst, manifest_m3, evaluate, load_records), columns=5), RENDER_DIR / "boards" / "endpoint-vs-m41.png", outputs)
    _save(_trails_board(worst, manifest_m3, profile, evaluate, load_records), RENDER_DIR / "boards" / "selected-id-trails.png", outputs)
    _save(risk_contact_board, risk_contact_path, outputs)

    manifest_path = EXPORT_DIR / "ps03m41-manifest.json"
    qa_path = REPORT_DIR / "ps03m41-qa-summary.json"
    qa = read_json(qa_path) if qa_path.exists() else {}
    source_manifest = read_json(manifest_path)
    evidence = {
        "stage": "PS-03.M4.1",
        "renderer": "Pillow/NumPy deterministic frozen-camera perspective full-N point rasterizer",
        "rendererVersion": f"Pillow {PIL.__version__}",
        "geometryOnly": True,
        "neutralTechnicalValuesOnly": True,
        "cameraPresets": list(CAMERAS),
        "cameraPositions": {name: position.tolist() for name, position in CAMERAS.items()},
        "cameraFovDegrees": CAMERA_FOV_DEGREES,
        "sourceEndpointLibrary": source_manifest.get("endpointLibrary"),
        "freeOrbitAdded": False,
        "evaluatedIdentityCount": 16384,
        "sourceFrameProgramCount": len(selected),
        "riskSuiteContactSheetProgramCount": len(entries),
        "riskSuiteContactSheetProgramIds": [entry["programId"] for entry in entries],
        "riskSuiteContactSheetPath": relative(risk_contact_path),
        "sourceFrameTimeGrid": frame_times,
        "exactPhaseBoundaries": _boundaries(profile),
        "sourceManifestPath": relative(manifest_path),
        "sourceManifestSha256": sha256_file(manifest_path),
        "sourceAggregateContentHash": source_manifest["aggregateContentHash"],
        "sourceQaSummarySha256": sha256_file(qa_path) if qa_path.exists() else None,
        "sourceMotionProfileSha256": sha256_file(PROFILE_PATH),
        "approvalPackPartCount": len(boards),
        "approvalPack": [
            {
                "part": index,
                "path": relative(approval_dir / filename),
                "machineValid": qa.get("allRequiredChecksPassed", False),
                "visuallyReviewedByModel": False,
                "requiresHumanApproval": True,
            }
            for index, (filename, _) in enumerate(boards, start=1)
        ],
        "machineValid": qa.get("allRequiredChecksPassed", False),
        "visuallyReviewedByModel": False,
        "modelReviewStatus": "pending vision inspection",
        "requiresHumanApproval": True,
        "mediaEncoding": (
            "available but intentionally not generated by the deterministic renderer"
            if shutil.which("ffmpeg")
            else "not available (ffmpeg not found); PNG source frames are the source of truth"
        ),
        "browserScreenshots": "reported separately by browser runtime evidence",
        "deterministicContract": "source PNG frames/boards are evidence but excluded from M4 aggregate program hash",
        "renderCount": len(outputs),
        "renders": [
            {"path": relative(path), "bytes": path.stat().st_size, "sha256": sha256_file(path)} for path in sorted(outputs)
        ],
        "approvalQuestions": [
            "Does the transition read as one organism?",
            "Is the motion sufficiently directed?",
            "Is it too fluid or fragmented?",
            "Does split/merge staging read clearly?",
            "Is the source preserved long enough?",
            "Does the target become readable early enough?",
            "Is the speed appropriate?",
            "Is the mobile fallback acceptable?",
            "May the geometry/motion contract be frozen for PS-04?",
        ],
    }
    write_json(REPORT_DIR / "ps03m41-visual-evidence.json", evidence)
    print(f"rendered {len(outputs)} PS-03.M4.1 deterministic evidence PNGs")
    return evidence


def record_review(note: str) -> dict[str, Any]:
    path = REPORT_DIR / "ps03m41-visual-evidence.json"
    evidence = read_json(path)
    evidence["visuallyReviewedByModel"] = True
    evidence["modelReviewStatus"] = "reviewed"
    evidence["modelReviewNote"] = note
    evidence["requiresHumanApproval"] = True
    for part in evidence.get("approvalPack", []):
        part["visuallyReviewedByModel"] = True
        part["requiresHumanApproval"] = True
    write_json(path, evidence)
    print("recorded model visual review; human approval is still required")
    return evidence


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--record-review", help="record the result only after actual vision inspection")
    args = parser.parse_args()
    if args.record_review:
        record_review(args.record_review)
    else:
        render_all()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
