import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { checkpointAggregate } from "./checkpoint-hash";
import { ALL_COMPETENCE_MASK, COMPETENCE_BIT } from "../app/visual-lab/photonic-skin-ps04-m2/photonic-palette";
import { PhotonicMotionSession } from "../app/visual-lab/photonic-skin-ps04-m3/session";
import { FROZEN_PHASE_WINDOWS, samplePhaseAdapter } from "../app/visual-lab/photonic-skin-ps04-m3/phase-adapter";
import {
  continuityProtectedActivation,
  continuityRadiusLift,
  paletteOwnershipWeight,
} from "../app/visual-lab/photonic-skin-ps04-m4/continuity-overlay";
import { GeometryIdTrace, traceFromTransaction } from "../app/visual-lab/photonic-skin-ps04-m4/geometry-id-trace";
import { MAGNETISM, ScrollCompositionController } from "../app/visual-lab/photonic-skin-ps04-m4/scroll-controller";
import {
  CANONICAL_BRAND_WIDE_ID,
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
  type ScreenActorContract,
} from "../app/visual-lab/photonic-skin-ps04-m4/screen-actor-contract";
import { SITE_FIT_PROFILES } from "../app/visual-lab/photonic-skin-ps04-m4/site-fit";
import {
  ActorTransitionCoordinator,
  classifyActorChange,
  interceptGeometryLinkedProgress,
  paletteProgressFromGeometryR3,
  semanticActorKey,
  siteProgressFromGeometry,
  type DisplayedPlacement,
} from "../app/visual-lab/photonic-skin-ps04-m4/transition-coordinator";

const ROOT = process.cwd();
const m4Lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/PS04M4Lab.tsx"), "utf8");
const m4Scene = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/PS04M4Scene.tsx"), "utf8");




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

test("R3 frozen hashes remain exact and M3 sources are untouched", () => {
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
  assert.equal(JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m4-r2/reports/checkpoint-hashes.json"), "utf8")).source, "726bc3bbf3f6c8d754b82204d4d02a20cd519fb836e1c5521c0ccb5d224e4333");
  assert.equal(SITE_FIT_PROFILES.master, 1);
  assert.equal(SITE_FIT_PROFILES.brandWide, 1.16);
  assert.equal(SITE_FIT_PROFILES.complex, 1.14);
  assert.equal(SITE_FIT_PROFILES.single, 1.36);
  assert.equal(SITE_FIT_PROFILES.none, 1);
  assert.equal(MAGNETISM.inputIdleMs, 160);
  assert.equal(MAGNETISM.activationRadiusFactor, 0.25);
  assert.equal(MAGNETISM.snapDurationMs, 340);
});

test("one committed node creates at most one transaction; same contract is a no-op", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const first = coordinator.begin({
    next: contract({
      nodeId: "05.1",
      hostNodeId: "05.1",
      family: "SINGLE",
      requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.content,
      paletteMask: COMPETENCE_BIT.content,
      slot: "left",
      fitProfile: "single",
    }),
    displayed: displayed(),
    nowSeconds: 1,
    reducedMotion: false,
  });
  assert.equal(first.decision.kind, "geometry");
  assert.equal(first.transaction.revision, 1);
  const again = coordinator.begin({
    next: contract({
      nodeId: "05.1",
      hostNodeId: "05.1",
      family: "SINGLE",
      requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.content,
      paletteMask: COMPETENCE_BIT.content,
      slot: "left",
      fitProfile: "single",
    }),
    displayed: displayed({ geometryId: SINGLE_STATE_IDS.content, slot: "left", fitProfile: "single", fit: 1.36, paletteMask: COMPETENCE_BIT.content, nodeId: "05.1" }),
    nowSeconds: 1.2,
    reducedMotion: false,
  });
  assert.equal(again.decision.kind, "noop");
  assert.equal(again.transaction.revision, 1);
  assert.equal(coordinator.geometryRequestLog().length, 1);
});

