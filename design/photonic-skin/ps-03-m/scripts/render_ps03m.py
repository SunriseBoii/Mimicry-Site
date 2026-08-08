"""PS-03.M control renders from the baked browser dataset (Blender 4.x).

Reads the exported manifest + binary blob (the exact data the browser
plays back) and rebuilds the instanced skin as one joined plate mesh per
requested row, plus the dark matter under-layer. Renders per end state:
canonical 3/4, opposite, side, top, silhouettes 180/96 px, debug
components, debug reserve; plus transition strips with the split and
merge moments.

Run:
  blender -b --factory-startup -noaudio -P render_ps03m.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[3]
PUBLIC_DIR = ROOT / "public" / "photonic-skin" / "ps03m"
RENDER_DIR = SCRIPT_DIR.parent / "renders"
PANEL_DIR = RENDER_DIR / "_panels"

N = 8192
NEUTRAL = (0.913, 0.890, 0.847, 1.0)
COMPONENT_COLORS = ((0.18, 0.42, 0.95, 1.0), (0.98, 0.45, 0.10, 1.0))
RESERVE_COLOR = (0.92, 0.10, 0.18, 1.0)
SURFACE_GRAY = (0.55, 0.57, 0.55, 1.0)
TRANSIT_AMBER = (0.98, 0.70, 0.15, 1.0)

STATE_VIEWS = {
    "canonical": (35.0, 20.0),
    "opposite": (215.0, 20.0),
    "side": (90.0, 8.0),
    "top": (0.0, 88.0),
}


def load_data():
    manifest = json.loads((PUBLIC_DIR / "ps03m-manifest.json").read_text("utf8"))
    blob = (PUBLIC_DIR / "ps03m-states.bin").read_bytes()
    return manifest, blob


def decode_row(manifest, blob, row: int):
    row_bytes = manifest["row_bytes"]
    base = row * row_bytes
    lo = np.array(manifest["quant_bounds"]["lo"])
    hi = np.array(manifest["quant_bounds"]["hi"])
    pos_q = np.frombuffer(blob, np.uint16, N * 3, base).reshape(N, 3)
    oct_q = np.frombuffer(blob, np.uint8, N * 2, base + N * 6).reshape(N, 2)
    scale_q = np.frombuffer(blob, np.uint8, N, base + N * 8)
    state_q = np.frombuffer(blob, np.uint8, N, base + N * 9)

    pos = lo + pos_q.astype(np.float64) / 65535.0 * (hi - lo)
    xy = oct_q.astype(np.float64) / 255.0 * 2.0 - 1.0
    z = 1.0 - np.abs(xy[:, 0]) - np.abs(xy[:, 1])
    neg = z < 0
    fixed = xy.copy()
    fixed[neg, 0] = (1 - np.abs(xy[neg, 1])) * np.sign(xy[neg, 0] + 1e-12)
    fixed[neg, 1] = (1 - np.abs(xy[neg, 0])) * np.sign(xy[neg, 1] + 1e-12)
    normals = np.stack([fixed[:, 0], fixed[:, 1], z], axis=1)
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-9)
    scale = 0.5 + scale_q.astype(np.float64) / 255.0 * 0.7
    return pos, normals, scale, state_q.copy()


def decode_colors(manifest, blob, state_index: int):
    base = manifest["color_offset"] + state_index * N * 4
    rgb = np.frombuffer(blob, np.uint8, N * 3, base).reshape(N, 3) / 255.0
    chroma = np.frombuffer(blob, np.uint8, N, base + N * 3) / 255.0
    return rgb, chroma


def decode_component(manifest, blob):
    return np.frombuffer(blob, np.uint8, N, manifest["component_offset"]).copy()


def decode_rotation(manifest, blob):
    return np.frombuffer(blob, np.float32, N, manifest["rotation_offset"]).copy()


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 960
    scene.render.film_transparent = False
    scene.eevee.taa_render_samples = 32
    world = bpy.data.worlds.new("ps03m-world")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.055, 0.06, 0.07, 1.0)
    bg.inputs[1].default_value = 1.0
    return scene


def add_lights():
    sun = bpy.data.objects.new("key", bpy.data.lights.new("key", type="SUN"))
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(50), math.radians(-18), math.radians(35))
    bpy.context.collection.objects.link(sun)

    fill_data = bpy.data.lights.new("fill", type="AREA")
    fill_data.energy = 500.0
    fill_data.size = 12.0
    fill = bpy.data.objects.new("fill", fill_data)
    fill.location = (-7, -4, 5)
    fill.rotation_euler = (math.radians(55), 0, math.radians(-50))
    bpy.context.collection.objects.link(fill)


def plate_template(rotations: np.ndarray):
    """Unit hexagon fan (6 verts, 4 tris) per id, pre-rotated in-plane."""
    ang = np.arange(6) * (np.pi / 3.0)
    base = np.stack([np.cos(ang), np.sin(ang), np.zeros(6)], axis=1)
    ca = np.cos(rotations)[:, None]
    sa = np.sin(rotations)[:, None]
    x = base[None, :, 0] * ca - base[None, :, 1] * sa
    y = base[None, :, 0] * sa + base[None, :, 1] * ca
    verts = np.stack([x, y, np.zeros_like(x)], axis=2)  # (N, 6, 3)
    faces = np.array([[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5]])
    return verts, faces


def build_skin_mesh(
    name: str,
    pos: np.ndarray,
    normals: np.ndarray,
    scale: np.ndarray,
    plate_radius: float,
    face_rgba: np.ndarray,
    rotations: np.ndarray,
    inset: float = 0.0,
    radius_mult: float = 1.0,
):
    verts_local, tri = plate_template(rotations)

    helper = np.where(
        np.abs(normals[:, 2:3]) < 0.94,
        np.array([[0.0, 0.0, 1.0]]),
        np.array([[1.0, 0.0, 0.0]]),
    )
    tangent = np.cross(helper, normals)
    tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-9)
    bitangent = np.cross(normals, tangent)

    radius = (plate_radius * radius_mult) * scale
    centers = pos - normals * inset
    world = (
        centers[:, None, :]
        + tangent[:, None, :] * verts_local[:, :, 0:1] * radius[:, None, None]
        + bitangent[:, None, :] * verts_local[:, :, 1:2] * radius[:, None, None]
    ).reshape(-1, 3)

    faces = (tri[None, :, :] + (np.arange(N) * 6)[:, None, None]).reshape(-1, 3)

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(world.tolist(), [], faces.tolist())
    mesh.validate()

    colors = np.repeat(face_rgba, 4, axis=0)  # per face
    attr = mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    loop_colors = np.repeat(colors, 3, axis=0).astype(np.float32)
    attr.data.foreach_set("color", loop_colors.ravel())

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def make_material(name: str, emission_black=False, matter=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    if emission_black:
        nodes.remove(bsdf)
        out = nodes["Material Output"]
        emit = nodes.new("ShaderNodeEmission")
        emit.inputs[0].default_value = (0, 0, 0, 1)
        links.new(emit.outputs[0], out.inputs[0])
        return mat
    if matter:
        bsdf.inputs["Base Color"].default_value = (0.045, 0.05, 0.06, 1)
        bsdf.inputs["Roughness"].default_value = 0.6
        bsdf.inputs["Metallic"].default_value = 0.2
        return mat
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.38
    bsdf.inputs["Metallic"].default_value = 0.12
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.25
    return mat


def look_at(obj, target: Vector):
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def place_camera(scene, center, extent, azimuth_deg, elevation_deg):
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 40
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    az = math.radians(azimuth_deg)
    el = math.radians(elevation_deg)
    dist = extent * 2.6 + 1.2
    cam.location = (
        center[0] + dist * math.cos(el) * math.cos(az),
        center[1] + dist * math.cos(el) * math.sin(az),
        center[2] + dist * math.sin(el),
    )
    look_at(cam, Vector(center))
    return cam


def render(path: Path, resolution=(1280, 960)):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = resolution
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def silhouette_setup(white=True):
    world = bpy.context.scene.world
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (1, 1, 1, 1) if white else (0.05, 0.06, 0.07, 1)


def face_colors_for_mode(mode, rgb, chroma, state, component):
    rgba = np.zeros((N, 4))
    rgba[:, 3] = 1.0
    if mode == "beauty":
        neutral = np.array(NEUTRAL[:3])
        rgba[:, :3] = neutral[None, :] * (1 - chroma[:, None]) + rgb * chroma[:, None]
    elif mode == "components":
        for c, col in enumerate(COMPONENT_COLORS):
            rgba[component == c, :3] = col[:3]
    elif mode == "reserve":
        rgba[:, :3] = SURFACE_GRAY[:3]
        rgba[state == 1, :3] = TRANSIT_AMBER[:3]
        rgba[state == 2, :3] = RESERVE_COLOR[:3]
    return rgba


def build_row_scene(manifest, blob, row, color_state_index, mode, statics):
    scene = clear_scene()
    add_lights()
    pos, normals, scale, state = decode_row(manifest, blob, row)
    rgb, chroma = decode_colors(manifest, blob, color_state_index)
    component, rotation = statics
    plate_radius = manifest["plate_radius"]

    face_rgba = face_colors_for_mode(mode, rgb, chroma, state, component)
    scale_draw = scale.copy()
    scale_draw[state == 2] *= 0.5

    if mode != "reserve":
        # In beauty/components modes keep reserve hidden inside (tiny).
        pass

    matter = build_skin_mesh(
        "matter", pos, normals, scale, plate_radius,
        np.tile(np.array([[0.04, 0.045, 0.055, 1.0]]), (N, 1)),
        rotation, inset=plate_radius * 0.9, radius_mult=1.75,
    )
    matter.data.materials.append(make_material("matter-mat", matter=True))

    skin = build_skin_mesh(
        "skin", pos, normals, scale_draw, plate_radius, face_rgba, rotation,
    )
    skin.data.materials.append(make_material("skin-mat"))

    center = pos.mean(axis=0)
    extent = float(np.linalg.norm(pos - center, axis=1).max())
    return scene, center, extent, (matter, skin)


def render_state_set(manifest, blob, statics):
    for name in ("sphere", "book", "game"):
        row = manifest["row_index"][f"state:{name}"]
        color_idx = ["sphere", "book", "game"].index(name)

        scene, center, extent, objs = build_row_scene(
            manifest, blob, row, color_idx, "beauty", statics
        )
        for view, (az, el) in STATE_VIEWS.items():
            place_camera(scene, center, extent, az, el)
            render(RENDER_DIR / f"ps03m_{name}_{view}.png")

        # Silhouettes.
        for obj in objs:
            obj.data.materials.clear()
            obj.data.materials.append(make_material("sil", emission_black=True))
        silhouette_setup(white=True)
        place_camera(scene, center, extent, *STATE_VIEWS["canonical"])
        render(PANEL_DIR / f"silhouette_{name}_180.png", (180, 135))
        render(PANEL_DIR / f"silhouette_{name}_96.png", (96, 72))

        # Debug renders.
        for mode in ("components", "reserve"):
            scene, center, extent, _ = build_row_scene(
                manifest, blob, row, color_idx, mode, statics
            )
            place_camera(scene, center, extent, *STATE_VIEWS["canonical"])
            render(RENDER_DIR / f"ps03m_{name}_debug_{mode}.png")


def rows_for_segment_keys(manifest, seg_index, keys):
    seg = manifest["segments"][seg_index]
    src, dst = seg["name"].split("-")
    total = manifest["keys_per_segment"]
    out = []
    for k in keys:
        if k <= 0:
            out.append(manifest["row_index"][f"state:{src}"])
        elif k >= total - 1:
            out.append(manifest["row_index"][f"state:{dst}"])
        else:
            out.append(seg["row_start"] + (k - 1))
    return out


def render_transitions(manifest, blob, statics):
    strips = {
        "sphere-book": [0, 3, 6, 9, 12],
        "book-game": [0, 3, 6, 9, 12],
        "game-sphere": [0, 3, 6, 9, 12],
    }
    # Split and merge close-ups (component-count change moments from meta).
    for seg_index, seg in enumerate(manifest["segments"]):
        comps = [m["components"] for m in seg["meta"]]
        for k in range(1, len(comps)):
            if comps[k] != comps[k - 1]:
                event = "split" if comps[k] > comps[k - 1] else "merge"
                for kk, tag in ((k - 1, "before"), (k, "after")):
                    row = rows_for_segment_keys(manifest, seg_index, [kk])[0]
                    color_idx = 2 if "game" in seg["name"] else 0
                    scene, center, extent, _ = build_row_scene(
                        manifest, blob, row, color_idx, "components", statics
                    )
                    place_camera(scene, center, extent, *STATE_VIEWS["canonical"])
                    render(
                        RENDER_DIR
                        / f"ps03m_{event}_moment_{tag}_t{seg['meta'][kk]['t']:.2f}.png"
                    )

    for seg_index, (seg_name, keys) in enumerate(strips.items()):
        rows = rows_for_segment_keys(manifest, seg_index, keys)
        src, dst = seg_name.split("-")
        color_pairs = {
            "sphere-book": (0, 1),
            "book-game": (1, 2),
            "game-sphere": (2, 0),
        }[seg_name]
        for k, row in zip(keys, rows):
            t = manifest["key_times"][k]
            color_idx = color_pairs[0] if t < 0.5 else color_pairs[1]
            scene, center, extent, _ = build_row_scene(
                manifest, blob, row, color_idx, "beauty", statics
            )
            place_camera(scene, center, extent, *STATE_VIEWS["canonical"])
            render(PANEL_DIR / f"transition_{seg_name}_k{k:02d}.png", (640, 480))


def main():
    manifest, blob = load_data()
    statics = (decode_component(manifest, blob), decode_rotation(manifest, blob))
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    PANEL_DIR.mkdir(parents=True, exist_ok=True)
    render_state_set(manifest, blob, statics)
    render_transitions(manifest, blob, statics)
    print("PS-03.M renders complete")


if __name__ == "__main__":
    main()
