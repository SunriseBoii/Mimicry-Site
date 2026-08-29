# PS-04.M3 test results

Final machine gate: **PASS**. Overlapping suites are not summed. Focused M1, M2, and M3 tests are already included in `npm test`.

| Gate | Result |
| --- | --- |
| Focused PS-04.M3 | 18/18 pass |
| `npm test` | 125/125 pass (107 pre-M3 + 18 focused M3) |
| Focused PS-04.M1 | 6/6 (included in 125) |
| Focused PS-04.M2 | 15/15 (included in 125) |
| `npx tsc --noEmit` | pass |
| `npm run lint` | pass |
| M3.1R Python | 4/4 |
| M4 Python `test_core.py` | 11/11 |
| M4.1 Python `test_core.py` | 11/11 |
| `npm run build` | pass; Next.js 16.2.6 webpack; **37/37** static pages (M2 report was 35; + M3 lab + preview) |

## GPU / CPU (this machine)

Headless Edge / ANGLE D3D11 bound **Intel Iris Xe**, not the historical RTX 4060 Laptop note from M2.

- Vertex TF on `master-neutral-to-brand-wide-drive-content-design-digital-event-games-merch-video-qa-desktop-289348ed94b7`: **552 samples / 46 times, valid**. Max position Δ `1.612881469714722e-6`. `maxIdleEvalPositionDelta` **0** (evaluator varyings unchanged when idle uniforms are on).
- Field TF: **32 896 semantic + 4 369 envelope, valid**. Max semantic weight Δ `1.091e-7`. Unselected leak `0`.
- CPU: inverse overlay, uniform scale, field-before-idle strip vs M2, 35 programs, 127 masks, 20-hit latest-request-wins, C0 / not-C1 at click.

## Performance (same run, R3F frame-delta, 768×768, DPR 1.5)

Not GPU shader timing. No screenshot overhead.

| Case | p50 ms | p95 ms | draws / tri / programs / textures |
| --- | --- | --- | --- |
| M3 idle | 6.1 | 31.2 | 1 / 131 072 / 1 / 16 |
| M3 transition | 6.0 | 17.6 | 1 / 131 072 / 1 / 16 |
| M3 rapid retarget | 6.1 | 28.4 | 1 / 131 072 / 1 / 16 |
| M2 idle (this headless session) | 50 | 50 | demand-pause stats, not comparable |

M3 p50 matches the order of the historical RTX observation. p95 17–31 ms is headless pacing on Intel, not a >25% shader regression versus the same-run median. Historical RTX p95 6.8 ms is a different GPU.

## Pre-existing warnings (not new failures)

- Frozen Three.js `THREE.Clock` deprecation.
- ANGLE non-fatal shader optimizer warning, including `dyn_index` of the 32-sample LUT.
