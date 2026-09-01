/**
 * PS-04.M5.4 presentation framing. Zoom is a frustum multiplier bound to
 * exact screen node ID + settled geometry ID. It does not scale actor
 * geometry, move the camera, or rewrite screen slots.
 *
 * Frozen photonic camera is a PerspectiveCamera (FOV 33°). Three.js
 * `camera.zoom` divides the projection frustum — the same operator as
 * OrthographicCamera.zoom — so visual size grows without changing pose.
 */

import { c2Window } from "../photonic-skin-ps04-m3/idle-motion";
import { CANONICAL_BRAND_WIDE_ID, SINGLE_STATE_IDS } from "./screen-actor-contract";
import { actorSquareCss, placementCenter } from "./composition";
import type { ScreenNodeId } from "./topology";

export const M54_STAGE = "PS-04.M5.4";
export const M54_RUN_ID = "ps04-m5-4";
export const M54_SESSION_ID = "ps04-m5-4-framing";

export const SELECTED_VIDEO_VARIANT = "combo-40-r1" as const;
export const SELECTED_VIDEO_HASH = "2d6957815b6f58f87f1709e0378313cba271530b8fb0e02282b556780448a873";
export const SELECTED_VIDEO_YAW_DEGREES = -40;
export const SELECTED_VIDEO_CLAPPER_OPEN_DEGREES = 30;
export const SELECTED_EVENT_VARIANT = "a-r2" as const;
export const SELECTED_EVENT_HASH = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b";
export const FROZEN_VIDEO_HASH = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b";

export const ABOUT_NODE_ID = "02" as const satisfies ScreenNodeId;
export const MERCH_NODE_ID = "05.7" as const satisfies ScreenNodeId;
export const VIDEO_NODE_ID = "05.5" as const satisfies ScreenNodeId;
export const HERO_NODE_ID = "01" as const satisfies ScreenNodeId;

export const ABOUT_GEOMETRY_ID = CANONICAL_BRAND_WIDE_ID;
export const MERCH_GEOMETRY_ID = SINGLE_STATE_IDS.merch;
export const VIDEO_GEOMETRY_ID = SINGLE_STATE_IDS.video;

export const ABOUT_ZOOM_PERCENTS = [100, 112, 118, 124] as const;
export const MERCH_ZOOM_PERCENTS = [100, 105, 108, 111] as const;
export const VIDEO_ZOOM_PERCENTS = [100, 105, 108, 111] as const;

export type AboutZoomPercent = (typeof ABOUT_ZOOM_PERCENTS)[number];
export type MerchZoomPercent = (typeof MERCH_ZOOM_PERCENTS)[number];
export type VideoZoomPercent = (typeof VIDEO_ZOOM_PERCENTS)[number];

export const BASELINE_ZOOM = 1;
export const PHOTONIC_FOV_DEGREES = 33;

export type FramingScreenId = "about" | "merch" | "video";

export type FramingProfile = {
  nodeId: string;
  geometryId: string;
  requestedZoom: number;
  effectiveZoom: number;
  responsiveCap: number;
};

export type FramingSelection = {
  aboutZoom: AboutZoomPercent;
  merchZoom: MerchZoomPercent;
  videoZoom: VideoZoomPercent;
};

export const BALANCED_REVIEW: FramingSelection = Object.freeze({
  aboutZoom: 118,
  merchZoom: 108,
  videoZoom: 108,
});

/** Owner-selected M5.4 profile. Not a production default. */
export const OWNER_SELECTED_124_111_111: FramingSelection = Object.freeze({
  aboutZoom: 124,
  merchZoom: 111,
  videoZoom: 111,
});

export const OWNER_SELECTED_PROFILE_ID = "OWNER_SELECTED_124_111_111" as const;

export const OWNER_SELECTED_CAPS = Object.freeze({
  aboutMobileCap: 1.18,
  merchMobileCap: 1.08,
  videoMobileCap: 1.08,
});

export const FRAMING_TARGETS: Readonly<Record<FramingScreenId, { nodeId: ScreenNodeId; geometryId: string; slot: "left" | "right"; family: string }>> = Object.freeze({
  about: { nodeId: ABOUT_NODE_ID, geometryId: ABOUT_GEOMETRY_ID, slot: "right", family: "BRAND_WIDE" },
  merch: { nodeId: MERCH_NODE_ID, geometryId: MERCH_GEOMETRY_ID, slot: "left", family: "SINGLE" },
  video: { nodeId: VIDEO_NODE_ID, geometryId: VIDEO_GEOMETRY_ID, slot: "left", family: "SINGLE" },
});

export const UNAFFECTED_NODE_IDS = [
  "01", "03.1", "03.2", "03.3", "04",
  "05.1", "05.2", "05.3", "05.4", "05.6",
  "06.1", "06.2", "06.3", "07", "08",
] as const satisfies readonly ScreenNodeId[];

export function percentToZoom(percent: number) {
  return percent / 100;
}

export function zoomToPercent(zoom: number) {
  return Math.round(zoom * 100);
}

export function frustumScaleFromZoom(zoom: number) {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return BASELINE_ZOOM / zoom;
}

export function mixFraming(sourceZoom: number, targetZoom: number, geometryProgress: number, reducedMotion = false) {
  if (reducedMotion) return targetZoom;
  const t = c2Window(geometryProgress, 0, 1);
  return sourceZoom + (targetZoom - sourceZoom) * t;
}

