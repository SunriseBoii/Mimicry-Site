# PS-04.M4 reproduction

All commands from the repository root. Dev server: `http://localhost:3000`.

```
npx next dev --port 3000
```

Lab smoke:

```
node design/photonic-skin/ps-04-m4/scripts/lab-smoke.mjs
```

GPU vertex + field (M3 then M4, same golden program):

```
node design/photonic-skin/ps-04-m4/scripts/run-gpu-parity-probes.mjs
```

Performance (R3F frame-delta, no screenshots):

```
node design/photonic-skin/ps-04-m4/scripts/measure-performance.mjs
```

Browser stills and wall-clock WebM (Edge / ANGLE D3D11). Playwright video recording needs ffmpeg (`npx playwright install ffmpeg` once):

```
node design/photonic-skin/ps-04-m4/scripts/capture-browser-evidence.mjs
```

Play recordings at 1× (HTMLVideoElement, not ffprobe-only):

```
node design/photonic-skin/ps-04-m4/scripts/watch-recordings.mjs
```

Boards:

```
python design/photonic-skin/ps-04-m4/scripts/build-visual-boards.py
```

Checkpoint hashes (excludes `manifest.json` from its own aggregate):

```
node design/photonic-skin/ps-04-m4/scripts/hash-checkpoint.mjs
```

Gates:

```
npx tsx --test tests/photonic-ps04-m4.test.ts
npm test
npx tsc --noEmit
npm run lint
python tests/photonic_m31r_python_test.py
python design/photonic-skin/ps-03-m4/tests/test_core.py
python design/photonic-skin/ps-03-m4-1/tests/test_core.py
npm run build
```

Routes (isolated; production `/` is unchanged):

- `/visual-lab/photonic-skin-ps04-m4`
- `/visual-lab/photonic-skin-ps04-m4/preview`

Query: `theme=light|dark`, `dpr=1|1.5|2`, `reduced=1`, `hud=0`, `identity=1`, `node=05.4`.
