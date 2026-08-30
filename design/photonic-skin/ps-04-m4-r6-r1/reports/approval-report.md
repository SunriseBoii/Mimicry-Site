# PS‑04.M4.R6.R1 — Initial GPU Bank Hydration & Framebuffer Visibility

**Status: MACHINE PASS / HUMAN REVIEW REQUIRED**

Aesthetics are not auto-approved. PS‑04.M5 was not started. No commit, push, or deploy. Production `/` is unchanged. Frozen PS‑03 / M1 / M2 / M3 / M4.R1–R5 hashes match. Rejected R6 evidence under `design/photonic-skin/ps-04-m4-r6/` was not rewritten. `drawCalls === 1 && visiblePixelCount === 0` is FAIL; this pass does not have that pattern on actor screens.

---

## 1. Git status and HEAD

- Branch: `master`
- HEAD: `907282db7948c86387107a2f06166ada8f744a0f`
- Message: `feat(photonic-skin): hold settled Mimic geometry and sync M4.R5 scroll`
- R5 is in that commit. R6 remains uncommitted. This tree was not reset and owner untracked files were not deleted.
- Deps: Next `16.2.6`, React `19.2.6`, Three `0.185.1`, R3F `9.7.0`
- Lab: `/visual-lab/photonic-skin-ps04-m4` (`sessionId = ps04-m4-r6-r1`, HUD `PS-04.M4.R6.R1`)
- Production `/`: `app/page.tsx` (`SiteShell`). Build lists `/` as static. Board `24-production-home.png` is the homepage, not the lab.
- Tests: **221** Node tests pass, 0 fail (includes focused R6.R1).
- Typecheck: `tsc --noEmit` pass. ESLint on changed lab/test files pass. Python: 15 OK (`test_core`, `test_ps03m41`, `photonic_m31r_python_test`).
- Build: `next build --webpack` pass; 39 app routes; `/` remains SiteShell.
- WebGL (Edge/ANGLE D3D11): WebGL 2.0, `EXT_disjoint_timer_query_webgl2` present.
- Query: `?r6Staging=0` stays diagnostic-only. Default = GPU staging.

## 2. Rejected R6 confirmation

Rejected checkpoint `design/photonic-skin/ps-04-m4-r6/` is evidence only. Source aggregate still `4a24385bcdda85496155e699edfbeab9bc1818488c1c246884ab3088d3acdb4f`. Formal R6 `MACHINE PASS` is withdrawn for humans: Mimic is missing from the default DPR 1 framebuffer. Boards `01` / `03` in this R6.R1 folder are copies of that blank reproduction (HUD still says `PS-04.M4.R6`). R6 visual review that called this “low contrast on beige” is incorrect.

## 3. Fresh-load reproduction

Rejected default R6, DPR 1, no resize/theme/context:

- Light Hero actor crop: **stdev 0**, **colors 1** (beige). HUD `1 draw / 131072 tri`.
- Dark Content (rejected board `03`): left actor slot is empty black; HUD still `1 draw / 131072 tri`.

R6.R1 same crop after the fix, still no DPR/resize/context:

- Light Hero: stdev **0.233**, **13432** colors. Mask ~**95646** pixels, bbox **352×352**.
- Dark Hero: stdev **0.244**, **20662** colors. Mask **95754** pixels.
- `appearedAtMs === readyMs` on isolation Test 1. Mimic is in the first ready frame.

## 4. Isolation matrix

Each row: new Playwright context, `/visual-lab/photonic-skin-ps04-m4?theme=light&dpr=1` unless noted. See `isolation-matrix.json` and `hydration-attribution.md`.

Isolation ran **after** the code fix (tree not rolled back). On the fixed tree, invalidate / rebind / reupload / republish all still show Mimic because it is already there. That does not identify a single surviving command; the rejected boards + code do.

## 5. Exact root cause

Default R6 GPU staging combined four bugs:

1. **False upload ack** — `initTexture` treated as uploaded without `texture.onUpdate` for the expected version.
2. **`gpuReady` before GPU data** — 16/16 acks were not required.
3. **First frame drew empty textures** — mesh visible; instances collapsed to radius 0; still one draw.
4. **Sampler bind / promote ordering** — bank pointer could change before the 16 material uniforms pointed at that bank; `invalidate` was not guaranteed after bind.

`?r6Staging=0` bypasses this path and shows Mimic.

