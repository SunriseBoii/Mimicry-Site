# PS-04.M4.R3 visual review

Reviewed real Edge/WebGL stills, contact sheets, actor-mask frames, and HTMLVideoElement playback at `playbackRate = 1` until `ended`. PNG existence is not the review.

## User sequence (Cases MASTER → Content → Design → Event → Games → Video)

| Transition | Machine HUD on contact sheet | Eye |
| --- | --- | --- |
| MASTER → Content | `release · g 0.22 · p 0.00 · s 0.00` | Sphere still has mass. Source palette held. Slot has not started (spec: hold source slot through release). Not an empty frame. |
| Content → Design | `reveal · g 0.51 · p 0.51` | Gray source-like mass with target colors on forming particles. Not a fully purple Content bunny. |
| Design → Event | `reveal · g 0.51 · p 0.53` | Mixed field on a still-rebuilding form. Not orange painted onto a finished Design silhouette first. |
| Event → Games | `approach · g 0.69 · p 1.00` | Palette locked by approach (blend window ends at approach[0]=0.62). Gamepad readable; particles still regrouping. |
| Games → Video | contact sheet + WebM | Same-mask-family SINGLE retarget; no third ID. |
| Merch → MASTER | contact sheet | Right-slot MASTER returns. |

## Other evidence

- FOCUS / GATHER / DRIVE / BRAND_WIDE task stills: `task-focus.png` … `task-brand-wide.png`
- Palette-only: `palette-only-content.png`, `palette-only-three.png`
- Right→left: `left-single.png`, `right-master.png`, `left-right-slot-t*.png`
- Light/Dark: `hero-light.png`, `hero-dark.png`
- DPR 1 / 1.5 / 2 and emulated 390 stills captured
- Reduced: `reduced-design.png` (endpoint, overlay off)
- Footer: `footer-no-mimic.png`, `footer-return.png`
- Context restore: `context-restore.png` (`contextState: restored`)
- Preview: `preview-hero.png`
- Production `/`: `production-homepage-untouched.png` is SiteShell, no M4 Canvas

## WebM at 1×

Named review clips: `user-sequence.webm`, `rapid-forward-reverse.webm`, `full-down-up.webm`. Each played at `playbackRate=1` until `ended` (see `video-playback.json`). Playwright leftover `page@*.webm` files were also played; they are capture artifacts, not extra scenarios.

## Human review remaining (not machine FAIL)

- Whether the continuity radius lift feels like swelling or a ghost copy
- Whether holding the source slot through release makes MASTER linger “too long” on Content
- Whether reveal-aligned palette (g≈p≈0.5) is calm enough for B2B, or still slightly mechanical
- Light pin-specks vs R2
- Rapid-20 compile hitch is audible as a pause in WebM; that is frozen compiler cost, not a clock bug
- 390 CTA overlap from R1/R2 is unchanged
