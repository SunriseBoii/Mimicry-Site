/**
 * Versioned magnetism profiles for PS-04.M6.2-R1.
 * M6_2_CURRENT mirrors the frozen M5/M6.2 cubic snap.
 * R1_STRONG_BALANCED is the review calibration, not a production approval.
 */

import { MAGNETISM } from "../../photonic-skin-ps04-m5/scroll-controller";

export const MAGNETISM_PROFILE_IDS = ["M6_2_CURRENT", "R1_STRONG_BALANCED"] as const;
export type MagnetismProfileId = (typeof MAGNETISM_PROFILE_IDS)[number];

export const DEFAULT_R1_MAGNETISM_PROFILE: MagnetismProfileId = "R1_STRONG_BALANCED";

export type MagnetismMotionKind = "cubic-ease-out" | "monotonic-damping";

export interface MagnetismProfile {
  id: MagnetismProfileId;
  version: string;
  motion: MagnetismMotionKind;
  desktopCaptureRadiusVh: number;
  mobileCaptureRadiusVh: number;
  snapDurationMs: number;
  inputIdleMs: number;
  noopDistancePx: number;
  dampingPerSecond: number;
  captureVelocityPxPerMsDesktop: number;
  captureVelocityPxPerMsTouch: number;
  minActiveStrength: number;
}

export const MAGNETISM_PROFILES = Object.freeze({
  M6_2_CURRENT: Object.freeze({
    id: "M6_2_CURRENT",
    version: "ps-04-m6-2.v1",
    motion: "cubic-ease-out",
    desktopCaptureRadiusVh: MAGNETISM.activationRadiusFactor,
    mobileCaptureRadiusVh: MAGNETISM.activationRadiusFactor,
    snapDurationMs: MAGNETISM.snapDurationMs,
    inputIdleMs: MAGNETISM.inputIdleMs,
    noopDistancePx: MAGNETISM.noopDistancePx,
    dampingPerSecond: 0,
    captureVelocityPxPerMsDesktop: MAGNETISM.fastVelocityPxPerMs,
    captureVelocityPxPerMsTouch: MAGNETISM.fastVelocityPxPerMs,
    minActiveStrength: 0,
  }),
  R1_STRONG_BALANCED: Object.freeze({
    id: "R1_STRONG_BALANCED",
    version: "ps-04-m6-2-r1.v1",
    motion: "monotonic-damping",
    desktopCaptureRadiusVh: 0.56,
    mobileCaptureRadiusVh: 0.42,
    snapDurationMs: MAGNETISM.snapDurationMs,
    inputIdleMs: MAGNETISM.inputIdleMs,
    noopDistancePx: MAGNETISM.noopDistancePx,
    dampingPerSecond: 16,
    captureVelocityPxPerMsDesktop: 0.48,
    captureVelocityPxPerMsTouch: 0.4,
    minActiveStrength: 0.08,
  }),
} as const satisfies Record<MagnetismProfileId, MagnetismProfile>);

export function isMagnetismProfileId(value: string | null | undefined): value is MagnetismProfileId {
  return value === "M6_2_CURRENT" || value === "R1_STRONG_BALANCED";
}

export function magnetismProfile(id: MagnetismProfileId = DEFAULT_R1_MAGNETISM_PROFILE): MagnetismProfile {
  return MAGNETISM_PROFILES[id];
}

export function captureRadiusVh(profile: MagnetismProfile, touch: boolean) {
  return touch ? profile.mobileCaptureRadiusVh : profile.desktopCaptureRadiusVh;
}

export function captureRadiusPx(profile: MagnetismProfile, viewportHeight: number, touch: boolean) {
  return Math.max(1, viewportHeight) * captureRadiusVh(profile, touch);
}

export function captureVelocityPxPerMs(profile: MagnetismProfile, touch: boolean) {
  return touch ? profile.captureVelocityPxPerMsTouch : profile.captureVelocityPxPerMsDesktop;
}

export function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const span = edge1 - edge0;
  if (!(span > 0)) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / span);
  return t * t * (3 - 2 * t);
}

export function proximityToAnchor(distanceToAnchorPx: number, radiusPx: number) {
  if (!(radiusPx > 0)) return 0;
  return clamp01(1 - Math.max(0, distanceToAnchorPx) / radiusPx);
}

export function magneticStrength(distanceToAnchorPx: number, radiusPx: number) {
  return smoothstep(0, 1, proximityToAnchor(distanceToAnchorPx, radiusPx));
}

export function magneticStrengthMonotonic(radiusPx: number, samples = 24) {
  let previous = magneticStrength(radiusPx, radiusPx);
  for (let i = 1; i <= samples; i += 1) {
    const distance = radiusPx * (1 - i / samples);
    const next = magneticStrength(distance, radiusPx);
    if (next + 1e-9 < previous) return false;
    previous = next;
  }
  return true;
}

export function dampToward(current: number, target: number, strength: number, dtSeconds: number, profile: MagnetismProfile) {
  const distance = target - current;
  if (Math.abs(distance) <= profile.noopDistancePx) return target;
  const active = Math.max(strength, profile.minActiveStrength);
  const k = Math.max(0, profile.dampingPerSecond);
  const alpha = 1 - Math.exp(-k * active * Math.max(0, dtSeconds));
  const next = current + distance * clamp01(alpha);
  if (distance > 0 && next > target) return target;
  if (distance < 0 && next < target) return target;
  if (Math.abs(target - next) <= profile.noopDistancePx) return target;
  return next;
}

export function profileTokens(profile: MagnetismProfile, touch: boolean) {
  return {
    inputIdleMs: profile.inputIdleMs,
    activationRadiusFactor: captureRadiusVh(profile, touch),
    noopDistancePx: profile.noopDistancePx,
    snapDurationMs: profile.snapDurationMs,
    maxProjectionFactor: MAGNETISM.maxProjectionFactor,
  };
}
