# PS-04.M6.2 human magnetized-settle checklist

This is a motion-review checklist. It is not a human PASS record.

Review HUD: `/visual-lab/photonic-skin-ps04-m6/magnetized-settle/review`  
Clean: `/visual-lab/photonic-skin-ps04-m6/magnetized-settle`  
Production control: `/`

| # | Question | Route | Setup | Expected |
| --- | --- | --- | --- | --- |
| 1 | Transform starts only after magnetic settle | review | slow adjacent 01→02 | HUD `magnetizedSettledNodeId` updates before `actorRequestCount` |
| 2 | Rapid fly-through keeps previous Mimic | review | rapid 01→05.5 | crossed candidates ignored; one request after final settle |
| 3 | Visible morph finishes calmly | review | start morph, then scroll | no freeze/rollback/snap; `runningMorphInterruptedByScroll = 0` |
| 4 | Final settled screen gets one morph | review | rapid then rest on 05.5 | latest magnetized settled target wins |
| 5 | No backlog of crossed screens | review | stop after rapid | `maxActorQueueDepth ≤ 1`; no replay of skipped nodes |
| 6 | Settle delay is not excessive | review | slow adjacent | request after 96 ms stable window, not a second wait |
| 7 | Jitter does not retarget Mimic | review | small wheel deltas on 02 | candidate ignored until settle |
| 8 | Wheel / keyboard / graph click | review | PageDown, graph click | same settle gate |
| 9 | MASTER flash / palette lead / center dwell | review | slow and rapid clips | none |
| 10 | Compile gap keeps source | review | scroll during preparing | cancel before visual start; actor stays exact source |
| 11 | Builder `03.1 → 03.2 → 03.3` | review | Event+Video confirm | gather then drive, exact owners |
| 12 | Settled `03.2` competency clicks | review | already settled 03.2 | magnetism gate not delaying in-screen requests |
| 13 | Footer hides actor only after settle | review | land on 08 | `magnetizedSettledNodeId = 08` then no-draw |
| 14 | Reduced motion is atomic | review `?reduced=1` | 01→05.5→08 | same predicate; no crossed requests |
| 15 | Production and payload unchanged | `/` | load homepage | `ps-04-m5-5` only; no M6.2 handle |

Named clips: `slow-adjacent.webm`, `rapid-forward.webm`, `reduced-motion.webm`.
