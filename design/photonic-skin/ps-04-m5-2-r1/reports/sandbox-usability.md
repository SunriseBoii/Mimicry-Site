# Sandbox usability — PS-04.M5.2.R1

## Root cause

Variant clicks updated React `variant` and `history.replaceState` immediately, but the Mimic buffer lives on `PhotonicMotionSession`. `bootstrapSettled` did not set React state, so Canvas kept the previous source/target until an incidental clock `setUi`. HUD mixed the new requested name with the old overlay hash. There was no `popstate` listener, so Back/Forward and in-page query edits did not replay. `AbortController` + `cache.cancel()` on the combined manifest+variant effect also left loads racing.

## Fix

* Split requested vs displayed variant.
* Latest-selection-wins load gate; stale buffers are not published.
* Atomic publish: `bootstrapSettled` then `displayedVariant` + `bufferHash` + `ready` in the same generation.
* URL via `pushState` / `replaceState` without document navigation; `popstate` restores query state.
* Default route: `a-r1`, canonical, light, final material, settled.
* Control panel labels in Russian, rejected B/C in a secondary group, `aria-pressed` + «Сейчас показан».
* Loading copy: `Загружается EVENT_A_R1…`
* Preview keeps a compact badge (`EVENT_A_R1` + status + «Полная review-панель») and a link back to the full panel.
* Live smoke on `http://127.0.0.1:3000`: default route is A‑R1 settled final material; click A updates Canvas/HUD/hash/query with 0 document reloads.
