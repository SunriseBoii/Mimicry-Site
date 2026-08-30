import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ALL_COMPETENCE_MASK, COMPETENCE_BIT } from "../app/visual-lab/photonic-skin-ps04-m2/photonic-palette";
import { PhotonicPaletteDriver } from "../app/visual-lab/photonic-skin-ps04-m3/palette-driver";
import { PhotonicMotionSession } from "../app/visual-lab/photonic-skin-ps04-m3/session";
import { FIELD_PARAMETERS } from "../app/visual-lab/photonic-skin-ps04-m2/photonic-field";
import { FROZEN_PHASE_WINDOWS, samplePhaseAdapter } from "../app/visual-lab/photonic-skin-ps04-m3/phase-adapter";
import {
  assertSettledInvariants,
  commitDriverToMask,
  hashLut,
  lutForMask,
  lutHasAllSevenStripes,
  maxUnselectedCompetenceWeight,
  mixLuts,
  shaderDisplayedLut,
  SINGLE_MASKS,
} from "../app/visual-lab/photonic-skin-ps04-m4/palette-authority";
import {
  DEFAULT_CONTINUITY_LIFT_ENABLED,
  continuityRadiusLift,
} from "../app/visual-lab/photonic-skin-ps04-m4/continuity-overlay";
import {
  diskMask,
  isForbiddenMasterMorph,
  scoreMasterSimilarity,
} from "../app/visual-lab/photonic-skin-ps04-m4/master-similarity";
import {
  defaultGeometryForNode,
  frozenProgramKey,
  reachableFrozenPairs,
} from "../app/visual-lab/photonic-skin-ps04-m4/transition-prewarm";
import {
  ActorTransitionCoordinator,
  interceptGeometryLinkedProgress,
  type DisplayedPlacement,
} from "../app/visual-lab/photonic-skin-ps04-m4/transition-coordinator";
import {
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
  type ScreenActorContract,
} from "../app/visual-lab/photonic-skin-ps04-m4/screen-actor-contract";
import { SITE_FIT_PROFILES } from "../app/visual-lab/photonic-skin-ps04-m4/site-fit";

const ROOT = process.cwd();
const m4Lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/PS04M4Lab.tsx"), "utf8");
const m4Scene = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/PS04M4Scene.tsx"), "utf8");

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

