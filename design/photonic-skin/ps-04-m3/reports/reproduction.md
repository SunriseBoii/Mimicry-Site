# PS-04.M3 reproduction

All commands from the repository root. Do not start until `http://localhost:3000/visual-lab/photonic-skin-ps04-m3` returns 200.

Create output directories before capture. The capture script does this itself.

```
mkdir design/photonic-skin/ps-04-m3/renders/browser
mkdir design/photonic-skin/ps-04-m3/renders/browser/video
mkdir design/photonic-skin/ps-04-m3/renders/browser/sequences
mkdir design/photonic-skin/ps-04-m3/renders/boards
mkdir design/photonic-skin/ps-04-m3/reports
```

Dev server (already used for this checkpoint):

```
npm run dev
```

Lab smoke:

```
node design/photonic-skin/ps-04-m3/scripts/lab-smoke.mjs
```

GPU vertex + field probes (requires a compiled M4 program; the script requests MASTER→BRAND_WIDE):

```
node design/photonic-skin/ps-04-m3/scripts/run-gpu-parity-probes.mjs
```

Performance (no screenshots; R3F frame-delta only):

```
node design/photonic-skin/ps-04-m3/scripts/measure-performance.mjs
```

Browser stills, sequences, and realtime WebM (Edge / ANGLE D3D11, unique run id):

```
set PS04M3_RUN_ID=ps04-m3-20260828
node design/photonic-skin/ps-04-m3/scripts/capture-browser-evidence.mjs
```

Boards (after capture PNGs exist):

```
python design/photonic-skin/ps-04-m3/scripts/build-visual-boards.py
```

Checkpoint hashes (after writers have stopped; excludes `manifest.json` from its own aggregate):

```
node design/photonic-skin/ps-04-m3/scripts/hash-checkpoint.mjs
```

Gates:

```
npx tsx --test tests/photonic-ps04-m3.test.ts
npm test
python -m unittest tests.photonic_m31r_python_test -v
python design/photonic-skin/ps-03-m4-1/tests/test_core.py
python design/photonic-skin/ps-03-m4/tests/test_core.py
npx tsc --noEmit
npm run lint
npm run build
```

Playwright is `playwright-core` from `node_modules`, launched with `channel: "msedge"`. It is not added to `package.json`. Chrome is not a dependency. WebM recording needs Playwright's ffmpeg:

```
node node_modules/playwright-core/cli.js install ffmpeg
```

Video-only retry after stills (does not overwrite PNG evidence):

```
set PS04M3_VIDEOS_ONLY=1
set PS04M3_RUN_ID=ps04-m3-20260828
node design/photonic-skin/ps-04-m3/scripts/capture-browser-evidence.mjs
```

Readiness hook: `window.__PS04M3_LAB__.runId === "ps04-m3"` and `ready`, plus `__PS04M3_SCENE_READY__` / last actor draw. Preview uses `__PS04M3_PREVIEW__`. Do not wait for the M2 hook on the M3 route.
