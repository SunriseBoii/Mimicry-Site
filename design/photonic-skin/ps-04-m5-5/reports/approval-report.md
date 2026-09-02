# PS‑04.M5.5 — Approval report

**Verdict: PS‑04.M5.5 — MACHINE PASS / HUMAN INTEGRATED PROMOTION REVIEW REQUIRED**

This is not production approval, not a production swap, not the close of PS‑04, and not the start of M5.6.

## 1. Verdict

```text
PS‑04.M5.5 — MACHINE PASS / HUMAN INTEGRATED PROMOTION REVIEW REQUIRED
```

Machine gates for the isolated promotion candidate passed. Owner visual review of the integrated site-copy remains required. Human PASS of M5.5 authorizes M5.6 work only, not deploy.

## 2. Branch / HEAD / status

- Branch: `ps04-m5-sandbox`
- HEAD (M5.4 checkpoint, M5.5 uncommitted): `f43e8b9b59d881bc908f7f78ddcb45f9cb27eb41`
- Message: `feat(photonic-skin): approve responsive M5 framing profile`
- Prior M5.3.R1 baseline: `af13e9df27be788f8295900d1d7a021bca699998`
- M5.5 paths are untracked: `app/visual-lab/photonic-skin-ps04-m5/promotion-preview/`, `design/photonic-skin/ps-04-m5-5/`, `public/photonic-skin/ps-04-m5-5/`, `tests/photonic-ps04-m5-5.test.ts`
- Tracked production and frozen files are unmodified
- No push, no deploy, no amend/reset/rebase

## 3. M5.4 human selection

```text
status = HUMAN PASS / SELECTED M5 FRAMING PROFILE
selectedProfile = OWNER_SELECTED_124_111_111
aboutRequestedZoom = 1.24 / aboutMobileCap = 1.18
merchRequestedZoom = 1.11 / merchMobileCap = 1.08
videoRequestedZoom = 1.11 / videoMobileCap = 1.08
notProductionApproval = true
promotionTarget = PS-04.M5.5
m55Started = false
```

Record: `design/photonic-skin/ps-04-m5-4/reports/human-review.md`  
`BALANCED_REVIEW` remains evidence-only, not selected.

## 4. M5.4 checkpoint commit

One commit: `f43e8b9b59d881bc908f7f78ddcb45f9cb27eb41`  
`feat(photonic-skin): approve responsive M5 framing profile`

## 5. Selection-lock

`design/photonic-skin/ps-04-m5-5/selection-lock.json`  
Hash: `14cb2c37d5fac29b2f69a7a8ee1c342be13c67ac9007cd1b256b668663eb9392`  
No automatic winner/recommendation logic.

## 6. Frozen aggregate baseline (read-only)

- Namespace: `public/photonic-skin/ps-03-m3-1r/`
- Manifest SHA: `530ca41e0faecf291ea9f674a7e383ae8739af0bddad578a765a7c264129ea82`
- Fingerprint: `0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2`
- Identity fingerprint: `be43f82dd46fb7f0327aacc62d30980c9a32c215eeedf9c1b6a872ccf3cddda6`
- N = 16384, stride = 40
- LOD prefixes: 512, 1024, 2048, 4096, 8192, 12288, 16384
- Camera: canonical `[2.8, -7.8, 4.6]`, FOV 33°
- M4.1 aggregate: `a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361`
- Frozen SINGLE video: `3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b`
- 154 canonical state IDs preserved

Frozen validator was not run (it writes frozen reports). Versioned M5.5 copies only.

## 7. Event donor

```text
EVENT_A_R2
5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b
humanDecision = PASS
```

A‑R2 coordinates, baked orientation, viewer-right figure included. No runtime `+180°`.

## 8. Video donor

```text
VIDEO_COMBO_40_R1
2d6957815b6f58f87f1709e0378313cba271530b8fb0e02282b556780448a873
composition = camera + clapperboard
compositionYaw = −40° around +Z (baked)
clapperOpenAngle = 30° (baked)
humanDecision = PASS
```

Connected hinge preserved. Old combo-40 is not used. No runtime object rotation.

## 9. Framing profile

```text
OWNER_SELECTED_124_111_111
About 1.24 desktop / 1.18 mobile cap
Merch 1.11 desktop / 1.08 mobile cap
Video 1.11 desktop / 1.08 mobile cap
```

Applied automatically in promotion preview (empty query). `BALANCED_REVIEW` is not the candidate default.

## 10–14. State impact sets

