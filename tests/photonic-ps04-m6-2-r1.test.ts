import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { PALETTE_DELAY_FRACTION } from "../app/visual-lab/photonic-skin-ps04-m5/m5-choreography";
import { MAGNETISM, canonicalLayout } from "../app/visual-lab/photonic-skin-ps04-m5/scroll-controller";
import { CANONICAL_BRAND_WIDE_ID, indexStates } from "../app/visual-lab/photonic-skin-ps04-m5/screen-actor-contract";
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
import {
  assertNoForbiddenFallback,
  resolveBuilderActorContract,
} from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-resolver";
import { INITIAL_BUILDER_FLOW, builderView } from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-flow";
import {
  MAGNETISM_PROFILES,
  captureRadiusPx,
  dampToward,
  magneticStrength,
  magneticStrengthMonotonic,
  magnetismProfile,
} from "../app/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/magnetism-profile";
import {
  computePresentationPlacement,
  createPlacementChannelTelemetry,
  routeSegmentAt,
} from "../app/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/presentation-placement";

const ROOT = process.cwd();
const BRANCH = "ps04-m6-sandbox";
const M61_CHECKPOINT_MESSAGE = "approve project builder Mimic semantics";
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

function git(args: string[]) {
  return execFileSync("git", args, { encoding: "utf8", cwd: ROOT }).trim();
}

function readJson(file: string) {
  return JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
}

