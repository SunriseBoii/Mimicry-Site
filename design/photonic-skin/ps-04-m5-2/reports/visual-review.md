# PS‑04.M5.2 — Visual review

Offline projector boards use the frozen M3.1R camera rig and presentation frame. Browser boards (Light/Dark, HUD, shader) are captured from `/visual-lab/photonic-skin-ps04-m5/event-sandbox`.

## Canonical, same camera, same slot

| Variant | Offline labelled | Offline unlabelled | Notes |
| --- | --- | --- | --- |
| BASELINE | `renders/boards/baseline-canonical-labelled.png` | `renders/boards/baseline-canonical-unlabelled.png` | Closed pavilion wall with a hole. Figures sit on the far (+Y) side, so canonical (−Y) camera looks at a face/mask-like front. |
| EVENT_A | `renders/boards/a-canonical-labelled.png` | `renders/boards/a-canonical-unlabelled.png` | Same frozen Event, +180° world Z. People move in front of the arch. Diagnostic only. |
| EVENT_B | `renders/boards/b-canonical-labelled.png` | `renders/boards/b-canonical-unlabelled.png` | Open two-post + lintel, low deck, three thick figures on the camera-facing edge. |
| EVENT_C | `renders/boards/c-canonical-labelled.png` | `renders/boards/c-canonical-unlabelled.png` | Four islands: three foreground figures, stage/arch behind. |

Four-up: `renders/boards/four-up-canonical-labelled.png`, `renders/boards/four-up-canonical-unlabelled.png`.

## Opposite / side / top

Same actor slot, same projector, no per-screenshot yaw hacks.

- Opposite: `renders/boards/four-up-opposite.png`
- Side: `renders/boards/four-up-side.png`
- Top: `renders/boards/four-up-top.png`

EVENT_A opposite recovers the baseline “wall in front” reading (invertibility). B/C opposite still shows an open frame rather than a closed cylinder.

## Light / Dark (browser)

Captured from the sandbox shader (Event palette `#F86927` unchanged):

- `baseline-canonical-light.png` / `baseline-canonical-dark.png`
- `a-rotate180-canonical-light.png` / `a-rotate180-canonical-dark.png`
- `b-open-stage-canonical-light.png` / `b-open-stage-canonical-dark.png`
- `c-four-islands-canonical-light.png` / `c-four-islands-canonical-dark.png`

## Silhouettes 180 / 96 (binary, light-independent)

- `renders/silhouettes/{baseline,a,b,c}-silhouette180-canonical.png`
- `renders/silhouettes/{baseline,a,b,c}-silhouette96-canonical.png`
- Four-up: `renders/boards/four-up-silhouette-180.png`, `renders/boards/four-up-silhouette-96.png`

At 180 px, C still shows three masses plus an open lintel. At 96 px the opening remains as negative space; people merge into chunky lobes. B at 180 px can read as a heavier block because the connected deck fills splat coverage.

## LOD prefixes B / C

`renders/lod/b-lod-{512…16384}.png` and `c-lod-*.png`, plus `renders/boards/b-all-lod-prefixes.png` / `c-all-lod-prefixes.png`.

Machine: every prefix contains stage + centre + left + right. No contiguous ID block that drops people at 512.

## Transitions (browser WebM)

Played at `playbackRate = 1` until `ended` (see `reports/video-playback.json`):

- Design → Event → Games for BASELINE/A/B/C
- reverse around Event for A/B/C
- 5 s idle Event for B/C
- rapid retarget around Event (PS04-M5-R001 not fixed)
- reduced motion Event

## Isolation boards

- M5.1 route: `renders/boards/18-m51-route-regression.png` (HUD `PS-04.M5.1`, Hero MASTER sphere)
- Production `/`: `renders/boards/19-production-homepage.png` (SiteShell, no photonic lab)
- Footer no actor: `renders/boards/20-footer-no-actor.png` (`0 draw / 0 tri`)
- Context restore: `renders/boards/21-context-restore.png` (EVENT_C unlabelled Event palette `#F86927`, actor visible after restore)

## Human reading (not a canonical selection)

- BASELINE remains the unreadable closed pavilion / mask front.
- EVENT_A proves the frozen Event *does* contain people; they were on the far side of the wall.
- EVENT_B removes the closed wall and puts people on the apron. Figures are still very simplified (head + torso) and can read as pawns at small sizes.
- EVENT_C is the clearest “people in front, stage as context” reading, with four spatially separate masses.

Final Event choice is human.
