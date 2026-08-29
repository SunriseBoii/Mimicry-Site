# PS-04.M3 visual review

Boards are real browser/WebGL stills composed by `build-visual-boards.py`. Timed evidence is (a) PNG sequences with timestamps, (b) VP8 WebM at 25 fps container rate. WebM was not played as a movie in this session; duration was measured with ffprobe and sampled with ffmpeg stills. Screenshot sequences ran at ~8 Hz because Playwright PNG encode is slower than 33 ms, so they are **not** claimed as 30 fps live.

Owner permission to continue from M2 does **not** approve every new motion.

## Boards

| Board | Review |
| --- | --- |
| 01 | M2 route Light vs M3 identity overlay at color phase 0.25: same MASTER silhouette and field. M3 `m2-reference` stills were captured with the color wave running, so they are not a locked-phase pixel match to the M2 route still. Bypass identity is the fair overlay-off check. |
| 02 | MASTER breath min/base/max, both themes. ±1.2% is calm; no particle spray. Light remains quieter than Dark (M2). |
| 03 | MASTER yaw 0/90/179/180/270/359 Light/Dark. Color field rotates with the skin. 0° and 359° match. 179/180 are not a silhouette-only skip of persistent IDs. |
| 04–06 | All seven SINGLE canonical/alternate, both themes, at rock envelope (breath 0.25, rock 0.25). Objects stay recognizable; no unplanned backs. |
| 07 | FOCUS/GATHER/DRIVE share one actor and one field; BRAND_WIDE is a row of components on the same pivot. Dark 96/180 readability is unchanged (M1/M2). |
| 08 | MASTER→EVENT at real windows: pre still spherical; regroup/reveal keep source colors until target takes over; settle is EVENT. Figcaption family becomes SINGLE as soon as the target is requested. |
| 09 | MASTER at yaw 179° before click. Sequence + 7.88 s WebM cover the morph. Sequence frame 000 was overwritten after compile; use `handoff-179-before.png` as the true pre-click still. |
| 10 | 180/96/390 and hero desktop/mobile. Copy/CTA stay left; actor right. Breath is small enough that hero copy is not covered in the captured envelopes. 96 Dark DRIVE parts stay dim. Hero stills show `0 LAST DRAW` from demand-loop publish before the first counted draw; actor is visible. Preview meta was later split into last-draw vs no-new-frame. |
| 11 | Reduced (identity idle), pause, hidden freeze, context restore during Dark retarget, DPR 1/2, side-by-side shared session. |

## Sequences and clips

| Evidence | Rate / duration | Review |
| --- | --- | --- |
| `sequences/handoff-179` | 90 PNG, ~8 Hz, 11.7 s | Sphere → EVENT; residual yaw is corrected while still spherical; no snap to identity before morph. |
| `sequences/retarget-abc` | 90 PNG | Last request (EVENT) wins. Frame 4 has a 1.4 s gap at the second click. |
| `sequences/focus-gather-drive` | 60 PNG | Same-mask compound morph, Dark. |
| `sequences/phase-boundaries` | 14 deterministic t marks | Matches frozen windows. |
| `sequences/master-yaw-probes` | 6 angles | GPU/time probes of the turn. |
| `sequences/master-color-survey` | 65 PNG, 4 Hz, 32 s | Labeled survey, not 30 fps. |
| `sequences/single-rock-excerpt` | 120 PNG, ~8 s | Partial 26 s rock. |
| `video/master-idle-32s-realtime.webm` | 37.16 s @ 25 fps | Includes ~5 s load. Sampled t=16 and t=30: MASTER present, Combined/Both. |
| `video/single-content-rock-26s-realtime.webm` | 28.36 s @ 25 fps | Realtime rock + breath + color. |
| `video/handoff-179-realtime.webm` | 7.88 s @ 25 fps | Morph is after waitReady, not at t=0 of the file. |
| `video/retarget-abc-realtime.webm` | 9.8 s | A→B→C. |
| `video/focus-gather-drive-realtime.webm` | 10.0 s | Dark compound. |
| `video/master-turn-15s-ACCELERATED-NOT-REALTIME.webm` | 19.56 s | Labeled accelerated. Not a watched 180 s turn. |

**180 s MASTER turn:** not watched end-to-end. Covered by yaw stills, GPU/time probes, and the labeled accelerated clip.

## Human review prompts

1. Is MASTER ±1.2% / 180 s turn calm enough, or too slow/too much?
2. Large-yaw MASTER→object: residual correction during the spherical window — acceptable or a visible spin?
3. 180 breath-only / 96 idle-off: keep as profile policy?
4. Carry-forward: Light pin-specks, MASTER Light phase-dip, small Dark 180/96.

No aesthetic approval is inferred. Status: **MACHINE PASS / HUMAN REVIEW REQUIRED**.
