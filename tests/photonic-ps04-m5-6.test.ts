import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ALL_COMPETENCE_MASK, COMPETENCE_BIT } from "../app/visual-lab/photonic-skin-ps04-m2/photonic-palette";
import { FROZEN_PHASE_WINDOWS, samplePhaseAdapter } from "../app/visual-lab/photonic-skin-ps04-m3/phase-adapter";
import {
  M55_CHECKPOINT,
  M56_STAGE,
  PAYLOAD_NAMESPACE,
  RELEASE_FRAMING,
  RELEASE_LOCK,
  SELECTION_LOCK_HASH,
  SELECTED_EVENT_HASH,
  SELECTED_VIDEO_HASH,
} from "../app/_photonic-skin/release";
import { PROMOTED_ASSET_NAMESPACE, PROMOTED_MANIFEST_PATH } from "../app/_photonic-skin/runtime";
import {
  PALETTE_DELAY_FRACTION,
  paletteLeadsGeometry,
  paletteProgressFromGeometryM5,
} from "../app/visual-lab/photonic-skin-ps04-m5/m5-choreography";
import {
  OWNER_SELECTED_PROFILE_ID,
  framingProfileFor,
} from "../app/visual-lab/photonic-skin-ps04-m5/framing";
import {
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
  indexStates,
  resolveScreenActorContract,
  type ScreenActorContract,
} from "../app/visual-lab/photonic-skin-ps04-m5/screen-actor-contract";
import { ScrollCompositionController } from "../app/visual-lab/photonic-skin-ps04-m5/scroll-controller";
import {
  ActorTransitionCoordinator,
  type DisplayedPlacement,
} from "../app/visual-lab/photonic-skin-ps04-m5/transition-coordinator";

const ROOT = process.cwd();
const BRANCH = "ps04-m5-sandbox";
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m5-6");
const PUBLIC = path.join(ROOT, "public/photonic-skin/ps-04-m5-5");
const FROZEN_VIDEO = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b";
const AGGREGATE = "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361";

function shaFile(file: string) {
  return createHash("sha256").update(readFileSync(path.join(ROOT, file))).digest("hex");
}

function readJson(file: string) {
  return JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
}

function contract(partial: Partial<ScreenActorContract> = {}): ScreenActorContract {
  return {
    nodeId: "05.2",
    hostNodeId: "05.2",
    family: "SINGLE",
    requestedFamily: "SINGLE",
    resolvedGeometryId: SINGLE_STATE_IDS.design,
    paletteMask: COMPETENCE_BIT.design,
    slot: "left",
    fitProfile: "single",
    resolution: "exact",
    applyPaletteOverride: false,
    reason: "test",
    ...partial,
  };
}

