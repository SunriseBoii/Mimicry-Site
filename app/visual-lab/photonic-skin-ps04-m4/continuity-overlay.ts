/**
 * M4.R3 visual-mass overlay. Applied after the frozen evaluator writes
 * activation/scale, before clip-space composition. Identity / GPU parity
 * mode must keep the lift at 1 and must not change centers or correspondence.
 */

export const CONTINUITY_FLOOR = 0.38;
export const DEFAULT_MINIMUM_GEOMETRIC_SCALE = 0.18;

export function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Per-persistent palette ownership. Source-like particles keep the source
 * LUT; target-like particles take the target competence colors as they form.
 */
export function paletteOwnershipWeight(args: {
  localT: number;
  sourceActive: number;
  targetActive: number;
  progress: number;
}) {
  const t = clamp01(args.progress);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const source = args.sourceActive > 0.5;
  const target = args.targetActive > 0.5;
  if (source && !target) return 0;
  return clamp01(args.localT);
}

export function continuityProtectedActivation(args: {
  activation: number;
  sourceActive: number;
  targetActive: number;
  localT: number;
  progress: number;
  floor?: number;
}) {
  const t = args.progress;
  if (!(t > 0) || t >= 1) return args.activation;
  const floor = args.floor ?? CONTINUITY_FLOOR;
  const persistent = args.sourceActive * args.targetActive;
  const immersing = args.sourceActive * (1 - args.targetActive);
  const emerging = (1 - args.sourceActive) * args.targetActive;
  const protectedMass = Math.max(
    persistent,
    immersing * (1 - clamp01(args.localT)),
    emerging * clamp01(args.localT),
  ) * floor;
  return Math.max(args.activation, protectedMass);
}

export function continuityRadiusLift(args: {
  activation: number;
  protectedActivation: number;
  minimumGeometricScale?: number;
  enabled?: boolean;
  identity?: boolean;
  progress?: number;
}) {
  if (args.enabled === false || args.identity || args.progress === 0 || args.progress === 1) return 1;
  const minimum = args.minimumGeometricScale ?? DEFAULT_MINIMUM_GEOMETRIC_SCALE;
  const frozen = Math.max(mix(minimum, 1, clamp01(args.activation)), 1e-4);
  const overlay = mix(minimum, 1, clamp01(args.protectedActivation));
  return overlay / frozen;
}
