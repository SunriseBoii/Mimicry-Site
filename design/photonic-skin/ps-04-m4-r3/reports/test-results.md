# PS-04.M4.R3 machine gates

- Focused M4 + R3: 38/38 (20 R1/R2 + 18 R3)
- `npm test`: 163/163
- `npx tsc --noEmit`: pass
- ESLint on M4 lab + R3 tests: pass
- Python `tests/photonic_m31r_python_test.py`: 4 OK
- Python `ps-03-m4/tests/test_core.py`: 11 OK
- Python `ps-03-m4-1/tests/test_core.py`: 11 OK
- GPU vertex + field parity (M3, M4 identity, M4 ordinary): all valid; 552/46 and 32896+4369; unselected leak 0
- Lab smoke: 1 canvas, 1 draw, 131072 tri, sessionId `ps04-m4-r3`, footer reverse keeps session
- Natural rAF idle p95: 6.3 ms (not capture cadence)
- Natural rAF Content→Design p95: 6.3 ms
- Natural rAF rapid-20 p95: 672.7 ms (frozen compile long tasks; reported)
- GPU timer: `EXT_disjoint_timer_query_webgl2` present, disjoint false; GPU draw time not sampled (`gpuMs: null`)
- Context restore: `restored`
- Production build: 39 pages, `/` unchanged
- Production `/` does not import M4
- Named WebM played at 1× until `ended`

## Focused R3 coverage

One committed node → one transaction; same contract no-op; 01→04 no-op; stale settle fails; overlays 03.3A/B no geometry request; one clock token; palette ownership; same-mask / palette-only; color phase; interrupt from displayed; compile-gap; continuity endpoints + identity bypass; geometry ID trace; reduced endpoint; 20-hit latest-wins; one Canvas/session/draw; R2 magnetism and full-canvas regressions; frozen hashes.
