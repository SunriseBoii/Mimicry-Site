"""PS-03.M2 offline test suite.

Validates the built library without rebuilding it: schema, provider registry,
geometry, normalisation, coverage, artifact integrity and — most importantly
for this stage — the absence of target-specific branches in the core pipeline.

Run:  python test_ps03m2.py
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import target_library as tl  # noqa: E402  (sets up the shared utility path)
import geometry_providers as gp  # noqa: E402
import mesh_ops as mo  # noqa: E402
import target_schema as ts  # noqa: E402

STAGE_DIR = SCRIPT_DIR.parent
TARGETS_DIR = STAGE_DIR / "targets"
EXPORT_DIR = STAGE_DIR / "exports"

# Modules that must stay subject-agnostic.  Anything here may name providers
# and roles, but never a target or component identity.
CORE_MODULES = (
    "geometry_providers.py",
    "target_schema.py",
    "target_library.py",
    "coverage_analysis.py",
    "measure_ops.py",
    "build_ps03m2.py",
    "render_ps03m2.py",
)

FAILURES: list[str] = []
CHECKS = 0


def check(condition, message: str) -> None:
    global CHECKS
    CHECKS += 1
    if condition:
        print(f"  [ok] {message}")
    else:
        print(f"  [FAIL] {message}")
        FAILURES.append(message)


def section(title: str) -> None:
    print(f"\n{title}")


def main() -> int:
    manifest = json.loads(
        (EXPORT_DIR / "ps03m2-library-manifest.json").read_text("utf8")
    )
    qa = json.loads((EXPORT_DIR / "ps03m2-qa-report.json").read_text("utf8"))
    definitions = {d["targetId"]: d for d in ts.load_library(TARGETS_DIR)}
    targets = manifest["targets"]

    section("schema and contract")
    check(manifest["schemaVersion"] == ts.SCHEMA_VERSION, "manifest schema version matches")
    check(len(definitions) == len(targets) == 8, f"8 targets in the library (got {len(targets)})")
    check(
        {d["competencyId"] for d in definitions.values()}
        == set(ts.COMPETENCIES),
        "every competency plus the master is covered exactly once",
    )
    check(
        len({d["competencyId"] for d in definitions.values()}) == len(definitions),
        "one target per competency, no duplicates",
    )
    for target_id, definition in definitions.items():
        problems = ts.validate_definition(definition, target_id)
        check(not problems, f"{target_id}: definition validates ({len(problems)} problems)")
        check(
            ts.definition_hash(definition) == targets[target_id]["definitionHash"],
            f"{target_id}: definition hash matches the build",
        )
    check(
        all(
            len({c["componentId"] for c in d["components"]}) == len(d["components"])
            for d in definitions.values()
        ),
        "component ids are unique inside every target",
    )
    check(
        all(
            abs(sum(c["massWeight"] for c in d["components"]) - 1.0) < 1e-6
            for d in definitions.values()
        ),
        "component mass weights sum to 1.0 in every target",
    )

    section("schema rejects malformed definitions")
    broken = json.loads(json.dumps(definitions["sphere-master"]))
    broken["components"][0]["massWeight"] = 0.4
    check(bool(ts.validate_definition(broken)), "mass weights that do not sum to 1 are rejected")
    broken = json.loads(json.dumps(definitions["sphere-master"]))
    broken["components"][0]["geometryProvider"]["provider"] = "not_a_provider"
    check(bool(ts.validate_definition(broken)), "unknown providers are rejected")
    broken = json.loads(json.dumps(definitions["sphere-master"]))
    del broken["components"][0]["geometryProvider"]["params"]["radius"]
    check(bool(ts.validate_definition(broken)), "missing required provider params are rejected")
    broken = json.loads(json.dumps(definitions["sphere-master"]))
    broken["schemaVersion"] = "0.9.0"
    check(bool(ts.validate_definition(broken)), "wrong schema versions are rejected")

    section("geometry providers")
    registry = gp.REGISTRY
    for name in ("sphere", "rounded_box", "capsule", "tapered_capsule", "ellipsoid",
                 "torus", "rounded_plate", "revolved_profile", "plane_slab", "slab",
                 "union", "smooth_union", "subtract", "smooth_subtract", "intersect",
                 "smooth_intersect", "offset", "mirror", "repeat_polar",
                 "repeat_linear", "displace_gaussian_band", "mesh_asset"):
        check(name in registry, f"provider registered: {name}")

    unit = gp.compile_node({"provider": "sphere", "params": {"radius": 1.0}})
    probe = np.array([[0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [1.0, 0.0, 0.0]])
    check(np.allclose(unit(probe), [-1.0, 1.0, 0.0]), "sphere is an exact distance field")

    moved = gp.compile_node(
        {"provider": "sphere", "params": {"radius": 1.0},
         "transform": {"translate": [3.0, 0.0, 0.0], "rotateDeg": [0.0, 90.0, 0.0],
                       "scale": 2.0}}
    )
    check(abs(float(moved(np.array([[3.0, 0.0, 0.0]]))[0]) + 2.0) < 1e-9,
          "transform scales distance and moves the origin")

    mirrored = gp.compile_node(
        {"provider": "mirror", "params": {"axis": "x"},
         "children": [{"provider": "sphere", "params": {"radius": 0.5,
                                                        "center": [2.0, 0.0, 0.0]}}]}
    )
    left, right = mirrored(np.array([[-2.0, 0.0, 0.0], [2.0, 0.0, 0.0]]))
    check(abs(left - right) < 1e-12, "mirror produces a symmetric field from one child")

    capsule = gp.compile_node(
        {"provider": "tapered_capsule",
         "params": {"a": [0, 0, 0], "b": [1, 0, 0], "radiusA": 0.3, "radiusB": 0.3}}
    )
    plain = gp.compile_node(
        {"provider": "capsule", "params": {"a": [0, 0, 0], "b": [1, 0, 0], "radius": 0.3}}
    )
    sample = np.random.default_rng(7).uniform(-1.5, 1.5, (500, 3))
    check(np.allclose(capsule(sample), plain(sample), atol=1e-9),
          "tapered_capsule with equal radii equals a capsule")

    boolean = gp.compile_node(
        {"provider": "subtract",
         "children": [
             {"provider": "sphere", "params": {"radius": 1.0}},
             {"provider": "sphere", "params": {"radius": 0.5}},
         ]}
    )
    check(float(boolean(np.array([[0.0, 0.0, 0.0]]))[0]) > 0.0,
          "subtract removes the interior of the cutter")

    section("normalisation and canonical frame")
    v0 = manifest["v0"]
    check(manifest["masterTargetId"] == "sphere-master", "the master target defines V0")
    for target_id, entry in targets.items():
        measures = entry["measures"]
        check(measures["volumeError"] <= 0.01,
              f"{target_id}: volume within 1% of V0 ({measures['volumeError']:.2e})")
        check(abs(measures["volumeNormalized"] - v0) / v0 <= 0.01,
              f"{target_id}: normalised volume equals V0")
        centre = [
            (lo + hi) * 0.5
            for lo, hi in zip(measures["bounds"]["min"], measures["bounds"]["max"])
        ]
        check(max(abs(c) for c in centre) < 1e-6,
              f"{target_id}: origin policy centres the canonical bounds")
        check(measures["bounds"]["maxExtent"] < 2.0 * tl.GRID_BOUNDS * 0.92,
              f"{target_id}: bounds fit the canonical envelope")
    ratios = {t: e["measures"]["surfaceAreaVsMasterRatio"] for t, e in targets.items()}
    check(abs(ratios["sphere-master"] - 1.0) < 1e-9, "master area ratio is 1.0")
    check(all(r >= 1.0 for r in ratios.values()),
          "no target has less surface than the sphere at equal volume")

    section("mesh integrity")
    for target_id, entry in targets.items():
        measures = entry["measures"]
        check(measures["watertight"], f"{target_id}: watertight")
        check(measures["looseVertices"] == 0, f"{target_id}: no loose vertices")
        check(measures["degenerateFaces"] == 0, f"{target_id}: no degenerate faces")
        check(measures["nonManifoldEdges"] == 0, f"{target_id}: manifold edges")
        check(measures["positiveVolume"], f"{target_id}: positive signed volume")
        check(measures["finite"], f"{target_id}: finite coordinates")
        check(measures["selfIntersections"]["intersecting_pairs"] == 0,
              f"{target_id}: no self-intersections "
              f"({measures['selfIntersections']['tested_pairs']} pairs tested)")
        check(all(c["genusIsInteger"] for c in measures["euler"]["components"]),
              f"{target_id}: integer genus on every shell")
        declared = definitions[target_id]["validationPolicy"]["expectedComponents"]
        check(
            measures["meshComponents"] == measures["declaredShellCount"] == declared,
            f"{target_id}: {measures['meshComponents']} shells match the declaration",
        )
        check(entry["sdfSign"]["valid"],
              f"{target_id}: SDF sign agrees with the surface "
              f"(out {entry['sdfSign']['outsidePositiveShare']:.4f})")
        check(measures["thickness"]["minBulkModules"] >= 4.0,
              f"{target_id}: thinnest member {measures['thickness']['minBulkModules']:.1f} "
              "modules (minimum 4)")
        check(all(c["measuredVolume"] > 0.0 for c in measures["components"]),
              f"{target_id}: every atomic component has positive volume")

    section("mesh files match the manifest")
    for target_id, entry in targets.items():
        path = STAGE_DIR / entry["meshPath"]
        check(path.exists(), f"{target_id}: mesh file present")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        check(digest == entry["meshSha256"], f"{target_id}: mesh sha256 matches")
        vertices, faces = tl.read_obj(path)
        check(len(vertices) == entry["measures"]["vertexCount"],
              f"{target_id}: vertex count matches")
        check(len(faces) == entry["measures"]["faceCount"],
              f"{target_id}: face count matches")
        check(np.isfinite(vertices).all(), f"{target_id}: exported vertices finite")
        volume = mo.mesh_volume(vertices, faces)
        check(abs(volume - manifest["v0"]) / manifest["v0"] <= 0.01,
              f"{target_id}: re-read mesh volume still within 1% of V0")
        field = STAGE_DIR / entry["vertexAttributes"]["path"]
        check(field.exists(), f"{target_id}: vertex attribute field present")
        check(hashlib.sha256(field.read_bytes()).hexdigest()
              == entry["vertexAttributes"]["sha256"],
              f"{target_id}: vertex attribute sha256 matches")
        check(field.stat().st_size
              == entry["measures"]["vertexCount"] * entry["vertexAttributes"]["stride"],
              f"{target_id}: vertex attribute size matches the mesh")
        neutral = entry["vertexAttributes"]["neutralAreaShare"]
        check(0.55 <= neutral <= 0.70,
              f"{target_id}: neutral share {neutral:.3f} inside 55-70%")

    section("mesh import and mesh-to-SDF round trip")
    sample_id = "content-open-book"
    vertices, faces = tl.read_obj(STAGE_DIR / targets[sample_id]["meshPath"])
    baked = tl.bake_mesh_field(vertices, faces, samples=120_000)
    rng = np.random.default_rng(11)
    surface, face_choice = mo.sample_surface(vertices, faces, 4000, rng)
    # Probe along the mesh's own face normals: the gradient of a point-cloud
    # distance field is noisy below the sample spacing and cannot be used here.
    tri = vertices[faces[face_choice]]
    normals = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-30)
    step = targets[sample_id]["measures"]["gridSpacingWorld"]
    outside = baked(surface + normals * step)
    inside = baked(surface - normals * step)
    print(f"       outside +{float((outside > 0).mean()):.4f} "
          f"inside -{float((inside < 0).mean()):.4f}")
    check(float((outside > 0).mean()) > 0.98,
          "imported mesh field is positive outside the surface")
    check(float((inside < 0).mean()) > 0.98,
          "imported mesh field is negative inside the surface")
    residual = np.abs(baked(surface))
    check(float(residual.mean()) < step * 0.5,
          "imported mesh field is near zero on the surface")

    section("coverage feasibility")
    blob = (EXPORT_DIR / "ps03m2-coverage-samples.bin").read_bytes()
    check(hashlib.sha256(blob).hexdigest() == manifest["coverageSamples"]["sha256"],
          "coverage sample blob sha256 matches")
    for target_id, entry in targets.items():
        coverage = entry["coverage"]
        budgets = definitions[target_id].get("coverageProfiles")
        check(sorted(int(b) for b in coverage["budgets"]) == sorted(budgets),
              f"{target_id}: every requested budget analysed")
        for budget, metrics in coverage["budgets"].items():
            check(metrics["budget"] == int(budget),
                  f"{target_id}@{budget}: sample count equals the request")
            values = [
                metrics["areaPerSample"], metrics["idealSpacing"],
                metrics["requiredScale"]["uniform"],
                metrics["coverageHoles"]["holeAreaShare"],
                metrics["readability"]["mobile"]["plateDiameterPx"],
            ]
            check(all(np.isfinite(values)),
                  f"{target_id}@{budget}: coverage values finite")
            check(sum(c["samples"] for c in metrics["components"]) == int(budget),
                  f"{target_id}@{budget}: samples partition across components")
        index = manifest["coverageSamples"]["index"].get(target_id, {})
        for budget, entry_index in index.items():
            expected = entry_index["count"] * entry_index["stride"]
            check(entry_index["offset"] + expected <= len(blob),
                  f"{target_id}@{budget}: sample slice inside the blob")
            positions = np.frombuffer(
                blob, np.float32, entry_index["count"] * 3, entry_index["offset"]
            )
            check(np.isfinite(positions).all(),
                  f"{target_id}@{budget}: exported sample positions finite")

    section("no target-specific branches in the core pipeline")
    identities = set(definitions)
    for definition in definitions.values():
        identities.update(c["componentId"] for c in definition["components"])
        identities.update(
            z["zoneId"]
            for c in definition["components"]
            for key in ("featureZones", "silhouetteZones", "densityZones", "colorZones")
            for z in c.get(key, [])
        )
    branch = re.compile(
        r"(if|elif|match|case|==|!=)\s*[^\n]*['\"](" +
        "|".join(re.escape(i) for i in sorted(identities)) + r")['\"]"
    )
    for module in CORE_MODULES:
        source = (SCRIPT_DIR / module).read_text("utf8")
        hits = sorted({i for i in identities if f'"{i}"' in source or f"'{i}'" in source})
        check(not hits, f"{module}: no target/component identity literals {hits}")
        check(not branch.search(source), f"{module}: no identity-keyed branches")
    build_source = (SCRIPT_DIR / "build_ps03m2.py").read_text("utf8")
    check("targetRole" in build_source and "master" in build_source,
          "the build selects the master by declared role, not by name")

    section("determinism and provenance")
    check(qa["contentHash"] == manifest["contentHash"], "QA and manifest agree on the content hash")
    check(qa["buildConfigHash"] == manifest["buildConfigHash"], "build configuration hash recorded")
    check(qa["allChecksPassed"], f"machine QA passed ({sorted(qa['failingChecks'])})")
    for target_id, entry in targets.items():
        provenance = entry["provenance"]
        check(bool(provenance.get("source")), f"{target_id}: provenance names a source")
        check(provenance.get("approvalStatus") in
              ("machine-valid", "requires-human-approval"),
              f"{target_id}: approval status declared ({provenance.get('approvalStatus')})")
        check(bool(entry["targetVersion"]), f"{target_id}: target version recorded")

    print(f"\n{CHECKS} checks, {len(FAILURES)} failed")
    if FAILURES:
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("all PS-03.M2 library checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
