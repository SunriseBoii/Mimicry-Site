import type { CompetenceId } from "../../../_brand/color-system";
import { COMPETENCE_BIT, type CompetenceMask } from "../../photonic-skin-ps04-m2/photonic-palette";
import { SINGLE_STATE_IDS } from "./builder-ids";
import { HOVER_GEOMETRY_INFLUENCE, HOVER_PALETTE_INTENSITY, HOVER_ROTATION_BIAS_DEG } from "./builder-ids";

export interface BuilderHoverPreview {
  competency: CompetenceId | null;
  targetStateId: string | null;
  geometryInfluence: number;
  paletteIntensity: number;
  rotationBiasDeg: number;
  active: boolean;
}

export const IDLE_HOVER_PREVIEW: BuilderHoverPreview = Object.freeze({
  competency: null,
  targetStateId: null,
  geometryInfluence: 0,
  paletteIntensity: 0,
  rotationBiasDeg: 0,
  active: false,
});

export function hoverPreviewFor(
  competency: CompetenceId | null,
  opts: { reducedMotion: boolean; staticMode: boolean; pointerType: "mouse" | "pen" | "touch" | "keyboard" | null },
): BuilderHoverPreview {
  if (!competency || opts.staticMode || opts.pointerType === "touch") return IDLE_HOVER_PREVIEW;
  if (opts.reducedMotion) {
    return {
      competency,
      targetStateId: SINGLE_STATE_IDS[competency],
      geometryInfluence: 0,
      paletteIntensity: 0,
      rotationBiasDeg: 0,
      active: true,
    };
  }
  return {
    competency,
    targetStateId: SINGLE_STATE_IDS[competency],
    geometryInfluence: HOVER_GEOMETRY_INFLUENCE,
    paletteIntensity: HOVER_PALETTE_INTENSITY,
    rotationBiasDeg: HOVER_ROTATION_BIAS_DEG,
    active: true,
  };
}

export function previewPaletteMask(base: CompetenceMask, competency: CompetenceId | null, intensity: number): CompetenceMask {
  if (!competency || intensity <= 0) return base;
  return base | COMPETENCE_BIT[competency];
}
