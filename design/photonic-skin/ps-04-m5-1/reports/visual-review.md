# PS‑04.M5.1 visual review

**Status: MACHINE PASS / HUMAN REVIEW REQUIRED.** Aesthetics are not auto-approved. This is not production approval.

Method: Playwright Edge/ANGLE D3D11 capture, 10 fps stills during the live transition window, ffmpeg `fps=10` strips from the named WebMs, and Chromium `HTMLVideoElement` playback at `playbackRate = 1` until `ended`. File presence is not treated as review.

## Required videos

All ten required clips exist and were played at 1× until end in this session (`reports/video-playback.json`).

| Clip | 1× ended | Notes from live probes / playback stills |
| --- | --- | --- |
| `cases-to-content.webm` | yes | Right MASTER sphere → left SINGLE book. Mid-morph HUD `g 0.71 · p 0.71`. No center hold. |
| `content-to-cases.webm` | yes | Reverse of the above. Trace ends `x=1078.8` right MASTER. |
| `content-to-design.webm` | yes | Prepare frame `g 0.00 · p 0.00` keeps the content-blue book; Design copy may already be on screen because `scrollToNode(..., "auto")` jumps the document. Purple does not paint a source sphere. |
| `seven-singles.webm` | yes | Seven SINGLEs forward then reverse; actor stays left; two geometry IDs per hop. |
| `merch-to-team.webm` | yes | Left merch primitives travel to right MASTER. Early morph `g 0.15 · p 0.01`. Mid velocity +7.5 px/frame. |
| `team-to-merch.webm` | yes | Reverse; settles left `single-merch`. |
| `rapid-latest-target.webm` | yes | Final node `05.5` / `single-video`. No third ID on a single hop. |
| `full-down-up.webm` | yes | Footer `0 draw / 0 tri / 0 px`; return `1 draw`. |
| `reduced-motion.webm` | yes | Atomic g/p/s = 1; 21 trace frames; no delayed morph. |
| `context-restore.webm` | yes | After restore: `1 draw`, `131072` tri, `96771` visible pixels. |

Extra QA clips also played at 1×: keyboard (`03.1`), graph jump (`02`), scroll jitter (active node stayed `04`), cold navigation to Content.

## Defect A — target color lead

Confirmed gone on the sampled morph windows:

- Content→Design prepare: source book + source blue, `p 0.00` while `g 0.00`.
- Content→Design early morph: `g 0.07 · p 0.00`, then `g 0.39 · p 0.24` (palette behind geometry).
- Cases→Content mid: `g 0.71 · p 0.71` after the `min(geometry, delayed)` clamp.
- Coordinator traces: `paletteLeads = 0` on every captured clip.

Named videos include cold-load setup, so a 50% playback still can still show Hero. The 10 fps probes taken *after* `scrollToNode(target)` are the morph evidence.

## Defect B — center dwell

Interior window (`positionProgress` 0.2–0.8), viewport-normalized ε = `0.004`:

- Cases→Content: 57 interior frames, `interiorDwellOver2 = 0`, midpoint velocity **−8.2 px/frame**, settle `x=352.8` left.
- Merch→Team: 62 interior frames, `interiorDwellOver2 = 0`, max interior hold 1 frame, midpoint velocity **+7.5 px/frame**, settle `x=1078.8` right.

Ease-in/out near the slot endpoints still has near-zero ΔX (C2 `smooth5`). That is not a center settle: X is at the source or target slot, not the viewport midpoint.

## Actor visibility

Hero / DPR 1 / Dark / mobile boards show a real Mimic. Footer board HUD: `0 draw / 0 tri`, `slot none`. Context restore silhouette pass with ~97k pixels. First lab-smoke silhouette helper returned `null` (counted as 0 in a conservative formula); later waits and boards contradict a missing actor.

## Theme / reduced / DPR

Light and Dark SINGLE boards exist. Mobile 390×844 Hero actor is visible. Reduced-motion clip snaps without a long morph and without a center node.
