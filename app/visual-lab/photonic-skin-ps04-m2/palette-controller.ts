import {
  FIELD_LUT_SIZE,
  FIELD_PARAMETERS,
  normalizePhase,
  sampleCircularLut,
  type LutSample,
  type PaletteSourceLut,
} from "./photonic-field";
import {
  paletteColorLinear,
  paletteStateForMask,
  validateCompetenceMask,
  type CompetenceMask,
  type PaletteState,
} from "./photonic-palette";

export interface PaletteControllerSnapshot {
  phase: number;
  periodSeconds: number;
  playing: boolean;
  reducedMotion: boolean;
  palette: PaletteState;
  paletteProgress: number;
  sourceLut: PaletteSourceLut;
  transient: boolean;
  transientMask: number;
  transitionCapacity: number;
}

type Listener = () => void;

function mix(a: number, b: number, progress: number) {
  return a + (b - a) * progress;
}

export class PhotonicPaletteController {
  private phase = 0;
  private periodSeconds: number;
  private playing = true;
  private reducedMotion = false;
  private palette: PaletteState;
  private sourceLut: LutSample[];
  private paletteProgress = 1;
  private transitionElapsed = 0;
  private transitionDuration: number = FIELD_PARAMETERS.transitionSeconds;
  private transientMask = 0;
  private readonly listeners = new Set<Listener>();

  constructor(mask: CompetenceMask, periodSeconds: number) {
    this.palette = paletteStateForMask(mask);
    this.periodSeconds = this.validatePeriod(periodSeconds);
    this.transientMask = this.palette.mask;
    this.sourceLut = this.captureTargetLut(this.palette);
  }

  private validatePeriod(value: number) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError("Color period must be finite and greater than zero");
    return value;
  }

  private captureTargetLut(palette: PaletteState) {
    return Array.from({ length: FIELD_LUT_SIZE }, (_, index): LutSample => ({
      color: paletteColorLinear(index / FIELD_LUT_SIZE, palette),
      presence: palette.neutralOnly ? 0 : 1,
    }));
  }

  private displayedAt(coordinate: number): LutSample {
    const source = sampleCircularLut(this.sourceLut, coordinate);
    const target = paletteColorLinear(coordinate, this.palette);
    const targetPresence = this.palette.neutralOnly ? 0 : 1;
    return {
      color: [
        mix(source.color[0], target[0], this.paletteProgress),
        mix(source.color[1], target[1], this.paletteProgress),
        mix(source.color[2], target[2], this.paletteProgress),
      ],
      presence: mix(source.presence, targetPresence, this.paletteProgress),
    };
  }

  private captureDisplayedLut() {
    return Array.from({ length: FIELD_LUT_SIZE }, (_, index) => this.displayedAt(index / FIELD_LUT_SIZE));
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setMask(value: unknown, options: { immediate?: boolean } = {}) {
    const mask = validateCompetenceMask(value);
    if (mask === this.palette.mask && this.paletteProgress >= 1) return false;
    if (options.immediate) {
      this.palette = paletteStateForMask(mask);
      this.sourceLut = this.captureTargetLut(this.palette);
      this.paletteProgress = 1;
      this.transitionElapsed = 0;
      this.transientMask = mask;
      this.emit();
      return true;
    }
    const visibleMask = this.transientMask | this.palette.mask;
    this.sourceLut = this.captureDisplayedLut();
    this.palette = paletteStateForMask(mask);
    this.paletteProgress = 0;
    this.transitionElapsed = 0;
    this.transitionDuration = this.reducedMotion
      ? FIELD_PARAMETERS.reducedTransitionSeconds
      : FIELD_PARAMETERS.transitionSeconds;
    this.transientMask = visibleMask | mask;
    this.emit();
    return true;
  }

  setPeriodSeconds(value: number) {
    this.periodSeconds = this.validatePeriod(value);
    this.emit();
  }

  setPhase(value: number) {
    this.phase = normalizePhase(value);
    this.emit();
  }

  setPlaying(value: boolean) {
    if (this.playing === value) return;
    this.playing = value;
    this.emit();
  }

  setReducedMotion(value: boolean) {
    if (this.reducedMotion === value) return;
    this.reducedMotion = value;
    if (value && this.paletteProgress < 1) {
      this.transitionDuration = Math.min(
        FIELD_PARAMETERS.reducedTransitionSeconds,
        Math.max(0.001, this.transitionDuration - this.transitionElapsed),
      );
      this.transitionElapsed = 0;
    }
    this.emit();
  }

  advance(deltaSeconds: number, options: { hidden?: boolean; visible?: boolean } = {}) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || options.hidden || options.visible === false) return;
    const delta = Math.min(deltaSeconds, 0.1);
    if (this.playing && !this.reducedMotion) {
      this.phase = normalizePhase(this.phase + delta / this.periodSeconds);
    }
    if (this.paletteProgress < 1) {
      this.transitionElapsed += delta;
      const next = Math.min(1, this.transitionElapsed / Math.max(this.transitionDuration, 0.001));
      if (next >= 1) {
        this.paletteProgress = 1;
        this.sourceLut = this.captureTargetLut(this.palette);
        this.transientMask = this.palette.mask;
        this.emit();
      } else {
        this.paletteProgress = next;
      }
    }
  }

  shouldAnimate() {
    return this.paletteProgress < 1 || (this.playing && !this.reducedMotion);
  }

  colorAt(coordinate: number) {
    return this.displayedAt(coordinate);
  }

  snapshot(): PaletteControllerSnapshot {
    return {
      phase: this.phase,
      periodSeconds: this.periodSeconds,
      playing: this.playing,
      reducedMotion: this.reducedMotion,
      palette: this.palette,
      paletteProgress: this.paletteProgress,
      sourceLut: this.sourceLut,
      transient: this.paletteProgress < 1,
      transientMask: this.transientMask,
      transitionCapacity: FIELD_LUT_SIZE,
    };
  }
}
