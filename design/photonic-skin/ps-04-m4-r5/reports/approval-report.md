# PS-04.M4.R5 — Geometry Endpoint Authority & Scroll-Actor Choreography

**Status: MACHINE PASS / HUMAN REVIEW REQUIRED**

Aesthetics are not auto-approved. PS-04.M5 was not started. No commit, push, or deploy. Production `/` is unchanged. Frozen PS-03 / M1 / M2 / M3 hashes match. R4 checkpoint at `design/photonic-skin/ps-04-m4-r4/` was not deleted or rewritten.

## 1. Git baseline

- Branch: `master`
- HEAD at start of R5: `4f222b24298d83b9197beb17a8fd7b1207ceed58`
- Message: `feat(photonic-skin): settle SINGLE palettes and warm M4.R4 runtime`
- Working tree at start: R4 already committed. This pass did not reset the tree and did not delete owner untracked files.
- Preserved: `design/photonic-skin/ps-04-m4/`, `ps-04-m4-r1/`, `ps-04-m4-r2/`, `ps-04-m4-r3/`, `ps-04-m4-r4/`, topology checkpoint in `docs/`, previous lab routes and tests.

## 2. R4 geometry rollback reproduction

Query-gated lab mode `?reproduceR4Geometry=1` restores the R4 Scene path: `uProgress` follows session progress immediately, and new textures bind only after session progress > 0.04. Default R5 path does not do this.

Evidence:

- WebM `r4-rollback-reproduction.webm`
- Stills `r4-repro-digital-settled` → `r4-repro-video-instant` → `r4-repro-video-assembled` → `r4-repro-video-rollback` → `r4-repro-games-instant-video` → `r4-repro-games-morph`
- Board `17-r4-geometry-rollback.png`
- Natural-rAF log `reports/r4-rollback-geometry-log.json` (544 frames, unified `performance.now()`)

The owner recording pattern is reproduced: Digital holds, Video assembles, Video snaps back to Digital, Games arrives with Video visible instantly, then Video→Games morphs.

## 3. Exact target → source frame

From `reports/r4-rollback-frame.json`, Digital→Video hold then Games intent:

| Field | Frame 765 (9426 ms) | Frame 766 (9456 ms) |
| --- | --- | --- |
| committed node | 05.5 Video → 05.4 Games on the next sample | 05.4 Games |
| coordinator | `settled` | `running` |
| session | `settled`, progress 1 | `transitioning`, progress 0.030 |
| **shader `uProgress`** | **1** | **0** |
| bound program | `single-digital-to-single-video-…` | **same program** |
| source / target | digital → video | digital → video |
| settledGeometryId | `single-video` | `single-video` |

Frame 768 (9650 ms) then binds `single-video-to-single-games` at progress ≈ 0.05: Video reappears (new pair source @ t=0), then morphs to Games.

That is the owner sequence: target; suddenly another object (source of the still-bound pair); previous correct SINGLE; new transformation.

## 4. Confirmed root cause

**Case A (primary), with Case C / mixed bind as the following frames.**

Not Case B as the first event: `boundProgramId` does not change on the rollback frame. `uProgress` changes `1 → 0`.

R4 Scene wrote `uProgress` from **session** `geometryProgress`. After settle the coordinator is:

```
status = settled
geometryProgress = 1
settledGeometryId = target
activeTransition = null
```

`session.commitTransition()` still sets `geometryProgress = 0` before the new pair is bound (required by R4 compile-gap tests). First paint: **old pair textures + `uProgress = 0` → source endpoint**. React/useEffect texture bind happens later: **new pair @ t=0** shows the previous correct SINGLE, then the morph starts.

Raw `activeNodeId` could also issue a duplicate actor request (Case C). Texture `useEffect` cleanup could dispose displayed textures (Case B risk, not the first rollback frame).

This is not a palette bug, not magnetism, not a third frozen geometry ID.

## 5. Session / coordinator / uniform before the fix

On the rollback frame (reproduction mode):

- Coordinator had already been `settled` @ t=1 with Video as settled geometry.
- Session then `transitioning` @ ~0.
- Uniform `uProgress` followed session → 0.
- Bound program still Digital→Video.

Default R4/R5-before-authority Scene used `sessionSnap.geometryProgress` on the hot path. Coordinator `geometryProgress = 1` was ignored for the shader.

## 6. GeometryAuthority after the fix

`geometry-authority.ts` + coordinator `displayedBind`:

```
GeometryMaterialSnapshot {
  revision, navigationToken,
  status: "settled" | "waiting" | "running",
  boundProgramId, boundSourceGeometryId, boundTargetGeometryId,
  settledGeometryId, semanticTargetGeometryId,
  shaderProgress, programReady, bindFrameToken, reverse, pendingProgramId
}
```

