# PS‑04.M6.2 — Approval report

```text
PS-04.M6.2 — MACHINE PASS /
HUMAN MAGNETIZED-SETTLE MOTION REVIEW REQUIRED
```

This is an isolated magnetized-settle motion candidate. It is not production approval, not deploy approval, not a push, and not the start of a later M6 sub-stage.

## Binding

- Working branch: `ps04-m6-sandbox`
- M6.1 HUMAN PASS checkpoint: `c29e143580947fdf3f3f4121271a10805d4c5498`
- Frozen payload: `ps-04-m5-5`
- Builder delta: `ps-04-m6-1` (draft/confirmed semantics unchanged)
- Magnetism duration: 340 ms
- Event: `EVENT_A_R2`
- Video: `VIDEO_COMBO_40_R1`
- Framing: `OWNER_SELECTED_124_111_111`
- Production route: `/` unchanged
- M6.2 working tree: uncommitted
- `m63Started = false`

## Policy

```text
candidate ≠ committed target
scrolling: keep current endpoint or finish current visible morph
magnetized settle: publish exactly one latest target
current morph still running: queue only that latest settled target
user scrolls again: invalidate queued target
```

## Hard gates

| Gate | Result |
| --- | --- |
| `requestsToCrossedNodes = 0` | PASS |
| `maxActorQueueDepth ≤ 1` | PASS (observed 1, capacity 1) |
| `routeCompileLiveRetargetCount = 0` | PASS |
| `runningMorphInterruptedByScroll = 0` | PASS |
| `staleQueuedTransitionStarts = 0` | PASS |
| Rapid-9 actor requests after final settle | 1 |
| Production `/` does not bind M6.2 | PASS |
| M5.1 `PALETTE_DELAY_FRACTION = 0.06` | PASS |
| Magnetism baseline 340 ms | PASS |

## Review URLs

- Clean: http://localhost:3000/visual-lab/photonic-skin-ps04-m6/magnetized-settle
- Review HUD: http://localhost:3000/visual-lab/photonic-skin-ps04-m6/magnetized-settle/review
- Production control: http://localhost:3000/

Human PASS of this review authorizes only the next separately approved M6 sub-stage. It is not production or deploy approval.
