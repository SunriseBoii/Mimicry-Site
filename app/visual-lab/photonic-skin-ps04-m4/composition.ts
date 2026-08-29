/**
 * M4 site composition coordinate spaces.
 *
 * 1. Canvas rectangle — CSS pixels, top-left origin, canvas-local.
 * 2. Actor slot — CSS pixels, top-left origin, canvas-local. Semantic
 *    placement envelope (left/right third), not a clipping rectangle.
 * 3. Drawing buffer — physical pixels = CSS × renderer DPR.
 * 4. Device pixel ratio — renderer.getPixelRatio(), one conversion only.
 * 5. WebGL viewport — full Canvas, logical CSS pixels, bottom-left origin.
 *    THREE.WebGLRenderer.setViewport multiplies by pixelRatio internally.
 * 6. Square projection is preserved via an M4-only clip-space affine
 *    transform. Scissor is disabled (or equals the full Canvas).
 *    Frozen evaluator math is unchanged.
 */

import type { ActorPlacement, ScreenNodeId } from "./topology";
import { SCREEN_NODE_BY_ID } from "./topology";
import type { FitProfile } from "./site-fit";
import { siteFitScaleFor } from "./site-fit";

export type Placement = ActorPlacement | "exit";

export interface CompositionTarget {
  placement: Placement;
  visible: boolean;
}

export interface CssRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface WebGlCssRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompositionViewport {
  /** Full-canvas logical CSS pixels, WebGL bottom-left. Pass to setViewport. */
  x: number;
  y: number;
  width: number;
  height: number;
  canvasCssWidth: number;
  canvasCssHeight: number;
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  rendererDpr: number;
  cssLeft: number;
  cssTop: number;
  cssWidth: number;
  cssHeight: number;
  cssCenterX: number;
  cssCenterY: number;
  cssSize: number;
  deviceX: number;
  deviceY: number;
  deviceWidth: number;
  deviceHeight: number;
  envelopeDeviceX: number;
  envelopeDeviceY: number;
  envelopeDeviceWidth: number;
  envelopeDeviceHeight: number;
  siteClipScale: readonly [number, number];
  siteClipOffset: readonly [number, number];
  siteCompositionEnabled: number;
  visible: boolean;
  actorDraw: boolean;
  identity: boolean;
  siteFitScale: number;
  slot: Placement;
}

export interface SiteClipTransform {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  enabled: boolean;
  centerX: number;
  centerY: number;
}

export const IDENTITY_COMPOSITION: CompositionViewport = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  canvasCssWidth: 0,
  canvasCssHeight: 0,
  drawingBufferWidth: 0,
  drawingBufferHeight: 0,
  rendererDpr: 1,
  cssLeft: 0,
  cssTop: 0,
  cssWidth: 0,
  cssHeight: 0,
  cssCenterX: 0,
  cssCenterY: 0,
  cssSize: 0,
  deviceX: 0,
  deviceY: 0,
  deviceWidth: 0,
  deviceHeight: 0,
  envelopeDeviceX: 0,
  envelopeDeviceY: 0,
  envelopeDeviceWidth: 0,
  envelopeDeviceHeight: 0,
  siteClipScale: [1, 1],
  siteClipOffset: [0, 0],
  siteCompositionEnabled: 0,
  visible: true,
  actorDraw: true,
  identity: true,
  siteFitScale: 1,
  slot: "right",
};

export const COMPOSITION_GUIDE = Object.freeze({
  desktopWidthFraction: 0.36,
  desktopMin: 0.32,
  desktopMax: 0.38,
  mobileWidthFraction: 0.68,
  mobileMin: 0.52,
  mobileMax: 0.72,
  graphReserve: 92,
  headerReserve: 72,
  footerExitSeconds: 0.72,
  rightCenterVw: 0.76,
  leftCenterVw: 0.245,
});

export const DPR_MATRIX = [1, 1.25, 1.5, 2] as const;

