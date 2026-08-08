"""PS-03.M2 target library core: compile, assemble, normalise, measure, validate.

Every function here is target-agnostic.  The only inputs that vary between
subject forms are the TargetDefinition documents; there is no branch anywhere
in this module keyed on a target or component identity.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field as dataclass_field
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
ROOT = SCRIPT_DIR.parents[3]
# The PS-03.M mesh utilities are reused read-only as the shared baseline.
sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(ROOT / "design" / "photonic-skin" / "ps-03-m" / "scripts"))

import geometry_providers as gp  # noqa: E402
import measure_ops as mops  # noqa: E402
import mesh_ops as mo  # noqa: E402
import target_schema as ts  # noqa: E402

TARGETS_DIR = STAGE_DIR / "targets"
EXPORT_DIR = STAGE_DIR / "exports"

# Field/polygonisation settings — one configuration for the whole library.
GRID_BOUNDS = 4.0
GRID_RESOLUTION = 208
SEED = 20260808

# Universal density shaping constants (not per target).
DENSITY_CURVATURE_GAIN = 1.2
DENSITY_VIEW_SILHOUETTE_GAIN = 0.9
DENSITY_FEATURE_GAIN = 1.0
DENSITY_SILHOUETTE_GAIN = 1.2
CANONICAL_VIEW_DIR = np.array([0.55, -0.72, 0.42])
CANONICAL_VIEW_DIR = CANONICAL_VIEW_DIR / np.linalg.norm(CANONICAL_VIEW_DIR)

THICKNESS_PROBE_SAMPLES = 4096
THICKNESS_MAX_DEPTH_FRACTION = 0.35


def build_config_hash() -> str:
    import hashlib
    import json

    payload = json.dumps(
        {
            "gridBounds": GRID_BOUNDS,
            "gridResolution": GRID_RESOLUTION,
            "seed": SEED,
            "schemaVersion": ts.SCHEMA_VERSION,
            "providers": gp.provider_names(),
            "densityGains": [
                DENSITY_CURVATURE_GAIN, DENSITY_VIEW_SILHOUETTE_GAIN,
                DENSITY_FEATURE_GAIN, DENSITY_SILHOUETTE_GAIN,
            ],
        },
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf8")).hexdigest()


def target_rng(target_id: str) -> np.random.Generator:
    """Deterministic per-target generator (order independent)."""
    import hashlib

    digest = hashlib.sha256(target_id.encode("utf8")).digest()
    return np.random.default_rng(SEED ^ int.from_bytes(digest[:8], "big"))


# ---------------------------------------------------------------------------
# Imported assets: mesh -> signed field.
# ---------------------------------------------------------------------------


def read_obj(path: Path) -> tuple[np.ndarray, np.ndarray]:
    vertices: list[list[float]] = []
    faces: list[list[int]] = []
    for line in Path(path).read_text("utf8").splitlines():
        if line.startswith("v "):
            vertices.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("f "):
            idx = [int(tok.split("/")[0]) - 1 for tok in line.split()[1:]]
            for k in range(1, len(idx) - 1):
                faces.append([idx[0], idx[k], idx[k + 1]])
    return np.asarray(vertices, dtype=np.float64), np.asarray(faces, dtype=np.int64)


def bake_mesh_field(vertices: np.ndarray, faces: np.ndarray,
                    samples: int = 240_000, neighbours: int = 12,
                    rng: np.random.Generator | None = None):
    """Signed field of a watertight mesh from a dense surface point set.

    Unsigned distance is the nearest-sample distance.  The sign comes from an
    inverse-distance weighted vote over the k nearest samples rather than the
    single nearest one: a lone nearest sample flips sign unpredictably in
    grooves and near thin walls, where several neighbours agree.
    """
    rng = rng or np.random.default_rng(SEED)
    points, face_index = mo.sample_surface(vertices, faces, samples, rng)
    a = vertices[faces[:, 0]]
    b = vertices[faces[:, 1]]
    c = vertices[faces[:, 2]]
    normals = np.cross(b - a, c - a)
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-30)
    sample_normals = normals[face_index]
    tree = cKDTree(points)
    k = min(neighbours, len(points))

    def field(query: np.ndarray) -> np.ndarray:
        distance, index = tree.query(query, k=k, workers=-1)
        delta = query[:, None, :] - points[index]
        projection = np.einsum("ijk,ijk->ij", delta, sample_normals[index])
        weight = 1.0 / (distance + 1e-9) ** 2
        vote = (projection * weight).sum(axis=1)
        return distance[:, 0] * np.where(vote < 0.0, -1.0, 1.0)

    return field


# ---------------------------------------------------------------------------
# Compilation and assembly.
# ---------------------------------------------------------------------------


def _wrap_transform(node_field, transform: dict | None):
    if not transform:
        return node_field
    translate = np.asarray(transform.get("translate", (0.0, 0.0, 0.0)), float)
    rotation = gp.euler_matrix(transform.get("rotateDeg", (0.0, 0.0, 0.0)))
    scale = float(transform.get("scale", 1.0))

    def transformed(points: np.ndarray) -> np.ndarray:
        local = (points - translate) @ rotation / scale
        return node_field(local) * scale

    return transformed


def compile_components(definition: dict, asset_dir: Path | None = None) -> dict:
    """Component id -> signed field in the target's authoring frame."""
    resolved: dict[str, object] = {}
    stats = gp.CompileStats()

    def asset_resolver(key: str):
        raise RuntimeError(f"no asset registered for {key!r}")

    if asset_dir is not None:
        cache: dict[str, object] = {}

        def asset_resolver(key: str):  # noqa: F811
            if key not in cache:
                vertices, faces = read_obj(Path(asset_dir) / key)
                cache[key] = bake_mesh_field(vertices, faces)
            return cache[key]

    for component in definition["components"]:
        if "geometryProvider" in component:
            node_field = gp.compile_node(
                component["geometryProvider"], asset_resolver, stats
            )
        else:
            asset = component["importedAsset"]
            vertices, faces = read_obj(Path(asset["path"]))
            node_field = bake_mesh_field(vertices, faces)
        resolved[component["componentId"]] = _wrap_transform(
            node_field, component.get("canonicalTransform")
        )
    return {"fields": resolved, "stats": stats}


