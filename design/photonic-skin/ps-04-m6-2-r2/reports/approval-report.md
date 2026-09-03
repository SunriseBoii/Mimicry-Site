# PS‑04.M6.2‑R2 — Approval report

```text
PS-04.M6.2-R2 — MACHINE PASS /
HUMAN REAL-UI BUILDER TRANSFORMATION REVIEW REQUIRED
```

This is an isolated regression-fix on the uncommitted M6.2 + M6.2‑R1 working tree. It is not a HUMAN PASS, not production approval, not deploy approval, not a push, and not the start of a later M6 sub-stage.

## Binding

- Working branch: `ps04-m6-sandbox`
- HEAD / M6.1 HUMAN PASS checkpoint: `c29e143580947fdf3f3f4121271a10805d4c5498` (`feat(photonic-skin): approve project builder Mimic semantics`)
- M6.2 and M6.2‑R1: HUMAN FAIL, uncommitted; no checkpoint created before R2
- Frozen payload: `ps-04-m5-5`
- Builder delta: `ps-04-m6-1`
- Magnetism duration / settle floor: 340 ms / 2 px
- Event: `EVENT_A_R2`
- Video: `VIDEO_COMBO_40_R1`
- Framing: `OWNER_SELECTED_124_111_111`
- Magnetism profile: `R1_STRONG_BALANCED` (desktop 0.56 vh, mobile/touch 0.42 vh)
- Production route: `/` unchanged
- Anime.js: not installed
- `m63Started = false`
- `commitCreated = false`

---

## 1. Actual root cause

There is no QA-only coordinator path. Both the lab handle and the DOM button updated draft through the same reducer. The split is **before** publish.

Window `pointerdown` on a competency button reaches `ScrollCompositionController.noteUserInput("pointer")`. R1 `R1MagneticDriver.install` forwards that into `MagnetizedSettleController.noteUserInput("pointer")` → `onScrollActivity()` → `phase = "Traversing"`. Then `onClick` updates draft.

R1 `requestInScreenAction` returned `null` when `phase !== "Settled"`. Draft / `aria-pressed` / HUD changed. `interactionRevision` did not increment. No actor bind, no morph. When idle later returned `Settled`, the React effect did not re-run because `flow` was already committed. The request was lost.

Keyboard Space is a scroll key, so it took the same Traversing gate. Enter did not, which made keyboard probes look flaky.

Full chain and function names: `design/photonic-skin/ps-04-m6-2-r2/reports/root-cause.md`.

Fix: `requestInScreenAction` still requires `magnetizedSettledNodeId === host` and blocks real scroll displacement, but an anchored UI pointer no longer drops the in-screen request. DOM, keyboard, and QA share `dispatchProjectBuilderAction` → pure `reduceProjectBuilderAction` → one typed `{ kind: "in-screen-action", hostNodeId: "03.2", interactionRevision }` published outside the React updater.

## 2. Why R1 synthetic capture was a false PASS

R1 capture called `window.__PS04M62R1_LAB__.setCompetencies(...)`. That never fired `pointerdown`, so `scrollPhase` stayed `Settled` and the effect publisher reached the coordinator. Hashes, request source, and pixels were exact for an internal API that a person does not use. R1 evidence is kept under `design/photonic-skin/ps-04-m6-2-r1/` and is not R2 acceptance.

## 3. Real DOM controls used

Acceptance used visible builder buttons, not lab handles:

| Control | Selector | Activation |
| --- | --- | --- |
| Competency | `[data-competency-id="<id>"]` (also `data-qa="competence-<id>"`, `aria-pressed`) | `locator.click()`, `press("Enter")`, `press(" ")`, `touchscreen.tap()` |
| Task unlock | `[data-qa='task-explain_changes']` | click |
| Confirm | `[data-qa='confirm-competencies']` | click |

`qaSetCompetenciesUsedForAcceptance = false`. The R2 capture script does not contain `setCompetencies(` or `requestState(`.

## 4. Select / remove sequence

Real UI path `03.1` → settle `03.2`, then:

```text
[]                         → master-neutral
click Content              → single-content
click Event                → complex-gather-content-event
click Video                → complex-gather-content-event-video
click Event (remove)       → complex-gather-content-video
click Content (remove)     → single-video
click Video (remove)       → master-neutral
click Event (from empty)   → single-event
clear Event                → master-neutral
click Design / Digital / Games / Merch (each from empty, then clear)
click Content + Video      → complex-gather-content-video
click Confirm              → confirmed set on 03.2, Mimic stays GATHER
PageDown → 03.3            → complex-drive-content-video (route-settle)
```

Canonical competency order is independent of click order.

## 5. Endpoint / hash / pixel proof

Each differing endpoint required `renderedActorPixelsChanged = true`. HUD / `data-resolved-state` alone is not acceptance.

