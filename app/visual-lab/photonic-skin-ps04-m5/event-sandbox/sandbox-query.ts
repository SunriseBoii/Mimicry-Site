export const EVENT_VARIANTS = ["baseline", "a", "b", "c"] as const;
export type EventVariantId = (typeof EVENT_VARIANTS)[number];

export const SANDBOX_VIEWS = ["canonical", "alternate", "opposite", "side", "top"] as const;
export type SandboxViewId = (typeof SANDBOX_VIEWS)[number];

export const SANDBOX_THEMES = ["light", "dark"] as const;
export type SandboxThemeId = (typeof SANDBOX_THEMES)[number];

export const SANDBOX_DEFAULTS = {
  variant: "baseline",
  view: "canonical",
  theme: "light",
  labels: true,
  mode: "settled",
} as const;

export type SandboxPlayMode = "settled" | "transition";

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : fallback;
}

export function parseSandboxQuery(search: string) {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const labelsRaw = query.get("labels");
  const labels = labelsRaw == null ? SANDBOX_DEFAULTS.labels : labelsRaw !== "0" && labelsRaw !== "false";
  const variantRaw = query.get("variant");
  const variant = pick(variantRaw, EVENT_VARIANTS, SANDBOX_DEFAULTS.variant);
  return {
    variant,
    view: pick(query.get("view"), SANDBOX_VIEWS, SANDBOX_DEFAULTS.view),
    theme: pick(query.get("theme"), SANDBOX_THEMES, SANDBOX_DEFAULTS.theme),
    labels,
    mode: pick(query.get("mode"), ["settled", "transition"] as const, SANDBOX_DEFAULTS.mode),
    invalidVariant: Boolean(variantRaw && variantRaw.trim() !== "" && variantRaw.trim().toLowerCase() !== variant),
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
  baseline: "/photonic-skin/ps-04-m5-2/variants/baseline/single-event.state.bin",
  a: "/photonic-skin/ps-04-m5-2/variants/a/single-event.state.bin",
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
