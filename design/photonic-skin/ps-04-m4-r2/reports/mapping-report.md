# Approved screen → Mimic mapping (unchanged in M4.R2)

R2 does not revise semantic mapping.

| Screen | Mimic | Palette | Slot | Geometry |
| --- | --- | --- | --- | --- |
| 01 Hero | MASTER sphere | 127 | right | `master-neutral` exact |
| 02 About | canonical BRAND_WIDE | 127 | right | `brand-wide-gather-content-design-digital-event-games-merch-video` exact |
| 03.1 Task, before select | MASTER | 127 | right | `master-neutral` exact |
| 03.1 Task, after select | task family | 127 | right | family canonical / exact |
| 03.2 Competence | task family | selected, or 127 if empty | right | exact or same-family fallback |
| 03.3 Brief | settled build | selected | right | same as 03.2 |
| 03.3A Contact | no actor change | as 03.3 | right | same id + mask |
| 03.3B Success | no actor change | as 03.3 | right | same id + mask |
| 04 Cases | MASTER | 127 | right | `master-neutral` |
| 05.1–05.7 | matching SINGLE | one bit | left | `single-*` exact |
| 06.1 Team | MASTER | 127 | right | `master-neutral` |
| 06.2 Partners | MASTER | 127 | right | `master-neutral` |
| 06.3 Clients | MASTER | 127 | right | `master-neutral` |
| 07 Contact | MASTER | 127 | right | `master-neutral` |
| 08 Footer | none | 0 | none | no draw |

## Task → family

| Task | Family |
| --- | --- |
| Объяснить изменения | FOCUS |
| Вовлечь и объединить | GATHER |
| Обучить и помочь освоить новое | DRIVE |
| Познакомить с компанией и культурой | BRAND_WIDE |

No new geometry IDs. No cross-family fallback.