| Step | Resolved | State hash (prefix) | Pixels changed | Source |
| --- | --- | --- | --- | --- |
| empty 03.2 | `master-neutral` | `622e48e428e28afc…` | n/a (baseline) | route-settle into 03.2 |
| +Content | `single-content` | `ea5d20c633cee044…` | true | in-screen-action rev 1 |
| +Event | `complex-gather-content-event` | `b58a60c190594538…` | true | in-screen-action |
| +Video | `complex-gather-content-event-video` | `23f5de281cbc3381…` | true | in-screen-action |
| −Event | `complex-gather-content-video` | `f71e6d1f19ad596c…` | true | in-screen-action |
| −Content | `single-video` | `2d6957815b6f58f8…` | true | in-screen-action |
| −Video | `master-neutral` | `622e48e428e28afc…` | true | in-screen-action |
| Event SINGLE | `single-event` | `5945d1350ec024ca…` | true | in-screen-action |
| Design/Digital/Games/Merch SINGLEs | exact `single-*` | exact vs M5.5/M6.1 manifests | true | in-screen-action |
| Confirm on 03.2 | still `complex-gather-content-video` | unchanged | false (allowed) | confirm does not morph |
| 03.3 | `complex-drive-content-video` | `7b116e75f84105bc…` | true | route-settle |

Also: `interactionRevisionExactlyOncePerAction = true`, `magneticSettleRevisionUnchangedDuringToggle = true` (stayed at 5 through all 03.2 toggles; rose to 6 only on the 03.3 route settle). Lifecycle on toggles: `settled → preparing → morphing → settled`.

Keyboard Enter → `single-content`. Space (toggle off) → `master-neutral`. Dark / reduced / mobile Content → `single-content`. Touch Event → `single-event`.

Continuous clip: `renders/browser/video/real-ui-builder-selection.webm` (played 1× to `ended`, 57.8 s). Not assembled from settled stills.

## 6. R1 magnetism and placement preserved

Byte identity of the R1 lock files is unchanged:

| File | sha256 |
| --- | --- |
| `magnetism-profile.ts` | `750ef24ddb21079864f6bf94eca5156d7619bc45c56fc8e5d72eee55203dd21f` |
| `r1-magnetic-driver.ts` | `fdcd709138991dd5c4445f82a7c7660dfabe36a16c9fc362af13c290534b5886` |
| `presentation-placement.ts` | `bb46242acfe18497a5c129b8809ab7161bd032399f673ca84bb39f62b1b75643` |

Live gates:

```text
magnetismProfile = R1_STRONG_BALANCED
desktopCaptureRadiusVh = 0.56
mobileCaptureRadiusVh = 0.42
magneticOvershoot = false
magneticStrengthMonotonic = true
placementActorRequestCount = 0
placementCompileCount = 0
placementQueueDepth = 0
postSettlePlacementDeltaPx = 0
```

Scroll-controller production bytes are frozen. The magnetic driver was not edited for R2. `magneticCancelOnFreshInput` remains the R1 driver capability; the live snapshot flag is true only after an actual cancel event.

## 7. Transition / runtime invariants

```text
requestsToCrossedNodes = 0
routeCompileLiveRetargetCount = 0
MASTER flash = 0
palette lead = 0
center dwell = 0
third geometry = false
empty actor frame = 0
one Canvas / actor / InstancedMesh / material / program / draw
Footer settled = 0 draw (unchanged M5.1 contract)
production / unchanged
Anime.js dependency added = false
confirmedSetChangesOnlyOnConfirm = true
03.3ExactDrive = true
```

## 8. Tests / typecheck / lint / build

All required machine commands passed after the real-UI capture:

| Command | Result |
| --- | --- |
| `tsx --test` M6.1 + M6.2 + R1 + R2 (48 tests) | pass 48 / fail 0 |
| `test_ps04m61.py` (4) + `test_ps04m55.py` (7) | OK |
| `tsc --noEmit` | pass |
| ESLint on R2-touched TS/TSX | pass |
| `npm run build` (webpack) | pass; `/` unchanged; R2 clean + review routes present |
| Playwright `capture-m6-2-r2.mjs` | `smoke.ok = true`, WebM 1× `ended` 57.8 s |
| production isolation | `productionHasM62R2Handle = false` |

The R2 test forbids replacing DOM clicks with `setCompetencies(` / `requestState(` in the capture script.

## 9. Review URLs and evidence paths

- Clean: `/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r2`
- Review: `/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r2/review`
- Production control: `/`
- Packet: `design/photonic-skin/ps-04-m6-2-r2/`
- Root cause: `reports/root-cause.md`
- Semantics: `reports/real-ui-builder-semantics.json`
- Pixels: `reports/rendered-pixel-validation.json`
- Trace: `reports/real-ui-event-trace.json`
- R1 lock: `reports/r1-lock-preservation.json`
- Video: `renders/browser/video/real-ui-builder-selection.webm`

Clean HUD count = 0. Review HUD count = 1 (`data-qa='m62r2-settle-hud'`).

## 10. Git branch, HEAD, and status

```text
branch = ps04-m6-sandbox
HEAD   = c29e143580947fdf3f3f4121271a10805d4c5498
R2     = uncommitted (no commit, no push, no deploy)
```

M6.2 and M6.2‑R1 remain uncommitted HUMAN FAIL. This R2 packet does not create a checkpoint.
