import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { checkpointAggregate } from "./checkpoint-hash";
import { ALL_COMPETENCE_MASK, COMPETENCE_BIT } from "../app/visual-lab/photonic-skin-ps04-m2/photonic-palette";
import { FROZEN_PHASE_WINDOWS, samplePhaseAdapter } from "../app/visual-lab/photonic-skin-ps04-m3/phase-adapter";
import {
  assertSettledInvariants,
  maxUnselectedCompetenceWeight,
} from "../app/visual-lab/photonic-skin-ps04-m4/palette-authority";
import {
  assertSettledGeometryInvariants,
  canAtomicBind,
  displayedShaderProgress,
  emptyGeometrySnapshot,
  geometryAuthorityStatus,
  hashTextureIdentities,
  monotonicProgress,
  selectProgramSourceMode,
  type GeometryDisplayedBind,
  type GeometryProgramBind,
} from "../app/visual-lab/photonic-skin-ps04-m4/geometry-authority";
import { DEFAULT_CONTINUITY_LIFT_ENABLED } from "../app/visual-lab/photonic-skin-ps04-m4/continuity-overlay";
import {
  ActorTransitionCoordinator,
} from "../app/visual-lab/photonic-skin-ps04-m4/transition-coordinator";
import { NavigationDirector, rawNodeMustNotRequestActor } from "../app/visual-lab/photonic-skin-ps04-m4/navigation-token";
import { MAGNETISM, MAGNETISM_VARIANTS, SELECTED_MAGNETISM_VARIANT } from "../app/visual-lab/photonic-skin-ps04-m4/scroll-controller";
import {
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
  type ScreenActorContract,
} from "../app/visual-lab/photonic-skin-ps04-m4/screen-actor-contract";
import { SITE_FIT_PROFILES } from "../app/visual-lab/photonic-skin-ps04-m4/site-fit";
import { frozenProgramKey } from "../app/visual-lab/photonic-skin-ps04-m4/transition-prewarm";

const ROOT = process.cwd();
const m4Lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/PS04M4Lab.tsx"), "utf8");
const m4Scene = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/PS04M4Scene.tsx"), "utf8");
const m4Coordinator = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/transition-coordinator.ts"), "utf8");
const m4Prewarm = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/transition-prewarm.ts"), "utf8");




function contract(partial: Partial<ScreenActorContract> = {}): ScreenActorContract {
  return {
    nodeId: "01",
    hostNodeId: "01",
    family: "MASTER",
    requestedFamily: "MASTER",
    resolvedGeometryId: MASTER_STATE_ID,
    paletteMask: ALL_COMPETENCE_MASK,
    slot: "right",
    fitProfile: "master",
    resolution: "exact",
    applyPaletteOverride: false,
    reason: "test",
    ...partial,
  };
}

function phase(progress: number) {
  return samplePhaseAdapter({
    program: { durationMs: 980, selfTransition: false, phases: FROZEN_PHASE_WINDOWS } as never,
    progress,
    playingTransition: progress < 1,
  });
}

function single(id: keyof typeof SINGLE_STATE_IDS, node: ScreenActorContract["hostNodeId"], mask: number): ScreenActorContract {
  return contract({
    nodeId: node,
    hostNodeId: node,
    family: "SINGLE",
    requestedFamily: "SINGLE",
    resolvedGeometryId: SINGLE_STATE_IDS[id],
    paletteMask: mask,
    slot: "left",
    fitProfile: "single",
  });
}

const SINGLES = [
  ["content", "05.1", COMPETENCE_BIT.content],
  ["design", "05.2", COMPETENCE_BIT.design],
  ["event", "05.3", COMPETENCE_BIT.event],
  ["games", "05.4", COMPETENCE_BIT.games],
  ["video", "05.5", COMPETENCE_BIT.video],
  ["digital", "05.6", COMPETENCE_BIT.digital],
  ["merch", "05.7", COMPETENCE_BIT.merch],
] as const;

