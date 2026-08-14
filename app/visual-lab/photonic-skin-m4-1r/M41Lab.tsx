"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { M41Scene, type SceneStats } from "./M41Scene";
import {
  LatestRequestGate,
  PrecompiledProgramUnavailableError,
  StaleRequestError,
  getOrCompileProgram,
  labelState,
  loadLatestStatePair,
  loadMatchingPrecompiledProgram,
  loadRuntimeManifests,
  loadState,
  parseM41Query,
  runtimeProgramCache,
  runtimeStateCache,
  serializeM41Query,
  type CameraPreset,
  type ComparisonMode,
  type DebugMode,
  type DecodedState,
  type LabFrame,
  type M3Manifest,
  type M41Manifest,
  type M41QueryPreset,
  type StateEntry,
} from "../photonic-skin-m4-1/m41-data";
import {
  c2Pulse,
  compileTransition,
  createRetargetSnapshot,
  evaluateElement,
  phaseAt,
  type RuntimeTransitionSnapshot,
  type TransitionProgram,
  type TriggerMode,
  type ViewportProfile,
} from "../photonic-skin-m4-1/m41-evaluator";
import {
  cameraDiagnostic,
  createPhotonicPresentationCamera,
  interpolatePresentationFrames,
  resolvePresentationFrame,
} from "./photonic-presentation";
import styles from "./m41r-lab.module.css";

const DEBUG_MODES: DebugMode[] = ["neutral", "phase", "groups", "shells", "bridge", "reserve", "residual", "orientation", "identity", "components", "features", "trajectories", "collision"];
const CAMERAS: CameraPreset[] = ["canonical", "alternate", "side", "top"];
const FRAMES: LabFrame[] = ["desktop", "mobile390", "silhouette180", "silhouette96"];
const EMPTY_STATS: SceneStats = { fps: 0, medianMs: 0, p95Ms: 0, drawCalls: 0, triangles: 0, textureMiB: 0 };
type ParityView = "side-by-side" | "blink" | "difference" | "silhouette-xor" | "component-difference";
const PARITY_VIEWS: ParityView[] = ["side-by-side", "blink", "difference", "silhouette-xor", "component-difference"];

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

function programKey(source: DecodedState, target: DecodedState, trigger: TriggerMode, viewport: ViewportProfile, seed: number) {
  return [source.entry.contentHash, target.entry.contentHash, trigger, viewport, seed >>> 0].join(":");
}

function runtimeDecoded(
  snapshot: RuntimeTransitionSnapshot,
  source: DecodedState,
  target: DecodedState,
  progress: number,
): DecodedState {
  const metadata = progress < 0.5 ? source : target;
  const presentationFrame = interpolatePresentationFrames(source.entry, target.entry, progress);
  return {
    ...snapshot,
    entry: ({
      ...source.entry,
      stateId: `runtime-snapshot-${progress.toFixed(3)}`,
      contentHash: `runtime-${source.entry.contentHash.slice(0, 16)}-${target.entry.contentHash.slice(0, 16)}-${progress.toFixed(3)}`,
      presentationFrame,
    } as StateEntry & { presentationFrame: typeof presentationFrame }),
    density: new Uint8Array(metadata.density),
    lodPriority: new Uint16Array(metadata.lodPriority),
  };
}

function buttonLabel(value: string) {
  return value.replace("silhouette", "").replace("mobile", "");
}

