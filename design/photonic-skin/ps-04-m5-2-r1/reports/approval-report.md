# PS‑04.M5.2.R1 — Machine approval report

**Status: MACHINE PASS / HUMAN A‑R1 REVIEW REQUIRED**

This is not a canonical Event selection, not production approval, not M5.3, and not an aesthetic approval of Mimic. `EVENT_A_R1` is the owner's chosen direction after rejecting B/C; final acceptance of the refined right figure waits for a new owner answer.

## M5.2 checkpoint

M5.2 was already committed when this stage started. No duplicate M5.2 commit was created.

- Branch: `ps04-m5-sandbox`
- HEAD: `0162b490d9c14dfaa095b562c115b06ffe3d65e5`
- Message: `feat(photonic-skin): add Event associative object sandbox`
- Parent: `3fd3b5a301cc526328e6e9de7e01fd0178466ab5` (`docs(photonic-skin): record M5.1 human pass and repair manifest JSON`)
- M5.1 source: `5c5e7e0c2592573c42fe19ea4da042e41fbf2434`

M5.2 hashes unchanged:

| Artifact | Hash |
| --- | --- |
| source | `34e19852c76aec43e6a07c005ede69573481b7957c8c6b087111054591c7c87e` |
| authoring | `6cd2bd8007bba452ce66c67661430ee34a57e346fb1a0d7addbc07c0ec29a159` |
| BASELINE / frozen Event | `b14a3b2f8571e3e7d39be074aecbdeb6dd4ca51097c6433db25b622c3394a933` |
| EVENT_A | `76c46452781c4334b4d91cca9ed6533bb9ccd7224c57bdf7abf7e1093d1c938d` |
| EVENT_B | `62a43d9ec0e1fd468c9b2f6e1bb9b93237b74fc2174160e2d045de7b553681d5` |
| EVENT_C | `447eea917065408edf79cf017d8428e50b8956e64c17d7cb167b4c3319e2a65c` |
| M5.1 source | `8ee1cc11289be4b277eccf5a9b578029cfb1625d34eb6dbd0bbc010a768cc556` |

## Owner direction

```text
selectedDirection = EVENT_A
selectedCandidate = pending EVENT_A_R1
canonicalSelection = pending human review
rejectedVariants = EVENT_B, EVENT_C
```

BASELINE remains a historical reference. Do not propagate into the 83 Event-containing states.

## EVENT_A_R1

Offline authoring: `design/photonic-skin/ps-04-m5-2-r1/scripts/refine_event_a_right_figure.py`

```text
frozen BASELINE
→ EVENT_A rigid +180° Z
→ selective figure-right refinement
→ EVENT_A_R1
```

Hash (two identical Python runs): `89f50d4c83b15de21b753f98d6ab368e974c20a91ed135668bbaf05445b898cc`

Allowed changed fields: position, normal, orientation. All other record fields on the right, and every non-right record, are byte-identical to EVENT_A. `nonRightByteDifference = 0`. Right active count 890. LOD prefix presence matches A (512:42 … 16384:890). Isolated silhouettes 180/96: one connected mass, internal row gap 0.

## Sandbox usability

Root cause: clicks updated React `variant` + `replaceState` immediately; Mimic lived on `PhotonicMotionSession`; HUD mixed the new name with the old buffer; no `popstate`; stale loads could win.

Fix: requested vs displayed, latest-selection-wins load gate, atomic publish after `bootstrapSettled`, `pushState`/`popstate` without document navigation. Default: `a-r1` / canonical / light / final material / settled.

Live smoke: click A → hash `76c46452…` and HUD `EVENT_A` with **0 document reloads**; click A‑R1 restores `89f50d4c…`.

## Runtime

Settled A‑R1: 1 Canvas, 1 draw, 131072 tri, 16384 instances, 1 program, figure-right 890. Framebuffer 99313 visible pixels; context restore 99313, button `restored`. Footer: 0 actor draw. 20× A_R1→A→BASELINE→B→C→A_R1: programs 1, GPU textures 48, cacheEntries plateau 5.

## Transitions

Paced Design→Event A‑R1→Games and reverse: `paletteLeads=0`, `centerDeclaredAsTarget=0`. Rapid retarget still shows residual `PS04-M5-R001` (8/466 frames); fingerprint is not worse than M5.2 (45/63). Not fixed.

## Tests

- Node: 252 pass / 0 fail (including M5.2 + R1)
- `tsc --noEmit` pass
- ESLint on sandbox + R1 tests: 0 errors (3 pre-existing unused-var warnings in the sandbox lab copy)
- Python: `photonic_m31r_python_test` 4 OK; `test_core` 11+11 OK; `test_ps03m2` 470 checks
- Frozen residual: `test_ps03m41.py` as a script still `KeyError: transitionRecordLayout`
- Authoring identity: two Python runs, same A‑R1 hash

## Frozen

Canonical Event, 154-state aggregate, 83 Event-containing states, M5.1 source/choreography, production `/`, Video, camera/framing, BASELINE/A/B/C files, M3.1R/M4.1 are unchanged. M5.3 not started. R1 not committed. No push, no deploy.

## Human action required

Review EVENT_A_R1 right-figure silhouette vs EVENT_A and vs left/centre. Do not treat this MACHINE PASS as canonical selection.