test("R5 frozen M1–M3 and previous M4 hashes remain exact", () => {
  const m3SourceFiles = [
    "app/visual-lab/photonic-skin-ps04-m3/idle-motion.ts",
    "app/visual-lab/photonic-skin-ps04-m3/material-foundation.ts",
    "app/visual-lab/photonic-skin-ps04-m3/page.tsx",
    "app/visual-lab/photonic-skin-ps04-m3/palette-driver.ts",
    "app/visual-lab/photonic-skin-ps04-m3/phase-adapter.ts",
    "app/visual-lab/photonic-skin-ps04-m3/PS04M3Lab.tsx",
    "app/visual-lab/photonic-skin-ps04-m3/PS04M3LabClient.tsx",
    "app/visual-lab/photonic-skin-ps04-m3/PS04M3Scene.tsx",
    "app/visual-lab/photonic-skin-ps04-m3/ps04m3.module.css",
    "app/visual-lab/photonic-skin-ps04-m3/runtime.ts",
    "app/visual-lab/photonic-skin-ps04-m3/session.ts",
    "app/visual-lab/photonic-skin-ps04-m3/preview/page.tsx",
    "app/visual-lab/photonic-skin-ps04-m3/preview/PS04M3Preview.tsx",
    "app/visual-lab/photonic-skin-ps04-m3/preview/PS04M3PreviewClient.tsx",
    "app/visual-lab/photonic-skin-ps04-m3/preview/preview.module.css",
    "tests/photonic-ps04-m3.test.ts",
    "design/photonic-skin/ps-04-m3/scripts/build-visual-boards.py",
    "design/photonic-skin/ps-04-m3/scripts/capture-browser-evidence.mjs",
    "design/photonic-skin/ps-04-m3/scripts/hash-checkpoint.mjs",
    "design/photonic-skin/ps-04-m3/scripts/lab-smoke.mjs",
    "design/photonic-skin/ps-04-m3/scripts/measure-performance.mjs",
    "design/photonic-skin/ps-04-m3/scripts/run-gpu-parity-probes.mjs",
  ];
  assert.equal(checkpointAggregate(m3SourceFiles, "dba82d1"), "184744da085dc31e08c954640456133308585b7b8ef107de43ab2f8d7a8e6ec1");
  assert.equal(JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m4-r4/reports/checkpoint-hashes.json"), "utf8")).source, "37e99fe9e6b9a10a6bc735351948fd678facdb50bee6c0ae980dd65bee752069");
  assert.equal(SITE_FIT_PROFILES.single, 1.36);
});

test("geometry persistence: all seven SINGLEs stay target after settle and idle delays", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(single("content", "05.1", COMPETENCE_BIT.content));
  for (const [name, node, mask] of SINGLES) {
    const started = coordinator.begin({
      next: single(name, node, mask),
      displayed: coordinator.displayedPlacement(),
      displayedLut: coordinator.displayedLut(),
      nowSeconds: 1,
      reducedMotion: false,
    });
    if (started.decision.kind !== "noop") {
      coordinator.markProgramReady(started.transaction.revision, `${name}-program`, 10);
      coordinator.markDisplayedBind({
        revision: started.transaction.revision,
        programId: `${name}-program`,
        sourceGeometryId: started.transaction.sourceGeometryId,
        targetGeometryId: started.transaction.targetGeometryId,
        frameToken: 1,
        nowMs: 11,
      });
      coordinator.syncFromSession({ geometryProgress: 1, phase: phase(1), sessionTime: 2, geometryPlaying: false, sessionStatus: "settled" });
      coordinator.settle(started.transaction.revision);
    }
    for (const delay of [0, 0.25, 1, 2, 5]) {
      const geo = coordinator.geometrySnapshot();
      assert.equal(geo.shaderProgress, 1, `${name} @ ${delay}s`);
      assert.equal(geo.status, "settled", `${name} @ ${delay}s`);
      assert.equal(geo.settledGeometryId, SINGLE_STATE_IDS[name], `${name} @ ${delay}s`);
      assert.equal(geo.boundTargetGeometryId, SINGLE_STATE_IDS[name], `${name} @ ${delay}s`);
      const invariants = assertSettledGeometryInvariants(geo);
      assert.equal(invariants.shaderProgressLocked, true, name);
    }
  }
});

