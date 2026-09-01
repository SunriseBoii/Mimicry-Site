export const VIDEO_VARIANTS = [
  "combo-30-r1",
  "combo-20-r1",
  "combo-40-r1",
  "combo-20",
  "combo-30",
  "combo-40",
  "camera-20",
  "camera-30",
  "camera-40",
  "baseline",
] as const;
export type VideoVariantId = (typeof VIDEO_VARIANTS)[number];

export const COMBO_R1_VIDEO_VARIANTS = ["combo-20-r1", "combo-30-r1", "combo-40-r1"] as const;
export const COMBO_BEFORE_VIDEO_VARIANTS = ["combo-20", "combo-30", "combo-40"] as const;
export const COMBO_VIDEO_VARIANTS = COMBO_R1_VIDEO_VARIANTS;
export const CAMERA_VIDEO_VARIANTS = ["camera-20", "camera-30", "camera-40"] as const;
export const HISTORICAL_VIDEO_VARIANTS = ["baseline"] as const;
export const ORIGINAL_M53_VIDEO_VARIANTS = ["baseline", "combo-20", "combo-30", "combo-40", "camera-20", "camera-30", "camera-40"] as const;

export const SANDBOX_VIEWS = ["canonical", "alternate", "opposite", "side", "top"] as const;
export type SandboxViewId = (typeof SANDBOX_VIEWS)[number];

export const SANDBOX_THEMES = ["light", "dark"] as const;
export type SandboxThemeId = (typeof SANDBOX_THEMES)[number];

export const SANDBOX_MODES = ["settled", "transition"] as const;
export type SandboxPlayMode = (typeof SANDBOX_MODES)[number];

export const SANDBOX_ISOLATES = ["full", "camera", "clapperboard", "hinge", "hinged-bar"] as const;
export type SandboxIsolateId = (typeof SANDBOX_ISOLATES)[number];

export const SANDBOX_DEFAULTS = {
  variant: "combo-30-r1",
  view: "canonical",
  theme: "light",
  labels: false,
  mode: "settled",
  isolate: "full",
} as const;

type VariantMeta = {
  id: VideoVariantId;
  short: string;
  title: string;
  hudName: string;
  loadingName: string;
  decision: string;
  description: string;
  group: "r1" | "before" | "camera" | "historical";
  signedYawDegrees: number | null;
  clapperOpenDegrees: number | null;
  hingeStatus: "connected / pending human review" | "connected / selected M5 Video candidate" | "detached" | "n/a";
};