export function targetForNode(id: ScreenNodeId): CompositionTarget {
  const placement = SCREEN_NODE_BY_ID[id].actorPlacement;
  if (placement === "none") return { placement: "exit", visible: false };
  return { placement, visible: true };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function graphReserve(width: number) {
  return width < 720 ? 56 : COMPOSITION_GUIDE.graphReserve;
}

export function actorSquareCss(width: number, height: number) {
  const graph = graphReserve(width);
  const usableWidth = Math.max(160, width - graph - 24);
  const usableHeight = Math.max(160, height - COMPOSITION_GUIDE.headerReserve);
  const fraction = width < 720
    ? clamp(COMPOSITION_GUIDE.mobileWidthFraction, COMPOSITION_GUIDE.mobileMin, COMPOSITION_GUIDE.mobileMax)
    : clamp(width < 1366 ? 0.35 : COMPOSITION_GUIDE.desktopWidthFraction, COMPOSITION_GUIDE.desktopMin, COMPOSITION_GUIDE.desktopMax);
  const sized = width * fraction;
  return clamp(sized, 168, Math.min(usableWidth * 0.92, usableHeight * 0.86));
}

export function placementCenter(
  placement: Placement,
  width: number,
  height: number,
  size: number,
  exitProgress: number,
) {
  const graph = graphReserve(width);
  const header = COMPOSITION_GUIDE.headerReserve;
  const rest = height - header;
  const idleY = width < 720 ? header + rest * 0.58 : header + rest * 0.52;
  const half = size / 2;
  const maxRightCenter = width - graph - 10 - half;
  const minLeftCenter = half + 12;
  const rightX = width < 720
    ? clamp(width * 0.5, minLeftCenter, maxRightCenter)
    : clamp(width * COMPOSITION_GUIDE.rightCenterVw, minLeftCenter, maxRightCenter);
  const leftX = width < 720
    ? clamp(width * 0.46, minLeftCenter, maxRightCenter)
    : clamp(width * COMPOSITION_GUIDE.leftCenterVw, minLeftCenter, Math.min(width * 0.3, maxRightCenter));
  const t = clamp(exitProgress, 0, 1);
  if (placement === "left") return { x: leftX, y: idleY };
  if (placement === "right") return { x: rightX, y: idleY };
  return {
    x: rightX + width * 0.08 * t,
    y: idleY + (height + size) * 0.55 * t,
  };
}

export function mixPlacement(from: Placement, to: Placement, progress: number): Placement {
  if (from === to) return to;
  if (progress >= 1) return to;
  return from;
}

/** CSS top-left canvas-local → WebGL bottom-left, still CSS / logical pixels. */
export function cssSlotToWebglCss(slot: CssRect, canvasCssHeight: number): WebGlCssRect {
  return {
    x: slot.left,
    y: canvasCssHeight - (slot.top + slot.height),
    width: slot.width,
    height: slot.height,
  };
}

/**
 * M4-only clip-space affine that maps square NDC into the slot envelope
 * of a full-canvas viewport, without clipping to that envelope.
 *
 * WebGL bottom-left slot center:
 *   centerX = L + S * 0.5
 *   centerY = H - T - S * 0.5
 * clipScale = (S/W, S/H)
 * clipOffset = (2*centerX/W - 1, 2*centerY/H - 1)
 */
export function siteClipTransform(args: {
  canvasWidth: number;
  canvasHeight: number;
  slotLeft: number;
  slotTop: number;
  slotSize: number;
  identity?: boolean;
}): SiteClipTransform {
  const W = Math.max(1, args.canvasWidth);
  const H = Math.max(1, args.canvasHeight);
  if (args.identity) {
    return {
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
      enabled: false,
      centerX: W * 0.5,
      centerY: H * 0.5,
    };
  }
  const S = Math.max(1, args.slotSize);
  const centerX = args.slotLeft + S * 0.5;
  const centerY = H - args.slotTop - S * 0.5;
  return {
    scaleX: S / W,
    scaleY: S / H,
    offsetX: (2 * centerX) / W - 1,
    offsetY: (2 * centerY) / H - 1,
    enabled: true,
    centerX,
    centerY,
  };
}

/** NDC → canvas CSS (top-left) after the site clip transform. */
export function ndcToCanvasCss(
  ndcX: number,
  ndcY: number,
  clip: SiteClipTransform,
  canvasWidth: number,
  canvasHeight: number,
) {
  const clipX = ndcX * clip.scaleX + clip.offsetX;
  const clipY = ndcY * clip.scaleY + clip.offsetY;
  const cssX = (clipX * 0.5 + 0.5) * canvasWidth;
  const webglY = (clipY * 0.5 + 0.5) * canvasHeight;
  return { x: cssX, y: canvasHeight - webglY };
}

export function siteEnvelopeCss(viewport: CompositionViewport): CssRect {
  return {
    left: viewport.cssLeft,
    top: viewport.cssTop,
    width: viewport.cssWidth,
    height: viewport.cssHeight,
  };
}

/**
 * The single CSS → drawing-buffer conversion. Mirrors Three.js:
 * state.viewport(_viewport * pixelRatio).
 */
export function multiplyRendererPixelRatio(rect: WebGlCssRect, pixelRatio: number): WebGlCssRect {
  const dpr = pixelRatio || 1;
  return {
    x: Math.round(rect.x * dpr),
    y: Math.round(rect.y * dpr),
    width: Math.max(1, Math.round(rect.width * dpr)),
    height: Math.max(1, Math.round(rect.height * dpr)),
  };
}

/**
 * Historical M4 bug: composition pre-multiplied CSS by DPR, then
 * WebGLRenderer.setViewport multiplied again.
 */
export function legacyPreMultipliedWebglCss(slot: CssRect, canvasCssHeight: number, dpr: number): WebGlCssRect {
  const logical = cssSlotToWebglCss(slot, canvasCssHeight);
  return multiplyRendererPixelRatio(logical, dpr);
}

export function assembleViewport(args: {
  canvasCssWidth: number;
  canvasCssHeight: number;
  rendererDpr: number;
  cssLeft: number;
  cssTop: number;
  cssSize: number;
  visible: boolean;
  identity?: boolean;
  siteFitScale?: number;
  slot: Placement;
}): CompositionViewport {
  const dpr = args.rendererDpr || 1;
  const canvasCssWidth = Math.max(1, args.canvasCssWidth);
  const canvasCssHeight = Math.max(1, args.canvasCssHeight);
  const drawingBufferWidth = Math.max(1, Math.round(canvasCssWidth * dpr));
  const drawingBufferHeight = Math.max(1, Math.round(canvasCssHeight * dpr));
  const fullWebgl = { x: 0, y: 0, width: canvasCssWidth, height: canvasCssHeight };
  const deviceFull = multiplyRendererPixelRatio(fullWebgl, dpr);
  const clip = siteClipTransform({
    canvasWidth: canvasCssWidth,
    canvasHeight: canvasCssHeight,
    slotLeft: args.identity ? 0 : args.cssLeft,
    slotTop: args.identity ? 0 : args.cssTop,
    slotSize: args.identity ? Math.min(canvasCssWidth, canvasCssHeight) : args.cssSize,
    identity: args.identity,
  });
  if (args.identity) {
    return {
      ...IDENTITY_COMPOSITION,
      x: 0,
      y: 0,
      width: canvasCssWidth,
      height: canvasCssHeight,
      canvasCssWidth,
      canvasCssHeight,
      drawingBufferWidth,
      drawingBufferHeight,
      rendererDpr: dpr,
      cssLeft: 0,
      cssTop: 0,
      cssWidth: canvasCssWidth,
      cssHeight: canvasCssHeight,
      cssCenterX: canvasCssWidth / 2,
      cssCenterY: canvasCssHeight / 2,
      cssSize: Math.min(canvasCssWidth, canvasCssHeight),
      deviceX: deviceFull.x,
      deviceY: deviceFull.y,
      deviceWidth: deviceFull.width,
      deviceHeight: deviceFull.height,
      envelopeDeviceX: deviceFull.x,
      envelopeDeviceY: deviceFull.y,
      envelopeDeviceWidth: deviceFull.width,
      envelopeDeviceHeight: deviceFull.height,
      siteClipScale: [1, 1],
      siteClipOffset: [0, 0],
      siteCompositionEnabled: 0,
      siteFitScale: 1,
      slot: args.slot,
    };
  }
  const slot: CssRect = {
    left: args.cssLeft,
    top: args.cssTop,
    width: args.cssSize,
    height: args.cssSize,
  };
  const envelopeWebgl = cssSlotToWebglCss(slot, canvasCssHeight);
  const envelopeDevice = multiplyRendererPixelRatio(envelopeWebgl, dpr);
  return {
    x: 0,
    y: 0,
    width: canvasCssWidth,
    height: canvasCssHeight,
    canvasCssWidth,
    canvasCssHeight,
    drawingBufferWidth,
    drawingBufferHeight,
    rendererDpr: dpr,
    cssLeft: slot.left,
    cssTop: slot.top,
    cssWidth: slot.width,
    cssHeight: slot.height,
    cssCenterX: slot.left + slot.width / 2,
    cssCenterY: slot.top + slot.height / 2,
    cssSize: args.cssSize,
    deviceX: deviceFull.x,
    deviceY: deviceFull.y,
    deviceWidth: deviceFull.width,
    deviceHeight: deviceFull.height,
    envelopeDeviceX: envelopeDevice.x,
    envelopeDeviceY: envelopeDevice.y,
    envelopeDeviceWidth: envelopeDevice.width,
    envelopeDeviceHeight: envelopeDevice.height,
    siteClipScale: [clip.scaleX, clip.scaleY],
    siteClipOffset: [clip.offsetX, clip.offsetY],
    siteCompositionEnabled: args.visible ? 1 : 0,
    visible: args.visible,
    actorDraw: args.visible,
    identity: false,
    siteFitScale: args.siteFitScale ?? 1,
    slot: args.slot,
  };
}

export function sampleComposition(args: {
  width: number;
  height: number;
  dpr: number;
  placement: Placement;
  from?: Placement;
  mix?: number;
  exitProgress: number;
  reducedMotion: boolean;
  identity?: boolean;
  fitProfile?: FitProfile;
}): CompositionViewport {
  const size = actorSquareCss(args.width, args.height);
  const mix = clamp(args.mix ?? 1, 0, 1);
  const from = args.from ?? args.placement;
  const a = placementCenter(from, args.width, args.height, size, from === "exit" || from === "none" ? 1 : 0);
  const b = placementCenter(args.placement, args.width, args.height, size, args.exitProgress);
  const t = args.reducedMotion ? 1 : mix;
  const centerX = a.x + (b.x - a.x) * t;
  const centerY = a.y + (b.y - a.y) * t;
  const hidden = args.placement === "exit" && (args.reducedMotion || args.exitProgress >= 0.999);
  return assembleViewport({
    canvasCssWidth: args.width,
    canvasCssHeight: args.height,
    rendererDpr: args.dpr,
    cssLeft: centerX - size / 2,
    cssTop: centerY - size / 2,
    cssSize: size,
    visible: !hidden,
    identity: args.identity,
    siteFitScale: siteFitScaleFor(args.fitProfile ?? "master", Boolean(args.identity)),
    slot: args.placement,
  });
}

export function viewportFromCenter(args: {
  width: number;
  height: number;
  dpr: number;
  centerX: number;
  centerY: number;
  size: number;
  visible: boolean;
  identity?: boolean;
  siteFitScale?: number;
  slot?: Placement;
}): CompositionViewport {
  return assembleViewport({
    canvasCssWidth: args.width,
    canvasCssHeight: args.height,
    rendererDpr: args.dpr,
    cssLeft: args.centerX - args.size / 2,
    cssTop: args.centerY - args.size / 2,
    cssSize: args.size,
    visible: args.visible,
    identity: args.identity,
    siteFitScale: args.identity ? 1 : (args.siteFitScale ?? 1),
    slot: args.slot ?? "right",
  });
}

export interface ViewportApi {
  setViewport(x: number, y: number, w: number, h: number): void;
  setScissor(x: number, y: number, w: number, h: number): void;
  setScissorTest(value: boolean): void;
  getViewport?(target: { set(x: number, y: number, z: number, w: number): unknown }): { x: number; y: number; z: number; w: number };
  getScissor?(target: { set(x: number, y: number, z: number, w: number): unknown }): { x: number; y: number; z: number; w: number };
  getScissorTest?(): boolean;
}

export function applyCompositionViewport(gl: ViewportApi, viewport: CompositionViewport) {
  const width = Math.max(1, viewport.canvasCssWidth || viewport.width || 1);
  const height = Math.max(1, viewport.canvasCssHeight || viewport.height || 1);
  gl.setScissorTest(false);
  gl.setViewport(0, 0, width, height);
}

export function restoreFullCanvasViewport(gl: ViewportApi, canvasCssWidth: number, canvasCssHeight: number) {
  gl.setScissorTest(false);
  gl.setViewport(0, 0, Math.max(1, canvasCssWidth), Math.max(1, canvasCssHeight));
}

export const ENVELOPE_PROFILES = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "390x844", width: 390, height: 844 },
] as const;

