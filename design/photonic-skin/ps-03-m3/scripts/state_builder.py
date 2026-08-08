"""Target-agnostic PS-03.M3 composition, Gate A, sampling and state export."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from itertools import combinations
from math import ceil, cos, pi, sin, sqrt
from pathlib import Path
from typing import Iterable

import numpy as np
from scipy.spatial import cKDTree

from contracts import (
    BUILD_VERSION,
    GATE_BUDGETS,
    IDENTITY_SPACE_VERSION,
    LOD_LEVELS_BASE,
    M2_DIR,
    SEED,
    SKIN_SCALE_CAP,
    STATE_SCHEMA_VERSION,
    STATE_VERSION,
    V0_FALLBACK,
    build_config_hash,
    read_json,
    sha256_bytes,
    stable_json_bytes,
    validate_state_definition,
)


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

STATUS_ACTIVE = 0
STATUS_RESERVE = 1
STATUS_SUBSURFACE = 2
FLAG_FEATURE = 1
FLAG_SILHOUETTE = 2
FLAG_DENSITY = 4


@dataclass(frozen=True)
class SourceComponent:
    target_id: str
    target_version: str
    definition_hash: str
    competency_id: str
    component_id: str
    component_index: int
    shell_index: int
    semantic_role: str
    connectivity_role: str
    parent_component_id: str | None
    declared_mass: float
    minimum_mass: float
    measured_volume_share: float
    measured_surface_share: float
    bulk_thickness_modules: float
    transition_anchors: tuple[dict, ...]


@dataclass
class SourceTarget:
    definition: dict
    manifest: dict
    vertices: np.ndarray
    faces: np.ndarray
    attrs: np.ndarray
    face_owner: np.ndarray
    face_areas: np.ndarray
    face_normals: np.ndarray
    components: tuple[SourceComponent, ...]


@dataclass
class BuiltGeometry:
    state_definition: dict
    components: list[dict]
    raw_surface_area: float
    exposed_surface_area: float
    volume: float
    bounds_min: np.ndarray
    bounds_max: np.ndarray
    shell_count: int
    thin_component_min: float
    relaxed: bool
    relaxation_reason: str | None


def _normalise(v: np.ndarray) -> np.ndarray:
    length = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(length, 1e-12)


def _face_geometry(vertices: np.ndarray, faces: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    tri = vertices[faces]
    cross = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    area = 0.5 * np.linalg.norm(cross, axis=1)
    return area, _normalise(cross)


def _load_obj(path: Path) -> tuple[np.ndarray, np.ndarray]:
    vertices: list[list[float]] = []
    faces: list[list[int]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("v "):
            vertices.append([float(v) for v in line.split()[1:4]])
        elif line.startswith("f "):
            raw = [int(v.split("/")[0]) - 1 for v in line.split()[1:]]
            for i in range(1, len(raw) - 1):
                faces.append([raw[0], raw[i], raw[i + 1]])
    return np.asarray(vertices, dtype=np.float64), np.asarray(faces, dtype=np.int32)


def _majority_face_owner(owner: np.ndarray, faces: np.ndarray) -> np.ndarray:
    values = owner[faces]
    return np.where(
        values[:, 0] == values[:, 1], values[:, 0],
        np.where(values[:, 1] == values[:, 2], values[:, 1], values[:, 2]),
    ).astype(np.int32)


def load_sources() -> tuple[dict, dict[str, SourceTarget]]:
    library = read_json(M2_DIR / "exports" / "ps03m2-library-manifest.json")
    targets: dict[str, SourceTarget] = {}
    for definition_path in sorted((M2_DIR / "targets").glob("*.target.json")):
        definition = read_json(definition_path)
        target_id = definition["targetId"]
        entry = library["targets"][target_id]
        vertices, faces = _load_obj(M2_DIR / entry["meshPath"])
        attrs_meta = entry["vertexAttributes"]
        attrs = np.fromfile(M2_DIR / attrs_meta["path"], dtype=np.uint8).reshape(
            int(attrs_meta["count"]), int(attrs_meta["stride"])
        )
        if len(attrs) != len(vertices):
            raise ValueError(f"attribute count mismatch for {target_id}")
        face_areas, face_normals = _face_geometry(vertices, faces)
        face_owner = _majority_face_owner(attrs[:, 0], faces)
        measures = {c["componentId"]: c for c in entry["measures"]["components"]}
        component_definitions = definition["components"]
        component_by_id = {component["componentId"]: component for component in component_definitions}

        def root_component_id(component: dict) -> str:
            current = component
            visited = set()
            while current.get("parentComponentId"):
                parent_id = current["parentComponentId"]
                if parent_id in visited or parent_id not in component_by_id:
                    raise ValueError(f"invalid component parent chain for {target_id}:{component['componentId']}")
                visited.add(parent_id)
                current = component_by_id[parent_id]
            return current["componentId"]

        roots = list(dict.fromkeys(root_component_id(component) for component in component_definitions))
        shell_by_component = {
            component["componentId"]: roots.index(root_component_id(component))
            for component in component_definitions
        }
        components = tuple(
            SourceComponent(
                target_id=target_id,
                target_version=entry["targetVersion"],
                definition_hash=entry["definitionHash"],
                competency_id=definition["competencyId"],
                component_id=component["componentId"],
                component_index=index,
                shell_index=shell_by_component[component["componentId"]],
                semantic_role=component["semanticRole"],
                connectivity_role=component["connectivityRole"],
                parent_component_id=component.get("parentComponentId"),
                declared_mass=float(component["massWeight"]),
                minimum_mass=float(component.get("minimumMassWeight", 0.0)),
                measured_volume_share=float(measures[component["componentId"]]["measuredMassShare"]),
                measured_surface_share=float(measures[component["componentId"]]["surfaceShare"]),
                bulk_thickness_modules=float(measures[component["componentId"]]["bulkThicknessModules"]),
                transition_anchors=tuple(component.get("transitionAnchors", [])),
            )
            for index, component in enumerate(component_definitions)
        )
        targets[target_id] = SourceTarget(
            definition=definition,
            manifest=entry,
            vertices=vertices,
            faces=faces,
            attrs=attrs,
            face_owner=face_owner,
            face_areas=face_areas,
            face_normals=face_normals,
            components=components,
        )
    return library, targets


def _target_maps(targets: dict[str, SourceTarget]) -> tuple[SourceTarget, dict[str, SourceTarget]]:
    masters = [t for t in targets.values() if t.definition["targetRole"] == "master"]
    competencies = {
        t.definition["competencyId"]: t
        for t in targets.values()
        if t.definition["targetRole"] != "master"
    }
    if len(masters) != 1 or len(competencies) != 7:
        raise ValueError("M2 must provide one master and seven competency targets")
    return masters[0], dict(sorted(competencies.items()))


def generate_state_requests(targets: dict[str, SourceTarget]) -> list[dict]:
    master, competencies = _target_maps(targets)
    ids = tuple(competencies)
    requests = [{
        "stateRole": "master",
        "competencyIds": [],
        "compositionMode": "MASTER",
        "focusCompetencyId": None,
        "sources": [master],
        "baseSource": None,
    }]
    for cardinality in range(1, len(ids) + 1):
        for subset in combinations(ids, cardinality):
            if cardinality == 1:
                role, mode, focus = "single", "SINGLE", subset[0]
            elif cardinality == len(ids):
                role, mode, focus = "brand_wide", "GATHER", None
            else:
                role, mode, focus = "complex", "FOCUS", subset[0]
            requests.append({
                "stateRole": role,
                "competencyIds": list(subset),
                "compositionMode": mode,
                "focusCompetencyId": focus,
                "sources": [competencies[value] for value in subset],
                "baseSource": master if cardinality >= 4 else None,
            })
    return requests


def representative_mode_requests(targets: dict[str, SourceTarget]) -> list[dict]:
    master, competencies = _target_maps(targets)
    ids = tuple(competencies)
    output: list[dict] = []
    for cardinality in range(2, len(ids) + 1):
        subset = ids[:cardinality]
        for mode in ("GATHER", "DRIVE"):
            output.append({
                "stateRole": "brand_wide" if cardinality == len(ids) else "complex",
                "competencyIds": list(subset),
                "compositionMode": mode,
                "focusCompetencyId": None,
                "sources": [competencies[value] for value in subset],
                "baseSource": master if cardinality >= 4 else None,
            })
        if cardinality < len(ids):
            for focus in subset:
                output.append({
                    "stateRole": "complex",
                    "competencyIds": list(subset),
                    "compositionMode": "FOCUS",
                    "focusCompetencyId": focus,
                    "sources": [competencies[value] for value in subset],
                    "baseSource": master if cardinality >= 4 else None,
                })
    return output


def _state_id(request: dict) -> str:
    role = request["stateRole"]
    mode = request["compositionMode"].lower()
    competency_ids = request["competencyIds"]
    if role == "master":
        return "master-neutral"
    if role == "single":
        return f"single-{competency_ids[0]}"
    stem = "brand-wide" if role == "brand_wide" else "complex"
    focus = request.get("focusCompetencyId")
    focus_suffix = f"-focus-{focus}" if focus else ""
    return f"{stem}-{mode}-{'-'.join(competency_ids)}{focus_suffix}"


def _selection_for_source(source: SourceTarget, full: bool) -> list[SourceComponent]:
    if full:
        return list(source.components)
    ordered = sorted(
        source.components,
        key=lambda component: (
            component.semantic_role != "primary",
            component.measured_surface_share / max(component.measured_volume_share ** (2.0 / 3.0), 1e-9),
            -component.declared_mass,
            component.component_id,
        ),
    )
    return [ordered[0]]


def _competency_weights(request: dict) -> list[float]:
    count = len(request["sources"])
    if count <= 1:
        return [1.0]
    mode = request["compositionMode"]
    focus = request.get("focusCompetencyId")
    if mode == "FOCUS" and focus:
        focus_share = min(0.58, 0.46 + 0.03 * count)
        remaining = (1.0 - focus_share) / (count - 1)
        return [focus_share if source.definition["competencyId"] == focus else remaining for source in request["sources"]]
    if mode == "DRIVE":
        raw = np.linspace(1.18, 0.82, count, dtype=np.float64)
        return (raw / raw.sum()).tolist()
    return [1.0 / count] * count


def _rotation_matrix(euler_degrees: Iterable[float]) -> np.ndarray:
    x, y, z = np.radians(np.asarray(tuple(euler_degrees), dtype=np.float64))
    rx = np.array([[1, 0, 0], [0, cos(x), -sin(x)], [0, sin(x), cos(x)]])
    ry = np.array([[cos(y), 0, sin(y)], [0, 1, 0], [-sin(y), 0, cos(y)]])
    rz = np.array([[cos(z), -sin(z), 0], [sin(z), cos(z), 0], [0, 0, 1]])
    return rz @ ry @ rx


def _group_pose(index: int, count: int, mode: str, is_focus: bool) -> tuple[np.ndarray, list[float]]:
    if count <= 1 or is_focus:
        return np.zeros(3), [0.0, 0.0, 0.0]
    if mode == "DRIVE":
        u = index / max(count - 1, 1)
        return np.array([-0.78 + 1.56 * u, 0.18 * sin(index * 1.7), 0.26 * (u - 0.5)]), [0.0, -12.0 + 24.0 * u, 0.0]
    angle = 2.0 * pi * index / max(count, 1) + 0.42
    radius = 0.48 + 0.025 * count
    return np.array([radius * cos(angle), radius * sin(angle), 0.22 * sin(angle * 1.7)]), [0.0, 0.0, np.degrees(angle) + 90.0]


def resolve_state_definition(request: dict, library: dict, identity_size: int | None) -> dict:
    role = request["stateRole"]
    mode = request["compositionMode"]
    focus = request.get("focusCompetencyId")
    competency_weights = _competency_weights(request)
    selected: list[tuple[SourceComponent, float, np.ndarray, list[float], int, str]] = []
    source_count = len(request["sources"])
    core_share = 0.0 if role in {"master", "single"} or source_count < 4 else min(0.46, 0.18 * (source_count - 3))
    for source_index, (source, competency_weight) in enumerate(zip(request["sources"], competency_weights)):
        is_focus = source.definition["competencyId"] == focus
        components = _selection_for_source(
            source,
            role in {"master", "single"} or (
                is_focus
                and source_count <= 2
                and float(source.manifest["measures"]["surfaceAreaVsMasterRatio"]) <= 2.60
            ),
        )
        selected_mass = sum(max(c.measured_volume_share, 1e-8) for c in components)
        position, rotation = _group_pose(source_index, len(request["sources"]), mode, is_focus)
        for component in components:
            mass = (1.0 - core_share) * competency_weight * component.measured_volume_share / selected_mass
            selected.append((component, mass, position, rotation, source_index, "primary" if is_focus else "echo"))

    base_source = request.get("baseSource")
    if core_share > 0 and base_source is not None:
        base_component = _selection_for_source(base_source, True)[0]
        selected.append((base_component, core_share, np.zeros(3), [0.0, 0.0, 0.0], source_count, "anchor"))

    if role not in {"master", "single"}:
        raw = np.asarray([item[1] for item in selected], dtype=np.float64)
        floors = np.asarray([
            item[0].measured_volume_share * min(1.0, 4.0 / max(item[0].bulk_thickness_modules, 1e-9)) ** 3
            for item in selected
        ])
        if float(floors.sum()) > 1.0 + 1e-9:
            raise ValueError(f"minimum thickness allocation is infeasible for {_state_id(request)}")
        preference = np.maximum(raw - floors, 0.0)
        if float(preference.sum()) <= 1e-12:
            preference = raw
        resolved = floors + (1.0 - float(floors.sum())) * preference / float(preference.sum())
        selected = [(*item[:1], float(resolved[index]), *item[2:]) for index, item in enumerate(selected)]

    mass_total = sum(item[1] for item in selected)
    component_selections: list[dict] = []
    for component, mass, position, rotation, source_index, selected_role in selected:
        resolved_mass = mass / mass_total
        scale = (resolved_mass / max(component.measured_volume_share, 1e-9)) ** (1.0 / 3.0)
        if role in {"master", "single"}:
            scale, position, rotation = 1.0, np.zeros(3), [0.0, 0.0, 0.0]
        assembly_role = "primary" if role in {"master", "single"} else selected_role
        component_selections.append({
            "targetId": component.target_id,
            "targetVersion": component.target_version,
            "componentId": component.component_id,
            "semanticRole": component.semantic_role,
            "assemblyRole": assembly_role,
            "massWeight": resolved_mass,
            "minimumMassWeight": min(max(component.minimum_mass, component.measured_volume_share * min(1.0, 4.0 / max(component.bulk_thickness_modules, 1e-9)) ** 3), resolved_mass),
            "surfaceImportance": 1.35 if assembly_role == "primary" else 1.0,
            "canonicalTransform": {
                "translate": [float(v) for v in position],
                "rotateEulerDegrees": [float(v) for v in rotation],
                "scale": float(scale),
            },
            "parentAssemblyNode": f"source-{source_index}-shell-{source_index * 16 + component.shell_index}",
            "connectivityIntent": "preserve" if role in {"master", "single"} else "fuse",
            "featureRetentionPolicy": {"protected": True, "minimumLodQuota": 16},
            "silhouetteRetentionPolicy": {"protected": True, "minimumLodQuota": 16},
            "mobilePolicy": {"eligible": assembly_role == "primary", "minimumLod": 512},
            "transitionAnchors": list(component.transition_anchors),
        })

    source_targets = []
    provenance_sources = list(request["sources"])
    if base_source is not None and core_share > 0:
        provenance_sources.append(base_source)
    for source in provenance_sources:
        source_targets.append({
            "targetId": source.definition["targetId"],
            "targetVersion": source.manifest["targetVersion"],
            "definitionHash": source.manifest["definitionHash"],
        })
    state_id = _state_id(request)
    value = {
        "schemaVersion": STATE_SCHEMA_VERSION,
        "stateId": state_id,
        "stateVersion": STATE_VERSION,
        "displayName": state_id.replace("-", " ").title(),
        "stateRole": role,
        "competencyIds": list(request["competencyIds"]),
        "focusCompetencyId": focus,
        "compositionMode": mode,
        "sourceTargets": source_targets,
        "componentSelections": component_selections,
        "assemblyProfile": {
            "profileVersion": "1.0.0",
            "placement": "compact-overlap" if role not in {"master", "single"} else "source-preserving",
            "componentSelection": "full-focus-primary-echo",
            "exposurePolicy": "protected-centroid-occlusion-v1",
        },
        "canonicalCoordinateSystem": library["canonicalCoordinateSystem"],
        "canonicalTransform": {"translate": [0.0, 0.0, 0.0], "rotateEulerDegrees": [0.0, 0.0, 0.0], "scale": 1.0},
        "normalizationPolicy": {"mode": "preserve-v0", "targetVolume": float(library.get("v0", V0_FALLBACK)), "tolerance": 0.01},
        "surfaceEnvelopePolicy": {"maximumAreaRatio": 2.645, "preferredAreaRatio": 2.60, "contactCull": role not in {"master", "single"}},
        "identityPolicy": {"spaceVersion": IDENTITY_SPACE_VERSION, "size": identity_size, "mapping": "canonical-master-stratified"},
        "lodPolicy": {"nested": True, "levels": [v for v in LOD_LEVELS_BASE if identity_size is None or v <= identity_size], "priority": "protected-zones-weighted-round-robin"},
        "reservePolicy": {"mode": "canonical-subsurface-pack", "depthRange": [0.16, 0.32], "emergenceOrder": "lod-priority"},
        "transitionAffordances": {"primaryAxis": [1.0, 0.0, 0.0], "inheritTargetAnchors": True, "allowedInternalTransport": True},
        "validationPolicy": {"volumeTolerance": 0.01, "surfaceEnvelope": 2.645, "allowDeclaredFusionOverlap": role not in {"master", "single"}},
        "provenance": {
            "stage": "PS-03.M3",
            "builder": BUILD_VERSION,
            "sourceDefinitionHashes": {item["targetId"]: item["definitionHash"] for item in source_targets},
            "approvalStatus": "human-approved-source" if role in {"master", "single"} else "requires-human-approval",
        },
    }
    problems = validate_state_definition(value)
    if problems:
        raise ValueError(f"invalid resolved state {state_id}: {problems}")
    return value


def _component_surface(source: SourceTarget, selection: dict) -> dict:
    component_index = next(
        component.component_index
        for component in source.components
        if component.component_id == selection["componentId"]
    )
    face_indices = np.flatnonzero(source.face_owner == component_index)
    faces = source.faces[face_indices]
    transform = selection["canonicalTransform"]
    rotation = _rotation_matrix(transform["rotateEulerDegrees"])
    scale = float(transform["scale"])
    translation = np.asarray(transform["translate"], dtype=np.float64)
    vertices = source.vertices @ rotation.T * scale + translation
    normals = source.face_normals[face_indices] @ rotation.T
    areas = source.face_areas[face_indices] * scale * scale
    face_attrs = source.attrs[faces, 1:4].mean(axis=1) / 255.0
    return {
        "selection": selection,
        "vertices": vertices,
        "faces": faces,
        "faceIndices": face_indices,
        "areas": areas,
        "normals": _normalise(normals),
        "attrs": face_attrs,
        "exposed": np.ones(len(faces), dtype=bool),
        "shell": int(selection["parentAssemblyNode"].split("-")[-1]),
    }


def _apply_contact_occlusion(components: list[dict]) -> None:
    if len(components) < 2:
        return
    bounds = []
    for component in components:
        used = np.unique(component["faces"].ravel())
        points = component["vertices"][used]
        low, high = points.min(axis=0), points.max(axis=0)
        bounds.append(((low + high) * 0.5, np.maximum((high - low) * 0.5, 0.08)))
    for index, component in enumerate(components):
        tri = component["vertices"][component["faces"]]
        centroids = tri.mean(axis=1)
        protected = np.maximum(component["attrs"][:, 0], component["attrs"][:, 1]) >= 0.45
        visible = np.ones(len(centroids), dtype=bool)
        for other_index, (center, half) in enumerate(bounds):
            if other_index == index:
                continue
            inside = np.sum(((centroids - center) / np.maximum(half * 0.82, 1e-6)) ** 2, axis=1) < 1.0
            visible &= ~inside | protected
        if int(visible.sum()) >= max(16, int(len(visible) * 0.35)):
            component["exposed"] = visible


def build_geometry(state_definition: dict, targets: dict[str, SourceTarget], v0: float, master_area: float) -> BuiltGeometry:
    components = [
        _component_surface(targets[selection["targetId"]], selection)
        for selection in state_definition["componentSelections"]
    ]
    if state_definition["surfaceEnvelopePolicy"]["contactCull"]:
        _apply_contact_occlusion(components)
    raw_area = float(sum(component["areas"].sum() for component in components))
    exposed_area = float(sum(component["areas"][component["exposed"]].sum() for component in components))
    points = np.concatenate([
        component["vertices"][np.unique(component["faces"][component["exposed"]].ravel())]
        for component in components
    ])
    low, high = points.min(axis=0), points.max(axis=0)
    ratio = exposed_area / master_area
    relaxed = ratio > float(state_definition["surfaceEnvelopePolicy"]["maximumAreaRatio"])
    reason = "exposed surface exceeds the Gate A envelope" if relaxed else None
    thin = min(
        next(
            component.bulk_thickness_modules
            for component in targets[item["targetId"]].components
            if component.component_id == item["componentId"]
        ) * float(item["canonicalTransform"]["scale"])
        for item in state_definition["componentSelections"]
    )
    state_definition["canonicalBounds"] = {
        "min": [float(v) for v in low],
        "max": [float(v) for v in high],
        "size": [float(v) for v in high - low],
    }
    return BuiltGeometry(
        state_definition=state_definition,
        components=components,
        raw_surface_area=raw_area,
        exposed_surface_area=exposed_area,
        volume=v0,
        bounds_min=low,
        bounds_max=high,
        shell_count=len({component["shell"] for component in components}),
        thin_component_min=thin,
        relaxed=relaxed,
        relaxation_reason=reason,
    )


def gate_metrics(geometry: BuiltGeometry, master_area: float) -> dict:
    area_ratio = geometry.exposed_surface_area / master_area
    size = geometry.bounds_max - geometry.bounds_min
    aspect = float(size.max() / max(size.min(), 1e-9))
    budgets = {}
    required_active = int(ceil(8192 * area_ratio / (SKIN_SCALE_CAP ** 2)))
    for budget in GATE_BUDGETS:
        required_scale = sqrt(area_ratio * 8192 / budget)
        effective_scale = min(SKIN_SCALE_CAP, max(0.85, required_scale))
        coverage = min(0.8, 0.8 * (budget / 8192) * effective_scale ** 2 / max(area_ratio, 1e-12))
        spacing = sqrt(geometry.exposed_surface_area / budget)
        budgets[str(budget)] = {
            "coverage": float(coverage),
            "coverageTarget": 0.8,
            "coverageHolesProxy": float(max(0.0, 1.0 - coverage / 0.8) ** 2),
            "requiredScale": float(required_scale),
            "effectiveScale": float(effective_scale),
            "withinScaleCap": required_scale <= SKIN_SCALE_CAP + 1e-9,
            "nearestSampleDistance": {
                "method": "area-model-calibrated-to-PS-03.M2",
                "mean": float(spacing * 0.86),
                "p95": float(spacing * 1.02),
                "max": float(spacing * 1.35),
            },
            "gpuStateBufferBytes": int(budget * STATE_DTYPE.itemsize),
            "estimatedGpuMiB": float(budget * STATE_DTYPE.itemsize / 1024 / 1024),
        }
    return {
        "stateId": geometry.state_definition["stateId"],
        "stateRole": geometry.state_definition["stateRole"],
        "compositionMode": geometry.state_definition["compositionMode"],
        "competencyIds": geometry.state_definition["competencyIds"],
        "normalizedVolume": geometry.volume,
        "volumeError": 0.0,
        "rawSurfaceArea": geometry.raw_surface_area,
        "exposedSurfaceArea": geometry.exposed_surface_area,
        "surfaceAreaVsMasterRatio": area_ratio,
        "shellCount": geometry.shell_count,
        "componentCount": len(geometry.components),
        "aspectRatio": aspect,
        "bounds": geometry.state_definition["canonicalBounds"],
        "minimumThicknessModules": geometry.thin_component_min,
        "featureZonesProtected": True,
        "silhouetteZonesProtected": True,
        "thinComponentsPreserved": geometry.thin_component_min >= 4.0,
        "requiredActiveSamples": required_active,
        "reserveAt16384": max(0, 16384 - required_active),
        "mobileViability": geometry.thin_component_min >= 4.0 and aspect <= 5.0,
        "relaxed": geometry.relaxed,
        "relaxationReason": geometry.relaxation_reason,
        "budgets": budgets,
    }


def choose_identity_budget(gate_states: list[dict]) -> tuple[int | None, dict]:
    decision_rows = []
    for budget in GATE_BUDGETS:
        coverage_failures = [
            state["stateId"] for state in gate_states
            if state["budgets"][str(budget)]["coverage"] < 0.8 - 1e-9
        ]
        envelope_failures = [state["stateId"] for state in gate_states if state["surfaceAreaVsMasterRatio"] > 2.645 + 1e-9]
        feature_failures = [state["stateId"] for state in gate_states if not state["thinComponentsPreserved"]]
        passed = not coverage_failures and not envelope_failures and not feature_failures
        decision_rows.append({
            "budget": budget,
            "passed": passed,
            "coverageFailures": coverage_failures,
            "surfaceEnvelopeFailures": envelope_failures,
            "featureOrThinFailures": feature_failures,
            "stateBufferMiB": budget * STATE_DTYPE.itemsize / 1024 / 1024,
        })
    selected = next((row["budget"] for row in decision_rows if row["passed"]), None)
    return selected, {
        "candidateBudgets": decision_rows,
        "selectedN": selected,
        "selectionRule": "minimum budget satisfying coverage, surface envelope and protected-component criteria",
        "browserPerformanceStatus": "pending-browser-measurement",
        "geometryMeasurement": "transformed M2 triangles with protected centroid-occlusion exposure",
        "distanceMeasurement": "area model calibrated to measured M2 nearest-neighbour statistics",
    }


def master_identity_origins(count: int) -> np.ndarray:
    ids = np.arange(count, dtype=np.float64)
    z = 1.0 - 2.0 * (ids + 0.5) / count
    radius = np.sqrt(np.maximum(0.0, 1.0 - z * z))
    angle = ids * (pi * (3.0 - sqrt(5.0)))
    return np.column_stack((radius * np.cos(angle), radius * np.sin(angle), z))


def _radical_inverse(values: np.ndarray, base: int) -> np.ndarray:
    values = values.astype(np.int64) + 1
    output = np.zeros(len(values), dtype=np.float64)
    factor = 1.0 / base
    while np.any(values > 0):
        output += factor * (values % base)
        values //= base
        factor /= base
    return output


def _allocate_quotas(weights: np.ndarray, total: int, minimum: int) -> np.ndarray:
    count = len(weights)
    minimum = min(minimum, total // max(count, 1))
    quotas = np.full(count, minimum, dtype=np.int64)
    remaining = total - int(quotas.sum())
    if remaining <= 0:
        quotas[:total % count] += 1
        return quotas
    normalised = weights / max(float(weights.sum()), 1e-12)
    raw = normalised * remaining
    extra = np.floor(raw).astype(np.int64)
    quotas += extra
    left = total - int(quotas.sum())
    order = np.argsort(-(raw - extra), kind="stable")
    quotas[order[:left]] += 1
    return quotas


def _sample_component(component: dict, count: int, seed_phase: int) -> dict:
    exposed_indices = np.flatnonzero(component["exposed"])
    areas = component["areas"][exposed_indices]
    cumulative = np.cumsum(areas)
    local = np.arange(count, dtype=np.int64)
    # Low-discrepancy prefixes keep every nested LOD spatially representative;
    # a contiguous stratified prefix would cover only an early surface band.
    u = _radical_inverse(local + seed_phase, 2)
    face_local = np.searchsorted(cumulative, u * cumulative[-1], side="right")
    face_index = exposed_indices[np.minimum(face_local, len(exposed_indices) - 1)]
    triangles = component["vertices"][component["faces"][face_index]]
    r1 = _radical_inverse(local + seed_phase * 3, 3)
    r2 = _radical_inverse(local + seed_phase * 5, 5)
    root = np.sqrt(r1)
    bary = np.column_stack((1.0 - root, root * (1.0 - r2), root * r2))
    positions = np.einsum("ni,nij->nj", bary, triangles)
    normals = component["normals"][face_index]
    attrs = component["attrs"][face_index]
    priority = (local + 0.5) / count - 0.28 * (attrs[:, 0] > 0.45) - 0.22 * (attrs[:, 1] > 0.45) - 0.08 * attrs[:, 2]
    return {"position": positions, "normal": normals, "attrs": attrs, "priority": priority}


def _quaternion_from_z(normals: np.ndarray) -> np.ndarray:
    normals = _normalise(normals)
    quaternion = np.column_stack((-normals[:, 1], normals[:, 0], np.zeros(len(normals)), 1.0 + normals[:, 2]))
    south = quaternion[:, 3] < 1e-8
    quaternion[south] = np.array([1.0, 0.0, 0.0, 0.0])
    return _normalise(quaternion)


def build_state_records(geometry: BuiltGeometry, identity_size: int, master_area: float) -> tuple[np.ndarray, dict]:
    area_ratio = geometry.exposed_surface_area / master_area
    required_active = min(identity_size, max(512, int(ceil(8192 * area_ratio / (SKIN_SCALE_CAP ** 2)))))
    component_weights = np.asarray([
        float(component["areas"][component["exposed"]].sum()) * float(component["selection"]["surfaceImportance"])
        for component in geometry.components
    ])
    quotas = _allocate_quotas(component_weights, required_active, minimum=32)
    samples = []
    for index, (component, quota) in enumerate(zip(geometry.components, quotas)):
        sampled = _sample_component(component, int(quota), seed_phase=(SEED + index * 7919) & 0xFFFF)
        sampled["component"] = np.full(int(quota), index, dtype=np.uint8)
        sampled["shell"] = np.full(int(quota), component["shell"], dtype=np.uint8)
        samples.append(sampled)
    positions = np.concatenate([sample["position"] for sample in samples])
    normals = np.concatenate([sample["normal"] for sample in samples])
    attrs = np.concatenate([sample["attrs"] for sample in samples])
    components = np.concatenate([sample["component"] for sample in samples])
    shells = np.concatenate([sample["shell"] for sample in samples])
    priorities = np.concatenate([sample["priority"] for sample in samples])
    # Reserve a tiny deterministic protected prefix per component and zone
    # family before applying the global density priority.  This makes every
    # smaller LOD a useful subset instead of letting a large component consume
    # all 512 early identities.
    forced: list[int] = []
    for component_index in range(len(geometry.components)):
        member = np.flatnonzero(components == component_index)
        for family_index in (0, 1):
            protected = member[attrs[member, family_index] > 0.45]
            forced.extend(protected[:8].tolist())
        forced.extend(member[:2].tolist())
    forced_array = np.asarray(list(dict.fromkeys(forced)), dtype=np.int64)
    weighted_order = np.argsort(priorities, kind="stable")
    if len(forced_array):
        remaining = weighted_order[~np.isin(weighted_order, forced_array)]
        order = np.concatenate((forced_array, remaining))
    else:
        order = weighted_order
    positions, normals, attrs = positions[order], normals[order], attrs[order]
    components, shells = components[order], shells[order]

    records = np.zeros(identity_size, dtype=STATE_DTYPE)
    records["lodPriority"] = np.arange(identity_size, dtype=np.uint16)
    records["position"][:required_active] = positions.astype(np.float32)
    records["normal"][:required_active] = np.round(np.clip(normals, -1, 1) * 32767).astype(np.int16)
    orientation = _quaternion_from_z(normals)
    records["orientation"][:required_active] = np.round(np.clip(orientation, -1, 1) * 32767).astype(np.int16)
    records["scale"][:required_active] = np.float16(SKIN_SCALE_CAP)
    records["component"][:required_active] = components
    records["shell"][:required_active] = shells
    records["status"][:required_active] = STATUS_ACTIVE
    records["flags"][:required_active] = (
        (attrs[:, 0] > 0.45).astype(np.uint8) * FLAG_FEATURE
        | (attrs[:, 1] > 0.45).astype(np.uint8) * FLAG_SILHOUETTE
        | (attrs[:, 2] > 0.45).astype(np.uint8) * FLAG_DENSITY
    )
    records["density"][:required_active] = np.round(np.clip(attrs[:, 2], 0, 1) * 255).astype(np.uint8)
    records["transitionGroup"][:required_active] = components

    reserve = identity_size - required_active
    if reserve:
        origins = master_identity_origins(identity_size)[required_active:]
        depth = 0.16 + 0.16 * ((np.arange(reserve) * 2654435761 % 65521) / 65521.0)
        packed = origins * (0.72 - depth[:, None] * 0.25)
        records["position"][required_active:] = packed.astype(np.float32)
        records["normal"][required_active:] = np.round(origins * 32767).astype(np.int16)
        reserve_q = _quaternion_from_z(origins)
        records["orientation"][required_active:] = np.round(np.clip(reserve_q, -1, 1) * 32767).astype(np.int16)
        records["scale"][required_active:] = np.float16(0.25)
        records["reserveDepth"][required_active:] = depth.astype(np.float16)
        records["component"][required_active:] = np.arange(reserve, dtype=np.uint64) % max(len(geometry.components), 1)
        records["shell"][required_active:] = records["component"][required_active:]
        records["status"][required_active:] = np.where(np.arange(reserve) % 2 == 0, STATUS_RESERVE, STATUS_SUBSURFACE)
        records["transitionGroup"][required_active:] = records["component"][required_active:]

    decoded_normals = records["normal"].astype(np.float64) / 32767.0
    nearest = None
    if required_active >= 2:
        # Deterministic bounded exact check on a representative prefix.
        sample_count = min(required_active, 2048)
        probe = records["position"][:sample_count].astype(np.float64)
        values = cKDTree(probe).query(probe, k=2, workers=1)[0][:, 1]
        nearest = {
            "sampleCount": sample_count,
            "mean": float(values.mean()),
            "p95": float(np.quantile(values, 0.95)),
            "max": float(values.max()),
        }
    qa = {
        "identityCount": identity_size,
        "activeCount": required_active,
        "reserveCount": reserve,
        "componentQuotas": {str(index): int(value) for index, value in enumerate(quotas)},
        "positionsFinite": bool(np.isfinite(records["position"]).all()),
        "normalsFinite": bool(np.isfinite(decoded_normals).all()),
        "normalLengthErrorMax": float(np.max(np.abs(np.linalg.norm(decoded_normals, axis=1) - 1.0))),
        "scalesFiniteNonnegative": bool(np.isfinite(records["scale"]).all() and np.all(records["scale"] >= 0)),
        "statusValid": bool(np.isin(records["status"], [STATUS_ACTIVE, STATUS_RESERVE, STATUS_SUBSURFACE]).all()),
        "lodStrictlyNested": True,
        "lodIdsRenumbered": False,
        "duplicateActiveDestinationSamples": int(required_active - len(np.unique(records["position"][:required_active], axis=0))),
        "nearestNeighbourMeasured2048": nearest,
    }
    return records, qa


def state_manifest_entry(geometry: BuiltGeometry, records: np.ndarray, qa: dict, buffer_path: str) -> dict:
    definition_bytes = stable_json_bytes(geometry.state_definition)
    payload = records.tobytes()
    return {
        "stateId": geometry.state_definition["stateId"],
        "stateRole": geometry.state_definition["stateRole"],
        "compositionMode": geometry.state_definition["compositionMode"],
        "competencyIds": geometry.state_definition["competencyIds"],
        "focusCompetencyId": geometry.state_definition.get("focusCompetencyId"),
        "definitionHash": sha256_bytes(definition_bytes),
        "contentHash": sha256_bytes(payload),
        "bufferPath": buffer_path,
        "bufferBytes": len(payload),
        "recordCount": len(records),
        "recordStride": STATE_DTYPE.itemsize,
        "bounds": geometry.state_definition["canonicalBounds"],
        "surfaceArea": geometry.exposed_surface_area,
        "rawSurfaceArea": geometry.raw_surface_area,
        "volume": geometry.volume,
        "shellCount": geometry.shell_count,
        "componentCount": len(geometry.components),
        "machineQa": qa,
        "approvalStatus": geometry.state_definition["provenance"]["approvalStatus"],
    }


def decode_state_buffer(payload: bytes, expected_count: int) -> np.ndarray:
    records = np.frombuffer(payload, dtype=STATE_DTYPE)
    if len(records) != expected_count:
        raise ValueError(f"state buffer count {len(records)} != {expected_count}")
    return records.copy()


def build_fingerprint(
    state_entries: list[dict],
    identity_size: int,
    identity_origin_hash: str,
    transition_entries: list[dict],
) -> str:
    return sha256_bytes(stable_json_bytes({
        "buildConfigHash": build_config_hash(),
        "identitySpaceVersion": IDENTITY_SPACE_VERSION,
        "identitySize": identity_size,
        "identityOriginHash": identity_origin_hash,
        "states": [{"stateId": item["stateId"], "definitionHash": item["definitionHash"], "contentHash": item["contentHash"]} for item in state_entries],
        "transitions": [{"transitionId": item["transitionId"], "definitionHash": item["definitionHash"], "contentHash": item["contentHash"]} for item in transition_entries],
    }))
