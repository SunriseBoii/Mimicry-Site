# PS‑04.M5.1 — Transition Choreography

**Status: MACHINE PASS / HUMAN REVIEW REQUIRED**

Aesthetics are not auto-approved. This is not production approval. M5.2 was not started. M5.1 is not committed. No push, no deploy. Production `/` is unchanged. Frozen M1 / M2 / M3 / M4.R1–R5 / rejected R6 / R6.R1 hashes match. The M4 lab route was not edited after the baseline.

---

## 1. Git status and HEAD

- Working branch: `ps04-m5-sandbox`
- Baseline HEAD (immutable comparison point): `ecd054ef9df4d2def76d34a18b2d0cbd507c0557`
- Message: `feat(photonic-skin): hydrate GPU banks so Mimic is visible on first R6 frame`
- Parent / R5: `907282db7948c86387107a2f06166ada8f744a0f`
- Tracked tree: clean. M5.1 files are untracked on the sandbox branch.
- Owner leftovers `design/photonic-skin/ps-04-m4-r6*/renders/browser/video/page@*.webm` were not added, deleted, or stashed.
- `master` was not moved. No remotes were pushed.
- Deps: Next `16.2.6`, React `19.2.6`, Three `0.185.1`, R3F `9.7.0`, Node `v24`, npm lockfile.
- Production `/`: `app/page.tsx` → `SiteShell`. Build lists `/` static. Board `24-production-home.png` is the homepage.
- M4 lab: `/visual-lab/photonic-skin-ps04-m4` still `runId === "ps04-m4"`.
- M5 lab: `/visual-lab/photonic-skin-ps04-m5` and `/preview`. HUD `PS-04.M5.1`, `sessionId = ps04-m5-1`.

M5.0 did **not** create a second empty checkpoint commit. R6.R1 source was already in `ecd054ef`. Creating `chore(photonic-skin): checkpoint PS-04.M4.R6.R1 technical baseline` would have been an empty or history-rewriting commit. The sandbox branch tip **is** that baseline.

## 2. Frozen hashes

From `design/photonic-skin/ps-04-m4-r6-r1/reports/checkpoint-hashes.json` and a live re-aggregate:

| System | Hash | Match |
| --- | --- | --- |
| R6.R1 source | `60546b434ed857a9c967a28dca9ee7d1f0fdb705ca8bbaed654384e677f13116` | yes |
| Rejected R6 | `4a24385bcdda85496155e699edfbeab9bc1818488c1c246884ab3088d3acdb4f` | yes |
| M1 | `4cb80b507605bf439e9de5210e5f022159c716ee286fa81b98f0e943cf5b75eb` | yes |
| M2 | `f04bc262cdc80e6061d2ad7fdb6501f60aa0a31105a55f876a8eaa26f0266c0d` | yes |
| M3 | `184744da085dc31e08c954640456133308585b7b8ef107de43ab2f8d7a8e6ec1` | yes |
| M4.R5 | `853cd3b8373b3116330acf2643fefdc9d7b84424c3bf1515d9df5c52c15421ef` | yes |

M5 has a **new** source aggregate `8ee1cc11289be4b277eccf5a9b578029cfb1625d34eb6dbd0bbc010a768cc556` in `reports/checkpoint-hashes.json`. Old hash fields were not rewritten.

## 3. Root cause A — target color lead

**Confirmed (code + HUD + traces), not an art choice.**

R3/R6.R1 `paletteProgressFromGeometryR3` used `c2Window(g, reveal[0]=0.4, approach[0]=0.62)`, so palette reached 1 at geometry **0.62**. Combined with:

1. `applyLinkedPalette(tx.paletteProgress)` mutating the **source LUT** during the morph;
2. `setMask(..., "geometry-linked")` after commit;
3. `shaderMask` bound to the **target** mask while `paletteOwnershipMode = 1`.

That is a ~0.6–0.8 s color lead on a 0.98 s morph.

## 4. Root cause B — center dwell

**Confirmed.** During `compileGap` / `preparing`, slot progress used a **second clock** `elapsed / SLOT_PREPARE_SECONDS` (0.38 s) while geometry stayed 0. Then:

`slotProgress = Math.max(preparedSlot, siteProgressFromGeometry(g))`

Site C2 stays 0 until regroup[0]=0.24. If prepare reached ~0.5, X froze at the lerp **midpoint** until geometry caught up. Center is not a topology slot (`left | right | none` only). Magnetism was not minting a center actor target; the plateau was the prepare/site `Math.max`.

## 5. Choreography architecture (M5 only)

Isolated copy of the M4 lab. Frozen M4 files were not edited. Geometry/material evaluators are read-only dependencies.

New M5 modules:

- `m5-choreography.ts` — one-clock curves, `PALETTE_DELAY_FRACTION = 0.06`, center-dwell ε.
- `m5-transition-trace.ts` — samples the existing lab clock only.
- M5 copies of coordinator, navigation token, lab/scene.

## 6. Prepare / commit / publish

**Prepare:** target state selected, inactive GPU bank filled, `visualPublished = false`, geometry/palette/position stay 0 (unless same-site/same-mask). No `elapsed/SLOT_PREPARE` X motion. No linked-palette driver writes.