def shell_groups(definition: dict) -> dict[str, list[str]]:
    """Root component id -> component ids that merge into the same shell."""
    parents = {
        c["componentId"]: c.get("parentComponentId")
        for c in definition["components"]
    }
    roles = {c["componentId"]: c["connectivityRole"] for c in definition["components"]}

    def root_of(component_id: str) -> str:
        seen = set()
        current = component_id
        while roles[current] == "attached":
            if current in seen:
                raise ts.SchemaError(f"attachment cycle at {current!r}")
            seen.add(current)
            current = parents[current]
        return current

    groups: dict[str, list[str]] = {}
    for component in definition["components"]:
        groups.setdefault(root_of(component["componentId"]), []).append(
            component["componentId"]
        )
    return groups


def assemble(definition: dict, fields: dict):
    """Composite field plus the per-shell fields, following connectivity roles."""
    groups = shell_groups(definition)
    blends = {
        c["componentId"]: float(c.get("attachmentBlend", 0.0))
        for c in definition["components"]
    }
    order = [c["componentId"] for c in definition["components"]]

    shells = {}
    for root, members in groups.items():
        ordered = [cid for cid in order if cid in members]
        member_fields = [fields[cid] for cid in ordered]
        member_blends = [blends[cid] for cid in ordered]

        def shell(points, _fields=member_fields, _blends=member_blends,
                  _root_index=ordered.index(root)):
            value = _fields[_root_index](points)
            for index, member in enumerate(_fields):
                if index == _root_index:
                    continue
                value = gp.smin(value, member(points), _blends[index])
            return value

        shells[root] = shell

    shell_list = [shells[root] for root in sorted(shells)]

    def composite(points: np.ndarray) -> np.ndarray:
        value = shell_list[0](points)
        for shell in shell_list[1:]:
            value = np.minimum(value, shell(points))
        return value

    return composite, shells, groups


