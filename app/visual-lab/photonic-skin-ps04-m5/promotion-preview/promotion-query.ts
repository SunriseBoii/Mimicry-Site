import {
  ABOUT_ZOOM_PERCENTS,
  MERCH_ZOOM_PERCENTS,
  OWNER_SELECTED_124_111_111,
  VIDEO_ZOOM_PERCENTS,
  type AboutZoomPercent,
  type MerchZoomPercent,
  type VideoZoomPercent,
} from "../framing";
import {
  FRAMING_DIAGNOSTICS,
  FRAMING_SCREENS,
  FRAMING_THEMES,
  FRAMING_VIEWPORTS,
  VIEWPORT_PIXELS,
  type FramingDiagnosticId,
  type FramingPlayMode,
  type FramingScreenQuery,
  type FramingThemeId,
  type FramingViewportId,
} from "../framing-sandbox/sandbox-query";
import type { PromotionNamespaceId } from "./promoted-runtime";

export const PROMOTION_DEFAULTS = {
  screen: "about" as FramingScreenQuery,
  aboutZoom: OWNER_SELECTED_124_111_111.aboutZoom,
  merchZoom: OWNER_SELECTED_124_111_111.merchZoom,
  videoZoom: OWNER_SELECTED_124_111_111.videoZoom,
  viewport: "current" as FramingViewportId,
  diagnostic: "final" as FramingDiagnosticId,
  theme: "light" as FramingThemeId,
  mode: "settled" as FramingPlayMode,
  namespace: "candidate" as PromotionNamespaceId,
};

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(normalized) ? normalized as T : fallback;
}

function pickPercent<T extends number>(raw: string | null, allowed: readonly T[], fallback: T): T {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return (allowed as readonly number[]).includes(parsed) ? parsed as T : fallback;
}

export type PromotionQuery = {
  screen: FramingScreenQuery;
  aboutZoom: AboutZoomPercent;
  merchZoom: MerchZoomPercent;
  videoZoom: VideoZoomPercent;
  viewport: FramingViewportId;
  diagnostic: FramingDiagnosticId;
  theme: FramingThemeId;
  mode: FramingPlayMode;
  namespace: PromotionNamespaceId;
};

export function parsePromotionQuery(search: string): PromotionQuery {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const themeRaw = query.get("theme");
  const theme = !themeRaw || themeRaw === "system" || themeRaw === "current"
    ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : PROMOTION_DEFAULTS.theme)
    : pick(themeRaw, FRAMING_THEMES, PROMOTION_DEFAULTS.theme);
  return {
    screen: pick(query.get("screen"), FRAMING_SCREENS, PROMOTION_DEFAULTS.screen),
    aboutZoom: pickPercent(query.get("aboutZoom"), ABOUT_ZOOM_PERCENTS, PROMOTION_DEFAULTS.aboutZoom),
    merchZoom: pickPercent(query.get("merchZoom"), MERCH_ZOOM_PERCENTS, PROMOTION_DEFAULTS.merchZoom),
    videoZoom: pickPercent(query.get("videoZoom"), VIDEO_ZOOM_PERCENTS, PROMOTION_DEFAULTS.videoZoom),
    viewport: pick(query.get("viewport"), FRAMING_VIEWPORTS, PROMOTION_DEFAULTS.viewport),
    diagnostic: pick(query.get("diagnostic"), FRAMING_DIAGNOSTICS, PROMOTION_DEFAULTS.diagnostic),
    theme,
    mode: pick(query.get("mode"), ["settled", "transition"] as const, PROMOTION_DEFAULTS.mode),
    namespace: query.get("namespace") === "frozen" ? "frozen" : "candidate",
  };
}

export function promotionSearch(query: PromotionQuery) {
  const params = new URLSearchParams();
  if (query.screen !== PROMOTION_DEFAULTS.screen) params.set("screen", query.screen);
  if (query.aboutZoom !== PROMOTION_DEFAULTS.aboutZoom) params.set("aboutZoom", String(query.aboutZoom));
  if (query.merchZoom !== PROMOTION_DEFAULTS.merchZoom) params.set("merchZoom", String(query.merchZoom));
  if (query.videoZoom !== PROMOTION_DEFAULTS.videoZoom) params.set("videoZoom", String(query.videoZoom));
  if (query.viewport !== PROMOTION_DEFAULTS.viewport) params.set("viewport", query.viewport);
  if (query.diagnostic !== PROMOTION_DEFAULTS.diagnostic) params.set("diagnostic", query.diagnostic);
  if (query.theme !== PROMOTION_DEFAULTS.theme) params.set("theme", query.theme);
  if (query.mode !== PROMOTION_DEFAULTS.mode) params.set("mode", query.mode);
  if (query.namespace !== PROMOTION_DEFAULTS.namespace) params.set("namespace", query.namespace);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export { VIEWPORT_PIXELS, FRAMING_SCREENS, FRAMING_VIEWPORTS, FRAMING_DIAGNOSTICS, FRAMING_THEMES };
