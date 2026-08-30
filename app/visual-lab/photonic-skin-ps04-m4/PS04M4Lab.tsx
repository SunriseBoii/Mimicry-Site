"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CompetenceId } from "../../_brand/color-system";
import type { M3Manifest } from "../photonic-skin-m4-1/m41-data";
import { loadRuntimeManifests, type M41Manifest } from "../photonic-skin-m4-1/m41-data";
import { MATERIAL_THEME_PRESETS, defaultM2MaterialController, type MaterialTheme } from "../photonic-skin-ps04-m3/material-foundation";
import { compileLiveRetarget, viewportForFrame } from "../photonic-skin-ps04-m3/runtime";
import { PhotonicMotionSession, type SessionSnapshot } from "../photonic-skin-ps04-m3/session";
import { PS04M4Scene, type SceneEnvironment, type SceneStats } from "./PS04M4Scene";
import { indexStates, requestFromContract, type ActorRequest } from "./actor-resolver";
import { resolveScreenActorContract, type ScreenActorContract } from "./screen-actor-contract";
import {
  CONTACT_SIMULATED_DELAY_MS,
  INITIAL_BUILD_FLOW,
  closeOverlay,
  confirmCompetencies,
  editBrief,
  openContact,
  selectTask,
  setCompetencies,
  simulateSuccess,
  toggleCompetence,
  validateContact,
  type BuildFlowState,
  type TaskId,
} from "./build-flow";
import {
  actorSquareCss,
  envelopeOverflow,
  sampleComposition,
  siteEnvelopeCss,
  targetForNode,
  viewportFromCenter,
  type CompositionViewport,
} from "./composition";
import { ContactDialog, SuccessStatus } from "./components/ContactDialog";
import { PersistentHeader } from "./components/PersistentHeader";
import { ProgressGraph } from "./components/ProgressGraph";
import {
  AboutScreen,
  BuildChapter,
  CasesScreen,
  CompetenceChapter,
  ContactScreen,
  FooterScreen,
  HeroScreen,
  StudioChapter,
} from "./components/ScreenFixtures";
import { nextUnlocked, previousUnlocked, ScrollCompositionController, SELECTED_MAGNETISM_VARIANT, type MagnetismSnapshot, type ScrollProgress } from "./scroll-controller";
import { SCREEN_NODE_BY_ID, type ScreenNodeId } from "./topology";
import { ActorTransitionCoordinator, interceptGeometryLinkedProgress, semanticActorKey, type DisplayedPlacement, type ActorTransitionTransaction } from "./transition-coordinator";
import { GeometryIdTrace, traceFromTransaction } from "./geometry-id-trace";
import { NaturalRafRecorder } from "./natural-raf-recorder";
import { CONTINUITY_FLOOR, DEFAULT_CONTINUITY_LIFT_ENABLED } from "./continuity-overlay";
import { commitDriverToMask, type PaletteMaterialSnapshot } from "./palette-authority";
import {
  EMPTY_GEOMETRY_ACK,
  selectProgramSourceMode,
  type GeometryMaterialSnapshot,
  type GeometryProgramBind,
  type GeometryRenderAck,
} from "./geometry-authority";
import { NavigationDirector } from "./navigation-token";
import { TransitionProgramCache } from "./transition-prewarm";
import type { TransitionUniforms } from "./PS04M4Scene";
import styles from "./ps04m4.module.css";

const EMPTY_STATS: SceneStats = {
  fps: 0, medianMs: 0, p95Ms: 0, drawCalls: 0, triangles: 0, textureMiB: 0,
  programs: 0, geometries: 0, textures: 0, dpr: 0, drawingBuffer: [0, 0],
  lastActorDrawCalls: 0, lastActorTriangles: 0, newFrame: false,
  materialUuid: "", compileCount: 0,
};

function labQuery() {
  return new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
}

function parseLabDpr(query: URLSearchParams) {
  const raw = Number(query.get("dpr"));
  if (raw === 1 || raw === 1.25 || raw === 1.5 || raw === 2) return raw;
  if (typeof window !== "undefined") return window.devicePixelRatio || 1;
  return 1;
}

