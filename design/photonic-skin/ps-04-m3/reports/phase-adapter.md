# PS-04.M3 phase adapter mapping

Read-only adapter over frozen Directed Photonic Release windows. Names in the brief are semantic; the runtime union is `anticipation | release | regroup | reveal | approach | settle`.

`phaseAt()` keeps later overlapping windows (`settle > approach > reveal > regroup > release > anticipation`).

## Frozen QA-desktop windows

| Motion phase | Window (progress) |
| --- | --- |
| anticipation | [0.00, 0.11] |
| release | [0.07, 0.38] |
| regroup | [0.24, 0.68] |
| reveal | [0.40, 0.82] |
| approach | [0.62, 0.94] |
| settle | [0.86, 1.00] |

Source: `DIRECTED_PLASTIC_RELEASE.phasePolicy`. Per-program `program.phases` is used when present. Typical QA desktop duration ≈ 0.98 s.

## Semantic slots used by palette / idle

| Brief slot | Runtime mapping | Palette |
| --- | --- | --- |
| Before transition / Release | `anticipation` + `release` | source LUT held; color phase still advances |
| Regroup | `regroup` | C2 blend starts at regroup[0] = 0.24 |
| Approach | `approach` | target already primary after Reveal start |
| Reveal | `reveal` | target LUT reached at reveal[0] = 0.40; extra source weights → 0 |
| Settle / idle | `settle` then settled idle | target locked; idle/color flow continues |

`paletteProgress = c2Window(t, regroup[0], reveal[0])`. If `reveal[0] <= regroup[0]`, progress is 0 before the bound and 1 after (no division by zero). Zero-duration / reduced-motion / missing program → progress 1.

Geometry-linked mode drives this progress. The free M2 0.8 s retarget timer is **not** run in that mode. Same source/target mask skips the fade. Compound routes use the whole-request progress; inner MASTER is not a seven-color license.

Residual overlay weight: `1 - c2Window(t, 0, reveal[0])`. Decorative idle weight is 0 while transitioning, then C2 ease-in over 1 s after settle.

Short/zero phases: `durationSecondsForProgram` returns 0 for self-transitions, `durationMs <= 0`, or compiled reduced-motion headers.
