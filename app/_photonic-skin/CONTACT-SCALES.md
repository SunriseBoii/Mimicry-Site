# Connected scales on the production mimic

The home page enables `refinedScales` on the existing Final R2 renderer. Every particle keeps its identity, position, orientation, scale, activation, motion program, timing and idle transform. The uniform scale multiplier remains **1.0**. Fitting changes the tile contour, not the motion evaluator.

`contact-surface.ts` reconstructs neighbour triangles within each component and shell. A worker builds a dual tile around each active particle. Neighbours share triangle centroids and edge midpoints, including at curved and concave joins. Small triangulation conflicts are repaired before local edge flips improve the patches. Multiple fans touching at one particle use separate closed loops with degenerate connectors.

The expensive neighbour search and repair now run **offline** (`npm run build:contact-topology`). The 384 Final R2 states have versioned, gzip-compressed connectivity files in `public/photonic-skin/contact-v1`, keyed by the SHA-256 of the fully patched source geometry. Only a requested shape and its immediate prewarm neighbours are downloaded. The worker restores the exact floating-point contours from this connectivity; coordinates are not quantized. Generation compares the entire restored surface against the original reconstruction for every state.

Assets validate their version, source hash, layout, active identities, coverage and closed edges. A missing, stale or invalid asset falls back to the original reconstruction. When changing the fitting algorithm, bump the asset directory/magic in `contact-topology.ts` and regenerate the files. Reused workers avoid repeated module startup. Concurrent click/prewarm loads share one request; aborting the final consumer stops obsolete work without cancelling another consumer's request.

The outer edges meet at rest. Each tile has a broad raised face and a narrow bevel. During the first 14% of a transition it releases to the original diamond roof; during the last 14% it fits the destination contour. Gaps during motion are intentional. There is no opaque sphere, hidden backing mesh or replacement volume morph.

Contour pages share the existing source/target position samplers; the first 128×128 page retains the exact motion texels. The atlas and draw range use the actual maximum contour size of the bound pair. Contour memory is included in cache accounting and excluded from motion-worker messages.

The master palette is a continuous blue–violet–cyan cycle. Competency pigments retain their meaning. Material settings and reflected studio strips are scoped to the refined renderer.

Final R2 playback suppresses the short whole-actor anticipation rotation and translation (`playback-program.ts`). The particle tracks, phase windows and duration remain unchanged. The renderer and live retarget capture receive the same adjusted program, so rapid direction changes cannot reintroduce the removed tilt through a CPU snapshot. Cached compiler output stays immutable.

Validation:

- `npm test` includes coincident world-space seam checks on the sphere, book and camera, immutable motion data checks, and the original navigation/retarget tests.
- `node --import tsx scripts/validate-contact-surface.ts --all` loads all 384 hash-verified Final R2 states, checks topology and active coverage, and writes `artifacts/contact-scales/topology.json`.
- `npm run typecheck` and `npm run build` validate the production entry and worker bundles.
- `node --import tsx scripts/benchmark-contact-preparation.ts --optimized` measures preparation and checks surface hashes against the accepted baseline. Run without the flag only when intentionally recording a new baseline.

Topology checks establish closed shared edges. They are not an exhaustive image or global self-intersection proof of every animated frame. During visual QA, inspect thin rims, component junctions, both themes, and rapid direction changes as well as the sphere.
