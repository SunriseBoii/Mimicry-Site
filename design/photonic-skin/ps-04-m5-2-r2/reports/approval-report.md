# PS‑04.M5.2.R2 — Machine approval report

**Status: HUMAN PASS / SELECTED M5 EVENT CANDIDATE**

`EVENT_A_R2` is the selected M5 Event candidate. It is not canonical, not production-approved, and not propagated into the 83 Event-containing states. Canonical promotion is deferred to PS‑04.M5.5. M5.3 is not started on this checkpoint.

## 1. Verdict

Browser final-material captures of settled canonical A‑R2 show a solid pawn-like viewer-right figure of octahedral flakes, not a sparse point cloud. Original A still shows the point cloud on the right. A‑R1 still shows the wrong (viewer-left) edit. Machine silhouette, coverage, selective-edit, runtime, and paced-transition gates pass. Rapid residual `PS04-M5-R001` remains deferred.

## 2. Actual branch, HEAD, git status

- Branch: `ps04-m5-sandbox`
- HEAD: `948686a50960f5847517d95611f0c549c84a45f8`
- Message: `feat(photonic-skin): refine Event A right figure and sandbox switching`
- R2 files are uncommitted on top of that HEAD. No reset, revert, rebase, or amend.

## 3. How committed R1 is treated

R1 remains in history as a rejected screen-space mapping experiment. Sandbox usability from R1 is kept (requested vs displayed, latest-selection-wins, atomic publish, no reload, pushState/popstate, Back/Forward, HUD hash, aria-pressed). A‑R1 stays selectable as archived evidence.

## 4. History not rewritten

`git-snapshot.json`: reset/revert/rebase/amend = false. R1 commit preserved.

## 5. EVENT_A / A‑R1 hashes

| Artifact | Hash |
| --- | --- |
| BASELINE / frozen Event | `b14a3b2f8571e3e7d39be074aecbdeb6dd4ca51097c6433db25b622c3394a933` |
| EVENT_A | `76c46452781c4334b4d91cca9ed6533bb9ccd7224c57bdf7abf7e1093d1c938d` |
| EVENT_A_R1 | `89f50d4c83b15de21b753f98d6ab368e974c20a91ed135668bbaf05445b898cc` |
| EVENT_A_R2 (two identical Python runs) | `5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b` |

Original A and A‑R1 files were not overwritten.

## 6. Screen-space mapping

Rule: viewer-right = largest canonical screen-space X. Semantic names are not truth.

| Viewer role | Semantic | Component | eventPart | Active | Canonical screen X |
| --- | --- | --- | --- | --- | --- |
| viewer-left | figure-right | 4 | 3 | 890 | 153.26 |
| viewer-centre | figure-centre | 3 | 1 | 1205 | 259.48 |
| viewer-right | figure-left | 2 | 2 | 1014 | 367.46 |

Matches the owner hypothesis. Code names: `VIEWER_RIGHT_COMPONENT`, `VIEWER_RIGHT_EVENT_PART`, `SEMANTIC_FIGURE_LEFT_COMPONENT`.

## 7. Figure wrongly changed in R1

Component 4 / eventPart 3 / semantic `figure-right` / active 890 — viewer-left after +180°.

## 8. Figure changed in R2

Component 2 / eventPart 2 / semantic `figure-left` / active 1014 — viewer-right.

## 9. Root cause: points instead of flakes

Frozen `single-event` `componentMap` leaves component 2 with empty `visibleProfiles`. GPU packing omits the +256 visibility bit, settled activation is 0, instance radius collapses to `minimumGeometricScale = 0.18`. Scale/density fields were already normal; nearest-neighbour gaps matched the other figures. R1 silhouette of a force-visible cloud could not see the 0.18 GPU scale.

Fix: A‑R2 overlay unhides component 2 on all profiles, and those 1014 IDs are resampled as a compact pawn. No global particle-size, camera, exposure, DPR, or shader change.

## 10. Source chain A → A‑R2

```
frozen BASELINE
→ EVENT_A rigid +180° Z
→ selective VIEWER-RIGHT figure refinement
→ EVENT_A_R2
```

`EVENT_A_R2 geometry source = byte-exact original EVENT_A`  
`EVENT_A_R2 geometry source ≠ EVENT_A_R1`

## 11. Changed fields

Only `position`, `normal`, `orientation` on 1316 viewer-right records (1014 active + inactive interior). Scale, density, status, component, shell, flags, reserveDepth, transitionGroup, lodPriority unchanged.

## 12. Selective-edit proof

See `reports/selective-edit-proof.json`. Target record count 1316. `pass: true`.

## 13. Non-target byte identity

