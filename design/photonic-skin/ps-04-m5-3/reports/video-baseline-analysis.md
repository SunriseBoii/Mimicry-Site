# PS‑04.M5.3 — Frozen Video baseline analysis

Original SINGLE Video remains available as `VIDEO_BASELINE`. Frozen PS‑03 buffers are not edited.

## Source

- Representation: `procedural-sdf` (no `.blend`)
- Target: `design/photonic-skin/ps-03-m2/targets/video-camera-clapperboard.target.json`
- Frozen buffer: `public/photonic-skin/ps-03-m3-1r/states/single-video.state.bin`
- Byte-identical also at PS‑03.M3 and M3.1 paths
- Hash: `3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b`
- N = 16384, stride = 40
- `lodPriority = i` (identity 0…16383)
- Component IDs: `camera` (0), `clapperboard` (1)
- Active / reserve / subsurface: 11895 / 2245 / 2244
- Active split: camera 6401, clapperboard 5494
- BBox size: [4.0576, 5.671, 1.3854]
- Centroid: [0.154, -0.1597, -0.1414]
- Orientation: M3.1R `eventOrientationPatch.applied = false`. Camera local rotateDeg `[0.0, 0.0, 125.0]`; clapper `[-40.0, 0.0, -55.0]`.
- Aggregate states containing Video: **65** of 154

## LOD prefixes (active counts)

| Prefix | camera | clapperboard |
| --- | --- | --- |
| 512 | 267 | 245 |
| 1024 | 592 | 432 |
| 2048 | 1251 | 797 |
| 4096 | 2407 | 1689 |
| 8192 | 4625 | 3567 |
| 12288 | 6401 | 5494 |
| 16384 | 6401 | 5494 |

## Why the clapper reads as a book

1. Board and stick are **one component** (`smooth_union`). There is no independent hinged-bar ID.
2. Stick half `[0.58, 0.24, 0.08]` vs board half `[0.58, 0.34, 0.09]`: nearly equal width, stick height ~70% of the board — two similar rectangles.
3. No hinge-at-one-edge silhouette; the pair looks like two pages without a spine cue that would even confirm a book, but also without a clapper wedge.
4. Diagonal stripes are **colour zones**, not geometry. Final Mimic is monochrome, so stripes disappear.
5. `clapperboard.visibleProfiles` = `['desktop', 'mobile390']` — **missing silhouette180/96**, so small sizes keep only the camera block.

## Visibility / Event A lesson

Camera is visible on all four profiles. Clapperboard is not. M5.3 candidates must publish a complete `componentMap` with non-empty `visibleProfiles` for every semantic part, including silhouette frames. Packed activation bit (+256) must be set so parts do not collapse to `minimumGeometricScale = 0.18`.

## M5.3 action

Create a versioned SDF authoring copy. Do not edit frozen PS‑03. Keep this buffer as `VIDEO_BASELINE`.
