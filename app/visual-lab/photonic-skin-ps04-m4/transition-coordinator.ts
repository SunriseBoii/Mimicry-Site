/**
 * M4-only owner of one semantic actor change. Geometry, palette, slot and
 * fit share a single revision and progress clock. PhotonicMotionSession.tick
 * remains the only simulation clock; this coordinator never ticks it.
 */

import { c2Window } from "../photonic-skin-ps04-m3/idle-motion";
import { FROZEN_PHASE_WINDOWS, type PhaseAdapterSample } from "../photonic-skin-ps04-m3/phase-adapter";
import { FIELD_PARAMETERS, type LutSample } from "../photonic-skin-ps04-m2/photonic-field";
import type { CompetenceMask } from "../photonic-skin-ps04-m2/photonic-palette";
import type { ScreenActorContract } from "./screen-actor-contract";
import { SITE_FIT_PROFILES, siteFitScaleFor, type FitProfile } from "./site-fit";
import type { ScreenNodeId } from "./topology";
import {
  cloneLut,
  hashLut,
  lutForMask,
  mixLuts,
  type PaletteMaterialSnapshot,
  type SettledActorState,
} from "./palette-authority";

export type ActorSlot = "left" | "right" | "none";
export type SemanticPhase =
  | "anticipation"
  | "release"
  | "regroup"
  | "reveal"
  | "approach"
  | "settle";
export type TransactionStatus = "running" | "settled" | "interrupted" | "cancelled";
export type ActorChangeKind = "noop" | "geometry" | "palette-only" | "site-only" | "exit";

export interface SemanticActorKey {
  geometryId: string | null;
  paletteMask: CompetenceMask;
  slot: ActorSlot;
  fitProfile: FitProfile;
  serialized: string;
}

export interface ActorTransitionTransaction {
  revision: number;
  sourceNodeId: ScreenNodeId | "none";
  targetNodeId: ScreenNodeId | "none";
  sourceGeometryId: string | null;
  targetGeometryId: string | null;
  sourcePaletteMask: CompetenceMask;
  targetPaletteMask: CompetenceMask;
  sourceSlot: ActorSlot;
  targetSlot: ActorSlot;
  sourceFit: number;
  targetFit: number;
  sourceFitProfile: FitProfile;
  targetFitProfile: FitProfile;
  programId: string | null;
  startedAtSeconds: number;
  elapsedSeconds: number;
  durationSeconds: number;
  geometryProgress: number;
  semanticPhase: SemanticPhase;
  paletteProgress: number;
  siteProgress: number;
  paletteOwnershipMode: 0 | 1;
  continuityEnabled: 0 | 1;
  kind: ActorChangeKind;
  status: TransactionStatus;
  programReady: boolean;
  sourcePaletteLutHash: string;
  targetPaletteLutHash: string;
  settledPaletteLutHash: string;
  shaderBaseLutHash: string;
  paletteCommitted: boolean;
}

export interface DisplayedPlacement {
  slot: ActorSlot;
  fit: number;
  fitProfile: FitProfile;
  paletteMask: CompetenceMask;
  paletteProgress: number;
  geometryId: string | null;
  nodeId: ScreenNodeId | "none";
  lutHash?: string;
}

export interface GateDecision {
  kind: ActorChangeKind;
  reason: string;
  revision: number | null;
}

export const PALETTE_BLEND_START = FROZEN_PHASE_WINDOWS.reveal[0];
export const PALETTE_BLEND_END = FROZEN_PHASE_WINDOWS.approach[0];
export const SITE_BLEND_START = FROZEN_PHASE_WINDOWS.regroup[0];
export const SITE_BLEND_END = FROZEN_PHASE_WINDOWS.approach[0];

