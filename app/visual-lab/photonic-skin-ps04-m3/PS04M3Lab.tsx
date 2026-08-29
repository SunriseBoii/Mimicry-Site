"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CameraPreset, LabFrame, M3Manifest, StateEntry } from "../photonic-skin-m4-1/m41-data";
import { loadRuntimeManifests, type M41Manifest } from "../photonic-skin-m4-1/m41-data";
import { FIELD_DIRECTION, FIELD_ORIGIN, FIELD_SCALE } from "../photonic-skin-ps04-m2/photonic-field";
import { PHOTONIC_COLOR_TOKENS } from "../photonic-skin-ps04-m2/photonic-palette";
import {
  MATERIAL_THEME_PRESETS,
  defaultM2MaterialController,
  type MaterialTheme,
} from "./material-foundation";
import {
  compileFrozenPair,
  compileLiveRetarget,
  loadEntry,
  viewportForFrame,
} from "./runtime";
import { PhotonicMotionSession, type OverlayMode, type SessionSnapshot } from "./session";
import type { IdleChannelMode } from "./idle-motion";
import { IDLE_PROFILE_POLICY } from "./idle-motion";
import { PS04M3Scene, type SceneEnvironment, type SceneStats } from "./PS04M3Scene";
import styles from "./ps04m3.module.css";

const CAMERAS: CameraPreset[] = ["canonical", "alternate", "side", "top"];
const FRAMES: LabFrame[] = ["desktop", "mobile390", "silhouette180", "silhouette96"];
const LOD_LEVELS = [512, 1024, 2048, 4096, 8192, 12288, 16384] as const;
const DPR_LEVELS = [1, 1.5, 2] as const;
const EMPTY_STATS: SceneStats = {
  fps: 0, medianMs: 0, p95Ms: 0, drawCalls: 0, triangles: 0, textureMiB: 0,
  programs: 0, geometries: 0, textures: 0, dpr: 0, drawingBuffer: [0, 0],
  lastActorDrawCalls: 0, lastActorTriangles: 0, newFrame: false,
};

function labQuery() {
  return new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
}

