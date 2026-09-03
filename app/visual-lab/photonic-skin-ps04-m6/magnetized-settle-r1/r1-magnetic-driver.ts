/**
 * R1 magnetism driver. Reuses ScrollCompositionController authority and the
 * existing lab rAF tick. Does not add a second animation clock.
 */

import type { ScreenNodeId } from "../../photonic-skin-ps04-m5/topology";
import {
  MAGNETISM,
  restoreScrollY,
  type MagneticPlan,
  type ScrollCompositionController,
  type ScrollHost,
  type UserInputKind,
} from "../../photonic-skin-ps04-m5/scroll-controller";
import {
  captureRadiusPx,
  captureVelocityPxPerMs,
  dampToward,
  magneticStrength,
  magnetismProfile,
  profileTokens,
  type MagnetismProfile,
  type MagnetismProfileId,
} from "./magnetism-profile";

interface MagneticMotion {
  token: number;
  nodeId: ScreenNodeId;
  targetY: number;
  active: boolean;
}

export interface MagneticDriverSnapshot {
  profileId: MagnetismProfileId;
  captureRadiusPx: number;
  magneticStrength: number;
  magneticStrengthM62: number;
  magneticStrengthR1: number;
  distanceToAnchorPx: number;
  touch: boolean;
  active: boolean;
  cancelOnFreshInput: boolean;
  overshoot: boolean;
}

type PatchableController = {
  beginMagnetic: (plan: MagneticPlan) => void;
  onInputIdle: () => void;
  magnetismTokens: () => Record<string, number>;
  noteUserInput: (kind: UserInputKind) => void;
  mode: string;
  magnetToken: number;
  pendingTarget: ScreenNodeId | null;
  skipHysteresis: boolean;
  candidate: MagneticPlan | null;
  velocity: number;
  lastInput: UserInputKind | null;
  finishMagnetic: (token: number) => void;
  armIdle: () => void;
  lastScrollAt: number;
};

function bag(controller: ScrollCompositionController): PatchableController {
  return controller as unknown as PatchableController;
}

function isTouchInput(kind: UserInputKind | null) {
  return kind === "touch";
}

export class R1MagneticDriver {
  private motion: MagneticMotion | null = null;
  private lastStrength = 0;
  private lastDistance = 0;
  private lastRadius = 0;
  private cancelOnFreshInput = false;
  private overshoot = false;
  private touch = false;
  private installed = false;
  private originalBegin: ((plan: MagneticPlan) => void) | null = null;
  private originalIdle: (() => void) | null = null;
  private originalTokens: (() => Record<string, number>) | null = null;
  private originalNote: ((kind: UserInputKind) => void) | null = null;
  private profileId: MagnetismProfileId = "R1_STRONG_BALANCED";
  private onUserInput: ((kind: UserInputKind) => void) | null = null;
  private onMagneticBegin: (() => void) | null = null;

  constructor(private readonly controller: ScrollCompositionController) {}

  setProfileId(id: MagnetismProfileId) {
    this.profileId = id;
  }

  install(hooks?: { onUserInput?: (kind: UserInputKind) => void; onMagneticBegin?: () => void }) {
    if (this.installed) return;
    const internal = bag(this.controller);
    this.onUserInput = hooks?.onUserInput ?? null;
    this.onMagneticBegin = hooks?.onMagneticBegin ?? null;
    this.originalBegin = internal.beginMagnetic.bind(internal);
    this.originalIdle = internal.onInputIdle.bind(internal);
    this.originalTokens = internal.magnetismTokens.bind(internal);
    this.originalNote = internal.noteUserInput.bind(internal);
    internal.magnetismTokens = () => {
      const profile = this.profile();
      if (profile.motion !== "monotonic-damping") return this.originalTokens!.call(internal);
      return {
        ...MAGNETISM,
        ...profileTokens(profile, this.touch),
      };
    };
    internal.onInputIdle = () => {
      const profile = this.profile();
      if (profile.motion !== "monotonic-damping") {
        this.originalIdle!.call(internal);
        return;
      }
      if (internal.mode !== "user") return;
      const velocity = Math.abs(Number(internal.velocity ?? 0));
      const quietMs = typeof performance !== "undefined"
        ? performance.now() - Number(internal.lastScrollAt ?? 0)
        : profile.inputIdleMs;
      const activelyFast = quietMs < profile.inputIdleMs && velocity > captureVelocityPxPerMs(profile, this.touch);
      if (activelyFast) {
        internal.armIdle();
        return;
      }
      this.originalIdle!.call(internal);
    };
    internal.beginMagnetic = (plan: MagneticPlan) => {
      const profile = this.profile();
      if (profile.motion !== "monotonic-damping") {
        this.originalBegin!.call(internal, plan);
        return;
      }
      internal.mode = "magnetic";
      internal.magnetToken = Number(internal.magnetToken ?? 0) + 1;
      internal.pendingTarget = plan.nodeId;
      internal.skipHysteresis = true;
      this.motion = {
        token: Number(internal.magnetToken),
        nodeId: plan.nodeId,
        targetY: plan.targetY,
        active: true,
      };
      this.cancelOnFreshInput = false;
      this.overshoot = false;
      this.onMagneticBegin?.();
    };
    internal.noteUserInput = (kind: UserInputKind) => {
      this.noteInput(kind);
      this.onUserInput?.(kind);
      this.originalNote!(kind);
    };
    this.installed = true;
  }