export function semanticActorKey(contract: Pick<ScreenActorContract, "resolvedGeometryId" | "paletteMask" | "slot" | "fitProfile">): SemanticActorKey {
  const geometryId = contract.resolvedGeometryId;
  return {
    geometryId,
    paletteMask: contract.paletteMask,
    slot: contract.slot,
    fitProfile: contract.fitProfile,
    serialized: `${geometryId ?? "none"}|${contract.paletteMask}|${contract.slot}|${contract.fitProfile}`,
  };
}

export function isRuntimeSnapshotId(id: string | null | undefined) {
  return Boolean(id && id.startsWith("runtime-snapshot-"));
}

export function isOverlayActorScreen(nodeId: string) {
  return nodeId === "03.3A" || nodeId === "03.3B";
}

export function classifyActorChange(previous: SemanticActorKey | null, next: ScreenActorContract): ActorChangeKind {
  const nextKey = semanticActorKey(next);
  if (previous && previous.serialized === nextKey.serialized) return "noop";
  if (next.family === "none" || !next.resolvedGeometryId) return "exit";
  if (previous && previous.geometryId === next.resolvedGeometryId) {
    if (previous.paletteMask !== next.paletteMask) return "palette-only";
    return "site-only";
  }
  return "geometry";
}

export function siteProgressFromGeometry(progress: number, reducedMotion = false) {
  if (reducedMotion) return 1;
  return c2Window(progress, SITE_BLEND_START, SITE_BLEND_END);
}

export function paletteProgressFromGeometryR3(progress: number, args: {
  sameMask?: boolean;
  reducedMotion?: boolean;
  paletteOnly?: boolean;
  elapsedSeconds?: number;
} = {}) {
  if (args.sameMask) return 1;
  if (args.reducedMotion) {
    const elapsed = args.elapsedSeconds ?? FIELD_PARAMETERS.reducedTransitionSeconds;
    return Math.min(1, elapsed / Math.max(FIELD_PARAMETERS.reducedTransitionSeconds, 0.001));
  }
  if (args.paletteOnly) {
    const elapsed = args.elapsedSeconds ?? 0;
    const duration = FIELD_PARAMETERS.transitionSeconds;
    return c2Window(elapsed / Math.max(duration, 0.001), 0, 1);
  }
  return c2Window(progress, PALETTE_BLEND_START, PALETTE_BLEND_END);
}

export function semanticPhaseFromAdapter(sample: Pick<PhaseAdapterSample, "motionPhase" | "progress">, reducedMotion = false): SemanticPhase {
  if (reducedMotion || sample.progress >= 1) return "settle";
  const phase = sample.motionPhase;
  if (phase === "anticipation" || phase === "release" || phase === "regroup" || phase === "reveal" || phase === "approach" || phase === "settle") {
    return phase;
  }
  return sample.progress < 1 ? "settle" : "settle";
}

export function mixSlot(from: ActorSlot, to: ActorSlot, progress: number): ActorSlot {
  if (from === to || progress <= 0) return from;
  if (progress >= 1) return to;
  return from;
}

