# PS-04.M4.R6 visual review

Method: 24 boards plus nine WebMs played in Chromium at `playbackRate = 1` until `ended` (`reports/video-playback.json`). File existence is not review.

## Playback

All nine required clips ended at 1× (VP8). Wall-clock ≈ container duration.

| Clip | Seconds |
| --- | --- |
| navigation-during-cold-prepare | 4.64 |
| continuous-idle-before-morph | 6.92 |
| warm-content-design | 5.92 |
| seven-singles-down-up | 21.44 |
| rapid-latest-target | 4.28 |
| right-left | 4.48 |
| resource-second-cycle | 3.00 |
| reduced-motion | 3.00 |
| footer-exit-return | 3.28 |

`resource-second-cycle` is short because footer/hero settle is now instant after the coordinator fix. The clip is still a real 1× playback, not ffprobe-only.

## Findings (not auto-approved)

1. **Page vs Mimic.** Cold Cases→Content and Content→Design stills show the **screen already changed** (header, title, cards, graph) while HUD `g` can still be mid-morph or `0.00` with `ready 0`. This is the R6 contract. It does **not** look like a frozen document. It **does** look like Mimic lagging the copy. That lag is a human aesthetic call, not a stall.
2. **Idle during prepare.** `continuous-idle-before-morph` mid-clip: Design title, `anticipation · g 0.00 · ready 0`, **165 fps**. Breath/rotation telemetry in `performance-qa.json` keeps changing in this window. Mimic is often low-contrast on beige, so idle motion is easy to miss in a still.
3. **Warm Content→Design.** Mid still can land on settled Content; end of clip is the morph. Measure: rAF max **12.1 ms**, **0** long tasks ≥50 ms.
4. **Seven SINGLEs.** Merch still: `mask 64`, `shader 64`, `1P`, 148 fps. Live palette verify: all seven masks, one material UUID.
5. **Rapid latest-wins.** End still: Design `rev 12 · settle · g 1.00`, `mask 2`, LUT src=dst, 165 fps. No intermediate actor ID in that frame.
6. **Right→left.** Content `slot left` while MASTER→Content morphs. Composition follows the screen; geometry stays committed until bind. Cold MASTER sitting on Content copy is the intended fallback. Whether that reads as “alive MASTER sliding left” vs “wrong object on the page” is **human review**.
7. **Reduced motion.** Event still: `mask 4 · committed 4 · shader 4`, `g 1.00`. Live probe after 1.2 s: Design mask 2. Board `11` HUD can still show 127 if snapped on the first geometry-settled frame. Navigation is not blocked.
8. **Footer.** Actor copy says Mimic is absent; `actorDraw === false`; HUD `visualLifecycle` settled. Return to Contact restores one canvas / same sessionId (lab-smoke).
9. **No forbidden loading states** in reviewed stills: no spinner, no opacity-to-zero canvas, no MASTER sphere as a loader, no second Canvas.
10. **Magnetism** was not tightened. Default A is unchanged.
11. **Production `/`** board is SiteShell (Mimicry group homepage), not the lab.
12. **Light-theme contrast.** Many settled MASTER/Content frames hide the actor against beige. This is an existing material/theme issue, not an R6 hide-the-stall trick.

## Human questions left open

- Is delayed Mimic acceptable, or does it feel broken while it catches the screen?
- Is right→left MASTER-on-Content natural enough?
- Does low-contrast idle on light theme fail the “still alive” perception test even when telemetry says breathing continues?
