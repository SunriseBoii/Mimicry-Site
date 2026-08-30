import type { ActorTransitionTransaction } from "./transition-coordinator";
import { isRuntimeSnapshotId } from "./transition-coordinator";

export interface GeometryIdFrameTrace {
  frameToken: number;
  timestamp: number;
  revision: number;
  activeNodeId: string;
  committedNodeId: string;
  requestedGeometryId: string | null;
  sourceGeometryId: string | null;
  targetGeometryId: string | null;
  programId: string | null;
  semanticPhase: string;
  geometryProgress: number;
  paletteFromMask: number;
  paletteToMask: number;
  paletteProgress: number;
  slotFrom: string;
  slotTo: string;
  siteProgress: number;
  fitFrom: number;
  fitTo: number;
  actorDraw: boolean;
  activeInstances: number;
  silhouettePixels: number | null;
  silhouetteBBox: { left: number; top: number; width: number; height: number } | null;
  frameDeltaMs: number;
}

const MAX_FRAMES = 720;

export class GeometryIdTrace {
  private readonly frames: GeometryIdFrameTrace[] = [];
  private recording = false;

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

  push(frame: GeometryIdFrameTrace) {
    if (!this.recording) return;
    this.frames.push(frame);
    if (this.frames.length > MAX_FRAMES) this.frames.shift();
  }

  snapshot() {
    return this.frames.slice();
  }

  requestedFrozenIds() {
    return [...new Set(this.frames.map((frame) => frame.requestedGeometryId).filter((id): id is string => Boolean(id) && !isRuntimeSnapshotId(id)))];
  }

  thirdGeometryPresent() {
    return this.requestedFrozenIds().length > 2;
  }
}

export function traceFromTransaction(args: {
  frameToken: number;
  timestamp: number;
  transaction: ActorTransitionTransaction;
  activeNodeId: string;
  committedNodeId: string;
  actorDraw: boolean;
  activeInstances?: number;
  silhouettePixels?: number | null;
  silhouetteBBox?: GeometryIdFrameTrace["silhouetteBBox"];
  frameDeltaMs: number;
}): GeometryIdFrameTrace {
  const tx = args.transaction;
  return {
    frameToken: args.frameToken,
    timestamp: args.timestamp,
    revision: tx.revision,
    activeNodeId: args.activeNodeId,
    committedNodeId: args.committedNodeId,
    requestedGeometryId: tx.targetGeometryId,
    sourceGeometryId: tx.sourceGeometryId,
    targetGeometryId: tx.targetGeometryId,
    programId: tx.programId,
    semanticPhase: tx.semanticPhase,
    geometryProgress: tx.geometryProgress,
    paletteFromMask: tx.sourcePaletteMask,
    paletteToMask: tx.targetPaletteMask,
    paletteProgress: tx.paletteProgress,
    slotFrom: tx.sourceSlot,
    slotTo: tx.targetSlot,
    siteProgress: tx.siteProgress,
    fitFrom: tx.sourceFit,
    fitTo: tx.targetFit,
    actorDraw: args.actorDraw,
    activeInstances: args.activeInstances ?? 16384,
    silhouettePixels: args.silhouettePixels ?? null,
    silhouetteBBox: args.silhouetteBBox ?? null,
    frameDeltaMs: args.frameDeltaMs,
  };
}
