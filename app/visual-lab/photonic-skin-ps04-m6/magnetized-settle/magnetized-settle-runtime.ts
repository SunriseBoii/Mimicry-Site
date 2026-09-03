/**
 * PS-04.M6.2 settle-gated actor request policy.
 * Scroll magnetism and Mimic actor commits are two machines. Candidate,
 * magnetic destination, and pending restore never become actor targets.
 */

import type { ScreenNodeId } from "../../photonic-skin-ps04-m5/topology";
import type { ScrollMode, UserInputKind } from "../../photonic-skin-ps04-m5/scroll-controller";
import {
  ACTOR_QUEUE_CAPACITY,
  INPUT_QUIET_MS,
  LAYOUT_STABLE_FRAMES,
  SETTLE_STABLE_MS,
  SETTLE_VELOCITY_EPSILON,
  positionEpsilonPx,
} from "./settle-tokens";

export type ScrollPhase = "Settled" | "Traversing" | "Snapping" | "Verifying";
export type ActorMachineStatus = "settled" | "preparing" | "morphing";
export type SettleHint = "scrollend" | "scrollsnapchanging" | "scrollsnapchange";
export type ActorRequestOrigin = "settle" | "queued" | "in-screen" | "boot";
export type ActorRequestSource =
  | { kind: "route-settle"; nodeId: ScreenNodeId; magneticSettleRevision: number }
  | { kind: "in-screen-action"; hostNodeId: ScreenNodeId; interactionRevision: number };

export interface SemanticContractRef {
  nodeId: ScreenNodeId;
  key: string;
}

export interface MagneticSettleCommit {
  nodeId: ScreenNodeId;
  revision: number;
  atMs: number;
}

export interface QueuedActorTarget {
  nodeId: ScreenNodeId;
  semanticContractKey: string;
  magneticSettleRevision: number;
  queuedAt: number;
}

export interface ActorRequestIntent {
  nodeId: ScreenNodeId;
  semanticContractKey: string;
  magneticSettleRevision: number;
  origin: ActorRequestOrigin;
  source: ActorRequestSource;
  atMs: number;
}

export interface PrewarmHint {
  nodeId: ScreenNodeId;
  semanticContractKey: string;
  atMs: number;
}

export interface ActorFrameSample {
  status: "running" | "settled" | "interrupted" | "cancelled";
  visualLifecycle: string;
  geometryProgress: number;
  paletteProgress: number;
  siteProgress: number;
  programReady: boolean;
  visualPublished: boolean;
  targetNodeId: ScreenNodeId | "none";
  endpointKey: string;
}

export interface SettleTickInput {
  nowMs: number;
  scrollY: number;
  viewportHeight: number;
  observedNodeId: ScreenNodeId;
  magneticCandidateId: ScreenNodeId | null;
  pendingTarget: ScreenNodeId | null;
  mode: ScrollMode;
  gestureActive: boolean;
  snapAnimationPending: boolean;
  layoutRevision: number;
  distanceToAnchorPx?: number;
  reducedMotion?: boolean;
}

export interface MagnetizedSettleTelemetry {
  scrollPhase: ScrollPhase;
  observedNodeId: ScreenNodeId | null;
  snapCandidateNodeId: ScreenNodeId | null;
  magneticDestinationNodeId: ScreenNodeId | null;
  magnetizedSettledNodeId: ScreenNodeId | null;
  magneticSettleRevision: number;
  distanceToAnchorPx: number;
  scrollVelocityVhPerSecond: number;
  gestureActive: boolean;
  inputQuietForMs: number;
  candidateStableForMs: number;
  layoutRevision: number;
  layoutRevisionStable: boolean;
  actorStatus: ActorMachineStatus;
  actorVisualStarted: boolean;
  actorCommittedNodeId: ScreenNodeId | null;
  actorEndpointKey: string;
  queuedActorNodeId: ScreenNodeId | null;
  queuedSettleRevision: number | null;
  actorRequestSource: ActorRequestSource | null;
  interactionRevision: number;
  lastAppliedInteractionRevision: number;
  actorRequestCount: number;
  cancelledBeforeVisualStartCount: number;
  ignoredCandidateCount: number;
  compileLiveRetargetCount: number;
  requestsToCrossedNodes: number;
  maxActorQueueDepth: number;
  staleQueuedTransitionStarts: number;
  runningMorphInterruptedByScroll: number;
  lastSettleAtMs: number;
  lastRequestAtMs: number;
  lastHint: SettleHint | null;
}