## 6. Why DPR / context restore revived the actor

`Canvas` is keyed `${profile}:${dpr}`. DPR change remounts the renderer and uploads already-packed CPU arrays. Context restore recreates resident textures through `restoreGpu` + `hydrateResident`. Those are accidentals, not hydration.

## 7. Initial bank lifecycle before (rejected R6)

```
allocate DataTexture (often zero-filled)
→ initTexture
→ mark uploaded / gpuReady
→ copy CPU program later (or bind another bank)
→ first instanced draw against empty maps
→ wait for remount (DPR / restore) to upload real pixels
```

## 8. Initial bank lifecycle after

```
allocate three banks (48 textures, reuse)
→ copy complete CPU program into inactive/initial bank
→ validate buffers
→ assign texture.image.data, markTextureDataChanged (needsUpdate)
→ set onUpdate with generation-scoped token, then initTexture
→ ack only if generation + expectedTextureVersion match
→ gpuReady only when cpuPacked && 16/16 acks
→ atomically bind all 16 sampler uniforms
→ promote active only if gpuReady
→ invalidate / publish frame
→ mask/readback silhouette
→ actorFramebufferReady
```

Resident hydrate is silent (no morph). Navigation does not wait.

## 9. Texture version / needsUpdate

Reuse: `texture.image.data = nextData` then `markTextureDataChanged` (`needsUpdate = true`). Upload only on pack/restore, not every frame. `initTexture` is not treated as sufficient if version did not change after the write. Do not clear `needsUpdate` immediately after `initTexture`.

## 10. Upload acknowledgement

Token: `{ bankId, generation, textureIndex, expectedTextureVersion, navigationRevision }`. Callback is installed **before** `initTexture`. A stale generation cannot ack a new one. `requestedRevision[i]` must equal `acknowledgedRevision[index]`.

## 11. Sampler binding

`applyBankSamplers` writes all 16 uniforms from one bank. `getMaterialSamplerSnapshot()` returns material UUID, program count, bank id/generation, 16 uniform names, bound vs bank UUIDs, `allSamplerUuidsMatchActiveBank`. Machine gate: that flag is **true** on Hero and Content probes. Material UUID does not change. Program count stays **1**.

## 12. Render invalidation

Atomic bind calls `invalidate()`. Isolation `forceInvalidateOnly` only invalidates. Fresh load no longer depends on a later remount. Footer zeros draw stats and silhouette without waiting for the 0.75 s HUD heartbeat.

## 13. `gpuReady`

`cpuPacked && allAcknowledged() && all 16 slots packed`. Snapshot `gpuReady` is only `pool.active().gpuReady`. Lab UI `lab.ready` is document/control readiness (`target && !loading`). Actor uses `actorResourceReady` / `actorFramebufferReady`. QA must not treat Canvas/program/draw as actor-ready.

## 14. Framebuffer visibility gate

Query `actorMask=1`: canvas clear black, Mimic fragments opaque white. Internal one-shot RT probe (not a query flash) `readRenderTargetPixels` in the same lifecycle until `actorFramebufferReady`. Thresholds relative to R5 desktop profile: min bbox 48×48, 256 px, fraction 0.9; mobile 24×24 / 64 / 0.85. Footer: pixels 0, `actorDraw` false, draws 0. **`draw === 1 && pixels === 0` → FAIL.**

## 15. R5 / R6 / R6.R1 pixel comparison

See `pixel-comparison.json`.

| | Light Hero crop | Dark | Mask Hero |
| --- | --- | --- | --- |
| R5 (brief) | stdev ≈ 0.2076, thousands of colors | stdev ≈ 0.1623 | — |
| R6 rejected | stdev **0**, colors **1** | Content left empty | — |
| R6.R1 | stdev **0.233**, 13432 colors | Hero stdev **0.244**, 20662 colors | ~95k px, 352×352 |

## 16. Live-bank GPU parity

`reports/live-bank-parity.json`: `liveBankGpuParity true`, `allSamplerUuidsMatchActiveBank true`, activation non-zero (`activationHits` 16384), silhouette pass. Samples persistent IDs 0,1,7,64,255,1024,4096,8191 against CPU endpoints. **Limitation:** this reads the bound bank’s CPU `Float32Array` backing (the same arrays uploaded into `DataTexture`), not a WebGL float `readPixels` of GPU memory. Presence on GPU is the mask gate.

