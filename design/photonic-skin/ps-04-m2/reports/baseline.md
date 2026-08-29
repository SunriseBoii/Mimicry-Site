# PS-04.M2 baseline

Captured at the start of this implementation stage on 2026-08-27, then re-verified after the isolated M2 worktree was complete.

## Repository and packages

- Git HEAD: `ded950b Remove obsolete photonic skin design archive` on `master`.
- Working tree at M2 start: only untracked PS-04.M2 files. M1 was already committed; it was not sitting as modified/untracked work.
- No stash, reset, clean, commit, push, or deploy was performed.
- Next.js `16.2.6`, React / React DOM `19.2.6`, Three.js `0.185.1`, React Three Fiber `9.7.0`.
- `package.json` / lockfile were not changed. `playwright-core` was used as a non-saved capture tool only.

## M1 snapshot (unchanged)

M1 source aggregate still matches `design/photonic-skin/ps-04-m1/manifest.json`:

`4cb80b507605bf439e9de5210e5f022159c716ee286fa81b98f0e943cf5b75eb`

Per-file SHA-256 of the M1 lab core:

| File | SHA-256 |
| --- | --- |
| `app/visual-lab/photonic-skin-ps04-m1/material-foundation.ts` | `f410b59384b9818ca808a4cefd73215871b00cd740dea5eb90adea8504674bcc` |
| `app/visual-lab/photonic-skin-ps04-m1/PS04M1Scene.tsx` | `46c09ebb7b9bf488d1011dd0d67f9a70f2b7bd0ef0d720624c4d9118dd5a57e8` |
| `app/visual-lab/photonic-skin-ps04-m1/PS04M1Lab.tsx` | `d6b1f5ebae58d5af2a1ecff9035bf212ab19eaaa6f0af9ee49db48ae3e927ed7` |
| `app/visual-lab/photonic-skin-ps04-m1/use-ps04-runtime.ts` | `1405e492228376907a7261b90b9543dafa5f238f4bf6b634b89046689fc84e88` |
| `design/photonic-skin/ps-04-m1/manifest.json` | `3f781d4b01499bfa4fcb44128ac9f324aed91fbbd6a2fcdc951b3d51868f2ddc` |

`git diff` against those M1 paths is empty after M2.

## Frozen renderer architecture (read-only)

- One `THREE.RawShaderMaterial`, one `instancedMesh`, `OctahedronGeometry(0.035, 0)`.
- 16,384 instances → one actor draw, 131,072 triangles, 16 data textures, ~4 MiB.
- Camera up remains `[0, 0, 1]`.
- M1 fragment: lightweight GGX/Cook-Torrance, shader-owned ACES, renderer `NoToneMapping`, output `SRGBColorSpace`.
- No emissive, bloom, HDR/PMREM, shadow maps, or post-processing.

## Frozen identity

- M4.1 aggregate: `a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361`
- M4.1 manifest SHA-256: `d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441`
- M4.1R presentation patch: `228ddce450536d94d625d73f99ceff133371ccfe515a6f21cc3377fa3fda3ca0`
- M3.1R endpoint fingerprint: `0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2`
- Counts: 154 states, 35 transition programs, 105 motion files.

## M1 open aesthetic questions carried forward

These remain human-review items. Color does not close them:

1. Light-theme specular pinpoints on facet peaks.
2. Readability of the smallest Dark DRIVE / BRAND_WIDE components at 180 / 96.
