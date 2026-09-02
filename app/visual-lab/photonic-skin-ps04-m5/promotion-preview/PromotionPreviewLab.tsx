"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CompetenceId } from "../../../_brand/color-system";
import type { DebugMode, M3Manifest } from "../../photonic-skin-m4-1/m41-data";
import { loadRuntimeManifests, type M41Manifest } from "../../photonic-skin-m4-1/m41-data";
import { loadPromotedRuntime } from "../../../_photonic-skin/runtime";
import { M56_RUN_ID, M56_SESSION_ID, M56_STAGE, PAYLOAD_NAMESPACE, RELEASE_FRAMING } from "../../../_photonic-skin/release";
import { MATERIAL_THEME_PRESETS, defaultM2MaterialController, type MaterialTheme } from "../../photonic-skin-ps04-m3/material-foundation";
import { compileLiveRetarget, viewportForFrame } from "../../photonic-skin-ps04-m3/runtime";
import { PhotonicMotionSession, type SessionSnapshot } from "../../photonic-skin-ps04-m3/session";
import { PS04M5Scene, type SceneEnvironment, type SceneStats } from "../PS04M5Scene";
import { indexStates, requestFromContract, type ActorRequest } from "../actor-resolver";
import { resolveScreenActorContract, type ScreenActorContract } from "../screen-actor-contract";
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
} from "../build-flow";
import {
  actorSquareCss,
  envelopeOverflow,
  sampleComposition,
  siteEnvelopeCss,
  targetForNode,
  viewportFromCenter,
  type CompositionViewport,
} from "../composition";
import { ContactDialog, SuccessStatus } from "../components/ContactDialog";
import { PersistentHeader } from "../components/PersistentHeader";
import { ProgressGraph } from "../components/ProgressGraph";
import {
  AboutScreen,
  BuildChapter,
  CasesScreen,
  CompetenceChapter,
  ContactScreen,
  FooterScreen,
  HeroScreen,
  StudioChapter,
} from "../components/ScreenFixtures";
import { nextUnlocked, previousUnlocked, ScrollCompositionController, SELECTED_MAGNETISM_VARIANT, type MagnetismSnapshot, type ScrollProgress } from "../scroll-controller";
import { SCREEN_NODE_BY_ID, type ScreenNodeId } from "../topology";
import { ActorTransitionCoordinator, interceptGeometryLinkedProgress, semanticActorKey, type DisplayedPlacement, type ActorTransitionTransaction } from "../transition-coordinator";
import { GeometryIdTrace, traceFromTransaction } from "../geometry-id-trace";
import { M5TransitionTrace, m5FrameFromTransaction } from "../m5-transition-trace";
import { NaturalRafRecorder } from "../natural-raf-recorder";
import { CONTINUITY_FLOOR, DEFAULT_CONTINUITY_LIFT_ENABLED } from "../continuity-overlay";
import { commitDriverToMask, type PaletteMaterialSnapshot } from "../palette-authority";
import {
  EMPTY_GEOMETRY_ACK,
  selectProgramSourceMode,
  type GeometryMaterialSnapshot,
  type GeometryProgramBind,
  type GeometryRenderAck,
} from "../geometry-authority";
import { NavigationDirector } from "../navigation-token";
import type { TransitionUniforms } from "../PS04M5Scene";
import styles from "../ps04m5.module.css";
import { GpuTexturePool } from "../gpu-texture-pool";
import { ActorResourcePipeline } from "../resource-lifecycle";
import { DisjointGpuTimer, R6Instrumentation, r6GpuTimerEnabled, r6StagingEnabled } from "../r6-instrumentation";
import { FramingSandboxProgramCache, frozenProgramKey, reachableFrozenPairs, defaultGeometryForNode } from "./sandbox-prewarm";
import {
  SCREEN_NODE,
  VIEWPORT_PIXELS,
  type FramingDiagnosticId,
  type FramingPlayMode,
  type FramingScreenQuery,
  type FramingThemeId,
  type FramingViewportId,
} from "../framing-sandbox/sandbox-query";
import { parsePromotionQuery, promotionSearch } from "./promotion-query";
import { OWNER_SELECTED_PROFILE_ID, SELECTED_EVENT_HASH, SELECTED_VIDEO_HASH, SELECTED_VIDEO_VARIANT, framingProfileFor, type AboutZoomPercent, type FramingSelection, type MerchZoomPercent, type VideoZoomPercent } from "../framing";
import { createLoadGate, type SandboxLoadStatus } from "../framing-sandbox/sandbox-load-gate";
import { FramingReviewPanel } from "./SandboxReviewPanel";
import { PROMOTED_ASSET_NAMESPACE, type PromotionNamespaceId } from "../../../_photonic-skin/runtime";

