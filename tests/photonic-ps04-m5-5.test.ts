import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { checkpointSha256 } from "./checkpoint-hash";
import {
  ABOUT_GEOMETRY_ID,
  BALANCED_REVIEW,
  OWNER_SELECTED_124_111_111,
  OWNER_SELECTED_CAPS,
  OWNER_SELECTED_PROFILE_ID,
  SELECTED_EVENT_HASH,
  SELECTED_VIDEO_CLAPPER_OPEN_DEGREES,
  SELECTED_VIDEO_HASH,
  SELECTED_VIDEO_VARIANT,
  SELECTED_VIDEO_YAW_DEGREES,
  framingProfileFor,
  matchesFramingTarget,
  responsiveSafeZoom,
} from "../app/visual-lab/photonic-skin-ps04-m5/framing";
import { PALETTE_DELAY_FRACTION } from "../app/visual-lab/photonic-skin-ps04-m5/m5-choreography";
import {
  parsePromotionQuery,
  PROMOTION_DEFAULTS,
  promotionSearch,
} from "../app/visual-lab/photonic-skin-ps04-m5/promotion-preview/promotion-query";
import { PROMOTED_ASSET_NAMESPACE } from "../app/visual-lab/photonic-skin-ps04-m5/promotion-preview/promoted-runtime";
import { MASTER_STATE_ID, SINGLE_STATE_IDS } from "../app/visual-lab/photonic-skin-ps04-m5/screen-actor-contract";

const ROOT = process.cwd();
const M54_CHECKPOINT = "f43e8b9b59d881bc908f7f78ddcb45f9cb27eb41";
const M54_BASELINE = "af13e9df27be788f8295900d1d7a021bca699998";
const LOCK_HASH = "14cb2c37d5fac29b2f69a7a8ee1c342be13c67ac9007cd1b256b668663eb9392";
const FROZEN_VIDEO = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b";
const AGGREGATE = "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361";
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m5-5");
const PUBLIC = path.join(ROOT, "public/photonic-skin/ps-04-m5-5");

function shaFile(file: string) {
  return checkpointSha256(path.join(ROOT, file));
}

function readJson(file: string) {
  return JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
}

test("M5.4 human selection is recorded and checkpointed once", () => {
  const checkpoint = execFileSync("git", ["rev-parse", M54_CHECKPOINT], { encoding: "utf8" }).trim();
  assert.equal(checkpoint, M54_CHECKPOINT);
  const baseline = execFileSync("git", ["rev-parse", M54_BASELINE], { encoding: "utf8" }).trim();
  assert.equal(baseline, M54_BASELINE);
  const log = execFileSync("git", ["log", "--oneline", "--grep", "approve responsive M5 framing profile"], { encoding: "utf8" }).trim();
  assert.equal(log.split(/\r?\n/).filter(Boolean).length, 1);
  execFileSync("git", ["merge-base", "--is-ancestor", M54_CHECKPOINT, "HEAD"]);
  const review = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-4/reports/human-review.md"), "utf8");
  const m54 = readJson("design/photonic-skin/ps-04-m5-4/manifest.json");
  assert.match(review, /HUMAN PASS \/ SELECTED M5 FRAMING PROFILE/);
  assert.equal(m54.selectedProfile, OWNER_SELECTED_PROFILE_ID);
  assert.equal(m54.selectedFraming.aboutRequestedZoom, 1.24);
  assert.equal(m54.selectedFraming.merchRequestedZoom, 1.11);
  assert.equal(m54.selectedFraming.videoRequestedZoom, 1.11);
  assert.equal(m54.selectedFraming.aboutMobileCap, 1.18);
  assert.equal(m54.selectedFraming.merchMobileCap, 1.08);
  assert.equal(m54.selectedFraming.videoMobileCap, 1.08);
  assert.equal(m54.balancedReview.role, "evidence-only-not-selected");
  assert.equal(m54.m55Started, false);
  assert.equal(m54.productionApproval, false);
  const m55Review = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-5/reports/human-review.md"), "utf8");
  const m55 = readJson("design/photonic-skin/ps-04-m5-5/manifest.json");
  assert.match(m55Review, /HUMAN PASS \/ INTEGRATED PROMOTION APPROVED/);
  assert.equal(m55.status, "PS-04.M5.5 — HUMAN PASS / INTEGRATED PROMOTION APPROVED");
  assert.equal(m55.approvedCandidate, "PS-04.M5.5");
  assert.equal(m55.approvedAssetNamespace, "ps-04-m5-5");
  assert.equal(m55.integratedPromotionApproved, true);
  assert.equal(m55.approvedFor, "PS-04.M5.6");
  assert.equal(m55.productionDeployApproval, false);
  assert.equal(m55.deployApproval, false);
  assert.equal(m55.ps04CloseApproval, false);
  assert.equal(m55.m56Started, false);
  assert.equal(m55.productionApproval, false);
});

