"""PS-03.M2 TargetDefinition contract: schema, required/optional semantics,
validation.

The contract is versioned data.  A new subject form is a new JSON document in
``targets/``; no pipeline module is allowed to branch on its identity.

Required/optional policy
------------------------
A field is required only when its absence would make the target ambiguous or
would force the pipeline to guess.  Everything that can be *measured* from the
geometry (bounds, volumes, areas) is optional in the definition: when present
it is treated as a declared expectation and cross-checked against the measured
value; when absent the measured value is simply recorded.

Zones (feature / silhouette / density / color) are declared as regions built
from the same geometry providers as the geometry itself, so zone handling is
one generic code path for every target.
"""

from __future__ import annotations

import json
from pathlib import Path

import geometry_providers as gp

SCHEMA_VERSION = "1.0.0"

CANONICAL_COORDINATE_SYSTEM = {
    "handedness": "right",
    "upAxis": "+Z",
    "forwardAxis": "+X",
    "rightAxis": "-Y",
    "units": "photonic-skin authoring units (V0 sphere radius = 1.0)",
    "originPolicy": "canonicalBoundsCenter",
}

CANONICAL_CAMERAS = {
    "canonical": {"azimuthDeg": 35.0, "elevationDeg": 20.0},
    "opposite": {"azimuthDeg": 215.0, "elevationDeg": 20.0},
    "side": {"azimuthDeg": 90.0, "elevationDeg": 8.0},
    "top": {"azimuthDeg": 0.0, "elevationDeg": 88.0},
}

TARGET_ROLES = ("master", "competency")
SEMANTIC_ROLES = (
    "primary", "secondary", "accessory", "support", "structure", "figure",
)
CONNECTIVITY_ROLES = ("standalone", "attached", "separate")
GEOMETRY_REPRESENTATIONS = ("procedural-sdf", "imported-mesh", "hybrid")
NORMALIZATION_MODES = ("uniformCompositeVolume", "perComponentMass")
ZONE_KINDS = ("feature", "silhouette", "density", "color")
ANCHOR_KINDS = (
    "bridgeZone", "splitNeck", "protectedZone", "primaryAxis", "transportZone",
)

COMPETENCIES = (
    "master", "content", "design", "event", "games", "video", "digital", "merch",
)

TARGET_REQUIRED = (
    "schemaVersion", "targetId", "targetVersion", "competencyId", "displayName",
    "targetRole", "components", "canonicalCoordinateSystem", "canonicalTransform",
    "geometryRepresentation", "normalizationPolicy", "validationPolicy",
    "provenance",
)
TARGET_OPTIONAL = (
    "canonicalBounds", "coverageProfiles", "lodProfiles", "notes",
)

COMPONENT_REQUIRED = (
    "componentId", "semanticRole", "canonicalTransform", "massWeight",
    "connectivityRole",
)
COMPONENT_OPTIONAL = (
    "geometryProvider", "importedAsset", "minimumMassWeight", "parentComponentId",
    "attachmentBlend", "featureZones", "silhouetteZones", "densityZones",
    "colorZones", "transitionAnchors", "lodOverrides", "notes",
)

DEFAULT_COVERAGE_BUDGETS = (8192, 4096, 2048, 1024, 512)
DEFAULT_LOD_PROFILES = {
    "desktop": {"viewportPx": 1440, "coverageBudget": 8192},
    "mobile": {"viewportPx": 390, "coverageBudget": 2048},
}


class SchemaError(Exception):
    pass


def _require_keys(obj: dict, required, optional, path: str) -> list[str]:
    problems = []
    for key in required:
        if key not in obj:
            problems.append(f"{path}: missing required field {key!r}")
    allowed = set(required) | set(optional)
    for key in obj:
        if key not in allowed:
            problems.append(f"{path}: unexpected field {key!r}")
    return problems


def _validate_transform(value, path: str) -> list[str]:
    if not isinstance(value, dict):
        return [f"{path}: must be an object"]
    problems = []
    for key in value:
        if key not in ("translate", "rotateDeg", "scale"):
            problems.append(f"{path}: unexpected key {key!r}")
    for key in ("translate", "rotateDeg"):
        if key in value:
            seq = value[key]
            if not (isinstance(seq, list) and len(seq) == 3):
                problems.append(f"{path}.{key}: must be a 3-element list")
    if "scale" in value and not isinstance(value["scale"], (int, float)):
        problems.append(f"{path}.scale: must be a number")
    return problems


