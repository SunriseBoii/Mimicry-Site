# PS-04.M4.R6.R1 — hydration / visibility attribution

Rejected R6 checkpoint under `design/photonic-skin/ps-04-m4-r6/` was not rewritten.

Isolation commands ran on the **fixed** tree (the working copy was not rolled back). Root cause is from rejected R6 boards + code, not from a pre-fix isolation that made Mimic appear only after one command.

## Confirmed

1. **Upload acknowledgement was a lie.** Rejected `uploadNextSlot` set `needsUpdate`, called `renderer.initTexture()`, then marked the slot uploaded immediately. Three r185 only invokes `texture.onUpdate` when a pixel upload actually runs (`source.version !== sourceProperties.__version`). `gpuReady` could be true with empty GPU textures.
2. **First displayed frame sampled zeros.** Mesh defaulted visible. Frame 1 drew 16384 instances against empty `DataTexture`s. Meta without the visibility bit and zero scale/activation collapse every instance to radius 0, but `gl.info.render.calls` is still **1**.
3. **Active-bank pointer could move before sampler bind.** `markBound` used to promote the packed bank before Scene wrote the 16 uniforms. On identity MASTER the Scene could keep bank 0 (empty) in the material while authority pointed at a later bank.
4. **Render publication was not part of initial hydration.** Even after CPU data existed, the first actor frame waited for a later invalidate. DPR change remounts `Canvas` (`key={`${profile}:${dpr}`}`). Context restore recreates the renderer WeakMap. Both uploaded the already-packed CPU arrays and looked like a “fix”.

`?r6Staging=0` creates packed textures in `useMemo` and binds them on the R5 path. Same Canvas, material, shader, camera, clip-space, geometry evaluator. Mimic is visible. The defect is the default R6 GPU staging path.

## Isolation (fixed tree, new context each row)

| Case | Actor visible | Mask pixels | Notes |
| --- | --- | --- | --- |
| Fresh default + 5 s | yes | 95873 | `appearedAtMs === readyMs` (~4887 ms including load). No DPR/resize/theme/context. |
| Invalidate only | yes | 95923 | Actor already present before the command. |
| Rebind only | yes | 95910 | Same. |
| Reupload only | yes | 95970 | Same. |
| Full republish | yes | 95944 | Same. |
| `?r6Staging=0` | yes | 96769 | Diagnostic path. `gpuReady` telemetry false (path omits the R6 gate). |
| DPR 1 → 1.5 | yes | 217632 (DPR 1.5 buffer) | Positive control, not a hydration step. |
| Resize | yes | 95918 | Positive control. |
| Context restore | yes | 97074 | Positive control. |

Commands did not resurrect a blank actor. After the fix, Mimic is already in the first ready frame.

## Why DPR / context restore used to revive Mimic

- `setDpr` changes the Canvas React `key`, remounting the renderer.
- `loseContext` / restore runs `recreateAfterRestore` + `hydrateResident` against a new WebGL context.
- Both upload the CPU arrays that were already packed. They are not part of normal hydration.

## Rejected (not the defect)

Mapping, actor slot, material theme, Light/Dark contrast, scissor, full-canvas composition, draw-call count, triangle count, frozen geometry, navigation, magnetism, palette mask, WebGL program compile. `drawCalls === 1` is not visibility.
