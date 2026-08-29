# PS-04.M3 baseline

Captured at the start of this implementation stage on 2026-08-28, then re-verified after the isolated M3 work.

## Repository and packages

- Git HEAD: `ded950b8047ca08a3797ac3d872dba3dd56b34e3` (`Remove obsolete photonic skin design archive`) on `master`.
- Working tree at M3 start: HEAD clean; untracked M2 only (`app/visual-lab/photonic-skin-ps04-m2/`, `design/photonic-skin/ps-04-m2/`, `tests/photonic-ps04-m2.test.ts`). Inventory: `reports/pre-implementation-snapshot.json`.
- No stash, reset, clean, commit, push, or deploy was performed. The tree was not reverted to `ded950b`.
- Next.js `16.2.6`, React / React DOM `19.2.6`, Three.js `0.185.1`, React Three Fiber `9.7.0`.
- `package.json` / lockfile were not changed. `playwright-core` remains a non-saved capture tool (Edge `channel: "msedge"`, ANGLE D3D11).

## Owner permission (M2 visual direction)

Owner reviewed M2 and said: «Меня в целом устраивает. Давай переходить к PS‑04.M3».

This is permission to continue from the current M2 visual direction. It does **not** close M1/M2 aesthetic limitations and does not rewrite old reports.

## Frozen hashes (must still match)

| Control | Value |
| --- | --- |
| PS-03.M4.1 aggregate | `a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361` |
| PS-03.M4.1 manifest SHA-256 | `d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441` |
| PS-03.M4.1R patch | `228ddce450536d94d625d73f99ceff133371ccfe515a6f21cc3377fa3fda3ca0` |
| PS-03.M3.1R endpoints | `0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2` |
| PS-04.M1 source aggregate | `4cb80b507605bf439e9de5210e5f022159c716ee286fa81b98f0e943cf5b75eb` |
| PS-04.M2 source aggregate | `f04bc262cdc80e6061d2ad7fdb6501f60aa0a31105a55f876a8eaa26f0266c0d` |
| Attached M2 manifest SHA-256 | `14a612a53d4006a595a8e70c0d19c86ec0eb76549aa73a5e3ea878ce4c3ea9f8` |

Method: SHA-256 over sorted `relative-path + TAB + file-SHA256 + LF`. Manifests are excluded from their own recursive aggregates.

Counts: 154 states, 35 programs, 105 motion files. Camera up `[0,0,1]`.

## M2 report numbers (historical, not re-run as a gate)

`npm test` 107/107 (15 focused M2 + 6 focused M1). Python 4/4 + 11/11 + 11/11. typecheck/lint PASS. build 35/35 static pages.

## Open M1/M2 limitations (not closed by M3)

1. Light-theme specular pinpoints on facet peaks.
2. Readability of the smallest Dark DRIVE / BRAND_WIDE components at 180 / 96.
3. MASTER Light nearly neutral near color phase 0.5.
4. M2 coverage is an ID × scale² proxy, not exact visible area.

M3 does not tie color phase to rotation to hide the MASTER dip, and does not raise glow/exposure for small details.

## Audit notes used for the overlay boundary

- Frozen evaluator ends at `center`, `orientation`, `normal`, `local` in the vertex shader. Presentation is `(point + frameTranslate) * frameScale`.
- Actor pulse already exists in compiled M4 (`c2Bump` / `actorTrack.window` anticipation `[0, 0.11]`). M3 does not add a second pulse.
- M4 live-source retarget exists: `createRetargetSnapshot` in evaluator space, without presentation and without the M3 overlay.
- M2 `PhotonicPaletteController` has `setPhase` / `advance(dt)` / `setPlaying` / `setMask` / `snapshot()` and no `setPaletteProgress`. Geometry-linked progress is `PhotonicPaletteDriver` in M3; the M2 file is not edited.
- M2 LUT remains `uniform vec4[32]`.
