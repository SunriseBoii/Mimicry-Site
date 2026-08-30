/**
 * M4 geometry endpoint authority. Symmetric to PaletteAuthority: Scene must
 * not derive settled geometry from raw PhotonicMotionSession state. One
 * snapshot per frame drives uniforms together with the palette snapshot.
 *
 * After settle the bound pair stays at shader progress 1. A new pair may
 * bind only atomically (all textures + uProgress = 0 in one commit).
 */

import type { DecodedState } from "../photonic-skin-m4-1/m41-data";
import type { TransitionProgram } from "../photonic-skin-m4-1/m41-evaluator";

export type GeometryAuthorityStatus = "settled" | "waiting" | "running";

export interface GeometryMaterialSnapshot {
  revision: number;
  navigationToken: number;
  status: GeometryAuthorityStatus;
  boundProgramId: string | null;
  boundSourceGeometryId: string | null;
  boundTargetGeometryId: string | null;
  settledGeometryId: string | null;
  semanticTargetGeometryId: string | null;
  shaderProgress: number;
  programReady: boolean;
  bindFrameToken: number | null;
  reverse: boolean;
  pendingProgramId: string | null;
}

export interface GeometryProgramBind {
  revision: number;
  navigationToken: number;
  program: TransitionProgram;
  source: DecodedState;
  target: DecodedState;
  bindCommitted: boolean;
  bindFrameToken: number | null;
  preparedAtMs: number;
  gpuReady?: boolean;
  resourceState?: "absent" | "cpu-preparing" | "cpu-ready" | "gpu-staging" | "gpu-ready" | "bound";
  bankId?: number;
  bankGeneration?: number;
}

export interface GeometryRenderAck {
  drawnRevision: number;
  drawnProgramId: string | null;
  drawnProgress: number;
  drawnSourceId: string | null;
  drawnTargetId: string | null;
  frameToken: number;
  atMs: number;
}

export interface GeometryDisplayedBind {
  revision: number;
  programId: string | null;
  sourceGeometryId: string | null;
  targetGeometryId: string | null;
  shaderProgress: number;
  bindFrameToken: number;
  reverse: boolean;
}

export const EMPTY_GEOMETRY_ACK: GeometryRenderAck = {
  drawnRevision: 0,
  drawnProgramId: null,
  drawnProgress: 1,
  drawnSourceId: null,
  drawnTargetId: null,
  frameToken: 0,
  atMs: 0,
};

export function displayedShaderProgress(args: {
  transactionStatus: string;
  transactionRevision: number;
  transactionProgress: number;
  programReady: boolean;
  bind: GeometryDisplayedBind | null;
  reducedMotion?: boolean;
}): number {
  if (args.reducedMotion) return 1;
  if (args.transactionStatus === "settled") return 1;
  if (!args.bind || args.bind.revision !== args.transactionRevision) return 1;
  if (!args.programReady) return 1;
  return clamp01(args.bind.shaderProgress);
}

export function geometryAuthorityStatus(args: {
  transactionStatus: string;
  transactionKind: string;
  programReady: boolean;
  bind: GeometryDisplayedBind | null;
  transactionRevision: number;
}): GeometryAuthorityStatus {
  if (args.transactionStatus === "settled") return "settled";
  if (args.transactionKind === "geometry" && (!args.programReady || !args.bind || args.bind.revision !== args.transactionRevision)) {
    return "waiting";
  }
  if (args.transactionStatus === "running") return "running";
  return "settled";
}

export function selectProgramSourceMode(args: {
  shaderProgress: number;
  boundTargetGeometryId: string | null;
  boundSourceGeometryId: string | null;
  settledGeometryId: string | null;
  sessionSourceId: string | null;
  sessionTargetId: string | null;
  sessionProgress: number;
}): { mode: "frozen" | "live-retarget"; sourceGeometryId: string | null } {
  if (args.shaderProgress >= 1) {
    return {
      mode: "frozen",
      sourceGeometryId: args.boundTargetGeometryId
        ?? args.settledGeometryId
        ?? args.boundSourceGeometryId
        ?? args.sessionSourceId
        ?? args.sessionTargetId,
    };
  }
  return {
    mode: "live-retarget",
    sourceGeometryId: args.sessionSourceId,
  };
}

export function canAtomicBind(args: {
  packet: GeometryProgramBind | null;
  snapshot: GeometryMaterialSnapshot | null;
  displayed: GeometryDisplayedBind | null;
}): boolean {
  const packet = args.packet;
  const snapshot = args.snapshot;
  if (!packet || !snapshot) return false;
  if (packet.bindCommitted) return false;
  if (packet.gpuReady === false) return false;
  if (packet.resourceState && packet.resourceState !== "gpu-ready" && packet.resourceState !== "bound") return false;
  if (!snapshot.programReady) return false;
  if (packet.revision !== snapshot.revision) return false;
  if (snapshot.status === "settled") return false;
  if (packet.program.programId !== snapshot.pendingProgramId && snapshot.pendingProgramId) {
    if (packet.program.programId !== snapshot.boundProgramId) return false;
  }
  if (args.displayed && args.displayed.shaderProgress >= 1) {
    const displayedEndpoint = args.displayed.targetGeometryId;
    const nextSource = packet.source.entry.stateId;
    if (displayedEndpoint && nextSource !== displayedEndpoint && nextSource !== args.displayed.sourceGeometryId) {
      return false;
    }
  }
  return true;
}

export function assertSettledGeometryInvariants(snapshot: GeometryMaterialSnapshot) {
  return {
    shaderProgressLocked: snapshot.shaderProgress === 1,
    statusSettled: snapshot.status === "settled",
    settledEqualsBoundTarget: snapshot.settledGeometryId === snapshot.boundTargetGeometryId
      || snapshot.settledGeometryId === snapshot.semanticTargetGeometryId,
    programReady: snapshot.programReady === true,
  };
}

export function monotonicProgress(previous: number, next: number, reverse: boolean) {
  const a = clamp01(previous);
  const b = clamp01(next);
  if (reverse) return b;
  return Math.max(a, b);
}

export function hashTextureIdentities(ids: readonly (string | null | undefined)[]) {
  return ids.map((id) => id ?? "none").join("|");
}

export function emptyGeometrySnapshot(args: {
  revision?: number;
  geometryId?: string | null;
  programId?: string | null;
} = {}): GeometryMaterialSnapshot {
  const geometryId = args.geometryId ?? null;
  return {
    revision: args.revision ?? 0,
    navigationToken: 0,
    status: "settled",
    boundProgramId: args.programId ?? null,
    boundSourceGeometryId: geometryId,
    boundTargetGeometryId: geometryId,
    settledGeometryId: geometryId,
    semanticTargetGeometryId: geometryId,
    shaderProgress: 1,
    programReady: true,
    bindFrameToken: null,
    reverse: false,
    pendingProgramId: args.programId ?? null,
  };
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