# ---------------------------------------------------------------------------
# Zones — one generic evaluator for feature / silhouette / density / color.
# ---------------------------------------------------------------------------


DEFAULT_ZONE_FALLOFF = 0.06


def compile_zones(definition: dict, kind_key: str) -> list[dict]:
    """Flatten one zone family across components into evaluatable records."""
    out = []
    for component in definition["components"]:
        for zone in component.get(kind_key, []):
            out.append(
                {
                    "componentId": component["componentId"],
                    "zoneId": zone["zoneId"],
                    "weight": float(zone.get("weight", 1.0)),
                    "importance": float(zone.get("importance", 1.0)),
                    "falloff": float(zone.get("falloff", DEFAULT_ZONE_FALLOFF)),
                    "competencyId": zone.get("competencyId"),
                    "field": _wrap_transform(
                        gp.compile_node(zone["region"]),
                        component.get("canonicalTransform"),
                    ),
                }
            )
    return out


def zone_mask(zone: dict, points: np.ndarray) -> np.ndarray:
    """Soft membership in [0, 1]: 1 well inside the region, 0 well outside."""
    value = zone["field"](points)
    falloff = max(zone["falloff"], 1e-6)
    u = np.clip((falloff - value) / (2.0 * falloff), 0.0, 1.0)
    return u * u * (3.0 - 2.0 * u)


def zone_family_mask(zones: list[dict], points: np.ndarray) -> np.ndarray:
    if not zones:
        return np.zeros(len(points))
    total = np.zeros(len(points))
    for zone in zones:
        total = np.maximum(total, zone_mask(zone, points))
    return total


def density_field(zones: dict, points: np.ndarray, normals: np.ndarray,
                  curvature: np.ndarray) -> np.ndarray:
    """Universal sampling density: base + curvature + view silhouette + zones."""
    high = np.percentile(curvature, 92) if len(curvature) else 1.0
    curvature_term = np.clip(curvature / max(high, 1e-9), 0.0, 1.0)
    view_term = (1.0 - np.abs(normals @ CANONICAL_VIEW_DIR)) ** 2
    density = (
        1.0
        + DENSITY_CURVATURE_GAIN * curvature_term
        + DENSITY_VIEW_SILHOUETTE_GAIN * view_term
    )
    for zone in zones["density"]:
        density += zone["weight"] * zone_mask(zone, points)
    for zone in zones["feature"]:
        density += DENSITY_FEATURE_GAIN * zone["importance"] * zone_mask(zone, points)
    for zone in zones["silhouette"]:
        density += (
            DENSITY_SILHOUETTE_GAIN * zone["importance"] * zone_mask(zone, points)
        )
    return density


# ---------------------------------------------------------------------------
# Build one target.
# ---------------------------------------------------------------------------


@dataclass
class CompiledTarget:
    definition: dict
    field: object                       # world-space signed field
    to_authoring: object                # world point -> authoring point
    component_fields: dict              # authoring-frame per component
    zones: dict
    vertices: np.ndarray
    faces: np.ndarray
    normalize_scale: float
    origin_offset: np.ndarray
    measures: dict = dataclass_field(default_factory=dict)
    validation: dict = dataclass_field(default_factory=dict)