**Commit:** one transaction revision. Geometry, palette, and position derive from the same session/geometry clock. Palette = `min(geometry, c2Window(g, 0.06, 1))`. Position = `c2Window(g, 0, 1)`. No second rAF timer.

**Settle:** only when geometry **and** palette **and** position ≥ 1. Stale revision cannot settle. Reverse retarget starts from the live snapshot.

Scene gate: if `uProgress ≤ 0.02`, `uPaletteProgress = 0`. `uPaletteOwnershipMode` forced to 0.

## 7. Magnetism after the fix

Unchanged tokens: idle **160 ms**, radius **0.25 vh**, snap **340 ms**. Still snaps **scroll** and stabilizes screen selection.

Magnetic mode now issues `actorTarget = committedNodeId`, not the magnetic candidate. Magnetism cannot mint a center actor request or freeze X at the viewport center.

## 8–11. Boundary / reverse / rapid / reduced

See `visual-review.md` and `reports/trace-analysis.json`.

- Cases `04` → Content `05.1`: one transaction, right→left, midpoint velocity ≠ 0, no interior dwell.
- Merch `05.7` → Team `06.1`: one transaction, left→right, same.
- Reverse traces start from the current X/geometry/palette.
- Rapid-20 latest target `05.5` / `single-video`.
- Reduced motion: atomic 1/1/1, no decorative delay, no center node.

## 12. Runtime invariants

Lab-smoke + boards + silhouettes:

- 1 Canvas, 1 persistent actor, 1 `RawShaderMaterial`, 1 WebGL program when settled.
- 1 draw / 131072 tri on actor screens (`16384` instances).
- Footer: 0 draw, 0 tri, 0 silhouette pixels.
- No geometry/material recreation counts in ordinary measure.
- M4 lab still reachable.

## 13. Tests / typecheck / lint / build

- Node tests: **232 / 232** (221 prior + 11 focused M5.1; none deleted).
- `tsc --noEmit` pass.
- ESLint on M5 lab/coordinator/scene/navigation + M5 test: pass.
- Python: `test_core` 11 OK, `photonic_m31r_python_test` 4 OK (**15**). `test_ps03m41.py` as a script raises `KeyError: transitionRecordLayout` on the current M3 manifest — frozen PS‑03 check, not an M5 edit.
- `next build --webpack` pass; **41** routes; `/` SiteShell; M5 lab + preview listed.

## 14. Performance vs R6.R1 ordinary rAF max

| Scenario | M5.1 rAF max | R6.R1 | long ≥50 ms |
| --- | --- | --- | --- |
| idle MASTER | 6.1 ms (short parked-clock sample) | 12.2 | 0 |
| warm Content→Design | 12.2 | 18.1 | 0 |
| Cases→Content | 12.2 | — | 0 |
| Merch→Team | 30.3 (1 frame >16.7) | — | 0 |
| sequential SINGLEs | 30.4 | 42.5 | 0 |
| reverse | 24.4 | 18.3 | 0 |
| full down/up 1 | 18.2 | 30.2 | 0 |
| full down/up 2 | 6.3 | 12.2 | 0 |

**Disclose:** reverse rAF max 24.4 vs R6.R1 18.3 (still 0 long tasks ≥50 ms). Rapid-20 is stress: rAF max 582 ms, four long tasks ~529–576 ms (R6.R1 rapid was 509 ms / four longs). Latest-target and visibility survived. Texture upload counts in `performance-qa.json` are **cumulative on one long-lived page**, not per animation frame. Idle GPU timer sampled 0 draws because the lab clock parks when settled; Hero boards still show 1 draw / 131k tri.

## 15. Evidence paths

`design/photonic-skin/ps-04-m5-1/`

- `reports/approval-report.md`
- `reports/visual-review.md`
- `reports/transition-trace.json`
- `reports/trace-analysis.json`
- `reports/performance-qa.json`
- `reports/checkpoint-hashes.json`
- `reports/video-playback.json`
- `reports/lab-smoke.json`
- `renders/boards/`
- `renders/browser/video/` (required ten + extras)
- `renders/browser/frame-probes/`
- `scripts/`
- `manifest.json`

## 16. Known limitations

- Named WebMs include lab load + `go(source)` setup; morph-only evidence is the 10 fps probes and coordinator traces.
- First lab-smoke silhouette was `null` (conservative `failDrawWithoutPixels`); later silhouettes and boards show pixels.
- Cold-nav inventory silhouette bbox was still right-slot while the lab clock had already settled left; trust the clock + video, not that one bbox.
- `test_ps03m41.py` script KeyError is pre-existing vs current M3 manifest.
- Playback 50% stills of long setup clips can show Hero; that is not the morph midpoint.

## 17. Human checklist

1. Watch `cases-to-content.webm` and `merch-to-team.webm` at 1× and confirm no center pause.
2. Watch `content-to-design.webm` and confirm the book does not turn Design-purple before it morphs.
3. Confirm Light contrast was **not** “fixed” (out of scope).
4. Confirm Event / Video / camera / About / Merch sizing untouched.
5. Confirm production homepage is still SiteShell.
6. Do not treat this MACHINE PASS as aesthetic or production approval.
