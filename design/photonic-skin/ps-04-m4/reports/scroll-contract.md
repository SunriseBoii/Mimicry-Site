# PS-04.M4 scroll contract

## Architecture choice

One **document** vertical scroll. Horizontal chapters are **sticky `100svh` tracks** whose panels `translate3d` from `--m4-ch-0{3,5,6}-x`.

Not three nested wheel-trapping scrollers. No added scroll library.

Native horizontal overflow exists only on inner case carousels (`touch-action: pan-x`, `overscroll-behavior: contain`). A vertical wheel inside a pinned chapter still advances `window.scrollY` (smoke: `6410 → 7810` on chapter `05`, node `05.4 → 05.5`).

## Physical → node / edge

`canonicalLayout(vh, unlock)` assigns each unlocked node a monotonic `[start, start+vh)` range. Horizontal chapters consume `panelCount * vh` of document height.

`mapScrollToProgress`:

- hysteresis `0.12 * vh` so a one-pixel boundary does not flip neighbours;
- long jumps (`|Δindex| > 1`) use the raw segment so direct header/graph navigation lands on the target;
- last segment always maps to the last unlocked node (footer);
- programmatic `scrollToNode` uses `restoreScrollY(..., 0)` which pads `+ hysteresis + 2px` into the segment, and forces `html` `scroll-behavior: auto` when the caller asked for `auto` (global CSS `html { scroll-behavior: smooth }` would otherwise keep animating).

`edgeProgress` is `(scrollY - active.start) / active.length` toward the next node. In a pinned chapter the same vertical document progress drives `--m4-ch-*-x`, so the graph traveler moves on the horizontal edge.

Unlock compensation: `useLayoutEffect` → `setUnlock` → `compensateUnlock` restores the previous node + edge so adding `03.2`/`03.3` does not jump the current screen. Chapter height is also written on the `03` section from `nodes.length` in the same React commit.

## Controller

`ScrollCompositionController`:

- passive `scroll` + one RAF;
- CSS variables written once per frame;
- React `setState` only on discrete node / neighbour change;
- canonical targets for header, graph, hero anchors, and keyboard.

Keyboard: arrows / PageUp / PageDown / Home / End. Skip link to `#m4-main`.