function bootstrapReducedMotion() {
  const query = labQuery();
  return (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    || query.get("reduced") === "1";
}

function stateLabel(entry: StateEntry) {
  return entry.stateId.replaceAll("-", " · ");
}

function formatInteger(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function preferredSamples(states: StateEntry[]) {
  const ids = new Set<string>();
  const add = (entry: StateEntry | undefined) => { if (entry) ids.add(entry.stateId); };
  add(states.find((entry) => entry.stateRole === "master"));
  states.filter((entry) => entry.stateRole === "single").forEach(add);
  for (const mode of ["FOCUS", "GATHER", "DRIVE"] as const) {
    add(states.find((entry) => entry.stateRole === "complex" && entry.compositionMode === mode && entry.competencyIds.length === 2)
      ?? states.find((entry) => entry.stateRole === "complex" && entry.compositionMode === mode));
  }
  add(states.find((entry) => entry.stateRole === "brand_wide"));
  return states.filter((entry) => ids.has(entry.stateId));
}

export function PS04M3Lab() {
  const query = labQuery();
  const [theme, setTheme] = useState<MaterialTheme>(query.get("theme") === "dark" ? "dark" : "light");
  const [sideBySide, setSideBySide] = useState(query.get("compare") === "1");
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>(CAMERAS.includes(query.get("camera") as CameraPreset) ? query.get("camera") as CameraPreset : "canonical");
  const [frame, setFrame] = useState<LabFrame>(FRAMES.includes(query.get("profile") as LabFrame) ? query.get("profile") as LabFrame : "desktop");
  const [dpr, setDpr] = useState<1 | 1.5 | 2>(DPR_LEVELS.includes(Number(query.get("dpr")) as 1 | 1.5 | 2) ? Number(query.get("dpr")) as 1 | 1.5 | 2 : 1.5);
  const [budget, setBudget] = useState(LOD_LEVELS.includes(Number(query.get("lod")) as (typeof LOD_LEVELS)[number]) ? Number(query.get("lod")) : 16384);
  const [manualReduced, setManualReduced] = useState(query.get("reduced") === "1");
  const [stats, setStats] = useState<SceneStats>(EMPTY_STATS);
  const [environment, setEnvironment] = useState<SceneEnvironment | null>(null);
  const [contextState, setContextState] = useState<"ready" | "lost" | "restored">("ready");
  const [parityStatus, setParityStatus] = useState("not run");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<M3Manifest | null>(null);
  const [motionManifest, setMotionManifest] = useState<M41Manifest | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const offscreenLatch = useRef(false);
  const clockRef = useRef({ running: false, frame: 0, previous: 0, token: 0, lastUi: 0 });
  const systemReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const session = useMemo(() => new PhotonicMotionSession({
    reducedMotion: bootstrapReducedMotion(),
    overlayMode: labQuery().get("overlay") === "m2" ? "m2-reference" : labQuery().get("overlay") === "idle" ? "m3-idle" : "m3-combined",
    profile: FRAMES.includes(labQuery().get("profile") as LabFrame) ? labQuery().get("profile") as LabFrame : "desktop",
  }), []);
  const [ui, setUi] = useState<SessionSnapshot>(() => session.snapshot());
  const reducedMotion = systemReduced || manualReduced;

  const startClock = useCallback(() => {
    const clock = clockRef.current;
    if (clock.running) return;
    clock.running = true;
    clock.previous = performance.now();
    const loop = (now: number) => {
      const hidden = document.visibilityState === "hidden";
      session.setHidden(hidden);
      if (!hidden && !session.snapshot().offscreen) {
        session.tick((now - clock.previous) / 1000, ++clock.token);
      }
      clock.previous = now;
      if (now - clock.lastUi > 120 || clock.lastUi === 0) {
        setUi(session.snapshot());
        clock.lastUi = now;
      }
      if (session.shouldAnimate() && document.visibilityState !== "hidden") {
        clock.frame = requestAnimationFrame(loop);
      } else {
        clock.running = false;
        setUi(session.snapshot());
      }
    };
    clock.frame = requestAnimationFrame(loop);
  }, [session]);

  useEffect(() => session.subscribe(() => { startClock(); }), [session, startClock]);
  useEffect(() => {
    const clock = clockRef.current;
    const onVisibility = () => {
      session.setHidden(document.visibilityState === "hidden");
      clock.previous = performance.now();
      startClock();
    };
    document.addEventListener("visibilitychange", onVisibility);
    startClock();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(clock.frame);
      clock.running = false;
    };
  }, [session, startClock]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      const ratio = entry.intersectionRatio;
      if (!offscreenLatch.current && ratio < 0.04) offscreenLatch.current = true;
      if (offscreenLatch.current && ratio > 0.12) offscreenLatch.current = false;
      session.setOffscreen(offscreenLatch.current);
      if (!offscreenLatch.current) {
        clockRef.current.previous = performance.now();
        startClock();
      }
    }, { threshold: [0, 0.04, 0.12, 1] });
    observer.observe(node);
    return () => observer.disconnect();
  }, [session, startClock]);

  useEffect(() => { session.setReducedMotion(reducedMotion); }, [reducedMotion, session]);
  useEffect(() => { session.setProfile(frame); }, [frame, session]);

  useEffect(() => {
    const controller = new AbortController();
    loadRuntimeManifests(controller.signal).then(async ({ m3, m4 }) => {
      setManifest(m3);
      setMotionManifest(m4);
      const requested = labQuery().get("state") ?? "master-neutral";
      const entry = m3.states.find((item) => item.stateId === requested)
        ?? m3.states.find((item) => item.stateRole === "master")
        ?? m3.states[0];
      const state = await loadEntry(entry);
      const program = await compileFrozenPair(state, state, m3, m4, {
        reducedMotion, trigger: "qa", viewport: viewportForFrame(frame), signal: controller.signal,
      });
      session.bootstrapSettled(state, program);
      setLoading(false);
      startClock();
    }).catch((reason: Error) => {
      if (reason.name !== "AbortError") setError(reason.message);
      setLoading(false);
    });
    return () => controller.abort();
    // First paint only: later reduced/profile changes go through session setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function requestState(stateId: string) {
    if (!manifest) return;
    const entry = manifest.states.find((item) => item.stateId === stateId);
    if (!entry) return;
    const revision = session.beginRequest(stateId);
    const captured = session.captureJoint();
    setLoading(true);
    try {
      const next = await loadEntry(entry);
      if (!session.isCurrent(revision)) return;
      const currentTarget = session.getTarget();
      const currentSource = session.getSource();
      const settled = captured.geometryProgress >= 1 && currentTarget && !currentTarget.entry.stateId.startsWith("runtime-snapshot-");
      if (settled && currentTarget) {
        const program = await compileFrozenPair(currentTarget, next, manifest, motionManifest, {
          reducedMotion, trigger: "qa", viewport: viewportForFrame(frame),
        });
        if (!session.isCurrent(revision)) return;
        session.commitTransition({
          revision, source: currentTarget, target: next, program, captured,
          play: true,
        });
      } else if (currentSource && currentTarget) {
        const { liveSource, program } = compileLiveRetarget(captured, currentSource, next, manifest, {
          reducedMotion, trigger: "qa", viewport: viewportForFrame(frame),
        });
        if (!session.isCurrent(revision)) return;
        session.commitTransition({
          revision, source: liveSource, target: next, program, captured,
          play: true,
        });
      }
      startClock();
    } catch (reason) {
      if (session.isCurrent(revision)) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (session.isCurrent(revision)) setLoading(false);
    }
  }

  const requestStateRef = useRef<(stateId: string) => Promise<void>>(async () => {});
  useEffect(() => {
    requestStateRef.current = requestState;
    // requestState closes over current lab state; the ref is the capture/QA hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, motionManifest, frame, reducedMotion, session]);

  const samples = useMemo(() => preferredSamples(manifest?.states ?? []), [manifest]);
  const source = session.getSource();
  const target = session.getTarget();
  const program = session.getProgram();
  const material = useMemo(() => ({
    ...defaultM2MaterialController(theme, session.palette),
    reducedMotion,
  }), [reducedMotion, session.palette, theme]);
  const lightMaterial = useMemo(() => ({ ...material, theme: "light" as const, themeMix: 0 }), [material]);
  const darkMaterial = useMemo(() => ({ ...material, theme: "dark" as const, themeMix: 1 }), [material]);

  useEffect(() => {
    if (!target) return;
    const next = new URLSearchParams(window.location.search);
    next.set("state", ui.requestedStateId || target.entry.stateId);
    next.set("theme", theme);
    next.set("camera", cameraPreset);
    next.set("profile", frame);
    next.set("dpr", String(dpr));
    next.set("overlay", ui.overlayMode === "m2-reference" ? "m2" : ui.overlayMode === "m3-idle" ? "idle" : "combined");
    next.set("reduced", manualReduced ? "1" : "0");
    window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
  }, [cameraPreset, dpr, frame, manualReduced, target, theme, ui.overlayMode, ui.requestedStateId]);

  useEffect(() => {
    window.__PS04M3_LAB__ = {
      runId: "ps04-m3",
      ready: Boolean(target && !loading && (stats.lastActorDrawCalls > 0 || window.__PS04M3_SCENE_READY__)),
      stats,
      environment,
      contextState,
      snapshot: () => session.snapshot(),
      theme,
      requested: ui.requestedStateId,
      settled: ui.settledStateId,
      revision: ui.requestRevision,
      loading,
      requestState: (stateId: string) => requestStateRef.current(stateId),
      seekIdlePhases: (breath: number, rotation: number) => { session.seekIdlePhases(breath, rotation); startClock(); },
      seekGeometryProgress: (progress: number) => { session.seekGeometryProgress(progress); startClock(); },
      seekColorPhase: (phase: number) => { session.seekColorPhase(phase); startClock(); },
      setOverlayMode: (mode: OverlayMode) => { session.setOverlayMode(mode); startClock(); },
      setIdleChannel: (channel: IdleChannelMode) => { session.setIdleChannel(channel); startClock(); },
      setPauseAll: (value: boolean) => { session.setPauseAll(value); startClock(); },
      setColorWavePaused: (value: boolean) => { session.setColorWavePaused(value); startClock(); },
      playGeometry: (value: boolean) => { session.playGeometry(value); startClock(); },
      setTheme: (value: MaterialTheme) => setTheme(value),
      setFrame: (value: LabFrame) => setFrame(value),
      setCamera: (value: CameraPreset) => setCameraPreset(value),
      setSideBySide: (value: boolean) => setSideBySide(value),
      setReduced: (value: boolean) => setManualReduced(value),
      setHidden: (value: boolean) => { session.setHidden(value); startClock(); },
      loseContext: () => document.getElementById("ps04m3-context-restore-run-motion")?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    };
  }, [contextState, environment, frame, loading, session, startClock, stats, target, theme, ui]);

  const sceneReady = Boolean(source && target && program && manifest);
  const sceneStyle = { "--ps04-background": MATERIAL_THEME_PRESETS[theme].background } as React.CSSProperties;
  const policy = IDLE_PROFILE_POLICY[frame];
  const q = ui.displayed.quaternion;

  const runGpuParity = () => {
    const button = document.getElementById("ps04m3-gpu-parity-run-motion");
    if (!(button instanceof HTMLButtonElement)) return;
    setParityStatus("running");
    button.click();
    const poll = window.setInterval(() => {
      if (button.dataset.status === "done") {
        window.clearInterval(poll);
        const result = JSON.parse(button.dataset.result ?? "{}") as { valid?: boolean; maxPositionError?: number };
        setParityStatus(result.valid ? `pass · max Δ ${result.maxPositionError?.toExponential(2)}` : "failed");
      }
      if (button.dataset.status === "error") { window.clearInterval(poll); setParityStatus("error"); }
    }, 100);
  };

  return (
    <main className={styles.lab} data-theme={theme} style={sceneStyle}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Photonic Skin · PS-04.M3</p>
          <h1>Surface Motion</h1>
          <p>One reversible idle overlay. One time owner. Color follows the real M4 phase windows.</p>
        </div>
        <div className={styles.statusBlock}>
          <span data-status={contextState}>WebGL {contextState}</span>
          <span>{ui.status} · rev {ui.requestRevision}</span>
          <a href="/visual-lab/photonic-skin-ps04-m3/preview">Hero preview ↗</a>
        </div>
      </header>
      <section className={styles.workspace}>
        <div ref={stageRef} className={styles.stage} data-frame={frame} data-comparison={sideBySide} data-qa="ps04m3-stage">
          {loading && !sceneReady ? <div className={styles.loading}>Loading frozen actor…</div> : null}
          {error ? <div className={styles.error}>{error}</div> : null}
          {sceneReady && source && target && program && manifest ? sideBySide ? (
            <div className={styles.comparisonGrid}>
              <figure className={styles.foundationPane} style={{ "--ps04-background": MATERIAL_THEME_PRESETS.light.background } as React.CSSProperties}>
                <figcaption>Light · shared session</figcaption>
                <PS04M3Scene source={source} target={target} program={program} budget={budget} progress={ui.geometryProgress} reducedMotion={reducedMotion} debugMode="neutral" cameraPreset={cameraPreset} presentationContract={manifest.presentationContract} profile={frame} dpr={dpr} selectedId={-1} evaluator="m4" material={lightMaterial} overlay={ui.overlay} session={session} sessionShouldAnimate={ui.shouldAnimate} diagnosticId="light" onStats={setStats} onEnvironment={setEnvironment} onContextState={(state) => { setContextState(state); if (state === "lost") session.setPauseAll(true); }} />
              </figure>
              <figure className={styles.foundationPane} style={{ "--ps04-background": MATERIAL_THEME_PRESETS.dark.background } as React.CSSProperties}>
                <figcaption>Dark · shared session</figcaption>
                <PS04M3Scene source={source} target={target} program={program} budget={budget} progress={ui.geometryProgress} reducedMotion={reducedMotion} debugMode="neutral" cameraPreset={cameraPreset} presentationContract={manifest.presentationContract} profile={frame} dpr={dpr} selectedId={-1} evaluator="m4" material={darkMaterial} overlay={ui.overlay} session={session} sessionShouldAnimate={ui.shouldAnimate} diagnosticId="dark" onStats={setStats} onEnvironment={setEnvironment} onContextState={(state) => { setContextState(state); if (state === "lost") session.setPauseAll(true); }} />
              </figure>
            </div>
          ) : (
            <figure className={styles.foundationPane}>
              <figcaption>{ui.overlayMode} · {theme} · {ui.family}</figcaption>
              <PS04M3Scene source={source} target={target} program={program} budget={budget} progress={ui.geometryProgress} reducedMotion={reducedMotion} debugMode="neutral" cameraPreset={cameraPreset} presentationContract={manifest.presentationContract} profile={frame} dpr={dpr} selectedId={-1} evaluator="m4" material={material} overlay={ui.overlay} session={session} sessionShouldAnimate={ui.shouldAnimate} diagnosticId="motion" onStats={setStats} onEnvironment={setEnvironment} onContextState={setContextState} />
            </figure>
          ) : null}
        </div>
        <aside className={styles.controls}>
          <section>
            <h2>Mode / time</h2>
            <div className={styles.segmented}>{([["m2-reference", "M2 ref"], ["m3-idle", "M3 idle"], ["m3-combined", "Combined"]] as const).map(([value, label]) => (
              <button key={value} data-active={ui.overlayMode === value} onClick={() => { session.setOverlayMode(value as OverlayMode); startClock(); }}>{label}</button>
            ))}</div>
            <div className={styles.buttonGrid}>{([["off", "Idle off"], ["breathing", "Breath"], ["rotation", "Rotate"], ["combined", "Both"]] as const).map(([value, label]) => (
              <button key={value} data-active={ui.idleChannel === value} onClick={() => { session.setIdleChannel(value as IdleChannelMode); startClock(); }}>{label}</button>
            ))}</div>
            <button onClick={() => { session.setPauseAll(!ui.pauseAll); startClock(); }}>{ui.pauseAll ? "Resume all" : "Pause all"}</button>
            <button onClick={() => { session.setColorWavePaused(!ui.colorWavePaused); startClock(); }}>{ui.colorWavePaused ? "Play color wave" : "Color wave pause"}</button>
            <label className={styles.check}><input type="checkbox" checked={manualReduced} onChange={(event) => setManualReduced(event.target.checked)} />Reduced motion diagnostic</label>
            <p className={styles.contract}>{policy.notes}</p>
          </section>
          <section>
            <h2>Theme / camera / profile</h2>
            <div className={styles.segmented}>{(["light", "dark"] as const).map((value) => <button key={value} data-active={theme === value} onClick={() => setTheme(value)}>{value}</button>)}</div>
            <label className={styles.check}><input type="checkbox" checked={sideBySide} onChange={(event) => setSideBySide(event.target.checked)} />Light / Dark side-by-side</label>
            <div className={styles.buttonGrid}>{CAMERAS.map((value) => <button key={value} data-active={cameraPreset === value} onClick={() => setCameraPreset(value)}>{value}</button>)}</div>
            <div className={styles.buttonGrid}>{FRAMES.map((value) => <button key={value} data-active={frame === value} onClick={() => setFrame(value)}>{value.replace("silhouette", "")}</button>)}</div>
            <label>DPR<select value={dpr} onChange={(event) => setDpr(Number(event.target.value) as 1 | 1.5 | 2)}>{DPR_LEVELS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label>LOD<select value={budget} onChange={(event) => setBudget(Number(event.target.value))}>{LOD_LEVELS.map((value) => <option key={value} value={value}>{formatInteger(value)}</option>)}</select></label>
          </section>
          <section>
            <h2>States</h2>
            <div className={styles.sampleGrid}>{samples.map((entry) => (
              <button key={entry.stateId} data-active={ui.requestedStateId === entry.stateId} onClick={() => void requestState(entry.stateId)}>
                {entry.stateId === "master-neutral" ? "MASTER" : entry.stateId.startsWith("single-") ? entry.stateId.slice(7).toUpperCase() : entry.stateRole === "brand_wide" ? "BRAND_WIDE" : entry.compositionMode}
              </button>
            ))}</div>
            <label>All 154<select value={ui.requestedStateId} onChange={(event) => void requestState(event.target.value)}>{manifest?.states.map((entry) => <option key={entry.stateId} value={entry.stateId}>{stateLabel(entry)}</option>)}</select></label>
          </section>
          <section>
            <h2>Scenarios</h2>
            <button onClick={() => { void requestState("single-content").then(() => requestState("single-design")).then(() => requestState("single-event")); }}>A→B→C singles</button>
            <button onClick={() => void requestState("single-event")}>MASTER handoff → EVENT</button>
            <button onClick={() => { session.seekIdlePhases(0, 179 / 360); startClock(); }}>MASTER yaw 179°</button>
            <button onClick={() => { session.seekIdlePhases(0, 0.5); startClock(); }}>MASTER yaw 180°</button>
            <button onClick={() => { session.seekIdlePhases(0, 359 / 360); startClock(); }}>MASTER yaw 359°</button>
            <label>Geometry progress <output>{ui.geometryProgress.toFixed(3)}</output><input type="range" min="0" max="1" step="0.001" value={ui.geometryProgress} onChange={(event) => { session.seekGeometryProgress(Number(event.target.value)); startClock(); }} /></label>
            <label>Color phase <output>{ui.phases.color.toFixed(3)}</output><input type="range" min="0" max="1" step="0.001" value={ui.phases.color} onChange={(event) => { session.seekColorPhase(Number(event.target.value)); startClock(); }} /></label>
          </section>
          <section>
            <h2>Timeline</h2>
            <dl className={styles.timeline}>
              <div><dt>Requested</dt><dd>{ui.requestedStateId || "—"}</dd></div>
              <div><dt>Settled</dt><dd>{ui.settledStateId || "—"}</dd></div>
              <div><dt>M4 phase</dt><dd>{ui.phaseAdapter.motionPhase} / {ui.phaseAdapter.semanticSlot}</dd></div>
              <div><dt>Palette</dt><dd>{ui.palette.paletteProgress.toFixed(3)} · mask {ui.palette.palette.mask}</dd></div>
              <div><dt>Idle scale</dt><dd>{ui.displayed.scale.toFixed(5)}</dd></div>
              <div><dt>Idle quat</dt><dd>{q.map((value) => value.toFixed(3)).join(" ")}</dd></div>
              <div><dt>Idle weight</dt><dd>{ui.phaseAdapter.decorativeIdleWeight.toFixed(3)} residual {ui.phaseAdapter.residualWeight.toFixed(3)}</dd></div>
              <div><dt>Revision</dt><dd>{ui.requestRevision}</dd></div>
            </dl>
            <div className={styles.meter} aria-hidden="true"><span style={{ width: `${ui.geometryProgress * 100}%` }} /></div>
          </section>
          <section>
            <h2>Metrics</h2>
            <dl className={styles.metrics}>
              <div><dt>This frame</dt><dd>{stats.newFrame ? `${stats.drawCalls} draw` : "no new frame"}</dd></div>
              <div><dt>Last actor draw</dt><dd>{stats.lastActorDrawCalls} / {formatInteger(stats.lastActorTriangles)} tri</dd></div>
              <div><dt>FPS · p50 / p95</dt><dd>{stats.fps} · {stats.medianMs.toFixed(2)} / {stats.p95Ms.toFixed(2)} ms</dd></div>
              <div><dt>GPU resources</dt><dd>{stats.programs}P · {stats.geometries}G · {stats.textures}T</dd></div>
              <div><dt>Field</dt><dd>{FIELD_ORIGIN.join(",")} / {FIELD_SCALE} · {FIELD_DIRECTION.map((value) => value.toFixed(3)).join(" ")}</dd></div>
              <div><dt>Support</dt><dd>{ui.palette.palette.selected.join(" ") || "neutral"} · {PHOTONIC_COLOR_TOKENS.filter((token) => (ui.palette.transientMask & token.bit) !== 0).map((token) => token.id).join("+")}</dd></div>
            </dl>
            <div className={styles.qaActions}>
              <button onClick={runGpuParity}>Run vertex parity</button><span>{parityStatus}</span>
              <button onClick={() => document.getElementById("ps04m3-context-restore-run-motion")?.dispatchEvent(new MouseEvent("click", { bubbles: true }))}>Lose / restore context</button><span>{contextState}</span>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
