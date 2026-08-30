# Human review — PS-04.M4.R5

Machine status is **MACHINE PASS / HUMAN REVIEW REQUIRED**. Aesthetics are not approved here. PS-04.M5 was not started.

Play these WebMs at `playbackRate = 1` until `ended` (machine-played in `video-playback.json`):

1. `r4-rollback-reproduction.webm` — required evidence of the rejected geometry rollback (`?reproduceR4Geometry=1`).
2. `slow-forward-sequence.webm` / `slow-reverse-sequence.webm`
3. `fast-skip-coalesced.webm` — intermediates must not assemble.
4. `magnetism-baseline.webm` / `magnetism-selected.webm` — both variant A.
5. `reverse-cancel.webm`
6. `prewarm-invariance.webm` — Design must not change while other pairs prewarm.
7. `five-second-endpoint-hold.webm`
8. `full-down-up.webm`

Stills / boards:

- Board `17-r4-geometry-rollback.png` vs `18-five-second-hold.png` / `11-settled-singles-light.png`
- `digital-settled.png` vs `digital-settled-5s.png`
- `19-r5-content-design.png`, `21-r5-digital-video.png`, `22-r5-video-games.png`, `23-r5-games-event.png`
- `24-endpoint-seam.png`
- `production-homepage-untouched.png`

Checklist from the spec:

- [ ] Target does not return to source after settle
- [ ] No instant wrong SINGLE before morph
- [ ] Morph starts from the actually visible object
- [ ] Transformation is not played twice
- [ ] Actor does not start before a readable navigation intent
- [ ] Mimic is not several screens behind
- [ ] Skipped SINGLEs are not shown
- [ ] Magnetism does not grab control
- [ ] Screen arrival and Morph Reveal feel synchronous
- [ ] Calm B2B character
- [ ] Sphere does not return
- [ ] Colors remain R4-correct
- [ ] No clipping
- [ ] No pause→jump after compilation
