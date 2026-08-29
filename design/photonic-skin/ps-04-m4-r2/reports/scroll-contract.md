# Canonical scroll (R2 delta)

Unchanged from M4/R1:

- One document vertical scroll.
- Sticky horizontal chapters `03`, `05`, `06` via `--m4-ch-*-x`.
- Canonical layout: one viewport-height per unlocked node.
- Active-node hysteresis 0.12 × vh.
- Unlock compensation restores the current semantic node without a layout jump.
- `document` `scroll-behavior` forced to `auto` during programmatic/magnetic rAF; not `scroll-snap-type: y mandatory`.

R2 adds proximity magnetism inside the same controller. Keyboard arrows/Page/Home/End remain programmatic `scrollToNode`. Space is native user scroll. Graph/header `navigate` uses programmatic origin.
