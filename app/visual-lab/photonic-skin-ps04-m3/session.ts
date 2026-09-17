/**
 * Single owner of M3 simulation time: geometry progress, palette, idle, residual.
 * Views may render from snapshot(); they must not tick independently.
 */

import type { DecodedState, LabFrame, StateEntry } from "../photonic-skin-m4-1/m41-data";
import {
  createRetargetSnapshot,
  type RuntimeTransitionSnapshot,
  type TransitionProgram,
} from "../photonic-skin-m4-1/m41-evaluator";
import { interpolatePresentationFrames } from "../photonic-skin-m4-1r/photonic-presentation";
import {
  FIELD_PARAMETERS,
} from "../photonic-skin-ps04-m2/photonic-field";
import {
  ALL_COMPETENCE_MASK,
  paletteMaskForState,
} from "../photonic-skin-ps04-m2/photonic-palette";
import type { PaletteControllerSnapshot } from "../photonic-skin-ps04-m2/palette-controller";
import {
  FROZEN_ACTOR_ANCHOR,
  advancePhase,
  evaluateLiveIdle,
  identityTransform,
  idleFamilyForState,
  mixQuatTowardIdentity,
  mixScaleTowardIdentity,
  multiplyQuat,
  overlayEqualsIdentity,
  presetForFamily,
  type IdleChannelMode,
  type IdleFamily,
  type IdleTransform,
  type Quat,
  type Vec3,
} from "./idle-motion";
import {
  durationSecondsForProgram,
  samplePhaseAdapter,
  type PhaseAdapterSample,
} from "./phase-adapter";
import { PhotonicPaletteDriver } from "./palette-driver";

export type SessionStatus = "boot" | "settled" | "transitioning";
export type OverlayMode = "m2-reference" | "m3-idle" | "m3-combined";
export type CameraPose = "canonical" | "alternate" | "side" | "top";

export interface SessionOptions {
  reducedMotion?: boolean;
  overlayMode?: OverlayMode;
  idleChannel?: IdleChannelMode;
  profile?: LabFrame;
  colorPeriodSeconds?: number;
  mask?: number;
}

export interface JointSnapshot {
  renderedPair?: { source: DecodedState; target: DecodedState };
  capturedAtRevision: number;
  geometryProgress: number;
  m4Snapshot: RuntimeTransitionSnapshot | null;
  overlay: IdleTransform;
  palette: PaletteControllerSnapshot;
  colorPhase: number;
  colorPeriodSeconds: number;
  requestedStateId: string;
  settledStateId: string;
  sourceStateId: string;
  targetStateId: string;
}

export interface OverlayUniforms {
  enabled: boolean;
  anchor: Vec3;
  scale: number;
  quaternion: Quat;
}

export interface SessionSnapshot {
  revision: number;
  requestRevision: number;
  status: SessionStatus;
  requestedStateId: string;
  settledStateId: string;
  sourceStateId: string;
  targetStateId: string;
  geometryProgress: number;
  overlayMode: OverlayMode;
  idleChannel: IdleChannelMode;
  overlayEnabled: boolean;
  pauseAll: boolean;
  colorWavePaused: boolean;
  idleOff: boolean;
  hidden: boolean;
  offscreen: boolean;
  reducedMotion: boolean;
  profile: LabFrame;
  family: IdleFamily;
  idle: IdleTransform;
  residual: IdleTransform;
  displayed: IdleTransform;
  overlay: OverlayUniforms;
  phases: { breath: number; rotation: number; color: number };
  phaseAdapter: PhaseAdapterSample;
  palette: PaletteControllerSnapshot;
  shouldAnimate: boolean;
  lastTickDt: number;
  sessionTime: number;
}

const MAX_DT = 0.1;
const IDLE_EASE_SECONDS = 1;

export function runtimeDecoded(
  snapshot: RuntimeTransitionSnapshot,
  source: DecodedState,
  target: DecodedState,
  progress: number,
): DecodedState {
  const metadata = progress < 0.5 ? source : target;
  const presentationFrame = interpolatePresentationFrames(source.entry, target.entry, progress);
  return {
    ...snapshot,
    entry: ({
      ...source.entry,
      stateId: `runtime-snapshot-${progress.toFixed(3)}`,
      contentHash: `runtime-${source.entry.contentHash.slice(0, 16)}-${target.entry.contentHash.slice(0, 16)}-${progress.toFixed(3)}`,
      presentationFrame,
    } as StateEntry & { presentationFrame: typeof presentationFrame }),
    density: new Uint8Array(metadata.density),
    lodPriority: new Uint16Array(metadata.lodPriority),
  };
}

