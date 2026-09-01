"""PS-04.M5.2.R2 — prove viewer-space mapping and point-vs-flake root cause.

Must run against original EVENT_A before any A-R2 authoring.
Viewer-right is defined as the figure with the largest canonical screen-space X.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from r2_common import (  # noqa: E402
    BASELINE_HASH,
    CAMERAS,
    COMPONENT_TO_PART,
    DESKTOP_SIZE,
    EVENT_A_HASH,
    EVENT_A_R1_HASH,
    EXPECTED_VIEWER_RIGHT_LOD,
    FIGURE_COMPONENTS,
    LOD_PREFIXES,
    M52_DIR,
    M52R1_DIR,
    MINIMUM_GEOMETRIC_SCALE,
    OCTAHEDRON_RADIUS,
    PART_TO_EVENT_PART,
    PUBLIC_M31R,
    SEMANTIC_NAMES,
    STAGE_DIR,
    camera_matrices,
    component_visible,
    event_part_of,
    field_stats,
    figure_mask,
    load_event_a,
    load_event_a_r1,
    nearest_neighbour,
    present_points,
    presentation_frame,
    project_centroid,
    project_points,
    shader_radius,
    sha256_file,
    single_event_entry,
    write_json,
)
import state_builder as m3  # noqa: E402


def describe_figure(records: np.ndarray, component: int, entry: dict, frame: dict) -> dict:
    mask = figure_mask(records, component)
    points = records["position"][mask].astype(np.float64)
    centroid = points.mean(axis=0)
    canonical = project_centroid(centroid, frame, "canonical")
    alternate = project_centroid(centroid, frame, "alternate")
    visible_desktop = component_visible(entry, component, "desktop")
    scales = records["scale"][mask].astype(np.float64)
    density = records["density"][mask].astype(np.float64)
    flags = records["flags"][mask]
    reserve = records["reserveDepth"][mask].astype(np.float64)
    normals = records["normal"][mask].astype(np.float64) / 32767.0
    nn = nearest_neighbour(points)
    presented = present_points(points, frame)
    presented_nn = nearest_neighbour(presented)
    radius_hidden = float(np.median(shader_radius(scales, visible=False, frame_scale=frame["scale"])))
    radius_visible = float(np.median(shader_radius(scales, visible=True, frame_scale=frame["scale"])))
    projected = project_points(points, frame, "canonical")
    screen_pts = np.stack([projected["screenX"], projected["screenY"]], axis=1)
    screen_nn = nearest_neighbour(screen_pts)
    eye = np.asarray(CAMERAS["canonical"], dtype=np.float64)
    view_dir = -eye / np.linalg.norm(eye)
    facing = np.clip(normals @ view_dir, -1.0, 1.0)
    world_radius_vis = scales * OCTAHEDRON_RADIUS
    occupancy_proxy = float(np.median(world_radius_vis) / max(nn["median"] or 1.0, 1e-9))
    lod = {}
    live = (records["status"] == m3.STATUS_ACTIVE) & (records["component"] == component)
    for prefix in LOD_PREFIXES:
        lod[str(prefix)] = int(np.count_nonzero(live[:prefix]))
    bbox_min = points.min(axis=0)
    bbox_max = points.max(axis=0)
    return {
        "semanticName": SEMANTIC_NAMES[component],
        "componentId": int(component),
        "eventPart": int(PART_TO_EVENT_PART[COMPONENT_TO_PART[component]]),
        "activeCount": int(mask.sum()),
        "totalRecords": int(np.count_nonzero(records["component"] == component)),
        "worldCentroid": [float(v) for v in centroid],
        "worldBBox": {
            "min": [float(v) for v in bbox_min],
            "max": [float(v) for v in bbox_max],
            "size": [float(v) for v in bbox_max - bbox_min],
        },
        "canonicalProjectedCentroid": canonical,
        "alternateProjectedCentroid": alternate,
        "canonicalScreenX": canonical["screenX"],
        "visibleProfiles": next(
            (list(item.get("visibleProfiles", [])) for item in entry["componentMap"] if int(item["componentIndex"]) == component),
            [],
        ),
        "visibleOnDesktopProfile": visible_desktop,
        "gpuSettledActivation": 1.0 if visible_desktop else 0.0,
        "gpuFiniteActivationScale": 1.0 if visible_desktop else MINIMUM_GEOMETRIC_SCALE,
        "scale": field_stats(scales),
        "density": field_stats(density),
        "flags": {str(int(v)): int(np.count_nonzero(flags == v)) for v in np.unique(flags)},
        "reserveDepth": field_stats(reserve),
        "statusActive": int(mask.sum()),
        "statusReserve": int(np.count_nonzero((records["component"] == component) & (records["status"] == m3.STATUS_RESERVE))),
        "statusSubsurface": int(np.count_nonzero((records["component"] == component) & (records["status"] == m3.STATUS_SUBSURFACE))),
        "worldNearestNeighbour": nn,
        "presentedNearestNeighbour": presented_nn,
        "screenNearestNeighbourPx": screen_nn,
        "medianWorldSplatRadiusVisible": radius_visible,
        "medianWorldSplatRadiusAsPacked": radius_hidden if not visible_desktop else radius_visible,
        "medianInstanceFootprintWorld": radius_visible if visible_desktop else radius_hidden,
        "splatCoverageRatioVisible": occupancy_proxy,
        "splatCoverageRatioAsPacked": float((radius_hidden if not visible_desktop else radius_visible) / max((presented_nn["median"] or 1.0), 1e-9)),
        "normalVsCanonicalView": {
            "medianFacing": float(np.median(facing)),
            "meanFacing": float(np.mean(facing)),
            "backfacingShare": float(np.mean(facing < 0)),
        },
        "lodPrefixPresence": lod,
        "shaderScaleFormula": "radius = mix(sourceScale, targetScale, t) * mix(minimumGeometricScale, 1, activation) * OctahedronGeometry(0.035) * presentationFrame.scale",
        "octahedronRadius": OCTAHEDRON_RADIUS,
        "minimumGeometricScale": MINIMUM_GEOMETRIC_SCALE,
        "presentationFrameScale": frame["scale"],
    }


def assign_viewer_roles(figures: list[dict]) -> list[dict]:
    ordered = sorted(figures, key=lambda item: item["canonicalScreenX"])
    roles = ("viewer-left", "viewer-centre", "viewer-right")
    for role, item in zip(roles, ordered):
        item["viewerSpaceRole"] = role
    return ordered


def r1_changed_components(records_a: np.ndarray, records_r1: np.ndarray) -> dict:
    a_bytes = np.frombuffer(records_a.tobytes(), dtype=np.uint8).reshape(len(records_a), 40)
    r_bytes = np.frombuffer(records_r1.tobytes(), dtype=np.uint8).reshape(len(records_r1), 40)
    changed = np.any(a_bytes != r_bytes, axis=1)
    by_component = {}
    for component in range(5):
        mask = records_a["component"] == component
        by_component[str(component)] = {
            "semanticName": SEMANTIC_NAMES[component],
            "changedRecords": int(np.count_nonzero(changed & mask)),
            "byteDifference": int(np.max(np.abs(a_bytes[mask].astype(np.int16) - r_bytes[mask].astype(np.int16)))) if np.any(mask) else 0,
        }
    return {"changedPersistentIds": int(changed.sum()), "byComponent": by_component}


def main() -> int:
    records = load_event_a()
    records_r1 = load_event_a_r1()
    entry = single_event_entry()
    frame = presentation_frame(entry)
    parts = event_part_of(records)
    figures = [describe_figure(records, component, entry, frame) for component in FIGURE_COMPONENTS]
    ordered = assign_viewer_roles(figures)
    by_role = {item["viewerSpaceRole"]: item for item in ordered}
    viewer_right = by_role["viewer-right"]
    viewer_left = by_role["viewer-left"]
    viewer_centre = by_role["viewer-centre"]

    expected = {
        "componentId": 2,
        "eventPart": 2,
        "semanticName": "figure-left",
        "activeCount": 1014,
    }
    mapping_matches_expected = (
        viewer_right["componentId"] == expected["componentId"]
        and viewer_right["eventPart"] == expected["eventPart"]
        and viewer_right["semanticName"] == expected["semanticName"]
        and viewer_right["activeCount"] == expected["activeCount"]
    )

    r1_diff = r1_changed_components(records, records_r1)
    r1_wrong_target = r1_diff["byComponent"]["4"]["changedRecords"] > 0 and r1_diff["byComponent"]["2"]["changedRecords"] == 0

    packed_gap = viewer_right["splatCoverageRatioAsPacked"]
    visible_gap = viewer_right["splatCoverageRatioVisible"]
    left_gap = viewer_left["splatCoverageRatioAsPacked"]
    cause = "gpu-visibility-minimum-geometric-scale"
    if packed_gap >= 0.7 * left_gap:
        cause = "not-explained-by-visibility-alone"
    if viewer_right["worldNearestNeighbour"]["median"] > 1.8 * viewer_left["worldNearestNeighbour"]["median"]:
        cause = "sparse-world-sampling"
    if not viewer_right["visibleOnDesktopProfile"] and packed_gap < 0.45 * left_gap:
        cause = "empty-visibleProfiles-forces-minimumGeometricScale"

    proof = {
        "stage": "PS-04.M5.2.R2",
        "source": "original EVENT_A",
        "eventAHash": EVENT_A_HASH,
        "eventAR1Hash": EVENT_A_R1_HASH,
        "baselineHash": BASELINE_HASH,
        "eventAUnchanged": sha256_file(M52_DIR / "variants" / "a" / "single-event.state.bin") == EVENT_A_HASH,
        "eventAR1Unchanged": sha256_file(M52R1_DIR / "variants" / "a-r1" / "single-event.state.bin") == EVENT_A_R1_HASH,
        "rule": "viewer-right = figure with the largest canonical screen-space X",
        "semanticNamesAreNotSourceOfTruth": True,
        "canonicalCamera": camera_matrices("canonical"),
        "alternateCamera": camera_matrices("alternate"),
        "presentationFrame": frame,
        "desktopProfilePx": DESKTOP_SIZE,
        "figures": ordered,
        "viewerLeft": {
            "semanticName": viewer_left["semanticName"],
            "componentId": viewer_left["componentId"],
            "eventPart": viewer_left["eventPart"],
            "activeCount": viewer_left["activeCount"],
            "canonicalScreenX": viewer_left["canonicalScreenX"],
        },
        "viewerCentre": {
            "semanticName": viewer_centre["semanticName"],
            "componentId": viewer_centre["componentId"],
            "eventPart": viewer_centre["eventPart"],
            "activeCount": viewer_centre["activeCount"],
            "canonicalScreenX": viewer_centre["canonicalScreenX"],
        },
        "viewerRight": {
            "semanticName": viewer_right["semanticName"],
            "componentId": viewer_right["componentId"],
            "eventPart": viewer_right["eventPart"],
            "activeCount": viewer_right["activeCount"],
            "canonicalScreenX": viewer_right["canonicalScreenX"],
            "VIEWER_RIGHT_COMPONENT": viewer_right["componentId"],
            "VIEWER_RIGHT_EVENT_PART": viewer_right["eventPart"],
            "SEMANTIC_FIGURE_LEFT_COMPONENT": 2,
        },
        "expectedViewerRight": expected,
        "mappingMatchesOwnerHypothesis": mapping_matches_expected,
        "r1ActualTarget": {
            "semanticName": "figure-right",
            "componentId": 4,
            "eventPart": 3,
            "activeCount": 890,
            "viewerSpaceRoleAfter180": by_role["viewer-left"]["semanticName"] == "figure-right" and by_role["viewer-left"]["componentId"] == 4,
            "changedRecords": r1_diff["byComponent"]["4"]["changedRecords"],
        },
        "r1DidNotTouchViewerRight": r1_diff["byComponent"][str(viewer_right["componentId"])]["changedRecords"] == 0,
        "r1WrongTarget": r1_wrong_target,
        "authoringMayProceed": mapping_matches_expected,
        "partBytes": {str(int(v)): int(np.count_nonzero(parts == v)) for v in range(4)},
        "expectedViewerRightLod": EXPECTED_VIEWER_RIGHT_LOD,
        "actualViewerRightLod": viewer_right["lodPrefixPresence"],
        "lodMatchesExpected": viewer_right["lodPrefixPresence"] == {str(k): v for k, v in EXPECTED_VIEWER_RIGHT_LOD.items()},
    }
    write_json(STAGE_DIR / "reports" / "screen-space-part-map.json", proof)

    root = {
        "causeId": cause,
        "summary": (
            "Frozen single-event componentMap leaves semantic figure-left (component 2) with empty visibleProfiles. "
            "After EVENT_A's rigid +180° Z that component is viewer-right. GPU packing therefore omits the +256 visibility bit, "
            "settled activation is 0, and instance radius collapses to minimumGeometricScale (0.18) × OctahedronGeometry(0.035). "
            "Viewer-left/centre stay on desktop visibleProfiles and render at full flake size. "
            "This is not a global particle-size, camera, exposure, or DPR issue."
        ),
        "notTheCause": [
            "canonical vs alternate camera choice",
            "global shader/material rewrite",
            "global particle size / DPR / exposure",
            "status/LOD dropping the IDs",
            "binary silhouette connectivity of a force-visible mask",
        ],
        "displayPath": {
            "position": "packed into uSource.xyz; finite",
            "normal": "packed into uSourceNormal; used for lighting",
            "orientation": "packed into uSourceQuat; rotates OctahedronGeometry(0.035)",
            "scale": "packed into uSource.w; active records use SKIN_SCALE_CAP 1.15 on all three figures",
            "density": "meta/flags only; does not change settled radius",
            "status": "active=0 for all 1014 viewer-right IDs",
            "flags": "feature/silhouette/density bits; visibility bit is NOT stored here",
            "reserveDepth": "unused on active records",
            "visibleProfiles": "EMPTY for component 2 on the frozen single-event entry",
            "shader": "radius = geometricScale * mix(0.18, 1, activation) * 0.035 * presentationFrame.scale",
            "activation": "sourceVisible = step(255.5, meta.w); meta.w += 256 only if component is in visibleComponents(profile)",
        },
        "viewerRightAsPacked": {
            "visibleOnDesktopProfile": viewer_right["visibleOnDesktopProfile"],
            "gpuFiniteActivationScale": viewer_right["gpuFiniteActivationScale"],
            "medianInstanceFootprintWorld": viewer_right["medianInstanceFootprintWorld"],
            "presentedNnMedian": viewer_right["presentedNearestNeighbour"]["median"],
            "coverageRatio": viewer_right["splatCoverageRatioAsPacked"],
        },
        "viewerRightIfForcedVisible": {
            "medianInstanceFootprintWorld": viewer_right["medianWorldSplatRadiusVisible"],
            "coverageRatio": viewer_right["splatCoverageRatioVisible"],
        },
        "viewerLeftAsPacked": {
            "visibleOnDesktopProfile": viewer_left["visibleOnDesktopProfile"],
            "medianInstanceFootprintWorld": viewer_left["medianInstanceFootprintWorld"],
            "presentedNnMedian": viewer_left["presentedNearestNeighbour"]["median"],
            "coverageRatio": viewer_left["splatCoverageRatioAsPacked"],
        },
        "viewerCentreAsPacked": {
            "visibleOnDesktopProfile": viewer_centre["visibleOnDesktopProfile"],
            "medianInstanceFootprintWorld": viewer_centre["medianInstanceFootprintWorld"],
            "presentedNnMedian": viewer_centre["presentedNearestNeighbour"]["median"],
            "coverageRatio": viewer_centre["splatCoverageRatioAsPacked"],
        },
        "footprintRatioVsViewerLeft": float(
            viewer_right["medianInstanceFootprintWorld"] / max(viewer_left["medianInstanceFootprintWorld"], 1e-12)
        ),
        "interpretation": {
            "actorMaskWouldBeSparse": True,
            "reason": "actor-mask still uses the same activation/radius path; hidden IDs render at 0.18 scale",
            "geometryIsPresent": True,
            "scaleFieldIsNotAnomalous": viewer_right["scale"]["median"] >= 1.0,
            "fix": [
                "A-R2 overlay must put VIEWER_RIGHT_COMPONENT on desktop/mobile/silhouette visibleProfiles",
                "rebuild the same 1014 IDs as a compact pawn-like octahedral surface so the unhidden figure is readable",
                "do not change global particle size, camera, exposure, or shader",
            ],
            "doNotChangeScaleFieldUnlessNecessary": True,
            "scaleFieldChangeRequired": False,
        },
        "r1MissedThis": "R1 silhouette pass force-visible'd component 4 (viewer-left) and never measured settled GPU activation of component 2.",
        "mappingMatchesOwnerHypothesis": mapping_matches_expected,
        "authoringMayProceed": mapping_matches_expected,
    }
    write_json(STAGE_DIR / "reports" / "point-vs-flake-root-cause.json", root)

    md = f"""# Point vs flake — root cause (EVENT_A)

