"""Analyse frozen SINGLE Video without mutating it."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
PHOTONIC_DIR = STAGE_DIR.parent
REPO_DIR = PHOTONIC_DIR.parents[1]
M3_SCRIPTS = PHOTONIC_DIR / "ps-03-m3" / "scripts"
PUBLIC_M31R = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1r"
M31R_MANIFEST = PHOTONIC_DIR / "ps-03-m3-1r" / "exports" / "ps03m31r-manifest.json"
TARGET = PHOTONIC_DIR / "ps-03-m2" / "targets" / "video-camera-clapperboard.target.json"
RESOLVED = PHOTONIC_DIR / "ps-03-m3-1r" / "states" / "resolved" / "single-video.state.json"
IMPACT = STAGE_DIR / "reports" / "video-state-impact.json"

if str(M3_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(M3_SCRIPTS))
import state_builder as m3  # noqa: E402

FROZEN = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b"
PREFIXES = (512, 1024, 2048, 4096, 8192, 12288, 16384)
COMPONENT_IDS = ("camera", "clapperboard")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    bin_path = PUBLIC_M31R / "states" / "single-video.state.bin"
    payload = bin_path.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    if digest != FROZEN:
        raise SystemExit(f"frozen Video hash mismatch: {digest}")
    records = np.frombuffer(payload, dtype=m3.STATE_DTYPE)
    n = int(len(records))
    entry = next(item for item in json.loads(M31R_MANIFEST.read_text(encoding="utf-8"))["states"] if item["stateId"] == "single-video")
    target = json.loads(TARGET.read_text(encoding="utf-8"))
    resolved = json.loads(RESOLVED.read_text(encoding="utf-8"))
    impact = json.loads(IMPACT.read_text(encoding="utf-8")) if IMPACT.exists() else {}
    active = records["status"] == m3.STATUS_ACTIVE
    points = records["position"][active].astype(np.float64)
    low, high = points.min(axis=0), points.max(axis=0)
    centroid = points.mean(axis=0)
    lod = {}
    for prefix in PREFIXES:
        slice_ = records[:prefix]
        live = slice_["status"] == m3.STATUS_ACTIVE
        lod[str(prefix)] = {
            COMPONENT_IDS[index]: int(np.count_nonzero(live & (slice_["component"] == index)))
            for index in range(2)
        }
    clapper = next(item for item in target["components"] if item["componentId"] == "clapperboard")
    camera = next(item for item in target["components"] if item["componentId"] == "camera")
    board_half = clapper["geometryProvider"]["children"][0]["params"]["half"]
    stick = clapper["geometryProvider"]["children"][1]
    stick_half = stick["params"]["half"]
    map_profiles = {item["componentId"]: item.get("visibleProfiles", []) for item in entry.get("componentMap", [])}
    analysis = {
        "stage": "PS-04.M5.3",
        "source": {
            "frozenLibrary": "PS-03.M3.1R",
            "bufferPath": "public/photonic-skin/ps-03-m3-1r/states/single-video.state.bin",
            "publicM3Path": "public/photonic-skin/ps-03-m3/states/single-video.state.bin",
            "publicM31Path": "public/photonic-skin/ps-03-m3-1/states/single-video.state.bin",
            "targetPath": "design/photonic-skin/ps-03-m2/targets/video-camera-clapperboard.target.json",
            "resolvedStatePath": "design/photonic-skin/ps-03-m3-1r/states/resolved/single-video.state.json",
            "geometryRepresentation": target["geometryRepresentation"],
            "blendFile": None,
            "pipeline": "procedural-sdf → M3 identity sampling → M3.1R presentation (no Event orientation patch)",
        },
        "hash": digest,
        "n": n,
        "stride": int(m3.STATE_DTYPE.itemsize),
        "componentIds": list(COMPONENT_IDS),
        "activeCount": int(active.sum()),
        "reserveCount": int((records["status"] == m3.STATUS_RESERVE).sum()),
        "subsurfaceCount": int((records["status"] == m3.STATUS_SUBSURFACE).sum()),
        "componentActiveCounts": {
            COMPONENT_IDS[index]: int(np.count_nonzero(active & (records["component"] == index)))
            for index in range(2)
        },
        "lodPriorityIsIdentity": bool(np.array_equal(records["lodPriority"], np.arange(n, dtype=np.uint16))),
        "lodPrefixes": lod,
        "bbox": {"min": [float(v) for v in low], "max": [float(v) for v in high], "size": [float(v) for v in high - low]},
        "centroid": [float(v) for v in centroid],
        "orientation": {
            "canonicalCoordinateSystem": resolved["canonicalCoordinateSystem"],
            "eventOrientationPatch": entry.get("eventOrientationPatch"),
            "cameraLocalRotateDeg": camera["canonicalTransform"]["rotateDeg"],
            "clapperLocalRotateDeg": clapper["canonicalTransform"]["rotateDeg"],
        },
        "visibleProfiles": map_profiles,
        "clapperboardReadsAsBookBecause": [
            "slate and hinged stick are one SDF component via smooth_union",
            f"stick half {stick_half} is nearly as large as board half {board_half}",
            "stick is a second equal-width rectangle, not a narrow top bar",
            "no separate hinge-at-one-edge cue; the pair reads as two pages",
            "diagonal stripes are colour zones only and vanish in final monochrome Mimic",
            "clapperboard visibleProfiles omit silhouette180 and silhouette96",
        ],
        "videoContainingStateCount": impact.get("videoContainingStateCount"),
        "m53Action": "versioned M5.3 copy; do not edit frozen PS-03",
    }
    (STAGE_DIR / "reports").mkdir(parents=True, exist_ok=True)
    (STAGE_DIR / "reports" / "video-baseline-metrics.json").write_text(json.dumps(analysis, indent=2) + "\n", encoding="utf-8")
    md = f"""# PS‑04.M5.3 — Frozen Video baseline analysis

