# PS-04.M2 test results

Final machine gate: **PASS**.

Overlapping suites are not summed. Focused M1 and M2 tests are already included in `npm test`.

| Gate | Result |
| --- | --- |
| `npm test` | 107/107 pass, 0 fail (92 pre-M2 + 15 focused M2) |
| Focused PS-04.M1 tests | 6/6 pass (included in 107) |
| Focused PS-04.M2 tests | 15/15 pass (included in 107) |
| `npm run typecheck` | pass |
| `npm run lint` | pass, 0 warnings/errors |
| M3.1R Python contract | 4/4 pass |
| M4 Python `test_core.py` | 11/11 pass |
| M4.1 Python `test_core.py` | 11/11 pass |
| `npm run build` | pass; Next.js 16.2.6 webpack production build generated 35/35 static pages (M1 was 33; + lab + preview) |
| Real browser/WebGL QA | pass (see `reports/browser-qa-report.json`) |

## Focused M2 coverage

- Frozen hashes, 154/35/105 inventory, and byte-level M1 source aggregate.
- Existing name→bit adapter: `content, design, event, games, video, digital, merch` → `1<<0` … `1<<6`. HEX tokens unchanged.
- All 127 non-empty 7-bit masks: selected-colors-only, non-negative normalized weights, click-order independence.
- Empty mask is neutral-only; invalid bits/names/NaN throw instead of falling back to MASTER.
- Actor-space field scalar is computed from evaluator `center` before presentation.
- M2 vertex shader is byte-identical to M1 after the three-line field bridge is stripped.
- Color-off lighting suffix is byte-identical to M1 from `float roughness = clamp(`.
- One `RawShaderMaterial`, one instanced actor, 32-sample uniform LUT, no palette textures.
- Coverage on MASTER / SINGLE-content / DRIVE-4 stays in the 30–38% mean-active-weight tuning range (scale² proxy of active persistent IDs).
- Palette controller: phase survives period/theme changes, hidden-tab/negative-delta ignored, reduced-motion retarget ≤160 ms, interrupted A→B→C continuity, bounded 32-sample memory, settled removal of unselected colors.

## GPU / CPU field and evaluator

Live WebGL2 transform-feedback on NVIDIA GeForce RTX 4060 Laptop (Edge / ANGLE D3D11):

- Vertex path, control program `master-neutral-to-brand-wide-drive-content-design-digital-event-games-merch-video-qa-desktop-289348ed94b7`: 552 samples / 46 times, **valid**. Max position Δ `1.612881469714722e-6` (same order as M1). Endpoints exact; camera up `[0,0,1]`.
- Field path: 32,896 semantic samples + 4,369 envelope samples, **valid**. Max semantic weight Δ `1.091e-7`. Unselected leak `0`. Empty mask included.

CPU unit tests agree with the GLSL field helpers on wrap, envelope, and selected-color coefficients. GPU readback is the authority for shader agreement.

## Pre-existing warnings (not new failures)

- Frozen Three.js `THREE.Clock` deprecation.
- ANGLE non-fatal shader optimizer warning, including `dyn_index` of the 32-sample palette LUT.

No new compile failures or console errors were treated as pass.
