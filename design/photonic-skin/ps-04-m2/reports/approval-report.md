# PS-04.M2 approval report

## Outcome

PS-04.M2 is implemented as an isolated Photonic Color Field stage over the frozen PS-04.M1 material and PS-03 geometry. The technical gate is green. Aesthetic sign-off is left to a human reviewer. Owner permission to start M2 after the M1 report does **not** close M1 visual review.

**MACHINE PASS / HUMAN REVIEW REQUIRED**

No commit, push, or deploy was performed.

---

## 1. Git status, M1 snapshot, M2-only delta

HEAD `ded950b` on `master`. Starting working tree contained only untracked M2 files; M1 was already committed.

Unchanged M1 source aggregate: `4cb80b507605bf439e9de5210e5f022159c716ee286fa81b98f0e943cf5b75eb`.

M2 additions only:

- `app/visual-lab/photonic-skin-ps04-m2/**`
- `tests/photonic-ps04-m2.test.ts`
- `design/photonic-skin/ps-04-m2/**`

M1 routes, preview, reports, and source were not rewritten. Frozen PS-03 assets were not copied.

## 2. Shader path and actor-local center

Production path remains one `THREE.RawShaderMaterial` on one `instancedMesh`.

Actor-local center is the vertex variable `center` **after** the frozen M4 evaluator (including actor track) and **before** presentation:

```
vFieldScalar = dot((center - uFieldOrigin) / uFieldScale, uFieldDirection);
vec3 presented = (center + frameTranslate + local) * frameScale;
```

`vFieldScalar` is `flat`, so every facet of a scale shares the same field sample. Lighting still varies per face. Color is not taken from `gl_FragCoord`, screen UV, camera position, mesh origin, or component index.

## 3. Field domain

Shared actor-space domain for every component and family:

| Uniform | Value |
| --- | --- |
| `uFieldOrigin` | `[0, 0, 0]` |
| `uFieldScale` | `3.6` |
| `uFieldDirection` | unit `[0.8830222215884446, 0.3213938047957942, 0.34202014329552427]` |

Camera/actor up is +Z. Iso-bands are ~20° from vertical (15–25° contract). Direction is fixed in actor space; changing canonical/alternate/side/top does not re-aim the field at the camera.

The domain is a fixed actor envelope, not per-frame camera-fit and not per-component normalization. MASTER/SINGLE/DRIVE share the same origin/scale/direction, so interpolation between whole assemblies cannot pop the field when endpoints change.

## 4. Name→bit mapping and color pipeline

Existing `competenceOrder` is the adapter. The brief table order is **not** the bit order.

| Competence | Bit | sRGB token |
| --- | --- | --- |
| content | `1<<0` | `#4C7AFF` |
| design | `1<<1` | `#9E64EE` |
| event | `1<<2` | `#F86927` |
| games | `1<<3` | `#76A713` |
| video | `1<<4` | `#E34992` |
| digital | `1<<5` | `#009FAC` |
| merch | `1<<6` | `#D5A200` |

HEX is converted to Linear-sRGB **once** in `srgbHexToLinear`. Tokens are uploaded with `THREE.Color().fromArray(token.linear)` so `setHex` / `convertSRGBToLinear` is not applied a second time. Lighting blends in linear space. The fragment still does one ACES and one `linearToSrgb`. Renderer: `NoToneMapping`, `SRGBColorSpace`.

Lit pixels are not required to match the HEX swatch. Diagnostic unlit semantic mode shows palette RGB without the M1 studio.

## 5. Undertone, envelope, coverage

| Parameter | Value |
| --- | --- |
| undertone Light / Dark | 0.07 / 0.08 |
| active mix Light / Dark | 0.66 / 0.72 |
| core half-width | 0.09 |
| shoulder half-width | 0.28 |
| activity threshold | 0.30 |
| Light accent | `field.rgb * 0.88` (slightly darker on ivory) |
| Dark accent | `mix(field.rgb, 0.72, 0.16)` (slightly lighter, not emissive) |

Coverage is a **scale² proxy of active persistent IDs** (status 0, scale > 0). It is not screen-pixel area and not a per-component 34% quota.

Measured at 128 phases:

| State | mean active | min / max | threshold fraction mean |
| --- | --- | --- | --- |
| MASTER | 37.0% | 1.6% / 66.6% | 42.2% |
| SINGLE-content | 37.0% | 22.9% / 51.1% | 42.2% |
| DRIVE 4-color | 37.0% | 30.5% / 41.1% | 42.2% |

MASTER min ~1.6% is the compact hull missing the band at some phases (board 02 Light 0.5). That is explained, not hidden with per-shape fudge factors.

## 6. Final lab periods

| Mode | Period | Full cycle means |
| --- | --- | --- |
| SINGLE | 14 s | one wrap of `fract(scalar - phase)` for the slash |
| COMPLEX / MASTER | 32 s | one wrap of the selected-token cycle along the same scalar |
| BRAND_WIDE | 40 s | same system, slower |