export interface PredicateInput {
  candidateNodeId: ScreenNodeId | null;
  magneticDestinationNodeId: ScreenNodeId | null;
  candidateStableForMs: number;
  distanceToAnchorPx: number;
  viewportHeight: number;
  scrollVelocityVhPerSecond: number;
  gestureActive: boolean;
  inputQuietForMs: number;
  layoutRevisionStable: boolean;
  snapAnimationPending: boolean;
}

export function magnetizedSettlePredicate(input: PredicateInput) {
  const failed: string[] = [];
  if (input.candidateNodeId == null) failed.push("candidate");
  if (input.magneticDestinationNodeId == null) failed.push("destination");
  if (
    input.candidateNodeId == null
    || input.magneticDestinationNodeId == null
    || input.candidateNodeId !== input.magneticDestinationNodeId
  ) {
    failed.push("candidate-matches-destination");
  }
  if (input.candidateStableForMs < SETTLE_STABLE_MS) failed.push("candidate-stable");
  if (input.distanceToAnchorPx > positionEpsilonPx(input.viewportHeight)) failed.push("position");
  if (Math.abs(input.scrollVelocityVhPerSecond) > SETTLE_VELOCITY_EPSILON) failed.push("velocity");
  if (input.gestureActive) failed.push("gesture");
  if (input.inputQuietForMs < INPUT_QUIET_MS) failed.push("input-quiet");
  if (!input.layoutRevisionStable) failed.push("layout");
  if (input.snapAnimationPending) failed.push("snap-pending");
  return { settled: failed.length === 0, failed };
}

export function actorVisualStartedFromFrame(frame: Pick<ActorFrameSample, "visualLifecycle" | "geometryProgress" | "paletteProgress" | "siteProgress" | "visualPublished" | "status">) {
  if (frame.status !== "running") return false;
  if (frame.visualLifecycle === "morphing" || frame.visualLifecycle === "settling") return true;
  if (frame.geometryProgress > 0 || frame.paletteProgress > 0 || frame.siteProgress > 0) return true;
  return frame.visualPublished === true && frame.visualLifecycle !== "preparing";
}

function sameNode(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left === right);
}

export class MagnetizedSettleController {
  private nowFn: () => number;
  private resolveContract: (nodeId: ScreenNodeId) => SemanticContractRef | null;

  private phase: ScrollPhase = "Settled";
  private observedNodeId: ScreenNodeId | null = null;
  private snapCandidateNodeId: ScreenNodeId | null = null;
  private magneticDestinationNodeId: ScreenNodeId | null = null;
  private magnetizedSettledNodeId: ScreenNodeId | null = null;
  private magneticSettleRevision = 0;
  private lastY = 0;
  private lastTickAt = 0;
  private velocityVh = 0;
  private distanceToAnchorPx = 0;
  private lastInputAt = Number.NEGATIVE_INFINITY;
  private candidateSince = 0;
  private layoutRevision = 0;
  private layoutStableFrames = 0;
  private lastLayoutAt = 0;
  private gestureActive = false;
  private snapAnimationPending = false;
  private lastHint: SettleHint | null = null;
  private snapHintId: ScreenNodeId | null = null;
  private lastDestination: ScreenNodeId | null = null;
  private lastSettleAt = 0;
  private publishedSettleRevision = 0;

  private actorStatus: ActorMachineStatus = "settled";
  private actorVisualStarted = false;
  private actorCommittedNodeId: ScreenNodeId | null = null;
  private actorEndpointKey = "";
  private queued: QueuedActorTarget | null = null;
  private pendingBegin: ActorRequestIntent | null = null;
  private pendingCancel = false;
  private pendingPrewarm: PrewarmHint | null = null;
  private lastPrewarmNode: ScreenNodeId | null = null;

