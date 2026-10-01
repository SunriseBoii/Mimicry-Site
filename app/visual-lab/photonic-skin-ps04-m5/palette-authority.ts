/**
 * M4-only palette authority. The frozen M3 driver remains the color-phase
 * clock; this module owns the displayed LUT that the shader actually binds.
 *
 * Settled SINGLE must keep the committed target LUT after ownership turns
 * off. The R3 rollback mixed the initial all-seven source LUT at
 * uPaletteProgress=0 once vPaletteOwnership was disabled.
 */

import {
  FIELD_LUT_SIZE,
  type LutSample,
} from "../photonic-skin-ps04-m2/photonic-field";
import {
  ALL_COMPETENCE_MASK,
  paletteColorLinear,
  paletteStateForMask,
  semanticWeightsForCoordinate,
  type CompetenceMask,
} from "../photonic-skin-ps04-m2/photonic-palette";
import type { PhotonicPaletteDriver } from "../photonic-skin-ps04-m3/palette-driver";
import type { ActorSlot } from "./transition-coordinator";
import type { FitProfile } from "./site-fit";

export interface SettledActorState {
  geometryId: string;
  paletteMask: CompetenceMask;
  paletteLut: LutSample[];
  paletteLutHash: string;
  slot: ActorSlot;
  fit: number;
  fitProfile: FitProfile;
}

export interface ActiveActorTransition {
  revision: number;
  from: SettledActorState;
  to: SettledActorState;
  geometryProgress: number;
  paletteProgress: number;
  siteProgress: number;
  programReady: boolean;
}

