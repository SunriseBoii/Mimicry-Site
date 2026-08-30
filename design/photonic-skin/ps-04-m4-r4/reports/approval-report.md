# PS-04.M4.R4 — Settled Palette Integrity, Transition Morphology & Warm Runtime

**Status: MACHINE PASS / HUMAN REVIEW REQUIRED**

Aesthetics are not auto-approved. PS-04.M5 was not started. No commit, push, or deploy. Production `/` is unchanged. Frozen PS-03 / M1 / M2 / M3 hashes match.

R3 evidence at `design/photonic-skin/ps-04-m4-r3/` was not regenerated.

## 1. Git baseline

- Branch: `master`
- HEAD at start of R4: `c4e76007f553ab79b734a65007bd40ff17d4c7f7`
- Message: `feat(photonic-skin): sync M4.R3 transitions onto one transaction clock`
- Working tree at start: clean (R3 already committed). This pass did not reset the tree and did not delete owner untracked files.
- Preserved: `design/photonic-skin/ps-04-m4/`, `ps-04-m4-r1/`, `ps-04-m4-r2/`, `ps-04-m4-r3/`, topology checkpoint in `docs/`, previous lab routes and tests.

## 2. R3 bug reproduction (before the R4 binding fix)

Copied, not regenerated, into `design/photonic-skin/ps-04-m4-r4/renders/browser/r3-reproduction/`.

R3 settled Design (`design-settled.png`): HUD already showed `05.2`, `mask 2`, `own 0`, `settle`, `g/p/s = 1`. The object was a neutral body with leftover multi-competence edge colors (all-seven field). That is the human-rejected rollback.

Focused test `R3 reproduction: ownership off with uncommitted driver progress shows all-seven source LUT` reconstructs the shader mix:

```
field = mix(m2SourceLut, targetField(uPaletteMask), ownership ? vPaletteOwnership : uPaletteProgress)
```

With `ownership = 0`, `uPaletteProgress = 0`, and `m2SourceLut` still the captured all-seven LUT, the framebuffer is all-seven even when the HUD mask is 1/2/4/….

## 3. Exact cause of palette rollback — CONFIRMED

Not an aesthetic issue. Not a mapping error. The screen contract and HUD mask were correct; the non-transition shader branch mixed the stale all-seven **source LUT** at progress 0 after ownership turned off.

`settleIfComplete()` / session tick wrote the M3 geometry-linked curve into the driver. R3 intercepted that writer, but:

1. The intercept was not idempotent under React Strict Mode, so a remount wrapped a no-op and left **driver progress at 0**.
2. Scene `useFrame` read the **driver** snapshot, not the coordinator.
3. `M41Content` remounted on `programId`, creating a new `RawShaderMaterial` from a mid-transition driver snapshot (progress 0, all-seven source LUT).
4. After settle, `ownership = 0` is correct and expected. The bug was binding the wrong LUT/progress once ownership was off.

## 4. Competing palette writers found — CONFIRMED

| Writer | Role after R4 |
| --- | --- |
| `PhotonicMotionSession.tick` → `setGeometryLinkedProgress` | Intercepted; native stored on `Symbol.for("ps04m4.nativeSetGeometryLinkedProgress")` |
| Lab clock → `applyLinkedPalette(tx.paletteProgress)` | Transient blend only while `status === "running"` |
| `commitTargetAsSettled()` then `commitDriverToMask` | Atomic commit of target mask/LUT **before** ownership cleanup |
| Scene `useFrame` | Single uniform commit from `paletteSnapshotRef` (authority snapshot) |
| `requestActor` `setMask(..., geometry-linked)` | Starts driver target; not an immediate `setMask` in Lab |
| M2 controller default / mask 127 | Not applied after SINGLE settle |

One computed material snapshot per frame; one uniform commit.

## 5. Settled / transition architecture

Before: HUD mask vs shader LUT were independent. After settle, shader used driver source LUT at progress 0.

After:

```
ScreenActorContract
  → ActorTransitionCoordinator.begin (one revision)
  → transient from/to LUT blend + ownership
  → commitTargetAsSettled() writes target geometry, mask, LUT hashes into settled/base
  → shader non-transition branch uses committed target LUT at progress 1
  → ownership/crossfade off
  → activeTransition = null
```