Frozen evaluator GPU parity (`gpu-parity.json`): M3 / M4 identity / M4 vertex and field all `valid: true`.

## 17. Changed files

Tracked edits: `PS04M4Lab.tsx`, `PS04M4Scene.tsx`, `geometry-authority.ts`, `natural-raf-recorder.ts`, `transition-coordinator.ts`, `transition-prewarm.ts`, R3/R4/R5/M4 tests (`sessionId`).

New: `gpu-bank-diagnostics.ts`, `gpu-texture-pool.ts`, `resource-lifecycle.ts`, `texture-pack.ts`, `r6-instrumentation.ts`, `compile-broker.ts`, `compile-worker.ts`, `tests/photonic-ps04-m4-r6.test.ts`, `tests/photonic-ps04-m4-r6-r1.test.ts`, `design/photonic-skin/ps-04-m4-r6-r1/**`.

R6 sources from the rejected pass remain in the same lab files; R6.R1 patches hydration/visibility on top. Production `app/page.tsx` not modified. Mapping table unchanged.

## 18. Frozen hashes

Checked by `scripts/hash-checkpoint.mjs` (`reports/checkpoint-hashes.json`):

- R6.R1 source: `60546b434ed857a9c967a28dca9ee7d1f0fdb705ca8bbaed654384e677f13116`
- M4.1 aggregate `a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361`
- M4.1 manifest `d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441`
- M4.1R patch `228ddce450536d94d625d73f99ceff133371ccfe515a6f21cc3377fa3fda3ca0`
- M3.1R `0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2`
- M1 `4cb80b507605bf439e9de5210e5f022159c716ee286fa81b98f0e943cf5b75eb`
- M2 `f04bc262cdc80e6061d2ad7fdb6501f60aa0a31105a55f876a8eaa26f0266c0d`
- M3 `184744da085dc31e08c954640456133308585b7b8ef107de43ab2f8d7a8e6ec1`
- M4.R1 `f86d717b652d66ae30d72fd480a386e9fbf5d8b9efa297325ae8c6f9b10b5d12`
- M4.R2 `726bc3bbf3f6c8d754b82204d4d02a20cd519fb836e1c5521c0ccb5d224e4333`
- M4.R3 `9c8f6a4b65c99bee6bfc711af01f6b57d0486e9bd742e708bd7f50580f156284`
- M4.R4 `37e99fe9e6b9a10a6bc735351948fd678facdb50bee6c0ae980dd65bee752069`
- M4.R5 `853cd3b8373b3116330acf2643fefdc9d7b84424c3bf1515d9df5c52c15421ef`
- Rejected M4.R6 source `4a24385bcdda85496155e699edfbeab9bc1818488c1c246884ab3088d3acdb4f` (not rewritten)

## 19. Test results

- Focused R6.R1: 13 tests pass (25 numbered cases grouped).
- R6 / R5 / R4 / R3 / M4 regression: included in **221 / 221**.
- `tsc --noEmit` pass.
- ESLint on touched files pass.
- Python 15 OK.
- Production build pass.
- Lab-smoke: ready, idle (95865 mask px, 1 draw, `failDrawWithoutPixels false`), footer no actor, footer-return 1 draw.
- Live palette: `pass true`, `failures []`, one material UUID; `lifecycle.programs` is `0` after the restore probe (stats sample, not a second program). Disclose: that field is telemetry after restore, not `info.programs === 0` on settled SINGLEs (those rows are `programs: 1`).

## 20. Performance

Ordinary default staging (`performance-qa.json`):

| Scenario | rAF max | long tasks ≥50 ms |
| --- | --- | --- |
| idle MASTER | 12.2 ms | 0 |
| warm Content→Design | 18.1 ms | 0 |
| sequential SINGLEs | 42.5 ms | 0 |
| reverse | 18.3 ms | 0 |
| graph jump | 18.2 ms | 0 |
| full down/up 1 | 30.2 ms | 0 |
| full down/up 2 | 12.2 ms | 0 |

GPU timer idle: p50 2.2 ms, max 5.4 ms, 0 over 16.7 ms.

**Startup** (not mixed into ordinary-nav): isolation first context ~4.9 s to `lab.ready` including document load; later contexts ~1.2 s. Upload slices are sub-millisecond. First actor pixel is the ready frame.

