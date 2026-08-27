# PS-04.M1 baseline

Captured before implementation on 2026-08-14.

## Repository and packages

- Initial Git status: `## master`, clean. No user or untracked files were present.
- Next.js `16.2.6`.
- React / React DOM `19.2.6`.
- Three.js `0.185.1`.
- React Three Fiber `9.7.0`.

## Frozen renderer architecture

- `/visual-lab/photonic-skin-m4-1r` uses one `THREE.RawShaderMaterial` on one `instancedMesh`.
- Geometry is `OctahedronGeometry(0.035, 0)`, eight triangles per persistent element.
- `16,384` persistent instances produce one draw and `131,072` triangles.
- The frozen vertex stage evaluates position, quaternion orientation, normal, scale, activation, actor track, presentation frame and final presentation transform. The frozen fragment is a neutral `vColor * vShade` output.
- Runtime uses 16 data textures, approximately 4 MiB. Geometry and transition data remain shared/read-only.
- Camera contract: Z-up `[0,0,1]`, FOV `33`, square aspect `1`, near/far `0.01/100`.

## Baseline gates

- TypeScript regression: 86/86 pass before PS-04.M1 tests were added.
- Existing M3.1R, M4 and M4.1 Python contract suites: green.
- M4.1R route: READY, one draw, `131,072` triangles, presentation matrix PASS, silhouette IoU `1.000000`.

## Frozen identity

- M4.1 aggregate: `a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361`.
- M4.1 manifest SHA-256: `d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441`.
- M4.1R patch: `228ddce450536d94d625d73f99ceff133371ccfe515a6f21cc3377fa3fda3ca0`.
- M3.1R endpoint fingerprint: `0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2`.
- Counts: 154 states, 35 transition programs, 105 motion files.
