# PS-04.M4 screen → actor mapping

Resolver: `app/visual-lab/photonic-skin-ps04-m4/actor-resolver.ts`. Semantic choices live here, not in JSX conditionals.

Never invents a geometry ID. Exact frozen state if the registry has it; otherwise documented fallback `brand-wide-gather-content-design-digital-event-games-merch-video` plus selected M2 palette mask (`applyPaletteOverride`). Diagnostic `exact | fallback | none` is shown in the lab HUD.

## Starting candidates (human review, not aesthetic lock)

| Node | Geometry | Palette | Resolution | Reason |
| --- | --- | --- | --- | --- |
| `01` Hero | `master-neutral` | all seven | exact | MASTER seven-color field |
| `02` About | BRAND_WIDE GATHER all-seven | all seven | exact | Compare later with FOCUS/DRIVE |
| `03.1` Task | `master-neutral` | all seven | exact | Tasks have no competence color |
| `03.2` before selection | `master-neutral` | all seven | exact | Keep MASTER until a mask exists |
| `03.2` with selection | exact FOCUS/GATHER/DRIVE/BRAND_WIDE if frozen, else fallback geometry + mask | selected | exact or fallback | 127 non-empty masks covered in tests |
| `03.3` / `04` before confirm | BRAND_WIDE GATHER | all seven | exact | Calm fallback until flow confirmed |
| `03.3` / `04` after confirm | selected composition or fallback + mask | selected | exact or fallback | Same resolver as `03.2` |
| `05.1`–`05.7` | frozen `single-*` | that bit only | exact | SINGLEs, actor left |
| `06.1` Team | BRAND_WIDE GATHER | all seven | exact | Compare, not semantically approved |
| `06.2` Partners | BRAND_WIDE DRIVE | all seven | exact | Compare, not auto-approved |
| `06.3` Clients | BRAND_WIDE GATHER | all seven | exact | Compare with FOCUS/DRIVE |
| `07` Contact | settled non-single family if present, else GATHER | inherited | exact | No new color |
| `08` Footer | none | 0 | none | No Mimic |

## Fallbacks

`FALLBACK_GEOMETRY_ID = brand-wide-gather-content-design-digital-event-games-merch-video`.

Tests: 127 non-empty masks on `03.2` never invent an ID; mix of exact and fallback; empty confirm is rejected in the flow layer before a mask is applied as a new geometry.

Tasks, team, partners, and clients are not recolored with invented competence colors. Complex objects are not painted per-component with competency colors.
