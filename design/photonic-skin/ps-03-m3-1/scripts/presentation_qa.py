"""Deterministic component-ID/depth-buffer validation for M3.1 endpoints."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
from scipy import ndimage


SCRIPT_DIR = Path(__file__).resolve().parent
M31_DIR = SCRIPT_DIR.parent
REPO_DIR = M31_DIR.parents[2]
PUBLIC_DIR = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1"
STATE_DTYPE = np.dtype([
    ("position", "<f4", (3,)),
    ("normal", "<i2", (3,)),
    ("orientation", "<i2", (4,)),
    ("scale", "<f2"),
    ("reserveDepth", "<f2"),
    ("component", "u1"),
    ("shell", "u1"),
    ("status", "u1"),
    ("flags", "u1"),
    ("density", "u1"),
    ("transitionGroup", "u1"),
    ("lodPriority", "<u2"),
    ("_padding", "u1", (2,)),
])


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def unit(value: np.ndarray) -> np.ndarray:
    return value / max(float(np.linalg.norm(value)), 1e-12)


def camera_basis(camera_position: list[float]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    camera = np.asarray(camera_position, dtype=np.float64)
    forward = unit(-camera)
    right = unit(np.cross(forward, np.asarray([0.0, 0.0, 1.0])))
    up = unit(np.cross(right, forward))
    return right, up, forward


def load_records(entry: dict) -> np.ndarray:
    return np.fromfile(PUBLIC_DIR / entry["bufferPath"], dtype=STATE_DTYPE)


def profile_components(entry: dict, profile: str) -> set[int]:
    return {
        int(item["componentIndex"])
        for item in entry["componentMap"]
        if profile in item["visibleProfiles"]
    }


def owner_metadata(entry: dict) -> tuple[list[str], dict[int, int], dict[int, str]]:
    owners = list(entry["competencyIds"]) or ["master"]
    owner_index = {value: index for index, value in enumerate(owners)}
    component_owner = {
        int(item["componentIndex"]): owner_index.get(item["competencyId"], 0)
        for item in entry["componentMap"]
    }
    component_label = {
        int(item["componentIndex"]): f"{item['competencyId']}:{item['componentId']}"
        for item in entry["componentMap"]
    }
    return owners, component_owner, component_label


def projected_splats(
    manifest: dict,
    entry: dict,
    records: np.ndarray,
    view: str,
    profile: str,
) -> dict[str, np.ndarray | int | float | list[str] | dict[int, str]]:
    profile_contract = manifest["presentationContract"]["profiles"][profile]
    width = int(profile_contract["width"])
    height = int(profile_contract["height"])
    visible_components = profile_components(entry, profile)
    active = (records["status"] == 0) & np.isin(records["component"], list(visible_components))
    visible = records[active]
    frame = entry["presentationFrame"]
    translation = np.asarray(frame["translate"], dtype=np.float64)
    scale = float(frame["scale"])
    points = (visible["position"].astype(np.float64) + translation) * scale
    normals = visible["normal"].astype(np.float64) / 32767.0
    components = visible["component"].astype(np.int32)
    owners, component_owner, component_labels = owner_metadata(entry)
    owner_ids = np.asarray([component_owner[int(value)] for value in components], dtype=np.int32)
    camera_position = np.asarray(manifest["presentationContract"]["cameras"][view], dtype=np.float64)
    right, up, forward = camera_basis(camera_position.tolist())
    rel = points - camera_position
    depth = rel @ forward
    tan_half = np.tan(np.radians(float(manifest["presentationContract"]["fovDegrees"])) * 0.5)
    x_ndc = (rel @ right) / np.maximum(depth * tan_half, 1e-9)
    y_ndc = (rel @ up) / np.maximum(depth * tan_half, 1e-9)
    x = (x_ndc * 0.5 + 0.5) * (width - 1)
    y = (0.5 - y_ndc * 0.5) * (height - 1)
    world_radius = visible["scale"].astype(np.float64) * scale * 0.035
    radius = np.clip(np.ceil(world_radius / np.maximum(depth * tan_half, 1e-9) * height * 0.5), 1, 4).astype(np.int32)
    max_radius = int(radius.max(initial=1))
    expanded_pixels: list[np.ndarray] = []
    expanded_depth: list[np.ndarray] = []
    expanded_owner: list[np.ndarray] = []
    expanded_component: list[np.ndarray] = []
    expanded_shade: list[np.ndarray] = []
    for dy in range(-max_radius, max_radius + 1):
        for dx in range(-max_radius, max_radius + 1):
            member = radius * radius >= dx * dx + dy * dy
            xi = np.rint(x[member]).astype(np.int32) + dx
            yi = np.rint(y[member]).astype(np.int32) + dy
            inside = (xi >= 0) & (xi < width) & (yi >= 0) & (yi < height)
            if not bool(inside.any()):
                continue
            expanded_pixels.append(yi[inside] * width + xi[inside])
            expanded_depth.append(depth[member][inside])
            expanded_owner.append(owner_ids[member][inside])
            expanded_component.append(components[member][inside])
            expanded_shade.append(np.clip(0.48 + 0.52 * np.abs(normals[member][inside] @ forward), 0.0, 1.0))
    pixels = np.concatenate(expanded_pixels) if expanded_pixels else np.empty(0, dtype=np.int32)
    depths = np.concatenate(expanded_depth) if expanded_depth else np.empty(0, dtype=np.float64)
    expanded_owners = np.concatenate(expanded_owner) if expanded_owner else np.empty(0, dtype=np.int32)
    expanded_components = np.concatenate(expanded_component) if expanded_component else np.empty(0, dtype=np.int32)
    shades = np.concatenate(expanded_shade) if expanded_shade else np.empty(0, dtype=np.float64)
    order = np.lexsort((depths, pixels))
    sorted_pixels = pixels[order]
    first = np.ones(len(order), dtype=bool)
    if len(order) > 1:
        first[1:] = sorted_pixels[1:] != sorted_pixels[:-1]
    chosen = order[first]
    clipping = int(np.count_nonzero((x - radius < 0) | (x + radius >= width) | (y - radius < 0) | (y + radius >= height)))
    return {
        "width": width,
        "height": height,
        "owners": owners,
        "componentLabels": component_labels,
        "centerX": x,
        "centerY": y,
        "centerOwner": owner_ids,
        "centerComponent": components,
        "radius": radius,
        "pixels": pixels,
        "expandedOwners": expanded_owners,
        "expandedComponents": expanded_components,
        "chosenPixels": pixels[chosen],
        "chosenOwners": expanded_owners[chosen],
        "chosenComponents": expanded_components[chosen],
        "chosenShade": shades[chosen],
        "clippingParticles": clipping,
    }


def analyze_projection(projected: dict, entry: dict, profile: str, view: str) -> dict:
    width = int(projected["width"])
    height = int(projected["height"])
    pixels = projected["pixels"]
    expanded_owners = projected["expandedOwners"]
    expanded_components = projected["expandedComponents"]
    chosen_pixels = projected["chosenPixels"]
    chosen_owners = projected["chosenOwners"]
    chosen_components = projected["chosenComponents"]
    owner_rows = []
    for owner_id, owner in enumerate(projected["owners"]):
        isolated = np.unique(pixels[expanded_owners == owner_id])
        visible = np.unique(chosen_pixels[chosen_owners == owner_id])
        ratio = float(len(visible) / max(len(isolated), 1))
        # Fragment labelling is the expensive part of the exact buffer pass.
        # It is a shape diagnostic, so measure it once in the primary
        # canonical desktop view; all other view/profile rows retain the exact
        # coverage and depth metrics without repeating the same morphology.
        if view == "canonical" and profile == "desktop" and len(visible):
            mask = np.zeros((height, width), dtype=np.uint8)
            mask.flat[visible] = 1
            fragments = int(ndimage.label(mask, structure=np.ones((3, 3), dtype=np.uint8))[1])
        else:
            fragments = None
        ys, xs = np.divmod(visible, width) if len(visible) else (np.asarray([], dtype=np.int32), np.asarray([], dtype=np.int32))
        owner_rows.append({
            "competencyId": owner,
            "isolatedAreaPx": int(len(isolated)),
            "visibleAreaPx": int(len(visible)),
            "visibleIsolatedRatio": ratio,
            "occludedAreaPx": int(max(len(isolated) - len(visible), 0)),
            "bboxPx": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(visible) else None,
            "semanticCenterPx": [float(xs.mean()), float(ys.mean())] if len(visible) else None,
            "disconnectedFragments": fragments,
        })
    component_rows = []
    for component_index, label in projected["componentLabels"].items():
        isolated = np.unique(pixels[expanded_components == component_index])
        visible = np.unique(chosen_pixels[chosen_components == component_index])
        if len(isolated):
            component_rows.append({
                "componentIndex": int(component_index),
                "componentId": label,
                "isolatedAreaPx": int(len(isolated)),
                "visibleAreaPx": int(len(visible)),
                "visibleIsolatedRatio": float(len(visible) / max(len(isolated), 1)),
            })
    if len(chosen_pixels):
        ys, xs = np.divmod(np.unique(chosen_pixels), width)
        margin = min(float(xs.min()) / width, float(width - 1 - xs.max()) / width, float(ys.min()) / height, float(height - 1 - ys.max()) / height)
        occupied = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    else:
        margin = 0.0
        occupied = None
    centers = [row["semanticCenterPx"] for row in owner_rows if row["semanticCenterPx"]]
    distances = []
    for index, first_center in enumerate(centers):
        for second_center in centers[index + 1:]:
            distances.append(float(np.linalg.norm(np.asarray(first_center) - np.asarray(second_center))))
    return {
        "view": view,
        "profile": profile,
        "width": width,
        "height": height,
        "clippingParticles": int(projected["clippingParticles"]),
        "safeMarginRatio": margin,
        "occupiedFramePx": occupied,
        "minimumSemanticCenterDistancePx": min(distances) if distances else None,
        "owners": owner_rows,
        "components": component_rows,
    }


def render_projection(projected: dict, *, component_debug: bool = False, silhouette: bool = False) -> np.ndarray:
    width = int(projected["width"])
    height = int(projected["height"])
    canvas = np.zeros((height, width, 3), dtype=np.uint8)
    chosen = projected["chosenPixels"]
    shade = projected["chosenShade"]
    owners = projected["chosenOwners"]
    if component_debug:
        palette = np.asarray([
            [230, 92, 98], [250, 174, 62], [238, 222, 88], [86, 188, 118],
            [70, 164, 218], [128, 112, 216], [214, 104, 196], [196, 204, 210],
        ], dtype=np.float64)
        colors = palette[owners % len(palette)] * (0.72 + 0.28 * shade[:, None])
    elif silhouette:
        colors = np.full((len(chosen), 3), 232.0)
    else:
        base = np.asarray([208.0, 214.0, 212.0])
        colors = base[None, :] * (0.50 + 0.50 * shade[:, None])
    canvas.reshape(-1, 3)[chosen] = np.clip(colors, 0, 255).astype(np.uint8)
    return canvas
