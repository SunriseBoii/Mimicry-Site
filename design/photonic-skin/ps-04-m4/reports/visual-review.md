# PS-04.M4 visual review

Stills are real Edge/WebGL from `next dev`. WebM is VP8, recorded at wall-clock 1×, then **played at playbackRate=1 until ended** in Chromium (see `video-playback.json`). This is not the M3 situation where only ffprobe ran.

Next.js dev-indicator “N” is visible on lab stills. It is not part of the composition.

## Boards

Seven collages in `renders/boards/` from the browser PNG pack (hero themes, unlock/contact, seven competencies Light/Dark, studio/footer, viewports/DPR, a11y/lifecycle).

## Stills (selected)

| Evidence | Note |
| --- | --- |
| Hero Light/Dark | Actor right third, header once, local graph. Dark paper `rgb(9,11,13)` = `#090B0D`. Light pin-specks remain (M2/M3). |
| Hero anchors | Build → `03.1`, competence → `05.1`. |
| Task locked / unlock 03.2 / 03.3 | Dashed then solid. Empty confirm has text error. Success overlay; graph probe `03.3`. |
| Cases carousel | Inner cards; no extra graph node. |
| `05.1`–`05.7` Light and Dark | Actor left, copy/cards right. |
| Team/Partners/Clients | Horizontal chapter 06, actor right. |
| Contact → footer | Exit then no Mimic, header+graph remain, reverse returns actor. |
| Viewports | 1920 / 1440 / 1366 / emulated 390; DPR 1.5 and 2. |
| Reduced / forced-colors / zoom 200 / context restore | Rings remain in forced-colors. Context probe `restored`. |
| Production `/` | Untouched homepage still. |

Continuous chapter translate means a rest pose slightly into a segment can show a sliver of the next panel (especially 390 Event). That is the sticky-track model, not a nested scroller. Direct nav later uses hysteresis-skip so it can land flush; some capture stills predate that snap.

## Recordings watched at 1×

| Clip | Duration | Watched |
| --- | --- | --- |
| `full-down-up.webm` | 23.52 s | yes, wall ≈ 23.5 s |
| `chapter-03.webm` | 6.16 s | yes |
| `chapter-05.webm` | 8.56 s | yes |
| `chapter-06.webm` | 5.88 s | yes |
| `chapter` mid-frame | Partners/Clients sliding | feels like one chapter, not a wheel trap |
| `dynamic-unlock.webm` | 6.60 s | 03.2 visible; 03.3 dashed until confirm |
| `rapid-reversal.webm` | 5.60 s | last request wins; not a rewind to stale |
| `footer-exit-return.webm` | 6.40 s | footer has no Mimic at t≈50% |

## Human questions

1. Does the homepage feel like one space, or 18 slides? Horizontal chapters interpolate; some stills show a neighbour sliver.
2. Is the right graph readable without feeling like a metro map? Local ±3 fade is in use.
3. Are dashed `03.2`/`03.3` and the active inner marker obvious in Light and Dark?
4. Is left↔right Mimic travel natural, and is the footer exit calm?
5. Do header and graph steal attention from copy?
6. Did M1–M3 issues (Light pin-specks, Dark small objects, MASTER Light phase) get worse on the page?

No aesthetic approval is inferred.
