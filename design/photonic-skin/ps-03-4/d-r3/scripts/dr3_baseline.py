"""Read-only PS-03.3 baseline access for the D-R3 recovery pass.

Opens the protected PS-03.3 production blend, verifies every inherited
contract hash and returns the positions/faces/UV/mask data.  Never writes
into PS-03.3 or the immutable D-R2 tree.  Can also export a JSON cache into
d-r3/exports/_baseline_cache.json so that pure-python tooling can iterate
without launching Blender.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import bpy


SCRIPT_PATH = Path(__file__).resolve()
D_R3_DIR = SCRIPT_PATH.parent.parent
PS034_DIR = D_R3_DIR.parent
REPO_DIR = PS034_DIR.parents[2]
PS032_SCRIPTS = REPO_DIR / "design" / "photonic-skin" / "ps-03-2" / "scripts"
PS033_BLEND = (
    REPO_DIR
    / "design"
    / "photonic-skin"
    / "ps-03-3"
    / "blender"
    / "photonic-skin-c-r1-associative-morph-system.blend"
)
CANONICAL_MASTER_HASH = (
    "54af439e6a4ce68f87fcfa20f8ef3d9c124aa62b416d8c29569fd37a18c55469"
)
CACHE_PATH = D_R3_DIR / "exports" / "_baseline_cache.json"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


validation = load_module("ps032_validation_for_dr3", PS032_SCRIPTS / "validate_ps03_2.py")


def read_baseline():
    if not PS033_BLEND.exists():
        raise FileNotFoundError(PS033_BLEND)
    bpy.ops.wm.open_mainfile(filepath=str(PS033_BLEND))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one PS-03.3 mesh, found {len(meshes)}")
    obj = meshes[0]
    keys = obj.data.shape_keys.key_blocks
    expected = ["MASTER", *validation.TARGET_NAMES]
    if [key.name for key in keys] != expected:
        raise RuntimeError("Unexpected PS-03.3 shape key order")
    positions = {key.name: [tuple(point.co) for point in key.data] for key in keys}
    faces = [tuple(poly.vertices) for poly in obj.data.polygons]
    uv_layer = obj.data.uv_layers.get("MimicCoreUV") or obj.data.uv_layers.active
    uv_values = [tuple(item.uv) for item in uv_layer.data]
    point_mask = [item.value for item in obj.data.attributes["_PHOTONIC_MASK"].data]
    point_slot = [item.value for item in obj.data.attributes["_PHOTONIC_SLOT"].data]
    active_faces = json.loads(obj.get("photonicMaskFaceIndices", "[]"))

    checks = {
        "topology_hash": validation.topology_hash(faces)
        == validation.EXPECTED_TOPOLOGY_HASH,
        "mask_face_count": len(active_faces) == validation.EXPECTED_MASK_FACE_COUNT,
        "mask_hash": validation.mask_index_hash(active_faces)
        == validation.EXPECTED_MASK_HASH,
        "master_hash": validation.positions_hash(positions["MASTER"])
        == CANONICAL_MASTER_HASH,
        "vertex_count": len(positions["MASTER"]) == validation.EXPECTED_VERTICES,
    }
    if not all(checks.values()):
        raise RuntimeError(f"PS-03.3 baseline contract mismatch: {checks}")
    return {
        "positions": positions,
        "master": positions["MASTER"],
        "faces": faces,
        "uv_values": uv_values,
        "point_mask": point_mask,
        "point_slot": point_slot,
        "active_faces": active_faces,
        "baseline_checks": checks,
    }


def export_cache():
    source = read_baseline()
    tension_delta = [
        (t[0] - m[0], t[1] - m[1], t[2] - m[2])
        for m, t in zip(source["master"], source["positions"]["TRANSITION_TENSION"])
    ]
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(
        json.dumps(
            {
                "master": source["master"],
                "faces": source["faces"],
                "active_faces": source["active_faces"],
                "tension_delta": tension_delta,
                "preserved_positions": {
                    name: source["positions"][name]
                    for name in (
                        "BRAND_WIDE",
                        "COMPLEX_FOCUS",
                        "COMPLEX_GATHER",
                        "COMPLEX_DRIVE",
                        "TRANSITION_TENSION",
                    )
                },
            },
            separators=(",", ":"),
        ),
        encoding="utf8",
    )
    print("PS034_DR3_BASELINE_CACHE", CACHE_PATH, len(source["master"]), "vertices")


if __name__ == "__main__":
    export_cache()