test("selection-lock is immutable owner 124/111/111 with exact donors", () => {
  const lock = readJson("design/photonic-skin/ps-04-m5-5/selection-lock.json");
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-5/selection-lock.json"), LOCK_HASH);
  assert.equal(readFileSync(path.join(STAGE, "authoring/selection-lock.sha256.txt"), "utf8").trim(), LOCK_HASH);
  assert.equal(lock.event.id, "EVENT_A_R2");
  assert.equal(lock.event.hash, SELECTED_EVENT_HASH);
  assert.equal(lock.video.id, "VIDEO_COMBO_40_R1");
  assert.equal(lock.video.hash, SELECTED_VIDEO_HASH);
  assert.equal(lock.video.compositionYawDegrees, -40);
  assert.equal(lock.video.clapperOpenAngleDegrees, 30);
  assert.equal(lock.framing.id, OWNER_SELECTED_PROFILE_ID);
  assert.equal(lock.framing.aboutRequestedZoom, 1.24);
  assert.equal(lock.framing.aboutMobileCap, 1.18);
  assert.equal(lock.framing.merchRequestedZoom, 1.11);
  assert.equal(lock.framing.merchMobileCap, 1.08);
  assert.equal(lock.framing.videoRequestedZoom, 1.11);
  assert.equal(lock.framing.videoMobileCap, 1.08);
  assert.deepEqual(OWNER_SELECTED_124_111_111, { aboutZoom: 124, merchZoom: 111, videoZoom: 111 });
  assert.equal(OWNER_SELECTED_CAPS.aboutMobileCap, 1.18);
  assert.equal(SELECTED_VIDEO_VARIANT, "combo-40-r1");
  assert.equal(SELECTED_VIDEO_YAW_DEGREES, -40);
  assert.equal(SELECTED_VIDEO_CLAPPER_OPEN_DEGREES, 30);
});

test("state impact sets partition 154 without naive union addition", () => {
  const impact = readJson("design/photonic-skin/ps-04-m5-5/reports/promotion-state-impact.json");
  assert.equal(impact.eventContainingCount, 83);
  assert.equal(impact.videoContainingCount, 65);
  assert.equal(impact.eventOnlyCount, 50);
  assert.equal(impact.videoOnlyCount, 32);
  assert.equal(impact.intersectionCount, 33);
  assert.equal(impact.unaffectedCount, 39);
  assert.equal(impact.eventOnlyCount + impact.videoOnlyCount + impact.intersectionCount + impact.unaffectedCount, 154);
  assert.equal(impact.unionCount, 154);
  assert.equal(impact.eventOnly.length, 50);
  assert.equal(impact.videoOnly.length, 32);
  assert.equal(impact.eventAndVideoIntersection.length, 33);
  assert.equal(impact.unaffected.length, 39);
  assert.equal(impact.states.length, 154);
  const overlap = new Set(impact.eventAndVideoIntersection);
  for (const id of impact.eventOnly) assert.equal(overlap.has(id), false);
  for (const id of impact.videoOnly) assert.equal(overlap.has(id), false);
});