def _validate_zone(zone, kind: str, path: str) -> list[str]:
    problems = []
    if not isinstance(zone, dict):
        return [f"{path}: must be an object"]
    required = ("zoneId", "region")
    optional = ("weight", "falloff", "importance", "competencyId", "notes")
    problems += _require_keys(zone, required, optional, path)
    if "region" in zone:
        problems += gp.validate_node(zone["region"], f"{path}.region")
    if kind == "color" and "competencyId" not in zone:
        problems.append(f"{path}: color zones must name a competencyId")
    if "competencyId" in zone and zone["competencyId"] not in COMPETENCIES:
        problems.append(f"{path}.competencyId: unknown {zone['competencyId']!r}")
    for key in ("weight", "falloff", "importance"):
        if key in zone and not isinstance(zone[key], (int, float)):
            problems.append(f"{path}.{key}: must be a number")
    return problems


def _validate_anchor(anchor, path: str) -> list[str]:
    problems = []
    if not isinstance(anchor, dict):
        return [f"{path}: must be an object"]
    problems += _require_keys(
        anchor, ("anchorId", "kind"),
        ("point", "direction", "region", "radius", "notes"), path,
    )
    if anchor.get("kind") not in ANCHOR_KINDS:
        problems.append(f"{path}.kind: must be one of {ANCHOR_KINDS}")
    for key in ("point", "direction"):
        if key in anchor:
            seq = anchor[key]
            if not (isinstance(seq, list) and len(seq) == 3):
                problems.append(f"{path}.{key}: must be a 3-element list")
    if "region" in anchor:
        problems += gp.validate_node(anchor["region"], f"{path}.region")
    return problems


def _validate_component(component, path: str) -> list[str]:
    problems = _require_keys(
        component, COMPONENT_REQUIRED, COMPONENT_OPTIONAL, path
    )
    has_geometry = "geometryProvider" in component
    has_asset = "importedAsset" in component
    if has_geometry == has_asset:
        problems.append(
            f"{path}: exactly one of geometryProvider / importedAsset is required"
        )
    if has_geometry:
        problems += gp.validate_node(
            component["geometryProvider"], f"{path}.geometryProvider"
        )
    if has_asset:
        asset = component["importedAsset"]
        if not isinstance(asset, dict):
            problems.append(f"{path}.importedAsset: must be an object")
        else:
            problems += _require_keys(
                asset, ("path", "format"), ("units", "sha256", "notes"),
                f"{path}.importedAsset",
            )
    if component.get("semanticRole") not in SEMANTIC_ROLES:
        problems.append(f"{path}.semanticRole: must be one of {SEMANTIC_ROLES}")
    if component.get("connectivityRole") not in CONNECTIVITY_ROLES:
        problems.append(
            f"{path}.connectivityRole: must be one of {CONNECTIVITY_ROLES}"
        )
    if component.get("connectivityRole") == "attached":
        if not component.get("parentComponentId"):
            problems.append(
                f"{path}: attached components must name a parentComponentId"
            )
    elif "attachmentBlend" in component:
        problems.append(
            f"{path}.attachmentBlend: only meaningful for attached components"
        )
    if "attachmentBlend" in component and not isinstance(
        component["attachmentBlend"], (int, float)
    ):
        problems.append(f"{path}.attachmentBlend: must be a number")
    if "canonicalTransform" in component:
        problems += _validate_transform(
            component["canonicalTransform"], f"{path}.canonicalTransform"
        )
    mass = component.get("massWeight")
    if not isinstance(mass, (int, float)) or not 0.0 < float(mass) <= 1.0:
        problems.append(f"{path}.massWeight: must be a number in (0, 1]")
    minimum = component.get("minimumMassWeight")
    if minimum is not None:
        if not isinstance(minimum, (int, float)) or float(minimum) <= 0.0:
            problems.append(f"{path}.minimumMassWeight: must be a positive number")
        elif isinstance(mass, (int, float)) and float(minimum) > float(mass):
            problems.append(
                f"{path}.minimumMassWeight: must not exceed massWeight"
            )
    for kind, key in (
        ("feature", "featureZones"), ("silhouette", "silhouetteZones"),
        ("density", "densityZones"), ("color", "colorZones"),
    ):
        zones = component.get(key, [])
        if not isinstance(zones, list):
            problems.append(f"{path}.{key}: must be a list")
            continue
        seen = set()
        for index, zone in enumerate(zones):
            problems += _validate_zone(zone, kind, f"{path}.{key}[{index}]")
            zone_id = zone.get("zoneId") if isinstance(zone, dict) else None
            if zone_id in seen:
                problems.append(f"{path}.{key}: duplicate zoneId {zone_id!r}")
            seen.add(zone_id)
    anchors = component.get("transitionAnchors", [])
    if not isinstance(anchors, list):
        problems.append(f"{path}.transitionAnchors: must be a list")
    else:
        for index, anchor in enumerate(anchors):
            problems += _validate_anchor(
                anchor, f"{path}.transitionAnchors[{index}]"
            )
    return problems


