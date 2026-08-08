"""Blender evidence renderer for neutral PS-03.M3 geometry and transitions."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import bpy
import numpy as np


M3_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = Path(__file__).resolve().parents[4]
PUBLIC_DIR = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3"
OUTPUT_DIR = M3_DIR / "renders"
BUDGET = 2048

STATE_DTYPE = np.dtype([
    ("position", "<f4", (3,)), ("normal", "<i2", (3,)),
    ("orientation", "<i2", (4,)), ("scale", "<f2"),
    ("reserveDepth", "<f2"), ("component", "u1"), ("shell", "u1"),
    ("status", "u1"), ("flags", "u1"), ("density", "u1"),
    ("transitionGroup", "u1"), ("lodPriority", "<u2"), ("_padding", "u1", (2,)),
])
TRANSITION_DTYPE = np.dtype([
    ("route", "<f4", (3,)), ("phaseOffset", "<f2"),
    ("activationStart", "<f2"), ("activationEnd", "<f2"),
    ("group", "u1"), ("flags", "u1"), ("_padding", "u1", (2,)),
])
OCTA = np.asarray([
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
], dtype=np.float64)
OCTA_FACES = ((0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5))
CAMERAS = {
    "canonical": (5.6, -6.4, 4.1),
    "opposite": (-5.6, 6.4, 4.1),
    "side": (0.0, -8.6, 1.2),
    "top": (0.01, -0.01, 9.2),
}


def load_state(entry: dict) -> np.ndarray:
    return np.fromfile(PUBLIC_DIR / entry["bufferPath"], dtype=STATE_DTYPE)


def rotate_offsets(offsets: np.ndarray, quaternions: np.ndarray) -> np.ndarray:
    xyz = quaternions[:, None, :3]
    w = quaternions[:, None, 3:4]
    uv = np.cross(xyz, offsets)
    uuv = np.cross(xyz, uv)
    return offsets + 2.0 * (w * uv + uuv)


def mesh_payload(positions: np.ndarray, scales: np.ndarray, quaternions: np.ndarray) -> tuple[list, list]:
    count = len(positions)
    offsets = np.broadcast_to(OCTA, (count, len(OCTA), 3)).copy()
    offsets *= (np.asarray(scales, dtype=np.float64)[:, None, None] * 0.035)
    rotated = rotate_offsets(offsets, quaternions)
    vertices = (positions[:, None, :] + rotated).reshape(-1, 3)
    faces = [tuple(base + value for value in face) for index in range(count) for base in [index * 6] for face in OCTA_FACES]
    return vertices.tolist(), faces


def state_frame(records: np.ndarray, budget: int = BUDGET) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    records = records[:budget]
    visible = records["status"] == 0
    quaternions = records["orientation"].astype(np.float64) / 32767.0
    quaternions /= np.maximum(np.linalg.norm(quaternions, axis=1, keepdims=True), 1e-12)
    return records["position"].astype(np.float64)[visible], records["scale"].astype(np.float64)[visible], quaternions[visible]


def transition_frame(source: np.ndarray, target: np.ndarray, route: np.ndarray, t: float, budget: int = BUDGET) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    source, target, route = source[:budget], target[:budget], route[:budget]
    smooth = t ** 3 * (10.0 + t * (-15.0 + 6.0 * t))
    hump = 64.0 * t ** 3 * (1.0 - t) ** 3
    positions = source["position"].astype(np.float64) + (target["position"] - source["position"]) * smooth + route["route"] * hump
    scales = source["scale"].astype(np.float64) + (target["scale"].astype(np.float64) - source["scale"]) * smooth
    q0 = source["orientation"].astype(np.float64) / 32767.0
    q1 = target["orientation"].astype(np.float64) / 32767.0
    signs = np.where(np.sum(q0 * q1, axis=1, keepdims=True) < 0.0, -1.0, 1.0)
    quaternions = q0 + (q1 * signs - q0) * smooth
    quaternions /= np.maximum(np.linalg.norm(quaternions, axis=1, keepdims=True), 1e-12)
    status = source["status"].astype(np.float64) + (target["status"] - source["status"]) * smooth
    visible = status < 0.45
    return positions[visible], scales[visible], quaternions[visible]


def configure_scene() -> tuple[bpy.types.Object, bpy.types.Object]:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_percentage = 100
    scene.world.color = (0.004, 0.006, 0.008)
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass

    material = bpy.data.materials.new("PS03M3 neutral")
    material.diffuse_color = (0.50, 0.53, 0.52, 1.0)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (0.42, 0.46, 0.45, 1.0)
    principled.inputs["Roughness"].default_value = 0.66
    principled.inputs["Metallic"].default_value = 0.04

    mesh = bpy.data.meshes.new("PS03M3 element cloud")
    actor = bpy.data.objects.new("PS03M3 actor", mesh)
    bpy.context.collection.objects.link(actor)
    actor.data.materials.append(material)

    camera_data = bpy.data.cameras.new("PS03M3 camera")
    camera = bpy.data.objects.new("PS03M3 camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.data.lens = 58
    scene.camera = camera

    key_data = bpy.data.lights.new("Key", "AREA")
    key_data.energy = 1050
    key_data.shape = "DISK"
    key_data.size = 5.5
    key = bpy.data.objects.new("Key", key_data)
    key.location = (3.5, -4.8, 7.2)
    bpy.context.collection.objects.link(key)
    key.rotation_euler = (-key.location).to_track_quat("-Z", "Y").to_euler()

    fill_data = bpy.data.lights.new("Fill", "AREA")
    fill_data.energy = 650
    fill_data.size = 4.0
    fill = bpy.data.objects.new("Fill", fill_data)
    fill.location = (-4.0, 1.5, 3.0)
    fill.rotation_euler = (-fill.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(fill)
    return actor, camera


def point_camera(camera: bpy.types.Object, preset: str) -> None:
    camera.location = CAMERAS[preset]
    direction = -camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render(
    actor: bpy.types.Object,
    camera: bpy.types.Object,
    name: str,
    frame: tuple[np.ndarray, np.ndarray, np.ndarray],
    preset: str = "canonical",
    resolution: int = 512,
    subdirectory: str | None = None,
) -> Path:
    positions, scales, quaternions = frame
    vertices, faces = mesh_payload(positions, scales, quaternions)
    mesh = bpy.data.meshes.new(f"mesh-{name}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    old_mesh = actor.data
    actor.data = mesh
    if not actor.data.materials:
        actor.data.materials.append(bpy.data.materials["PS03M3 neutral"])
    bpy.data.meshes.remove(old_mesh)
    point_camera(camera, preset)
    bpy.context.scene.render.resolution_x = resolution
    bpy.context.scene.render.resolution_y = resolution
    path = OUTPUT_DIR / subdirectory / f"{name}.png" if subdirectory else OUTPUT_DIR / f"{name}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return path


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for generated_directory in (OUTPUT_DIR / "family", OUTPUT_DIR / "transition-frames"):
        if generated_directory.exists():
            shutil.rmtree(generated_directory)
    manifest = json.loads((PUBLIC_DIR / "manifest.json").read_text(encoding="utf-8"))
    state_entries = {entry["stateId"]: entry for entry in manifest["states"]}
    records = {state_id: load_state(entry) for state_id, entry in state_entries.items()}
    actor, camera = configure_scene()
    outputs = []

    state_ids = ["master-neutral"] + [f"single-{name}" for name in ("content", "design", "digital", "event", "games", "merch", "video")]
    state_ids += [
        "complex-focus-content-design-digital-event-focus-content",
        "brand-wide-gather-content-design-digital-event-games-merch-video",
        "brand-wide-drive-content-design-digital-event-games-merch-video",
    ]
    for state_id in state_ids:
        outputs.append(render(actor, camera, state_id, state_frame(records[state_id])))

    gather_id = "brand-wide-gather-content-design-digital-event-games-merch-video"
    for preset in CAMERAS:
        outputs.append(render(actor, camera, f"{gather_id}-{preset}", state_frame(records[gather_id]), preset))

    transition_entry = next(entry for entry in manifest["transitions"] if entry["routeKind"] == "brand-wide-master")
    source = records[transition_entry["fromState"]]
    target = records[transition_entry["toState"]]
    route = np.fromfile(PUBLIC_DIR / transition_entry["bufferPath"], dtype=TRANSITION_DTYPE)
    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        outputs.append(render(actor, camera, f"transition-{int(t * 100):03d}", transition_frame(source, target, route, t)))

    canonical_entries = [entry for entry in manifest["states"] if entry["isCanonicalCombination"] and entry["stateRole"] != "master"]
    for entry in canonical_entries:
        outputs.append(render(
            actor,
            camera,
            entry["stateId"],
            state_frame(records[entry["stateId"]], budget=512),
            resolution=256,
            subdirectory="family",
        ))

    for entry in manifest["transitions"]:
        transition_source = records[entry["fromState"]]
        transition_target = records[entry["toState"]]
        transition_route = np.fromfile(PUBLIC_DIR / entry["bufferPath"], dtype=TRANSITION_DTYPE)
        for t in (0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0):
            outputs.append(render(
                actor,
                camera,
                f"t-{int(t * 100):03d}",
                transition_frame(transition_source, transition_target, transition_route, t, budget=512),
                resolution=256,
                subdirectory=f"transition-frames/{entry['transitionId']}",
            ))

    report = {
        "stage": "PS-03.M3",
        "renderer": bpy.app.version_string,
        "engine": bpy.context.scene.render.engine,
        "geometryOnly": True,
        "neutralMaterialOnly": True,
        "lodBudget": BUDGET,
        "familyLodBudget": 512,
        "transitionEvidenceLodBudget": 512,
        "canonicalFamilyStateCount": len(canonical_entries),
        "transitionFrameStripCount": len(manifest["transitions"]),
        "renderCount": len(outputs),
        "renders": [
            {"path": path.relative_to(REPO_DIR).as_posix(), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            for path in outputs
        ],
    }
    (M3_DIR / "reports" / "ps03m3-render-evidence.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"rendered {len(outputs)} PS-03.M3 evidence frames")


if __name__ == "__main__":
    main()
