import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ALL_COMPETENCE_MASK, COMPETENCE_BIT } from "../app/visual-lab/photonic-skin-ps04-m2/photonic-palette";
import { FROZEN_PHASE_WINDOWS, samplePhaseAdapter } from "../app/visual-lab/photonic-skin-ps04-m3/phase-adapter";
import { GpuTexturePool } from "../app/visual-lab/photonic-skin-ps04-m5/gpu-texture-pool";
import {
  CASES_CONTENT,
  CENTER_DWELL_X_EPSILON,
  MERCH_TEAM,
  PALETTE_DELAY_FRACTION,
  PALETTE_GEOMETRY_GATE_EPSILON,
  hasCenterDwell,
  midpointPositionVelocity,
  paletteLeadsGeometry,
  paletteProgressFromGeometryM5,
  positionProgressFromGeometryM5,
  prepareMustNotPublish,
  type PositionFrame,
} from "../app/visual-lab/photonic-skin-ps04-m5/m5-choreography";
import { NavigationDirector } from "../app/visual-lab/photonic-skin-ps04-m5/navigation-token";
import {
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
  indexStates,
  resolveScreenActorContract,
  type ScreenActorContract,
} from "../app/visual-lab/photonic-skin-ps04-m5/screen-actor-contract";
import { MAGNETISM } from "../app/visual-lab/photonic-skin-ps04-m5/scroll-controller";
import {
  ActorTransitionCoordinator,
  PALETTE_DELAY_FRACTION as COORDINATOR_PALETTE_DELAY,
  paletteProgressFromGeometryR3,
  type DisplayedPlacement,
} from "../app/visual-lab/photonic-skin-ps04-m5/transition-coordinator";

const ROOT = process.cwd();
const lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/PS04M5Lab.tsx"), "utf8");
const scene = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/PS04M5Scene.tsx"), "utf8");
const coordinatorSource = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/transition-coordinator.ts"), "utf8");
const home = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
const r6r1Hashes = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m4-r6-r1/reports/checkpoint-hashes.json"), "utf8"));

function shaFile(file: string) {
  return createHash("sha256").update(readFileSync(path.join(ROOT, file))).digest("hex");
}

function aggregate(files: string[]) {
  const records = files
    .slice()
    .sort((left, right) => left.localeCompare(right))
    .map((file) => `${file}\t${shaFile(file)}\n`)
    .join("");
  return createHash("sha256").update(records).digest("hex");
}

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

