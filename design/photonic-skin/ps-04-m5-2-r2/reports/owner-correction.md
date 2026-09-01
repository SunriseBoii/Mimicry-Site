# Owner correction — PS-04.M5.2.R2

R1 changed the wrong figure.

## What R1 actually edited

After EVENT_A's rigid +180° around +Z, semantic names are not screen-space names.

Canonical-camera proof (`reports/screen-space-part-map.json`):

| Viewer role | Semantic name | Component | eventPart | Active | Canonical screen X |
| --- | --- | --- | --- | --- | --- |
| viewer-left | figure-right | 4 | 3 | 890 | smallest |
| viewer-centre | figure-centre | 3 | 1 | 1205 | middle |
| viewer-right | figure-left | 2 | 2 | 1014 | largest |

R1 targeted `COMPONENT_RIGHT = 4` / `figure-right`. That is **viewer-left** after the +180° yaw. The geometric result is kept in history as a rejected mapping experiment. It is not the source of A-R2.

## What R2 edits

`VIEWER_RIGHT_COMPONENT = 2`  
`VIEWER_RIGHT_EVENT_PART = 2`  
`SEMANTIC_FIGURE_LEFT_COMPONENT = 2`  
active 1014

Source chain:

```text
frozen BASELINE
→ EVENT_A rigid +180° Z
→ selective VIEWER-RIGHT figure refinement
→ EVENT_A_R2
```

`EVENT_A_R2 geometry source = byte-exact original EVENT_A`  
`EVENT_A_R2 geometry source ≠ EVENT_A_R1`

Viewer-left / component 4 is byte-identical to original EVENT_A. R1's pawn is not inherited.

## Why the figure looked like points

Frozen `single-event` `componentMap` leaves component 2 with empty `visibleProfiles`. GPU packing omits the +256 visibility bit, settled activation is 0, and instance radius collapses to `minimumGeometricScale = 0.18`. That is the point-cloud. Unhiding that component in the A-R2 overlay, plus a compact pawn resampling of the same 1014 IDs, restores octahedral flakes. Scale/density fields and the global shader are unchanged.