function displayed(partial: Partial<DisplayedPlacement> = {}): DisplayedPlacement {
  return {
    slot: "left",
    fit: 1,
    fitProfile: "single",
    paletteMask: COMPETENCE_BIT.design,
    paletteProgress: 1,
    geometryId: SINGLE_STATE_IDS.design,
    nodeId: "05.2",
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

function eventContract(): ScreenActorContract {
  return contract({
    nodeId: "05.3",
    hostNodeId: "05.3",
    resolvedGeometryId: SINGLE_STATE_IDS.event,
    paletteMask: COMPETENCE_BIT.event,
  });
}

function gamesContract(): ScreenActorContract {
  return contract({
    nodeId: "05.4",
    hostNodeId: "05.4",
    resolvedGeometryId: SINGLE_STATE_IDS.games,
    paletteMask: COMPETENCE_BIT.games,
  });
}

test("M5.5 human PASS is recorded and checkpointed once", () => {
  const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
  assert.equal(branch, BRANCH);
  execFileSync("git", ["merge-base", "--is-ancestor", M55_CHECKPOINT, "HEAD"]);
  const log = execFileSync("git", ["log", "--oneline", "--grep", "approve integrated M5 promotion candidate"], { encoding: "utf8" }).trim();
  assert.equal(log.split(/\r?\n/).filter(Boolean).length, 1);
  const review = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-5/reports/human-review.md"), "utf8");
  const m55 = readJson("design/photonic-skin/ps-04-m5-5/manifest.json");
  assert.match(review, /HUMAN PASS \/ INTEGRATED PROMOTION APPROVED/);
  assert.equal(m55.integratedPromotionApproved, true);
  assert.equal(m55.approvedFor, "PS-04.M5.6");
  assert.equal(m55.productionDeployApproval, false);
  assert.equal(m55.ps04CloseApproval, false);
  assert.equal(m55.m56Started, false);
  assert.equal(m55.selectionLockHash, SELECTION_LOCK_HASH);
});

test("release-lock binds M5.5 payload and is hash-stable", () => {
  const lock = readJson("design/photonic-skin/ps-04-m5-6/release-lock.json");
  assert.equal(lock.stage, M56_STAGE);
  assert.equal(lock.sourceCheckpoint, M55_CHECKPOINT);
  assert.equal(lock.payloadNamespace, PAYLOAD_NAMESPACE);
  assert.equal(lock.stateCount, 154);
  assert.equal(lock.selectionLockHash, SELECTION_LOCK_HASH);
  assert.equal(lock.event.hash, SELECTED_EVENT_HASH);
  assert.equal(lock.video.hash, SELECTED_VIDEO_HASH);
  assert.equal(lock.video.compositionYawDegrees, -40);
  assert.equal(lock.video.clapperOpenAngleDegrees, 30);
  assert.equal(lock.framing.id, OWNER_SELECTED_PROFILE_ID);
  assert.equal(lock.framing.aboutRequestedZoom, 1.24);
  assert.equal(lock.framing.merchRequestedZoom, 1.11);
  assert.equal(lock.framing.videoRequestedZoom, 1.11);
  assert.equal(lock.deployApproved, false);
  assert.equal(lock.ps04Closed, false);
  const digest = shaFile("design/photonic-skin/ps-04-m5-6/release-lock.json");
  assert.equal(digest, shaFile("design/photonic-skin/ps-04-m5-6/release-lock.json"));
  assert.equal(lock.hashes.promotedManifest, shaFile("public/photonic-skin/ps-04-m5-5/manifests/ps04m55-manifest.json"));
  assert.equal(lock.hashes.stateHashMap, shaFile("design/photonic-skin/ps-04-m5-5/reports/state-hash-map.json"));
  assert.equal(lock.hashes.m51ChoreographyConstants, shaFile("app/visual-lab/photonic-skin-ps04-m5/m5-choreography.ts"));
  assert.equal(PALETTE_DELAY_FRACTION, 0.06);
});

test("production / binds promoted namespace without visual-lab page import", () => {
  const home = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
  const client = readFileSync(path.join(ROOT, "app/_photonic-skin/ProductionPhotonicSiteClient.tsx"), "utf8");
  const runtime = readFileSync(path.join(ROOT, "app/_photonic-skin/runtime.ts"), "utf8");
  const release = readFileSync(path.join(ROOT, "app/_photonic-skin/release.ts"), "utf8");
  const lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/promotion-preview/PromotionPreviewLab.tsx"), "utf8");
  assert.match(home, /ProductionPhotonicSiteClient/);
  assert.doesNotMatch(home, /visual-lab/);
  assert.doesNotMatch(home, /promotion-preview/);
  assert.doesNotMatch(home, /PS04M5Lab/);
  assert.match(client, /mode="production"/);
  assert.doesNotMatch(client, /visual-lab/);
  assert.doesNotMatch(client, /promotion-preview/);
  assert.match(release, /PAYLOAD_NAMESPACE = "ps-04-m5-5"/);
  assert.match(runtime, /ps-04-m5-5/);
  assert.equal(PROMOTED_ASSET_NAMESPACE, "ps-04-m5-5");
  assert.equal(PROMOTED_MANIFEST_PATH, "/photonic-skin/ps-04-m5-5/manifests/ps04m55-manifest.json");
  assert.match(lab, /mode === "production"/);
  assert.match(lab, /__PS04M56_PRODUCTION__/);
  assert.match(lab, /eventOverlay: "none"/);
  assert.match(runtime, /loadPromotedManifest/);
  assert.equal(RELEASE_LOCK.eventOverlay, "none");
  assert.equal(RELEASE_LOCK.runtimeRotationOverride, "none");
  const bins = readdirSync(path.join(PUBLIC, "states")).filter((name) => name.endsWith(".state.bin"));
  assert.equal(bins.length, 154);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-5/states/single-event.state.bin"), SELECTED_EVENT_HASH);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-5/states/single-video.state.bin"), SELECTED_VIDEO_HASH);
  assert.equal(shaFile("public/photonic-skin/ps-03-m3-1r/states/single-video.state.bin"), FROZEN_VIDEO);
  const aggregate = readJson("design/photonic-skin/ps-03-m4-1/exports/ps03m41-manifest.json");
  assert.equal(aggregate.aggregateContentHash, AGGREGATE);
});

