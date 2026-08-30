# PS‑04.M4.R6 — Non‑Blocking Navigation, Continuous Idle & GPU‑Resident Transition Staging

**Status: MACHINE PASS / HUMAN REVIEW REQUIRED**

Aesthetics are not auto-approved. PS‑04.M5 was not started. No commit, push, or deploy. Production `/` is unchanged. Frozen PS‑03 / M1 / M2 / M3 / M4.R1–R5 hashes match. R5 evidence under `design/photonic-skin/ps-04-m4-r5/` was not rewritten.

---

## 1. Git status and HEAD

- Branch: `master`
- HEAD: `907282db7948c86387107a2f06166ada8f744a0f`
- Message: `feat(photonic-skin): hold settled Mimic geometry and sync M4.R5 scroll`
- Parent of that commit is the R4 tree (`4f222b2…`). **R5 is already committed.** Uncommitted R5 work at the original R5 report is now this HEAD.
- This pass did not reset the tree and did not delete owner untracked files.
- Deps: Next `16.2.6`, React `19.2.6`, Three `0.185.1`, R3F `9.7.0`
- Lab: `/visual-lab/photonic-skin-ps04-m4` (`sessionId = ps04-m4-r6`)
- Production `/`: `app/page.tsx` (`SiteShell`)
- Tests: 16 `tests/*.test.ts` files, **208** Node tests pass
- Build: 39 app routes; `/` remains static SiteShell
- WebGL (Edge/ANGLE D3D11, Intel Iris Xe): WebGL 2.0, `MAX_TEXTURE_SIZE` 16384, `EXT_disjoint_timer_query_webgl2` present
- Query: `?r6Staging=0` = R5 first-visible-bind path. Default = GPU staging

## 2. R5 stall reproduction

Original R5 evidence (kept): warm Content→Design cache hit, programs `1`, first-bind long tasks ~268 ms + ~5148 ms, rAF max ~5151.5 ms, duration ~6.33 s, heap ~102→702 MB, textures `16→464`.

This pass: `/visual-lab/photonic-skin-ps04-m4?r6Staging=0` after 8 s on Content then Design. Board `01-r5-warm-stall-repro.png` / `01b`. After Scene `memo`, the **same diagnostic path** measures rAF max **36.4 ms** and **0** long tasks ≥50 ms. The 5 s freeze required the React remount; memo removes that hitch even when new `DataTexture`s are allocated.

## 3. Confirmed root cause

See `stall-attribution.md`.

1. Per-transition allocation of 16 (then 32) new `DataTexture`s without dispose.
2. Lab HUD `setUi` every 160 ms remounting `PS04M4Scene` / 16384 instances (~2.5 s main-thread task).
3. `beginRequest` during prep set session `transitioning`, which zeroed decorative idle via frozen `phase-adapter`.
4. CPU cache hit was not GPU readiness.

## 4. Rejected hypotheses

Magnetism, easing, scroll awaiting a Promise, program recompile, continuity lift, nested snap, fake `gpuReady` on cache hit. GPU timer `gpuMs: null` in the stored JSON is query bookkeeping in that run, not a 5 s GPU hang.

## 5. Main-thread stall timeline (R5, then R6)

R5 warm: navigation intent → semantic node commit (immediate) → cache hit → **visible bind of 16 new textures** → React commit ~160 ms later **~2.5–5 s** → morph clock starts → settle.

R6 warm Content→Design: atomic bind ~0.1 ms class, `rAF.max = 12.1 ms`, long tasks `[]`, morph duration ~1091 ms (program clock, not stall).

First paint (before `lab.ready`): ~2.7–2.9 s first instanced draw. Gates are after first paint.

## 6. CPU pair byte inventory

`PAIR_CPU_BYTES = 3 211 264`. Twelve 128×128 RGBA float maps + four 256×4 track maps. See `texture-inventory.md`. Desktop LRU 96 MiB (~31 pairs). Mobile 32 MiB. Pins: active / forward / reverse / pending.

## 7. GPU texture inventory

16 slots per pair (source/target position, normal, quat, meta, residual, lanes, velocity, activation, four track maps). 3 banks × 16 = **48**. `initTextureCount` in telemetry is an **event counter** (grows); `renderer.info.memory.textures` plateaus at **48**.

## 8. Old resource lifecycle

Compile → CPU cache → Scene creates textures on first visible bind → previous set leaked. Session `transitioning` as soon as a request existed. Scroll free, but main thread not.

## 9. New resource lifecycle

```
absent → cpu-preparing → cpu-ready → gpu-staging → gpu-ready → bound
```

Visual:

```
settled → preparing → morphing → settling → settled
```