function displayed(partial: Partial<DisplayedPlacement> = {}): DisplayedPlacement {
  return {
    slot: "right",
    fit: 1,
    fitProfile: "master",
    paletteMask: ALL_COMPETENCE_MASK,
    paletteProgress: 1,
    geometryId: MASTER_STATE_ID,
    nodeId: "01",
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

function casesToContent() {
  return contract({
    nodeId: CASES_CONTENT.target,
    hostNodeId: CASES_CONTENT.target,
    family: "SINGLE",
    requestedFamily: "SINGLE",
    resolvedGeometryId: SINGLE_STATE_IDS.content,
    paletteMask: COMPETENCE_BIT.content,
    slot: CASES_CONTENT.targetSlot,
    fitProfile: "single",
  });
}

function merchToTeam() {
  return contract({
    nodeId: MERCH_TEAM.target,
    hostNodeId: MERCH_TEAM.target,
    family: "MASTER",
    requestedFamily: "MASTER",
    resolvedGeometryId: MASTER_STATE_ID,
    paletteMask: ALL_COMPETENCE_MASK,
    slot: MERCH_TEAM.targetSlot,
    fitProfile: "master",
  });
}

function merchDisplayed(): DisplayedPlacement {
  return displayed({
    slot: "left",
    fit: 1.36,
    fitProfile: "single",
    paletteMask: COMPETENCE_BIT.merch,
    geometryId: SINGLE_STATE_IDS.merch,
    nodeId: "05.7",
  });
}

function simulateBoundary(args: {
  coordinator: ActorTransitionCoordinator;
  next: ScreenActorContract;
  shown: DisplayedPlacement;
  prepareSeconds?: number;
  width?: number;
  fromX?: number;
  toX?: number;
}) {
  const width = args.width ?? 1920;
  const fromX = args.fromX ?? width * 0.76;
  const toX = args.toX ?? width * 0.245;
  args.coordinator.adoptSettled(contract({
    nodeId: args.shown.nodeId === "none" ? "01" : args.shown.nodeId,
    hostNodeId: args.shown.nodeId === "none" ? "01" : args.shown.nodeId,
    resolvedGeometryId: args.shown.geometryId,
    paletteMask: args.shown.paletteMask,
    slot: args.shown.slot,
    fitProfile: args.shown.fitProfile,
  }));
  const started = args.coordinator.begin({
    next: args.next,
    displayed: args.shown,
    nowSeconds: 0,
    reducedMotion: false,
  });
  const frames: PositionFrame[] = [];
  const prepareSeconds = args.prepareSeconds ?? 0.2;
  for (let step = 0; step <= 12; step += 1) {
    const elapsed = (prepareSeconds * step) / 12;
    const snap = args.coordinator.syncFromSession({
      geometryProgress: 1,
      phase: phase(1),
      sessionTime: elapsed,
      sessionStatus: "transitioning",
      geometryPlaying: false,
    });
    frames.push({
      x: fromX + (toX - fromX) * snap.positionProgress,
      width,
      positionProgress: snap.positionProgress,
      geometryProgress: snap.geometryProgress,
      status: snap.status,
    });
  }
  args.coordinator.markProgramReady(started.transaction.revision, "prog", prepareSeconds * 1000);
  for (let step = 0; step <= 40; step += 1) {
    const g = step / 40;
    const snap = args.coordinator.syncFromSession({
      geometryProgress: g,
      phase: phase(g),
      sessionTime: prepareSeconds + g * 0.98,
      sessionStatus: "transitioning",
      geometryPlaying: g < 1,
      programId: "prog",
    });
    frames.push({
      x: fromX + (toX - fromX) * snap.positionProgress,
      width,
      positionProgress: snap.positionProgress,
      geometryProgress: snap.geometryProgress,
      status: snap.status,
    });
  }
  return { started, frames };
}

test("M5.1 prepare does not publish palette or advance actor X", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract({ nodeId: "04", hostNodeId: "04" }));
  const started = coordinator.begin({
    next: casesToContent(),
    displayed: displayed({ nodeId: "04" }),
    nowSeconds: 0,
    reducedMotion: false,
  });
  assert.equal(started.decision.kind, "geometry");
  assert.equal(started.transaction.revision, 1);
  const preparing = coordinator.syncFromSession({
    geometryProgress: 1,
    phase: phase(1),
    sessionTime: 0.2,
    sessionStatus: "transitioning",
    geometryPlaying: false,
  });
  assert.equal(preparing.visualLifecycle, "preparing");
  assert.equal(preparing.visualPublished, false);
  assert.equal(preparing.geometryProgress, 0);
  assert.equal(preparing.paletteProgress, 0);
  assert.equal(preparing.positionProgress, 0);
  const gate = prepareMustNotPublish({
    visualLifecycle: preparing.visualLifecycle,
    geometryProgress: preparing.geometryProgress,
    paletteProgress: preparing.paletteProgress,
    visualPublished: preparing.visualPublished,
    activeBankId: 0,
    preparingBankId: 1,
  });
  assert.equal(gate.paletteHeld, true);
  assert.equal(gate.geometryHeld, true);
  assert.equal(gate.notPublished, true);
  assert.doesNotMatch(lab, /applyLinkedPaletteRef\.current\(tx\.paletteProgress\)/);
  assert.doesNotMatch(lab, /mode: reducedMotion \? "immediate" : "geometry-linked"/);
});

