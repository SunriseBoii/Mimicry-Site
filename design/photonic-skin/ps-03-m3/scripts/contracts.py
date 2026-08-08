"""Versioned contracts and deterministic IO for PS-03.M3.

The module contains no subject identities.  Object identity stays in the M2
TargetDefinition documents and in generated StateDefinition data.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


STATE_SCHEMA_VERSION = "1.0.0"
TRANSITION_SCHEMA_VERSION = "1.0.0"
STATE_VERSION = "1.0.0"
TRANSITION_VERSION = "1.0.0"
IDENTITY_SPACE_VERSION = "ps03m3-identity-v1"
BUILD_VERSION = "ps03m3-builder-v1"
SEED = 0x5030334D33
V0_FALLBACK = 4.185075142010032
SKIN_SCALE_CAP = 1.15
GATE_BUDGETS = (8192, 12288, 16384, 24576, 32768)
LOD_LEVELS_BASE = (512, 1024, 2048, 4096, 8192, 12288, 16384)

M3_DIR = Path(__file__).resolve().parents[1]
M2_DIR = M3_DIR.parent / "ps-03-m2"
REPO_DIR = M3_DIR.parents[2]
PUBLIC_DIR = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3"
SCHEMA_DIR = M3_DIR / "schemas"
STATE_DIR = M3_DIR / "states"
TRANSITION_DIR = M3_DIR / "transitions"
EXPORT_DIR = M3_DIR / "exports"
REPORT_DIR = M3_DIR / "reports"
RENDER_DIR = M3_DIR / "renders"


STATE_REQUIRED = {
    "schemaVersion", "stateId", "stateVersion", "displayName", "stateRole",
    "competencyIds", "compositionMode", "sourceTargets",
    "componentSelections", "assemblyProfile", "canonicalCoordinateSystem",
    "canonicalTransform", "normalizationPolicy", "surfaceEnvelopePolicy",
    "identityPolicy", "lodPolicy", "reservePolicy",
    "transitionAffordances", "validationPolicy", "provenance",
}

TRANSITION_REQUIRED = {
    "schemaVersion", "transitionId", "transitionVersion", "fromState",
    "toState", "durationPolicy", "motionProfile", "primaryAxis",
    "phasePolicy", "componentRoutingPolicy", "splitMergePolicy",
    "reserveTransportPolicy", "continuityPolicy", "validationPolicy",
    "sourceStateHash", "targetStateHash", "buildConfigHash", "provenance",
}


def stable_json_bytes(value: Any) -> bytes:
    return (json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ) + "\n").encode("utf-8")


def pretty_json_bytes(value: Any) -> bytes:
    return (json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        indent=2,
        allow_nan=False,
    ) + "\n").encode("utf-8")


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def write_bytes_if_changed(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == payload:
        return
    path.write_bytes(payload)


def write_json(path: Path, value: Any, *, pretty: bool = True) -> None:
    write_bytes_if_changed(path, pretty_json_bytes(value) if pretty else stable_json_bytes(value))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_state_definition(value: dict) -> list[str]:
    problems: list[str] = []
    missing = sorted(STATE_REQUIRED - value.keys())
    extra = sorted(value.keys() - STATE_REQUIRED - {"focusCompetencyId", "canonicalBounds"})
    if missing:
        problems.append(f"missing fields: {missing}")
    if extra:
        problems.append(f"unknown fields: {extra}")
    if value.get("schemaVersion") != STATE_SCHEMA_VERSION:
        problems.append("unsupported state schema version")
    if value.get("stateRole") not in {"master", "single", "complex", "brand_wide"}:
        problems.append("invalid stateRole")
    if value.get("compositionMode") not in {"MASTER", "SINGLE", "FOCUS", "GATHER", "DRIVE"}:
        problems.append("invalid compositionMode")
    competencies = value.get("competencyIds")
    if not isinstance(competencies, list) or len(competencies) != len(set(competencies or [])):
        problems.append("competencyIds must be a unique array")
    selections = value.get("componentSelections")
    if not isinstance(selections, list) or not selections:
        problems.append("componentSelections must be non-empty")
    else:
        keys = [(s.get("targetId"), s.get("componentId")) for s in selections]
        if len(keys) != len(set(keys)):
            problems.append("component selections must be unique")
        total = sum(float(s.get("massWeight", 0.0)) for s in selections)
        if abs(total - 1.0) > 1e-8:
            problems.append(f"resolved component mass weights sum to {total}, not 1")
    return problems


def validate_transition_definition(value: dict) -> list[str]:
    problems: list[str] = []
    missing = sorted(TRANSITION_REQUIRED - value.keys())
    extra = sorted(value.keys() - TRANSITION_REQUIRED)
    if missing:
        problems.append(f"missing fields: {missing}")
    if extra:
        problems.append(f"unknown fields: {extra}")
    if value.get("schemaVersion") != TRANSITION_SCHEMA_VERSION:
        problems.append("unsupported transition schema version")
    axis = value.get("primaryAxis")
    if not isinstance(axis, list) or len(axis) != 3:
        problems.append("primaryAxis must contain three values")
    return problems


def build_config_hash() -> str:
    payload = {
        "buildVersion": BUILD_VERSION,
        "gateBudgets": GATE_BUDGETS,
        "identitySpaceVersion": IDENTITY_SPACE_VERSION,
        "lodLevels": LOD_LEVELS_BASE,
        "seed": SEED,
        "skinScaleCap": SKIN_SCALE_CAP,
        "stateSchema": sha256_file(SCHEMA_DIR / "state-definition.schema.json"),
        "transitionSchema": sha256_file(SCHEMA_DIR / "transition-definition.schema.json"),
    }
    return sha256_bytes(stable_json_bytes(payload))
