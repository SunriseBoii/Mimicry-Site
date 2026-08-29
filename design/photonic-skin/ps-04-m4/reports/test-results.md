# PS-04.M4 test results

Overlapping suites are not summed. Focused M1, M2, M3, and M4 tests are included in `npm test`.

| Gate | Result |
| --- | --- |
| Focused PS-04.M4 | 10/10 pass |
| `npm test` | **135/135** pass (125 pre-M4 + 10 focused M4) |
| Focused PS-04.M1 | 6/6 (included) |
| Focused PS-04.M2 | 15/15 (included) |
| Focused PS-04.M3 | 18/18 (included) |
| `npx tsc --noEmit` | pass |
| `npm run lint` | pass |
| M3.1R Python | 4/4 |
| M4 Python `test_core.py` | 11/11 |
| M4.1 Python `test_core.py` | 11/11 |
| `npm run build` | pass; Next.js 16.2.6 webpack; **39/39** static pages (M3 report was 37; + M4 lab + preview) |

## GPU (this machine, Edge / ANGLE D3D11, Intel Iris Xe)

Tolerances unchanged: vertex **552/46 valid**, field **32 896 + 4 369 valid**. Unselected leak **0**. M3 and M4 vertex errors matched on the same golden program `master-neutral-to-brand-wide-drive-…-289348ed94b7`. `maxIdleEvalPositionDelta` **0**.

## Performance (R3F frame-delta, not GPU timers)

Environment: Headless Edge 151, ANGLE Intel Iris Xe, 20 cores, 32 GiB, DPR 1.5. Historical RTX numbers are not mixed in.

| Case | p50 ms | p95 ms | draws / tri / programs / textures |
| --- | --- | --- | --- |
| M3 idle (768² lab) | 6 | 15 | 1 / 131072 / 1 / 16 |
| M4 idle ordinary (1440×900) | 6.1 | 7.1 | 1 / 131072 / 1 / 16 |
| M4 vertical→horizontal `03.1` | 6.1 | 20.2 | 1 / 131072 / 1 / 16 |
| M4 rapid competency / left / right | 50 / 50 | 50 | 1 / 131072 / 1 / 16 (sparse sample window after retarget; 20 fps report = 50 ms period, not a sustained 20 fps film) |
| M4 footer exit | 6.1 | 19.3 | 0 actor draw; `actorDraw: false` |
| M4 footer return | 6.1 | 14.9 | composition visible again; gl.info can read 0 in the first demand window |

p95 > 16.7 ms on the chapter boundary and footer exit is recorded as **headless Intel pacing**, not a proven shader regression. Idle M4 p95 7.1 ms is under 16.7 ms in this run.

## Smoke

1 canvas, 1 header after down/up. Wheel inside pinned chapter `05` advanced `scrollY` `6410→7810` (`05.4→05.5`) — no nested scroll trap. Footer `actorDraw: false`. Resources after return: 1 program / 16 textures.

## Pre-existing warnings (not new failures)

- Frozen Three.js `THREE.Clock` deprecation.
- ANGLE non-fatal shader optimizer warning.
- Next.js dev-indicator “N” appears on `next dev` stills; not part of the lab UI.
