# Point vs flake — root cause (EVENT_A)

**Cause ID:** `empty-visibleProfiles-forces-minimumGeometricScale`

Frozen `single-event` `componentMap` leaves semantic `figure-left` (component 2, eventPart 2, active 1014) with **empty `visibleProfiles`**. After EVENT_A's rigid +180° around +Z this component is **viewer-right** (largest canonical screen-space X).

GPU packing (`packStateInto`) adds `+256` to `meta.w` only when the component is in `visibleComponents(profile)`. The vertex shader then does:

```
sourceVisible = step(255.5, meta.w)
activation    = statusActive * sourceVisible
radius        = scale * mix(minimumGeometricScale=0.18, 1, activation) * OctahedronGeometry(0.035) * presentationFrame.scale
```

Settled A therefore draws viewer-right at **18% instance radius**. Viewer-left (`figure-right`, component 4) and viewer-centre (`figure-centre`, component 3) remain on desktop `visibleProfiles` and render as full octahedral flakes.

| Role | Semantic | Component | Screen X | Desktop visible | Packed footprint | If force-visible |
| --- | --- | --- | --- | --- | --- | --- |
| viewer-left | figure-right | 4 | 153.26 | True | 0.04973 | 0.04973 |
| viewer-centre | figure-centre | 3 | 259.48 | True | 0.04973 | 0.04973 |
| viewer-right | figure-left | 2 | 367.46 | False | 0.00895 | 0.04973 |

R1 changed component 4 (viewer-left) and left this path untouched. A binary silhouette of a force-visible cloud cannot see a 0.18 GPU scale.

This is **not** a request to change camera, global particle size, exposure, DPR, or the material shader. A-R2 must (1) unhide `VIEWER_RIGHT_COMPONENT` in the sandbox overlay `componentMap`, and (2) rebuild those 1014 records as a compact pawn-like flake surface starting from original EVENT_A.

Authoring may proceed: **True**