  private actorRequestCount = 0;
  private cancelledBeforeVisualStartCount = 0;
  private ignoredCandidateCount = 0;
  private compileLiveRetargetCount = 0;
  private requestsToCrossedNodes = 0;
  private maxActorQueueDepth = 0;
  private staleQueuedTransitionStarts = 0;
  private runningMorphInterruptedByScroll = 0;
  private lastRequestAt = 0;
  private lastRequestSource: ActorRequestSource | null = null;
  private interactionRevision = 0;
  private lastAppliedInteractionRevision = 0;
  private lastViewportHeight = 900;
  private lastIgnoredCandidate: ScreenNodeId | null = null;
  private preparingRevision = 0;
  private previousCommittedNodeId: ScreenNodeId | null = null;
  private previousEndpointKey = "";

  constructor(args: {
    now?: () => number;
    resolveContract?: (nodeId: ScreenNodeId) => SemanticContractRef | null;
  } = {}) {
    this.nowFn = args.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.resolveContract = args.resolveContract ?? ((nodeId) => ({ nodeId, key: nodeId }));
  }

  setResolveContract(resolve: (nodeId: ScreenNodeId) => SemanticContractRef | null) {
    this.resolveContract = resolve;
  }

  needsClock() {
    return this.phase !== "Settled" || this.actorStatus !== "settled" || this.queued != null;
  }

  noteUserInput(kind: UserInputKind | "api" | "graph", nowMs = this.nowFn()) {
    this.lastInputAt = nowMs;
    if (kind === "pointer" || kind === "touch") this.gestureActive = true;
    this.onScrollActivity(nowMs);
  }

  noteGesture(active: boolean, nowMs = this.nowFn()) {
    this.gestureActive = active;
    if (active) {
      this.lastInputAt = nowMs;
      this.onScrollActivity(nowMs);
    }
  }

  noteHint(kind: SettleHint, nodeId?: ScreenNodeId | null, nowMs = this.nowFn()) {
    this.lastHint = kind;
    if (kind === "scrollend") {
      this.gestureActive = false;
      return;
    }
    if (kind === "scrollsnapchanging" && nodeId) {
      this.snapHintId = nodeId;
      this.emitPrewarm(nodeId, nowMs);
      return;
    }
    if (kind === "scrollsnapchange" && nodeId) {
      this.snapHintId = nodeId;
    }
  }

  noteLayoutRevision(revision: number, nowMs = this.nowFn()) {
    if (revision === this.layoutRevision) return;
    this.layoutRevision = revision;
    this.lastLayoutAt = nowMs;
    this.layoutStableFrames = 0;
    this.candidateSince = nowMs;
  }

  noteCompileLiveRetarget() {
    this.compileLiveRetargetCount += 1;
  }

  adoptBoot(nodeId: ScreenNodeId, key: string) {
    this.actorCommittedNodeId = nodeId;
    this.actorEndpointKey = key;
    this.actorStatus = "settled";
    this.actorVisualStarted = false;
    this.observedNodeId = nodeId;
    this.snapCandidateNodeId = nodeId;
    this.magneticDestinationNodeId = nodeId;
    this.lastDestination = nodeId;
    this.magnetizedSettledNodeId = nodeId;
    this.phase = "Settled";
    this.magneticSettleRevision = Math.max(1, this.magneticSettleRevision);
    this.publishedSettleRevision = this.magneticSettleRevision;
  }

  consumeBegin(): ActorRequestIntent | null {
    const intent = this.pendingBegin;
    this.pendingBegin = null;
    return intent;
  }

  consumeCancel(): boolean {
    const cancel = this.pendingCancel;
    this.pendingCancel = false;
    return cancel;
  }

  consumePrewarm(): PrewarmHint | null {
    const hint = this.pendingPrewarm;
    this.pendingPrewarm = null;
    return hint;
  }

