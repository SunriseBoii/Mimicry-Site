"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CameraPreset, LabFrame, StateEntry } from "../photonic-skin-m4-1/m41-data";
import { usePS04Runtime } from "../photonic-skin-ps04-m1/use-ps04-runtime";
import { defaultMaterialController } from "../photonic-skin-ps04-m1/material-foundation";
import { PS04M1Scene } from "../photonic-skin-ps04-m1/PS04M1Scene";
import {
  FIELD_DIRECTION,
  FIELD_ORIGIN,
  FIELD_PARAMETERS,
  FIELD_SCALE,
  measureStateCoverage,
  samplePhotonicField,
  type PhotonicColorLayer,
  type PhotonicFieldMode,
} from "./photonic-field";
import {
  MATERIAL_THEME_PRESETS,
  defaultM2MaterialController,
  type FieldDiagnostic,
  type MaterialTheme,
} from "./material-foundation";
import { PhotonicPaletteController } from "./palette-controller";
import {
  ALL_COMPETENCE_MASK,
  COMPETENCE_BIT,
  PHOTONIC_COLOR_TOKENS,
  paletteMaskForState,
} from "./photonic-palette";
import {
  PS04M2Scene,
  type SceneEnvironment,
  type SceneStats,
} from "./PS04M2Scene";
import styles from "./ps04m2.module.css";

const CAMERAS: CameraPreset[] = ["canonical", "alternate", "side", "top"];
const FRAMES: LabFrame[] = ["desktop", "mobile390", "silhouette180", "silhouette96"];
const LOD_LEVELS = [512, 1024, 2048, 4096, 8192, 12288, 16384] as const;
const DPR_LEVELS = [1, 1.5, 2] as const;
const EMPTY_STATS: SceneStats = {
  fps: 0, medianMs: 0, p95Ms: 0, drawCalls: 0, triangles: 0, textureMiB: 0,
  programs: 0, geometries: 0, textures: 0, dpr: 0, drawingBuffer: [0, 0],
};

function labQuery() {
  return new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
}

