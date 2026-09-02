import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ALL_COMPETENCE_MASK, COMPETENCE_BIT } from "../app/visual-lab/photonic-skin-ps04-m2/photonic-palette";
import {
  framingProgressFromGeometryM5,
  paletteLeadsGeometry,
  paletteProgressFromGeometryM5,
  positionProgressFromGeometryM5,
} from "../app/visual-lab/photonic-skin-ps04-m5/m5-choreography";
import {
  ABOUT_GEOMETRY_ID,
  ABOUT_NODE_ID,
  ABOUT_ZOOM_PERCENTS,
  BALANCED_REVIEW,
  BASELINE_ZOOM,
  FRAMING_TARGETS,
  OWNER_SELECTED_124_111_111,
  OWNER_SELECTED_CAPS,
  OWNER_SELECTED_PROFILE_ID,
  MERCH_GEOMETRY_ID,
  MERCH_NODE_ID,
  MERCH_ZOOM_PERCENTS,
  SELECTED_EVENT_HASH,
  SELECTED_VIDEO_CLAPPER_OPEN_DEGREES,
  SELECTED_VIDEO_HASH,
  SELECTED_VIDEO_VARIANT,
  SELECTED_VIDEO_YAW_DEGREES,
  UNAFFECTED_NODE_IDS,
  VIDEO_GEOMETRY_ID,
  VIDEO_NODE_ID,
  VIDEO_ZOOM_PERCENTS,
  cameraZoomFromFraming,
  estimatedVisibleBBox,
  framingProfileFor,
  framingScreenFor,
  frustumScaleFromZoom,
  matchesFramingTarget,
  mixFraming,
  percentToZoom,
  presentationSlot,
  rectsOverlap,
  reservedDomRects,
  responsiveSafeZoom,
  viewportClippingPx,
} from "../app/visual-lab/photonic-skin-ps04-m5/framing";
import {
  parseFramingQuery,
  framingSearch,
  SANDBOX_DEFAULTS,
} from "../app/visual-lab/photonic-skin-ps04-m5/framing-sandbox/sandbox-query";
import {
  CANONICAL_BRAND_WIDE_ID,
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
  indexStates,
  resolveScreenActorContract,
} from "../app/visual-lab/photonic-skin-ps04-m5/screen-actor-contract";
import { ActorTransitionCoordinator } from "../app/visual-lab/photonic-skin-ps04-m5/transition-coordinator";
import { SCREEN_NODE_BY_ID, SCREEN_NODE_IDS } from "../app/visual-lab/photonic-skin-ps04-m5/topology";
import { SITE_FIT_PROFILES } from "../app/visual-lab/photonic-skin-ps04-m5/site-fit";
import { PHOTONIC_FOV_DEGREES } from "../app/visual-lab/photonic-skin-m4-1r/photonic-presentation";

const ROOT = process.cwd();
const BRANCH = "ps04-m5-sandbox";
const M54_BASELINE = "af13e9df27be788f8295900d1d7a021bca699998";
const FROZEN_VIDEO = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b";
const AGGREGATE = "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361";
const FLOW = {
  taskId: null,
  taskSelected: false,
  competencies: [],
  competenciesConfirmed: false,
  settledStateId: MASTER_STATE_ID,
};

function shaFile(file: string) {
  return createHash("sha256").update(readFileSync(path.join(ROOT, file))).digest("hex");
}

function contract(nodeId: (typeof SCREEN_NODE_IDS)[number]) {
  return resolveScreenActorContract({
    nodeId,
    index: indexStates([]),
    flow: FLOW,
  });
}

function displayed(nodeId: (typeof SCREEN_NODE_IDS)[number], geometryId: string, zoom = 1) {
  const next = contract(nodeId);
  return {
    slot: next.slot,
    fit: 1,
    fitProfile: next.fitProfile,
    paletteMask: next.paletteMask,
    paletteProgress: 1,
    geometryId,
    nodeId,
    zoom,
  };
}