  requestInScreenAction(hostNodeId: ScreenNodeId, nowMs = this.nowFn()): ActorRequestIntent | null {
    if (!sameNode(this.magnetizedSettledNodeId, hostNodeId)) return null;
    // DOM pointer/keyboard on the settled host marks the scroll machine
    // Traversing without moving scrollY. Only real displacement blocks.
    if (this.phase !== "Settled" && !this.hostStillAnchored()) return null;
    const contract = this.resolveContract(hostNodeId);
    if (!contract) return null;
    if (contract.key === this.actorEndpointKey) return null;
    if (this.actorStatus === "preparing" && !this.actorVisualStarted) this.cancelPreparing(nowMs);
    this.interactionRevision += 1;
    const intent = this.beginActorTransition(contract, this.magneticSettleRevision, "in-screen", nowMs);
    if (!intent) {
      this.interactionRevision -= 1;
      return null;
    }
    this.lastAppliedInteractionRevision = this.interactionRevision;
    return intent;
  }

  noteActorFrame(frame: ActorFrameSample, nowMs = this.nowFn()) {
    this.actorEndpointKey = frame.endpointKey || this.actorEndpointKey;
    if (frame.status === "settled") {
      const wasRunning = this.actorStatus !== "settled";
      this.actorVisualStarted = false;
      this.actorStatus = "settled";
      this.preparingRevision = 0;
      if (frame.targetNodeId !== "none") this.actorCommittedNodeId = frame.targetNodeId;
      if (wasRunning) this.onActorSettled(nowMs);
      return;
    }
    if (this.actorStatus === "settled" && frame.status === "running") {
      this.actorStatus = actorVisualStartedFromFrame(frame) ? "morphing" : "preparing";
    }
    if (this.actorStatus === "preparing" && actorVisualStartedFromFrame(frame)) {
      this.actorStatus = "morphing";
      this.actorVisualStarted = true;
    }
    if (this.actorStatus === "morphing") this.actorVisualStarted = true;
  }

  tick(input: SettleTickInput): MagnetizedSettleTelemetry {
    const now = input.nowMs;
    const vh = Math.max(1, input.viewportHeight);
    this.lastViewportHeight = vh;
    const dt = this.lastTickAt > 0 ? Math.max(1, now - this.lastTickAt) : 16;
    if (this.lastTickAt > 0) {
      this.velocityVh = ((input.scrollY - this.lastY) / dt) * (1000 / vh);
    } else {
      this.velocityVh = 0;
    }
    this.lastY = input.scrollY;
    this.lastTickAt = now;
    this.snapAnimationPending = input.snapAnimationPending;
    this.gestureActive = input.gestureActive;
    this.observedNodeId = input.observedNodeId;
    if (input.mode === "user" && this.phase !== "Traversing") {
      this.onScrollActivity(now);
    }

    if (input.layoutRevision !== this.layoutRevision) {
      this.noteLayoutRevision(input.layoutRevision, now);
    } else {
      this.layoutStableFrames += 1;
    }

    const destination = this.resolveDestination(input);
    this.magneticDestinationNodeId = destination;
    const candidate = this.resolveCandidate(input, destination);
    if (candidate !== this.snapCandidateNodeId) {
      if (this.snapCandidateNodeId && this.phase !== "Settled") {
        this.ignoreCandidate(this.snapCandidateNodeId);
      }
      this.snapCandidateNodeId = candidate;
      this.candidateSince = now;
      this.emitPrewarm(candidate, now);
    }

    const layoutStable = this.layoutStableFrames >= LAYOUT_STABLE_FRAMES;
    const inputQuiet = this.lastInputAt === Number.NEGATIVE_INFINITY ? INPUT_QUIET_MS : Math.max(0, now - this.lastInputAt);
    const candidateStable = candidate ? Math.max(0, now - this.candidateSince) : 0;
    this.distanceToAnchorPx = input.distanceToAnchorPx ?? this.inferDistance(input, destination);

    const predicate = magnetizedSettlePredicate({
      candidateNodeId: candidate,
      magneticDestinationNodeId: destination,
      candidateStableForMs: candidateStable,
      distanceToAnchorPx: this.distanceToAnchorPx,
      viewportHeight: vh,
      scrollVelocityVhPerSecond: this.velocityVh,
      gestureActive: this.gestureActive,
      inputQuietForMs: inputQuiet,
      layoutRevisionStable: layoutStable,
      snapAnimationPending: this.snapAnimationPending,
    });

    this.phase = this.resolvePhase(input, predicate.settled);

    if (predicate.settled && candidate) {
      this.commitSettle(candidate, now);
    }

    return this.snapshot(now);
  }