export const VARIANT_META: Record<VideoVariantId, VariantMeta> = {
  "combo-20-r1": {
    id: "combo-20-r1",
    short: "20°",
    title: "20°",
    hudName: "VIDEO_COMBO_20_R1",
    loadingName: "VIDEO_COMBO_20_R1",
    decision: "hinge connected · pending human review · not a winner",
    description: "R1: камера + хлопушка с соединённым шарниром, yaw −20°",
    group: "r1",
    signedYawDegrees: -20,
    clapperOpenDegrees: 30,
    hingeStatus: "connected / pending human review",
  },
  "combo-30-r1": {
    id: "combo-30-r1",
    short: "30°",
    title: "30°",
    hudName: "VIDEO_COMBO_30_R1",
    loadingName: "VIDEO_COMBO_30_R1",
    decision: "hinge connected · pending human review · default review, not a winner",
    description: "R1: камера + хлопушка с соединённым шарниром, yaw −30° · default review",
    group: "r1",
    signedYawDegrees: -30,
    clapperOpenDegrees: 30,
    hingeStatus: "connected / pending human review",
  },
  "combo-40-r1": {
    id: "combo-40-r1",
    short: "40°",
    title: "40°",
    hudName: "VIDEO_COMBO_40_R1",
    loadingName: "VIDEO_COMBO_40_R1",
    decision: "HUMAN PASS · SELECTED M5 VIDEO CANDIDATE · camera+clapperboard · promotion deferred to M5.5",
    description: "R1 selected: камера + хлопушка, yaw −40°, clapper open 30° · not canonical",
    group: "r1",
    signedYawDegrees: -40,
    clapperOpenDegrees: 30,
    hingeStatus: "connected / selected M5 Video candidate",
  },
  "combo-20": {
    id: "combo-20",
    short: "20°",
    title: "20°",
    hudName: "VIDEO_COMBO_20",
    loadingName: "VIDEO_COMBO_20",
    decision: "rejected visual evidence · bar detached from board",
    description: "M5.3: камера + хлопушка, брусок отделён, yaw −20°",
    group: "before",
    signedYawDegrees: -20,
    clapperOpenDegrees: 34,
    hingeStatus: "detached",
  },
  "combo-30": {
    id: "combo-30",
    short: "30°",
    title: "30°",
    hudName: "VIDEO_COMBO_30",
    loadingName: "VIDEO_COMBO_30",
    decision: "rejected visual evidence · bar detached from board",
    description: "M5.3: камера + хлопушка, брусок отделён, yaw −30°",
    group: "before",
    signedYawDegrees: -30,
    clapperOpenDegrees: 34,
    hingeStatus: "detached",
  },
  "combo-40": {
    id: "combo-40",
    short: "40°",
    title: "40°",
    hudName: "VIDEO_COMBO_40",
    loadingName: "VIDEO_COMBO_40",
    decision: "rejected visual evidence · bar detached from board",
    description: "M5.3: камера + хлопушка, брусок отделён, yaw −40°",
    group: "before",
    signedYawDegrees: -40,
    clapperOpenDegrees: 34,
    hingeStatus: "detached",
  },
  "camera-20": {
    id: "camera-20",
    short: "20°",
    title: "20°",
    hudName: "VIDEO_CAMERA_20",
    loadingName: "VIDEO_CAMERA_20",
    decision: "camera-only control · human review pending",
    description: "Только камера, yaw −20°",
    group: "camera",
    signedYawDegrees: -20,
    clapperOpenDegrees: null,
    hingeStatus: "n/a",
  },
  "camera-30": {
    id: "camera-30",
    short: "30°",
    title: "30°",
    hudName: "VIDEO_CAMERA_30",
    loadingName: "VIDEO_CAMERA_30",
    decision: "camera-only control · human review pending",
    description: "Только камера, yaw −30°",
    group: "camera",
    signedYawDegrees: -30,
    clapperOpenDegrees: null,
    hingeStatus: "n/a",
  },
  "camera-40": {
    id: "camera-40",
    short: "40°",
    title: "40°",
    hudName: "VIDEO_CAMERA_40",
    loadingName: "VIDEO_CAMERA_40",
    decision: "camera-only control · human review pending",
    description: "Только камера, yaw −40°",
    group: "camera",
    signedYawDegrees: -40,
    clapperOpenDegrees: null,
    hingeStatus: "n/a",
  },
  baseline: {
    id: "baseline",
    short: "BASELINE",
    title: "Исходный Video",
    hudName: "VIDEO_BASELINE",
    loadingName: "VIDEO_BASELINE",
    decision: "historical reference only · human review pending",
    description: "Замороженный SINGLE Video: камера + хлопушка, читается как книга",
    group: "historical",
    signedYawDegrees: null,
    clapperOpenDegrees: null,
    hingeStatus: "n/a",
  },
};

export const VIEW_LABELS: Record<SandboxViewId, string> = {
  canonical: "Канонический",
  alternate: "Альтернативный",
  opposite: "С противоположной стороны",
  side: "Сбоку",
  top: "Сверху",
};

export const ISOLATE_LABELS: Record<SandboxIsolateId, string> = {
  full: "Полная композиция",
  camera: "Камера",
  clapperboard: "Хлопушка",
  hinge: "Крупный план шарнира",
  "hinged-bar": "Поднятый брусок",
};

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): { value: T; invalid: boolean } {
  if (!value || value.trim() === "") return { value: fallback, invalid: false };
  const normalized = value.trim().toLowerCase();
  if ((allowed as readonly string[]).includes(normalized)) return { value: normalized as T, invalid: false };
  return { value: fallback, invalid: true };
}

function parseLabels(raw: string | null): { labels: boolean; invalid: boolean } {
  if (raw == null || raw.trim() === "") return { labels: SANDBOX_DEFAULTS.labels, invalid: false };
  const normalized = raw.trim().toLowerCase();
  if (normalized === "0" || normalized === "false") return { labels: false, invalid: false };
  if (normalized === "1" || normalized === "true") return { labels: true, invalid: false };
  return { labels: SANDBOX_DEFAULTS.labels, invalid: true };
}

