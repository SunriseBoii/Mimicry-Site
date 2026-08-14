"use client";

import { useEffect, useMemo, useState } from "react";
import { M31Scene, type DebugMode, type SceneStats } from "./M31Scene";
import {
  M3_DATA_BASE,
  baselineStateFor,
  filterStates,
  loadM31Manifest,
  loadM3Manifest,
  loadQaSummary,
  loadState,
  stateLabel,
  titleCase,
  visibleComponents,
  type CameraPreset,
  type DecodedState,
  type M31Manifest,
  type QaSummary,
  type RoleFilter,
  type StateEntry,
  type ViewProfile,
} from "./m31-data";
import styles from "./m31-lab.module.css";

type ComparisonMode = "m31" | "baseline" | "split";
const EMPTY_STATS: SceneStats = { fps: 0, medianMs: 0, p95Ms: 0, drawCalls: 0, triangles: 0 };

function stateOption(entry: StateEntry) {
  return <option key={entry.stateId} value={entry.stateId}>{stateLabel(entry)}</option>;
}

export function M31Lab() {
  const [manifest, setManifest] = useState<M31Manifest | null>(null);
  const [baselineStates, setBaselineStates] = useState<StateEntry[]>([]);
  const [qa, setQa] = useState<QaSummary | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<DecodedState | null>(null);
  const [baseline, setBaseline] = useState<DecodedState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadMs, setLoadMs] = useState(0);
  const [role, setRole] = useState<RoleFilter>("FOCUS");
  const [cardinality, setCardinality] = useState<number | "ALL">(4);
  const [lead, setLead] = useState<string | "ALL">("ALL");
  const [camera, setCamera] = useState<CameraPreset>("canonical");
  const [profile, setProfile] = useState<ViewProfile>("desktop");
  const [debug, setDebug] = useState<DebugMode>("neutral");
  const [comparison, setComparison] = useState<ComparisonMode>("m31");
  const [stats, setStats] = useState<SceneStats>(EMPTY_STATS);

  useEffect(() => {
    Promise.all([loadM31Manifest(), loadM3Manifest(), loadQaSummary()]).then(([nextManifest, oldManifest, summary]) => {
      setManifest(nextManifest);
      setBaselineStates(oldManifest.states);
      setQa(summary);
      const initial = nextManifest.states.find((entry) => entry.compositionMode === "FOCUS" && entry.competencyIds.length === 4)
        ?? nextManifest.states[0];
      setSelectedId(initial.stateId);
    }).catch((reason: Error) => setError(reason.message));
  }, []);

  const filtered = useMemo(() => manifest ? filterStates(manifest.states, { role, cardinality, lead }) : [], [cardinality, lead, manifest, role]);
  const effectiveSelectedId = filtered.some((candidate) => candidate.stateId === selectedId)
    ? selectedId
    : filtered[0]?.stateId ?? "";

  useEffect(() => {
    if (!manifest || !effectiveSelectedId) return;
    const entry = manifest.states.find((candidate) => candidate.stateId === effectiveSelectedId);
    if (!entry) return;
    let cancelled = false;
    const started = performance.now();
    const baselineEntry = baselineStateFor(entry, baselineStates);
    Promise.all([
      loadState(entry),
      baselineEntry ? loadState(baselineEntry, M3_DATA_BASE) : Promise.resolve(null),
    ]).then(([nextState, oldState]) => {
      if (cancelled) return;
      setSelected(nextState);
      setBaseline(oldState);
      setLoadMs(Math.round(performance.now() - started));
    }).catch((reason: Error) => setError(reason.message));
    return () => { cancelled = true; };
  }, [baselineStates, effectiveSelectedId, manifest]);

  const leads = useMemo(() => manifest
    ? [...new Set(manifest.states.map((entry) => entry.focusCompetencyId).filter((value): value is string => Boolean(value)))].sort()
    : [], [manifest]);
  const entry = selected?.entry ?? null;
  const shownComponents = useMemo(() => entry ? visibleComponents(entry, profile) : new Set<number>(), [entry, profile]);
  const safeMargin = manifest?.presentationContract.profiles[profile].safeMargin ?? .06;
  const machineStatus = qa?.passed === true ? "machine-pass" : entry?.machineValidationStatus ?? "pending";

  const renderScene = (state: DecodedState | null, version: string, liveStats = false) => <div className={styles.scenePane} data-version={version}>
    <div className={styles.sceneLabel}><b>{version}</b><span>{state ? stateLabel(state.entry) : "No matching state"}</span></div>
    {state && manifest ? <M31Scene
      state={state}
      manifest={manifest}
      cameraPreset={camera}
      profile={profile}
      debugMode={debug}
      onStats={liveStats ? setStats : undefined}
    /> : <div className={styles.fallback}>Matching baseline state is unavailable.</div>}
    {(debug === "safe" || debug === "occlusion") ? <div className={styles.safeFrame} style={{ inset: `${safeMargin * 100}%` }} /> : null}
  </div>;

  return <main className={styles.lab} data-ps03m31-ready={selected && manifest ? "true" : "false"}>
    <header className={styles.header}>
      <div><b>MIMICRY GROUP</b><span>PS-03.M3.1 / COMPLEX COMPOSITION &amp; PRESENTATION LOCK</span></div>
      <div className={styles.headerMeta}>
        <span>INTERNAL / NOINDEX</span>
        <span>{manifest ? `${manifest.stateCount} STATES` : "LOADING"}</span>
        <span>{manifest?.deterministicFingerprint.slice(0, 12) ?? "—"}</span>
      </div>
    </header>

    <section className={styles.workspace}>
      <div className={styles.visualColumn}>
        <div className={styles.viewport} data-profile={profile} data-comparison={comparison}>
          {error ? <div className={styles.fallback}><b>PS-03.M3.1 data error</b><span>{error}</span></div> : null}
          {!error && selected && manifest ? <div className={styles.sceneGrid}>
            {comparison !== "baseline" ? renderScene(selected, "M3.1", true) : null}
            {comparison !== "m31" ? renderScene(baseline, "M3 BASELINE", comparison === "baseline") : null}
          </div> : !error ? <div className={styles.fallback}>Loading fixed M3.1 endpoint buffers…</div> : null}
          <div className={styles.viewportReadout}>
            <span>{camera.toUpperCase()} / {profile.toUpperCase()}</span>
            <span>{debug.toUpperCase()}</span>
            <span>{comparison.toUpperCase()}</span>
          </div>
        </div>

        <div className={styles.metrics}>
          <div><span>Machine validation</span><b data-machine-status={machineStatus}>{machineStatus}</b></div>
          <div><span>State / filtered</span><b>{entry ? `${entry.stateId} / ${filtered.length}` : "—"}</b></div>
          <div><span>Version / hash</span><b>{entry ? `${entry.stateVersion ?? "3.1.0"} / ${entry.contentHash.slice(0, 12)}` : "—"}</b></div>
          <div><span>FPS / median / p95</span><b>{stats.fps} / {stats.medianMs} / {stats.p95Ms} ms</b></div>
          <div><span>Active / reserve / load</span><b>{entry ? `${entry.machineQa.activeCount} / ${entry.machineQa.reserveCount} / ${loadMs} ms` : "—"}</b></div>
          <div><span>Presentation / M3 geometry</span><b>{entry ? `${entry.presentationFrame?.cameraRig ?? "baseline"} / ${entry.geometryChangedFromM3 ? "rebuilt" : "preserved"}` : "—"}</b></div>
        </div>
      </div>

      <aside className={styles.controls}>
        <fieldset>
          <legend>State filter</legend>
          <div className={styles.buttonGrid}>{(["ALL", "MASTER", "SINGLE", "FOCUS", "GATHER", "DRIVE", "BRAND_WIDE"] as const).map((value) => <button key={value} data-active={role === value} onClick={() => setRole(value)}>{value}</button>)}</div>
          <label>Cardinality<select value={cardinality} onChange={(event) => setCardinality(event.target.value === "ALL" ? "ALL" : Number(event.target.value))}><option>ALL</option>{[0, 1, 2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>FOCUS lead<select value={lead} disabled={role !== "FOCUS" && role !== "ALL"} onChange={(event) => setLead(event.target.value)}><option>ALL</option>{leads.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
          <label>Endpoint<select value={effectiveSelectedId} onChange={(event) => setSelectedId(event.target.value)}>{filtered.map(stateOption)}</select></label>
        </fieldset>

        <fieldset>
          <legend>Comparison</legend>
          <div className={styles.buttonRow}>{(["m31", "baseline", "split"] as const).map((value) => <button key={value} data-active={comparison === value} onClick={() => setComparison(value)}>{value === "m31" ? "M3.1" : value === "baseline" ? "M3" : "M3 / M3.1"}</button>)}</div>
        </fieldset>

        <fieldset>
          <legend>Production and diagnostic views</legend>
          <div className={styles.buttonGrid}>{(["canonical", "alternate", "side", "top"] as const).map((value) => <button key={value} data-active={camera === value} onClick={() => setCamera(value)}>{value}</button>)}</div>
        </fieldset>

        <fieldset>
          <legend>Viewport profile</legend>
          <div className={styles.buttonGrid}>{(["desktop", "mobile390", "silhouette180", "silhouette96"] as const).map((value) => <button key={value} data-active={profile === value} onClick={() => setProfile(value)}>{value.replace("silhouette", "")}</button>)}</div>
        </fieldset>

        <fieldset>
          <legend>Static endpoint debug</legend>
          <div className={styles.buttonGrid}>{(["neutral", "components", "safe", "occlusion", "orientation", "silhouette"] as const).map((value) => <button key={value} data-active={debug === value} onClick={() => setDebug(value)}>{value}</button>)}</div>
          <small>No play, reverse, settle, camera motion, or reflections are present in M3.1.</small>
        </fieldset>

        <fieldset>
          <legend>Assembly components / {profile}</legend>
          <div className={styles.componentList}>{entry?.componentMap?.map((component) => <span key={component.componentIndex} data-visible={shownComponents.has(component.componentIndex)}>
            <b>C{component.componentIndex} · {titleCase(component.semanticOwner)}</b>
            <i>{component.componentId}</i>
          </span>) ?? <span><b>Baseline component map</b><i>Preserved M3 endpoint</i></span>}</div>
        </fieldset>

        <fieldset>
          <legend>Checkpoint integrity</legend>
          <div className={styles.integrity}>
            <span>M3 fingerprint <b>{manifest?.baseline.deterministicFingerprint.slice(0, 16) ?? "—"}</b></span>
            <span>M4 frozen M3 <b>{manifest?.frozenM4.deterministicFingerprint.slice(0, 16) ?? "—"}</b></span>
            <span>M4 buffers recompiled <b>{manifest?.frozenM4.stateBuffersCopiedIntoM4 ? "YES" : "NO"}</b></span>
            <span>QA views <b>{qa?.stateViewCount ?? "pending"}</b></span>
          </div>
        </fieldset>
      </aside>
    </section>

    <footer className={styles.footer}>
      <span>STATIC GEOMETRY ENDPOINTS · FIXED CAMERA RIG · PROFILE-AWARE COMPONENTS</span>
      <span>HUMAN VISUAL APPROVAL REQUIRED · NOT RECORDED BY THIS LAB</span>
    </footer>
  </main>;
}
