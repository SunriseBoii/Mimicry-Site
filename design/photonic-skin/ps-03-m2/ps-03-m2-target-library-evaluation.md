# PS-03.M2 — Declarative target library: evaluation

Date: 2026-08-08. Status: framework complete, 8 targets machine-valid and
reviewed from renders; two targets need human approval of the subject
composition itself.

Blender 4.5, Python 3.12.13, numpy 2.3.5, scipy 1.18.0, scikit-image 0.26.0,
Pillow 12.2.0, Node 24.17.0, Next 16.2.6.

## What this stage proves

A subject form is now **data**. `targets/*.target.json` is the only place a
new object is described; nothing in the pipeline branches on which object it
is. The held-out admission test (Palette + Brushes, authored after the
framework was frozen against Sphere / Book / Gamepad / Queen) needed **zero**
changes to normalisation, validation, sampling, export, render or QA.

## Object map and its source

Taken from `docs/photonic-skin/mimicry_photonic_skin_context_checkpoint_2026-08-04.md`
§4 — the newest map in the repository and the only one that covers all seven
competencies. PS-02.6 (2026-08-03) recommended abstract level-2 echoes and
rejected literal objects; the checkpoint supersedes it for D-R4 onwards and is
the map PS-03.M already followed.

| Target | Competency | Atomic components | Shells |
| --- | --- | --- | ---: |
| `sphere-master` | master | master-core | 1 |
| `content-open-book` | content | book-body | 1 |
| `design-palette-brushes` | design | palette-board, brush-upper, brush-lower | 3 |
| `event-stage-figures` | event | stage-deck, portal-arch, figure-left/centre/right | 1 |
| `games-gamepad-queen` | games | gamepad, queen | 2 |
| `video-camera-clapperboard` | video | camera, clapperboard | 2 |
| `digital-laptop-phone` | digital | laptop-base, laptop-screen, smartphone | 2 |
| `merch-tee-thermos-box` | merch | tee, thermos, open-box | 3 |

Colours resolve from competency id through one table that matches the
production site (`CORE_COMPETENCE_COLORS`, colour grammar v0.2). The older
v0.1 values used inside PS-03.M are recorded in the manifest as
`competencyColorsLegacyPs03m` rather than silently reconciled.

## Contract

`TargetDefinition` v1.0.0 (`scripts/target_schema.py`). Required at target
level: schemaVersion, targetId, targetVersion, competencyId, displayName,
targetRole, components, canonicalCoordinateSystem, canonicalTransform,
geometryRepresentation, normalizationPolicy, validationPolicy, provenance.
Optional: canonicalBounds, coverageProfiles, lodProfiles, notes — anything
measurable from the geometry is optional in the document and cross-checked
against the measurement when declared.

Per component: componentId, semanticRole, canonicalTransform, massWeight,
connectivityRole are required; geometryProvider **xor** importedAsset;
minimumMassWeight, parentComponentId, attachmentBlend, featureZones,
silhouetteZones, densityZones, colorZones, transitionAnchors, lodOverrides
optional.

`connectivityRole` separates two different notions of "component": an atomic
component (a nameable part) and a connected shell. `attached` components merge
into their parent's shell with a declared blend; `separate` components own a
shell. The library holds every combination from 5 atomic parts in 1 shell
(event) to 3 atomic parts in 3 shells (merch).

Zones (feature / silhouette / density / colour) are **regions built from the
same provider registry as the geometry**, so one generic evaluator serves all
four families and every target.

`transitionAnchors` are declarative affordances only — bridge zones, split
necks, protected zones, primary axes, transport zones. No solver reads them at
this stage.

## Geometry providers

22 registered providers, all subject-agnostic.

Primitives: `sphere`, `rounded_box`, `capsule`, `tapered_capsule`, `ellipsoid`,
`torus`, `slab`, `plane_slab`, `rounded_plate`, `revolved_profile` (with
periodic angular scallops). Booleans: `union`, `smooth_union`, `subtract`,
`smooth_subtract`, `intersect`, `smooth_intersect`. Field ops: `offset`,
`displace_gaussian_band`. Domain ops: `mirror`, `repeat_polar`,
`repeat_linear`. Assets: `mesh_asset` (watertight OBJ import baked to a signed
field by k-nearest weighted pseudonormal vote; round-trip verified at 100%
correct sign on both sides of the surface).