test("154 canonical IDs, SINGLE donor exactness, unaffected byte identity", () => {
  const hashes = readJson("design/photonic-skin/ps-04-m5-5/reports/state-hash-map.json");
  const donor = readJson("design/photonic-skin/ps-04-m5-5/reports/donor-proof.json");
  const frozen = readJson("design/photonic-skin/ps-04-m5-5/reports/frozen-baseline.json");
  assert.equal(Object.keys(hashes).length, 154);
  assert.deepEqual(Object.keys(hashes), frozen.stateIds);
  assert.equal(hashes["single-event"].candidate, SELECTED_EVENT_HASH);
  assert.equal(hashes["single-video"].candidate, SELECTED_VIDEO_HASH);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-5/states/single-event.state.bin"), SELECTED_EVENT_HASH);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-5/states/single-video.state.bin"), SELECTED_VIDEO_HASH);
  assert.equal(donor.singleEventExact, true);
  assert.equal(donor.singleVideoExact, true);
  const impact = readJson("design/photonic-skin/ps-04-m5-5/reports/promotion-state-impact.json");
  for (const id of impact.unaffected) {
    assert.equal(hashes[id].candidate, hashes[id].baseline, id);
    assert.equal(shaFile(`public/photonic-skin/ps-04-m5-5/states/${id}.state.bin`), hashes[id].baseline, id);
  }
  for (const id of impact.eventAndVideoIntersection) {
    assert.deepEqual(hashes[id].donors, ["EVENT_A_R2", "VIDEO_COMBO_40_R1"]);
  }
});

test("persistent identity, LOD prefixes, palette masks, and no overlays", () => {
  const identity = readJson("design/photonic-skin/ps-04-m5-5/reports/identity-validation.json");
  const lod = readJson("design/photonic-skin/ps-04-m5-5/reports/lod-validation.json");
  const palette = readJson("design/photonic-skin/ps-04-m5-5/reports/palette-mask-validation.json");
  assert.equal(identity.N, 16384);
  assert.equal(identity.stride, 40);
  assert.equal(identity.allFinite, true);
  assert.equal(identity.canonicalOrder, true);
  assert.equal(identity.rows.length, 154);
  assert.deepEqual(lod.prefixes, [512, 1024, 2048, 4096, 8192, 12288, 16384]);
  assert.equal(palette.allUnchanged, true);
  const lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/promotion-preview/PromotionPreviewLab.tsx"), "utf8");
  assert.match(lab, /eventOverlay: "none"/);
  assert.match(lab, /videoOverlay: "none"/);
  assert.match(lab, /runtimeRotationOverride: "none"/);
  assert.match(lab, /framingProfile: OWNER_SELECTED_PROFILE_ID/);
  assert.match(lab, /assetNamespace: namespace === "candidate" \? PROMOTED_ASSET_NAMESPACE/);
  assert.doesNotMatch(lab, /loadEventOverlay|videoOverlayVariant|EVENT_SANDBOX|VIDEO_SANDBOX/);
  assert.equal(PROMOTED_ASSET_NAMESPACE, "ps-04-m5-5");
  assert.equal(PALETTE_DELAY_FRACTION, 0.06);
});