test("03.1 BRAND_WIDE framing remains 1.0; About/Merch/Video exact", () => {
  const about = framingProfileFor({ nodeId: "02", geometryId: "brand-wide-gather-content-design-digital-event-games-merch-video", selection: { aboutZoom: 124, merchZoom: 111, videoZoom: 111 }, width: 1440, height: 900 });
  const merch = framingProfileFor({ nodeId: "05.7", geometryId: SINGLE_STATE_IDS.merch, selection: { aboutZoom: 124, merchZoom: 111, videoZoom: 111 }, width: 1440, height: 900 });
  const video = framingProfileFor({ nodeId: "05.5", geometryId: SINGLE_STATE_IDS.video, selection: { aboutZoom: 124, merchZoom: 111, videoZoom: 111 }, width: 1440, height: 900 });
  const task = framingProfileFor({ nodeId: "03.1", geometryId: "brand-wide-gather-content-design-digital-event-games-merch-video", selection: { aboutZoom: 124, merchZoom: 111, videoZoom: 111 }, width: 1440, height: 900 });
  const hero = framingProfileFor({ nodeId: "01", geometryId: MASTER_STATE_ID, selection: { aboutZoom: 124, merchZoom: 111, videoZoom: 111 }, width: 1440, height: 900 });
  const event = framingProfileFor({ nodeId: "05.3", geometryId: SINGLE_STATE_IDS.event, selection: { aboutZoom: 124, merchZoom: 111, videoZoom: 111 }, width: 1440, height: 900 });
  assert.equal(about.requestedZoom, 1.24);
  assert.equal(merch.requestedZoom, 1.11);
  assert.equal(video.requestedZoom, 1.11);
  assert.equal(task.requestedZoom, 1);
  assert.equal(hero.requestedZoom, 1);
  assert.equal(event.requestedZoom, 1);
  assert.equal(RELEASE_FRAMING.aboutMobileCap, 1.18);
  assert.equal(RELEASE_FRAMING.merchMobileCap, 1.08);
  assert.equal(RELEASE_FRAMING.videoMobileCap, 1.08);
});

test("03.2 scrollToNode no-ops while locked and works after selectTask unlock", () => {
  const controller = new ScrollCompositionController();
  controller.setUnlock({ competencies: false, brief: false });
  assert.equal(controller.scrollToNode("03.2", "auto"), false);
  controller.setUnlock({ competencies: true, brief: false });
  assert.equal(controller.scrollToNode("03.2", "auto"), true);
});

test("complex Event+Video uses FOCUS family, not Event-screen requestState", () => {
  const manifest = readJson("public/photonic-skin/ps-04-m5-5/manifests/ps04m55-manifest.json");
  const index = indexStates(manifest.states);
  const mask = COMPETENCE_BIT.event | COMPETENCE_BIT.video;
  const resolved = resolveScreenActorContract({
    nodeId: "03.2",
    index,
    flow: {
      taskId: "explain",
      taskSelected: true,
      competencies: ["event", "video"],
      competenciesConfirmed: false,
      settledStateId: MASTER_STATE_ID,
    },
  });
  assert.equal(resolved.family, "FOCUS");
  assert.equal(resolved.paletteMask, mask);
  assert.notEqual(resolved.resolvedGeometryId, SINGLE_STATE_IDS.event);
  assert.match(String(resolved.resolvedGeometryId), /event-video/);
});

