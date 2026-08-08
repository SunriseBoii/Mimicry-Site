import {
  competenceOrder,
  type CompetenceId,
} from "../_brand/color-system";
import type { MotionMode, PhotonicState } from "./types";

export const CORE_COMPETENCE_COLORS = {
  content: "#4C7AFF",
  design: "#9E64EE",
  event: "#F86927",
  games: "#76A713",
  video: "#E34992",
  digital: "#009FAC",
  merch: "#D5A200",
} as const satisfies Record<CompetenceId, `#${string}`>;

/** Art-direction control: 34% active skin, 66% calm mineral surface. */
export const PHOTONIC_ACTIVE_ZONE_RATIO = 0.34;

export type PrototypeMorph =
  | "mimic-core"
  | "aperture"
  | "responsive-field"
  | "convergence"
  | "approach";

export interface PhotonicPresentation {
  label: string;
  morph: PrototypeMorph;
  competences: readonly CompetenceId[];
  palette: readonly `#${string}`[];
  spectralIntensity: number;
}

const uniqueInSystemOrder = (
  competences: readonly CompetenceId[],
): CompetenceId[] =>
  competenceOrder.filter((competence) => competences.includes(competence));

export function resolvePhotonicPresentation(
  state: PhotonicState,
): PhotonicPresentation {
  if (state.kind === "single") {
    const morph =
      state.competence === "video" ? "aperture" : "responsive-field";

    return {
      label: `SINGLE: ${state.competence}`,
      morph,
      competences: [state.competence],
      palette: [CORE_COMPETENCE_COLORS[state.competence]],
      spectralIntensity: 0.9,
    };
  }

  if (state.kind === "complex") {
    const selected = uniqueInSystemOrder(state.competences);

    return {
      label: "COMPLEX: convergence",
      morph: "convergence",
      competences: selected,
      palette: selected.map(
        (competence) => CORE_COMPETENCE_COLORS[competence],
      ),
      spectralIntensity: 0.96,
    };
  }

  if (state.kind === "brand-wide") {
    return {
      label: `BRAND-WIDE: ${state.context}`,
      morph: "approach",
      competences: competenceOrder,
      palette: competenceOrder.map(
        (competence) => CORE_COMPETENCE_COLORS[competence],
      ),
      spectralIntensity: 0.58,
    };
  }

  return {
    label: "MASTER",
    morph: "mimic-core",
    competences: competenceOrder,
    palette: competenceOrder.map(
      (competence) => CORE_COMPETENCE_COLORS[competence],
    ),
    spectralIntensity: 0.82,
  };
}

export interface TransitionPolicy {
  effectiveMode: MotionMode;
  canMorphGeometry: boolean;
  durationMs: number;
  colorLeadMs: number;
}

export function getTransitionPolicy(
  requestedMode: MotionMode,
  systemPrefersReducedMotion: boolean,
): TransitionPolicy {
  const effectiveMode =
    requestedMode === "full" && systemPrefersReducedMotion
      ? "reduced"
      : requestedMode;

  if (effectiveMode === "static") {
    return {
      effectiveMode,
      canMorphGeometry: false,
      durationMs: 0,
      colorLeadMs: 0,
    };
  }

  if (effectiveMode === "reduced") {
    return {
      effectiveMode,
      canMorphGeometry: false,
      durationMs: 180,
      colorLeadMs: 0,
    };
  }

  return {
    effectiveMode,
    canMorphGeometry: true,
    durationMs: 1080,
    colorLeadMs: 140,
  };
}

export function expandPalette(
  palette: readonly `#${string}`[],
  slots = 7,
): `#${string}`[] {
  const safePalette =
    palette.length > 0
      ? palette
      : [CORE_COMPETENCE_COLORS.content];

  return Array.from(
    { length: slots },
    (_, index) => safePalette[index % safePalette.length],
  );
}

