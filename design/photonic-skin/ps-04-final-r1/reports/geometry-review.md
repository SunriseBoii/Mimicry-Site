# PS-04 final-r1 — Event geometry and builder acceptance

## Event viewer-right figure

The approved M5.5 `EVENT_A_R2` figure had almost the same width at the neck and head, so its 180/96 px isolated silhouette read as a capsule. The final-r1 authoring script narrows the neck, retains the rounded head, and recalculates surface normals and flake orientation. On the canonical `single-event` only, it moves that figure 0.251 world units outward from the white portal upright, still within the stage deck. In the canonical camera projection the figure now reaches NDC X 0.69; the portal upright ends at 0.61 and the deck at 0.76. This reveals a right-side head and shoulder contour on the settled Event screen.

The new `EVENT_A_R3` full payload is `public/photonic-skin/ps-04-final-r1/event-a-r3.state.bin`, SHA-256 `3b1d75b029d369449b712b626a1146697de33c9586b7589c1eb515c8066e2f72`. The original M5.5 and M6.1 payloads are unchanged. Versioned geometry-only patches cover all 203 Event-bearing states: 83 in M5.5 and 120 in M6.1. Composite layouts retain their original placement; all 203 get the head/neck refinement. Runtime verifies each frozen source hash, patch hash, and complete revised state hash before decoding. Position, normal and orientation are the only modified fields. Persistent IDs, LOD, scale, palette ownership, status and every other component remain byte-identical. The isolated 180/96 px previews and complete geometry metrics are in this directory.

The full Event still combines a white right figure with a white arch. The right contour is now visible, but the visual judgement of whether the three figures read consistently at normal display size belongs to the owner. If it remains too merged, adjust visibility/material contrast for this component in a new versioned revision rather than mutating M5.5.

## Other single competencies

Reviewed the approved settled screenshots for Video, Games and Merch and ran a nearest-neighbour audit on every active point in each component. No isolated geometric point exceeded `max(0.085 world units, 4 × component median nearest-neighbour distance)`. The approved form payloads were therefore retained. This geometric audit cannot rule out transient visibility or LOD artifacts during movement.

## Builder 03.1–03.3

The final-r1 clean route was exercised with **real task, competency and confirmation buttons** at 1440×900. Seventeen checkpoints required both the semantic state and actual GPU settled geometry to match. Results include 03.1 MASTER, empty 03.2 MASTER, one competency SINGLE, sequential 2–7 competency GATHER, confirmed seven DRIVE, draft change preserving confirmed DRIVE on 03.3, reconfirmed six DRIVE, and confirmed single Event. `builder-real-buttons.json` and screenshots under `renders/builder/` hold the evidence. A prior historical M6.1 route showed stale GATHER after a draft edit; the final-r1 route passed this same sequence.

## Reproduction

```powershell
& 'C:\Users\MSI_NB\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' design/photonic-skin/ps-04-final-r1/scripts/build_release_geometry.py
npx.cmd tsx --test tests/photonic-ps04-final-geometry.test.ts
$env:PS04_BUILDER_URL='http://localhost:3000/visual-lab/photonic-skin-ps04-m6/final-r1'
node design/photonic-skin/ps-04-final-r1/scripts/check-builder-buttons.mjs
```

The browser check requires the local development server. Motion performance and full visual acceptance are tracked separately from this geometry proof.