export interface PaletteMaterialSnapshot {
  revision: number;
  settledGeometryId: string | null;
  settledMask: CompetenceMask;
  settledLutHash: string;
  sourceGeometryId: string | null;
  targetGeometryId: string | null;
  sourceMask: CompetenceMask;
  targetMask: CompetenceMask;
  sourceLutHash: string;
  targetLutHash: string;
  shaderBaseLutHash: string;
  shaderMask: CompetenceMask;
  shaderProgress: number;
  shaderSourceLut: LutSample[];
  ownershipEnabled: boolean;
  paletteProgress: number;
  geometryProgress: number;
  siteProgress: number;
  phase: string;
  programReady: boolean;
  activeTransition: ActiveActorTransition | null;
  colorPhase: number;
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function lutForMask(mask: CompetenceMask): LutSample[] {
  const palette = paletteStateForMask(mask);
  return Array.from({ length: FIELD_LUT_SIZE }, (_, index): LutSample => ({
    color: paletteColorLinear(index / FIELD_LUT_SIZE, palette),
    presence: palette.neutralOnly ? 0 : 1,
  }));
}

export function hashLut(lut: readonly LutSample[]): string {
  let hash = 2166136261;
  for (const sample of lut) {
    hash ^= Math.round(sample.color[0] * 1_000_000);
    hash = Math.imul(hash, 16777619);
    hash ^= Math.round(sample.color[1] * 1_000_000);
    hash = Math.imul(hash, 16777619);
    hash ^= Math.round(sample.color[2] * 1_000_000);
    hash = Math.imul(hash, 16777619);
    hash ^= Math.round(sample.presence * 1_000_000);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function mixLuts(from: readonly LutSample[], to: readonly LutSample[], progress: number): LutSample[] {
  const t = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const count = Math.min(from.length, to.length, FIELD_LUT_SIZE);
  return Array.from({ length: count }, (_, index): LutSample => {
    const source = from[index]!;
    const target = to[index]!;
    return {
    color: [
      mix(source.color[0], target.color[0], t),
      mix(source.color[1], target.color[1], t),
      mix(source.color[2], target.color[2], t),
    ] as LutSample["color"],
      presence: mix(source.presence, target.presence, t),
    };
  });
}

export function cloneLut(lut: readonly LutSample[]): LutSample[] {
  return lut.map((sample) => ({
    color: [sample.color[0], sample.color[1], sample.color[2]] as const,
    presence: sample.presence,
  }));
}

export function lutsEqual(left: readonly LutSample[], right: readonly LutSample[], epsilon = 1e-5) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    if (Math.abs(a.presence - b.presence) > epsilon) return false;
    if (Math.abs(a.color[0] - b.color[0]) > epsilon) return false;
    if (Math.abs(a.color[1] - b.color[1]) > epsilon) return false;
    if (Math.abs(a.color[2] - b.color[2]) > epsilon) return false;
  }
  return true;
}

export function maxUnselectedCompetenceWeight(mask: CompetenceMask, coordinate = 0.37) {
  const state = paletteStateForMask(mask);
  const weights = semanticWeightsForCoordinate(coordinate, state);
  let maximum = 0;
  for (let index = 0; index < weights.length; index += 1) {
    if ((mask & (1 << index)) !== 0) continue;
    maximum = Math.max(maximum, weights[index] ?? 0);
  }
  return maximum;
}

export function lutHasAllSevenStripes(lut: readonly LutSample[], epsilon = 0.04) {
  const allSeven = lutForMask(ALL_COMPETENCE_MASK);
  let matches = 0;
  for (let index = 0; index < Math.min(lut.length, allSeven.length); index += 1) {
    const sample = lut[index]!;
    const reference = allSeven[index]!;
    const delta = Math.abs(sample.color[0] - reference.color[0])
      + Math.abs(sample.color[1] - reference.color[1])
      + Math.abs(sample.color[2] - reference.color[2]);
    if (delta < epsilon) matches += 1;
  }
  return matches >= Math.floor(FIELD_LUT_SIZE * 0.7);
}

/**
 * Reproduce the R3 shader mix when ownership is off: mix(sourceLut, targetField, progress).
 * If progress is 0, the source LUT is what the user sees.
 */
export function shaderDisplayedLut(args: {
  makeLut?: typeof lutForMask;
  sourceLut: readonly LutSample[];
  targetMask: CompetenceMask;
  progress: number;
  ownershipEnabled: boolean;
  ownershipWeight?: number;
}) {
  const targetLut = (args.makeLut ?? lutForMask)(args.targetMask);
  if (args.ownershipEnabled) {
    return mixLuts(args.sourceLut, targetLut, args.ownershipWeight ?? args.progress);
  }
  return mixLuts(args.sourceLut, targetLut, args.progress);
}

export function commitDriverToMask(driver: PhotonicPaletteDriver, mask: CompetenceMask) {
  driver.setMask(mask, { mode: "immediate" });
  const snapshot = driver.snapshot();
  return {
    mask: snapshot.palette.mask,
    progress: snapshot.paletteProgress,
    lutHash: hashLut(snapshot.sourceLut),
    phase: snapshot.phase,
  };
}

export function settledMaterialSnapshot(args: {
  revision: number;
  geometryId: string | null;
  mask: CompetenceMask;
  slot: ActorSlot;
  fit: number;
  fitProfile: FitProfile;
  colorPhase: number;
}): PaletteMaterialSnapshot {
  const lut = lutForMask(args.mask);
  const lutHash = hashLut(lut);
  return {
    revision: args.revision,
    settledGeometryId: args.geometryId,
    settledMask: args.mask,
    settledLutHash: lutHash,
    sourceGeometryId: args.geometryId,
    targetGeometryId: args.geometryId,
    sourceMask: args.mask,
    targetMask: args.mask,
    sourceLutHash: lutHash,
    targetLutHash: lutHash,
    shaderBaseLutHash: lutHash,
    shaderMask: args.mask,
    shaderProgress: 1,
    shaderSourceLut: lut,
    ownershipEnabled: false,
    paletteProgress: 1,
    geometryProgress: 1,
    siteProgress: 1,
    phase: "settle",
    programReady: true,
    activeTransition: null,
    colorPhase: args.colorPhase,
  };
}

export const SINGLE_MASKS = [1, 2, 4, 8, 16, 32, 64] as const;

export function assertSettledInvariants(snapshot: PaletteMaterialSnapshot) {
  return {
    settledMaskEqualsTarget: snapshot.settledMask === snapshot.targetMask,
    settledLutEqualsTarget: snapshot.settledLutHash === snapshot.targetLutHash,
    shaderBaseEqualsTarget: snapshot.shaderBaseLutHash === snapshot.targetLutHash,
    activeTransitionNull: snapshot.activeTransition === null,
    ownershipDisabled: snapshot.ownershipEnabled === false,
    shaderProgressLocked: snapshot.shaderProgress === 1,
    shaderMaskEqualsSettled: snapshot.shaderMask === snapshot.settledMask,
  };
}
