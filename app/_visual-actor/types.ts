import type { CompetenceId } from "../_brand/color-system";

export type { CompetenceId };

export type PhotonicState =
  | { kind: "master" }
  | { kind: "single"; competence: CompetenceId }
  | {
      kind: "complex";
      competences: readonly CompetenceId[];
      morph: "convergence";
    }
  | {
      kind: "brand-wide";
      context: "about" | "contacts" | "procurement";
    };

export type MotionMode = "full" | "reduced" | "static";
export type VisualTheme = "light" | "dark";

/**
 * Shared semantic boundary for every Mimicry visual actor.
 * Pages describe meaning here and never reach into mesh, rig or shader details.
 */
export interface VisualActorProps {
  state: PhotonicState;
  theme: VisualTheme;
  motionMode: MotionMode;
  className?: string;
}