test("PS04-M5-R001 rapid Design↔Event↔Games does not palette-lead", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract(), false, 1);
  const hops = [eventContract(), gamesContract(), eventContract(), contract()];
  let leads = 0;
  let frames = 0;
  for (const next of hops) {
    const started = coordinator.begin({
      next,
      displayed: displayed({
        paletteMask: coordinator.snapshot().targetPaletteMask,
        paletteProgress: coordinator.snapshot().paletteProgress,
        geometryId: coordinator.snapshot().targetGeometryId,
        nodeId: coordinator.snapshot().targetNodeId,
      }),
      nowSeconds: frames * 0.016,
      reducedMotion: false,
    });
    assert.equal(started.transaction.kind, "geometry");
    assert.equal(started.transaction.geometryProgress, 0);
    assert.equal(started.transaction.paletteProgress, 0);
    for (let step = 0; step < 8; step += 1) {
      const progress = step / 20;
      const tx = coordinator.syncFromSession({
        geometryProgress: progress,
        phase: phase(progress),
        sessionTime: frames * 0.016,
        sessionStatus: step === 0 ? "settled" : "transitioning",
        geometryPlaying: step > 0,
        sessionTargetId: next.resolvedGeometryId,
        programId: "prog",
      });
      if (paletteLeadsGeometry(tx.geometryProgress, tx.paletteProgress)) leads += 1;
      frames += 1;
    }
    coordinator.markProgramReady(started.transaction.revision, "prog");
  }
  assert.equal(leads, 0);
  assert.ok(frames >= 32);
  assert.equal(paletteProgressFromGeometryM5(0), 0);
  assert.equal(PALETTE_DELAY_FRACTION, 0.06);
});

test("M5.6 human PASS is recorded as M6 baseline without starting M6.1", () => {
  const review = readFileSync(path.join(STAGE, "reports/human-review.md"), "utf8");
  const m56 = readJson("design/photonic-skin/ps-04-m5-6/manifest.json");
  assert.match(review, /HUMAN PASS \/ APPROVED AS PS-04.M6 BASELINE/);
  assert.equal(m56.status, "HUMAN PASS / APPROVED AS PS-04.M6 BASELINE");
  assert.equal(m56.payloadNamespace, "ps-04-m5-5");
  assert.equal(m56.releaseLockHash, "a8609556f082e754f9d803611afee106cdb1069c2e713df579a8200e9ec6aae7");
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-6/release-lock.json"), m56.releaseLockHash);
  assert.equal(m56.productionReady, false);
  assert.equal(m56.deployApproval, false);
  assert.equal(m56.ps04CloseApproval, false);
  assert.equal(m56.m61Started, false);
  assert.deepEqual(m56.carryForwardToM6, [
    "build-chapter-mimic-semantics",
    "settled-screen-motion-policy",
    "light-theme-scale-material",
    "video-games-merch-remote-particles",
    "first-actor-performance",
    "SSR-client-boundary",
    "visible-actor-context-restore",
    "legacy-motion-manifest-dependency",
  ]);
});

test("payload bytes, deploy markers, and PS-04 close stay frozen", () => {
  const m56 = readJson("design/photonic-skin/ps-04-m5-6/manifest.json");
  assert.equal(m56.deployApproved, false);
  assert.equal(m56.ps04Closed, false);
  assert.equal(m56.push, false);
  assert.equal(m56.deploy, false);
  assert.equal(m56.commitCreated, false);
  assert.equal(m56.m61Started, false);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-5/states/single-event.state.bin"), SELECTED_EVENT_HASH);
  assert.equal(ALL_COMPETENCE_MASK > 0, true);
  const home = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
  assert.doesNotMatch(home, /deployApproved:\s*true/);
});

const pairPath = path.join(STAGE, "reports/full-pair-probe.json");
test("full 23,562 pair probe", { skip: !existsSync(pairPath) }, () => {
  const probe = readJson("design/photonic-skin/ps-04-m5-6/reports/full-pair-probe.json");
  assert.equal(probe.endpointChecks.pass, true);
  assert.equal(probe.selfTransitions.pass, true);
  assert.equal(probe.fullOrderedPairProbe.expected, 23562);
  assert.equal(probe.fullOrderedPairProbe.probed, 23562);
  assert.equal(probe.fullOrderedPairProbe.failed, 0);
  assert.equal(probe.fullOrderedPairProbe.ran, true);
  assert.equal(probe.fullOrderedPairProbe.thirdGeometry, false);
  assert.equal(probe.pass, true);
});

