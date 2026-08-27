# PS-04.M1 test results

Final machine gate: **PASS**.

| Gate | Result |
| --- | --- |
| `npm test` | 92/92 pass, 0 fail |
| Focused PS-04.M1 tests | 6/6 pass (included above) |
| `npm run typecheck` | pass |
| `npm run lint` | pass, 0 warnings/errors |
| M3.1R Python contract | 4/4 pass |
| M4 Python contract/QA | 11/11 pass |
| M4.1 Python contract/QA | 11/11 pass |
| `npm run build` | pass; Next.js production build generated 33/33 static pages |
| Real browser/WebGL QA | pass |

The first final lint attempt found three new `react-hooks/set-state-in-effect` errors in URL/runtime initialization. They were fixed with microtask synchronization and cleanup; lint was then rerun successfully. The first Python invocation also exposed an environment issue (`python` absent from PATH and `scipy` absent from the bundled runtime). Tests were rerun with the bundled Python and a temporary, non-repository SciPy target; all suites passed. These were tooling/environment issues, not hidden regressions.

Focused coverage asserts:

- frozen evaluator vertex shader math is preserved;
- exactly one `RawShaderMaterial` surface pipeline is used;
- Light/Dark values remain inside the approved material ranges;
- variation is deterministic and persistent-ID bound;
- palette uniforms are reserved but cannot color M1;
- M4.1 manifest, aggregate, endpoint and M4.1R patch hashes remain exact.

No final pre-existing or new test failures remain.