test("M5.1 prepare does not promote the active GPU bank", () => {
  const pool = new GpuTexturePool();
  const before = pool.snapshot().banks[0]!.id;
  const staging = pool.acquireStaging(new Set());
  assert.notEqual(staging.id, before);
  assert.equal(pool.snapshot().banks[0]!.id, before);
  pool.promoteToActive(staging);
  assert.equal(pool.snapshot().banks[0]!.id, before);
  assert.match(coordinatorSource, /visualPublished = false/);
  assert.doesNotMatch(coordinatorSource, /elapsedSeconds \/ SLOT_PREPARE_SECONDS/);
});

test("M5.1 commit creates one transaction on a single clock", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract({ nodeId: "04", hostNodeId: "04" }));
  const first = coordinator.begin({
    next: casesToContent(),
    displayed: displayed({ nodeId: "04" }),
    nowSeconds: 0,
    reducedMotion: false,
  });
  coordinator.markProgramReady(first.transaction.revision, "prog");
  const mid = coordinator.syncFromSession({
    geometryProgress: 0.5,
    phase: phase(0.5),
    sessionTime: 0.49,
    sessionStatus: "transitioning",
    geometryPlaying: true,
    programId: "prog",
  });
  assert.equal(mid.revision, first.transaction.revision);
  assert.equal(mid.kind, "geometry");
  assert.equal(mid.geometryProgress, 0.5);
  assert.equal(mid.positionProgress, positionProgressFromGeometryM5(0.5));
  assert.equal(mid.paletteProgress, paletteProgressFromGeometryM5(0.5));
  assert.equal(coordinator.isCurrent(first.transaction.revision), true);
  assert.equal(PALETTE_DELAY_FRACTION, COORDINATOR_PALETTE_DELAY);
  assert.ok(PALETTE_DELAY_FRACTION >= 0.04 && PALETTE_DELAY_FRACTION <= 0.08);
});

test("M5.1 palette does not lead geometry and delay is not a timer", () => {
  assert.equal(paletteProgressFromGeometryR3(FROZEN_PHASE_WINDOWS.approach[0]), 1);
  assert.ok(paletteProgressFromGeometryM5(FROZEN_PHASE_WINDOWS.approach[0]) < 0.999);
  assert.equal(paletteProgressFromGeometryM5(PALETTE_DELAY_FRACTION), 0);
  assert.equal(paletteProgressFromGeometryM5(1), 1);
  assert.equal(paletteLeadsGeometry(PALETTE_GEOMETRY_GATE_EPSILON, 0), false);
  assert.equal(paletteLeadsGeometry(0.01, 0.2), true);
  assert.equal(paletteLeadsGeometry(0.5, paletteProgressFromGeometryM5(0.5)), false);
  assert.ok(paletteProgressFromGeometryM5(0.5) <= 0.5);
  assert.ok(paletteProgressFromGeometryM5(0.62) <= 0.62);
  assert.ok(paletteProgressFromGeometryM5(0.95) < 1);
  assert.doesNotMatch(coordinatorSource, /setTimeout\([^)]*palette/i);
  assert.doesNotMatch(lab, /setTimeout\([^)]*palette/i);
  assert.match(coordinatorSource, /PALETTE_DELAY_FRACTION/);
});

test("M5.1 Cases→Content has no center settle and midpoint velocity is nonzero", () => {
  const coordinator = new ActorTransitionCoordinator();
  const { started, frames } = simulateBoundary({
    coordinator,
    next: casesToContent(),
    shown: displayed({ nodeId: "04" }),
    fromX: 1920 * 0.76,
    toX: 1920 * 0.245,
  });
  assert.equal(started.transaction.sourceSlot, "right");
  assert.equal(started.transaction.targetSlot, "left");
  assert.equal(hasCenterDwell(frames), false);
  const morph = frames.filter((frame) => frame.geometryProgress > 0 && frame.geometryProgress < 1);
  const velocities = morph.map((frame) => frame.positionProgress);
  assert.ok(Math.abs(midpointPositionVelocity(velocities)) > 1e-4);
  const heldPrepare = frames.filter((frame) => frame.geometryProgress === 0);
  assert.ok(heldPrepare.every((frame) => frame.positionProgress === 0));
  assert.ok(CENTER_DWELL_X_EPSILON > 0 && CENTER_DWELL_X_EPSILON < 0.01);
});