export function framingProgressFromGeometry(geometryProgress: number, reducedMotion = false) {
  if (reducedMotion) return 1;
  return c2Window(geometryProgress, 0, 1);
}

export function matchesFramingTarget(nodeId: string | null | undefined, geometryId: string | null | undefined, screen: FramingScreenId) {
  const target = FRAMING_TARGETS[screen];
  return nodeId === target.nodeId && geometryId === target.geometryId;
}

export function framingScreenFor(nodeId: string | null | undefined, geometryId: string | null | undefined): FramingScreenId | null {
  if (matchesFramingTarget(nodeId, geometryId, "about")) return "about";
  if (matchesFramingTarget(nodeId, geometryId, "merch")) return "merch";
  if (matchesFramingTarget(nodeId, geometryId, "video")) return "video";
  return null;
}

/**
 * Deterministic mobile safety cap. Desktop keeps the requested zoom.
 * Derived from the existing actor-slot square so it cannot oscillate with
 * measured bbox feedback.
 */
export function responsiveSafeZoom(args: {
  nodeId: string;
  geometryId: string | null;
  requestedZoom: number;
  width: number;
  height: number;
}) {
  const requested = Number.isFinite(args.requestedZoom) && args.requestedZoom > 0 ? args.requestedZoom : 1;
  const screen = framingScreenFor(args.nodeId, args.geometryId);
  if (!screen) return 1;
  if (args.width >= 720) return requested;
  const slot = actorSquareCss(args.width, args.height);
  const minMargin = args.width < 400 ? 0.1 : 0.08;
  const available = Math.max(slot, Math.min(args.width, args.height) * (1 - minMargin));
  const slotHeadroom = available / slot;
  const mobileCeil = screen === "about" ? 1.18 : 1.08;
  return Math.min(requested, mobileCeil, slotHeadroom);
}

export function framingProfileFor(args: {
  nodeId: string;
  geometryId: string | null;
  selection: FramingSelection;
  width: number;
  height: number;
}): FramingProfile {
  const screen = framingScreenFor(args.nodeId, args.geometryId);
  const requested = screen === "about"
    ? percentToZoom(args.selection.aboutZoom)
    : screen === "merch"
      ? percentToZoom(args.selection.merchZoom)
      : screen === "video"
        ? percentToZoom(args.selection.videoZoom)
        : BASELINE_ZOOM;
  const cap = screen
    ? responsiveSafeZoom({
      nodeId: args.nodeId,
      geometryId: args.geometryId,
      requestedZoom: requested,
      width: args.width,
      height: args.height,
    })
    : 1;
  const effective = Math.min(requested, cap);
  return {
    nodeId: args.nodeId,
    geometryId: args.geometryId ?? "none",
    requestedZoom: requested,
    effectiveZoom: effective,
    responsiveCap: cap,
  };
}

export function baselineFramingProfile(nodeId: string, geometryId: string | null): FramingProfile {
  return {
    nodeId,
    geometryId: geometryId ?? "none",
    requestedZoom: 1,
    effectiveZoom: 1,
    responsiveCap: 1,
  };
}

export function cameraZoomFromFraming(effectiveZoom: number, identity = false) {
  if (identity) return 1;
  if (!Number.isFinite(effectiveZoom) || effectiveZoom <= 0) return 1;
  return effectiveZoom;
}

export const BASELINE_MARGIN_THRESHOLD = {
  /** CSS px, derived from baseline actor-slot inset (12px left, 10px graph gutter). */
  minSlotEdgePx: 8,
  viewportEdgePx: 4,
  textGapPx: 12,
  navigationGapPx: 8,
} as const;

export function presentationSlot(width: number, height: number, slot: "left" | "right") {
  const size = actorSquareCss(width, height);
  const center = placementCenter(slot, width, height, size, 0);
  return {
    size,
    centerX: center.x,
    centerY: center.y,
    left: center.x - size / 2,
    top: center.y - size / 2,
    right: center.x + size / 2,
    bottom: center.y + size / 2,
  };
}

export function reservedDomRects(width: number, height: number) {
  const graph = width < 720 ? 56 : 92;
  return {
    header: { left: 0, top: 0, width: Math.max(0, width - graph), height: 72, role: "navigation" as const },
    graph: { left: Math.max(0, width - graph), top: 0, width: graph, height, role: "navigation" as const },
  };
}

export function estimatedVisibleBBox(slot: ReturnType<typeof presentationSlot>, zoom: number, fill = 0.82) {
  const width = slot.size * fill * zoom;
  const height = slot.size * fill * zoom;
  return {
    left: slot.centerX - width / 2,
    top: slot.centerY - height / 2,
    right: slot.centerX + width / 2,
    bottom: slot.centerY + height / 2,
    width,
    height,
  };
}

export function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right?: number; bottom?: number; width?: number; height?: number },
  epsilon = 0,
) {
  const br = b.right ?? (b.left + (b.width ?? 0));
  const bb = b.bottom ?? (b.top + (b.height ?? 0));
  return a.left < br - epsilon && a.right > b.left + epsilon && a.top < bb - epsilon && a.bottom > b.top + epsilon;
}

export function viewportClippingPx(
  box: { left: number; top: number; right: number; bottom: number },
  width: number,
  height: number,
) {
  return {
    left: Math.max(0, -box.left),
    top: Math.max(0, -box.top),
    right: Math.max(0, box.right - width),
    bottom: Math.max(0, box.bottom - height),
  };
}