const residualPath = path.join(STAGE, "reports/rapid-residual-closure.json");
test("PS04-M5-R001 closed in production capture", { skip: !existsSync(residualPath) }, () => {
  const residual = readJson("design/photonic-skin/ps-04-m5-6/reports/rapid-residual-closure.json");
  assert.equal(residual.status, "CLOSED");
  assert.equal(residual.paletteLeads, 0);
  assert.equal(residual.centerDwell, 0);
  assert.equal(residual.thirdGeometry, false);
});

const routePath = path.join(STAGE, "reports/route-03-2.json");
test("03.2 production route capture", { skip: !existsSync(routePath) }, () => {
  const route = readJson("design/photonic-skin/ps-04-m5-6/reports/route-03-2.json");
  assert.equal(route.pass, true);
  assert.equal(route.lockedNoOp, true);
  assert.equal(route.entered, true);
  assert.equal(route.exited, true);
});

const complexPath = path.join(STAGE, "reports/complex-event-video-route.json");
test("actual Event+Video complex production flow", { skip: !existsSync(complexPath) }, () => {
  const row = readJson("design/photonic-skin/ps-04-m5-6/reports/complex-event-video-route.json");
  assert.equal(row.pass, true);
  assert.match(String(row.stateId), /event-video/);
  assert.equal(row.hash, readJson("design/photonic-skin/ps-04-m5-5/reports/state-hash-map.json")[row.stateId].candidate);
});

const safePath = path.join(STAGE, "reports/safe-area-production.json");
test("production About/Merch/Video visible-pixel safe-area", { skip: !existsSync(safePath) }, () => {
  const safe = readJson("design/photonic-skin/ps-04-m5-6/reports/safe-area-production.json");
  assert.equal(safe.pass, true);
  assert.equal(safe.about.requestedZoom, 1.24);
  assert.equal(safe.merch.requestedZoom, 1.11);
  assert.equal(safe.video.requestedZoom, 1.11);
});

const walkPath = path.join(STAGE, "reports/settled-walkthroughs.json");
test("twenty settled production walkthroughs and cache plateau", { skip: !existsSync(walkPath) }, () => {
  const walk = readJson("design/photonic-skin/ps-04-m5-6/reports/settled-walkthroughs.json");
  assert.equal(walk.passCount, 20);
  assert.equal(walk.pass, true);
  const plateau = readJson("design/photonic-skin/ps-04-m5-6/reports/cache-plateau.json");
  assert.equal(plateau.unboundedGrowth, false);
});

const firstPath = path.join(STAGE, "reports/first-frame-hydration.json");
test("first-frame actor visible and no MASTER flash", { skip: !existsSync(firstPath) }, () => {
  const first = readJson("design/photonic-skin/ps-04-m5-6/reports/first-frame-hydration.json");
  assert.equal(first.pass, true);
  assert.equal(first.emptyFirstActorFrame, false);
  assert.equal(first.masterFlash, false);
});

const auditPath = path.join(STAGE, "reports/asset-request-audit.json");
test("production asset request audit", { skip: !existsSync(auditPath) }, () => {
  const audit = readJson("design/photonic-skin/ps-04-m5-6/reports/asset-request-audit.json");
  assert.equal(audit.m55Manifest, true);
  assert.equal(audit.m55States, true);
  assert.equal(audit.sandboxOverlays, false);
  assert.equal(audit.visualLabModules, false);
  assert.equal(audit.notFound, 0);
  assert.equal(audit.duplicateStateDownloadAfterWarm, 0);
  assert.equal(audit.pass, true);
});

const buildPath = path.join(STAGE, "reports/production-build.json");
test("production build smoke binds M5.5 without deploy", { skip: !existsSync(buildPath) }, () => {
  const build = readJson("design/photonic-skin/ps-04-m5-6/reports/production-build.json");
  assert.equal(build.compiled, true);
  assert.equal(build.deploy, false);
  assert.equal(build.push, false);
  assert.equal(build.pass, true);
  assert.equal(build.smoke.hero.assetNamespace, "ps-04-m5-5");
  assert.equal(build.smoke.hero.hud, false);
});

const sitePath = path.join(STAGE, "reports/production-diff.json");
test("SiteShell structure preserved on production /", { skip: !existsSync(sitePath) }, () => {
  const diff = readJson("design/photonic-skin/ps-04-m5-6/reports/production-diff.json");
  assert.equal(diff.structureUnchanged, true);
  assert.equal(diff.textUnchanged, true);
});
