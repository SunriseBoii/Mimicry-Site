# PS-04.M4.R2 — Soft Screen Magnetism & Unclipped Full-Canvas Composition

**Status: MACHINE PASS / HUMAN REVIEW REQUIRED**

Magnetism strength and how much transition overflow is acceptable are not auto-approved.

Previous packs `design/photonic-skin/ps-04-m4/` and `design/photonic-skin/ps-04-m4-r1/` are unchanged.

## Git baseline (before this pass)

- Branch: `master`
- HEAD: `f9e45229da988ed1e98fb032f18864af22a0315f`
- No reset / checkout / clean
- Preserved untracked: M4 lab, M4, M4.R1, M4.R2 checkpoints, `docs/mimicry-homepage-topology-checkpoint-2026-08-29.md`

## What R2 changed

1. Soft proximity magnetism after user input idles, inside `ScrollCompositionController`.
2. Full-canvas WebGL viewport + clip-space placement; scissor no longer equals the actor slot.

## What R2 did not change

Mapping table, R1 fit profiles, frozen evaluator, M3 phases, palette driver, production `/`.

## Human review remaining

- Whether 0.25 vh / 340 ms magnetism feels like help rather than a trap
- How far particles may leave the preferred envelope during transforms
- 390 CTA overlap
- Transition continuity issues now fully visible (see carry-forward M4.R3)