**Stress (allowed):** rapid-20 rAF max 509 ms, four long tasks ~454–499 ms. Visibility and pool survived. **Diagnostic `?r6Staging=0`:** rAF max 3327 ms, long task 3284 ms — that is the R5 bind path, not default R6.R1 navigation.

**Context restore:** rAF max 1812 ms, long tasks 68 / 120 / 1812 ms. Expected for lose/restore, not ordinary nav.

## 21. Texture / heap plateau

JS pool **48** after two full cycles. Renderer `info.memory.textures` 17 at idle (active bank) then ~49 after staging banks upload — not 16→464. Heap: idle ~49–56 MB; cycles ~93–111 MB; not 102→702 MB. `initTextureCount` is an event counter.

## 22. Context restore

Board `12-context-restore.png` / WebM `context-restore.webm` played 1×. After restore, hydrate repeats; Mimic returns; live palette LUT/mask unchanged (`5bc23705` / 64). Hitch is restore cost.

## 23. DPR / mobile

Fresh Light/Dark at DPR 1, 1.5, 2. Mobile 390×844 board `12-mobile-390.png`. Mask Hero at DPR 1.5 has ~217k white pixels (drawing buffer scale). Hydration does not switch DPR.

## 24. Screen visibility matrix

`actorMask=1` readback after `actorFramebufferReady`, no extra resize/DPR/theme. `screen-visibility.json` `pass: true`.

| Screen | Node | Pixels | BBox | Draws | actorDraw |
| --- | --- | --- | --- | --- | --- |
| Hero MASTER | 01 | 95646 | 352×352 | 1 | true |
| About BRAND_WIDE | 02 | 22013 | 425×209 | 1 | true |
| Build | 03.1 | 93367 | 348×348 | 1 | true |
| Cases MASTER | 04 | 95543 | 352×352 | 1 | true |
| Content | 05.1 | 114420 | 543×348 | 1 | true |
| Design | 05.2 | 142744 | 543×455 | 1 | true |
| Event | 05.3 | 196957 | 558×420 | 1 | true |
| Games | 05.4 | 65594 | 516×385 | 1 | true |
| Video | 05.5 | 47307 | 248×344 | 1 | true |
| Digital | 05.6 | 96696 | 516×378 | 1 | true |
| Merch | 05.7 | 38831 | 264×245 | 1 | true |
| Subsequent MASTER | 06.1 | 95675 | 351×353 | 1 | true |
| Footer | 08 | **0** | 0×0 | **0** | **false** |

Dark Hero 95754 px; Dark Content 117660 px. Footer is the only no-actor screen.

## 25. Boards / WebM inventory

Boards under `design/photonic-skin/ps-04-m4-r6-r1/renders/boards/` (required set present): rejected Light/Dark, R6.R1 Light/Dark, `r6Staging=0`, isolation 06–08b, DPR 1/1.5/2, context restore, Hero/About/Build/Cases, seven SINGLE Light + Dark, subsequent MASTER, footer, mask Hero + Content, live-bank, resource cycles, production home.

WebM under `renders/browser/video/` — nine named clips; leftover Playwright `page@*.webm` ignored by the watch script. `video-playback.json`: all nine `playedAtOneX: true`, `ended: true`.

## 26. Vision review

See `visual-review.md`. Rejected Light is empty. R6.R1 Light/Dark have Mimic. Do not describe the rejected still as low contrast.

## 27. Known limitations

- Isolation was not re-run on the rejected tree (no rollback).
- `lab.stats.textures` is Three’s uploaded count, not the 48 JS pool.
- RT mask probe `gl.render` from `useFrame` can trip the Next overlay once; pixels were still valid.
- Live-bank parity samples CPU backing of bound `DataTexture`s, not GPU float readback.
- `lifecycle.programs === 0` in live-palette afterRestore is a stats sample after restore.
- Rapid-20 remains a stress scenario with long tasks.
- Light MASTER vs beige contrast is unchanged (presence ≠ contrast).
- About BRAND_WIDE mask bbox is shorter (209 px) but well above the 48 px floor.

## 28. Left for M5

Aesthetics, Light contrast, delayed Mimic vs copy during prepare, magnetism, production homepage Photonic Skin. **M5 not started.**

## 29. Final status

**PS‑04.M4.R6.R1 — MACHINE PASS / HUMAN REVIEW REQUIRED**

Stop. No M5. No commit, push, or deploy.
