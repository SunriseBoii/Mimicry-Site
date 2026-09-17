import type { CompetenceId } from "../../../_brand/color-system";

/** Frozen canonical state-ID order. UI button order may differ and must not change IDs. */
export const CANONICAL_COMPETENCY_ORDER = [
  "content",
  "design",
  "digital",
  "event",
  "games",
  "merch",
  "video",
] as const;

export type BuilderCompetency = (typeof CANONICAL_COMPETENCY_ORDER)[number];

export const BUILDER_TASK_IDS = [
  "explain_changes",
  "engage_and_unite",
  "learn_and_practice",
  "company_and_culture",
] as const;

export type BuilderTaskId = (typeof BUILDER_TASK_IDS)[number];

export const BUILDER_SCREENS = ["03.1", "03.2", "03.3", "03.3A", "03.3B"] as const;
export type BuilderScreen = (typeof BUILDER_SCREENS)[number];

export const MASTER_STATE_ID = "master-neutral";

export const SINGLE_STATE_IDS: Readonly<Record<BuilderCompetency, string>> = Object.freeze({
  content: "single-content",
  design: "single-design",
  digital: "single-digital",
  event: "single-event",
  games: "single-games",
  merch: "single-merch",
  video: "single-video",
});

export const EXISTING_M55_PREFIX_SETS: readonly (readonly BuilderCompetency[])[] = Object.freeze([
  ["content", "design"],
  ["content", "design", "digital"],
  ["content", "design", "digital", "event"],
  ["content", "design", "digital", "event", "games"],
  ["content", "design", "digital", "event", "games", "merch"],
]);

export const ALL_SEVEN: readonly BuilderCompetency[] = CANONICAL_COMPETENCY_ORDER;

export const M55_NAMESPACE = "ps-04-m5-5";
export const M61_NAMESPACE = "ps-04-m6-1";
export const M61_DATA_BASE = "/photonic-skin/ps-04-m6-1";
export const M61_DELTA_MANIFEST_PATH = `${M61_DATA_BASE}/manifests/ps04m61-delta-manifest.json`;
export const M55_DATA_BASE = "/photonic-skin/ps-04-m5-5";
export const M55_MANIFEST_PATH = `${M55_DATA_BASE}/manifests/ps04m55-manifest.json`;
export const PS04_RELEASE_GEOMETRY_BASE = "/photonic-skin/ps-04-final-r1";
export const PS04_RELEASE_GEOMETRY_MANIFEST_PATH = `${PS04_RELEASE_GEOMETRY_BASE}/manifest.json`;

export const FROZEN_EVENT_ID = "EVENT_A_R2";
export const FROZEN_EVENT_HASH = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b";
export const FROZEN_VIDEO_ID = "VIDEO_COMBO_40_R1";
export const FROZEN_VIDEO_HASH = "2d6957815b6f58f87f1709e0378313cba271530b8fb0e02282b556780448a873";

export const HOVER_GEOMETRY_INFLUENCE = 0.12;
export const HOVER_PALETTE_INTENSITY = 0.35;
export const HOVER_ROTATION_BIAS_DEG = 1;

const PREFIX_KEYS = new Set(EXISTING_M55_PREFIX_SETS.map((set) => set.join("-")));

export function isBuilderCompetency(value: string): value is BuilderCompetency {
  return (CANONICAL_COMPETENCY_ORDER as readonly string[]).includes(value);
}

export function isBuilderTaskId(value: string): value is BuilderTaskId {
  return (BUILDER_TASK_IDS as readonly string[]).includes(value);
}

export function canonicalizeCompetencySet(source: readonly string[]): BuilderCompetency[] {
  const unique = new Set<BuilderCompetency>();
  for (const value of source) {
    if (!isBuilderCompetency(value)) throw new RangeError(`Unknown competency: ${value}`);
    unique.add(value);
  }
  return CANONICAL_COMPETENCY_ORDER.filter((id) => unique.has(id));
}

export function setKey(set: readonly BuilderCompetency[]): string {
  return set.join("-");
}

export function gatherStateId(set: readonly BuilderCompetency[]): string {
  return `complex-gather-${setKey(set)}`;
}

export function driveStateId(set: readonly BuilderCompetency[]): string {
  return `complex-drive-${setKey(set)}`;
}

export function isExistingM55PrefixSet(set: readonly BuilderCompetency[]): boolean {
  return PREFIX_KEYS.has(setKey(set));
}

export function isAllSeven(set: readonly BuilderCompetency[]): boolean {
  return set.length === ALL_SEVEN.length && setKey(set) === setKey(ALL_SEVEN);
}

export function namespaceForStateId(stateId: string): typeof M55_NAMESPACE | typeof M61_NAMESPACE {
  if (stateId === MASTER_STATE_ID) return M55_NAMESPACE;
  if (stateId.startsWith("single-")) return M55_NAMESPACE;
  const gatherPrefix = "complex-gather-";
  const drivePrefix = "complex-drive-";
  if (stateId.startsWith(gatherPrefix) || stateId.startsWith(drivePrefix)) {
    const stem = stateId.startsWith(gatherPrefix)
      ? stateId.slice(gatherPrefix.length)
      : stateId.slice(drivePrefix.length);
    if (PREFIX_KEYS.has(stem)) return M55_NAMESPACE;
    return M61_NAMESPACE;
  }
  return M55_NAMESPACE;
}

export function enumerateNonEmptyCompetencySets(): BuilderCompetency[][] {
  const n = CANONICAL_COMPETENCY_ORDER.length;
  const output: BuilderCompetency[][] = [];
  for (let mask = 1; mask < 1 << n; mask += 1) {
    output.push(CANONICAL_COMPETENCY_ORDER.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return output;
}

export function enumerateMultiCompetencySets(): BuilderCompetency[][] {
  return enumerateNonEmptyCompetencySets().filter((set) => set.length >= 2);
}

export function asCompetenceIds(set: readonly BuilderCompetency[]): CompetenceId[] {
  return [...set] as CompetenceId[];
}
