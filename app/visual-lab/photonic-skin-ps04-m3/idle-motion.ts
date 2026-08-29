/**
 * PS-04.M3 reversible actor-wide idle overlay.
 * Applied after the frozen M4 evaluator and field sample, before presentation.
 */

import type { CompositionMode, LabFrame, StateEntry } from "../photonic-skin-m4-1/m41-data";

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];
export type IdleFamily = "master" | "single" | "focus" | "gather" | "drive" | "brand-wide";
export type IdleRotationMode = "turn" | "rock" | "none";
export type IdleChannelMode = "off" | "breathing" | "rotation" | "combined";

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1];
export const WORLD_UP: Vec3 = [0, 0, 1];
export const FROZEN_ACTOR_ANCHOR: Vec3 = [0, 0, 0];
export const QUAT_EPSILON = 1e-12;

export interface IdlePreset {
  family: IdleFamily;
  breathAmplitude: number;
  breathPeriodSeconds: number;
  rotationMode: IdleRotationMode;
  rotationAmplitudeRadians: number;
  rotationPeriodSeconds: number;
  axis: Vec3;
}

export interface IdleProfilePolicy {
  profile: LabFrame;
  breathScale: number;
  rotationScale: number;
  enabled: boolean;
  notes: string;
}

export interface IdlePhases {
  breath: number;
  rotation: number;
}

export interface IdleTransform {
  anchor: Vec3;
  scale: number;
  quaternion: Quat;
  breath: number;
  angleRadians: number;
  decorativeWeight: number;
}

const ROCK_RADIANS = (3 * Math.PI) / 180;

export const IDLE_PRESETS: Readonly<Record<IdleFamily, IdlePreset>> = Object.freeze({
  master: Object.freeze({
    family: "master",
    breathAmplitude: 0.012,
    breathPeriodSeconds: 8,
    rotationMode: "turn",
    rotationAmplitudeRadians: Math.PI * 2,
    rotationPeriodSeconds: 180,
    axis: WORLD_UP,
  }),
  single: Object.freeze({
    family: "single",
    breathAmplitude: 0.005,
    breathPeriodSeconds: 9,
    rotationMode: "rock",
    rotationAmplitudeRadians: ROCK_RADIANS,
    rotationPeriodSeconds: 26,
    axis: WORLD_UP,
  }),
  focus: Object.freeze({
    family: "focus",
    breathAmplitude: 0.005,
    breathPeriodSeconds: 9,
    rotationMode: "rock",
    rotationAmplitudeRadians: ROCK_RADIANS,
    rotationPeriodSeconds: 26,
    axis: WORLD_UP,
  }),
  gather: Object.freeze({
    family: "gather",
    breathAmplitude: 0.005,
    breathPeriodSeconds: 9,
    rotationMode: "rock",
    rotationAmplitudeRadians: ROCK_RADIANS,
    rotationPeriodSeconds: 26,
    axis: WORLD_UP,
  }),
  drive: Object.freeze({
    family: "drive",
    breathAmplitude: 0.005,
    breathPeriodSeconds: 9,
    rotationMode: "rock",
    rotationAmplitudeRadians: ROCK_RADIANS,
    rotationPeriodSeconds: 26,
    axis: WORLD_UP,
  }),
  "brand-wide": Object.freeze({
    family: "brand-wide",
    breathAmplitude: 0.0035,
    breathPeriodSeconds: 10,
    rotationMode: "rock",
    rotationAmplitudeRadians: ROCK_RADIANS,
    rotationPeriodSeconds: 30,
    axis: WORLD_UP,
  }),
});

export const IDLE_PROFILE_POLICY: Readonly<Record<LabFrame, IdleProfilePolicy>> = Object.freeze({
  desktop: Object.freeze({
    profile: "desktop",
    breathScale: 1,
    rotationScale: 1,
    enabled: true,
    notes: "Full decorative idle.",
  }),
  mobile390: Object.freeze({
    profile: "mobile390",
    breathScale: 1,
    rotationScale: 1,
    enabled: true,
    notes: "Full decorative idle at the 390 hero crop.",
  }),
  silhouette180: Object.freeze({
    profile: "silhouette180",
    breathScale: 0.45,
    rotationScale: 0,
    enabled: true,
    notes: "Breath only, reduced amplitude. Rotation/rock off so small Dark components stay readable.",
  }),
  silhouette96: Object.freeze({
    profile: "silhouette96",
    breathScale: 0,
    rotationScale: 0,
    enabled: false,
    notes: "Decorative idle disabled. Motion at 96px made DRIVE/BRAND_WIDE support unreadable.",
  }),
});

export function fract(value: number) {
  return value - Math.floor(value);
}