`gpuReady` requires packed + uploaded bank, not a CPU cache hit. `r6Staging=0` omits `gpuReady` so the old bind path remains query-gated.

## 10. Navigation / actor decoupling

`ScrollCompositionController` does not await compile, staging, `programReady`, or settle. `void requestActor`. Semantic node, header, graph, `scrollY`, magnetism stay on document scroll. `scrollY` is not the morph clock.

Measured Cases→Content: node `05.1`, `scrollY` 2702→3602 while `visualLifecycle = preparing`, `sessionStatus = settled`.

## 11. Resource state machine

Implemented in `resource-lifecycle.ts` + `gpu-texture-pool.ts` + coordinator `resourceState`. Latest-request-wins; stale bank must not bind.

## 12. Visual state machine

Coordinator `visualLifecycle`. During `preparing`: GeometryAuthority `shaderProgress = 1`, palette committed, idle on. Slot may lerp (`SLOT_PREPARE_SECONDS = 0.38 s`); **fit stays source** until morph. Footer forces settled + `actorDraw = false`. Late bind after settle no longer forces `morphing` (08→01 capture timeout).

## 13. Continuous idle

Pending prep is not a geometry transition. Default path does **not** `beginRequest` until GPU ready. `PhotonicMotionSession.tick` continues. Breath/rotation samples increase during prepare. Overlay stays enabled.

## 14. Idle handoff

Handoff only at morph start. Reuses M3 C2 residual (~160 ms lab). After settle, existing ~1 s idle ease-in. Reduced: idle off, navigation free, atomic endpoint.

## 15. GPU staging

Three resident banks. Pack into existing `Float32Array`. `renderer.initTexture` one texture per slice. Yield on input. Bootstrap: hide mesh until active bank `gpuReady`. `texture.needsUpdate = false` after init.

## 16. CPU LRU

Byte-accounted in `transition-prewarm.ts`. Evict unpinned typed arrays. Do not dispose the displayed/staging bank of the current revision. Topology lookahead, not all 35 pairs.

## 17. Worker decision

`compile-broker.ts` / `compile-worker.ts` exist for **pure CPU compile** with transferable buffers. Node tests use in-process fallback. **Lab source must not contain `new Worker`** (CSP). The R5 stall was GPU bind + React, not `compileFrozenPair`. Worker is optional infrastructure, **not** the stall fix. OffscreenCanvas was not done.

## 18. Texture budget

**48** GPU textures, constant. After restore, banks recreate without unbounded duplicate retention (measure: 32 renderer textures settled, not 464).

## 19. Heap plateau

Idle ~49 MB. Warm CD ~59→70 MB. Two full cycles ~107→85→92 MB. Context restore spiked ~282 MB (lose/restore), then recoverable. Not 102→702 linear.

## 20. Full-cycle resource plateau

Five samples 01/08/01/08/01: textures **48**, pool **48**. Second pass does not add a new 16-set.

`16→464` = same-context leak + duplicate `DataTexture` + no dispose. Not a harness-only artifact.

## 21. Magnetism

Default A unchanged: idle 160 ms, radius 0.25×vh, snap 340 ms, cubic ease-out, no-op ≤2 CSS px. Magnetic rAF independent of actor resources. Not used to hide load.

## 22. Cold fallback

Page reaches Content immediately. Mimic stays on last committed endpoint (MASTER) with idle, then morphs after GPU ready. No spinner, no hide, no MASTER-as-loader (MASTER **is** the committed endpoint). Target palette does not own the field until the geometry transaction.

## 23. Rapid / latest-target

Rapid-20: rAF max 581.7 ms, long task 561 ms — **stress only**; pool still 48. End still: Design mask 2, LUT src=dst, `rev 12`. Intermediate targets cancelled. Footer cancels draw.

## 24. Mapping

Unchanged from R5 table (Hero/About/Build/Cases MASTER 127 right; 05.1–05.7 SINGLE masks 1…64 left; footer none). Build-flow never promotes one competence to SINGLE.

## 25. Changed files (uncommitted)

New: `texture-pack.ts`, `gpu-texture-pool.ts`, `resource-lifecycle.ts`, `r6-instrumentation.ts`, `compile-broker.ts`, `compile-worker.ts`, `tests/photonic-ps04-m4-r6.test.ts`, `design/photonic-skin/ps-04-m4-r6/**`.

Edited: `PS04M4Lab.tsx`, `PS04M4Scene.tsx`, `transition-coordinator.ts`, `transition-prewarm.ts`, `geometry-authority.ts`, `natural-raf-recorder.ts`, R3–R5/M4 tests (hash/sessionId strings only where required).