def validate_definition(definition: dict, path: str = "target") -> list[str]:
    """Full structural validation; returns a list of human-readable problems."""
    problems = _require_keys(definition, TARGET_REQUIRED, TARGET_OPTIONAL, path)
    if definition.get("schemaVersion") != SCHEMA_VERSION:
        problems.append(
            f"{path}.schemaVersion: expected {SCHEMA_VERSION!r}, "
            f"got {definition.get('schemaVersion')!r}"
        )
    if definition.get("targetRole") not in TARGET_ROLES:
        problems.append(f"{path}.targetRole: must be one of {TARGET_ROLES}")
    if definition.get("competencyId") not in COMPETENCIES:
        problems.append(f"{path}.competencyId: unknown")
    if definition.get("geometryRepresentation") not in GEOMETRY_REPRESENTATIONS:
        problems.append(
            f"{path}.geometryRepresentation: must be one of "
            f"{GEOMETRY_REPRESENTATIONS}"
        )
    coordinate_system = definition.get("canonicalCoordinateSystem")
    if coordinate_system != CANONICAL_COORDINATE_SYSTEM:
        problems.append(
            f"{path}.canonicalCoordinateSystem: must match the library canon"
        )
    if "canonicalTransform" in definition:
        problems += _validate_transform(
            definition["canonicalTransform"], f"{path}.canonicalTransform"
        )

    policy = definition.get("normalizationPolicy", {})
    if not isinstance(policy, dict):
        problems.append(f"{path}.normalizationPolicy: must be an object")
    else:
        problems += _require_keys(
            policy, ("mode", "volumeTolerance"), ("masterVolumeRef", "notes"),
            f"{path}.normalizationPolicy",
        )
        if policy.get("mode") not in NORMALIZATION_MODES:
            problems.append(
                f"{path}.normalizationPolicy.mode: must be one of "
                f"{NORMALIZATION_MODES}"
            )

    validation = definition.get("validationPolicy", {})
    if not isinstance(validation, dict):
        problems.append(f"{path}.validationPolicy: must be an object")
    else:
        problems += _require_keys(
            validation, ("expectedComponents", "requireWatertight"),
            ("minThickness", "maxAspectRatio", "notes"),
            f"{path}.validationPolicy",
        )

    provenance = definition.get("provenance", {})
    if not isinstance(provenance, dict):
        problems.append(f"{path}.provenance: must be an object")
    else:
        problems += _require_keys(
            provenance, ("source", "approvalStatus", "authored"),
            ("baseline", "interpretation", "notes"),
            f"{path}.provenance",
        )

    components = definition.get("components")
    if not isinstance(components, list) or not components:
        problems.append(f"{path}.components: must be a non-empty list")
        return problems
    seen: set[str] = set()
    total_mass = 0.0
    for index, component in enumerate(components):
        component_path = f"{path}.components[{index}]"
        if not isinstance(component, dict):
            problems.append(f"{component_path}: must be an object")
            continue
        problems += _validate_component(component, component_path)
        component_id = component.get("componentId")
        if component_id in seen:
            problems.append(f"{path}: duplicate componentId {component_id!r}")
        seen.add(component_id)
        if isinstance(component.get("massWeight"), (int, float)):
            total_mass += float(component["massWeight"])
    for component in components:
        parent = component.get("parentComponentId") if isinstance(component, dict) else None
        if parent is not None and parent not in seen:
            problems.append(f"{path}: unknown parentComponentId {parent!r}")
    if abs(total_mass - 1.0) > 1e-6:
        problems.append(
            f"{path}: component massWeight must sum to 1.0, got {total_mass:.6f}"
        )

    budgets = definition.get("coverageProfiles")
    if budgets is not None:
        if not isinstance(budgets, list) or not all(
            isinstance(b, int) and b > 0 for b in budgets
        ):
            problems.append(f"{path}.coverageProfiles: must be a list of budgets")
    lods = definition.get("lodProfiles")
    if lods is not None and not isinstance(lods, dict):
        problems.append(f"{path}.lodProfiles: must be an object")
    return problems


def load_definition(path: Path) -> dict:
    definition = json.loads(Path(path).read_text("utf8"))
    problems = validate_definition(definition, path=Path(path).name)
    if problems:
        raise SchemaError(
            f"{path}: {len(problems)} schema problem(s):\n  "
            + "\n  ".join(problems)
        )
    return definition


def load_library(directory: Path) -> list[dict]:
    """Load and validate every target definition, ordered by targetId."""
    files = sorted(Path(directory).glob("*.target.json"))
    definitions = [load_definition(f) for f in files]
    ids = [d["targetId"] for d in definitions]
    duplicates = {i for i in ids if ids.count(i) > 1}
    if duplicates:
        raise SchemaError(f"duplicate targetId(s): {sorted(duplicates)}")
    return definitions


def definition_hash(definition: dict) -> str:
    """Stable content hash of a definition (key order independent)."""
    import hashlib

    payload = json.dumps(definition, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf8")).hexdigest()
