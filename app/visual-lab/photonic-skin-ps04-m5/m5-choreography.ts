/**
 * PS-04.M5.1 prepare/commit/publish and spatial trajectory contract.
 * Geometry, palette and actor position share one transaction clock.
 * Palette delay is a derived curve of that clock, not a second timer.
 */

import { c2Window, clamp01, smooth5 } from "../photonic-skin-ps04-m3/idle-motion";
import type { ActorPlacement, ScreenNodeId } from "./topology";

type ActorSlot = ActorPlacement;

/**
 * Geometry lead before palette starts, as a fraction of the same
 * transaction duration. 6% sits in the allowed 4–8% band: a synchronous
 * palette start still reads as target color on source silhouette because
 * field stripes resolve faster than the morph. Derived from evidence of
 * ~0.6–0.8 s color lead on the R6.R1 curve that finished at approach[0]=0.62.
 */
export const PALETTE_DELAY_FRACTION = 0.06;

/** Viewport-normalized |ΔX| below this is a hold, not travel. ~7.7 px at 1920. */
export const CENTER_DWELL_X_EPSILON = 0.004;

/** Consecutive rendered frames of near-zero ΔX while the trajectory is active. */
export const CENTER_DWELL_FRAME_COUNT = 2;

/** Geometry progress at or below this keeps palette ownership at source. */
export const PALETTE_GEOMETRY_GATE_EPSILON = 0.02;

export const M5_SESSION_ID = "ps04-m5-1";
export const M5_STAGE = "PS-04.M5.1";
export const M5_RUN_ID = "ps04-m5";

export type ChapterBoundaryId = "cases-to-content" | "merch-to-team";

export function paletteProgressFromGeometryM5(progress: number, args: {
  sameMask?: boolean;
  reducedMotion?: boolean;
} = {}) {
  if (args.sameMask) return 1;
  if (args.reducedMotion) return 1;
  const geometry = clamp01(progress);
  const delayed = c2Window(geometry, PALETTE_DELAY_FRACTION, 1);
  // smooth5 can exceed identity in the mid window; never let palette pass geometry.
  return Math.min(geometry, delayed);
}

export function positionProgressFromGeometryM5(progress: number, reducedMotion = false) {
  if (reducedMotion) return 1;
  return c2Window(progress, 0, 1);
}

/** Framing shares the M5.1 C2 window. No independent elapsed/duration clock. */
export function framingProgressFromGeometryM5(progress: number, reducedMotion = false) {
  return positionProgressFromGeometryM5(progress, reducedMotion);
}

export function siteOnlyPositionProgress(elapsedSeconds: number, durationSeconds: number, reducedMotion = false) {
  if (reducedMotion) return 1;
  const duration = Math.max(durationSeconds, 0.001);
  return smooth5(clamp01(elapsedSeconds / duration));
}

export function paletteLeadsGeometry(geometryProgress: number, paletteProgress: number, epsilon = 1e-6) {
  if (geometryProgress + epsilon >= 1) return paletteProgress > 1 + epsilon;
  if (geometryProgress <= PALETTE_GEOMETRY_GATE_EPSILON) {
    return paletteProgress > PALETTE_GEOMETRY_GATE_EPSILON;
  }
  if (paletteProgress + epsilon >= 1 && geometryProgress + epsilon < 1) return true;
  return paletteProgress > geometryProgress + epsilon;
}

export function midpointPositionVelocity(samples: readonly number[], dt = 1) {
  if (samples.length < 3) return 0;
  const mid = Math.floor(samples.length / 2);
  const previous = samples[mid - 1] ?? samples[mid] ?? 0;
  const next = samples[mid + 1] ?? samples[mid] ?? 0;
  return (next - previous) / (2 * dt);
}

export function chapterBoundary(sourceNodeId: string, targetNodeId: string): ChapterBoundaryId | null {
  if (sourceNodeId === "04" && targetNodeId === "05.1") return "cases-to-content";
  if (sourceNodeId === "05.1" && targetNodeId === "04") return "cases-to-content";
  if (sourceNodeId === "05.7" && targetNodeId === "06.1") return "merch-to-team";
  if (sourceNodeId === "06.1" && targetNodeId === "05.7") return "merch-to-team";
  return null;
}

export function oppositeSlotCrossing(sourceSlot: ActorSlot, targetSlot: ActorSlot) {
  return (sourceSlot === "right" && targetSlot === "left")
    || (sourceSlot === "left" && targetSlot === "right");
}

export interface PositionFrame {
  x: number;
  width: number;
  positionProgress: number;
  geometryProgress: number;
  status: string;
}

export function centerDwellRuns(frames: readonly PositionFrame[]) {
  const runs: Array<{ start: number; length: number; xs: number[] }> = [];
  let start = -1;
  let xs: number[] = [];
  const flush = (end: number) => {
    if (start >= 0 && end - start > CENTER_DWELL_FRAME_COUNT) {
      runs.push({ start, length: end - start, xs: xs.slice() });
    }
    start = -1;
    xs = [];
  };
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]!;
    const current = frames[index]!;
    const active = current.status === "running"
      && current.positionProgress > 0.2
      && current.positionProgress < 0.8;
    const atEndpoint = current.positionProgress <= 0.2
      || current.positionProgress >= 0.8;
    const width = Math.max(current.width, 1);
    const delta = Math.abs(current.x - previous.x) / width;
    const held = active && !atEndpoint && delta <= CENTER_DWELL_X_EPSILON;
    if (held) {
      if (start < 0) start = index - 1;
      if (xs.length === 0) xs.push(previous.x);
      xs.push(current.x);
    } else {
      flush(index);
    }
  }
  flush(frames.length);
  return runs;
}

export function hasCenterDwell(frames: readonly PositionFrame[]) {
  return centerDwellRuns(frames).length > 0;
}

export function prepareMustNotPublish(args: {
  visualLifecycle: string;
  geometryProgress: number;
  paletteProgress: number;
  visualPublished: boolean;
  activeBankId: number | null;
  preparingBankId: number | null;
}) {
  const preparing = args.visualLifecycle === "preparing";
  return {
    preparing,
    paletteHeld: !preparing || args.paletteProgress <= PALETTE_GEOMETRY_GATE_EPSILON,
    geometryHeld: !preparing || args.geometryProgress <= PALETTE_GEOMETRY_GATE_EPSILON,
    notPublished: !preparing || args.visualPublished === false,
    activeBankUnchanged: !preparing
      || args.preparingBankId == null
      || args.activeBankId === null
      || args.preparingBankId !== args.activeBankId
      || args.visualPublished === false,
  };
}

export const CASES_CONTENT = {
  source: "04" as ScreenNodeId,
  target: "05.1" as ScreenNodeId,
  sourceSlot: "right" as ActorSlot,
  targetSlot: "left" as ActorSlot,
};

export const MERCH_TEAM = {
  source: "05.7" as ScreenNodeId,
  target: "06.1" as ScreenNodeId,
  sourceSlot: "left" as ActorSlot,
  targetSlot: "right" as ActorSlot,
};
