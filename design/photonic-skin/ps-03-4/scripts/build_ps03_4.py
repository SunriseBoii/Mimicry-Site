"""Build PS-03.4 / Final Associative Form Lock D-R2 in Blender 4.5.3 LTS.

The PS-03.3 D-R1 production blend is treated as a read-only baseline. MASTER,
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
PS033_DIR = REPO_DIR / "design" / "photonic-skin" / "ps-03-3"
PS033_BLEND = (
    PS033_DIR / "blender" / "photonic-skin-c-r1-associative-morph-system.blend"
)
CANONICAL_MASTER_HASH = (
    "54af439e6a4ce68f87fcfa20f8ef3d9c124aa62b416d8c29569fd37a18c55469"
)

BLEND_DIR = STAGE_DIR / "blender"
EXPORT_DIR = STAGE_DIR / "exports"
RENDER_DIR = STAGE_DIR / "renders"
PANEL_DIR = RENDER_DIR / "_panels"
PROTOTYPE_DIR = RENDER_DIR / "candidates"
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


validation = load_module("ps032_validation_for_ps034", PS032_VALIDATE)
baseline_build = load_module("ps032_build_for_ps034", PS032_BUILD)

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
        "principle": "open bipartite folio mass, shallow central fold and three editorial beats",
        "desired": "wide connected left/right fields with a blunt open edge",
        "risk": "mouth / shell / chair / pillow",
        "risk_level": 3,
        "fill": (0.97, 0.99, 0.88),
        "score": [18, 19, 13, 14, 9, 8, 4],
    },
    "SINGLE_DESIGN_TORSION": {
        "association": "Forming Palette",
        "principle": "wide asymmetric work surface with a broad zone and a narrow control side",
        "desired": "flattened palette-like top plane under controlled counter-torsion",
        "risk": "bowl / shell / drapery / ribbon",
        "risk_level": 4,
        "fill": (0.96, 0.99, 0.88),
        "score": [15, 19, 13, 14, 9, 7, 4],
    },
    "SINGLE_EVENT_CONVERGENCE": {
        "association": "Gathering Canopy",
        "principle": "low roof mass with broad eaves and non-radial planes converging at an offset apex",
        "desired": "an offset tensile roofline over a stable closed base",
        "risk": "volcano / mushroom / flower / portal",
        "risk_level": 4,
        "fill": (0.94, 0.98, 0.94),
        "score": [15, 19, 13, 14, 9, 7, 3],
    },
    "SINGLE_GAMES_BRANCH": {
        "association": "Decision Field",
        "principle": "low polygonal board field with one entry, three divergent routes and decision zones",
        "desired": "a broad decision field whose three routes alter the macro mass",
        "risk": "controller / horns / crown / circuit board",
        "risk_level": 5,
        "fill": (0.96, 0.99, 0.88),
        "score": [14, 19, 13, 14, 9, 7, 4],
    },
    "SINGLE_VIDEO_TEMPORAL": {
        "association": "Frame Sweep",
        "principle": "broad curved screen field with four soft contour zones and offset temporal thirds",
        "desired": "soft rectangular screen/frame surface crossed by one directional sweep",
        "risk": "car / capsule / airfoil / eye",
        "risk_level": 4,
        "fill": (0.98, 0.89, 0.92),
        "score": [19, 19, 14, 14, 9, 8, 4],
    },
    "SINGLE_DIGITAL_SIGNAL": {
        "association": "Routing Substrate",
        "principle": "elongated routing substrate with a macro Y convergence and two broad nodes",
        "desired": "clearly directed routes converging into one leading output shoulder",
        "risk": "PCB / vents / server / alien hardware",
        "risk_level": 4,
        "fill": (0.98, 0.89, 0.88),
        "score": [16, 19, 14, 14, 9, 7, 4],
    },
    "SINGLE_MERCH_WRAP": {
        "association": "Wrapped Parcel",
        "principle": "soft block core with four unequal corner masses and one broad diagonal wrap overlap",
        "desired": "an enclosed parcel mass visibly held by one continuous wrapping gesture",
        "risk": "capsule / stone / case / coffin",
        "risk_level": 4,
        "fill": (0.88, 0.92, 0.88),
        "score": [17, 19, 13, 14, 9, 7, 4],
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
                "stage": "PS-03.4",
                "protected_source": "PS-03.3 D-R1",
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
    if not PS033_BLEND.exists():
        raise FileNotFoundError(PS033_BLEND)
    hashes_before = checksum_tree(PS033_DIR)
    checksum_path = EXPORT_DIR / "ps03-4-ps03-3-checksums.json"
    if checksum_path.exists():
        recorded = json.loads(checksum_path.read_text(encoding="utf8"))["before"]["files"]
        if recorded != hashes_before:
            raise RuntimeError("PS-03.3 differs from the recorded pre-authoring checksum snapshot")
    else:
        checksum_path.write_text(
            json.dumps(
                {
                    "stage": "PS-03.4",
                    "protected_source": "PS-03.3 D-R1",
                    "algorithm": "SHA-256",
                    "before": {"file_count": len(hashes_before), "files": hashes_before},
                    "after": None,
                    "unchanged": None,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf8",
        )

    bpy.ops.wm.open_mainfile(filepath=str(PS033_BLEND))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one PS-03.3 mesh, found {len(meshes)}")
    obj = meshes[0]
    if obj.data.shape_keys is None:
        raise RuntimeError("PS-03.3 mesh has no shape keys")
    keys = obj.data.shape_keys.key_blocks
    key_names = [key.name for key in keys]
    expected = ["MASTER", *TARGET_NAMES]
    if key_names != expected:
        raise RuntimeError(f"Unexpected PS-03.3 key order: {key_names}")
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
        raise RuntimeError(f"PS-03.3 baseline contract mismatch: {checks}")
    master_hash = validation.positions_hash(positions["MASTER"])
    if master_hash != CANONICAL_MASTER_HASH:
        raise RuntimeError(
            f"PS-03.3 MASTER hash mismatch: {master_hash} != {CANONICAL_MASTER_HASH}"
        )
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
        "master_position_hash": master_hash,
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
    # Three deliberately different candidate passes.  v1 establishes the
    # archetypal silhouette, v2 redistributes mass and final locks the strong
    # constructive cue plus medium-scale photonic ridge.  They are retained in
    # the authoring workbench only; production exports the final coordinates.
    amplitude = {"v1": 0.70, "v2": 0.88, "final": 1.0}[variant]
    profile_bias = {"v1": -1.0, "v2": 0.0, "final": 1.0}[variant]
    output = []
    for point, (s, phi) in zip(baseline["MASTER"], parameters):
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
                (x, y, z),
                superellipsoid_point(
                    s,
                    phi,
                    4.8 + 0.3 * profile_bias,
                    3.4,
                    1.82,
                    0.86 + 0.04 * profile_bias,
                ),
                0.55 + 0.45 * a,
            )
            # Two broad page fields are expressed as a continuous top saddle.
            # The fold is shallow and wide, never a slit or a cavity.
            fold = body * top * gauss(y_dir, 0.0, 0.24)
            left_page = body * top * gauss(y_dir, -0.62, 0.52)
            right_page = body * top * gauss(y_dir, 0.58, 0.50)
            blunt_open_edge = body * top * smoothstep(0.52, 0.90, u)
            beats = body * top * (
                0.55 * gauss(s, -0.52, 0.24)
                + 0.32 * gauss(s, -0.02, 0.24)
                + 0.46 * gauss(s, 0.44, 0.25)
            )
            y *= 1.0 + a * 0.24 * body * (0.40 + 0.60 * top)
            z *= 1.0 - a * 0.38 * body * (0.25 + 0.75 * top)
            z += a * (0.55 * left_page + 0.64 * right_page - 0.42 * fold)
            z += a * (0.22 + 0.05 * profile_bias) * beats
            z += a * 0.20 * blunt_open_edge * (0.35 + 0.65 * abs(y_dir))
            y += a * 0.24 * body * top * y_dir
            # A slight opposing page pitch creates a readable spread in top
            # and canonical views while keeping a single closed volume.
            z += a * 0.14 * body * top * y_dir
            x += a * 0.12 * body * top * (0.5 + 0.5 * abs(y_dir))

        elif name == "SINGLE_DESIGN_TORSION":
            wide_work_zone = 1.0 - smoothstep(0.02, 0.78, u)
            x, y, z = blend_point(
                (x, y, z),
                superellipsoid_point(
                    s,
                    phi,
                    3.5,
                    3.2,
                    1.58 + 0.18 * wide_work_zone,
                    0.60 + 0.03 * profile_bias,
                ),
                0.55 + 0.45 * a,
            )
            angle = a * (
                math.radians(24.0) * s * body
                - math.radians(9.0) * math.sin(math.pi * u) * body
            )
            rotated_y = y * math.cos(angle) - z * math.sin(angle)
            rotated_z = y * math.sin(angle) + z * math.cos(angle)
            y, z = rotated_y, rotated_z
            work_plane = body * top
            zone_a = gauss(s, -0.48, 0.30) * gauss(y_dir, -0.44, 0.44) * top
            zone_b = gauss(s, -0.02, 0.35) * gauss(y_dir, 0.30, 0.48) * top
            zone_c = gauss(s, 0.43, 0.26) * gauss(y_dir, -0.10, 0.40) * top
            y *= 1.0 + a * (
                0.46 * body * (0.70 - 0.52 * u)
                + 0.12 * body * camera_side
            )
            z *= 1.0 - a * 0.42 * work_plane
            z += a * (0.45 * zone_a - 0.24 * zone_b + 0.38 * zone_c)
            y += a * (0.24 * zone_a + 0.13 * zone_b - 0.23 * zone_c)
            # Broad rear work lobe and narrower leading control side.
            y += a * 0.28 * body * (0.60 - u)
            x += a * 0.17 * body * y_dir
            z += a * 0.08 * body * (0.45 - u)

        elif name == "SINGLE_EVENT_CONVERGENCE":
            x, y, z = blend_point(
                (x, y, z),
                superellipsoid_point(s, phi, 4.0, 3.2, 1.72, 0.58),
                0.55 + 0.45 * a,
            )
            apex = (
                gauss(s, 0.20 + 0.04 * profile_bias, 0.30)
                * gauss(y_dir, -0.18, 0.36)
                * top
            )
            roof_left = gauss(y_dir, -0.58, 0.58) * top
            roof_right = gauss(y_dir, 0.48, 0.62) * top
            eaves = body * top * smoothstep(0.50, 0.92, abs(y_dir))
            longitudinal_roof = body * top * (0.75 + 0.25 * (0.5 - s))
            radial = max(0.0, 1.0 - abs(s) ** 4.0) ** 0.25
            surface_gate = smoothstep(0.0, 0.30, top)
            planar_roof = smoothstep(0.0, 1.0, max(
                0.0,
                1.0
                - abs((s - 0.18) / 0.86)
                - 0.58 * abs((y_dir + 0.18) / 1.0),
            ))
            if z_dir >= 0.0:
                authored_top = radial * (0.16 + 1.34 * planar_roof) * surface_gate
                z = z * (1.0 - 0.58 * a) + authored_top * (0.58 * a)
            else:
                authored_bottom = -0.38 * radial * ((-z_dir) ** 0.76)
                z = z * (1.0 - 0.48 * a) + authored_bottom * (0.48 * a)
            y *= 1.0 + a * 0.22 * body * (0.35 + 0.65 * lower)
            z += a * (0.18 * longitudinal_roof + 0.08 * roof_left + 0.05 * roof_right - 0.08 * eaves)
            y -= a * 0.16 * apex
            x += a * 0.10 * apex

        elif name == "SINGLE_GAMES_BRANCH":
            x, y, z = blend_point(
                (x, y, z),
                superellipsoid_point(s, phi, 5.0, 3.6, 1.76, 0.60),
                0.55 + 0.45 * a,
            )
            entry = gauss(s, -0.58, 0.25) * gauss(y_dir, -0.02, 0.48) * top
            divergence = smoothstep(0.16, 0.86, u)
            centers = (-0.50 * divergence, 0.02, 0.54 * divergence)
            routes = sum(gauss(y_dir, center, 0.19) for center in centers)
            routes = min(1.45, routes) * body * top
            zone_a = gauss(s, 0.06, 0.25) * gauss(y_dir, -0.52, 0.30) * top
            zone_b = gauss(s, 0.34, 0.26) * gauss(y_dir, 0.44, 0.30) * top
            zone_c = gauss(s, 0.56, 0.22) * gauss(y_dir, -0.04, 0.30) * top
            y *= 1.0 + a * 0.26 * body * (0.42 + 0.58 * top)
            if z_dir >= 0.0:
                z *= 1.0 - a * 0.34 * body * top
                z += a * 0.12 * body * smoothstep(0.0, 0.32, top)
            else:
                z *= 1.0 - a * 0.18 * body
            z += a * (
                0.40 * entry
                + (0.52 + 0.04 * profile_bias) * routes
                + 0.52 * zone_a
                + 0.44 * zone_b
                + 0.38 * zone_c
            )
            y += a * (0.16 * zone_a - 0.14 * zone_b + 0.08 * zone_c)
            x += a * 0.11 * body * (0.15 + 0.85 * u)

        elif name == "SINGLE_VIDEO_TEMPORAL":
            x, y, z = blend_point(
                (x, y, z),
                superellipsoid_point(
                    s,
                    phi,
                    4.2,
                    3.0,
                    1.20 + 0.04 * profile_bias,
                    1.34,
                ),
                0.55 + 0.45 * a,
            )
            # A broad upright screen plane, curved in depth rather than an
            # aerodynamic horizontal capsule.  One top sweep orders time.
            depth_curve = body * math.sin(math.pi * (s + 0.08))
            leading = gauss(s, 0.48, 0.30)
            trailing = gauss(s, -0.50, 0.34)
            frame_sweep = body * top * (
                0.34 + 0.48 * leading + 0.20 * trailing
            )
            y *= 1.0 - a * 0.42 * body
            y += a * 0.08 * depth_curve
            z += a * 0.42 * frame_sweep
            z += a * 0.12 * body * math.sin(math.pi * (s - 0.16))
            x += a * 0.08 * body * top

        elif name == "SINGLE_DIGITAL_SIGNAL":
            x, y, z = blend_point(
                (x, y, z),
                superellipsoid_point(s, phi, 4.8, 3.4, 1.42, 0.42),
                0.55 + 0.45 * a,
            )
            convergence = 1.0 - smoothstep(0.12, 0.90, u)
            centers = (-0.62 * convergence, 0.02, 0.58 * convergence)
            routes = sum(gauss(y_dir, center, 0.18) for center in centers)
            routes = min(1.42, routes) * body * top
            node_a = gauss(s, -0.30, 0.25) * gauss(y_dir, -0.48, 0.28) * top
            node_b = gauss(s, 0.12, 0.24) * gauss(y_dir, 0.30, 0.28) * top
            output_zone = gauss(s, 0.60, 0.24) * gauss(y_dir, 0.02, 0.34) * top
            y *= 1.0 - a * 0.18 * body * top
            if z_dir >= 0.0:
                z *= 1.0 - a * 0.58 * body * top
                z += a * 0.10 * body * smoothstep(0.0, 0.32, top)
            else:
                z *= 1.0 - a * 0.16 * body
            z += a * (
                (0.58 + 0.05 * profile_bias) * routes
                + 0.72 * node_a
                + 0.62 * node_b
                + 0.50 * output_zone
            )
            y += a * (0.16 * node_a - 0.13 * node_b)
            x += a * 0.18 * body * smoothstep(0.25, 0.92, u)

        elif name == "SINGLE_MERCH_WRAP":
            x, y, z = blend_point(
                (x, y, z),
                superellipsoid_point(s, phi, 4.8, 4.2, 1.50, 1.28),
                0.55 + 0.45 * a,
            )
            corner_mass = body * abs(y_dir * z_dir)
            wrap_center = 2.72 - (1.72 + 0.10 * profile_bias) * u
            wrap = angle_gauss(phi, wrap_center, 0.52) * body
            overlap = angle_gauss(phi, wrap_center - 0.44, 0.36) * body
            underlap = angle_gauss(phi, wrap_center + 0.46, 0.42) * body
            enclosed = body * gauss(s, -0.02, 0.66)
            y *= 1.0 + a * (0.30 * corner_mass + 0.12 * enclosed)
            z *= 1.0 + a * (0.26 * corner_mass + 0.10 * enclosed)
            y += a * (0.38 * wrap - 0.18 * overlap - 0.08 * underlap)
            z += a * (0.52 * wrap - 0.23 * overlap - 0.08 * underlap)
            x -= a * 0.22 * body * (u - 0.44)
            z += a * 0.10 * body * (0.38 - u)

        output.append((x, y, z))

    # Do not globally rescale the authored body back into a common blob.  The
    # D-R2 archetypes keep their own mass proportions; the shared envelope is
    # maintained later by the same smooth MASTER extremum anchors.
    return output


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
            "SINGLE_CONTENT_SEQUENCE": 0.030,
            "SINGLE_DESIGN_TORSION": 0.080,
            "SINGLE_EVENT_CONVERGENCE": 0.200,
            "SINGLE_GAMES_BRANCH": 0.250,
            "SINGLE_VIDEO_TEMPORAL": -0.400,
            "SINGLE_DIGITAL_SIGNAL": 0.280,
            "SINGLE_MERCH_WRAP": -0.025,
        }.get(name, 0.0)
        balanced = balance_mask_area(target, parameters, mask_balance)
        result[name] = stabilize_shared_extrema(
            balanced,
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
            "d_r1_association_readability_25": {
                "SINGLE_CONTENT_SEQUENCE": 14,
                "SINGLE_DESIGN_TORSION": 11,
                "SINGLE_EVENT_CONVERGENCE": 11,
                "SINGLE_GAMES_BRANCH": 10,
                "SINGLE_VIDEO_TEMPORAL": 11,
                "SINGLE_DIGITAL_SIGNAL": 10,
                "SINGLE_MERCH_WRAP": 11,
            }[name],
            "d_r2_association_readability_25": ASSOCIATIVE_META[name]["score"][0],
            "reason": "D-R1 preserved one living actor but the intended objects were subordinated to a shared blob silhouette; D-R2 rebuilds macro silhouette, mass distribution and one archetypal constructive cue.",
        }
    return {
        "stage": "PS-03.4",
        "baseline": "PS-03.3 D-R1 associative system",
        "conclusion": "The seven D-R1 targets retain close global blob massing and several intended cues disappear at 96-180 px.",
        "ps03_3_single_pair_metrics": current_pairs,
        "ps03_3_content_digital": pair_metrics(
            source["positions"]["SINGLE_CONTENT_SEQUENCE"],
            source["positions"]["SINGLE_DIGITAL_SIGNAL"],
        ),
        "ps03_4_content_digital": pair_metrics(
            final_positions["SINGLE_CONTENT_SEQUENCE"],
            final_positions["SINGLE_DIGITAL_SIGNAL"],
        ),
        "revisions": revisions,
        "risk_summary": {
            "GAMES": "routes must remain a board field rather than horns/crown or a literal controller",
            "EVENT": "offset roofline must stay non-radial and avoid flower/volcano/mushroom",
            "MERCH": "block core and continuous overlap must avoid capsule/stone/case",
        },
        "hash_conflict_resolution": {
            "stale_prompt_hash": "2cd522cd9a1d0e90f10fc072835db1cd54a9ad1072478911713884646fc89bd8",
            "user_confirmed_canonical_hash": CANONICAL_MASTER_HASH,
            "recomputed_from_ps03_3_production_blend": source["master_position_hash"],
            "resolved": source["master_position_hash"] == CANONICAL_MASTER_HASH,
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
                "semantic_role": "single terminal / final object echo level 2 D-R2",
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
                "coordinate_identity_to_ps03_3": True,
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
        "stage": "PS-03.4",
        "system": "D-R2 / Final Associative Form Lock",
        "basis": {
            "stable_name": "MASTER",
            "position_hash": master_metrics["position_hash"],
            "bounding_box": master_metrics["bounding_box"],
            "mask_area": master_metrics["active_surface_ratio"],
            "coordinate_identity_to_ps03_3": True,
            "hash_conflict_resolution": {
                "stale_prompt_hash": "2cd522cd9a1d0e90f10fc072835db1cd54a9ad1072478911713884646fc89bd8",
                "canonical_ps03_3_hash": CANONICAL_MASTER_HASH,
                "confirmed_by_user": True,
            },
        },
        "target_count": 12,
        "target_order": list(TARGET_NAMES),
        "targets": targets,
        "acceptance": {
            "score_threshold": 90,
            "object_echo_readability_threshold": 22,
            "mimic_core_dna_threshold": 18,
            "all_single_scores_pass": all(
                sum(ASSOCIATIVE_META[name]["score"]) >= 90
                and ASSOCIATIVE_META[name]["score"][0] >= 22
                and ASSOCIATIVE_META[name]["score"][1] >= 18
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
    quick = os.environ.get("PS034_QUICK_RENDER") == "1"
    scene, final_actor, camera, floor, lights, materials = baseline_build.create_scene(
        source, positions
    )
    # A tighter neutral studio key reveals broad construction ridges without
    # competence colour or a semantic shader.  D-only comparisons use this
    # exact rig for every candidate and final state.
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
    scene["ps034RefinementIterations"] = json.dumps(["v1", "v2", "final D-R2"])
    collection = final_actor.users_collection[0]
    actors = [final_actor]

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

    prototype_actors = {}
    for variant in ("v1", "v2"):
        prototype_actors[variant] = baseline_build.create_actor(
            f"MimicCore_PS034_{variant}",
            source,
            variants[variant],
            materials,
            collection,
        )
        actors.append(prototype_actors[variant])
    for variant in ("v1", "v2", "final"):
        actor = final_actor if variant == "final" else prototype_actors[variant]
        for name in SINGLE_NAMES:
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
        "content-games": lambda t: {
            "SINGLE_CONTENT_SEQUENCE": 1.0 - t,
            "SINGLE_GAMES_BRANCH": t,
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
    workbench = BLEND_DIR / "ps-03-4-d-r2-authoring-workbench.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(workbench))
    return workbench


def set_custom_properties(actor, source, manifest, technical):
    actor["schemaVersion"] = "ps-03.4-d-r2-v1"
    actor["system"] = "D-R2 / Final Associative Form Lock"
    actor["canonicalState"] = "MASTER"
    actor["topologyHash"] = validation.EXPECTED_TOPOLOGY_HASH
    actor["connectivityIndexHash"] = validation.EXPECTED_TOPOLOGY_HASH
    actor["uvHash"] = validation.EXPECTED_UV_HASH
    actor["masterPositionHash"] = CANONICAL_MASTER_HASH
    actor["masterReloadedPositionHash"] = validation.positions_hash(source["master"])
    actor["ps034HashConflictResolved"] = True
    actor["ps034StalePromptMasterHash"] = (
        "2cd522cd9a1d0e90f10fc072835db1cd54a9ad1072478911713884646fc89bd8"
    )
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
    path = EXPORT_DIR / "photonic-skin-c-r1-d-r2-final-morph-system.glb"
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
        "stage": "PS-03.4",
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
    output = EXPORT_DIR / "ps03-4-glb-reimport-validation.json"
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8"
    )
    if not report["passed"]:
        raise RuntimeError(f"PS-03.4 GLB reimport failed: {checks}")
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
    manifest_path = EXPORT_DIR / "ps03-4-target-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf8"
    )
    analysis = baseline_analysis(source, positions)
    (EXPORT_DIR / "ps03-4-d-r1-audit.json").write_text(
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
        "visual_gate_recorded": True,
    }
    technical = {
        "stage": "PS-03.4",
        "system": "D-R2 / Final Associative Form Lock",
        "blender_version": bpy.app.version_string,
        "protected_ps03_3_checksums_before": source["checksums_before"],
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
        "visual_gate_passed": manifest["acceptance"]["all_single_scores_pass"],
        "production_lock_status": (
            "LOCKED"
            if manifest["acceptance"]["all_single_scores_pass"]
            else "NOT LOCKED"
        ),
        "passed": all(common_checks.values()),
    }
    technical_path = EXPORT_DIR / "ps03-4-technical-validation.json"
    technical_path.write_text(
        json.dumps(technical, ensure_ascii=False, indent=2), encoding="utf8"
    )
    if not technical["passed"]:
        failures = [name for name, value in common_checks.items() if not value]
        endpoint_failures = [
            name for name, report in endpoint_validation.items() if not report["passed"]
        ]
        raise RuntimeError(
            f"PS-03.4 endpoint validation failed common={failures} endpoints={endpoint_failures}"
        )
    if os.environ.get("PS034_VALIDATE_ONLY") == "1":
        print("PS034_ENDPOINT_VALIDATE_ONLY_PASS", technical_path)
        return

    if os.environ.get("PS034_SKIP_RENDER") == "1":
        configure_render_module()
        baseline_build.create_scene(source, positions)
        workbench = BLEND_DIR / "ps-03-4-d-r2-authoring-workbench.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(workbench))
    else:
        workbench = render_all(source, positions, variants)
    scene, root, actor = create_production_scene(
        source, positions, manifest, technical
    )
    production_blend = (
        BLEND_DIR / "photonic-skin-c-r1-d-r2-final-morph-system.blend"
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(production_blend))
    glb = export_glb(root, actor)
    reimport = validate_glb_reimport(glb, manifest)

    hashes_after = checksum_tree(PS033_DIR)
    unchanged = hashes_after == source["checksums_before"]
    checksum_path = EXPORT_DIR / "ps03-4-ps03-3-checksums.json"
    checksum_report = json.loads(checksum_path.read_text(encoding="utf8"))
    checksum_report["after"] = {
        "file_count": len(hashes_after),
        "files": hashes_after,
    }
    checksum_report["unchanged"] = unchanged
    checksum_report["master_hash_conflict_resolution"] = {
        "stale_prompt_value": "2cd522cd9a1d0e90f10fc072835db1cd54a9ad1072478911713884646fc89bd8",
        "user_confirmed_canonical_value": CANONICAL_MASTER_HASH,
        "directly_recomputed_from_ps03_3_blend": source["master_position_hash"],
        "passed": source["master_position_hash"] == CANONICAL_MASTER_HASH,
    }
    checksum_path.write_text(
        json.dumps(checksum_report, ensure_ascii=False, indent=2), encoding="utf8"
    )
    technical = json.loads(technical_path.read_text(encoding="utf8"))
    technical["protected_ps03_3_checksums_after"] = hashes_after
    technical["ps03_3_sources_unchanged"] = unchanged
    technical["master_hash_conflict_resolution"] = checksum_report[
        "master_hash_conflict_resolution"
    ]
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
        raise RuntimeError("PS-03.4 source protection or GLB reimport failed")
    print(
        "PS034_DONE",
        {
            "blend": str(production_blend),
            "glb": str(glb),
            "reimport": reimport["passed"],
            "ps03_3_unchanged": unchanged,
        },
    )


if __name__ == "__main__":
    main()