  uninstall() {
    if (!this.installed) return;
    const internal = bag(this.controller);
    if (this.originalBegin) internal.beginMagnetic = this.originalBegin;
    if (this.originalIdle) internal.onInputIdle = this.originalIdle;
    if (this.originalTokens) internal.magnetismTokens = this.originalTokens;
    if (this.originalNote) internal.noteUserInput = this.originalNote;
    this.installed = false;
    this.motion = null;
  }

  noteInput(kind: UserInputKind) {
    this.touch = isTouchInput(kind) || (kind !== "wheel" && kind !== "keyboard" && this.touch);
    if (this.motion?.active) this.cancelOnFreshInput = true;
    this.motion = null;
  }

  needsClock() {
    return Boolean(this.motion?.active) && this.profile().motion === "monotonic-damping";
  }

  step(dtSeconds: number, scrollY: number, viewportHeight: number, host: ScrollHost | null) {
    const internal = bag(this.controller);
    const profile = this.profile();
    this.touch = isTouchInput(internal.lastInput) || this.touch;
    const radius = captureRadiusPx(profile, viewportHeight, this.touch);
    const distance = this.motion?.active
      ? Math.abs(scrollY - this.motion.targetY)
      : this.nearestAnchorDistance(scrollY);
    this.lastRadius = radius;
    this.lastDistance = Number.isFinite(distance) ? distance : 0;
    const comparison = this.comparison(this.lastDistance, viewportHeight);

    if (profile.motion !== "monotonic-damping") {
      this.lastStrength = comparison.activeStrength;
      return comparison;
    }

    if (internal.mode !== "magnetic" || !this.motion?.active || this.motion.token !== Number(internal.magnetToken)) {
      if (this.motion?.active) this.cancelOnFreshInput = true;
      this.motion = null;
      this.lastStrength = comparison.activeStrength;
      return comparison;
    }

    const strength = Math.max(
      magneticStrength(Math.abs(scrollY - this.motion.targetY), radius),
      profile.minActiveStrength,
    );
    this.lastStrength = strength;
    const nextY = dampToward(scrollY, this.motion.targetY, strength, dtSeconds, profile);
    if ((this.motion.targetY - scrollY) * (this.motion.targetY - nextY) < 0) {
      this.overshoot = true;
    }
    if (host && Math.abs(nextY - scrollY) > 0.02) {
      host.scrollTo({ top: nextY, behavior: "auto" });
    }
    if (Math.abs(this.motion.targetY - nextY) <= profile.noopDistancePx) {
      host?.scrollTo({ top: this.motion.targetY, behavior: "auto" });
      internal.finishMagnetic(this.motion.token);
      this.motion = null;
    }
    return { ...comparison, activeStrength: strength, active: true };
  }

  snapshot(viewportHeight: number): MagneticDriverSnapshot {
    const comparison = this.comparison(this.lastDistance, viewportHeight);
    return {
      profileId: this.profileId,
      captureRadiusPx: this.lastRadius || comparison.r1Radius,
      magneticStrength: this.lastStrength,
      magneticStrengthM62: comparison.m62Strength,
      magneticStrengthR1: comparison.r1Strength,
      distanceToAnchorPx: this.lastDistance,
      touch: this.touch,
      active: Boolean(this.motion?.active),
      cancelOnFreshInput: this.cancelOnFreshInput,
      overshoot: this.overshoot,
    };
  }

  private nearestAnchorDistance(scrollY: number) {
    const layout = this.controller.layout();
    let best = Number.POSITIVE_INFINITY;
    for (const segment of layout.segments) {
      const targetY = restoreScrollY(layout, segment.id, 0);
      const distance = Math.abs(scrollY - targetY);
      if (distance < best) best = distance;
    }
    return Number.isFinite(best) ? best : 0;
  }

  private profile(): MagnetismProfile {
    return magnetismProfile(this.profileId);
  }

  private comparison(distance: number, viewportHeight: number) {
    const current = this.profile();
    const m62 = magnetismProfile("M6_2_CURRENT");
    const r1 = magnetismProfile("R1_STRONG_BALANCED");
    const m62Radius = captureRadiusPx(m62, viewportHeight, this.touch);
    const r1Radius = captureRadiusPx(r1, viewportHeight, this.touch);
    const activeRadius = captureRadiusPx(current, viewportHeight, this.touch);
    return {
      m62Radius,
      r1Radius,
      activeRadius,
      m62Strength: magneticStrength(distance, m62Radius),
      r1Strength: magneticStrength(distance, r1Radius),
      activeStrength: magneticStrength(distance, activeRadius),
      active: Boolean(this.motion?.active),
    };
  }
}