export function envelopeFits(width: number, height: number, placement: Exclude<Placement, "none" | "exit">) {
  const size = actorSquareCss(width, height);
  const center = placementCenter(placement, width, height, size, 0);
  const graph = graphReserve(width);
  const left = center.x - size / 2;
  const right = center.x + size / 2;
  const top = center.y - size / 2;
  const bottom = center.y + size / 2;
  return {
    size,
    left,
    right,
    top,
    bottom,
    centerX: center.x,
    centerY: center.y,
    overlapsGraph: placement === "right" && width >= 720 ? right > width - graph + 8 : false,
    overlapsHeader: top < 8,
    inViewport: left >= -8 && right <= width + 8 && top >= 0 && bottom <= height + 8,
  };
}

export interface ActorMaskBBox {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
  pixelCount: number;
}

export function cssFromDeviceBBox(
  device: { minX: number; minY: number; maxX: number; maxY: number; count: number },
  drawingBufferHeight: number,
  dpr: number,
): ActorMaskBBox | null {
  if (device.count <= 0) return null;
  const left = device.minX / dpr;
  const right = (device.maxX + 1) / dpr;
  const top = (drawingBufferHeight - (device.maxY + 1)) / dpr;
  const bottom = (drawingBufferHeight - device.minY) / dpr;
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    right,
    bottom,
    pixelCount: device.count,
  };
}

