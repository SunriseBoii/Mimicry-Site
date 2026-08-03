# PS-03.4R / D-R3 — Final Associative Form Lock (recovery revision)

Status: **internal visual gate PASSED, all technical validation PASSED — awaiting the single final user confirmation.**
Date: 2026-08-03. Blender 4.5.3 LTS, Three.js r185, Python 3.11 (Blender) / 3.12 (standalone).

D-R2 remains untouched as the recovery baseline. This revision changed only the
coordinates of the seven `SINGLE` targets; everything else is bit-identical to
PS-03.3 / D-R2.

## 1. Root cause of the D-R2 failure (hypothesis confirmed)

Code audit of `ps-03-4/scripts/build_ps03_4.py` confirmed the user hypothesis:

* every `SINGLE` started from the same `superellipsoid_point` donor body;
* `stabilize_shared_extrema` plus the uniform >= 0.88 per-axis fill floor pulled
  all outer proportions back to one envelope-filling oblong mass;
* semantics were then added mostly as local ridges/folds/relief;
* at 96 px the local plasticity disappears, leaving seven variations of one
  soft blob silhouette.

## 2. What replaced it

D-R3 retired the shared donor body entirely. Each `SINGLE` is now an
independent **macro-first lofted surface** (`scripts/dr3_geometry.py`): a
target-specific 2D plan, cross-section law and height field evaluated over the
frozen (s, phi) ring topology, so the result is a coordinate-only deformation
field on the approved 8 322-vertex mesh. The uniform fill normalization was
replaced by the canonical envelope as a **maximum** (relaxed per-axis floor
0.22) plus a projected silhouette-presence check (>= 0.30 of MASTER hull).

Authored candidate states: **29** (7 x 3 base macro-candidates + EVENT R1-R3,
GAMES R1-R3, DIGITAL R1-R2), across **5 refinement cycles** driven by rendered
images (canonical / opposite / side / top / 180 px / 96 px per candidate, all
real Blender renders reviewed via vision at every cycle).

## 3. Selected forms and what reads without labels

| Competence | Target | Candidate | Reads as | Eliminated wrong association |
|---|---|---|---|---|
| Content | SINGLE_CONTENT_SEQUENCE | B | open editorial folio: two page fields, unequal opening angles, central hinge valley | capsule / pillow |
| Design | SINGLE_DESIGN_TORSION | B | low forming palette: slab with asymmetric closed side bite and lifted corner | bowl / spoon / leaf |
| Event | SINGLE_EVENT_CONVERGENCE | R3 | sheltering canopy: wide low roof planes to one offset apex over eave flares | sail / dune / leaf / wing |
| Games | SINGLE_GAMES_BRANCH | R3 | decision field: entry stem into a flat fan board, leading edge carved into three route fingers | leaf / generic oblong |
| Video | SINGLE_VIDEO_TEMPORAL | C | tilted curved screen plate with temporal sweep edge | capsule / soap bar / car |
| Digital | SINGLE_DIGITAL_SIGNAL | R2 | routing substrate: blunt input, deep macro Y-fork with convergence notch | fish / beak / wing |
| Merch | SINGLE_MERCH_WRAP | C | wrapped parcel: blocky core, four unequal corners, one diagonal wrap overlap | stone / capsule / case |

`CONTENT / DIGITAL / GAMES` use three different macro-grammars: hinged
two-field folio vs forked substrate vs notched fan board. The closest residual
96 px pair is GAMES/DIGITAL (both flat); they separate through fan-vs-fork plan
and were explicitly re-checked after the GAMES R3 pass.

## 4. Internal visual gate (not blind)

Thresholds: total >= 90/100, readability >= 22/25, DNA >= 18/20, mobile >= 8/10,
safety >= 4/5. All seven targets pass:

```text
CONTENT 91   DESIGN 90   EVENT 90   GAMES 90   VIDEO 91   DIGITAL 90   MERCH 91
```

