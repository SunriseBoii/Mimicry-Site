# Test results — PS-04.M4.R4

| Gate | Result |
| --- | --- |
| `npm test` | 178/178 pass |
| Focused R4 (`tests/photonic-ps04-m4-r4.test.ts`) | included, pass |
| R3 live-file assertions | sessionId updated to `ps04-m4-r4`, pass |
| `tsc --noEmit` | pass |
| `eslint .` | pass, 0 errors |
| Python `tests/photonic_m31r_python_test.py` | 4 pass |
| Python `design/photonic-skin/ps-03-m4/tests/test_core.py` | 11 pass |
| Python `design/photonic-skin/ps-03-m4-1/tests/test_core.py` | 11 pass |
| `next build --webpack` | 39 pages, `/` static SiteShell |
| Lab smoke | pass, sessionId `ps04-m4-r4` |
| GPU vertex + field | all valid |
| Live-route palette | pass |
| A/B continuity | pass (0 forbidden with lift off) |
| WebM 1× playback | 8/8 ended |

No pre-existing npm-test failures were hidden.