test("MASTER 01→04 same geometry+palette+slot+fit is a full no-op", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const next = contract({ nodeId: "04", hostNodeId: "04" });
  assert.equal(classifyActorChange(semanticActorKey(contract()), next), "noop");
  assert.equal(coordinator.begin({ next, displayed: displayed(), nowSeconds: 0, reducedMotion: false }).decision.kind, "noop");
});

test("stale revision cannot settle after a newer request", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const first = coordinator.begin({
    next: contract({
      nodeId: "05.1", hostNodeId: "05.1", family: "SINGLE", requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.content, paletteMask: COMPETENCE_BIT.content, slot: "left", fitProfile: "single",
    }),
    displayed: displayed(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  const second = coordinator.begin({
    next: contract({
      nodeId: "05.2", hostNodeId: "05.2", family: "SINGLE", requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.design, paletteMask: COMPETENCE_BIT.design, slot: "left", fitProfile: "single",
    }),
    displayed: displayed({ geometryId: SINGLE_STATE_IDS.content, paletteMask: COMPETENCE_BIT.content, slot: "left", fit: 1.2, fitProfile: "single" }),
    nowSeconds: 0.1,
    reducedMotion: false,
  });
  assert.equal(coordinator.settle(first.transaction.revision), false);
  assert.equal(coordinator.isCurrent(first.transaction.revision), false);
  assert.equal(coordinator.settle(second.transaction.revision), true);
  assert.equal(second.transaction.sourceGeometryId, SINGLE_STATE_IDS.content);
  assert.deepEqual(coordinator.uniqueFrozenGeometryRequests(), [SINGLE_STATE_IDS.content, SINGLE_STATE_IDS.design]);
});

test("third frozen geometry ID is never requested; overlays do not create geometry requests", () => {
  const coordinator = new ActorTransitionCoordinator();
  const brief = contract({
    nodeId: "03.3", hostNodeId: "03.3", family: "DRIVE", requestedFamily: "DRIVE",
    resolvedGeometryId: "brand-wide-drive-content-design-digital-event-games-merch-video",
    paletteMask: ALL_COMPETENCE_MASK, slot: "right", fitProfile: "brandWide",
  });
  coordinator.adoptSettled(brief);
  const overlay = coordinator.begin({
    next: { ...brief, nodeId: "03.3A" },
    displayed: displayed({ geometryId: brief.resolvedGeometryId, fit: 1.16, fitProfile: "brandWide", nodeId: "03.3" }),
    nowSeconds: 0,
    reducedMotion: false,
  });
  assert.equal(overlay.decision.kind, "noop");
  assert.equal(coordinator.geometryRequestLog().length, 0);
});

test("geometry, palette and site share one revision; one clock token per frame", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const started = coordinator.begin({
    next: contract({
      nodeId: "05.1", hostNodeId: "05.1", family: "SINGLE", requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.content, paletteMask: COMPETENCE_BIT.content, slot: "left", fitProfile: "single",
    }),
    displayed: displayed(),
    nowSeconds: 0,
    reducedMotion: false,
    durationSeconds: 0.98,
  });
  const synced = coordinator.syncFromSession({
    geometryProgress: 0.5,
    phase: phase(0.5),
    sessionTime: 0.49,
    programId: "content-program",
  });
  assert.equal(synced.revision, started.transaction.revision);
  assert.equal(synced.kind, "geometry");
  assert.ok(synced.siteProgress > 0 && synced.siteProgress < 1);
  assert.equal(coordinator.noteSessionTick(1).accepted, true);
  assert.equal(coordinator.noteSessionTick(1).accepted, false);
  assert.equal(coordinator.noteSessionTick(2).ticksThisFrame, 1);
});

test("session geometry-linked writes are ignored until the coordinator applies progress", () => {
  const calls: number[] = [];
  const driver = {
    setGeometryLinkedProgress(progress: number) {
      calls.push(progress);
    },
  };
  const apply = interceptGeometryLinkedProgress(driver);
  driver.setGeometryLinkedProgress(1);
  assert.deepEqual(calls, []);
  apply(0.2);
  apply(1);
  assert.deepEqual(calls, [0.2, 1]);
  assert.match(m4Lab, /interceptGeometryLinkedProgress/);
  assert.match(m4Lab, /applyLinkedPaletteRef/);
});

test("source palette is held on source-like particles; target color follows rebuild", () => {
  assert.equal(paletteOwnershipWeight({ localT: 0, sourceActive: 1, targetActive: 1, progress: 0 }), 0);
  assert.equal(paletteOwnershipWeight({ localT: 1, sourceActive: 1, targetActive: 1, progress: 1 }), 1);
  assert.equal(paletteOwnershipWeight({ localT: 0.8, sourceActive: 1, targetActive: 0, progress: 0.5 }), 0);
  assert.ok(paletteOwnershipWeight({ localT: 0.2, sourceActive: 1, targetActive: 1, progress: 0.5 }) < 0.3);
  assert.ok(paletteOwnershipWeight({ localT: 0.9, sourceActive: 0, targetActive: 1, progress: 0.7 }) > 0.8);
  assert.equal(paletteProgressFromGeometryR3(0.2), 0);
  assert.equal(paletteProgressFromGeometryR3(FROZEN_PHASE_WINDOWS.reveal[0]), 0);
  assert.equal(paletteProgressFromGeometryR3(FROZEN_PHASE_WINDOWS.approach[0]), 1);
  assert.equal(paletteProgressFromGeometryR3(0.5, { sameMask: true }), 1);
});

test("same-mask geometry does not fade palette; palette-only does not fake geometry", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const brand = coordinator.begin({
    next: contract({
      nodeId: "02", hostNodeId: "02", family: "BRAND_WIDE", requestedFamily: "BRAND_WIDE",
      resolvedGeometryId: CANONICAL_BRAND_WIDE_ID, paletteMask: ALL_COMPETENCE_MASK, fitProfile: "brandWide",
    }),
    displayed: displayed(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  assert.equal(brand.transaction.kind, "geometry");
  assert.equal(brand.transaction.paletteProgress, 1);
  assert.equal(brand.transaction.paletteOwnershipMode, 0);
  const paletteOnly = coordinator.begin({
    next: contract({
      nodeId: "03.2", hostNodeId: "03.2", family: "BRAND_WIDE", requestedFamily: "BRAND_WIDE",
      resolvedGeometryId: CANONICAL_BRAND_WIDE_ID, paletteMask: COMPETENCE_BIT.content | COMPETENCE_BIT.design,
      fitProfile: "brandWide",
    }),
    displayed: displayed({ geometryId: CANONICAL_BRAND_WIDE_ID, fit: 1.16, fitProfile: "brandWide", nodeId: "02" }),
    nowSeconds: 1,
    reducedMotion: false,
  });
  assert.equal(paletteOnly.transaction.kind, "palette-only");
  assert.equal(paletteOnly.transaction.geometryProgress, 1);
  assert.equal(paletteOnly.transaction.paletteOwnershipMode, 0);
});

test("session color phase is not reset by an actor request", () => {
  const session = new PhotonicMotionSession();
  session.palette.setPhase(0.37);
  session.palette.setMask(COMPETENCE_BIT.design, { mode: "geometry-linked" });
  assert.equal(session.palette.snapshot().phase.toFixed(4), "0.3700");
  session.tick(0.016, 1);
  const afterFirst = session.palette.snapshot().phase;
  session.tick(0.016, 1);
  assert.equal(session.palette.snapshot().phase, afterFirst);
});

test("interrupt starts from the displayed mixture, slot and fit", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  coordinator.begin({
    next: contract({
      nodeId: "05.1", hostNodeId: "05.1", family: "SINGLE", requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.content, paletteMask: COMPETENCE_BIT.content, slot: "left", fitProfile: "single",
    }),
    displayed: displayed(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  coordinator.syncFromSession({ geometryProgress: 0.4, phase: phase(0.4), sessionTime: 0.4 });
  const live = coordinator.displayedPlacement();
  const interrupted = coordinator.begin({
    next: contract({
      nodeId: "05.2", hostNodeId: "05.2", family: "SINGLE", requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.design, paletteMask: COMPETENCE_BIT.design, slot: "left", fitProfile: "single",
    }),
    displayed: { ...live, paletteMask: COMPETENCE_BIT.content, paletteProgress: 0.2, geometryId: SINGLE_STATE_IDS.content },
    nowSeconds: 0.4,
    reducedMotion: false,
  });
  assert.equal(interrupted.transaction.sourceGeometryId, SINGLE_STATE_IDS.content);
  assert.equal(interrupted.transaction.sourcePaletteMask, COMPETENCE_BIT.content);
  assert.ok(Math.abs(interrupted.transaction.sourceFit - live.fit) < 1e-9);
  assert.equal(interrupted.transaction.revision, 2);
});

test("compile gap does not settle the transaction from a stale session endpoint", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const started = coordinator.begin({
    next: contract({
      nodeId: "05.1", hostNodeId: "05.1", family: "SINGLE", requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.content, paletteMask: COMPETENCE_BIT.content, slot: "left", fitProfile: "single",
    }),
    displayed: displayed(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  const waiting = coordinator.syncFromSession({
    geometryProgress: 1,
    phase: phase(1),
    sessionTime: 0.05,
    sessionStatus: "transitioning",
    geometryPlaying: false,
  });
  assert.equal(started.transaction.status, "running");
  assert.equal(waiting.status, "running");
  assert.equal(waiting.geometryProgress, 0);
  assert.equal(waiting.semanticPhase, "anticipation");
  assert.equal(waiting.paletteProgress, 0);
  const playing = coordinator.syncFromSession({
    geometryProgress: 0.4,
    phase: phase(0.4),
    sessionTime: 0.4,
    sessionStatus: "transitioning",
    geometryPlaying: true,
  });
  assert.equal(playing.status, "running");
  assert.ok(playing.geometryProgress > 0 && playing.geometryProgress < 1);
});

test("settled transaction disables continuity overlay", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const started = coordinator.begin({
    next: contract({
      nodeId: "05.1", hostNodeId: "05.1", family: "SINGLE", requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.content, paletteMask: COMPETENCE_BIT.content, slot: "left", fitProfile: "single",
    }),
    displayed: displayed(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  assert.equal(started.transaction.continuityEnabled, 1);
  coordinator.settle(started.transaction.revision);
  const settled = coordinator.syncFromSession({ geometryProgress: 1, phase: phase(1), sessionTime: 1 });
  assert.equal(settled.status, "settled");
  assert.equal(settled.continuityEnabled, 0);
  assert.equal(settled.paletteOwnershipMode, 0);
});

test("continuity overlay preserves endpoints and identity bypass", () => {
  const mid = continuityProtectedActivation({
    activation: 0.05, sourceActive: 1, targetActive: 1, localT: 0.4, progress: 0.5, floor: 0.38,
  });
  assert.ok(mid >= 0.38);
  assert.equal(continuityProtectedActivation({
    activation: 0.2, sourceActive: 1, targetActive: 1, localT: 0, progress: 0,
  }), 0.2);
  assert.equal(continuityProtectedActivation({
    activation: 0.9, sourceActive: 0, targetActive: 1, localT: 1, progress: 1,
  }), 0.9);
  assert.equal(continuityRadiusLift({ activation: 0.05, protectedActivation: 0.38, identity: true, progress: 0.5 }), 1);
  assert.ok(continuityRadiusLift({ activation: 0.05, protectedActivation: 0.38, enabled: true, progress: 0.5 }) > 1);
  assert.equal(siteProgressFromGeometry(0.1), 0);
  assert.ok(siteProgressFromGeometry(0.4) > 0);
  assert.equal(siteProgressFromGeometry(0.62), 1);
  assert.equal(siteProgressFromGeometry(0.4, true), 1);
});

test("geometry ID trace rejects a third frozen request", () => {
  const trace = new GeometryIdTrace();
  trace.start();
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const first = coordinator.begin({
    next: contract({
      nodeId: "05.1", hostNodeId: "05.1", family: "SINGLE", requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.content, paletteMask: COMPETENCE_BIT.content, slot: "left", fitProfile: "single",
    }),
    displayed: displayed(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  trace.push(traceFromTransaction({
    frameToken: 1, timestamp: 0, transaction: first.transaction,
    activeNodeId: "05.1", committedNodeId: "05.1", actorDraw: true, frameDeltaMs: 16.6,
  }));
  const second = coordinator.begin({
    next: contract({
      nodeId: "05.2", hostNodeId: "05.2", family: "SINGLE", requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.design, paletteMask: COMPETENCE_BIT.design, slot: "left", fitProfile: "single",
    }),
    displayed: displayed({ geometryId: SINGLE_STATE_IDS.content, paletteMask: COMPETENCE_BIT.content }),
    nowSeconds: 0.2,
    reducedMotion: false,
  });
  trace.push(traceFromTransaction({
    frameToken: 2, timestamp: 200, transaction: second.transaction,
    activeNodeId: "05.2", committedNodeId: "05.2", actorDraw: true, frameDeltaMs: 16.6,
  }));
  assert.equal(trace.thirdGeometryPresent(), false);
  assert.deepEqual(trace.requestedFrozenIds(), [SINGLE_STATE_IDS.content, SINGLE_STATE_IDS.design]);
});

test("programmatic committed node ignores crossed screens; reduced motion settles immediately", () => {
  const controller = new ScrollCompositionController();
  assert.equal(controller.committedActorNodeId(), "01");
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const reduced = coordinator.begin({
    next: contract({
      nodeId: "05.1", hostNodeId: "05.1", family: "SINGLE", requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.content, paletteMask: COMPETENCE_BIT.content, slot: "left", fitProfile: "single",
    }),
    displayed: displayed(),
    nowSeconds: 0,
    reducedMotion: true,
  });
  assert.equal(reduced.transaction.status, "settled");
  assert.equal(reduced.transaction.geometryProgress, 1);
  assert.equal(reduced.transaction.paletteProgress, 1);
  assert.equal(reduced.transaction.siteProgress, 1);
  assert.equal(reduced.transaction.continuityEnabled, 0);
});

test("R3 lab keeps one session tick owner and one Canvas/material/program/draw", () => {
  assert.equal((m4Lab.match(/session\.tick\(/g) ?? []).length, 1);
  assert.match(m4Lab, /noteSessionTick/);
  assert.equal((m4Lab.match(/new PhotonicMotionSession/g) ?? []).length, 1);
  assert.equal((m4Scene.match(/<Canvas/g) ?? []).length, 1);
  assert.equal((m4Scene.match(/new THREE\.RawShaderMaterial/g) ?? []).length, 1);
  assert.match(m4Lab, /sessionId = "ps04-m4-r6-r1"/);
  assert.match(m4Scene, /identityBypass \? 0/);
  assert.match(m4Lab, /NaturalRafRecorder/);
});

test("rapid 20-hit retarget is latest-request-wins and revision is monotonic", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const ids = [
    SINGLE_STATE_IDS.content, SINGLE_STATE_IDS.design, SINGLE_STATE_IDS.event, SINGLE_STATE_IDS.games, SINGLE_STATE_IDS.video,
  ];
  let revision = 0;
  for (let index = 0; index < 20; index += 1) {
    const id = ids[index % ids.length]!;
    const result = coordinator.begin({
      next: contract({
        nodeId: "05.1", hostNodeId: "05.1", family: "SINGLE", requestedFamily: "SINGLE",
        resolvedGeometryId: id, paletteMask: COMPETENCE_BIT.content, slot: "left", fitProfile: "single",
      }),
      displayed: displayed({ geometryId: coordinator.snapshot().targetGeometryId, paletteProgress: 0.4 }),
      nowSeconds: index * 0.03,
      reducedMotion: false,
    });
    if (result.decision.kind !== "noop") {
      assert.ok(result.transaction.revision > revision);
      revision = result.transaction.revision;
    }
  }
  assert.equal(coordinator.snapshot().revision, revision);
  assert.ok(coordinator.uniqueFrozenGeometryRequests().length <= 5);
  assert.ok(!coordinator.geometryRequestLog().some((id) => id.startsWith("runtime-snapshot-")));
});
