"""Shared deterministic orchestration helpers for PS-03.M4.1.

This module deliberately owns no motion mathematics.  It validates and loads
the frozen M3 inputs, selects coverage/risk fixtures and provides stable I/O
for the build, QA, determinism and render entry points.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from pathlib import Path
from typing import Any, Iterable

import numpy as np


M4_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = M4_DIR.parents[2]
M3_DIR = M4_DIR.parent / "ps-03-m3-1r"
M3_PUBLIC_DIR = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1r"
OLD_M4_DIR = M4_DIR.parent / "ps-03-m4"
OLD_M4_PUBLIC_DIR = REPO_DIR / "public" / "photonic-skin" / "ps-03-m4"
PUBLIC_DIR = REPO_DIR / "public" / "photonic-skin" / "ps-03-m4-1"
SCHEMA_DIR = M4_DIR / "schemas"
PROFILE_DIR = M4_DIR / "motion-profiles"
PROGRAM_DIR = M4_DIR / "programs"
EXPORT_DIR = M4_DIR / "exports"
REPORT_DIR = M4_DIR / "reports"
RENDER_DIR = M4_DIR / "renders"
PROVENANCE_DIR = M4_DIR / "provenance"

M3_MANIFEST_PATH = M3_DIR / "exports" / "ps03m31r-manifest.json"
M3_DETERMINISM_PATH = M3_DIR / "reports" / "ps03m31r-determinism.json"
M3_PUBLIC_MANIFEST_PATH = M3_PUBLIC_DIR / "manifest.json"
OLD_M4_MANIFEST_PATH = OLD_M4_DIR / "exports" / "ps03m4-manifest.json"

EXPECTED_M3 = {
    "stateCount": 154,
    "identityCount": 16_384,
    "identityRange": [0, 16_383],
    "identitySpaceVersion": "ps03m3-identity-v1",
    "stateRecordStride": 40,
    "stage": "PS-03.M3.1R",
    "version": "3.1.1",
    "deterministicFingerprint": "0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2",
    "manifestSha256": "530ca41e0faecf291ea9f674a7e383ae8739af0bddad578a765a7c264129ea82",
}

EXPECTED_OLD_M4 = {
    "stage": "PS-03.M4",
    "aggregateContentHash": "8ebb908374f02801f0b837e2c827a018f12ebbeb8761bbd7d1f9ea5c402497c9",
    "buildConfigHash": "5f91904fcfcdeb7647e219bb52de526ee2dfa5ecb24b14b9cd61e0a75b84b3f4",
    "motionProfileHash": "8497c32a25c858540b63ccb6e628a21e239c69e89ec39e1fb619e446a3e340bb",
    "frozenStateFingerprint": "81bbfbdf1c2d1f26340bcd1318620d5ad9975a2c830ca3ed8552f026d488351f",
}

STATE_DTYPE = np.dtype(
    [
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
    ]
)

STATUS_ACTIVE = 0
STATUS_RESERVE = 1
STATUS_SUBSURFACE = 2
FLAG_FEATURE = 1
FLAG_SILHOUETTE = 2

MANDATED_TIMES = (0.0, 0.05, 0.10, 0.20, 0.25, 0.35, 0.50, 0.65, 0.75, 0.90, 0.95, 1.0)
PARITY_TIMES = (0.0, 0.01, 0.05, 0.10, 0.20, 0.25, 0.35, 0.50, 0.65, 0.75, 0.90, 0.95, 0.99, 1.0)
LOD_LEVELS = (512, 1024, 2048, 4096, 8192, 12288, 16384)


def stable_json_bytes(value: Any) -> bytes:
    # M4's cross-language canonical JSON contract includes one trailing LF.
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def pretty_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n").encode("utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == payload:
        return
    path.write_bytes(payload)


def write_json(path: Path, value: Any) -> None:
    write_bytes(path, pretty_json_bytes(value))


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def aggregate_hash(mapping: dict[str, str]) -> str:
    return sha256_bytes(stable_json_bytes(dict(sorted(mapping.items()))))


def relative(path: Path) -> str:
    return path.relative_to(REPO_DIR).as_posix()


def file_hashes(paths: Iterable[Path]) -> dict[str, str]:
    return {relative(path): sha256_file(path) for path in sorted(set(paths)) if path.is_file()}


def tree_hashes(root: Path) -> dict[str, str]:
    if not root.exists():
        return {}
    return file_hashes(path for path in root.rglob("*") if path.is_file())


def frozen_m3_hashes() -> dict[str, str]:
    """Hash the complete immutable M3.1R endpoint library and public mirror."""

    roots = (
        M3_DIR / "descriptors",
        M3_DIR / "states",
        M3_DIR / "exports",
        M3_DIR / "reports",
        M3_DIR / "scripts",
        M3_PUBLIC_DIR,
    )
    paths = [path for root in roots if root.exists() for path in root.rglob("*") if path.is_file()]
    return file_hashes(paths)


def historical_m4_hashes() -> dict[str, str]:
    roots = (OLD_M4_DIR, OLD_M4_PUBLIC_DIR, REPO_DIR / "app" / "visual-lab" / "photonic-skin-m4")
    return file_hashes(path for root in roots if root.exists() for path in root.rglob("*") if path.is_file())


def homepage_hashes() -> dict[str, str]:
    candidates = (
        REPO_DIR / "app" / "page.tsx",
        REPO_DIR / "app" / "layout.tsx",
        REPO_DIR / "package.json",
        REPO_DIR / "package-lock.json",
    )
    return file_hashes(path for path in candidates if path.exists())


def validate_frozen_m3() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    manifest = read_json(M3_MANIFEST_PATH)
    public_manifest = read_json(M3_PUBLIC_MANIFEST_PATH)
    determinism = read_json(M3_DETERMINISM_PATH)
    errors: list[str] = []
    checks = {
        "stage": manifest.get("stage") == EXPECTED_M3["stage"],
        "version": manifest.get("stateVersion") == EXPECTED_M3["version"],
        "stateCount": manifest.get("stateCount") == EXPECTED_M3["stateCount"],
        "identityCount": manifest.get("identitySpace", {}).get("size") == EXPECTED_M3["identityCount"],
        "identityRange": manifest.get("identitySpace", {}).get("idRange") == EXPECTED_M3["identityRange"],
        "identitySpaceVersion": manifest.get("identitySpace", {}).get("identitySpaceVersion") == EXPECTED_M3["identitySpaceVersion"],
        "stateRecordStride": manifest.get("stateRecordLayout", {}).get("stride") == EXPECTED_M3["stateRecordStride"],
        "deterministicFingerprint": manifest.get("deterministicFingerprint") == EXPECTED_M3["deterministicFingerprint"],
        "deterministicRebuild": determinism.get("passed") is True
        and determinism.get("fingerprintBefore") == EXPECTED_M3["deterministicFingerprint"]
        and determinism.get("fingerprintAfter") == EXPECTED_M3["deterministicFingerprint"],
        "manifestSha256": sha256_file(M3_MANIFEST_PATH) == EXPECTED_M3["manifestSha256"],
        "publicManifestMatches": stable_json_bytes(public_manifest) == stable_json_bytes(manifest),
        "allStateEntries": len(manifest.get("states", [])) == EXPECTED_M3["stateCount"],
    }
    for label, passed in checks.items():
        if not passed:
            errors.append(label)
    if errors:
        raise RuntimeError(f"frozen PS-03.M3.1R guard failed: {', '.join(errors)}")
    return manifest, determinism, checks


def validate_historical_m4() -> tuple[dict[str, Any], dict[str, Any]]:
    manifest = read_json(OLD_M4_MANIFEST_PATH)
    checks = {
        "stage": manifest.get("stage") == EXPECTED_OLD_M4["stage"],
        "aggregateContentHash": manifest.get("aggregateContentHash") == EXPECTED_OLD_M4["aggregateContentHash"],
        "buildConfigHash": manifest.get("buildConfigHash") == EXPECTED_OLD_M4["buildConfigHash"],
        "motionProfileHash": manifest.get("motionProfile", {}).get("contentHash") == EXPECTED_OLD_M4["motionProfileHash"],
        "frozenStateFingerprint": manifest.get("frozenM3", {}).get("deterministicFingerprint")
        == EXPECTED_OLD_M4["frozenStateFingerprint"],
    }
    failures = [name for name, passed in checks.items() if not passed]
    if failures:
        raise RuntimeError(f"historical PS-03.M4 guard failed: {', '.join(failures)}")
    return manifest, checks


def state_entry_map(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {entry["stateId"]: entry for entry in manifest["states"]}


def load_state(entry: dict[str, Any], *, ids: np.ndarray | None = None) -> np.ndarray:
    path = M3_PUBLIC_DIR / entry["bufferPath"]
    payload = path.read_bytes()
    if len(payload) != int(entry["bufferBytes"]) or sha256_bytes(payload) != entry["contentHash"]:
        raise RuntimeError(f"frozen state buffer guard failed: {entry['stateId']}")
    records = np.frombuffer(payload, dtype=STATE_DTYPE)
    if len(records) != EXPECTED_M3["identityCount"]:
        raise RuntimeError(f"state identity count mismatch: {entry['stateId']}")
    return records.copy() if ids is None else records[ids].copy()


def deterministic_probe_ids(count: int = 512) -> np.ndarray:
    """Use the frozen nested low-LOD prefix; IDs remain 0..count-1."""

    if count <= 0 or count > EXPECTED_M3["identityCount"]:
        raise ValueError("probe count is outside the frozen identity range")
    return np.arange(count, dtype=np.uint16)


def state_risk_features(entry: dict[str, Any]) -> dict[str, float]:
    bounds = np.asarray(entry["bounds"]["size"], dtype=np.float64)
    positive = bounds[bounds > 1e-9]
    aspect = float(np.max(positive) / np.min(positive)) if len(positive) else 1.0
    qa = entry["machineQa"]
    return {
        "shellCount": float(entry["shellCount"]),
        "activeCount": float(qa["activeCount"]),
        "reserveCount": float(qa["reserveCount"]),
        "surfaceArea": float(entry["surfaceArea"]),
        "aspectRatio": aspect,
        "componentCount": float(entry["componentCount"]),
    }


def pair_risk(source: dict[str, Any], target: dict[str, Any]) -> dict[str, float]:
    a = state_risk_features(source)
    b = state_risk_features(target)
    shell_delta = abs(a["shellCount"] - b["shellCount"])
    active_delta = abs(a["activeCount"] - b["activeCount"]) / EXPECTED_M3["identityCount"]
    reserve_delta = abs(a["reserveCount"] - b["reserveCount"]) / EXPECTED_M3["identityCount"]
    area_delta = abs(a["surfaceArea"] - b["surfaceArea"]) / max(a["surfaceArea"], b["surfaceArea"], 1e-9)
    aspect_delta = abs(np.log(max(a["aspectRatio"], 1e-9) / max(b["aspectRatio"], 1e-9)))
    component_delta = abs(a["componentCount"] - b["componentCount"])
    score = 4.0 * shell_delta + 8.0 * active_delta + 4.0 * reserve_delta + 2.5 * area_delta + 2.0 * aspect_delta + component_delta
    return {
        "score": float(score),
        "shellDelta": float(shell_delta),
        "activeDeltaRatio": float(active_delta),
        "reserveDeltaRatio": float(reserve_delta),
        "surfaceAreaDeltaRatio": float(area_delta),
        "aspectLogDelta": float(aspect_delta),
        "componentDelta": float(component_delta),
    }


def _best_pair(
    states: list[dict[str, Any]],
    predicate,
    *,
    reverse_score: bool = True,
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    candidates = [
        (pair_risk(source, target)["score"], source["stateId"], target["stateId"], source, target)
        for source in states
        for target in states
        if source is not target and predicate(source, target)
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda row: (row[0], row[1], row[2]), reverse=reverse_score)
    return candidates[0][3], candidates[0][4]


def select_risk_suite(manifest: dict[str, Any], minimum: int = 32) -> list[dict[str, Any]]:
    """Select a deterministic, risk-derived full-N suite with prompt coverage."""

    states = sorted(manifest["states"], key=lambda item: item["stateId"])
    master = next(entry for entry in states if entry["stateRole"] == "master")
    singles = [entry for entry in states if entry["stateRole"] == "single"]
    complexes = [entry for entry in states if entry["stateRole"] == "complex"]
    brand = [entry for entry in states if entry["stateRole"] == "brand_wide"]
    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    def add(source: dict[str, Any], target: dict[str, Any], *coverage: str) -> None:
        key = (source["stateId"], target["stateId"])
        if key in seen or source is target:
            if key in seen:
                row = next(item for item in rows if (item["sourceStateId"], item["targetStateId"]) == key)
                row["coverage"] = sorted(set(row["coverage"]) | set(coverage))
            return
        seen.add(key)
        rows.append(
            {
                "sourceStateId": source["stateId"],
                "targetStateId": target["stateId"],
                "coverage": sorted(set(coverage)),
                "risk": pair_risk(source, target),
            }
        )

    for single in singles:
        add(master, single, "master-single-family", "simple-route")
        add(single, master, "single-master-family", "merge-or-return")

    category_predicates = [
        ("one-three-split", lambda a, b: a["shellCount"] == 1 and b["shellCount"] >= 3),
        ("three-one-merge", lambda a, b: a["shellCount"] >= 3 and b["shellCount"] == 1),
        ("one-two-split", lambda a, b: a["shellCount"] == 1 and b["shellCount"] == 2),
        ("two-one-merge", lambda a, b: a["shellCount"] == 2 and b["shellCount"] == 1),
        ("two-three-split", lambda a, b: a["shellCount"] == 2 and b["shellCount"] >= 3),
        ("three-two-merge", lambda a, b: a["shellCount"] >= 3 and b["shellCount"] == 2),
        ("single-single-topology", lambda a, b: a["stateRole"] == b["stateRole"] == "single"),
        ("master-complex", lambda a, b: a["stateRole"] == "master" and b["stateRole"] == "complex"),
        ("complex-master", lambda a, b: a["stateRole"] == "complex" and b["stateRole"] == "master"),
        ("single-complex", lambda a, b: a["stateRole"] == "single" and b["stateRole"] == "complex"),
        ("complex-single", lambda a, b: a["stateRole"] == "complex" and b["stateRole"] == "single"),
        (
            "focus-swap",
            lambda a, b: a["stateRole"] == b["stateRole"] == "complex"
            and a["compositionMode"] == b["compositionMode"] == "FOCUS"
            and a.get("competencyIds") == b.get("competencyIds")
            and a.get("focusCompetencyId") != b.get("focusCompetencyId"),
        ),
        (
            "gather-drive",
            lambda a, b: a.get("competencyIds") == b.get("competencyIds")
            and a.get("compositionMode") == "GATHER"
            and b.get("compositionMode") == "DRIVE",
        ),
        ("complex-brand-wide", lambda a, b: a["stateRole"] == "complex" and b["stateRole"] == "brand_wide"),
        ("brand-wide-complex", lambda a, b: a["stateRole"] == "brand_wide" and b["stateRole"] == "complex"),
        ("brand-wide-master", lambda a, b: a["stateRole"] == "brand_wide" and b["stateRole"] == "master"),
        ("master-brand-wide", lambda a, b: a["stateRole"] == "master" and b["stateRole"] == "brand_wide"),
    ]
    for label, predicate in category_predicates:
        pair = _best_pair(states, predicate)
        if pair:
            add(pair[0], pair[1], label)

    feature_extremes = {
        "maximum-active-delta": lambda a, b: abs(a["machineQa"]["activeCount"] - b["machineQa"]["activeCount"]),
        "maximum-aspect-change": lambda a, b: pair_risk(a, b)["aspectLogDelta"],
        "maximum-surface-area-change": lambda a, b: pair_risk(a, b)["surfaceAreaDeltaRatio"],
        "reserve-heavy": lambda a, b: pair_risk(a, b)["reserveDeltaRatio"],
    }
    directed = [(a, b) for a in states for b in states if a is not b]
    for label, metric in feature_extremes.items():
        source, target = max(directed, key=lambda pair: (metric(*pair), pair[0]["stateId"], pair[1]["stateId"]))
        add(source, target, label)

    # Ensure three distinct topology-diverse SINGLE→SINGLE routes.
    ranked_single = sorted(
        ((pair_risk(a, b)["score"], a["stateId"], b["stateId"], a, b) for a in singles for b in singles if a is not b),
        reverse=True,
    )
    for _, _, _, source, target in ranked_single[:6]:
        add(source, target, "single-single-topology-diverse")

    ranked_all = sorted(
        ((pair_risk(a, b)["score"], a["stateId"], b["stateId"], a, b) for a in states for b in states if a is not b),
        reverse=True,
    )
    for _, _, _, source, target in ranked_all:
        if len(rows) >= minimum:
            break
        add(source, target, "risk-ranked-fill")

    if len(rows) < minimum:
        raise RuntimeError(f"risk suite selection produced only {len(rows)} transitions")
    for index, row in enumerate(rows):
        row["suiteIndex"] = index
        row["scenarioId"] = f"qa-{index:03d}-{row['sourceStateId']}-to-{row['targetStateId']}"
    return rows


def safe_clean_outputs(*, include_renders: bool = False) -> None:
    exact = [PROGRAM_DIR, EXPORT_DIR, PUBLIC_DIR, PROVENANCE_DIR]
    if include_renders:
        exact.append(RENDER_DIR)
    allowed = {path.resolve() for path in exact}
    for path in exact:
        resolved = path.resolve()
        if resolved not in allowed:
            raise RuntimeError(f"refusing to clean unexpected path: {resolved}")
        if path.exists():
            shutil.rmtree(path)
    # Reports produced by the build are removed individually so browser/runtime
    # and visual-review evidence owned by other M4 pipelines is preserved.
    owned_reports = (
        "ps03m41-input-guards.json",
        "ps03m41-risk-suite.json",
        "ps03m41-pair-probe-summary.json",
        "ps03m41-self-transition-qa.json",
        "ps03m41-full-n-qa.json",
        "ps03m41-endpoint-exactness.json",
        "ps03m41-endpoint-vs-m41.json",
        "ps03m41-qa-summary.json",
        "ps03m41-build-performance.json",
    )
    for name in owned_reports:
        path = REPORT_DIR / name
        if path.exists():
            path.unlink()


def sync_public_m4() -> list[Path]:
    """Copy only M4 runtime assets; never copy frozen M3 state buffers."""

    if PUBLIC_DIR.exists():
        shutil.rmtree(PUBLIC_DIR)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    copied: list[Path] = []
    source_roots = (
        (PROGRAM_DIR, PUBLIC_DIR / "programs"),
        (SCHEMA_DIR, PUBLIC_DIR / "schemas"),
        (PROFILE_DIR, PUBLIC_DIR / "motion-profiles"),
        (EXPORT_DIR / "runtime", PUBLIC_DIR / "runtime"),
    )
    for source_root, target_root in source_roots:
        if not source_root.exists():
            continue
        for source in sorted(path for path in source_root.rglob("*") if path.is_file()):
            destination = target_root / source.relative_to(source_root)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            copied.append(destination)
    forbidden = [path for path in PUBLIC_DIR.rglob("*.state.bin")]
    if forbidden:
        raise RuntimeError(f"M3 state buffers leaked into M4 public assets: {forbidden}")
    return copied


def deterministic_environment() -> dict[str, str]:
    return {
        "PYTHONHASHSEED": os.environ.get("PYTHONHASHSEED", "not-set"),
        "PYTHONDONTWRITEBYTECODE": os.environ.get("PYTHONDONTWRITEBYTECODE", "not-set"),
        "numpyVersion": np.__version__,
    }
