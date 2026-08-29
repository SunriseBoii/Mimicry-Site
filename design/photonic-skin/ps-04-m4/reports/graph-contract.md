# PS-04.M4 progress graph

Fixed right-edge SVG + HTML hit targets. Outer box `88×268` CSS px (56 px on narrow). Inner camera follows the active node; reduced motion snaps.

## Geometry

Registry coordinates. Horizontal/vertical segments and 90° elbows only. Traveler interpolates Manhattan length along the active orthogonal edge, including horizontal edges driven by vertical document progress inside pinned chapters.

## States

- Static nodes: solid rings regardless of visit.
- `03.2` / `03.3` locked: dashed, `aria-disabled`, not activatable.
- After unlock: solid, navigable.
- Active: ring + inner marker, `aria-current="step"`.
- Focus: `:focus-visible` outline, distinct from the active marker.
- No invented eighth status color. Neutral / theme-aware `currentColor`.
- Modal/case items have no rings.

## Distance fade

Shortest topology-edge distance from the active node:

| d | opacity |
| --- | --- |
| 0 | 1 |
| 1 | 0.68 |
| 2 | 0.34 |
| 3 | 0.12 |
| >3 | 0 |

Connectors inherit `min(endpoint opacities)`. Hidden nodes: `display:none`, `tabIndex=-1`, not clickable.

## Accessibility

`role="navigation"` `aria-label="Прогресс маршрута, ортогональный граф экранов"`. Each hit has `aria-label` with screen name and `N из 18`. No live-region chatter per scroll pixel. Forced-colors uses `CanvasText`.