function bootstrapReducedMotion() {
  return (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    || labQuery().get("reduced") === "1";
}

export function PS04M4Lab({ mode }: { mode: "lab" | "preview" }) {
  const query = labQuery();
  const identity = query.get("identity") === "1";
  const actorMask = query.get("actorMask") === "1";
  const hideUi = actorMask || query.get("ui") === "0";
  const continuityLift = query.get("continuityLift") === "1" || DEFAULT_CONTINUITY_LIFT_ENABLED;
  const reproduceR4Geometry = query.get("reproduceR4Geometry") === "1";
  const [theme, setTheme] = useState<MaterialTheme>(query.get("theme") === "dark" ? "dark" : "light");
  const [dpr, setDpr] = useState(() => parseLabDpr(query));
  const [manualReduced, setManualReduced] = useState(query.get("reduced") === "1");
  const [hud, setHud] = useState(mode === "lab" && query.get("hud") !== "0");
  const [stats, setStats] = useState<SceneStats>(EMPTY_STATS);
  const [environment, setEnvironment] = useState<SceneEnvironment | null>(null);
  const [contextState, setContextState] = useState<"ready" | "lost" | "restored">("ready");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [contactErrors, setContactErrors] = useState<ReturnType<typeof validateContact>>({});
  const [manifest, setManifest] = useState<M3Manifest | null>(null);
  const [motionManifest, setMotionManifest] = useState<M41Manifest | null>(null);
  const [flow, setFlow] = useState<BuildFlowState>(INITIAL_BUILD_FLOW);
  const [activeNode, setActiveNode] = useState<ScreenNodeId>("01");
  const [ui, setUi] = useState<SessionSnapshot | null>(null);
  const [txUi, setTxUi] = useState<ActorTransitionTransaction | null>(null);
  const systemReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reducedMotion = systemReduced || manualReduced;
  const applyLinkedPaletteRef = useRef<(progress: number) => void>(() => undefined);
  const session = useMemo(() => new PhotonicMotionSession({
    reducedMotion: bootstrapReducedMotion(),
    overlayMode: "m3-combined",
    profile: "desktop",
  }), []);
  useLayoutEffect(() => {
    applyLinkedPaletteRef.current = interceptGeometryLinkedProgress(session.palette);
  }, [session]);
  const controller = useMemo(() => new ScrollCompositionController(), []);
  useEffect(() => {
    const requested = labQuery().get("magnetism");
    if (requested === "a" || requested === "b" || requested === "c") {
      controller.setMagnetismVariant(requested);
    } else {
      controller.setMagnetismVariant(SELECTED_MAGNETISM_VARIANT);
    }
  }, [controller]);
  const [contract, setContract] = useState<ScreenActorContract | null>(null);
  const sessionId = "ps04-m4-r5";
  const progressRef = useRef<ScrollProgress>(controller.getProgress());
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const compositionRef = useRef<CompositionViewport>(viewportFromCenter({
    width: 1440, height: 900, dpr, centerX: 1100, centerY: 480, size: 460, visible: true, identity,
  }));
  const visualRef = useRef({ x: 1100, y: 480, size: 460, visible: true, exitHold: 0, siteFit: 1 });
  const clockRef = useRef({ running: false, frame: 0, previous: 0, token: 0, lastUi: 0 });
  const sendButtonRef = useRef<HTMLElement | null>(null);
  const flowRef = useRef(flow);
  const stateIndex = useMemo(() => manifest ? indexStates(manifest.states) : null, [manifest]);
  const stateIndexRef = useRef(stateIndex);
  const requestActorRef = useRef<(next: ScreenActorContract) => void>(() => undefined);
  const requestKeyRef = useRef("");
  const contractRef = useRef<ScreenActorContract | null>(null);
  const dprRef = useRef(dpr);
  const identityRef = useRef(identity);
  const reducedRef = useRef(reducedMotion);
  const coordinatorRef = useRef(new ActorTransitionCoordinator());
  const traceRef = useRef(new GeometryIdTrace());
  const perfRef = useRef(new NaturalRafRecorder());
  const transitionRef = useRef<TransitionUniforms>({
    paletteOwnershipMode: 0,
    continuityEnabled: 0,
    continuityFloor: CONTINUITY_FLOOR,
    identity,
  });
  const paletteSnapshotRef = useRef<PaletteMaterialSnapshot | null>(null);
  const geometrySnapshotRef = useRef<GeometryMaterialSnapshot | null>(null);
  const programBindRef = useRef<GeometryProgramBind | null>(null);
  const geometryAckRef = useRef<GeometryRenderAck>({ ...EMPTY_GEOMETRY_ACK });
  const navigationRef = useRef(new NavigationDirector());
  const programCacheRef = useRef(new TransitionProgramCache());
  const lastSettledRevisionRef = useRef(0);
  const lastFrameTokenRef = useRef(-1);
  const continuityLiftRef = useRef(continuityLift);
  const reproduceR4GeometryRef = useRef(reproduceR4Geometry);
  const geometryLogRef = useRef<{ recording: boolean; frames: Array<Record<string, unknown>> }>({ recording: false, frames: [] });

  const startClock = useCallback(() => {
    const clock = clockRef.current;
    if (clock.running) return;
    clock.running = true;
    clock.previous = performance.now();
    const loop = (now: number) => {
      const hidden = document.visibilityState === "hidden";
      session.setHidden(hidden);
      const dtRaw = (now - clock.previous) / 1000;
      clock.previous = now;
      const offscreen = session.snapshot().offscreen;
      const coordinator = coordinatorRef.current;
      if (!hidden && !offscreen) {
        const token = ++clock.token;
        const gated = coordinator.noteSessionTick(token);
        if (gated.accepted) {
          const t0 = performance.now();
          session.tick(dtRaw, token);
          perfRef.current.noteTickMs(performance.now() - t0);
        }
      }
      const dt = Math.min(Math.max(dtRaw, 0), 0.1);
      const sessionSnap = session.snapshot();
      coordinator.syncFromSession({
        geometryProgress: sessionSnap.geometryProgress,
        phase: sessionSnap.phaseAdapter,
        sessionTime: sessionSnap.sessionTime,
        programId: session.getProgram()?.programId ?? null,
        reducedMotion: reducedRef.current,
        identity: identityRef.current,
        sessionStatus: sessionSnap.status,
        geometryPlaying: sessionSnap.status === "transitioning" && sessionSnap.geometryProgress < 1,
      });
      const tx = coordinator.snapshot();
      if (tx.status === "running" && (tx.kind === "geometry" || tx.kind === "palette-only")) {
        applyLinkedPaletteRef.current(tx.paletteProgress);
      }
      if (tx.status === "settled" && tx.paletteCommitted && tx.revision !== lastSettledRevisionRef.current) {
        commitDriverToMask(session.palette, tx.targetPaletteMask);
        lastSettledRevisionRef.current = tx.revision;
      }
      paletteSnapshotRef.current = coordinator.materialSnapshot(session.palette.snapshot().phase);
      const ack = geometryAckRef.current;
      const packet = programBindRef.current;
      const drawnCurrentPacket = Boolean(packet && ack.drawnRevision === packet.revision && ack.drawnProgramId === packet.program.programId);
      if (packet && (packet.bindCommitted || drawnCurrentPacket)) {
        packet.bindCommitted = true;
        packet.bindFrameToken = packet.bindFrameToken ?? ack.frameToken;
        coordinator.markDisplayedBind({
          revision: packet.revision,
          programId: packet.program.programId,
          sourceGeometryId: packet.source.entry.stateId,
          targetGeometryId: packet.target.entry.stateId,
          frameToken: packet.bindFrameToken ?? ack.frameToken,
          nowMs: now,
        });
        coordinator.acknowledgeRender(ack);
        if (session.snapshot().status === "transitioning" && session.snapshot().geometryProgress < 1) {
          session.playGeometry(true);
        }
      } else if (ack.frameToken) {
        coordinator.acknowledgeRender(ack);
      }
      geometrySnapshotRef.current = coordinator.geometrySnapshot();
      const progress = controller.getProgress();
      progressRef.current = progress;
      const host = canvasHostRef.current;
      const size = { width: host?.clientWidth || window.innerWidth, height: host?.clientHeight || window.innerHeight };
      const committedNode = controller.committedActorNodeId();
      const index = stateIndexRef.current;
      const flowNow = flowRef.current;
      const flowArgs = {
        taskId: flowNow.taskId,
        taskSelected: Boolean(flowNow.taskId),
        competencies: flowNow.competencies,
        competenciesConfirmed: flowNow.competenciesConfirmed,
        settledStateId: sessionSnap.settledStateId,
      };
      const hudContract = index
        ? resolveScreenActorContract({
          nodeId: committedNode,
          overlay: flowNow.overlay,
          index,
          flow: flowArgs,
        })
        : null;
      if (hudContract) contractRef.current = hudContract;
      const modeSnap = controller.getModeSnapshot();
      const displayedNode = (coordinator.snapshot().targetNodeId === "none"
        ? progress.activeNodeId
        : coordinator.snapshot().targetNodeId) as ScreenNodeId;
      const observed = navigationRef.current.observe({
        nowMs: now,
        rawObservedNodeId: progress.activeNodeId,
        committedNodeId: committedNode,
        magneticCandidateId: modeSnap.magneticCandidateId,
        mode: modeSnap.mode,
        fastGesture: modeSnap.fastGesture,
        displayedNodeId: displayedNode,
        inputIdle: modeSnap.mode === "idle",
      });
      const reverseOfRunning = tx.status === "running"
        && tx.kind === "geometry"
        && observed.token.targetNodeId === tx.sourceNodeId;
      if (index && observed.shouldRequestActor && !reverseOfRunning) {
        const actorContract = resolveScreenActorContract({
          nodeId: observed.token.targetNodeId,
          overlay: flowNow.overlay,
          index,
          flow: flowArgs,
        });
        const semantic = semanticActorKey(actorContract).serialized;
        if (semantic !== requestKeyRef.current) {
          requestKeyRef.current = semantic;
          navigationRef.current.commitActorTarget(observed.token.targetNodeId, observed.token.origin);
          requestActorRef.current(actorContract);
          setContract(actorContract);
        }
      }
      const liveDpr = dprRef.current;
      const liveIdentity = identityRef.current;
      const liveReduced = reducedRef.current;
      const target = targetForNode(progress.activeNodeId);
      const sourceSample = sampleComposition({
        width: size.width,
        height: size.height,
        dpr: liveDpr,
        placement: tx.sourceSlot === "none" ? "exit" : tx.sourceSlot,
        exitProgress: tx.sourceSlot === "none" ? 1 : 0,
        reducedMotion: liveReduced,
        identity: liveIdentity,
        fitProfile: tx.sourceFitProfile,
      });
      const targetSample = sampleComposition({
        width: size.width,
        height: size.height,
        dpr: liveDpr,
        placement: tx.targetSlot === "none" ? "exit" : tx.targetSlot,
        exitProgress: tx.targetSlot === "none" ? 1 : 0,
        reducedMotion: liveReduced,
        identity: liveIdentity,
        fitProfile: tx.targetFitProfile,
      });
      const siteU = liveReduced || liveIdentity ? 1 : tx.siteProgress;
      const mixedX = sourceSample.cssCenterX + (targetSample.cssCenterX - sourceSample.cssCenterX) * siteU;
      const mixedY = sourceSample.cssCenterY + (targetSample.cssCenterY - sourceSample.cssCenterY) * siteU;
      const mixedSize = sourceSample.cssSize + (targetSample.cssSize - sourceSample.cssSize) * siteU;
      const mixedFit = tx.sourceFit + (tx.targetFit - tx.sourceFit) * siteU;
      visualRef.current.x = mixedX;
      visualRef.current.y = mixedY;
      visualRef.current.size = mixedSize;
      visualRef.current.siteFit = mixedFit;
      if (!target.visible) visualRef.current.exitHold = (visualRef.current.exitHold ?? 0) + dt;
      else visualRef.current.exitHold = 0;
      const distance = Math.hypot(targetSample.cssCenterX - visualRef.current.x, targetSample.cssCenterY - visualRef.current.y);
      const hide = !target.visible && (liveReduced || distance < 12 || visualRef.current.exitHold > 0.72);
      visualRef.current.visible = target.visible || !hide;
      compositionRef.current = viewportFromCenter({
        width: size.width,
        height: size.height,
        dpr: liveDpr,
        centerX: visualRef.current.x,
        centerY: visualRef.current.y,
        size: visualRef.current.size || actorSquareCss(size.width, size.height),
        visible: visualRef.current.visible,
        identity: liveIdentity,
        siteFitScale: liveIdentity ? 1 : visualRef.current.siteFit,
        slot: siteU >= 1 ? targetSample.slot : sourceSample.slot,
      });
      transitionRef.current = {
        paletteOwnershipMode: tx.paletteOwnershipMode,
        continuityEnabled: continuityLiftRef.current ? tx.continuityEnabled : 0,
        continuityFloor: CONTINUITY_FLOOR,
        identity: liveIdentity,
      };
      if (!visualRef.current.visible) session.setOffscreen(true);
      else if (sessionSnap.offscreen && target.visible) session.setOffscreen(false);
      if (tx.revision !== lastFrameTokenRef.current && tx.status === "running") {
        coordinator.noteFirstWebglChange(now);
        lastFrameTokenRef.current = tx.revision;
      }
      if (traceRef.current.recordingNow || geometryLogRef.current.recording) {
        const geoNow = coordinator.geometrySnapshot();
        const uniforms = window.__PS04M4_MATERIAL_UNIFORMS__ ?? null;
        const ack = geometryAckRef.current;
        const packetNow = programBindRef.current;
        const modeNow = controller.getModeSnapshot();
        if (traceRef.current.recordingNow) {
          traceRef.current.push(traceFromTransaction({
            frameToken: clock.token,
            timestamp: now,
            transaction: tx,
            activeNodeId: progress.activeNodeId,
            committedNodeId: committedNode,
            actorDraw: compositionRef.current.actorDraw,
            frameDeltaMs: dt * 1000,
          }));
        }
        if (geometryLogRef.current.recording) {
          geometryLogRef.current.frames.push({
            atMs: now,
            frameToken: clock.token,
            rawObservedNodeId: progress.activeNodeId,
            magneticCandidateId: modeNow.magneticCandidateId,
            committedNodeId: committedNode,
            navigationToken: navigationRef.current.lastToken(),
            actorRequestRevision: tx.revision,
            coordinatorStatus: tx.status,
            sessionStatus: sessionSnap.status,
            coordinatorGeometryProgress: tx.geometryProgress,
            sessionGeometryProgress: sessionSnap.geometryProgress,
            shaderProgress: uniforms?.geometryProgress ?? geoNow.shaderProgress,
            geometryStatus: geoNow.status,
            boundProgramId: uniforms?.boundProgramId ?? geoNow.boundProgramId,
            boundSourceGeometryId: uniforms?.boundSourceId ?? geoNow.boundSourceGeometryId,
            boundTargetGeometryId: uniforms?.boundTargetId ?? geoNow.boundTargetGeometryId,
            settledGeometryId: geoNow.settledGeometryId,
            materialUuid: uniforms?.materialUuid ?? null,
            textureIdentity: uniforms?.textureIdentity ?? null,
            prewarm: programCacheRef.current.stats.lastStatus,
            prewarmCount: programCacheRef.current.stats.prewarms,
            bindCommitted: packetNow?.bindCommitted ?? false,
            drawnProgress: ack.drawnProgress,
            drawnProgramId: ack.drawnProgramId,
          });
        }
      }
      if (now - clock.lastUi > 160 || clock.lastUi === 0) {
        setUi(sessionSnap);
        setTxUi(tx);
        clock.lastUi = now;
        perfRef.current.markReactCommit();
      }
      const siteMoving = siteU < 0.999 && visualRef.current.visible !== target.visible;
      const geoStatus = coordinator.geometrySnapshot().status;
      if ((session.shouldAnimate() && document.visibilityState !== "hidden") || siteMoving || (!target.visible && visualRef.current.visible) || tx.status === "running" || geoStatus === "waiting" || geometryLogRef.current.recording) {
        clock.frame = requestAnimationFrame(loop);
      } else {
        clock.running = false;
        setUi(session.snapshot());
      }
    };
    clock.frame = requestAnimationFrame(loop);
  }, [controller, session]);

  useEffect(() => session.subscribe(() => { startClock(); }), [session, startClock]);
  useEffect(() => {
    const clock = clockRef.current;
    const onVisibility = () => {
      session.setHidden(document.visibilityState === "hidden");
      clock.previous = performance.now();
      startClock();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const html = document.documentElement;
    const previousScrollBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";
    const detach = controller.attach(window);
    const unsub = controller.subscribeDiscrete((progress) => {
      progressRef.current = progress;
      setActiveNode(progress.activeNodeId);
      coordinatorRef.current.noteCommittedNode(controller.committedActorNodeId(), performance.now());
      startClock();
    });
    startClock();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(clock.frame);
      clock.running = false;
      unsub();
      detach();
      html.style.scrollBehavior = previousScrollBehavior;
    };
  }, [controller, session, startClock]);

  useEffect(() => { session.setReducedMotion(reducedMotion); controller.setReducedMotion(reducedMotion); }, [controller, reducedMotion, session]);
  useLayoutEffect(() => { controller.setUnlock(flow.unlock); }, [controller, flow.unlock]);
  useEffect(() => {
    controller.setMagnetismGuards({ dialogOpen: flow.overlay === "contact" });
  }, [controller, flow.overlay]);

  useEffect(() => {
    const controllerAbort = new AbortController();
    const cache = programCacheRef.current;
    loadRuntimeManifests(controllerAbort.signal).then(async ({ m3, m4 }) => {
      setManifest(m3);
      setMotionManifest(m4);
      stateIndexRef.current = indexStates(m3.states);
      const entry = m3.states.find((item) => item.stateId === "master-neutral") ?? m3.states[0];
      const state = await cache.loadState(entry);
      const program = await cache.getFrozen({
        source: state,
        target: state,
        manifest: m3,
        motion: m4,
        reducedMotion,
        signal: controllerAbort.signal,
      });
      session.bootstrapSettled(state, program);
      const bootContract = stateIndexRef.current
        ? resolveScreenActorContract({
          nodeId: "01",
          index: indexStates(m3.states),
          flow: {
            taskId: null,
            taskSelected: false,
            competencies: [],
            competenciesConfirmed: false,
            settledStateId: state.entry.stateId,
          },
        })
        : null;
      if (bootContract) {
        coordinatorRef.current.adoptSettled(bootContract, identity);
        geometrySnapshotRef.current = coordinatorRef.current.geometrySnapshot();
        navigationRef.current.commitActorTarget("01", "restore");
        requestKeyRef.current = semanticActorKey(bootContract).serialized;
        contractRef.current = bootContract;
        setContract(bootContract);
      }
      setLoading(false);
      startClock();
      cache.startRoutePrewarm({
        current: controller.committedActorNodeId(),
        manifest: m3,
        motion: m4,
        reducedMotion,
        hidden: () => session.snapshot().offscreen
          || document.visibilityState === "hidden"
          || coordinatorRef.current.snapshot().status === "running",
      });
      const node = labQuery().get("node");
      if (node && SCREEN_NODE_BY_ID[node as ScreenNodeId]) {
        controller.scrollToNode(node as ScreenNodeId, "auto", "restore");
      }
    }).catch((reason: Error) => {
      if (reason.name !== "AbortError") setError(reason.message);
      setLoading(false);
    });
    return () => {
      controllerAbort.abort();
      cache.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const requestActor = useCallback(async (next: ScreenActorContract) => {
    const coordinator = coordinatorRef.current;
    const live = coordinator.displayedPlacement();
    const displayedLut = coordinator.displayedLut();
    const displayed: DisplayedPlacement = {
      slot: live.slot,
      fit: visualRef.current.siteFit,
      fitProfile: live.fitProfile,
      paletteMask: live.paletteMask,
      paletteProgress: live.paletteProgress,
      geometryId: live.geometryId ?? session.snapshot().settledStateId,
      nodeId: live.nodeId,
      lutHash: live.lutHash,
    };
    const { decision, transaction } = coordinator.begin({
      next,
      displayed,
      displayedLut,
      nowSeconds: session.snapshot().sessionTime,
      reducedMotion,
      identity,
      nowMs: performance.now(),
      navigationToken: navigationRef.current.lastToken(),
    });
    if (decision.kind === "noop") return;
    setContract(next);
    if (!manifest) return;
    if (decision.kind === "exit") {
      startClock();
      return;
    }
    if (decision.kind === "palette-only") {
      session.palette.setMask(next.paletteMask, {
        mode: reducedMotion ? "immediate" : "free",
      });
      startClock();
      return;
    }
    if (decision.kind === "site-only") {
      startClock();
      return;
    }
    const request = requestFromContract(next);
    if (!request.stateId) return;
    const revision = session.beginRequest(request.stateId);
    if (!coordinator.isCurrent(transaction.revision)) return;
    const captured = session.captureJoint();
    try {
      const entry = manifest.states.find((item) => item.stateId === request.stateId);
      if (!entry) return;
      const cache = programCacheRef.current;
      const nextState = await cache.loadState(entry);
      if (!session.isCurrent(revision) || !coordinator.isCurrent(transaction.revision)) return;
      const currentTarget = session.getTarget();
      const currentSource = session.getSource();
      const geo = coordinator.geometrySnapshot();
      const sourceChoice = selectProgramSourceMode({
        shaderProgress: geo.shaderProgress,
        boundTargetGeometryId: geo.boundTargetGeometryId,
        boundSourceGeometryId: geo.boundSourceGeometryId,
        settledGeometryId: geo.settledGeometryId,
        sessionSourceId: currentSource?.entry.stateId ?? null,
        sessionTargetId: currentTarget?.entry.stateId ?? null,
        sessionProgress: captured.geometryProgress,
      });
      const stateForId = async (id: string | null) => {
        if (!id || id.startsWith("runtime-snapshot-")) return null;
        if (currentTarget?.entry.stateId === id) return currentTarget;
        if (currentSource?.entry.stateId === id) return currentSource;
        const found = manifest.states.find((item) => item.stateId === id);
        return found ? cache.loadState(found) : null;
      };
      const playImmediately = reproduceR4GeometryRef.current; // default play: false until Scene bind ack
      if (sourceChoice.mode === "frozen") {
        const sourceState = await stateForId(sourceChoice.sourceGeometryId);
        if (!sourceState) {
          startClock();
          return;
        }
        const program = await cache.getFrozen({
          source: sourceState,
          target: nextState,
          manifest,
          motion: motionManifest,
          reducedMotion,
        });
        if (!session.isCurrent(revision) || !coordinator.isCurrent(transaction.revision)) return;
        coordinator.markProgramReady(transaction.revision, program.programId, performance.now());
        programBindRef.current = {
          revision: transaction.revision,
          navigationToken: navigationRef.current.lastToken(),
          program,
          source: sourceState,
          target: nextState,
          bindCommitted: false,
          bindFrameToken: null,
          preparedAtMs: performance.now(),
        };
        session.commitTransition({ revision, source: sourceState, target: nextState, program, captured, play: playImmediately });
      } else if (currentSource && currentTarget) {
        const { liveSource, program } = compileLiveRetarget(captured, currentSource, nextState, manifest, {
          reducedMotion, trigger: "qa", viewport: viewportForFrame("desktop"),
        });
        if (!session.isCurrent(revision) || !coordinator.isCurrent(transaction.revision)) return;
        coordinator.markProgramReady(transaction.revision, program.programId, performance.now());
        programBindRef.current = {
          revision: transaction.revision,
          navigationToken: navigationRef.current.lastToken(),
          program,
          source: liveSource,
          target: nextState,
          bindCommitted: false,
          bindFrameToken: null,
          preparedAtMs: performance.now(),
        };
        session.commitTransition({ revision, source: liveSource, target: nextState, program, captured, play: playImmediately });
      }
      const after = session.palette.snapshot();
      if (after.palette.mask !== request.paletteMask) {
        session.palette.setMask(request.paletteMask, {
          mode: reducedMotion ? "immediate" : "geometry-linked",
        });
      }
      coordinator.syncFromSession({
        geometryProgress: session.snapshot().geometryProgress,
        phase: session.snapshot().phaseAdapter,
        sessionTime: session.snapshot().sessionTime,
        programId: session.getProgram()?.programId ?? null,
        reducedMotion,
        identity,
        sessionStatus: session.snapshot().status,
        geometryPlaying: session.snapshot().status === "transitioning" && session.snapshot().geometryProgress < 1,
      });
      startClock();
    } catch (reason) {
      if (session.isCurrent(revision)) setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [identity, manifest, motionManifest, reducedMotion, session, startClock]);

  const actorRequest: ActorRequest | null = contract ? requestFromContract(contract) : null;

  useLayoutEffect(() => {
    flowRef.current = flow;
    stateIndexRef.current = stateIndex;
    dprRef.current = dpr;
    identityRef.current = identity;
    reducedRef.current = reducedMotion;
    continuityLiftRef.current = continuityLift;
    reproduceR4GeometryRef.current = reproduceR4Geometry;
    requestActorRef.current = (next) => { void requestActor(next); };
    startClock();
  }, [dpr, flow, identity, reducedMotion, requestActor, startClock, stateIndex, continuityLift, reproduceR4Geometry]);

  const navigate = useCallback((id: ScreenNodeId) => controller.scrollToNode(id), [controller]);

  useEffect(() => {
    if (flow.overlay !== "success" || !flow.successVisibleUntil) return;
    const wait = Math.max(0, flow.successVisibleUntil - Date.now());
    const timer = window.setTimeout(() => setFlow(closeOverlay), wait);
    return () => window.clearTimeout(timer);
  }, [flow.overlay, flow.successVisibleUntil]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (flow.overlay) return;
      const target = event.target;
      if (target instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      const unlock = flow.unlock;
      if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        const next = nextUnlocked(activeNode, unlock);
        if (next) controller.scrollToNode(next);
      }
      if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        const previous = previousUnlocked(activeNode, unlock);
        if (previous) controller.scrollToNode(previous);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        const next = nextUnlocked(activeNode, unlock);
        if (next) controller.scrollToNode(next);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const previous = previousUnlocked(activeNode, unlock);
        if (previous) controller.scrollToNode(previous);
      }
      if (event.key === "Home") {
        event.preventDefault();
        controller.scrollToNode("01");
      }
      if (event.key === "End") {
        event.preventDefault();
        controller.scrollToNode("08");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeNode, controller, flow.overlay, flow.unlock]);

  const source = session.getSource();
  const target = session.getTarget();
  const program = session.getProgram();
  const material = useMemo(() => ({
    ...defaultM2MaterialController(theme, session.palette),
    reducedMotion,
  }), [reducedMotion, session.palette, theme]);
  useEffect(() => { if (!loading && stateIndex) startClock(); }, [loading, startClock, stateIndex]);

  const snapshot = ui ?? session.snapshot();

  const diagnostics = useCallback(() => {
    const composition = compositionRef.current;
    const current = contractRef.current;
    const measure = window.__PS04M4_MEASURE_ACTOR__?.() ?? null;
    return {
      activeNodeId: controller.getProgress().activeNodeId,
      requestedFamily: current?.requestedFamily ?? "none",
      resolvedGeometryId: current?.resolvedGeometryId ?? null,
      paletteMask: current?.paletteMask ?? 0,
      resolution: current?.resolution ?? "none",
      slot: current?.slot ?? "none",
      canvasCssSize: [composition.canvasCssWidth, composition.canvasCssHeight] as const,
      drawingBufferSize: [composition.drawingBufferWidth, composition.drawingBufferHeight] as const,
      rendererDpr: composition.rendererDpr,
      actorViewportCss: {
        left: composition.cssLeft,
        top: composition.cssTop,
        width: composition.cssWidth,
        height: composition.cssHeight,
      },
      actorViewportDevice: {
        x: composition.deviceX,
        y: composition.deviceY,
        width: composition.deviceWidth,
        height: composition.deviceHeight,
      },
      actorMaskBBoxCss: measure?.actorMaskBBoxCss ?? null,
      actorVisibleFraction: measure?.actorVisibleFraction ?? 0,
      actorCenterCss: [composition.cssCenterX, composition.cssCenterY] as const,
      siteFitScale: composition.siteFitScale,
      siteClipScale: composition.siteClipScale,
      siteClipOffset: composition.siteClipOffset,
      siteCompositionEnabled: composition.siteCompositionEnabled,
      siteEnvelopeCss: siteEnvelopeCss(composition),
      envelopeOverflow: measure?.actorMaskBBoxCss
        ? envelopeOverflow(measure.actorMaskBBoxCss, siteEnvelopeCss(composition))
        : null,
      magnetism: controller.getMagnetism(),
      sessionId,
      actorDraw: composition.actorDraw,
      revision: controller.getProgress().revision,
      transaction: coordinatorRef.current.snapshot(),
      committedNodeId: controller.committedActorNodeId(),
      palette: coordinatorRef.current.materialSnapshot(session.palette.snapshot().phase),
      geometry: coordinatorRef.current.geometrySnapshot(),
      renderAck: geometryAckRef.current,
      navigation: controller.getModeSnapshot(),
      driverPalette: {
        mask: session.palette.snapshot().palette.mask,
        progress: session.palette.snapshot().paletteProgress,
        phase: session.palette.snapshot().phase,
        transient: session.palette.snapshot().transient,
      },
      programCache: programCacheRef.current.stats,
      continuityLift: continuityLiftRef.current,
      material: window.__PS04M4_MATERIAL_UNIFORMS__ ?? null,
    };
  }, [controller, session, sessionId]);

  useEffect(() => {
    window.__PS04M4_LAB__ = {
      runId: "ps04-m4",
        stage: "PS-04.M4.R5",
      mode,
      get ready() {
        return Boolean(target && !loading && (stats.lastActorDrawCalls > 0 || window.__PS04M4_SCENE_READY__ || compositionRef.current.actorDraw === false));
      },
      get activeNode() {
        return controller.getProgress().activeNodeId;
      },
      stats,
      environment,
      contextState,
      snapshot: () => session.snapshot(),
      progress: () => progressRef.current,
      composition: () => compositionRef.current,
      diagnostics,
      measure: () => window.__PS04M4_MEASURE_ACTOR__?.() ?? null,
      theme,
      unlock: flow.unlock,
      overlay: flow.overlay,
      actorRequest,
      contract: () => contractRef.current,
      loading,
      reducedMotion,
      sessionId,
      transaction: () => coordinatorRef.current.snapshot(),
      paletteSnapshot: () => coordinatorRef.current.materialSnapshot(session.palette.snapshot().phase),
      geometrySnapshot: () => coordinatorRef.current.geometrySnapshot(),
      renderAck: () => geometryAckRef.current,
      programBind: () => programBindRef.current ? {
        revision: programBindRef.current.revision,
        programId: programBindRef.current.program.programId,
        sourceId: programBindRef.current.source.entry.stateId,
        targetId: programBindRef.current.target.entry.stateId,
        bindCommitted: programBindRef.current.bindCommitted,
        bindFrameToken: programBindRef.current.bindFrameToken,
      } : null,
      navigation: () => controller.getModeSnapshot(),
      lastActorTarget: () => navigationRef.current.lastIssuedTarget(),
      programCache: () => programCacheRef.current.stats,
      startTrace: () => { traceRef.current.start(); },
      stopTrace: () => traceRef.current.stop(),
      trace: () => traceRef.current.snapshot(),
      startGeometryLog: () => { geometryLogRef.current = { recording: true, frames: [] }; startClock(); },
      stopGeometryLog: () => {
        geometryLogRef.current.recording = false;
        return geometryLogRef.current.frames.slice();
      },
      geometryLog: () => geometryLogRef.current.frames.slice(),
      latencies: () => coordinatorRef.current.latencies(),
      startPerf: (scenario: string) => { perfRef.current.start(scenario); },
      stopPerf: () => {
        perfRef.current.noteResources({
          canvases: document.querySelectorAll("canvas").length,
          programs: stats.programs,
          textures: stats.textures,
          geometries: stats.geometries,
          draws: stats.lastActorDrawCalls,
        });
        const latencies = coordinatorRef.current.latencies();
        if (latencies.requestDelayMs != null) perfRef.current.noteRequestLatency(latencies.requestDelayMs);
        if (latencies.transitionDurationMs != null) perfRef.current.noteTransitionDuration(latencies.transitionDurationMs);
        return perfRef.current.stop();
      },
      sampleTransition: async (durationMs = 1400) => {
        const rows: Array<Record<string, unknown>> = [];
        const started = performance.now();
        await new Promise<void>((resolve) => {
          const step = (now: number) => {
            const tx = coordinatorRef.current.snapshot();
            const geo = coordinatorRef.current.geometrySnapshot();
            const uniforms = window.__PS04M4_MATERIAL_UNIFORMS__ ?? null;
            const composition = compositionRef.current;
            const measured = new URLSearchParams(window.location.search).get("actorMask") === "1"
              ? window.__PS04M4_MEASURE_ACTOR__?.() ?? null
              : null;
            const box = measured?.actorMaskBBoxCss ?? null;
            const width = box ? box.right - box.left : 0;
            const height = box ? box.bottom - box.top : 0;
            rows.push({
              elapsedMs: now - started,
              revision: tx.revision,
              semanticPhase: tx.semanticPhase,
              geometryProgress: tx.geometryProgress,
              paletteProgress: tx.paletteProgress,
              siteProgress: tx.siteProgress,
              sourceGeometryId: tx.sourceGeometryId,
              targetGeometryId: tx.targetGeometryId,
              shaderProgress: geo.shaderProgress,
              geometryStatus: geo.status,
              boundProgramId: geo.boundProgramId,
              boundSourceGeometryId: geo.boundSourceGeometryId,
              boundTargetGeometryId: geo.boundTargetGeometryId,
              settledGeometryId: geo.settledGeometryId,
              uniformProgress: uniforms?.geometryProgress ?? null,
              materialUuid: uniforms?.materialUuid ?? null,
              textureIdentity: uniforms?.textureIdentity ?? null,
              actorDraw: composition.actorDraw,
              area: width * height,
              maxDim: Math.max(width, height),
              visibleFraction: measured?.actorVisibleFraction ?? null,
              latencies: coordinatorRef.current.latencies(),
            });
            if (now - started < durationMs) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        });
        return rows;
      },
      committedNode: () => controller.committedActorNodeId(),
      requestState: (stateId: string) => {
        const current = contractRef.current;
        void requestActor({
          nodeId: current?.nodeId ?? activeNode,
          hostNodeId: current?.hostNodeId ?? activeNode,
          family: current?.family ?? "MASTER",
          requestedFamily: current?.requestedFamily ?? "MASTER",
          resolvedGeometryId: stateId,
          paletteMask: session.palette.snapshot().palette.mask,
          slot: current?.slot ?? "right",
          fitProfile: identity ? "none" : (current?.fitProfile ?? "master"),
          resolution: "exact",
          applyPaletteOverride: false,
          reason: "qa",
        });
      },
      scrollToNode: (id: ScreenNodeId, behavior?: ScrollBehavior, origin?: "programmatic" | "restore") => controller.scrollToNode(id, behavior, origin),
      magnetism: () => controller.getMagnetism(),
      noteUserInput: (kind: "wheel" | "touch" | "pointer" | "keyboard" | "scrollbar") => controller.noteUserInput(kind),
      evaluateMagnetism: () => controller.evaluateMagnetism(),
      setTheme: (value: MaterialTheme) => setTheme(value),
      setReduced: (value: boolean) => setManualReduced(value),
      setDpr: (value: number) => setDpr(value),
      selectTask: (id: TaskId) => setFlow((current) => selectTask(current, id)),
      confirmCompetencies: () => setFlow((current) => {
        const result = confirmCompetencies(current);
        setFlowError(result.error);
        return result.state;
      }),
      setCompetencies: (ids: CompetenceId[]) => setFlow((current) => setCompetencies(current, ids)),
      openContact: () => setFlow(openContact),
      closeOverlay: () => setFlow(closeOverlay),
      loseContext: () => document.getElementById("ps04m4-context-restore-run-motion")?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      canvasCount: () => document.querySelectorAll("canvas").length,
    };
    if (mode === "preview") window.__PS04M4_PREVIEW__ = window.__PS04M4_LAB__;
  }, [activeNode, actorRequest, contextState, controller, diagnostics, environment, flow.overlay, flow.unlock, identity, loading, mode, navigate, reducedMotion, requestActor, session, sessionId, startClock, stats, target, theme]);

  const sceneReady = Boolean(source && target && program && manifest);
  const paper = MATERIAL_THEME_PRESETS[theme].background;

  return (
    <main className={styles.lab} data-theme={theme} data-mode={mode} data-actor-mask={actorMask ? "true" : "false"} data-ui={hideUi ? "off" : "on"} style={{ background: actorMask ? "#140028" : paper, colorScheme: theme }}>
      <a className={styles.skip} href="#m4-main">К содержанию</a>
      <div ref={canvasHostRef} className={styles.canvasHost} data-identity={identity ? "true" : "false"} data-qa="m4-canvas">
        {sceneReady && source && target && program && manifest ? (
          <PS04M4Scene
            source={source}
            target={target}
            program={program}
            budget={16384}
            progress={snapshot.geometryProgress}
            reducedMotion={reducedMotion}
            debugMode="neutral"
            cameraPreset="canonical"
            presentationContract={manifest.presentationContract}
            profile="desktop"
            dpr={dpr}
            selectedId={-1}
            evaluator="m4"
            material={material}
            overlay={snapshot.overlay}
            session={session}
            sessionShouldAnimate={!snapshot.pauseAll && document.visibilityState !== "hidden"}
            compositionRef={compositionRef}
            transitionRef={transitionRef}
            paletteSnapshotRef={paletteSnapshotRef}
            geometrySnapshotRef={geometrySnapshotRef}
            programBindRef={programBindRef}
            geometryAckRef={geometryAckRef}
            onGeometryAck={(ack) => { geometryAckRef.current = ack; }}
            reproduceR4Geometry={reproduceR4Geometry}
            actorMask={actorMask}
            diagnosticId="motion"
            onStats={setStats}
            onEnvironment={setEnvironment}
            onContextState={(state) => {
              setContextState(state);
              if (state === "lost") session.setPauseAll(true);
              if (state === "restored") {
                session.setPauseAll(false);
                startClock();
              }
            }}
          />
        ) : null}
        {actorMask || query.get("diag") === "1" ? <DiagnosticOverlay composition={compositionRef} magnetism={() => controller.getMagnetism()} /> : null}
      </div>
      <PersistentHeader
        activeGroup={SCREEN_NODE_BY_ID[activeNode].headerGroup}
        onNavigate={navigate}
        theme={theme}
        onTheme={setTheme}
        preview={mode === "preview"}
      />
      <ProgressGraph progressRef={progressRef} unlock={flow.unlock} reducedMotion={reducedMotion} onNavigate={navigate} />
      <div id="m4-main" className={styles.route}>
        <HeroScreen onBuild={() => navigate("03.1")} onCompetence={() => navigate("05.1")} />
        <AboutScreen />
        <BuildChapter
          unlocked={flow.unlock}
          taskId={flow.taskId}
          competencies={flow.competencies}
          briefText={flow.briefText}
          error={flowError}
          onTask={(id) => { setFlowError(null); setFlow((current) => selectTask(current, id)); }}
          onToggle={(id) => setFlow((current) => setCompetencies(current, toggleCompetence(current.competencies, id)))}
          onConfirm={() => {
            setFlow((current) => {
              const result = confirmCompetencies(current);
              setFlowError(result.error);
              return result.state;
            });
          }}
          onBrief={(value) => setFlow((current) => editBrief(current, value))}
          onSend={() => {
            sendButtonRef.current = document.activeElement as HTMLElement | null;
            setFlow(openContact);
          }}
        />
        <CasesScreen />
        <CompetenceChapter />
        <StudioChapter />
        <ContactScreen />
        <FooterScreen />
      </div>
      {flow.overlay === "contact" ? (
        <ContactDialog
          contact={flow.contact}
          errors={contactErrors}
          onChange={(contact) => setFlow((current) => ({ ...current, contact }))}
          onClose={() => { setFlow(closeOverlay); sendButtonRef.current?.focus(); }}
          onSubmit={() => {
            const errors = validateContact(flow.contact);
            setContactErrors(errors);
            if (Object.keys(errors).length > 0) return;
            window.setTimeout(() => {
              setFlow((current) => simulateSuccess(current));
            }, CONTACT_SIMULATED_DELAY_MS);
          }}
        />
      ) : null}
      {flow.overlay === "success" ? (
        <SuccessStatus onClose={() => { setFlow(closeOverlay); sendButtonRef.current?.focus(); }} />
      ) : null}
      {hud ? (
        <aside className={styles.hud} data-qa="m4-hud">
          <div>PS-04.M4.R4 · {activeNode} · {SCREEN_NODE_BY_ID[activeNode].title}</div>
          <div>
            {contract ? <>{contract.requestedFamily} → {contract.resolvedGeometryId ?? "none"}<span className={styles.badge}>{contract.resolution}</span></> : "boot"}
          </div>
          <div>rev {txUi?.revision ?? ui?.requestRevision ?? 0} · {txUi?.semanticPhase ?? ui?.phaseAdapter.motionPhase ?? "idle"} · g {(txUi?.geometryProgress ?? ui?.geometryProgress ?? 1).toFixed(2)} · p {(txUi?.paletteProgress ?? ui?.palette.paletteProgress ?? 1).toFixed(2)} · s {(txUi?.siteProgress ?? 1).toFixed(2)}</div>
          <div>{txUi?.sourceGeometryId ?? "—"} → {txUi?.targetGeometryId ?? "—"} · own {txUi?.paletteOwnershipMode ?? 0} · cont {continuityLift ? txUi?.continuityEnabled ?? 0 : 0}</div>
          <div>mask {contract?.paletteMask ?? 0} · committed {txUi?.paletteCommitted ? txUi.targetPaletteMask : "—"} · shader {txUi?.targetPaletteMask ?? "—"} · base {txUi?.shaderBaseLutHash ?? "—"} · own {txUi?.paletteOwnershipMode ?? 0}</div>
          <div>lut settled {txUi?.settledPaletteLutHash ?? "—"} · src {txUi?.sourcePaletteLutHash ?? "—"} · dst {txUi?.targetPaletteLutHash ?? "—"}</div>
          <div>driver {ui?.palette.palette.mask ?? 0}/{ (ui?.palette.paletteProgress ?? 1).toFixed(2) } · ready {txUi?.programReady ? 1 : 0} · slot {contract?.slot ?? "none"} · fit {contract?.fitProfile ?? "none"}</div>
          <div>
            {stats.lastActorDrawCalls} draw / {stats.lastActorTriangles} tri · dpr {stats.dpr}
          </div>
          <div>{stats.fps} fps · p50 {stats.medianMs.toFixed(1)} / p95 {stats.p95Ms.toFixed(1)} ms · {stats.programs}P {stats.textures}T</div>
          <div>WebGL {contextState} · {loading ? "loading" : "ready"}{error ? ` · ${error}` : ""}</div>
          <div>
            <button type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>Theme</button>
            <button type="button" onClick={() => setManualReduced(!manualReduced)}>Reduced</button>
            <button type="button" onClick={() => setHud(false)}>Hide HUD</button>
          </div>
        </aside>
      ) : null}
    </main>
  );
}

function DiagnosticOverlay({
  composition,
  magnetism,
}: {
  composition: { current: CompositionViewport };
  magnetism: () => MagnetismSnapshot;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let frame = 0;
    let ticks = 0;
    const tick = () => {
      const root = rootRef.current;
      const viewport = composition.current;
      if (root && viewport) {
        const slot = root.querySelector("[data-slot]");
        const lane = root.querySelector("[data-lane]");
        const bbox = root.querySelector("[data-bbox]");
        const canvas = root.querySelector("[data-canvas]");
        const center = root.querySelector("[data-center]");
        const label = root.querySelector("[data-label]");
        if (slot instanceof HTMLElement) {
          slot.style.left = `${viewport.cssLeft}px`;
          slot.style.top = `${viewport.cssTop}px`;
          slot.style.width = `${viewport.cssWidth}px`;
          slot.style.height = `${viewport.cssHeight}px`;
        }
        if (canvas instanceof HTMLElement) {
          canvas.style.width = `${viewport.canvasCssWidth}px`;
          canvas.style.height = `${viewport.canvasCssHeight}px`;
        }
        if (center instanceof HTMLElement) {
          center.style.left = `${viewport.cssCenterX}px`;
          center.style.top = `${viewport.cssCenterY}px`;
        }
        if (lane instanceof HTMLElement) {
          const graph = viewport.canvasCssWidth < 720 ? 56 : 92;
          lane.style.width = `${graph}px`;
        }
        const snap = magnetism();
        if (label instanceof HTMLElement) {
          label.textContent = `css ${Math.round(viewport.canvasCssWidth)}×${Math.round(viewport.canvasCssHeight)} · dpr ${viewport.rendererDpr.toFixed(2)} · clip ${viewport.siteClipScale[0].toFixed(3)},${viewport.siteClipScale[1].toFixed(3)} · ${snap.mode} ${snap.candidateId ?? "—"} Δ${snap.distancePx.toFixed(0)} v${snap.velocityPxPerMs.toFixed(2)}`;
        }
        ticks += 1;
        if (bbox instanceof HTMLElement && ticks % 20 === 0) {
          const measure = window.__PS04M4_MEASURE_ACTOR__?.();
          const box = measure?.actorMaskBBoxCss;
          if (box) {
            bbox.style.display = "block";
            bbox.style.left = `${box.left}px`;
            bbox.style.top = `${box.top}px`;
            bbox.style.width = `${box.width}px`;
            bbox.style.height = `${box.height}px`;
            bbox.dataset.fraction = measure.actorVisibleFraction.toFixed(3);
          } else {
            bbox.style.display = "none";
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [composition, magnetism]);
  return (
    <div ref={rootRef} className={styles.diagRoot} data-qa="m4-diag">
      <div className={styles.diagCanvas} data-canvas />
      <div className={styles.diagLane} data-lane />
      <div className={styles.diagSlot} data-slot />
      <div className={styles.diagBbox} data-bbox />
      <div className={styles.diagCenter} data-center />
      <div className={styles.diagLabel} data-label />
    </div>
  );
}