test("promotion query defaults to owner 124/111/111 without BALANCED_REVIEW", () => {
  const empty = parsePromotionQuery("");
  assert.equal(empty.aboutZoom, 124);
  assert.equal(empty.merchZoom, 111);
  assert.equal(empty.videoZoom, 111);
  assert.equal(empty.namespace, "candidate");
  assert.equal(empty.diagnostic, "final");
  assert.deepEqual(PROMOTION_DEFAULTS.aboutZoom, OWNER_SELECTED_124_111_111.aboutZoom);
  assert.notEqual(empty.aboutZoom, BALANCED_REVIEW.aboutZoom);
  assert.equal(promotionSearch(empty), "");
  const about = framingProfileFor({
    nodeId: "02",
    geometryId: ABOUT_GEOMETRY_ID,
    selection: OWNER_SELECTED_124_111_111,
    width: 1440,
    height: 900,
  });
  assert.equal(about.requestedZoom, 1.24);
  assert.equal(about.effectiveZoom, 1.24);
  const merch = framingProfileFor({
    nodeId: "05.7",
    geometryId: SINGLE_STATE_IDS.merch,
    selection: OWNER_SELECTED_124_111_111,
    width: 1440,
    height: 900,
  });
  assert.equal(merch.requestedZoom, 1.11);
  const video = framingProfileFor({
    nodeId: "05.5",
    geometryId: SINGLE_STATE_IDS.video,
    selection: OWNER_SELECTED_124_111_111,
    width: 1440,
    height: 900,
  });
  assert.equal(video.requestedZoom, 1.11);
  const brandWideElsewhere = framingProfileFor({
    nodeId: "03.1",
    geometryId: ABOUT_GEOMETRY_ID,
    selection: OWNER_SELECTED_124_111_111,
    width: 1440,
    height: 900,
  });
  assert.equal(brandWideElsewhere.requestedZoom, 1);
  assert.equal(brandWideElsewhere.effectiveZoom, 1);
  assert.equal(matchesFramingTarget("03.1", ABOUT_GEOMETRY_ID, "about"), false);
  const hero = framingProfileFor({
    nodeId: "01",
    geometryId: MASTER_STATE_ID,
    selection: OWNER_SELECTED_124_111_111,
    width: 1440,
    height: 900,
  });
  assert.equal(hero.requestedZoom, 1);
  const aboutMobile = responsiveSafeZoom({
    nodeId: "02",
    geometryId: ABOUT_GEOMETRY_ID,
    requestedZoom: 1.24,
    width: 390,
    height: 844,
  });
  assert.ok(aboutMobile <= 1.18);
  const merchMobile = responsiveSafeZoom({
    nodeId: "05.7",
    geometryId: SINGLE_STATE_IDS.merch,
    requestedZoom: 1.11,
    width: 390,
    height: 844,
  });
  assert.ok(merchMobile <= 1.08);
  const videoMobile = responsiveSafeZoom({
    nodeId: "05.5",
    geometryId: SINGLE_STATE_IDS.video,
    requestedZoom: 1.11,
    width: 390,
    height: 844,
  });
  assert.ok(videoMobile <= 1.08);
});

test("production /, frozen assets, and M5.5 payload isolation", () => {
  const home = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
  assert.match(home, /ProductionPhotonicSiteClient/);
  assert.doesNotMatch(home, /promotion-preview/);
  assert.doesNotMatch(home, /visual-lab/);
  assert.doesNotMatch(home, /PS04M5Lab/);
  assert.equal(shaFile("public/photonic-skin/ps-03-m3-1r/states/single-video.state.bin"), FROZEN_VIDEO);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-3-r1/variants/combo-40-r1/single-video.state.bin"), SELECTED_VIDEO_HASH);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-2/variants/a-r2/single-event.state.bin"), SELECTED_EVENT_HASH);
  const aggregate = readJson("design/photonic-skin/ps-03-m4-1/exports/ps03m41-manifest.json");
  assert.equal(aggregate.aggregateContentHash, AGGREGATE);
  const m55 = readJson("design/photonic-skin/ps-04-m5-5/manifest.json");
  assert.equal(m55.m56Started, false);
  assert.equal(m55.productionApproval, false);
  assert.equal(m55.push, false);
  assert.equal(m55.deploy, false);
  assert.equal(m55.commitCreated, false);
  const preview = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/promotion-preview/page.tsx"), "utf8");
  const review = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/promotion-preview/review/page.tsx"), "utf8");
  assert.match(preview, /mode="preview"/);
  assert.match(review, /mode="lab"/);
  const bins = readdirSync(path.join(PUBLIC, "states")).filter((name) => name.endsWith(".state.bin"));
  assert.equal(bins.length, 154);
});

const smokePath = path.join(STAGE, "reports/browser-smoke.json");
test("browser smoke and ABOUT_124 real safe-area, if captured", { skip: !existsSync(smokePath) }, () => {
  const smoke = readJson("design/photonic-skin/ps-04-m5-5/reports/browser-smoke.json");
  assert.equal(smoke.ok, true);
  assert.equal(smoke.assetNamespace, "ps-04-m5-5");
  assert.equal(smoke.eventOverlay, "none");
  assert.equal(smoke.videoOverlay, "none");
  const safe = readJson("design/photonic-skin/ps-04-m5-5/reports/safe-area-analysis.json");
  assert.equal(safe.desktop.about.requestedZoom, 1.24);
  assert.equal(safe.desktop.about.effectiveZoom, 1.24);
  assert.equal(safe.desktop.about.silentlyCapped, false);
  if (safe.desktop.about.pass === false) {
    assert.equal(safe.verdict, "FAIL");
  }
});