function bootstrapReducedMotion() {
  const query = labQuery();
  return (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    || query.get("reduced") === "1";
}

function createLabColorController() {
  const query = labQuery();
  const reduced = bootstrapReducedMotion();
  const controller = new PhotonicPaletteController(ALL_COMPETENCE_MASK, FIELD_PARAMETERS.periodsSeconds.master);
  controller.setReducedMotion(reduced);
  const requestedPhase = query.has("phase") ? Number(query.get("phase")) : Number.NaN;
  if (Number.isFinite(requestedPhase)) controller.setPhase(requestedPhase);
  if (reduced || query.get("play") === "0" || Number.isFinite(requestedPhase)) controller.setPlaying(false);
  if (query.get("palette") === "custom") {
    const mask = Number(query.get("mask"));
    if (Number.isInteger(mask) && mask >= 0 && mask <= ALL_COMPETENCE_MASK) controller.setMask(mask);
  }
  return controller;
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

function fieldMode(entry: StateEntry | undefined): PhotonicFieldMode {
  if (!entry || entry.stateRole === "master") return "master";
  if (entry.stateRole === "single") return "single";
  if (entry.stateRole === "brand_wide") return "brand-wide";
  return "complex";
}

function useSystemReducedMotion() {
  const [value, setValue] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setValue(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return value;
}

export function PS04M2Lab() {
  const query = labQuery();
  const [theme, setTheme] = useState<MaterialTheme>(query.get("theme") === "dark" ? "dark" : "light");
  const [themeMix, setThemeMix] = useState(query.get("theme") === "dark" ? 1 : 0);
  const [stableVariation, setStableVariation] = useState(query.get("variation") !== "0");
  const [sideBySide, setSideBySide] = useState(query.get("compare") === "1");
  const [rendererMode, setRendererMode] = useState<"m2" | "m1">(query.get("renderer") === "m1" ? "m1" : "m2");
  const [closeUp, setCloseUp] = useState(query.get("closeup") === "1");
  const [colorEnabled, setColorEnabled] = useState(query.get("color") !== "0");
  const [colorLayer, setColorLayer] = useState<PhotonicColorLayer>(
    query.get("layer") === "neutral" || query.get("layer") === "undertone" || query.get("layer") === "full"
      ? query.get("layer") as PhotonicColorLayer
      : "full",
  );
  const [fieldDiagnostic, setFieldDiagnostic] = useState<FieldDiagnostic>(
    query.get("field") === "coordinate" || query.get("field") === "coverage" || query.get("field") === "semantic" || query.get("field") === "material"
      ? query.get("field") as FieldDiagnostic
      : "material",
  );
  const [followStatePalette, setFollowStatePalette] = useState(query.get("palette") !== "custom");
  const requestedMask = Number(query.get("mask"));
  const [customMask, setCustomMask] = useState(
    query.get("palette") === "custom" && Number.isInteger(requestedMask) && requestedMask >= 0 && requestedMask <= ALL_COMPETENCE_MASK
      ? requestedMask
      : ALL_COMPETENCE_MASK,
  );
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>(CAMERAS.includes(query.get("camera") as CameraPreset) ? query.get("camera") as CameraPreset : "canonical");
  const [frame, setFrame] = useState<LabFrame>(FRAMES.includes(query.get("profile") as LabFrame) ? query.get("profile") as LabFrame : "desktop");
  const [dpr, setDpr] = useState<1 | 1.5 | 2>(DPR_LEVELS.includes(Number(query.get("dpr")) as 1 | 1.5 | 2) ? Number(query.get("dpr")) as 1 | 1.5 | 2 : 1.5);
  const [budget, setBudget] = useState(LOD_LEVELS.includes(Number(query.get("lod")) as (typeof LOD_LEVELS)[number]) ? Number(query.get("lod")) : 16384);
  const [geometryProgress, setGeometryProgress] = useState(1);
  const [staticGeometry, setStaticGeometry] = useState(true);
  const [geometryPlaying, setGeometryPlaying] = useState(false);
  const [manualReduced, setManualReduced] = useState(labQuery().get("reduced") === "1");
  const [stats, setStats] = useState<SceneStats>(EMPTY_STATS);
  const [environment, setEnvironment] = useState<SceneEnvironment | null>(null);
  const [contextState, setContextState] = useState<"ready" | "lost" | "restored">("ready");
  const [parityStatus, setParityStatus] = useState("not run");
  const [fieldParityStatus, setFieldParityStatus] = useState("not run");
  const [stageVisible, setStageVisible] = useState(true);
  const [controllerVersion, setControllerVersion] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const systemReduced = useSystemReducedMotion();
  const reducedMotion = systemReduced || manualReduced;
  const runtime = usePS04Runtime({ reducedMotion, trigger: "qa" });
  const samples = useMemo(() => preferredSamples(runtime.manifest?.states ?? []), [runtime.manifest]);
  const controller = useMemo(() => createLabColorController(), []);
  const [clockReadout, setClockReadout] = useState(() => {
    const snapshot = controller.snapshot();
    return { phase: snapshot.phase, progress: snapshot.paletteProgress };
  });

  useEffect(() => controller.subscribe(() => setControllerVersion((value) => value + 1)), [controller]);
  useEffect(() => controller.setReducedMotion(reducedMotion), [controller, reducedMotion]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setStageVisible(entry.isIntersecting), { threshold: 0.01 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!controller.shouldAnimate()) return;
    let frameId = 0;
    let previous = performance.now();
    let lastReadout = previous;
    const reset = () => { previous = performance.now(); };
    const tick = (now: number) => {
      controller.advance((now - previous) / 1000, { hidden: document.hidden, visible: stageVisible });
      previous = now;
      if (now - lastReadout >= 250) {
        const snapshot = controller.snapshot();
        setClockReadout({ phase: snapshot.phase, progress: snapshot.paletteProgress });
        lastReadout = now;
      }
      if (controller.shouldAnimate()) frameId = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", reset);
    frameId = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frameId); document.removeEventListener("visibilitychange", reset); };
  }, [controller, controllerVersion, stageVisible]);

  const appliedFollowedState = useRef<string | null>(null);

  const activeEntry = runtime.target?.entry;
  const activeFieldMode = fieldMode(activeEntry);
  const semanticMask = activeEntry ? paletteMaskForState(activeEntry) : ALL_COMPETENCE_MASK;
  const displayedMask = followStatePalette ? semanticMask : customMask;
  useEffect(() => {
    if (!activeEntry || !followStatePalette) return;
    const mask = paletteMaskForState(activeEntry);
    controller.setPeriodSeconds(FIELD_PARAMETERS.periodsSeconds[fieldMode(activeEntry)]);
    const immediate = appliedFollowedState.current === null;
    appliedFollowedState.current = activeEntry.stateId;
    controller.setMask(mask, immediate ? { immediate: true } : {});
  }, [activeEntry, controller, followStatePalette]);
  useEffect(() => { if (!followStatePalette) controller.setMask(customMask); }, [controller, customMask, followStatePalette]);

  useEffect(() => {
    if (!geometryPlaying || staticGeometry || reducedMotion || !runtime.program) return;
    let frameId = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = now - previous;
      previous = now;
      setGeometryProgress((value) => {
        const next = value + elapsed / Math.max(1, runtime.program?.durationMs ?? 1);
        return next >= 1 ? 0 : next;
      });
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [geometryPlaying, reducedMotion, runtime.program, staticGeometry]);

  useEffect(() => {
    if (!runtime.sourceId || !runtime.targetId) return;
    const query = new URLSearchParams(window.location.search);
    const snapshot = controller.snapshot();
    query.set("source", runtime.sourceId); query.set("state", runtime.targetId); query.set("theme", theme);
    query.set("camera", cameraPreset); query.set("profile", frame); query.set("dpr", String(dpr)); query.set("lod", String(budget));
    query.set("compare", sideBySide ? "1" : "0"); query.set("closeup", closeUp ? "1" : "0"); query.set("color", colorEnabled ? "1" : "0");
    query.set("layer", colorLayer); query.set("field", fieldDiagnostic); query.set("palette", followStatePalette ? "state" : "custom"); query.set("mask", String(displayedMask)); query.set("variation", stableVariation ? "1" : "0");
    query.set("renderer", rendererMode); query.set("play", snapshot.playing ? "1" : "0"); query.set("reduced", manualReduced ? "1" : "0");
    if (!snapshot.playing) query.set("phase", snapshot.phase.toFixed(3));
    else query.delete("phase");
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [budget, cameraPreset, closeUp, colorEnabled, colorLayer, controller, controllerVersion, displayedMask, dpr, fieldDiagnostic, followStatePalette, frame, manualReduced, rendererMode, runtime.sourceId, runtime.targetId, sideBySide, stableVariation, theme]);

  const coverage = useMemo(() => runtime.target ? measureStateCoverage(runtime.target) : null, [runtime.target]);
  const paletteSnapshot = controller.snapshot();
  const paletteMismatch = Boolean(activeEntry && !followStatePalette && displayedMask !== semanticMask);
  const centerSample = samplePhotonicField({
    scalar: 0, phase: paletteSnapshot.phase, palette: paletteSnapshot.palette, layer: colorLayer,
    sourceLut: paletteSnapshot.sourceLut, paletteProgress: paletteSnapshot.paletteProgress,
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- explicit QA-only browser hook
    window.__PS04M2_LAB__ = {
      ready: Boolean(runtime.target && (stats.drawCalls > 0 || window.__PS04M2_SCENE_READY__)),
      stats,
      environment,
      contextState,
      snapshot: paletteSnapshot,
      coverage,
      displayedMask,
      semanticMask,
      theme,
      colorEnabled,
      colorLayer,
      fieldDiagnostic,
      rendererMode,
      paletteMismatch,
      field: {
        origin: FIELD_ORIGIN,
        direction: FIELD_DIRECTION,
        scale: FIELD_SCALE,
        periods: FIELD_PARAMETERS.periodsSeconds,
      },
    };
  }, [colorEnabled, colorLayer, contextState, coverage, displayedMask, environment, fieldDiagnostic, paletteMismatch, paletteSnapshot, rendererMode, runtime.target, semanticMask, stats, theme]);
  const baseMaterial = useMemo(() => ({
    ...defaultM2MaterialController(theme, controller), themeMix, stableVariation, colorEnabled, colorLayer,
    diagnostic: fieldDiagnostic, reducedMotion,
  }), [colorEnabled, colorLayer, controller, fieldDiagnostic, reducedMotion, stableVariation, theme, themeMix]);
  const lightMaterial = useMemo(() => ({ ...baseMaterial, theme: "light" as const, themeMix: 0 }), [baseMaterial]);
  const darkMaterial = useMemo(() => ({ ...baseMaterial, theme: "dark" as const, themeMix: 1 }), [baseMaterial]);
  const m1BaselineMaterial = useMemo(() => ({
    ...defaultMaterialController(theme), themeMix, stableVariation,
  }), [stableVariation, theme, themeMix]);
  const sceneProps = runtime.source && runtime.target && runtime.program && runtime.manifest ? {
    source: runtime.source, target: runtime.target, program: runtime.program, budget,
    progress: staticGeometry || reducedMotion ? 1 : geometryProgress, reducedMotion: staticGeometry || reducedMotion,
    debugMode: "neutral" as const, cameraPreset, presentationContract: runtime.manifest.presentationContract,
    profile: frame, dpr, selectedId: -1, evaluator: "m4" as const,
    geometryPlayback: geometryPlaying && !staticGeometry && !reducedMotion,
  } : null;
  const sceneStyle = { "--ps04-background": MATERIAL_THEME_PRESETS[theme].background, "--ps04-substrate": MATERIAL_THEME_PRESETS[theme].substrate } as React.CSSProperties;

  const chooseTheme = (next: MaterialTheme) => { setTheme(next); setThemeMix(next === "dark" ? 1 : 0); };
  const chooseState = (entry: StateEntry) => { setFollowStatePalette(true); runtime.setTargetId(entry.stateId); };
  const toggleCompetence = (bit: number) => { setFollowStatePalette(false); setCustomMask(displayedMask ^ bit); };
  const setFixedPhase = (phase: number) => {
    controller.setPlaying(false); controller.setPhase(phase);
    const snapshot = controller.snapshot(); setClockReadout({ phase: snapshot.phase, progress: snapshot.paletteProgress });
  };
  const runRetargetScenario = () => {
    setFollowStatePalette(false); controller.setMask(COMPETENCE_BIT.content);
    window.setTimeout(() => controller.setMask(COMPETENCE_BIT.design | COMPETENCE_BIT.video), 180);
    window.setTimeout(() => controller.setMask(COMPETENCE_BIT.event | COMPETENCE_BIT.digital | COMPETENCE_BIT.merch), 360);
  };
  const runGpuParity = () => {
    const button = document.getElementById("ps04m2-gpu-parity-run-color");
    if (!(button instanceof HTMLButtonElement)) return;
    setParityStatus("running"); button.click();
    const poll = window.setInterval(() => {
      if (button.dataset.status === "done") {
        window.clearInterval(poll);
        const result = JSON.parse(button.dataset.result ?? "{}") as { valid?: boolean; maxPositionError?: number };
        setParityStatus(result.valid ? `pass · max Δ ${result.maxPositionError?.toExponential(2)}` : "failed");
      }
      if (button.dataset.status === "error") { window.clearInterval(poll); setParityStatus("error"); }
    }, 100);
  };
  const runContextRestore = () => {
    const button = document.getElementById("ps04m2-context-restore-run-color");
    if (button instanceof HTMLButtonElement) button.click();
  };
  const runFieldParity = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!window.__PS04M2_FIELD_GPU_PARITY__) return;
    const button = event.currentTarget;
    button.dataset.status = "running";
    delete button.dataset.result;
    delete button.dataset.error;
    setFieldParityStatus("running");
    void window.__PS04M2_FIELD_GPU_PARITY__().then((result) => {
      window.__PS04M2_FIELD_GPU_PARITY_RESULT__ = result;
      button.dataset.status = "done";
      button.dataset.result = JSON.stringify(result);
      setFieldParityStatus(result.valid ? `pass · max Δ ${Math.max(result.maxSemanticWeightError, result.maxEnvelopeError).toExponential(2)}` : "failed");
    }).catch((reason: unknown) => {
      button.dataset.status = "error";
      button.dataset.error = reason instanceof Error ? reason.message : String(reason);
      setFieldParityStatus("error");
    });
  };

  return (
    <main className={styles.lab} data-theme={theme} style={sceneStyle}>
      <header className={styles.header}>
        <div><p className={styles.kicker}>Photonic Skin · PS-04.M2</p><h1>Photonic Color Field</h1><p>Seven semantic colors. One actor-space field. Neutral ceramic remains the material foundation.</p></div>
        <div className={styles.statusBlock}><span data-status={contextState}>WebGL {contextState}</span><span>{paletteSnapshot.transient ? "palette transient" : "selected-colors settled"}</span><a href="/visual-lab/photonic-skin-ps04-m2/preview">Hero preview ↗</a></div>
      </header>
      <section className={styles.workspace}>
        <div ref={stageRef} className={styles.stage} data-frame={frame} data-comparison={sideBySide} data-closeup={closeUp} data-qa="ps04m2-stage">
          {runtime.loading ? <div className={styles.loading}>Loading frozen actor…</div> : null}
          {runtime.error ? <div className={styles.error}>{runtime.error}</div> : null}
          {sceneProps ? sideBySide ? (
            <div className={styles.comparisonGrid}>
              <figure className={styles.foundationPane} style={{ "--ps04-background": MATERIAL_THEME_PRESETS.light.background } as React.CSSProperties}><figcaption>Light · shared phase {clockReadout.phase.toFixed(3)}</figcaption><PS04M2Scene {...sceneProps} material={lightMaterial} diagnosticId="light" onStats={setStats} onEnvironment={setEnvironment} onContextState={setContextState} /></figure>
              <figure className={styles.foundationPane} style={{ "--ps04-background": MATERIAL_THEME_PRESETS.dark.background } as React.CSSProperties}><figcaption>Dark · shared phase {clockReadout.phase.toFixed(3)}</figcaption><PS04M2Scene {...sceneProps} material={darkMaterial} diagnosticId="dark" onStats={setStats} onEnvironment={setEnvironment} onContextState={setContextState} /></figure>
            </div>
          ) : (
            <figure className={styles.foundationPane}><figcaption>{rendererMode === "m1" ? "actual M1 renderer baseline" : colorEnabled ? colorLayer : "M1 exact visual bypass"} · {theme} · {activeFieldMode}</figcaption>{rendererMode === "m1" ? <PS04M1Scene {...sceneProps} material={m1BaselineMaterial} diagnosticId="m1-baseline" onStats={setStats} onEnvironment={setEnvironment} onContextState={setContextState} /> : <PS04M2Scene {...sceneProps} material={baseMaterial} diagnosticId="color" onStats={setStats} onEnvironment={setEnvironment} onContextState={setContextState} />}</figure>
          ) : null}
        </div>
        <aside className={styles.controls}>
          <section><h2>Material / theme</h2>
            <div className={styles.segmented}><button data-active={rendererMode === "m2"} onClick={() => setRendererMode("m2")}>M2 field</button><button data-active={rendererMode === "m1"} onClick={() => { setSideBySide(false); setRendererMode("m1"); }}>M1 renderer baseline</button></div>
            <div className={styles.segmented}>{(["light", "dark"] as const).map((value) => <button key={value} data-active={theme === value} onClick={() => chooseTheme(value)}>{value}</button>)}</div>
            <label>Theme mix <output>{themeMix.toFixed(2)}</output><input type="range" min="0" max="1" step="0.01" value={themeMix} onChange={(event) => setThemeMix(Number(event.target.value))} /></label>
            <label className={styles.check}><input type="checkbox" checked={colorEnabled} onChange={(event) => setColorEnabled(event.target.checked)} />Color enabled (off = exact M1 bypass)</label>
            <div className={styles.buttonGrid}>{(["neutral", "undertone", "full"] as const).map((value) => <button key={value} data-active={colorLayer === value} onClick={() => setColorLayer(value)}>{value}</button>)}</div>
            <label className={styles.check}><input type="checkbox" checked={stableVariation} onChange={(event) => setStableVariation(event.target.checked)} />Stable persistent-ID variation</label>
            <label className={styles.check}><input type="checkbox" checked={sideBySide} onChange={(event) => setSideBySide(event.target.checked)} />Light / Dark side-by-side</label>
            <label className={styles.check}><input type="checkbox" checked={closeUp} onChange={(event) => setCloseUp(event.target.checked)} />Surface close-up</label>
          </section>
          <section><h2>Palette / mask</h2>
            <label className={styles.check}><input type="checkbox" checked={followStatePalette} onChange={(event) => setFollowStatePalette(event.target.checked)} />Follow frozen state semantics</label>
            <div className={styles.paletteGrid}>{PHOTONIC_COLOR_TOKENS.map((token) => <button key={token.id} data-active={(displayedMask & token.bit) !== 0} onClick={() => toggleCompetence(token.bit)} style={{ "--token": token.hex } as React.CSSProperties}><span aria-hidden="true" />{token.id}</button>)}</div>
            <button onClick={() => { setFollowStatePalette(false); setCustomMask(0); }}>Neutral-only empty mask</button>
            <p className={styles.contract}>mask {displayedMask.toString(2).padStart(7, "0")} · {paletteSnapshot.palette.selected.join(" + ") || "neutral only"}</p>
            {paletteMismatch ? <p className={styles.contract} data-qa="palette-mismatch">Material diagnostic: custom mask on frozen form {activeEntry?.stateId}. Semantic mask {semanticMask.toString(2).padStart(7, "0")}. This is not an approved state ID.</p> : null}
          </section>
          <section><h2>Frozen state</h2>
            <div className={styles.sampleGrid}>{samples.map((entry) => <button key={entry.stateId} data-active={runtime.targetId === entry.stateId} onClick={() => chooseState(entry)} title={entry.stateId}>{entry.stateId === "master-neutral" ? "MASTER" : entry.stateId.startsWith("single-") ? entry.stateId.slice(7).toUpperCase() : entry.stateRole === "brand_wide" ? "BRAND_WIDE" : entry.compositionMode}</button>)}</div>
            <label>All 154 frozen states<select value={runtime.targetId} onChange={(event) => { setFollowStatePalette(true); runtime.setTargetId(event.target.value); }}>{runtime.manifest?.states.map((entry) => <option key={entry.stateId} value={entry.stateId}>{stateLabel(entry)}</option>)}</select></label>
            <label>Transition source<select value={runtime.sourceId} onChange={(event) => runtime.setSourceId(event.target.value)}>{runtime.manifest?.states.map((entry) => <option key={entry.stateId} value={entry.stateId}>{stateLabel(entry)}</option>)}</select></label>
          </section>
          <section><h2>Color time / retarget</h2>
            <div className={styles.buttonGrid}>{[0, 0.25, 0.5, 0.75].map((value) => <button key={value} onClick={() => setFixedPhase(value)}>{value.toFixed(2)}</button>)}</div>
            <label>Color phase <output>{clockReadout.phase.toFixed(3)}</output><input type="range" min="0" max="1" step="0.001" value={clockReadout.phase} onChange={(event) => setFixedPhase(Number(event.target.value))} /></label>
            <button onClick={() => controller.setPlaying(!paletteSnapshot.playing)}>{paletteSnapshot.playing ? "Pause color wave" : "Play color wave"}</button>
            <button onClick={runRetargetScenario}>Run A → B → C interruption</button>
            <label className={styles.check}><input type="checkbox" checked={manualReduced} onChange={(event) => setManualReduced(event.target.checked)} />Reduced motion diagnostic</label>
            <p className={styles.contract}>period {paletteSnapshot.periodSeconds}s · retarget {clockReadout.progress.toFixed(3)} · source LUT {paletteSnapshot.transitionCapacity} samples</p>
          </section>
          <section><h2>Field / presentation</h2>
            <div className={styles.buttonGrid}>{(["material", "coordinate", "coverage", "semantic"] as const).map((value) => <button key={value} data-active={fieldDiagnostic === value} onClick={() => setFieldDiagnostic(value)}>{value}</button>)}</div>
            <div className={styles.buttonGrid}>{CAMERAS.map((value) => <button key={value} data-active={cameraPreset === value} onClick={() => setCameraPreset(value)}>{value}</button>)}</div>
            <div className={styles.buttonGrid}>{FRAMES.map((value) => <button key={value} data-active={frame === value} onClick={() => setFrame(value)}>{value.replace("silhouette", "")}</button>)}</div>
            <label>Nested LOD<select value={budget} onChange={(event) => setBudget(Number(event.target.value))}>{LOD_LEVELS.map((value) => <option key={value} value={value}>{formatInteger(value)} IDs</option>)}</select></label>
            <label>DPR<select value={dpr} onChange={(event) => setDpr(Number(event.target.value) as 1 | 1.5 | 2)}>{DPR_LEVELS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          </section>
          <section><h2>Geometry playback</h2>
            <label className={styles.check}><input type="checkbox" checked={staticGeometry} onChange={(event) => setStaticGeometry(event.target.checked)} />Static frozen endpoint</label>
            <label>Frozen transition <output>{geometryProgress.toFixed(3)}</output><input type="range" min="0" max="1" step="0.001" value={geometryProgress} disabled={staticGeometry} onChange={(event) => setGeometryProgress(Number(event.target.value))} /></label>
            <button disabled={staticGeometry || reducedMotion} onClick={() => setGeometryPlaying((value) => !value)}>{geometryPlaying ? "Pause geometry" : "Play geometry"}</button>
          </section>
          <section><h2>Metrics / invariants</h2>
            <dl className={styles.metrics}>
              <div><dt>Draw / triangles</dt><dd>{stats.drawCalls} / {formatInteger(stats.triangles)}</dd></div><div><dt>FPS · p50 / p95</dt><dd>{stats.fps} · {stats.medianMs.toFixed(2)} / {stats.p95Ms.toFixed(2)} ms</dd></div><div><dt>DPR / buffer</dt><dd>{stats.dpr} · {stats.drawingBuffer.join("×")}</dd></div><div><dt>GPU resources</dt><dd>{stats.programs}P · {stats.geometries}G · {stats.textures}T</dd></div>
              <div><dt>Coverage mean</dt><dd>{coverage ? (coverage.meanActiveWeight.mean * 100).toFixed(1) + "%" : "…"}</dd></div><div><dt>Coverage min / max</dt><dd>{coverage ? `${(coverage.meanActiveWeight.min * 100).toFixed(1)} / ${(coverage.meanActiveWeight.max * 100).toFixed(1)}%` : "…"}</dd></div><div><dt>Threshold fraction</dt><dd>{coverage ? (coverage.aboveThresholdFraction.mean * 100).toFixed(1) + "%" : "…"}</dd></div>
              <div><dt>Semantic support</dt><dd>{centerSample.semanticWeights.map((value, index) => value > 0.001 ? `${PHOTONIC_COLOR_TOKENS[index].id}:${value.toFixed(2)}` : "").filter(Boolean).join(" ") || "neutral"}</dd></div><div><dt>Field origin / scale</dt><dd>{FIELD_ORIGIN.join(",")} / {FIELD_SCALE}</dd></div><div><dt>Field direction</dt><dd>{FIELD_DIRECTION.map((value) => value.toFixed(3)).join(",")}</dd></div><div><dt>GPU</dt><dd title={environment?.gpuRenderer}>{environment?.gpuRenderer ?? "measuring…"}</dd></div>
            </dl>
            <div className={styles.qaActions}><button onClick={runGpuParity}>Run vertex parity</button><span>{parityStatus}</span><button id="ps04m2-field-parity-run" onClick={runFieldParity}>Run field parity</button><span>{fieldParityStatus}</span><button onClick={runContextRestore}>Lose / restore context</button><span>{contextState}</span></div>
          </section>
        </aside>
      </section>
    </main>
  );
}