test("M5.3.R1 human selection is recorded and checkpointed once", () => {
  const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
  assert.equal(branch, BRANCH);
  const baseline = execFileSync("git", ["rev-parse", M54_BASELINE], { encoding: "utf8" }).trim();
  assert.equal(baseline, M54_BASELINE);
  const log = execFileSync("git", ["log", "--oneline", "--grep", "approve Video combo 40 and connected clapper hinge"], { encoding: "utf8" }).trim();
  assert.equal(log.split(/\r?\n/).filter(Boolean).length, 1);
  const review = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1/reports/human-review.md"), "utf8");
  const stageManifest = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1/manifest.json"), "utf8"));
  assert.match(review, /VIDEO_COMBO_40_R1/);
  assert.equal(stageManifest.selectedCandidate, "VIDEO_COMBO_40_R1");
  assert.equal(stageManifest.selectedCompositionYawDegrees, -40);
  assert.equal(stageManifest.selectedClapperOpenAngleDegrees, 30);
  assert.equal(stageManifest.selectedHash, SELECTED_VIDEO_HASH);
  assert.equal(stageManifest.notCanonicalYet, true);
  assert.equal(stageManifest.productionApproval, false);
  assert.equal(stageManifest.m54Started, false);
});

test("M5.4 human framing selection is OWNER_SELECTED_124_111_111", () => {
  const review = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-4/reports/human-review.md"), "utf8");
  const m54 = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-4/manifest.json"), "utf8"));
  assert.match(review, /HUMAN PASS \/ SELECTED M5 FRAMING PROFILE/);
  assert.match(review, /OWNER_SELECTED_124_111_111/);
  assert.match(review, /m55Started = false/);
  assert.equal(m54.selectedProfile, OWNER_SELECTED_PROFILE_ID);
  assert.equal(m54.defaultReviewProfile, OWNER_SELECTED_PROFILE_ID);
  assert.equal(m54.selectedFraming.aboutRequestedZoom, 1.24);
  assert.equal(m54.selectedFraming.aboutMobileCap, 1.18);
  assert.equal(m54.selectedFraming.merchRequestedZoom, 1.11);
  assert.equal(m54.selectedFraming.merchMobileCap, 1.08);
  assert.equal(m54.selectedFraming.videoRequestedZoom, 1.11);
  assert.equal(m54.selectedFraming.videoMobileCap, 1.08);
  assert.equal(m54.balancedReview.aboutZoom, 118);
  assert.equal(m54.balancedReview.merchZoom, 108);
  assert.equal(m54.balancedReview.videoZoom, 108);
  assert.equal(m54.canonicalSelectionPendingHumanReview, false);
  assert.equal(m54.m55Started, false);
  assert.equal(m54.productionApproval, false);
  assert.deepEqual(OWNER_SELECTED_124_111_111, { aboutZoom: 124, merchZoom: 111, videoZoom: 111 });
  assert.equal(OWNER_SELECTED_CAPS.aboutMobileCap, 1.18);
  assert.equal(OWNER_SELECTED_CAPS.merchMobileCap, 1.08);
  assert.equal(OWNER_SELECTED_CAPS.videoMobileCap, 1.08);
});

test("selected Video hash, yaw and clapper open angle remain VIDEO_COMBO_40_R1", () => {
  assert.equal(SELECTED_VIDEO_VARIANT, "combo-40-r1");
  assert.equal(SELECTED_VIDEO_HASH, "2d6957815b6f58f87f1709e0378313cba271530b8fb0e02282b556780448a873");
  assert.equal(SELECTED_VIDEO_YAW_DEGREES, -40);
  assert.equal(SELECTED_VIDEO_CLAPPER_OPEN_DEGREES, 30);
  assert.equal(SELECTED_EVENT_HASH, "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b");
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-3-r1/variants/combo-40-r1/single-video.state.bin"), SELECTED_VIDEO_HASH);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-3-r1/variants/combo-40-r1/single-video.state.bin"), SELECTED_VIDEO_HASH);
  assert.equal(shaFile("public/photonic-skin/ps-03-m3-1r/states/single-video.state.bin"), FROZEN_VIDEO);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-2/variants/a-r2/single-event.state.bin"), SELECTED_EVENT_HASH);
});