def build_target(definition: dict, master_volume: float | None,
                 asset_dir: Path | None = None) -> CompiledTarget:
    compiled = compile_components(definition, asset_dir)
    fields = compiled["fields"]
    composite_auth, shells_auth, groups = assemble(definition, fields)

    grid = mo.eval_sdf_grid(composite_auth, GRID_BOUNDS, GRID_RESOLUTION)
    vertices, faces = mo.marching_cubes(grid, GRID_BOUNDS)
    raw_report = mo.validate_mesh(vertices, faces)
    volume_raw = raw_report["volume"]
    if volume_raw <= 0.0:
        raise ValueError(
            f"{definition['targetId']}: non-positive raw volume {volume_raw}"
        )

    v0 = volume_raw if master_volume is None else master_volume
    policy = definition["normalizationPolicy"]
    if policy["mode"] != "uniformCompositeVolume":
        raise NotImplementedError(
            f"normalization mode {policy['mode']!r} is declared but not built"
        )
    scale = (v0 / volume_raw) ** (1.0 / 3.0)

    scaled = vertices * scale
    origin_offset = -0.5 * (scaled.max(axis=0) + scaled.min(axis=0))
    world_vertices = scaled + origin_offset

    def to_authoring(points: np.ndarray) -> np.ndarray:
        return (np.asarray(points, dtype=np.float64) - origin_offset) / scale

    def world_field(points: np.ndarray) -> np.ndarray:
        return scale * composite_auth(to_authoring(points))

    zones = {
        "feature": compile_zones(definition, "featureZones"),
        "silhouette": compile_zones(definition, "silhouetteZones"),
        "density": compile_zones(definition, "densityZones"),
        "color": compile_zones(definition, "colorZones"),
    }

    target = CompiledTarget(
        definition=definition,
        field=world_field,
        to_authoring=to_authoring,
        component_fields=fields,
        zones=zones,
        vertices=world_vertices,
        faces=faces,
        normalize_scale=scale,
        origin_offset=origin_offset,
    )
    target.measures = measure_target(target, grid, raw_report, v0, groups)
    target.validation = validate_target(target, v0)
    return target