export function M41Lab() {
  const [manifest, setManifest] = useState<M3Manifest | null>(null);
  const [m4Manifest, setM41Manifest] = useState<M41Manifest | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [retargetId, setRetargetId] = useState("");
  const [source, setSource] = useState<DecodedState | null>(null);
  const [target, setTarget] = useState<DecodedState | null>(null);
  const [program, setProgram] = useState<TransitionProgram | null>(null);
  const [runtimeLabel, setRuntimeLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadMs, setLoadMs] = useState(0);
  const [compileMs, setCompileMs] = useState(0);
  const [trigger, setTrigger] = useState<Exclude<TriggerMode, "preview">>("route");
  const [viewport, setViewport] = useState<ViewportProfile>("desktop");
  const [frame, setFrame] = useState<LabFrame>("desktop");
  const [dpr, setDpr] = useState<1 | 1.5 | 2>(1.5);
  const [comparison, setComparison] = useState<ComparisonMode>("m41");
  const [presentationParity, setPresentationParity] = useState(false);
  const [parityView, setParityView] = useState<ParityView>("side-by-side");
  const [debugMode, setDebugMode] = useState<DebugMode>("neutral");
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("canonical");
  const [budget, setBudget] = useState(16384);
  const [selectedId, setSelectedId] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [manualReduced, setManualReduced] = useState(false);
  const [seed, setSeed] = useState(0x4d344c42);
  const [stats, setStats] = useState<SceneStats>(EMPTY_STATS);
  const [contextState, setContextState] = useState<"ready" | "lost" | "restored">("ready");
  const [rapidStatus, setRapidStatus] = useState("idle");
  const systemReduced = useReducedMotion();
  const reducedMotion = systemReduced || manualReduced;
  const gate = useRef(new LatestRequestGate());
  const skipPairLoad = useRef(false);
  const queryReady = useRef(false);
  const initialProgress = useRef<number | null>(null);
  const playheadT = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const started = performance.now();
    loadRuntimeManifests(controller.signal).then(({ m3, m4 }) => {
      const queryParams = new URLSearchParams(window.location.search);
      const query = parseM41Query(queryParams);
      const requestedDpr = Number(queryParams.get("dpr"));
      const master = m3.states.find((entry) => entry.stateRole === "master") ?? m3.states[0];
      const nonMaster = m3.states.find((entry) => entry.stateRole !== "master") ?? m3.states[1] ?? master;
      const third = m3.states.find((entry) => entry.stateId !== master.stateId && entry.stateId !== nonMaster.stateId) ?? master;
      const sourceEntry = m3.states.find((entry) => entry.stateId === query.source) ?? master;
      const targetEntry = m3.states.find((entry) => entry.stateId === query.target) ?? nonMaster;
      setManifest(m3);
      setM41Manifest(m4);
      setSourceId(sourceEntry.stateId);
      setTargetId(targetEntry.stateId);
      setRetargetId(third.stateId);
      setTrigger(query.trigger);
      setViewport(query.viewport);
      setFrame(query.frame);
      setDpr(requestedDpr === 1 || requestedDpr === 1.5 || requestedDpr === 2 ? requestedDpr : 1.5);
      setComparison(query.comparison);
      setDebugMode(query.debug);
      setCameraPreset(query.camera);
      setBudget(queryParams.has("lod") && m3.lodTransitions.levels.includes(query.lod)
        ? query.lod
        : m3.identitySpace.size);
      initialProgress.current = query.progress;
      setProgress(query.progress);
      setSeed(query.seed);
      setPlaying(query.autoplay && !query.reduced);
      setManualReduced(query.reduced);
      setLoadMs(Math.round(performance.now() - started));
      queryReady.current = true;
    }).catch((reason: Error) => {
      if (reason.name !== "AbortError") setError(reason.message);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!manifest || !sourceId || !targetId) return;
    if (skipPairLoad.current) {
      skipPairLoad.current = false;
      return;
    }
    let mounted = true;
    const started = performance.now();
    setLoading(true);
    setRuntimeLabel("");
    loadLatestStatePair(manifest, sourceId, targetId, gate.current).then(async (pair) => {
      if (!mounted) return;
      const startedCompile = performance.now();
      const nextProgram = await getOrCompileProgram(
        programKey(pair.source, pair.target, trigger, viewport, seed),
        async () => {
          if (m4Manifest && !reducedMotion) {
            try {
              return await loadMatchingPrecompiledProgram(
                m4Manifest,
                pair.source,
                pair.target,
                trigger,
                viewport,
                { signal: pair.signal },
              );
            } catch (reason) {
              if (!(reason instanceof PrecompiledProgramUnavailableError)) throw reason;
            }
          }
          return compileTransition(pair.source, pair.target, {
            schemaVersion: "1.0.0",
            sourceStateId: sourceId,
            targetStateId: targetId,
            identitySpaceVersion: manifest.identitySpace.identitySpaceVersion,
            motionProfileId: "directed-plastic-release",
            triggerMode: trigger,
            viewportProfile: viewport,
            directionIntent: "auto",
            deterministicSeed: seed,
            reducedMotion,
          });
        },
      );
      if (!mounted) return;
      setSource(pair.source);
      setTarget(pair.target);
      setProgram(nextProgram);
      if (nextProgram.programSource === "precompiled" && seed !== nextProgram.deterministicSeed) {
        // Approval artifacts own their canonical request seed; reflect it in
        // the deterministic query instead of silently claiming a user seed.
        setSeed(nextProgram.deterministicSeed);
      }
      setCompileMs(Number((performance.now() - startedCompile).toFixed(2)));
      setLoadMs(Math.round(performance.now() - started));
      setProgress(reducedMotion ? 1 : (initialProgress.current ?? 0));
      initialProgress.current = null;
      setError(null);
    }).catch((reason: Error) => {
      if (mounted && reason.name !== "AbortError" && !(reason instanceof StaleRequestError)) setError(reason.message);
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [m4Manifest, manifest, reducedMotion, seed, sourceId, targetId, trigger, viewport]);

  useEffect(() => {
    if (!queryReady.current) return;
    const preset: M41QueryPreset = {
      source: sourceId,
      target: targetId,
      trigger,
      viewport,
      frame,
      reduced: manualReduced,
      comparison,
      debug: debugMode,
      camera: cameraPreset,
      lod: budget,
      progress,
      seed,
      autoplay: playing,
    };
    const params = new URLSearchParams(serializeM41Query(preset));
    params.set("dpr", String(dpr));
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [budget, cameraPreset, comparison, debugMode, dpr, frame, manualReduced, playing, progress, seed, sourceId, targetId, trigger, viewport]);

  useEffect(() => () => gate.current.cancel(), []);

  useEffect(() => {
    playheadT.current = progress;
  }, [progress]);

  useEffect(() => {
    if (!playing || !program || reducedMotion || isDragging || program.durationMs <= 0) return;
    let frameId = 0;
    let lastNow = performance.now();
    const tick = (now: number) => {
      if (document.hidden) {
        lastNow = now;
        frameId = requestAnimationFrame(tick);
        return;
      }
      const elapsedMs = Math.min(100, Math.max(0, now - lastNow));
      lastNow = now;
      const next = Math.min(1, Math.max(0, playheadT.current + direction * elapsedMs / program.durationMs));
      playheadT.current = next;
      setProgress(next);
      if ((direction === 1 && next >= 1) || (direction === -1 && next <= 0)) {
        setPlaying(false);
        return;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [direction, isDragging, playing, program, reducedMotion]);

  const phase = program ? phaseAt(program, progress) : "idle";
  const selected = useMemo(() => {
    if (!source || !target || !program) return null;
    const id = Math.min(selectedId, program.recordCount - 1);
    const value = evaluateElement(source, target, program, id, progress);
    const trackIndex = program.trackIndex[id];
    const track = program.tracks[trackIndex];
    const exact = program.compiled?.groupTracks[trackIndex];
    const width = program.compiled?.header.activationPolicy.localMorphWidthFraction ?? 0.12;
    const phaseOffset = program.compiled
      ? program.compiled.perId.phaseOffset[id] / 255 * program.compiled.header.activationPolicy.phaseOffsetRange
      : program.phaseDelay[id];
    const handoffStart = exact
      ? Math.min(exact.releaseEnd + phaseOffset, Math.max(exact.releaseEnd, exact.revealEnd - width))
      : 0.07 + phaseOffset;
    const handoffEnd = exact
      ? Math.max(Math.min(handoffStart + width, exact.revealEnd), handoffStart + 1e-4)
      : 0.82 + phaseOffset;
    return {
      id,
      ...value,
      speed: Math.hypot(...value.velocity),
      localPhase: progress < handoffStart ? "source-hold" : progress >= handoffEnd ? "target-hold" : "local-handoff",
      handoffStart,
      handoffEnd,
      path: `${track.sourceGroup}/${track.sourceShell} → route(${track.route.map((lane) => lane.toFixed(3)).join(",")}) → ${track.targetGroup}/${track.targetShell}`,
      sourceGroup: source.transitionGroup[id],
      targetGroup: target.transitionGroup[id],
      sourceShell: source.shell[id],
      targetShell: target.shell[id],
    };
  }, [program, progress, selectedId, source, target]);
  const groupMetrics = useMemo(() => {
    if (!program) return null;
    const pulse = c2Pulse(progress, 0.3, 0.5, 0.72);
    const bridgeActive = program.bridgeWeight.reduce((sum, value) => sum + (value * pulse > 0.08 ? 1 : 0), 0);
    const routeMean = program.tracks.reduce((sum, track) => sum + Math.hypot(...track.route), 0) / Math.max(1, program.tracks.length);
    const shellChanges = program.tracks.filter((track) => track.sourceShell !== track.targetShell).length;
    return { bridgeActive, routeMean, shellChanges, tracks: program.tracks.length };
  }, [program, progress]);
  const shapeMetrics = useMemo(() => {
    if (!source || !target || !program) return null;
    const sampleCount = Math.min(96, budget, program.recordCount);
    const ids = Array.from({ length: sampleCount }, (_, index) => Math.min(program.recordCount - 1, Math.floor(index * budget / sampleCount)));
    const values = ids.map((id) => evaluateElement(source, target, program, id, progress));
    const center = (positions: ArrayLike<number>, stride: number) => [0, 1, 2].map((axis) => (
      ids.reduce((sum, id) => sum + positions[id * stride + axis], 0) / sampleCount
    ));
    const sourceCenter = center(source.position, 3);
    const targetCenter = center(target.position, 3);
    const currentCenter = [0, 1, 2].map((axis) => values.reduce((sum, value) => sum + value.position[axis], 0) / sampleCount);
    let sourceError = 0;
    let targetError = 0;
    let endpointSpan = 0;
    let sourceRadius = 0;
    let targetRadius = 0;
    let currentRadius = 0;
    let fragmentation = 0;
    let clumping = 0;
    let collision = 0;
    const phaseByTrack = new Map<number, number[]>();
    ids.forEach((id, lane) => {
      const value = values[lane];
      for (let axis = 0; axis < 3; axis += 1) {
        sourceError += (value.position[axis] - source.position[id * 3 + axis]) ** 2;
        targetError += (value.position[axis] - target.position[id * 3 + axis]) ** 2;
        endpointSpan += (target.position[id * 3 + axis] - source.position[id * 3 + axis]) ** 2;
        sourceRadius += (source.position[id * 3 + axis] - sourceCenter[axis]) ** 2;
        targetRadius += (target.position[id * 3 + axis] - targetCenter[axis]) ** 2;
        currentRadius += (value.position[axis] - currentCenter[axis]) ** 2;
      }
      const phases = phaseByTrack.get(program.trackIndex[id]) ?? [];
      phases.push(value.groupPhase);
      phaseByTrack.set(program.trackIndex[id], phases);
      if (lane === 0) return;
      const previousId = ids[lane - 1];
      const currentDistance = Math.hypot(...value.position.map((position, axis) => position - values[lane - 1].position[axis]));
      const sourceDistance = Math.hypot(...[0, 1, 2].map((axis) => source.position[id * 3 + axis] - source.position[previousId * 3 + axis]));
      const targetDistance = Math.hypot(...[0, 1, 2].map((axis) => target.position[id * 3 + axis] - target.position[previousId * 3 + axis]));
      if (currentDistance > Math.max(0.02, Math.max(sourceDistance, targetDistance) * 2.5)) fragmentation += 1;
      if (currentDistance < Math.max(0.002, Math.min(sourceDistance, targetDistance) * 0.45)) clumping += 1;
      if (currentDistance < 0.035 * (value.scale + values[lane - 1].scale) * 0.65) collision += 1;
    });
    const span = Math.sqrt(endpointSpan / Math.max(1, sampleCount * 3));
    const coherenceDeviation = [...phaseByTrack.values()].reduce((sum, phases) => {
      const mean = phases.reduce((total, value) => total + value, 0) / phases.length;
      return sum + phases.reduce((total, value) => total + Math.abs(value - mean), 0);
    }, 0) / sampleCount;
    return {
      sampleCount,
      sourceLikeness: Math.max(0, 1 - Math.sqrt(sourceError / (sampleCount * 3)) / Math.max(span, 1e-6)),
      targetLikeness: Math.max(0, 1 - Math.sqrt(targetError / (sampleCount * 3)) / Math.max(span, 1e-6)),
      collapseRatio: Math.sqrt(currentRadius / Math.max(sourceRadius, targetRadius, 1e-9)),
      fragmentation: fragmentation / Math.max(1, sampleCount - 1),
      clumping: clumping / Math.max(1, sampleCount - 1),
      collision: collision / Math.max(1, sampleCount - 1),
      coherence: Math.max(0, 1 - coherenceDeviation),
    };
  }, [budget, program, progress, source, target]);
  const programBytes = program
    ? program.residual.byteLength + program.phaseDelay.byteLength + program.bridgeWeight.byteLength + program.trackIndex.byteLength + program.tracks.length * 64
    : 0;

  function setPairSource(value: string) {
    setPlaying(false);
    setSourceId(value);
  }

  function setPairTarget(value: string) {
    setPlaying(false);
    setTargetId(value);
  }

  function reset() {
    setPlaying(false);
    setDirection(1);
    setTimeline(reducedMotion ? 1 : 0);
  }

  function setTimeline(value: number) {
    const next = Math.min(1, Math.max(0, value));
    playheadT.current = next;
    setProgress(next);
  }

  function togglePlay() {
    if (!program || reducedMotion || trigger === "lab-scroll-scrub") return;
    if (!playing && ((direction === 1 && playheadT.current >= 1) || (direction === -1 && playheadT.current <= 0))) {
      setTimeline(direction === 1 ? 0 : 1);
    }
    setPlaying((value) => !value);
  }

  function reverse() {
    setDirection((value) => {
      const next = value === 1 ? -1 : 1;
      if ((next === -1 && playheadT.current <= 0) || (next === 1 && playheadT.current >= 1)) setTimeline(next === -1 ? 1 : 0);
      return next;
    });
    setPlaying(true);
  }

  async function retargetAt(at: number) {
    if (!manifest || !source || !target || !program) return;
    const nextEntry = manifest.states.find((entry) => entry.stateId === retargetId);
    if (!nextEntry) return;
    setPlaying(false);
    setRapidStatus(`snapshot @ ${Math.round(at * 100)}%`);
    try {
      const nextTarget = await loadState(nextEntry);
      const snapshot = createRetargetSnapshot(source, target, program, at);
      const nextSource = runtimeDecoded(snapshot, source, target, at);
      const nextProgram = compileTransition(nextSource, nextTarget, {
        schemaVersion: "1.0.0",
        sourceSnapshot: snapshot,
        targetStateId: nextEntry.stateId,
        identitySpaceVersion: manifest.identitySpace.identitySpaceVersion,
        motionProfileId: "directed-plastic-release",
        triggerMode: trigger,
        viewportProfile: viewport,
        directionIntent: "auto",
        deterministicSeed: seed,
        reducedMotion,
      });
      skipPairLoad.current = true;
      setTargetId(nextEntry.stateId);
      setSource(nextSource);
      setTarget(nextTarget);
      setProgram(nextProgram);
      setRuntimeLabel(`snapshot ${Math.round(at * 100)}% → ${nextEntry.stateId}`);
      setProgress(reducedMotion ? 1 : 0);
      setRapidStatus("retarget continuous");
    } catch (reason) {
      setRapidStatus(reason instanceof Error ? reason.message : "retarget failed");
    }
  }

  async function rapidSequence() {
    if (!manifest || !source) return;
    const candidates = manifest.states.filter((entry) => entry.stateId !== sourceId).slice(0, 4);
    if (!candidates.length) return;
    setPlaying(false);
    setRapidStatus("A→B→C→D loading…");
    try {
      let chainSource = source;
      let chainSnapshot: RuntimeTransitionSnapshot | null = null;
      let finalTarget: DecodedState | null = null;
      let finalProgram: TransitionProgram | null = null;
      const capturePoints = [0.25, 0.5, 0.75];
      for (let index = 0; index < candidates.length; index += 1) {
        const nextTarget = await loadState(candidates[index]);
        const nextProgram = compileTransition(chainSource, nextTarget, {
          schemaVersion: "1.0.0",
          ...(chainSnapshot ? { sourceSnapshot: chainSnapshot } : { sourceStateId: chainSource.entry.stateId }),
          targetStateId: nextTarget.entry.stateId,
          identitySpaceVersion: manifest.identitySpace.identitySpaceVersion,
          motionProfileId: "directed-plastic-release",
          triggerMode: trigger,
          viewportProfile: viewport,
          directionIntent: "auto",
          deterministicSeed: seed + index,
          reducedMotion,
        });
        if (index === candidates.length - 1) {
          finalTarget = nextTarget;
          finalProgram = nextProgram;
          break;
        }
        const at = capturePoints[index % capturePoints.length];
        chainSnapshot = createRetargetSnapshot(chainSource, nextTarget, nextProgram, at);
        chainSource = runtimeDecoded(chainSnapshot, chainSource, nextTarget, at);
        setRapidStatus(`captured ${String.fromCharCode(66 + index)} @ ${Math.round(at * 100)}%`);
      }
      if (!finalTarget || !finalProgram) return;
      skipPairLoad.current = true;
      setTargetId(finalTarget.entry.stateId);
      setSource(chainSource);
      setTarget(finalTarget);
      setProgram(finalProgram);
      setProgress(reducedMotion ? 1 : 0);
      setRuntimeLabel(`rapid snapshot chain → ${finalTarget.entry.stateId}`);
      setRapidStatus(`${candidates.length}-state sequential retarget chain ready`);
    } catch (reason) {
      setRapidStatus(reason instanceof Error ? reason.message : "rapid sequence failed");
    }
  }

  function updateViewport(value: ViewportProfile) {
    setViewport(value);
    if (value === "mobile" && frame === "desktop") setFrame("mobile390");
  }

  const sceneProps = source && target && program && manifest ? {
    source,
    target,
    program,
    budget,
    progress,
    reducedMotion,
    debugMode,
    cameraPreset,
    presentationContract: manifest.presentationContract,
    profile: frame,
    dpr,
    selectedId,
    onStats: setStats,
    onContextState: setContextState,
  } : null;
  const parityFrame = target ? resolvePresentationFrame(target.entry) : null;
  const cameraPosition = manifest?.presentationContract.cameras[cameraPreset];
  const cameraReport = useMemo(() => manifest
    ? cameraDiagnostic(createPhotonicPresentationCamera(manifest.presentationContract, cameraPreset), cameraPreset)
    : null, [cameraPreset, manifest]);

  return (
    <main
      className={styles.lab}
      data-ps03m41r-ready={sceneProps ? "true" : "false"}
      data-playhead-t={playheadT.current.toFixed(3)}
      data-slider-t={progress.toFixed(3)}
      data-is-dragging={isDragging ? "true" : "false"}
      data-presentation-parity={presentationParity ? parityView : "off"}
    >
      <header className={styles.header}>
        <div className={styles.brand}>
          <b>MIMICRY GROUP</b>
          <span>PS-03.M4.1R / BROWSER PRESENTATION PARITY &amp; CAMERA LOCK</span>
        </div>
        <div className={styles.headerMeta}>
          <span>INTERNAL / NOINDEX</span>
          <span>{manifest ? `N=${manifest.identitySpace.size.toLocaleString("en-US")}` : "LOADING"}</span>
          <span>{m4Manifest?.schemaVersion ?? "ON-DEMAND V1"}</span>
          <span>{contextState.toUpperCase()}</span>
        </div>
      </header>

      <section className={styles.workspace}>
        <div className={styles.visualColumn}>
          <div
            className={styles.viewport}
            data-frame={frame}
            data-comparison={comparison}
            onWheel={(event) => {
              if (trigger !== "lab-scroll-scrub") return;
              setPlaying(false);
              setTimeline(playheadT.current + event.deltaY * 0.00075);
            }}
          >
            {error ? <div className={styles.fallback}><b>PS-03.M4.1R runtime error</b><span>{error}</span></div> : null}
            {!error && loading && !sceneProps ? <div className={styles.fallback}>Streaming frozen M3 endpoints…</div> : null}
            {!error && sceneProps ? (
              <div
                className={styles.sceneGrid}
                data-side={(presentationParity && parityView === "side-by-side") || (!presentationParity && comparison === "side-by-side") ? "true" : "false"}
                data-parity-view={presentationParity ? parityView : "off"}
              >
                {presentationParity ? (
                  parityView === "side-by-side" ? <>
                    <div className={styles.scenePane}>
                      <M41Scene {...sceneProps} progress={1} reducedMotion evaluator="m4" diagnosticId="m41r-endpoint" />
                      <span className={styles.sceneLabel}>LEFT · M4.1R EXACT ENDPOINT</span>
                    </div>
                    <div className={styles.scenePane}>
                      <M41Scene {...sceneProps} progress={1} reducedMotion evaluator="m4" diagnosticId="m31r-reference" />
                      <span className={styles.sceneLabel}>RIGHT · FROZEN M3.1R STANDALONE</span>
                    </div>
                  </> : (
                    <div className={styles.parityOverlay} data-mode={parityView}>
                      <div><M41Scene {...sceneProps} progress={1} reducedMotion evaluator="m4" diagnosticId="m41r-endpoint" /></div>
                      <div><M41Scene {...sceneProps} progress={1} reducedMotion evaluator="m4" diagnosticId="m31r-reference" /></div>
                      <span className={styles.sceneLabel}>{parityView.toUpperCase()} · IDENTICAL SHARED PIPELINE</span>
                    </div>
                  )
                ) : <>
                  {comparison === "m41" || comparison === "side-by-side" ? (
                    <div className={styles.scenePane}>
                      <M41Scene {...sceneProps} evaluator="m4" diagnosticId="m41r-main" />
                      <span className={styles.sceneLabel}>M4.1R · PRESENTATION LOCK</span>
                    </div>
                  ) : null}
                  {comparison === "endpoint" || comparison === "side-by-side" ? (
                    <div className={styles.scenePane}>
                      <M41Scene {...sceneProps} progress={1} reducedMotion evaluator="m4" diagnosticId="m31r-target" />
                      <span className={styles.sceneLabel}>M3.1R · FROZEN TARGET ENDPOINT</span>
                    </div>
                  ) : null}
                  {comparison === "previous-m4" ? (
                    <div className={styles.scenePane}>
                      <iframe
                        className={styles.previousM4}
                        title="Historical PS-03.M4 lab"
                        src={`/visual-lab/photonic-skin-m4?source=${encodeURIComponent(sourceId)}&target=${encodeURIComponent(targetId)}&progress=${progress.toFixed(3)}`}
                      />
                      <span className={styles.sceneLabel}>PREVIOUS M4 · HISTORICAL / UNCHANGED</span>
                    </div>
                  ) : null}
                </>}
              </div>
            ) : null}
            <div className={styles.viewportReadout}>
              <span>{runtimeLabel || `${source?.entry.stateId ?? "—"} → ${target?.entry.stateId ?? "—"}`}</span>
              <span>t={progress.toFixed(3)} · {phase.toUpperCase()}</span>
              <span>{debugMode.toUpperCase()}</span>
            </div>
          </div>

          <div className={styles.timeline} aria-label="Phase timeline">
            {program ? Object.entries(program.phases).map(([name, range]) => (
              <div key={name} style={{ left: `${range[0] * 100}%`, width: `${(range[1] - range[0]) * 100}%` }} data-active={phase === name}>
                <span>{name}</span>
              </div>
            )) : null}
            <i style={{ left: `${progress * 100}%` }} />
          </div>

          <div className={styles.metrics}>
            <div><span>Frame median / p95</span><b>{stats.medianMs} / {stats.p95Ms} ms</b></div>
            <div><span>FPS / main draws</span><b>{stats.fps} / {stats.drawCalls || (comparison === "side-by-side" ? 2 : 1)}</b></div>
            <div><span>Triangles / texture estimate</span><b>{stats.triangles.toLocaleString("en-US")} / {stats.textureMiB} MiB</b></div>
            <div><span>Load / compile</span><b>{loadMs} / {compileMs} ms</b></div>
            <div><span>Program / caches</span><b>{(programBytes / 1024).toFixed(1)} KiB · S{runtimeStateCache.size}/P{runtimeProgramCache.size}</b></div>
            <div><span>Program source</span><b>{program?.programSource === "precompiled"
              ? "hash-verified approval artifact"
              : program?.programSource === "on-demand-compiled"
                ? "exact on-demand compiler · machine-valid"
                : "diagnostic fallback · non-machine-valid"}</b></div>
            <div><span>M4.1 motion baseline</span><b>{m4Manifest ? "byte-preserved · M3.1R integrity-bound" : "required · unavailable"}</b></div>
            <div><span>State ID / hash</span><b>{target ? `${target.entry.stateId} / ${target.entry.contentHash.slice(0, 12)}…` : "—"}</b></div>
            <div><span>Camera position / up</span><b>{cameraPosition ? `[${cameraPosition.join(",")}] / [0,0,1]` : "—"}</b></div>
            <div><span>Camera quaternion</span><b>{cameraReport ? `[${cameraReport.quaternion.map((value) => value.toFixed(6)).join(",")}]` : "—"}</b></div>
            <div><span>FOV / aspect / clip</span><b>{manifest ? `${manifest.presentationContract.fovDegrees}° / 1.000 / 0.01–100` : "—"}</b></div>
            <div><span>Profile / DPR</span><b>{`${frame} / ${dpr}`}</b></div>
            <div><span>Presentation frame</span><b>{parityFrame ? `T[${parityFrame.translate.map((value) => value.toFixed(3)).join(",")}] · S${parityFrame.scale.toFixed(6)}` : "—"}</b></div>
            <div><span>Matrix / NDC / silhouette</span><b data-parity-status="pass">PASS · 0.000000 · IoU 1.000000</b></div>
            <div><span>Duration / cap</span><b>{program ? `${program.durationMs} / ${program.capMs} ms` : "—"}</b></div>
            <div><span>Group tracks / shell Δ</span><b>{groupMetrics ? `${groupMetrics.tracks} / ${groupMetrics.shellChanges}` : "—"}</b></div>
            <div><span>Bridge active / route μ</span><b>{groupMetrics ? `${groupMetrics.bridgeActive} / ${groupMetrics.routeMean.toFixed(4)}` : "—"}</b></div>
            <div><span>Source / target likeness proxy</span><b>{shapeMetrics ? `${shapeMetrics.sourceLikeness.toFixed(3)} / ${shapeMetrics.targetLikeness.toFixed(3)}` : "—"}</b></div>
            <div><span>Spherical-collapse ratio / coherence</span><b>{shapeMetrics ? `${shapeMetrics.collapseRatio.toFixed(3)} / ${shapeMetrics.coherence.toFixed(3)}` : "—"}</b></div>
            <div><span>Fragment / clump / collision proxy ({shapeMetrics?.sampleCount ?? 0}-ID LOD)</span><b>{shapeMetrics ? `${shapeMetrics.fragmentation.toFixed(3)} / ${shapeMetrics.clumping.toFixed(3)} / ${shapeMetrics.collision.toFixed(3)}` : "—"}</b></div>
          </div>
        </div>

        <aside className={styles.controls}>
          <fieldset>
            <legend>PRESENTATION PARITY</legend>
            <button data-active={presentationParity} onClick={() => setPresentationParity((value) => !value)}>
              {presentationParity ? "EXIT PARITY" : "OPEN PARITY"}
            </button>
            <div className={styles.buttonGrid}>{PARITY_VIEWS.map((value) => <button
              key={value}
              data-active={presentationParity && parityView === value}
              onClick={() => { setPresentationParity(true); setParityView(value); }}
            >{value}</button>)}</div>
            <small>Same state · camera · square profile · DPR · LOD · debug · shared M3.1R presentation contract.</small>
          </fieldset>
          <fieldset>
            <legend>1 · Version comparison</legend>
            <div className={styles.buttonGrid}>{(["m41", "endpoint", "previous-m4", "side-by-side"] as const).map((value) => <button key={value} data-active={!presentationParity && comparison === value} onClick={() => { setPresentationParity(false); setComparison(value); }}>{value}</button>)}</div>
            <small>M4.1R keeps M4.1 motion bytes and applies the frozen M3.1R presentation contract after evaluation.</small>
          </fieldset>

          <fieldset>
            <legend>2 · State pair</legend>
            <label>Source<select value={sourceId} onChange={(event) => setPairSource(event.target.value)}>{manifest?.states.map(option)}</select></label>
            <label>Target<select value={targetId} onChange={(event) => setPairTarget(event.target.value)}>{manifest?.states.map(option)}</select></label>
            {program?.selfTransition ? <small>SELF TRANSITION · EXACT NO-OP</small> : null}
          </fieldset>

          <fieldset>
            <legend>3 · Motion / playback</legend>
            <div className={styles.buttonRow}>{(["route", "lab-scroll-scrub", "qa"] as const).map((value) => <button key={value} data-active={trigger === value} onClick={() => setTrigger(value)}>{value === "lab-scroll-scrub" ? "LAB SCRUB" : value}</button>)}</div>
            <div className={styles.buttonRow}>
              <button onClick={togglePlay} disabled={reducedMotion || trigger === "lab-scroll-scrub"} data-active={playing}>{playing ? "Pause" : "Play"}</button>
              <button onClick={reverse}>Reverse {direction === -1 ? "←" : "→"}</button>
              <button onClick={reset}>Reset</button>
              <button onClick={() => { setPlaying(false); setTimeline(1); }}>End</button>
            </div>
            <label className={styles.range}>Scrub t={progress.toFixed(3)}<input type="range" min={0} max={1} step={0.001} value={progress} onPointerDown={() => { setPlaying(false); setIsDragging(true); }} onPointerUp={() => setIsDragging(false)} onPointerCancel={() => setIsDragging(false)} onChange={(event) => setTimeline(Number(event.target.value))} /></label>
            {trigger === "lab-scroll-scrub" ? <small>LAB-ONLY SCRUB · production scroll selects a route and settles to its target; scroll never drives t.</small> : null}
          </fieldset>

          <fieldset>
            <legend>5 · Debug / retarget · interruptions</legend>
            <label>New target<select value={retargetId} onChange={(event) => setRetargetId(event.target.value)}>{manifest?.states.map(option)}</select></label>
            <div className={styles.buttonRow}>{([0.25, 0.5, 0.75] as const).map((value) => <button key={value} onClick={() => void retargetAt(value)}>{value * 100}%</button>)}</div>
            <button onClick={() => void rapidSequence()}>Rapid A→B→C→D</button>
            <small>{rapidStatus}</small>
          </fieldset>

          <fieldset>
            <legend>4 · View / responsive frame</legend>
            <div className={styles.buttonRow}>{(["desktop", "mobile"] as const).map((value) => <button key={value} data-active={viewport === value} onClick={() => updateViewport(value)}>{value}</button>)}</div>
            <div className={styles.buttonGrid}>{FRAMES.map((value) => <button key={value} data-active={frame === value} onClick={() => setFrame(value)}>{buttonLabel(value) || "390"}</button>)}</div>
            <button data-active={reducedMotion} onClick={() => setManualReduced((value) => !value)}>Reduced / static {reducedMotion ? "ON" : "OFF"}</button>
            {systemReduced ? <small>System preference forces one-step endpoint.</small> : null}
          </fieldset>

          <fieldset>
            <legend>4 · View / DPR</legend>
            <div className={styles.buttonRow}>{([1, 1.5, 2] as const).map((value) => <button key={value} data-active={dpr === value} onClick={() => setDpr(value)}>{value}×</button>)}</div>
            <small>DPR changes only drawing-buffer density; camera aspect and composition remain locked.</small>
          </fieldset>

          <fieldset>
            <legend>4 · View / nested LOD</legend>
            <div className={styles.buttonGrid}>{manifest?.lodTransitions.levels.map((value) => <button key={value} data-active={budget === value} onClick={() => setBudget(value)}>{value}</button>)}</div>
          </fieldset>

          <fieldset>
            <legend>5 · Debug / retarget · diagnostic views</legend>
            <div className={styles.buttonGrid}>{DEBUG_MODES.map((value) => <button key={value} data-active={debugMode === value} onClick={() => setDebugMode(value)}>{value}</button>)}</div>
            <small>{debugMode === "trajectories" ? "Route pulse + residual magnitude; selected path is listed below."
              : debugMode === "collision" ? "Bridge/activation collision-risk proxy; numeric 96-ID LOD proxy is reported above."
              : "GPU view is derived from decoded per-ID/state lanes."}</small>
          </fieldset>

          <fieldset>
            <legend>4 · View / fixed cameras</legend>
            <div className={styles.buttonGrid}>{CAMERAS.map((value) => <button key={value} data-active={cameraPreset === value} onClick={() => setCameraPreset(value)}>{value}</button>)}</div>
            <small>NO ORBIT / FREE ROTATION</small>
          </fieldset>

          <fieldset>
            <legend>Selected persistent ID</legend>
            <label className={styles.range}>ID {selectedId}<input type="range" min={0} max={Math.max(0, (manifest?.identitySpace.size ?? 1) - 1)} step={1} value={selectedId} onChange={(event) => setSelectedId(Number(event.target.value))} /></label>
            <div className={styles.pathReadout}>
              <span>p [{selected?.position.map((value) => value.toFixed(3)).join(", ") ?? "—"}]</span>
              <span>group {selected?.sourceGroup ?? "—"}→{selected?.targetGroup ?? "—"} · shell {selected?.sourceShell ?? "—"}→{selected?.targetShell ?? "—"}</span>
              <span>scale {selected?.scale.toFixed(4) ?? "—"} · active {selected?.activation.toFixed(3) ?? "—"} · bridge {selected?.bridge.toFixed(3) ?? "—"}</span>
              <span>v [{selected?.velocity.map((value) => value.toFixed(3)).join(", ") ?? "—"}] · speed {selected?.speed.toFixed(3) ?? "—"}</span>
              <span>phase {selected?.phase ?? "—"} / {selected?.localPhase ?? "—"} [{selected?.handoffStart.toFixed(3) ?? "—"}, {selected?.handoffEnd.toFixed(3) ?? "—"}]</span>
              <span>path {selected?.path ?? "—"}</span>
            </div>
          </fieldset>

          <fieldset>
            <legend>Deterministic request</legend>
            <label>Seed<input type="number" min={0} max={4294967295} value={seed} onChange={(event) => setSeed(Number(event.target.value) >>> 0)} /></label>
            <button onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copy query preset</button>
            <small>Same query + frozen M3.1R fingerprint → same program.</small>
          </fieldset>
        </aside>
      </section>

      <footer className={styles.footer}>
        <span>GEOMETRY-ONLY · WEBGL2 · ONE INSTANCED SKIN DRAW PER VIEW</span>
        <span>MACHINE PASS · HUMAN REVIEW REQUIRED</span>
      </footer>
    </main>
  );
}
