"""Deterministic geometry-only offline evidence renderer for PS-03.M4.

The rasterizer evaluates real full-N transition programs, projects persistent
skin elements through fixed orthographic camera presets and writes neutral
technical frames.  Encoded media and browser screenshots remain outside the
deterministic source-frame contract.
"""

from __future__ import annotations

import argparse
import json
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
from qa_ps03m4 import (  # noqa: E402
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
    "canonical": ((0, 1), 2, (1.0, 1.0)),
    "opposite": ((0, 1), 2, (-1.0, 1.0)),
    "side": ((2, 1), 0, (1.0, 1.0)),
    "top": ((0, 2), 1, (1.0, -1.0)),
}
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


def _bounds(source: np.ndarray, target: np.ndarray, camera: str) -> tuple[np.ndarray, np.ndarray]:
    axes, _, signs = CAMERAS[camera]
    combined = np.concatenate((source[:, axes], target[:, axes]), axis=0).astype(np.float64)
    combined[:, 0] *= signs[0]
    combined[:, 1] *= signs[1]
    low = np.quantile(combined, 0.002, axis=0)
    high = np.quantile(combined, 0.998, axis=0)
    center = (low + high) * 0.5
    half = max(float(np.max(high - low)) * 0.58, 1e-3)
    return center, np.array([half, half], dtype=np.float64)


def _project(points: np.ndarray, camera: str, center: np.ndarray, half: np.ndarray, size: int) -> tuple[np.ndarray, np.ndarray]:
    axes, depth_axis, signs = CAMERAS[camera]
    projected = points[:, axes].astype(np.float64).copy()
    projected[:, 0] *= signs[0]
    projected[:, 1] *= signs[1]
    normalized = (projected - center) / half
    x = np.rint((normalized[:, 0] * 0.45 + 0.5) * (size - 1)).astype(np.int32)
    y = np.rint((0.5 - normalized[:, 1] * 0.45) * (size - 1)).astype(np.int32)
    depth = points[:, depth_axis]
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
    valid = visible & (pixels[:, 0] >= 4) & (pixels[:, 0] < size - 4) & (pixels[:, 1] >= 4) & (pixels[:, 1] < size - 4)
    indices = np.flatnonzero(valid)
    indices = indices[np.argsort(depth[indices], kind="stable")]
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
        m3 = render_positions(_m3_positions(source, target, route, t), source, target, label=f"M3 v1  t={t:.2f}")
        m4_eval = evaluate(program, source, target, t, viewport="desktop", reduced=False)
        m4 = render_evaluation(m4_eval, source, target, label=f"M4 v2  t={t:.2f}")
        tiles.extend([(f"M3 {t:.2f}", m3), (f"M4 {t:.2f}", m4)])
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


def render_all() -> dict[str, Any]:
    _, _, evaluate, load_records, _ = _core()
    manifest_m3, _, _ = __import__("orchestration").validate_frozen_m3()
    manifest_m4 = read_json(EXPORT_DIR / "ps03m4-manifest.json")
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
    boards.append(("12-m3-vs-m4.png", _board("12 · Frozen M3 v1 vs M4 v2", _m3_vs_m4_tiles(worst, manifest_m3, evaluate, load_records), columns=5)))

    for filename, board in boards:
        _save(board, approval_dir / filename, outputs)

    # Additional named technical boards required by the visual QA contract.
    _save(_board("Group / bridge debug", _strip_tiles(split, manifest_m3, evaluate, load_records, (0.24, 0.30, 0.50, 0.68, 0.72), mode="groups"), columns=5), RENDER_DIR / "boards" / "group-bridge-debug.png", outputs)
    _save(_board("Screen-space silhouettes · canonical / opposite / side / top", [(camera, _frame(worst, manifest_m3, evaluate, load_records, 0.5, camera=camera, mode="silhouette")[0]) for camera in CAMERAS], columns=4), RENDER_DIR / "boards" / "screen-silhouettes.png", outputs)
    _save(_board("Dense full-N worst-case sheet", [tile for t in (0.0, 0.1, 0.2, 0.35, 0.5, 0.65, 0.75, 0.9, 1.0) for tile in _strip_tiles(worst, manifest_m3, evaluate, load_records, (t,))], columns=5), RENDER_DIR / "boards" / "dense-worst-cases.png", outputs)
    _save(_board("M3 v1 vs M4 v2 synchronized", _m3_vs_m4_tiles(worst, manifest_m3, evaluate, load_records), columns=5), RENDER_DIR / "boards" / "m3-vs-m4.png", outputs)
    _save(_trails_board(worst, manifest_m3, profile, evaluate, load_records), RENDER_DIR / "boards" / "selected-id-trails.png", outputs)
    risk_contact_tiles = []
    for entry in entries:
        image, _, _, _ = _frame(entry, manifest_m3, evaluate, load_records, 0.5, size=180)
        label = f"{entry['artifactId']} | {entry['sourceStateId'][:16]} -> {entry['targetStateId'][:16]}"
        risk_contact_tiles.append((label, image))
    risk_contact_path = RENDER_DIR / "boards" / "all-35-risk-suite-contact-sheet.png"
    _save(_board("All 35 risk-suite programs | t=0.50", risk_contact_tiles, columns=5), risk_contact_path, outputs)

    manifest_path = EXPORT_DIR / "ps03m4-manifest.json"
    qa_path = REPORT_DIR / "ps03m4-qa-summary.json"
    qa = read_json(qa_path) if qa_path.exists() else {}
    source_manifest = read_json(manifest_path)
    evidence = {
        "stage": "PS-03.M4",
        "renderer": "Pillow/NumPy deterministic orthographic full-N point rasterizer",
        "rendererVersion": f"Pillow {PIL.__version__}",
        "geometryOnly": True,
        "neutralTechnicalValuesOnly": True,
        "cameraPresets": list(CAMERAS),
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
        "mediaEncoding": "not available (ffmpeg not found); PNG source frames are the source of truth",
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
    write_json(REPORT_DIR / "ps03m4-visual-evidence.json", evidence)
    print(f"rendered {len(outputs)} PS-03.M4 deterministic evidence PNGs")
    return evidence


def record_review(note: str) -> dict[str, Any]:
    path = REPORT_DIR / "ps03m4-visual-evidence.json"
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