Types live in `palette-authority.ts` (`SettledActorState`, `ActiveActorTransition`, `PaletteMaterialSnapshot`).

## 6. Atomic settle order

`commitTargetAsSettled()`:

1. Ignore stale `settle(revision)`.
2. `geometryProgress = paletteProgress = siteProgress = 1`.
3. `settledLut = targetLut`; hashes: settled = shaderBase = source = target.
4. `sourcePaletteMask/sourceGeometryId` become the target.
5. `paletteCommitted = true`, `programReady = true`, `status = "settled"`.
6. Then ownership = 0, continuity = 0.
7. Lab clock then `commitDriverToMask(session.palette, targetMask)` once per revision.

Invariants after settle: `settledMask === targetMask`, `settledLutHash === targetLutHash`, `shaderBaseLutHash === targetLutHash`, `activeTransition === null`, `ownershipEnabled === false`, `shaderProgress === 1`. Ownership is not kept at 1.

## 7. SINGLE palette persistence

Live route (`live-route-palette.json`): all seven 05.1–05.7 Light and Dark probes pass.

- Semantic mask, settled mask, shader mask, uniform mask match 1/2/4/8/16/32/64.
- Uniform progress = 1, ownership = 0 after settle.
- Persistence 0.25s / 2s / 5s on Design: LUT hash unchanged.
- Resize and context restore: LUT hash unchanged (`5bc23705` on Merch).
- Theme switch does not change semantic mask.
- Material UUID stable: `7a2063c5-362f-459a-9b44-348f1754a59b`.
- WebGL programs = 1.
- Visual stills: Content blue, Design purple, Event orange, Games green, Video pink, Digital teal, Merch gold. Neutral substrate remains. Not all-seven. Not a plastic fill.

Framebuffer RGB-hex occupancy is **not** a reliable gate (lighting shifts sRGB away from the token hex). Logical evaluator unselected weight is 0 (focused tests). Visual stills are the live framebuffer review.

## 8. A/B radius lift

`ab-continuity-lift.json`:

- Lift **off** (default): `offForbidden = 0`, max circularity 0.2836, zero-mask frames 0.
- Lift **on** (`?continuityLift=1`): `onForbidden = 0`, max circularity 0.2713.
- Board `15-ab-continuity-lift.png`: mid-frames stay organic (book/stylus/column), not disks.

12-frame Playwright cadence did **not** recreate the user-video sphere even with lift on. That cadence is not natural rAF. The lift GLSL remains query-gated for reproduction only.

## 9. MASTER-like sphere — CONFIRMED architecture, default disabled

R3 overlay: `continuity-overlay.ts` radius lift after `presented`, floor 0.38, expands inactive particles from the actor-local center without requesting `master-neutral`. That **can** make a spherical blob.

Default: `DEFAULT_CONTINUITY_LIFT_ENABLED = false`. Lab writes `uContinuityEnabled = 0` unless `?continuityLift=1`.

Wait-settled Content→Design contact sheets (lift off) show Design morphology at g≈0.65, not a sphere.

A skip-ahead user-sequence that fires the next node before MASTER→Content has committed still **displays MASTER**, because interrupt source is the displayed actor. That is latest-request-wins, not a third frozen ID. See limitations.

## 10. Continuity decision

Radius lift is **removed from the default path**. No new radial shell, no minimum radius, no center shift, no particle push from a shared origin, no sped-up transition to hide the defect. Frozen programs were not rewritten. Identity/t=0/t=1 bypasses in the GLSL remain. No replacement overlay was added because wait-settled silhouettes already hold with lift off.

## 11. Silhouette / MASTER-similarity

`master-similarity.ts` thresholds (synthetic disk): IoU 0.62, circularity 0.5, bboxFill 0.68, aspect 0.82–1.22. A filled disk is `masterLike`; an L-shaped bunny is not.

Machine gate: forbidden if mid non-MASTER frame is master-like and not an endpoint. A/B samples: 0 forbidden. Adjacent SINGLE traces request only the two frozen IDs (`capture-stills.json`).

## 12. One-frame disappearance

R3 `area >= 30%` on three pairs was insufficient. R4 compile gap holds source (`g=0`, `p=0`) until `programReady` and the session is actually playing. Scene `uProgress` follows the session: settled old program stays at t=1 until `commitTransition` binds the new program at t=0.

