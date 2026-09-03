/**
 * M6.2 calibration tokens. Magnetism duration stays the M5 baseline of 340 ms.
 * Changing a token requires a versioned evidence pass across wheel, trackpad,
 * touch, keyboard, and programmatic navigation.
 *
 * Position epsilon follows the spec clamp, but never goes below magnetism
 * noopDistancePx. Magnetic rest (≤ 2 px) must be settle-eligible.
 */

import { MAGNETISM } from "../../photonic-skin-ps04-m5/scroll-controller";

export const SETTLE_TOKEN_VERSION = "ps-04-m6-2.v1";

export const MAGNETISM_DURATION_MS = 340;
export const SETTLE_STABLE_MS = 96;
export const INPUT_QUIET_MS = 80;
export const SETTLE_VELOCITY_EPSILON = 0.02;
export const LAYOUT_STABLE_FRAMES = 2;
export const ACTOR_START_BUDGET_MS = 150;
export const ACTOR_QUEUE_CAPACITY = 1;

export function positionEpsilonPx(viewportHeight: number) {
  const vh = Math.max(1, viewportHeight);
  const specified = Math.min(3, Math.max(1.5, vh * 0.002));
  return Math.max(specified, MAGNETISM.noopDistancePx);
}

export const SETTLE_TOKENS = Object.freeze({
  version: SETTLE_TOKEN_VERSION,
  MAGNETISM_DURATION_MS,
  SETTLE_STABLE_MS,
  INPUT_QUIET_MS,
  SETTLE_VELOCITY_EPSILON,
  LAYOUT_STABLE_FRAMES,
  ACTOR_START_BUDGET_MS,
  ACTOR_QUEUE_CAPACITY,
});
