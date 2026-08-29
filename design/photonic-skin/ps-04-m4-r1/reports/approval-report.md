# PS-04.M4.R1 — Actor Visibility & Semantic Mapping

**Status: MACHINE PASS / HUMAN REVIEW REQUIRED**

Aesthetic size and placement are not auto-approved. Machine gates for visibility, mapping, DPR, frozen hashes, tests, GPU parity, context restore, and production isolation pass.

Previous pack `design/photonic-skin/ps-04-m4/` is unchanged and remains CONDITIONAL evidence, not an accepted M4.

## Git baseline (before this pass)

- Branch: `master`
- HEAD: `f9e45229da988ed1e98fb032f18864af22a0315f`
- No reset / checkout / clean
- Preserved untracked: M4 lab, M4 checkpoint, M4.R1 checkpoint, `docs/mimicry-homepage-topology-checkpoint-2026-08-29.md`

## Root cause

Double application of device pixel ratio:

1. M4 composition pre-multiplied CSS slot by renderer DPR
2. `THREE.WebGLRenderer.setViewport` / `setScissor` multiply by `_pixelRatio` again

At DPR 1 the actor was visible. At DPR 1.5 the scissor sat on the right edge. At DPR 2 it was entirely off the drawing buffer. `drawCalls === 1` was true in all three cases.

## Coordinate pipeline

CSS actor slot (canvas-local, top-left)
→ one Y-flip to WebGL logical CSS (bottom-left)
→ `setViewport` / `setScissor` with those CSS values
→ Three.js applies DPR once internally

## Human review remaining

- About BRAND_WIDE is visible and not icon-sized; vertical mass is still sparser than MASTER
- SINGLE Event/Design fill most of the left slot; merch is smaller
- Emulated 390 hero can overlap the second CTA
- Envelope 28–36vw / 23–26vw is a starting composition guide, not an aesthetic PASS
