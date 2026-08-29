# PS-04.M2 visual review

All 15 boards were opened after the final composition pass. Frames are real browser/WebGL captures from `/visual-lab/photonic-skin-ps04-m2` and its preview. The board script only crops, labels, and arranges.

Timed sequences were also inspected: SINGLE 14 s (8 frames / 1.75 s), MASTER 32 s (8 / 4 s), GATHER Dark 32 s (8 / 4 s), A→B→C retarget, and MASTER→SINGLE-event geometry with color held at phase 0.25.

Hero Dark was recaptured after first-paint theme bootstrap. Board 12 now shows `#090B0D` Dark desktop/mobile rather than a Light false-positive.

## Findings by board

| Board | Review |
| --- | --- |
| 01 | M2 color-off matches the live M1 renderer in both themes. Color-on adds a field without changing silhouette. |
| 02 | MASTER is one wide field of seven tokens. Light phase 0.5 is almost ceramic-only — the compact MASTER hull sits outside the active envelope at that phase. Dark remains saturated. |
| 03 | Seven SINGLE canonical Light: one slash each, tokens distinguishable, ceramic still dominates. |
| 04 | Seven SINGLE canonical Dark: same slash, brighter accents, no emissive. |
| 05 | Alternate pose keeps actor-space bands; they do not re-align to the camera. Small Dark merch/games components stay near the M1 readability bound. |
| 06 | Content slash travels as one band through 0 / 0.25 / 0.5 / 0.75. Wrap from 0.75→0 does not show a second full-width stripe. |
| 07 | FOCUS/GATHER/DRIVE two-color: Content+Design and FOCUS Event+Digital. Color crosses components; book/controller are not independently painted. GATHER/DRIVE have no Event+Digital frozen IDs. |
| 08 | Three-color Content+Design+Digital: wide zones, neighbour blends, not a seven-stripe rainbow. |
| 09 | Four-color Content+Design+Digital+Event: same shared field. Dark DRIVE small parts remain dim. |
| 10 | BRAND_WIDE seven colors, calmer than a stacked rainbow. Expressiveness is not above complex. |
| 11 | Close-up: color sits in albedo. Specular pinpoints from M1 are still visible in Light. |
| 12 | Hero: Mimic in the right third, left copy safe, Light/Dark and mobile. Overlay `0 DRAW` is demand-loop stats while color is paused, not a missing actor. |
| 13 | 180/96 DRIVE and BRAND_WIDE Dark: small components nearly disappear. Carry-forward from M1. |
| 14 | Coordinate / side / top prove actor-space scalar. Coverage/semantic diagnostics are not brand material. Custom seven-color mask on SINGLE is labelled as a material diagnostic. |
| 15 | Reduced motion, context restore, M1 bypass, wide↔narrow, and old M1 / M4.1R routes remain intact. |

## Motion sequences

- SINGLE Light: one blue slash, no wrap flash in the 8-frame 14 s pass.
- MASTER Light: field walks the sphere; mid-cycle is the known desaturated dip.
- GATHER Dark: blue/purple field continues across both components; no per-icon hue assignment.
- Retarget: Content slash → interrupted magenta/video mix → later Event/Digital/Merch without a spatial jump at interrupt.
- Geometry+color: MASTER→Event progress 0…1 with color phase held; color stays on actor centers, not UV/screen.

Temporal visual review is **not blocked**. Sequences are discrete browser frames with timestamps, not generated stills.

## Human review prompts

1. Light ceramic vs sugar/plastic, including the remaining M1 pin-specks.
2. Dark saturation: readable color vs neon on `#090B0D`.
3. MASTER Light phase-dip (board 02 · 0.5): acceptable calm field, or too empty.
4. Dark 180/96 DRIVE/BRAND_WIDE readability (board 13) — M1 limitation, not claimed fixed by color.
5. SINGLE slash width/tilt (~20° from vertical in Z-up actor space).
6. Complex as one material vs separately painted icons.

No aesthetic approval is inferred. Status: **MACHINE PASS / HUMAN REVIEW REQUIRED**.