export function mixFit(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

const NATIVE_LINKED_PROGRESS = Symbol.for("ps04m4.nativeSetGeometryLinkedProgress");

/**
 * PhotonicMotionSession.tick writes the frozen M3 regroup→reveal palette
 * curve into the driver. That settles sourceLut onto the target while the
 * silhouette is still source-like. R3 keeps the native writer and ignores
 * session-tick updates; the lab clock applies transaction.paletteProgress.
 *
 * The native method is stored on a symbol so React Strict Mode remounts
 * cannot wrap a no-op and leave driver progress stuck at 0 (R3 rollback).
 */
export function interceptGeometryLinkedProgress(driver: {
  setGeometryLinkedProgress: (progress: number) => void;
}) {
  const existing = (driver as Record<symbol, unknown>)[NATIVE_LINKED_PROGRESS];
  if (typeof existing === "function") {
    driver.setGeometryLinkedProgress = () => undefined;
    return existing as (progress: number) => void;
  }
  const native = driver.setGeometryLinkedProgress.bind(driver);
  (driver as Record<symbol, unknown>)[NATIVE_LINKED_PROGRESS] = native;
  driver.setGeometryLinkedProgress = () => undefined;
  return native;
}

function emptyTransaction(): ActorTransitionTransaction {
  const lutHash = hashLut(lutForMask(127));
  return {
    revision: 0,
    sourceNodeId: "01",
    targetNodeId: "01",
    sourceGeometryId: "master-neutral",
    targetGeometryId: "master-neutral",
    sourcePaletteMask: 127,
    targetPaletteMask: 127,
    sourceSlot: "right",
    targetSlot: "right",
    sourceFit: SITE_FIT_PROFILES.master,
    targetFit: SITE_FIT_PROFILES.master,
    sourceFitProfile: "master",
    targetFitProfile: "master",
    programId: null,
    startedAtSeconds: 0,
    elapsedSeconds: 0,
    durationSeconds: 0,
    geometryProgress: 1,
    semanticPhase: "settle",
    paletteProgress: 1,
    siteProgress: 1,
    paletteOwnershipMode: 0,
    continuityEnabled: 0,
    kind: "noop",
    status: "settled",
    programReady: true,
    sourcePaletteLutHash: lutHash,
    targetPaletteLutHash: lutHash,
    settledPaletteLutHash: lutHash,
    shaderBaseLutHash: lutHash,
    paletteCommitted: true,
  };
}

export class ActorTransitionCoordinator {
  private revision = 0;
  private committedRevision = 0;
  private lastTickToken = -1;
  private ticksAccepted = 0;
  private current: ActorTransitionTransaction = emptyTransaction();
  private lastSemantic: SemanticActorKey | null = null;
  private lastCommittedNode: ScreenNodeId | "none" | null = null;
  private readonly geometryRequests: string[] = [];
  private committedAtMs = 0;
  private requestAtMs = 0;
  private firstWebglChangeAtMs = 0;
  private sourceLut = lutForMask(127);
  private targetLut = lutForMask(127);
  private settledLut = lutForMask(127);

  snapshot(): ActorTransitionTransaction {
    return { ...this.current };
  }

  lastSemanticKey() {
    return this.lastSemantic;
  }

  geometryRequestLog() {
    return this.geometryRequests.slice();
  }

  uniqueFrozenGeometryRequests() {
    return [...new Set(this.geometryRequests.filter((id) => !isRuntimeSnapshotId(id)))];
  }

  noteSessionTick(token: number) {
    if (token === this.lastTickToken) return { accepted: false as const, ticksThisFrame: 0 };
    this.lastTickToken = token;
    this.ticksAccepted += 1;
    return { accepted: true as const, ticksThisFrame: 1 };
  }

  tickCount() {
    return this.ticksAccepted;
  }

  noteCommittedNode(nodeId: ScreenNodeId | "none", nowMs = 0) {
    if (this.lastCommittedNode === nodeId) return this.committedRevision;
    this.lastCommittedNode = nodeId;
    this.committedRevision += 1;
    this.committedAtMs = nowMs;
    return this.committedRevision;
  }

  committedNodeRevision() {
    return this.committedRevision;
  }

  latencies() {
    return {
      committedAtMs: this.committedAtMs,
      requestAtMs: this.requestAtMs,
      firstWebglChangeAtMs: this.firstWebglChangeAtMs,
      requestDelayMs: this.requestAtMs && this.committedAtMs ? this.requestAtMs - this.committedAtMs : null,
      firstFrameDelayMs: this.firstWebglChangeAtMs && this.requestAtMs ? this.firstWebglChangeAtMs - this.requestAtMs : null,
    };
  }

  noteFirstWebglChange(nowMs: number) {
    if (!this.firstWebglChangeAtMs) this.firstWebglChangeAtMs = nowMs;
  }

  gate(next: ScreenActorContract): GateDecision {
    if (isOverlayActorScreen(String(next.nodeId))) {
      const withoutOverlay: ScreenActorContract = { ...next, nodeId: next.hostNodeId };
      const kind = classifyActorChange(this.lastSemantic, withoutOverlay);
      if (kind === "noop") {
        return { kind: "noop", reason: "overlay 03.3A/03.3B keeps Brief actor", revision: this.revision };
      }
    }
    const kind = classifyActorChange(this.lastSemantic, next);
    if (kind === "noop") {
      return { kind: "noop", reason: "same geometry+palette+slot+fit", revision: this.revision };
    }
    return { kind, reason: kind, revision: this.revision + 1 };
  }

  begin(args: {
    next: ScreenActorContract;
    displayed: DisplayedPlacement;
    nowSeconds: number;
    reducedMotion: boolean;
    identity?: boolean;
    durationSeconds?: number;
    programId?: string | null;
    nowMs?: number;
    displayedLut?: LutSample[];
  }): { decision: GateDecision; transaction: ActorTransitionTransaction } {
    const decision = this.gate(args.next);
    if (decision.kind === "noop") {
      return { decision, transaction: this.snapshot() };
    }
    const previous = this.current;
    const nextKey = semanticActorKey(args.next);
    const sameMask = args.displayed.paletteMask === nextKey.paletteMask && args.displayed.paletteProgress >= 1;
    this.revision += 1;
    this.requestAtMs = args.nowMs ?? args.nowSeconds * 1000;
    this.firstWebglChangeAtMs = 0;
    if (previous.status === "running") previous.status = "interrupted";
    const kind = decision.kind;
    const geometryId = args.next.resolvedGeometryId;
    if (kind === "geometry" && geometryId) this.geometryRequests.push(geometryId);
    const reduced = args.reducedMotion || args.identity === true;
    const paletteOnly = kind === "palette-only";
    const siteOnly = kind === "site-only";
    const duration = reduced || kind === "exit"
      ? 0
      : paletteOnly
        ? FIELD_PARAMETERS.transitionSeconds
        : siteOnly
          ? 0.38
          : (args.durationSeconds ?? 0.98);
    const running = !reduced && (kind === "geometry" || paletteOnly || siteOnly);
    const targetFit = siteFitScaleFor(args.next.fitProfile, Boolean(args.identity));
    const sourceFit = args.displayed.fit;
    const sameSite = args.next.slot === args.displayed.slot && Math.abs(targetFit - sourceFit) < 1e-6;
    const sourceLut = cloneLut(args.displayedLut ?? this.displayedLut());
    const targetLut = lutForMask(nextKey.paletteMask);
    this.sourceLut = sourceLut;
    this.targetLut = targetLut;
    if (!running) this.settledLut = cloneLut(targetLut);
    const sourceHash = hashLut(sourceLut);
    const targetHash = hashLut(targetLut);
    const ready = kind !== "geometry" || !running;
    this.current = {
      revision: this.revision,
      sourceNodeId: args.displayed.nodeId,
      targetNodeId: args.next.hostNodeId,
      sourceGeometryId: args.displayed.geometryId,
      targetGeometryId: geometryId,
      sourcePaletteMask: args.displayed.paletteMask,
      targetPaletteMask: nextKey.paletteMask,
      sourceSlot: args.displayed.slot,
      targetSlot: args.next.slot,
      sourceFit,
      targetFit,
      sourceFitProfile: args.displayed.fitProfile,
      targetFitProfile: args.next.fitProfile,
      programId: args.programId ?? null,
      startedAtSeconds: args.nowSeconds,
      elapsedSeconds: 0,
      durationSeconds: duration,
      geometryProgress: kind === "geometry" && running ? 0 : 1,
      semanticPhase: kind === "geometry" && running ? "anticipation" : "settle",
      paletteProgress: reduced || sameMask || kind === "exit" || kind === "site-only" ? 1 : 0,
      siteProgress: reduced || sameSite || paletteOnly ? 1 : 0,
      paletteOwnershipMode: !args.identity && kind === "geometry" && !sameMask && !reduced ? 1 : 0,
      continuityEnabled: !args.identity && kind === "geometry" && !reduced ? 1 : 0,
      kind,
      status: running ? "running" : "settled",
      programReady: ready,
      sourcePaletteLutHash: sourceHash,
      targetPaletteLutHash: targetHash,
      settledPaletteLutHash: running ? this.current.settledPaletteLutHash : targetHash,
      shaderBaseLutHash: running ? sourceHash : targetHash,
      paletteCommitted: !running,
    };
    if (kind === "exit") {
      this.current.status = "settled";
      this.current.siteProgress = reduced ? 1 : this.current.siteProgress;
      this.current.continuityEnabled = 0;
      this.current.paletteOwnershipMode = 0;
      this.commitTargetAsSettled();
    }
    if (!running) this.commitTargetAsSettled();
    this.lastSemantic = nextKey;
    return { decision: { ...decision, revision: this.revision }, transaction: this.snapshot() };
  }

  syncFromSession(args: {
    geometryProgress: number;
    phase: PhaseAdapterSample;
    sessionTime: number;
    programId?: string | null;
    reducedMotion?: boolean;
    identity?: boolean;
    sessionStatus?: string;
    geometryPlaying?: boolean;
  }) {
    const tx = this.current;
    if (tx.status !== "running") {
      if (args.programId) tx.programId = args.programId;
      if (tx.status === "settled") {
        tx.continuityEnabled = 0;
        tx.paletteOwnershipMode = 0;
        tx.semanticPhase = "settle";
      }
      return this.snapshot();
    }
    tx.elapsedSeconds = Math.max(0, args.sessionTime - tx.startedAtSeconds);
    const reduced = Boolean(args.reducedMotion || args.identity);
    if (tx.kind === "palette-only") {
      tx.geometryProgress = 1;
      tx.paletteProgress = paletteProgressFromGeometryR3(1, {
        paletteOnly: true,
        reducedMotion: reduced,
        elapsedSeconds: tx.elapsedSeconds,
      });
      tx.siteProgress = 1;
      tx.semanticPhase = "settle";
      tx.paletteOwnershipMode = 0;
      tx.continuityEnabled = 0;
      if (tx.paletteProgress >= 1) this.commitTargetAsSettled();
      return this.snapshot();
    }
    if (tx.kind === "site-only") {
      const duration = reduced ? 0.001 : 0.38;
      tx.geometryProgress = 1;
      tx.siteProgress = Math.min(1, tx.elapsedSeconds / duration);
      tx.paletteProgress = 1;
      tx.semanticPhase = tx.siteProgress >= 1 ? "settle" : "regroup";
      tx.paletteOwnershipMode = 0;
      tx.continuityEnabled = 0;
      if (tx.siteProgress >= 1) this.commitTargetAsSettled();
      return this.snapshot();
    }
    const waitingForProgram = tx.kind === "geometry"
      && tx.programReady === false
      && args.sessionStatus === "transitioning"
      && args.geometryPlaying !== true;
    const compileGap = waitingForProgram || (tx.kind === "geometry"
      && args.sessionStatus === "transitioning"
      && args.geometryPlaying !== true
      && clamp01(args.geometryProgress) >= 1
      && !reduced);
    if (compileGap) {
      tx.geometryProgress = 0;
      tx.semanticPhase = "anticipation";
      const sameMask = tx.sourcePaletteMask === tx.targetPaletteMask;
      const sameSite = tx.sourceSlot === tx.targetSlot && tx.sourceFit === tx.targetFit;
      tx.paletteProgress = sameMask ? 1 : 0;
      tx.siteProgress = sameSite ? 1 : 0;
      tx.paletteOwnershipMode = !args.identity && !sameMask ? 1 : 0;
      tx.continuityEnabled = 0;
      tx.shaderBaseLutHash = tx.sourcePaletteLutHash;
      return this.snapshot();
    }
    tx.geometryProgress = reduced ? 1 : clamp01(args.geometryProgress);
    tx.semanticPhase = semanticPhaseFromAdapter(args.phase, reduced);
    tx.programId = args.programId ?? tx.programId;
    const sameMask = tx.sourcePaletteMask === tx.targetPaletteMask;
    tx.paletteProgress = paletteProgressFromGeometryR3(tx.geometryProgress, {
      sameMask,
      reducedMotion: reduced,
      elapsedSeconds: tx.elapsedSeconds,
    });
    const sameSite = tx.sourceSlot === tx.targetSlot && tx.sourceFit === tx.targetFit;
    tx.siteProgress = sameSite ? 1 : siteProgressFromGeometry(tx.geometryProgress, reduced);
    tx.paletteOwnershipMode = !args.identity && tx.kind === "geometry" && !sameMask && !reduced ? 1 : 0;
    tx.continuityEnabled = !args.identity && tx.kind === "geometry" && !reduced && tx.programReady ? 1 : 0;
    if (tx.geometryProgress >= 1 && tx.paletteProgress >= 1 && tx.siteProgress >= 1) {
      this.commitTargetAsSettled();
    }
    return this.snapshot();
  }

  markProgramReady(revision: number, programId?: string | null) {
    if (revision !== this.revision) return false;
    this.current.programReady = true;
    if (programId) this.current.programId = programId;
    return true;
  }

  settle(revision: number) {
    if (revision !== this.revision) return false;
    this.commitTargetAsSettled();
    return true;
  }

  isCurrent(revision: number) {
    return revision === this.revision;
  }

  adoptSettled(contract: ScreenActorContract, identity = false) {
    const key = semanticActorKey(contract);
    const fit = siteFitScaleFor(contract.fitProfile, identity);
    const lut = lutForMask(key.paletteMask);
    const lutHash = hashLut(lut);
    this.lastSemantic = key;
    this.sourceLut = cloneLut(lut);
    this.targetLut = cloneLut(lut);
    this.settledLut = cloneLut(lut);
    this.current = {
      ...emptyTransaction(),
      revision: this.revision,
      sourceNodeId: contract.hostNodeId,
      targetNodeId: contract.hostNodeId,
      sourceGeometryId: key.geometryId,
      targetGeometryId: key.geometryId,
      sourcePaletteMask: key.paletteMask,
      targetPaletteMask: key.paletteMask,
      sourceSlot: contract.slot,
      targetSlot: contract.slot,
      sourceFit: fit,
      targetFit: fit,
      sourceFitProfile: contract.fitProfile,
      targetFitProfile: contract.fitProfile,
      geometryProgress: 1,
      paletteProgress: 1,
      siteProgress: 1,
      status: "settled",
      kind: "noop",
      programReady: true,
      sourcePaletteLutHash: lutHash,
      targetPaletteLutHash: lutHash,
      settledPaletteLutHash: lutHash,
      shaderBaseLutHash: lutHash,
      paletteCommitted: true,
    };
  }

  displayedLut() {
    const tx = this.current;
    if (tx.status === "settled" || tx.paletteProgress >= 1) return cloneLut(this.settledLut);
    return mixLuts(this.sourceLut, this.targetLut, tx.paletteProgress);
  }

  displayedPlacement(): DisplayedPlacement {
    const tx = this.current;
    const site = tx.siteProgress;
    const lut = this.displayedLut();
    return {
      slot: site >= 1 || tx.sourceSlot === tx.targetSlot ? tx.targetSlot : tx.sourceSlot,
      fit: mixFit(tx.sourceFit, tx.targetFit, site),
      fitProfile: site >= 1 ? tx.targetFitProfile : tx.sourceFitProfile,
      paletteMask: tx.paletteProgress >= 1 ? tx.targetPaletteMask : tx.sourcePaletteMask,
      paletteProgress: tx.paletteProgress,
      geometryId: tx.geometryProgress >= 1 ? tx.targetGeometryId : tx.sourceGeometryId,
      nodeId: tx.targetNodeId,
      lutHash: hashLut(lut),
    };
  }

  materialSnapshot(colorPhase = 0): PaletteMaterialSnapshot {
    const tx = this.current;
    const settled = tx.status === "settled" || tx.paletteProgress >= 1 && tx.geometryProgress >= 1;
    const shaderSourceLut = settled ? cloneLut(this.settledLut) : cloneLut(this.sourceLut);
    const from: SettledActorState = {
      geometryId: tx.sourceGeometryId ?? "none",
      paletteMask: tx.sourcePaletteMask,
      paletteLut: cloneLut(this.sourceLut),
      paletteLutHash: tx.sourcePaletteLutHash,
      slot: tx.sourceSlot,
      fit: tx.sourceFit,
      fitProfile: tx.sourceFitProfile,
    };
    const to: SettledActorState = {
      geometryId: tx.targetGeometryId ?? "none",
      paletteMask: tx.targetPaletteMask,
      paletteLut: cloneLut(this.targetLut),
      paletteLutHash: tx.targetPaletteLutHash,
      slot: tx.targetSlot,
      fit: tx.targetFit,
      fitProfile: tx.targetFitProfile,
    };
    return {
      revision: tx.revision,
      settledGeometryId: settled ? tx.targetGeometryId : (tx.geometryProgress >= 1 ? tx.targetGeometryId : tx.sourceGeometryId),
      settledMask: settled ? tx.targetPaletteMask : tx.sourcePaletteMask,
      settledLutHash: tx.settledPaletteLutHash,
      sourceGeometryId: tx.sourceGeometryId,
      targetGeometryId: tx.targetGeometryId,
      sourceMask: tx.sourcePaletteMask,
      targetMask: tx.targetPaletteMask,
      sourceLutHash: tx.sourcePaletteLutHash,
      targetLutHash: tx.targetPaletteLutHash,
      shaderBaseLutHash: settled ? tx.targetPaletteLutHash : tx.sourcePaletteLutHash,
      shaderMask: settled ? tx.targetPaletteMask : tx.targetPaletteMask,
      shaderProgress: settled ? 1 : tx.paletteProgress,
      shaderSourceLut,
      ownershipEnabled: !settled && tx.paletteOwnershipMode === 1,
      paletteProgress: settled ? 1 : tx.paletteProgress,
      geometryProgress: tx.geometryProgress,
      siteProgress: tx.siteProgress,
      phase: tx.semanticPhase,
      programReady: tx.programReady,
      activeTransition: settled ? null : {
        revision: tx.revision,
        from,
        to,
        geometryProgress: tx.geometryProgress,
        paletteProgress: tx.paletteProgress,
        siteProgress: tx.siteProgress,
        programReady: tx.programReady,
      },
      colorPhase,
    };
  }

  private commitTargetAsSettled() {
    const tx = this.current;
    tx.geometryProgress = 1;
    tx.paletteProgress = 1;
    tx.siteProgress = 1;
    tx.semanticPhase = "settle";
    this.settledLut = cloneLut(this.targetLut);
    this.sourceLut = cloneLut(this.targetLut);
    tx.settledPaletteLutHash = tx.targetPaletteLutHash;
    tx.shaderBaseLutHash = tx.targetPaletteLutHash;
    tx.sourcePaletteLutHash = tx.targetPaletteLutHash;
    tx.sourcePaletteMask = tx.targetPaletteMask;
    tx.sourceGeometryId = tx.targetGeometryId;
    tx.paletteOwnershipMode = 0;
    tx.continuityEnabled = 0;
    tx.paletteCommitted = true;
    tx.programReady = true;
    tx.status = "settled";
  }
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
