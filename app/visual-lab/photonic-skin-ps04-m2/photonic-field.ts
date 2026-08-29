import type { DecodedState } from "../photonic-skin-m4-1/m41-data";
import {
  paletteColorLinear,
  semanticWeightsForCoordinate,
  type LinearRgb,
  type PaletteState,
} from "./photonic-palette";

export type PhotonicFieldMode = "single" | "complex" | "master" | "brand-wide";
export type PhotonicColorLayer = "neutral" | "undertone" | "full";
export type PhotonicTheme = "light" | "dark";

export const FIELD_ORIGIN = [0, 0, 0] as const;
// Camera/actor up is +Z. A nearly vertical slash is a plane whose normal lies
// close to the XY plane; 20° from horizontal yields a 15–25° band tilt.
export const FIELD_DIRECTION = [0.8830222215884446, 0.3213938047957942, 0.34202014329552427] as const;
export const FIELD_SCALE = 3.6;
export const FIELD_LUT_SIZE = 32;

export const FIELD_PARAMETERS = Object.freeze({
  coreHalfWidth: 0.09,
  shoulderHalfWidth: 0.28,
  activeThreshold: 0.3,
  undertoneStrength: { light: 0.07, dark: 0.08 },
  activeStrength: { light: 0.66, dark: 0.72 },
  periodsSeconds: { single: 14, complex: 32, master: 32, "brand-wide": 40 },
  transitionSeconds: 0.8,
  reducedTransitionSeconds: 0.16,
});

export interface LutSample {
  color: LinearRgb;
  presence: number;
}

export type PaletteSourceLut = readonly LutSample[];

export interface PhotonicFieldSample {
  scalar: number;
  bandCoordinate: number;
  paletteCoordinate: number;
  activeWeight: number;
  coreWeight: number;
  expressiveWeight: number;
  fieldColor: LinearRgb;
  semanticWeights: readonly number[];
  presence: number;
  transient: boolean;
}

export interface CoverageSummary {
  meanActiveWeight: { min: number; mean: number; max: number };
  aboveThresholdFraction: { min: number; mean: number; max: number };
  threshold: number;
  phases: number;
  samples: number;
  method: "active-persistent-id-scale-squared-proxy";
}

function fract(value: number) {
  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / Math.max(edge1 - edge0, Number.EPSILON)));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, progress: number) {
  return a + (b - a) * progress;
}

export function normalizePhase(value: number) {
  return fract(Number.isFinite(value) ? value : 0);
}

export function actorFieldScalar(position: readonly [number, number, number]) {
  return (
    (position[0] - FIELD_ORIGIN[0]) * FIELD_DIRECTION[0]
    + (position[1] - FIELD_ORIGIN[1]) * FIELD_DIRECTION[1]
    + (position[2] - FIELD_ORIGIN[2]) * FIELD_DIRECTION[2]
  ) / FIELD_SCALE;
}

export function bandEnvelope(scalar: number, phase: number) {
  const distance = Math.abs(fract(scalar - normalizePhase(phase) + 0.5) - 0.5);
  const activeWeight = 1 - smoothstep(
    FIELD_PARAMETERS.coreHalfWidth,
    FIELD_PARAMETERS.shoulderHalfWidth,
    distance,
  );
  const coreWeight = 1 - smoothstep(
    FIELD_PARAMETERS.coreHalfWidth * 0.72,
    FIELD_PARAMETERS.coreHalfWidth,
    distance,
  );
  return { distance, activeWeight, coreWeight };
}

export function sampleCircularLut(lut: PaletteSourceLut, coordinate: number): LutSample {
  if (lut.length === 0) return { color: [0, 0, 0], presence: 0 };
  const scaled = fract(coordinate) * lut.length;
  const index = Math.floor(scaled) % lut.length;
  const next = (index + 1) % lut.length;
  const local = scaled - Math.floor(scaled);
  return {
    color: [
      mix(lut[index].color[0], lut[next].color[0], local),
      mix(lut[index].color[1], lut[next].color[1], local),
      mix(lut[index].color[2], lut[next].color[2], local),
    ],
    presence: mix(lut[index].presence, lut[next].presence, local),
  };
}

export function samplePhotonicField({
  scalar,
  phase,
  palette,
  layer = "full",
  sourceLut,
  paletteProgress = 1,
}: {
  scalar: number;
  phase: number;
  palette: PaletteState;
  layer?: PhotonicColorLayer;
  sourceLut?: PaletteSourceLut;
  paletteProgress?: number;
}): PhotonicFieldSample {
  const safePhase = normalizePhase(phase);
  const bandCoordinate = fract(scalar - safePhase);
  const paletteCoordinate = fract(scalar - safePhase);
  const envelope = bandEnvelope(scalar, safePhase);
  const targetColor = paletteColorLinear(paletteCoordinate, palette);
  const targetPresence = palette.neutralOnly ? 0 : 1;
  const progress = Math.min(1, Math.max(0, paletteProgress));
  const source = sourceLut ? sampleCircularLut(sourceLut, paletteCoordinate) : null;
  const fieldColor: LinearRgb = source ? [
    mix(source.color[0], targetColor[0], progress),
    mix(source.color[1], targetColor[1], progress),
    mix(source.color[2], targetColor[2], progress),
  ] : targetColor;
  const presence = source ? mix(source.presence, targetPresence, progress) : targetPresence;
  const expressiveWeight = layer === "neutral" ? 0 : layer === "undertone" ? 0 : envelope.activeWeight * presence;
  return {
    scalar,
    bandCoordinate,
    paletteCoordinate,
    activeWeight: layer === "neutral" ? 0 : envelope.activeWeight * presence,
    coreWeight: layer === "neutral" ? 0 : envelope.coreWeight * presence,
    expressiveWeight,
    fieldColor,
    semanticWeights: semanticWeightsForCoordinate(paletteCoordinate, palette),
    presence,
    transient: Boolean(source && progress < 1),
  };
}

export function measureStateCoverage(
  state: DecodedState,
  phases = 64,
): CoverageSummary {
  const points: Array<{ scalar: number; area: number }> = [];
  for (let id = 0; id < state.recordCount; id += 1) {
    if (state.status[id] !== 0 || state.scale[id] <= 0) continue;
    const offset = id * 3;
    points.push({
      scalar: actorFieldScalar([
        state.position[offset],
        state.position[offset + 1],
        state.position[offset + 2],
      ]),
      area: state.scale[id] * state.scale[id],
    });
  }
  const active: number[] = [];
  const threshold: number[] = [];
  for (let index = 0; index < phases; index += 1) {
    const phase = index / phases;
    let totalArea = 0;
    let activeArea = 0;
    let thresholdArea = 0;
    for (const point of points) {
      const weight = bandEnvelope(point.scalar, phase).activeWeight;
      totalArea += point.area;
      activeArea += point.area * weight;
      if (weight >= FIELD_PARAMETERS.activeThreshold) thresholdArea += point.area;
    }
    active.push(totalArea > 0 ? activeArea / totalArea : 0);
    threshold.push(totalArea > 0 ? thresholdArea / totalArea : 0);
  }
  const summarize = (values: number[]) => ({
    min: Math.min(...values),
    mean: values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1),
    max: Math.max(...values),
  });
  return {
    meanActiveWeight: summarize(active),
    aboveThresholdFraction: summarize(threshold),
    threshold: FIELD_PARAMETERS.activeThreshold,
    phases,
    samples: points.length,
    method: "active-persistent-id-scale-squared-proxy",
  };
}
