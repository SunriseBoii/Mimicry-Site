"use client";

import { prepareGeometry } from "../final-r2/geometry-worker-client";
import type { TransitionProgram } from "../../photonic-skin-m4-1/m41-evaluator";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CompetenceId } from "../../../_brand/color-system";
import type { DebugMode, M3Manifest, M41Manifest } from "../../photonic-skin-m4-1/m41-data";
import { RELEASE_FRAMING } from "../../../_photonic-skin/release";
import { captureMasterPaletteWeight } from "../../../_photonic-skin/contact-surface";
import { withoutActorAnticipation } from "../../../_photonic-skin/playback-program";
import { loadPS04MotionManifest, PS04_ROUTE_DURATION_MS } from "../../../_photonic-skin/ps04-motion-release";
import { loadBuilderRuntime } from "../project-builder-semantics/delta-runtime";
import { M61_NAMESPACE, namespaceForStateId } from "../project-builder-semantics/builder-ids";
import { MATERIAL_THEME_PRESETS, defaultM2MaterialController, type MaterialTheme } from "../../photonic-skin-ps04-m3/material-foundation";
import { PhotonicMotionSession, type SessionSnapshot } from "../../photonic-skin-ps04-m3/session";
import { compileLiveRetarget, viewportForFrame } from "../../photonic-skin-ps04-m3/runtime";
import { PS04M5Scene, type SceneEnvironment, type SceneStats } from "../../photonic-skin-ps04-m5/PS04M5Scene";
import { initialAdaptiveDpr, nextAdaptiveDpr } from "../../photonic-skin-ps04-m5/adaptive-dpr";
import { requestFromContract, type ActorRequest } from "../../photonic-skin-ps04-m5/actor-resolver";
import { indexStates, type ScreenActorContract } from "../../photonic-skin-ps04-m5/screen-actor-contract";
import { resolveBuilderActorContract, builderPhase, assertNoForbiddenFallback } from "../project-builder-semantics/builder-resolver";
import {
  CONTACT_SIMULATED_DELAY_MS,
  INITIAL_BUILDER_FLOW,
  builderView,
  closeOverlay,
  confirmCompetencies,
  editBrief,
  openContact,
  simulateSuccess,
  validateContact,
  bindConfirmedHash,
  type BuilderFlowState,
  type BuilderTaskId,
} from "../project-builder-semantics/builder-flow";
import { hoverPreviewFor, IDLE_HOVER_PREVIEW, type BuilderHoverPreview } from "../project-builder-semantics/hover-preview";
import {
  actorSquareCss,
  envelopeOverflow,
  sampleComposition,
  siteEnvelopeCss,
  targetForNode,
  viewportFromCenter,
  type CompositionViewport,
} from "../../photonic-skin-ps04-m5/composition";
import { ContactDialog, SuccessStatus } from "../../photonic-skin-ps04-m5/components/ContactDialog";
import { PersistentHeader } from "../../photonic-skin-ps04-m5/components/PersistentHeader";
import { ProgressGraph } from "../../photonic-skin-ps04-m5/components/ProgressGraph";
import {
  AboutScreen,
  CasesScreen,
  CompetenceChapter,
  ContactScreen,
  FooterScreen,
  HeroScreen,
  StudioChapter,
} from "../../photonic-skin-ps04-m5/components/ScreenFixtures";
import { BuilderChapter } from "../project-builder-semantics/BuilderChapter";
import {
  reduceProjectBuilderAction,
  type BuilderActionTrace,
  type ProjectBuilderAction,
} from "./builder-ui-action";
import { nextUnlocked, previousUnlocked, restoreScrollY, ScrollCompositionController, SELECTED_MAGNETISM_VARIANT, type MagnetismSnapshot, type ScrollProgress } from "../../photonic-skin-ps04-m5/scroll-controller";
import { isNodeUnlocked } from "../../photonic-skin-ps04-m5/graph-model";
import { SCREEN_NODE_BY_ID, type ScreenNodeId } from "../../photonic-skin-ps04-m5/topology";
import { ActorTransitionCoordinator, interceptGeometryLinkedProgress, semanticActorKey, type DisplayedPlacement, type ActorTransitionTransaction } from "../../photonic-skin-ps04-m5/transition-coordinator";
import { GeometryIdTrace, traceFromTransaction } from "../../photonic-skin-ps04-m5/geometry-id-trace";
import { M5TransitionTrace, m5FrameFromTransaction } from "../../photonic-skin-ps04-m5/m5-transition-trace";
import { NaturalRafRecorder } from "../../photonic-skin-ps04-m5/natural-raf-recorder";
import { CONTINUITY_FLOOR, DEFAULT_CONTINUITY_LIFT_ENABLED } from "../../photonic-skin-ps04-m5/continuity-overlay";
import { commitDriverToMask, type PaletteMaterialSnapshot } from "../../photonic-skin-ps04-m5/palette-authority";
import {
  EMPTY_GEOMETRY_ACK,
  selectProgramSourceMode,
  type GeometryMaterialSnapshot,
  type GeometryProgramBind,
  type GeometryRenderAck,
} from "../../photonic-skin-ps04-m5/geometry-authority";
import { MagnetizedSettleController, type MagnetizedSettleTelemetry } from "./magnetized-settle-runtime";
import { MagnetizedSettleHud } from "./MagnetizedSettleHud";
import {
  DEFAULT_R1_MAGNETISM_PROFILE,
  captureRadiusPx,
  isMagnetismProfileId,
  magneticStrengthMonotonic,
  magnetismProfile,
  type MagnetismProfileId,
} from "../magnetized-settle-r1/magnetism-profile";
import {
  computePresentationPlacement,
  createPlacementChannelTelemetry,
  placementDeltaPx,
  settledSlotSample,
} from "../magnetized-settle-r1/presentation-placement";
import { R1MagneticDriver } from "../magnetized-settle-r1/r1-magnetic-driver";
import type { TransitionUniforms } from "../../photonic-skin-ps04-m5/PS04M5Scene";
import styles from "../../photonic-skin-ps04-m5/ps04m5.module.css";
import { GpuTexturePool } from "../../photonic-skin-ps04-m5/gpu-texture-pool";
import { ActorResourcePipeline } from "../../photonic-skin-ps04-m5/resource-lifecycle";
import { DisjointGpuTimer, R6Instrumentation, r6GpuTimerEnabled, r6StagingEnabled } from "../../photonic-skin-ps04-m5/r6-instrumentation";
import { FramingSandboxProgramCache, builderToggleNeighborPairs, frozenProgramKey, reachableFrozenPairs, defaultGeometryForNode } from "../project-builder-semantics/builder-prewarm";
import {
  SCREEN_NODE,
  VIEWPORT_PIXELS,
  type FramingDiagnosticId,
  type FramingPlayMode,
  type FramingScreenQuery,
  type FramingThemeId,
  type FramingViewportId,
} from "../../photonic-skin-ps04-m5/framing-sandbox/sandbox-query";
import { parsePromotionQuery, promotionSearch, type PromotionNamespaceId } from "../project-builder-semantics/builder-query";
import { OWNER_SELECTED_PROFILE_ID, SELECTED_EVENT_HASH, SELECTED_VIDEO_HASH, SELECTED_VIDEO_VARIANT, framingProfileFor, type AboutZoomPercent, type FramingSelection, type MerchZoomPercent, type VideoZoomPercent } from "../../photonic-skin-ps04-m5/framing";
import { createLoadGate, type SandboxLoadStatus } from "../../photonic-skin-ps04-m5/framing-sandbox/sandbox-load-gate";
import { BuilderReviewPanel } from "./SettleReviewPanel";
import { Experience } from "../../../_ps05/Experience";
import { useSystemMotion } from "../../../_ps05/primitives";
import { isReadingFlow, readingLayout, ps05Composition } from "../../../_ps05/layout";
import ps05Styles from "../../../_ps05/ps05.module.css";
import { Ps05Motion } from "../../../_ps05/motion";
import { THEMES, themeProperties } from "../../../_ps05/design-tokens";

declare global {
  interface Window {
    __PS04M62_LAB__?: Record<string, unknown>;
    __PS04M62R1_LAB__?: Record<string, unknown>;
    __PS04M62R2_LAB__?: Record<string, unknown>;
    __PS04M61_LAB__?: Record<string, unknown>;
    __PS04M5_LAB__?: Record<string, unknown>;
  }
}

export type MagnetizedSettleStage = "m62" | "r1" | "r2" | "final" | "final-r2";

function finalRuntime(stage: MagnetizedSettleStage) {
  return stage === "final" || stage === "final-r2";
}

function r1Runtime(stage: MagnetizedSettleStage) {
  return stage === "r1" || stage === "r2" || finalRuntime(stage);
}

function stageRuntime(stage: MagnetizedSettleStage) {
  if (finalRuntime(stage)) {
    return {
      sessionId: stage === "final-r2" ? "ps04-final-r2" : "ps04-final-r1",
      runId: stage === "final-r2" ? "ps04-final-r2" : "ps04-final-r1",
      label: stage === "final-r2" ? "PS-04 final R2" : "PS-04 final R1",
      hudQa: "ps04-final-hud",
      hudTitle: "PS-04 final",
    };
  }
  if (stage === "r2") {
    return {
      sessionId: "ps04-m6-2-r2-magnetized-settle",
      runId: "ps04-m6-2-r2",
      label: "PS-04.M6.2-R2",
      hudQa: "m62r2-settle-hud",
      hudTitle: "M6.2-R2 settle",
    };
  }
  if (stage === "r1") {
    return {
      sessionId: "ps04-m6-2-r1-magnetized-settle",
      runId: "ps04-m6-2-r1",
      label: "PS-04.M6.2-R1",
      hudQa: "m62r1-settle-hud",
      hudTitle: "M6.2-R1 settle",
    };
  }
  return {
    sessionId: "ps04-m6-2-magnetized-settle",
    runId: "ps04-m6-2",
    label: "PS-04.M6.2",
    hudQa: "m62-settle-hud",
    hudTitle: "M6.2 settle",
  };
}

