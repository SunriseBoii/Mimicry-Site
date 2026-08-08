"use client";

import { useEffect, useMemo, useState } from "react";
import { M3Scene, type CameraPreset, type DebugMode, type SceneStats } from "./M3Scene";
import {
  labelState,
  loadManifest,
  loadState,
  type CompositionMode,
  type DecodedState,
  type M3Manifest,
  type StateEntry,
} from "./m3-data";
import styles from "./m3-lab.module.css";

type ViewportProfile = "desktop" | "mobile" | "silhouette180" | "silhouette96";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function option(entry: StateEntry) {
  return <option key={entry.stateId} value={entry.stateId}>{labelState(entry)}</option>;
}

export function M3Lab() {
  const [manifest, setManifest] = useState<M3Manifest | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [source, setSource] = useState<DecodedState | null>(null);
  const [target, setTarget] = useState<DecodedState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadMs, setLoadMs] = useState(0);
  const [mode, setMode] = useState<CompositionMode>("FOCUS");
  const [focus, setFocus] = useState("all");
  const [budget, setBudget] = useState(8192);
  const [debugMode, setDebugMode] = useState<DebugMode>("neutral");
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("canonical");
  const [viewportProfile, setViewportProfile] = useState<ViewportProfile>("desktop");
  const [selectedId, setSelectedId] = useState(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [direction, setDirection] = useState(1);
  const [manualReduced, setManualReduced] = useState(false);
  const [stats, setStats] = useState<SceneStats>({ fps: 0, medianMs: 0, p95Ms: 0, drawCalls: 0, triangles: 0 });
  const systemReduced = useReducedMotion();
  const reducedMotion = systemReduced || manualReduced;

  useEffect(() => {
    loadManifest().then((value) => {
      setManifest(value);
      const master = value.states.find((entry) => entry.stateRole === "master")!;
      const single = value.states.find((entry) => entry.stateRole === "single")!;
      setSourceId(master.stateId);
      setTargetId(single.stateId);
      setBudget(Math.min(8192, value.identitySpace.size));
    }).catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    if (!manifest || !sourceId || !targetId) return;
    let cancelled = false;
    const sourceEntry = manifest.states.find((entry) => entry.stateId === sourceId);
    const targetEntry = manifest.states.find((entry) => entry.stateId === targetId);
    if (!sourceEntry || !targetEntry) return;
    const started = performance.now();
    Promise.all([loadState(sourceEntry), loadState(targetEntry)]).then(([loadedSource, loadedTarget]) => {
      if (cancelled) return;
      setSource(loadedSource);
      setTarget(loadedTarget);
      setLoadMs(Math.round(performance.now() - started));
      setProgress(0);
    }).catch((reason: Error) => setError(reason.message));
    return () => { cancelled = true; };
  }, [manifest, sourceId, targetId]);

  const competencies = useMemo(() => {
    if (!manifest) return [];
    return [...new Set(manifest.states.flatMap((entry) => entry.competencyIds))].sort();
  }, [manifest]);

  const filteredStates = useMemo(() => {
    if (!manifest) return [];
    return manifest.states.filter((entry) => {
      if (entry.stateRole === "master" || entry.stateRole === "single") return true;
      if (entry.compositionMode !== mode) return false;
      return focus === "all" || entry.focusCompetencyId === focus || entry.competencyIds.includes(focus);
    });
  }, [manifest, mode, focus]);

  const sourceEntry = manifest?.states.find((entry) => entry.stateId === sourceId) ?? null;
  const targetEntry = manifest?.states.find((entry) => entry.stateId === targetId) ?? null;
  const selectedPath = source && target ? {
    from: Array.from(source.position.slice(selectedId * 3, selectedId * 3 + 3)).map((value) => value.toFixed(3)).join(", "),
    to: Array.from(target.position.slice(selectedId * 3, selectedId * 3 + 3)).map((value) => value.toFixed(3)).join(", "),
    sourceStatus: source.status[selectedId],
    targetStatus: target.status[selectedId],
    sourceComponent: source.component[selectedId],
    targetComponent: target.component[selectedId],
  } : null;

  function updateProgress(value: number) {
    setProgress(value);
  }

  function togglePlaying() {
    if (reducedMotion) return;
    setPlaying((value) => !value);
  }

  return (
    <main className={styles.lab} data-ps03m3-ready={source && target ? "true" : "false"}>
      <header className={styles.header}>
        <div>
          <b>MIMICRY GROUP</b>
          <span>PS-03.M3 / UNIVERSAL STATE &amp; TRANSITION LAB</span>
        </div>
        <div className={styles.headerMeta}>
          <span>INTERNAL / NOINDEX</span>
          <span>{manifest ? `N=${manifest.identitySpace.size.toLocaleString("en-US")}` : "LOADING"}</span>
          <span>{manifest?.deterministicFingerprint.slice(0, 12) ?? "—"}</span>
        </div>
      </header>

      <section className={styles.workspace}>
        <div className={styles.visualColumn}>
          <div className={styles.viewport} data-profile={viewportProfile}>
            {error ? <div className={styles.fallback}><b>PS-03.M3 data error</b><span>{error}</span></div> : null}
            {!error && source && target ? (
              <M3Scene
                source={source}
                target={target}
                budget={budget}
                progress={progress}
                playing={playing}
                direction={direction}
                reducedMotion={reducedMotion}
                debugMode={debugMode}
                cameraPreset={cameraPreset}
                selectedId={selectedId}
                onProgress={setProgress}
                onStats={setStats}
              />
            ) : !error ? <div className={styles.fallback}>Streaming fixed-stride state buffers…</div> : null}
            <div className={styles.viewportReadout}>
              <span>{sourceEntry?.stateRole.toUpperCase() ?? "—"} → {targetEntry?.stateRole.toUpperCase() ?? "—"}</span>
              <span>t={progress.toFixed(3)}</span>
              <span>{debugMode.toUpperCase()}</span>
            </div>
          </div>

          <div className={styles.metrics}>
            <div><span>Frame median / p95</span><b>{stats.medianMs} / {stats.p95Ms} ms</b></div>
            <div><span>FPS / draw calls</span><b>{stats.fps} / {stats.drawCalls}</b></div>
            <div><span>Triangles</span><b>{stats.triangles.toLocaleString("en-US")}</b></div>
            <div><span>State buffers / load</span><b>{sourceEntry ? `${((sourceEntry.bufferBytes + (targetEntry?.bufferBytes ?? 0)) / 1048576).toFixed(2)} MiB · ${loadMs} ms` : "—"}</b></div>
            <div><span>Active / reserve target</span><b>{targetEntry ? `${targetEntry.machineQa.activeCount} / ${targetEntry.machineQa.reserveCount}` : "—"}</b></div>
            <div><span>Runtime data estimate</span><b>{((budget * 40 * 2 + 128 * 128 * 4 * 4 * 7) / 1048576).toFixed(2)} MiB</b></div>
          </div>
        </div>

        <aside className={styles.controls}>
          <fieldset>
            <legend>Source / target</legend>
            <label>Source<select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>{manifest?.states.map(option)}</select></label>
            <label>Target<select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{filteredStates.map(option)}</select></label>
          </fieldset>

          <fieldset>
            <legend>Composition</legend>
            <div className={styles.buttonRow}>{(["FOCUS", "GATHER", "DRIVE"] as const).map((value) => <button key={value} data-active={mode === value} onClick={() => setMode(value)}>{value}</button>)}</div>
            <label>Focus<select value={focus} onChange={(event) => setFocus(event.target.value)}><option value="all">all / any</option>{competencies.map((value) => <option key={value}>{value}</option>)}</select></label>
          </fieldset>

          <fieldset>
            <legend>Transition</legend>
            <div className={styles.buttonRow}>
              <button onClick={togglePlaying} disabled={reducedMotion} data-active={playing}>{playing ? "Pause" : "Play"}</button>
              <button onClick={() => setDirection((value) => value * -1)}>Reverse</button>
              <button onClick={() => { setPlaying(false); updateProgress(0); }}>Reset</button>
            </div>
            <label className={styles.range}>t = {progress.toFixed(3)}<input type="range" min={0} max={1} step={0.001} value={progress} onChange={(event) => { setPlaying(false); updateProgress(Number(event.target.value)); }} /></label>
          </fieldset>

          <fieldset>
            <legend>LOD / budget</legend>
            <div className={styles.buttonGrid}>{manifest?.lodTransitions.levels.map((value) => <button key={value} data-active={budget === value} onClick={() => setBudget(value)}>{value}</button>)}</div>
          </fieldset>

          <fieldset>
            <legend>Debug views</legend>
            <div className={styles.buttonGrid}>{(["neutral", "components", "shells", "zones", "identity", "reserve", "trajectory"] as const).map((value) => <button key={value} data-active={debugMode === value} onClick={() => setDebugMode(value)}>{value}</button>)}</div>
          </fieldset>

          <fieldset>
            <legend>Camera / viewport</legend>
            <div className={styles.buttonGrid}>{(["canonical", "opposite", "side", "top"] as const).map((value) => <button key={value} data-active={cameraPreset === value} onClick={() => setCameraPreset(value)}>{value}</button>)}</div>
            <div className={styles.buttonGrid}>{(["desktop", "mobile", "silhouette180", "silhouette96"] as const).map((value) => <button key={value} data-active={viewportProfile === value} onClick={() => setViewportProfile(value)}>{value.replace("silhouette", "")}</button>)}</div>
          </fieldset>

          <fieldset>
            <legend>Motion policy</legend>
            <button data-active={reducedMotion} onClick={() => setManualReduced((value) => !value)}>prefers-reduced-motion {reducedMotion ? "ON" : "OFF"}</button>
            {systemReduced ? <small>System preference is active.</small> : null}
          </fieldset>

          <fieldset>
            <legend>Selected persistent ID</legend>
            <label className={styles.range}>ID {selectedId}<input type="range" min={0} max={Math.max(0, budget - 1)} step={1} value={Math.min(selectedId, budget - 1)} onChange={(event) => setSelectedId(Number(event.target.value))} /></label>
            <div className={styles.pathReadout}>
              <span>from [{selectedPath?.from ?? "—"}] · status {selectedPath?.sourceStatus ?? "—"} · component {selectedPath?.sourceComponent ?? "—"}</span>
              <span>to [{selectedPath?.to ?? "—"}] · status {selectedPath?.targetStatus ?? "—"} · component {selectedPath?.targetComponent ?? "—"}</span>
            </div>
          </fieldset>

          <fieldset>
            <legend>Target component quotas</legend>
            <div className={styles.quotas}>{Object.entries(targetEntry?.machineQa.componentQuotas ?? {}).map(([key, value]) => <span key={key}>C{key}: <b>{value}</b></span>)}</div>
          </fieldset>
        </aside>
      </section>

      <footer className={styles.footer}>
        <span>GEOMETRY-ONLY · NEUTRAL + TECHNICAL DEBUG COLOURS</span>
        <span>NEW COMPLEX STATES AND MOTION REQUIRE HUMAN APPROVAL</span>
      </footer>
    </main>
  );
}
