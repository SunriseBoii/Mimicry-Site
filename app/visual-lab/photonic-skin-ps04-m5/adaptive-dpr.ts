/** A bounded render scale for the 16k particle actor. QA may still request a fixed DPR. */
export interface AdaptiveDprState {
  dpr: number;
  slowWindows: number;
  fastWindows: number;
  lastChangeMs: number;
}

const MIN_DPR = 0.75;
const STEP = 0.25;

function mobileViewport(width: number) {
  return width <= 600;
}

export function adaptiveDprCap(width: number, height: number, deviceDpr: number) {
  const mobile = mobileViewport(width);
  const pixelBudget = mobile ? 1_100_000 : 3_000_000;
  const viewportPixels = Math.max(1, width) * Math.max(1, height);
  const pixelCap = Math.sqrt(pixelBudget / viewportPixels);
  const hardwareCap = Math.min(Number.isFinite(deviceDpr) ? deviceDpr : 1, mobile ? 1.75 : 1.5);
  const bounded = Math.max(MIN_DPR, Math.min(hardwareCap, pixelCap));
  return Math.max(MIN_DPR, Math.floor((bounded + 0.0001) / STEP) * STEP);
}

export function initialAdaptiveDpr(width: number, height: number, deviceDpr: number): AdaptiveDprState {
  return { dpr: adaptiveDprCap(width, height, deviceDpr), slowWindows: 0, fastWindows: 0, lastChangeMs: 0 };
}

/** Call at the scene's ~0.75 s stats interval; hysteresis avoids visible scale oscillation. */
export function nextAdaptiveDpr(
  previous: AdaptiveDprState,
  p95FrameMs: number,
  nowMs: number,
  width: number,
  height: number,
  deviceDpr: number,
): AdaptiveDprState {
  const cap = adaptiveDprCap(width, height, deviceDpr);
  if (previous.dpr > cap) return { dpr: cap, slowWindows: 0, fastWindows: 0, lastChangeMs: nowMs };
  if (!Number.isFinite(p95FrameMs) || p95FrameMs <= 0) return previous;
  const budget = mobileViewport(width) ? 33.3 : 16.7;
  const slowWindows = p95FrameMs > budget * 1.05 ? previous.slowWindows + 1 : 0;
  const fastWindows = p95FrameMs < budget * 0.85 ? previous.fastWindows + 1 : 0;
  if (nowMs - previous.lastChangeMs >= 4_000 && slowWindows >= 3 && previous.dpr > MIN_DPR) {
    return { dpr: Math.max(MIN_DPR, previous.dpr - STEP), slowWindows: 0, fastWindows: 0, lastChangeMs: nowMs };
  }
  if (nowMs - previous.lastChangeMs >= 8_000 && fastWindows >= 8 && previous.dpr < cap) {
    return { dpr: Math.min(cap, previous.dpr + STEP), slowWindows: 0, fastWindows: 0, lastChangeMs: nowMs };
  }
  return { ...previous, slowWindows, fastWindows };
}