`nonTargetByteDifference = 0`. Stage, arch, viewer-centre, viewer-left bytes match original EVENT_A.

## 14. Viewer-left restoration proof

Component 4 is byte-identical to original EVENT_A and differs from A‑R1. Wrong R1 geometry is not inherited.

## 15. IDs / status / component / LOD

N=16384, active=14873, reserve=756, subsurface=755. Viewer-right LOD: 512:50, 1024:84, 2048:181, 4096:371, 8192:651, 12288:915, 16384:1014. Persistent ID order and lodPriority identity preserved.

## 16. A vs A‑R1 vs A‑R2

- A: viewer-right is a packed 0.18 point cloud.
- A‑R1: viewer-left pawn edit; viewer-right still a point cloud.
- A‑R2: viewer-left restored; viewer-right compact flake pawn.

## 17. Canonical / alternate Light / Dark review

Browser boards: canonical final light/dark, alternate final light/dark, component diagnostic. Human-review default remains settled + final + canonical. Alternate confirms which figure was edited.

## 18. Final-material scale / coverage

Packed original A footprint ratio vs viewer-left = 0.18. A‑R2 overlay-visible footprint ratio = 1.0. Silhouette 180/96 connected, internal row gap 0. Browser framebuffer 98913 visible pixels; context restore 98913. Isolated viewer-right browser capture shows a solid flake body; other parts stay packed-hidden.

## 19. Transition regression

Paced Design→Event A‑R2→Games: 455 frames, paletteLeads=0, center=0. Reverse: 466 frames, paletteLeads=0. Idle, reduced motion, live A↔A‑R2 / A‑R1↔A‑R2 with 0 document reloads. Back/Forward restore displayed hash. Footer node 08: 0 draws / 0 triangles.

## 20. Rapid residual

`PS04-M5-R001` reproduced: 59/75 palette-lead frames, center=0, no third geometry ID. Not fixed. Assertions not weakened.

## 21. Runtime invariants

1 Canvas, 1 actor, 1 RawShaderMaterial, 1 program settled, 1 draw, 16384 instances, 131072 triangles. Footer: 0 actor / 0 draw.

## 22. Tests / typecheck / lint / build

- Node: M5.2 + R1 + R2 = 34 pass / 0 fail
- `tsc --noEmit` pass
- ESLint sandbox + tests: 0 errors (3 pre-existing unused-var warnings in EventSandboxLab)
- Python R2: 3 OK
- Frozen `test_ps03m41.py`: `KeyError: transitionRecordLayout` (pre-existing, not fixed)
- Authoring two-run identity: identical hash
- Production `next build --webpack`: recorded in this stage

## 23. Performance / cache plateau

20× A‑R2→A→A‑R1→BASELINE→B→C→A‑R2: programs 1→1, renderer textures 17→17, GPU textures 48→48, cacheEntries 2→2.

## 24. Evidence paths

`design/photonic-skin/ps-04-m5-2-r2/` scripts, variants/a-r2, reports, renders/boards, silhouettes, diagnostics, browser/video. Runtime: `public/photonic-skin/ps-04-m5-2/variants/a-r2/` (a/ and a-r1/ not overwritten).

## 25. Review URLs

- Lab: `/visual-lab/photonic-skin-ps04-m5/event-sandbox`
- Preview: `/visual-lab/photonic-skin-ps04-m5/event-sandbox/preview`
- Production `/` remains SiteShell

Default query: `variant=a-r2&view=canonical&theme=light&labels=0&mode=settled`

## 26. Known limitations

- Isolated 180 px silhouette still a compact capsule; head bulge is weak at that size (same class as R1).
- Rapid retarget residual `PS04-M5-R001` remains.
- Frozen M4.1 python KeyError remains.
- A‑R2 overlay unhide is sandbox-local; frozen aggregate `componentMap` is untouched.

## 27. Human checklist

1. Canonical settled final light: is viewer-right a flake pawn, not dots?
2. Alternate view: is the figure inside the opening on the right the one that changed?
3. Compare A vs A‑R1 vs A‑R2: left restored, right refined, centre largest.
4. Isolated viewer-right full / 180 / 96: readable head and torso, no stem/microphone, no arms.
5. Do not treat MACHINE PASS as canonical selection.

## 28. Frozen confirmation

Canonical Event, 154-state aggregate, 83 Event-containing states, M5.1 choreography, production `/`, Video, magnetism, cameras, BASELINE/A/B/C buffers, M3.1R/M4.1 remain unchanged. M5.3 not started.

## 29. Checkpoint / no push / no deploy

R2 is the M5.2.R2 checkpoint after owner HUMAN PASS. No push. No deploy. `EVENT_A_R2` is not canonical. Promotion is deferred to M5.5.
