# M4.R2 soft screen magnetism

Magnetism lives inside `ScrollCompositionController`. There is no second snap controller and no CSS `scroll-snap-type`.

## Modes

`idle | user | magnetic | programmatic | restore`

- **user** — wheel, touch, pointer, keyboard, scrollbar. Cancels an in-flight magnetic rAF, bumps `magnetToken`, records direction/velocity.
- **magnetic** — only after user input idles (`scrollend` when present, else 160 ms debounce).
- **programmatic** — header, graph, keyboard node jumps. Exact canonical anchor. Latest request wins. Same-target no-op. No follow-up magnetic snap.
- **restore** — history/deep-link/resize. Same as programmatic for targeting; no intermediate snap nodes.

## Lab parameters (starting, not final tokens)

| Token | Value |
| --- | --- |
| `inputIdleMs` | 160 |
| `activationRadiusFactor` | 0.25 × viewport height |
| `noopDistancePx` | 2 CSS px |
| `snapDurationMs` | 340 |
| easing | cubic ease-out `1-(1-t)³`, monotonic, no overshoot |
| `maxProjectionFactor` | 0.18 × vh |
| `fastVelocityPxPerMs` | 0.85 |
| `directionConfidencePx` | 28 |
| `unlockSettleMs` | 48 |

## Candidate selection

Canonical topology anchors only. Candidate must be in the registry, unlocked, not `03.3A`/`03.3B`, and current or adjacent topology node (one edge). Horizontal chapters `03`, `05`, `06` snap by changing document `scrollY`. Locked `03.2`/`03.3` are excluded until unlock.

Fast gesture: do not snap against last confident direction. After a full stop, nearest eligible anchor wins if inside the radius; otherwise no snap.

## Suppression

Dialog, pointer held, input/textarea/select/contentEditable, text selection, hidden document, layout settling after unlock, unmounted route. Reduced motion: immediate `scrollTo` auto, no magnetic rAF.
