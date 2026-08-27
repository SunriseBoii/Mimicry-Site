"use client";

import { useEffect, useMemo, useState } from "react";
import {
  M41Scene as FrozenM41RScene,
  type SceneStats as FrozenSceneStats,
} from "../photonic-skin-m4-1r/M41Scene";
import type {
  CameraPreset,
  LabFrame,
  StateEntry,
} from "../photonic-skin-m4-1/m41-data";
import {
  MATERIAL_THEME_PRESETS,
  clampThemeMix,
  defaultMaterialController,
  type MaterialTheme,
} from "./material-foundation";
import {
  PS04M1Scene,
  type SceneEnvironment,
  type SceneStats,
} from "./PS04M1Scene";
import { usePS04Runtime } from "./use-ps04-runtime";
import styles from "./ps04m1.module.css";

const CAMERAS: CameraPreset[] = ["canonical", "alternate", "side", "top"];
const FRAMES: LabFrame[] = ["desktop", "mobile390", "silhouette180", "silhouette96"];
const LOD_LEVELS = [512, 1024, 2048, 4096, 8192, 12288, 16384] as const;
const EMPTY_FROZEN_STATS: FrozenSceneStats = {
  fps: 0,
  medianMs: 0,
  p95Ms: 0,
  drawCalls: 0,
  triangles: 0,
  textureMiB: 0,
};
const EMPTY_STATS: SceneStats = {
  ...EMPTY_FROZEN_STATS,
  programs: 0,
  geometries: 0,
  textures: 0,
  dpr: 0,
  drawingBuffer: [0, 0],
};

function stateLabel(entry: StateEntry) {
  return entry.stateId.replaceAll("-", " · ");
}

function preferredSamples(states: StateEntry[]) {
  const ids = new Set<string>();
  const add = (entry: StateEntry | undefined) => {
    if (entry) ids.add(entry.stateId);
  };
  add(states.find((entry) => entry.stateRole === "master"));
  states.filter((entry) => entry.stateRole === "single").forEach(add);
  add(states.find((entry) => entry.stateId === "complex-focus-content-design-focus-content")
    ?? states.find((entry) => entry.stateId.startsWith("complex-focus")));
  add(states.filter((entry) => entry.stateId.startsWith("complex-gather"))
    .sort((a, b) => b.stateId.length - a.stateId.length)[0]);
  add(states.filter((entry) => entry.stateId.startsWith("complex-drive"))
    .sort((a, b) => b.stateId.length - a.stateId.length)[0]);
  add(states.find((entry) => entry.stateId.startsWith("brand-wide-gather")));
  return states.filter((entry) => ids.has(entry.stateId));
}

