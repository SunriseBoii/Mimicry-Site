# PS‑04.M5.2 — Machine approval report

**Status: MACHINE PASS / HUMAN EVENT CONCEPT REVIEW REQUIRED**

This is not a canonical Event selection, not production approval, not M5.3, and not an aesthetic approval of Mimic.

## M5.1 acceptance

Owner visual pass of M5.1 choreography was recorded as **HUMAN PASS WITH DEFERRED RESIDUAL**. Residual `PS04-M5-R001` (rare rapid-scroll palette mismatch) stays open and unresolved. M5.1 source commit `5c5e7e0c2592573c42fe19ea4da042e41fbf2434`; metadata commit `3fd3b5a301cc526328e6e9de7e01fd0178466ab5`. Manifest JSON repaired (`requiredVideos`). Source hash unchanged: `8ee1cc11289be4b277eccf5a9b578029cfb1625d34eb6dbd0bbc010a768cc556`.

M5.1 was already committed when this stage started. No duplicate choreography commit was created. Requested message `feat(photonic-skin): synchronize M5 transition choreography` was not used; the existing source commit stands.

## Authoring

Coordinate-only pipeline (no `.blend` in the repo). Versioned M5.2 copy, frozen M2/M3 sources not edited:

- M2 SDF providers: `design/photonic-skin/ps-03-m2/` (`geometry_providers.py`, `target_library.py`, frozen target `event-stage-figures`)
- M3 identity builder: `design/photonic-skin/ps-03-m3/scripts/state_builder.py` — `ps03m3-identity-v1`, N=16384, IDs `0…16383`, LOD prefixes `[512,1024,2048,4096,8192,12288,16384]`, mapping `canonical-master-stratified`
- M3.1R Event yaw **+18° around +Z**, pivot `[0,0,0]`, cameras from `orientation-contract.json`
- Frozen buffer: `public/photonic-skin/ps-03-m3-1r/states/single-event.state.bin`

Direction D (controlled associative hierarchy) remains the form system. Event identity is the pavilion/stage+figures competency, not a new topology.

BASELINE is a byte copy of the frozen SINGLE Event.

## Variants

| ID | Kind | Hash | Active |
| --- | --- | --- | --- |
| BASELINE | frozen import | `b14a3b2f…3394a933` | 14873 |
| A | rigid +180° Z | `76c46452…3d1c938d` | 14873 |
| B | open stage | `62a43d9e…553681d5` | 11359 |
| C | four islands | `447eea91…19e2a65c` | 13045 |

EVENT_A pairwise / inverse / closed-form errors are 0 within float64 (`maxPairwiseDistanceError: 0`, `maxInversePositionError: 0`).

EVENT_C point budget vs preferred bands: stage 46.01% (band 40–46, 0.01% over), centre 17.55% (band 18–22, slightly under), left 19.78%, right 16.66%. All four parts remain present at every LOD prefix.

## Isolation

- Lab: `/visual-lab/photonic-skin-ps04-m5/event-sandbox`
- Preview: `/visual-lab/photonic-skin-ps04-m5/event-sandbox/preview`
- M5.1 route unchanged (`runId === "ps04-m5"`)
- Production `/` remains `SiteShell`
- Canonical 154-state aggregate not regenerated
- Shader, Event palette `#F86927`, camera rig, actor scale, idle/motion unchanged
- Sandbox compiles overlays in-process; it does not fetch frozen Event through M5.1 precompiled programs

## Runtime (browser)

Settled Event overlay: 1 Canvas, 1 draw, 131072 tri, 16384 instances, one program. Footer: 0 draw / 0 tri. Framebuffer on EVENT_C: 94062 visible actor pixels; after context restore: 185586 pixels, button status `restored`. 20× BASELINE→A→B→C: programs 1, renderer textures 17, GPU bank textures 48 created / 0 disposed, cacheBytes 1884160 plateau.

## Transitions

Design→Event→Games and reverse for BASELINE/A/B/C: `paletteLeads=0`, `centerDeclaredAsTarget=0`, geometry IDs only `single-design` / `single-event` / `single-games`. Rapid Event retarget still shows `PS04-M5-R001` (45/63 frames `paletteLeads`); not fixed.

All 11 required WebMs were played in Chromium at `playbackRate=1` until `ended`.

## Tests

- Node: 241 pass / 0 fail (232 prior + 9 M5.2)
- `tsc --noEmit` pass
- ESLint on sandbox + M5.2 tests pass
- Python: `photonic_m31r_python_test` 4 OK; `test_core` 11+11 OK; `test_ps03m2` 470 checks
- Production `next build --webpack` pass (sandbox routes present; `/` still SiteShell)
- Frozen residual: `test_ps03m41.py` as a script still `KeyError: transitionRecordLayout` (unchanged fingerprint). Frozen PS‑03 manifest was not edited.

`validate_ps03m31r.py` was not executed: it writes into frozen M3.1R report paths. Fingerprints were guarded by Node tests instead.

## Human action required

Pick BASELINE / A / B / C (or a direction). Do not treat any hash as promoted Event. M5.2 remains uncommitted.