def measure_target(target: CompiledTarget, authoring_grid: np.ndarray,
                   raw_report: dict, v0: float, groups: dict) -> dict:
    definition = target.definition
    vertices, faces = target.vertices, target.faces
    scale = target.normalize_scale
    report = mo.validate_mesh(vertices, faces)
    labels = mo.connected_components(vertices, faces)

    centroids_world = vertices[faces].mean(axis=1)
    centroids_auth = target.to_authoring(centroids_world)
    component_ids = [c["componentId"] for c in definition["components"]]
    component_field_list = [target.component_fields[cid] for cid in component_ids]
    face_owner = mops.label_by_nearest_field(component_field_list, centroids_auth)
    areas = mo.face_areas(vertices, faces)

    interior, interior_values, voxel_volume = mops.interior_voxel_centres(
        authoring_grid, GRID_BOUNDS
    )
    if len(interior):
        voxel_owner = mops.label_by_nearest_field(component_field_list, interior)
    else:
        voxel_owner = np.zeros(0, dtype=np.int64)
    voxel_volume_world = voxel_volume * scale ** 3

    rng = target_rng(definition["targetId"])
    probe_points, _ = mo.sample_surface(
        vertices, faces, THICKNESS_PROBE_SAMPLES, rng
    )
    probe_normals = mo.sdf_gradient(target.field, probe_points)
    extent = float(np.linalg.norm(vertices.max(axis=0) - vertices.min(axis=0)))
    thickness = mops.local_thickness(
        target.field, probe_points, probe_normals,
        max_depth=extent * THICKNESS_MAX_DEPTH_FRACTION,
    )
    probe_owner = mops.label_by_nearest_field(
        component_field_list, target.to_authoring(probe_points)
    )

    components_out = []
    for index, component in enumerate(definition["components"]):
        face_mask = face_owner == index
        probe_mask = probe_owner == index
        voxel_mask = voxel_owner == index
        component_thickness = thickness[probe_mask]
        # Largest inscribed sphere inside the component: the structural
        # thickness that decides whether the member can carry skin at all.
        bulk = (
            2.0 * float(np.abs(interior_values[voxel_mask].min())) * scale
            if voxel_mask.any()
            else 0.0
        )
        components_out.append(
            {
                "componentId": component["componentId"],
                "semanticRole": component["semanticRole"],
                "connectivityRole": component["connectivityRole"],
                "declaredMassWeight": float(component["massWeight"]),
                "measuredVolume": float(voxel_mask.sum()) * voxel_volume_world,
                "measuredMassShare": float(voxel_mask.sum())
                / max(len(voxel_owner), 1),
                "surfaceArea": float(areas[face_mask].sum()),
                "surfaceShare": float(areas[face_mask].sum() / max(areas.sum(), 1e-12)),
                "bulkThickness": bulk,
                "surfaceThickness": {
                    "min": float(component_thickness.min()),
                    "p05": float(np.percentile(component_thickness, 5)),
                    "p25": float(np.percentile(component_thickness, 25)),
                    "median": float(np.median(component_thickness)),
                }
                if component_thickness.size
                else None,
            }
        )

    zone_areas = {}
    family_area_share = {}
    for kind in ("feature", "silhouette", "density", "color"):
        for zone in target.zones[kind]:
            mask = zone_mask(zone, centroids_auth)
            zone_areas[f"{kind}:{zone['componentId']}:{zone['zoneId']}"] = {
                "area": float((areas * mask).sum()),
                "areaShare": float((areas * mask).sum() / max(areas.sum(), 1e-12)),
            }
        # Overlapping zones must not be counted twice: the family share uses
        # the same combined mask the sampler sees.
        combined = zone_family_mask(target.zones[kind], centroids_auth)
        family_area_share[kind] = float(
            (areas * combined).sum() / max(areas.sum(), 1e-12)
        )

    bounds_min = vertices.min(axis=0)
    bounds_max = vertices.max(axis=0)
    size = bounds_max - bounds_min
    euler = mops.euler_report(vertices, faces, labels)
    intersections = mops.self_intersections(vertices, faces)

    return {
        "v0": v0,
        "volumeRaw": raw_report["volume"],
        "normalizeScale": scale,
        "originOffset": target.origin_offset.tolist(),
        "volumeNormalized": report["volume"],
        "volumeError": abs(report["volume"] - v0) / v0,
        "surfaceArea": report["area"],
        "surfaceAreaVsMasterRatio": None,
        "vertexCount": report["vertex_count"],
        "faceCount": report["face_count"],
        "meshComponents": report["components"],
        "declaredShellCount": len(groups),
        "watertight": report["watertight"],
        "boundaryEdges": report["boundary_edges"],
        "nonManifoldEdges": report["non_manifold_edges"],
        "looseVertices": report["loose_vertices"],
        "degenerateFaces": report["degenerate_faces"],
        "finite": report["finite"],
        "positiveVolume": report["positive_volume"],
        "bounds": {
            "min": bounds_min.tolist(),
            "max": bounds_max.tolist(),
            "size": size.tolist(),
            "maxExtent": float(size.max()),
            "aspectRatio": float(size.max() / max(size.min(), 1e-9)),
        },
        "thickness": {
            "min": float(thickness.min()),
            "p05": float(np.percentile(thickness, 5)),
            "p25": float(np.percentile(thickness, 25)),
            "median": float(np.median(thickness)),
            "minBulkAcrossComponents": min(
                c["bulkThickness"] for c in components_out
            ),
        },
        "gridSpacingWorld": 2.0 * GRID_BOUNDS / (GRID_RESOLUTION - 1) * scale,
        "euler": euler,
        "selfIntersections": intersections,
        "components": components_out,
        "zoneAreas": zone_areas,
        "zoneFamilyAreaShare": family_area_share,
    }


