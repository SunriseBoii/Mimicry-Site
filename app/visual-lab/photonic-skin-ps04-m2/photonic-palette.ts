import {
  competenceOrder,
  type CompetenceId,
} from "../../_brand/color-system";
import type { StateEntry } from "../photonic-skin-m4-1/m41-data";

export type CompetenceMask = number;
export type LinearRgb = readonly [number, number, number];

export interface CompetenceColorToken {
  id: CompetenceId;
  bit: number;
  hex: string;
  linear: LinearRgb;
}

export interface PaletteState {
  mask: CompetenceMask;
  selected: readonly CompetenceId[];
  selectedIndices: readonly number[];
  tokens: readonly CompetenceColorToken[];
  neutralOnly: boolean;
}

export const PHOTONIC_COLOR_HEX: Readonly<Record<CompetenceId, string>> = Object.freeze({
  content: "#4C7AFF",
  design: "#9E64EE",
  event: "#F86927",
  games: "#76A713",
  video: "#E34992",
  digital: "#009FAC",
  merch: "#D5A200",
});

export const COMPETENCE_BIT: Readonly<Record<CompetenceId, number>> = Object.freeze(
  Object.fromEntries(competenceOrder.map((id, index) => [id, 1 << index])) as Record<CompetenceId, number>,
);

export const ALL_COMPETENCE_MASK = (1 << competenceOrder.length) - 1;
export const PALETTE_BLEND_START = 0.72;

function channelToLinear(value: number) {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function srgbHexToLinear(hex: string): LinearRgb {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid six-digit sRGB token: ${hex}`);
  return [
    channelToLinear(Number.parseInt(hex.slice(1, 3), 16)),
    channelToLinear(Number.parseInt(hex.slice(3, 5), 16)),
    channelToLinear(Number.parseInt(hex.slice(5, 7), 16)),
  ];
}

export const PHOTONIC_COLOR_TOKENS: readonly CompetenceColorToken[] = Object.freeze(
  competenceOrder.map((id) => Object.freeze({
    id,
    bit: COMPETENCE_BIT[id],
    hex: PHOTONIC_COLOR_HEX[id],
    linear: srgbHexToLinear(PHOTONIC_COLOR_HEX[id]),
  })),
);

export function validateCompetenceMask(value: unknown): CompetenceMask {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new TypeError("Competence mask must be a finite integer");
  }
  if (value < 0) throw new RangeError("Competence mask cannot be negative");
  const unknown = value & ~ALL_COMPETENCE_MASK;
  if (unknown !== 0) throw new RangeError(`Competence mask contains unknown bits: 0x${unknown.toString(16)}`);
  return value;
}

export function maskFromCompetencies(values: readonly string[]): CompetenceMask {
  let mask = 0;
  for (const value of values) {
    const index = competenceOrder.indexOf(value as CompetenceId);
    if (index < 0) throw new RangeError(`Unknown competence name: ${value}`);
    mask |= 1 << index;
  }
  return mask;
}

export function competenciesFromMask(value: unknown): readonly CompetenceId[] {
  const mask = validateCompetenceMask(value);
  return competenceOrder.filter((id) => (mask & COMPETENCE_BIT[id]) !== 0);
}

export function paletteStateForMask(value: unknown): PaletteState {
  const mask = validateCompetenceMask(value);
  const selectedIndices = competenceOrder
    .map((_, index) => index)
    .filter((index) => (mask & (1 << index)) !== 0);
  const selected = selectedIndices.map((index) => competenceOrder[index]);
  return Object.freeze({
    mask,
    selected: Object.freeze(selected),
    selectedIndices: Object.freeze(selectedIndices),
    tokens: Object.freeze(selectedIndices.map((index) => PHOTONIC_COLOR_TOKENS[index])),
    neutralOnly: selected.length === 0,
  });
}

export function paletteMaskForState(entry: Pick<StateEntry, "stateRole" | "competencyIds">) {
  if (entry.stateRole === "master" || entry.stateRole === "brand_wide") return ALL_COMPETENCE_MASK;
  return maskFromCompetencies(entry.competencyIds);
}

function fract(value: number) {
  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / Math.max(edge1 - edge0, Number.EPSILON)));
  return t * t * (3 - 2 * t);
}

export function semanticWeightsForCoordinate(coordinate: number, state: PaletteState) {
  const weights = [0, 0, 0, 0, 0, 0, 0];
  const count = state.selectedIndices.length;
  if (count === 0) return weights;
  if (count === 1) {
    weights[state.selectedIndices[0]] = 1;
    return weights;
  }
  const scaled = fract(Number.isFinite(coordinate) ? coordinate : 0) * count;
  const ordinal = Math.min(count - 1, Math.floor(scaled));
  const local = scaled - ordinal;
  const blend = smoothstep(PALETTE_BLEND_START, 1, local);
  const current = state.selectedIndices[ordinal];
  const next = state.selectedIndices[(ordinal + 1) % count];
  weights[current] = 1 - blend;
  weights[next] += blend;
  return weights;
}

export function paletteColorLinear(coordinate: number, state: PaletteState): LinearRgb {
  const weights = semanticWeightsForCoordinate(coordinate, state);
  const result = [0, 0, 0];
  for (let index = 0; index < weights.length; index += 1) {
    const token = PHOTONIC_COLOR_TOKENS[index].linear;
    result[0] += token[0] * weights[index];
    result[1] += token[1] * weights[index];
    result[2] += token[2] * weights[index];
  }
  return result as [number, number, number];
}