```text
event-only = 50
video-only = 32
intersection = 33
unaffected = 39
union = 154
Event-containing = 83
Video-containing = 65
changed = 115
```

`50 + 32 + 33 + 39 = 154`. Union is not a naive sum of 83+65.

## 15. Aggregate authoring architecture

```text
frozen aggregate definitions
+ EVENT_A_R2 donor
+ VIDEO_COMBO_40_R1 donor
+ frozen identity/LOD contracts
→ PS-04.M5.5 promotion candidate
```

Pipeline: `design/photonic-skin/ps-04-m5-5/scripts/build_promoted_aggregate.py`

- SINGLE event/video: whole donor buffer copy (byte-identical)
- Event (non-single): Event contribution baked with A‑R2 figure-left (viewer-right after baked 180°), no runtime rotation
- Video (non-single): combo-40-r1 LOD-prefix graft; yaw −40° and clapper 30° already baked
- Intersection: both donors in one deterministic build
- Unaffected: byte-exact frozen copy
- Runtime overlays are not the promotion result

## 16. Promoted namespace

```text
public/photonic-skin/ps-04-m5-5/
  states/  component-maps/  manifests/  promotion-selection.json
design/photonic-skin/ps-04-m5-5/promoted-aggregate/
```

154 candidate state IDs keep canonical names and order. No overwrite of `ps-03-*`, `ps-04-m5-2*`, `ps-04-m5-3*`.

## 17. SINGLE donor exactness

- `single-event` candidate hash = EVENT_A_R2
- `single-video` candidate hash = VIDEO_COMBO_40_R1

## 18. Unaffected byte identity

39 unaffected states: candidate bytes = frozen baseline bytes, hashes equal.

## 19. Persistent identity

N=16384, stride=40, finite values, canonical order, persistent IDs not renumbered. Identity report: `allFinite=true`, `canonicalOrder=true`.

## 20. LOD

All seven prefixes validated per promoted state. Offline LOD contact sheets for SINGLE Event, SINGLE Video, and an intersection state.

## 21. Component visibility

SINGLE video uses the 7-part combo map. Event component visibility profiles are carried with A‑R2. Non-target competencies are not replaced (`non-target-preservation.json`: `allNonTargetPreserved=true`).

## 22. Event recognition

Browser Event SINGLE (05.3) hash = A‑R2. Offline 154-state inventory plus Event-only board. Viewer-right figure is frozen `figure-left` after baked 180°.

## 23. Video recognition

Browser Video SINGLE (05.5) hash = combo-40-r1. Camera + clapper, yaw −40°, open 30°, connected hinge. Overlay HUD: `videoOverlay=none`.

## 24. Intersection states

33 Event+Video states receive both donors. Site-route representative is About BRAND_WIDE gather (`8a4fc887…`, zoom 1.24). Offline board: `renders/boards/05-intersection.png`. QA `requestState` on the Event screen does not switch family to COMPLEX; that is a HUD limitation, not an authoring miss.

## 25. Palette/mask preservation

`palette-mask-validation.json`: `allUnchanged=true`. Promotion changes geometry, not competency masks / LUT membership.

## 26. Framing integration

- node `02` + exact About geometry → 1.24
- node `05.7` + `single-merch` → 1.11
- node `05.5` + promoted `single-video` → 1.11
- node `03.1` with same BRAND_WIDE geometry stays 1.0
- Hero and all other nodes stay 1.0
- `camera.zoom` is the framing operator; pose/FOV/slot unchanged; PerspectiveCamera preserved

## 27. ABOUT_124 real safe-area

Desktop 1440×900 actor visible-pixel mask vs heading `#heading-02`, header, graph, viewport:

- requested = effective = 1.24, not silently capped
- no heading / header / graph overlap
- no viewport clip
- actor right 1306 vs graph left 1342 (~36px gap, tight)
- verdict **PASS**

## 28. Responsive caps

| Viewport | About | Merch | Video |
|---|---|---|---|
| 1920×1080 / 1440×900 / 1280×720 | 1.24 | 1.11 | 1.11 |
| 390×844 | 1.18 | 1.08 | 1.08 |

## 29. Transition validation

154/154 endpoints pass. 154/154 self no-op. 16 compiled site + critical Event/Video pairs: `t0Exact/t1Exact/finite`, no third geometry. Browser WebMs recorded for required site edges.

## 30. Pair probe

Full `154×153=23,562` directed non-self compile **not run** in this checkpoint (~59 min). Available via `PS04M55_FULL_PAIRS=1` into the versioned M5.5 report only. Did not write frozen reports.