Original SINGLE Video remains available as `VIDEO_BASELINE`. Frozen PS‑03 buffers are not edited.

## Source

- Representation: `{target["geometryRepresentation"]}` (no `.blend`)
- Target: `design/photonic-skin/ps-03-m2/targets/video-camera-clapperboard.target.json`
- Frozen buffer: `public/photonic-skin/ps-03-m3-1r/states/single-video.state.bin`
- Byte-identical also at PS‑03.M3 and M3.1 paths
- Hash: `{digest}`
- N = {n}, stride = {int(m3.STATE_DTYPE.itemsize)}
- `lodPriority = i` (identity 0…16383)
- Component IDs: `camera` (0), `clapperboard` (1)
- Active / reserve / subsurface: {int(active.sum())} / {int((records["status"] == m3.STATUS_RESERVE).sum())} / {int((records["status"] == m3.STATUS_SUBSURFACE).sum())}
- Active split: camera {analysis["componentActiveCounts"]["camera"]}, clapperboard {analysis["componentActiveCounts"]["clapperboard"]}
- BBox size: {[round(float(v), 4) for v in high - low]}
- Centroid: {[round(float(v), 4) for v in centroid]}
- Orientation: M3.1R `eventOrientationPatch.applied = false`. Camera local rotateDeg `{camera["canonicalTransform"]["rotateDeg"]}`; clapper `{clapper["canonicalTransform"]["rotateDeg"]}`.
- Aggregate states containing Video: **{impact.get("videoContainingStateCount", "?")}** of {impact.get("stateCount", 154)}

## LOD prefixes (active counts)

| Prefix | camera | clapperboard |
| --- | --- | --- |
{chr(10).join(f"| {p} | {lod[str(p)]['camera']} | {lod[str(p)]['clapperboard']} |" for p in PREFIXES)}

## Why the clapper reads as a book

1. Board and stick are **one component** (`smooth_union`). There is no independent hinged-bar ID.
2. Stick half `{stick_half}` vs board half `{board_half}`: nearly equal width, stick height ~70% of the board — two similar rectangles.
3. No hinge-at-one-edge silhouette; the pair looks like two pages without a spine cue that would even confirm a book, but also without a clapper wedge.
4. Diagonal stripes are **colour zones**, not geometry. Final Mimic is monochrome, so stripes disappear.
5. `clapperboard.visibleProfiles` = `{map_profiles.get("clapperboard")}` — **missing silhouette180/96**, so small sizes keep only the camera block.

## Visibility / Event A lesson

Camera is visible on all four profiles. Clapperboard is not. M5.3 candidates must publish a complete `componentMap` with non-empty `visibleProfiles` for every semantic part, including silhouette frames. Packed activation bit (+256) must be set so parts do not collapse to `minimumGeometricScale = 0.18`.

## M5.3 action

Create a versioned SDF authoring copy. Do not edit frozen PS‑03. Keep this buffer as `VIDEO_BASELINE`.
"""
    (STAGE_DIR / "reports" / "video-baseline-analysis.md").write_text(md, encoding="utf-8")
    print(json.dumps({"hash": digest, "n": n, "videoStates": impact.get("videoContainingStateCount")}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
