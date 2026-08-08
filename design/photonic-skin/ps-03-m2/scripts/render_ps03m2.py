"""PS-03.M2 control renders (Blender 4.x).

Reads only the build artifacts (manifest, meshes, vertex-attribute fields and
coverage samples) and renders, for every target in the library:

  canonical / opposite / side / top beauty, silhouettes 180 and 96 px,
  component debug, zone debug, coverage previews at 8192 and 1024, a mobile
  preview, and one isolated render per atomic component.

Camera, lighting and material come from the PS-03.M render pipeline, which is
imported rather than copied so the whole Photonic Skin family keeps one look.

Run:
  blender -b --factory-startup -noaudio -P render_ps03m2.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
ROOT = SCRIPT_DIR.parents[3]
sys.path.insert(0, str(ROOT / "design" / "photonic-skin" / "ps-03-m" / "scripts"))

import render_ps03m as base  # noqa: E402  (shared camera / light / material)

EXPORT_DIR = STAGE_DIR / "exports"
RENDER_DIR = STAGE_DIR / "renders"
PANEL_DIR = RENDER_DIR / "_panels"

NEUTRAL = np.array([0.913, 0.890, 0.847])
COMPONENT_PALETTE = np.array(
    [
        [0.18, 0.42, 0.95],
        [0.98, 0.45, 0.10],
        [0.30, 0.82, 0.45],
        [0.92, 0.24, 0.55],
        [0.85, 0.80, 0.20],
        [0.55, 0.35, 0.90],
    ]
)
ZONE_BASE = np.array([0.16, 0.17, 0.19])
ZONE_DENSITY = np.array([0.62, 0.64, 0.68])
ZONE_FEATURE = np.array([0.98, 0.62, 0.10])
ZONE_SILHOUETTE = np.array([0.12, 0.78, 0.92])

SAMPLE_STRIDE = 28
VERTEX_STRIDE = 8


def srgb_to_linear(value: np.ndarray) -> np.ndarray:
    low = value / 12.92
    high = ((value + 0.055) / 1.055) ** 2.4
    return np.where(value <= 0.04045, low, high)


def load_manifest() -> dict:
    return json.loads(
        (EXPORT_DIR / "ps03m2-library-manifest.json").read_text("utf8")
    )


def load_mesh(entry: dict) -> tuple[np.ndarray, np.ndarray]:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    for line in (STAGE_DIR / entry["meshPath"]).read_text("utf8").splitlines():
        if line.startswith("v "):
            parts = line.split()
            vertices.append((float(parts[1]), float(parts[2]), float(parts[3])))
        elif line.startswith("f "):
            parts = line.split()
            faces.append(
                (int(parts[1]) - 1, int(parts[2]) - 1, int(parts[3]) - 1)
            )
    return np.array(vertices, dtype=np.float64), np.array(faces, dtype=np.int64)


def load_vertex_attributes(entry: dict) -> dict:
    info = entry["vertexAttributes"]
    raw = np.frombuffer(
        (STAGE_DIR / info["path"]).read_bytes(), dtype=np.uint8
    ).reshape(info["count"], VERTEX_STRIDE)
    return {
        "component": raw[:, 0].astype(np.int64),
        "feature": raw[:, 1] / 255.0,
        "silhouette": raw[:, 2] / 255.0,
        "density": raw[:, 3] / 255.0,
        "rgb": raw[:, 4:7] / 255.0,
        "chroma": raw[:, 7] / 255.0,
    }


def load_samples(blob: bytes, index: dict) -> dict:
    count = index["count"]
    offset = index["offset"]
    position = np.frombuffer(blob, np.float32, count * 3, offset).reshape(count, 3)
    normal = np.frombuffer(
        blob, np.float32, count * 3, offset + count * 12
    ).reshape(count, 3)
    flags = np.frombuffer(
        blob, np.uint8, count * 4, offset + count * 24
    ).reshape(count, 4)
    return {
        "position": position.astype(np.float64),
        "normal": normal.astype(np.float64),
        "component": flags[:, 0].astype(np.int64),
        "feature": flags[:, 1] / 255.0,
        "silhouette": flags[:, 2] / 255.0,
        "density": flags[:, 3] / 255.0,
    }


def new_scene():
    scene = base.clear_scene()
    base.add_lights()
    return scene


def add_surface(name: str, vertices, faces, colors: np.ndarray, smooth=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices.tolist(), [], faces.tolist())
    mesh.validate()
    if smooth:
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    rgba = np.ones((len(vertices), 4), dtype=np.float32)
    rgba[:, :3] = srgb_to_linear(np.clip(colors, 0.0, 1.0))
    attr = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    attr.data.foreach_set("color", rgba.ravel())
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(base.make_material(f"{name}-mat"))
    return obj


def add_plates(name: str, samples: dict, radius: float, colors: np.ndarray):
    count = len(samples["position"])
    rotations = (np.arange(count) * 2.39996323) % (2.0 * np.pi)
    angle = np.arange(6) * (np.pi / 3.0)
    template = np.stack([np.cos(angle), np.sin(angle)], axis=1)
    ca, sa = np.cos(rotations)[:, None], np.sin(rotations)[:, None]
    local_x = template[None, :, 0] * ca - template[None, :, 1] * sa
    local_y = template[None, :, 0] * sa + template[None, :, 1] * ca

    normals = samples["normal"]
    helper = np.where(
        np.abs(normals[:, 2:3]) < 0.94,
        np.array([[0.0, 0.0, 1.0]]),
        np.array([[1.0, 0.0, 0.0]]),
    )
    tangent = np.cross(helper, normals)
    tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-9)
    bitangent = np.cross(normals, tangent)

    world = (
        samples["position"][:, None, :]
        + tangent[:, None, :] * local_x[:, :, None] * radius
        + bitangent[:, None, :] * local_y[:, :, None] * radius
    ).reshape(-1, 3)
    tri = np.array([[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5]])
    faces = (tri[None, :, :] + (np.arange(count) * 6)[:, None, None]).reshape(-1, 3)

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(world.tolist(), [], faces.tolist())
    mesh.validate()
    rgba = np.ones((count * 6, 4), dtype=np.float32)
    rgba[:, :3] = srgb_to_linear(np.repeat(np.clip(colors, 0, 1), 6, axis=0))
    attr = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    attr.data.foreach_set("color", rgba.ravel())
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(base.make_material(f"{name}-mat"))
    return obj


def framing(vertices: np.ndarray):
    lo, hi = vertices.min(axis=0), vertices.max(axis=0)
    centre = (lo + hi) * 0.5
    extent = float(np.linalg.norm(vertices - centre, axis=1).max())
    return centre, extent


def beauty_colors(attributes: dict) -> np.ndarray:
    chroma = attributes["chroma"][:, None]
    return NEUTRAL[None, :] * (1.0 - chroma) + attributes["rgb"] * chroma


def component_colors(component: np.ndarray) -> np.ndarray:
    return COMPONENT_PALETTE[component % len(COMPONENT_PALETTE)]


def zone_colors(feature: np.ndarray, silhouette: np.ndarray,
                density: np.ndarray) -> np.ndarray:
    colors = ZONE_BASE[None, :] + (ZONE_DENSITY - ZONE_BASE)[None, :] * density[:, None]
    colors = colors * (1.0 - silhouette[:, None]) + ZONE_SILHOUETTE[None, :] * silhouette[:, None]
    return colors * (1.0 - feature[:, None]) + ZONE_FEATURE[None, :] * feature[:, None]


def render_target(target_id: str, entry: dict, blob: bytes,
                  family_extent: float) -> None:
    vertices, faces = load_mesh(entry)
    attributes = load_vertex_attributes(entry)
    centre, extent = framing(vertices)

    new_scene()
    add_surface("skin", vertices, faces, beauty_colors(attributes))
    for view, angles in base.STATE_VIEWS.items():
        base.place_camera(bpy.context.scene, centre, extent, *angles)
        base.render(RENDER_DIR / f"ps03m2_{target_id}_{view}.png")
    base.place_camera(bpy.context.scene, centre, extent, *base.STATE_VIEWS["canonical"])
    base.render(RENDER_DIR / f"ps03m2_{target_id}_mobile.png", (390, 640))
    # Shared framing so the comparison board really is one scale: every
    # target carries the same volume, only the surface differs.
    base.place_camera(
        bpy.context.scene, centre, family_extent, *base.STATE_VIEWS["canonical"]
    )
    base.render(PANEL_DIR / f"family_{target_id}.png", (640, 480))

    scene = new_scene()
    surface = add_surface("sil", vertices, faces, np.zeros((len(vertices), 3)))
    surface.data.materials.clear()
    surface.data.materials.append(base.make_material("sil", emission_black=True))
    base.silhouette_setup(white=True)
    base.place_camera(scene, centre, extent, *base.STATE_VIEWS["canonical"])
    base.render(PANEL_DIR / f"silhouette_{target_id}_180.png", (180, 135))
    base.render(PANEL_DIR / f"silhouette_{target_id}_96.png", (96, 72))

    new_scene()
    add_surface("components", vertices, faces, component_colors(attributes["component"]))
    base.place_camera(bpy.context.scene, centre, extent, *base.STATE_VIEWS["canonical"])
    base.render(RENDER_DIR / f"ps03m2_{target_id}_debug_components.png")

    new_scene()
    add_surface(
        "zones", vertices, faces,
        zone_colors(attributes["feature"], attributes["silhouette"],
                    attributes["density"]),
    )
    base.place_camera(bpy.context.scene, centre, extent, *base.STATE_VIEWS["canonical"])
    base.render(RENDER_DIR / f"ps03m2_{target_id}_debug_zones.png")

    component_ids = entry["componentIds"]
    if len(component_ids) > 1:
        for index, component_id in enumerate(component_ids):
            mask = attributes["component"] == index
            keep = np.flatnonzero(mask)
            remap = -np.ones(len(vertices), dtype=np.int64)
            remap[keep] = np.arange(len(keep))
            face_mask = mask[faces].all(axis=1)
            if not face_mask.any():
                continue
            new_scene()
            add_surface(
                f"c-{index}", vertices[keep], remap[faces[face_mask]],
                beauty_colors(attributes)[keep],
            )
            sub_centre, sub_extent = framing(vertices[keep])
            base.place_camera(
                bpy.context.scene, sub_centre, sub_extent,
                *base.STATE_VIEWS["canonical"]
            )
            base.render(
                PANEL_DIR / f"component_{target_id}_{component_id}.png", (640, 480)
            )

    coverage_index = entry.get("coverageSamplesIndex") or {}
    for budget, index in sorted(coverage_index.items(), key=lambda kv: -int(kv[0])):
        samples = load_samples(blob, index)
        new_scene()
        add_plates(
            f"plates-{budget}", samples, index["plateRadius"],
            np.tile(NEUTRAL, (len(samples["position"]), 1)) * 0.55
            + component_colors(samples["component"]) * 0.45,
        )
        base.place_camera(
            bpy.context.scene, centre, extent, *base.STATE_VIEWS["canonical"]
        )
        base.render(RENDER_DIR / f"ps03m2_{target_id}_coverage_{budget}.png")


def main() -> None:
    manifest = load_manifest()
    blob = (EXPORT_DIR / "ps03m2-coverage-samples.bin").read_bytes()
    index = manifest["coverageSamples"]["index"]
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    PANEL_DIR.mkdir(parents=True, exist_ok=True)
    family_extent = max(
        framing(load_mesh(entry)[0])[1] for entry in manifest["targets"].values()
    )
    for target_id, entry in sorted(manifest["targets"].items()):
        entry = dict(entry)
        entry["coverageSamplesIndex"] = index.get(target_id, {})
        print(f"rendering {target_id}")
        render_target(target_id, entry, blob, family_extent)
    print("PS-03.M2 renders complete")


if __name__ == "__main__":
    main()