function useSystemReducedMotion() {
  const [value, setValue] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setValue(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return value;
}

export function PS04M1Lab() {
  const [theme, setTheme] = useState<MaterialTheme>("light");
  const [themeMix, setThemeMix] = useState(0);
  const [stableVariation, setStableVariation] = useState(true);
  const [comparison, setComparison] = useState(false);
  const [closeUp, setCloseUp] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("canonical");
  const [frame, setFrame] = useState<LabFrame>("desktop");
  const [dpr, setDpr] = useState<1 | 1.5 | 2>(1.5);
  const [budget, setBudget] = useState(16384);
  const [progress, setProgress] = useState(1);
  const [staticMode, setStaticMode] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [manualReduced, setManualReduced] = useState(false);
  const [stats, setStats] = useState<SceneStats>(EMPTY_STATS);
  const [legacyStats, setLegacyStats] = useState<FrozenSceneStats>(EMPTY_FROZEN_STATS);
  const [environment, setEnvironment] = useState<SceneEnvironment | null>(null);
  const [contextState, setContextState] = useState<"ready" | "lost" | "restored">("ready");
  const [parityStatus, setParityStatus] = useState("not run");
  const systemReduced = useSystemReducedMotion();
  const reducedMotion = systemReduced || manualReduced;
  const runtime = usePS04Runtime({ reducedMotion, trigger: "qa" });
  const samples = useMemo(
    () => preferredSamples(runtime.manifest?.states ?? []),
    [runtime.manifest],
  );

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      const query = new URLSearchParams(window.location.search);
      const requestedTheme = query.get("theme");
      const requestedCamera = query.get("camera");
      const requestedFrame = query.get("profile");
      const requestedDpr = Number(query.get("dpr"));
      const requestedLod = Number(query.get("lod"));
      if (requestedTheme === "light" || requestedTheme === "dark") {
        setTheme(requestedTheme);
        setThemeMix(requestedTheme === "dark" ? 1 : 0);
      }
      if (CAMERAS.includes(requestedCamera as CameraPreset)) setCameraPreset(requestedCamera as CameraPreset);
      if (FRAMES.includes(requestedFrame as LabFrame)) setFrame(requestedFrame as LabFrame);
      if (requestedDpr === 1 || requestedDpr === 1.5 || requestedDpr === 2) setDpr(requestedDpr);
      if (LOD_LEVELS.includes(requestedLod as (typeof LOD_LEVELS)[number])) setBudget(requestedLod);
      setComparison(query.get("compare") === "1");
      setCloseUp(query.get("closeup") === "1");
      setStableVariation(query.get("variation") !== "0");
      setStaticMode(query.get("motion") !== "transition");
      setProgress(query.has("t") && Number.isFinite(Number(query.get("t")))
        ? clampThemeMix(Number(query.get("t")))
        : 1);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!runtime.sourceId || !runtime.targetId) return;
    const query = new URLSearchParams(window.location.search);
    query.set("source", runtime.sourceId);
    query.set("state", runtime.targetId);
    query.set("theme", theme);
    query.set("mix", themeMix.toFixed(3));
    query.set("camera", cameraPreset);
    query.set("profile", frame);
    query.set("dpr", String(dpr));
    query.set("lod", String(budget));
    query.set("t", progress.toFixed(3));
    query.set("compare", comparison ? "1" : "0");
    query.set("closeup", closeUp ? "1" : "0");
    query.set("variation", stableVariation ? "1" : "0");
    query.set("motion", staticMode ? "static" : "transition");
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [
    budget,
    cameraPreset,
    closeUp,
    comparison,
    dpr,
    frame,
    progress,
    runtime.sourceId,
    runtime.targetId,
    stableVariation,
    staticMode,
    theme,
    themeMix,
  ]);

  useEffect(() => {
    if (!playing || staticMode || reducedMotion || !runtime.program) return;
    let frameId = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = now - previous;
      previous = now;
      setProgress((value) => {
        const next = value + elapsed / Math.max(1, runtime.program?.durationMs ?? 1);
        return next >= 1 ? 0 : next;
      });
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [playing, reducedMotion, runtime.program, staticMode]);

  const controller = useMemo(() => ({
    ...defaultMaterialController(theme),
    themeMix,
    reducedMotion,
    stableVariation,
  }), [reducedMotion, stableVariation, theme, themeMix]);

  const sceneProps = runtime.source && runtime.target && runtime.program && runtime.manifest ? {
    source: runtime.source,
    target: runtime.target,
    program: runtime.program,
    budget,
    progress: staticMode || reducedMotion ? 1 : progress,
    reducedMotion: staticMode || reducedMotion,
    debugMode: "neutral" as const,
    cameraPreset,
    presentationContract: runtime.manifest.presentationContract,
    profile: frame,
    dpr,
    selectedId: -1,
    evaluator: "m4" as const,
  } : null;

  const activePreset = MATERIAL_THEME_PRESETS[theme];
  const sceneStyle = {
    "--ps04-background": activePreset.background,
    "--ps04-substrate": activePreset.substrate,
  } as React.CSSProperties;

  const chooseTheme = (next: MaterialTheme) => {
    setTheme(next);
    setThemeMix(next === "dark" ? 1 : 0);
  };

  const runGpuParity = () => {
    const button = document.getElementById("ps04m1-gpu-parity-run-foundation");
    if (!(button instanceof HTMLButtonElement)) return;
    setParityStatus("running");
    button.click();
    const poll = window.setInterval(() => {
      if (button.dataset.status === "done") {
        window.clearInterval(poll);
        const result = JSON.parse(button.dataset.result ?? "{}") as { valid?: boolean; maxPositionError?: number };
        setParityStatus(result.valid ? `pass · max Δ ${result.maxPositionError?.toExponential(2)}` : "failed");
      }
      if (button.dataset.status === "error") {
        window.clearInterval(poll);
        setParityStatus("error");
      }
    }, 100);
  };

  const runContextRestore = () => {
    const button = document.getElementById("ps04m1-context-restore-run-foundation");
    if (button instanceof HTMLButtonElement) button.click();
  };

  return (
    <main className={styles.lab} data-theme={theme} style={sceneStyle}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Photonic Skin · PS-04.M1</p>
          <h1>Material Foundation</h1>
          <p>One frozen actor. One neutral material pipeline. Light ceramic and dark titanium.</p>
        </div>
        <div className={styles.statusBlock}>
          <span data-status={contextState}>WebGL {contextState}</span>
          <span>PS-03 read-only</span>
          <a href="/visual-lab/photonic-skin-ps04-m1/preview">Hero preview ↗</a>
        </div>
      </header>

      <section className={styles.workspace}>
        <div
          className={styles.stage}
          data-frame={frame}
          data-comparison={comparison}
          data-closeup={closeUp}
        >
          {runtime.loading ? <div className={styles.loading}>Loading frozen actor…</div> : null}
          {runtime.error ? <div className={styles.error}>{runtime.error}</div> : null}
          {sceneProps ? (
            comparison ? (
              <div className={styles.comparisonGrid}>
                <figure className={styles.legacyPane}>
                  <figcaption>PS-03 neutral QA</figcaption>
                  <FrozenM41RScene
                    {...sceneProps}
                    diagnosticId="legacy"
                    onStats={setLegacyStats}
                    onContextState={() => undefined}
                  />
                </figure>
                <figure className={styles.foundationPane}>
                  <figcaption>PS-04 foundation · {theme}</figcaption>
                  <PS04M1Scene
                    {...sceneProps}
                    material={controller}
                    diagnosticId="foundation"
                    onStats={setStats}
                    onEnvironment={setEnvironment}
                    onContextState={setContextState}
                  />
                </figure>
              </div>
            ) : (
              <figure className={styles.foundationPane}>
                <figcaption>Material-neutral · {theme} · variation {stableVariation ? "on" : "off"}</figcaption>
                <PS04M1Scene
                  {...sceneProps}
                  material={controller}
                  diagnosticId="foundation"
                  onStats={setStats}
                  onEnvironment={setEnvironment}
                  onContextState={setContextState}
                />
              </figure>
            )
          ) : null}
        </div>

        <aside className={styles.controls}>
          <section>
            <h2>Material</h2>
            <div className={styles.segmented}>
              {(["light", "dark"] as const).map((value) => (
                <button key={value} data-active={theme === value} onClick={() => chooseTheme(value)}>
                  {value}
                </button>
              ))}
            </div>
            <label>
              Theme mix <output>{themeMix.toFixed(2)}</output>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={themeMix}
                onChange={(event) => setThemeMix(clampThemeMix(Number(event.target.value)))}
              />
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={stableVariation} onChange={(event) => setStableVariation(event.target.checked)} />
              Stable persistent-ID variation
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={comparison} onChange={(event) => setComparison(event.target.checked)} />
              Independent side-by-side canvases
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={closeUp} onChange={(event) => setCloseUp(event.target.checked)} />
              Surface close-up
            </label>
            <p className={styles.contract}>MATERIAL-NEUTRAL · palette uniforms reserved, color engine disabled.</p>
          </section>

          <section>
            <h2>Frozen state</h2>
            <div className={styles.sampleGrid}>
              {samples.map((entry) => (
                <button
                  key={entry.stateId}
                  data-active={runtime.targetId === entry.stateId}
                  onClick={() => runtime.setTargetId(entry.stateId)}
                  title={entry.stateId}
                >
                  {entry.stateId === "master-neutral"
                    ? "MASTER"
                    : entry.stateId.startsWith("single-")
                      ? entry.stateId.slice(7).toUpperCase()
                      : entry.stateId.startsWith("brand-wide")
                        ? "BRAND_WIDE / GATHER"
                        : entry.stateId.includes("focus")
                          ? "FOCUS"
                          : entry.stateId.includes("gather")
                            ? "GATHER"
                            : "DRIVE"}
                </button>
              ))}
            </div>
            <label>
              All 154 frozen states
              <select value={runtime.targetId} onChange={(event) => runtime.setTargetId(event.target.value)}>
                {runtime.manifest?.states.map((entry) => (
                  <option key={entry.stateId} value={entry.stateId}>{stateLabel(entry)}</option>
                ))}
              </select>
            </label>
            <label>
              Transition source
              <select value={runtime.sourceId} onChange={(event) => runtime.setSourceId(event.target.value)}>
                {runtime.manifest?.states.map((entry) => (
                  <option key={entry.stateId} value={entry.stateId}>{stateLabel(entry)}</option>
                ))}
              </select>
            </label>
          </section>

          <section>
            <h2>Presentation</h2>
            <div className={styles.buttonGrid}>
              {CAMERAS.map((value) => (
                <button key={value} data-active={cameraPreset === value} onClick={() => setCameraPreset(value)}>
                  {value}
                </button>
              ))}
            </div>
            <div className={styles.buttonGrid}>
              {FRAMES.map((value) => (
                <button key={value} data-active={frame === value} onClick={() => setFrame(value)}>
                  {value.replace("silhouette", "")}
                </button>
              ))}
            </div>
            <label>
              Nested LOD
              <select value={budget} onChange={(event) => setBudget(Number(event.target.value))}>
                {LOD_LEVELS.map((value) => <option key={value} value={value}>{value.toLocaleString()} IDs</option>)}
              </select>
            </label>
            <label>
              DPR
              <select value={dpr} onChange={(event) => setDpr(Number(event.target.value) as 1 | 1.5 | 2)}>
                <option value={1}>1</option>
                <option value={1.5}>1.5</option>
                <option value={2}>2</option>
              </select>
            </label>
          </section>

          <section>
            <h2>Motion QA</h2>
            <label className={styles.check}>
              <input type="checkbox" checked={staticMode} onChange={(event) => setStaticMode(event.target.checked)} />
              Fully static material QA
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={manualReduced} onChange={(event) => setManualReduced(event.target.checked)} />
              Reduced motion
            </label>
            <label>
              Frozen transition <output>{progress.toFixed(3)}</output>
              <input
                type="range"
                min="0"
                max="1"
                step="0.001"
                value={progress}
                disabled={staticMode}
                onChange={(event) => setProgress(Number(event.target.value))}
              />
            </label>
            <button disabled={staticMode || reducedMotion} onClick={() => setPlaying((value) => !value)}>
              {playing ? "Pause frozen transition" : "Play frozen transition"}
            </button>
          </section>

          <section>
            <h2>Runtime</h2>
            <dl className={styles.metrics}>
              <div><dt>Draw / triangles</dt><dd>{stats.drawCalls} / {stats.triangles.toLocaleString()}</dd></div>
              <div><dt>FPS · p95</dt><dd>{stats.fps} · {stats.p95Ms.toFixed(2)} ms</dd></div>
              <div><dt>DPR / buffer</dt><dd>{stats.dpr} · {stats.drawingBuffer.join("×")}</dd></div>
              <div><dt>GPU resources</dt><dd>{stats.programs}P · {stats.geometries}G · {stats.textures}T</dd></div>
              <div><dt>Texture estimate</dt><dd>{stats.textureMiB} MiB</dd></div>
              <div><dt>Legacy draw / triangles</dt><dd>{legacyStats.drawCalls} / {legacyStats.triangles.toLocaleString()}</dd></div>
              <div><dt>Load</dt><dd>{runtime.loadMs} ms</dd></div>
              <div><dt>GPU</dt><dd title={environment?.gpuRenderer}>{environment?.gpuRenderer ?? "measuring…"}</dd></div>
            </dl>
            <div className={styles.qaActions}>
              <button onClick={runGpuParity}>Run vertex parity</button>
              <span>{parityStatus}</span>
              <button onClick={runContextRestore}>Lose / restore context</button>
              <span>{contextState}</span>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
