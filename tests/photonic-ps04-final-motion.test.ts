import assert from "node:assert/strict";
import test from "node:test";
import {
  MagnetizedSettleController,
  type ActorFrameSample,
  type SettleTickInput,
} from "../app/visual-lab/photonic-skin-ps04-m6/magnetized-settle/magnetized-settle-runtime";
import type { ScreenNodeId } from "../app/visual-lab/photonic-skin-ps04-m5/topology";

function releaseController() {
  return new MagnetizedSettleController({
    earlyTransitions: true,
    resolveContract: (nodeId) => ({ nodeId, key: `actor:${nodeId}` }),
  });
}

function frame(nodeId: ScreenNodeId, status: ActorFrameSample["status"], progress = 0): ActorFrameSample {
  return {
    status,
    visualLifecycle: status === "running" ? "morphing" : "settled",
    geometryProgress: progress,
    paletteProgress: progress,
    siteProgress: progress,
    programReady: true,
    visualPublished: true,
    targetNodeId: nodeId,
    endpointKey: `actor:${nodeId}`,
  };
}

function sample(nowMs: number, observedNodeId: ScreenNodeId, extra: Partial<SettleTickInput> = {}): SettleTickInput {
  return {
    nowMs,
    scrollY: 0,
    viewportHeight: 900,
    observedNodeId,
    magneticCandidateId: observedNodeId,
    pendingTarget: null,
    mode: "idle",
    gestureActive: false,
    snapAnimationPending: false,
    layoutRevision: 1,
    distanceToAnchorPx: 0,
    ...extra,
  };
}

test("direct rapid forward and reverse replaces the current morph without queueing", () => {
  const controller = releaseController();
  controller.adoptBoot("01", "actor:01");
  assert.equal(controller.requestDestination("05.3", 10)?.nodeId, "05.3");
  assert.equal(controller.consumeBegin()?.nodeId, "05.3");
  controller.noteActorFrame(frame("05.3", "running", 0.24), 20);
  assert.equal(controller.requestDestination("05.5", 25)?.nodeId, "05.5");
  assert.equal(controller.consumeBegin()?.nodeId, "05.5");
  assert.equal(controller.snapshot().queuedActorNodeId, null);
  controller.noteActorFrame(frame("05.3", "settled"), 27);
  assert.equal(controller.snapshot().actorCommittedNodeId, "05.5");
  assert.equal(controller.snapshot().actorStatus, "morphing");
  assert.equal(controller.requestDestination("05.3", 31)?.nodeId, "05.3");
  assert.equal(controller.consumeBegin()?.nodeId, "05.3");
  assert.equal(controller.snapshot().actorRequestCount, 3);
});

test("wheel launches only the locked magnetic destination before full settle", () => {
  const controller = releaseController();
  controller.adoptBoot("01", "actor:01");
  controller.noteUserInput("wheel", 10);
  controller.tick(sample(12, "05.1", { mode: "user", magneticCandidateId: "05.1", gestureActive: true }));
  controller.tick(sample(20, "05.2", { mode: "user", magneticCandidateId: "05.2", gestureActive: true }));
  assert.equal(controller.consumeBegin(), null);
  controller.tick(sample(30, "05.3", {
    mode: "magnetic", magneticCandidateId: "05.3", pendingTarget: "05.3",
    snapAnimationPending: true, distanceToAnchorPx: 180,
  }));
  controller.tick(sample(62, "05.3", {
    mode: "magnetic", magneticCandidateId: "05.3", pendingTarget: "05.3",
    snapAnimationPending: true, distanceToAnchorPx: 70,
  }));
  assert.equal(controller.consumeBegin()?.nodeId, "05.3");
  assert.notEqual(controller.snapshot().scrollPhase, "Settled");
  assert.equal(controller.snapshot().actorRequestCount, 1);
});

test("direct destination updates in the same input turn", () => {
  const controller = releaseController();
  controller.adoptBoot("01", "actor:01");
  const intent = controller.requestDestination("05.5", 100);
  assert.equal(intent?.atMs, 100);
  assert.equal(intent?.origin, "direct");
  assert.equal(controller.consumeBegin()?.nodeId, "05.5");
});
