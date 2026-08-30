# PS-04.M4.R3 — Transition Continuity, Palette Synchronization & Frame Pacing

**Status: MACHINE PASS / HUMAN REVIEW REQUIRED**

Aesthetics are not auto-approved. Magnetism, mapping, topology, seven colors, and frozen PS-03 programs were not retuned. M5 was not started. No commit, push, or deploy.

## Git baseline (before this pass)

- Branch: `master`
- HEAD: `83355149cf7b204fdfe82a9031e8bfe3d9c77797`
- Spec mentioned previous HEAD `f9e45229da988ed1e98fb032f18864af22a0315f`; the tree was not reset.
- Working tree at start of R3: R2 lab already on HEAD. R3 files are uncommitted.
- Preserved: `docs/mimicry-homepage-topology-checkpoint-2026-08-29.md`
- Read-only: `design/photonic-skin/ps-04-m4/`, `ps-04-m4-r1/`, `ps-04-m4-r2/`

## Confirmed root causes (telemetry, then code)

1. **Premature target palette.** `PhotonicMotionSession.tick` writes the frozen M3 regroup→reveal palette curve into the driver. At `g ≥ 0.40` that curve reaches 1 and `settleIfComplete()` replaces `sourceLut` with the target LUT while the silhouette is still source-like. A leftover `setMask(..., { mode: "immediate" })` after commit made this worse in R2. R3 intercepts session-tick linked writes and applies `transaction.paletteProgress` only.
2. **Independent site clock.** Lab rAF used `1 - exp(-dt / 0.28)` for slot/fit. Removed. Slot and fit now use the same transaction `siteProgress`.
3. **Actor requests from raw `activeNodeId` plus host in the key.** 01→04 retriggered a self-transition; programmatic jumps could request crossed nodes. Requests now use `committedActorNodeId()` and semantic key `geometry|mask|slot|fit`.
4. **Compile-gap false settle.** Between `beginRequest` and `commitTransition` the session still reports `geometryProgress = 1`. Syncing that into a new running transaction settled it immediately (`g=1, p=1`) before the new program existed. R3 keeps the transaction in `anticipation` until the session is actually playing.
5. **Idle p95 ≠ transition p95.** R2 `50 ms` figures were Playwright capture cadence (~20 FPS), not rAF.

## Clock / tick ownership

- Single simulation clock: `PhotonicMotionSession.tick(dt)` from the M4 lab rAF.
- `ActorTransitionCoordinator.noteSessionTick(token)` allows one accepted tick per frame token.
- `useFrame` reads snapshot and writes uniforms. No per-frame React state.
- Duplicate frame token ignored. `dt` clamped. Hidden tab / offscreen pause do not jump time.
- Context restore does not rewind the phase; it resumes the same session.

## Unified transaction

`ActorTransitionCoordinator` owns one revision per semantic actor change: geometry IDs, palette masks, slot, fit, phase, palette progress, site progress, interruption. Latest-request-wins. Stale `settle(revision)` fails.

## Request lifecycle

**Before:** screen node → host-keyed request → session begin → `commitTransition` + optional immediate mask → independent site exp → M3 palette curve settles LUT early.

**After:** committed node → semantic no-op gate → one transaction → session begin (latest-wins) → compile gap holds source LUT/slot → commit → coordinator progress drives palette/site → settle only when session is playing that program to `g=1`.

## Palette contract

- Per-persistent `vPaletteOwnership` (read-only varying): source-like particles keep source LUT; target-like follow rebuild.
- Global `colorPhase` is never reset.
- Same mask → palette progress stays 1.
- Palette-only → no fake geometry transition.
- Selected-color leak remains 0 (GPU field probe).

## Continuity overlay

M4-only radius lift after frozen `presented`. Identity / `t=0` / `t=1` bypass. Does not rewrite PS-03 programs, correspondence, or centers. GPU vertex probe still samples `vEvalChannels`.

## Silhouette

Actor-mask rAF samples: no collapse below 30% of the smaller endpoint. One first-frame measure miss per mask sheet (`area` null before the first readPixels). Ordinary sheets do not measure (readPixels off). No third frozen geometry ID.

## Performance (natural rAF, not capture)

Idle MASTER p95 **6.3 ms**. Content→Design p95 **6.3 ms**. Rapid-20 p95 **672.7 ms** from frozen compile long tasks on the main thread — reported, not hidden. One Canvas / 1 program / 1 draw / 1 geometry.

## Status line

`PS-04.M4.R3 — MACHINE PASS / HUMAN REVIEW REQUIRED`