Palette coordinate = `fract(scalar - phase)`. Selected tokens occupy equal intervals in registry bit order, with C1 neighbour blend after 0.72 of each slot. All selected colors participate over a cycle; they are not required in every frame.

M1 Light/Dark material numbers are unchanged. Color-off (`uColorEnabled=0`) skips undertone and the active layer.

## 7. Phase / palette controller

`PhotonicPaletteController` owns color time only. It does not touch the M4 motion clock.

- One controller instance is shared by side-by-side canvases; each Canvas has its own uniforms.
- Theme, mask, pose, viewport, DPR, and React renders do not zero phase.
- Period changes keep the current phase and only change speed.
- Negative delta, hidden tab, and `visible:false` are ignored (no catch-up).
- Retarget captures the **displayed** 32-sample LUT, not the previous target mask or a mean RGB. Cost: 32 × `vec4` uniforms, 512 bytes, zero extra textures. Vertex texture units stay at the M1 16.
- Transient union of visible source and target is flagged until settle. After settle, unselected tokens are gone.
- Reduced motion: wave frozen from the first paint (`useState` + `matchMedia`, not a later effect). Palette change ≤ 160 ms then static. `shouldAnimate()` is false when paused and settled, so Canvas uses `frameloop="demand"`.

External API for M3: `setPhase`, `advance(dt)`, `setPlaying`, `setMask`, `snapshot()`. Future bind point is M4 events in production navigation — not done here.

## 8. M2 scaffolding vs deferred M3

Implemented only because M2 cannot be reviewed without it:

- Lab palette/phase clock, pause, scrub, reduced-motion freeze.
- Bounded LUT retarget.

Consciously deferred:

- Breathing, idle rotation, microdeformations.
- Release / Regroup / Approach / Reveal / Settle choreography.
- Production navigation and every M4 scenario.
- Homepage / IA / real site copy.
- Final PS-04 freeze.

## 9. Frozen preservation

All four control hashes remain exact. 154 states / 35 programs / 105 motion files unchanged. Old routes `/visual-lab/photonic-skin-m4-1r` and `/visual-lab/photonic-skin-ps04-m1` still render. M1 source aggregate matches its own manifest.

## 10. Tests (not summed)

See `reports/test-results.md`. `npm test` 107/107 includes the 15 M2 and 6 M1 focused tests. Python 4/4 + 11/11 + 11/11. GPU TF 552/46 and field 32,896 + 4,369.

## 11. Performance

Same GPU/N/camera/DPR/buffer, after warm-up, playing:

| | fps | p95 | draws | tri | programs | tex |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | 158 | 6.6 ms | 1 | 131,072 | 1 | 16 |
| M2 | 140 | 6.8 ms | 1 | 131,072 | 1 | 16 |

p95 relative delta ~3% (< 25%). Mask/theme switches do not grow programs. LUT uses uniforms, not a 17th vertex texture.

## 12. Lifecycle

- `prefers-reduced-motion` read before first color tick.
- Hidden tab and off-screen actor pause color time.
- Context restore returns the same palette, phase, and theme; no seven-color/white flash in the captured restore.
- DPR 1 / 1.5 / 2 and 1440→820→1440 keep the square drawing buffer policy.
- Forced-colors CSS fallback kept; competence names remain in the lab UI.

## 13. Evidence actually viewed

Boards 01–15 and sequences `single-content-cycle`, `master-cycle`, `gather-cycle`, `retarget`, `geometry-color`. Reproduction: `node design/photonic-skin/ps-04-m2/scripts/capture-browser-evidence.mjs` against `next dev` on port 3000, plus the hero recapture scripts. Timestamps live next to the frames.

## 14. Open visual questions / limitations

- M1 Light pin-specks: still present; color does not remove them.
- M1 Dark 180/96 DRIVE/BRAND_WIDE readability: still the lower bound.
- MASTER Light phase ~0.5 nearly colorless.
- Dark accents are more saturated; owner must judge neon vs readable.
- Coverage is an ID×scale² proxy, not visible area.
- Demand-loop paused hero overlay can print `0 DRAW` even though the actor is on screen.
- GATHER/DRIVE have no frozen Event+Digital pair; board 07 uses FOCUS for that contrast.
- Production page continuity is **not** claimed.

## 15. What the owner should look at

1. Light ceramic vs candy (boards 01–03, 11).
2. Dark neon vs readable (04, 07–10, 12).
3. One SINGLE slash (06 + SINGLE sequence).
4. Complex as one field (07–09, GATHER sequence).
5. MASTER calm / phase-dip (02, MASTER sequence).
6. Carry-forward M1 sparkle and tiny Dark DRIVE/BRAND_WIDE (11, 13).

## Checkpoint

**PS-04.M2 — MACHINE PASS / HUMAN REVIEW REQUIRED**
