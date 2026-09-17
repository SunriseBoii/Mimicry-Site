import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { checkpointSha256, checkpointText } from "./checkpoint-hash";
import { PALETTE_DELAY_FRACTION } from "../app/visual-lab/photonic-skin-ps04-m5/m5-choreography";
import { MAGNETISM } from "../app/visual-lab/photonic-skin-ps04-m5/scroll-controller";
import { OWNER_SELECTED_PROFILE_ID } from "../app/visual-lab/photonic-skin-ps04-m5/framing";
import type { ScreenNodeId } from "../app/visual-lab/photonic-skin-ps04-m5/topology";
import {
  MagnetizedSettleController,
  type ActorFrameSample,
  type SettleTickInput,
} from "../app/visual-lab/photonic-skin-ps04-m6/magnetized-settle/magnetized-settle-runtime";
import {
  INPUT_QUIET_MS,
  MAGNETISM_DURATION_MS,
  SETTLE_STABLE_MS,
} from "../app/visual-lab/photonic-skin-ps04-m6/magnetized-settle/settle-tokens";
import { reduceProjectBuilderAction } from "../app/visual-lab/photonic-skin-ps04-m6/magnetized-settle/builder-ui-action";
import {
  INITIAL_BUILDER_FLOW,
  selectTask,
} from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-flow";
import {
  MAGNETISM_PROFILES,
  captureRadiusPx,
  magneticStrengthMonotonic,
  magnetismProfile,
} from "../app/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/magnetism-profile";
import { gatherStateId, SINGLE_STATE_IDS } from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-ids";
import { resolveBuilderState } from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-resolver";

const ROOT = process.cwd();
const M61_CHECKPOINT_MESSAGE = "approve project builder Mimic semantics";
const M61_CHECKPOINT = "c29e143580947fdf3f3f4121271a10805d4c5498";
const FROZEN_PRODUCTION = [
  "app/page.tsx",
  "app/_photonic-skin/release.ts",
  "app/_photonic-skin/runtime.ts",
  "app/_photonic-skin/ProductionPhotonicSiteClient.tsx",
  "app/_photonic-skin/PhotonicSiteRuntime.tsx",
  "app/visual-lab/photonic-skin-ps04-m5/m5-choreography.ts",
  "app/visual-lab/photonic-skin-ps04-m5/scroll-controller.ts",
  "public/photonic-skin/ps-04-m5-5",
];
const R1_LOCK_FILES = [
  "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/magnetism-profile.ts",
  "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/r1-magnetic-driver.ts",
  "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/presentation-placement.ts",
];

function git(args: string[]) {
  return execFileSync("git", args, { encoding: "utf8", cwd: ROOT }).trim();
}

function readJson(file: string) {
  return JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
}

function shaFile(file: string) {
  return checkpointSha256(path.join(ROOT, file));
}

const KEYS: Record<string, string> = {
  "01": "hero",
  "02": "about",
  "03.1": "builder-master",
  "03.2": "master-neutral",
  "03.3": "builder-drive",
};

function controller(keys: Record<string, string> = KEYS) {
  return new MagnetizedSettleController({
    resolveContract: (nodeId) => ({ nodeId, key: keys[nodeId] ?? nodeId }),
  });
}

function tickInput(partial: Partial<SettleTickInput> & { nowMs: number; observedNodeId: ScreenNodeId }): SettleTickInput {
  return {
    scrollY: 0,
    viewportHeight: 900,
    magneticCandidateId: partial.observedNodeId,
    pendingTarget: null,
    mode: "idle",
    gestureActive: false,
    snapAnimationPending: false,
    layoutRevision: 1,
    distanceToAnchorPx: 0,
    ...partial,
  };
}

function drain(runtime: MagnetizedSettleController) {
  return { begin: runtime.consumeBegin(), cancel: runtime.consumeCancel(), prewarm: runtime.consumePrewarm() };
}

function hold(runtime: MagnetizedSettleController, node: ScreenNodeId, from: number, ms: number, extra: Partial<SettleTickInput> = {}) {
  let now = from;
  const end = from + ms;
  while (now <= end) {
    runtime.tick(tickInput({ nowMs: now, observedNodeId: node, magneticCandidateId: extra.magneticCandidateId ?? node, ...extra }));
    now += 8;
  }
  return now;
}

function settle(runtime: MagnetizedSettleController, node: ScreenNodeId, from: number, extra: Partial<SettleTickInput> = {}) {
  runtime.tick(tickInput({
    nowMs: from,
    observedNodeId: node,
    magneticCandidateId: extra.magneticCandidateId ?? node,
    pendingTarget: extra.pendingTarget ?? node,
    mode: extra.mode ?? "idle",
    ...extra,
  }));
  return hold(runtime, node, from + 8, Math.max(SETTLE_STABLE_MS, INPUT_QUIET_MS) + 40, extra);
}