Scene `useFrame` does not derive settled geometry from raw session state. It reads one geometry snapshot and one palette snapshot and writes uniforms atomically.

While `status === "waiting"` (new revision, program not bound): `shaderProgress` stays **1** (previous target). `commitTransition` may still zero **session** progress. Displayed shader progress does not.

`markDisplayedBind` is idempotent per revision+programId so the clock cannot reset displayed progress to 0 every frame.

`commitTargetAsSettled` no longer copies `sourceGeometryId = target`. Palette source LUT/mask still copy (R4). Displayed bind locks at progress 1.

## 7. Endpoint lifecycle

```
old pair @ t=1
        ↓ hold (waiting)
new pair fully ready
        ↓ atomic bind
new pair @ t=0
        ↓ monotonic forward
new pair @ t=1
        ↓ hold indefinitely
```

Idle ticks, `activeTransition = null`, session cleanup, and prewarm do not move displayed progress. The next frame does not return source.

`selectProgramSourceMode`: if displayed `shaderProgress >= 1`, the next frozen program source is the **displayed** endpoint, even when session progress is 0. That prevents compile-gap live-retarget from targeting a `runtime-snapshot-*` source that `canAtomicBind` would reject (rapid-skip deadlock).

## 8. Atomic program bind

In one Scene commit, after `canAtomicBind`:

1. Navigation/actor revision matches the packet.
2. `programReady`.
3. New program source endpoint matches the displayed settled endpoint (or displayed source).
4. All program textures/buffers bind.
5. Source/target metadata bind.
6. `uProgress = 0`.
7. Only then is the transition marked running (Lab `playGeometry(true)` after render ack).

Forbidden mixed frames (new textures + old progress, old textures + reset progress) are rejected by `canAtomicBind` / hold branch. Stale revision cannot bind or settle. Material is not remounted on `programId`. WebGL program count stays 1.

## 9. Render acknowledgment

After the actor draw, Scene calls `onGeometryAck` with drawn revision, program ID, progress, source/target IDs, frame token, `performance.now()`. Stored on a ref in Lab. Coordinator `acknowledgeRender` does not set React state. Coordinator does not treat the target as visually confirmed until the material has drawn the current program at `t=1` once. After ack the pair stays bound at `t=1`.

## 10. Endpoint seam parity

GPU vertex probe max position error `1.612881469714722e-6` (frozen order ~1.6e-6). Identity/t=0/t=1 remain evaluator endpoints. Contact sheets `24-endpoint-seam.png` show old@1 / early new@0 for Content→Design, Design→Event, Event→Games, Games→Video. Frozen programs were not rewritten. If a live interrupt still uses `compileLiveRetarget`, that path is not the ordinary adjacent warmed path.

## 11. Prewarm immutability

`freezeProgram` copies typed arrays into the cache. Prewarm compiles and stores; it must not bind, mutate session, change `uProgress`, or rewrite displayed buffers.

Hold Design 5s while the idle queue prewarms other pairs (`prewarm-invariance-log.json`, 652 frames):

- `boundProgramId` unique: `master-neutral-to-single-design-…`
- `shaderProgress` unique: `1`
- `settledGeometryId` unique: `single-design`
- `textureIdentity` unique: 1
- `materialUuid` unique: 1
- `prewarmCount` 14 → 18 (cache filling only)

WebM `prewarm-invariance.webm`.

## 12. Navigation token architecture

`NavigationDirector` issues one token that binds target screen, scroll/magnetic operation, actor transaction, program request, palette, and slot/fit. Raw observed node is diagnostic-only and must not request the actor (`rawNodeMustNotRequestActor`). Magnetic candidate and committed node share the token.

One normal adjacent change: 1 intent → 1 actor revision → 1 program bind → 1 geometry transition → 1 settle.

Idle after a finished programmatic `scrollToNode(..., "auto")` still requests the committed node when it differs from the displayed endpoint (fixes R5 live-palette miss where jumps finished so fast that mode was already `idle`).

## 13. Slow scroll choreography

Directed intent is stable for ~48 ms (or input idle) before the actor request. Program prewarm can run earlier. Magnetic settle of the same target is a no-op. Palette, geometry, slot, and fit share the revision. Mimic may start morphing before the target screen fully arrives; it must not reach target and then roll back.

## 14. Fast skip coalescing

`fastGesture` or graph distance ≥ 2 holds the last stable displayed endpoint, updates only the projected target, waits for input idle, then one transformation stable source → final node. Intermediate SINGLEs do not call `compileLiveRetarget`. Programmatic latest-wins still cancels in-flight compiles via `isCurrent`.

