# Magnetism A/B — PS-04.M4.R5

Geometry rollback is fixed by GeometryAuthority, not by longer snap.

Variants in `MAGNETISM_VARIANTS` (`?magnetism=a|b|c`):

| Variant | input idle | activation radius | snap duration |
| --- | ---: | ---: | ---: |
| A (R4 baseline) | 160 ms | 0.25 × vh | 340 ms |
| B coordinated | 160 ms | 0.28 × vh | 440 ms |
| C calm | 175 ms | 0.30 × vh | 520 ms |

**Selected: A.** After the geometry hold/bind fix, A remains the least intrusive. B/C increase snap duration and radius; they were not used to hide rollback. `SELECTED_MAGNETISM_VARIANT = "a"`. Default lab tokens match A.

Videos `magnetism-baseline.webm` and `magnetism-selected.webm` both use A. Cancellation on new user input remains. No `scroll-snap-type: mandatory`, no wheel `preventDefault`, no nested scroller, no hard paging.