declare global {
  interface Window {
    __PS04M55_LAB__?: Record<string, unknown>;
    __PS04M5_LAB__?: Record<string, unknown>;
    __PS04M5_PREVIEW__?: Record<string, unknown>;
    __PS04M56_PRODUCTION__?: Record<string, unknown>;
  }
}

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
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PromotionPreviewLab({ mode }: { mode: "lab" | "preview" | "production" }) {
  const production = mode === "production";
  const query = production ? new URLSearchParams() : labQuery();
  const sandbox = production
    ? {
      screen: "about" as FramingScreenQuery,
      aboutZoom: RELEASE_FRAMING.aboutZoomPercent,
      merchZoom: RELEASE_FRAMING.merchZoomPercent,
      videoZoom: RELEASE_FRAMING.videoZoomPercent,
      viewport: "current" as FramingViewportId,
      diagnostic: "final" as FramingDiagnosticId,
      theme: (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light") as FramingThemeId,
      mode: "settled" as FramingPlayMode,
      namespace: "candidate" as PromotionNamespaceId,
    }
    : parsePromotionQuery(typeof window === "undefined" ? "" : window.location.search);
  const identity = production ? false : query.get("identity") === "1";
  const [maskHarness, setMaskHarness] = useState(false);
  const actorMask = maskHarness || (!production && (query.get("actorMask") === "1" || sandbox.diagnostic === "mask"));
  const hideUi = actorMask || (!production && query.get("ui") === "0");
  const debugQuery = production ? null : query.get("debug");
  const debugOverride: DebugMode | null = debugQuery === "orientation" || debugQuery === "identity" || debugQuery === "features"
    ? debugQuery
    : null;
  const continuityLift = production ? DEFAULT_CONTINUITY_LIFT_ENABLED : (query.get("continuityLift") === "1" || DEFAULT_CONTINUITY_LIFT_ENABLED);
  const reproduceR4Geometry = production ? false : query.get("reproduceR4Geometry") === "1";
  const r6Staging = production ? false : r6StagingEnabled(typeof window === "undefined" ? "" : window.location.search);
  const [theme, setTheme] = useState<MaterialTheme>(sandbox.theme);
  const [screen, setScreen] = useState<FramingScreenQuery>(sandbox.screen);
  const [aboutZoom, setAboutZoom] = useState(sandbox.aboutZoom);
  const [merchZoom, setMerchZoom] = useState(sandbox.merchZoom);
  const [videoZoom, setVideoZoom] = useState(sandbox.videoZoom);
  const [viewportId, setViewportId] = useState<FramingViewportId>(sandbox.viewport);
  const [diagnostic, setDiagnostic] = useState<FramingDiagnosticId>(sandbox.diagnostic);
  const [loadStatus, setLoadStatus] = useState<SandboxLoadStatus>("loading");
  const [bufferHash, setBufferHash] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState<FramingPlayMode>(sandbox.mode);
  const bootScreenRef = useRef(sandbox.screen);
  const bootPlayModeRef = useRef(sandbox.mode);
  const loadGateRef = useRef(createLoadGate());
  const applySandboxRef = useRef<(patch: {
    screen?: FramingScreenQuery;
    aboutZoom?: AboutZoomPercent;
    merchZoom?: MerchZoomPercent;
    videoZoom?: VideoZoomPercent;
    viewport?: FramingViewportId;
    diagnostic?: FramingDiagnosticId;
    theme?: MaterialTheme;
    mode?: FramingPlayMode;
    namespace?: PromotionNamespaceId;
  }, history?: "push" | "replace" | "none") => void>(() => undefined);
  const [dpr, setDpr] = useState(() => parseLabDpr(query));
  const [manualReduced, setManualReduced] = useState(!production && query.get("reduced") === "1");
  const [hud] = useState(mode === "lab" && query.get("hud") !== "0");
  const [namespace, setNamespace] = useState<PromotionNamespaceId>(production ? "candidate" : sandbox.namespace);
  const [stats, setStats] = useState<SceneStats>(EMPTY_STATS);
  const [environment, setEnvironment] = useState<SceneEnvironment | null>(null);
  const [contextState, setContextState] = useState<"ready" | "lost" | "restored">("ready");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [contactErrors, setContactErrors] = useState<ReturnType<typeof validateContact>>({});
  const [promotedManifest, setPromotedManifest] = useState<M3Manifest | null>(null);
  const [frozenManifest, setFrozenManifest] = useState<M3Manifest | null>(null);
  const [motionManifest, setMotionManifest] = useState<M41Manifest | null>(null);
  const manifest = (namespace === "frozen" ? frozenManifest : promotedManifest);
  const [flow, setFlow] = useState<BuildFlowState>(INITIAL_BUILD_FLOW);
  const [activeNode, setActiveNode] = useState<ScreenNodeId>(
    production ? "01" : (sandbox.screen === "walkthrough" ? "02" : SCREEN_NODE[sandbox.screen]),
  );
  const [ui, setUi] = useState<SessionSnapshot | null>(null);
  const [txUi, setTxUi] = useState<ActorTransitionTransaction | null>(null);
  const systemReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reducedMotion = systemReduced || manualReduced;
  const session = useMemo(() => new PhotonicMotionSession({
    reducedMotion: bootstrapReducedMotion(),
    overlayMode: "m3-combined",
    profile: "desktop",
  }), []);
  useLayoutEffect(() => {
    interceptGeometryLinkedProgress(session.palette);
  }, [session]);
  const controller = useMemo(() => new ScrollCompositionController(), []);
  useEffect(() => {
    if (production) {
      controller.setMagnetismVariant(SELECTED_MAGNETISM_VARIANT);
      return;
    }
    const requested = labQuery().get("magnetism");
    if (requested === "a" || requested === "b" || requested === "c") {
      controller.setMagnetismVariant(requested);
    } else {
      controller.setMagnetismVariant(SELECTED_MAGNETISM_VARIANT);
    }
  }, [controller, production]);
  const [contract, setContract] = useState<ScreenActorContract | null>(null);
  const sessionId = production ? M56_SESSION_ID : "ps04-m5-5-promotion-preview";
  const progressRef = useRef<ScrollProgress>(controller.getProgress());
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const compositionRef = useRef<CompositionViewport>(viewportFromCenter({
    width: 1440, height: 900, dpr, centerX: 1100, centerY: 480, size: 460, visible: true, identity,
  }));
  const visualRef = useRef({ x: 1100, y: 480, size: 460, visible: true, exitHold: 0, siteFit: 1, zoom: 1 });
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
  const m5TraceRef = useRef(new M5TransitionTrace());
  const placementFromRef = useRef({ x: 1100, y: 480, size: 460 });
  const placementRevisionRef = useRef(-1);
  const lastActiveBankRef = useRef<number | null>(null);
  const actorRequestLogRef = useRef<string[]>([]);
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
  const programCache = useMemo(() => new FramingSandboxProgramCache(), []);
  const programCacheRef = useRef(programCache);
  useEffect(() => {
    programCacheRef.current.namespace = namespace;
    programCacheRef.current.variant = `${OWNER_SELECTED_PROFILE_ID}|${namespace}`;
  }, [namespace]);
  const selectionRef = useRef<FramingSelection>({ aboutZoom, merchZoom, videoZoom });
  const gpuPool = useMemo(() => new GpuTexturePool(), []);
  const r6 = useMemo(() => new R6Instrumentation(), []);
  const gpuTimer = useMemo(() => {
    const timer = new DisjointGpuTimer();
    timer.enabled = r6GpuTimerEnabled(typeof window === "undefined" ? "" : window.location.search);
    return timer;
  }, []);
  const pipeline = useMemo(() => new ActorResourcePipeline(programCache as never, gpuPool, r6), [programCache, gpuPool, r6]);
  const gpuPoolRef = useRef(gpuPool);
  const r6Ref = useRef(r6);
  const gpuTimerRef = useRef(gpuTimer);
  const pipelineRef = useRef(pipeline);
  const r6StagingRef = useRef(r6Staging);
  const lastSettledRevisionRef = useRef(0);
  const lastFrameTokenRef = useRef(-1);
  const continuityLiftRef = useRef(continuityLift);
  const reproduceR4GeometryRef = useRef(reproduceR4Geometry);
  const geometryLogRef = useRef<{ recording: boolean; frames: Array<Record<string, unknown>> }>({ recording: false, frames: [] });
  const manifestsRef = useRef<{ m3: M3Manifest | null; m4: M41Manifest | null }>({ m3: null, m4: null });
  const lookaheadPinsRef = useRef<Set<string>>(new Set());

  const startClock = useCallback(() => {
    const clock = clockRef.current;
    if (clock.running) return;
    clock.running = true;
    clock.previous = performance.now();
    const loop = (now: number) => {
      const clockStarted = performance.now();
      const split = { tick: 0, sync: 0, nav: 0, compose: 0, ui: 0 };
      const rafSkewMs = clockStarted - now;
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
      split.tick = performance.now() - clockStarted;
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
        sessionTargetId: session.getTarget()?.entry.stateId ?? null,
      });
      const tx = coordinator.snapshot();
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
      split.sync = performance.now() - clockStarted;
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
          actorRequestLogRef.current.push(observed.token.targetNodeId);
          navigationRef.current.commitActorTarget(observed.token.targetNodeId, observed.token.origin);
          requestActorRef.current(actorContract);
          setContract(actorContract);
        }
      }
      split.nav = performance.now() - clockStarted;
      const liveDpr = dprRef.current;
      const liveIdentity = identityRef.current;
      const liveReduced = reducedRef.current;
      const target = targetForNode(progress.activeNodeId);
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
      if (placementRevisionRef.current !== tx.revision) {
        placementFromRef.current = {
          x: visualRef.current.x,
          y: visualRef.current.y,
          size: visualRef.current.size,
        };
        placementRevisionRef.current = tx.revision;
        lastActiveBankRef.current = gpuPoolRef.current.snapshot().banks[0]?.id ?? lastActiveBankRef.current;
      }
      const from = placementFromRef.current;
      const siteU = liveReduced || liveIdentity ? 1 : tx.positionProgress;
      const fitU = liveReduced || liveIdentity ? 1 : tx.fitProgress;
      const mixedX = from.x + (targetSample.cssCenterX - from.x) * siteU;
      const mixedY = from.y + (targetSample.cssCenterY - from.y) * siteU;
      const mixedSize = from.size + (targetSample.cssSize - from.size) * siteU;
      const mixedFit = tx.sourceFit + (tx.targetFit - tx.sourceFit) * fitU;
      visualRef.current.x = mixedX;
      visualRef.current.y = mixedY;
      visualRef.current.size = mixedSize;
      visualRef.current.siteFit = mixedFit;
      const framingU = liveReduced || liveIdentity ? 1 : (tx.framingProgress ?? 1);
      visualRef.current.zoom = (tx.sourceZoom ?? 1) + ((tx.targetZoom ?? 1) - (tx.sourceZoom ?? 1)) * framingU;
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
        visualZoomMultiplier: liveIdentity ? 1 : visualRef.current.zoom,
        slot: siteU >= 1 ? targetSample.slot : tx.sourceSlot,
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
      if (traceRef.current.recordingNow || geometryLogRef.current.recording || m5TraceRef.current.recordingNow) {
        const geoNow = coordinator.geometrySnapshot();
        const uniforms = window.__PS04M5_MATERIAL_UNIFORMS__ ?? null;
        const ack = geometryAckRef.current;
        const packetNow = programBindRef.current;
        const modeNow = controller.getModeSnapshot();
        const poolSnap = gpuPoolRef.current.snapshot();
        const activeBank = poolSnap.banks[0] ?? null;
        const latencies = coordinator.latencies();
        if (m5TraceRef.current.recordingNow) {
          const uniqueRequests = [...new Set(actorRequestLogRef.current)];
          m5TraceRef.current.push(m5FrameFromTransaction({
            frameToken: clock.token,
            timestamp: now,
            transaction: tx,
            navigationRevision: coordinator.committedNodeRevision(),
            actorX: visualRef.current.x,
            actorSlot: compositionRef.current.slot,
            gpuBankReady: activeBank?.gpuReady === true,
            activeBankBefore: lastActiveBankRef.current,
            activeBankAfter: activeBank?.id ?? null,
            prepareStartMs: latencies.intentAtMs || latencies.requestAtMs,
            prepareEndMs: latencies.cacheReadyAtMs,
            copyCommitMs: latencies.bindAtMs,
            settleMs: latencies.settleAtMs,
            cancellationReason: tx.status === "interrupted" || tx.status === "cancelled" ? tx.status : null,
            intermediateActorRequest: uniqueRequests.length > 2,
            currentGeometryId: geoNow.settledGeometryId ?? tx.sourceGeometryId,
            displayedZoom: visualRef.current.zoom,
          }));
        }
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
      split.compose = performance.now() - clockStarted;
      if (now - clock.lastUi > 160 || clock.lastUi === 0) {
        setUi(sessionSnap);
        setTxUi(tx);
        clock.lastUi = now;
        perfRef.current.markReactCommit();
      }
      split.ui = performance.now() - clockStarted;
      const clockMs = split.ui;
      if (clockMs >= 50 || rafSkewMs >= 50) r6Ref.current.mark("r6:slow-clock", { durationMs: clockMs, rafSkewMs, visual: tx.visualLifecycle, node: progress.activeNodeId, split });
      const siteMoving = siteU < 0.999 && visualRef.current.visible !== target.visible;
      const geoStatus = coordinator.geometrySnapshot().status;
      const preparing = tx.visualLifecycle === "preparing" || pipelineRef.current.visual === "preparing";
      if (tx.status === "settled" && pipelineRef.current.visual === "morphing") {
        pipelineRef.current.markSettled();
      }
      if ((session.shouldAnimate() && document.visibilityState !== "hidden") || siteMoving || (!target.visible && visualRef.current.visible) || tx.status === "running" || geoStatus === "waiting" || preparing || geometryLogRef.current.recording || m5TraceRef.current.recordingNow) {
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
      r6Ref.current.mark("r6:semantic-node-commit", { nodeId: progress.activeNodeId, scrollY: window.scrollY });
      const manifests = manifestsRef.current;
      if (manifests.m3) {
        const node = controller.committedActorNodeId();
        const direction = controller.getProgress().direction;
        const pairs = reachableFrozenPairs(node, direction);
        const viewport = window.innerWidth <= 430 ? "mobile" : "desktop";
        programCacheRef.current.setBudget(viewport === "mobile");
        lookaheadPinsRef.current = programCacheRef.current.replacePins(
          pairs.map(([from, to]) => frozenProgramKey(from, to, reducedRef.current, viewport, programCacheRef.current.variant)),
          lookaheadPinsRef.current,
          pipelineRef.current.pinnedIntentKey ? [pipelineRef.current.pinnedIntentKey] : [],
        );
        programCacheRef.current.startRoutePrewarm({
          current: node,
          manifest: manifests.m3,
          motion: manifests.m4,
          reducedMotion: reducedRef.current,
          direction,
          hidden: () => session.snapshot().offscreen
            || document.visibilityState === "hidden"
            || coordinatorRef.current.snapshot().visualLifecycle === "morphing"
            || coordinatorRef.current.snapshot().visualLifecycle === "preparing"
            || pipelineRef.current.state === "gpu-staging"
            || pipelineRef.current.state === "cpu-preparing",
        });
      }
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
    const tasks = [loadPromotedRuntime(controllerAbort.signal)];
    if (!production) tasks.push(loadRuntimeManifests(controllerAbort.signal));
    Promise.all(tasks).then((results) => {
      const promoted = results[0];
      setPromotedManifest(promoted.m3);
      setMotionManifest(promoted.m4);
      if (results[1]) setFrozenManifest(results[1].m3);
    }).catch((reason: Error) => {
      if (reason.name !== "AbortError") setError(reason.message);
    });
    return () => controllerAbort.abort();
  }, [production]);

  useEffect(() => {
    const m3 = namespace === "frozen" ? frozenManifest : promotedManifest;
    if (!m3) return;
    manifestsRef.current = { m3, m4: motionManifest };
    stateIndexRef.current = indexStates(m3.states);
  }, [frozenManifest, motionManifest, namespace, promotedManifest]);

  useEffect(() => {
    if (!manifest) return;
    const generation = loadGateRef.current.next();
    const abort = new AbortController();
    const cache = programCacheRef.current;
    cache.clearVariantCaches();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || abort.signal.aborted) return;
      setLoadStatus("loading");
      setLoading(true);
    });
    const m3 = manifest;
    const m4 = motionManifest;
    const queryNode = production ? null : labQuery().get("node");
    const initialScreen = bootScreenRef.current;
    const screenNode = initialScreen === "walkthrough" ? "02" : SCREEN_NODE[initialScreen];
    const bootNode = (production
      ? "01"
      : (queryNode && SCREEN_NODE_BY_ID[queryNode as ScreenNodeId]
        ? queryNode
        : bootPlayModeRef.current === "settled" ? screenNode : "01")) as ScreenNodeId;
    const bootGeometry = defaultGeometryForNode(bootNode) ?? "master-neutral";
    const entry = m3.states.find((item) => item.stateId === bootGeometry) ?? m3.states.find((item) => item.stateId === "master-neutral") ?? m3.states[0];
    void (async () => {
      try {
        const state = await cache.loadState(entry, abort.signal);
        if (abort.signal.aborted || !loadGateRef.current.isCurrent(generation)) return;
        const program = await cache.getFrozen({
          source: state,
          target: state,
          manifest: m3,
          motion: m4,
          reducedMotion,
          signal: abort.signal,
        });
        if (abort.signal.aborted || !loadGateRef.current.isCurrent(generation)) return;
        session.bootstrapSettled(state, program);
        const bootContract = stateIndexRef.current
          ? resolveScreenActorContract({
            nodeId: bootNode,
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
          const host = canvasHostRef.current;
          const bootProfile = framingProfileFor({
            nodeId: bootContract.hostNodeId,
            geometryId: bootContract.resolvedGeometryId,
            selection: selectionRef.current,
            width: host?.clientWidth || window.innerWidth,
            height: host?.clientHeight || window.innerHeight,
          });
          coordinatorRef.current.adoptSettled(bootContract, identity, bootProfile.effectiveZoom);
          visualRef.current.zoom = identity ? 1 : bootProfile.effectiveZoom;
          geometrySnapshotRef.current = coordinatorRef.current.geometrySnapshot();
          navigationRef.current.commitActorTarget(bootNode, "restore");
          requestKeyRef.current = semanticActorKey(bootContract).serialized;
          contractRef.current = bootContract;
          setContract(bootContract);
          setActiveNode(bootNode);
          if (r6StagingRef.current) {
            pipelineRef.current.hydrateResident({
              revision: coordinatorRef.current.snapshot().revision,
              navigationToken: navigationRef.current.lastToken(),
              source: state,
              target: state,
              program,
              viewport: typeof window !== "undefined" && window.innerWidth <= 430 ? "mobile" : "desktop",
            });
          }
        }
        if (abort.signal.aborted || !loadGateRef.current.isCurrent(generation)) return;
        setBufferHash(state.entry.contentHash);
        setLoadStatus("ready");
        setLoading(false);
        setError(null);
        startClock();
        cache.startRoutePrewarm({
          current: bootNode,
          manifest: m3,
          motion: m4,
          reducedMotion,
          direction: controller.getProgress().direction,
          hidden: () => session.snapshot().offscreen
            || document.visibilityState === "hidden"
            || coordinatorRef.current.snapshot().visualLifecycle === "morphing"
            || coordinatorRef.current.snapshot().visualLifecycle === "preparing"
            || pipelineRef.current.state === "gpu-staging"
            || pipelineRef.current.state === "cpu-preparing",
        });
        if (bootPlayModeRef.current === "settled") controller.scrollToNode(bootNode, "auto", "restore");
      } catch (reason) {
        const error = reason as Error;
        if (error?.name === "AbortError" || !loadGateRef.current.isCurrent(generation)) return;
        setError(error.message);
        setLoadStatus("error");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [controller, identity, manifest, motionManifest, production, reducedMotion, session, startClock]);

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
      zoom: visualRef.current.zoom,
    };
    const host = canvasHostRef.current;
    const targetProfile = framingProfileFor({
      nodeId: next.hostNodeId,
      geometryId: next.resolvedGeometryId,
      selection: selectionRef.current,
      width: host?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 1440),
      height: host?.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 900),
    });
    const { decision, transaction } = coordinator.begin({
      next,
      displayed,
      displayedLut,
      nowSeconds: session.snapshot().sessionTime,
      reducedMotion,
      identity,
      nowMs: performance.now(),
      navigationToken: navigationRef.current.lastToken(),
      targetZoom: identity ? 1 : targetProfile.effectiveZoom,
    });
    if (decision.kind === "noop") return;
    setContract(next);
    if (!manifest) return;
    if (decision.kind === "exit") {
      pipelineRef.current.cancelPending("exit");
      startClock();
      return;
    }
    if (decision.kind === "palette-only") {
      startClock();
      return;
    }
    if (decision.kind === "site-only" || decision.kind === "framing-only") {
      startClock();
      return;
    }
    const request = requestFromContract(next);
    if (!request.stateId) return;
    r6Ref.current.mark("r6:navigation-intent", { nodeId: next.hostNodeId, revision: transaction.revision });
    const geo = coordinator.geometrySnapshot();
    const sourceChoice = selectProgramSourceMode({
      shaderProgress: geo.shaderProgress,
      boundTargetGeometryId: geo.boundTargetGeometryId,
      boundSourceGeometryId: geo.boundSourceGeometryId,
      settledGeometryId: geo.settledGeometryId,
      sessionSourceId: session.getSource()?.entry.stateId ?? null,
      sessionTargetId: session.getTarget()?.entry.stateId ?? null,
      sessionProgress: session.snapshot().geometryProgress,
    });
    if (r6StagingRef.current && !reproduceR4GeometryRef.current && sourceChoice.mode === "frozen" && sourceChoice.sourceGeometryId) {
      pipelineRef.current.request({
        revision: transaction.revision,
        navigationToken: navigationRef.current.lastToken(),
        sourceId: sourceChoice.sourceGeometryId,
        targetId: request.stateId,
        reducedMotion,
        viewport: typeof window !== "undefined" && window.innerWidth <= 430 ? "mobile" : "desktop",
        prefer: controller.getProgress().direction < 0 ? "pending" : "forward",
      });
      startClock();
      return;
    }
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
      setBufferHash(nextState.entry.contentHash);
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
  }, [identity, manifest, motionManifest, reducedMotion, session, startClock, controller]);

  useLayoutEffect(() => {
    selectionRef.current = { aboutZoom, merchZoom, videoZoom };
    if (loadStatus !== "ready") return;
    const next = contractRef.current;
    if (!next) return;
    void requestActor(next);
  }, [aboutZoom, merchZoom, videoZoom, viewportId, loadStatus, requestActor]);

  useEffect(() => {
    if (screen !== "walkthrough") return;
    const sequence: ScreenNodeId[] = ["02", "05.7", "05.5"];
    let index = 0;
    controller.scrollToNode(sequence[0], "auto", "restore");
    if (playMode !== "transition") return;
    let raf = 0;
    let dwell = 0;
    const tick = () => {
      const tx = coordinatorRef.current.snapshot();
      const node = controller.getProgress().activeNodeId;
      if (tx.status === "settled" && node === sequence[index]) {
        dwell += 1;
        if (dwell > 48) {
          dwell = 0;
          index = (index + 1) % sequence.length;
          controller.scrollToNode(sequence[index], "auto", "restore");
        }
      } else {
        dwell = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [controller, playMode, screen]);

  const actorRequest: ActorRequest | null = contract ? requestFromContract(contract) : null;

  useLayoutEffect(() => {
    flowRef.current = flow;
    stateIndexRef.current = stateIndex;
    dprRef.current = dpr;
    identityRef.current = identity;
    reducedRef.current = reducedMotion;
    continuityLiftRef.current = continuityLift;
    reproduceR4GeometryRef.current = reproduceR4Geometry;
    r6StagingRef.current = r6Staging;
    selectionRef.current = { aboutZoom, merchZoom, videoZoom };
    requestActorRef.current = (next) => { void requestActor(next); };
    const pipeline = pipelineRef.current;
    pipeline.onReady = (packet) => {
      const coordinator = coordinatorRef.current;
      if (!coordinator.isCurrent(packet.revision)) {
        r6Ref.current.noteStaleBind();
        return;
      }
      r6Ref.current.mark("r6:idle-handoff", { revision: packet.revision });
      const sessionRevision = session.beginRequest(packet.target.entry.stateId);
      if (!session.isCurrent(sessionRevision) || !coordinator.isCurrent(packet.revision)) return;
      const captured = session.captureJoint();
      programBindRef.current = {
        revision: packet.revision,
        navigationToken: packet.navigationToken,
        program: packet.program,
        source: packet.source,
        target: packet.target,
        bindCommitted: false,
        bindFrameToken: null,
        preparedAtMs: packet.preparedAtMs,
        gpuReady: packet.bank.gpuReady === true,
        resourceState: "gpu-ready",
        bankId: packet.bank.id,
        bankGeneration: packet.bank.generation,
      };
      r6Ref.current.mark("r6:geometry-transaction-start", { revision: packet.revision });
      session.commitTransition({
        revision: sessionRevision,
        source: packet.source,
        target: packet.target,
        program: packet.program,
        captured,
        play: false,
      });
      coordinator.markProgramReady(packet.revision, packet.program.programId, packet.preparedAtMs);
      pipeline.markBound(packet.revision);
      startClock();
    };
    pipeline.yieldGate.attach();
    r6Ref.current.startLongTasks();
    startClock();
  }, [aboutZoom, dpr, flow, identity, merchZoom, reducedMotion, requestActor, startClock, stateIndex, continuityLift, reproduceR4Geometry, r6Staging, session, videoZoom]);

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
    const measure = window.__PS04M5_MEASURE_ACTOR__?.() ?? null;
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
      material: window.__PS04M5_MATERIAL_UNIFORMS__ ?? null,
      resource: pipelineRef.current.snapshot(),
      gpuPool: gpuPoolRef.current.snapshot(),
      visualLifecycle: coordinatorRef.current.snapshot().visualLifecycle,
      idleEnabled: session.snapshot().overlayEnabled,
      idleScale: session.snapshot().overlay.scale,
      r6Staging: r6StagingRef.current,
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
    };
  }, [controller, session, sessionId]);

  useEffect(() => {
    const handle = {
      runId: production ? M56_RUN_ID : "ps04-m5-5",
      stage: production ? M56_STAGE : "PS-04.M5.5",
      assetNamespace: namespace === "candidate" ? PROMOTED_ASSET_NAMESPACE : "ps-03-m3-1r",
      stateHash: bufferHash,
      eventOverlay: "none",
      videoOverlay: "none",
      runtimeRotationOverride: "none",
      framingProfile: OWNER_SELECTED_PROFILE_ID,
      selectedVideo: SELECTED_VIDEO_VARIANT,
      selectedVideoHash: SELECTED_VIDEO_HASH,
      selectedEventHash: SELECTED_EVENT_HASH,
      screen,
      aboutZoom,
      merchZoom,
      videoZoom,
      viewport: viewportId,
      diagnostic,
      loadStatus,
      bufferHash,
      overlayHash: () => session.getTarget()?.entry.contentHash ?? bufferHash ?? session.getSource()?.entry.contentHash ?? null,
      applySandbox: (patch: Parameters<typeof applySandboxRef.current>[0]) => applySandboxRef.current(patch),
      playMode,
      mode,
      get ready() {
        return Boolean(target && loadStatus === "ready" && !loading);
      },
      get labReady() {
        return Boolean(target && !loading);
      },
      get actorResourceReady() {
        return window.__PS04M5_ACTOR_RESOURCE_READY__ === true;
      },
      get actorFramebufferReady() {
        return window.__PS04M5_ACTOR_FRAMEBUFFER_READY__ === true;
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
      measure: () => window.__PS04M5_MEASURE_ACTOR__?.() ?? null,
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
        gpuReady: programBindRef.current.gpuReady ?? null,
        bankId: programBindRef.current.bankId ?? null,
        bankGeneration: programBindRef.current.bankGeneration ?? null,
      } : null,
      resource: () => pipelineRef.current.snapshot(),
      gpuPool: () => gpuPoolRef.current.snapshot(),
      r6: () => ({
        ...r6Ref.current.snapshot(),
        gpuTimer: gpuTimerRef.current.snapshot(),
        stagingEnabled: r6StagingRef.current,
        compileWorker: false,
        compileWorkerError: null,
        compileReceiveMs: 0,
        phases: session.snapshot().phases,
        overlayEnabled: session.snapshot().overlayEnabled,
        visualLifecycle: coordinatorRef.current.snapshot().visualLifecycle,
        resource: pipelineRef.current.snapshot(),
        scrollY: window.scrollY,
      }),
      navigation: () => controller.getModeSnapshot(),
      lastActorTarget: () => navigationRef.current.lastIssuedTarget(),
      idleOverlay: () => session.snapshot().overlay,
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
      startM5Trace: () => {
        actorRequestLogRef.current = [];
        m5TraceRef.current.start();
        startClock();
      },
      stopM5Trace: () => m5TraceRef.current.stop(),
      m5Trace: () => m5TraceRef.current.snapshot(),
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
        const report = perfRef.current.stop();
        const gpu = gpuTimerRef.current.snapshot();
        report.gpuTimer = {
          available: gpu.available,
          extension: gpu.extension,
          disjoint: gpu.disjoint,
          gpuMs: gpu.count
            ? {
              p50: Number((gpu.p50 ?? 0).toFixed(3)),
              p95: Number((gpu.p95 ?? 0).toFixed(3)),
              p99: Number((gpu.max ?? 0).toFixed(3)),
              max: Number((gpu.max ?? 0).toFixed(3)),
              mean: Number((gpu.p50 ?? 0).toFixed(3)),
              count: gpu.count,
              over16_7: 0,
              over33_3: 0,
              over50: 0,
              consecutiveMissedMax: 0,
            }
            : null,
          note: gpu.available
            ? `EXT_disjoint_timer_query_webgl2 sampled ${gpu.count} actor draws`
            : "GPU timer unavailable",
        };
        report.textureUploadCount = r6Ref.current.textureUploadCount;
        report.initTextureCount = r6Ref.current.initTextureCount;
        report.r6LongTasks = r6Ref.current.longTasks.slice();
        report.r6Measures = r6Ref.current.measures.slice(-48);
        return report;
      },
      sampleTransition: async (durationMs = 1400) => {
        const rows: Array<Record<string, unknown>> = [];
        const started = performance.now();
        await new Promise<void>((resolve) => {
          const step = (now: number) => {
            const tx = coordinatorRef.current.snapshot();
            const geo = coordinatorRef.current.geometrySnapshot();
            const uniforms = window.__PS04M5_MATERIAL_UNIFORMS__ ?? null;
            const composition = compositionRef.current;
            const measured = new URLSearchParams(window.location.search).get("actorMask") === "1"
              ? window.__PS04M5_MEASURE_ACTOR__?.() ?? null
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
              framingProgress: tx.framingProgress,
              sourceZoom: tx.sourceZoom,
              targetZoom: tx.targetZoom,
              displayedZoom: visualRef.current.zoom,
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
      resetFlow: () => {
        setFlowError(null);
        setFlow(INITIAL_BUILD_FLOW);
      },
      openContact: () => setFlow(openContact),
      closeOverlay: () => setFlow(closeOverlay),
      loseContext: () => {
        const button = document.getElementById("ps04m5-context-restore-run-motion");
        if (button) {
          button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          return;
        }
        const canvas = document.querySelector("canvas");
        const gl = canvas && (canvas.getContext("webgl2") || canvas.getContext("webgl"));
        const extension = gl && gl.getExtension("WEBGL_lose_context");
        if (!gl || !extension) return;
        extension.loseContext();
        window.setTimeout(() => extension.restoreContext(), 80);
      },
      framing: () => {
        const tx = coordinatorRef.current.snapshot();
        const host = canvasHostRef.current;
        const profile = framingProfileFor({
          nodeId: contractRef.current?.hostNodeId ?? activeNode,
          geometryId: contractRef.current?.resolvedGeometryId ?? null,
          selection: selectionRef.current,
          width: host?.clientWidth || window.innerWidth,
          height: host?.clientHeight || window.innerHeight,
        });
        return {
          requestedZoom: profile.requestedZoom,
          displayedZoom: visualRef.current.zoom,
          sourceZoom: tx.sourceZoom,
          targetZoom: tx.targetZoom,
          currentZoom: visualRef.current.zoom,
          effectiveZoom: profile.effectiveZoom,
          responsiveCap: profile.responsiveCap,
          capped: profile.effectiveZoom + 1e-8 < profile.requestedZoom,
          revision: tx.revision,
          framingProgress: tx.framingProgress,
          frustumScale: profile.effectiveZoom > 0 ? 1 / profile.effectiveZoom : 1,
          siteFitScale: compositionRef.current.siteFitScale,
          visualZoomMultiplier: compositionRef.current.visualZoomMultiplier,
          slot: compositionRef.current.slot,
          nodeId: contractRef.current?.hostNodeId ?? null,
          geometryId: contractRef.current?.resolvedGeometryId ?? null,
        };
      },
      camera: () => {
        const host = window as Window & {
          __PS03M41R_PRESENTATION_DIAGNOSTICS__?: Record<string, {
            position: number[];
            quaternion: number[];
            fov: number;
            near: number;
            far: number;
          }>;
        };
        const diag = host.__PS03M41R_PRESENTATION_DIAGNOSTICS__?.motion;
        return {
          position: diag?.position ?? null,
          quaternion: diag?.quaternion ?? null,
          fov: diag?.fov ?? 33,
          near: diag?.near ?? 0.01,
          far: diag?.far ?? 100,
          zoom: compositionRef.current.visualZoomMultiplier,
          siteFitScale: compositionRef.current.siteFitScale,
        };
      },
      canvasCount: () => document.querySelectorAll("canvas").length,
      forceInvalidateOnly: () => window.__PS04M5_GPU_DIAG__?.forceInvalidateOnly?.(),
      forceRebindActiveBankOnly: () => window.__PS04M5_GPU_DIAG__?.forceRebindActiveBankOnly?.(),
      forceReuploadActiveBankOnly: () => window.__PS04M5_GPU_DIAG__?.forceReuploadActiveBankOnly?.(),
      forceFullBankRepublish: () => window.__PS04M5_GPU_DIAG__?.forceFullBankRepublish?.(),
      getMaterialSamplerSnapshot: () => window.__PS04M5_GPU_DIAG__?.getMaterialSamplerSnapshot?.() ?? null,
      textureInventory: () => window.__PS04M5_GPU_DIAG__?.textureInventory?.() ?? null,
      liveBankGpuParity: () => window.__PS04M5_GPU_DIAG__?.liveBankGpuParity?.() ?? null,
      framebufferSilhouette: () => window.__PS04M5_GPU_DIAG__?.framebufferSilhouette?.() ?? null,
      setActorMask: (value: boolean) => setMaskHarness(Boolean(value)),
    };
    window.__PS04M55_LAB__ = handle;
    window.__PS04M5_LAB__ = handle;
    if (mode === "preview") window.__PS04M5_PREVIEW__ = handle;
    if (production) window.__PS04M56_PRODUCTION__ = handle;
    else delete window.__PS04M56_PRODUCTION__;
  }, [aboutZoom, activeNode, actorRequest, bufferHash, contextState, controller, diagnostic, diagnostics, environment, flow.overlay, flow.unlock, identity, loading, loadStatus, merchZoom, mode, namespace, navigate, playMode, production, reducedMotion, requestActor, screen, session, sessionId, startClock, stats, target, theme, videoZoom, viewportId]);

  const sceneReady = Boolean(source && target && program && manifest);
  const paper = MATERIAL_THEME_PRESETS[theme].background;
  const applySandbox = useCallback((patch: {
    screen?: FramingScreenQuery;
    aboutZoom?: AboutZoomPercent;
    merchZoom?: MerchZoomPercent;
    videoZoom?: VideoZoomPercent;
    viewport?: FramingViewportId;
    diagnostic?: FramingDiagnosticId;
    theme?: MaterialTheme;
    mode?: FramingPlayMode;
    namespace?: PromotionNamespaceId;
  }, history: "push" | "replace" | "none" = "push") => {
    if (production) {
      if (patch.theme) {
        const nextTheme = patch.theme === "dark" ? "dark" : "light";
        setTheme(nextTheme);
        document.documentElement.dataset.theme = nextTheme;
        document.documentElement.dataset.themePreference = nextTheme;
        document.documentElement.style.colorScheme = nextTheme;
        try { localStorage.setItem("mimicry-theme", nextTheme); } catch { /* ignore */ }
      }
      return;
    }
    const next = {
      screen: patch.screen ?? screen,
      aboutZoom: patch.aboutZoom ?? aboutZoom,
      merchZoom: patch.merchZoom ?? merchZoom,
      videoZoom: patch.videoZoom ?? videoZoom,
      viewport: patch.viewport ?? viewportId,
      diagnostic: patch.diagnostic ?? diagnostic,
      theme: ((patch.theme ?? theme) === "dark" ? "dark" : "light") as FramingThemeId,
      mode: patch.mode ?? playMode,
      namespace: patch.namespace ?? namespace,
    };
    if (patch.screen) setScreen(patch.screen);
    if (patch.aboutZoom !== undefined) setAboutZoom(patch.aboutZoom);
    if (patch.merchZoom !== undefined) setMerchZoom(patch.merchZoom);
    if (patch.videoZoom !== undefined) setVideoZoom(patch.videoZoom);
    if (patch.viewport) setViewportId(patch.viewport);
    if (patch.diagnostic) setDiagnostic(patch.diagnostic);
    if (patch.theme) setTheme(patch.theme);
    if (patch.mode) setPlayMode(patch.mode);
    if (patch.namespace) setNamespace(patch.namespace);
    if (patch.screen && patch.screen !== "walkthrough") {
      controller.scrollToNode(SCREEN_NODE[patch.screen], "auto", "restore");
    }
    if (patch.screen === "walkthrough") {
      controller.scrollToNode("02", "auto", "restore");
    }
    const url = `${window.location.pathname}${promotionSearch(next)}`;
    if (history === "push") window.history.pushState({ sandbox: next }, "", url);
    else if (history === "replace") window.history.replaceState({ sandbox: next }, "", url);
  }, [aboutZoom, controller, diagnostic, merchZoom, namespace, playMode, production, screen, theme, videoZoom, viewportId]);
  useLayoutEffect(() => {
    applySandboxRef.current = applySandbox;
  }, [applySandbox]);

  useEffect(() => {
    if (production) return;
    const canonical = promotionSearch({
      screen,
      aboutZoom,
      merchZoom,
      videoZoom,
      viewport: viewportId,
      diagnostic,
      theme: theme === "dark" ? "dark" : "light",
      mode: playMode,
      namespace,
    });
    if (window.location.search !== canonical && window.location.search === "") {
      window.history.replaceState({ sandbox: parsePromotionQuery(canonical) }, "", `${window.location.pathname}${canonical}`);
    }
    const onPop = () => {
      const parsed = parsePromotionQuery(window.location.search);
      applySandbox({
        screen: parsed.screen,
        aboutZoom: parsed.aboutZoom,
        merchZoom: parsed.merchZoom,
        videoZoom: parsed.videoZoom,
        viewport: parsed.viewport,
        diagnostic: parsed.diagnostic,
        theme: parsed.theme,
        mode: parsed.mode,
        namespace: parsed.namespace,
      }, "none");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [aboutZoom, applySandbox, diagnostic, merchZoom, namespace, playMode, production, screen, theme, videoZoom, viewportId]);

  const frame = viewportId === "current" ? null : VIEWPORT_PIXELS[viewportId];
  const liveProfile = framingProfileFor({
    nodeId: contract?.hostNodeId ?? activeNode,
    geometryId: contract?.resolvedGeometryId ?? null,
    selection: { aboutZoom, merchZoom, videoZoom },
    width: frame?.width ?? (typeof window === "undefined" ? 1440 : window.innerWidth),
    height: frame?.height ?? (typeof window === "undefined" ? 900 : window.innerHeight),
  });
  const displayedZoom = txUi
    ? (txUi.sourceZoom ?? 1) + ((txUi.targetZoom ?? 1) - (txUi.sourceZoom ?? 1)) * (txUi.framingProgress ?? 1)
    : liveProfile.effectiveZoom;
  const showDiag = !production && (actorMask || diagnostic !== "final" || query.get("diag") === "1");

  return (
    <main
      className={styles.lab}
      data-theme={theme}
      data-mode={mode}
      data-actor-mask={actorMask ? "true" : "false"}
      data-ui={hideUi ? "off" : "on"}
      data-framed={frame ? "true" : "false"}
      data-viewport={viewportId}
      data-diagnostic={diagnostic}
      data-screen={screen}
      data-error={error ?? ""}
      style={{
        background: actorMask ? "#140028" : paper,
        colorScheme: theme,
        ...(frame ? { ["--frame-w" as string]: `${frame.width}px`, ["--frame-h" as string]: `${frame.height}px` } : {}),
      }}
    >
      <a className={styles.skip} href="#m4-main">К содержанию</a>
      <div
        ref={canvasHostRef}
        className={styles.canvasHost}
        data-identity={identity ? "true" : "false"}
        data-qa="m4-canvas"
        data-load-status={loadStatus}
        data-buffer-hash={bufferHash ?? ""}
        data-asset-namespace={production || namespace === "candidate" ? PAYLOAD_NAMESPACE : "ps-03-m3-1r"}
        data-framing-profile={OWNER_SELECTED_PROFILE_ID}
        data-screen={screen}
        data-about-zoom={aboutZoom}
        data-merch-zoom={merchZoom}
        data-video-zoom={videoZoom}
      >
        {sceneReady && source && target && program && manifest ? (
          <PS04M5Scene
            source={source}
            target={target}
            program={program}
            budget={16384}
            progress={snapshot.geometryProgress}
            reducedMotion={reducedMotion}
            debugMode={debugOverride ?? "neutral"}
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
            r6Staging={r6Staging}
            gpuPool={r6Staging ? gpuPool : null}
            gpuTimer={gpuTimer}
            instrumentation={r6}
            actorMask={actorMask || diagnostic === "mask"}
            diagnosticId="motion"
            qaControls={!production}
            onStats={setStats}
            onEnvironment={setEnvironment}
            onRenderer={(renderer) => pipelineRef.current.attachRenderer(renderer)}
            onContextState={(state) => {
              setContextState(state);
              if (state === "lost") {
                session.setPauseAll(true);
                pipelineRef.current.contextLost();
              }
              if (state === "restored") {
                session.setPauseAll(false);
                pipelineRef.current.restoreGpu();
                const sourceState = session.getSource();
                const targetState = session.getTarget();
                const restoredProgram = session.getProgram();
                if (r6StagingRef.current && sourceState && targetState && restoredProgram) {
                  pipelineRef.current.hydrateResident({
                    revision: coordinatorRef.current.snapshot().revision,
                    navigationToken: navigationRef.current.lastToken(),
                    source: sourceState,
                    target: targetState,
                    program: restoredProgram,
                    viewport: typeof window !== "undefined" && window.innerWidth <= 430 ? "mobile" : "desktop",
                  });
                }
                startClock();
              }
            }}
          />
        ) : null}
        {showDiag ? (
          <DiagnosticOverlay
            composition={compositionRef}
            magnetism={() => controller.getMagnetism()}
            diagnostic={diagnostic}
          />
        ) : null}
      </div>
      <PersistentHeader
        activeGroup={SCREEN_NODE_BY_ID[activeNode].headerGroup}
        onNavigate={navigate}
        theme={theme}
        onTheme={(value) => applySandbox({ theme: value })}
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
      {hud && !hideUi ? (
        <FramingReviewPanel
          mode={mode}
          screen={screen}
          aboutZoom={aboutZoom}
          merchZoom={merchZoom}
          videoZoom={videoZoom}
          viewport={viewportId}
          diagnostic={diagnostic}
          theme={theme === "dark" ? "dark" : "light"}
          playMode={playMode}
          loadStatus={loadStatus}
          requestedZoom={liveProfile.requestedZoom}
          displayedZoom={displayedZoom}
          sourceZoom={txUi?.sourceZoom ?? 1}
          targetZoom={txUi?.targetZoom ?? liveProfile.effectiveZoom}
          currentZoom={displayedZoom}
          effectiveZoom={liveProfile.effectiveZoom}
          framingRevision={txUi?.revision ?? 0}
          nodeId={contract?.hostNodeId ?? activeNode}
          geometryId={contract?.resolvedGeometryId ?? null}
          hash={bufferHash}
          cap={liveProfile.responsiveCap}
          capped={liveProfile.effectiveZoom + 1e-8 < liveProfile.requestedZoom}
          onScreen={(id) => applySandbox({ screen: id })}
          onAboutZoom={(value) => applySandbox({ aboutZoom: value })}
          onMerchZoom={(value) => applySandbox({ merchZoom: value })}
          onVideoZoom={(value) => applySandbox({ videoZoom: value })}
          onViewport={(id) => applySandbox({ viewport: id })}
          onDiagnostic={(id) => applySandbox({ diagnostic: id })}
          onTheme={(id) => applySandbox({ theme: id })}
          onMode={(value) => applySandbox({ mode: value })}
          namespace={namespace}
          onNamespace={(value) => applySandbox({ namespace: value })}
          assetNamespace={namespace === "candidate" ? PROMOTED_ASSET_NAMESPACE : "ps-03-m3-1r"}
          eventOverlay="none"
          videoOverlay="none"
          runtimeRotationOverride="none"
          framingProfile={OWNER_SELECTED_PROFILE_ID}
          onOpenLab={mode === "preview" ? () => {
            const search = promotionSearch({
              screen,
              aboutZoom,
              merchZoom,
              videoZoom,
              viewport: viewportId,
              diagnostic,
              theme: theme === "dark" ? "dark" : "light",
              mode: playMode,
              namespace,
            });
            window.history.pushState(null, "", `/visual-lab/photonic-skin-ps04-m5/promotion-preview/review${search}`);
            window.location.assign(`/visual-lab/photonic-skin-ps04-m5/promotion-preview/review${search}`);
          } : undefined}
        />
      ) : null}
    </main>
  );
}

function DiagnosticOverlay({
  composition,
  magnetism,
  diagnostic,
}: {
  composition: { current: CompositionViewport };
  magnetism: () => MagnetismSnapshot;
  diagnostic: FramingDiagnosticId;
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
        const header = root.querySelector("[data-reserved-header]");
        const graph = root.querySelector("[data-reserved-graph]");
        const ghost = root.querySelector("[data-ghost]");
        if (slot instanceof HTMLElement) {
          slot.style.left = `${viewport.cssLeft}px`;
          slot.style.top = `${viewport.cssTop}px`;
          slot.style.width = `${viewport.cssWidth}px`;
          slot.style.height = `${viewport.cssHeight}px`;
          slot.style.opacity = diagnostic === "safe-area" || diagnostic === "bbox" ? "1" : "0";
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
          const graphW = viewport.canvasCssWidth < 720 ? 56 : 92;
          lane.style.width = `${graphW}px`;
          lane.style.opacity = diagnostic === "safe-area" ? "1" : "0";
        }
        if (header instanceof HTMLElement) {
          header.style.height = "72px";
          header.style.opacity = diagnostic === "safe-area" ? "1" : "0";
        }
        if (graph instanceof HTMLElement) {
          const graphW = viewport.canvasCssWidth < 720 ? 56 : 92;
          graph.style.width = `${graphW}px`;
          graph.style.opacity = diagnostic === "safe-area" ? "1" : "0";
        }
        const snap = magnetism();
        if (label instanceof HTMLElement) {
          label.textContent = `css ${Math.round(viewport.canvasCssWidth)}×${Math.round(viewport.canvasCssHeight)} · zoom ${viewport.visualZoomMultiplier.toFixed(3)} · fit ${viewport.siteFitScale.toFixed(3)} · ${snap.mode}`;
        }
        ticks += 1;
        if (bbox instanceof HTMLElement && ticks % 8 === 0) {
          const measure = window.__PS04M5_MEASURE_ACTOR__?.();
          const box = measure?.actorMaskBBoxCss;
          if (box && (diagnostic === "bbox" || diagnostic === "safe-area" || diagnostic === "mask" || diagnostic === "baseline")) {
            bbox.style.display = "block";
            bbox.style.left = `${box.left}px`;
            bbox.style.top = `${box.top}px`;
            bbox.style.width = `${box.width}px`;
            bbox.style.height = `${box.height}px`;
            bbox.dataset.fraction = measure.actorVisibleFraction.toFixed(3);
          } else {
            bbox.style.display = "none";
          }
          if (ghost instanceof HTMLElement) {
            if (diagnostic === "baseline" && box && viewport.visualZoomMultiplier > 0) {
              const width = box.width / viewport.visualZoomMultiplier;
              const height = box.height / viewport.visualZoomMultiplier;
              ghost.style.display = "block";
              ghost.style.left = `${box.left + (box.width - width) / 2}px`;
              ghost.style.top = `${box.top + (box.height - height) / 2}px`;
              ghost.style.width = `${width}px`;
              ghost.style.height = `${height}px`;
            } else {
              ghost.style.display = "none";
            }
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [composition, diagnostic, magnetism]);
  return (
    <div ref={rootRef} className={styles.diagRoot} data-qa="m54-diag">
      <div className={styles.diagCanvas} data-canvas />
      <div className={styles.diagLane} data-lane />
      <div className={styles.diagSlot} data-slot />
      <div className={styles.diagBbox} data-bbox />
      <div className={styles.diagCenter} data-center />
      <div className={styles.diagHeader} data-reserved-header />
      <div className={styles.diagGraph} data-reserved-graph />
      <div className={styles.diagGhost} data-ghost />
      <div className={styles.diagLabel} data-label />
    </div>
  );
}