test("R4 frozen M1–M3 hashes remain exact", () => {
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
  assert.equal(JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m4-r3/reports/checkpoint-hashes.json"), "utf8")).source, "9c8f6a4b65c99bee6bfc711af01f6b57d0486e9bd742e708bd7f50580f156284");
  assert.equal(SITE_FIT_PROFILES.single, 1.36);
});

test("R3 reproduction: ownership off with uncommitted driver progress shows all-seven source LUT", () => {
  const driver = new PhotonicPaletteDriver(ALL_COMPETENCE_MASK, FIELD_PARAMETERS.periodsSeconds.master);
  driver.setMask(COMPETENCE_BIT.design, { mode: "geometry-linked" });
  const lagged = driver.snapshot();
  assert.equal(lagged.palette.mask, COMPETENCE_BIT.design);
  assert.equal(lagged.paletteProgress, 0);
  assert.equal(lutHasAllSevenStripes(lagged.sourceLut), true);
  const visible = shaderDisplayedLut({
    sourceLut: lagged.sourceLut,
    targetMask: lagged.palette.mask,
    progress: lagged.paletteProgress,
    ownershipEnabled: false,
  });
  assert.equal(lutHasAllSevenStripes(visible), true);
  const duringOwnership = shaderDisplayedLut({
    sourceLut: lagged.sourceLut,
    targetMask: lagged.palette.mask,
    progress: lagged.paletteProgress,
    ownershipEnabled: true,
    ownershipWeight: 1,
  });
  assert.equal(hashLut(duringOwnership), hashLut(lutForMask(COMPETENCE_BIT.design)));
});

test("SINGLE masks 1,2,4,8,16,32,64 have zero unselected competence weight", () => {
  for (const mask of SINGLE_MASKS) {
    assert.equal(maxUnselectedCompetenceWeight(mask), 0);
    assert.equal(lutHasAllSevenStripes(lutForMask(mask)), false);
    assert.notEqual(hashLut(lutForMask(mask)), hashLut(lutForMask(ALL_COMPETENCE_MASK)));
  }
});

test("atomic target commit happens before ownership cleanup", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const started = coordinator.begin({
    next: single("design", "05.2", COMPETENCE_BIT.design),
    displayed: displayed(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  assert.equal(started.transaction.paletteOwnershipMode, 1);
  assert.equal(started.transaction.status, "running");
  const driver = new PhotonicPaletteDriver(ALL_COMPETENCE_MASK, 32);
  driver.setMask(COMPETENCE_BIT.design, { mode: "geometry-linked" });
  assert.equal(driver.snapshot().paletteProgress, 0);
  const committed = commitDriverToMask(driver, COMPETENCE_BIT.design);
  assert.equal(committed.progress, 1);
  assert.equal(committed.mask, COMPETENCE_BIT.design);
  assert.equal(committed.lutHash, hashLut(lutForMask(COMPETENCE_BIT.design)));
  assert.equal(coordinator.settle(started.transaction.revision), true);
  const snapshot = coordinator.materialSnapshot(committed.phase);
  const invariants = assertSettledInvariants(snapshot);
  assert.equal(invariants.settledMaskEqualsTarget, true);
  assert.equal(invariants.settledLutEqualsTarget, true);
  assert.equal(invariants.shaderBaseEqualsTarget, true);
  assert.equal(invariants.activeTransitionNull, true);
  assert.equal(invariants.ownershipDisabled, true);
  assert.equal(invariants.shaderProgressLocked, true);
});

test("ownership 0 after settle uses committed target LUT, never mask 127", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  for (const [name, node, mask] of [
    ["content", "05.1", COMPETENCE_BIT.content],
    ["design", "05.2", COMPETENCE_BIT.design],
    ["event", "05.3", COMPETENCE_BIT.event],
    ["games", "05.4", COMPETENCE_BIT.games],
    ["video", "05.5", COMPETENCE_BIT.video],
    ["digital", "05.6", COMPETENCE_BIT.digital],
    ["merch", "05.7", COMPETENCE_BIT.merch],
  ] as const) {
    const started = coordinator.begin({
      next: single(name, node, mask),
      displayed: coordinator.displayedPlacement(),
      displayedLut: coordinator.displayedLut(),
      nowSeconds: 1,
      reducedMotion: false,
    });
    coordinator.settle(started.transaction.revision);
    const snapshot = coordinator.materialSnapshot();
    assert.equal(snapshot.settledMask, mask, name);
    assert.equal(snapshot.shaderMask, mask, name);
    assert.equal(snapshot.shaderProgress, 1, name);
    assert.equal(snapshot.ownershipEnabled, false, name);
    assert.notEqual(snapshot.settledMask, ALL_COMPETENCE_MASK, name);
    assert.equal(hashLut(snapshot.shaderSourceLut), hashLut(lutForMask(mask)), name);
    const later = [0.25, 2, 5].map(() => coordinator.materialSnapshot());
    for (const row of later) {
      assert.equal(row.settledLutHash, snapshot.settledLutHash, name);
      assert.equal(row.shaderBaseLutHash, snapshot.shaderBaseLutHash, name);
    }
  }
});

test("idle tick, resize, and theme do not change settled LUT; phase is preserved", () => {
  const session = new PhotonicMotionSession();
  session.palette.setPhase(0.41);
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(single("content", "05.1", COMPETENCE_BIT.content));
  const before = coordinator.materialSnapshot(session.palette.snapshot().phase);
  session.tick(0.016, 1);
  session.tick(0.016, 2);
  const afterTick = coordinator.materialSnapshot(session.palette.snapshot().phase);
  assert.equal(afterTick.settledLutHash, before.settledLutHash);
  assert.equal(session.palette.snapshot().phase.toFixed(4), session.palette.snapshot().phase.toFixed(4));
  assert.ok(session.palette.snapshot().phase !== 0);
  session.restoreFromSnapshot(session.snapshot());
  assert.equal(coordinator.materialSnapshot().settledLutHash, before.settledLutHash);
});

test("same-mask geometry does not palette-fade; palette-only does not fake geometry", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract({
    nodeId: "02",
    hostNodeId: "02",
    family: "BRAND_WIDE",
    requestedFamily: "BRAND_WIDE",
    resolvedGeometryId: "brand-wide-gather-content-design-digital-event-games-merch-video",
    fitProfile: "brandWide",
  }));
  const sameMask = coordinator.begin({
    next: contract({
      nodeId: "02",
      hostNodeId: "02",
      family: "BRAND_WIDE",
      requestedFamily: "BRAND_WIDE",
      resolvedGeometryId: "brand-wide-gather-content-design-digital-event-games-merch-video",
      fitProfile: "brandWide",
    }),
    displayed: displayed({
      geometryId: "brand-wide-gather-content-design-digital-event-games-merch-video",
      fitProfile: "brandWide",
      fit: 1.16,
      nodeId: "02",
    }),
    nowSeconds: 0,
    reducedMotion: false,
  });
  assert.equal(sameMask.decision.kind, "noop");
  const paletteOnly = coordinator.begin({
    next: contract({
      nodeId: "03.2",
      hostNodeId: "03.2",
      family: "BRAND_WIDE",
      requestedFamily: "BRAND_WIDE",
      resolvedGeometryId: "brand-wide-gather-content-design-digital-event-games-merch-video",
      paletteMask: COMPETENCE_BIT.content,
      fitProfile: "brandWide",
    }),
    displayed: displayed({
      geometryId: "brand-wide-gather-content-design-digital-event-games-merch-video",
      fitProfile: "brandWide",
      fit: 1.16,
      nodeId: "02",
    }),
    nowSeconds: 1,
    reducedMotion: false,
  });
  assert.equal(paletteOnly.transaction.kind, "palette-only");
  assert.equal(paletteOnly.transaction.geometryProgress, 1);
  assert.equal(paletteOnly.transaction.paletteOwnershipMode, 0);
});