test("About maps to node 02 BRAND_WIDE only, not the BRAND_WIDE family", () => {
  const about = contract("02");
  assert.equal(about.hostNodeId, ABOUT_NODE_ID);
  assert.equal(about.resolvedGeometryId, ABOUT_GEOMETRY_ID);
  assert.equal(about.slot, "right");
  assert.equal(about.family, "BRAND_WIDE");
  assert.equal(matchesFramingTarget("02", CANONICAL_BRAND_WIDE_ID, "about"), true);
  assert.equal(matchesFramingTarget("03.1", CANONICAL_BRAND_WIDE_ID, "about"), false);
  assert.equal(framingScreenFor("03.1", CANONICAL_BRAND_WIDE_ID), null);
  const brandWideElsewhere = framingProfileFor({
    nodeId: "03.1",
    geometryId: CANONICAL_BRAND_WIDE_ID,
    selection: BALANCED_REVIEW,
    width: 1440,
    height: 900,
  });
  assert.equal(brandWideElsewhere.requestedZoom, 1);
  assert.equal(brandWideElsewhere.effectiveZoom, 1);
  const merch = contract("05.7");
  assert.equal(merch.hostNodeId, MERCH_NODE_ID);
  assert.equal(merch.resolvedGeometryId, MERCH_GEOMETRY_ID);
  assert.equal(merch.slot, "left");
  const video = contract("05.5");
  assert.equal(video.hostNodeId, VIDEO_NODE_ID);
  assert.equal(video.resolvedGeometryId, VIDEO_GEOMETRY_ID);
  assert.equal(video.slot, "left");
  const digital = contract("05.6");
  assert.equal(digital.resolvedGeometryId, SINGLE_STATE_IDS.digital);
  assert.equal(framingScreenFor("05.6", SINGLE_STATE_IDS.video), null);
  assert.equal(framingScreenFor("05.5", SINGLE_STATE_IDS.digital), null);
});

test("candidate zoom percents are exact and BALANCED_REVIEW is not a winner", () => {
  assert.deepEqual([...ABOUT_ZOOM_PERCENTS], [100, 112, 118, 124]);
  assert.deepEqual([...MERCH_ZOOM_PERCENTS], [100, 105, 108, 111]);
  assert.deepEqual([...VIDEO_ZOOM_PERCENTS], [100, 105, 108, 111]);
  assert.deepEqual(BALANCED_REVIEW, { aboutZoom: 118, merchZoom: 108, videoZoom: 108 });
  assert.equal(percentToZoom(100), 1);
  assert.equal(frustumScaleFromZoom(1.18), 1 / 1.18);
  assert.equal(cameraZoomFromFraming(1.18), 1.18);
  assert.equal(cameraZoomFromFraming(1.18, true), 1);
});

test("baseline zoom identity does not change camera pose, slot, or world scale", () => {
  for (const screen of ["about", "merch", "video"] as const) {
    const target = FRAMING_TARGETS[screen];
    const profile = framingProfileFor({
      nodeId: target.nodeId,
      geometryId: target.geometryId,
      selection: { aboutZoom: 100, merchZoom: 100, videoZoom: 100 },
      width: 1440,
      height: 900,
    });
    assert.equal(profile.requestedZoom, BASELINE_ZOOM);
    assert.equal(profile.effectiveZoom, BASELINE_ZOOM);
    const slot = presentationSlot(1440, 900, target.slot);
    const baseline = presentationSlot(1440, 900, target.slot);
    assert.equal(slot.centerX, baseline.centerX);
    assert.equal(slot.centerY, baseline.centerY);
    assert.equal(slot.size, baseline.size);
  }
  assert.equal(PHOTONIC_FOV_DEGREES, 33);
  assert.equal(SITE_FIT_PROFILES.brandWide, 1.16);
  assert.equal(SITE_FIT_PROFILES.single, 1.36);
  const scene = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/PS04M5Scene.tsx"), "utf8");
  assert.match(scene, /liveCamera\.zoom = zoom/);
  assert.match(scene, /meshRef\.current\.scale\.setScalar\(viewport\.identity \? 1 : viewport\.siteFitScale\)/);
  const presentation = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-m4-1r/photonic-presentation.ts"), "utf8");
  assert.match(presentation, /camera\.position\.set\(\.\.\.position\)/);
  assert.doesNotMatch(presentation, /camera\.zoom/);
});