Exact distance fields: sphere, rounded_box, capsule, tapered_capsule, torus,
slab, plane_slab and all booleans. Bounded (correct sign and zero level set,
conservative magnitude): ellipsoid, rounded_plate, revolved_profile.

## Canonical system

Right-handed, up `+Z`, forward `+X`, right `-Y`, units where the V₀ sphere has
radius 1. Origin policy: after volume normalisation each target is translated
so its canonical bounds are centred (verified to 1e-6). Cameras are the
PS-03.M set: canonical 35°/20°, opposite 215°/20°, side 90°/8°, top 0°/88°.

Normalisation: one uniform scale per composite, `s = (V₀ / V_raw)^(1/3)`,
applied to the polygonised mesh so the normalised volume is V₀ by
construction. V₀ = 4.185075 (the master sphere at grid 208³ over ±4.0), 0.01%
from the PS-03.M value of 4.185475.

## Measured library

Module = one master-scale plate diameter = 0.0395 world units. The context
checkpoint fixes 4 modules as the construction minimum and 7 as comfortable.

| Target | Shells | Area / master | Thinnest member | Neutral | Aspect | Min budget | Deficit @8192 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| sphere-master | 1 | 1.00 | 48.9 mod | 0.599 | 1.00 | 4096 | 0 |
| content-open-book | 1 | 1.94 | 11.8 mod | 0.568 | 2.48 | 8192 | 3 808 |
| design-palette-brushes | 3 | 2.08 | 9.8 mod | 0.640 | 1.84 | 8192 | 4 685 |
| games-gamepad-queen | 2 | 1.87 | 18.1 mod | 0.556 | 2.44 | 8192 | 3 413 |
| video-camera-clapperboard | 2 | 1.92 | 8.2 mod | 0.575 | 4.10 | 8192 | 3 703 |
| event-stage-figures | 1 | 2.40 | 8.0 mod | 0.576 | 1.52 | 8192 | 6 681 |
| merch-tee-thermos-box | 3 | 2.53 | 7.7 mod | 0.688 | 3.37 | 8192 | 7 476 |
| digital-laptop-phone | 2 | 2.61 | 6.6 mod | 0.582 | 2.18 | 8192 | 7 984 |

Every target: volume error ≤ 1.5e-15, watertight, 0 loose vertices, 0
degenerate faces, 0 non-manifold edges, 0 self-intersections, integer genus,
positive per-component volume, SDF sign valid.

## The skin deficit is the headline finding

At equal volume no target can have less surface than a sphere, and the
compositions have 1.9–2.6× the sphere's surface. Consequences at N = 8192 and
the declared plate range 0.85–1.15:

* the sphere reaches the 80% coverage target exactly at scale 1.0;
* every competency target needs scale 1.37–1.60, is clamped to 1.15, and lands
  at 41–56% coverage instead of 80%;
* closing the gap needs 3 400–8 000 extra plates, i.e. roughly 12 000–16 000
  for the heaviest compositions.

Below 8192 the plate size is already clamped, so lowering the budget only
lowers coverage: the plate stays 2–6 px on a 390 px viewport at every budget
while the surface empties out. That is why the minimum practical budget is
8192 for seven of eight targets — it is the hole criterion that fails first,
not plate legibility.

## Coverage per budget (achieved coverage / mobile plate px)

| Target | 8192 | 4096 | 2048 | 1024 | 512 |
| --- | --- | --- | --- | --- | --- |
| sphere-master | 0.80 / 6 | 0.53 / 6 | 0.26 / 6 | 0.13 / 6 | 0.07 / 6 |
| content-open-book | 0.55 / 4 | 0.27 / 4 | 0.14 / 4 | 0.07 / 4 | 0.03 / 4 |
| design-palette-brushes | 0.51 / 3 | 0.25 / 3 | 0.13 / 3 | 0.06 / 3 | 0.03 / 3 |
| games-gamepad-queen | 0.56 / 3 | 0.28 / 3 | 0.14 / 3 | 0.07 / 3 | 0.04 / 3 |
| video-camera-clapperboard | 0.55 / 2 | 0.28 / 2 | 0.14 / 2 | 0.07 / 2 | 0.03 / 2 |
| event-stage-figures | 0.44 / 4 | 0.22 / 4 | 0.11 / 4 | 0.06 / 4 | 0.03 / 4 |
| merch-tee-thermos-box | 0.42 / 2 | 0.21 / 2 | 0.10 / 2 | 0.05 / 2 | 0.03 / 2 |
| digital-laptop-phone | 0.41 / 3 | 0.20 / 3 | 0.10 / 3 | 0.05 / 3 | 0.03 / 3 |

