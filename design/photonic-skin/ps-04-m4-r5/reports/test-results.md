# Test results — PS-04.M4.R5

| Gate | Result |
| --- | --- |
| Focused R5 (`tests/photonic-ps04-m4-r5.test.ts`) | pass |
| R4 palette tests | pass (sessionId `ps04-m4-r5`) |
| `npm test` | **196/196 pass** |
| `tsc --noEmit` | pass |
| `eslint .` | pass, 0 errors |
| Python `tests/photonic_m31r_python_test.py` | 4 pass |
| Python `design/photonic-skin/ps-03-m4/tests/test_core.py` | 11 pass |
| Python `design/photonic-skin/ps-03-m4-1/tests/test_core.py` | 11 pass |
| `next build --webpack` | 39 pages, `/` static SiteShell |
| Lab smoke | pass, sessionId `ps04-m4-r5` |
| GPU vertex + field | all valid |
| Live-route palette | pass |
| A/B continuity | pass (0 forbidden with lift off) |
| Capture | 15 sheets, 17 videos, 0 empty actor frames, context restored |
| Prewarm invariance log | 652 frames, progress 1, one program, one texture identity |

No pre-existing npm-test failures were hidden. Warm Content→Design still records long tasks on first cached bind; see approval report §27 and §30.