## 31. Rapid residual

`PS04-M5-R001` remains deferred. Not fixed, not weakened.

## 32. Reduced motion

`?reduced=1` clip recorded and played 1× to `ended`. Choreography (`PALETTE_DELAY_FRACTION=0.06`) unchanged.

## 33. Context restore / resize / theme

Context-restore sample: `namespacePreserved=true`, promoted About hash retained, framing profile retained, one canvas / one draw. Light/Dark stills captured. Reload of promotion preview stays on `ps-04-m5-5`.

## 34. Runtime invariants

Settled samples: 1 canvas, 1 actor draw, 131072 triangles, 1 program. Footer: no actor. HUD:

```text
assetNamespace = ps-04-m5-5
eventOverlay = none
videoOverlay = none
runtimeRotationOverride = none
framingProfile = OWNER_SELECTED_124_111_111
```

## 35. Cache / prewarm

Candidate loads from M5.5 namespace. Overlay banks are not used. 20 programmatic site hops completed in 2.4s without a second actor; this is **not** 20 fully settled visual walks.

## 36. Performance

Warm sample: 1 canvas, 1 program, 1 geometry, 1 draw. GPU p50 ≈ 0.97ms. Heap rose during the 20-hop loop (expected while programs/textures populate). Long tasks during compile/staging are disclosed. No second scene.

## 37. Tests / typecheck / lint / build

- `tests/photonic-ps04-m5-5.test.ts` 8/8
- `design/photonic-skin/ps-04-m5-5/tests/test_ps04m55.py` 7/7
- M5.4 Node tests still pass
- `npx tsc --noEmit` pass
- ESLint on promotion-preview files pass
- `npx next build --webpack` pass; new routes only the two promotion-preview paths
- Frozen `test_ps03m41.py` as a script still `KeyError: transitionRecordLayout` — pre-existing residual

## 38. Evidence paths

```text
design/photonic-skin/ps-04-m5-5/
  authoring/  promoted-aggregate/  scripts/  tests/
  reports/  renders/{states,boards,responsive,transitions,browser/video}
  selection-lock.json  manifest.json
public/photonic-skin/ps-04-m5-5/
tests/photonic-ps04-m5-5.test.ts
```

## 39. Review URLs

- Clean site: `/visual-lab/photonic-skin-ps04-m5/promotion-preview`
- QA HUD: `/visual-lab/photonic-skin-ps04-m5/promotion-preview/review`
- Production: `/` (SiteShell, unchanged)

## 40. Known limitations

- Full 23,562 pair compile not executed
- 20-pass cache loop was programmatic hops, not 20 settled walks
- Node `03.2` walk timed out (`activeNode timeout 03.2`)
- Merch/Video safe-area heading queried offscreen About heading; About measurement is the valid mask test
- Complex-focus Event+Video was not mounted via Event-screen `requestState` (family stays EVENT); site-route intersection evidence is About BRAND_WIDE plus offline intersection board
- `identity-validation.json` `lodPriorityIdentity` is conservatively true; byte/LOD checks live in tests
- Rapid residual `PS04-M5-R001` unchanged
- Unrelated leftover `page@*.webm` files exist in older stage folders; they are not part of M5.5 and must not be committed

## 41. Human checklist

1. About действительно 124% на desktop?
2. About не пересекает heading/graph?
3. Mobile About capped до 118%?
4. Event во всех контекстах использует A‑R2?
5. Справа полноценная фигура из чешуек?
6. Video использует combo-40-r1?
7. Video yaw −40°, clapper open 30°?
8. Хлопушка соединена в complex states?
9. Merch и Video 111% desktop?
10. Mobile Merch/Video capped до 108%?
11. Event+Video intersection не разваливаются?
12. Palette complex states не изменилась?
13. Переходы без center dwell / цветового flash?
14. Остальные states визуально не изменились?
15. Production `/` всё ещё старый SiteShell?

## 42. Production isolation

`/` remains SiteShell. No M5.5 request from `/`. Production asset namespace and framing unchanged. New routes are visual-lab only.

## 43. Frozen confirmation

PS‑03 and M5.2/M5.3 sandbox assets were not overwritten. Frozen SINGLE video hash unchanged.

## 44. M5.5 uncommitted, no push, no deploy

Confirmed.

## 45. M5.6 not started

`design/photonic-skin/ps-04-m5-6` does not exist. `manifest.json` `m56Started=false`.