Mobile LOD candidates (plate under 3 px at 390 px viewport):
`merch-tee-thermos-box` and `video-camera-clapperboard`; both are wide
multi-object compositions whose mobile variant should drop to a single primary
object rather than shrink the plate further.

## Approval state

* **machine-valid and reviewed from renders:** all eight.
* **machine-valid, subject composition already fixed by an earlier stage:**
  sphere, book, gamepad + queen (verbatim migration of PS-03.M geometry).
* **machine-valid, composition derived from the documented object map:**
  palette + brushes, laptop + smartphone, camera + clapperboard.
* **requires human approval of the subject composition:**
  `event-stage-figures` (the source names "сцена/портал" as one slot; it is
  built as a stage deck carrying a portal arch, with mannequins reduced to
  torso plus head) and `merch-tee-thermos-box` (the t-shirt is a folded
  garment volume, the box has no flaps). Both compositions are candidates in
  the source document, not approved forms.

Nothing here is declared artistically approved on the user's behalf.

## Determinism and provenance

Two consecutive full builds produced identical SHA-256 for the manifest, the
coverage sample blob and all eight OBJ files. Content hash `4a345c4e…`, build
configuration hash `01eed79e…`. Every target records its definition hash,
mesh hash, vertex-attribute hash, target version and provenance source.

## Known limitations

1. **Skin deficit** — quantified above, not solved. It is a budget decision for
   PS-03.M3, not a geometry defect.
2. **Aspect ratio of multi-object compositions** — `video-camera-clapperboard`
   at 4.10 and `merch-tee-thermos-box` at 3.37 are wide; the canonical camera
   makes each object small. Compositions of three separate objects are
   inherently elongated at fixed volume.
3. **Bounded fields** — ellipsoid, rounded_plate and revolved_profile are not
   true Euclidean distances. Iso-surface projection converges more slowly on
   the queen's coronet (residual up to 5e-2 world) which is visible only as
   slightly noisier sampling there.
4. **No mesh assets in use** — the `mesh_asset` provider is implemented and
   round-trip tested, but every target is currently procedural.
5. **Coplanar self-intersection tests** run a 2D separating-axis pass; a
   coplanar pair that overlaps exactly at a shared edge is reported as
   non-overlapping. No such pairs were found.
6. **Silhouette readability at 96 px** was reviewed by the model from real
   renders, not by a blind human test.

## Artifacts

```text
targets/*.target.json                   8 human-readable definitions
scripts/target_schema.py                contract + validator
scripts/geometry_providers.py           provider registry
scripts/target_library.py               compile / assemble / normalise / measure
scripts/measure_ops.py                  topology, self-intersection, thickness
scripts/coverage_analysis.py            anonymous coverage feasibility
scripts/build_ps03m2.py                 deterministic build
scripts/render_ps03m2.py                Blender control renders
scripts/compose_boards.py               review boards
scripts/test_ps03m2.py                  470-check offline suite
exports/ps03m2-library-manifest.json    measures, validation, coverage, hashes
exports/ps03m2-qa-report.json           machine QA
exports/meshes/*.obj                    8 normalised watertight meshes
exports/fields/*-vertex-attrs.bin       per-vertex component/zone/colour
exports/ps03m2-coverage-samples.bin     8192 and 1024 previews per target
renders/                                per-target views, silhouettes, debug,
                                        coverage previews and six boards
```

## Verdict

The library is sufficient to start PS-03.M3. It supplies watertight,
volume-normalised, versioned targets with declared components, mass weights,
zones and transition affordances for all seven competencies plus the master —
which is exactly the input a universal state builder needs. The one input it
does **not** yet settle is the skin budget, and PS-03.M3 must decide that
before assigning a permanent identity space.
