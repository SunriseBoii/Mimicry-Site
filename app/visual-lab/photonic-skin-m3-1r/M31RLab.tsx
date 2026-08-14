"use client";

import { useEffect, useMemo, useState } from "react";
import { M31Scene, type DebugMode, type SceneStats } from "../photonic-skin-m3-1/M31Scene";
import {
  loadM31BaselineManifest,
  loadM31BaselineState,
  loadM31RManifest,
  loadM31RQa,
  loadM31RState,
  stateLabel,
  titleCase,
  visibleComponents,
  type CameraPreset,
  type DecodedState,
  type M31Manifest,
  type M31RManifest,
  type M31RQa,
  type StateEntry,
  type ViewProfile,
} from "./m31r-data";
import styles from "../photonic-skin-m3-1/m31-lab.module.css";

type ComparisonMode = "m31r" | "versions" | "canonical" | "production";
type EventPreset = "SINGLE" | "FOCUS_LEAD" | "FOCUS_SUPPORT" | "GATHER" | "DRIVE" | "BRAND_WIDE";
const EMPTY_STATS: SceneStats = { fps: 0, medianMs: 0, p95Ms: 0, drawCalls: 0, triangles: 0 };

function presetState(states: StateEntry[], preset: EventPreset) {
  const withEvent = (entry: StateEntry) => entry.competencyIds.includes("event");
  if (preset === "SINGLE") return states.find((entry) => entry.stateId === "single-event");
  if (preset === "FOCUS_LEAD") return states.find((entry) => withEvent(entry) && entry.compositionMode === "FOCUS" && entry.focusCompetencyId === "event" && entry.competencyIds.length === 4);
  if (preset === "FOCUS_SUPPORT") return states.find((entry) => withEvent(entry) && entry.compositionMode === "FOCUS" && entry.focusCompetencyId !== "event" && entry.competencyIds.length === 4);
  if (preset === "GATHER") return states.find((entry) => withEvent(entry) && entry.compositionMode === "GATHER" && entry.competencyIds.length === 4);
  if (preset === "DRIVE") return states.find((entry) => withEvent(entry) && entry.compositionMode === "DRIVE" && entry.competencyIds.length === 4);
  return states.find((entry) => withEvent(entry) && entry.stateRole === "brand_wide" && entry.compositionMode === "GATHER");
}

