"""PS-04.M5.2 Event variant authoring.

Versioned copy of the frozen coordinate pipeline:

* M2 SDF providers / target_library (imported, not edited)
* M3 identity sampling (imported, not edited)
* M3.1R rigid yaw helper (imported, not edited)

BASELINE is the frozen SINGLE Event buffer. EVENT_A is that buffer with an
extra +180° world-Z rigid rotation. EVENT_B/C are new SDF targets sampled onto
the same 16,384 persistent IDs with the existing stratified prefix rule.
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
PUBLIC_VARIANTS = REPO_DIR / "public" / "photonic-skin" / "ps-04-m5-2" / "variants"

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
EVENT_YAW = 18.0
PIVOT = np.asarray([0.0, 0.0, 0.0], dtype=np.float64)
BASELINE_HASH = "b14a3b2f8571e3e7d39be074aecbdeb6dd4ca51097c6433db25b622c3394a933"
COMPONENT_IDS = ("stage-deck", "portal-arch", "figure-left", "figure-centre", "figure-right")
EVENT_PART = {
    "stage-deck": 0,
    "portal-arch": 0,
    "figure-centre": 1,
    "figure-left": 2,
    "figure-right": 3,
}
EVENT_PART_NAMES = ("stage", "figure-centre", "figure-left", "figure-right")


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def figure_provider() -> dict:
    return {
        "provider": "smooth_union",
        "params": {"k": 0.045},
        "children": [
            {
                "provider": "tapered_capsule",
                "params": {"a": [0.0, 0.0, -0.34], "b": [0.0, 0.0, 0.16], "radiusA": 0.248, "radiusB": 0.188},
            },
            {"provider": "sphere", "params": {"radius": 0.198, "center": [0.0, 0.0, 0.40]}},
        ],
    }


def open_arch_provider(*, left_x: float, right_x: float, lintel_z: float, post_half_z: float) -> dict:
    return {
        "provider": "smooth_union",
        "params": {"k": 0.04},
        "children": [
            {"provider": "rounded_box", "params": {"half": [0.085, 0.085, post_half_z], "center": [left_x, 0.0, 0.04], "radius": 0.055}},
            {"provider": "rounded_box", "params": {"half": [0.085, 0.085, post_half_z], "center": [right_x, 0.0, 0.02], "radius": 0.055}},
            {"provider": "capsule", "params": {"a": [left_x, 0.0, lintel_z], "b": [right_x, 0.04, lintel_z + 0.06], "radius": 0.085}},
        ],
    }


def figure_zones() -> dict:
    return {
        "featureZones": [{"zoneId": "head", "importance": 1.5, "falloff": 0.05, "region": {"provider": "sphere", "params": {"radius": 0.22, "center": [0.0, 0.0, 0.40]}}}],
        "silhouetteZones": [{"zoneId": "figure-profile", "importance": 1.4, "falloff": 0.06, "region": {"provider": "capsule", "params": {"a": [0.0, 0.0, -0.34], "b": [0.0, 0.0, 0.42], "radius": 0.26}}}],
        "densityZones": [{"zoneId": "figure-density", "weight": 1.5, "falloff": 0.07, "region": {"provider": "capsule", "params": {"a": [0.0, 0.0, -0.32], "b": [0.0, 0.0, 0.44], "radius": 0.28}}}],
        "colorZones": [{"zoneId": "figure-head-tint", "competencyId": "event", "falloff": 0.04, "region": {"provider": "sphere", "params": {"radius": 0.20, "center": [0.0, 0.0, 0.40]}}}],
        "transitionAnchors": [
            {"anchorId": "primary-axis", "kind": "primaryAxis", "point": [0.0, 0.0, 0.0], "direction": [0.0, 0.0, 1.0]},
            {"anchorId": "foot-neck", "kind": "splitNeck", "point": [0.0, 0.0, -0.32], "direction": [0.0, 0.0, 1.0], "radius": 0.18},
        ],
    }


def deck_component(*, translate: list[float], radii: list[float], thickness: float, mass: float, attached: bool) -> dict:
    return {
        "componentId": "stage-deck",
        "semanticRole": "structure",
        "connectivityRole": "separate" if not attached else "separate",
        "canonicalTransform": {"translate": translate, "rotateDeg": [0.0, 0.0, 0.0], "scale": 1.0},
        "massWeight": mass,
        "minimumMassWeight": 0.18,
        "geometryProvider": {"provider": "rounded_plate", "params": {"radii": radii, "thickness": thickness, "edgeRadius": 0.07}},
        "featureZones": [{"zoneId": "deck-lip", "importance": 0.9, "falloff": 0.07, "region": {"provider": "rounded_plate", "params": {"radii": [radii[0] + 0.04, radii[1] + 0.04], "thickness": thickness + 0.2, "edgeRadius": 0.06}}}],
        "silhouetteZones": [{"zoneId": "deck-edge", "importance": 1.0, "falloff": 0.07, "region": {"provider": "rounded_plate", "params": {"radii": [radii[0] + 0.06, radii[1] + 0.06], "thickness": thickness + 0.2, "edgeRadius": 0.06}}}],
        "densityZones": [{"zoneId": "edge-density", "weight": 1.0, "falloff": 0.08, "region": {"provider": "rounded_plate", "params": {"radii": radii, "thickness": thickness + 0.12, "edgeRadius": 0.06}}}],
        "colorZones": [{"zoneId": "apron-band", "competencyId": "event", "falloff": 0.05, "region": {"provider": "slab", "params": {"axis": "z", "half": 0.08, "center": [0.0, 0.0, -thickness * 0.25]}}}],
        "transitionAnchors": [{"anchorId": "primary-axis", "kind": "primaryAxis", "point": [0.0, 0.0, 0.0], "direction": [1.0, 0.0, 0.0]}],
    }


def arch_component(*, translate: list[float], mass: float, parent: str | None, left_x: float, right_x: float, lintel_z: float, post_half_z: float) -> dict:
    component = {
        "componentId": "portal-arch",
        "semanticRole": "structure",
        "connectivityRole": "attached" if parent else "separate",
        "canonicalTransform": {"translate": translate, "rotateDeg": [0.0, 0.0, 0.0], "scale": 1.0},
        "massWeight": mass,
        "minimumMassWeight": 0.10,
        "geometryProvider": open_arch_provider(left_x=left_x, right_x=right_x, lintel_z=lintel_z, post_half_z=post_half_z),
        "featureZones": [{"zoneId": "arch-opening", "importance": 1.6, "falloff": 0.08, "region": {"provider": "rounded_box", "params": {"half": [0.48, 0.22, 0.42], "radius": 0.12, "center": [0.0, 0.0, 0.08]}}}],
        "silhouetteZones": [{"zoneId": "arch-crown", "importance": 1.2, "falloff": 0.07, "region": {"provider": "capsule", "params": {"a": [left_x, 0.0, lintel_z], "b": [right_x, 0.0, lintel_z], "radius": 0.14}}}],
        "densityZones": [{"zoneId": "opening-density", "weight": 1.2, "falloff": 0.09, "region": {"provider": "rounded_box", "params": {"half": [0.70, 0.16, 0.55], "radius": 0.08, "center": [0.0, 0.0, 0.08]}}}],
        "colorZones": [{"zoneId": "lintel-band", "competencyId": "event", "falloff": 0.05, "region": {"provider": "slab", "params": {"axis": "z", "half": 0.12, "center": [0.0, 0.0, lintel_z]}}}],
        "transitionAnchors": [{"anchorId": "primary-axis", "kind": "primaryAxis", "point": [0.0, 0.0, 0.0], "direction": [0.0, 0.0, 1.0]}],
    }
    if parent:
        component["parentComponentId"] = parent
        component["attachmentBlend"] = 0.06
    return component


def figure_component(*, component_id: str, translate: list[float], rotate_z: float, scale: float, mass: float, attached: bool) -> dict:
    zones = figure_zones()
    component = {
        "componentId": component_id,
        "semanticRole": "figure",
        "connectivityRole": "attached" if attached else "separate",
        "canonicalTransform": {"translate": translate, "rotateDeg": [0.0, 0.0, rotate_z], "scale": scale},
        "massWeight": mass,
        "minimumMassWeight": 0.08,
        "geometryProvider": figure_provider(),
        **zones,
    }
    if attached:
        component["parentComponentId"] = "stage-deck"
        component["attachmentBlend"] = 0.05
    return component


def target_document(target_id: str, display_name: str, components: list[dict], expected_shells: int, notes: str) -> dict:
    return {
        "schemaVersion": "1.0.0",
        "targetId": target_id,
        "targetVersion": "1.0.0",
        "competencyId": "event",
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
        "validationPolicy": {"expectedComponents": expected_shells, "requireWatertight": True, "minThickness": 0.12, "maxAspectRatio": 4.5},
        "coverageProfiles": [8192, 4096, 2048, 1024, 512],
        "provenance": {
            "source": "PS-04.M5.2 Event associative object sandbox",
            "approvalStatus": "sandbox-candidate",
            "authored": "Versioned M5.2 SDF target; frozen M2 providers only.",
            "notes": notes,
        },
        "components": components,
    }


def event_b_definition() -> dict:
    return target_document(
        "event-open-stage",
        "Opened stage with three figures",
        [
            deck_component(translate=[0.02, 0.18, -0.62], radii=[1.02, 0.36], thickness=0.15, mass=0.22, attached=True),
            arch_component(translate=[0.04, 0.46, 0.08], mass=0.14, parent="stage-deck", left_x=-0.66, right_x=0.70, lintel_z=0.54, post_half_z=0.50),
            figure_component(component_id="figure-left", translate=[-0.50, -0.22, -0.08], rotate_z=12.0, scale=1.42, mass=0.20, attached=True),
            figure_component(component_id="figure-centre", translate=[0.05, -0.14, -0.02], rotate_z=-6.0, scale=1.58, mass=0.24, attached=True),
            figure_component(component_id="figure-right", translate=[0.54, -0.26, -0.10], rotate_z=-18.0, scale=1.36, mass=0.20, attached=True),
        ],
        expected_shells=1,
        notes="Low shallow deck, open two-post lintel behind, three thick figures on the front edge. No closed cylinder, no eye-like holes.",
    )


def event_c_definition() -> dict:
    return target_document(
        "event-four-islands",
        "Four semantic islands: three figures and an open stage",
        [
            deck_component(translate=[0.0, 0.58, -0.58], radii=[0.92, 0.32], thickness=0.14, mass=0.28, attached=False),
            arch_component(translate=[0.03, 0.78, 0.10], mass=0.15, parent="stage-deck", left_x=-0.60, right_x=0.64, lintel_z=0.52, post_half_z=0.48),
            figure_component(component_id="figure-left", translate=[-0.62, -0.52, -0.10], rotate_z=16.0, scale=1.48, mass=0.185, attached=False),
            figure_component(component_id="figure-centre", translate=[0.04, -0.42, -0.02], rotate_z=-4.0, scale=1.52, mass=0.20, attached=False),
            figure_component(component_id="figure-right", translate=[0.66, -0.56, -0.12], rotate_z=-20.0, scale=1.40, mass=0.185, attached=False),
        ],
        expected_shells=4,
        notes="People in the foreground as separate islands; open stage behind as context. One particle substance after identity sampling.",
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


def records_from_target(definition: dict) -> tuple[np.ndarray, dict, object]:
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
        if definition["targetId"] == "event-open-stage":
            shell = 0
        elif item["componentId"] in ("stage-deck", "portal-arch"):
            shell = 0
        else:
            shell = 1 + ("figure-left", "figure-centre", "figure-right").index(item["componentId"])
        importances = {
            "event-open-stage": {"stage-deck": 2.2, "portal-arch": 1.8, "figure-left": 1.35, "figure-centre": 1.5, "figure-right": 1.35},
            "event-four-islands": {"stage-deck": 2.95, "portal-arch": 2.25, "figure-left": 1.45, "figure-centre": 1.28, "figure-right": 1.38},
        }[definition["targetId"]]
        components.append({
            "selection": {
                "componentId": item["componentId"],
                "surfaceImportance": importances[item["componentId"]],
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
    qa["masterArea"] = float(master_area)
    return records, qa, compiled


def _face_geometry(vertices: np.ndarray, faces: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    tri = vertices[faces]
    crossed = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    lengths = np.linalg.norm(crossed, axis=1)
    areas = 0.5 * lengths
    normals = crossed / np.maximum(lengths[:, None], 1e-12)
    return areas, normals


def sidecar_from_records(records: np.ndarray) -> dict:
    part = np.zeros(len(records), dtype=np.uint8)
    for index, component_id in enumerate(COMPONENT_IDS):
        part[records["component"] == index] = EVENT_PART[component_id]
    counts = {name: int(np.count_nonzero((part == value) & (records["status"] == m3.STATUS_ACTIVE))) for value, name in enumerate(EVENT_PART_NAMES)}
    lod = {}
    for prefix in LOD_PREFIXES:
        active = records[:prefix]
        live = active["status"] == m3.STATUS_ACTIVE
        members = part[:prefix]
        lod[str(prefix)] = {
            name: int(np.count_nonzero(live & (members == value)))
            for value, name in enumerate(EVENT_PART_NAMES)
        }
    return {
        "eventPartNames": list(EVENT_PART_NAMES),
        "eventPart": part.tolist(),
        "activeCounts": counts,
        "lodPrefixPresence": lod,
    }


def metrics_from_records(records: np.ndarray) -> dict:
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
        "componentCounts": {str(index): int(np.count_nonzero(active & (records["component"] == index))) for index in range(5)},
        "contentHash": sha256_bytes(records.tobytes()),
        "lodPriorityIsIdentity": bool(np.array_equal(records["lodPriority"], np.arange(len(records), dtype=np.uint16))),
    }


def pairwise_distance_proof(baseline: np.ndarray, rotated: np.ndarray, yaw: float) -> dict:
    sample = min(2048, len(baseline))
    a = baseline["position"][:sample].astype(np.float64)
    b = rotated["position"][:sample].astype(np.float64)
    delta = a[:, None, :] - a[None, :, :]
    delta_b = b[:, None, :] - b[None, :, :]
    dist_a = np.linalg.norm(delta, axis=2)
    dist_b = np.linalg.norm(delta_b, axis=2)
    max_error = float(np.max(np.abs(dist_a - dist_b)))
    pivot = PIVOT
    rotation = rotation_z(yaw)
    expected = (baseline["position"].astype(np.float64) - pivot) @ rotation.T + pivot
    position_error = float(np.max(np.abs(expected - rotated["position"].astype(np.float64))))
    inverse = rotate_records(rotated, -yaw, pivot)
    inverse_error = float(np.max(np.abs(inverse["position"].astype(np.float64) - baseline["position"].astype(np.float64))))
    return {
        "sampleCount": sample,
        "maxPairwiseDistanceError": max_error,
        "maxPositionErrorVsClosedForm": position_error,
        "maxInversePositionError": inverse_error,
        "idsPreserved": True,
        "pass": max_error < 1e-4 and position_error < 1e-4 and inverse_error < 1e-4,
    }


def export_variant(name: str, records: np.ndarray, extra: dict) -> dict:
    payload = records.tobytes()
    design_bin = VARIANT_DIR / name / "single-event.state.bin"
    public_bin = PUBLIC_VARIANTS / name / "single-event.state.bin"
    write_bytes(design_bin, payload)
    write_bytes(public_bin, payload)
    sidecar = sidecar_from_records(records)
    write_json(VARIANT_DIR / name / "event-part.json", {
        "variant": name,
        "eventPartNames": sidecar["eventPartNames"],
        "activeCounts": sidecar["activeCounts"],
        "lodPrefixPresence": sidecar["lodPrefixPresence"],
    })
    write_bytes(VARIANT_DIR / name / "event-part.u8.bin", np.asarray(sidecar["eventPart"], dtype=np.uint8).tobytes())
    write_bytes(PUBLIC_VARIANTS / name / "event-part.u8.bin", np.asarray(sidecar["eventPart"], dtype=np.uint8).tobytes())
    metrics = metrics_from_records(records)
    manifest = {
        "variant": name,
        "identitySize": IDENTITY_SIZE,
        "bufferBytes": len(payload),
        "bufferPath": f"variants/{name}/single-event.state.bin",
        **metrics,
        **extra,
        "activePartCounts": sidecar["activeCounts"],
        "lodPrefixPresence": sidecar["lodPrefixPresence"],
    }
    write_json(VARIANT_DIR / name / "manifest.json", manifest)
    write_json(PUBLIC_VARIANTS / name / "manifest.json", manifest)
    return manifest


def main() -> int:
    started = time.time()
    AUTHORING_DIR.mkdir(parents=True, exist_ok=True)
    params = read_json(AUTHORING_DIR / "variant-parameters.json")
    baseline_src = PUBLIC_M31R / "states" / "single-event.state.bin"
    baseline_bytes = baseline_src.read_bytes()
    actual_hash = sha256_bytes(baseline_bytes)
    if actual_hash != BASELINE_HASH:
        raise SystemExit(f"frozen SINGLE Event hash mismatch: {actual_hash}")
    baseline = np.frombuffer(baseline_bytes, dtype=m3.STATE_DTYPE).copy()
    if len(baseline) != IDENTITY_SIZE:
        raise SystemExit(f"frozen Event N={len(baseline)}")

    write_json(AUTHORING_DIR / "targets" / "event-open-stage.target.json", event_b_definition())
    write_json(AUTHORING_DIR / "targets" / "event-four-islands.target.json", event_c_definition())

    print("[1/4] BASELINE import")
    baseline_manifest = export_variant("baseline", baseline, {
        "kind": "frozen-import",
        "source": str(baseline_src.relative_to(REPO_DIR)).replace("\\", "/"),
        "yawDegrees": EVENT_YAW,
        "importedHash": actual_hash,
        "normalized": False,
        "improved": False,
    })

    print("[2/4] EVENT_A rigid +180 Z")
    variant_a = rotate_records(baseline, 180.0, PIVOT)
    proof = pairwise_distance_proof(baseline, variant_a, 180.0)
    a_manifest = export_variant("a", variant_a, {
        "kind": "rigid-rotation-diagnostic",
        "extraYawDegrees": 180.0,
        "axis": "+Z",
        "pivot": [0.0, 0.0, 0.0],
        "baselineYawDegrees": EVENT_YAW,
        "rigidProof": proof,
    })

    print("[3/4] EVENT_B opened stage (M2 SDF compile)")
    records_b, qa_b, compiled_b = records_from_target(event_b_definition())
    records_b = rotate_records(records_b, EVENT_YAW, PIVOT)
    b_manifest = export_variant("b", records_b, {
        "kind": "opened-stage",
        "authoringYawDegrees": EVENT_YAW,
        "targetId": "event-open-stage",
        "compileQa": {key: qa_b[key] for key in qa_b if key != "nearestNeighbourMeasured2048"},
        "nearestNeighbourMeasured2048": qa_b.get("nearestNeighbourMeasured2048"),
        "normalizeScale": qa_b["normalizeScale"],
    })

    print("[4/4] EVENT_C four islands (M2 SDF compile)")
    records_c, qa_c, compiled_c = records_from_target(event_c_definition())
    records_c = rotate_records(records_c, EVENT_YAW, PIVOT)
    c_manifest = export_variant("c", records_c, {
        "kind": "four-semantic-islands",
        "authoringYawDegrees": EVENT_YAW,
        "targetId": "event-four-islands",
        "compileQa": {key: qa_c[key] for key in qa_c if key != "nearestNeighbourMeasured2048"},
        "nearestNeighbourMeasured2048": qa_c.get("nearestNeighbourMeasured2048"),
        "normalizeScale": qa_c["normalizeScale"],
    })

    summary = {
        "stage": "PS-04.M5.2",
        "elapsedSeconds": round(time.time() - started, 3),
        "parameters": params,
        "baseline": baseline_manifest,
        "a": a_manifest,
        "b": b_manifest,
        "c": c_manifest,
        "rigidProof": proof,
        "frozenSingleEventUntouched": sha256_file(baseline_src) == BASELINE_HASH,
    }
    write_json(AUTHORING_DIR / "export-log.json", summary)
    print(json.dumps({"elapsed": summary["elapsedSeconds"], "baseline": actual_hash, "a": a_manifest["contentHash"], "b": b_manifest["contentHash"], "c": c_manifest["contentHash"], "rigidPass": proof["pass"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