export function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function smooth5(value: number) {
  const t = clamp01(value);
  return t * t * t * (10 + t * (-15 + 6 * t));
}

export function c2Window(value: number, start: number, end: number) {
  const span = end - start;
  if (!(span > 0)) return value >= end ? 1 : 0;
  return smooth5((value - start) / span);
}

export function idleFamilyForState(entry: Pick<StateEntry, "stateRole" | "compositionMode"> | undefined): IdleFamily {
  if (!entry) return "master";
  if (entry.stateRole === "master" || entry.compositionMode === "MASTER") return "master";
  if (entry.stateRole === "single" || entry.compositionMode === "SINGLE") return "single";
  if (entry.stateRole === "brand_wide" || entry.compositionMode === "BRAND_WIDE") return "brand-wide";
  const mode = entry.compositionMode as CompositionMode;
  if (mode === "FOCUS") return "focus";
  if (mode === "GATHER") return "gather";
  if (mode === "DRIVE") return "drive";
  return "focus";
}

export function presetForFamily(family: IdleFamily): IdlePreset {
  return IDLE_PRESETS[family];
}

export function profilePolicy(profile: LabFrame): IdleProfilePolicy {
  return IDLE_PROFILE_POLICY[profile];
}

export function normalizeQuat(quaternion: Quat): Quat {
  const length = Math.hypot(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
  if (length < QUAT_EPSILON) return IDENTITY_QUAT;
  return [quaternion[0] / length, quaternion[1] / length, quaternion[2] / length, quaternion[3] / length];
}

export function quatDot(a: Quat, b: Quat) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

/** Three.js Quaternion convention: (x, y, z, w), shortest path, q and -q equivalent. */
export function shortestSlerp(source: Quat, target: Quat, t: number): Quat {
  const a = normalizeQuat(source);
  let b = normalizeQuat(target);
  let cosine = quatDot(a, b);
  if (cosine < 0) {
    b = [-b[0], -b[1], -b[2], -b[3]];
    cosine = -cosine;
  }
  const amount = clamp01(t);
  if (cosine > 0.9995) {
    return normalizeQuat([
      a[0] + (b[0] - a[0]) * amount,
      a[1] + (b[1] - a[1]) * amount,
      a[2] + (b[2] - a[2]) * amount,
      a[3] + (b[3] - a[3]) * amount,
    ]);
  }
  const theta = Math.acos(Math.min(1, Math.max(0, cosine)));
  const sine = Math.sin(theta);
  const sourceWeight = Math.sin((1 - amount) * theta) / sine;
  const targetWeight = Math.sin(amount * theta) / sine;
  return normalizeQuat([
    a[0] * sourceWeight + b[0] * targetWeight,
    a[1] * sourceWeight + b[1] * targetWeight,
    a[2] * sourceWeight + b[2] * targetWeight,
    a[3] * sourceWeight + b[3] * targetWeight,
  ]);
}

export function axisAngle(axis: Vec3, angle: number): Quat {
  const axisLength = Math.hypot(axis[0], axis[1], axis[2]);
  if (axisLength < QUAT_EPSILON || Math.abs(angle) < 1e-15) return IDENTITY_QUAT;
  const half = angle * 0.5;
  const sine = Math.sin(half) / axisLength;
  return normalizeQuat([axis[0] * sine, axis[1] * sine, axis[2] * sine, Math.cos(half)]);
}

export function rotateQuat(quaternion: Quat, vector: Vec3): Vec3 {
  const q = normalizeQuat(quaternion);
  const ux = q[0];
  const uy = q[1];
  const uz = q[2];
  const tw = q[3];
  const tx = 2 * (uy * vector[2] - uz * vector[1]);
  const ty = 2 * (uz * vector[0] - ux * vector[2]);
  const tz = 2 * (ux * vector[1] - uy * vector[0]);
  return [
    vector[0] + tw * tx + (uy * tz - uz * ty),
    vector[1] + tw * ty + (uz * tx - ux * tz),
    vector[2] + tw * tz + (ux * ty - uy * tx),
  ];
}

export function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function mixScaleTowardIdentity(scale: number, weight: number) {
  return mix(1, scale, clamp01(weight));
}

export function mixQuatTowardIdentity(quaternion: Quat, weight: number) {
  return shortestSlerp(IDENTITY_QUAT, quaternion, clamp01(weight));
}

export function composeOverlay(a: IdleTransform, b: IdleTransform): IdleTransform {
  const scale = a.scale * b.scale;
  const quaternion = multiplyQuat(a.quaternion, b.quaternion);
  return {
    anchor: a.anchor,
    scale,
    quaternion,
    breath: a.breath * b.breath,
    angleRadians: a.angleRadians + b.angleRadians,
    decorativeWeight: Math.max(a.decorativeWeight, b.decorativeWeight),
  };
}

export function multiplyQuat(left: Quat, right: Quat): Quat {
  const [ax, ay, az, aw] = left;
  const [bx, by, bz, bw] = right;
  return normalizeQuat([
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]);
}

export function identityTransform(anchor: Vec3 = FROZEN_ACTOR_ANCHOR): IdleTransform {
  return {
    anchor,
    scale: 1,
    quaternion: IDENTITY_QUAT,
    breath: 1,
    angleRadians: 0,
    decorativeWeight: 0,
  };
}

export function evaluateLiveIdle({
  phases,
  family,
  profile,
  channel = "combined",
  decorativeWeight = 1,
  reducedMotion = false,
}: {
  phases: IdlePhases;
  family: IdleFamily;
  profile: LabFrame;
  channel?: IdleChannelMode;
  decorativeWeight?: number;
  reducedMotion?: boolean;
}): IdleTransform {
  const policy = profilePolicy(profile);
  const weight = reducedMotion || !policy.enabled || channel === "off" ? 0 : clamp01(decorativeWeight);
  if (weight <= 0) return identityTransform();
  const preset = presetForFamily(family);
  const breathOn = channel === "combined" || channel === "breathing";
  const rotationOn = channel === "combined" || channel === "rotation";
  const breathPhase = fract(phases.breath);
  const rotationPhase = fract(phases.rotation);
  const breathDelta = breathOn
    ? preset.breathAmplitude * policy.breathScale * Math.sin(breathPhase * Math.PI * 2)
    : 0;
  const scale = 1 + breathDelta * weight;
  let angle = 0;
  if (rotationOn && policy.rotationScale > 0 && preset.rotationMode !== "none") {
    if (preset.rotationMode === "turn") {
      angle = preset.rotationAmplitudeRadians * rotationPhase * policy.rotationScale;
    } else {
      angle = preset.rotationAmplitudeRadians * policy.rotationScale * Math.sin(rotationPhase * Math.PI * 2);
    }
  }
  const quaternion = mixQuatTowardIdentity(axisAngle(preset.axis, angle), weight);
  return {
    anchor: FROZEN_ACTOR_ANCHOR,
    scale,
    quaternion,
    breath: scale,
    angleRadians: angle * weight,
    decorativeWeight: weight,
  };
}

export function applyIdlePoint(point: Vec3, transform: IdleTransform): Vec3 {
  const offset: Vec3 = [
    point[0] - transform.anchor[0],
    point[1] - transform.anchor[1],
    point[2] - transform.anchor[2],
  ];
  const rotated = rotateQuat(transform.quaternion, offset);
  return [
    transform.anchor[0] + transform.scale * rotated[0],
    transform.anchor[1] + transform.scale * rotated[1],
    transform.anchor[2] + transform.scale * rotated[2],
  ];
}

export function applyIdleNormal(normal: Vec3, transform: IdleTransform): Vec3 {
  const rotated = rotateQuat(transform.quaternion, normal);
  const length = Math.hypot(rotated[0], rotated[1], rotated[2]);
  if (length < QUAT_EPSILON) return [0, 0, 1];
  return [rotated[0] / length, rotated[1] / length, rotated[2] / length];
}

export function invertIdlePoint(point: Vec3, transform: IdleTransform): Vec3 {
  const scale = transform.scale === 0 ? 1 : 1 / transform.scale;
  const inverse = [ -transform.quaternion[0], -transform.quaternion[1], -transform.quaternion[2], transform.quaternion[3] ] as Quat;
  const offset: Vec3 = [
    (point[0] - transform.anchor[0]) * scale,
    (point[1] - transform.anchor[1]) * scale,
    (point[2] - transform.anchor[2]) * scale,
  ];
  const rotated = rotateQuat(inverse, offset);
  return [
    transform.anchor[0] + rotated[0],
    transform.anchor[1] + rotated[1],
    transform.anchor[2] + rotated[2],
  ];
}

export function overlayEqualsIdentity(transform: IdleTransform, epsilon = 1e-9) {
  return Math.abs(transform.scale - 1) <= epsilon
    && Math.abs(Math.abs(quatDot(transform.quaternion, IDENTITY_QUAT)) - 1) <= epsilon;
}

export function advancePhase(phase: number, deltaSeconds: number, periodSeconds: number) {
  if (!Number.isFinite(periodSeconds) || periodSeconds <= 0) return fract(phase);
  if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return fract(phase);
  return fract(phase + deltaSeconds / periodSeconds);
}
