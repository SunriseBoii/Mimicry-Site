// выбранное направление — R1 UI contract phrase kept searchable in this file.
export const EVENT_VARIANTS = ["a-r2", "a-r1", "a", "baseline", "b", "c"] as const;
export type EventVariantId = (typeof EVENT_VARIANTS)[number];

export const PRIMARY_EVENT_VARIANTS = ["a-r2", "a", "baseline"] as const;
export const REJECTED_EVENT_VARIANTS = ["b", "c"] as const;
export const ARCHIVED_EVENT_VARIANTS = ["a-r1"] as const;

export const SANDBOX_VIEWS = ["canonical", "alternate", "opposite", "side", "top"] as const;
export type SandboxViewId = (typeof SANDBOX_VIEWS)[number];

export const SANDBOX_THEMES = ["light", "dark"] as const;
export type SandboxThemeId = (typeof SANDBOX_THEMES)[number];

export const SANDBOX_MODES = ["settled", "transition"] as const;
export type SandboxPlayMode = (typeof SANDBOX_MODES)[number];

export const SANDBOX_DEFAULTS = {
  variant: "a-r2",
  view: "canonical",
  theme: "light",
  labels: false,
  mode: "settled",
} as const;

export const VARIANT_META: Record<EventVariantId, {
  id: EventVariantId;
  short: string;
  title: string;
  hudName: string;
  loadingName: string;
  decision: string;
  description: string;
  rejected: boolean;
  group: "primary" | "rejected" | "archived";
}> = {
  "a-r2": {
    id: "a-r2",
    short: "A‑R2",
    title: "A‑R2 — исправлена фигура справа для зрителя",
    hudName: "EVENT_A_R2",
    loadingName: "EVENT_A_R2",
    decision: "HUMAN PASS · SELECTED M5 EVENT CANDIDATE · viewer-right refined · promotion deferred to M5.5",
    description: "Владелец принял A‑R2 как выбранный M5 Event candidate; каноническое продвижение отложено до M5.5",
    rejected: false,
    group: "primary",
  },
  "a-r1": {
    id: "a-r1",
    short: "A‑R1",
    title: "A‑R1 — отклонён: изменена фигура слева для зрителя",
    hudName: "EVENT_A_R1",
    loadingName: "EVENT_A_R1",
    decision: "rejected · wrong viewer-left edit",
    description: "Отклонён: изменена фигура слева для зрителя (ошибочный screen-space mapping)",
    rejected: true,
    group: "archived",
  },
  a: {
    id: "a",
    short: "A",
    title: "A — исходный выбранный вариант",
    hudName: "EVENT_A",
    loadingName: "EVENT_A",
    decision: "A selected · original candidate",
    description: "Исходный EVENT_A: viewer-right выглядит как облако точек",
    rejected: false,
    group: "primary",
  },
  baseline: {
    id: "baseline",
    short: "BASELINE",
    title: "BASELINE — до разворота",
    hudName: "BASELINE",
    loadingName: "BASELINE",
    decision: "historical reference only",
    description: "Исторический референс до разворота +180°",
    rejected: false,
    group: "primary",
  },
  b: {
    id: "b",
    short: "B",
    title: "B — отклонён",
    hudName: "EVENT_B",
    loadingName: "EVENT_B",
    decision: "rejected",
    description: "Отклонён владельцем; frozen evidence",
    rejected: true,
    group: "rejected",
  },
  c: {
    id: "c",
    short: "C",
    title: "C — отклонён",
    hudName: "EVENT_C",
    loadingName: "EVENT_C",
    decision: "rejected",
    description: "Отклонён владельцем; frozen evidence",
    rejected: true,
    group: "rejected",
  },
};

export const VIEW_LABELS: Record<SandboxViewId, string> = {
  canonical: "Канонический",
  alternate: "Альтернативный",
  opposite: "С противоположной стороны",
  side: "Сбоку",
  top: "Сверху",
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
  const variantRaw = query.get("variant");
  const variant = pick(variantRaw, EVENT_VARIANTS, SANDBOX_DEFAULTS.variant);
  const view = pick(query.get("view"), SANDBOX_VIEWS, SANDBOX_DEFAULTS.view);
  const theme = pick(query.get("theme"), SANDBOX_THEMES, SANDBOX_DEFAULTS.theme);
  const mode = pick(query.get("mode"), SANDBOX_MODES, SANDBOX_DEFAULTS.mode);
  const labels = parseLabels(query.get("labels"));
  return {
    variant: variant.value,
    view: view.value,
    theme: theme.value,
    labels: labels.labels,
    mode: mode.value,
    invalidVariant: variant.invalid,
    invalidView: view.invalid,
    invalidTheme: theme.invalid,
    invalidLabels: labels.invalid,
    invalidMode: mode.invalid,
  };
}

export function sandboxSearch(args: {
  variant: EventVariantId;
  view: SandboxViewId;
  theme: SandboxThemeId;
  labels: boolean;
  mode: SandboxPlayMode;
}) {
  const query = new URLSearchParams();
  query.set("variant", args.variant);
  query.set("view", args.view);
  query.set("theme", args.theme);
  query.set("labels", args.labels ? "1" : "0");
  query.set("mode", args.mode);
  return `?${query.toString()}`;
}

export const VARIANT_BUFFER_PATH: Record<EventVariantId, string> = {
  "a-r2": "/photonic-skin/ps-04-m5-2/variants/a-r2/single-event.state.bin",
  "a-r1": "/photonic-skin/ps-04-m5-2/variants/a-r1/single-event.state.bin",
  a: "/photonic-skin/ps-04-m5-2/variants/a/single-event.state.bin",
  baseline: "/photonic-skin/ps-04-m5-2/variants/baseline/single-event.state.bin",
  b: "/photonic-skin/ps-04-m5-2/variants/b/single-event.state.bin",
  c: "/photonic-skin/ps-04-m5-2/variants/c/single-event.state.bin",
};

export const FROZEN_CAMERAS = {
  canonical: [2.8, -7.8, 4.6] as const,
  alternate: [5.6, -6.4, 4.1] as const,
  opposite: [-5.6, 6.4, 4.1] as const,
  side: [8.8, 0.0, 1.4] as const,
  top: [0.01, -0.01, 9.4] as const,
};
