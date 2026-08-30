# PS-04.M4.R6.R1 visual review

Method: 24 required board classes plus nine WebMs played in Chromium at `playbackRate = 1` until `ended` (`reports/video-playback.json`). File existence is not review. Presence is from mask/readback, not screenshot brightness.

Rejected R6 Light (`01`) is **empty**, not low-contrast. R6.R1 Light (`02`) and Dark (`04`) show a real Mimic at DPR 1 with no DPR/resize/context action.

## Playback

All nine required clips ended at 1× (VP8). Wall-clock ≈ container duration.

| Clip | Seconds |
| --- | --- |
| fresh-load-no-interaction | 4.20 |
| cold-navigation-visible | 2.52 |
| continuous-idle-visible | 6.04 |
| warm-content-design | 5.44 |
| seven-singles | 21.48 |
| right-left | 3.72 |
| rapid-latest-target | 3.96 |
| context-restore | 3.28 |
| second-resource-cycle | 2.48 |

## Findings (not auto-approved)

1. **Fresh load.** Hero Light DPR 1 shows MASTER on the right. Hero Dark DPR 1 shows MASTER on the right. Mask Hero is a white disk on black, bbox 352×352, ~95k pixels. Rejected R6 Light in the same crop: stdev 0, 1 color.
2. **Content SINGLE.** Light board `17-single-content-light.png`: book-like SINGLE on the left, mask 1, `1 draw / 131072`. Dark Content rejected board `03` is the empty-left Content page from R6.
3. **Footer.** `20-footer-none.png`: copy says Mimic is absent; HUD `0 draw / 0 tri`; mask/readback `visiblePixelCount === 0`, `actorDraw === false`.
4. **Control `r6Staging=0`.** Mimic visible (diagnostic path).
5. **Isolation stills** after the fix still show Mimic (actor was already there).
6. **Production `/`** is SiteShell, not the lab.
7. **Contrast vs presence.** Light MASTER can still sit close to beige. That is a material/theme question for humans. It is not the R6 defect. R6 rejected Light had **no actor pixels**.
8. **No forbidden loaders** in reviewed stills: no MASTER sphere placeholder, no second Canvas, no CSS stand-in for Mimic.

## Human questions left open

- Is delayed Mimic on cold navigation still acceptable now that the first Hero frame is populated?
- Light-theme MASTER contrast vs beige.
- Right→left MASTER-on-Content during prepare (R6 contract, unchanged).