## 15. Reverse policy

Reverse of a running pair (`token.target === tx.sourceNodeId`) is coalesced: no second request, no stale queue. Ordinary forward transitions stay monotonic. Frozen session reverse of the same pair is preferred when already loaded; otherwise one retarget after input idle.

## 16. Magnetism A/B and selected variant

Rollback is not hidden by a longer snap. After the geometry fix:

| Variant | idle | radius | snap |
| --- | ---: | ---: | ---: |
| A R4 baseline | 160 ms | 0.25 vh | 340 ms |
| B coordinated | 160 ms | 0.28 vh | 440 ms |
| C calm | 175 ms | 0.30 vh | 520 ms |

**Selected: A** (`SELECTED_MAGNETISM_VARIANT = "a"`). Least intrusive. Query `?magnetism=a|b|c` remains for lab A/B. No mandatory scroll-snap, no wheel `preventDefault`, no nested scroller, no hard paging.

## 17. Seven geometry persistence checks

Coordinator + live route:

1–4. All seven SINGLEs stay the target immediately after settle and at 0.25 / 1 / 2 / 5 s (focused tests + `digital-settled` vs `digital-settled-5s`).
5. `uProgress` does not go `1 → 0` without a new revision.
6. Idle tick does not change geometry.
7. Resize / theme / visibility / context restore do not start a geometry revision after settle (focused tests + stills).
8. Live uniforms after settle: `geometryProgress = 1`, `boundTargetId` matches the SINGLE, `shaderProgress = 1`.

## 18. Palette regression

Live-route palette `pass: true`. Masks 1/2/4/8/16/32/64. `ownership = 0`, palette `shaderProgress = 1`, unselected competence weight 0. Material UUID stable `025e552d-82ac-4887-be74-23599932b594`. WebGL programs = 1. Geometry bind does not reset the LUT. Geometry settle and palette settle share the revision. Continuity lift stays off by default. R4 focused tests remain green.

## 19. Actual rendered geometry

Controller telemetry is not enough. Capture + live route also record:

- Runtime: `settledGeometryId`, `boundProgramId`, progress, revision.
- Uniforms: `geometryProgress`, `boundSourceId`, `boundTargetId`, texture UUIDs.
- Silhouette/contact sheets: no third frozen ID (`thirdGeometry: false`), 0 empty actor frames.
- Five-second Digital hold still matches Digital, not MASTER or Video.

Reproduction mode is the only path where classified visible geometry returns to source without a new intended pair.

## 20. Changed files

Runtime:

- `app/visual-lab/photonic-skin-ps04-m4/geometry-authority.ts` (new)
- `app/visual-lab/photonic-skin-ps04-m4/navigation-token.ts` (new)
- `app/visual-lab/photonic-skin-ps04-m4/PS04M4Lab.tsx`
- `app/visual-lab/photonic-skin-ps04-m4/PS04M4Scene.tsx`
- `app/visual-lab/photonic-skin-ps04-m4/transition-coordinator.ts`
- `app/visual-lab/photonic-skin-ps04-m4/transition-prewarm.ts`
- `app/visual-lab/photonic-skin-ps04-m4/scroll-controller.ts` (variants A/B/C; default A)

Tests: `tests/photonic-ps04-m4-r5.test.ts` (new); sessionId assertions in `photonic-ps04-m4.test.ts`, `r3`, `r4`.

Checkpoint: `design/photonic-skin/ps-04-m4-r5/**`

Not changed: production `/`, frozen M1/M2/M3 sources, PS-03 programs, M4 evaluator math, topology, copy, R4 reports.

## 21. Mapping table

Unchanged. See `mapping-report.md`.

## 22. Frozen hashes

All expected hashes matched. R4 source snapshot remains `37e99fe9e6b9a10a6bc735351948fd678facdb50bee6c0ae980dd65bee752069`. R5 source `853cd3b8373b3116330acf2643fefdc9d7b84424c3bf1515d9df5c52c15421ef`. See `frozen-verification.md` and `checkpoint-hashes.json`.

## 23. Focused and full test gate

- Focused R5: pass (includes R4 palette invariants, persistence, atomic bind, prewarm, navigation, magnetism A)
- `npm test`: **196/196 pass**
- `tsc --noEmit`: pass
- `eslint .`: pass, 0 errors
- Python: 4 + 11 + 11 pass
- `next build --webpack`: 39 pages, `/` static SiteShell
- Lab smoke: sessionId `ps04-m4-r5`, 1 canvas, 1 draw, 131072 triangles, footer no actor
- GPU vertex + field: valid
- Live-route palette: pass
- A/B continuity: pass, lift stays off
- Capture: 15 sheets, 17 videos, 0 empty actor frames, `contextState: restored`