export function parseSandboxQuery(search: string) {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const variant = pick(query.get("variant"), VIDEO_VARIANTS, SANDBOX_DEFAULTS.variant);
  const view = pick(query.get("view"), SANDBOX_VIEWS, SANDBOX_DEFAULTS.view);
  const theme = pick(query.get("theme"), SANDBOX_THEMES, SANDBOX_DEFAULTS.theme);
  const mode = pick(query.get("mode"), SANDBOX_MODES, SANDBOX_DEFAULTS.mode);
  const labels = parseLabels(query.get("labels"));
  const isolate = pick(query.get("isolate"), SANDBOX_ISOLATES, SANDBOX_DEFAULTS.isolate);
  return {
    variant: variant.value,
    view: view.value,
    theme: theme.value,
    labels: labels.labels,
    mode: mode.value,
    isolate: isolate.value,
    invalidVariant: variant.invalid,
    invalidView: view.invalid,
    invalidTheme: theme.invalid,
    invalidLabels: labels.invalid,
    invalidMode: mode.invalid,
    invalidIsolate: isolate.invalid,
  };
}

export function sandboxSearch(args: {
  variant: VideoVariantId;
  view: SandboxViewId;
  theme: SandboxThemeId;
  labels: boolean;
  mode: SandboxPlayMode;
  isolate?: SandboxIsolateId;
}) {
  const query = new URLSearchParams();
  query.set("variant", args.variant);
  query.set("view", args.view);
  query.set("theme", args.theme);
  query.set("labels", args.labels ? "1" : "0");
  query.set("mode", args.mode);
  if (args.isolate && args.isolate !== "full") query.set("isolate", args.isolate);
  return `?${query.toString()}`;
}

const M53 = "/photonic-skin/ps-04-m5-3/variants";
const R1 = "/photonic-skin/ps-04-m5-3-r1/variants";

export const VARIANT_BUFFER_PATH: Record<VideoVariantId, string> = {
  "combo-20-r1": `${R1}/combo-20-r1/single-video.state.bin`,
  "combo-30-r1": `${R1}/combo-30-r1/single-video.state.bin`,
  "combo-40-r1": `${R1}/combo-40-r1/single-video.state.bin`,
  "combo-20": `${M53}/combo-20/single-video.state.bin`,
  "combo-30": `${M53}/combo-30/single-video.state.bin`,
  "combo-40": `${M53}/combo-40/single-video.state.bin`,
  "camera-20": `${M53}/camera-20/single-video.state.bin`,
  "camera-30": `${M53}/camera-30/single-video.state.bin`,
  "camera-40": `${M53}/camera-40/single-video.state.bin`,
  baseline: `${M53}/baseline/single-video.state.bin`,
};

export const VARIANT_COMPONENT_MAP_PATH: Record<VideoVariantId, string> = {
  "combo-20-r1": `${R1}/combo-20-r1/component-map.json`,
  "combo-30-r1": `${R1}/combo-30-r1/component-map.json`,
  "combo-40-r1": `${R1}/combo-40-r1/component-map.json`,
  "combo-20": `${M53}/combo-20/component-map.json`,
  "combo-30": `${M53}/combo-30/component-map.json`,
  "combo-40": `${M53}/combo-40/component-map.json`,
  "camera-20": `${M53}/camera-20/component-map.json`,
  "camera-30": `${M53}/camera-30/component-map.json`,
  "camera-40": `${M53}/camera-40/component-map.json`,
  baseline: `${M53}/baseline/component-map.json`,
};

export const FROZEN_CAMERAS = {
  canonical: [2.8, -7.8, 4.6] as const,
  alternate: [5.6, -6.4, 4.1] as const,
  opposite: [-5.6, 6.4, 4.1] as const,
  side: [8.8, 0.0, 1.4] as const,
  top: [0.01, -0.01, 9.4] as const,
};

export const HINGE_CLOSEUP_CAMERA = [1.55, -2.15, 1.85] as const;

export function yawLabel(variant: VideoVariantId) {
  const yaw = VARIANT_META[variant].signedYawDegrees;
  return yaw == null ? "frozen (no extra yaw)" : `${yaw}° around +Z`;
}

export function compositionYawLabel(variant: VideoVariantId) {
  const yaw = VARIANT_META[variant].signedYawDegrees;
  return yaw == null ? "frozen (no extra yaw)" : `${yaw}° around +Z`;
}

export function clapperOpenLabel(variant: VideoVariantId) {
  const angle = VARIANT_META[variant].clapperOpenDegrees;
  return angle == null ? "n/a" : `${angle}°`;
}

export function hingeStatusLabel(variant: VideoVariantId) {
  return VARIANT_META[variant].hingeStatus;
}

export function isComboVariant(variant: VideoVariantId) {
  return variant.startsWith("combo-");
}