export function visibleFractionFor(bbox: ActorMaskBBox | null, canvasCssWidth: number, canvasCssHeight: number) {
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) return 0;
  const visibleLeft = Math.max(bbox.left, 0);
  const visibleTop = Math.max(bbox.top, 0);
  const visibleRight = Math.min(bbox.right, canvasCssWidth);
  const visibleBottom = Math.min(bbox.bottom, canvasCssHeight);
  const visibleW = Math.max(0, visibleRight - visibleLeft);
  const visibleH = Math.max(0, visibleBottom - visibleTop);
  const area = bbox.width * bbox.height;
  if (area <= 0) return 0;
  return (visibleW * visibleH) / area;
}

export function canvasClipping(bbox: ActorMaskBBox | null, canvasCssWidth: number, canvasCssHeight: number, epsilon = 1.5) {
  if (!bbox) return { touchesCanvasEdge: false, outsideFraction: 1 };
  const fraction = visibleFractionFor(bbox, canvasCssWidth, canvasCssHeight);
  const touches = bbox.left <= epsilon
    || bbox.top <= epsilon
    || bbox.right >= canvasCssWidth - epsilon
    || bbox.bottom >= canvasCssHeight - epsilon;
  return { touchesCanvasEdge: touches, outsideFraction: 1 - fraction };
}

