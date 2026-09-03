# PS‑04.M6.2‑R1 — Approval report

```text
PS-04.M6.2-R1 — MACHINE PASS /
HUMAN LIVE-SEMANTICS, PLACEMENT AND MAGNETISM REVIEW REQUIRED
```

This is an isolated correction of uncommitted M6.2. It is not a HUMAN PASS, not production approval, not deploy approval, not a push, and not the start of a later M6 sub-stage.

## Binding

- Working branch: `ps04-m6-sandbox`
- M6.1 HUMAN PASS checkpoint: `c29e143580947fdf3f3f4121271a10805d4c5498`
- M6.2: HUMAN FAIL, uncommitted; no M6.2 checkpoint
- Frozen payload: `ps-04-m5-5`
- Builder delta: `ps-04-m6-1`
- Magnetism duration / settle floor: 340 ms / 2 px
- Event: `EVENT_A_R2`
- Video: `VIDEO_COMBO_40_R1`
- Framing: `OWNER_SELECTED_124_111_111`
- Production route: `/` unchanged
- Anime.js: not installed
- `m63Started = false`

## Four corrections

1. Settled `03.2` live semantics: 0 → MASTER, 1 → exact SINGLE, 2–7 → exact GATHER(draft). Each toggle is typed `in-screen-action` and does not bump `magneticSettleRevision`. Confirm / DRIVE on `03.3` remain `route-settle`.
2. About `02` is exact BRAND_WIDE all-seven, desktop zoom 1.24, mobile cap 1.18. Never MASTER, nearest-prefix, or builder state.
3. Presentation placement interpolates frozen slots from actual `scrollY` and C2. It does not wait for magnetized settle and does not create actor/compile/queue work. Semantic morph still starts after settle and does not replay the already-completed lateral move.
4. Versioned magnetism profile `R1_STRONG_BALANCED` (desktop 0.56 vh, mobile/touch 0.42 vh) runs on the existing controller tick. Review HUD compares it with `M6_2_CURRENT`.

## Hard gates (browser)

| Gate | Result |
| --- | --- |
| `03.2` explicit toggles exact M6.1 endpoints | PASS |
| `03.2` request source = `in-screen-action` | PASS |
| About `02` exact BRAND_WIDE all-seven | PASS |
| `requestsToCrossedNodes = 0` | PASS |
| `routeCompileLiveRetargetCount = 0` | PASS |
| `maxRouteActorQueueDepth ≤ 1` | PASS (observed 0) |
| `staleQueuedTransitionStarts = 0` | PASS |
| `runningMorphInterruptedByScroll = 0` | PASS |
| `placementActorRequestCount = 0` | PASS |
| `placementCompileCount = 0` | PASS |
| `placementQueueDepth = 0` | PASS |
| `postSettlePlacementDeltaPx ≤ 1` | PASS (0) |
| `magneticStrengthMonotonic = true` | PASS |
| MASTER flash / palette lead / center dwell | PASS (0 / 0 / 0) |
| third geometry / empty actor frame | PASS (false / 0) |
| one Canvas / actor / InstancedMesh / material / program / draw | PASS |
| Footer settled = 0 draw | PASS |
| production `/` unchanged | PASS |
| Anime.js dependency added | PASS (false) |

## Magnetism calibration (browser)

At 432 CSS px (~0.48 vh) from the Hero anchor:

- `R1_STRONG_BALANCED` capture radius = 504 px (0.56 vh), strength = 0.055
- `M6_2_CURRENT` capture radius = 0.25 vh, strength = 0.000

R1 captured that offset; M6.2 current did not. `evaluateMagnetism` returned to the nearest Hero anchor with `magneticOvershoot = false`. Starting review values 0.56 / 0.42 vh are retained.

## Review URLs

- Clean: http://localhost:3000/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1
- Review HUD: http://localhost:3000/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/review
- Production control: http://localhost:3000/

Human PASS of this review authorizes only the corrected M6.2 motion contract. It is not production or deploy approval.
