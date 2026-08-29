# PS-04.M4 one-canvas composition contract

## Ownership

| Concern | Owner |
| --- | --- |
| Frozen evaluator / overlay / palette / idle | M3 `PhotonicMotionSession` + copied M3 shader bodies |
| Site placement | M4 `composition.ts` + `applyCompositionViewport` on `onBeforeRender` |
| Camera | Frozen presentation, `aspect = 1`, `up [0,0,1]` |
| Visibility | `instancedMesh.visible = viewport.actorDraw && viewport.visible` |

Composition is applied **once**, after frozen evaluator/M3 overlay, before the default camera projection, as a square scissor/viewport. Identity mode (`?identity=1`) uses the full canvas for M3-parity probes.

Pointer policy: canvas host `pointer-events: none`. Content/header/graph sit above. No card/frame around Mimic.

## Envelopes

`actorSquareCss` targets ~30–36vw on desktop, smaller on 390. Profiles: 1920×1080, 1440×900, 1366×768, 390×844, DPR 1/1.5/2.

Left competency screens: actor left, copy right. Other actor screens: reverse. Footer: full-width copy, no reserved right third.

## Left ↔ right and footer

Visual center lerps with time-constant 0.28 s (latest-request-wins on the actor request). Footer target is an exit placement below/right of the viewport; after 0.72 s or hypot < 12 px the actor is hidden. Reduced motion hides immediately. Reverse scroll clears `offscreen` and restores the previous settled family without remounting Canvas or defaulting to MASTER.

Theme changes do not remount Canvas (`Canvas` key is `profile:dpr` only).