export function envelopeOverflow(bbox: ActorMaskBBox | null, envelope: CssRect) {
  if (!bbox) {
    return { overflow: false, left: 0, right: 0, top: 0, bottom: 0 };
  }
  const envRight = envelope.left + envelope.width;
  const envBottom = envelope.top + envelope.height;
  const left = Math.max(0, envelope.left - bbox.left);
  const right = Math.max(0, bbox.right - envRight);
  const top = Math.max(0, envelope.top - bbox.top);
  const bottom = Math.max(0, bbox.bottom - envBottom);
  return {
    overflow: left > 0.5 || right > 0.5 || top > 0.5 || bottom > 0.5,
    left,
    right,
    top,
    bottom,
  };
}

export function slotInteriorCutoff(
  bbox: ActorMaskBBox | null,
  envelope: CssRect,
  canvasCssWidth: number,
  canvasCssHeight: number,
  epsilon = 1.5,
) {
  if (!bbox) return { cutoff: false, edges: [] as string[] };
  const envRight = envelope.left + envelope.width;
  const envBottom = envelope.top + envelope.height;
  const edges: string[] = [];
  const flushLeft = Math.abs(bbox.left - envelope.left) <= epsilon && envelope.left > 8;
  const flushRight = Math.abs(bbox.right - envRight) <= epsilon && envRight < canvasCssWidth - 8;
  const flushTop = Math.abs(bbox.top - envelope.top) <= epsilon && envelope.top > 8;
  const flushBottom = Math.abs(bbox.bottom - envBottom) <= epsilon && envBottom < canvasCssHeight - 8;
  if (flushLeft) edges.push("left");
  if (flushRight) edges.push("right");
  if (flushTop) edges.push("top");
  if (flushBottom) edges.push("bottom");
  return { cutoff: edges.length > 0, edges };
}