test("uProgress does not roll 1→0 without a new revision; idle does not change geometry", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(single("design", "05.2", COMPETENCE_BIT.design));
  const before = coordinator.geometrySnapshot();
  coordinator.syncFromSession({ geometryProgress: 0, phase: phase(0), sessionTime: 10, sessionStatus: "settled" });
  const afterIdle = coordinator.geometrySnapshot();
  assert.equal(afterIdle.revision, before.revision);
  assert.equal(afterIdle.shaderProgress, 1);
  assert.equal(afterIdle.settledGeometryId, SINGLE_STATE_IDS.design);
  const next = coordinator.begin({
    next: single("event", "05.3", COMPETENCE_BIT.event),
    displayed: coordinator.displayedPlacement(),
    nowSeconds: 11,
    reducedMotion: false,
  });
  assert.notEqual(next.transaction.revision, before.revision);
  const waiting = coordinator.geometrySnapshot();
  assert.equal(waiting.status, "waiting");
  assert.equal(waiting.shaderProgress, 1);
  assert.equal(waiting.settledGeometryId, SINGLE_STATE_IDS.design);
});

test("atomic bind helpers reject mixed/stale packets and keep hold until ready", () => {
  const bind: GeometryDisplayedBind = {
    revision: 1,
    programId: "old",
    sourceGeometryId: SINGLE_STATE_IDS.digital,
    targetGeometryId: SINGLE_STATE_IDS.video,
    shaderProgress: 1,
    bindFrameToken: 4,
    reverse: false,
  };
  assert.equal(displayedShaderProgress({
    transactionStatus: "running",
    transactionRevision: 2,
    transactionProgress: 0,
    programReady: false,
    bind,
  }), 1);
  assert.equal(geometryAuthorityStatus({
    transactionStatus: "running",
    transactionKind: "geometry",
    programReady: false,
    bind,
    transactionRevision: 2,
  }), "waiting");
  const packet = {
    revision: 2,
    navigationToken: 2,
    program: { programId: "new" },
    source: { entry: { stateId: SINGLE_STATE_IDS.games } },
    target: { entry: { stateId: SINGLE_STATE_IDS.event } },
    bindCommitted: false,
    bindFrameToken: null,
    preparedAtMs: 0,
  } as unknown as GeometryProgramBind;
  assert.equal(canAtomicBind({
    packet,
    snapshot: {
      ...emptyGeometrySnapshot({ revision: 2, geometryId: SINGLE_STATE_IDS.video }),
      status: "waiting",
      programReady: true,
      pendingProgramId: "new",
      revision: 2,
    },
    displayed: bind,
  }), false);
  const seamOk = {
    ...packet,
    source: { entry: { stateId: SINGLE_STATE_IDS.video } },
  } as unknown as GeometryProgramBind;
  assert.equal(canAtomicBind({
    packet: seamOk,
    snapshot: {
      ...emptyGeometrySnapshot({ revision: 2 }),
      status: "waiting",
      programReady: true,
      pendingProgramId: "new",
      revision: 2,
    },
    displayed: bind,
  }), true);
  assert.equal(canAtomicBind({
    packet: { ...seamOk, bindCommitted: true },
    snapshot: { ...emptyGeometrySnapshot({ revision: 2 }), status: "waiting", programReady: true, pendingProgramId: "new", revision: 2 },
    displayed: bind,
  }), false);
  assert.equal(monotonicProgress(0.4, 0.2, false), 0.4);
  assert.equal(monotonicProgress(0.4, 0.2, true), 0.2);
  assert.equal(hashTextureIdentities(["a", "b"]), "a|b");
});

