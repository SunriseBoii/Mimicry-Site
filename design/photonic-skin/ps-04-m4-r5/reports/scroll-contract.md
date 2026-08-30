# Scroll contract — PS-04.M4.R5

One document-vertical scroll. Horizontal sticky chapters via document scroll. Footer has no Mimic; session stays mounted.

NavigationDirector:

- Slow adjacent: stable intent (~48 ms) then one actor revision.
- Fast skip (`fastGesture` or graph distance ≥ 2): coalesce until input idle, then one stable-source → final-target transformation. Intermediate SINGLEs do not request geometry.
- Reverse of a running pair is coalesced (no stale queue).
- Programmatic `scrollToNode(..., "auto")` that finishes into idle still requests the committed node if it differs from the displayed endpoint.
- Same semantic target is a no-op.