def validate_target(target: CompiledTarget, v0: float) -> dict:
    definition = target.definition
    measures = target.measures
    policy = definition["validationPolicy"]
    tolerance = float(definition["normalizationPolicy"]["volumeTolerance"])
    checks: dict[str, bool] = {}
    notes: list[str] = []

    checks["finiteValues"] = bool(measures["finite"])
    checks["watertight"] = bool(measures["watertight"]) or not policy[
        "requireWatertight"
    ]
    checks["noLooseVertices"] = measures["looseVertices"] == 0
    checks["noDegenerateFaces"] = measures["degenerateFaces"] == 0
    checks["positiveVolume"] = bool(measures["positiveVolume"])
    checks["volumeWithinTolerance"] = measures["volumeError"] <= tolerance
    checks["componentCountMatchesDeclaration"] = (
        measures["meshComponents"]
        == measures["declaredShellCount"]
        == int(policy["expectedComponents"])
    )
    checks["genusIsInteger"] = all(
        c["genusIsInteger"] for c in measures["euler"]["components"]
    )
    checks["noSelfIntersections"] = (
        measures["selfIntersections"]["intersecting_pairs"] == 0
    )
    checks["boundsInsideGrid"] = measures["bounds"]["maxExtent"] < 2.0 * GRID_BOUNDS * 0.92

    minimum_thickness = policy.get("minThickness")
    if minimum_thickness is not None:
        # Structural thickness = the thinnest member's inscribed diameter.
        # Rounded rims always taper to zero and must not fail the target.
        measured = measures["thickness"]["minBulkAcrossComponents"]
        checks["minThickness"] = measured >= float(minimum_thickness)
        if not checks["minThickness"]:
            notes.append(
                "thinnest component bulk thickness %.4f below declared minimum "
                "%.4f" % (measured, float(minimum_thickness))
            )
    maximum_aspect = policy.get("maxAspectRatio")
    if maximum_aspect is not None:
        checks["aspectRatio"] = measures["bounds"]["aspectRatio"] <= float(
            maximum_aspect
        )

    for component in measures["components"]:
        declared = component["declaredMassWeight"]
        measured = component["measuredMassShare"]
        if abs(measured - declared) > 0.12:
            notes.append(
                "%s: measured mass share %.3f differs from declared %.3f"
                % (component["componentId"], measured, declared)
            )
    minimums = {
        c["componentId"]: c.get("minimumMassWeight")
        for c in definition["components"]
    }
    checks["minimumMassWeights"] = all(
        minimums[c["componentId"]] is None
        or c["measuredMassShare"] >= float(minimums[c["componentId"]])
        for c in measures["components"]
    )

    return {"checks": checks, "passed": all(checks.values()), "notes": notes}


def sdf_sign_probe(target: CompiledTarget, count: int = 20000) -> dict:
    """Independent check that the field sign agrees with the extracted surface.

    Mesh vertices sit up to half a voxel off the true zero level set, so the
    probe first projects onto the iso-surface and only then steps outward and
    inward by a fraction of the voxel size.
    """
    rng = target_rng(target.definition["targetId"] + ":sign")
    surface, _ = mo.sample_surface(target.vertices, target.faces, count, rng)
    projected = mo.project_to_iso(target.field, surface, iterations=8)
    normals = mo.sdf_gradient(target.field, projected)
    step = target.measures["gridSpacingWorld"] * 0.5
    outside = target.field(projected + normals * step)
    inside = target.field(projected - normals * step)
    residual = np.abs(target.field(projected))
    drift = np.linalg.norm(projected - surface, axis=1)
    return {
        "outsidePositiveShare": float((outside > 0).mean()),
        "insideNegativeShare": float((inside < 0).mean()),
        "maxResidualOnIsoSurface": float(residual.max()),
        "maxProjectionDriftOverVoxel": float(
            drift.max() / max(target.measures["gridSpacingWorld"], 1e-12)
        ),
        "probeStep": step,
        "valid": bool(
            (outside > 0).mean() > 0.999 and (inside < 0).mean() > 0.999
        ),
    }
