"""Screen-independent nearest-neighbour audit of approved Video/Games/Merch endpoints.

This is a geometry triage signal. A visible detached flake still requires a
framebuffer confirmation before changing an approved form.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / "public" / "photonic-skin" / "ps-04-m5-5"
OUT = ROOT / "design" / "photonic-skin" / "ps-04-final-r1" / "reports" / "other-singles-geometry-audit.json"
STATE = np.dtype([
    ("position", "<f4", (3,)), ("normal", "<i2", (3,)), ("orientation", "<i2", (4,)),
    ("scale", "<f2"), ("reserveDepth", "<f2"), ("component", "u1"), ("shell", "u1"),
    ("status", "u1"), ("flags", "u1"), ("density", "u1"), ("transitionGroup", "u1"),
    ("lodPriority", "<u2"), ("_padding", "u1", (2,)),
])


def nearest_distance(points: np.ndarray) -> np.ndarray:
    cell = 0.065
    cells = np.floor(points / cell).astype(np.int32)
    lookup: dict[tuple[int, int, int], list[int]] = defaultdict(list)
    for index, key in enumerate(cells):
        lookup[tuple(int(value) for value in key)].append(index)
    distances = np.full(len(points), np.inf)
    offsets = [(a, b, c) for a in (-1, 0, 1) for b in (-1, 0, 1) for c in (-1, 0, 1)]
    for index, key in enumerate(cells):
        candidates = []
        for offset in offsets:
            candidates.extend(lookup.get(tuple(int(key[axis] + offset[axis]) for axis in range(3)), ()))
        if candidates:
            subset = points[candidates]
            squared = np.sum((subset - points[index]) ** 2, axis=1)
            squared[np.asarray(candidates) == index] = np.inf
            distances[index] = float(np.sqrt(squared.min()))
    return distances


def main() -> None:
    manifest = json.loads((BASE / "manifests" / "ps04m55-manifest.json").read_text(encoding="utf-8"))
    by_id = {entry["stateId"]: entry for entry in manifest["states"]}
    report: dict[str, object] = {"sourceNamespace": "ps-04-m5-5", "states": {}}
    for state_id in ("single-video", "single-games", "single-merch"):
        entry = by_id[state_id]
        records = np.frombuffer((BASE / entry["bufferPath"]).read_bytes(), dtype=STATE)
        rows = []
        for part in entry["componentMap"]:
            component = int(part["componentIndex"])
            points = records["position"][(records["component"] == component) & (records["status"] == 0)].astype(np.float64)
            distances = nearest_distance(points)
            finite = distances[np.isfinite(distances)]
            median = float(np.median(finite)) if len(finite) else float("inf")
            limit = max(0.085, 4 * median)
            outliers = np.flatnonzero(distances > limit)
            rows.append({
                "component": part["componentId"],
                "activeCount": len(points),
                "medianNearest": median,
                "p99Nearest": float(np.quantile(finite, 0.99)) if len(finite) else None,
                "maxNearest": float(finite.max()) if len(finite) else None,
                "outlierThreshold": limit,
                "outlierCount": len(outliers),
                "outlierPositions": points[outliers[:12]].tolist(),
            })
        report["states"][state_id] = rows
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({state: [(row["component"], row["outlierCount"]) for row in rows] for state, rows in report["states"].items()}, indent=2))


if __name__ == "__main__":
    main()
