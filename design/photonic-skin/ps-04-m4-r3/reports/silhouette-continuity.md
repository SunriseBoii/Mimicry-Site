# Silhouette continuity (actor-mask rAF)

Mask sheets sampled inside the page on natural rAF (readPixels only when `actorMask=1`).

| Sheet | sampled | running | min area | max area | collapse <30% | third ID |
| --- | --- | --- | --- | --- | --- | --- |
| mask-master-content | 33 | 29 | 93942 | 259692 | none | no |
| mask-content-design | 26 | 25 | 185645 | 252120 | none | no |
| mask-design-event | 27 | 27 | 190638 | 254650 | none | no |

Each mask sheet logged one first-frame measure miss (`visibleFraction` set, area 0) before the first successful readPixels. Later frames have mass. Ordinary sheets do not call readPixels.

Frozen requested IDs are always source+target only (`geometry-id-trace.json`).
