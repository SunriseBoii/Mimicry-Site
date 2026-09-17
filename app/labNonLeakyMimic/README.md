# Non-leaky Mimic experiment

Route: `/labNonLeakyMimic`. This directory is isolated from the production renderer.

## Decision

The release renderer places independent rigid diamonds on point samples. Increasing their size cannot guarantee coverage when density, orientation, component membership and particle activation change. This experiment instead reconstructs a continuous opaque body and renders the diamonds as a tessellating material relief. **These are not individually moving 3D scales.** Their shared zero-height boundaries never discard pixels or change opacity.

All 384 Final R2 states are loaded using the existing hash-verified loader, including Event and Video patches, active/reserve flags, component visibility and presentation frames. A cancellable worker constructs a 96³ oriented-sample shell, fills enclosed interiors, and keeps intentional openings that remain connected to the exterior. The GPU traces its implicit surface, with alpha 1 at every hit. The scale pattern uses blended planar projections so it works for arbitrary shapes and viewpoints without UV unwrapping. A positive bounding field keeps the isosurface closed throughout interpolation.

State changes interpolate volumes with a temporary volume bridge, not the production particle trajectories. A mid-transition selection captures the displayed field (including its bridge) before retargeting. Reduced-motion users receive settled states immediately; playback remains available on explicit request. Rendering sleeps visually when unchanged, pauses while the document is hidden, and releases textures/workers on cleanup. Eight reconstructed states are cached.

## Tradeoffs

- Grid reconstruction rounds corners and can merge features/gaps smaller than roughly two voxels. This is a visual experiment, not byte-exact reproduction of the original silhouette.
- Scale relief currently changes material normals, not silhouette geometry. Blending projection directions can soften the diamond pattern near projection seams.
- The volume morph changes the motion language. Complex intermediate shapes may swell or merge; original particle timing and identities are not retained.
- First selection builds a volume in a worker (several seconds on the development machine). Requires WebGL 2 and linear float texture filtering.
- The whole volume remains opaque. Deliberate openings and spaces between separate objects still show the background.

## Validation

`npx tsx --test tests/non-leaky-surface.test.ts` checks solid sphere interiors, endpoint-exact interpolation, captured morph fields and invalid inputs.

`npx tsx scripts/validate-non-leaky.ts` loads every patched state and checks finite/nonempty fields, positive boundaries and uncropped geometry. It builds the eight base forms at 96³, combinations at 24³, and writes `artifacts/non-leaky-mimic/validation.json`. This does not claim exhaustive visual testing of 384 × 384 transitions.

Browser checks: sphere/light/dark on contrast background, Video, Event with its intentional arch opening, and a paused Video → Event intermediate frame. TypeScript, scoped ESLint and production build are also checked.
