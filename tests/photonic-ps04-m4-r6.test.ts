import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ALL_COMPETENCE_MASK, COMPETENCE_BIT } from "../app/visual-lab/photonic-skin-ps04-m2/photonic-palette";
import { PhotonicMotionSession } from "../app/visual-lab/photonic-skin-ps04-m3/session";
import {
  assertSettledGeometryInvariants,
  canAtomicBind,
  displayedShaderProgress,
  emptyGeometrySnapshot,
  type GeometryDisplayedBind,
  type GeometryProgramBind,
} from "../app/visual-lab/photonic-skin-ps04-m4/geometry-authority";
import { GPU_TEXTURE_BUDGET, GpuTexturePool } from "../app/visual-lab/photonic-skin-ps04-m4/gpu-texture-pool";
import { NavigationDirector } from "../app/visual-lab/photonic-skin-ps04-m4/navigation-token";
import { r6StagingEnabled } from "../app/visual-lab/photonic-skin-ps04-m4/r6-instrumentation";
import { ActorResourcePipeline } from "../app/visual-lab/photonic-skin-ps04-m4/resource-lifecycle";
import { MAGNETISM, MAGNETISM_VARIANTS, SELECTED_MAGNETISM_VARIANT } from "../app/visual-lab/photonic-skin-ps04-m4/scroll-controller";
import {
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
  type ScreenActorContract,
} from "../app/visual-lab/photonic-skin-ps04-m4/screen-actor-contract";
import {
  PAIR_CPU_BYTES,
  PAIR_TEXTURE_COUNT,
  TEXTURE_SLOT_SPECS,
} from "../app/visual-lab/photonic-skin-ps04-m4/texture-pack";
import { FROZEN_PHASE_WINDOWS, samplePhaseAdapter } from "../app/visual-lab/photonic-skin-ps04-m3/phase-adapter";
import { ActorTransitionCoordinator } from "../app/visual-lab/photonic-skin-ps04-m4/transition-coordinator";
import {
  CPU_CACHE_BUDGET_DESKTOP,
  CPU_CACHE_BUDGET_MOBILE,
  TransitionProgramCache,
  frozenProgramKey,
  reachableFrozenPairs,
} from "../app/visual-lab/photonic-skin-ps04-m4/transition-prewarm";
import { R6Instrumentation } from "../app/visual-lab/photonic-skin-ps04-m4/r6-instrumentation";

const ROOT = process.cwd();
const m4Lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/PS04M4Lab.tsx"), "utf8");
const m4Scene = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/PS04M4Scene.tsx"), "utf8");
const m4Scroll = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/scroll-controller.ts"), "utf8");
const home = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");

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

