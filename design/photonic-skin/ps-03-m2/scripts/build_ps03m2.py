"""PS-03.M2 target library build.

Loads every TargetDefinition, compiles it through the shared geometry provider
registry, normalises mass to V0, measures and validates the result, runs the
anonymous coverage feasibility analysis and writes deterministic artifacts.

The build has no knowledge of any particular subject form: adding a target
means adding one JSON document to ``targets/``.

Run:
  python build_ps03m2.py                     full build
  python build_ps03m2.py --targets a,b       subset (skips the manifest write)
  python build_ps03m2.py --skip-coverage     geometry only
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import target_library as tl  # noqa: E402  (sets up the shared utility path)
import coverage_analysis as cov  # noqa: E402
import mesh_ops as mo  # noqa: E402
import target_schema as ts  # noqa: E402

STAGE_DIR = SCRIPT_DIR.parent
TARGETS_DIR = STAGE_DIR / "targets"
EXPORT_DIR = STAGE_DIR / "exports"
MESH_DIR = EXPORT_DIR / "meshes"
FIELD_DIR = EXPORT_DIR / "fields"

NEUTRAL_PEARL = (233, 227, 216)
# Seven approved core colours, kept in step with the production site
# (app/_visual-actor/visual-actor-state.ts CORE_COMPETENCE_COLORS, colour
# grammar v0.2).  PS-03.M used the older v0.1 values; the delta is recorded
# in the manifest rather than silently reconciled.
COMPETENCY_COLORS = {
    "content": (0x4C, 0x7A, 0xFF),
    "design": (0x9E, 0x64, 0xEE),
    "event": (0xF8, 0x69, 0x27),
    "games": (0x76, 0xA7, 0x13),
    "video": (0xE3, 0x49, 0x92),
    "digital": (0x00, 0x9F, 0xAC),
    "merch": (0xD5, 0xA2, 0x00),
}
LEGACY_PS03M_COLORS = {
    "content": "#4E68FF", "design": "#8A5CF6", "event": "#F56A2A",
    "games": "#75A900", "video": "#DF3E85", "digital": "#0097A7",
    "merch": "#D6A300",
}

VERTEX_ATTR_STRIDE = 8      # component, feature, silhouette, density, r, g, b, chroma
SAMPLE_STRIDE = 28          # 3 float32 pos + 3 float32 nrm + 4 uint8 flags
EXPORT_SAMPLE_BUDGETS = (8192, 1024)


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(Path(path).read_bytes())


def vertex_attributes(target: tl.CompiledTarget) -> tuple[bytes, dict]:
    """Per-vertex component / zone / colour data used by the render pass."""
    vertices = target.vertices
    authoring = target.to_authoring(vertices)
    definition = target.definition

    component_fields = [
        target.component_fields[c["componentId"]] for c in definition["components"]
    ]
    stacked = np.stack([f(authoring) for f in component_fields], axis=1)
    component = np.argmin(stacked, axis=1).astype(np.uint8)

    feature = tl.zone_family_mask(target.zones["feature"], authoring)
    silhouette = tl.zone_family_mask(target.zones["silhouette"], authoring)

    normals = mo.sdf_gradient(target.field, vertices)
    curvature = mo.mean_curvature_estimate(target.field, vertices, eps=0.03)
    density = tl.density_field(target.zones, authoring, normals, curvature)
    density_norm = np.clip(density / max(float(density.max()), 1e-9), 0.0, 1.0)

    rgb = np.tile(np.array(NEUTRAL_PEARL, dtype=np.uint8), (len(vertices), 1))
    chroma = np.zeros(len(vertices), dtype=np.float64)
    for zone in target.zones["color"]:
        mask = tl.zone_mask(zone, authoring)
        stronger = mask > chroma
        chroma[stronger] = mask[stronger]
        rgb[stronger] = COMPETENCY_COLORS[zone["competencyId"]]

    blob = np.zeros((len(vertices), VERTEX_ATTR_STRIDE), dtype=np.uint8)
    blob[:, 0] = component
    blob[:, 1] = np.round(feature * 255).astype(np.uint8)
    blob[:, 2] = np.round(silhouette * 255).astype(np.uint8)
    blob[:, 3] = np.round(density_norm * 255).astype(np.uint8)
    blob[:, 4:7] = rgb
    blob[:, 7] = np.round(chroma * 255).astype(np.uint8)

    areas = mo.face_areas(target.vertices, target.faces)
    face_chroma = chroma[target.faces].mean(axis=1)
    coloured_area = float((areas * (face_chroma > 0.5)).sum())
    summary = {
        "stride": VERTEX_ATTR_STRIDE,
        "count": int(len(vertices)),
        "layout": ["component", "feature", "silhouette", "density",
                   "r", "g", "b", "chroma"],
        "colouredAreaShare": coloured_area / max(float(areas.sum()), 1e-12),
        "neutralAreaShare": 1.0 - coloured_area / max(float(areas.sum()), 1e-12),
        "densityRange": [float(density.min()), float(density.max())],
    }
    return blob.tobytes(), summary


def pack_samples(samples: dict) -> bytes:
    count = len(samples["position"])
    out = bytearray()
    out += samples["position"].astype(np.float32).tobytes()
    out += samples["normal"].astype(np.float32).tobytes()
    flags = np.zeros((count, 4), dtype=np.uint8)
    flags[:, 0] = samples["component"].astype(np.uint8)
    flags[:, 1] = np.round(np.clip(samples["featureMask"], 0, 1) * 255)
    flags[:, 2] = np.round(np.clip(samples["silhouetteMask"], 0, 1) * 255)
    density = samples["density"]
    flags[:, 3] = np.round(
        np.clip(density / max(float(density.max()), 1e-9), 0, 1) * 255
    )
    out += flags.tobytes()
    return bytes(out)


def main(argv: list[str]) -> int:
    started = time.time()
    only = None
    skip_coverage = "--skip-coverage" in argv
    for argument in argv:
        if argument.startswith("--targets="):
            only = set(argument.split("=", 1)[1].split(","))

    print("[1/5] loading and validating definitions")
    definitions = ts.load_library(TARGETS_DIR)
    masters = [d for d in definitions if d["targetRole"] == "master"]
    if len(masters) != 1:
        raise SystemExit(
            f"exactly one master target is required, found {len(masters)}"
        )
    master = masters[0]
    ordered = [master] + [d for d in definitions if d is not master]
    if only is not None:
        ordered = [d for d in ordered if d["targetId"] in only or d is master]
    print("      %d definitions, schema %s" % (len(definitions), ts.SCHEMA_VERSION))

    print("[2/5] compiling, normalising and measuring")
    targets: dict[str, tl.CompiledTarget] = {}
    v0 = None
    for definition in ordered:
        stamp = time.time()
        target = tl.build_target(definition, v0)
        if v0 is None:
            v0 = target.measures["v0"]
        targets[definition["targetId"]] = target
        measures = target.measures
        print(
            "      %-28s vol %.4f (err %.2e)  area %.3f  comps %d  %.1fs"
            % (
                definition["targetId"], measures["volumeNormalized"],
                measures["volumeError"], measures["surfaceArea"],
                measures["meshComponents"], time.time() - stamp,
            )
        )
        if not target.validation["passed"]:
            failed = [k for k, v in target.validation["checks"].items() if not v]
            print("        !! failed checks: %s" % ", ".join(failed))
        for note in target.validation["notes"]:
            print("        .. %s" % note)

    master_area = targets[master["targetId"]].measures["surfaceArea"]
    master_plate_area = cov.COVERAGE_TARGET * master_area / 8192
    # One skin module = the diameter of a master-scale plate.  The context
    # checkpoint fixes the construction minimum in modules, not world units.
    module = float(2.0 * np.sqrt(master_plate_area / np.pi))
    for target in targets.values():
        measures = target.measures
        measures["surfaceAreaVsMasterRatio"] = measures["surfaceArea"] / master_area
        measures["thickness"]["minBulkModules"] = (
            measures["thickness"]["minBulkAcrossComponents"] / module
        )
        for component in measures["components"]:
            component["bulkThicknessModules"] = component["bulkThickness"] / module

    print("[3/5] exporting meshes and vertex fields")
    MESH_DIR.mkdir(parents=True, exist_ok=True)
    FIELD_DIR.mkdir(parents=True, exist_ok=True)
    mesh_info: dict[str, dict] = {}
    for target_id, target in targets.items():
        mesh_path = MESH_DIR / f"{target_id}.obj"
        mo.export_obj(mesh_path, target.vertices, target.faces)
        blob, summary = vertex_attributes(target)
        field_path = FIELD_DIR / f"{target_id}-vertex-attrs.bin"
        field_path.write_bytes(blob)
        mesh_info[target_id] = {
            "meshPath": str(mesh_path.relative_to(STAGE_DIR)).replace("\\", "/"),
            "meshSha256": sha256_file(mesh_path),
            "vertexAttributes": {
                **summary,
                "path": str(field_path.relative_to(STAGE_DIR)).replace("\\", "/"),
                "sha256": sha256_bytes(blob),
            },
        }

    coverage_out: dict[str, dict] = {}
    sample_blob = bytearray()
    sample_index: dict[str, dict] = {}
    if not skip_coverage:
        print("[4/5] coverage feasibility (%s)" % ", ".join(
            str(b) for b in cov.DEFAULT_BUDGETS
        ))
        for target_id, target in targets.items():
            stamp = time.time()
            budgets = tuple(
                target.definition.get("coverageProfiles", cov.DEFAULT_BUDGETS)
            )
            result = cov.analyse_target(
                target, master_plate_area, budgets,
                keep_samples=EXPORT_SAMPLE_BUDGETS,
            )
            coverage_out[target_id] = {
                "budgets": {str(k): v for k, v in result["budgets"].items()},
                "minimumPracticalBudget": result["minimumPracticalBudget"],
                "needsSimplifiedMobileLod": result["needsSimplifiedMobileLod"],
            }
            sample_index[target_id] = {}
            for budget in EXPORT_SAMPLE_BUDGETS:
                if budget not in result["samples"]:
                    continue
                packed = pack_samples(result["samples"][budget])
                sample_index[target_id][str(budget)] = {
                    "offset": len(sample_blob),
                    "count": budget,
                    "stride": SAMPLE_STRIDE,
                    "plateRadius": result["budgets"][budget]["plateRadius"],
                }
                sample_blob += packed
            print(
                "      %-28s min budget %s  %.1fs"
                % (target_id, result["minimumPracticalBudget"], time.time() - stamp)
            )
    else:
        print("[4/5] coverage skipped")

    print("[5/5] writing reports")
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    sample_path = EXPORT_DIR / "ps03m2-coverage-samples.bin"
    if not skip_coverage:
        sample_path.write_bytes(bytes(sample_blob))

    manifest = {
        "stage": "PS-03.M2",
        "schemaVersion": ts.SCHEMA_VERSION,
        "seed": tl.SEED,
        "buildConfigHash": tl.build_config_hash(),
        "grid": {"bounds": tl.GRID_BOUNDS, "resolution": tl.GRID_RESOLUTION},
        "canonicalCoordinateSystem": ts.CANONICAL_COORDINATE_SYSTEM,
        "canonicalCameras": ts.CANONICAL_CAMERAS,
        "v0": v0,
        "masterTargetId": master["targetId"],
        "masterPlateArea": master_plate_area,
        "skinModel": {
            "coverageTarget": cov.COVERAGE_TARGET,
            "scaleRange": [cov.SCALE_MIN, cov.SCALE_MAX],
            "plateModuleDiameter": module,
            "minConstructionModules": 4,
            "comfortableConstructionModules": 7,
            "moduleSource": "context checkpoint 2026-08-04 §5: minimum construction thickness 4 modules, comfortable 7",
        },
        "providers": gp_registry_summary(),
        "competencyColors": {
            k: "#%02X%02X%02X" % v for k, v in COMPETENCY_COLORS.items()
        },
        "competencyColorsLegacyPs03m": LEGACY_PS03M_COLORS,
        "coverageSamples": {
            "path": "exports/ps03m2-coverage-samples.bin",
            "sha256": sha256_bytes(bytes(sample_blob)) if not skip_coverage else None,
            "index": sample_index,
        },
        "targets": {},
    }
    for target_id, target in targets.items():
        definition = target.definition
        manifest["targets"][target_id] = {
            "targetVersion": definition["targetVersion"],
            "competencyId": definition["competencyId"],
            "displayName": definition["displayName"],
            "targetRole": definition["targetRole"],
            "geometryRepresentation": definition["geometryRepresentation"],
            "definitionHash": ts.definition_hash(definition),
            "componentIds": [
                c["componentId"] for c in definition["components"]
            ],
            "providersUsed": sorted(
                tl.compile_components(definition)["stats"].providers_used
            ),
            "measures": target.measures,
            "validation": target.validation,
            "sdfSign": tl.sdf_sign_probe(target),
            "provenance": definition["provenance"],
            **mesh_info[target_id],
            "coverage": coverage_out.get(target_id),
        }

    manifest_json = json.dumps(manifest, indent=2, sort_keys=True, default=_json_default)
    content_hash = sha256_bytes(manifest_json.encode("utf8"))
    manifest["contentHash"] = content_hash
    manifest_json = json.dumps(manifest, indent=2, sort_keys=True, default=_json_default)
    (EXPORT_DIR / "ps03m2-library-manifest.json").write_text(
        manifest_json, encoding="utf8"
    )

    qa = quality_report(targets, manifest, v0)
    (EXPORT_DIR / "ps03m2-qa-report.json").write_text(
        json.dumps(qa, indent=2, sort_keys=True, default=_json_default),
        encoding="utf8",
    )

    print(
        "done in %.1fs  targets=%d  V0=%.6f  contentHash=%s"
        % (time.time() - started, len(targets), v0, content_hash[:16])
    )
    print("machine QA: %s" % ("PASS" if qa["allChecksPassed"] else "FAIL"))
    for name, value in sorted(qa["checks"].items()):
        if value is not True:
            print("  !! %s = %s" % (name, value))
    return 0 if qa["allChecksPassed"] else 1


def _json_default(value):
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, np.ndarray):
        return value.tolist()
    raise TypeError(f"cannot serialise {type(value)!r}")


def gp_registry_summary() -> list[dict]:
    import geometry_providers as gp

    return [
        {
            "name": spec.name,
            "kind": spec.kind,
            "exactDistance": spec.exact,
            "children": [spec.min_children, spec.max_children],
        }
        for spec in sorted(gp.REGISTRY.values(), key=lambda s: s.name)
    ]


def quality_report(targets: dict, manifest: dict, v0: float) -> dict:
    checks: dict[str, object] = {}
    ids = list(targets)
    checks["schema_valid"] = True
    checks["target_ids_unique"] = len(set(ids)) == len(ids)
    checks["component_ids_unique_within_target"] = all(
        len({c["componentId"] for c in t.definition["components"]})
        == len(t.definition["components"])
        for t in targets.values()
    )
    checks["finite_values"] = all(t.measures["finite"] for t in targets.values())
    checks["watertight"] = all(t.measures["watertight"] for t in targets.values())
    checks["loose_vertices_zero"] = all(
        t.measures["looseVertices"] == 0 for t in targets.values()
    )
    checks["degenerate_faces_zero"] = all(
        t.measures["degenerateFaces"] == 0 for t in targets.values()
    )
    checks["no_non_manifold_edges"] = all(
        t.measures["nonManifoldEdges"] == 0 for t in targets.values()
    )
    checks["positive_component_volumes"] = all(
        c["measuredVolume"] > 0.0
        for t in targets.values()
        for c in t.measures["components"]
    )
    checks["sdf_sign_valid"] = all(
        manifest["targets"][i]["sdfSign"]["valid"] for i in ids
    )
    checks["normalized_volume_error_within_1pct"] = all(
        t.measures["volumeError"] <= 0.01 for t in targets.values()
    )
    checks["connected_component_count_matches_declaration"] = all(
        t.measures["meshComponents"] == t.measures["declaredShellCount"]
        == int(t.definition["validationPolicy"]["expectedComponents"])
        for t in targets.values()
    )
    checks["canonical_bounds_valid"] = all(
        t.validation["checks"]["boundsInsideGrid"] for t in targets.values()
    )
    checks["no_self_intersections"] = all(
        t.measures["selfIntersections"]["intersecting_pairs"] == 0
        for t in targets.values()
    )
    checks["genus_is_integer"] = all(
        t.validation["checks"]["genusIsInteger"] for t in targets.values()
    )
    checks["all_target_validations_passed"] = all(
        t.validation["passed"] for t in targets.values()
    )
    checks["min_construction_thickness_4_modules"] = all(
        t.measures["thickness"]["minBulkModules"] >= 4.0 for t in targets.values()
    )
    checks["neutral_share_within_55_70pct"] = all(
        0.55 <= manifest["targets"][i]["vertexAttributes"]["neutralAreaShare"] <= 0.70
        for i in ids
    )
    coverage_ok = True
    counts_ok = True
    finite_ok = True
    for target_id in ids:
        entry = manifest["targets"][target_id].get("coverage")
        if not entry:
            coverage_ok = None
            continue
        for budget, metrics in entry["budgets"].items():
            counts_ok &= metrics["budget"] == int(budget)
            finite_ok &= np.isfinite(
                [metrics["areaPerSample"], metrics["idealSpacing"],
                 metrics["requiredScale"]["uniform"]]
            ).all()
    checks["coverage_sample_count_matches_request"] = counts_ok
    checks["coverage_values_finite"] = bool(finite_ok)

    failing = {k: v for k, v in checks.items() if v is not True}
    return {
        "stage": "PS-03.M2",
        "v0": v0,
        "targetCount": len(ids),
        "checks": checks,
        "allChecksPassed": not failing,
        "failingChecks": sorted(failing),
        "contentHash": manifest["contentHash"],
        "buildConfigHash": manifest["buildConfigHash"],
        "perTarget": {
            target_id: {
                "definitionHash": manifest["targets"][target_id]["definitionHash"],
                "meshSha256": manifest["targets"][target_id]["meshSha256"],
                "volumeError": targets[target_id].measures["volumeError"],
                "surfaceArea": targets[target_id].measures["surfaceArea"],
                "surfaceAreaVsMasterRatio":
                    targets[target_id].measures["surfaceAreaVsMasterRatio"],
                "meshComponents": targets[target_id].measures["meshComponents"],
                "minThicknessP05": targets[target_id].measures["thickness"]["p05"],
                "minBulkThicknessModules":
                    targets[target_id].measures["thickness"]["minBulkModules"],
                "neutralAreaShare":
                    manifest["targets"][target_id]["vertexAttributes"]
                    ["neutralAreaShare"],
                "validationPassed": targets[target_id].validation["passed"],
                "validationNotes": targets[target_id].validation["notes"],
                "minimumPracticalBudget":
                    (manifest["targets"][target_id].get("coverage") or {})
                    .get("minimumPracticalBudget"),
            }
            for target_id in ids
        },
    }


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
