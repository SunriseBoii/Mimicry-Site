# Preparation latency — 2026-09-17

The accepted contour coordinates, scale sizes, materials, motion programs and timing are preserved. Connectivity is generated offline for all 384 Final R2 states, stored by the fully patched source hash, and restored in a reused worker. Concurrent prewarm/click state loads share work with independent cancellation. Missing or invalid topology assets retain the original reconstruction fallback.

## Measurements

Local desktop, same dev server/browser, screen 03.2. These are observed cases, not statistical percentiles or network/device-independent guarantees.

| Case | Before | After |
| --- | ---: | ---: |
| Rapid addition: Content → Content + Merch → Content + Design + Merch; previously unprepared final combination | 2,387.5 ms | 674.6 ms |
| Remove Design from that combination after neighbour prewarm | — | 22.9 ms |
| Rapid removal back to an empty selection | — | 707.5 ms |
| Rapid Video + Digital selection, mobile viewport / smaller cache budget | — | 761.5 ms |

Browser values come from the existing `data-first-visible-ms` metric, with `data-gpu-target` and completed GPU progress checked against the actual selection. The first comparison improves startup by about 3.5×. A mobile viewport tests responsive behaviour and cache policy, not the CPU speed of a physical phone.

Separate Node measurements (`preparation-baseline.json`, `preparation-optimized.json`) include disk read/decompression for the optimized topology path:

| Shape | Original fitting | Restore prepared connectivity |
| --- | ---: | ---: |
| Master | 648 ms | 64 ms |
| Content | 1,074 ms | 84 ms |
| Event | 1,309 ms | 115 ms |
| Video | 2,380 ms | 97 ms |
| Content + Design + Merch | 1,411 ms | 85 ms |
| Content + Event + Video | 2,237 ms | 96 ms |

All six surface hashes match the pre-optimization baseline. Motion compilation remains around 0.11–0.16 seconds in these Node cases; live retargeting and first GPU upload also contribute to browser startup.

## Validation

- Generated and compared all 384 restored surfaces against full reconstruction, including every Float32 contour coordinate and topology statistic (`precomputed-topology.json`).
- 426 tests passed, including exact contact round-trips, coincident seams, invalid assets, concurrent loading, independent cancellation and rapid-request replacement.
- Production build, TypeScript and scoped ESLint passed.
- Desktop and mobile viewport checks: selection, deselection, rapid retargeting, return to empty selection, settled geometry, no new console errors. Existing Three.Clock deprecation warning remains.

The 384 connectivity assets total 70,981,916 compressed bytes on disk. They are fetched per requested state / immediate neighbour, not as a single download. One state is approximately 66–187 KB. Content-addressed URLs permit browser caching. Regenerate with `npm run build:contact-topology` after changing source geometry or the topology algorithm; increment the topology version for algorithm changes.