export function M31RLab() {
  const [manifest, setManifest] = useState<M31RManifest | null>(null);
  const [baselineManifest, setBaselineManifest] = useState<M31Manifest | null>(null);
  const [qa, setQa] = useState<M31RQa | null>(null);
  const [selectedId, setSelectedId] = useState("single-event");
  const [selected, setSelected] = useState<DecodedState | null>(null);
  const [baseline, setBaseline] = useState<DecodedState | null>(null);
  const [camera, setCamera] = useState<CameraPreset>("canonical");
  const [profile, setProfile] = useState<ViewProfile>("desktop");
  const [debug, setDebug] = useState<DebugMode>("neutral");
  const [comparison, setComparison] = useState<ComparisonMode>("m31r");
  const [stats, setStats] = useState<SceneStats>(EMPTY_STATS);
  const [loadMs, setLoadMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadM31RManifest(), loadM31BaselineManifest(), loadM31RQa()])
      .then(([next, old, summary]) => { setManifest(next); setBaselineManifest(old); setQa(summary); })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    if (!manifest || !baselineManifest) return;
    const entry = manifest.states.find((candidate) => candidate.stateId === selectedId);
    const oldEntry = baselineManifest.states.find((candidate) => candidate.stateId === selectedId);
    if (!entry || !oldEntry) return;
    let cancelled = false;
    const started = performance.now();
    Promise.all([loadM31RState(entry), loadM31BaselineState(oldEntry)]).then(([next, old]) => {
      if (cancelled) return;
      setSelected(next); setBaseline(old); setLoadMs(Math.round(performance.now() - started));
    }).catch((reason: Error) => setError(reason.message));
    return () => { cancelled = true; };
  }, [baselineManifest, manifest, selectedId]);

  const entry = selected?.entry ?? null;
  const shownComponents = useMemo(() => entry ? visibleComponents(entry, profile) : new Set<number>(), [entry, profile]);
  const safeMargin = manifest?.presentationContract.profiles[profile].safeMargin ?? .06;
  const split = comparison !== "m31r";

  const scene = (
    state: DecodedState | null,
    sceneManifest: M31Manifest | null,
    preset: CameraPreset,
    label: string,
    live = false,
  ) => <div className={styles.scenePane} data-version={label} data-camera={preset}>
    <div className={styles.sceneLabel}><b>{label}</b><span>{state ? stateLabel(state.entry) : "No state"}</span></div>
    {state && sceneManifest ? <M31Scene state={state} manifest={sceneManifest} cameraPreset={preset} profile={profile} debugMode={debug} onStats={live ? setStats : undefined} worldUpZ /> : null}
    {(debug === "safe" || debug === "occlusion") ? <div className={styles.safeFrame} style={{ inset: `${safeMargin * 100}%` }} /> : null}
  </div>;

  let panes = null;
  if (manifest && baselineManifest && selected) {
    if (comparison === "m31r") panes = scene(selected, manifest, camera, "M3.1R / 3.1.1", true);
    if (comparison === "versions") panes = <>{scene(baseline, baselineManifest, "alternate", "M3.1 / OLD ALT", true)}{scene(selected, manifest, "canonical", "M3.1R / NEW CANONICAL")}</>;
    if (comparison === "canonical") panes = <>{scene(baseline, baselineManifest, "canonical", "M3.1 / OLD CANONICAL", true)}{scene(selected, manifest, "canonical", "M3.1R / NEW CANONICAL")}</>;
    if (comparison === "production") panes = <>{scene(selected, manifest, "canonical", "M3.1R / NEW CANONICAL", true)}{scene(selected, manifest, "alternate", "M3.1R / NEW ALTERNATE")}</>;
  }

  return <main
    className={styles.lab}
    data-ps03m31r-ready={selected && manifest && baseline ? "true" : "false"}
    data-state-id={entry?.stateId ?? "loading"}
    data-review-mode={comparison}
    data-profile={profile}
  >
    <header className={styles.header}>
      <div><b>MIMICRY GROUP</b><span>PS-03.M3.1R / PRODUCTION VIEW PROMOTION &amp; EVENT ORIENTATION FREEZE</span></div>
      <div className={styles.headerMeta}><span>INTERNAL / NOINDEX</span><span>{manifest?.stateCount ?? "LOADING"} STATES</span><span>{manifest?.deterministicFingerprint.slice(0, 12) ?? "—"}</span></div>
    </header>
    <section className={styles.workspace}>
      <div className={styles.visualColumn}>
        <div className={styles.viewport} data-profile={profile} data-comparison={split ? "split" : "m31r"}>
          {error ? <div className={styles.fallback}><b>PS-03.M3.1R data error</b><span>{error}</span></div> : <div className={styles.sceneGrid}>{panes}</div>}
          <div className={styles.viewportReadout}><span>{camera.toUpperCase()} / {profile.toUpperCase()}</span><span>{debug.toUpperCase()}</span><span>{comparison.toUpperCase()}</span></div>
        </div>
        <div className={styles.metrics}>
          <div><span>Machine validation</span><b data-machine-status={qa?.machinePass ? "machine-pass" : "pending"}>{qa?.status ?? "loading"}</b></div>
          <div><span>State</span><b>{entry?.stateId ?? "—"}</b></div>
          <div><span>Version / new hash</span><b>{entry ? `${entry.stateVersion} / ${entry.contentHash.slice(0, 12)}` : "—"}</b></div>
          <div><span>Old / new hash</span><b>{baseline && entry ? `${baseline.entry.contentHash.slice(0, 10)} → ${entry.contentHash.slice(0, 10)}` : "—"}</b></div>
          <div><span>FPS / median / p95</span><b>{stats.fps} / {stats.medianMs} / {stats.p95Ms} ms</b></div>
          <div><span>Active / reserve / load</span><b>{entry ? `${entry.machineQa.activeCount} / ${entry.machineQa.reserveCount} / ${loadMs} ms` : "—"}</b></div>
        </div>
      </div>
      <aside className={styles.controls}>
        <fieldset>
          <legend>Event review presets</legend>
          <div className={styles.buttonGrid}>{(["SINGLE", "FOCUS_LEAD", "FOCUS_SUPPORT", "GATHER", "DRIVE", "BRAND_WIDE"] as EventPreset[]).map((preset) => <button key={preset} onClick={() => {
            if (!manifest) return;
            const target = presetState(manifest.states, preset);
            if (target) setSelectedId(target.stateId);
          }}>{preset.replace("_", " ")}</button>)}</div>
          <label>Endpoint<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{manifest?.states.map((candidate) => <option key={candidate.stateId} value={candidate.stateId}>{stateLabel(candidate)}</option>)}</select></label>
        </fieldset>
        <fieldset>
          <legend>Comparison</legend>
          <div className={styles.buttonRow}>{(["m31r", "versions", "canonical", "production"] as ComparisonMode[]).map((mode) => <button key={mode} data-active={comparison === mode} onClick={() => setComparison(mode)}>{mode === "m31r" ? "M3.1R" : mode === "versions" ? "M3.1 / R" : mode === "canonical" ? "OLD / NEW CAN" : "NEW CAN / ALT"}</button>)}</div>
        </fieldset>
        <fieldset>
          <legend>Production and diagnostic views</legend>
          <div className={styles.buttonGrid}>{(["canonical", "alternate", "side", "top"] as CameraPreset[]).map((value) => <button key={value} data-active={camera === value} onClick={() => setCamera(value)}>{value}</button>)}</div>
        </fieldset>
        <fieldset>
          <legend>Viewport profile</legend>
          <div className={styles.buttonGrid}>{(["desktop", "mobile390", "silhouette180", "silhouette96"] as ViewProfile[]).map((value) => <button key={value} data-active={profile === value} onClick={() => setProfile(value)}>{value.replace("silhouette", "")}</button>)}</div>
        </fieldset>
        <fieldset>
          <legend>Static endpoint debug</legend>
          <div className={styles.buttonGrid}>{(["neutral", "components", "safe", "occlusion", "orientation", "silhouette"] as DebugMode[]).map((value) => <button key={value} data-active={debug === value} onClick={() => setDebug(value)}>{value}</button>)}</div>
          <small>No animation, PLAY, retarget, M4 runtime, camera motion, or reflection.</small>
        </fieldset>
        <fieldset>
          <legend>Assembly components / {profile}</legend>
          <div className={styles.componentList}>{entry?.componentMap?.map((component) => <span key={component.componentIndex} data-visible={shownComponents.has(component.componentIndex)}><b>C{component.componentIndex} · {titleCase(component.semanticOwner)}</b><i>{component.componentId}</i></span>)}</div>
        </fieldset>
        <fieldset>
          <legend>Correction contract</legend>
          <div className={styles.integrity}>
            <span>Baseline M3.1 <b>{manifest?.baselineM31.deterministicFingerprint.slice(0, 16) ?? "—"}</b></span>
            <span>Event Euler <b>{manifest?.eventOrientationContract.selectedEulerDegrees.join(", ") ?? "—"}</b></span>
            <span>Translation overrides <b>{manifest ? Object.keys(manifest.eventOrientationContract.translationOverrides).length : "—"}</b></span>
            <span>QA views <b>{qa?.checkedStateViews ?? "pending"}</b></span>
            <span>M4 recompiled <b>{manifest?.approval.m4Recompiled ? "YES" : "NO"}</b></span>
          </div>
        </fieldset>
      </aside>
    </section>
    <footer className={styles.footer}><span>STATIC ENDPOINTS · FIXED CAMERA RIG · PROFILE-AWARE COMPONENTS</span><span>MACHINE PASS / HUMAN REVIEW REQUIRED</span></footer>
  </main>;
}
