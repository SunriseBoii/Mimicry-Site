import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { PALETTE_DELAY_FRACTION } from "../app/visual-lab/photonic-skin-ps04-m5/m5-choreography";
import { MAGNETISM } from "../app/visual-lab/photonic-skin-ps04-m5/scroll-controller";
import { OWNER_SELECTED_PROFILE_ID } from "../app/visual-lab/photonic-skin-ps04-m5/framing";
import type { ScreenNodeId } from "../app/visual-lab/photonic-skin-ps04-m5/topology";
import {
  MagnetizedSettleController,
  magnetizedSettlePredicate,
  type ActorFrameSample,
  type SettleTickInput,
} from "../app/visual-lab/photonic-skin-ps04-m6/magnetized-settle/magnetized-settle-runtime";
import {
  ACTOR_QUEUE_CAPACITY,
  INPUT_QUIET_MS,
  LAYOUT_STABLE_FRAMES,
  MAGNETISM_DURATION_MS,
  SETTLE_STABLE_MS,
  SETTLE_VELOCITY_EPSILON,
  positionEpsilonPx,
} from "../app/visual-lab/photonic-skin-ps04-m6/magnetized-settle/settle-tokens";

const ROOT = process.cwd();
const BRANCH = "ps04-m6-sandbox";
const M61_CHECKPOINT_MESSAGE = "approve project builder Mimic semantics";
const M61_PARENT = "0ea9e67184c1a8a5be9833d6ccd2e41f919f6a9a";
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
  "05.3": "event",
  "05.4": "games",
  "05.5": "video",
  "05.6": "digital",
  "05.7": "merch",
  "06.1": "studio-a",
  "06.2": "studio-b",
  "06.3": "studio-c",
  "07": "contact",
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

