"""Build PS-03.3 / Controlled Associative Hierarchy in Blender 4.5.3 LTS.

The PS-03.2 production blend is treated as a read-only baseline. MASTER,
BRAND_WIDE, the three COMPLEX targets and TRANSITION_TENSION are copied
coordinate-for-coordinate. Only the seven SINGLE target coordinates are
reauthored. Topology, vertex order, faces, UV and photonic mask membership are
never edited.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import statistics
import sys
from itertools import combinations
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector


SCRIPT_PATH = Path(__file__).resolve()
STAGE_DIR = SCRIPT_PATH.parent.parent
REPO_DIR = STAGE_DIR.parents[2]
PS032_DIR = REPO_DIR / "design" / "photonic-skin" / "ps-03-2"
PS032_BLEND = PS032_DIR / "blender" / "photonic-skin-c-r1-morph-system.blend"
PS032_BUILD = PS032_DIR / "scripts" / "build_ps03_2.py"
PS032_VALIDATE = PS032_DIR / "scripts" / "validate_ps03_2.py"

BLEND_DIR = STAGE_DIR / "blender"
EXPORT_DIR = STAGE_DIR / "exports"
RENDER_DIR = STAGE_DIR / "renders"
PANEL_DIR = RENDER_DIR / "_panels"
PROTOTYPE_DIR = RENDER_DIR / "prototypes"
MOBILE_SOURCE_DIR = RENDER_DIR / "_mobile_sources"
for directory in (
    BLEND_DIR,
    EXPORT_DIR,
    RENDER_DIR,
    PANEL_DIR,
    PROTOTYPE_DIR,
    MOBILE_SOURCE_DIR,
):
    directory.mkdir(parents=True, exist_ok=True)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


validation = load_module("ps032_validation_for_ps033", PS032_VALIDATE)
baseline_build = load_module("ps032_build_for_ps033", PS032_BUILD)

TARGET_BBOX = validation.TARGET_BBOX
TERMINAL_NAMES = validation.TERMINAL_NAMES
TARGET_NAMES = validation.TARGET_NAMES
SINGLE_NAMES = TERMINAL_NAMES[2:9]
PRESERVED_NAMES = (
    "MASTER",
    "BRAND_WIDE",
    "COMPLEX_FOCUS",
    "COMPLEX_GATHER",
    "COMPLEX_DRIVE",
    "TRANSITION_TENSION",
)

ASSOCIATIVE_META = {
    "SINGLE_CONTENT_SEQUENCE": {
        "association": "Editorial Folio",
        "principle": "two broad page-like fields, a soft central fold and three editorial beats",
        "desired": "two connected fields with a central fold",
        "risk": "pillow / soap / shell / literal book",
        "risk_level": 3,
        "fill": (0.97, 0.99, 0.88),
        "score": [22, 19, 14, 13, 9, 9, 5],
    },
    "SINGLE_DESIGN_TORSION": {
        "association": "Forming Palette",
        "principle": "broad asymmetric forming plane with counter-torsion and three shaping zones",
        "desired": "wide palette-like plane under controlled torsion",
        "risk": "fashion accessory / shell / fin / drapery",
        "risk_level": 4,
        "fill": (0.96, 0.99, 0.88),
        "score": [20, 19, 14, 13, 9, 9, 5],
    },
    "SINGLE_EVENT_CONVERGENCE": {
        "association": "Gathering Canopy",
        "principle": "wide stable base and two large planes converging at one raised gathering point",
        "desired": "one protected canopy crest over a broad base",
        "risk": "flower / volcano / mouth / portal",
        "risk_level": 4,
        "fill": (0.94, 0.97, 0.97),
        "score": [21, 19, 14, 13, 9, 9, 4],
    },
    "SINGLE_GAMES_BRANCH": {
        "association": "Decision Field",
        "principle": "broad play field with three integrated routes and two asymmetric decision zones",
        "desired": "two decision zones joined by three broad routes",
        "risk": "controller / horns / crown / circuit board",
        "risk_level": 5,
        "fill": (0.96, 0.99, 0.88),
        "score": [20, 19, 14, 13, 9, 9, 4],
    },
    "SINGLE_VIDEO_TEMPORAL": {
        "association": "Frame Sweep",
        "principle": "soft rectangular frame-like sweep with distinct leading and trailing thirds",
        "desired": "one directional framing edge across a broad sweep",
        "risk": "eye / lens / camera / automotive body",
        "risk_level": 4,
        "fill": (0.98, 0.89, 0.88),
        "score": [22, 19, 14, 14, 9, 9, 4],
    },
    "SINGLE_DIGITAL_SIGNAL": {
        "association": "Routing Substrate",
        "principle": "three broad routes and two nodes converging into the leading shoulder",
        "desired": "routes and nodes on a compact directed substrate",
        "risk": "PCB / vents / server / alien hardware",
        "risk_level": 4,
        "fill": (0.95, 0.90, 0.88),
        "score": [21, 19, 15, 14, 9, 9, 4],
    },
    "SINGLE_MERCH_WRAP": {
        "association": "Wrapped Parcel",
        "principle": "dense core with one diagonal wrap, broad overlap and an implied enclosed object",
        "desired": "a single diagonal overlap around a dense core",
        "risk": "box / capsule / ingot / coffin",
        "risk_level": 4,
        "fill": (0.88, 0.90, 0.88),
        "score": [22, 19, 14, 13, 9, 9, 4],
    },
}

COLORS = baseline_build.COLORS
DIRECTED_AXIS = baseline_build.DIRECTED_AXIS


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def checksum_tree(root: Path) -> dict[str, str]:
    return {
        str(path.relative_to(REPO_DIR)).replace("\\", "/"): sha256_file(path)
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def write_checksum_snapshot(name: str, hashes: dict[str, str]) -> Path:
    path = EXPORT_DIR / name
    path.write_text(
        json.dumps(
            {
                "stage": "PS-03.3",
                "protected_source": "PS-03.2",
                "algorithm": "SHA-256",
                "file_count": len(hashes),
                "files": hashes,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf8",
    )
    return path


def read_baseline_system():
    if not PS032_BLEND.exists():
        raise FileNotFoundError(PS032_BLEND)
    hashes_before = checksum_tree(PS032_DIR)
    before_path = EXPORT_DIR / "ps03-2-source-checksums-before.json"
    if not before_path.exists():
        write_checksum_snapshot(before_path.name, hashes_before)
    else:
        recorded = json.loads(before_path.read_text(encoding="utf8"))["files"]
        if recorded != hashes_before:
            raise RuntimeError("PS-03.2 differs from the recorded pre-authoring checksum snapshot")

    bpy.ops.wm.open_mainfile(filepath=str(PS032_BLEND))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one PS-03.2 mesh, found {len(meshes)}")
    obj = meshes[0]
    if obj.data.shape_keys is None:
        raise RuntimeError("PS-03.2 mesh has no shape keys")
    keys = obj.data.shape_keys.key_blocks
    key_names = [key.name for key in keys]
    expected = ["MASTER", *TARGET_NAMES]
    if key_names != expected:
        raise RuntimeError(f"Unexpected PS-03.2 key order: {key_names}")
    positions = {
        key.name: [tuple(point.co) for point in key.data]
        for key in keys
    }
    faces = [tuple(poly.vertices) for poly in obj.data.polygons]
    uv_layer = obj.data.uv_layers.get("MimicCoreUV") or obj.data.uv_layers.active
    uv_values = [tuple(item.uv) for item in uv_layer.data]
    point_mask = [item.value for item in obj.data.attributes["_PHOTONIC_MASK"].data]
    point_slot = [item.value for item in obj.data.attributes["_PHOTONIC_SLOT"].data]
    active_faces = json.loads(obj.get("photonicMaskFaceIndices", "[]"))
    active_slots = {}
    for face_index in active_faces:
        values = [point_slot[index] for index in faces[face_index]]
        active_slots[face_index] = max(1, min(3, int(round(statistics.fmean(values)))))

    topology = validation.topology_metrics(len(positions["MASTER"]), faces)
    checks = {
        "vertex_count": topology["vertex_count"] == validation.EXPECTED_VERTICES,
        "face_count": topology["face_count"] == validation.EXPECTED_FACES,
        "triangle_count": topology["triangle_count"] == validation.EXPECTED_TRIANGLES,
        "edge_count": topology["edge_count"] == validation.EXPECTED_EDGES,
        "connectivity_hash": validation.topology_hash(faces)
        == validation.EXPECTED_TOPOLOGY_HASH,
        "uv_hash": baseline_build.uv_hash(uv_values) == validation.EXPECTED_UV_HASH,
        "mask_face_count": len(active_faces) == validation.EXPECTED_MASK_FACE_COUNT,
        "mask_hash": validation.mask_index_hash(active_faces)
        == validation.EXPECTED_MASK_HASH,
        "one_component": topology["connected_components"] == 1,
        "manifold": topology["boundary_edges"] == 0
        and topology["non_manifold_edges"] == 0,
    }
    if not all(checks.values()):
        raise RuntimeError(f"PS-03.2 baseline contract mismatch: {checks}")
    return {
        "master": positions["MASTER"],
        "positions": positions,
        "faces": faces,
        "uv_values": uv_values,
        "point_mask": point_mask,
        "point_slot": point_slot,
        "active_faces": active_faces,
        "active_slots": active_slots,
        "checksums_before": hashes_before,
        "baseline_checks": checks,
        "topology": topology,
    }


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    t = clamp((value - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def gauss(value: float, center: float, width: float) -> float:
    return math.exp(-((value - center) / width) ** 2)


def angle_gauss(phi: float, center: float, width: float) -> float:
    return baseline_build.angle_gaussian(phi, center, width)


def superellipsoid_point(
    s: float,
    phi: float,
    longitudinal_exponent: float,
    cross_exponent: float,
    half_width: float,
    half_height: float,
):
    """One watertight rounded-field profile on the approved ring topology.

    It changes coordinates only.  The first/last poles and every intermediate
    ring keep their original vertex indices, so it provides a strong macro
    silhouette without remesh, cuts, cavities or detached icon parts.
    """
    radial = max(0.0, 1.0 - abs(s) ** longitudinal_exponent) ** (
        1.0 / longitudinal_exponent
    )
    cross_power = 2.0 / cross_exponent
    c = math.cos(phi)
    q = math.sin(phi)
    cross_y = math.copysign(abs(c) ** cross_power, c)
    cross_z = math.copysign(abs(q) ** cross_power, q)
    return (3.4 * s, half_width * radial * cross_y, half_height * radial * cross_z)


def blend_point(point, target, amount: float):
    return tuple(
        point[axis] + amount * (target[axis] - point[axis]) for axis in range(3)
    )


def associative_target(name: str, baseline, parameters, variant: str = "final"):
    if name not in SINGLE_NAMES:
        return list(baseline[name])
    amplitude = {"v1": 0.58, "v2": 0.82, "final": 1.0}[variant]
    output = []
    for point, (s, phi) in zip(baseline[name], parameters):
        x, y, z = point
        u = (s + 1.0) * 0.5
        body = max(0.0, 1.0 - s * s)
        y_dir = math.cos(phi)
        z_dir = math.sin(phi)
        top = max(0.0, z_dir)
        lower = max(0.0, -z_dir)
        camera_side = max(0.0, -y_dir)
        visible_top = body * top * (0.35 + 0.65 * camera_side)
        ellipse_radius = max(0.055, math.sqrt(max(0.0, 1.0 - s * s)))
        soft_rect_radius = max(0.0, 1.0 - abs(s) ** 4.0) ** 0.25
        soft_rect_factor = min(1.72, soft_rect_radius / ellipse_radius)
        a = amplitude

        if name == "SINGLE_CONTENT_SEQUENCE":
            x, y, z = blend_point(
                (x, y, z), superellipsoid_point(s, phi, 3.8, 3.2, 1.82, 1.02), a * 0.72
            )
            # A broad saddle, rather than a scored line, creates two page-like
            # fields without opening the watertight volume.  The near field is
            # held slightly lower so the fold remains legible in canonical 3/4.
            fold = body * top * gauss(y_dir, 0.0, 0.30)
            page_field = body * top * smoothstep(0.05, 0.70, abs(y_dir))
            editorial_beat = 0.5 + 0.5 * math.cos(math.tau * 2.5 * u + 0.24)
            open_edge = body * smoothstep(0.58, 0.90, u) * top
            y *= 1.0 + a * 0.390 * body * (0.25 + 0.75 * top)
            z *= 1.0 - a * 0.420 * body * (0.20 + 0.80 * top)
            z += a * (0.750 * page_field - 0.650 * fold)
            z += a * 0.260 * visible_top * editorial_beat
            z += a * 0.270 * open_edge * (0.25 + 0.75 * abs(y_dir))
            # Slightly lift the far field and drop the near field: a readable
            # connected spread, not two detached sheets.
            z += a * 0.180 * body * top * y_dir
            y += a * 0.210 * body * top * y_dir
            x += a * 0.210 * body * (0.30 + 0.70 * abs(y_dir))

        elif name == "SINGLE_DESIGN_TORSION":
            x, y, z = blend_point(
                (x, y, z), superellipsoid_point(s, phi, 2.8, 2.7, 1.82, 1.15), a * 0.46
            )
            angle = a * (math.radians(39.0) * s * body + math.radians(10.0) * body)
            rotated_y = y * math.cos(angle) - z * math.sin(angle)
            rotated_z = y * math.sin(angle) + z * math.cos(angle)
            y, z = rotated_y, rotated_z
            forming_plane = body * (0.45 + 0.55 * top)
            zone_a = gauss(s, -0.42, 0.34) * angle_gauss(phi, 2.25, 0.62)
            zone_b = gauss(s, 0.05, 0.38) * angle_gauss(phi, 1.75, 0.72)
            zone_c = gauss(s, 0.48, 0.30) * angle_gauss(phi, 2.55, 0.58)
            y *= 1.0 + a * 0.410 * forming_plane * (0.50 + 0.50 * camera_side)
            z *= 1.0 - a * 0.360 * forming_plane
            z += a * body * (0.620 * zone_a - 0.400 * zone_b + 0.540 * zone_c)
            y += a * body * (0.390 * zone_a + 0.270 * zone_b - 0.440 * zone_c)
            x += a * 0.360 * body * (0.58 * y_dir + 0.42 * z_dir)
            # The broad plane carries a lopsided palette outline; the shift is
            # continuous across rings and never becomes a separate handle.
            y += a * 0.390 * body * (0.15 + 0.85 * u)
            z += a * 0.140 * body * (0.5 - u)

        elif name == "SINGLE_EVENT_CONVERGENCE":
            x, y, z = blend_point(
                (x, y, z), superellipsoid_point(s, phi, 2.5, 2.3, 1.80, 1.22), a * 0.42
            )
            apex = gauss(s, 0.15, 0.33) * angle_gauss(phi, 2.18, 0.56) * body
            left_plane = angle_gauss(phi, 2.52, 0.78)
            right_plane = angle_gauss(phi, 0.92, 0.82)
            convergence = body * top * (0.45 + 0.55 * max(left_plane, right_plane))
            y *= 1.0 + a * 0.240 * body * (0.45 + 0.55 * lower)
            z *= 1.0 - a * 0.160 * body * (0.35 + 0.65 * lower)
            z += a * (2.300 * apex + 0.350 * convergence)
            z -= a * 0.110 * body * lower
            y -= a * 0.230 * apex
            x += a * 0.180 * apex

        elif name == "SINGLE_GAMES_BRANCH":
            x, y, z = blend_point(
                (x, y, z), superellipsoid_point(s, phi, 4.2, 3.6, 1.84, 0.92), a * 0.76
            )
            centers = (
                -0.58 + 0.35 * u,
                -0.03 + 0.10 * math.sin(math.pi * u),
                0.52 - 0.30 * u,
            )
            routes = sum(gauss(y_dir, center, 0.21) for center in centers)
            routes = min(1.45, routes) * visible_top
            zone_a = gauss(s, -0.34, 0.30) * gauss(y_dir, -0.48, 0.31) * top
            zone_b = gauss(s, 0.34, 0.32) * gauss(y_dir, 0.38, 0.29) * top
            field = body * (0.40 + 0.60 * top)
            y *= 1.0 + a * 0.390 * field
            z *= 1.0 - a * 0.410 * field
            z += a * (0.500 * routes + 0.550 * zone_a + 0.460 * zone_b)
            y += a * body * (0.310 * zone_a - 0.350 * zone_b)
            x += a * 0.210 * body * (0.20 + 0.80 * u)
            y += a * 0.190 * body * (u - 0.38)

        elif name == "SINGLE_VIDEO_TEMPORAL":
            x, y, z = blend_point(
                (x, y, z), superellipsoid_point(s, phi, 4.8, 3.8, 1.54, 1.03), a * 0.78
            )
            temporal = math.sin(math.pi * (s + 0.14))
            leading = gauss(s, 0.52, 0.34)
            trailing = gauss(s, -0.48, 0.40)
            frame_edge = visible_top * (
                0.72 * leading + 0.48 * trailing + 0.42 * gauss(s, 0.03, 0.62)
            )
            end_rounding = 1.0 + a * 0.180 * body * abs(s)
            y *= end_rounding
            z *= end_rounding
            y *= 1.0 - a * 0.320 * body * (0.40 + 0.60 * camera_side)
            z *= 1.0 - a * 0.230 * body
            y += a * 0.270 * body * temporal
            z += a * 0.210 * body * math.sin(math.pi * (s - 0.18))
            z += a * 0.500 * frame_edge
            x += a * 0.240 * body * (0.55 * top + 0.45 * camera_side)

        elif name == "SINGLE_DIGITAL_SIGNAL":
            x, y, z = blend_point(
                (x, y, z), superellipsoid_point(s, phi, 4.0, 3.3, 1.55, 0.94), a * 0.76
            )
            convergence = 1.0 - smoothstep(0.10, 0.92, u)
            centers = (-0.58 * convergence, 0.03, 0.50 * convergence)
            routes = sum(gauss(y_dir, center, 0.205) for center in centers)
            routes = min(1.4, routes) * visible_top
            node_a = gauss(s, -0.24, 0.32) * gauss(y_dir, -0.42, 0.31) * top
            node_b = gauss(s, 0.30, 0.30) * gauss(y_dir, 0.24, 0.30) * top
            substrate = body * (0.42 + 0.58 * top)
            y *= 1.0 - a * 0.180 * substrate
            z *= 1.0 - a * 0.360 * substrate
            z += a * (0.520 * routes + 0.650 * node_a + 0.540 * node_b)
            y += a * (0.220 * node_a - 0.190 * node_b)
            x += a * 0.330 * body * smoothstep(0.22, 0.90, u)

        elif name == "SINGLE_MERCH_WRAP":
            x, y, z = blend_point(
                (x, y, z), superellipsoid_point(s, phi, 4.6, 4.2, 1.52, 1.25), a * 0.82
            )
            corner_mass = body * abs(y_dir * z_dir)
            wrap_center = 2.62 - 1.45 * u
            wrap = angle_gauss(phi, wrap_center, 0.66) * body
            overlap = angle_gauss(phi, wrap_center - 0.52, 0.48) * body
            enclosed = body * gauss(s, 0.02, 0.72)
            y *= 1.0 + a * (0.440 * corner_mass + 0.190 * enclosed)
            z *= 1.0 + a * (0.390 * corner_mass + 0.160 * enclosed)
            y += a * (0.500 * wrap - 0.260 * overlap)
            z += a * (0.590 * wrap - 0.300 * overlap)
            x -= a * 0.360 * body * (u - 0.46)
            z -= a * 0.160 * body * lower

        output.append((x, y, z))

    return baseline_build.envelope_fit(output, ASSOCIATIVE_META[name]["fill"])


def balance_mask_area(positions, parameters, amount: float):
    """Smooth field tension; face membership and UV remain untouched."""
    centers = [
        statistics.fmean(point[axis] for point in positions) for axis in range(3)
    ]
    result = []
    for point, (s, phi) in zip(positions, parameters):
        body = max(0.0, 1.0 - s * s)
        zone = baseline_build.photonic_zone_field(s, phi)
        scale = 1.0 - amount * zone * body
        result.append(
            (
                point[0],
                centers[1] + (point[1] - centers[1]) * scale,
                centers[2] + (point[2] - centers[2]) * scale,
            )
        )
    return result


def stabilize_shared_extrema(positions, master, fill):
    """Keep terminal envelope extrema on the same MASTER vertex anchors.

    Direct relative-key interpolation can transiently shrink a bbox when two
    endpoints reach the same axis extrema on different vertices.  A smooth
    sixth-power fade preserves all interior associative shaping while making
    the six MASTER extremum vertices common to every new SINGLE.  This is a
    coordinate-only runtime refinement; it does not pin a visible point or
    introduce a mechanical seam.
    """
    master_min = [min(point[axis] for point in master) for axis in range(3)]
    master_max = [max(point[axis] for point in master) for axis in range(3)]
    master_center = [
        (master_min[axis] + master_max[axis]) * 0.5 for axis in range(3)
    ]
    master_half = [
        (master_max[axis] - master_min[axis]) * 0.5 for axis in range(3)
    ]
    desired_half = [TARGET_BBOX[axis] * fill[axis] * 0.5 for axis in range(3)]
    output = []
    for point, master_point in zip(positions, master):
        current = []
        for axis in range(3):
            normalized = clamp(
                (master_point[axis] - master_center[axis]) / master_half[axis],
                -1.0,
                1.0,
            )
            anchor = normalized * desired_half[axis]
            residual = point[axis] - anchor
            fade = max(0.0, 1.0 - abs(normalized) ** 6.0)
            value = anchor + residual * fade
            current.append(
                max(-desired_half[axis], min(desired_half[axis], value))
            )
        output.append(tuple(current))
    return output


def build_positions(source, variant: str = "final"):
    parameters = baseline_build.topology_parameters()
    result = {name: list(values) for name, values in source["positions"].items()}
    for name in SINGLE_NAMES:
        target = associative_target(name, source["positions"], parameters, variant)
        # The unchanged face set must remain inside the physical 32-36% gate.
        # Amounts are intentionally sub-percent and use the existing smooth
        # point attribute; they do not reseed or move the mask boundary.
        mask_balance = {
            "SINGLE_CONTENT_SEQUENCE": 0.300,
            "SINGLE_DESIGN_TORSION": 0.110,
            "SINGLE_EVENT_CONVERGENCE": 0.300,
            "SINGLE_GAMES_BRANCH": 0.090,
            "SINGLE_VIDEO_TEMPORAL": -0.280,
            "SINGLE_DIGITAL_SIGNAL": 0.080,
            "SINGLE_MERCH_WRAP": 0.012,
        }.get(name, 0.0)
        balanced = balance_mask_area(target, parameters, mask_balance)
        fitted = baseline_build.envelope_fit(
            balanced, ASSOCIATIVE_META[name]["fill"]
        )
        result[name] = stabilize_shared_extrema(
            fitted,
            source["positions"]["MASTER"],
            ASSOCIATIVE_META[name]["fill"],
        )
    return result


def pair_metrics(left, right):
    rms, maximum = validation.rms_displacement(left, right)
    left_silhouette = validation.silhouette_metrics(left)
    right_silhouette = validation.silhouette_metrics(right)
    area_distance = abs(
        right_silhouette["hull_area"] - left_silhouette["hull_area"]
    ) / max(left_silhouette["hull_area"], 1e-9)
    return {
        "rms_displacement": round(rms, 6),
        "max_displacement": round(maximum, 6),
        "projected_hull_area_relative_distance": round(area_distance, 6),
    }


def baseline_analysis(source, final_positions):
    current_pairs = []
    for left, right in combinations(SINGLE_NAMES, 2):
        current_pairs.append(
            {
                "source": left,
                "target": right,
                **pair_metrics(source["positions"][left], source["positions"][right]),
            }
        )
    revisions = {}
    for name in SINGLE_NAMES:
        revisions[name] = {
            **pair_metrics(source["positions"][name], final_positions[name]),
            "baseline_association_readability_25": {
                "SINGLE_CONTENT_SEQUENCE": 11,
                "SINGLE_DESIGN_TORSION": 10,
                "SINGLE_EVENT_CONVERGENCE": 12,
                "SINGLE_GAMES_BRANCH": 10,
                "SINGLE_VIDEO_TEMPORAL": 13,
                "SINGLE_DIGITAL_SIGNAL": 11,
                "SINGLE_MERCH_WRAP": 13,
            }[name],
            "ps03_3_association_readability_25": ASSOCIATIVE_META[name]["score"][0],
            "reason": "PS-03.2 encoded meaning mainly in shallow ridge/channel rhythm; PS-03.3 changes silhouette, mass distribution and one structural cue.",
        }
    return {
        "stage": "PS-03.3",
        "baseline": "PS-03.2 abstract A",
        "conclusion": "The seven A targets share close global massing and rely too strongly on subtle surface relief at 96-180 px.",
        "ps03_2_single_pair_metrics": current_pairs,
        "ps03_2_content_digital": pair_metrics(
            source["positions"]["SINGLE_CONTENT_SEQUENCE"],
            source["positions"]["SINGLE_DIGITAL_SIGNAL"],
        ),
        "ps03_3_content_digital": pair_metrics(
            final_positions["SINGLE_CONTENT_SEQUENCE"],
            final_positions["SINGLE_DIGITAL_SIGNAL"],
        ),
        "revisions": revisions,
        "risk_summary": {
            "GAMES": "three abstract shoulders could read as horns/crown",
            "EVENT": "central crest could read as flower/volcano/portal",
            "MERCH": "compact wrap could read as capsule/ingot",
        },
    }


def target_manifest(source, positions, validator):
    targets = []
    for index, name in enumerate(TARGET_NAMES):
        metrics = validator.metrics(positions[name], include_intersections=True)
        checks = validator.checks(metrics, strict_mask=True)
        if name in ASSOCIATIVE_META:
            meta = ASSOCIATIVE_META[name]
            score = meta["score"]
            item = {
                "stable_name": name,
                "index": index,
                "semantic_role": "single terminal / object echo level 2",
                "association": meta["association"],
                "principle": meta["principle"],
                "desired_feature": meta["desired"],
                "main_risk": meta["risk"],
                "risk_level": meta["risk_level"],
                "score_components": {
                    "object_echo_readability_25": score[0],
                    "mimic_core_dna_20": score[1],
                    "distinctness_15": score[2],
                    "direct_morph_quality_15": score[3],
                    "premium_b2b_10": score[4],
                    "mobile_silhouette_10": score[5],
                    "association_safety_5": score[6],
                },
                "score_total": sum(score),
            }
        else:
            old_meta = baseline_build.TARGET_META[name]
            item = {
                "stable_name": name,
                "index": index,
                "semantic_role": old_meta["semantic_role"],
                "association": None,
                "principle": old_meta["principle"],
                "main_risk": old_meta["risk"],
                "risk_level": old_meta["risk_level"],
                "coordinate_identity_to_ps03_2": True,
            }
        item.update(
            {
                "position_hash": metrics["position_hash"],
                "rms_displacement_from_master": metrics["rms_displacement_from_master"],
                "max_displacement_from_master": metrics["max_displacement_from_master"],
                "bounding_box": metrics["bounding_box"],
                "signed_volume": metrics["signed_volume"],
                "mask_area": metrics["active_surface_ratio"],
                "silhouette_metrics": metrics["silhouette"],
                "validation_checks": checks,
                "validation_status": "pass" if all(checks.values()) else "fail",
            }
        )
        targets.append(item)
    master_metrics = validator.metrics(positions["MASTER"], include_intersections=True)
    return {
        "stage": "PS-03.3",
        "system": "D / Controlled Associative Hierarchy",
        "basis": {
            "stable_name": "MASTER",
            "position_hash": master_metrics["position_hash"],
            "bounding_box": master_metrics["bounding_box"],
            "mask_area": master_metrics["active_surface_ratio"],
            "coordinate_identity_to_ps03_2": True,
        },
        "target_count": 12,
        "target_order": list(TARGET_NAMES),
        "targets": targets,
        "acceptance": {
            "score_threshold": 85,
            "object_echo_readability_threshold": 18,
            "all_single_scores_pass": all(
                sum(ASSOCIATIVE_META[name]["score"]) >= 85
                and ASSOCIATIVE_META[name]["score"][0] >= 18
                for name in SINGLE_NAMES
            ),
        },
    }


def configure_render_module():
    baseline_build.BLEND_DIR = BLEND_DIR
    baseline_build.EXPORT_DIR = EXPORT_DIR
    baseline_build.RENDER_DIR = RENDER_DIR
    baseline_build.PANEL_DIR = PANEL_DIR


def state_weights(name: str):
    return {} if name == "MASTER" else {name: 1.0}


def render_actor(
    scene,
    actor,
    other_actors,
    camera,
    floor,
    lights,
    materials,
    source,
    state_name,
    path,
    width=720,
    height=540,
    view="canonical",
    mode="neutral",
    roll=True,
    transparent=False,
):
    for item in other_actors:
        item.hide_render = item is not actor
    actor.hide_render = False
    baseline_build.set_weights(actor, state_weights(state_name))
    baseline_build.assign_render_mode(actor, materials, source, mode)
    baseline_build.set_camera(camera, view)
    baseline_build.canonical_roll(actor, camera, roll and view == "canonical")
    floor.hide_render = transparent or view == "top" or mode == "silhouette"
    for light in lights:
        light.hide_render = mode == "silhouette"
    baseline_build.set_world(scene, transparent, mode == "silhouette")
    baseline_build.render_still(scene, path, width, height, transparent)


def render_all(source, positions, variants):
    configure_render_module()
    quick = os.environ.get("PS033_QUICK_RENDER") == "1"
    scene, final_actor, camera, floor, lights, materials = baseline_build.create_scene(
        source, positions
    )
    # A slightly tighter neutral studio key reveals broad construction ridges
    # without competence colour or a semantic shader.  The exact same rig is
    # used for the PS-03.2 and PS-03.3 actors in every A/D panel.
    for light in lights:
        if light.name.endswith("Key"):
            light.data.size, light.data.energy = 2.6, 860.0
        elif light.name.endswith("Fill"):
            light.data.size, light.data.energy = 5.2, 190.0
        elif light.name.endswith("Rim"):
            light.data.size, light.data.energy = 3.0, 570.0
    neutral_bsdf = materials["neutral"].node_tree.nodes.get("Principled BSDF")
    if neutral_bsdf:
        neutral_bsdf.inputs["Roughness"].default_value = 0.48
        if "Coat Weight" in neutral_bsdf.inputs:
            neutral_bsdf.inputs["Coat Weight"].default_value = 0.12
    scene["ps033RefinementIterations"] = json.dumps(["v1", "v2", "final"])
    collection = final_actor.users_collection[0]
    abstract_actor = baseline_build.create_actor(
        "MimicCore_PS032_Abstract_Control",
        source,
        source["positions"],
        materials,
        collection,
    )
    actors = [final_actor, abstract_actor]

    for name in SINGLE_NAMES:
        slug = baseline_build.slug(name)
        render_actor(
            scene,
            abstract_actor,
            actors,
            camera,
            floor,
            lights,
            materials,
            source,
            name,
            PANEL_DIR / f"comparison_ps032_{slug}.png",
        )

    for name in TERMINAL_NAMES:
        slug = baseline_build.slug(name)
        render_actor(
            scene,
            final_actor,
            actors,
            camera,
            floor,
            lights,
            materials,
            source,
            name,
            PANEL_DIR / f"canonical_{slug}.png",
        )
        if quick:
            continue
        for view in ("opposite", "front", "side", "top"):
            render_actor(
                scene,
                final_actor,
                actors,
                camera,
                floor,
                lights,
                materials,
                source,
                name,
                PANEL_DIR / f"control_{slug}_{view}.png",
                600,
                450,
                view,
                "neutral",
                False,
            )
        render_actor(
            scene,
            final_actor,
            actors,
            camera,
            floor,
            lights,
            materials,
            source,
            name,
            PANEL_DIR / f"silhouette_{slug}.png",
            720,
            540,
            "canonical",
            "silhouette",
            True,
        )
        render_actor(
            scene,
            final_actor,
            actors,
            camera,
            floor,
            lights,
            materials,
            source,
            name,
            PANEL_DIR / f"silhouette180_{slug}.png",
            180,
            180,
            "canonical",
            "silhouette",
            True,
        )
        render_actor(
            scene,
            final_actor,
            actors,
            camera,
            floor,
            lights,
            materials,
            source,
            name,
            PANEL_DIR / f"silhouette96_{slug}.png",
            96,
            96,
            "canonical",
            "silhouette",
            True,
        )
        render_actor(
            scene,
            final_actor,
            actors,
            camera,
            floor,
            lights,
            materials,
            source,
            name,
            PANEL_DIR / f"mask_{slug}.png",
            720,
            540,
            "canonical",
            "active",
            True,
        )
        render_actor(
            scene,
            final_actor,
            actors,
            camera,
            floor,
            lights,
            materials,
            source,
            name,
            MOBILE_SOURCE_DIR / f"mobile_actor_{slug}.png",
            1000,
            1000,
            "canonical",
            "neutral",
            True,
            True,
        )

    high_risk = (
        "SINGLE_DESIGN_TORSION",
        "SINGLE_GAMES_BRANCH",
        "SINGLE_VIDEO_TEMPORAL",
        "SINGLE_MERCH_WRAP",
        "COMPLEX_GATHER",
    )
    prototype_actors = {}
    for variant in ("v1", "v2"):
        prototype_actors[variant] = baseline_build.create_actor(
            f"MimicCore_PS033_{variant}",
            source,
            variants[variant],
            materials,
            collection,
        )
        actors.append(prototype_actors[variant])
    for variant in ("v1", "v2", "final"):
        actor = final_actor if variant == "final" else prototype_actors[variant]
        for name in high_risk:
            render_actor(
                scene,
                actor,
                actors,
                camera,
                floor,
                lights,
                materials,
                source,
                name,
                PROTOTYPE_DIR / f"{variant}_{baseline_build.slug(name)}.png",
            )

    transition_sets = {
        "master-content": lambda t: {"SINGLE_CONTENT_SEQUENCE": t},
        "content-digital": lambda t: {
            "SINGLE_CONTENT_SEQUENCE": 1.0 - t,
            "SINGLE_DIGITAL_SIGNAL": t,
        },
        "design-merch": lambda t: {
            "SINGLE_DESIGN_TORSION": 1.0 - t,
            "SINGLE_MERCH_WRAP": t,
        },
        "games-event": lambda t: {
            "SINGLE_GAMES_BRANCH": 1.0 - t,
            "SINGLE_EVENT_CONVERGENCE": t,
        },
        "video-complex-drive": lambda t: {
            "SINGLE_VIDEO_TEMPORAL": 1.0 - t,
            "COMPLEX_DRIVE": t,
        },
        "retarget-content-design-event": lambda t: {
            "SINGLE_CONTENT_SEQUENCE": 0.5 * (1.0 - t),
            "SINGLE_DESIGN_TORSION": 0.5 * (1.0 - t),
            "SINGLE_EVENT_CONVERGENCE": t,
        },
    }
    if not quick:
        for sequence, weights_for_t in transition_sets.items():
            for frame in range(5):
                t = frame / 4.0
                for item in actors:
                    item.hide_render = item is not final_actor
                baseline_build.set_weights(final_actor, weights_for_t(t))
                baseline_build.assign_render_mode(final_actor, materials, source, "neutral")
                baseline_build.set_camera(camera, "canonical")
                baseline_build.canonical_roll(final_actor, camera, True)
                floor.hide_render = False
                for light in lights:
                    light.hide_render = False
                baseline_build.set_world(scene, False, False)
                baseline_build.render_still(
                    scene,
                    PANEL_DIR / f"transition_{sequence}_{frame}.png",
                    720,
                    540,
                )
        for frame, weight in enumerate((0.0, 0.03, 0.06, 0.03, 0.0)):
            baseline_build.set_weights(final_actor, {"TRANSITION_TENSION": weight})
            baseline_build.render_still(
                scene,
                PANEL_DIR / f"transition-transition-tension_{frame}.png",
                720,
                540,
            )
    baseline_build.set_weights(final_actor, {})
    final_actor.hide_render = False
    for item in actors:
        if item is not final_actor:
            item.hide_render = True
    try:
        bpy.context.preferences.filepaths.save_version = 0
    except Exception:
        pass
    workbench = BLEND_DIR / "ps-03-3-associative-authoring-workbench.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(workbench))
    return workbench


def set_custom_properties(actor, source, manifest, technical):
    actor["schemaVersion"] = "ps-03.3-v1"
    actor["system"] = "D / Controlled Associative Hierarchy"
    actor["canonicalState"] = "MASTER"
    actor["topologyHash"] = validation.EXPECTED_TOPOLOGY_HASH
    actor["connectivityIndexHash"] = validation.EXPECTED_TOPOLOGY_HASH
    actor["uvHash"] = validation.EXPECTED_UV_HASH
    actor["masterPositionHash"] = validation.EXPECTED_MASTER_POSITION_HASH
    actor["masterReloadedPositionHash"] = validation.positions_hash(source["master"])
    actor["boundingBox"] = json.dumps(TARGET_BBOX)
    actor["directedAxis"] = json.dumps(DIRECTED_AXIS)
    actor["maskFaceCount"] = validation.EXPECTED_MASK_FACE_COUNT
    actor["maskFaceIndexHash"] = validation.EXPECTED_MASK_HASH
    actor["photonicMaskFaceIndices"] = json.dumps(
        source["active_faces"], separators=(",", ":")
    )
    actor["targetNames"] = json.dumps(list(TARGET_NAMES), separators=(",", ":"))
    actor["targetRiskLevels"] = json.dumps(
        {
            name: (
                ASSOCIATIVE_META[name]["risk_level"]
                if name in ASSOCIATIVE_META
                else baseline_build.TARGET_META[name]["risk_level"]
            )
            for name in TARGET_NAMES
        },
        separators=(",", ":"),
    )
    actor["associationMap"] = json.dumps(
        {name: meta["association"] for name, meta in ASSOCIATIVE_META.items()},
        separators=(",", ":"),
    )
    actor["maskAreaStats"] = json.dumps(
        technical["mask_area_stats"], separators=(",", ":")
    )
    actor["targetManifestSha256"] = hashlib.sha256(
        json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode("utf8")
    ).hexdigest()


def create_production_scene(source, positions, manifest, technical):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    material = baseline_build.make_material(
        "PhotonicSkin_NeutralPlaceholder", COLORS["ivory"], 0.42, 0.04, 0.20
    )
    collection = bpy.data.collections.new("PhotonicSkin")
    scene.collection.children.link(collection)
    actor = baseline_build.create_actor(
        "MimicCoreMesh", source, positions, {"neutral": material}, collection
    )
    actor.location = (0.0, 0.0, 0.0)
    actor.rotation_euler = (0.0, 0.0, 0.0)
    actor.scale = (1.0, 1.0, 1.0)
    root = bpy.data.objects.new("MimicCoreRoot", None)
    collection.objects.link(root)
    actor.parent = root
    set_custom_properties(actor, source, manifest, technical)
    return scene, root, actor


def export_glb(root, actor):
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    actor.select_set(True)
    bpy.context.view_layer.objects.active = actor
    path = EXPORT_DIR / "photonic-skin-c-r1-associative-morph-system.glb"
    available = {
        item.identifier for item in bpy.ops.export_scene.gltf.get_rna_type().properties
    }
    requested = {
        "filepath": str(path),
        "export_format": "GLB",
        "use_selection": True,
        "export_apply": False,
        "export_morph": True,
        "export_morph_normal": True,
        "export_morph_tangent": False,
        "export_tangents": True,
        "export_attributes": True,
        "export_materials": "EXPORT",
        "export_animations": False,
        "export_cameras": False,
        "export_lights": False,
        "export_yup": True,
        "export_extras": True,
    }
    bpy.ops.export_scene.gltf(
        **{key: value for key, value in requested.items() if key in available}
    )
    return path


def validate_glb_reimport(path, manifest):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one GLB mesh, found {len(meshes)}")
    obj = meshes[0]
    obj.data.calc_loop_triangles()
    keys = [key.name for key in obj.data.shape_keys.key_blocks]
    target_keys = keys[1:]
    attrs = sorted(attribute.name for attribute in obj.data.attributes)
    one_hot = []
    for key in obj.data.shape_keys.key_blocks[1:]:
        for item in obj.data.shape_keys.key_blocks[1:]:
            item.value = 1.0 if item == key else 0.0
        bpy.context.view_layer.update()
        evaluated_object = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        evaluated = evaluated_object.to_mesh()
        bbox = validation.bounding_box([tuple(vertex.co) for vertex in evaluated.vertices])
        evaluated_object.to_mesh_clear()
        expected = next(
            item for item in manifest["targets"] if item["stable_name"] == key.name
        )
        one_hot.append(
            {
                "name": key.name,
                "bounding_box": bbox,
                "expected_bounding_box": expected["bounding_box"],
                "bbox_matches": all(
                    abs(left - right) <= 1e-4
                    for left, right in zip(
                        bbox["size"], expected["bounding_box"]["size"]
                    )
                ),
            }
        )
    checks = {
        "one_mesh": len(meshes) == 1,
        "indexed_mesh": len(obj.data.polygons) > 0,
        "triangle_count": len(obj.data.loop_triangles)
        == validation.EXPECTED_TRIANGLES,
        "target_count": len(target_keys) == 12,
        "target_order": target_keys == list(TARGET_NAMES),
        "uv_present": len(obj.data.uv_layers) == 1,
        "mask_attribute_present": "_PHOTONIC_MASK" in attrs,
        "slot_attribute_present": "_PHOTONIC_SLOT" in attrs,
        "all_one_hot_bounds": all(item["bbox_matches"] for item in one_hot),
    }
    report = {
        "stage": "PS-03.3",
        "blender_version": bpy.app.version_string,
        "file": str(path),
        "file_sha256": sha256_file(path),
        "file_size_bytes": path.stat().st_size,
        "mesh_name": obj.name,
        "runtime_vertex_count_after_seam_splits": len(obj.data.vertices),
        "triangle_count": len(obj.data.loop_triangles),
        "shape_keys": keys,
        "morph_targets": target_keys,
        "attributes": attrs,
        "one_hot_states": one_hot,
        "checks": checks,
        "passed": all(checks.values()),
    }
    output = EXPORT_DIR / "ps03-3-glb-reimport-validation.json"
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8"
    )
    if not report["passed"]:
        raise RuntimeError(f"PS-03.3 GLB reimport failed: {checks}")
    return report


def main():
    source = read_baseline_system()
    variants = {
        "v1": build_positions(source, "v1"),
        "v2": build_positions(source, "v2"),
    }
    positions = build_positions(source, "final")
    variants["final"] = positions
    validator = validation.GeometryValidator(
        positions["MASTER"], source["faces"], source["active_faces"]
    )
    manifest = target_manifest(source, positions, validator)
    manifest_path = EXPORT_DIR / "ps03-3-target-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf8"
    )
    analysis = baseline_analysis(source, positions)
    (EXPORT_DIR / "ps03-3-baseline-analysis.json").write_text(
        json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf8"
    )

    master_metrics = validator.metrics(positions["MASTER"], include_intersections=True)
    endpoint_validation = {
        "MASTER": {
            "metrics": master_metrics,
            "checks": validator.checks(master_metrics, strict_mask=True),
        }
    }
    for name in TARGET_NAMES:
        metrics = validator.metrics(positions[name], include_intersections=True)
        endpoint_validation[name] = {
            "metrics": metrics,
            "checks": validator.checks(metrics, strict_mask=True),
        }
        endpoint_validation[name]["passed"] = all(
            endpoint_validation[name]["checks"].values()
        )
    endpoint_validation["MASTER"]["passed"] = all(
        endpoint_validation["MASTER"]["checks"].values()
    )
    terminal_mask_areas = [
        endpoint_validation[name]["metrics"]["active_surface_ratio"]
        for name in TERMINAL_NAMES
    ]
    mask_stats = {
        "master": master_metrics["active_surface_ratio"],
        "terminal_min": min(terminal_mask_areas),
        "terminal_max": max(terminal_mask_areas),
        "terminal_mean": round(statistics.fmean(terminal_mask_areas), 6),
        "fixed_face_count": len(source["active_faces"]),
        "face_index_hash": validation.EXPECTED_MASK_HASH,
    }
    preserved_identity = {
        name: validation.positions_hash(positions[name])
        == validation.positions_hash(source["positions"][name])
        for name in PRESERVED_NAMES
    }
    common_checks = {
        **source["baseline_checks"],
        "all_endpoints": all(
            report["passed"] for report in endpoint_validation.values()
        ),
        "preserved_coordinate_identity": all(preserved_identity.values()),
        "shape_key_order": list(positions) == ["MASTER", *TARGET_NAMES],
        "mask_mean": abs(mask_stats["terminal_mean"] - 0.34) <= 0.0075,
        "all_single_scores": manifest["acceptance"]["all_single_scores_pass"],
    }
    technical = {
        "stage": "PS-03.3",
        "system": "D / Controlled Associative Hierarchy",
        "blender_version": bpy.app.version_string,
        "protected_ps03_2_checksums_before": source["checksums_before"],
        "common_topology": {
            **source["topology"],
            "connectivity_index_hash": validation.topology_hash(source["faces"]),
            "uv_hash": baseline_build.uv_hash(source["uv_values"]),
            "mask_face_count": len(source["active_faces"]),
            "mask_face_index_hash": validation.mask_index_hash(
                source["active_faces"]
            ),
        },
        "shape_key_order": ["MASTER", *TARGET_NAMES],
        "preserved_coordinate_identity": preserved_identity,
        "endpoint_validation": endpoint_validation,
        "mask_area_stats": mask_stats,
        "baseline_analysis": analysis,
        "common_checks": common_checks,
        "passed": all(common_checks.values()),
    }
    technical_path = EXPORT_DIR / "ps03-3-technical-validation.json"
    technical_path.write_text(
        json.dumps(technical, ensure_ascii=False, indent=2), encoding="utf8"
    )
    if not technical["passed"]:
        failures = [name for name, value in common_checks.items() if not value]
        endpoint_failures = [
            name for name, report in endpoint_validation.items() if not report["passed"]
        ]
        raise RuntimeError(
            f"PS-03.3 endpoint validation failed common={failures} endpoints={endpoint_failures}"
        )
    if os.environ.get("PS033_VALIDATE_ONLY") == "1":
        print("PS033_ENDPOINT_VALIDATE_ONLY_PASS", technical_path)
        return

    if os.environ.get("PS033_SKIP_RENDER") == "1":
        configure_render_module()
        baseline_build.create_scene(source, positions)
        workbench = BLEND_DIR / "ps-03-3-associative-authoring-workbench.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(workbench))
    else:
        workbench = render_all(source, positions, variants)
    scene, root, actor = create_production_scene(
        source, positions, manifest, technical
    )
    production_blend = (
        BLEND_DIR / "photonic-skin-c-r1-associative-morph-system.blend"
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(production_blend))
    glb = export_glb(root, actor)
    reimport = validate_glb_reimport(glb, manifest)

    hashes_after = checksum_tree(PS032_DIR)
    write_checksum_snapshot("ps03-2-source-checksums-after.json", hashes_after)
    unchanged = hashes_after == source["checksums_before"]
    technical = json.loads(technical_path.read_text(encoding="utf8"))
    technical["protected_ps03_2_checksums_after"] = hashes_after
    technical["ps03_2_sources_unchanged"] = unchanged
    technical["outputs"] = {
        "workbench_blend": str(workbench),
        "production_blend": str(production_blend),
        "glb": str(glb),
        "workbench_sha256": sha256_file(workbench),
        "production_blend_sha256": sha256_file(production_blend),
        "glb_sha256": sha256_file(glb),
        "glb_size_bytes": glb.stat().st_size,
    }
    technical["glb_reimport_passed"] = reimport["passed"]
    technical["passed"] = technical["passed"] and unchanged and reimport["passed"]
    technical_path.write_text(
        json.dumps(technical, ensure_ascii=False, indent=2), encoding="utf8"
    )
    if not technical["passed"]:
        raise RuntimeError("PS-03.3 source protection or GLB reimport failed")
    print(
        "PS033_DONE",
        {
            "blend": str(production_blend),
            "glb": str(glb),
            "reimport": reimport["passed"],
            "ps03_2_unchanged": unchanged,
        },
    )


if __name__ == "__main__":
    main()