function composeDisplayed(live: IdleTransform, residual: IdleTransform, residualWeight: number, decorativeWeight: number): IdleTransform {
  const liveScale = mixScaleTowardIdentity(live.scale, decorativeWeight);
  const liveQuat = mixQuatTowardIdentity(live.quaternion, decorativeWeight);
  const residualScale = mixScaleTowardIdentity(residual.scale, residualWeight);
  const residualQuat = mixQuatTowardIdentity(residual.quaternion, residualWeight);
  const scale = residualScale * liveScale;
  return {
    anchor: FROZEN_ACTOR_ANCHOR,
    scale,
    quaternion: multiplyQuat(residualQuat, liveQuat),
    breath: scale,
    angleRadians: residual.angleRadians * residualWeight + live.angleRadians * decorativeWeight,
    decorativeWeight,
  };
}

export class PhotonicMotionSession {
  readonly palette: PhotonicPaletteDriver;
  private revision = 0;
  private requestRevision = 0;
  private status: SessionStatus = "boot";
  private overlayMode: OverlayMode;
  private idleChannel: IdleChannelMode;
  private profile: LabFrame;
  private pauseAll = false;
  private colorWavePaused = false;
  private idleOff = false;
  private hidden = false;
  private offscreen = false;
  private reducedMotion: boolean;
  private source: DecodedState | null = null;
  private target: DecodedState | null = null;
  private program: TransitionProgram | null = null;
  private requestedStateId = "";
  private settledStateId = "";
  private geometryProgress = 1;
  private geometryPlaying = false;
  private breathPhase = 0;
  private rotationPhase = 0;
  private residual: IdleTransform = identityTransform();
  private settledElapsed = 0;
  private lastTickDt = 0;
  private sessionTime = 0;
  private lastTickToken = -1;
  private readonly listeners = new Set<() => void>();

