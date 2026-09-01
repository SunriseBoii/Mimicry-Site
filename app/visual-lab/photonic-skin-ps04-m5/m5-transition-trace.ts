/**
 * Frame-level M5.1 navigation traces. Samples the existing lab clock only;
 * no second rAF loop and no per-particle React updates.
 */

import {
  PALETTE_DELAY_FRACTION,
  chapterBoundary,
  paletteLeadsGeometry,
  type ChapterBoundaryId,
} from "./m5-choreography";
import type { ActorTransitionTransaction } from "./transition-coordinator";

export interface M5TraceFrame {
  frameToken: number;
  timestamp: number;
  navigationRevision: number;
  sourceScreen: string;
  targetScreen: string;
  sourceState: string | null;
  targetState: string | null;
  transactionId: number;
  prepareStartMs: number | null;
  prepareEndMs: number | null;
  gpuBankReady: boolean;
  activeBankBefore: number | null;
  activeBankAfter: number | null;
  copyCommitMs: number | null;
  geometryStart: number;
  geometryEnd: number;
  paletteStart: number;
  paletteEnd: number;
  positionStart: number;
  positionEnd: number;
  geometryProgress: number;
  paletteProgress: number;
  positionProgress: number;
  actorX: number;
  actorSlot: string;
  currentGeometryId: string | null;
  targetGeometryId: string | null;
  currentPaletteMask: number;
  targetPaletteMask: number;
  settleMs: number | null;
  cancellationReason: string | null;
  intermediateActorRequest: boolean;
  centerDeclaredAsTarget: boolean;
  visualLifecycle: string;
  visualPublished: boolean;
  paletteLeads: boolean;
  chapterBoundary: ChapterBoundaryId | null;
  framingProgress: number;
  sourceZoom: number;
  targetZoom: number;
  displayedZoom: number;
}

const MAX_FRAMES = 2400;

export class M5TransitionTrace {
  private readonly frames: M5TraceFrame[] = [];
  private recording = false;
  readonly paletteDelayFraction = PALETTE_DELAY_FRACTION;

  start() {
    this.frames.length = 0;
    this.recording = true;
  }

  stop() {
    this.recording = false;
    return this.snapshot();
  }

  get recordingNow() {
    return this.recording;
  }

  push(frame: M5TraceFrame) {
    if (!this.recording) return;
    this.frames.push(frame);
    if (this.frames.length > MAX_FRAMES) this.frames.shift();
  }

  snapshot() {
    return this.frames.slice();
  }

  byRevision(revision: number) {
    return this.frames.filter((frame) => frame.transactionId === revision);
  }
}

export function m5FrameFromTransaction(args: {
  frameToken: number;
  timestamp: number;
  transaction: ActorTransitionTransaction & { positionProgress?: number; visualPublished?: boolean };
  navigationRevision: number;
  actorX: number;
  actorSlot: string;
  gpuBankReady: boolean;
  activeBankBefore: number | null;
  activeBankAfter: number | null;
  prepareStartMs: number | null;
  prepareEndMs: number | null;
  copyCommitMs: number | null;
  settleMs: number | null;
  cancellationReason: string | null;
  intermediateActorRequest: boolean;
  currentGeometryId: string | null;
  displayedZoom?: number;
}): M5TraceFrame {
  const tx = args.transaction;
  const positionProgress = tx.positionProgress ?? tx.slotProgress;
  const sourceZoom = tx.sourceZoom ?? 1;
  const targetZoom = tx.targetZoom ?? 1;
  const framingProgress = tx.framingProgress ?? 1;
  return {
    frameToken: args.frameToken,
    timestamp: args.timestamp,
    navigationRevision: args.navigationRevision,
    sourceScreen: String(tx.sourceNodeId),
    targetScreen: String(tx.targetNodeId),
    sourceState: tx.sourceGeometryId,
    targetState: tx.targetGeometryId,
    transactionId: tx.revision,
    prepareStartMs: args.prepareStartMs,
    prepareEndMs: args.prepareEndMs,
    gpuBankReady: args.gpuBankReady,
    activeBankBefore: args.activeBankBefore,
    activeBankAfter: args.activeBankAfter,
    copyCommitMs: args.copyCommitMs,
    geometryStart: 0,
    geometryEnd: tx.geometryProgress,
    paletteStart: 0,
    paletteEnd: tx.paletteProgress,
    positionStart: 0,
    positionEnd: positionProgress,
    geometryProgress: tx.geometryProgress,
    paletteProgress: tx.paletteProgress,
    positionProgress,
    actorX: args.actorX,
    actorSlot: args.actorSlot,
    currentGeometryId: args.currentGeometryId,
    targetGeometryId: tx.targetGeometryId,
    currentPaletteMask: tx.sourcePaletteMask,
    targetPaletteMask: tx.targetPaletteMask,
    settleMs: args.settleMs,
    cancellationReason: args.cancellationReason,
    intermediateActorRequest: args.intermediateActorRequest,
    centerDeclaredAsTarget: tx.targetSlot !== "left" && tx.targetSlot !== "right" && tx.targetSlot !== "none"
      ? true
      : false,
    visualLifecycle: tx.visualLifecycle,
    visualPublished: tx.visualPublished === true,
    paletteLeads: paletteLeadsGeometry(tx.geometryProgress, tx.paletteProgress),
    chapterBoundary: chapterBoundary(String(tx.sourceNodeId), String(tx.targetNodeId)),
    framingProgress,
    sourceZoom,
    targetZoom,
    displayedZoom: args.displayedZoom ?? (sourceZoom + (targetZoom - sourceZoom) * framingProgress),
  };
}