Not edited: `app/page.tsx`, frozen PS‑03 programs, evaluator math, production copy/IA.

## 26. Frozen hashes

See `frozen-verification.md`. All designated hashes match. R6 source aggregate is a **new** checkpoint file, not a rewrite of R5 `853cd3b8…`.

## 27. Tests

- R6 module 12 pass
- M4+R3–R6 83 pass
- Full Node **208 / 0**
- `tsc --noEmit` pass
- ESLint on lab + R6 tests/scripts pass
- Python M3.1R 4, M4 11, M4.1 11 as scripts
- `python -m unittest design.photonic-skin.ps-03-m4-1.tests.test_core` can fail `triggerMode` as an **import-path artifact**; frozen files unchanged

## 28. GPU parity

`run-gpu-parity-probes.mjs`: M3 / M4 identity / M4 vertex **valid**; field **valid**. Tolerances unchanged (`552/46`, `32896+4369`).

Live route palette: `pass: true`, `failures: []`, one material UUID across SINGLEs, context restore keeps merch mask 64 / LUT `5bc23705`.

## 29. Performance numbers (natural rAF)

| Scenario | rAF max | Long task ≥50 | Textures | Programs | Draws | Tris |
| --- | --- | --- | --- | --- | --- | --- |
| Idle MASTER | 6.3 | 0 | 16 | 1 | 1 | 131072 |
| Warm Content→Design | 12.1 | 0 | 48 | 1 | 1 | 131072 |
| Content→…→Games | 24.2 | 0 | 48 | 1 | 1 | 131072 |
| Reverse | 18.2 | 0 | 48 | 1 | 1 | 131072 |
| Graph jump | 18.2 | 0 | 48 | 1 | 1 | 131072 |
| Rapid-20 (stress) | 581.7 | 561 | 48 | 1 | 1 | 131072 |
| Context restore | 1860.6 | 1856 | 32 | 1 | 1 | 131072 |
| `?r6Staging=0` now | 36.4 | 0 | 48 | 1 | 1 | 131072 |

Canvas count 1. Continuity lift default off.

`gpuMs` in that JSON: extension available, **0 samples** (pending query). Not used as a pass claim.

## 30. Context restore

`loseContext` → recreate banks. Board `16-context-restore.png`: Content SINGLE visible, `g 1.00`, 166 fps, 16T immediately after restore (one bound bank before restage). Live palette afterRestore mask 64. Hitch ~1.8 s is **restore**, not ordinary navigation.

## 31. DPR / mobile

Boards `12-mobile-390`, `13-dpr-1`, `14-dpr-1.5`, `15-dpr-2`. Measure: mobile Content settled mask path; DPR 1.5/2 rAF max 54.5 / 66.7 during resize (one sample ≥50 ms, **not** a 5 s stall). Triangle count stays 131072 at dpr 1.

## 32. Boards / WebM inventory

Boards (24): `01` R5 stall, `01b` settled, `02` idle MASTER, `03` nav while preparing, `04` gpu-ready morph, `05` Cases, `06–08` seven SINGLEs, `09–10` footer, `11` reduced, `12` 390×844, `13–15` DPR, `16` context restore, `17–18` resource cycles, `20` production home.

WebM (9/9 required), all 1× `ended`: listed in `visual-review.md` and `capture-inventory.json`.

## 33. Human visual review

See `visual-review.md`. Page does not freeze. Mimic **lags** the screen by design. Contrast on beige is weak. Delayed-actor and right→left MASTER-on-Content need an owner look. **Not auto-approved.**

## 34. Known limitations

- First-paint ~2.9 s instanced draw before `ready`
- Rapid-20 long tasks ~560 ms
- Context restore ~1.8 s + heap spike
- `gpuMs: null` in the archived measure
- HUD `g 0.00` during preparing is coordinator compile-gap, not shader rollback (shader stays 1)
- `resource.gpuReady` telemetry can still read true from the **previous** bank while `state` is `cpu-preparing`
- Light-theme actor visibility
- Short `resource-second-cycle.webm` (3 s) after settle-fix
- `initTextureCount` grows as an event counter; object count does not

## 35. Left for M5

Production homepage integration, device QA, final look, copy/CMS, optional OffscreenCanvas if first-paint draw remains unacceptable. **Not started.**

## 36. Checkpoint status

**PS‑04.M4.R6 — MACHINE PASS / HUMAN REVIEW REQUIRED**

Ordinary neighbour transitions: page independent of Mimic, idle until GPU-ready morph, no ≥50 ms actor long task after first paint, texture/heap plateau, R5 rollback not returned, hashes/tests/build/GPU parity green, 1× WebMs watched. Aesthetics of catch-up Mimic remain for the owner.