test("M5.1 Merch→Team has no center settle", () => {
  const coordinator = new ActorTransitionCoordinator();
  const { started, frames } = simulateBoundary({
    coordinator,
    next: merchToTeam(),
    shown: merchDisplayed(),
    fromX: 1920 * 0.245,
    toX: 1920 * 0.76,
  });
  assert.equal(started.transaction.sourceSlot, "left");
  assert.equal(started.transaction.targetSlot, "right");
  assert.equal(hasCenterDwell(frames), false);
  const morph = frames.filter((frame) => frame.geometryProgress > 0 && frame.geometryProgress < 1);
  assert.ok(Math.abs(midpointPositionVelocity(morph.map((frame) => frame.positionProgress))) > 1e-4);
});

test("M5.1 reverse retarget starts from the current snapshot", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract({ nodeId: "04", hostNodeId: "04" }));
  coordinator.begin({
    next: casesToContent(),
    displayed: displayed({ nodeId: "04" }),
    nowSeconds: 0,
    reducedMotion: false,
  });
  coordinator.markProgramReady(1, "prog");
  coordinator.syncFromSession({
    geometryProgress: 0.4,
    phase: phase(0.4),
    sessionTime: 0.4,
    sessionStatus: "transitioning",
    geometryPlaying: true,
  });
  const live = coordinator.displayedPlacement();
  const reverse = coordinator.begin({
    next: contract({ nodeId: "04", hostNodeId: "04", slot: "right" }),
    displayed: { ...live, paletteMask: COMPETENCE_BIT.content, geometryId: SINGLE_STATE_IDS.content },
    nowSeconds: 0.4,
    reducedMotion: false,
    reverse: true,
  });
  assert.equal(reverse.transaction.sourceGeometryId, SINGLE_STATE_IDS.content);
  assert.equal(reverse.transaction.sourcePaletteMask, COMPETENCE_BIT.content);
  assert.equal(reverse.transaction.targetGeometryId, MASTER_STATE_ID);
  assert.equal(reverse.transaction.geometryProgress, 0);
  assert.match(lab, /placementFromRef\.current = \{/);
});

test("M5.1 stale revision cannot settle; same-contract is no-op; latest target wins", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract({ nodeId: "04", hostNodeId: "04" }));
  const first = coordinator.begin({
    next: casesToContent(),
    displayed: displayed({ nodeId: "04" }),
    nowSeconds: 0,
    reducedMotion: false,
  });
  const second = coordinator.begin({
    next: contract({
      nodeId: "05.2",
      hostNodeId: "05.2",
      family: "SINGLE",
      requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.design,
      paletteMask: COMPETENCE_BIT.design,
      slot: "left",
      fitProfile: "single",
    }),
    displayed: displayed({
      nodeId: "05.1",
      geometryId: SINGLE_STATE_IDS.content,
      paletteMask: COMPETENCE_BIT.content,
      slot: "left",
      fitProfile: "single",
      fit: 1.36,
    }),
    nowSeconds: 0.1,
    reducedMotion: false,
  });
  assert.equal(coordinator.settle(first.transaction.revision), false);
  assert.equal(coordinator.snapshot().status, "running");
  assert.equal(coordinator.snapshot().targetGeometryId, SINGLE_STATE_IDS.design);
  assert.equal(second.transaction.revision, 2);
  const noop = coordinator.begin({
    next: contract({
      nodeId: "05.2",
      hostNodeId: "05.2",
      family: "SINGLE",
      requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.design,
      paletteMask: COMPETENCE_BIT.design,
      slot: "left",
      fitProfile: "single",
    }),
    displayed: displayed({
      nodeId: "05.2",
      geometryId: SINGLE_STATE_IDS.design,
      paletteMask: COMPETENCE_BIT.design,
      slot: "left",
      fitProfile: "single",
      fit: 1.36,
      paletteProgress: 1,
    }),
    nowSeconds: 0.2,
    reducedMotion: false,
  });
  assert.equal(noop.decision.kind, "noop");
});