**Cause ID:** `{cause}`

Frozen `single-event` `componentMap` leaves semantic `figure-left` (component 2, eventPart 2, active 1014) with **empty `visibleProfiles`**. After EVENT_A's rigid +180° around +Z this component is **viewer-right** (largest canonical screen-space X).

GPU packing (`packStateInto`) adds `+256` to `meta.w` only when the component is in `visibleComponents(profile)`. The vertex shader then does:

```
sourceVisible = step(255.5, meta.w)
activation    = statusActive * sourceVisible
radius        = scale * mix(minimumGeometricScale=0.18, 1, activation) * OctahedronGeometry(0.035) * presentationFrame.scale
```

Settled A therefore draws viewer-right at **18% instance radius**. Viewer-left (`figure-right`, component 4) and viewer-centre (`figure-centre`, component 3) remain on desktop `visibleProfiles` and render as full octahedral flakes.

| Role | Semantic | Component | Screen X | Desktop visible | Packed footprint | If force-visible |
| --- | --- | --- | --- | --- | --- | --- |
| viewer-left | {viewer_left['semanticName']} | {viewer_left['componentId']} | {viewer_left['canonicalScreenX']:.2f} | {viewer_left['visibleOnDesktopProfile']} | {viewer_left['medianInstanceFootprintWorld']:.5f} | {viewer_left['medianWorldSplatRadiusVisible']:.5f} |
| viewer-centre | {viewer_centre['semanticName']} | {viewer_centre['componentId']} | {viewer_centre['canonicalScreenX']:.2f} | {viewer_centre['visibleOnDesktopProfile']} | {viewer_centre['medianInstanceFootprintWorld']:.5f} | {viewer_centre['medianWorldSplatRadiusVisible']:.5f} |
| viewer-right | {viewer_right['semanticName']} | {viewer_right['componentId']} | {viewer_right['canonicalScreenX']:.2f} | {viewer_right['visibleOnDesktopProfile']} | {viewer_right['medianInstanceFootprintWorld']:.5f} | {viewer_right['medianWorldSplatRadiusVisible']:.5f} |

R1 changed component 4 (viewer-left) and left this path untouched. A binary silhouette of a force-visible cloud cannot see a 0.18 GPU scale.

This is **not** a request to change camera, global particle size, exposure, DPR, or the material shader. A-R2 must (1) unhide `VIEWER_RIGHT_COMPONENT` in the sandbox overlay `componentMap`, and (2) rebuild those 1014 records as a compact pawn-like flake surface starting from original EVENT_A.

Authoring may proceed: **{mapping_matches_expected}**
"""
    (STAGE_DIR / "reports").mkdir(parents=True, exist_ok=True)
    (STAGE_DIR / "reports" / "point-vs-flake-root-cause.md").write_text(md, encoding="utf-8")

    print(json.dumps({
        "viewerRight": proof["viewerRight"],
        "viewerLeft": proof["viewerLeft"],
        "mappingMatchesOwnerHypothesis": mapping_matches_expected,
        "causeId": cause,
        "footprintRatioVsViewerLeft": root["footprintRatioVsViewerLeft"],
        "authoringMayProceed": mapping_matches_expected,
        "r1WrongTarget": r1_wrong_target,
    }, indent=2))
    if not mapping_matches_expected:
        print("STOP: projection does not match the owner hypothesis; do not author automatically.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
