import {
  ABOUT_ZOOM_PERCENTS,
  BALANCED_REVIEW,
  MERCH_ZOOM_PERCENTS,
  VIDEO_ZOOM_PERCENTS,
  type AboutZoomPercent,
  type MerchZoomPercent,
  type VideoZoomPercent,
} from "../framing";

export const FRAMING_SCREENS = ["about", "merch", "video", "walkthrough"] as const;
export type FramingScreenQuery = (typeof FRAMING_SCREENS)[number];

export const FRAMING_VIEWPORTS = ["current", "1920x1080", "1440x900", "1280x720", "390x844"] as const;
export type FramingViewportId = (typeof FRAMING_VIEWPORTS)[number];

export const FRAMING_DIAGNOSTICS = ["final", "safe-area", "bbox", "mask", "baseline"] as const;
export type FramingDiagnosticId = (typeof FRAMING_DIAGNOSTICS)[number];

export const FRAMING_THEMES = ["light", "dark"] as const;
export type FramingThemeId = (typeof FRAMING_THEMES)[number];

export const FRAMING_MODES = ["settled", "transition"] as const;
export type FramingPlayMode = (typeof FRAMING_MODES)[number];

export const VIEWPORT_PIXELS: Record<Exclude<FramingViewportId, "current">, { width: number; height: number }> = {
  "1920x1080": { width: 1920, height: 1080 },
  "1440x900": { width: 1440, height: 900 },
  "1280x720": { width: 1280, height: 720 },
  "390x844": { width: 390, height: 844 },
};

export const SCREEN_NODE: Record<Exclude<FramingScreenQuery, "walkthrough">, "02" | "05.7" | "05.5"> = {
  about: "02",
  merch: "05.7",
  video: "05.5",
};

export const SANDBOX_DEFAULTS = {
  screen: "about",
  aboutZoom: BALANCED_REVIEW.aboutZoom,
  merchZoom: BALANCED_REVIEW.merchZoom,
  videoZoom: BALANCED_REVIEW.videoZoom,
  viewport: "current",
  diagnostic: "final",
  theme: "light",
  mode: "settled",
} as const;

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): { value: T; invalid: boolean } {
  if (!value || value.trim() === "") return { value: fallback, invalid: false };
  const normalized = value.trim().toLowerCase();
  if ((allowed as readonly string[]).includes(normalized)) return { value: normalized as T, invalid: false };
  return { value: fallback, invalid: true };
}

function pickPercent<T extends number>(raw: string | null, allowed: readonly T[], fallback: T): { value: T; invalid: boolean } {
  if (!raw || raw.trim() === "") return { value: fallback, invalid: false };
  const parsed = Number(raw);
  if ((allowed as readonly number[]).includes(parsed)) return { value: parsed as T, invalid: false };
  return { value: fallback, invalid: true };
}

export type FramingSandboxQuery = {
  screen: FramingScreenQuery;
  aboutZoom: AboutZoomPercent;
  merchZoom: MerchZoomPercent;
  videoZoom: VideoZoomPercent;
  viewport: FramingViewportId;
  diagnostic: FramingDiagnosticId;
  theme: FramingThemeId;
  mode: FramingPlayMode;
  invalid: boolean;
};

export function parseFramingQuery(search: string): FramingSandboxQuery {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (![...query.keys()].length) {
    return { ...SANDBOX_DEFAULTS, invalid: false };
  }
  const screen = pick(query.get("screen"), FRAMING_SCREENS, SANDBOX_DEFAULTS.screen);
  const aboutZoom = pickPercent(query.get("aboutZoom"), ABOUT_ZOOM_PERCENTS, SANDBOX_DEFAULTS.aboutZoom);
  const merchZoom = pickPercent(query.get("merchZoom"), MERCH_ZOOM_PERCENTS, SANDBOX_DEFAULTS.merchZoom);
  const videoZoom = pickPercent(query.get("videoZoom"), VIDEO_ZOOM_PERCENTS, SANDBOX_DEFAULTS.videoZoom);
  const viewport = pick(query.get("viewport"), FRAMING_VIEWPORTS, SANDBOX_DEFAULTS.viewport);
  const diagnostic = pick(query.get("diagnostic"), FRAMING_DIAGNOSTICS, SANDBOX_DEFAULTS.diagnostic);
  const theme = pick(query.get("theme"), FRAMING_THEMES, SANDBOX_DEFAULTS.theme);
  const mode = pick(query.get("mode"), FRAMING_MODES, SANDBOX_DEFAULTS.mode);
  const invalid = screen.invalid || aboutZoom.invalid || merchZoom.invalid || videoZoom.invalid
    || viewport.invalid || diagnostic.invalid || theme.invalid || mode.invalid;
  if (invalid) {
    return { ...SANDBOX_DEFAULTS, invalid: true };
  }
  return {
    screen: screen.value,
    aboutZoom: aboutZoom.value,
    merchZoom: merchZoom.value,
    videoZoom: videoZoom.value,
    viewport: viewport.value,
    diagnostic: diagnostic.value,
    theme: theme.value,
    mode: mode.value,
    invalid: false,
  };
}

export function framingSearch(args: Omit<FramingSandboxQuery, "invalid">) {
  const query = new URLSearchParams();
  query.set("screen", args.screen);
  query.set("aboutZoom", String(args.aboutZoom));
  query.set("merchZoom", String(args.merchZoom));
  query.set("videoZoom", String(args.videoZoom));
  query.set("viewport", args.viewport);
  query.set("diagnostic", args.diagnostic);
  query.set("theme", args.theme);
  query.set("mode", args.mode);
  return `?${query.toString()}`;
}

export const DIAGNOSTIC_LABELS: Record<FramingDiagnosticId, string> = {
  final: "Final material",
  "safe-area": "Safe-area overlay",
  bbox: "Actor bbox",
  mask: "Visible-pixel mask",
  baseline: "Baseline ghost",
};

export const SCREEN_LABELS: Record<FramingScreenQuery, string> = {
  about: "About",
  merch: "Merch",
  video: "Video",
  walkthrough: "Walkthrough",
};