function settledFrame(node: ScreenNodeId, key: string): ActorFrameSample {
  return {
    status: "settled",
    visualLifecycle: "settled",
    geometryProgress: 1,
    paletteProgress: 1,
    siteProgress: 1,
    programReady: true,
    visualPublished: true,
    targetNodeId: node,
    endpointKey: key,
  };
}

test("R2 continues the uncommitted M6.2/R1 tree on the M6.1 checkpoint", () => {
  assert.equal(git(["rev-parse", "872bb10^"]), M61_CHECKPOINT);
  const checkpoint = git(["log", "-1", "--format=%H", "--grep", M61_CHECKPOINT_MESSAGE]);
  assert.equal(checkpoint, M61_CHECKPOINT);
  execFileSync("git", ["diff", "--exit-code", checkpoint, "872bb10", "--", ...FROZEN_PRODUCTION], { cwd: ROOT });
  const m61 = readJson("design/photonic-skin/ps-04-m6-1/manifest.json");
  assert.equal(m61.humanPass, true);
  const m62 = readJson("design/photonic-skin/ps-04-m6-2/manifest.json");
  assert.equal(m62.humanPass, false);
  const r1 = readJson("design/photonic-skin/ps-04-m6-2-r1/manifest.json");
  assert.equal(r1.humanPass, false);
  assert.equal(MAGNETISM_DURATION_MS, 340);
  assert.equal(MAGNETISM.snapDurationMs, 340);
  assert.equal(PALETTE_DELAY_FRACTION, 0.06);
  assert.equal(OWNER_SELECTED_PROFILE_ID, "OWNER_SELECTED_124_111_111");
});

test("pointer on an anchored 03.2 still publishes in-screen-action", () => {
  const runtime = controller({ ...KEYS, "03.2": "master-neutral" });
  runtime.adoptBoot("03.2", "master-neutral");
  const now = settle(runtime, "03.2", 20);
  drain(runtime);
  runtime.noteActorFrame(settledFrame("03.2", "master-neutral"), now);
  const magneticBefore = runtime.snapshot(now).magneticSettleRevision;
  runtime.noteUserInput("pointer", now + 4);
  assert.equal(runtime.snapshot(now + 4).scrollPhase, "Traversing");
  runtime.setResolveContract((nodeId) => ({ nodeId, key: nodeId === "03.2" ? "single-content" : KEYS[nodeId] ?? nodeId }));
  const clicked = runtime.requestInScreenAction("03.2", now + 8);
  assert.equal(clicked?.origin, "in-screen");
  assert.equal(clicked?.source.kind, "in-screen-action");
  if (clicked?.source.kind === "in-screen-action") {
    assert.equal(clicked.source.hostNodeId, "03.2");
    assert.equal(clicked.source.interactionRevision, 1);
  }
  assert.equal(runtime.snapshot(now + 8).magneticSettleRevision, magneticBefore);
  assert.equal(runtime.snapshot(now + 8).lastAppliedInteractionRevision, 1);
  runtime.setResolveContract((nodeId) => ({ nodeId, key: nodeId === "03.2" ? "single-content" : KEYS[nodeId] ?? nodeId }));
  assert.equal(runtime.requestInScreenAction("03.2", now + 16), null);
  assert.equal(runtime.snapshot(now + 16).interactionRevision, 1);
});

test("real scroll displacement still blocks in-screen-action", () => {
  const runtime = controller({ ...KEYS, "03.2": "gather-event" });
  runtime.adoptBoot("03.1", "builder-master");
  const now = settle(runtime, "03.2", 20);
  drain(runtime);
  runtime.noteActorFrame(settledFrame("03.2", "gather-event"), now);
  runtime.setResolveContract((nodeId) => ({ nodeId, key: nodeId === "03.2" ? "gather-event-video" : KEYS[nodeId] ?? nodeId }));
  runtime.noteUserInput("wheel", now + 16);
  runtime.tick(tickInput({
    nowMs: now + 24,
    observedNodeId: "03.3",
    magneticCandidateId: "03.3",
    mode: "user",
    gestureActive: true,
    distanceToAnchorPx: 40,
  }));
  assert.equal(runtime.requestInScreenAction("03.2", now + 32), null);
});

