# PS-04.M6.1 human visual checklist

Use the review HUD unless a row says "clean route". Production `/` is a control surface only.

| # | Board | Route | Setup | Expected Mimic |
| --- | --- | --- | --- | --- |
| 1a | 03.1 before task | review | open 03.1, no task | `master-neutral`, all seven colors, no task color |
| 1b | 03.1 after task | review | select any of the four tasks | still `master-neutral`; only DOM selection changes |
| 2a | 03.2 empty | review | task selected, 0 competencies | `master-neutral` |
| 2b | 03.2 one | review | Event only | `single-event` |
| 2c | 03.2 two | review | Event+Video | `complex-gather-event-video` |
| 2d | 03.2 four, no Content/Design | review | Digital+Event+Games+Merch | `complex-gather-digital-event-games-merch` |
| 2e | 03.2 seven | review | all seven | `complex-gather-…-video` (project-complex, not BRAND_WIDE id) |
| 3 | same set GATHER vs DRIVE | review | Event+Video on 03.2 then confirm → 03.3 | gather vs drive, same owners, different intent |
| 4 | Games+Merch+Video | review | 03.2 then 03.3 | exact gather then exact drive |
| 5 | Brief edit | review | confirmed Event+Video, edit textarea | geometry/hash unchanged |
| 6 | Edit after confirm | review | confirm Event+Video, return to 03.2, pick Games | 03.2 `single-games`; 03.3 still Event+Video DRIVE; brief stale |
| 7 | Light/Dark | review | same confirmed set | palette membership unchanged |
| 8 | Mobile 390×844 | review | 03.2 or 03.3 | same state id, no extra competencies |
| 9 | Clean route | clean | Event+Video GATHER | no HUD; same state as review |
| 10 | Production control | `/` | load homepage | `ps-04-m5-5` only; no `/photonic-skin/ps-04-m6-1/` |

Human PASS of project-builder Mimic semantics is recorded in `human-review.md`. This checklist remains the visual board index; it does not authorize production, deploy, or M6.2 implementation by itself.