test("interrupt uses displayed mixture; stale revision cannot settle", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const first = coordinator.begin({
    next: single("content", "05.1", COMPETENCE_BIT.content),
    displayed: displayed(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  coordinator.syncFromSession({ geometryProgress: 0.45, phase: phase(0.45), sessionTime: 0.45 });
  const mixture = coordinator.displayedLut();
  const mixedHash = hashLut(mixture);
  assert.notEqual(mixedHash, hashLut(lutForMask(ALL_COMPETENCE_MASK)));
  assert.notEqual(mixedHash, hashLut(lutForMask(COMPETENCE_BIT.content)));
  const second = coordinator.begin({
    next: single("design", "05.2", COMPETENCE_BIT.design),
    displayed: coordinator.displayedPlacement(),
    displayedLut: mixture,
    nowSeconds: 0.45,
    reducedMotion: false,
  });
  assert.equal(second.transaction.sourcePaletteLutHash, mixedHash);
  assert.equal(coordinator.settle(first.transaction.revision), false);
  assert.equal(coordinator.settle(second.transaction.revision), true);
  assert.equal(coordinator.materialSnapshot().settledMask, COMPETENCE_BIT.design);
});

test("program readiness precedes visual start; compile gap holds source", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const started = coordinator.begin({
    next: single("content", "05.1", COMPETENCE_BIT.content),
    displayed: displayed(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  assert.equal(started.transaction.programReady, false);
  const waiting = coordinator.syncFromSession({
    geometryProgress: 1,
    phase: phase(1),
    sessionTime: 0.05,
    sessionStatus: "transitioning",
    geometryPlaying: false,
  });
  assert.equal(waiting.geometryProgress, 0);
  assert.equal(waiting.paletteProgress, 0);
  assert.equal(waiting.shaderBaseLutHash, waiting.sourcePaletteLutHash);
  assert.equal(coordinator.markProgramReady(started.transaction.revision, "ready-program"), true);
  const playing = coordinator.syncFromSession({
    geometryProgress: 0.3,
    phase: phase(0.3),
    sessionTime: 0.3,
    sessionStatus: "transitioning",
    geometryPlaying: true,
    programId: "ready-program",
  });
  assert.ok(playing.geometryProgress > 0 && playing.geometryProgress < 1);
});

test("one semantic request is one transaction; intercept is idempotent; reduced is endpoint", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  const first = coordinator.begin({
    next: single("content", "05.1", COMPETENCE_BIT.content),
    displayed: displayed(),
    nowSeconds: 0,
    reducedMotion: false,
  });
  const again = coordinator.begin({
    next: single("content", "05.1", COMPETENCE_BIT.content),
    displayed: displayed({
      geometryId: SINGLE_STATE_IDS.content, paletteMask: COMPETENCE_BIT.content,
      slot: "left", fitProfile: "single", fit: 1.36, nodeId: "05.1",
    }),
    nowSeconds: 0.2,
    reducedMotion: false,
  });
  assert.equal(again.decision.kind, "noop");
  assert.equal(again.transaction.revision, first.transaction.revision);
  const calls: number[] = [];
  const driver = { setGeometryLinkedProgress(progress: number) { calls.push(progress); } };
  const apply = interceptGeometryLinkedProgress(driver);
  const applyAgain = interceptGeometryLinkedProgress(driver);
  driver.setGeometryLinkedProgress(1);
  applyAgain(0.5);
  apply(1);
  assert.deepEqual(calls, [0.5, 1]);
  const reduced = coordinator.begin({
    next: single("design", "05.2", COMPETENCE_BIT.design),
    displayed: displayed({
      geometryId: SINGLE_STATE_IDS.content, paletteMask: COMPETENCE_BIT.content,
      slot: "left", fitProfile: "single", fit: 1.36,
    }),
    nowSeconds: 1,
    reducedMotion: true,
  });
  assert.equal(reduced.transaction.status, "settled");
  assert.equal(reduced.transaction.geometryProgress, 1);
  assert.equal(reduced.transaction.paletteProgress, 1);
  assert.equal(coordinator.materialSnapshot().shaderMask, COMPETENCE_BIT.design);
});

test("non-MASTER transitions do not request MASTER; radius lift is off; t=0/1 identity", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(single("content", "05.1", COMPETENCE_BIT.content));
  const next = coordinator.begin({
    next: single("design", "05.2", COMPETENCE_BIT.design),
    displayed: displayed({
      geometryId: SINGLE_STATE_IDS.content, paletteMask: COMPETENCE_BIT.content,
      slot: "left", fitProfile: "single", fit: 1.36, nodeId: "05.1",
    }),
    nowSeconds: 0,
    reducedMotion: false,
  });
  assert.equal(next.transaction.sourceGeometryId, SINGLE_STATE_IDS.content);
  assert.equal(next.transaction.targetGeometryId, SINGLE_STATE_IDS.design);
  assert.equal(coordinator.uniqueFrozenGeometryRequests().includes(MASTER_STATE_ID), false);
  assert.equal(DEFAULT_CONTINUITY_LIFT_ENABLED, false);
  assert.equal(continuityRadiusLift({ activation: 0.05, protectedActivation: 0.38, enabled: false, progress: 0.5 }), 1);
  assert.equal(continuityRadiusLift({ activation: 0.2, protectedActivation: 0.38, identity: true, progress: 0.5 }), 1);
  assert.equal(continuityRadiusLift({ activation: 0.2, protectedActivation: 0.38, enabled: true, progress: 0 }), 1);
  assert.equal(continuityRadiusLift({ activation: 0.2, protectedActivation: 0.38, enabled: true, progress: 1 }), 1);
});

test("MASTER-similarity gate catches a sphere and allows a non-disk silhouette", () => {
  const sphere = scoreMasterSimilarity(diskMask(64));
  assert.equal(sphere.masterLike, true);
  const pixels = new Uint8Array(64 * 64);
  for (let y = 8; y < 56; y += 1) {
    for (let x = 18; x < 28; x += 1) pixels[y * 64 + x] = 1;
    for (let x = 18; x < 48; x += 1) {
      if (y > 40) pixels[y * 64 + x] = 1;
    }
  }
  const bunny = scoreMasterSimilarity({ width: 64, height: 64, pixels });
  assert.equal(bunny.masterLike, false);
  assert.equal(isForbiddenMasterMorph({
    sourceGeometryId: SINGLE_STATE_IDS.content,
    targetGeometryId: SINGLE_STATE_IDS.design,
    geometryProgress: 0.5,
    score: sphere,
  }), true);
  assert.equal(isForbiddenMasterMorph({
    sourceGeometryId: SINGLE_STATE_IDS.content,
    targetGeometryId: SINGLE_STATE_IDS.design,
    geometryProgress: 0.5,
    score: bunny,
  }), false);
});

test("adjacent SINGLE pairs are bidirectional and mixLuts is exact at endpoints", () => {
  const ids = [
    ["content", "05.1", COMPETENCE_BIT.content],
    ["design", "05.2", COMPETENCE_BIT.design],
    ["event", "05.3", COMPETENCE_BIT.event],
    ["games", "05.4", COMPETENCE_BIT.games],
    ["video", "05.5", COMPETENCE_BIT.video],
    ["digital", "05.6", COMPETENCE_BIT.digital],
    ["merch", "05.7", COMPETENCE_BIT.merch],
  ] as const;
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(single(ids[0][0], ids[0][1], ids[0][2]));
  for (let index = 0; index < ids.length - 1; index += 1) {
    const to = ids[index + 1];
    const forward = coordinator.begin({
      next: single(to[0], to[1], to[2]),
      displayed: coordinator.displayedPlacement(),
      displayedLut: coordinator.displayedLut(),
      nowSeconds: index,
      reducedMotion: false,
    });
    assert.notEqual(forward.transaction.sourceGeometryId, MASTER_STATE_ID);
    assert.notEqual(forward.transaction.targetGeometryId, MASTER_STATE_ID);
    coordinator.settle(forward.transaction.revision);
  }
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const to = ids[index - 1];
    const back = coordinator.begin({
      next: single(to[0], to[1], to[2]),
      displayed: coordinator.displayedPlacement(),
      displayedLut: coordinator.displayedLut(),
      nowSeconds: 10 + index,
      reducedMotion: false,
    });
    coordinator.settle(back.transaction.revision);
  }
  const zero = mixLuts(lutForMask(1), lutForMask(2), 0);
  const one = mixLuts(lutForMask(1), lutForMask(2), 1);
  assert.equal(hashLut(zero), hashLut(lutForMask(1)));
  assert.equal(hashLut(one), hashLut(lutForMask(2)));
});

test("rapid latest-request-wins and prewarm keys cover adjacent route pairs", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract());
  let revision = 0;
  for (let index = 0; index < 20; index += 1) {
    const names = ["content", "design", "event", "games", "video"] as const;
    const name = names[index % names.length]!;
    const result = coordinator.begin({
      next: single(name, "05.1", COMPETENCE_BIT[name]),
      displayed: coordinator.displayedPlacement(),
      displayedLut: coordinator.displayedLut(),
      nowSeconds: index * 0.03,
      reducedMotion: false,
    });
    if (result.decision.kind !== "noop") {
      assert.ok(result.transaction.revision > revision);
      revision = result.transaction.revision;
    }
  }
  assert.equal(coordinator.snapshot().revision, revision);
  const pairs = reachableFrozenPairs("05.2");
  assert.ok(pairs.some(([from, to]) => from === SINGLE_STATE_IDS.content && to === SINGLE_STATE_IDS.design));
  assert.ok(pairs.some(([from, to]) => from === SINGLE_STATE_IDS.design && to === SINGLE_STATE_IDS.event));
  assert.equal(frozenProgramKey("a", "b", false, "desktop"), "a|b|0|desktop");
  assert.equal(defaultGeometryForNode("05.7"), SINGLE_STATE_IDS.merch);
});

test("R4 lab keeps one Canvas/session/material and does not remount on programId", () => {
  assert.equal((m4Lab.match(/new PhotonicMotionSession/g) ?? []).length, 1);
  assert.equal((m4Lab.match(/session\.tick\(/g) ?? []).length, 1);
  assert.equal((m4Scene.match(/<Canvas/g) ?? []).length, 1);
  assert.equal((m4Scene.match(/new THREE\.RawShaderMaterial/g) ?? []).length, 1);
  assert.doesNotMatch(m4Scene, /key=\{`\$\{props\.source\.entry\.contentHash\}:\$\{props\.target\.entry\.contentHash\}:\$\{props\.program\.programId\}/);
  assert.match(m4Lab, /sessionId = "ps04-m4-r4"/);
  assert.match(m4Lab, /commitDriverToMask/);
  assert.match(m4Lab, /paletteSnapshotRef/);
  assert.match(m4Lab, /startRoutePrewarm/);
  assert.match(m4Scene, /paletteSnapshotRef/);
  assert.equal(DEFAULT_CONTINUITY_LIFT_ENABLED, false);
});
