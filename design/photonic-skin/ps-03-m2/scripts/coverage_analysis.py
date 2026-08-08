"""PS-03.M2 coverage feasibility analysis.

Anonymous preview sampling only: this stage answers "can a skin of B plates
cover this form and keep it readable", not "which plate id goes where".  No
persistent identity space is created here — that belongs to PS-03.M3.

Every density decision comes from the declarative zones on the target, so the
analyser is identical for every subject form.
"""

from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree

import target_library as tl  # sets up the shared PS-03.M utility path
import mesh_ops as mo  # noqa: E402

DEFAULT_BUDGETS = (8192, 4096, 2048, 1024, 512)

OVERSAMPLE = 4
RELAX_ITERATIONS = 6
CURVATURE_EPS = 0.03

# Skin model shared by every target (mirrors the PS-03.M invariants).
COVERAGE_TARGET = 0.80          # plate area / surface area on a full state
SCALE_MIN, SCALE_MAX = 0.85, 1.15
HOLE_FACTOR = 2.00              # a gap wider than this * plate radius is a hole
PROBE_POINTS = 40_000
MIN_COMPONENT_SAMPLES = 24
MIN_MOBILE_PLATE_PX = 2.0
VIEWPORT_FILL = 0.72            # share of the viewport the form occupies


def _stats(values: np.ndarray) -> dict:
    return {
        "min": float(values.min()),
        "mean": float(values.mean()),
        "median": float(np.median(values)),
        "p95": float(np.percentile(values, 95)),
        "max": float(values.max()),
    }


def preview_samples(target: tl.CompiledTarget, budget: int,
                    rng: np.random.Generator) -> dict:
    """Weighted blue-noise preview of `budget` anonymous plate positions."""
    vertices, faces = target.vertices, target.faces
    candidates, _ = mo.sample_surface(vertices, faces, budget * OVERSAMPLE, rng)
    normals = mo.sdf_gradient(target.field, candidates)
    curvature = mo.mean_curvature_estimate(
        target.field, candidates, eps=CURVATURE_EPS
    )
    authoring = target.to_authoring(candidates)
    weights = tl.density_field(target.zones, authoring, normals, curvature)

    keep = mo.blue_noise_select(candidates, weights, budget)
    points = candidates[keep]
    spacing = float(np.sqrt(target.measures["surfaceArea"] / budget))
    points = mo.relax_points(
        points, target.field, spacing, iterations=RELAX_ITERATIONS
    )
    normals = mo.sdf_gradient(target.field, points)
    authoring = target.to_authoring(points)

    component_fields = [
        target.component_fields[c["componentId"]]
        for c in target.definition["components"]
    ]
    stacked = np.stack([f(authoring) for f in component_fields], axis=1)
    component = np.argmin(stacked, axis=1).astype(np.int64)

    return {
        "budget": budget,
        "position": points,
        "normal": normals,
        "component": component,
        "density": weights[keep],
        "featureMask": tl.zone_family_mask(target.zones["feature"], authoring),
        "silhouetteMask": tl.zone_family_mask(
            target.zones["silhouette"], authoring
        ),
        "spacing": spacing,
    }


def _surface_probes(target: tl.CompiledTarget,
                    rng: np.random.Generator) -> np.ndarray:
    probes, _ = mo.sample_surface(
        target.vertices, target.faces, PROBE_POINTS, rng
    )
    return probes


