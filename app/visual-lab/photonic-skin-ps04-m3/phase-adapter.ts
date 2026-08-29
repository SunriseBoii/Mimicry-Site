/**
 * Read-only adapter from frozen PS-03.M4.1 Directed Photonic Release windows
 * onto M3 palette progress and residual/idle envelopes.
 *
 * Semantic names Release / Regroup / Approach / Reveal / Settle map onto the
 * real MotionPhase union. Overlaps are resolved the same way as phaseAt():
 * later phases win (settle > approach > reveal > regroup > release > anticipation).
 */

import {
  DIRECTED_PLASTIC_RELEASE,
  phaseAt,
  type MotionPhase,
  type PhaseWindows,
  type TransitionProgram,
} from "../photonic-skin-m4-1/m41-evaluator";
import { c2Window, clamp01, smooth5 } from "./idle-motion";

export const FROZEN_PHASE_SEQUENCE = DIRECTED_PLASTIC_RELEASE.phasePolicy.sequence;
export const FROZEN_PHASE_WINDOWS: PhaseWindows = DIRECTED_PLASTIC_RELEASE.phasePolicy.windows;
export const FROZEN_PHASE_BASIS = DIRECTED_PLASTIC_RELEASE.phasePolicy.basis;

export type SemanticChoreographySlot =
  | "pre-transition"
  | "release"
  | "regroup"
  | "approach"
  | "reveal"
  | "settle"
  | "idle";

export interface PhaseAdapterSample {
  progress: number;
  durationSeconds: number;
  motionPhase: MotionPhase | "idle";
  semanticSlot: SemanticChoreographySlot;
  paletteProgress: number;
  residualWeight: number;
  decorativeIdleWeight: number;
  zeroDuration: boolean;
  windows: PhaseWindows;
}

export function windowsForProgram(program: TransitionProgram | null | undefined): PhaseWindows {
  return program?.phases ?? program?.compiled?.header.phasePolicy.windows ?? FROZEN_PHASE_WINDOWS;
}

export function durationSecondsForProgram(program: TransitionProgram | null | undefined) {
  if (!program) return 0;
  if (program.selfTransition || program.durationMs <= 0 || program.compiled?.header.reducedMotion) return 0;
  return Math.max(0, program.durationMs / 1000);
}

export function motionPhaseForProgress(program: TransitionProgram | null | undefined, progress: number): MotionPhase | "idle" {
  if (!program) return "idle";
  return phaseAt(program, progress);
}

export function semanticSlotForPhase(phase: MotionPhase | "idle"): SemanticChoreographySlot {
  if (phase === "idle") return "idle";
  if (phase === "anticipation" || phase === "release") return "release";
  if (phase === "regroup") return "regroup";
  if (phase === "approach") return "approach";
  if (phase === "reveal") return "reveal";
  return "settle";
}

/**
 * Geometry-linked palette progress.
 * Source LUT through anticipation/release; C2 blend across regroup until Reveal
 * start, at which the target palette is reached. Same-mask callers should skip
 * the blend entirely before calling this.
 */
export function paletteProgressFromGeometry(progress: number, windows: PhaseWindows = FROZEN_PHASE_WINDOWS) {
  const t = clamp01(progress);
  const start = windows.regroup[0];
  const end = windows.reveal[0];
  if (!(end > start)) return t >= Math.max(start, end) ? 1 : 0;
  return c2Window(t, start, end);
}

/**
 * Residual overlay captured at click fades to identity by Reveal start so the
 * approved pose is reached before the object is the dominant silhouette.
 * C2 window has zero derivative at both ends (C0 at the click, not C1).
 */
export function residualWeightFromGeometry(progress: number, windows: PhaseWindows = FROZEN_PHASE_WINDOWS) {
  const t = clamp01(progress);
  const end = windows.reveal[0];
  if (!(end > 0)) return t <= 0 ? 1 : 0;
  return 1 - c2Window(t, 0, end);
}

export function idleEaseInAfterSettle(settledElapsed: number, easeSeconds = 1) {
  if (!(easeSeconds > 0)) return 1;
  return c2Window(settledElapsed, 0, easeSeconds);
}

export function samplePhaseAdapter({
  program,
  progress,
  playingTransition,
  settledElapsed = 0,
  reducedMotion = false,
  overlayEnabled = true,
}: {
  program: TransitionProgram | null | undefined;
  progress: number;
  playingTransition: boolean;
  settledElapsed?: number;
  reducedMotion?: boolean;
  overlayEnabled?: boolean;
}): PhaseAdapterSample {
  const windows = windowsForProgram(program);
  const durationSeconds = durationSecondsForProgram(program);
  const zeroDuration = durationSeconds <= 0 || reducedMotion || !program;
  const t = zeroDuration ? 1 : clamp01(progress);
  const motionPhase = zeroDuration ? "idle" : motionPhaseForProgress(program, t);
  const semanticSlot = playingTransition && !zeroDuration ? semanticSlotForPhase(motionPhase) : (t >= 1 ? "idle" : semanticSlotForPhase(motionPhase));
  const paletteProgress = zeroDuration || t >= 1 ? 1 : paletteProgressFromGeometry(t, windows);
  const residualWeight = !overlayEnabled || reducedMotion || zeroDuration || t >= 1
    ? 0
    : residualWeightFromGeometry(t, windows);
  const decorativeIdleWeight = !overlayEnabled || reducedMotion
    ? 0
    : (!playingTransition || t >= 1 ? idleEaseInAfterSettle(settledElapsed) : 0);
  return {
    progress: t,
    durationSeconds,
    motionPhase,
    semanticSlot,
    paletteProgress,
    residualWeight,
    decorativeIdleWeight,
    zeroDuration,
    windows,
  };
}

export function presentablePhaseLabel(sample: PhaseAdapterSample) {
  return `${sample.motionPhase} / ${sample.semanticSlot}`;
}

export { smooth5, c2Window };
