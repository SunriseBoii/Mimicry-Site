# PS-04.M4.R6 stall attribution

Query-gated reproduction: `/visual-lab/photonic-skin-ps04-m4?r6Staging=0`. Default route is unchanged (`r6Staging` omitted ⇒ staging on).

## Confirmed

1. **R5 first-visible bind created 16 new `DataTexture` objects per pair** in Scene `useFrame` (`stateTexture` / `programTextures`) and retained the previous set. `useMemo` on `source`/`target`/`program` allocated another 16 after `commitTransition`. That is **+32 textures per transition** and the `16 → 48 → 80 → … → 464` climb.
2. **CPU cache hit ≠ GPU ready.** Warm Content→Design was already a compiled-program hit with WebGL program count `1`. The hitch was the first visible bind/upload of that pair, plus a later React remount.
3. **Lab `setUi(sessionSnap)` every ~160 ms re-rendered `PS04M4Scene`**, reconciling `InstancedMesh` × 16384. After switching the lab clock to `performance.now()`, Scene `useFrame` was &lt; 50 ms; a **~2.5–2.8 s long task ~160 ms after bind** matched this React commit, not `initTexture` itself.
4. **Idle death was session status, not scroll.** `beginRequest` / `commitTransition` set `status = "transitioning"`. Frozen `phase-adapter.ts` sets `decorativeIdleWeight = 0` while `playingTransition`. Pending prep was incorrectly treated as a geometry transition.
5. **Navigation did not await the compiler Promise.** `requestActor` is fire-and-forget (`void`). The freeze was main-thread work in the same document, not `scrollY` waiting on Mimic.

## Inferred

- ANGLE/D3D11 still pays a real GPU upload when a brand-new `DataTexture` is first sampled. `textureUploadCount = 0` in R5 telemetry did not prove absence of Three.js/WebGL uploads.
- First-paint `r6:slow-draw` ~2.7–2.9 s is the first instanced draw of 16384 octahedrons (shader/PSO). It happens **before** `lab.ready`. Ordinary-navigation gates are after first paint.
- `?r6Staging=0` after Scene `memo` no longer shows a multi-second long task (rAF max 36.4 ms, 0 tasks ≥50 ms in the R6 measure). Memo removes the React remount hitch; the diagnostic path can still allocate new `DataTexture`s.

## Rejected

| Hypothesis | Why rejected |
| --- | --- |
| Magnetism / snap duration | Stall existed with default A (160 / 0.25 vh / 340). |
| Easing / morph clock | Warm duration ~6.33 s in R5 was rAF gap, not the 0.98 s program duration. |
| Scroll awaiting `programReady` | Semantic node and `scrollY` already moved; HUD/graph followed the screen. |
| WebGL program recompile per screen | Program count stayed `1`. |
| Continuity lift | Default off. |
| `gpuMs` GPU timer as the 5 s stall | After clock fix, actor draw was not the 5 s task. `gpuMs: null` in the stored `performance-qa.json` is a **query bookkeeping miss** (pending query never sampled), not proof the GPU hung for 5 s. |
| Fake `gpuReady` on CPU cache hit | R6 `canAtomicBind` rejects `packet.gpuReady === false`. |
| Nested scroll / snap | Document-vertical + sticky chapters unchanged. |