Scores were re-graded from actual renders on every refinement pass (EVENT,
GAMES and DIGITAL each crossed 90 only after their final refinement produced a
visible improvement — see `exports/ps03-4-d-r3-association-evaluation.json`).
The author knows the target mapping, so this cannot count as a blind test; the
unlabelled board with randomized order + separate answer key exist for the
user's independent first-impression pass, which remains mandatory.

## 5. Technical validation (all real runs, all passed)

* Endpoints: 13/13 pass (finite, volume, normals, collapse, BVH
  self-intersections, envelope, mask 32-36%, silhouette presence).
* Direct pairwise: **66/66 pass**, 11 samples each; **19 expanded risk pairs**
  at 45 samples each.
* Retarget chains: **4/4 pass**. Additive: **72/72 pass**.
* One transition failure was found and fixed honestly: EVENT/GAMES endpoints
  originally sat at face-area ratio 0.204-0.207, and 90/10 blends toward VIDEO
  or TRANSITION_TENSION at 1.0 pushed local faces below the 0.20 collapse
  floor. The endpoints were re-margined (EVENT rim/eave, GAMES top/lobes) —
  not blobified — and the full suite re-ran green.
* Blender GLB reimport: pass. Three.js r185 runtime: pass (12 targets, 66
  pairs, 72 additive states, 8 692 runtime vertices).

## 6. Invariants (verified in `exports/ps03-4-d-r3-technical-validation.json`)

```text
vertices 8 322 / faces 8 480 / edges 16 800 / triangles 16 640 / 1 component
mask faces 2 526, terminal physical area 0.3224-0.3543 (target 32-36%)
connectivity 8883e769... / UV c5eff463... / mask 67c2dd58... / MASTER 54af439e...
shape-key order: exact 13-key PS-03.3 order preserved
```

`MASTER`, `BRAND_WIDE`, `COMPLEX_FOCUS/GATHER/DRIVE`, `TRANSITION_TENSION` are
coordinate-identical to PS-03.3 (position hashes match). GLB: one actor mesh,
one indexed primitive, 12 relative morph targets, UV + custom attributes,
neutral placeholder PBR, no cameras/lights/animations, **3 112 068 bytes**.

## 7. Immutability proof

`exports/ps03-4-d-r3-checksums.json`: SHA-256 of all 228 protected files
(PS-03.3 full tree + PS-03.4 D-R2 artifacts) captured before authoring and
after completion — **all unchanged** (`"unchanged": true`).

## 8. Key artifacts

```text
d-r3/blender/ps-03-4-d-r3-authoring-workbench.blend
d-r3/blender/photonic-skin-c-r1-d-r3-final-morph-system.blend
d-r3/exports/photonic-skin-c-r1-d-r3-final-morph-system.glb
d-r3/exports/ps03-4-d-r3-{target-manifest,association-evaluation,technical-validation,
  pairwise-validation,retarget-validation,additive-validation,
  glb-reimport-validation,three-runtime-validation,checksums}.json
d-r3/renders/ps03-4_d-r3_{unlabelled_lock,answer_key,association_views,system,
  mobile_390,photonic_mask,transition}_board.png
d-r3/renders/candidates/            (29 candidate states x 6 views + sheets)
d-r3/scripts/                       (fully reproducible pipeline)
```

## 9. Residual risks

* GAMES and DIGITAL are both flat states; at 96 px they are the closest pair
  and rely on fan-vs-fork plan reading.
* MERCH X-fill is 0.57 — intentionally compact, but it is the strongest
  aspect-ratio outlier during morphs from wide states.
* GAMES minimum normal dot is ~0.06 at the leading pole fan (no inversion,
  but the smallest margin in the system).
* The internal gate is author-run; only the user's unlabelled first-impression
  pass can confirm object readability.

## 10. What the user should do

1. Open `renders/ps03-4_d-r3_unlabelled_lock_board.png` **first**; write down
   a first impression for 01-07 (object field, not competence name).
2. Compare with `renders/ps03-4_d-r3_answer_key_board.png`.
3. Spot-check `association_views`, `mobile_390`, `photonic_mask` and
   `transition` boards.
4. Only an explicit user confirmation closes PS-03.
