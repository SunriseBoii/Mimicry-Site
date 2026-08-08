/** PS-03.M Matter & Skin Lab: option lists and URL parsing (unit-testable). */

export const LAB_STATES = [
  { id: "sphere", label: "Sphere", progress: 0 },
  { id: "book", label: "Book", progress: 1 },
  { id: "game", label: "Gamepad + Queen", progress: 2 },
] as const;

export type LabStateId = (typeof LAB_STATES)[number]["id"];
export type PreviewMode = "desktop" | "mobile";
export type MotionProfile = "full" | "reduced";
export type DebugMode = "none" | "components" | "reserve";

export interface InitialMatterLabSettings {
  stateId: LabStateId;
  previewMode: PreviewMode;
  motionProfile: MotionProfile;
  debugMode: DebugMode;
}

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export function parseInitialMatterLabSettings(
  searchParams: Record<string, string | string[] | undefined>,
): InitialMatterLabSettings {
  const state = first(searchParams.state);
  const preview = first(searchParams.preview);
  const motion = first(searchParams.motion);
  const debug = first(searchParams.debug);
  return {
    stateId: LAB_STATES.some((option) => option.id === state)
      ? (state as LabStateId)
      : "sphere",
    previewMode: preview === "mobile" ? "mobile" : "desktop",
    motionProfile: motion === "reduced" ? "reduced" : "full",
    debugMode:
      debug === "components" || debug === "reserve" ? debug : "none",
  };
}

/** Full cycle duration in seconds at speed 1 (three segments). */
export const CYCLE_SECONDS = 27;
export const CYCLE_SPEED = 3 / CYCLE_SECONDS; // progress units per second
