# PS-04.M4 accessibility

## Keyboard

Skip link «К содержанию». Header buttons, graph hits (visible unlocked only), screen headings, task/competence controls, dialog trap + Escape + return focus. Arrows / Page / Home / End drive the canonical controller. Overlay blocks page keys while open.

## Semantics

- One header (`data-qa=m4-header`). Graph `role="navigation"`. Active graph node `aria-current="step"`. Locked rings `aria-disabled`. Hidden d>3 nodes not in tab order.
- Header `aria-current` marks the **section group**, graph marks the **screen**. They do not share a single `aria-current` owner.
- Form errors `role="alert"` with text. Success `role="status"`. Contact `role="dialog"` `aria-modal`.
- No live-region announcements per scroll pixel.

## Motion / contrast

Reduced motion: actor/graph jump to endpoints, idle identity, content route remains. Dark first paint uses M1 paper `#090B0D` (`rgb(9, 11, 13)`). Forced-colors stills show rings and buttons against Canvas. Zoom 200% still captured.

## Touch

Pinned chapters use `touch-action: pan-y`. Inner carousels `pan-x` + `overscroll-behavior: contain`. No pointer-only controls.

## Limits (human)

390×844 is **emulated**, not a physical device. Header wrap + graph reserve are tight; Event chapter stills can show neighbouring panel during continuous chapter translate — that is the sticky-track model, not a second scroller. Next.js dev indicator is present on `next dev` captures.