def coverage_metrics(target: tl.CompiledTarget, samples: dict,
                     master_plate_area: float, probes: np.ndarray) -> dict:
    budget = samples["budget"]
    points = samples["position"]
    area = target.measures["surfaceArea"]
    spacing = samples["spacing"]

    tree = cKDTree(points)
    neighbour, _ = tree.query(points, k=2, workers=-1)
    nearest = neighbour[:, 1]
    probe_distance, _ = tree.query(probes, k=1, workers=-1)

    # Uniform plate scale that makes `budget` plates reach the declared
    # coverage on this surface.  Above SCALE_MAX the skin cannot stretch far
    # enough (deficit); below SCALE_MIN the surplus goes to subsurface reserve.
    plate_area_needed = COVERAGE_TARGET * area / budget
    required_scale = float(np.sqrt(plate_area_needed / master_plate_area))
    if required_scale > SCALE_MAX:
        effective_scale = SCALE_MAX
        visible, reserve = budget, 0
        deficit = int(np.ceil(budget * (required_scale / SCALE_MAX) ** 2 - budget))
    elif required_scale < SCALE_MIN:
        effective_scale = SCALE_MIN
        visible = int(
            np.floor(COVERAGE_TARGET * area / (master_plate_area * SCALE_MIN ** 2))
        )
        visible = min(visible, budget)
        reserve, deficit = int(budget - visible), 0
    else:
        effective_scale = required_scale
        visible, reserve, deficit = budget, 0, 0
    achieved_coverage = float(
        budget * master_plate_area * effective_scale ** 2 / max(area, 1e-12)
    )

    # Per-sample local required scale from the actual neighbour spacing.
    local_scale = nearest / max(spacing, 1e-12)
    outside_range = float(
        ((local_scale < SCALE_MIN) | (local_scale > SCALE_MAX)).mean()
    )

    components = []
    zone_area = target.measures["zoneAreas"]
    for index, component in enumerate(target.definition["components"]):
        mask = samples["component"] == index
        measured = target.measures["components"][index]
        components.append(
            {
                "componentId": component["componentId"],
                "samples": int(mask.sum()),
                "sampleShare": float(mask.mean()),
                "surfaceShare": measured["surfaceShare"],
                "samplesPerAreaRatio": float(
                    mask.mean() / max(measured["surfaceShare"], 1e-9)
                ),
                "preserved": bool(mask.sum() >= MIN_COMPONENT_SAMPLES),
            }
        )

    family = target.measures["zoneFamilyAreaShare"]
    feature_area_share = family["feature"]
    silhouette_area_share = family["silhouette"]
    feature_sample_share = float(samples["featureMask"].mean())
    silhouette_sample_share = float(samples["silhouetteMask"].mean())

    plate_radius = float(np.sqrt(master_plate_area * effective_scale ** 2 / np.pi))
    # A hole is a piece of surface no plate can reach, measured against the
    # plate the skin can actually grow to — not against the mean spacing,
    # which would rescale with the budget and never report anything.
    holes = probe_distance > HOLE_FACTOR * plate_radius
    covered = probe_distance <= plate_radius

    extent = target.measures["bounds"]["maxExtent"]
    readability = {}
    for profile, viewport in (("desktop", 1440), ("mobile", 390)):
        px_per_unit = VIEWPORT_FILL * viewport / max(extent, 1e-9)
        readability[profile] = {
            "viewportPx": viewport,
            "plateDiameterPx": float(2.0 * plate_radius * px_per_unit),
            "formWidthPx": float(extent * px_per_unit),
        }

    return {
        "budget": budget,
        "surfaceArea": area,
        "areaPerSample": float(area / budget),
        "idealSpacing": spacing,
        "nearestNeighbour": _stats(nearest),
        "nearestNeighbourOverSpacing": _stats(nearest / max(spacing, 1e-12)),
        "coverageHoles": {
            "thresholdOverPlateRadius": HOLE_FACTOR,
            "probes": int(len(probes)),
            "holeProbes": int(holes.sum()),
            "holeAreaShare": float(holes.mean()),
            "probeCoveredAreaShare": float(covered.mean()),
            "worstProbeDistanceOverPlateRadius": float(
                probe_distance.max() / max(plate_radius, 1e-12)
            ),
        },
        "requiredScale": {
            "uniform": required_scale,
            "effective": effective_scale,
            "withinDeclaredRange": bool(SCALE_MIN <= required_scale <= SCALE_MAX),
            "localDistribution": _stats(local_scale),
            "shareOutsideRange": outside_range,
        },
        "skinBudget": {
            "visible": visible,
            "reserve": reserve,
            "reserveShare": float(reserve / budget),
            "deficitPlates": deficit,
            "achievedCoverage": achieved_coverage,
            "coverageTarget": COVERAGE_TARGET,
        },
        "zones": {
            "featureAreaShare": feature_area_share,
            "featureSampleShare": feature_sample_share,
            "featureBias": float(
                feature_sample_share / max(feature_area_share, 1e-9)
            )
            if feature_area_share > 0
            else None,
            "silhouetteAreaShare": silhouette_area_share,
            "silhouetteSampleShare": silhouette_sample_share,
            "silhouetteBias": float(
                silhouette_sample_share / max(silhouette_area_share, 1e-9)
            )
            if silhouette_area_share > 0
            else None,
        },
        "components": components,
        "readability": readability,
        "plateRadius": plate_radius,
    }


def readable(metrics: dict) -> bool:
    """Whether a budget still preserves the form's structure and read.

    Deliberately separate from the skin-density question: a deficit means the
    plates cannot reach the declared coverage, not that the subject stops
    being recognisable.  Both are reported, and neither hides the other.
    """
    silhouette_bias = metrics["zones"]["silhouetteBias"]
    return bool(
        all(c["preserved"] for c in metrics["components"])
        and metrics["coverageHoles"]["holeAreaShare"] <= 0.08
        and metrics["readability"]["mobile"]["plateDiameterPx"]
        >= MIN_MOBILE_PLATE_PX
        and (silhouette_bias is None or silhouette_bias >= 0.75)
    )


def analyse_target(target: tl.CompiledTarget, master_plate_area: float,
                   budgets=DEFAULT_BUDGETS,
                   keep_samples=(8192, 1024)) -> dict:
    rng = tl.target_rng(target.definition["targetId"] + ":coverage")
    probes = _surface_probes(target, rng)
    out = {"budgets": {}, "samples": {}}
    for budget in budgets:
        samples = preview_samples(target, budget, rng)
        out["budgets"][budget] = coverage_metrics(
            target, samples, master_plate_area, probes
        )
        if budget in keep_samples:
            out["samples"][budget] = samples
    passing = [b for b in sorted(budgets) if readable(out["budgets"][b])]
    out["minimumPracticalBudget"] = passing[0] if passing else None
    out["needsSimplifiedMobileLod"] = bool(
        not readable(out["budgets"][min(budgets)])
        or out["budgets"][2048]["readability"]["mobile"]["plateDiameterPx"]
        < MIN_MOBILE_PLATE_PX
        if 2048 in out["budgets"]
        else False
    )
    return out
