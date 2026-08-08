import type {
  MotionMode,
  PhotonicState,
  VisualTheme,
} from "../../_visual-actor/types";

export type LabStateId =
  | "master"
  | "single-video"
  | "single-digital"
  | "complex"
  | "contacts";
export type PreviewMode = "desktop" | "mobile";

export interface LabStateOption {
  id: LabStateId;
  label: string;
  state: PhotonicState;
}

export interface InitialLabSettings {
  stateId: LabStateId;
  theme: VisualTheme;
  motionMode: MotionMode;
  previewMode: PreviewMode;
}

export const LAB_STATE_OPTIONS: readonly LabStateOption[] = [
  { id: "master", label: "MASTER", state: { kind: "master" } },
  {
    id: "single-video",
    label: "SINGLE: Video",
    state: { kind: "single", competence: "video" },
  },
  {
    id: "single-digital",
    label: "SINGLE: Digital",
    state: { kind: "single", competence: "digital" },
  },
  {
    id: "complex",
    label: "COMPLEX: Content + Design + Digital",
    state: {
      kind: "complex",
      competences: ["content", "design", "digital"],
      morph: "convergence",
    },
  },
  {
    id: "contacts",
    label: "BRAND-WIDE: Contacts",
    state: { kind: "brand-wide", context: "contacts" },
  },
] as const;

const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export function parseInitialLabSettings(
  searchParams: Record<string, string | string[] | undefined>,
): InitialLabSettings {
  const requestedState = firstValue(searchParams.state);
  const requestedTheme = firstValue(searchParams.theme);
  const requestedMotion = firstValue(searchParams.motion);
  const requestedPreview = firstValue(searchParams.preview);

  return {
    stateId: LAB_STATE_OPTIONS.some((option) => option.id === requestedState)
      ? (requestedState as LabStateId)
      : "master",
    theme: requestedTheme === "dark" ? "dark" : "light",
    motionMode:
      requestedMotion === "reduced" || requestedMotion === "static"
        ? requestedMotion
        : "full",
    previewMode: requestedPreview === "mobile" ? "mobile" : "desktop",
  };
}