test("toggle-competency reducer uses canonical order and one draft revision", () => {
  let state = selectTask(INITIAL_BUILDER_FLOW, "explain_changes");
  const first = reduceProjectBuilderAction(state, {
    type: "toggle-competency",
    competencyId: "video",
    hostNodeId: "03.2",
    source: "user-ui",
  });
  state = first.state;
  assert.equal(first.publishInScreen, true);
  assert.deepEqual(state.draft.competencies, ["video"]);
  const second = reduceProjectBuilderAction(state, {
    type: "toggle-competency",
    competencyId: "content",
    hostNodeId: "03.2",
    source: "user-ui",
  });
  assert.deepEqual(second.state.draft.competencies, ["content", "video"]);
  assert.equal(second.state.draft.revision, state.draft.revision + 1);
  assert.equal(resolveBuilderState({
    screen: "03.2",
    draftCompetencies: second.state.draft.competencies,
    confirmedCompetencies: null,
  }), gatherStateId(["content", "video"]));
  const confirm = reduceProjectBuilderAction(second.state, { type: "confirm-competencies", source: "user-ui" });
  assert.equal(confirm.publishInScreen, false);
  assert.deepEqual(confirm.state.confirmed?.competencies, ["content", "video"]);
  assert.deepEqual(second.state.confirmed, null);
});

test("M6.1 draft semantics remain exact SINGLE then GATHER then DRIVE", () => {
  assert.equal(resolveBuilderState({
    screen: "03.2",
    draftCompetencies: [],
    confirmedCompetencies: null,
  }), "master-neutral");
  assert.equal(resolveBuilderState({
    screen: "03.2",
    draftCompetencies: ["content"],
    confirmedCompetencies: null,
  }), SINGLE_STATE_IDS.content);
  assert.equal(resolveBuilderState({
    screen: "03.2",
    draftCompetencies: ["event", "content", "video"],
    confirmedCompetencies: null,
  }), "complex-gather-content-event-video");
  assert.equal(resolveBuilderState({
    screen: "03.3",
    draftCompetencies: ["content", "video"],
    confirmedCompetencies: ["content", "video"],
  }), "complex-drive-content-video");
});