  snapshot(nowMs = this.nowFn()): MagnetizedSettleTelemetry {
    const inputQuiet = this.lastInputAt === Number.NEGATIVE_INFINITY ? INPUT_QUIET_MS : Math.max(0, nowMs - this.lastInputAt);
    const candidateStable = this.snapCandidateNodeId ? Math.max(0, nowMs - this.candidateSince) : 0;
    return {
      scrollPhase: this.phase,
      observedNodeId: this.observedNodeId,
      snapCandidateNodeId: this.snapCandidateNodeId,
      magneticDestinationNodeId: this.magneticDestinationNodeId,
      magnetizedSettledNodeId: this.magnetizedSettledNodeId,
      magneticSettleRevision: this.magneticSettleRevision,
      distanceToAnchorPx: this.distanceToAnchorPx,
      scrollVelocityVhPerSecond: this.velocityVh,
      gestureActive: this.gestureActive,
      inputQuietForMs: inputQuiet,
      candidateStableForMs: candidateStable,
      layoutRevision: this.layoutRevision,
      layoutRevisionStable: this.layoutStableFrames >= LAYOUT_STABLE_FRAMES,
      actorStatus: this.actorStatus,
      actorVisualStarted: this.actorVisualStarted,
      actorCommittedNodeId: this.actorCommittedNodeId,
      actorEndpointKey: this.actorEndpointKey,
      queuedActorNodeId: this.queued?.nodeId ?? null,
      queuedSettleRevision: this.queued?.magneticSettleRevision ?? null,
      actorRequestSource: this.lastRequestSource,
      interactionRevision: this.interactionRevision,
      lastAppliedInteractionRevision: this.lastAppliedInteractionRevision,
      actorRequestCount: this.actorRequestCount,
      cancelledBeforeVisualStartCount: this.cancelledBeforeVisualStartCount,
      ignoredCandidateCount: this.ignoredCandidateCount,
      compileLiveRetargetCount: this.compileLiveRetargetCount,
      requestsToCrossedNodes: this.requestsToCrossedNodes,
      maxActorQueueDepth: this.maxActorQueueDepth,
      staleQueuedTransitionStarts: this.staleQueuedTransitionStarts,
      runningMorphInterruptedByScroll: this.runningMorphInterruptedByScroll,
      lastSettleAtMs: this.lastSettleAt,
      lastRequestAtMs: this.lastRequestAt,
      lastHint: this.lastHint,
    };
  }

  private hostStillAnchored() {
    return Math.abs(this.velocityVh) <= SETTLE_VELOCITY_EPSILON
      && this.distanceToAnchorPx <= positionEpsilonPx(this.lastViewportHeight);
  }

  private inferDistance(input: SettleTickInput, destination: ScreenNodeId | null) {
    if (!destination) return Number.POSITIVE_INFINITY;
    if (input.snapAnimationPending || input.mode === "user" || input.gestureActive) {
      return positionEpsilonPx(input.viewportHeight) + 1;
    }
    if (Math.abs(this.velocityVh) > SETTLE_VELOCITY_EPSILON) {
      return positionEpsilonPx(input.viewportHeight) + 1;
    }
    return 0;
  }

