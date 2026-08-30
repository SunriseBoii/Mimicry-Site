# PS-04.M4.R6 test and gate results

## Node focused + full suite

| Suite | Result |
| --- | --- |
| `tests/photonic-ps04-m4-r6.test.ts` | 12 pass (includes late settled-bind visualLifecycle) |
| M4 + R3 + R4 + R5 + R6 + M4 core | 83 pass |
| Full `tsx --test tests/**/*.test.ts tests/**/*.test.tsx` | **208 pass / 0 fail** |
| `tsc --noEmit` | pass |
| ESLint (`app/visual-lab/photonic-skin-ps04-m4`, R6 test, R6 scripts) | pass |

## Python

| Command | Result |
| --- | --- |
| `python tests/photonic_m31r_python_test.py` | 4 pass |
| `python design/photonic-skin/ps-03-m4/tests/test_core.py` | 11 pass |
| `python design/photonic-skin/ps-03-m4-1/tests/test_core.py` | 11 pass |

`python -m unittest design.photonic-skin.ps-03-m4-1.tests.test_core` can fail `triggerMode` `lab-scroll-scrub` vs `scroll` as an **invocation/import-path artifact**. Direct script execution passes. Frozen M4.1 files were not changed.

## Browser scripts (this checkpoint)

| Script | Result |
| --- | --- |
| `capture-r6.mjs` | 18 then 24 boards; 9 required WebMs |
| `capture-r6-extra.mjs` | DPR 1/1.5/2, context restore, two resource-cycle boards |
| `measure-r6.mjs` | `reports/performance-qa.json` |
| `watch-recordings.mjs` | 1× HTMLVideoElement playback (see `video-playback.json`) |
| `lab-smoke.mjs` | pass (`ready`, `idle`, `footer`, `footer-return`; 1 canvas, `sessionId` stable) |
| `run-gpu-parity-probes.mjs` | M3/M4 vertex+field `valid: true` |
| `live-palette-verify.mjs` | `pass: true`, `failures: []` |
| `watch-recordings.mjs` | 9/9 WebMs `playbackRate=1` `ended` |
| `npx next build --webpack` | pass (39 routes; `/` static SiteShell) |

## Reduced motion live probe (Edge/ANGLE, 2026-08-30)

After `?reduced=1` → Design + 1200 ms:

- `settledMask = 2`, `shaderMask = 2`, `shaderProgress = 1`, `settledGeometryId = single-design`, `visualLifecycle = settled`
- Board `11-reduced-motion.png` HUD can still show `shader 127` if captured at the first settled geometry frame before palette HUD catches up. Live probe is authoritative for mask 2.

## Footer live probe

- `actorDraw = false`, `visualLifecycle = settled`, `status = settled`
- HUD may still print last `1 draw / 131072 tri` from retained renderer stats.

## Pre-existing, not R6 regressions

- First-paint instanced draw hitch (~2.7–2.9 s) **before** `lab.ready`
- Rapid-20 long tasks (~561 ms) — stress only
- Context-restore long task (~1856 ms) and heap spike — `WEBGL_lose_context` recreation
- `gpuMs: null` in the stored performance JSON (timer queries not sampled in that run)
- Light-theme Mimic contrast against beige
