# Human review — PS-04.M4.R4

Machine status is **MACHINE PASS / HUMAN REVIEW REQUIRED**. Aesthetics are not approved here.

Play these WebMs at `playbackRate = 1` until `ended` (already machine-played once in `video-playback.json`):

1. `content-design.webm` and `warmed-content-design.webm` — sphere? all-seven after settle? hitch?
2. `content-design-lift-on.webm` — R3 overlay reproduction only.
3. `user-sequence.webm` — full 04→05.x; skip-ahead may still show MASTER if compile has not committed the first SINGLE.
4. `reverse-sequence.webm`
5. `rapid-forward-reverse.webm` — hitch expected on live retargets.
6. `reduced-motion.webm` — immediate endpoints.
7. `full-down-up.webm` — footer empty.

Stills to compare:

- `renders/browser/r3-reproduction/design-settled.png` (rejected all-seven)
- `renders/browser/design-settled.png` (R4 purple Design, `own 0`, mask 2)
- Board `11-settled-singles-light.png` and `12-settled-singles-dark.png`
- Board `03-content-design-sheet.png` and `15-ab-continuity-lift.png`
- `production-homepage-untouched.png`

Checklist from the spec:

- [ ] No brief sphere on wait-settled Content→Design
- [ ] Mimic does not vanish for a frame
- [ ] No unexplained third object
- [ ] Continuity does not inflate a shell
- [ ] Source silhouette does not linger too long
- [ ] Target palette arrives with target morphology
- [ ] All-seven does not return after settle
- [ ] SINGLE is neutral material + one competence accent
- [ ] No neon/glow
- [ ] No one-frame wrong slot
- [ ] Compile pause / jump
- [ ] Calm B2B character
