"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CompetenceId } from "../../_brand/color-system";
import type { M3Manifest } from "../photonic-skin-m4-1/m41-data";
import { loadRuntimeManifests, type M41Manifest } from "../photonic-skin-m4-1/m41-data";
import { MATERIAL_THEME_PRESETS, defaultM2MaterialController, type MaterialTheme } from "../photonic-skin-ps04-m3/material-foundation";
import { compileFrozenPair, compileLiveRetarget, loadEntry, viewportForFrame } from "../photonic-skin-ps04-m3/runtime";
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
import { nextUnlocked, previousUnlocked, ScrollCompositionController, type MagnetismSnapshot, type ScrollProgress } from "./scroll-controller";
import { SCREEN_NODE_BY_ID, type ScreenNodeId } from "./topology";
import styles from "./ps04m4.module.css";

const EMPTY_STATS: SceneStats = {
  fps: 0, medianMs: 0, p95Ms: 0, drawCalls: 0, triangles: 0, textureMiB: 0,
  programs: 0, geometries: 0, textures: 0, dpr: 0, drawingBuffer: [0, 0],
  lastActorDrawCalls: 0, lastActorTriangles: 0, newFrame: false,
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
  const systemReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reducedMotion = systemReduced || manualReduced;
  const session = useMemo(() => new PhotonicMotionSession({
    reducedMotion: bootstrapReducedMotion(),
    overlayMode: "m3-combined",
    profile: "desktop",
  }), []);
  const controller = useMemo(() => new ScrollCompositionController(), []);
  const [contract, setContract] = useState<ScreenActorContract | null>(null);
  const sessionId = "ps04-m4-r2";
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

  const startClock = useCallback(() => {
    const clock = clockRef.current;
    if (clock.running) return;
    clock.running = true;
    clock.previous = performance.now();
    const loop = (now: number) => {
      const hidden = document.visibilityState === "hidden";
      session.setHidden(hidden);
      const dt = (now - clock.previous) / 1000;
      clock.previous = now;
      if (!hidden && !session.snapshot().offscreen) {
        session.tick(dt, ++clock.token);
      }
      const progress = controller.getProgress();
      progressRef.current = progress;
      const host = canvasHostRef.current;
      const size = { width: host?.clientWidth || window.innerWidth, height: host?.clientHeight || window.innerHeight };
      const target = targetForNode(progress.activeNodeId);
      const index = stateIndexRef.current;
      const flowNow = flowRef.current;
      const nextContract = index
        ? resolveScreenActorContract({
          nodeId: progress.activeNodeId,
          overlay: flowNow.overlay,
          index,
          flow: {
            taskId: flowNow.taskId,
            taskSelected: Boolean(flowNow.taskId),
            competencies: flowNow.competencies,
            competenciesConfirmed: flowNow.competenciesConfirmed,
            settledStateId: session.snapshot().settledStateId,
          },
        })
        : null;
      if (nextContract) {
        contractRef.current = nextContract;
        const requestKey = `${nextContract.hostNodeId}:${nextContract.nodeId}:${nextContract.resolvedGeometryId}:${nextContract.paletteMask}:${nextContract.family}`;
        if (requestKey !== requestKeyRef.current) {
          requestKeyRef.current = requestKey;
          requestActorRef.current(nextContract);
          setContract(nextContract);
        }
      }
      const liveDpr = dprRef.current;
      const liveIdentity = identityRef.current;
      const liveReduced = reducedRef.current;
      const sampled = sampleComposition({
        width: size.width,
        height: size.height,
        dpr: liveDpr,
        placement: nextContract?.slot === "none" ? "exit" : (nextContract?.slot ?? target.placement),
        exitProgress: target.visible ? 0 : 1,
        reducedMotion: liveReduced,
        identity: liveIdentity,
        fitProfile: nextContract?.fitProfile ?? "master",
      });
      const k = liveReduced ? 1 : 1 - Math.exp(-dt / 0.28);
      visualRef.current.x += (sampled.cssCenterX - visualRef.current.x) * k;
      visualRef.current.y += (sampled.cssCenterY - visualRef.current.y) * k;
      visualRef.current.size += (sampled.cssSize - visualRef.current.size) * k;
      visualRef.current.siteFit += (sampled.siteFitScale - visualRef.current.siteFit) * k;
      if (!target.visible) visualRef.current.exitHold = (visualRef.current.exitHold ?? 0) + dt;
      else visualRef.current.exitHold = 0;
      const distance = Math.hypot(sampled.cssCenterX - visualRef.current.x, sampled.cssCenterY - visualRef.current.y);
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
        slot: sampled.slot,
      });
      if (!visualRef.current.visible) session.setOffscreen(true);
      else if (session.snapshot().offscreen && target.visible) session.setOffscreen(false);
      if (now - clock.lastUi > 160 || clock.lastUi === 0) {
        setUi(session.snapshot());
        clock.lastUi = now;
      }
      if ((session.shouldAnimate() && document.visibilityState !== "hidden") || visualRef.current.visible !== target.visible || (!target.visible && visualRef.current.visible) || k < 0.99) {
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
    loadRuntimeManifests(controllerAbort.signal).then(async ({ m3, m4 }) => {
      setManifest(m3);
      setMotionManifest(m4);
      const entry = m3.states.find((item) => item.stateId === "master-neutral") ?? m3.states[0];
      const state = await loadEntry(entry);
      const program = await compileFrozenPair(state, state, m3, m4, {
        reducedMotion, trigger: "qa", viewport: viewportForFrame("desktop"), signal: controllerAbort.signal,
      });
      session.bootstrapSettled(state, program);
      setLoading(false);
      startClock();
      const node = labQuery().get("node");
      if (node && SCREEN_NODE_BY_ID[node as ScreenNodeId]) {
        controller.scrollToNode(node as ScreenNodeId, "auto", "restore");
      }
    }).catch((reason: Error) => {
      if (reason.name !== "AbortError") setError(reason.message);
      setLoading(false);
    });
    return () => controllerAbort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const requestActor = useCallback(async (next: ScreenActorContract) => {
    if (!manifest) return;
    const request = requestFromContract(next);
    if (!request.stateId) return;
    if (session.snapshot().requestedStateId === request.stateId) {
      if (session.palette.snapshot().palette.mask !== request.paletteMask) {
        session.palette.setMask(request.paletteMask, { mode: "immediate" });
      }
      return;
    }
    const revision = session.beginRequest(request.stateId);
    const captured = session.captureJoint();
    try {
      const entry = manifest.states.find((item) => item.stateId === request.stateId);
      if (!entry) return;
      const nextState = await loadEntry(entry);
      if (!session.isCurrent(revision)) return;
      const currentTarget = session.getTarget();
      const currentSource = session.getSource();
      const settled = captured.geometryProgress >= 1 && currentTarget && !currentTarget.entry.stateId.startsWith("runtime-snapshot-");
      if (settled && currentTarget) {
        const program = await compileFrozenPair(currentTarget, nextState, manifest, motionManifest, {
          reducedMotion, trigger: "qa", viewport: viewportForFrame("desktop"),
        });
        if (!session.isCurrent(revision)) return;
        session.commitTransition({ revision, source: currentTarget, target: nextState, program, captured, play: true });
      } else if (currentSource && currentTarget) {
        const { liveSource, program } = compileLiveRetarget(captured, currentSource, nextState, manifest, {
          reducedMotion, trigger: "qa", viewport: viewportForFrame("desktop"),
        });
        if (!session.isCurrent(revision)) return;
        session.commitTransition({ revision, source: liveSource, target: nextState, program, captured, play: true });
      }
      session.palette.setMask(request.paletteMask, { mode: "immediate" });
      startClock();
    } catch (reason) {
      if (session.isCurrent(revision)) setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [manifest, motionManifest, reducedMotion, session, startClock]);

  const actorRequest: ActorRequest | null = contract ? requestFromContract(contract) : null;

  useLayoutEffect(() => {
    flowRef.current = flow;
    stateIndexRef.current = stateIndex;
    dprRef.current = dpr;
    identityRef.current = identity;
    reducedRef.current = reducedMotion;
    requestActorRef.current = (next) => { void requestActor(next); };
    startClock();
  }, [dpr, flow, identity, reducedMotion, requestActor, startClock, stateIndex]);

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
    };
  }, [controller]);

  useEffect(() => {
    window.__PS04M4_LAB__ = {
      runId: "ps04-m4",
      stage: "PS-04.M4.R2",
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
  }, [activeNode, actorRequest, contextState, controller, diagnostics, environment, flow.overlay, flow.unlock, identity, loading, mode, navigate, reducedMotion, requestActor, session, sessionId, stats, target, theme]);

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
          <div>PS-04.M4.R2 · {activeNode} · {SCREEN_NODE_BY_ID[activeNode].title}</div>
          <div>
            {contract ? <>{contract.requestedFamily} → {contract.resolvedGeometryId ?? "none"}<span className={styles.badge}>{contract.resolution}</span></> : "boot"}
          </div>
          <div>mask {contract?.paletteMask ?? 0} · slot {contract?.slot ?? "none"} · fit {contract?.fitProfile ?? "none"}</div>
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