  private resolveDestination(input: SettleTickInput): ScreenNodeId | null {
    if (input.mode === "magnetic" || input.mode === "programmatic" || input.mode === "restore") {
      const node = input.pendingTarget ?? this.lastDestination;
      if (node) this.lastDestination = node;
      return node;
    }
    if (input.mode === "user") return null;
    const idleTarget = input.pendingTarget ?? input.magneticCandidateId ?? input.observedNodeId;
    if (idleTarget) this.lastDestination = idleTarget;
    return idleTarget;
  }

  private resolveCandidate(input: SettleTickInput, destination: ScreenNodeId | null): ScreenNodeId | null {
    if (this.snapHintId && input.mode !== "idle") return this.snapHintId;
    if (input.magneticCandidateId) return input.magneticCandidateId;
    if (destination && (input.mode === "magnetic" || input.mode === "programmatic" || input.mode === "restore")) {
      return destination;
    }
    return input.observedNodeId;
  }

  private resolvePhase(input: SettleTickInput, settled: boolean): ScrollPhase {
    if (settled) return "Settled";
    if (input.snapAnimationPending || input.mode === "magnetic") return "Snapping";
    if (input.mode === "user" || input.gestureActive) return "Traversing";
    if (input.mode === "programmatic" || input.mode === "restore") {
      return Math.abs(this.velocityVh) > SETTLE_VELOCITY_EPSILON ? "Traversing" : "Verifying";
    }
    if (this.snapCandidateNodeId && this.magneticDestinationNodeId) return "Verifying";
    return "Traversing";
  }

  private ignoreCandidate(nodeId: ScreenNodeId) {
    if (this.lastIgnoredCandidate === nodeId) return;
    if (sameNode(nodeId, this.magnetizedSettledNodeId)) return;
    if (sameNode(nodeId, this.actorCommittedNodeId)) return;
    this.lastIgnoredCandidate = nodeId;
    this.ignoredCandidateCount += 1;
  }

  private emitPrewarm(nodeId: ScreenNodeId | null, nowMs: number) {
    if (!nodeId || this.lastPrewarmNode === nodeId) return;
    const contract = this.resolveContract(nodeId);
    if (!contract) return;
    this.lastPrewarmNode = nodeId;
    this.pendingPrewarm = { nodeId, semanticContractKey: contract.key, atMs: nowMs };
  }

  private onScrollActivity(nowMs: number) {
    this.invalidateQueue();
    this.candidateSince = nowMs;
    this.lastIgnoredCandidate = null;
    if (this.phase === "Settled") this.phase = "Traversing";
    this.magneticDestinationNodeId = null;
    if (this.actorStatus === "preparing" && !this.actorVisualStarted) {
      this.cancelPreparing(nowMs);
    }
  }

  private invalidateQueue() {
    this.queued = null;
  }

  private cancelPreparing(nowMs: number) {
    this.cancelledBeforeVisualStartCount += 1;
    this.pendingCancel = true;
    this.pendingBegin = null;
    this.actorStatus = "settled";
    this.actorVisualStarted = false;
    this.preparingRevision = 0;
    this.actorCommittedNodeId = this.previousCommittedNodeId;
    this.actorEndpointKey = this.previousEndpointKey;
    void nowMs;
  }

  private commitSettle(nodeId: ScreenNodeId, nowMs: number) {
    this.phase = "Settled";
    this.lastDestination = nodeId;
    this.lastSettleAt = nowMs;
    if (this.magnetizedSettledNodeId === nodeId && this.publishedSettleRevision > 0) {
      return;
    }
    this.magnetizedSettledNodeId = nodeId;
    this.magneticSettleRevision += 1;
    this.publishedSettleRevision = this.magneticSettleRevision;
    const contract = this.resolveContract(nodeId);
    if (!contract) return;
    this.onMagneticSettle({ nodeId, revision: this.magneticSettleRevision, atMs: nowMs }, contract, nowMs);
  }