A/B zero-mask frames after first valid readback: 0 (lift off and on). Capture silhouette empty-actor count: 0 on the stills pass.

Hypothesis (not confirmed as a remaining functional fail): skip-ahead before the first program is ready can look like a “pause then jump” rather than a hole.

## 13. What compiled on demand

CONFIRMED: frozen pair compiler `compileFrozenPair` / `compileTransition` on the user path, plus `compileLiveRetarget` for interrupt snapshots. Not a new GLSL program per screen after the material-key fix. `RawShaderMaterial` is created once (`useMemo []`). Program ID changes swap compiled **textures/uniforms** on the same material (`compileCountRef` tracks binds, not new WebGL programs). `renderer.info.programs` stayed 1.

## 14. Prewarm / cache

`TransitionProgramCache` keys `source|target|reduced|viewport`. After first paint, idle `requestIdleCallback` (timeout fallback) prewarms current + neighbor topology pairs, then the rest. Hidden / offscreen / **running transaction** pause the idle queue. User path `getFrozen` hits the cache for ordinary adjacent frozen pairs. Live interrupt still compiles a runtime snapshot (reported separately). Compile gap does not start visual geometry/palette/site progress until `markProgramReady`.

## 15. Cold / warm performance

Natural rAF (`performance-qa.json`), not Playwright screenshot cadence.

| Scenario | rAF p50 | rAF p95 | long tasks ≥50ms |
| --- | ---: | ---: | ---: |
| Idle MASTER | 6.1 | 6.2 | 2 (startup) |
| Cold Content→Design (reload) | 6.1 | 72.8 | 5 |
| Warm Content→Design (8s prewarm) | 18.2 | 24.2 | **0** |
| Ordinary Content→Design later | 18.0 | 18.2 | **0** |
| Rapid-20 interrupt | — | 4969.8 | 42 |

Warmed ordinary adjacent: no long task ≥50 ms, 1 canvas, 1 program, 1 draw, 131072 triangles, 1 material UUID. Cold compile cost is not hidden.

Rapid-20 remains the frozen **live-retarget** compiler on interrupt snapshots. That is not ordinary warmed navigation. Latest-request-wins still holds (focused tests).

`EXT_disjoint_timer_query_webgl2` is **available**. `gpuMs` was not filled around the actor draw (same limitation as R3).

## 16. Browser warnings

- `THREE.Clock` deprecated: R3F / frozen M3 session. **Not** the palette/geometry cause. Clock→Timer was not migrated.
- `WebGLProgram: optimization did not converge`: appears at shader compile on some page loads, **not** on every screen change. One WebGL program, stable material UUID.
- `GET /preview 404`: short URL. Correct routes: `/visual-lab/photonic-skin-ps04-m4` and `/visual-lab/photonic-skin-ps04-m4/preview`.

## 17. Changed files

Lab / runtime:

- `app/visual-lab/photonic-skin-ps04-m4/PS04M4Lab.tsx`
- `app/visual-lab/photonic-skin-ps04-m4/PS04M4Scene.tsx`
- `app/visual-lab/photonic-skin-ps04-m4/transition-coordinator.ts`
- `app/visual-lab/photonic-skin-ps04-m4/continuity-overlay.ts`
- `app/visual-lab/photonic-skin-ps04-m4/palette-authority.ts` (new)
- `app/visual-lab/photonic-skin-ps04-m4/transition-prewarm.ts` (new)
- `app/visual-lab/photonic-skin-ps04-m4/master-similarity.ts` (new)

Tests:

- `tests/photonic-ps04-m4-r4.test.ts` (new)
- `tests/photonic-ps04-m4.test.ts` (sessionId assertion)
- `tests/photonic-ps04-m4-r3.test.ts` (sessionId assertion)

Checkpoint: `design/photonic-skin/ps-04-m4-r4/**`

Not changed: production `/`, frozen M1/M2/M3 sources, PS-03 programs, M4 evaluator math, magnetism, topology, copy.

## 18. Mapping table

Unchanged. See `mapping-report.md`.

## 19. Frozen hashes

Verified in focused tests and `checkpoint-hashes.json`:

- M4.1 aggregate `a07014e6…8361`
- M4.1 manifest `d0e9aa2f…f441`
- M4.1R patch `228ddce4…3ca0`
- M3.1R endpoints `0c778f0f…8df2`
- M1 `4cb80b50…75eb`
- M2 `f04bc262…6c0d`
- M3 `184744da…6ec1`
- M4.R1 `f86d717b…5d12`
- M4.R2 `726bc3bb…4333`
- M4.R3 `9c8f6a4b…6284`
- M4.R4 source (this checkpoint) `37e99fe9e6b9a10a6bc735351948fd678facdb50bee6c0ae980dd65bee752069`

## 20. Test gate

- Focused R4 + R3 + M4: included in `npm test`
- `npm test`: **178/178 pass**
- `tsc --noEmit`: pass
- `eslint .`: pass (0 errors)
- Python: 4 + 11 + 11 pass
- `next build --webpack`: 39 pages, `/` = production SiteShell
- GPU vertex + field: M3 / M4 identity / M4 all `valid`
- Live-route palette: pass
- Lab smoke: 1 canvas, 1 draw, footer no Mimic, sessionId `ps04-m4-r4`
- Context restore: `restored`, LUT unchanged

## 21. GPU parity

`gpu-parity.json`: vertex 552/46 and field 32896+4369 tolerances unchanged. Identity mode still bypasses site fit. Continuity lift is off, so it does not write evaluator varyings.

## 22. Live-route palette verification

Shader-level: `maxUnselectedCompetenceWeight` = 0 for masks 1..64. Live uniforms: mask/progress/ownership/LUT hash as in §7. Visual stills: selected competence accent on neutral substrate.

## 23. Context restore / viewport / DPR

Stills: `dpr-1-hero`, `dpr-1.5-hero`, `dpr-2-hero`, `viewport-390x844-hero`, `context-restore`, `hero-light` / `hero-dark`. Context state `restored`. Color phase continued (wrap from ~0.97 to ~0.05 over ~2s is periodic, not a reset to 0).

## 24. Boards / WebM

Boards `01`–`16` in `renders/boards/`. WebM (played at 1× until `ended` in `video-playback.json`):

- `user-sequence`, `content-design`, `warmed-content-design`, `content-design-lift-on`
- `reverse-sequence`, `rapid-forward-reverse`, `full-down-up`, `reduced-motion`

R3 reproduction stills are copies under `renders/browser/r3-reproduction/`.

## 25. Vision review (machine-assisted, not aesthetic approval)

Looked at:

- R3 vs R4 settled Design: rollback vs purple Design accent — **functional pass**
- Seven settled SINGLEs Light board 11: one competence each — **functional pass**
- Content→Design t04 (wait-settled): Design morphology, purple, `cont 0`, not a sphere — **functional pass**
- A/B lift boards: no disk — **functional pass** for sampled frames
- Production `/`: SiteShell, seven-color bar in marketing graphic only — **unchanged**
- Footer stills: no Mimic
- `user-sequence` 1× probe at ~8.7s: Event heading while transaction still `master-neutral → single-design` and a round mass — **skip-ahead / cold compile, displayed source is still MASTER**. Not the wait-settled Content→Design path. Human should watch the WebM.

No neon/glow added. Light/Dark remain one material system.

## 26. Known limitations

- Rapid-20 p95 is still dominated by `compileLiveRetarget` on interrupt snapshots.
- Skip-ahead before the first SINGLE program commits still shows the displayed MASTER.
- Playwright 12-frame A/B did not catch the user-video sphere with lift on; lift stays off by architecture, not because A/B proved the user frame.
- GPU draw time not sampled despite extension.
- Framebuffer hex occupancy under-counts lit tokens.
- HUD previously labeled `settled` with `targetPaletteMask` during a running tx; R4 HUD now prints `committed` vs running hashes. Still not a substitute for uniforms.
- 390 CTA overlap from earlier stages not retuned.

## 27. Left for M5

See `carry-forward-m5.md`. Do not start M5 from this pass.

## 28. Final status

`PS-04.M4.R4 — MACHINE PASS / HUMAN REVIEW REQUIRED`

Functional gates for settled SINGLE palette commit, wait-settled non-MASTER morphology, warmed ordinary compile, mapping, magnetism, footer, frozen hashes, tests, lint, typecheck, build, and GPU parity are green. A human must watch the 1× WebMs and judge remaining skip-ahead / rapid-interrupt hitch and any residual sphere in natural scrolling.
