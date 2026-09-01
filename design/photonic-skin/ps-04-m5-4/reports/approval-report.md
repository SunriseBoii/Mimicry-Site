# PS-04.M5.4 — Approval report

## Verdict

**PS-04.M5.4 — HUMAN PASS / SELECTED M5 FRAMING PROFILE**

Selected profile: `OWNER_SELECTED_124_111_111` (About 124 / Merch 111 / Video 111 desktop; mobile caps 118 / 108 / 108). BALANCED_REVIEW remains evidence only, not the selected profile.

## Scope

Presentation framing only: Three.js `PerspectiveCamera.zoom` as a frustum multiplier (same operator as OrthographicCamera.zoom). Frozen photonic camera remains perspective, FOV 33°, pose unchanged. Actor mesh scale remains `siteFitScale`. Screen slots and M5.1 choreography are unchanged.

## M5.3.R1 close

- selectedCandidate: `VIDEO_COMBO_40_R1`
- hash: `2d6957815b6f58f87f1709e0378313cba271530b8fb0e02282b556780448a873`
- composition yaw: −40°
- clapper open angle: 30°
- checkpoint: `af13e9df27be788f8295900d1d7a021bca699998`
- canonical promotion deferred to PS-04.M5.5
- production approval: false

## Screen mapping (runtime)

| Screen | nodeId | geometryId | slot | framed |
|---|---|---|---|---|
| About | `02` | `brand-wide-gather-content-design-digital-event-games-merch-video` | right | yes |
| Merch | `05.7` | `single-merch` | left | yes |
| Video | `05.5` | `single-video` overlay `VIDEO_COMBO_40_R1` | left | yes |
| Hero | `01` | `master-neutral` | right | no |
| Footer | `08` | none | none | no |

About zoom is bound to node `02` + settled BRAND_WIDE geometry. Other BRAND_WIDE family uses stay at zoom 1.

## Review URLs

- `/visual-lab/photonic-skin-ps04-m5/framing-sandbox?screen=about&aboutZoom=118&merchZoom=108&videoZoom=108&viewport=current&diagnostic=final&theme=light&mode=settled`
- `/visual-lab/photonic-skin-ps04-m5/framing-sandbox/preview`

Production `/` remains SiteShell.

## Human selection recorded

```text
selectedProfile = OWNER_SELECTED_124_111_111
aboutRequestedZoom = 1.24
aboutMobileCap = 1.18
merchRequestedZoom = 1.11
merchMobileCap = 1.08
videoRequestedZoom = 1.11
videoMobileCap = 1.08
notProductionApproval = true
promotionTarget = PS-04.M5.5
m55Started = false
```

See `reports/human-review.md`. Canonical promotion remains deferred to PS-04.M5.5.