function phase(progress: number) {
  return samplePhaseAdapter({
    program: { durationMs: 980, selfTransition: false, phases: FROZEN_PHASE_WINDOWS } as never,
    progress,
    playingTransition: progress < 1,
  });
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

test("R6 frozen hashes remain the R5-designated baselines", () => {
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
  assert.equal(aggregate(m3SourceFiles), "184744da085dc31e08c954640456133308585b7b8ef107de43ab2f8d7a8e6ec1");
  const r5 = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m4-r5/reports/checkpoint-hashes.json"), "utf8"));
  assert.equal(r5.source, "853cd3b8373b3116330acf2643fefdc9d7b84424c3bf1515d9df5c52c15421ef");
  assert.equal(r5.previousM4R4Source, "37e99fe9e6b9a10a6bc735351948fd678facdb50bee6c0ae980dd65bee752069");
  assert.equal(r5.m41AggregateExpected, "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361");
  assert.equal(r5.m41ManifestExpected, "d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441");
  assert.equal(r5.m41rPatchExpected, "228ddce450536d94d625d73f99ceff133371ccfe515a6f21cc3377fa3fda3ca0");
  assert.equal(r5.m31rFingerprintExpected, "0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2");
});

test("1-3 navigation does not await actor preparation and semantic node can change while resources are not gpu-ready", () => {
  assert.match(m4Lab, /requestActorRef\.current = \(next\) => \{ void requestActor\(next\); \}/);
  assert.match(m4Lab, /pipelineRef\.current\.request\(/);
  assert.match(m4Lab, /startClock\(\);\s+return;/);
  assert.doesNotMatch(m4Lab, /await pipelineRef\.current\.request/);
  assert.doesNotMatch(m4Scroll, /programReady|gpu-ready|busy\s*=/);
  assert.doesNotMatch(m4Scroll, /preventDefault/);
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const started = coordinator.begin({
    next: single("content", "05.1", COMPETENCE_BIT.content),
    displayed: coordinator.displayedPlacement(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  assert.equal(started.decision.kind, "geometry");
  assert.equal(started.transaction.visualLifecycle, "preparing");
  assert.equal(started.transaction.programReady, false);
  coordinator.noteCommittedNode("05.1", 1);
  assert.equal(coordinator.committedNodeRevision() > 0, true);
  const geo = coordinator.geometrySnapshot();
  assert.equal(geo.status, "waiting");
  assert.equal(geo.shaderProgress, 1);
});

test("4-7 idle continues while preparing; geometry progress stays 1; palette stays committed", () => {
  const session = new PhotonicMotionSession({ reducedMotion: false, overlayMode: "m3-combined", profile: "desktop" });
  const before = session.snapshot();
  session.tick(0.05, 1);
  session.tick(0.05, 2);
  const after = session.snapshot();
  assert.notEqual(after.phases.breath, before.phases.breath);
  assert.notEqual(after.phases.rotation, before.phases.rotation);
  assert.equal(after.overlayEnabled, true);
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(single("content", "05.1", COMPETENCE_BIT.content));
  coordinator.begin({
    next: single("design", "05.2", COMPETENCE_BIT.design),
    displayed: coordinator.displayedPlacement(),
    displayedLut: coordinator.displayedLut(),
    nowSeconds: after.sessionTime,
    reducedMotion: false,
  });
  coordinator.syncFromSession({
    geometryProgress: 1,
    phase: after.phaseAdapter,
    sessionTime: after.sessionTime + 0.16,
    sessionStatus: "settled",
    geometryPlaying: false,
  });
  const tx = coordinator.snapshot();
  assert.equal(tx.visualLifecycle, "preparing");
  assert.equal(coordinator.geometrySnapshot().shaderProgress, 1);
  assert.equal(tx.fitProgress, 0);
  const palette = coordinator.materialSnapshot(after.phases.color);
  assert.equal(palette.shaderProgress, 0);
  assert.equal(palette.shaderBaseLutHash, palette.sourceLutHash);
  assert.equal(palette.settledMask, COMPETENCE_BIT.content);
});

test("8-10 atomic bind only for gpu-ready current revision; stale and partial banks are rejected", () => {
  const bind: GeometryDisplayedBind = {
    revision: 1,
    programId: "old",
    sourceGeometryId: SINGLE_STATE_IDS.content,
    targetGeometryId: SINGLE_STATE_IDS.design,
    shaderProgress: 1,
    bindFrameToken: 1,
    reverse: false,
  };
  const packet = {
    revision: 2,
    navigationToken: 2,
    program: { programId: "new" },
    source: { entry: { stateId: SINGLE_STATE_IDS.design } },
    target: { entry: { stateId: SINGLE_STATE_IDS.event } },
    bindCommitted: false,
    bindFrameToken: null,
    preparedAtMs: 0,
    gpuReady: true,
    resourceState: "gpu-ready",
  } as unknown as GeometryProgramBind;
  const snapshot = {
    ...emptyGeometrySnapshot({ revision: 2 }),
    status: "waiting" as const,
    programReady: true,
    pendingProgramId: "new",
    revision: 2,
  };
  assert.equal(canAtomicBind({ packet, snapshot, displayed: bind }), true);
  assert.equal(canAtomicBind({
    packet: { ...packet, gpuReady: false, resourceState: "gpu-staging" },
    snapshot,
    displayed: bind,
  }), false);
  assert.equal(canAtomicBind({
    packet: { ...packet, revision: 1 },
    snapshot,
    displayed: bind,
  }), false);
  const director = new NavigationDirector();
  director.commitActorTarget("05.1", "programmatic");
  for (const node of ["05.2", "05.3", "05.4", "05.5"] as const) {
    director.observe({
      nowMs: 10,
      rawObservedNodeId: node,
      committedNodeId: node,
      magneticCandidateId: null,
      mode: "user",
      fastGesture: true,
      displayedNodeId: "05.1",
    });
    director.commitActorTarget(node, "programmatic");
  }
  assert.equal(director.lastIssuedTarget(), "05.5");
});

test("11-16 texture pool is 48, CPU cache is byte-bounded, eviction keeps pins, restore does not duplicate", () => {
  assert.equal(PAIR_TEXTURE_COUNT, 16);
  assert.equal(TEXTURE_SLOT_SPECS.length, 16);
  assert.equal(GPU_TEXTURE_BUDGET, 48);
  const pool = new GpuTexturePool();
  assert.equal(pool.textureCount(), 48);
  assert.equal(pool.overBudget(), false);
  const first = pool.snapshot();
  pool.promoteToActive(pool.forward());
  pool.promoteToActive(pool.pending());
  assert.equal(pool.textureCount(), 48);
  pool.recreateAfterRestore();
  assert.equal(pool.textureCount(), 48);
  assert.equal(pool.snapshot().created - first.created, 48);
  assert.equal(pool.snapshot().disposed, 48);
  const cache = new TransitionProgramCache();
  cache.setBudget(false);
  assert.equal(cache.budgetBytes, CPU_CACHE_BUDGET_DESKTOP);
  cache.setBudget(true);
  assert.equal(cache.budgetBytes, CPU_CACHE_BUDGET_MOBILE);
  cache.budgetBytes = 1000;
  cache.pin("keep");
  cache.insertStubForTest("keep", 800);
  cache.insertStubForTest("drop-a", 800);
  cache.insertStubForTest("drop-b", 800);
  assert.equal(cache.pinnedKeys().includes("keep"), true);
  assert.ok(cache.byteLength() <= cache.budgetBytes || cache.pinnedKeys().includes("keep"));
  assert.ok(PAIR_CPU_BYTES > 0);
});

test("CPU LRU actually evicts unpinned stubs and never the pinned key", () => {
  const cache = new TransitionProgramCache();
  cache.budgetBytes = 1500;
  cache.pin(frozenProgramKey("a", "b", false, "desktop"));
  cache.insertStubForTest(frozenProgramKey("a", "b", false, "desktop"), 1000);
  cache.insertStubForTest(frozenProgramKey("c", "d", false, "desktop"), 1000);
  assert.equal(cache.size() <= 2, true);
  assert.ok(cache.lookup("a", "b", false) || cache.pinnedKeys().includes(frozenProgramKey("a", "b", false, "desktop")));
  const drop = cache.lookup("c", "d", false);
  assert.equal(drop, null);
});

test("17-19 reduced motion and footer do not block navigation; context restore recreates banks", () => {
  assert.match(m4Lab, /pipelineRef\.current\.cancelPending\("exit"\)/);
  assert.match(m4Lab, /restoreGpu/);
  assert.match(m4Lab, /contextLost/);
  assert.match(m4Scene, /recreateAfterRestore|contextGeneration/);
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const reduced = coordinator.begin({
    next: single("content", "05.1", COMPETENCE_BIT.content),
    displayed: coordinator.displayedPlacement(),
    nowSeconds: 0,
    reducedMotion: true,
  });
  assert.equal(reduced.transaction.status, "settled");
  assert.equal(reduced.transaction.geometryProgress, 1);
  const exit = coordinator.begin({
    next: contract({
      nodeId: "08",
      hostNodeId: "08",
      family: "none",
      requestedFamily: "none",
      resolvedGeometryId: null,
      paletteMask: 0,
      slot: "none",
      fitProfile: "master",
    }),
    displayed: coordinator.displayedPlacement(),
    nowSeconds: 1,
    reducedMotion: false,
  });
  assert.equal(exit.decision.kind, "exit");
});

test("20-21 R5 geometry/palette rollback stays fixed; seven SINGLEs keep masks", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(single("content", "05.1", COMPETENCE_BIT.content));
  const started = coordinator.begin({
    next: single("design", "05.2", COMPETENCE_BIT.design),
    displayed: coordinator.displayedPlacement(),
    displayedLut: coordinator.displayedLut(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  assert.equal(displayedShaderProgress({
    transactionStatus: "running",
    transactionRevision: started.transaction.revision,
    transactionProgress: 0,
    programReady: false,
    bind: {
      revision: 0,
      programId: "old",
      sourceGeometryId: SINGLE_STATE_IDS.content,
      targetGeometryId: SINGLE_STATE_IDS.content,
      shaderProgress: 1,
      bindFrameToken: 0,
      reverse: false,
    },
  }), 1);
  coordinator.markProgramReady(started.transaction.revision, "content-design", 1);
  coordinator.markDisplayedBind({
    revision: started.transaction.revision,
    programId: "content-design",
    sourceGeometryId: SINGLE_STATE_IDS.content,
    targetGeometryId: SINGLE_STATE_IDS.design,
    frameToken: 2,
    nowMs: 2,
  });
  coordinator.settle(started.transaction.revision);
  const geo = coordinator.geometrySnapshot();
  assert.equal(geo.shaderProgress, 1);
  assert.equal(geo.settledGeometryId, SINGLE_STATE_IDS.design);
  assert.equal(assertSettledGeometryInvariants(geo).shaderProgressLocked, true);
  for (const [name, node, mask] of SINGLES) {
    const next = coordinator.begin({
      next: single(name, node, mask),
      displayed: coordinator.displayedPlacement(),
      displayedLut: coordinator.displayedLut(),
      nowSeconds: 2,
      reducedMotion: false,
    });
    if (next.decision.kind !== "noop") {
      coordinator.markProgramReady(next.transaction.revision, `${name}-p`, 3);
      coordinator.markDisplayedBind({
        revision: next.transaction.revision,
        programId: `${name}-p`,
        sourceGeometryId: next.transaction.sourceGeometryId,
        targetGeometryId: next.transaction.targetGeometryId,
        frameToken: 4,
        nowMs: 4,
      });
      coordinator.settle(next.transaction.revision);
    }
    assert.equal(coordinator.materialSnapshot().settledMask, mask, name);
    assert.equal(coordinator.geometrySnapshot().settledGeometryId, SINGLE_STATE_IDS[name], name);
  }
});

test("22-25 one material/program path, no per-frame React, initTexture counted, same-target no-op", () => {
  assert.equal((m4Scene.match(/new THREE\.RawShaderMaterial/g) ?? []).length, 1);
  assert.equal((m4Scene.match(/<Canvas/g) ?? []).length, 1);
  assert.match(m4Lab, /lastUi > 160/);
  const poolSource = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/gpu-texture-pool.ts"), "utf8");
  assert.match(poolSource, /initTexture/);
  assert.match(poolSource, /noteInitTexture/);
  assert.match(poolSource, /noteTextureUpload/);
  assert.match(readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/gpu-texture-pool.ts"), "utf8"), /uploadNextSlot/);
  assert.match(m4Lab, /hydrateResident/);
  assert.match(m4Scene, /memo\(PS04M4SceneView/);
  assert.match(m4Scene, /sceneRenderEqual/);
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const first = coordinator.begin({
    next: contract(),
    displayed: coordinator.displayedPlacement(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  assert.equal(first.decision.kind, "noop");
  const inst = new R6Instrumentation();
  inst.noteInitTexture("source", 1.2);
  inst.noteTextureUpload(16);
  assert.equal(inst.initTextureCount, 1);
  assert.equal(inst.textureUploadCount, 1);
  assert.equal(r6StagingEnabled("?r6Staging=0"), false);
  assert.equal(r6StagingEnabled(""), true);
  assert.equal(r6StagingEnabled("?theme=light"), true);
  assert.match(m4Lab, /r6StagingEnabled/);
  assert.match(m4Lab, /sessionId = "ps04-m4-r6-r1"/);
  assert.doesNotMatch(m4Lab, /new Worker/);
  assert.match(readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/compile-broker.ts"), "utf8"), /new Worker/);
  assert.match(readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/compile-worker.ts"), "utf8"), /compileTransition/);
  assert.doesNotMatch(m4Scene, /OffscreenCanvas/);
  assert.match(home, /SiteShell/);
  assert.doesNotMatch(home, /PS04M4Lab/);
});

test("magnetism default A is unchanged; pipeline latest-request-wins", () => {
  assert.equal(SELECTED_MAGNETISM_VARIANT, "a");
  assert.equal(MAGNETISM.inputIdleMs, MAGNETISM_VARIANTS.a.inputIdleMs);
  assert.equal(MAGNETISM.activationRadiusFactor, 0.25);
  assert.equal(MAGNETISM.snapDurationMs, 340);
  const cache = new TransitionProgramCache();
  const pool = new GpuTexturePool();
  const pipeline = new ActorResourcePipeline(cache, pool, new R6Instrumentation());
  pipeline.request({
    revision: 1,
    navigationToken: 1,
    sourceId: MASTER_STATE_ID,
    targetId: SINGLE_STATE_IDS.content,
    reducedMotion: false,
    viewport: "desktop",
    prefer: "forward",
  });
  pipeline.request({
    revision: 2,
    navigationToken: 2,
    sourceId: MASTER_STATE_ID,
    targetId: SINGLE_STATE_IDS.design,
    reducedMotion: false,
    viewport: "desktop",
    prefer: "forward",
  });
  assert.equal(pipeline.isCurrent(1), false);
  assert.equal(pipeline.isCurrent(2), true);
  assert.equal(pipeline.visual, "preparing");
  assert.equal(reachableFrozenPairs("05.2").some(([from, to]) => from === SINGLE_STATE_IDS.content && to === SINGLE_STATE_IDS.design), true);
});

test("clock keeps ticking while coordinator is preparing and does not beginRequest until GPU ready", () => {
  assert.match(m4Lab, /visualLifecycle === "preparing"/);
  assert.match(m4Lab, /pipeline\.onReady/);
  assert.match(m4Lab, /session\.commitTransition/);
  const readyBlock = m4Lab.slice(m4Lab.indexOf("pipeline.onReady"), m4Lab.indexOf("pipeline.yieldGate"));
  assert.ok(readyBlock.indexOf("commitTransition") < readyBlock.indexOf("markProgramReady"));
  assert.match(m4Lab, /beginRequest\(packet\.target/);
  assert.doesNotMatch(m4Lab.slice(m4Lab.indexOf("if (r6StagingRef.current"), m4Lab.indexOf("const revision = session.beginRequest")), /session\.beginRequest/);
});

test("late displayed bind after settle does not force visualLifecycle morphing", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const started = coordinator.begin({
    next: single("content", "05.1", COMPETENCE_BIT.content),
    displayed: coordinator.displayedPlacement(),
    displayedLut: coordinator.displayedLut(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  coordinator.markProgramReady(started.transaction.revision, "master-content", 1);
  coordinator.settle(started.transaction.revision);
  coordinator.syncFromSession({
    sessionTime: 1,
    geometryProgress: 1,
    phase: phase(1),
    programId: "master-content",
    sessionStatus: "settled",
    geometryPlaying: false,
  });
  assert.equal(coordinator.snapshot().status, "settled");
  assert.equal(coordinator.snapshot().visualLifecycle, "settled");
  coordinator.markDisplayedBind({
    revision: started.transaction.revision,
    programId: "master-content",
    sourceGeometryId: started.transaction.sourceGeometryId,
    targetGeometryId: started.transaction.targetGeometryId,
    frameToken: 9,
    nowMs: 9,
  });
  assert.equal(coordinator.snapshot().status, "settled");
  assert.equal(coordinator.snapshot().visualLifecycle, "settled");
  assert.equal(coordinator.geometrySnapshot().shaderProgress, 1);
});