function guardBuilderContract(contract: ScreenActorContract) {
  if (contract.hostNodeId.startsWith("03")) assertNoForbiddenFallback(contract);
}

function parseMagnetismProfile(query: URLSearchParams): MagnetismProfileId {
  const requested = query.get("magnetismProfile");
  return isMagnetismProfileId(requested) ? requested : DEFAULT_R1_MAGNETISM_PROFILE;
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

function nodeFromHash(): ScreenNodeId | null {
  if (typeof window === "undefined") return null;
  const match = /^#screen-(.+)$/.exec(window.location.hash);
  if (!match) return null;
  const id = decodeURIComponent(match[1]) as ScreenNodeId;
  return SCREEN_NODE_BY_ID[id] ? id : null;
}

function parseLabDpr(query: URLSearchParams) {
  const raw = Number(query.get("dpr"));
  if (raw === 1 || raw === 1.25 || raw === 1.5 || raw === 2) return raw;
  if (typeof window !== "undefined") return window.devicePixelRatio || 1;
  return 1;
}

function releasePlaybackProgram(
  program: TransitionProgram,
  stage: MagnetizedSettleStage,
  route: boolean,
): TransitionProgram {
  if (stage === "final-r2") program = withoutActorAnticipation(program);
  if (!finalRuntime(stage) || !route || program.selfTransition || program.durationMs <= 0) return program;
  // Geometry is normalized in the shader; playback time is a runtime choice.
  const durationMs = window.innerWidth <= 430 ? PS04_ROUTE_DURATION_MS.mobile : PS04_ROUTE_DURATION_MS.desktop;
  return { ...program, durationMs,
    compiled: stage === "final-r2" && program.compiled
      ? { ...program.compiled, header: { ...program.compiled.header, durationSeconds: durationMs / 1000 } }
      : program.compiled,
  };
}

function commitBuilderConfirm(current: BuilderFlowState, manifest: M3Manifest | null) {
  const result = confirmCompetencies(current);
  if (result.error || !result.state.confirmed || !manifest) return result;
  const entry = manifest.states.find((item) => item.stateId === result.state.confirmed?.resolvedStateId);
  if (!entry) return result;
  return { error: result.error, state: bindConfirmedHash(result.state, entry.contentHash) };
}

function bootstrapReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MagnetizedSettleLab({ mode, stage = "m62", refinedScales = false, ps05 = false }: { mode: "lab" | "preview"; stage?: MagnetizedSettleStage; refinedScales?: boolean; ps05?: boolean }) {
  const production = finalRuntime(stage) && mode === "preview";
  const query = production ? new URLSearchParams() : labQuery();
  const sandbox = production
    ? {
      screen: "about" as FramingScreenQuery,
      aboutZoom: RELEASE_FRAMING.aboutZoomPercent,
      merchZoom: RELEASE_FRAMING.merchZoomPercent,
      videoZoom: RELEASE_FRAMING.videoZoomPercent,
      viewport: "current" as FramingViewportId,
      diagnostic: "final" as FramingDiagnosticId,
      theme: (ps05 && typeof window !== 'undefined' && ['light','dark'].includes(new URLSearchParams(location.search).get('theme') ?? '')
        ? new URLSearchParams(location.search).get('theme')
        : typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light") as FramingThemeId,
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
  const initialHashNodeRef = useRef(nodeFromHash());
  const bootTargetOverrideRef = useRef<ScreenNodeId | null>(null);
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
  const manualDpr = !production && query.has("dpr");
  const adaptiveDprRef = useRef(initialAdaptiveDpr(
    typeof window === "undefined" ? 1440 : window.innerWidth,
    typeof window === "undefined" ? 900 : window.innerHeight,
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
  ));
  const [dpr, setDpr] = useState(() => finalRuntime(stage) && !manualDpr
    ? initialAdaptiveDpr(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1).dpr
    : parseLabDpr(query));
  const [manualReduced, setManualReduced] = useState(!production && query.get("reduced") === "1");
  const [hud] = useState(mode === "lab" && query.get("hud") !== "0");
  const [namespace, setNamespace] = useState<PromotionNamespaceId>(production ? "candidate" : sandbox.namespace);
  const [stats, setStats] = useState<SceneStats>(EMPTY_STATS);
  const [environment, setEnvironment] = useState<SceneEnvironment | null>(null);
  const [contextState, setContextState] = useState<"ready" | "lost" | "restored">("ready");
  const contextLostRef = useRef(false);
  const [firstGpuFrame, setFirstGpuFrame] = useState(false);
  const firstGpuFrameRef = useRef(false);
  const firstGpuTargetRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [contactErrors, setContactErrors] = useState<ReturnType<typeof validateContact>>({});
  const [promotedManifest, setPromotedManifest] = useState<M3Manifest | null>(null);
  const [motionManifest, setMotionManifest] = useState<M41Manifest | null>(null);
  const manifest = promotedManifest;
  const [flow, setFlow] = useState<BuilderFlowState>(INITIAL_BUILDER_FLOW);
  const [hoverPreview, setHoverPreview] = useState<BuilderHoverPreview>(IDLE_HOVER_PREVIEW);
  const staticMode = query.get("static") === "1";
  const [activeNode, setActiveNode] = useState<ScreenNodeId>(
    production ? (nodeFromHash() ?? "01") : (sandbox.screen === "walkthrough" ? "02" : SCREEN_NODE[sandbox.screen]),
  );
  const [ui, setUi] = useState<SessionSnapshot | null>(null);
  const [txUi, setTxUi] = useState<ActorTransitionTransaction | null>(null);
  const [gpuUi, setGpuUi] = useState<GeometryMaterialSnapshot | null>(null);
  const [firstVisibleMs, setFirstVisibleMs] = useState<number | null>(null);
  const systemReduced = useSystemMotion();
  const reducedMotion = systemReduced || manualReduced;
  const session = useMemo(() => new PhotonicMotionSession({
    reducedMotion: bootstrapReducedMotion(),
    overlayMode: "m3-combined",
    profile: "desktop",
  }), []);
  useLayoutEffect(() => {
    interceptGeometryLinkedProgress(session.palette);
  }, [session]);
  useLayoutEffect(() => {
    if (finalRuntime(stage)) session.setIdleChannel("breathing");
  }, [session, stage]);
  const controller = useMemo(() => new ScrollCompositionController(), []);
  const ps05Ref = useRef(ps05);
  const ps05MotionRef = useRef(new Ps05Motion());
  useLayoutEffect(() => {
    if (!ps05) return;
    controller.setCssAnchorAlignment(true);
    const prepareLayout = () => {
      const root = document.querySelector<HTMLElement>('[data-ps05]');
      if (!root) return false;
      const wasReading = root.dataset.reading === 'true';
      const copies = [...root.querySelectorAll<HTMLElement>('[data-ps05-copy]')];
      const reading = innerWidth <= 1100 || innerHeight < 800 || copies.some(copy => {
        const spacing = getComputedStyle(copy.parentElement!);
        return copy.scrollHeight > innerHeight - parseFloat(spacing.paddingTop) - parseFloat(spacing.paddingBottom);
      });
      root.dataset.reading = String(reading);
      return wasReading !== reading;
    };
    controller.setLayoutAdapter(readingLayout, prepareLayout);
    const syncAccessibility = () => {
      const root = document.querySelector<HTMLElement>('[data-ps05]');
      if (!root) return;
      const current = controller.getProgress().activeNodeId;
      for (const element of root.querySelectorAll<HTMLElement>('[data-node]')) {
        const hidden = !isReadingFlow() && element.dataset.node !== current;
        element.inert = hidden; element.setAttribute('aria-hidden', String(hidden));
      }
    };
    const unsubscribeAccessibility = controller.subscribeDiscrete(syncAccessibility);
    const update = () => {
      const previous = controller.getProgress().activeNodeId;
      if (prepareLayout()) controller.scrollToNode(previous, 'auto', 'restore');
      controller.refreshLayout();
      ps05MotionRef.current.refresh();
      syncAccessibility();
    };
    update();
    const observer = new ResizeObserver(update);
    document.querySelectorAll('[data-ps05-copy]').forEach(element => observer.observe(element));
    return () => { observer.disconnect(); unsubscribeAccessibility(); controller.setLayoutAdapter(null); controller.setCssAnchorAlignment(false); };
  }, [controller, ps05, flow.unlock]);
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
  const runtimeMeta = stageRuntime(stage);
  const sessionId = runtimeMeta.sessionId;
  const [magnetismProfileId, setMagnetismProfileId] = useState<MagnetismProfileId>(() => (
    r1Runtime(stage) ? parseMagnetismProfile(query) : "M6_2_CURRENT"
  ));
  const magnetismProfileIdRef = useRef(magnetismProfileId);
  const stageRef = useRef(stage);
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
  const manifestRef = useRef(manifest);
  const builderActionLogRef = useRef<BuilderActionTrace[]>([]);
  const lastBuilderActionRef = useRef<BuilderActionTrace | null>(null);
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
  const geometryPrepareAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => geometryPrepareAbortRef.current?.abort(), []);
  const renderedFrameRef = useRef<import("../../photonic-skin-ps04-m5/PS04M5Scene").RenderedGeometryFrame | null>(null);
  const geometryAckRef = useRef<GeometryRenderAck>({ ...EMPTY_GEOMETRY_ACK });
  const settleRef = useRef(new MagnetizedSettleController({ earlyTransitions: finalRuntime(stage), latestPreparedWins: stage === "final-r2" }));
  const settleTelemetryRef = useRef<MagnetizedSettleTelemetry | null>(null);
  const [settleHud, setSettleHud] = useState<MagnetizedSettleTelemetry | null>(null);
  const [r1HudExtras, setR1HudExtras] = useState<Array<[string, string | number | boolean | null]>>([]);
  const layoutRevisionRef = useRef(1);
  const lastValidSlotRef = useRef<"left" | "right">("right");
  const placementTelemetryRef = useRef(createPlacementChannelTelemetry());
  const r1HudExtrasRef = useRef<Array<[string, string | number | boolean | null]>>([]);
  const magneticDriver = useMemo(
    () => (r1Runtime(stage) ? new R1MagneticDriver(controller) : null),
    [controller, stage],
  );
  const magneticDriverRef = useRef(magneticDriver);
  const programCache = useMemo(() => new FramingSandboxProgramCache(), []);
  const programCacheRef = useRef(programCache);
  const builderPrewarmSourceRef = useRef<string | null>(null);
  useEffect(() => {
    programCacheRef.current.releaseGeometry = stage === "final-r2" ? "r2" : finalRuntime(stage);
    programCacheRef.current.contactSurface = refinedScales;
    programCacheRef.current.namespace = namespace;
    programCacheRef.current.variant = `${OWNER_SELECTED_PROFILE_ID}|${namespace}|${stage === "final-r2" ? "release-r2" : finalRuntime(stage) ? "release-r1" : "baseline"}${refinedScales ? "|contact-v1" : ""}`;
  }, [namespace, stage, refinedScales]);
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
      if (packet && (packet.bindCommitted || drawnCurrentPacket)
        && (stageRef.current !== "final-r2" || coordinator.isCurrent(packet.revision))) {
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
      const index = stateIndexRef.current;
      const flowNow = flowRef.current;
      const flowArgs = builderView(flowNow);
      const settle = settleRef.current;
      const magnetism = controller.getMagnetism();
      const layout = controller.layout();
      if (r1Runtime(stageRef.current)) {
        magneticDriverRef.current?.step(dt, window.scrollY, progress.viewportHeight, window);
      }
      const destinationId = controller.getPendingTarget() ?? magnetism.candidateId ?? progress.activeNodeId;
      const anchorY = restoreScrollY(layout, destinationId, 0);
      const restoreDistance = Math.abs(progress.scrollY - anchorY);
      const magneticDistance = magnetism.candidateId ? magnetism.distancePx : restoreDistance;
      settle.setResolveContract((nodeId) => {
        if (!index) return { nodeId, key: nodeId };
        try {
          const resolved = resolveBuilderActorContract({
            nodeId,
            overlay: flowNow.overlay,
            index,
            flow: flowArgs,
          });
          return { nodeId, key: semanticActorKey(resolved).serialized };
        } catch {
          return { nodeId, key: nodeId };
        }
      });
      settle.noteActorFrame({
        status: tx.status,
        visualLifecycle: tx.visualLifecycle,
        geometryProgress: tx.geometryProgress,
        paletteProgress: tx.paletteProgress,
        siteProgress: tx.siteProgress,
        programReady: tx.programReady,
        visualPublished: tx.visualPublished,
        targetNodeId: tx.targetNodeId,
        endpointKey: coordinator.lastSemanticKey()?.serialized ?? requestKeyRef.current,
      }, now);
      // Before the manifest boot adopts its intended route, the browser is
      // still at scrollY=0. Settling that temporary 01 would enqueue MASTER
      // and its late GPU bind could overwrite a cold deep link to Event.
      const telemetry = session.getSource() ? settle.tick({
        nowMs: now,
        scrollY: progress.scrollY,
        viewportHeight: progress.viewportHeight,
        observedNodeId: progress.activeNodeId,
        magneticCandidateId: magnetism.candidateId,
        pendingTarget: controller.getPendingTarget(),
        mode: controller.getMode(),
        gestureActive: controller.getMode() === "user",
        snapAnimationPending: controller.getMode() === "magnetic",
        layoutRevision: layoutRevisionRef.current,
        distanceToAnchorPx: ps05Ref.current && isReadingFlow() ? 0 : Math.min(restoreDistance, magneticDistance),
        reducedMotion: reducedRef.current,
      }) : settle.snapshot(now);
      settleTelemetryRef.current = telemetry;
      if (finalRuntime(stageRef.current) && session.getSource() && telemetry.scrollPhase === "Settled"
        && telemetry.magnetizedSettledNodeId) {
        const nextHash = `#screen-${telemetry.magnetizedSettledNodeId}`;
        if (window.location.hash !== nextHash) {
          window.history.replaceState({ node: telemetry.magnetizedSettledNodeId }, "", nextHash);
        }
      }
      const settledNode = telemetry.magnetizedSettledNodeId ?? progress.activeNodeId;
      let hudContract: ScreenActorContract | null = null;
      try {
        hudContract = index
          ? resolveBuilderActorContract({
            nodeId: settledNode,
            overlay: flowNow.overlay,
            index,
            flow: flowArgs,
          })
          : null;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
      if (hudContract) contractRef.current = hudContract;
      const builderHost = telemetry.magnetizedSettledNodeId ?? progress.activeNodeId;
      const builderEligible = flowNow.unlock.competencies
        && (builderHost === "03.1" || builderHost === "03.2");
      const builderPairs = builderEligible
        ? builderToggleNeighborPairs(flowNow.draft.competencies)
        : null;
      const builderSource = builderPairs?.[0]?.[0] ?? null;
      const builderReady = builderSource !== null
        && tx.status === "settled"
        && coordinator.geometrySnapshot().settledGeometryId === builderSource;
      const builderContinuing = builderEligible && builderPrewarmSourceRef.current === builderSource;
      if (!builderReady && !builderContinuing && builderPrewarmSourceRef.current !== null) {
        programCacheRef.current.cancel();
        builderPrewarmSourceRef.current = null;
        canvasHostRef.current?.removeAttribute("data-builder-prewarm");
      }
      if (settle.consumeCancel()) {
        pipelineRef.current.cancelPending("scroll-before-visual");
        const sourceId = session.getSource()?.entry.stateId;
        if (sourceId) session.beginRequest(sourceId);
        const sourceContract = contractRef.current;
        if (sourceContract) coordinator.adoptSettled(sourceContract, identityRef.current, visualRef.current.zoom);
        requestKeyRef.current = coordinator.lastSemanticKey()?.serialized ?? "";
      }
      const prewarm = settle.consumePrewarm();
      const manifests = manifestsRef.current;
      if (prewarm && manifests.m3 && prewarm.nodeId !== "03.2"
        && !(prewarm.nodeId === "03.1" && builderPrewarmSourceRef.current !== null)) {
        const viewport = window.innerWidth <= 430 ? "mobile" : "desktop";
        programCacheRef.current.setBudget(viewport === "mobile");
        programCacheRef.current.startRoutePrewarm({
          current: prewarm.nodeId,
          manifest: manifests.m3,
          motion: manifests.m4,
          reducedMotion: reducedRef.current,
          direction: progress.direction,
          hidden: () => session.snapshot().offscreen
            || document.visibilityState === "hidden"
            || coordinator.snapshot().visualLifecycle === "morphing"
            || coordinator.snapshot().visualLifecycle === "preparing"
            || pipelineRef.current.state === "gpu-staging"
            || pipelineRef.current.state === "cpu-preparing",
        });
      }
      if (builderReady && manifests.m3 && builderPrewarmSourceRef.current !== builderSource) {
        builderPrewarmSourceRef.current = builderSource;
        const viewport = window.innerWidth <= 430 ? "mobile" : "desktop";
        const cache = programCacheRef.current;
        const reportPrewarm = () => {
          const host = canvasHostRef.current;
          if (!host || !builderPairs) return;
          host.dataset.builderPrewarm = builderPairs
            .map(([source, target]) => `${target}:${cache.status(source, target, reducedRef.current)}`)
            .join("|");
        };
        cache.setBudget(viewport === "mobile");
        cache.startBuilderNeighborPrewarm({
          draftCompetencies: flowNow.draft.competencies,
          manifest: manifests.m3,
          motion: manifests.m4,
          reducedMotion: reducedRef.current,
          onProgress: reportPrewarm,
          hidden: () => {
            const host = settle.snapshot().magnetizedSettledNodeId;
            return session.snapshot().offscreen
              || document.visibilityState === "hidden"
              || controller.getMode() !== "idle"
              || coordinator.snapshot().visualLifecycle !== "settled"
              || (host !== "03.1" && host !== "03.2");
          },
        });
        reportPrewarm();
      }
      const intent = settle.consumeBegin();
      if (index && intent) {
        try {
          const actorContract = resolveBuilderActorContract({
            nodeId: intent.nodeId,
            overlay: flowNow.overlay,
            index,
            flow: flowArgs,
          });
          guardBuilderContract(actorContract);
          const semantic = semanticActorKey(actorContract).serialized;
          if (semantic !== requestKeyRef.current) {
            requestKeyRef.current = semantic;
            actorRequestLogRef.current.push(intent.nodeId);
            requestActorRef.current(actorContract);
            setContract(actorContract);
          }
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason));
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
      const mixedFit = tx.sourceFit + (tx.targetFit - tx.sourceFit) * fitU;
      const r1Placement = r1Runtime(stageRef.current)
        ? computePresentationPlacement({
          scrollY: window.scrollY,
          layout,
          width: size.width,
          height: size.height,
          dpr: liveDpr,
          identity: liveIdentity,
          magnetizedSettledNodeId: telemetry.magnetizedSettledNodeId,
          scrollPhase: telemetry.scrollPhase,
          lastValidSlot: lastValidSlotRef.current,
        })
        : null;
      if (r1Placement) lastValidSlotRef.current = r1Placement.lastValidSlot;
      const mixedX = r1Placement
        ? r1Placement.displayedPlacement.x
        : from.x + (targetSample.cssCenterX - from.x) * siteU;
      const mixedY = r1Placement
        ? r1Placement.displayedPlacement.y
        : from.y + (targetSample.cssCenterY - from.y) * siteU;
      const mixedSize = r1Placement
        ? r1Placement.displayedPlacement.size
        : from.size + (targetSample.cssSize - from.size) * siteU;
      visualRef.current.x = mixedX;
      visualRef.current.y = mixedY;
      visualRef.current.size = mixedSize;
      visualRef.current.siteFit = mixedFit;
      const framingU = liveReduced || liveIdentity ? 1 : (tx.framingProgress ?? 1);
      visualRef.current.zoom = (tx.sourceZoom ?? 1) + ((tx.targetZoom ?? 1) - (tx.sourceZoom ?? 1)) * framingU;
      if (r1Placement) {
        visualRef.current.visible = r1Placement.visible;
        visualRef.current.exitHold = r1Placement.visible ? 0 : visualRef.current.exitHold + dt;
      } else {
        if (!target.visible) visualRef.current.exitHold = (visualRef.current.exitHold ?? 0) + dt;
        else visualRef.current.exitHold = 0;
        const distance = Math.hypot(targetSample.cssCenterX - visualRef.current.x, targetSample.cssCenterY - visualRef.current.y);
        const hide = !target.visible && (liveReduced || distance < 12 || visualRef.current.exitHold > 0.72);
        visualRef.current.visible = target.visible || !hide;
      }
      if (r1Placement && telemetry.scrollPhase === "Settled" && telemetry.magnetizedSettledNodeId && telemetry.magnetizedSettledNodeId !== "08") {
        const settled = settledSlotSample({
          nodeId: telemetry.magnetizedSettledNodeId,
          width: size.width,
          height: size.height,
          dpr: liveDpr,
          lastValidSlot: lastValidSlotRef.current,
        });
        placementTelemetryRef.current.postSettlePlacementDeltaPx = placementDeltaPx(r1Placement.displayedPlacement, settled);
      }
      const magneticSnap = magneticDriverRef.current?.snapshot(progress.viewportHeight);
      r1HudExtrasRef.current = r1Placement ? [
        ["presentationSourceNodeId", r1Placement.presentationSourceNodeId],
        ["presentationTargetNodeId", r1Placement.presentationTargetNodeId],
        ["routeSegmentProgress", r1Placement.routeSegmentProgress.toFixed(3)],
        ["displayedPlacement", `${Math.round(r1Placement.displayedPlacement.x)},${Math.round(r1Placement.displayedPlacement.y)} ${r1Placement.displayedPlacement.slot}`],
        ["captureRadiusPx", magneticSnap ? magneticSnap.captureRadiusPx.toFixed(1) : null],
        ["distanceToNearestAnchorPx", magneticSnap ? magneticSnap.distanceToAnchorPx.toFixed(1) : null],
        ["magneticStrength", magneticSnap ? magneticSnap.magneticStrength.toFixed(3) : null],
        ["magneticStrengthM62", magneticSnap ? magneticSnap.magneticStrengthM62.toFixed(3) : null],
        ["magneticStrengthR1", magneticSnap ? magneticSnap.magneticStrengthR1.toFixed(3) : null],
        ["magnetismProfile", magneticSnap?.profileId ?? magnetismProfileIdRef.current],
        ["geometryId", hudContract?.resolvedGeometryId ?? null],
        ["stateHash", session.getTarget()?.entry.contentHash ?? session.getSource()?.entry.contentHash ?? null],
        ["paletteMask", hudContract?.paletteMask ?? null],
        ["placementActorRequestCount", placementTelemetryRef.current.placementActorRequestCount],
        ["placementCompileCount", placementTelemetryRef.current.placementCompileCount],
        ["placementQueueDepth", placementTelemetryRef.current.placementQueueDepth],
        ["postSettlePlacementDeltaPx", placementTelemetryRef.current.postSettlePlacementDeltaPx.toFixed(2)],
      ] : [];
      if (now - clock.lastUi > 80) {
        setSettleHud(telemetry);
        if (r1Runtime(stageRef.current)) setR1HudExtras(r1HudExtrasRef.current);
      }
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
        slot: r1Placement
          ? r1Placement.displayedPlacement.slot
          : (siteU >= 1 ? targetSample.slot : tx.sourceSlot),
      });
      if (ps05Ref.current) compositionRef.current = ps05MotionRef.current.update(ps05Composition(compositionRef.current, progress.activeNodeId), liveReduced, now, progress);
      transitionRef.current = {
        paletteOwnershipMode: tx.paletteOwnershipMode,
        continuityEnabled: continuityLiftRef.current ? tx.continuityEnabled : 0,
        continuityFloor: CONTINUITY_FLOOR,
        identity: liveIdentity,
      };
      if (!visualRef.current.visible) session.setOffscreen(true);
      else if (sessionSnap.offscreen && visualRef.current.visible) session.setOffscreen(false);
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
        const committedNode = settleRef.current.snapshot().actorCommittedNodeId ?? progress.activeNodeId;
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
            visibleScreenNodeId: progress.activeNodeId,
            rawObservedNodeId: progress.activeNodeId,
            magneticCandidateId: modeNow.magneticCandidateId,
            committedNodeId: committedNode,
            semanticTargetNodeId: tx.targetNodeId,
            semanticEndpointKey: coordinator.lastSemanticKey()?.serialized ?? null,
            queuedActorNodeId: settleRef.current.snapshot().queuedActorNodeId,
            navigationToken: settleRef.current.snapshot().magneticSettleRevision,
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
            shaderPaletteMask: paletteSnapshotRef.current?.shaderMask ?? null,
            shaderPaletteProgress: paletteSnapshotRef.current?.shaderProgress ?? null,
            overlayQuaternion: [...sessionSnap.overlay.quaternion],
            materialUuid: uniforms?.materialUuid ?? null,
            textureIdentity: uniforms?.textureIdentity ?? null,
            prewarm: programCacheRef.current.stats.lastStatus,
            prewarmCount: programCacheRef.current.stats.prewarms,
            bindCommitted: packetNow?.bindCommitted ?? false,
            drawnProgress: ack.drawnProgress,
            drawnProgramId: ack.drawnProgramId,
            firstChangedGeometryFrame: ack.drawnRevision === tx.revision && ack.drawnProgress > 0,
          });
        }
      }
      split.compose = performance.now() - clockStarted;
      if (now - clock.lastUi > 160 || clock.lastUi === 0) {
        setUi(sessionSnap);
        setTxUi(tx);
        setGpuUi(geometrySnapshotRef.current);
        setFirstVisibleMs(coordinator.latencies().firstVisibleTransitionMs);
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
      if ((session.shouldAnimate() && document.visibilityState !== "hidden") || ps05MotionRef.current.needsClock() || siteMoving || (!target.visible && visualRef.current.visible) || tx.status === "running" || geoStatus === "waiting" || preparing || geometryLogRef.current.recording || m5TraceRef.current.recordingNow || settleRef.current.needsClock() || Boolean(magneticDriverRef.current?.needsClock())) {
        clock.frame = requestAnimationFrame(loop);
      } else {
        clock.running = false;
        setUi(session.snapshot());
        setTxUi(coordinator.snapshot());
        setGpuUi(coordinator.geometrySnapshot());
        setFirstVisibleMs(coordinator.latencies().firstVisibleTransitionMs);
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
    magneticDriverRef.current?.install({
      onUserInput: (kind) => {
        settleRef.current.noteUserInput(kind);
        startClock();
      },
      onMagneticBegin: () => startClock(),
    });
    const detach = controller.attach(window);
    const onPs05Wheel = (event: WheelEvent) => {
      if (!ps05Ref.current || event.defaultPrevented || !event.deltaY) return;
      if (event.target instanceof Element && event.target.closest('textarea, dialog, [role="dialog"]')) return;
      ps05MotionRef.current.beginWheel(controller.getProgress(), event.deltaY, compositionRef.current, reducedRef.current, performance.now(), controller.layout());
      startClock();
    };
    window.addEventListener("wheel", onPs05Wheel, { passive: true, capture: true });
    const onScrollEnd = () => settleRef.current.noteHint("scrollend");
    const onSnapChanging = (event: Event) => {
      const snap = (event as Event & { snapTargetElement?: Element }).snapTargetElement;
      const id = snap instanceof HTMLElement ? snap.dataset.node as ScreenNodeId | undefined : undefined;
      if (id) settleRef.current.noteHint("scrollsnapchanging", id);
    };
    const onSnapChange = (event: Event) => {
      const snap = (event as Event & { snapTargetElement?: Element }).snapTargetElement;
      const id = snap instanceof HTMLElement ? snap.dataset.node as ScreenNodeId | undefined : undefined;
      if (id) settleRef.current.noteHint("scrollsnapchange", id);
    };
    const onResizeLayout = () => {
      layoutRevisionRef.current += 1;
      settleRef.current.noteLayoutRevision(layoutRevisionRef.current);
      if (finalRuntime(stageRef.current) && !manualDpr) {
        const next = nextAdaptiveDpr(adaptiveDprRef.current, 0, performance.now(), window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
        adaptiveDprRef.current = next;
        if (next.dpr !== dprRef.current) setDpr(next.dpr);
      }
      startClock();
    };
    window.addEventListener("scrollend", onScrollEnd);
    window.addEventListener("scrollsnapchanging", onSnapChanging);
    window.addEventListener("scrollsnapchange", onSnapChange);
    window.addEventListener("resize", onResizeLayout);
    const unsub = controller.subscribeDiscrete((progress) => {
      progressRef.current = progress;
      setActiveNode(progress.activeNodeId);
      coordinatorRef.current.noteCommittedNode(settleRef.current.snapshot().actorCommittedNodeId ?? progress.activeNodeId, performance.now());
      r6Ref.current.mark("r6:semantic-node-commit", { nodeId: progress.activeNodeId, scrollY: window.scrollY });
      const manifests = manifestsRef.current;
      if (manifests.m3) {
        const node = settleRef.current.snapshot().snapCandidateNodeId ?? progress.activeNodeId;
        const direction = controller.getProgress().direction;
        const pairs = reachableFrozenPairs(node, direction);
        const viewport = window.innerWidth <= 430 ? "mobile" : "desktop";
        programCacheRef.current.setBudget(viewport === "mobile");
        lookaheadPinsRef.current = programCacheRef.current.replacePins(
          pairs.map(([from, to]) => frozenProgramKey(from, to, reducedRef.current, viewport, programCacheRef.current.variant)),
          lookaheadPinsRef.current,
          pipelineRef.current.pinnedIntentKey ? [pipelineRef.current.pinnedIntentKey] : [],
        );
        if (node !== "03.2" && !(node === "03.1" && builderPrewarmSourceRef.current !== null)) programCacheRef.current.startRoutePrewarm({
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
    const unsubFrame = controller.subscribeFrame(() => { if (ps05Ref.current) startClock(); });
    const ps05Motion = ps05MotionRef.current;
    startClock();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scrollend", onScrollEnd);
      window.removeEventListener("scrollsnapchanging", onSnapChanging);
      window.removeEventListener("scrollsnapchange", onSnapChange);
      window.removeEventListener("resize", onResizeLayout);
      window.removeEventListener("wheel", onPs05Wheel, true);
      cancelAnimationFrame(clock.frame);
      clock.running = false;
      unsub();
      unsubFrame();
      ps05Motion.dispose();
      detach();
      magneticDriverRef.current?.uninstall();
      html.style.scrollBehavior = previousScrollBehavior;
    };
  }, [controller, manualDpr, session, startClock]);

  useEffect(() => { session.setReducedMotion(reducedMotion); controller.setReducedMotion(reducedMotion); }, [controller, reducedMotion, session]);
  useLayoutEffect(() => { controller.setUnlock(flow.unlock); }, [controller, flow.unlock]);
  useEffect(() => {
    controller.setMagnetismGuards({ dialogOpen: flow.overlay === "contact" });
  }, [controller, flow.overlay]);

  useEffect(() => {
    const controllerAbort = new AbortController();
    const tasks = [
      loadBuilderRuntime(controllerAbort.signal, { releaseGeometry: stage === "final-r2" ? "r2" : finalRuntime(stage) }),
      finalRuntime(stage) ? loadPS04MotionManifest(controllerAbort.signal) : Promise.resolve(null),
    ] as const;
    Promise.all(tasks).then((results) => {
      const promoted = results[0];
      setPromotedManifest(promoted.m3);
      setMotionManifest(results[1] ?? promoted.m4);
    }).catch((reason: Error) => {
      if (controllerAbort.signal.aborted) return;
      setError(reason.message);
      setLoadStatus("error");
      setLoading(false);
    });
    return () => controllerAbort.abort();
  }, [stage]);

  useEffect(() => {
    if (!promotedManifest) return;
    manifestsRef.current = { m3: promotedManifest, m4: motionManifest };
    stateIndexRef.current = indexStates(promotedManifest.states);
  }, [motionManifest, promotedManifest]);

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
    const hashNode = initialHashNodeRef.current;
    const resolveBootNode = (): ScreenNodeId => (production
      ? (() => {
        const scrolledNode = window.scrollY > 24 ? controller.getProgress().activeNodeId : null;
        const requested = bootTargetOverrideRef.current ?? scrolledNode ?? hashNode;
        // PS-05 DOM is usable while 3D loads. A task selected during that time
        // may already have opened 03.2/03.3; boot must respect the live route.
        return requested && isNodeUnlocked(requested, ps05Ref.current ? controller.getUnlock() : INITIAL_BUILDER_FLOW.unlock)
          ? requested : requested ? "03.1" : "01";
      })()
      : (queryNode && SCREEN_NODE_BY_ID[queryNode as ScreenNodeId]
        ? queryNode
        : bootPlayModeRef.current === "settled" ? screenNode : "01")) as ScreenNodeId;
    const loadBoot = async (nodeId: ScreenNodeId) => {
      const geometry = defaultGeometryForNode(nodeId) ?? "master-neutral";
      const entry = m3.states.find((item) => item.stateId === geometry)
        ?? m3.states.find((item) => item.stateId === "master-neutral") ?? m3.states[0];
      const state = await cache.loadState(entry, abort.signal);
      const program = await cache.getFrozen({
        source: state,
        target: state,
        manifest: m3,
        motion: m4,
        reducedMotion,
        signal: abort.signal,
      });
      return { state, program };
    };
    void (async () => {
      try {
        let bootNode = resolveBootNode();
        let loaded = await loadBoot(bootNode);
        // A graph/hash destination chosen while assets load supersedes the
        // initial URL. Keep preparing until the latest destination is ready.
        while (!abort.signal.aborted && loadGateRef.current.isCurrent(generation)
          && resolveBootNode() !== bootNode) {
          bootNode = resolveBootNode();
          loaded = await loadBoot(bootNode);
        }
        if (abort.signal.aborted || !loadGateRef.current.isCurrent(generation)) return;
        const { state, program } = loaded;
        firstGpuTargetRef.current = state.entry.stateId;
        session.bootstrapSettled(state, program);
        const bootContract = stateIndexRef.current
          ? resolveBuilderActorContract({
            nodeId: bootNode,
            index: indexStates(m3.states),
            flow: builderView(INITIAL_BUILDER_FLOW),
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
          settleRef.current.adoptBoot(bootNode, semanticActorKey(bootContract).serialized);
          requestKeyRef.current = semanticActorKey(bootContract).serialized;
          contractRef.current = bootContract;
          setContract(bootContract);
          setActiveNode(bootNode);
          if (r6StagingRef.current) {
            pipelineRef.current.hydrateResident({
              revision: coordinatorRef.current.snapshot().revision,
              navigationToken: settleRef.current.snapshot().magneticSettleRevision,
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
        if (production || bootPlayModeRef.current === "settled") {
          const moved = controller.scrollToNode(bootNode, "auto", "restore");
          if (production && moved) {
            const bootHash = `#screen-${bootNode}`;
            if (window.location.hash !== bootHash) window.history.replaceState({ node: bootNode }, "", bootHash);
          }
        }
        bootTargetOverrideRef.current = null;
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
    if (finalRuntime(stageRef.current) && !firstGpuFrameRef.current) {
      firstGpuTargetRef.current = next.resolvedGeometryId;
    }
    const coordinator = coordinatorRef.current;
    const live = coordinator.displayedPlacement();
    const rendered = stageRef.current === "final-r2" ? renderedFrameRef.current : null;
    const displayedLut = rendered?.paletteLut ?? coordinator.displayedLut();
    const displayed: DisplayedPlacement = {
      slot: r1Runtime(stageRef.current) && compositionRef.current.slot !== "exit" && compositionRef.current.slot !== "none"
        ? compositionRef.current.slot
        : live.slot,
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
      navigationToken: settleRef.current.snapshot().magneticSettleRevision,
      targetZoom: identity ? 1 : targetProfile.effectiveZoom,
      durationSeconds: finalRuntime(stageRef.current)
        && settleRef.current.snapshot().actorRequestSource?.kind === "route-settle"
        ? (window.innerWidth <= 430 ? PS04_ROUTE_DURATION_MS.mobile : PS04_ROUTE_DURATION_MS.desktop) / 1000
        : undefined,
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
        navigationToken: settleRef.current.snapshot().magneticSettleRevision,
        sourceId: sourceChoice.sourceGeometryId,
        targetId: request.stateId,
        reducedMotion,
        viewport: typeof window !== "undefined" && window.innerWidth <= 430 ? "mobile" : "desktop",
        prefer: controller.getProgress().direction < 0 ? "pending" : "forward",
      });
      startClock();
      return;
    }
    if (rendered) session.playGeometry(false);
    geometryPrepareAbortRef.current?.abort();
    const prepareAbort = new AbortController();
    geometryPrepareAbortRef.current = prepareAbort;
    const revision = session.beginRequest(request.stateId);
    if (!coordinator.isCurrent(transaction.revision)) return;
    const captured = session.captureJoint(stageRef.current === "final-r2" ? renderedFrameRef.current ?? undefined : undefined, stageRef.current === "final-r2");
    try {
      const entry = manifest.states.find((item) => item.stateId === request.stateId);
      if (!entry) return;
      const cache = programCacheRef.current;
      const nextState = await cache.loadState(entry, prepareAbort.signal);
      if (!session.isCurrent(revision) || !coordinator.isCurrent(transaction.revision)) return;
      const currentTarget = rendered?.target ?? session.getTarget();
      const currentSource = rendered?.source ?? session.getSource();
      const geo = coordinator.geometrySnapshot();
      const sourceChoice = selectProgramSourceMode({
        shaderProgress: rendered?.progress ?? geo.shaderProgress,
        boundTargetGeometryId: rendered?.target.entry.stateId ?? geo.boundTargetGeometryId,
        boundSourceGeometryId: rendered?.source.entry.stateId ?? geo.boundSourceGeometryId,
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
      const route = settleRef.current.snapshot().actorRequestSource?.kind === "route-settle";
      if (sourceChoice.mode === "frozen") {
        const sourceState = await stateForId(sourceChoice.sourceGeometryId);
        if (!sourceState) {
          startClock();
          return;
        }
        const frozen = await cache.getFrozen({
          source: sourceState,
          target: nextState,
          manifest,
          motion: motionManifest,
          reducedMotion,
        });
        if (!session.isCurrent(revision) || !coordinator.isCurrent(transaction.revision)) return;
        const program = releasePlaybackProgram(frozen, stageRef.current, route);
        coordinator.markProgramReady(transaction.revision, program.programId, performance.now());
        programBindRef.current = {
          revision: transaction.revision,
          navigationToken: settleRef.current.snapshot().magneticSettleRevision,
          program,
          source: sourceState,
          target: nextState,
          bindCommitted: false,
          bindFrameToken: null,
          preparedAtMs: performance.now(),
        };
        session.commitTransition({ revision, source: sourceState, target: nextState, program, captured, play: playImmediately });
      } else if (currentSource) {
        // Retarget from the actual rendered pose. A frozen settled source here
        // replays the previous shape for one frame before the new morph.
        pipelineRef.current.cancelPending("live-retarget");
        const { liveSource, program: compiled } = rendered
          ? await prepareGeometry({source:currentSource,target:nextState,identitySpace:manifest.identitySpace,reducedMotion,viewport:window.innerWidth <= 430 ? "mobile" : "desktop",captured,rendered}, prepareAbort.signal)
          : compileLiveRetarget(
          captured,
          currentSource,
          nextState,
          manifest,
          { reducedMotion, trigger: "qa", viewport: viewportForFrame(window.innerWidth <= 430 ? "mobile390" : "desktop") },
        );
        if (!session.isCurrent(revision) || !coordinator.isCurrent(transaction.revision)) return;
        settleRef.current.noteCompileLiveRetarget();
        if (refinedScales) liveSource.refinedMasterWeight = captureMasterPaletteWeight(
          rendered?.source ?? currentSource, rendered?.target ?? currentTarget ?? currentSource,
          rendered?.progress ?? captured.geometryProgress,
        );
        const program = releasePlaybackProgram(compiled, stageRef.current, route);
        coordinator.markProgramReady(transaction.revision, program.programId, performance.now());
        programBindRef.current = {
          revision: transaction.revision,
          navigationToken: settleRef.current.snapshot().magneticSettleRevision,
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
  }, [identity, manifest, motionManifest, reducedMotion, session, startClock, controller, setBufferHash, setContract, setError, refinedScales]);

  const publishInScreenFromState = (next: BuilderFlowState) => {
    const settle = settleRef.current;
    const host = settle.snapshot().magnetizedSettledNodeId;
    if (host !== "03.2") return false;
    const index = stateIndexRef.current;
    if (!index) return false;
    const flowArgs = builderView(next);
    settle.setResolveContract((nodeId) => {
      try {
        const resolved = resolveBuilderActorContract({
          nodeId,
          overlay: next.overlay,
          index,
          flow: flowArgs,
        });
        return { nodeId, key: semanticActorKey(resolved).serialized };
      } catch {
        return { nodeId, key: nodeId };
      }
    });
    const intent = settle.requestInScreenAction("03.2");
    if (!intent) return false;
    settle.consumeBegin();
    try {
      const resolved = resolveBuilderActorContract({
        nodeId: intent.nodeId,
        overlay: next.overlay,
        index,
        flow: flowArgs,
      });
      guardBuilderContract(resolved);
      const semantic = semanticActorKey(resolved).serialized;
      requestKeyRef.current = semantic;
      contractRef.current = resolved;
      setContract(resolved);
      requestActorRef.current(resolved);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    }
  };

  const dispatchProjectBuilderAction = useCallback((action: ProjectBuilderAction) => {
    const current = flowRef.current;
    let nextState = current;
    let error: string | null = null;
    let publishInScreen = false;
    if (action.type === "confirm-competencies") {
      const result = commitBuilderConfirm(current, manifestRef.current);
      nextState = result.state;
      error = result.error;
    } else {
      const reduced = reduceProjectBuilderAction(current, action);
      nextState = reduced.state;
      error = reduced.error;
      publishInScreen = reduced.publishInScreen;
    }
    if (error) {
      setFlowError(error);
      return;
    }
    setFlowError(null);
    flowRef.current = nextState;
    setFlow(nextState);
    if (!current.unlock.competencies && nextState.unlock.competencies) startClock();
    if (publishInScreen) {
      // A click takes precedence over idle compilation of the old draft.
      programCacheRef.current.cancel();
      builderPrewarmSourceRef.current = null;
      canvasHostRef.current?.removeAttribute("data-builder-prewarm");
    }
    const published = publishInScreen ? publishInScreenFromState(nextState) : false;
    const settle = settleRef.current.snapshot();
    const trace: BuilderActionTrace = {
      type: action.type,
      source: action.source,
      competencyId: action.type === "toggle-competency" ? action.competencyId : null,
      hostNodeId: action.type === "toggle-competency" || action.type === "set-competencies" ? "03.2" : null,
      draftRevision: nextState.draft.revision,
      selected: nextState.draft.competencies.slice(),
      confirmed: nextState.confirmed?.competencies.slice() ?? null,
      interactionRevision: settle.interactionRevision,
      lastAppliedInteractionRevision: settle.lastAppliedInteractionRevision,
      magneticSettleRevision: settle.magneticSettleRevision,
      requestSourceKind: settle.actorRequestSource?.kind ?? null,
      published,
      atMs: typeof performance !== "undefined" ? performance.now() : Date.now(),
    };
    builderActionLogRef.current = [...builderActionLogRef.current, trace];
    lastBuilderActionRef.current = trace;
  }, [startClock]);

  useEffect(() => {
    if (loadStatus !== "ready" || !stateIndex) return;
    const settle = settleRef.current;
    const flowArgs = builderView(flow);
    settle.setResolveContract((nodeId) => {
      try {
        const resolved = resolveBuilderActorContract({
          nodeId,
          overlay: flow.overlay,
          index: stateIndex,
          flow: flowArgs,
        });
        return { nodeId, key: semanticActorKey(resolved).serialized };
      } catch {
        return { nodeId, key: nodeId };
      }
    });
  }, [flow, loadStatus, stateIndex]);

  useEffect(() => {
    if (!flow.confirmed || !bufferHash || !manifest) return;
    const entry = manifest.states.find((item) => item.stateId === flow.confirmed?.resolvedStateId);
    if (!entry || bufferHash !== entry.contentHash) return;
    if (contract?.resolvedGeometryId !== flow.confirmed.resolvedStateId) return;
    if (flow.confirmed.stateHash === bufferHash) return;
    // Hash bind is a one-shot sync of confirmed builder state after GPU settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- existing M6.1/M6.2 hash bind
    setFlow((current) => bindConfirmedHash(current, bufferHash));
  }, [bufferHash, contract?.resolvedGeometryId, flow.confirmed, manifest]);

  useEffect(() => {
    if (!activeNode.startsWith("03.2")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hover is host-screen scoped
      setHoverPreview(IDLE_HOVER_PREVIEW);
    }
  }, [activeNode]);

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
    manifestRef.current = manifest;
    dprRef.current = dpr;
    identityRef.current = identity;
    reducedRef.current = reducedMotion;
    continuityLiftRef.current = continuityLift;
    reproduceR4GeometryRef.current = reproduceR4Geometry;
    r6StagingRef.current = r6Staging;
    selectionRef.current = { aboutZoom, merchZoom, videoZoom };
    stageRef.current = stage;
    magnetismProfileIdRef.current = magnetismProfileId;
    magneticDriverRef.current = magneticDriver;
    magneticDriver?.setProfileId(magnetismProfileId);
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
      const captured = session.captureJoint(stageRef.current === "final-r2" ? renderedFrameRef.current ?? undefined : undefined);
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
  }, [aboutZoom, dpr, flow, identity, manifest, merchZoom, reducedMotion, requestActor, startClock, stateIndex, continuityLift, reproduceR4Geometry, r6Staging, session, videoZoom, stage, magnetismProfileId, magneticDriver]);

  const navigate = useCallback((id: ScreenNodeId) => {
    if (ps05 && controller.layout().byId[id]) ps05MotionRef.current.begin(controller.getProgress().activeNodeId, id, compositionRef.current, reducedRef.current, performance.now());
    const moved = controller.scrollToNode(id, ps05 ? 'auto' : undefined);
    if (moved && ps05) requestAnimationFrame(() => document.getElementById(`heading-${id}`)?.focus({ preventScroll: true }));
    if (moved && finalRuntime(stage)) {
      const nextHash = `#screen-${id}`;
      if (window.location.hash !== nextHash) window.history.pushState({ node: id }, "", nextHash);
      if (session.getSource()) settleRef.current.requestDestination(id);
      else bootTargetOverrideRef.current = id;
      if (!firstGpuFrameRef.current) firstGpuTargetRef.current = defaultGeometryForNode(id) ?? "master-neutral";
      startClock();
    }
    return moved;
  }, [controller, session, stage, startClock, ps05]);
  useEffect(() => {
    if (!finalRuntime(stage)) return;
    const priorRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const restore = () => {
      const node = nodeFromHash() ?? "01";
      if (controller.scrollToNode(node, "auto", "restore")) {
        if (session.getSource()) settleRef.current.requestDestination(node);
        else bootTargetOverrideRef.current = node;
        if (!firstGpuFrameRef.current) firstGpuTargetRef.current = defaultGeometryForNode(node) ?? "master-neutral";
        startClock();
      } else {
        const current = controller.getProgress().activeNodeId;
        window.history.replaceState({ node: current }, "", `#screen-${current}`);
      }
    };
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.history.scrollRestoration = priorRestoration;
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, [controller, session, stage, startClock]);

  useEffect(() => {
    if (flow.overlay !== "success" || !flow.successVisibleUntil) return;
    const wait = Math.max(0, flow.successVisibleUntil - Date.now());
    const timer = window.setTimeout(() => setFlow(closeOverlay), wait);
    return () => window.clearTimeout(timer);
  }, [flow.overlay, flow.successVisibleUntil]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (flow.overlay || document.querySelector('dialog[open]')) return;
      const target = event.target;
      if (ps05 && (isReadingFlow() || (target instanceof HTMLElement && target.closest('button, a, summary, [role="radio"], [role="checkbox"]')))) return;
      if (target instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      const unlock = flow.unlock;
      const anchor = stageRef.current === "final-r2"
        ? controller.getPendingTarget() ?? controller.getProgress().activeNodeId
        : activeNode;
      if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        const next = nextUnlocked(anchor, unlock);
        if (next) navigate(next);
      }
      if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        const previous = previousUnlocked(anchor, unlock);
        if (previous) navigate(previous);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        const next = nextUnlocked(anchor, unlock);
        if (next) navigate(next);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const previous = previousUnlocked(anchor, unlock);
        if (previous) navigate(previous);
      }
      if (event.key === "Home") {
        event.preventDefault();
        navigate("01");
      }
      if (event.key === "End") {
        event.preventDefault();
        navigate("08");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeNode, controller, flow.overlay, flow.unlock, navigate, ps05]);

  const source = session.getSource();
  const target = session.getTarget();
  const program = session.getProgram();
  const material = useMemo(() => ({
    ...defaultM2MaterialController(theme, session.palette),
    editorial: ps05,
    reducedMotion,
  }), [ps05, reducedMotion, session.palette, theme]);
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
      committedNodeId: settleRef.current.snapshot().actorCommittedNodeId,
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
      runId: runtimeMeta.runId,
      stage: runtimeMeta.label,
      assetNamespace: M61_NAMESPACE,
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
      builder: {
        taskId: flow.draft.taskId,
        draft: flow.draft.competencies,
        confirmed: flow.confirmed,
        briefStale: flow.briefStale,
        hover: hoverPreview,
        resolvedStateId: contract?.resolvedGeometryId ?? null,
        sourceNamespace: contract?.resolvedGeometryId ? namespaceForStateId(contract.resolvedGeometryId) : M61_NAMESPACE,
        phase: contract?.resolvedGeometryId && contract.hostNodeId.startsWith("03")
          ? builderPhase(contract.nodeId as "03.1" | "03.2" | "03.3" | "03.3A" | "03.3B", contract.resolvedGeometryId)
          : "n/a",
        lastAction: lastBuilderActionRef.current,
        actionLog: builderActionLogRef.current,
      },
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
      lastActorTarget: () => settleRef.current.snapshot().actorCommittedNodeId,
      settle: () => settleRef.current.snapshot(),
      hardGates: () => {
        const snap = settleRef.current.snapshot();
        return {
          requestsToCrossedNodes: snap.requestsToCrossedNodes,
          maxActorQueueDepth: snap.maxActorQueueDepth,
          routeCompileLiveRetargetCount: snap.compileLiveRetargetCount,
          staleQueuedTransitionStarts: snap.staleQueuedTransitionStarts,
          runningMorphInterruptedByScroll: snap.runningMorphInterruptedByScroll,
          actorRequestCount: snap.actorRequestCount,
          cancelledBeforeVisualStartCount: snap.cancelledBeforeVisualStartCount,
          ignoredCandidateCount: snap.ignoredCandidateCount,
          actorRequestSource: snap.actorRequestSource,
          interactionRevision: snap.interactionRevision,
          lastAppliedInteractionRevision: snap.lastAppliedInteractionRevision,
          placementActorRequestCount: placementTelemetryRef.current.placementActorRequestCount,
          placementCompileCount: placementTelemetryRef.current.placementCompileCount,
          placementQueueDepth: placementTelemetryRef.current.placementQueueDepth,
          postSettlePlacementDeltaPx: placementTelemetryRef.current.postSettlePlacementDeltaPx,
          magneticStrengthMonotonic: magneticStrengthMonotonic(
            captureRadiusPx(magnetismProfile("R1_STRONG_BALANCED"), controller.getProgress().viewportHeight, false),
          ),
          magneticCancelOnFreshInput: magneticDriverRef.current?.snapshot(controller.getProgress().viewportHeight).cancelOnFreshInput ?? false,
          magneticOvershoot: magneticDriverRef.current?.snapshot(controller.getProgress().viewportHeight).overshoot ?? false,
          magnetismProfile: magnetismProfileIdRef.current,
        };
      },
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
      committedNode: () => settleRef.current.snapshot().actorCommittedNodeId,
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
      scrollToNode: (id: ScreenNodeId, behavior?: ScrollBehavior, origin?: "programmatic" | "restore") => {
        const moved = controller.scrollToNode(id, behavior, origin);
        // The QA navigation handle is an explicit destination too. Letting it
        // bypass the release policy leaves the previous geometry on screen
        // until a long smooth scroll has fully settled.
        if (moved && finalRuntime(stageRef.current)) {
          if (session.getSource()) settleRef.current.requestDestination(id);
          else bootTargetOverrideRef.current = id;
          if (!firstGpuFrameRef.current) firstGpuTargetRef.current = defaultGeometryForNode(id) ?? "master-neutral";
        }
        startClock();
        return moved;
      },
      magnetism: () => controller.getMagnetism(),
      noteUserInput: (kind: "wheel" | "touch" | "pointer" | "keyboard" | "scrollbar") => {
        controller.noteUserInput(kind);
      },
      evaluateMagnetism: () => controller.evaluateMagnetism(),
      magnetismProfile: () => magnetismProfileIdRef.current,
      setMagnetismProfile: (id: MagnetismProfileId) => {
        if (isMagnetismProfileId(id)) setMagnetismProfileId(id);
      },
      presentation: () => r1HudExtrasRef.current,
      placementTelemetry: () => ({ ...placementTelemetryRef.current }),
      setTheme: (value: MaterialTheme) => setTheme(value),
      setReviewPhase: (phase: number | null) => {
        if (phase === null) session.setColorWavePaused(false);
        else { session.seekColorPhase(phase); session.seekIdlePhases(0, 0); }
        startClock();
      },
      setReduced: (value: boolean) => setManualReduced(value),
      setDpr: (value: number) => setDpr(value),
      selectTask: (id: BuilderTaskId) => dispatchProjectBuilderAction({ type: "select-task", taskId: id, source: "qa-handle" }),
      confirmCompetencies: () => dispatchProjectBuilderAction({ type: "confirm-competencies", source: "qa-handle" }),
      setCompetencies: (ids: CompetenceId[]) => dispatchProjectBuilderAction({
        type: "set-competencies",
        competencyIds: ids,
        hostNodeId: "03.2",
        source: "qa-handle",
      }),
      editBrief: (text: string) => setFlow((current) => editBrief(current, text)),
      resetFlow: () => {
        setFlowError(null);
        setHoverPreview(IDLE_HOVER_PREVIEW);
        builderActionLogRef.current = [];
        lastBuilderActionRef.current = null;
        flowRef.current = INITIAL_BUILDER_FLOW;
        setFlow(INITIAL_BUILDER_FLOW);
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
      builderActionLog: () => builderActionLogRef.current.slice(),
      lastBuilderAction: () => lastBuilderActionRef.current,
      framebufferSilhouette: () => window.__PS04M5_GPU_DIAG__?.framebufferSilhouette?.() ?? null,
      setActorMask: (value: boolean) => setMaskHarness(Boolean(value)),
    };
    if (stage === "r2") {
      window.__PS04M62R2_LAB__ = handle;
      delete window.__PS04M62R1_LAB__;
      delete window.__PS04M62_LAB__;
    } else if (stage === "r1") {
      window.__PS04M62R1_LAB__ = handle;
      delete window.__PS04M62_LAB__;
      delete window.__PS04M62R2_LAB__;
    } else {
      window.__PS04M62_LAB__ = handle;
      delete window.__PS04M62R1_LAB__;
      delete window.__PS04M62R2_LAB__;
    }
    window.__PS04M61_LAB__ = handle;
    window.__PS04M5_LAB__ = handle;
  }, [aboutZoom, activeNode, actorRequest, bufferHash, contextState, contract, controller, diagnostic, diagnostics, dispatchProjectBuilderAction, environment, flow, hoverPreview, identity, loading, loadStatus, manifest, merchZoom, mode, namespace, navigate, playMode, production, reducedMotion, requestActor, runtimeMeta.runId, runtimeMeta.label, screen, session, sessionId, startClock, stats, target, theme, videoZoom, viewportId, stage, magnetismProfileId]);

  const sceneReady = Boolean(source && target && program && manifest);
  const paper = ps05 ? THEMES[theme].paper : stage === "final-r2" && theme === "light" ? "#F2F2F0" : MATERIAL_THEME_PRESETS[theme].background;
  const sceneBackground = !ps05 && stage === "final-r2" && theme === "light"
    ? "radial-gradient(ellipse at 73% 48%, #F6F6F4 0%, #F2F2F0 65%)" : paper;
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
  }, [aboutZoom, controller, diagnostic, merchZoom, namespace, playMode, production, screen, theme, videoZoom, viewportId,
    setTheme, setScreen, setAboutZoom, setMerchZoom, setVideoZoom, setViewportId, setDiagnostic, setPlayMode, setNamespace]);
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
      className={`${styles.lab} ${ps05 ? ps05Styles.site : ''}`}
      data-ps05={ps05 ? 'true' : undefined}
      data-reduced={reducedMotion}
      data-theme={theme}
      data-release={stage}
      data-mode={mode}
      data-actor-mask={actorMask ? "true" : "false"}
      data-ui={hideUi ? "off" : "on"}
      data-framed={frame ? "true" : "false"}
      data-viewport={viewportId}
      data-diagnostic={diagnostic}
      data-screen={screen}
      data-error={error ?? ""}
      style={{
        ...(ps05 ? themeProperties(theme) : {}),
        background: actorMask ? "#140028" : sceneBackground,
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
        data-gpu-source={gpuUi?.boundSourceGeometryId ?? ""}
        data-gpu-target={gpuUi?.boundTargetGeometryId ?? ""}
        data-gpu-progress={gpuUi?.shaderProgress ?? 1}
        data-frame-p95-ms={stats.p95Ms}
        data-first-visible-ms={firstVisibleMs ?? ""}
        data-overlay-quaternion={snapshot.overlay.quaternion.join(",")}
        data-actor-rotation-radians={program?.compiled?.header.actorTrack.rotationRadians ?? 0}
        data-actor-translation-amplitude={program?.compiled?.header.actorTrack.translationAmplitude ?? 0}
        data-asset-namespace={contract?.resolvedGeometryId ? namespaceForStateId(contract.resolvedGeometryId) : M61_NAMESPACE}
        data-hover-preview={hoverPreview.active ? "true" : "false"}
        style={hoverPreview.active && hoverPreview.rotationBiasDeg ? { transform: `rotateY(${hoverPreview.rotationBiasDeg}deg)` } : undefined}
        data-framing-profile={OWNER_SELECTED_PROFILE_ID}
        data-screen={screen}
        data-resolved-state={contract?.resolvedGeometryId ?? ""}
        data-builder-phase={contract?.resolvedGeometryId && contract.hostNodeId.startsWith("03")
          ? builderPhase(contract.nodeId as "03.1" | "03.2" | "03.3" | "03.3A" | "03.3B", contract.resolvedGeometryId)
          : ""}
        data-about-zoom={aboutZoom}
        data-merch-zoom={merchZoom}
        data-video-zoom={videoZoom}
      >
        {!ps05 && finalRuntime(stage) && !firstGpuFrame ? (
          <div
            aria-hidden="true"
            data-qa="ps04-neutral-poster"
            style={{
              position: "absolute", inset: 0, display: "grid", placeItems: "center",
              background: sceneBackground, pointerEvents: "none", zIndex: 2,
            }}
          >
            <div style={{
              width: "min(25vw, 180px)", aspectRatio: "1", borderRadius: "50%", opacity: 0.42,
              background: theme === "dark"
                ? "radial-gradient(circle at 31% 25%, #748398, #333b49 58%, #252c37 100%)"
                : "radial-gradient(circle at 31% 25%, #ffffff, #dedfdf 58%, #c5c9ca 100%)",
            }} />
          </div>
        ) : null}
        {sceneReady && source && target && program && manifest ? (
          <PS04M5Scene
            refinedScales={refinedScales}
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
            releaseRevision={stage === "final-r2" ? "r2" : undefined}
            onRenderedFrame={(frame) => { renderedFrameRef.current = frame; }}
            onGeometryAck={(ack) => {
              geometryAckRef.current = ack;
              const pending = programBindRef.current;
              if (pending && !pending.bindCommitted
                && ack.drawnRevision === pending.revision
                && ack.drawnProgramId === pending.program.programId) {
                // The first WebGL draw may arrive after the motion clock has
                // stopped. Run one more tick to publish the actual GPU bind.
                startClock();
              }
              if (!contextLostRef.current && !firstGpuFrameRef.current && ack.frameToken > 0
                && ack.drawnProgramId && ack.drawnTargetId === firstGpuTargetRef.current
                && ack.drawnProgress >= 1) {
                firstGpuFrameRef.current = true;
                setFirstGpuFrame(true);
              }
            }}
            reproduceR4Geometry={reproduceR4Geometry}
            r6Staging={r6Staging}
            gpuPool={r6Staging ? gpuPool : null}
            gpuTimer={gpuTimer}
            instrumentation={r6}
            actorMask={actorMask || diagnostic === "mask"}
            diagnosticId="motion"
            qaControls={!production}
            onStats={(nextStats) => {
              setStats(nextStats);
              if (!finalRuntime(stage) || manualDpr) return;
              const next = nextAdaptiveDpr(adaptiveDprRef.current, nextStats.p95Ms, performance.now(), window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
              adaptiveDprRef.current = next;
              if (next.dpr !== dprRef.current) setDpr(next.dpr);
            }}
            onEnvironment={setEnvironment}
            onRenderer={(renderer) => pipelineRef.current.attachRenderer(renderer)}
            onContextState={(state) => {
              setContextState(state);
              if (state === "lost") {
                contextLostRef.current = true;
                firstGpuFrameRef.current = false;
                firstGpuTargetRef.current = session.getTarget()?.entry.stateId
                  ?? contractRef.current?.resolvedGeometryId ?? null;
                setFirstGpuFrame(false);
                geometryAckRef.current = { ...EMPTY_GEOMETRY_ACK };
                session.setPauseAll(true);
                pipelineRef.current.contextLost();
              }
              if (state === "restored") {
                contextLostRef.current = false;
                session.setPauseAll(false);
                pipelineRef.current.restoreGpu();
                const sourceState = session.getSource();
                const targetState = session.getTarget();
                const restoredProgram = session.getProgram();
                if (r6StagingRef.current && sourceState && targetState && restoredProgram) {
                  pipelineRef.current.hydrateResident({
                    revision: coordinatorRef.current.snapshot().revision,
                    navigationToken: settleRef.current.snapshot().magneticSettleRevision,
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
      {ps05 ? <Experience active={activeNode} flow={flow} setFlow={setFlow} dispatch={dispatchProjectBuilderAction} navigate={navigate}
        theme={theme} onTheme={(value) => applySandbox({ theme: value })} reduced={reducedMotion} manualReduced={manualReduced}
        onMotion={() => setManualReduced(value => !value)} controller={controller} progressRef={progressRef} /> : <>
      <PersistentHeader
        activeGroup={SCREEN_NODE_BY_ID[activeNode].headerGroup}
        onNavigate={navigate}
        theme={theme}
        onTheme={(value) => applySandbox({ theme: value })}
        preview={mode === "preview" && !production}
      />
      <ProgressGraph progressRef={progressRef} unlock={flow.unlock} reducedMotion={reducedMotion} onNavigate={navigate} />
      <div id="m4-main" className={styles.route}>
        <HeroScreen onBuild={() => navigate("03.1")} onCompetence={() => navigate("05.1")} />
        <AboutScreen />
        <BuilderChapter
          unlocked={flow.unlock}
          taskId={flow.draft.taskId}
          competencies={flow.draft.competencies}
          briefText={flow.briefText}
          briefStale={flow.briefStale}
          error={flowError}
          onTask={(id) => dispatchProjectBuilderAction({ type: "select-task", taskId: id, source: "user-ui" })}
          onToggle={(id) => dispatchProjectBuilderAction({
            type: "toggle-competency",
            competencyId: id,
            hostNodeId: "03.2",
            source: "user-ui",
          })}
          onConfirm={() => dispatchProjectBuilderAction({ type: "confirm-competencies", source: "user-ui" })}
          onBrief={(value) => setFlow((current) => editBrief(current, value))}
          onSend={() => {
            sendButtonRef.current = document.activeElement as HTMLElement | null;
            setFlow(openContact);
          }}
          onCompetencyPreview={(id, pointerType) => {
            setHoverPreview(hoverPreviewFor(id, { reducedMotion, staticMode, pointerType }));
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
      </>}
      {hud && !hideUi ? (
        <BuilderReviewPanel
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
          taskId={flow.draft.taskId}
          phase={contract?.resolvedGeometryId && contract.hostNodeId.startsWith("03")
            ? builderPhase(contract.nodeId as "03.1" | "03.2" | "03.3" | "03.3A" | "03.3B", contract.resolvedGeometryId)
            : "n/a"}
          draft={flow.draft.competencies.join("+")}
          confirmed={flow.confirmed?.competencies.join("+") ?? ""}
          paletteMask={contract?.paletteMask ?? 0}
          sourceNamespace={contract?.resolvedGeometryId ? namespaceForStateId(contract.resolvedGeometryId) : M61_NAMESPACE}
          briefStale={flow.briefStale}
          hover={hoverPreview}
          onScreen={(id) => applySandbox({ screen: id })}
          onAboutZoom={(value) => applySandbox({ aboutZoom: value })}
          onMerchZoom={(value) => applySandbox({ merchZoom: value })}
          onVideoZoom={(value) => applySandbox({ videoZoom: value })}
          onViewport={(id) => applySandbox({ viewport: id })}
          onDiagnostic={(id) => applySandbox({ diagnostic: id })}
          onTheme={(id) => applySandbox({ theme: id })}
          onMode={(value) => applySandbox({ mode: value })}
        />
      ) : null}
      {hud && !hideUi ? (
        <MagnetizedSettleHud
          telemetry={settleHud}
          extras={r1Runtime(stage) ? r1HudExtras : undefined}
          qa={runtimeMeta.hudQa}
          title={runtimeMeta.hudTitle}
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
