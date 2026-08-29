# PS-04.M4 topology registry

Single typed source: `app/visual-lab/photonic-skin-ps04-m4/topology.ts`.

DOM screens, `ScrollCompositionController`, actor resolver, and the right-hand graph all read this registry. Graph coordinates are data, not measured from DOM pixels.

## Counts

| Kind | Count |
| --- | --- |
| Full-screen nodes | 18 |
| Horizontal chapters | 3 (`03`, `05`, `06`) |
| Temporary non-nodes | 2 (`03.3A` contact, `03.3B` success) |

Temporary states have `graphRing: false`. They never receive graph rings.

## Order

`01 ↓ 02 ↓ (03.1 → 03.2 → 03.3) ↓ 04 ↓ (05.1 → … → 05.7) ↓ (06.1 → 06.2 → 06.3) ↓ 07 ↓ 08`

## Actor placement

| Nodes | Placement |
| --- | --- |
| `01`, `02`, `03.x`, `04`, `06.x`, `07` | right third |
| `05.1`–`05.7` | left third |
| `08` | none |

## SVG overrides actually applied

From `SVG_OVERRIDES` and `docs/mimicry-homepage-topology-checkpoint-2026-08-29.md`:

1. **Footer Mimic removed.** The SVG drew Mimic on `08`. Owner instruction cancels that. Exit is a composition-layer move, then `visible=false`.
2. **Header on every node including footer.** One persistent header, not 18 copies.
3. **Screens are responsive `100svh`.** 16:9 is a desktop approval profile, not a letterboxed frame.
4. **Copy is provisional.** SVG labels are fixtures.

## Graph geometry

Orthogonal polylines only. `05.7 → 06.1` uses the empty `y=5` highway so the connector does not cross `06` rings. `06` row sits at `y=6`. Distance `05.7`–`06.1` is one topology edge.

## Dynamic nodes

`03.2` / `03.3` start locked (dashed, not in the scroll sequence). Unlock is monotonic in the session. Reload starts a clean session.