const KEYS: Record<string, string> = {
  "01": "hero",
  "02": "about",
  "03.1": "builder-master",
  "03.2": "builder-draft",
  "03.3": "builder-drive",
  "04": "cases",
  "05.1": "content",
  "05.2": "design",
  "08": "footer-exit",
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

function morphingFrame(node: ScreenNodeId, key: string, progress = 0.4): ActorFrameSample {
  return {
    status: "running",
    visualLifecycle: "morphing",
    geometryProgress: progress,
    paletteProgress: progress,
    siteProgress: progress,
    programReady: true,
    visualPublished: true,
    targetNodeId: node,
    endpointKey: key,
  };
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

test("R1 continues the uncommitted M6.2 tree on the M6.1 checkpoint", () => {
  assert.equal(git(["branch", "--show-current"]), BRANCH);
  const checkpoint = git(["log", "-1", "--format=%H", "--grep", M61_CHECKPOINT_MESSAGE]);
  assert.equal(checkpoint, "c29e143580947fdf3f3f4121271a10805d4c5498");
  assert.equal(git(["rev-parse", "HEAD"]), checkpoint);
  execFileSync("git", ["diff", "--exit-code", checkpoint, "--", ...FROZEN_PRODUCTION], { cwd: ROOT });
  const m61 = readJson("design/photonic-skin/ps-04-m6-1/manifest.json");
  assert.equal(m61.humanPass, true);
  const m62 = readJson("design/photonic-skin/ps-04-m6-2/manifest.json");
  assert.equal(m62.humanPass, false);
  assert.doesNotMatch(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m6-2/reports/human-review.md"), "utf8"), /HUMAN PASS \/ MAGNETIZED/);
  assert.equal(MAGNETISM_DURATION_MS, 340);
  assert.equal(MAGNETISM.snapDurationMs, 340);
  assert.equal(PALETTE_DELAY_FRACTION, 0.06);
  assert.equal(OWNER_SELECTED_PROFILE_ID, "OWNER_SELECTED_124_111_111");
});

test("in-screen action is typed and does not require a new magneticSettleRevision", () => {
  const runtime = controller({ ...KEYS, "03.2": "master-neutral" });
  runtime.adoptBoot("03.2", "master-neutral");
  const now = settle(runtime, "03.2", 20);
  drain(runtime);
  runtime.noteActorFrame(settledFrame("03.2", "master-neutral"), now);
  const before = runtime.snapshot(now).magneticSettleRevision;
  runtime.setResolveContract((nodeId) => ({ nodeId, key: nodeId === "03.2" ? "single-content" : KEYS[nodeId] ?? nodeId }));
  const clicked = runtime.requestInScreenAction("03.2", now + 8);
  assert.equal(clicked?.origin, "in-screen");
  assert.equal(clicked?.source.kind, "in-screen-action");
  if (clicked?.source.kind === "in-screen-action") {
    assert.equal(clicked.source.hostNodeId, "03.2");
    assert.ok(clicked.source.interactionRevision >= 1);
  }
  assert.equal(runtime.snapshot(now + 8).magneticSettleRevision, before);
  assert.equal(runtime.snapshot(now + 8).actorRequestSource?.kind, "in-screen-action");
});

test("in-screen latest-target retargets a visible morph without scroll interrupt", () => {
  const runtime = controller({ ...KEYS, "03.2": "master-neutral" });
  runtime.adoptBoot("03.2", "master-neutral");
  const now = settle(runtime, "03.2", 20);
  drain(runtime);
  runtime.noteActorFrame(morphingFrame("03.2", "master-neutral"), now);
  runtime.setResolveContract((nodeId) => ({ nodeId, key: nodeId === "03.2" ? "single-content" : KEYS[nodeId] ?? nodeId }));
  const clicked = runtime.requestInScreenAction("03.2", now + 8);
  assert.equal(clicked?.origin, "in-screen");
  assert.equal(clicked?.semanticContractKey, "single-content");
  assert.equal(runtime.snapshot(now + 8).runningMorphInterruptedByScroll, 0);
  assert.equal(runtime.snapshot(now + 8).actorStatus, "morphing");
});

test("route-settle source is distinct from in-screen-action", () => {
  const runtime = controller();
  runtime.adoptBoot("01", "hero");
  settle(runtime, "02", 20);
  const begin = drain(runtime).begin;
  assert.equal(begin?.origin, "settle");
  assert.equal(begin?.source.kind, "route-settle");
  if (begin?.source.kind === "route-settle") {
    assert.equal(begin.source.nodeId, "02");
    assert.ok(begin.source.magneticSettleRevision >= 1);
  }
});

test("About 02 stays exact BRAND_WIDE and builder fallback must not run on it", () => {
  const frozen = readJson("public/photonic-skin/ps-04-m5-5/manifests/ps04m55-manifest.json");
  const delta = readJson("public/photonic-skin/ps-04-m6-1/manifests/ps04m61-delta-manifest.json");
  const byId = new Map();
  for (const entry of frozen.states) byId.set(entry.stateId, entry);
  for (const entry of delta.states) byId.set(entry.stateId, entry);
  const index = indexStates([...byId.values()]);
  const about = resolveBuilderActorContract({
    nodeId: "02",
    index,
    flow: builderView(INITIAL_BUILDER_FLOW),
  });
  assert.equal(about.family, "BRAND_WIDE");
  assert.equal(about.resolvedGeometryId, CANONICAL_BRAND_WIDE_ID);
  assert.equal(about.resolution, "exact");
  assert.equal(about.applyPaletteOverride, false);
  assert.throws(() => assertNoForbiddenFallback(about), /BRAND_WIDE/);
  const lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle/MagnetizedSettleLab.tsx"), "utf8");
  assert.match(lab, /guardBuilderContract/);
  assert.match(lab, /hostNodeId\.startsWith\("03"\)/);
});

test("presentation placement interpolates frozen slots from scrollY and reverses exactly", () => {
  const layout = canonicalLayout(900, { competencies: true, brief: true });
  const cases = layout.byId["04"];
  const content = layout.byId["05.1"];
  assert.ok(cases && content);
  const midY = cases.start + (content.start - cases.start) * 0.5;
  const forward = computePresentationPlacement({
    scrollY: midY,
    layout,
    width: 1440,
    height: 900,
    dpr: 1,
    magnetizedSettledNodeId: "04",
    scrollPhase: "Traversing",
    lastValidSlot: "right",
  });
  assert.equal(forward.presentationSourceNodeId, "04");
  assert.equal(forward.presentationTargetNodeId, "05.1");
  assert.ok(forward.routeSegmentProgress > 0.49 && forward.routeSegmentProgress < 0.51);
  assert.ok(forward.displayedPlacement.x < cases.start + 2000);
  const reverse = computePresentationPlacement({
    scrollY: midY,
    layout,
    width: 1440,
    height: 900,
    dpr: 1,
    magnetizedSettledNodeId: "05.1",
    scrollPhase: "Traversing",
    lastValidSlot: "left",
  });
  assert.equal(reverse.displayedPlacement.x, forward.displayedPlacement.x);
  assert.equal(reverse.displayedPlacement.y, forward.displayedPlacement.y);
  const atContent = computePresentationPlacement({
    scrollY: content.start,
    layout,
    width: 1440,
    height: 900,
    dpr: 1,
    magnetizedSettledNodeId: "05.1",
    scrollPhase: "Settled",
    lastValidSlot: "left",
  });
  assert.equal(atContent.presentationSourceNodeId, "05.1");
  assert.equal(atContent.displayedPlacement.slot, "left");
  assert.ok(atContent.routeSegmentProgress === 0 || atContent.routeSegmentProgress === 1);
  const footer = computePresentationPlacement({
    scrollY: layout.byId["08"]?.start ?? 0,
    layout,
    width: 1440,
    height: 900,
    dpr: 1,
    magnetizedSettledNodeId: "08",
    scrollPhase: "Settled",
    lastValidSlot: "right",
  });
  assert.equal(footer.actorDraw, false);
  const approachingFooter = computePresentationPlacement({
    scrollY: (layout.byId["07"]?.start ?? 0) + 40,
    layout,
    width: 1440,
    height: 900,
    dpr: 1,
    magnetizedSettledNodeId: "07",
    scrollPhase: "Traversing",
    lastValidSlot: "right",
  });
  assert.equal(approachingFooter.actorDraw, true);
  assert.equal(approachingFooter.displayedPlacement.slot, "right");
  const telemetry = createPlacementChannelTelemetry();
  assert.equal(telemetry.placementActorRequestCount, 0);
  assert.equal(telemetry.placementCompileCount, 0);
  assert.equal(telemetry.placementQueueDepth, 0);
  const merch = layout.byId["05.7"];
  const team = layout.byId["06.1"];
  assert.ok(merch && team);
  const merchTeam = routeSegmentAt(merch.start + (team.start - merch.start) * 0.35, layout);
  assert.equal(merchTeam.presentationSourceNodeId, "05.7");
  assert.equal(merchTeam.presentationTargetNodeId, "06.1");
});

test("R1_STRONG_BALANCED is monotonic, captures farther than M6.2, and does not overshoot", () => {
  const r1 = magnetismProfile("R1_STRONG_BALANCED");
  const current = magnetismProfile("M6_2_CURRENT");
  assert.equal(r1.desktopCaptureRadiusVh, 0.56);
  assert.equal(r1.mobileCaptureRadiusVh, 0.42);
  assert.equal(current.desktopCaptureRadiusVh, 0.25);
  assert.equal(r1.noopDistancePx, MAGNETISM.noopDistancePx);
  assert.equal(magneticStrengthMonotonic(captureRadiusPx(r1, 900, false)), true);
  const far = 0.48 * 900;
  assert.ok(magneticStrength(far, captureRadiusPx(r1, 900, false)) > 0);
  assert.equal(magneticStrength(far, captureRadiusPx(current, 900, false)), 0);
  let y = 100;
  const target = 0;
  for (let i = 0; i < 80; i += 1) {
    const next = dampToward(y, target, 1, 1 / 60, r1);
    assert.ok(next <= y);
    assert.ok(next >= target);
    y = next;
  }
  assert.equal(y, target);
  const pkg = readJson("package.json");
  assert.equal(pkg.dependencies?.["animejs"], undefined);
  assert.equal(pkg.devDependencies?.["animejs"], undefined);
  const lock = existsSync(path.join(ROOT, "package-lock.json")) ? readFileSync(path.join(ROOT, "package-lock.json"), "utf8") : "";
  assert.doesNotMatch(lock, /"animejs"/);
  assert.equal(MAGNETISM_PROFILES.M6_2_CURRENT.motion, "cubic-ease-out");
  assert.equal(MAGNETISM_PROFILES.R1_STRONG_BALANCED.motion, "monotonic-damping");
  const driver = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/r1-magnetic-driver.ts"), "utf8");
  assert.match(driver, /activelyFast/);
  assert.match(driver, /armIdle\(\)/);
  assert.match(driver, /onMagneticBegin/);
  assert.match(driver, /nearestAnchorDistance/);
});

test("isolated R1 routes exist and production files stay off the R1 surface", () => {
  const clean = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/page.tsx"), "utf8");
  const review = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/review/page.tsx"), "utf8");
  const lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle/MagnetizedSettleLab.tsx"), "utf8");
  assert.match(clean, /mode="preview"/);
  assert.match(clean, /stage="r1"/);
  assert.match(review, /mode="lab"/);
  assert.match(review, /stage="r1"/);
  assert.match(lab, /__PS04M62R1_LAB__/);
  assert.match(lab, /computePresentationPlacement/);
  assert.match(lab, /R1MagneticDriver/);
  assert.doesNotMatch(lab, /compileLiveRetarget\(/);
  const home = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
  const client = readFileSync(path.join(ROOT, "app/_photonic-skin/ProductionPhotonicSiteClient.tsx"), "utf8");
  const runtime = readFileSync(path.join(ROOT, "app/_photonic-skin/runtime.ts"), "utf8");
  for (const text of [home, client, runtime]) {
    assert.doesNotMatch(text, /magnetized-settle-r1/);
    assert.doesNotMatch(text, /__PS04M62R1_LAB__/);
    assert.doesNotMatch(text, /ps-04-m6-2-r1/);
  }
  assert.match(home, /ProductionPhotonicSiteClient/);
});

test("R1 packet is machine pass only and hard gates stay closed", () => {
  const manifest = readJson("design/photonic-skin/ps-04-m6-2-r1/manifest.json");
  assert.equal(manifest.status, "PS-04.M6.2-R1 — MACHINE PASS / HUMAN LIVE-SEMANTICS, PLACEMENT AND MAGNETISM REVIEW REQUIRED");
  assert.equal(manifest.humanPass, false);
  assert.equal(manifest.productionReady, false);
  assert.equal(manifest.productionDeployApproval, false);
  assert.equal(manifest.commitCreated, false);
  assert.equal(manifest.push, false);
  assert.equal(manifest.deploy, false);
  assert.equal(manifest.m62Committed, false);
  assert.equal(manifest.m63Started, false);
  assert.equal(manifest.productionChanged, false);
  assert.equal(manifest.animejsAdded, false);
  assert.equal(manifest.magnetismDurationMs, 340);
  assert.equal(manifest.desktopCaptureRadiusVh, 0.56);
  assert.equal(manifest.mobileCaptureRadiusVh, 0.42);
  const approval = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m6-2-r1/reports/approval-report.md"), "utf8");
  assert.match(approval, /HUMAN LIVE-SEMANTICS, PLACEMENT AND MAGNETISM REVIEW REQUIRED/);
  assert.doesNotMatch(approval, /HUMAN PASS \/ MAGNETIZED/);
  const human = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m6-2-r1/reports/human-review.md"), "utf8");
  assert.match(human, /HUMAN LIVE-SEMANTICS, PLACEMENT AND MAGNETISM REVIEW REQUIRED/);
  assert.doesNotMatch(human, /HUMAN PASS of M6\.2/);
  const failure = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m6-2-r1/reports/m62-human-failure-record.md"), "utf8");
  assert.match(failure, /HUMAN FAIL \/ CORRECTION REQUIRED/);
  const isolation = readJson("design/photonic-skin/ps-04-m6-2-r1/reports/git-isolation.json");
  assert.equal(isolation.m62Committed, false);
  assert.equal(isolation.m62r1Committed, false);
  assert.equal(isolation.push, false);
  const checkpoint = git(["log", "-1", "--format=%H", "--grep", M61_CHECKPOINT_MESSAGE]);
  assert.equal(git(["rev-parse", "HEAD"]), checkpoint);
  const smoke = readJson("design/photonic-skin/ps-04-m6-2-r1/reports/browser-smoke.json");
  assert.equal(smoke.ok, true);
  assert.equal(smoke.liveOk, true);
  assert.equal(smoke.aboutOk, true);
  assert.equal(smoke.productionHasM62R1Handle, false);
  assert.equal(smoke.reviewHudCount, 1);
  assert.equal(smoke.cleanHudCount, 0);
  const live = readJson("design/photonic-skin/ps-04-m6-2-r1/reports/builder-live-semantics.json");
  assert.equal(live.ok, true);
  assert.equal(live.steps[0].resolved, "master-neutral");
  assert.equal(live.steps[1].resolved, "single-content");
  assert.equal(live.steps[1].requestSource.kind, "in-screen-action");
  assert.equal(live.steps[2].resolved, "complex-gather-content-event");
  assert.equal(live.steps[4].resolved, "complex-gather-content-video");
  assert.equal(live.steps[6].resolved, "complex-drive-content-video");
  assert.equal(live.steps[6].requestSource.kind, "route-settle");
  assert.equal(live.steps[1].magneticSettleRevision, live.steps[4].magneticSettleRevision);
  const about = readJson("design/photonic-skin/ps-04-m6-2-r1/reports/about-brand-wide.json");
  assert.equal(about.ok, true);
  assert.equal(about.direct.family, "BRAND_WIDE");
  assert.ok(Math.abs(about.direct.zoom - 1.24) < 0.03);
  assert.ok(Math.abs(about.mobile.zoom - 1.18) < 0.03);
  const placement = readJson("design/photonic-skin/ps-04-m6-2-r1/reports/placement-coupling.json");
  assert.equal(placement.placementFollows, true);
  assert.equal(placement.placementActorRequestCount, 0);
  assert.equal(placement.placementCompileCount, 0);
  assert.equal(placement.placementQueueDepth, 0);
  assert.ok((placement.postSettlePlacementDeltaPx ?? 0) <= 1);
  const magnetism = readJson("design/photonic-skin/ps-04-m6-2-r1/reports/magnetism-profile.json");
  assert.equal(magnetism.active, "R1_STRONG_BALANCED");
  assert.equal(magnetism.magneticStrengthMonotonic, true);
  assert.equal(magnetism.overshoot, false);
  assert.equal(Number(magnetism.probeAt048vh.magneticStrengthM62), 0);
  assert.ok(Number(magnetism.probeAt048vh.magneticStrengthR1) > 0);
  const rapid = readJson("design/photonic-skin/ps-04-m6-2-r1/reports/rapid-scroll-regression.json");
  assert.equal(rapid.requestsToCrossedNodes, 0);
  assert.equal(rapid.routeCompileLiveRetargetCount, 0);
  assert.ok((rapid.maxActorQueueDepth ?? 0) <= 1);
  assert.equal(rapid.runningMorphInterruptedByScroll, 0);
  assert.equal(rapid.latestSettledWins, true);
  const transition = readJson("design/photonic-skin/ps-04-m6-2-r1/reports/transition-regression.json");
  assert.equal(transition.masterFlash, 0);
  assert.equal(transition.paletteLead, 0);
  assert.equal(transition.centerDwell, 0);
  assert.equal(transition.thirdGeometry, false);
  const production = readJson("design/photonic-skin/ps-04-m6-2-r1/reports/production-isolation.json");
  assert.equal(production.productionHasM62R1Handle, false);
  assert.equal(production.productionRequestsR1, false);
  const footer = readJson("design/photonic-skin/ps-04-m6-2-r1/reports/human-boards.json").find((row: { name: string }) => row.name === "footer-settled");
  assert.equal(footer.settle.magnetizedSettledNodeId, "08");
  assert.equal(footer.composition.actorDraw, false);
  const videos = readJson("design/photonic-skin/ps-04-m6-2-r1/reports/videos.json");
  const names = new Set(videos.map((row: { name: string }) => row.name));
  for (const name of [
    "builder-live-selection",
    "cases-content-placement",
    "merch-team-placement",
    "rapid-placement-stable-geometry",
    "strong-magnetism-wheel",
    "strong-magnetism-touch",
    "reduced-motion",
  ]) {
    assert.equal(names.has(name), true);
    assert.equal(existsSync(path.join(ROOT, "design/photonic-skin/ps-04-m6-2-r1/renders/browser/video", `${name}.webm`)), true);
  }
});