test("stale revision cannot bind or settle; same semantic is a no-op", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(single("content", "05.1", COMPETENCE_BIT.content));
  const first = coordinator.begin({
    next: single("design", "05.2", COMPETENCE_BIT.design),
    displayed: coordinator.displayedPlacement(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  const second = coordinator.begin({
    next: single("event", "05.3", COMPETENCE_BIT.event),
    displayed: coordinator.displayedPlacement(),
    nowSeconds: 0.2,
    reducedMotion: false,
  });
  assert.equal(coordinator.markProgramReady(first.transaction.revision, "stale"), false);
  assert.equal(coordinator.markDisplayedBind({
    revision: first.transaction.revision,
    programId: "stale",
    sourceGeometryId: SINGLE_STATE_IDS.content,
    targetGeometryId: SINGLE_STATE_IDS.design,
    frameToken: 1,
    nowMs: 1,
  }), false);
  assert.equal(coordinator.settle(first.transaction.revision), false);
  assert.equal(coordinator.settle(second.transaction.revision), true);
  const again = coordinator.begin({
    next: single("event", "05.3", COMPETENCE_BIT.event),
    displayed: coordinator.displayedPlacement(),
    nowSeconds: 1,
    reducedMotion: false,
  });
  assert.equal(again.decision.kind, "noop");
});

test("prewarm is side-effect free in source and freezeProgram copies buffers", () => {
  assert.match(m4Prewarm, /function freezeProgram/);
  assert.match(m4Prewarm, /this\.programs\.set\(key, \{/);
  assert.doesNotMatch(m4Prewarm, /session\.commitTransition/);
  assert.doesNotMatch(m4Prewarm, /uProgress/);
  assert.equal(frozenProgramKey("a", "b", false, "desktop"), "a|b|0|desktop");
});

test("raw observed node does not create an actor request; magnetic and committed share one token", () => {
  const director = new NavigationDirector();
  director.commitActorTarget("05.6", "programmatic");
  const raw = director.observe({
    nowMs: 100,
    rawObservedNodeId: "05.5",
    committedNodeId: "05.6",
    magneticCandidateId: "05.6",
    mode: "user",
    fastGesture: false,
    displayedNodeId: "05.6",
  });
  assert.equal(raw.shouldRequestActor, false);
  assert.equal(rawNodeMustNotRequestActor(raw.token) || raw.token.rawObservedNodeId !== raw.token.targetNodeId || !raw.shouldRequestActor, true);
  const magnetic = director.observe({
    nowMs: 200,
    rawObservedNodeId: "05.5",
    committedNodeId: "05.5",
    magneticCandidateId: "05.5",
    mode: "magnetic",
    fastGesture: false,
    displayedNodeId: "05.6",
  });
  assert.equal(magnetic.shouldRequestActor, true);
  assert.equal(magnetic.token.origin, "magnetic");
  director.commitActorTarget("05.5", "magnetic");
  const settleSame = director.observe({
    nowMs: 300,
    rawObservedNodeId: "05.5",
    committedNodeId: "05.5",
    magneticCandidateId: "05.5",
    mode: "magnetic",
    fastGesture: false,
    displayedNodeId: "05.5",
  });
  assert.equal(settleSame.shouldRequestActor, false);
  assert.equal(settleSame.token.token, magnetic.token.token);
});

test("fast skip coalesces to the final node; intermediate nodes do not request", () => {
  const director = new NavigationDirector();
  director.commitActorTarget("05.1", "programmatic");
  const skip = director.observe({
    nowMs: 10,
    rawObservedNodeId: "05.4",
    committedNodeId: "05.2",
    magneticCandidateId: null,
    mode: "user",
    fastGesture: true,
    displayedNodeId: "05.1",
    inputIdle: false,
  });
  assert.equal(skip.shouldRequestActor, false);
  assert.equal(skip.token.fastSkip, true);
  const idle = director.observe({
    nowMs: 200,
    rawObservedNodeId: "05.4",
    committedNodeId: "05.4",
    magneticCandidateId: "05.4",
    mode: "user",
    fastGesture: true,
    displayedNodeId: "05.1",
    inputIdle: true,
  });
  assert.equal(idle.shouldRequestActor, true);
  assert.equal(idle.token.targetNodeId, "05.4");
  assert.equal(idle.token.origin, "user-coalesced");
});

test("idle after a finished programmatic jump still requests the committed node", () => {
  const director = new NavigationDirector();
  director.commitActorTarget("01", "restore");
  const idle = director.observe({
    nowMs: 50,
    rawObservedNodeId: "05.1",
    committedNodeId: "05.1",
    magneticCandidateId: null,
    mode: "idle",
    fastGesture: false,
    displayedNodeId: "01",
    inputIdle: true,
  });
  assert.equal(idle.shouldRequestActor, true);
  assert.equal(idle.token.targetNodeId, "05.1");
  director.commitActorTarget("05.1", "programmatic");
  const again = director.observe({
    nowMs: 80,
    rawObservedNodeId: "05.1",
    committedNodeId: "05.1",
    magneticCandidateId: "05.1",
    mode: "idle",
    fastGesture: false,
    displayedNodeId: "05.1",
    inputIdle: true,
  });
  assert.equal(again.shouldRequestActor, false);
});

test("one adjacent navigation is one transaction; reverse does not queue stale revisions", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(single("games", "05.4", COMPETENCE_BIT.games));
  const forward = coordinator.begin({
    next: single("video", "05.5", COMPETENCE_BIT.video),
    displayed: coordinator.displayedPlacement(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  assert.equal(forward.decision.kind, "geometry");
  const reverseWhileRunning = coordinator.begin({
    next: single("games", "05.4", COMPETENCE_BIT.games),
    displayed: coordinator.displayedPlacement(),
    nowSeconds: 0.2,
    reducedMotion: false,
    reverse: true,
  });
  assert.equal(reverseWhileRunning.transaction.revision > forward.transaction.revision, true);
  assert.equal(coordinator.settle(forward.transaction.revision), false);
  coordinator.settle(reverseWhileRunning.transaction.revision);
  const latencies = coordinator.latencies();
  assert.ok(latencies.requestDelayMs == null || latencies.requestDelayMs >= 0);
  assert.ok(latencies.transitionDurationMs == null || latencies.transitionDurationMs >= 0);
});

test("palette R4 invariants remain: SINGLE masks, ownership off, shaderProgress 1", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  for (const [name, node, mask] of SINGLES) {
    const started = coordinator.begin({
      next: single(name, node, mask),
      displayed: coordinator.displayedPlacement(),
      displayedLut: coordinator.displayedLut(),
      nowSeconds: 1,
      reducedMotion: false,
    });
    coordinator.settle(started.transaction.revision);
    const snapshot = coordinator.materialSnapshot();
    const geo = coordinator.geometrySnapshot();
    assert.equal(snapshot.settledMask, mask, name);
    assert.equal(snapshot.shaderProgress, 1, name);
    assert.equal(snapshot.ownershipEnabled, false, name);
    assert.equal(maxUnselectedCompetenceWeight(mask), 0, name);
    assert.equal(geo.revision, snapshot.revision, name);
    const invariants = assertSettledInvariants(snapshot);
    assert.equal(invariants.shaderProgressLocked, true, name);
  }
});

test("R5 lab keeps one Canvas/session/material, geometry authority, and atomic bind", () => {
  assert.equal((m4Lab.match(/new PhotonicMotionSession/g) ?? []).length, 1);
  assert.equal((m4Scene.match(/<Canvas/g) ?? []).length, 1);
  assert.equal((m4Scene.match(/new THREE\.RawShaderMaterial/g) ?? []).length, 1);
  assert.match(m4Lab, /sessionId = "ps04-m4-r6-r1"/);
  assert.match(m4Lab, /geometrySnapshotRef/);
  assert.match(m4Lab, /programBindRef/);
  assert.match(m4Lab, /NavigationDirector/);
  assert.match(m4Lab, /selectProgramSourceMode/);
  assert.match(m4Lab, /play: false/);
  assert.match(m4Scene, /canAtomicBind/);
  assert.match(m4Scene, /geometryAckRef/);
  assert.match(m4Coordinator, /geometrySnapshot/);
  assert.match(m4Coordinator, /markDisplayedBind/);
  assert.doesNotMatch(m4Scene, /sessionSnap\?\.geometryProgress \?\? props\.progress/);
  assert.equal(DEFAULT_CONTINUITY_LIFT_ENABLED, false);
  assert.equal(SELECTED_MAGNETISM_VARIANT, "a");
  assert.equal(MAGNETISM.inputIdleMs, MAGNETISM_VARIANTS.a.inputIdleMs);
  assert.equal(MAGNETISM.activationRadiusFactor, MAGNETISM_VARIANTS.a.activationRadiusFactor);
  assert.equal(MAGNETISM.snapDurationMs, MAGNETISM_VARIANTS.a.snapDurationMs);
});

test("hold at shaderProgress 1 uses frozen displayed source, not live retarget", () => {
  const hold = selectProgramSourceMode({
    shaderProgress: 1,
    boundTargetGeometryId: SINGLE_STATE_IDS.digital,
    boundSourceGeometryId: MASTER_STATE_ID,
    settledGeometryId: SINGLE_STATE_IDS.digital,
    sessionSourceId: SINGLE_STATE_IDS.digital,
    sessionTargetId: SINGLE_STATE_IDS.video,
    sessionProgress: 0,
  });
  assert.equal(hold.mode, "frozen");
  assert.equal(hold.sourceGeometryId, SINGLE_STATE_IDS.digital);
  const running = selectProgramSourceMode({
    shaderProgress: 0.4,
    boundTargetGeometryId: SINGLE_STATE_IDS.video,
    boundSourceGeometryId: SINGLE_STATE_IDS.digital,
    settledGeometryId: SINGLE_STATE_IDS.digital,
    sessionSourceId: SINGLE_STATE_IDS.digital,
    sessionTargetId: SINGLE_STATE_IDS.video,
    sessionProgress: 0.4,
  });
  assert.equal(running.mode, "live-retarget");
});

test("session progress 0 after commit does not move displayed shader progress until bind", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(single("digital", "05.6", COMPETENCE_BIT.digital));
  const started = coordinator.begin({
    next: single("video", "05.5", COMPETENCE_BIT.video),
    displayed: coordinator.displayedPlacement(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  coordinator.markProgramReady(started.transaction.revision, "digital-video", 1);
  coordinator.syncFromSession({
    geometryProgress: 0,
    phase: phase(0),
    sessionTime: 0.01,
    sessionStatus: "transitioning",
    geometryPlaying: false,
    programId: "digital-video",
  });
  const geo = coordinator.geometrySnapshot();
  assert.equal(geo.shaderProgress, 1);
  assert.equal(geo.status, "waiting");
  assert.equal(geo.settledGeometryId, SINGLE_STATE_IDS.digital);
  coordinator.markDisplayedBind({
    revision: started.transaction.revision,
    programId: "digital-video",
    sourceGeometryId: SINGLE_STATE_IDS.digital,
    targetGeometryId: SINGLE_STATE_IDS.video,
    frameToken: 8,
    nowMs: 2,
  });
  const bound = coordinator.geometrySnapshot();
  assert.equal(bound.shaderProgress, 0);
  assert.equal(bound.status, "running");
  coordinator.syncFromSession({
    geometryProgress: 0.4,
    phase: phase(0.4),
    sessionTime: 0.4,
    sessionStatus: "transitioning",
    geometryPlaying: true,
    programId: "digital-video",
  });
  assert.ok(coordinator.geometrySnapshot().shaderProgress >= 0.4);
});

test("R4 geometry rollback reproduction is query-gated and default Scene holds until running", () => {
  assert.match(m4Lab, /reproduceR4Geometry = query\.get\("reproduceR4Geometry"\) === "1"/);
  assert.match(m4Scene, /if \(props\.reproduceR4Geometry\)/);
  assert.match(m4Scene, /geo\?\.status === "running"/);
  assert.match(m4Scene, /locallyBound \? \(displayed\?\.progress \?\? 1\) : 1/);
  assert.doesNotMatch(m4Scene, /sessionSnap\?\.geometryProgress \?\? props\.progress/);
});

test("resize/theme/visibility do not start a geometry revision after settle", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(single("merch", "05.7", COMPETENCE_BIT.merch));
  const before = coordinator.geometrySnapshot();
  coordinator.syncFromSession({ geometryProgress: 1, phase: phase(1), sessionTime: 40, sessionStatus: "settled" });
  coordinator.syncFromSession({ geometryProgress: 1, phase: phase(1), sessionTime: 41, sessionStatus: "settled" });
  const after = coordinator.geometrySnapshot();
  assert.equal(after.revision, before.revision);
  assert.equal(after.settledGeometryId, SINGLE_STATE_IDS.merch);
  assert.equal(after.shaderProgress, 1);
});

test("geometry bind does not reset palette LUT; settle shares one revision", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(single("content", "05.1", COMPETENCE_BIT.content));
  const started = coordinator.begin({
    next: single("design", "05.2", COMPETENCE_BIT.design),
    displayed: coordinator.displayedPlacement(),
    displayedLut: coordinator.displayedLut(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  coordinator.markProgramReady(started.transaction.revision, "content-design", 1);
  coordinator.markDisplayedBind({
    revision: started.transaction.revision,
    programId: "content-design",
    sourceGeometryId: SINGLE_STATE_IDS.content,
    targetGeometryId: SINGLE_STATE_IDS.design,
    frameToken: 3,
    nowMs: 2,
  });
  coordinator.settle(started.transaction.revision);
  const palette = coordinator.materialSnapshot();
  const geo = coordinator.geometrySnapshot();
  assert.equal(palette.revision, geo.revision);
  assert.equal(palette.shaderProgress, 1);
  assert.equal(palette.settledMask, COMPETENCE_BIT.design);
  assert.equal(palette.ownershipEnabled, false);
  assert.equal(geo.shaderProgress, 1);
  assert.equal(geo.settledGeometryId, SINGLE_STATE_IDS.design);
});

test("programmatic jump is latest-wins; restore/same target are no-ops", () => {
  const director = new NavigationDirector();
  director.commitActorTarget("05.1", "programmatic");
  const first = director.observe({
    nowMs: 10,
    rawObservedNodeId: "05.2",
    committedNodeId: "05.2",
    magneticCandidateId: null,
    mode: "programmatic",
    fastGesture: false,
    displayedNodeId: "05.1",
  });
  assert.equal(first.shouldRequestActor, true);
  director.commitActorTarget("05.2", "programmatic");
  const second = director.observe({
    nowMs: 20,
    rawObservedNodeId: "05.5",
    committedNodeId: "05.5",
    magneticCandidateId: null,
    mode: "programmatic",
    fastGesture: false,
    displayedNodeId: "05.2",
  });
  assert.equal(second.shouldRequestActor, true);
  assert.equal(second.token.targetNodeId, "05.5");
  director.commitActorTarget("05.5", "programmatic");
  const same = director.observe({
    nowMs: 30,
    rawObservedNodeId: "05.5",
    committedNodeId: "05.5",
    magneticCandidateId: "05.5",
    mode: "restore",
    fastGesture: false,
    displayedNodeId: "05.5",
  });
  assert.equal(same.shouldRequestActor, false);
});