export function actorVisibilityGate(args: {
  actorDraw: boolean;
  bbox: ActorMaskBBox | null;
  visibleFraction: number;
  centerX: number;
  slot: Placement;
  canvasWidth: number;
  canvasHeight: number;
  cssLeftByDpr: readonly number[];
  cssSizeByDpr: readonly number[];
  envelope?: CssRect;
  phase?: "settled" | "transition";
}) {
  const failures: string[] = [];
  if (args.actorDraw && !args.bbox) failures.push("draw-without-silhouette");
  if (args.actorDraw && args.visibleFraction < 0.98) failures.push("silhouette-outside-canvas");
  const clipping = canvasClipping(args.bbox, args.canvasWidth, args.canvasHeight);
  if (args.actorDraw && clipping.touchesCanvasEdge && clipping.outsideFraction > 0.02) {
    failures.push("silhouette-clipped-by-canvas");
  }
  const envelope = args.envelope ?? (
    args.slot !== "none" && args.slot !== "exit"
      ? (() => {
        const size = actorSquareCss(args.canvasWidth, args.canvasHeight);
        const center = placementCenter(args.slot, args.canvasWidth, args.canvasHeight, size, 0);
        return { left: center.x - size / 2, top: center.y - size / 2, width: size, height: size };
      })()
      : null
  );
  if (args.actorDraw && envelope && args.phase !== "transition") {
    const cutoff = slotInteriorCutoff(args.bbox, envelope, args.canvasWidth, args.canvasHeight);
    if (cutoff.cutoff && cutoff.edges.length >= 2) failures.push("slot-interior-cutoff");
  }
  if (args.actorDraw && args.slot !== "none" && args.slot !== "exit" && args.phase !== "transition") {
    const expected = placementCenter(args.slot, args.canvasWidth, args.canvasHeight, actorSquareCss(args.canvasWidth, args.canvasHeight), 0);
    if (Math.abs(args.centerX - expected.x) > args.canvasWidth * 0.08) failures.push("center-outside-slot");
  }
  if (args.cssLeftByDpr.length > 1) {
    const baseLeft = args.cssLeftByDpr[0];
    const baseSize = args.cssSizeByDpr[0];
    args.cssLeftByDpr.forEach((left, index) => {
      if (Math.abs(left - baseLeft) > 2) failures.push(`css-left-dpr-drift:${index}`);
    });
    args.cssSizeByDpr.forEach((size, index) => {
      if (Math.abs(size - baseSize) > 2) failures.push(`css-size-dpr-drift:${index}`);
    });
  }
  if (args.actorDraw && args.bbox) {
    const maxDim = Math.max(args.bbox.width, args.bbox.height);
    const minVw = args.canvasWidth < 720 ? args.canvasWidth * 0.4 : args.canvasWidth * 0.18;
    if (maxDim + 2 < minVw) failures.push("actor-too-small");
  }
  return { pass: failures.length === 0, failures };
}