function preparingFrame(node: ScreenNodeId, key: string): ActorFrameSample {
  return {
    status: "running",
    visualLifecycle: "preparing",
    geometryProgress: 0,
    paletteProgress: 0,
    siteProgress: 0,
    programReady: false,
    visualPublished: false,
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

test("M6.1 checkpoint is the M6.2 baseline and magnetism tokens stay frozen", () => {
  assert.equal(git(["branch", "--show-current"]), BRANCH);
  const checkpoint = git(["log", "-1", "--format=%H", "--grep", M61_CHECKPOINT_MESSAGE]);
  execFileSync("git", ["merge-base", "--is-ancestor", checkpoint, "HEAD"], { cwd: ROOT });
  assert.equal(git(["rev-parse", `${checkpoint}^`]), M61_PARENT);
  assert.equal(git(["log", "--oneline", "--grep", M61_CHECKPOINT_MESSAGE]).split(/\r?\n/).filter(Boolean).length, 1);
  const m61 = readJson("design/photonic-skin/ps-04-m6-1/manifest.json");
  assert.equal(m61.approvedFor, "PS-04.M6.2");
  assert.equal(m61.productionDeployApproval, false);
  assert.equal(m61.humanPass, true);
  assert.equal(MAGNETISM_DURATION_MS, 340);
  assert.equal(MAGNETISM.snapDurationMs, MAGNETISM_DURATION_MS);
  assert.equal(PALETTE_DELAY_FRACTION, 0.06);
  assert.equal(OWNER_SELECTED_PROFILE_ID, "OWNER_SELECTED_124_111_111");
  assert.equal(ACTOR_QUEUE_CAPACITY, 1);
  assert.equal(LAYOUT_STABLE_FRAMES, 2);
  assert.ok(positionEpsilonPx(900) >= MAGNETISM.noopDistancePx);
  execFileSync("git", ["diff", "--exit-code", checkpoint, "--", ...FROZEN_PRODUCTION], { cwd: ROOT });
});

test("settle predicate requires every condition", () => {
  const ok = {
    candidateNodeId: "02" as ScreenNodeId,
    magneticDestinationNodeId: "02" as ScreenNodeId,
    candidateStableForMs: SETTLE_STABLE_MS,
    distanceToAnchorPx: 0,
    viewportHeight: 900,
    scrollVelocityVhPerSecond: 0,
    gestureActive: false,
    inputQuietForMs: INPUT_QUIET_MS,
    layoutRevisionStable: true,
    snapAnimationPending: false,
  };
  assert.equal(magnetizedSettlePredicate(ok).settled, true);
  assert.equal(magnetizedSettlePredicate({ ...ok, candidateNodeId: null }).settled, false);
  assert.equal(magnetizedSettlePredicate({ ...ok, magneticDestinationNodeId: "03.1" }).settled, false);
  assert.equal(magnetizedSettlePredicate({ ...ok, candidateStableForMs: SETTLE_STABLE_MS - 1 }).settled, false);
  assert.equal(magnetizedSettlePredicate({ ...ok, distanceToAnchorPx: positionEpsilonPx(900) + 0.5 }).settled, false);
  assert.equal(magnetizedSettlePredicate({ ...ok, scrollVelocityVhPerSecond: SETTLE_VELOCITY_EPSILON + 0.01 }).settled, false);
  assert.equal(magnetizedSettlePredicate({ ...ok, gestureActive: true }).settled, false);
  assert.equal(magnetizedSettlePredicate({ ...ok, inputQuietForMs: INPUT_QUIET_MS - 1 }).settled, false);
  assert.equal(magnetizedSettlePredicate({ ...ok, layoutRevisionStable: false }).settled, false);
  assert.equal(magnetizedSettlePredicate({ ...ok, snapAnimationPending: true }).settled, false);
  assert.equal(magnetizedSettlePredicate({ ...ok, distanceToAnchorPx: MAGNETISM.noopDistancePx }).settled, true);
});

test("candidate and magnetic destination do not create actor requests", () => {
  const runtime = controller();
  runtime.adoptBoot("01", "hero");
  let now = 16;
  for (const node of ["02", "03.1", "03.2"] as ScreenNodeId[]) {
    runtime.noteUserInput("wheel", now);
    runtime.tick(tickInput({
      nowMs: now,
      observedNodeId: node,
      magneticCandidateId: node,
      pendingTarget: "04",
      mode: "user",
      gestureActive: true,
      distanceToAnchorPx: 40,
    }));
    const { begin } = drain(runtime);
    assert.equal(begin, null);
    now += 16;
  }
  runtime.tick(tickInput({
    nowMs: now,
    observedNodeId: "03.2",
    magneticCandidateId: "03.2",
    pendingTarget: "04",
    mode: "magnetic",
    snapAnimationPending: true,
    distanceToAnchorPx: 12,
  }));
  assert.equal(drain(runtime).begin, null);
  const snap = runtime.snapshot(now);
  assert.equal(snap.actorRequestCount, 0);
  assert.ok(snap.ignoredCandidateCount >= 2);
  assert.equal(snap.requestsToCrossedNodes, 0);
});

test("new input resets the candidate stable window", () => {
  const runtime = controller();
  runtime.adoptBoot("01", "hero");
  let now = hold(runtime, "01", 8, 80);
  runtime.noteUserInput("wheel", now);
  runtime.tick(tickInput({
    nowMs: now + 8,
    observedNodeId: "02",
    magneticCandidateId: "02",
    mode: "user",
    gestureActive: false,
    distanceToAnchorPx: 0,
  }));
  const snap = runtime.snapshot(now + 8);
  assert.ok(snap.candidateStableForMs < SETTLE_STABLE_MS);
  assert.equal(snap.scrollPhase, "Traversing");
});

test("same semantic contract is a no-op even when node id differs", () => {
  const runtime = controller({ ...KEYS, "03.3": "builder-draft", "03.2": "builder-draft" });
  runtime.adoptBoot("03.2", "builder-draft");
  const now = settle(runtime, "03.3", 20);
  assert.equal(runtime.consumeBegin(), null);
  assert.equal(runtime.snapshot(now).actorRequestCount, 0);
  assert.equal(runtime.snapshot(now).magnetizedSettledNodeId, "03.3");
  assert.equal(runtime.snapshot(now).actorCommittedNodeId, "03.2");
});

test("queue capacity is one and newest settled target replaces the previous", () => {
  const runtime = controller();
  runtime.adoptBoot("01", "hero");
  let now = settle(runtime, "02", 20);
  const first = drain(runtime).begin;
  assert.equal(first?.nodeId, "02");
  runtime.noteActorFrame(morphingFrame("02", "about"), now);
  now = settle(runtime, "03.1", now + 8);
  assert.equal(runtime.snapshot(now).queuedActorNodeId, "03.1");
  now = settle(runtime, "05.1", now + 8);
  const snap = runtime.snapshot(now);
  assert.equal(snap.queuedActorNodeId, "05.1");
  assert.equal(snap.maxActorQueueDepth, 1);
  assert.equal(snap.actorRequestCount, 1);
  runtime.noteActorFrame(settledFrame("02", "about"), now + 8);
  const queued = drain(runtime).begin;
  assert.equal(queued?.nodeId, "05.1");
  assert.equal(queued?.origin, "queued");
  assert.equal(runtime.snapshot(now + 8).queuedActorNodeId, null);
});

test("queue is invalidated by new scroll and does not start stale targets", () => {
  const runtime = controller();
  runtime.adoptBoot("01", "hero");
  let now = settle(runtime, "02", 20);
  drain(runtime);
  runtime.noteActorFrame(morphingFrame("02", "about"), now);
  now = settle(runtime, "03.1", now + 8);
  assert.equal(runtime.snapshot(now).queuedActorNodeId, "03.1");
  runtime.noteUserInput("wheel", now + 8);
  runtime.tick(tickInput({
    nowMs: now + 16,
    observedNodeId: "03.2",
    magneticCandidateId: "03.2",
    mode: "user",
    gestureActive: true,
    distanceToAnchorPx: 30,
  }));
  assert.equal(runtime.snapshot(now + 16).queuedActorNodeId, null);
  runtime.noteActorFrame(settledFrame("02", "about"), now + 24);
  assert.equal(drain(runtime).begin, null);
  assert.equal(runtime.snapshot(now + 24).staleQueuedTransitionStarts, 0);
  assert.equal(runtime.snapshot(now + 24).runningMorphInterruptedByScroll, 0);
});

test("preparing without visual progress cancels; visible morph is not interrupted", () => {
  const runtime = controller();
  runtime.adoptBoot("01", "hero");
  let now = settle(runtime, "02", 20);
  assert.equal(drain(runtime).begin?.nodeId, "02");
  runtime.noteActorFrame(preparingFrame("02", "about"), now);
  runtime.noteUserInput("wheel", now + 8);
  assert.equal(drain(runtime).cancel, true);
  assert.equal(runtime.snapshot(now + 8).cancelledBeforeVisualStartCount, 1);
  assert.equal(runtime.snapshot(now + 8).actorStatus, "settled");
  assert.equal(runtime.snapshot(now + 8).actorCommittedNodeId, "01");

  now = settle(runtime, "03.1", now + 16);
  assert.equal(drain(runtime).begin?.nodeId, "03.1");
  runtime.noteActorFrame(morphingFrame("03.1", "builder-master"), now);
  runtime.noteUserInput("wheel", now + 8);
  assert.equal(drain(runtime).cancel, false);
  assert.equal(runtime.snapshot(now + 8).actorStatus, "morphing");
  assert.equal(runtime.snapshot(now + 8).runningMorphInterruptedByScroll, 0);
});

test("rapid crossed screens request only the final magnetized settle", () => {
  const runtime = controller();
  runtime.adoptBoot("01", "hero");
  const crossed: ScreenNodeId[] = ["02", "03.1", "03.2", "03.3", "04", "05.1", "05.2", "05.3", "05.4", "05.5"];
  let now = 16;
  const begins: string[] = [];
  for (const node of crossed.slice(0, -1)) {
    runtime.noteUserInput("wheel", now);
    runtime.tick(tickInput({
      nowMs: now,
      observedNodeId: node,
      magneticCandidateId: node,
      mode: "user",
      gestureActive: true,
      distanceToAnchorPx: 80,
    }));
    const { begin } = drain(runtime);
    if (begin) begins.push(begin.nodeId);
    now += 12;
  }
  now = settle(runtime, crossed[crossed.length - 1], now, { mode: "idle" });
  const last = drain(runtime).begin;
  if (last) begins.push(last.nodeId);
  const snap = runtime.snapshot(now);
  assert.deepEqual(begins, ["05.5"]);
  assert.equal(snap.actorRequestCount, 1);
  assert.equal(snap.requestsToCrossedNodes, 0);
  assert.equal(snap.compileLiveRetargetCount, 0);
  assert.equal(snap.maxActorQueueDepth, 0);
  assert.ok(snap.ignoredCandidateCount >= 3);
});

test("in-screen action works on settled host and is ignored while unsettled", () => {
  const runtime = controller({ ...KEYS, "03.2": "gather-event" });
  runtime.adoptBoot("03.1", "builder-master");
  let now = settle(runtime, "03.2", 20);
  drain(runtime);
  runtime.noteActorFrame(settledFrame("03.2", "gather-event"), now);
  runtime.setResolveContract((nodeId) => ({ nodeId, key: nodeId === "03.2" ? "gather-event-video" : KEYS[nodeId] ?? nodeId }));
  const clicked = runtime.requestInScreenAction("03.2", now + 8);
  assert.equal(clicked?.origin, "in-screen");
  assert.equal(clicked?.nodeId, "03.2");
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

test("resize and layout revision do not create a semantic actor request", () => {
  const runtime = controller();
  runtime.adoptBoot("02", "about");
  runtime.noteLayoutRevision(2, 40);
  runtime.tick(tickInput({
    nowMs: 48,
    observedNodeId: "02",
    layoutRevision: 2,
    distanceToAnchorPx: 0,
  }));
  assert.equal(drain(runtime).begin, null);
  const now = settle(runtime, "02", 56, { layoutRevision: 2 });
  assert.equal(drain(runtime).begin, null);
  assert.equal(runtime.snapshot(now).actorRequestCount, 0);
});

test("reduced motion still uses the settle predicate and stays atomic at request time", () => {
  const runtime = controller();
  runtime.adoptBoot("01", "hero");
  runtime.tick(tickInput({
    nowMs: 24,
    observedNodeId: "08",
    magneticCandidateId: "08",
    mode: "user",
    gestureActive: true,
    reducedMotion: true,
    distanceToAnchorPx: 20,
  }));
  assert.equal(drain(runtime).begin, null);
  const now = settle(runtime, "08", 40, { reducedMotion: true });
  const begin = drain(runtime).begin;
  assert.equal(begin?.nodeId, "08");
  runtime.noteActorFrame(settledFrame("08", "footer-exit"), now);
  assert.equal(runtime.snapshot(now).actorStatus, "settled");
  assert.equal(runtime.snapshot(now).maxActorQueueDepth, 0);
});

test("stale settle revision cannot start a queued transition", () => {
  const runtime = controller();
  runtime.adoptBoot("01", "hero");
  let now = settle(runtime, "02", 20);
  drain(runtime);
  runtime.noteActorFrame(morphingFrame("02", "about"), now);
  now = settle(runtime, "04", now + 8);
  assert.equal(runtime.snapshot(now).queuedActorNodeId, "04");
  runtime.noteUserInput("wheel", now + 8);
  now = settle(runtime, "05.1", now + 16);
  assert.equal(runtime.snapshot(now).queuedActorNodeId, "05.1");
  runtime.noteActorFrame(settledFrame("02", "about"), now + 8);
  const begin = drain(runtime).begin;
  assert.equal(begin?.nodeId, "05.1");
  assert.equal(runtime.snapshot(now + 8).staleQueuedTransitionStarts, 0);
});

test("production files, M6.1 semantics lab, and frozen payload stay isolated", () => {
  const home = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
  const client = readFileSync(path.join(ROOT, "app/_photonic-skin/ProductionPhotonicSiteClient.tsx"), "utf8");
  const runtime = readFileSync(path.join(ROOT, "app/_photonic-skin/runtime.ts"), "utf8");
  const choreography = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/m5-choreography.ts"), "utf8");
  for (const text of [home, client, runtime]) {
    assert.doesNotMatch(text, /ps-04-m6-2/);
    assert.doesNotMatch(text, /magnetized-settle/);
    assert.doesNotMatch(text, /__PS04M62_LAB__/);
  }
  assert.match(home, /ProductionPhotonicSiteClient/);
  assert.match(choreography, /PALETTE_DELAY_FRACTION = 0\.06/);
  const clean = path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle/page.tsx");
  const review = path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle/review/page.tsx");
  const lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle/MagnetizedSettleLab.tsx"), "utf8");
  assert.match(readFileSync(clean, "utf8"), /mode="preview"/);
  assert.match(readFileSync(review, "utf8"), /mode="lab"/);
  assert.match(lab, /MagnetizedSettleHud/);
  assert.match(lab, /__PS04M62_LAB__/);
  assert.doesNotMatch(lab, /compileLiveRetarget\(/);
  assert.match(lab, /adoptBoot/);
  const m61Lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/ProjectBuilderLab.tsx"), "utf8");
  assert.match(m61Lab, /__PS04M61_LAB__/);
  assert.doesNotMatch(m61Lab, /__PS04M62_LAB__/);
});

test("M6.2 packet is machine pass only and hard gates stay closed", () => {
  const manifest = readJson("design/photonic-skin/ps-04-m6-2/manifest.json");
  assert.equal(manifest.status, "PS-04.M6.2 — MACHINE PASS / HUMAN MAGNETIZED-SETTLE MOTION REVIEW REQUIRED");
  assert.equal(manifest.humanPass, false);
  assert.equal(manifest.productionReady, false);
  assert.equal(manifest.productionDeployApproval, false);
  assert.equal(manifest.commitCreated, false);
  assert.equal(manifest.push, false);
  assert.equal(manifest.deploy, false);
  assert.equal(manifest.m63Started, false);
  assert.equal(manifest.magnetismDurationMs, 340);
  const approval = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m6-2/reports/approval-report.md"), "utf8");
  assert.match(approval, /HUMAN MAGNETIZED-SETTLE MOTION REVIEW REQUIRED/);
  assert.doesNotMatch(approval, /HUMAN PASS \/ MAGNETIZED/);
  const isolation = readJson("design/photonic-skin/ps-04-m6-2/reports/git-isolation.json");
  assert.equal(isolation.m62Committed, false);
  assert.equal(isolation.push, false);
  const checkpoint = git(["log", "-1", "--format=%H", "--grep", M61_CHECKPOINT_MESSAGE]);
  assert.equal(git(["rev-parse", "HEAD"]), checkpoint);
  const smoke = readJson("design/photonic-skin/ps-04-m6-2/reports/browser-smoke.json");
  assert.equal(smoke.ok, true);
  assert.equal(smoke.productionHasM62Handle, false);
  assert.equal(smoke.reviewHudCount, 1);
  assert.equal(smoke.cleanHudCount, 0);
  const rapid = readJson("design/photonic-skin/ps-04-m6-2/reports/rapid-scroll-regression.json");
  assert.equal(rapid.requestsToCrossedNodes, 0);
  assert.equal(rapid.routeCompileLiveRetargetCount, 0);
  assert.ok((rapid.maxActorQueueDepth ?? 0) <= 1);
  assert.equal(rapid.latestSettledWins, true);
  const gates = readJson("design/photonic-skin/ps-04-m6-2/reports/actor-request-trace.json").gates;
  assert.equal(gates.requestsToCrossedNodes, 0);
  assert.ok((gates.maxActorQueueDepth ?? 0) <= 1);
  assert.equal(gates.routeCompileLiveRetargetCount, 0);
  assert.equal(gates.staleQueuedTransitionStarts, 0);
  assert.equal(gates.runningMorphInterruptedByScroll, 0);
  const transition = readJson("design/photonic-skin/ps-04-m6-2/reports/transition-regression.json");
  assert.equal(transition.masterFlash, 0);
  assert.equal(transition.paletteLead, 0);
  assert.equal(transition.centerDwell, 0);
  assert.equal(transition.thirdGeometry, false);
  assert.equal(transition.emptyActorFrame, 0);
  const footer = readJson("design/photonic-skin/ps-04-m6-2/reports/human-boards.json").find((row: { name: string }) => row.name === "footer-settled");
  assert.equal(footer.settle.magnetizedSettledNodeId, "08");
  assert.equal(footer.settle.scrollPhase, "Settled");
  assert.equal(footer.settle.queuedActorNodeId, "08");
  assert.equal(footer.settle.maxActorQueueDepth, 1);
  const drive = readJson("design/photonic-skin/ps-04-m6-2/reports/human-boards.json").find((row: { name: string }) => row.name === "builder-03-3-drive");
  assert.equal(drive.resolved, "complex-drive-event-video");
  assert.equal(drive.settle.magnetizedSettledNodeId, "03.3");
});