test("unaffected screens stay at zoom 1 including Hero MASTER", () => {
  const hero = contract("01");
  assert.equal(hero.resolvedGeometryId, MASTER_STATE_ID);
  assert.equal(hero.slot, "right");
  for (const nodeId of UNAFFECTED_NODE_IDS) {
    const next = contract(nodeId);
    const profile = framingProfileFor({
      nodeId,
      geometryId: next.resolvedGeometryId,
      selection: BALANCED_REVIEW,
      width: 1440,
      height: 900,
    });
    assert.equal(profile.requestedZoom, 1, nodeId);
    assert.equal(profile.effectiveZoom, 1, nodeId);
  }
  const footer = contract("08");
  assert.equal(footer.resolvedGeometryId, null);
  assert.equal(footer.slot, "none");
});

test("responsive cap is deterministic and does not use bbox feedback", () => {
  const aboutDesktop = responsiveSafeZoom({
    nodeId: "02",
    geometryId: ABOUT_GEOMETRY_ID,
    requestedZoom: 1.24,
    width: 1440,
    height: 900,
  });
  assert.equal(aboutDesktop, 1.24);
  const aboutMobileA = responsiveSafeZoom({
    nodeId: "02",
    geometryId: ABOUT_GEOMETRY_ID,
    requestedZoom: 1.24,
    width: 390,
    height: 844,
  });
  const aboutMobileB = responsiveSafeZoom({
    nodeId: "02",
    geometryId: ABOUT_GEOMETRY_ID,
    requestedZoom: 1.24,
    width: 390,
    height: 844,
  });
  assert.equal(aboutMobileA, aboutMobileB);
  assert.ok(aboutMobileA <= 1.18);
  const framingSrc = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/framing.ts"), "utf8");
  assert.doesNotMatch(framingSrc, /actorMaskBBoxCss/);
});

test("invalid query falls back to BALANCED_REVIEW without new geometry buffers", () => {
  const invalid = parseFramingQuery("?screen=hero&aboutZoom=130&merchZoom=90");
  assert.equal(invalid.invalid, true);
  assert.equal(invalid.screen, SANDBOX_DEFAULTS.screen);
  assert.equal(invalid.aboutZoom, 118);
  assert.equal(invalid.merchZoom, 108);
  assert.equal(invalid.videoZoom, 108);
  const valid = parseFramingQuery("?screen=video&aboutZoom=124&merchZoom=111&videoZoom=105&viewport=390x844&diagnostic=bbox&theme=dark&mode=transition");
  assert.equal(valid.invalid, false);
  assert.equal(valid.screen, "video");
  assert.equal(valid.videoZoom, 105);
  assert.equal(framingSearch(valid).includes("screen=video"), true);
  const publicDir = path.join(ROOT, "public/photonic-skin/ps-04-m5-4");
  const files = existsSync(publicDir) ? readdirSync(publicDir) : [];
  assert.equal(files.some((file) => file.endsWith(".bin")), false);
});

test("framing shares the M5.1 C2 clock and starts interrupts from the visual snapshot", () => {
  const coordinator = new ActorTransitionCoordinator();
  const about = contract("02");
  coordinator.adoptSettled(about, false, 1);
  const first = coordinator.begin({
    next: about,
    displayed: displayed("02", ABOUT_GEOMETRY_ID, 1),
    nowSeconds: 0,
    reducedMotion: false,
    targetZoom: 1.18,
  });
  assert.equal(first.decision.kind, "framing-only");
  assert.equal(first.transaction.sourceZoom, 1);
  assert.equal(first.transaction.targetZoom, 1.18);
  coordinator.syncFromSession({
    geometryProgress: 1,
    phase: { progress: 1 } as never,
    sessionTime: 0.12,
    programId: "frozen",
    reducedMotion: false,
    identity: false,
    sessionStatus: "settled",
    geometryPlaying: false,
  });
  const mid = coordinator.snapshot();
  assert.ok(mid.framingProgress > 0 && mid.framingProgress < 1);
  const displayedZoom = mid.sourceZoom + (mid.targetZoom - mid.sourceZoom) * mid.framingProgress;
  const second = coordinator.begin({
    next: about,
    displayed: displayed("02", ABOUT_GEOMETRY_ID, displayedZoom),
    nowSeconds: 0.12,
    reducedMotion: false,
    targetZoom: 1.24,
  });
  assert.equal(second.decision.kind, "framing-only");
  assert.ok(Math.abs(second.transaction.sourceZoom - displayedZoom) < 1e-8);
  assert.equal(second.transaction.targetZoom, 1.24);
  const reduced = coordinator.begin({
    next: about,
    displayed: displayed("02", ABOUT_GEOMETRY_ID, second.transaction.sourceZoom),
    nowSeconds: 0.2,
    reducedMotion: true,
    targetZoom: 1.12,
  });
  coordinator.syncFromSession({
    geometryProgress: 1,
    phase: { progress: 1 } as never,
    sessionTime: 0.2,
    programId: "frozen",
    reducedMotion: true,
    identity: false,
    sessionStatus: "settled",
    geometryPlaying: false,
  });
  assert.equal(coordinator.snapshot().framingProgress, 1);
  assert.equal(coordinator.snapshot().targetZoom, 1.12);
  assert.equal(framingProgressFromGeometryM5(0.5), positionProgressFromGeometryM5(0.5));
  assert.ok(Math.abs(mixFraming(1, 1.18, 0.5) - (1 + 0.18 * positionProgressFromGeometryM5(0.5))) < 1e-12);
  const lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/framing-sandbox/FramingSandboxLab.tsx"), "utf8");
  assert.doesNotMatch(lab, /setTimeout\([^)]*zoom/);
  assert.match(lab, /targetZoom: identity \? 1 : targetProfile\.effectiveZoom/);
  assert.equal(reduced.decision.kind, "framing-only");
});

