"""PS-04.M5.3 Video candidate authoring.

Versioned copy of the frozen coordinate pipeline:

* M2 SDF providers / target_library (imported, not edited)
* M3 identity sampling (imported, not edited)
* M3.1R rigid yaw helper (imported, not edited)

VIDEO_BASELINE is the frozen SINGLE Video buffer.
COMBO / CAMERA candidates are new SDF targets sampled onto 16,384 persistent IDs
then rigidly yawed around +Z. Frozen PS-03 is not written.
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
AUTHORING_DIR = STAGE_DIR / "authoring"
VARIANT_DIR = STAGE_DIR / "variants"
PHOTONIC_DIR = STAGE_DIR.parent
REPO_DIR = PHOTONIC_DIR.parents[1]
M_SCRIPTS = PHOTONIC_DIR / "ps-03-m" / "scripts"
M2_SCRIPTS = PHOTONIC_DIR / "ps-03-m2" / "scripts"
M3_SCRIPTS = PHOTONIC_DIR / "ps-03-m3" / "scripts"
M31R_SCRIPTS = PHOTONIC_DIR / "ps-03-m3-1r" / "scripts"
PUBLIC_M31R = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1r"
PUBLIC_VARIANTS = REPO_DIR / "public" / "photonic-skin" / "ps-04-m5-3" / "variants"

for path in (M_SCRIPTS, M2_SCRIPTS, M3_SCRIPTS, M31R_SCRIPTS):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import mesh_ops as mo  # noqa: E402
import state_builder as m3  # noqa: E402
import target_library as tl  # noqa: E402
from m31r_core import rotation_z  # noqa: E402

V0 = 4.185075142010032
IDENTITY_SIZE = 16384
LOD_PREFIXES = (512, 1024, 2048, 4096, 8192, 12288, 16384)
BASELINE_HASH = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b"
YAW_SIGN = -1
YAW_MAGNITUDES = (20.0, 30.0, 40.0)
CLAPPER_OPEN = 34.0
PIVOT = np.asarray([0.0, 0.0, 0.0], dtype=np.float64)

COMBO_IDS = (
    "camera-body",
    "camera-lens",
    "camera-top",
    "camera-rear",
    "slate-board",
    "slate-fixed-rail",
    "slate-hinged-bar",
)
CAMERA_IDS = ("camera-body", "camera-lens", "camera-top", "camera-rear")
BASELINE_IDS = ("camera", "clapperboard")

COMBO_IMPORTANCE = {
    "camera-body": 2.4,
    "camera-lens": 2.8,
    "camera-top": 1.7,
    "camera-rear": 1.5,
    "slate-board": 2.1,
    "slate-fixed-rail": 1.6,
    "slate-hinged-bar": 2.6,
}
CAMERA_IMPORTANCE = {
    "camera-body": 2.6,
    "camera-lens": 3.0,
    "camera-top": 1.9,
    "camera-rear": 1.7,
}


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def camera_parts(*, include_clapper_clearance: bool) -> list[dict]:
    body_y = 0.18 if include_clapper_clearance else 0.0
    return [
        {
            "componentId": "camera-body",
            "semanticRole": "primary",
            "connectivityRole": "separate",
            "canonicalTransform": {"translate": [0.06, body_y, 0.02], "rotateDeg": [0.0, 0.0, 0.0], "scale": 1.0},
            "massWeight": 0.42 if include_clapper_clearance else 0.52,
            "minimumMassWeight": 0.28,
            "geometryProvider": {
                "provider": "rounded_box",
                "params": {"half": [0.36, 0.24, 0.20], "radius": 0.07},
            },
            "featureZones": [{"zoneId": "body-mass", "importance": 1.1, "falloff": 0.07, "region": {"provider": "rounded_box", "params": {"half": [0.38, 0.26, 0.22], "radius": 0.07}}}],
            "silhouetteZones": [{"zoneId": "body-profile", "importance": 1.2, "falloff": 0.07, "region": {"provider": "rounded_box", "params": {"half": [0.40, 0.26, 0.22], "radius": 0.07}}}],
            "densityZones": [{"zoneId": "body-density", "weight": 1.0, "falloff": 0.08, "region": {"provider": "rounded_box", "params": {"half": [0.36, 0.24, 0.20], "radius": 0.07}}}],
            "colorZones": [{"zoneId": "body-tint", "competencyId": "video", "falloff": 0.05, "region": {"provider": "rounded_box", "params": {"half": [0.36, 0.24, 0.20], "radius": 0.07}}}],
            "transitionAnchors": [{"anchorId": "primary-axis", "kind": "primaryAxis", "point": [0.0, 0.0, 0.0], "direction": [1.0, 0.0, 0.0]}],
        },
        {
            "componentId": "camera-lens",
            "semanticRole": "primary",
            "connectivityRole": "attached",
            "parentComponentId": "camera-body",
            "attachmentBlend": 0.04,
            "canonicalTransform": {"translate": [0.06, body_y, 0.02], "rotateDeg": [0.0, 0.0, 0.0], "scale": 1.0},
            "massWeight": 0.16 if include_clapper_clearance else 0.22,
            "minimumMassWeight": 0.10,
            "geometryProvider": {
                "provider": "smooth_union",
                "params": {"k": 0.03},
                "children": [
                    {"provider": "tapered_capsule", "params": {"a": [0.30, 0.0, 0.02], "b": [0.92, 0.0, 0.02], "radiusA": 0.155, "radiusB": 0.168}},
                    {"provider": "torus", "params": {"majorRadius": 0.175, "minorRadius": 0.048, "axis": "x", "center": [0.94, 0.0, 0.02]}},
                ],
            },
            "featureZones": [{"zoneId": "lens-front", "importance": 1.8, "falloff": 0.05, "region": {"provider": "capsule", "params": {"a": [0.62, 0.0, 0.02], "b": [0.96, 0.0, 0.02], "radius": 0.22}}}],
            "silhouetteZones": [{"zoneId": "lens-barrel", "importance": 1.7, "falloff": 0.06, "region": {"provider": "capsule", "params": {"a": [0.32, 0.0, 0.02], "b": [0.96, 0.0, 0.02], "radius": 0.20}}}],
            "densityZones": [{"zoneId": "lens-density", "weight": 1.6, "falloff": 0.07, "region": {"provider": "capsule", "params": {"a": [0.40, 0.0, 0.02], "b": [0.94, 0.0, 0.02], "radius": 0.22}}}],
            "colorZones": [{"zoneId": "lens-ring", "competencyId": "video", "falloff": 0.04, "region": {"provider": "torus", "params": {"majorRadius": 0.175, "minorRadius": 0.06, "axis": "x", "center": [0.94, 0.0, 0.02]}}}],
            "transitionAnchors": [{"anchorId": "lens-protected", "kind": "protectedZone", "region": {"provider": "capsule", "params": {"a": [0.46, 0.0, 0.02], "b": [0.92, 0.0, 0.02], "radius": 0.22}}}],
        },
        {
            "componentId": "camera-top",
            "semanticRole": "structure",
            "connectivityRole": "attached",
            "parentComponentId": "camera-body",
            "attachmentBlend": 0.04,
            "canonicalTransform": {"translate": [0.06, body_y, 0.02], "rotateDeg": [0.0, 0.0, 0.0], "scale": 1.0},
            "massWeight": 0.07 if include_clapper_clearance else 0.14,
            "minimumMassWeight": 0.05,
            "geometryProvider": {
                "provider": "smooth_union",
                "params": {"k": 0.03},
                "children": [
                    {"provider": "rounded_box", "params": {"half": [0.20, 0.055, 0.055], "radius": 0.035, "center": [-0.02, 0.02, 0.30]}},
                    {"provider": "rounded_box", "params": {"half": [0.07, 0.10, 0.07], "radius": 0.035, "center": [0.10, 0.16, 0.18]}},
                ],
            },
            "featureZones": [{"zoneId": "handle", "importance": 1.3, "falloff": 0.06, "region": {"provider": "rounded_box", "params": {"half": [0.22, 0.08, 0.08], "radius": 0.04, "center": [-0.02, 0.02, 0.30]}}}],
            "silhouetteZones": [{"zoneId": "top-asymmetry", "importance": 1.3, "falloff": 0.06, "region": {"provider": "rounded_box", "params": {"half": [0.22, 0.16, 0.16], "radius": 0.04, "center": [0.04, 0.08, 0.24]}}}],
            "densityZones": [{"zoneId": "top-density", "weight": 1.1, "falloff": 0.07, "region": {"provider": "rounded_box", "params": {"half": [0.22, 0.12, 0.14], "radius": 0.04, "center": [0.04, 0.08, 0.24]}}}],
            "colorZones": [{"zoneId": "top-tint", "competencyId": "video", "falloff": 0.05, "region": {"provider": "rounded_box", "params": {"half": [0.20, 0.08, 0.08], "radius": 0.04, "center": [-0.02, 0.02, 0.30]}}}],
            "transitionAnchors": [{"anchorId": "top-handle", "kind": "splitNeck", "point": [-0.02, 0.02, 0.30], "direction": [0.0, 0.0, 1.0], "radius": 0.10}],
        },
        {
            "componentId": "camera-rear",
            "semanticRole": "structure",
            "connectivityRole": "attached",
            "parentComponentId": "camera-body",
            "attachmentBlend": 0.04,
            "canonicalTransform": {"translate": [0.06, body_y, 0.02], "rotateDeg": [0.0, 0.0, 0.0], "scale": 1.0},
            "massWeight": 0.05 if include_clapper_clearance else 0.12,
            "minimumMassWeight": 0.04,
            "geometryProvider": {
                "provider": "rounded_box",
                "params": {"half": [0.09, 0.16, 0.14], "radius": 0.045, "center": [-0.42, 0.0, 0.0]},
            },
            "featureZones": [{"zoneId": "battery", "importance": 1.0, "falloff": 0.06, "region": {"provider": "rounded_box", "params": {"half": [0.11, 0.18, 0.16], "radius": 0.05, "center": [-0.42, 0.0, 0.0]}}}],
            "silhouetteZones": [{"zoneId": "rear-block", "importance": 1.1, "falloff": 0.06, "region": {"provider": "rounded_box", "params": {"half": [0.12, 0.18, 0.16], "radius": 0.05, "center": [-0.42, 0.0, 0.0]}}}],
            "densityZones": [{"zoneId": "rear-density", "weight": 1.0, "falloff": 0.07, "region": {"provider": "rounded_box", "params": {"half": [0.10, 0.16, 0.14], "radius": 0.05, "center": [-0.42, 0.0, 0.0]}}}],
            "colorZones": [{"zoneId": "rear-tint", "competencyId": "video", "falloff": 0.05, "region": {"provider": "rounded_box", "params": {"half": [0.09, 0.16, 0.14], "radius": 0.05, "center": [-0.42, 0.0, 0.0]}}}],
            "transitionAnchors": [{"anchorId": "rear-block", "kind": "splitNeck", "point": [-0.42, 0.0, 0.0], "direction": [-1.0, 0.0, 0.0], "radius": 0.12}],
        },
    ]


def clapper_parts() -> list[dict]:
    board_half = [0.50, 0.055, 0.32]
    rail_half = [0.50, 0.045, 0.055]
    bar_half = [0.48, 0.040, 0.048]
    return [
        {
            "componentId": "slate-board",
            "semanticRole": "secondary",
            "connectivityRole": "separate",
            "canonicalTransform": {"translate": [0.10, -0.78, 0.04], "rotateDeg": [8.0, 0.0, 12.0], "scale": 1.0},
            "massWeight": 0.18,
            "minimumMassWeight": 0.10,
            "geometryProvider": {
                "provider": "rounded_box",
                "params": {"half": board_half, "radius": 0.04},
            },
            "featureZones": [{"zoneId": "board-face", "importance": 1.2, "falloff": 0.06, "region": {"provider": "rounded_box", "params": {"half": [0.52, 0.07, 0.34], "radius": 0.04}}}],
            "silhouetteZones": [{"zoneId": "board-rect", "importance": 1.3, "falloff": 0.06, "region": {"provider": "rounded_box", "params": {"half": [0.54, 0.08, 0.34], "radius": 0.04}}}],
            "densityZones": [{"zoneId": "board-density", "weight": 1.1, "falloff": 0.07, "region": {"provider": "rounded_box", "params": {"half": board_half, "radius": 0.04}}}],
            "colorZones": [{"zoneId": "board-tint", "competencyId": "video", "falloff": 0.05, "region": {"provider": "rounded_box", "params": {"half": board_half, "radius": 0.04}}}],
            "transitionAnchors": [{"anchorId": "board-axis", "kind": "primaryAxis", "point": [0.0, 0.0, 0.0], "direction": [1.0, 0.0, 0.0]}],
        },
        {
            "componentId": "slate-fixed-rail",
            "semanticRole": "secondary",
            "connectivityRole": "attached",
            "parentComponentId": "slate-board",
            "attachmentBlend": 0.03,
            "canonicalTransform": {"translate": [0.10, -0.78, 0.04], "rotateDeg": [8.0, 0.0, 12.0], "scale": 1.0},
            "massWeight": 0.06,
            "minimumMassWeight": 0.03,
            "geometryProvider": {
                "provider": "smooth_union",
                "params": {"k": 0.02},
                "children": [
                    {"provider": "rounded_box", "params": {"half": rail_half, "radius": 0.03, "center": [0.0, -0.02, 0.355]}},
                    {"provider": "capsule", "params": {"a": [-0.48, -0.02, 0.355], "b": [-0.48, -0.02, 0.46], "radius": 0.045}},
                ],
            },
            "featureZones": [{"zoneId": "hinge-knuckle", "importance": 1.4, "falloff": 0.05, "region": {"provider": "capsule", "params": {"a": [-0.48, -0.02, 0.34], "b": [-0.48, -0.02, 0.48], "radius": 0.07}}}],
            "silhouetteZones": [{"zoneId": "top-rail", "importance": 1.2, "falloff": 0.06, "region": {"provider": "rounded_box", "params": {"half": [0.52, 0.06, 0.08], "radius": 0.03, "center": [0.0, -0.02, 0.36]}}}],
            "densityZones": [{"zoneId": "rail-density", "weight": 1.2, "falloff": 0.07, "region": {"provider": "rounded_box", "params": {"half": rail_half, "radius": 0.03, "center": [0.0, -0.02, 0.355]}}}],
            "colorZones": [{"zoneId": "rail-tint", "competencyId": "video", "falloff": 0.05, "region": {"provider": "rounded_box", "params": {"half": rail_half, "radius": 0.03, "center": [0.0, -0.02, 0.355]}}}],
            "transitionAnchors": [{"anchorId": "hinge", "kind": "splitNeck", "point": [-0.48, -0.02, 0.36], "direction": [1.0, 0.0, 0.0], "radius": 0.08}],
        },
        {
            "componentId": "slate-hinged-bar",
            "semanticRole": "secondary",
            "connectivityRole": "attached",
            "parentComponentId": "slate-board",
            "attachmentBlend": 0.02,
            "canonicalTransform": {"translate": [0.10, -0.78, 0.04], "rotateDeg": [8.0, 0.0, 12.0], "scale": 1.0},
            "massWeight": 0.06,
            "minimumMassWeight": 0.03,
            "geometryProvider": {
                "provider": "rounded_box",
                "params": {"half": bar_half, "radius": 0.028},
                "transform": {"translate": [0.02, -0.22, 0.52], "rotateDeg": [-CLAPPER_OPEN, 0.0, 0.0]},
            },
            "featureZones": [{"zoneId": "open-bar", "importance": 1.8, "falloff": 0.05, "region": {"provider": "rounded_box", "params": {"half": [0.50, 0.08, 0.08], "radius": 0.03, "center": [0.02, -0.22, 0.52]}}}],
            "silhouetteZones": [{"zoneId": "raised-bar", "importance": 1.8, "falloff": 0.05, "region": {"provider": "rounded_box", "params": {"half": [0.52, 0.10, 0.10], "radius": 0.03, "center": [0.02, -0.22, 0.52]}}}],
            "densityZones": [{"zoneId": "bar-density", "weight": 1.5, "falloff": 0.06, "region": {"provider": "rounded_box", "params": {"half": [0.50, 0.08, 0.08], "radius": 0.03, "center": [0.02, -0.22, 0.52]}}}],
            "colorZones": [{"zoneId": "bar-tint", "competencyId": "video", "falloff": 0.04, "region": {"provider": "rounded_box", "params": {"half": bar_half, "radius": 0.03}}}],
            "transitionAnchors": [{"anchorId": "clapper-bar", "kind": "splitNeck", "point": [0.02, -0.22, 0.52], "direction": [1.0, 0.0, 0.0], "radius": 0.10}],
        },
    ]


def target_document(target_id: str, display_name: str, components: list[dict], expected: int, notes: str) -> dict:
    return {
        "schemaVersion": "1.0.0",
        "targetId": target_id,
        "targetVersion": "1.0.0",
        "competencyId": "video",
        "displayName": display_name,
        "targetRole": "competency",
        "canonicalCoordinateSystem": {
            "handedness": "right",
            "upAxis": "+Z",
            "forwardAxis": "+X",
            "rightAxis": "-Y",
            "units": "photonic-skin authoring units (V0 sphere radius = 1.0)",
            "originPolicy": "canonicalBoundsCenter",
        },
        "canonicalTransform": {"translate": [0.0, 0.0, 0.0], "rotateDeg": [0.0, 0.0, 0.0], "scale": 1.0},
        "geometryRepresentation": "procedural-sdf",
        "normalizationPolicy": {"mode": "uniformCompositeVolume", "volumeTolerance": 0.01, "masterVolumeRef": "sphere-master"},
        "validationPolicy": {"expectedComponents": expected, "requireWatertight": True, "minThickness": 0.10, "maxAspectRatio": 5.5},
        "coverageProfiles": [8192, 4096, 2048, 1024, 512],
        "provenance": {
            "source": "PS-04.M5.3 Video associative object sandbox",
            "approvalStatus": "sandbox-candidate",
            "authored": "Versioned M5.3 SDF target; frozen M2 providers only.",
            "notes": notes,
        },
        "components": components,
    }


def combo_definition() -> dict:
    return target_document(
        "video-camera-clapper-m53",
        "Camera + open clapperboard",
        [*camera_parts(include_clapper_clearance=True), *clapper_parts()],
        expected=7,
        notes="Compact cine-camera with distinct lens; landscape slate with narrow raised hinged bar. No book spine, no equal pages, no required stripes.",
    )


def camera_only_definition() -> dict:
    return target_document(
        "video-camera-only-m53",
        "Camera without clapperboard",
        camera_parts(include_clapper_clearance=False),
        expected=4,
        notes="Camera-only control. Same camera anatomy, no slate.",
    )


def rotate_records(records: np.ndarray, yaw_degrees: float, pivot: np.ndarray) -> np.ndarray:
    result = records.copy()
    rotation = rotation_z(yaw_degrees)
    positions = result["position"].astype(np.float64)
    normals = result["normal"].astype(np.float64) / 32767.0
    rotated_positions = (positions - pivot) @ rotation.T + pivot
    rotated_normals = normals @ rotation.T
    lengths = np.maximum(np.linalg.norm(rotated_normals, axis=1, keepdims=True), 1e-12)
    rotated_normals /= lengths
    result["position"] = rotated_positions.astype(np.float32)
    result["normal"] = np.round(np.clip(rotated_normals, -1, 1) * 32767).astype(np.int16)
    orientation = m3._quaternion_from_z(rotated_normals)
    result["orientation"] = np.round(np.clip(orientation, -1, 1) * 32767).astype(np.int16)
    return result


def _face_geometry(vertices: np.ndarray, faces: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    tri = vertices[faces]
    crossed = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    lengths = np.linalg.norm(crossed, axis=1)
    areas = 0.5 * lengths
    normals = crossed / np.maximum(lengths[:, None], 1e-12)
    return areas, normals


def records_from_target(definition: dict, importance: dict[str, float]) -> tuple[np.ndarray, dict]:
    compiled = tl.build_target(definition, V0)
    vertices = compiled.vertices
    faces = compiled.faces
    authoring = compiled.to_authoring(vertices)
    fields = [compiled.component_fields[item["componentId"]] for item in definition["components"]]
    stacked = np.stack([field(authoring) for field in fields], axis=1)
    vertex_owner = np.argmin(stacked, axis=1).astype(np.int32)
    face_owner = np.array([np.bincount(vertex_owner[face], minlength=len(fields)).argmax() for face in faces], dtype=np.int32)
    centroids = vertices[faces].mean(axis=1)
    centroid_auth = compiled.to_authoring(centroids)
    feature = tl.zone_family_mask(compiled.zones["feature"], centroid_auth)
    silhouette = tl.zone_family_mask(compiled.zones["silhouette"], centroid_auth)
    normals = mo.sdf_gradient(compiled.field, centroids)
    curvature = mo.mean_curvature_estimate(compiled.field, centroids, eps=0.03)
    density = tl.density_field(compiled.zones, centroid_auth, normals, curvature)
    density_norm = np.clip(density / max(float(density.max()), 1e-9), 0.0, 1.0)
    face_attrs = np.column_stack((feature, silhouette, density_norm))
    face_areas, face_normals = _face_geometry(vertices, faces)
    components = []
    for index, item in enumerate(definition["components"]):
        mask = face_owner == index
        if not np.any(mask):
            raise ValueError(f"{definition['targetId']}: component {item['componentId']} has no faces")
        shell = 0 if item["componentId"].startswith("camera") else 1
        components.append({
            "selection": {
                "componentId": item["componentId"],
                "surfaceImportance": importance[item["componentId"]],
                "canonicalTransform": {"scale": 1.0},
            },
            "vertices": vertices,
            "faces": faces[mask],
            "areas": face_areas[mask],
            "normals": face_normals[mask],
            "attrs": face_attrs[mask],
            "exposed": np.ones(int(mask.sum()), dtype=bool),
            "shell": shell,
        })

    class Geometry:
        pass

    geometry = Geometry()
    geometry.components = components
    geometry.exposed_surface_area = float(sum(component["areas"].sum() for component in components))
    master_area = 4.0 * np.pi
    records, qa = m3.build_state_records(geometry, IDENTITY_SIZE, float(master_area))
    qa["targetId"] = definition["targetId"]
    qa["normalizeScale"] = float(compiled.normalize_scale)
    qa["meshVertexCount"] = int(len(vertices))
    qa["meshFaceCount"] = int(len(faces))
    qa["shellCount"] = int(len({component["shell"] for component in components}))
    qa["surfaceArea"] = float(geometry.exposed_surface_area)
    return records, qa


def sidecar_from_records(records: np.ndarray, component_ids: tuple[str, ...]) -> dict:
    live = records["status"] == m3.STATUS_ACTIVE
    counts = {name: int(np.count_nonzero(live & (records["component"] == index))) for index, name in enumerate(component_ids)}
    lod = {}
    for prefix in LOD_PREFIXES:
        active = records[:prefix]
        prefix_live = active["status"] == m3.STATUS_ACTIVE
        lod[str(prefix)] = {
            name: int(np.count_nonzero(prefix_live & (active["component"] == index)))
            for index, name in enumerate(component_ids)
        }
    return {"componentIds": list(component_ids), "activeCounts": counts, "lodPrefixPresence": lod}


def metrics_from_records(records: np.ndarray, component_ids: tuple[str, ...]) -> dict:
    active = records["status"] == m3.STATUS_ACTIVE
    points = records["position"][active].astype(np.float64)
    low, high = points.min(axis=0), points.max(axis=0)
    centroid = points.mean(axis=0)
    return {
        "n": int(len(records)),
        "activeCount": int(active.sum()),
        "reserveCount": int((records["status"] == m3.STATUS_RESERVE).sum()),
        "subsurfaceCount": int((records["status"] == m3.STATUS_SUBSURFACE).sum()),
        "finite": bool(np.isfinite(records["position"]).all()),
        "bbox": {"min": [float(v) for v in low], "max": [float(v) for v in high], "size": [float(v) for v in high - low]},
        "centroid": [float(v) for v in centroid],
        "componentCounts": {name: int(np.count_nonzero(active & (records["component"] == index))) for index, name in enumerate(component_ids)},
        "contentHash": sha256_bytes(records.tobytes()),
        "lodPriorityIsIdentity": bool(np.array_equal(records["lodPriority"], np.arange(len(records), dtype=np.uint16))),
    }


def component_map(component_ids: tuple[str, ...]) -> list[dict]:
    profiles = ["desktop", "mobile390", "silhouette180", "silhouette96"]
    return [
        {
            "componentIndex": index,
            "componentId": name,
            "competencyId": "video",
            "visibleProfiles": list(profiles),
        }
        for index, name in enumerate(component_ids)
    ]


def export_variant(name: str, records: np.ndarray, component_ids: tuple[str, ...], extra: dict) -> dict:
    payload = records.tobytes()
    write_bytes(VARIANT_DIR / name / "single-video.state.bin", payload)
    write_bytes(PUBLIC_VARIANTS / name / "single-video.state.bin", payload)
    sidecar = sidecar_from_records(records, component_ids)
    write_json(VARIANT_DIR / name / "component-map.json", {
        "variant": name,
        "componentIds": sidecar["componentIds"],
        "activeCounts": sidecar["activeCounts"],
        "lodPrefixPresence": sidecar["lodPrefixPresence"],
        "componentMap": component_map(component_ids),
    })
    write_json(PUBLIC_VARIANTS / name / "component-map.json", {
        "variant": name,
        "componentIds": sidecar["componentIds"],
        "componentMap": component_map(component_ids),
    })
    metrics = metrics_from_records(records, component_ids)
    manifest = {
        "variant": name,
        "identitySize": IDENTITY_SIZE,
        "bufferBytes": len(payload),
        "bufferPath": f"variants/{name}/single-video.state.bin",
        **metrics,
        **extra,
        "activePartCounts": sidecar["activeCounts"],
        "lodPrefixPresence": sidecar["lodPrefixPresence"],
        "componentMap": component_map(component_ids),
    }
    write_json(VARIANT_DIR / name / "manifest.json", manifest)
    write_json(PUBLIC_VARIANTS / name / "manifest.json", manifest)
    return manifest


def main() -> int:
    started = time.time()
    AUTHORING_DIR.mkdir(parents=True, exist_ok=True)
    params = json.loads((AUTHORING_DIR / "parameters.json").read_text(encoding="utf-8"))
    baseline_src = PUBLIC_M31R / "states" / "single-video.state.bin"
    baseline_bytes = baseline_src.read_bytes()
    actual_hash = sha256_bytes(baseline_bytes)
    if actual_hash != BASELINE_HASH:
        raise SystemExit(f"frozen SINGLE Video hash mismatch: {actual_hash}")
    baseline = np.frombuffer(baseline_bytes, dtype=m3.STATE_DTYPE).copy()
    if len(baseline) != IDENTITY_SIZE:
        raise SystemExit(f"frozen Video N={len(baseline)}")

    combo_def = combo_definition()
    camera_def = camera_only_definition()
    write_json(AUTHORING_DIR / "targets" / "video-camera-clapper-m53.target.json", combo_def)
    write_json(AUTHORING_DIR / "targets" / "video-camera-only-m53.target.json", camera_def)

    print("[1/4] VIDEO_BASELINE import")
    baseline_manifest = export_variant("baseline", baseline, BASELINE_IDS, {
        "kind": "frozen-import",
        "hudName": "VIDEO_BASELINE",
        "source": str(baseline_src.relative_to(REPO_DIR)).replace("\\", "/"),
        "signedYawDegrees": None,
        "importedHash": actual_hash,
        "normalized": False,
    })

    print("[2/4] COMBO SDF compile")
    combo_records, combo_qa = records_from_target(combo_def, COMBO_IMPORTANCE)
    combo_manifests = {}
    for magnitude in YAW_MAGNITUDES:
        yaw = YAW_SIGN * magnitude
        name = f"combo-{int(magnitude)}"
        print(f"    yaw {yaw} -> {name}")
        rotated = rotate_records(combo_records, yaw, PIVOT)
        combo_manifests[name] = export_variant(name, rotated, COMBO_IDS, {
            "kind": "camera-plus-clapper",
            "hudName": f"VIDEO_COMBO_{int(magnitude)}",
            "signedYawDegrees": yaw,
            "yawAxis": "+Z",
            "clapperOpenDegrees": CLAPPER_OPEN,
            "targetId": combo_def["targetId"],
            "compileQa": {key: combo_qa[key] for key in combo_qa if key != "nearestNeighbourMeasured2048"},
        })

    print("[3/4] CAMERA-ONLY SDF compile")
    camera_records, camera_qa = records_from_target(camera_def, CAMERA_IMPORTANCE)
    camera_manifests = {}
    for magnitude in YAW_MAGNITUDES:
        yaw = YAW_SIGN * magnitude
        name = f"camera-{int(magnitude)}"
        print(f"    yaw {yaw} -> {name}")
        rotated = rotate_records(camera_records, yaw, PIVOT)
        camera_manifests[name] = export_variant(name, rotated, CAMERA_IDS, {
            "kind": "camera-only",
            "hudName": f"VIDEO_CAMERA_{int(magnitude)}",
            "signedYawDegrees": yaw,
            "yawAxis": "+Z",
            "targetId": camera_def["targetId"],
            "compileQa": {key: camera_qa[key] for key in camera_qa if key != "nearestNeighbourMeasured2048"},
        })

    summary = {
        "stage": "PS-04.M5.3",
        "elapsedSeconds": round(time.time() - started, 3),
        "parameters": params,
        "baseline": baseline_manifest,
        "combo": combo_manifests,
        "camera": camera_manifests,
        "frozenSingleVideoUntouched": sha256_file(baseline_src) == BASELINE_HASH,
        "yawSign": YAW_SIGN,
        "signedYawDegrees": [YAW_SIGN * value for value in YAW_MAGNITUDES],
    }
    write_json(AUTHORING_DIR / "export-log.json", summary)
    print(json.dumps({
        "elapsed": summary["elapsedSeconds"],
        "baseline": actual_hash,
        "combo30": combo_manifests["combo-30"]["contentHash"],
        "camera30": camera_manifests["camera-30"]["contentHash"],
        "frozenUntouched": summary["frozenSingleVideoUntouched"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