test("R2 routes exist, clean preview has no HUD, and production files stay isolated", () => {
  const clean = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r2/page.tsx"), "utf8");
  const review = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r2/review/page.tsx"), "utf8");
  const lab = checkpointText("app/visual-lab/photonic-skin-ps04-m6/magnetized-settle/MagnetizedSettleLab.tsx", "872bb10");
  const chapter = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/BuilderChapter.tsx"), "utf8");
  const dispatch = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle/builder-ui-action.ts"), "utf8");
  assert.match(clean, /mode="preview"/);
  assert.match(clean, /stage="r2"/);
  assert.match(review, /mode="lab"/);
  assert.match(review, /stage="r2"/);
  assert.match(lab, /__PS04M62R2_LAB__/);
  assert.match(lab, /dispatchProjectBuilderAction/);
  assert.match(lab, /hostNodeId: "03.2"/);
  assert.match(chapter, /data-competency-id=\{id\}/);
  assert.match(dispatch, /type: "toggle-competency"/);
  assert.doesNotMatch(lab, /compileLiveRetarget\(/);
  const home = checkpointText("app/page.tsx", "872bb10");
  const client = checkpointText("app/_photonic-skin/ProductionPhotonicSiteClient.tsx", "872bb10");
  const runtime = checkpointText("app/_photonic-skin/runtime.ts", "872bb10");
  for (const text of [home, client, runtime]) {
    assert.doesNotMatch(text, /magnetized-settle-r2/);
    assert.doesNotMatch(text, /__PS04M62R2_LAB__/);
    assert.doesNotMatch(text, /ps-04-m6-2-r2/);
  }
});

test("R2 capture acceptance cannot use the QA competency handle", () => {
  const capture = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m6-2-r2/scripts/capture-m6-2-r2.mjs"), "utf8");
  assert.doesNotMatch(capture, /setCompetencies\(/);
  assert.doesNotMatch(capture, /requestState\(/);
  assert.match(capture, /data-competency-id/);
  assert.match(capture, /\.click\(/);
  assert.match(capture, /touchscreen|locator\(.+\)\.tap\(/);
  assert.match(capture, /realDomClicksUsed/);
  assert.match(capture, /qaSetCompetenciesUsedForAcceptance/);
  const r1Capture = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m6-2-r1/scripts/capture-m6-2-r1.mjs"), "utf8");
  assert.match(r1Capture, /setCompetencies/);
});

test("R1 magnetism and placement files keep their R1 identity", () => {
  const r1 = magnetismProfile("R1_STRONG_BALANCED");
  assert.equal(r1.desktopCaptureRadiusVh, 0.56);
  assert.equal(r1.mobileCaptureRadiusVh, 0.42);
  assert.equal(r1.motion, "monotonic-damping");
  assert.equal(MAGNETISM_PROFILES.R1_STRONG_BALANCED.snapDurationMs, MAGNETISM.snapDurationMs);
  assert.equal(magneticStrengthMonotonic(captureRadiusPx(r1, 900, false)), true);
  const driver = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/r1-magnetic-driver.ts"), "utf8");
  assert.match(driver, /magneticOvershoot|overshoot = false/);
  assert.match(driver, /cancelOnFreshInput/);
  const hashes = Object.fromEntries(R1_LOCK_FILES.map((file) => [file, shaFile(file)]));
  const reported = existsSync(path.join(ROOT, "design/photonic-skin/ps-04-m6-2-r2/reports/r1-lock-preservation.json"))
    ? readJson("design/photonic-skin/ps-04-m6-2-r2/reports/r1-lock-preservation.json")
    : null;
  if (reported) {
    assert.equal(reported.magnetismProfile, "R1_STRONG_BALANCED");
    assert.equal(reported.desktopCaptureRadiusVh, 0.56);
    assert.equal(reported.mobileCaptureRadiusVh, 0.42);
    assert.equal(reported.magneticOvershoot, false);
    for (const file of R1_LOCK_FILES) {
      assert.equal(reported.fileHashes[file], hashes[file]);
    }
  }
});

test("R2 packet is machine pass only and hard gates stay closed", () => {
  const manifestPath = path.join(ROOT, "design/photonic-skin/ps-04-m6-2-r2/manifest.json");
  if (!existsSync(manifestPath)) return;
  const manifest = readJson("design/photonic-skin/ps-04-m6-2-r2/manifest.json");
  assert.equal(manifest.status, "PS-04.M6.2-R2 — MACHINE PASS / HUMAN REAL-UI BUILDER TRANSFORMATION REVIEW REQUIRED");
  assert.equal(manifest.humanPass, false);
  assert.equal(manifest.productionReady, false);
  assert.equal(manifest.commitCreated, false);
  assert.equal(manifest.push, false);
  assert.equal(manifest.deploy, false);
  assert.equal(manifest.m63Started, false);
  assert.equal(manifest.animejsAdded, false);
  const approval = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m6-2-r2/reports/approval-report.md"), "utf8");
  assert.match(approval, /HUMAN REAL-UI BUILDER TRANSFORMATION REVIEW REQUIRED/);
  assert.doesNotMatch(approval, /HUMAN PASS \/ MAGNETIZED/);
  const human = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m6-2-r2/reports/human-review.md"), "utf8");
  assert.match(human, /HUMAN REAL-UI BUILDER TRANSFORMATION REVIEW REQUIRED/);
  const cause = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m6-2-r2/reports/root-cause.md"), "utf8");
  assert.match(cause, /requestInScreenAction/);
  assert.match(cause, /noteUserInput\("pointer"\)/);
  const smoke = readJson("design/photonic-skin/ps-04-m6-2-r2/reports/browser-smoke.json");
  assert.equal(smoke.ok, true);
  assert.equal(smoke.realDomClicksUsed, true);
  assert.equal(smoke.qaSetCompetenciesUsedForAcceptance, false);
  assert.equal(smoke.reviewHudCount, 1);
  assert.equal(smoke.cleanHudCount, 0);
  const live = readJson("design/photonic-skin/ps-04-m6-2-r2/reports/real-ui-builder-semantics.json");
  assert.equal(live.ok, true);
  assert.equal(live.realDomClicksUsed, true);
  assert.equal(live.qaSetCompetenciesUsedForAcceptance, false);
  assert.equal(live.allSevenSingleButtonsWork, true);
  assert.equal(live.selectionAndRemovalWork, true);
  assert.equal(live.interactionRevisionExactlyOncePerAction, true);
  assert.equal(live.magneticSettleRevisionUnchangedDuringToggle, true);
  assert.equal(live.confirmedSetChangesOnlyOnConfirm, true);
  assert.equal(live["03.3ExactDrive"], true);
  const pixels = readJson("design/photonic-skin/ps-04-m6-2-r2/reports/rendered-pixel-validation.json");
  assert.equal(pixels.ok, true);
  for (const step of pixels.steps) {
    if (step.expectPixelChange) assert.equal(step.renderedActorPixelsChanged, true);
  }
  const isolation = readJson("design/photonic-skin/ps-04-m6-2-r2/reports/production-isolation.json");
  assert.equal(isolation.productionHasM62R2Handle, false);
  const transition = readJson("design/photonic-skin/ps-04-m6-2-r2/reports/transition-regression.json");
  assert.equal(transition.masterFlash, 0);
  assert.equal(transition.paletteLead, 0);
  assert.equal(transition.centerDwell, 0);
  assert.equal(transition.thirdGeometry, false);
  assert.equal(existsSync(path.join(ROOT, "design/photonic-skin/ps-04-m6-2-r2/renders/browser/video/real-ui-builder-selection.webm")), true);
});