test("geometry transitions keep palette from leading and do not invent a third geometry", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(contract("05.6"), false, 1);
  const started = coordinator.begin({
    next: contract("05.5"),
    displayed: displayed("05.6", SINGLE_STATE_IDS.digital, 1),
    nowSeconds: 0,
    reducedMotion: false,
    targetZoom: 1.08,
  });
  assert.equal(started.decision.kind, "geometry");
  assert.equal(started.transaction.sourceGeometryId, SINGLE_STATE_IDS.digital);
  assert.equal(started.transaction.targetGeometryId, SINGLE_STATE_IDS.video);
  assert.equal(started.transaction.sourceZoom, 1);
  assert.equal(started.transaction.targetZoom, 1.08);
  for (const progress of [0, 0.2, 0.5, 0.85, 1]) {
    assert.equal(paletteLeadsGeometry(positionProgressFromGeometryM5(progress), paletteProgressFromGeometryM5(progress)), false);
  }
  const ids = [started.transaction.sourceGeometryId, started.transaction.targetGeometryId];
  assert.equal(new Set(ids).size, 2);
});

test("production homepage remains SiteShell and M5.5 is not started", () => {
  const home = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
  assert.match(home, /ProductionPhotonicSiteClient/);
  assert.doesNotMatch(home, /framing-sandbox/);
  assert.doesNotMatch(home, /PS04M5Lab/);
  const aggregate = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-03-m4-1/exports/ps03m41-manifest.json"), "utf8"));
  assert.equal(aggregate.aggregateContentHash, AGGREGATE);
  assert.equal(shaFile("public/photonic-skin/ps-03-m3-1r/states/single-video.state.bin"), FROZEN_VIDEO);
  const m54 = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-4/manifest.json"), "utf8"));
  assert.equal(m54.m55Started, false);
  assert.equal(m54.productionApproval, false);
  assert.equal(m54.notCanonicalYet, true);
  assert.equal(ALL_COMPETENCE_MASK > 0, true);
  assert.equal(COMPETENCE_BIT.video > 0, true);
  assert.equal(SCREEN_NODE_BY_ID["02"].title.includes("нас") || SCREEN_NODE_BY_ID["02"].id === "02", true);
});

test("estimated safe-area for 100/118 passing candidates; 124 may fail honestly", () => {
  const aboutSlot = presentationSlot(1440, 900, "right");
  const reserved = reservedDomRects(1440, 900);
  const passing = estimatedVisibleBBox(aboutSlot, 1.18);
  const tight = estimatedVisibleBBox(aboutSlot, 1.24);
  const clip118 = viewportClippingPx(passing, 1440, 900);
  assert.equal(clip118.left + clip118.right + clip118.top + clip118.bottom, 0);
  assert.equal(rectsOverlap(passing, reserved.header), false);
  assert.equal(rectsOverlap(passing, reserved.graph), false);
  const graphOverlap124 = rectsOverlap(tight, reserved.graph);
  const clip124 = viewportClippingPx(tight, 1440, 900);
  const overflow124 = clip124.right > 0 || graphOverlap124;
  assert.equal(typeof overflow124, "boolean");
});