  private onMagneticSettle(commit: MagneticSettleCommit, contract: SemanticContractRef, nowMs: number) {
    if (contract.key === this.actorEndpointKey) return;
    if (this.actorStatus === "settled") {
      this.beginActorTransition(contract, commit.revision, commit.revision === 1 && !this.actorRequestCount ? "boot" : "settle", nowMs);
      return;
    }
    if (this.actorStatus === "preparing" && !this.actorVisualStarted) {
      this.cancelPreparing(nowMs);
      this.beginActorTransition(contract, commit.revision, "settle", nowMs);
      return;
    }
    this.queued = {
      nodeId: commit.nodeId,
      semanticContractKey: contract.key,
      magneticSettleRevision: commit.revision,
      queuedAt: nowMs,
    };
    this.maxActorQueueDepth = Math.max(this.maxActorQueueDepth, 1);
    if (this.queued && ACTOR_QUEUE_CAPACITY !== 1) {
      this.maxActorQueueDepth = Math.max(this.maxActorQueueDepth, ACTOR_QUEUE_CAPACITY);
    }
  }

  private isQueuedStillAuthoritative() {
    if (!this.queued) return false;
    if (this.phase !== "Settled") return false;
    if (this.queued.magneticSettleRevision !== this.magneticSettleRevision) return false;
    if (this.magnetizedSettledNodeId !== this.queued.nodeId) return false;
    if (this.queued.semanticContractKey === this.actorEndpointKey) return false;
    return true;
  }

  private onActorSettled(nowMs: number) {
    if (!this.isQueuedStillAuthoritative() || !this.queued) {
      this.queued = null;
      return;
    }
    const contract = this.resolveContract(this.queued.nodeId);
    if (!contract || contract.key !== this.queued.semanticContractKey) {
      this.staleQueuedTransitionStarts += 1;
      this.queued = null;
      return;
    }
    const queued = this.queued;
    this.queued = null;
    this.beginActorTransition(contract, queued.magneticSettleRevision, "queued", nowMs);
  }

  private beginActorTransition(
    contract: SemanticContractRef,
    revision: number,
    origin: ActorRequestOrigin,
    nowMs: number,
  ): ActorRequestIntent | null {
    const keepVisibleMorph = origin === "in-screen" && this.actorStatus === "morphing";
    if (this.actorStatus === "morphing" && !keepVisibleMorph) {
      if (origin !== "queued") {
        this.queued = {
          nodeId: contract.nodeId,
          semanticContractKey: contract.key,
          magneticSettleRevision: revision,
          queuedAt: nowMs,
        };
        this.maxActorQueueDepth = Math.max(this.maxActorQueueDepth, 1);
        return null;
      }
      this.runningMorphInterruptedByScroll += 1;
      return null;
    }
    if (origin === "queued" && revision !== this.magneticSettleRevision) {
      this.staleQueuedTransitionStarts += 1;
      return null;
    }
    if (origin !== "in-screen" && this.magnetizedSettledNodeId !== contract.nodeId) {
      this.requestsToCrossedNodes += 1;
      return null;
    }
    if (origin === "in-screen" && this.magnetizedSettledNodeId !== contract.nodeId) {
      this.requestsToCrossedNodes += 1;
      return null;
    }
    if (contract.key === this.actorEndpointKey) return null;
    const source: ActorRequestSource = origin === "in-screen"
      ? { kind: "in-screen-action", hostNodeId: contract.nodeId, interactionRevision: this.interactionRevision }
      : { kind: "route-settle", nodeId: contract.nodeId, magneticSettleRevision: revision };
    const intent: ActorRequestIntent = {
      nodeId: contract.nodeId,
      semanticContractKey: contract.key,
      magneticSettleRevision: revision,
      origin,
      source,
      atMs: nowMs,
    };
    this.pendingBegin = intent;
    this.actorRequestCount += 1;
    this.lastRequestAt = nowMs;
    this.lastRequestSource = source;
    this.previousCommittedNodeId = this.actorCommittedNodeId;
    this.previousEndpointKey = this.actorEndpointKey;
    this.actorStatus = keepVisibleMorph ? "morphing" : "preparing";
    if (!keepVisibleMorph) this.actorVisualStarted = false;
    this.actorCommittedNodeId = contract.nodeId;
    this.actorEndpointKey = contract.key;
    this.preparingRevision = revision;
    return intent;
  }
}