## 24. GPU parity

`gpu-parity.json`: vertex 552/46, field 32896+4369, tolerances unchanged. Max position error `1.612881469714722e-6`. Identity mode bypasses site fit. Continuity lift off, so it does not write evaluator varyings.

## 25. Context restore

Capture `context-restore.png`, `contextState: restored`. Focused tests: restore does not start a new geometry revision after settle. Palette LUT and target geometry return.

## 26. Viewport / DPR

Stills: `dpr-1-hero`, `dpr-1.5-hero`, `dpr-2-hero`, `viewport-390x844-hero`, Light/Dark settled SINGLEs. Full-canvas, scissor disabled, footer empty. Production `/` captured unchanged.

## 27. Cold / warm performance

Natural rAF (`performance-qa.json`), unified `performance.now()` origin. Request latency is `max(0, …)` (never negative).

| Scenario | rAF p50 | rAF p95 | long tasks ≥50ms | duration |
| --- | ---: | ---: | ---: | ---: |
| Idle MASTER | 6.1 | 6.2 | startup | n/a |
| Cold Content→Design | 6.1 | 12.2 | 5 | 4.03 s |
| Warm Content→Design (8s prewarm) | 6.1 | 24.2 | **2 (268 ms, 5148 ms)** | 6.33 s |
| Rapid-20 | — | 3515 | 42 | stress |

Warmed adjacent: cache `lastStatus = cached`, `lastKey = single-content|single-design`, 1 canvas, 1 WebGL program, 1 draw, no geometry recreation, no material remount. **Not** `compileLiveRetarget` on that key.

The 5 s `self` long task on the first displayed bind of a cached pair is **not hidden**. R4’s reported warm `longTasks = 0` was a waitSettled race (measurement returned before the new transaction). R5 waitSettled requires the visible SINGLE id. Ordinary warmed UX still has a bind hitch; it is called out in limitations, not treated as the geometry rollback.

Rapid-20 p95 is live-retarget / compile stress. Not ordinary UX.

`EXT_disjoint_timer_query_webgl2` is available; `gpuMs` is still null around the actor draw.

Resources (idle): 1 canvas, 1 program, 16 textures, 1 geometry, 1 draw.

## 28. Boards / WebM

Boards `01`–`26` in `renders/boards/` covering spec items 1–20 (rollback, 5 s hold, Content→Design, Digital→Video, Video→Games, Games→Event, seven SINGLEs, seam, DPR/mobile, footer/production).

Required WebMs:

- `r4-rollback-reproduction`
- `slow-forward-sequence` / `slow-reverse-sequence`
- `fast-skip-coalesced`
- `magnetism-baseline` / `magnetism-selected`
- `reverse-cancel`
- `prewarm-invariance`
- `five-second-endpoint-hold`
- `full-down-up`

Plus leftover R4 names: `user-sequence`, `content-design`, `warmed-content-design`, `reverse-sequence`, `rapid-forward-reverse`, `reduced-motion`, `content-design-lift-on`.

## 29. WebM 1× playback

`video-playback.json`: **17/17** files played in Chromium at `playbackRate = 1` until `ended` (`ok: true`). Method: local HTML video element + wall-clock wait for `ended`, plus ffprobe container metadata. File existence is not the review.

## 30. Known limitations

- Warm cached bind can still produce a ≥50 ms (here multi-second) main-thread task on first GPU texture upload of that pair. Not live-retarget, not geometry rollback, not hidden by magnetism.
- Rapid-20 remains live-retarget / long-task stress.
- `transitionDurationMs` can still be null for MASTER no-op / measurement races (e.g. merch→MASTER if waitSettled samples before bind timestamps). Successful SINGLE scenarios in this pass recorded non-null, non-negative durations.
- GPU draw time not sampled despite the extension.
- Framebuffer hex occupancy under-counts lit tokens (same as R4).
- 390 CTA overlap from earlier stages not retuned.
- `THREE.Clock` deprecation: frozen M3 session, not the rollback cause.

## 31. Left for M5

See `carry-forward-m5.md`. Do not start M5 from this pass.

## 32. Final status

`PS-04.M4.R5 — MACHINE PASS / HUMAN REVIEW REQUIRED`

Human must watch `r4-rollback-reproduction.webm` (defect) against `five-second-endpoint-hold.webm` and the slow adjacent WebMs (fix). If target returns to source on the default lab route without a new navigation intent, this status is void.