test("M5.1 magnetism still snaps screens but does not mint a center actor target", () => {
  assert.equal(MAGNETISM.inputIdleMs, 160);
  assert.equal(MAGNETISM.activationRadiusFactor, 0.25);
  assert.equal(MAGNETISM.snapDurationMs, 340);
  const director = new NavigationDirector();
  const magnetic = director.observe({
    nowMs: 1000,
    rawObservedNodeId: "05.1",
    committedNodeId: "05.1",
    magneticCandidateId: "04",
    mode: "magnetic",
    fastGesture: false,
    displayedNodeId: "05.1",
  });
  assert.equal(magnetic.shouldRequestActor, false);
  assert.equal(magnetic.token.targetNodeId, "05.1");
  const retarget = director.observe({
    nowMs: 1100,
    rawObservedNodeId: "04",
    committedNodeId: "04",
    magneticCandidateId: "04",
    mode: "magnetic",
    fastGesture: false,
    displayedNodeId: "05.1",
  });
  assert.equal(retarget.shouldRequestActor, true);
  assert.equal(retarget.token.targetNodeId, "04");
});

test("M5.1 reduced motion is atomic and footer has no actor", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract({ nodeId: "04", hostNodeId: "04" }));
  const reduced = coordinator.begin({
    next: casesToContent(),
    displayed: displayed({ nodeId: "04" }),
    nowSeconds: 0,
    reducedMotion: true,
  });
  assert.equal(reduced.transaction.status, "settled");
  assert.equal(reduced.transaction.geometryProgress, 1);
  assert.equal(reduced.transaction.paletteProgress, 1);
  assert.equal(reduced.transaction.positionProgress, 1);
  const footer = resolveScreenActorContract({
    nodeId: "08",
    index: indexStates([]),
    flow: {
      taskId: null,
      taskSelected: false,
      competencies: [],
      competenciesConfirmed: false,
      settledStateId: MASTER_STATE_ID,
    },
  });
  assert.equal(footer.family, "none");
  assert.equal(footer.resolvedGeometryId, null);
  assert.match(scene, /uActorMask/);
  assert.match(scene, /__PS04M5_ACTOR_FRAMEBUFFER_READY__/);
  assert.match(lab, /sessionId = "ps04-m5-1"/);
  assert.match(lab, /PS-04\.M5\.1/);
});

test("M5.1 frozen hashes and production homepage stay untouched", () => {
  assert.equal(aggregate(r6r1Hashes.sourceFiles), "e20a49407d20c7ef6af5f0a69cbf4dd36a6c7bd99782984a7f3be4b4cb755e76");
  assert.equal(r6r1Hashes.m1Source, "4cb80b507605bf439e9de5210e5f022159c716ee286fa81b98f0e943cf5b75eb");
  assert.equal(r6r1Hashes.m2Source, "f04bc262cdc80e6061d2ad7fdb6501f60aa0a31105a55f876a8eaa26f0266c0d");
  assert.equal(r6r1Hashes.m3Source, "184744da085dc31e08c954640456133308585b7b8ef107de43ab2f8d7a8e6ec1");
  assert.equal(r6r1Hashes.previousM4R5Source, "853cd3b8373b3116330acf2643fefdc9d7b84424c3bf1515d9df5c52c15421ef");
  assert.equal(r6r1Hashes.rejectedR6Source, "4a24385bcdda85496155e699edfbeab9bc1818488c1c246884ab3088d3acdb4f");
  assert.match(home, /ProductionPhotonicSiteClient/);
  assert.doesNotMatch(home, /photonic-skin-ps04-m5/);
  assert.doesNotMatch(home, /PS04M5Lab/);
  assert.equal((scene.match(/new THREE\.RawShaderMaterial/g) ?? []).length, 1);
  assert.equal((scene.match(/<Canvas/g) ?? []).length, 1);
});