  constructor(options: SessionOptions = {}) {
    this.reducedMotion = Boolean(options.reducedMotion);
    this.overlayMode = options.overlayMode ?? "m3-combined";
    this.idleChannel = options.idleChannel ?? "combined";
    this.profile = options.profile ?? "desktop";
    this.palette = new PhotonicPaletteDriver(
      options.mask ?? ALL_COMPETENCE_MASK,
      options.colorPeriodSeconds ?? FIELD_PARAMETERS.periodsSeconds.master,
    );
    this.palette.setReducedMotion(this.reducedMotion);
    if (this.reducedMotion) this.palette.setPlaying(false);
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  overlayEnabled() {
    return this.overlayMode !== "m2-reference" && !this.reducedMotion;
  }

  choreographyEnabled() {
    return this.overlayMode === "m3-combined";
  }

  beginRequest(stateId: string) {
    this.requestRevision += 1;
    this.requestedStateId = stateId;
    this.status = this.settledStateId === stateId && this.geometryProgress >= 1 ? "settled" : "transitioning";
    return this.requestRevision;
  }

  isCurrent(revision: number) {
    return revision === this.requestRevision;
  }

  captureJoint(rendered?: { source: DecodedState; target: DecodedState; program: TransitionProgram; progress: number }, deferGeometry = false): JointSnapshot {
    const displayed = this.displayedTransform();
    const progress = rendered?.progress ?? this.geometryProgress;
    const source = rendered?.source ?? this.source;
    const target = rendered?.target ?? this.target;
    const program = rendered?.program ?? this.program;
    const m4Snapshot = !deferGeometry && source && target && program && progress < 1 && (rendered || this.status === "transitioning")
      ? createRetargetSnapshot(source, target, program, progress)
      : null;
    if (rendered && m4Snapshot) {
      // R2 snapshots bake the visible radius. Thresholding fractional activation
      // to status would otherwise pop emerging/disappearing flakes on retarget.
      const floor = program?.compiled?.header.activationPolicy.minimumGeometricScale ?? 0.18;
      for (let id = 0; id < m4Snapshot.recordCount; id++) {
        const presence = m4Snapshot.activation[id];
        m4Snapshot.scale[id] *= presence * (floor + (1 - floor) * presence);
        m4Snapshot.status[id] = presence > 0 ? 0 : 1;
        m4Snapshot.activation[id] = presence > 0 ? 1 : 0;
        m4Snapshot.scaleVelocity[id] = 0;
      }
    }
    return {
      capturedAtRevision: this.requestRevision,
      renderedPair: rendered ? { source: rendered.source, target: rendered.target } : undefined,
      geometryProgress: progress,
      m4Snapshot,
      overlay: displayed,
      palette: this.palette.snapshot(),
      colorPhase: this.palette.snapshot().phase,
      colorPeriodSeconds: this.palette.snapshot().periodSeconds,
      requestedStateId: this.requestedStateId,
      settledStateId: this.settledStateId,
      sourceStateId: this.source?.entry.stateId ?? "",
      targetStateId: this.target?.entry.stateId ?? "",
    };
  }

  bootstrapSettled(state: DecodedState, program: TransitionProgram) {
    this.source = state;
    this.target = state;
    this.program = program;
    this.requestedStateId = state.entry.stateId;
    this.settledStateId = state.entry.stateId;
    this.geometryProgress = 1;
    this.geometryPlaying = false;
    this.status = "settled";
    this.residual = identityTransform();
    this.settledElapsed = this.reducedMotion ? IDLE_EASE_SECONDS : 0;
    this.syncPaletteToState(state, { mode: "immediate" });
    this.revision += 1;
    this.emit();
  }

  commitTransition(args: {
    revision: number;
    source: DecodedState;
    target: DecodedState;
    program: TransitionProgram;
    captured: JointSnapshot;
    play?: boolean;
  }) {
    if (args.revision !== this.requestRevision) return false;
    this.source = args.source;
    this.target = args.target;
    this.program = args.program;
    this.requestedStateId = args.target.entry.stateId;
    this.residual = args.captured.overlay;
    const reduced = this.reducedMotion || args.program.selfTransition || args.program.durationMs <= 0;
    this.geometryProgress = reduced ? 1 : 0;
    this.geometryPlaying = !reduced && (args.play ?? this.choreographyEnabled());
    this.status = reduced ? "settled" : "transitioning";
    this.settledElapsed = reduced ? IDLE_EASE_SECONDS : 0;
    if (reduced) {
      this.residual = identityTransform();
      this.settledStateId = args.target.entry.stateId;
    }
    const sameMask = paletteMaskForState(args.target.entry) === args.captured.palette.palette.mask
      && args.captured.palette.paletteProgress >= 1;
    if (sameMask) {
      this.syncPaletteToState(args.target, { mode: "immediate" });
    } else if (reduced) {
      this.syncPaletteToState(args.target, { mode: this.reducedMotion ? "immediate" : "immediate" });
    } else {
      this.syncPaletteToState(args.target, { mode: "geometry-linked" });
    }
    this.revision += 1;
    this.emit();
    return true;
  }

  private syncPaletteToState(state: DecodedState, options: { mode: "immediate" | "geometry-linked" | "free" }) {
    const mask = paletteMaskForState(state.entry);
    const family = idleFamilyForState(state.entry);
    const period = family === "single"
      ? FIELD_PARAMETERS.periodsSeconds.single
      : family === "brand-wide"
        ? FIELD_PARAMETERS.periodsSeconds["brand-wide"]
        : FIELD_PARAMETERS.periodsSeconds.complex;
    this.palette.setPeriodSeconds(period);
    this.palette.setMask(mask, { mode: options.mode });
  }

  setOverlayMode(mode: OverlayMode) {
    this.overlayMode = mode;
    this.revision += 1;
    this.emit();
  }

  setIdleChannel(channel: IdleChannelMode) {
    this.idleChannel = channel;
    this.revision += 1;
    this.emit();
  }

  setProfile(profile: LabFrame) {
    this.profile = profile;
    this.revision += 1;
    this.emit();
  }

  setPauseAll(value: boolean) {
    this.pauseAll = value;
    this.emit();
  }

  setColorWavePaused(value: boolean) {
    this.colorWavePaused = value;
    this.palette.setPlaying(!value && !this.pauseAll && !this.reducedMotion);
    this.emit();
  }

  setIdleOff(value: boolean) {
    this.idleOff = value;
    this.emit();
  }

  setHidden(value: boolean) {
    if (this.hidden === value) return;
    this.hidden = value;
    this.emit();
  }

  setOffscreen(value: boolean) {
    if (this.offscreen === value) return;
    this.offscreen = value;
    this.emit();
  }

  setReducedMotion(value: boolean) {
    if (this.reducedMotion === value) return;
    this.reducedMotion = value;
    this.palette.setReducedMotion(value);
    if (value) {
      this.geometryProgress = 1;
      this.geometryPlaying = false;
      this.residual = identityTransform();
      this.settledElapsed = IDLE_EASE_SECONDS;
      this.status = "settled";
      this.settledStateId = this.requestedStateId || this.settledStateId;
      if (this.target) this.syncPaletteToState(this.target, { mode: "immediate" });
    }
    this.palette.setPlaying(!this.colorWavePaused && !this.pauseAll && !value);
    this.revision += 1;
    this.emit();
  }

  restoreFromSnapshot(snapshot: SessionSnapshot) {
    this.pauseAll = snapshot.pauseAll;
    this.colorWavePaused = snapshot.colorWavePaused;
    this.idleOff = snapshot.idleOff;
    this.reducedMotion = snapshot.reducedMotion;
    this.palette.setReducedMotion(snapshot.reducedMotion);
    this.palette.setPhase(snapshot.phases.color);
    this.palette.setPlaying(!snapshot.colorWavePaused && !snapshot.pauseAll && !snapshot.reducedMotion);
    this.breathPhase = snapshot.phases.breath;
    this.rotationPhase = snapshot.phases.rotation;
    this.geometryProgress = snapshot.geometryProgress;
    this.residual = snapshot.residual;
    this.emit();
  }

  seekGeometryProgress(progress: number) {
    const next = Math.min(1, Math.max(0, progress));
    this.geometryProgress = this.reducedMotion ? 1 : next;
    this.geometryPlaying = false;
    if (this.geometryProgress >= 1) {
      this.status = "settled";
      this.settledStateId = this.target?.entry.stateId ?? this.settledStateId;
      this.residual = identityTransform();
    }
    this.revision += 1;
    this.emit();
  }

  seekColorPhase(phase: number) {
    this.palette.setPhase(phase);
    this.palette.setPlaying(false);
    this.colorWavePaused = true;
    this.emit();
  }

  seekIdlePhases(breath: number, rotation: number) {
    this.breathPhase = breath - Math.floor(breath);
    this.rotationPhase = rotation - Math.floor(rotation);
    this.emit();
  }

  playGeometry(value: boolean) {
    this.geometryPlaying = value && this.choreographyEnabled() && !this.reducedMotion && this.geometryProgress < 1;
    this.emit();
  }

  tick(deltaSeconds: number, tickToken?: number) {
    if (tickToken !== undefined) {
      if (tickToken === this.lastTickToken) return;
      this.lastTickToken = tickToken;
    }
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    if (this.pauseAll || this.hidden || this.offscreen) {
      this.lastTickDt = 0;
      return;
    }
    const dt = Math.min(deltaSeconds, MAX_DT);
    this.lastTickDt = dt;
    this.sessionTime += dt;

    const family = idleFamilyForState(this.target?.entry ?? this.source?.entry);
    const preset = presetForFamily(family);
    const overlayOn = this.overlayEnabled() && !this.idleOff;
    if (overlayOn && !this.reducedMotion) {
      this.breathPhase = advancePhase(this.breathPhase, dt, preset.breathPeriodSeconds);
      this.rotationPhase = advancePhase(this.rotationPhase, dt, preset.rotationPeriodSeconds);
    }

    if (this.geometryPlaying && this.program && this.geometryProgress < 1) {
      const duration = durationSecondsForProgram(this.program);
      if (duration <= 0) {
        this.geometryProgress = 1;
      } else {
        this.geometryProgress = Math.min(1, this.geometryProgress + dt / duration);
      }
      if (this.geometryProgress >= 1) {
        this.geometryPlaying = false;
        this.status = "settled";
        this.settledStateId = this.target?.entry.stateId ?? this.settledStateId;
        this.residual = identityTransform();
        this.settledElapsed = 0;
      }
    }

    if (this.status === "settled" || this.geometryProgress >= 1) {
      this.settledElapsed += dt;
    }

    const adapter = this.phaseSample();
    this.palette.setGeometryLinkedProgress(adapter.paletteProgress);
    this.palette.advance(dt, {
      pausePhase: this.colorWavePaused || this.reducedMotion,
    });
  }

  private phaseSample(): PhaseAdapterSample {
    return samplePhaseAdapter({
      program: this.program,
      progress: this.geometryProgress,
      playingTransition: this.status === "transitioning" && this.geometryProgress < 1,
      settledElapsed: this.settledElapsed,
      reducedMotion: this.reducedMotion,
      overlayEnabled: this.overlayEnabled() && !this.idleOff,
    });
  }

  private liveIdle(): IdleTransform {
    if (!this.overlayEnabled() || this.idleOff) return identityTransform();
    const family = idleFamilyForState(this.target?.entry ?? this.source?.entry);
    const adapter = this.phaseSample();
    return evaluateLiveIdle({
      phases: { breath: this.breathPhase, rotation: this.rotationPhase },
      family,
      profile: this.profile,
      channel: this.idleChannel,
      decorativeWeight: adapter.decorativeIdleWeight,
      reducedMotion: this.reducedMotion,
    });
  }

  displayedTransform(): IdleTransform {
    if (!this.overlayEnabled()) return identityTransform();
    const adapter = this.phaseSample();
    return composeDisplayed(this.liveIdle(), this.residual, adapter.residualWeight, adapter.decorativeIdleWeight);
  }

  shouldAnimate() {
    if (this.pauseAll || this.hidden || this.offscreen) return false;
    if (this.geometryPlaying && this.geometryProgress < 1) return true;
    if (this.palette.shouldAnimate() && !this.colorWavePaused) return true;
    if (!this.overlayEnabled() || this.idleOff || this.reducedMotion) {
      return this.palette.snapshot().paletteProgress < 1;
    }
    const displayed = this.displayedTransform();
    if (!overlayEqualsIdentity(displayed) || this.phaseSample().decorativeIdleWeight < 1) return true;
    if (this.idleChannel !== "off") return true;
    return false;
  }

  snapshot(): SessionSnapshot {
    const adapter = this.phaseSample();
    const live = this.liveIdle();
    const displayed = this.displayedTransform();
    const palette = this.palette.snapshot();
    const family = idleFamilyForState(this.target?.entry ?? this.source?.entry);
    return {
      revision: this.revision,
      requestRevision: this.requestRevision,
      status: this.status,
      requestedStateId: this.requestedStateId,
      settledStateId: this.settledStateId,
      sourceStateId: this.source?.entry.stateId ?? "",
      targetStateId: this.target?.entry.stateId ?? "",
      geometryProgress: adapter.progress,
      overlayMode: this.overlayMode,
      idleChannel: this.idleChannel,
      overlayEnabled: this.overlayEnabled(),
      pauseAll: this.pauseAll,
      colorWavePaused: this.colorWavePaused,
      idleOff: this.idleOff,
      hidden: this.hidden,
      offscreen: this.offscreen,
      reducedMotion: this.reducedMotion,
      profile: this.profile,
      family,
      idle: live,
      residual: this.residual,
      displayed,
      overlay: {
        enabled: this.overlayEnabled() && !overlayEqualsIdentity(displayed),
        anchor: displayed.anchor,
        scale: displayed.scale,
        quaternion: displayed.quaternion,
      },
      phases: { breath: this.breathPhase, rotation: this.rotationPhase, color: palette.phase },
      phaseAdapter: adapter,
      palette,
      shouldAnimate: this.shouldAnimate(),
      lastTickDt: this.lastTickDt,
      sessionTime: this.sessionTime,
    };
  }

  getSource() { return this.source; }
  getTarget() { return this.target; }
  getProgram() { return this.program; }
}
