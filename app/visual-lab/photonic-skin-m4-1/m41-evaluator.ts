/**
 * PS-03.M4.1 browser reference compiler/evaluator.
 *
 * The core deliberately consumes geometry and numeric metadata only. State,
 * competency, target and component names never participate in motion policy.
 */

import { compileTransitionExact } from "./m41-compiler";

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];
export type TriggerMode = "route" | "lab-scroll-scrub" | "preview" | "qa";
export type ViewportProfile = "desktop" | "mobile";

export type PhaseWindows = Record<MotionPhase, readonly [number, number]>;

export interface MotionProfileDefinition {
  schemaVersion: "1.0.0";
  profileId: string;
  profileVersion: string;
  triggerMode: { default: TriggerMode; supported: readonly TriggerMode[] };
  timingPolicy: {
    durationBoundsSeconds: readonly [number, number];
    variants: Record<TriggerMode, Record<ViewportProfile, {
      durationSeconds: number;
      anticipationSeconds: number;
      hardCapSeconds?: number;
      responseLambdaPerSecond?: number;
      scrubDriven?: boolean;
      geometryInfluence?: number;
    }>>;
  };
  phasePolicy: {
    sequence: readonly string[];
    windows: PhaseWindows;
    spatialDelayFraction: number;
    basis: "quintic-c2-window-v1";
  };
  globalPosePolicy: {
    mode: string;
    translationAmplitudeFraction: Record<ViewportProfile, number>;
    rotationRadiansMax: Record<ViewportProfile, number>;
    cameraMotion: boolean;
    endpointIdentityPose: boolean;
  };
  groupCoherencePolicy: {
    mode: string;
    centerWeighting: string;
    localSkinBlend: string;
    localHandoffSpanFraction: number;
    localMorphWidthFraction: number;
    routeOnlyDuringLocalHandoff: boolean;
    endpointHoldOutsideHandoff: boolean;
    denseAssignment: boolean;
  };
  routeFieldPolicy: {
    mode: string;
    directionSource: string;
    maximumMacroRoute: number;
    baseMacroRoute: number;
    distanceFactor: number;
    maximumResidual: number;
    residualDistanceFraction: number;
    mobileAmplitudeFactor: number;
    previewAmplitudeFactor: number;
    pairSpecificOverrides: boolean;
  };
  splitMergePolicy: {
    mode: string;
    bridgeWindow: readonly [number, number];
    bridgePeak: number;
    maximumBridgeFractionPerGroup: number;
    maximumBridgeIdsPerGroup: number;
    bridgeThickness: number;
    protectedIdsEligible: boolean;
    opacityOnly: boolean;
  };
  reserveTransportPolicy: {
    mode: string;
    emergenceWindow: readonly [number, number];
    immersionWindow: readonly [number, number];
    depthRouteFraction: number;
    spatialOrderingFraction: number;
    minimumGeometricScale: number;
    opacityOnly: boolean;
  };
  featureProtectionPolicy: {
    sourceReleaseDelay: number;
    targetRevealAdvance: number;
    routeAmplitudeFactor: number;
    flags: readonly string[];
  };
  orientationPolicy: Record<string, unknown>;
  scalePolicy: {
    mode: string;
    activeGlobalMinimumFraction: number;
    bridgePulseMaximum: number;
    opacityMasking: boolean;
  };
  settlePolicy: {
    mode: string;
    maximumAmplitudeFraction: Record<ViewportProfile, number>;
    cycles: number;
    driftAfterEnd: boolean;
    oneShot: boolean;
    idleAfterEnd: "static";
  };
  productionScrollPolicy: Record<string, unknown>;
  retargetPolicy: Record<string, unknown>;
  lodPolicy: Record<string, unknown>;
  reducedMotionPolicy: Record<string, unknown>;
  validationPolicy: Record<string, unknown>;
  provenance: Record<string, unknown>;
}

export type MotionPhase =
  | "anticipation"
  | "release"
  | "regroup"
  | "reveal"
  | "approach"
  | "settle";

export interface TransitionState {
  readonly recordCount: number;
  readonly position: Float32Array;
  readonly normal: Float32Array;
  readonly orientation: Float32Array;
  readonly scale: Float32Array;
  readonly reserveDepth: Float32Array;
  readonly component: Uint8Array;
  readonly shell: Uint8Array;
  readonly status: Uint8Array;
  readonly flags: Uint8Array;
  readonly transitionGroup: Uint8Array;
  readonly velocity?: Float32Array;
  /** Frozen M3 bytes retained for exact browser compiler provenance. */
  readonly rawRecords?: Uint8Array;
  readonly density?: Uint8Array;
  readonly lodPriority?: Uint16Array;
  readonly entry?: { stateId: string; shellCount?: number; contentHash?: string };
  readonly snapshotHash?: string;
}

export interface SourceSnapshotDescriptor {
  snapshotHash: string;
  recordCount: number;
  sourceProgramHash?: string;
  capturedProgress?: number;
  generation?: number;
}

export interface TransitionRequest {
  schemaVersion?: "1.0.0";
  sourceStateId?: string;
  sourceSnapshot?: RuntimeTransitionSnapshot | SourceSnapshotDescriptor;
  targetStateId: string;
  identitySpaceVersion: string;
  motionProfileId: string;
  triggerMode: TriggerMode;
  viewportProfile: ViewportProfile;
  directionIntent?: Vec3 | "auto";
  /** Canonical external request override in seconds. */
  durationOverride?: number;
  /** Internal/browser compatibility alias. */
  durationOverrideMs?: number;
  deterministicSeed: number;
  probeIdentityCount?: number;
  reducedMotion?: boolean;
}

export interface GroupTrack {
  sourceGroup: number;
  targetGroup: number;
  sourceShell: number;
  targetShell: number;
  sourceCenter: Vec3;
  targetCenter: Vec3;
  route: Vec3;
  mass: number;
  protectedMass: number;
  bridgeWeight: number;
}

/** Exact decoded form of the Python compiler's 64-byte group-track record. */
export interface CompiledGroupTrack {
  sourceCenter: Vec3;
  targetCenter: Vec3;
  routeControl: Vec3;
  direction: Vec3;
  releaseStart: number;
  releaseEnd: number;
  revealStart: number;
  revealEnd: number;
  bridgeStart: number;
  bridgeEnd: number;
  sourceMacro: number;
  targetMacro: number;
  flags: number;
  memberCount: number;
}

/** Exact decoded form of the Python compiler's 32-byte persistent-ID records. */
export interface CompiledPerId {
  localSource: Float32Array;
  localTarget: Float32Array;
  residual: Float32Array;
  depth: Float32Array;
  activationStart: Float32Array;
  activationEnd: Float32Array;
  scaleBias: Float32Array;
  groupIndex: Uint16Array;
  flags: Uint16Array;
  phaseOffset: Uint8Array;
}

export interface CompiledProgramHeader {
  sourceStateId: string;
  targetStateId: string;
  triggerMode: TriggerMode;
  viewportProfile: ViewportProfile;
  identityCount: number;
  groupCount: number;
  durationSeconds: number;
  isNoOp: boolean;
  endpointLibrary: {
    stage: "PS-03.M3.1R";
    stateVersion: "3.1.1";
    deterministicFingerprint: string;
    manifestSha256: string;
  };
  endpointExactness: { times: readonly [number, number]; fields: readonly string[] };
  reducedMotion: boolean;
  deterministicSeed: number;
  directionAxis: Vec3;
  phasePolicy: {
    windows: PhaseWindows;
  };
  activationPolicy: {
    bridgePulseMaximum: number;
    depthRouteFraction: number;
    minimumGeometricScale: number;
    phaseOffsetRange: number;
    bridgeThickness?: number;
    localMorphWidthFraction?: number;
    routeOnlyDuringLocalHandoff?: boolean;
    endpointHoldOutsideHandoff?: boolean;
  };
  settlePolicy: {
    maximumAmplitudeFraction: number;
    window: readonly [number, number];
  };
  actorTrack: {
    centerStart: Vec3;
    centerEnd: Vec3;
    rotationAxis: Vec3;
    rotationRadians: number;
    translationAxis: Vec3;
    translationAmplitude: number;
    window: readonly [number, number];
    sourcePose: { position: Vec3; orientation: Quat };
  };
}

export interface DecodedCompiledProgram {
  header: CompiledProgramHeader;
  groupTracks: CompiledGroupTrack[];
  perId: CompiledPerId;
  hashes: Record<string, string>;
  groupPayload?: Uint8Array;
  perIdPayload?: Uint8Array;
  metadata?: Record<string, unknown>;
}

export interface TransitionProgram {
  schemaVersion: "1.1.0";
  programVersion: "2.1.0";
  programId: string;
  identitySpaceVersion: string;
  recordCount: number;
  durationMs: number;
  capMs: number;
  selfTransition: boolean;
  triggerMode: TriggerMode;
  viewportProfile: ViewportProfile;
  directionIntent: Vec3;
  phases: PhaseWindows;
  tracks: GroupTrack[];
  /** track index, residual xyz, phase delay, bridge weight */
  trackIndex: Uint16Array;
  residual: Float32Array;
  phaseDelay: Float32Array;
  bridgeWeight: Float32Array;
  sourceVelocity?: Float32Array;
  sourceScaleVelocity?: Float32Array;
  deterministicSeed: number;
  /** Provenance is surfaced in the Lab so on-demand fallback is never mistaken for an approval artifact. */
  programSource?: "precompiled" | "on-demand-compiled" | "on-demand-fallback";
  machineValid?: boolean;
  /** Present when the Python-authored 64/32-byte approval buffers were decoded. */
  compiled?: DecodedCompiledProgram;
}

export interface EvaluatedElement {
  position: [number, number, number];
  velocity: [number, number, number];
  normal: [number, number, number];
  orientation: [number, number, number, number];
  scale: number;
  activation: number;
  bridge: number;
  role: [number, number, number];
  status: number;
  groupPhase: number;
  actorPose: { position: [number, number, number]; orientation: [number, number, number, number] };
  phase: MotionPhase | "idle";
}

export interface RuntimeTransitionSnapshot extends TransitionState {
  readonly velocity: Float32Array;
  readonly angularVelocity: Float32Array;
  readonly scaleVelocity: Float32Array;
  readonly actorPose: Float32Array;
  readonly activation: Float32Array;
  readonly bridge: Float32Array;
  readonly role: Float32Array;
}

export const DIRECTED_PLASTIC_RELEASE: MotionProfileDefinition = {
  schemaVersion: "1.0.0",
  profileId: "directed-plastic-release",
  profileVersion: "2.2.0",
  triggerMode: { default: "route", supported: ["route", "lab-scroll-scrub", "preview", "qa"] },
  timingPolicy: {
    durationBoundsSeconds: [0.18, 1.35],
    variants: {
      route: {
        desktop: { durationSeconds: 0.98, anticipationSeconds: 0.11, hardCapSeconds: 1.35 },
        mobile: { durationSeconds: 0.78, anticipationSeconds: 0.08, hardCapSeconds: 1.1 },
      },
      "lab-scroll-scrub": {
        desktop: { durationSeconds: 0.98, anticipationSeconds: 0, responseLambdaPerSecond: 11, scrubDriven: true },
        mobile: { durationSeconds: 0.78, anticipationSeconds: 0, responseLambdaPerSecond: 14, scrubDriven: true },
      },
      preview: {
        desktop: { durationSeconds: 0.42, anticipationSeconds: 0.04, geometryInfluence: 0.35 },
        mobile: { durationSeconds: 0.36, anticipationSeconds: 0, geometryInfluence: 0.25 },
      },
      qa: {
        desktop: { durationSeconds: 0.98, anticipationSeconds: 0.11, hardCapSeconds: 1.35 },
        mobile: { durationSeconds: 0.78, anticipationSeconds: 0.08, hardCapSeconds: 1.1 },
      },
    },
  },
  phasePolicy: {
    sequence: ["anticipation", "release", "regroup", "reveal", "approach", "settle", "idle-handoff"],
    windows: {
      anticipation: [0, 0.11],
      release: [0.07, 0.38],
      regroup: [0.24, 0.68],
      reveal: [0.4, 0.82],
      approach: [0.62, 0.94],
      settle: [0.86, 1],
    },
    spatialDelayFraction: 0.075,
    basis: "quintic-c2-window-v1",
  },
  globalPosePolicy: {
    mode: "geometry-derived-bounded-actor",
    translationAmplitudeFraction: { desktop: 0.012, mobile: 0.006 },
    rotationRadiansMax: { desktop: 0.045, mobile: 0.022 },
    cameraMotion: false,
    endpointIdentityPose: true,
  },
  groupCoherencePolicy: {
    mode: "source-target-transition-group-shell-pairs",
    centerWeighting: "active-protected-mass",
    localSkinBlend: "spatial-narrow-quintic-handoff-v2",
    localHandoffSpanFraction: 0.38,
    localMorphWidthFraction: 0.12,
    routeOnlyDuringLocalHandoff: true,
    endpointHoldOutsideHandoff: true,
    denseAssignment: false,
  },
  routeFieldPolicy: {
    mode: "geometry-principal-axis-directed",
    directionSource: "request-or-endpoint-principal-axis",
    maximumMacroRoute: 0.24,
    baseMacroRoute: 0.025,
    distanceFactor: 0.075,
    maximumResidual: 0.032,
    residualDistanceFraction: 0.018,
    mobileAmplitudeFactor: 0.68,
    previewAmplitudeFactor: 0.35,
    pairSpecificOverrides: false,
  },
  splitMergePolicy: {
    mode: "shell-graph-staging",
    bridgeWindow: [0.3, 0.72],
    bridgePeak: 0.5,
    maximumBridgeFractionPerGroup: 0.08,
    maximumBridgeIdsPerGroup: 96,
    bridgeThickness: 0.72,
    protectedIdsEligible: false,
    opacityOnly: false,
  },
  reserveTransportPolicy: {
    mode: "finite-normal-depth",
    emergenceWindow: [0.18, 0.72],
    immersionWindow: [0.08, 0.78],
    depthRouteFraction: 0.18,
    spatialOrderingFraction: 0.1,
    minimumGeometricScale: 0.18,
    opacityOnly: false,
  },
  featureProtectionPolicy: {
    sourceReleaseDelay: 0.055,
    targetRevealAdvance: 0.05,
    routeAmplitudeFactor: 0.58,
    flags: ["feature", "silhouette"],
  },
  orientationPolicy: {
    mode: "shortest-path-quaternion-slerp",
    normalizeEverySample: true,
    normalSource: "transported-orientation",
    allowBasisSpin: false,
  },
  scalePolicy: {
    mode: "endpoint-exact-quintic",
    activeGlobalMinimumFraction: 0.82,
    bridgePulseMaximum: 0.035,
    opacityMasking: false,
  },
  settlePolicy: {
    mode: "single-c2-material-independent-pulse",
    maximumAmplitudeFraction: { desktop: 0.018, mobile: 0.008 },
    cycles: 1,
    driftAfterEnd: false,
    oneShot: true,
    idleAfterEnd: "static",
  },
  productionScrollPolicy: {
    scrollDrivesProgress: false,
    routeSelectionBehavior: "settle-to-target",
    clickDuringTransition: "retarget-from-current-snapshot",
    labOnlyScrubMode: "lab-scroll-scrub",
  },
  retargetPolicy: {
    mode: "transient-snapshot",
    positionBasis: "quintic-hermite-initial-velocity-v1",
    preserveVelocity: true,
    preserveOrientation: true,
    preserveScale: true,
    generationWins: "latest",
  },
  lodPolicy: { mode: "strict-persistent-id-prefix", preserveGroupPhase: true, renumberIds: false, probeCount: 512 },
  reducedMotionPolicy: {
    mode: "target-next-render-step",
    anticipation: false,
    splitMergeAnimation: false,
    inertia: false,
    actorPose: false,
    idle: false,
    cloudCrossfade: false,
  },
  validationPolicy: {
    endpointPositionTolerance: 1e-7,
    endpointScaleTolerance: 1e-6,
    quaternionNormTolerance: 0.0002,
    finiteRequired: true,
    c2PhaseWindows: true,
    identityCount: 16384,
    identitySpaceVersion: "ps03m3-identity-v1",
  },
  provenance: {
    stage: "PS-03.M4.1",
    grammar: "Directed Photonic Release geometry-only",
    colorMaterialStage: "PS-04",
    targetSpecificBranches: false,
    approvalStatus: "requires-human-approval",
    endpointLibraryStage: "PS-03.M3.1R",
    endpointLibraryVersion: "3.1.1",
    endpointLibraryFingerprint: "0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2",
    endpointLibraryManifestSha256: "530ca41e0faecf291ea9f674a7e383ae8739af0bddad578a765a7c264129ea82",
  },
};

const EPSILON = 1e-9;

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

/** Quintic smoothstep: value, first derivative and second derivative are zero at both ends. */
export function smooth5(value: number) {
  const t = clamp01(value);
  return t * t * t * (10 + t * (-15 + 6 * t));
}

export function c2Window(value: number, start: number, end: number) {
  if (end <= start) return value >= end ? 1 : 0;
  return smooth5((value - start) / (end - start));
}

/** A compact C2 pulse with exact zero value/velocity/acceleration at its boundaries. */
export function c2Pulse(value: number, start: number, apex: number, end: number) {
  if (value <= start || value >= end) return 0;
  if (value <= apex) return c2Window(value, start, apex);
  return 1 - c2Window(value, apex, end);
}

/** Python reference evaluator's compact C2 bump: 64 u^3 (1-u)^3. */
export function c2Bump(value: number, start: number, end: number) {
  if (value <= start || value >= end) return 0;
  const u = clamp01((value - start) / Math.max(end - start, EPSILON));
  return 64 * u ** 3 * (1 - u) ** 3;
}

export function quinticInitialVelocityBasis(value: number) {
  const t = clamp01(value);
  return t - 6 * t ** 3 + 8 * t ** 4 - 3 * t ** 5;
}

function length3(value: Vec3) {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize3(value: Vec3): [number, number, number] {
  const length = length3(value);
  return length > EPSILON
    ? [value[0] / length, value[1] / length, value[2] / length]
    : [0, 0, 1];
}

function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hashUnit(seed: number, id: number, lane: number) {
  let value = (seed ^ Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(lane + 11, 0x85ebca6b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value / 0xffffffff;
}

function stateCentroid(state: TransitionState): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  let weight = 0;
  for (let id = 0; id < state.recordCount; id += 1) {
    const activeWeight = state.status[id] === 0 ? 1 : 0.08;
    x += state.position[id * 3] * activeWeight;
    y += state.position[id * 3 + 1] * activeWeight;
    z += state.position[id * 3 + 2] * activeWeight;
    weight += activeWeight;
  }
  return weight > 0 ? [x / weight, y / weight, z / weight] : [0, 0, 0];
}

/**
 * Direction is derived from endpoint geometry. An explicit vector is only an
 * optional request/debug override; there is no fixed primary-axis policy.
 */
export function deriveDirectionIntent(source: TransitionState, target: TransitionState, explicit?: Vec3): Vec3 {
  if (explicit && length3(explicit) > EPSILON) return normalize3(explicit);
  const a = stateCentroid(source);
  const b = stateCentroid(target);
  const centroidDelta: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  if (length3(centroidDelta) > 1e-5) return normalize3(centroidDelta);

  let best: Vec3 = [0, 0, 0];
  let bestLength = 0;
  for (let id = 0; id < source.recordCount; id += 1) {
    const delta: Vec3 = [
      target.position[id * 3] - source.position[id * 3],
      target.position[id * 3 + 1] - source.position[id * 3 + 1],
      target.position[id * 3 + 2] - source.position[id * 3 + 2],
    ];
    const length = length3(delta);
    if (length > bestLength) {
      best = delta;
      bestLength = length;
    }
  }
  if (bestLength > 1e-5) return normalize3(best);

  // Degenerate/equal-centroid geometry: derive an orientation axis from data.
  const normalSum: Vec3 = [
    source.normal[0] + target.normal[0],
    source.normal[1] + target.normal[1],
    source.normal[2] + target.normal[2],
  ];
  return normalize3(normalSum);
}

function groupKey(sourceGroup: number, targetGroup: number, sourceShell: number, targetShell: number) {
  return (((sourceShell * 256 + sourceGroup) * 256 + targetShell) * 256 + targetGroup) >>> 0;
}

interface MutableTrack {
  sourceGroup: number;
  targetGroup: number;
  sourceShell: number;
  targetShell: number;
  sourceCenter: [number, number, number];
  targetCenter: [number, number, number];
  mass: number;
  protectedMass: number;
}

function buildTracks(source: TransitionState, target: TransitionState, axis: Vec3) {
  const map = new Map<number, MutableTrack>();
  const index = new Uint16Array(source.recordCount);
  for (let id = 0; id < source.recordCount; id += 1) {
    const key = groupKey(source.transitionGroup[id], target.transitionGroup[id], source.shell[id], target.shell[id]);
    let track = map.get(key);
    if (!track) {
      track = {
        sourceGroup: source.transitionGroup[id],
        targetGroup: target.transitionGroup[id],
        sourceShell: source.shell[id],
        targetShell: target.shell[id],
        sourceCenter: [0, 0, 0],
        targetCenter: [0, 0, 0],
        mass: 0,
        protectedMass: 0,
      };
      map.set(key, track);
    }
    const weight = source.status[id] === 0 || target.status[id] === 0 ? 1 : 0.08;
    track.sourceCenter[0] += source.position[id * 3] * weight;
    track.sourceCenter[1] += source.position[id * 3 + 1] * weight;
    track.sourceCenter[2] += source.position[id * 3 + 2] * weight;
    track.targetCenter[0] += target.position[id * 3] * weight;
    track.targetCenter[1] += target.position[id * 3 + 1] * weight;
    track.targetCenter[2] += target.position[id * 3 + 2] * weight;
    track.mass += weight;
    track.protectedMass += (source.flags[id] !== 0 || target.flags[id] !== 0) ? weight : 0;
  }

  const mutable = [...map.values()];
  const lookup = new Map<number, number>();
  const tracks: GroupTrack[] = mutable.map((track, trackId) => {
    const divisor = Math.max(track.mass, EPSILON);
    const sourceCenter: Vec3 = track.sourceCenter.map((value) => value / divisor) as unknown as Vec3;
    const targetCenter: Vec3 = track.targetCenter.map((value) => value / divisor) as unknown as Vec3;
    const displacement: Vec3 = [
      targetCenter[0] - sourceCenter[0],
      targetCenter[1] - sourceCenter[1],
      targetCenter[2] - sourceCenter[2],
    ];
    let lateral = cross(axis, displacement);
    if (length3(lateral) < 1e-5) lateral = cross(axis, normalize3(sourceCenter));
    lateral = normalize3(lateral);
    const distance = length3(displacement);
    const shellChange = track.sourceShell === track.targetShell ? 0 : 1;
    const protectedRatio = track.protectedMass / divisor;
    const routeMagnitude = Math.min(0.24, 0.025 + distance * 0.075) * mix(1, 0.58, protectedRatio);
    const route: Vec3 = [
      lateral[0] * routeMagnitude + axis[0] * Math.min(0.08, distance * 0.025),
      lateral[1] * routeMagnitude + axis[1] * Math.min(0.08, distance * 0.025),
      lateral[2] * routeMagnitude + axis[2] * Math.min(0.08, distance * 0.025),
    ];
    lookup.set(groupKey(track.sourceGroup, track.targetGroup, track.sourceShell, track.targetShell), trackId);
    return {
      sourceGroup: track.sourceGroup,
      targetGroup: track.targetGroup,
      sourceShell: track.sourceShell,
      targetShell: track.targetShell,
      sourceCenter,
      targetCenter,
      route,
      mass: track.mass,
      protectedMass: track.protectedMass,
      bridgeWeight: shellChange * (0.45 + 0.55 * (1 - protectedRatio)),
    };
  });

  for (let id = 0; id < source.recordCount; id += 1) {
    index[id] = lookup.get(groupKey(source.transitionGroup[id], target.transitionGroup[id], source.shell[id], target.shell[id])) ?? 0;
  }
  return { tracks, index };
}

function statesAreIdentical(source: TransitionState, target: TransitionState) {
  if (source === target) return true;
  if (source.recordCount !== target.recordCount) return false;
  const equal = (left: ArrayLike<number> | undefined, right: ArrayLike<number> | undefined) => {
    if (!left || !right) return left === right;
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
    return true;
  };
  const sourceSnapshot = source as Partial<RuntimeTransitionSnapshot>;
  const targetSnapshot = target as Partial<RuntimeTransitionSnapshot>;
  return equal(source.position, target.position)
    && equal(source.normal, target.normal)
    && equal(source.orientation, target.orientation)
    && equal(source.scale, target.scale)
    && equal(source.reserveDepth, target.reserveDepth)
    && equal(source.component, target.component)
    && equal(source.shell, target.shell)
    && equal(source.status, target.status)
    && equal(source.flags, target.flags)
    && equal(source.transitionGroup, target.transitionGroup)
    && equal(source.velocity, target.velocity)
    && equal(sourceSnapshot.scaleVelocity, targetSnapshot.scaleVelocity)
    && equal(sourceSnapshot.angularVelocity, targetSnapshot.angularVelocity)
    && equal(sourceSnapshot.activation, targetSnapshot.activation)
    && equal(sourceSnapshot.bridge, targetSnapshot.bridge)
    && equal(sourceSnapshot.role, targetSnapshot.role)
    && equal(sourceSnapshot.actorPose, targetSnapshot.actorPose);
}

export function compileTransition(
  source: TransitionState,
  target: TransitionState,
  request: TransitionRequest,
  profile = DIRECTED_PLASTIC_RELEASE,
): TransitionProgram {
  return compileTransitionExact(source, target, request, profile);
}

/** Kept only as an explicit non-machine-valid diagnostic comparator. */
export function compileTransitionFallback(
  source: TransitionState,
  target: TransitionState,
  request: TransitionRequest,
  profile = DIRECTED_PLASTIC_RELEASE,
): TransitionProgram {
  if (source.recordCount !== target.recordCount) throw new Error("Transition endpoints use different identity spaces");
  const count = source.recordCount;
  const selfTransition = statesAreIdentical(source, target);
  const directionIntent = deriveDirectionIntent(source, target, request.directionIntent === "auto" ? undefined : request.directionIntent);
  const { tracks, index } = buildTracks(source, target, directionIntent);
  const mobile = request.viewportProfile === "mobile";
  const timing = profile.timingPolicy.variants[request.triggerMode][request.viewportProfile];
  const baseMs = timing.durationSeconds * 1000;
  const capMs = (timing.hardCapSeconds ?? profile.timingPolicy.durationBoundsSeconds[1]) * 1000;
  const shellChanges = tracks.reduce((sum, track) => sum + (track.sourceShell === track.targetShell ? 0 : 1), 0);
  const measuredExtension = Math.min(capMs - baseMs, shellChanges * (mobile ? 24 : 32));
  const requestedDuration = request.durationOverrideMs ?? (request.durationOverride === undefined ? baseMs + measuredExtension : request.durationOverride * 1000);
  const durationMs = selfTransition || request.reducedMotion ? 0 : Math.min(capMs, Math.max(240, requestedDuration));
  const residual = new Float32Array(count * 3);
  const phaseDelay = new Float32Array(count);
  const bridgeWeight = new Float32Array(count);
  const ratio = profile.routeFieldPolicy.residualDistanceFraction * (mobile ? profile.routeFieldPolicy.mobileAmplitudeFactor : 1);

  for (let id = 0; id < count; id += 1) {
    const p = id * 3;
    const delta: Vec3 = [
      target.position[p] - source.position[p],
      target.position[p + 1] - source.position[p + 1],
      target.position[p + 2] - source.position[p + 2],
    ];
    const averageNormal = normalize3([
      source.normal[p] + target.normal[p],
      source.normal[p + 1] + target.normal[p + 1],
      source.normal[p + 2] + target.normal[p + 2],
    ]);
    let tangent = cross(delta, averageNormal);
    if (length3(tangent) < 1e-5) tangent = cross(directionIntent, averageNormal);
    tangent = normalize3(tangent);
    const amplitude = Math.min(0.032, length3(delta) * ratio);
    const sign = hashUnit(request.deterministicSeed, id, 0) < 0.5 ? -1 : 1;
    residual[p] = tangent[0] * amplitude * sign;
    residual[p + 1] = tangent[1] * amplitude * sign;
    residual[p + 2] = tangent[2] * amplitude * sign;
    const protectedDelay = (source.flags[id] !== 0 ? 0.055 : 0) - (target.flags[id] !== 0 ? 0.05 : 0);
    phaseDelay[id] = (hashUnit(request.deterministicSeed, id, 1) - 0.5) * 0.075 + protectedDelay;
  }

  // A bridge is a short-lived geometric neck, not a mask over every element
  // whose shell changes. Match the reference compiler's bounded selection:
  // choose the IDs nearest each macro-track meeting point, exclude protected
  // feature/silhouette IDs, and cap both the fraction and absolute count.
  const bridgeCandidates = Array.from({ length: tracks.length }, () => [] as Array<{ id: number; score: number }>);
  const trackMemberCounts = new Uint32Array(tracks.length);
  for (let id = 0; id < count; id += 1) {
    const trackId = index[id];
    trackMemberCounts[trackId] += 1;
    if (source.shell[id] === target.shell[id] || source.flags[id] !== 0 || target.flags[id] !== 0) continue;
    const track = tracks[trackId];
    const p = id * 3;
    const meetingX = (track.sourceCenter[0] + track.targetCenter[0]) * 0.5;
    const meetingY = (track.sourceCenter[1] + track.targetCenter[1]) * 0.5;
    const meetingZ = (track.sourceCenter[2] + track.targetCenter[2]) * 0.5;
    const midpointX = (source.position[p] + target.position[p]) * 0.5;
    const midpointY = (source.position[p + 1] + target.position[p + 1]) * 0.5;
    const midpointZ = (source.position[p + 2] + target.position[p + 2]) * 0.5;
    const distanceToMeeting = Math.hypot(midpointX - meetingX, midpointY - meetingY, midpointZ - meetingZ);
    bridgeCandidates[trackId].push({
      id,
      score: distanceToMeeting + hashUnit(request.deterministicSeed, id, 2) * 1e-9,
    });
  }
  for (let trackId = 0; trackId < tracks.length; trackId += 1) {
    const candidates = bridgeCandidates[trackId];
    if (!candidates.length) continue;
    candidates.sort((left, right) => left.score - right.score || left.id - right.id);
    const selectedCount = Math.min(candidates.length, 96, Math.max(1, Math.ceil(trackMemberCounts[trackId] * 0.08)));
    for (let candidate = 0; candidate < selectedCount; candidate += 1) {
      bridgeWeight[candidates[candidate].id] = tracks[trackId].bridgeWeight;
    }
  }

  return {
    schemaVersion: "1.1.0",
    programVersion: "2.1.0",
    programId: `runtime-${(request.deterministicSeed >>> 0).toString(16).padStart(8, "0")}-${count}-${tracks.length}`,
    identitySpaceVersion: request.identitySpaceVersion,
    recordCount: count,
    durationMs,
    capMs,
    selfTransition,
    triggerMode: request.triggerMode,
    viewportProfile: request.viewportProfile,
    directionIntent,
    phases: profile.phasePolicy.windows,
    tracks,
    trackIndex: index,
    residual,
    phaseDelay,
    bridgeWeight,
    sourceVelocity: source.velocity,
    sourceScaleVelocity: (source as Partial<RuntimeTransitionSnapshot>).scaleVelocity,
    deterministicSeed: request.deterministicSeed >>> 0,
    programSource: "on-demand-fallback",
    machineValid: false,
  };
}

export function shortestSlerp(a: Quat, b: Quat, progress: number): [number, number, number, number] {
  const t = clamp01(progress);
  const aLength = Math.hypot(...a);
  const bLength = Math.hypot(...b);
  const source = aLength > EPSILON ? a.map((value) => value / aLength) as [number, number, number, number] : [0, 0, 0, 1];
  let target = bLength > EPSILON ? b.map((value) => value / bLength) as [number, number, number, number] : [0, 0, 0, 1];
  let cosine = source[0] * target[0] + source[1] * target[1] + source[2] * target[2] + source[3] * target[3];
  if (cosine < 0) {
    target = target.map((value) => -value) as typeof target;
    cosine = -cosine;
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, cosine)));
  const sine = Math.sin(theta);
  if (sine <= 1e-7) {
    const q = source.map((value, lane) => mix(value, target[lane], t)) as [number, number, number, number];
    const length = Math.hypot(...q);
    return q.map((value) => value / Math.max(length, EPSILON)) as typeof q;
  }
  const sourceWeight = Math.sin((1 - t) * theta) / sine;
  const targetWeight = Math.sin(t * theta) / sine;
  const q = source.map((value, lane) => value * sourceWeight + target[lane] * targetWeight) as [number, number, number, number];
  const length = Math.hypot(...q);
  return q.map((value) => value / Math.max(length, EPSILON)) as typeof q;
}

/** Backward-compatible export name for the M3 browser API; implementation is true shortest-path SLERP. */
export const shortestNlerp = shortestSlerp;

export function phaseAt(program: TransitionProgram, progress: number): MotionPhase | "idle" {
  const t = clamp01(progress);
  if (program.selfTransition || t >= 1) return "idle";
  const order: MotionPhase[] = ["anticipation", "release", "regroup", "reveal", "approach", "settle"];
  for (const phase of [...order].reverse()) {
    const [start, end] = program.phases[phase];
    if (t >= start && t < end) return phase;
  }
  return "idle";
}

function endpointElement(state: TransitionState, id: number, phase: MotionPhase | "idle"): EvaluatedElement {
  const p = id * 3;
  const q = id * 4;
  const normal = normalize3([state.normal[p], state.normal[p + 1], state.normal[p + 2]]);
  const orientation = shortestSlerp(
    [state.orientation[q], state.orientation[q + 1], state.orientation[q + 2], state.orientation[q + 3]],
    [state.orientation[q], state.orientation[q + 1], state.orientation[q + 2], state.orientation[q + 3]],
    0,
  );
  const snapshot = state as Partial<RuntimeTransitionSnapshot>;
  const activation = snapshot.activation?.[id] ?? (state.status[id] === 0 ? 1 : 0);
  const bridge = snapshot.bridge?.[id] ?? 0;
  const role: [number, number, number] = snapshot.role
    ? [snapshot.role[p], snapshot.role[p + 1], snapshot.role[p + 2]]
    : [activation * (1 - bridge), (1 - activation) * (1 - bridge), bridge];
  const actorPose = snapshot.actorPose?.length === 7
    ? {
        position: [snapshot.actorPose[0], snapshot.actorPose[1], snapshot.actorPose[2]] as [number, number, number],
        orientation: [snapshot.actorPose[3], snapshot.actorPose[4], snapshot.actorPose[5], snapshot.actorPose[6]] as [number, number, number, number],
      }
    : { position: [0, 0, 0] as [number, number, number], orientation: [0, 0, 0, 1] as [number, number, number, number] };
  return {
    position: [state.position[p], state.position[p + 1], state.position[p + 2]],
    velocity: [state.velocity?.[p] ?? 0, state.velocity?.[p + 1] ?? 0, state.velocity?.[p + 2] ?? 0],
    normal,
    orientation,
    scale: state.scale[id],
    activation,
    bridge,
    role,
    status: state.status[id],
    groupPhase: 0,
    actorPose,
    phase,
  };
}

function multiplyQuat(left: Quat, right: Quat): [number, number, number, number] {
  const [ax, ay, az, aw] = left;
  const [bx, by, bz, bw] = right;
  const result: [number, number, number, number] = [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
  const length = Math.hypot(...result);
  return length > EPSILON
    ? result.map((value) => value / length) as typeof result
    : [0, 0, 0, 1];
}

function rotateQuat(quaternion: Quat, vector: Vec3): [number, number, number] {
  const q: Vec3 = [quaternion[0], quaternion[1], quaternion[2]];
  const twice = cross(q, vector).map((value) => value * 2) as [number, number, number];
  const second = cross(q, twice);
  return [
    vector[0] + quaternion[3] * twice[0] + second[0],
    vector[1] + quaternion[3] * twice[1] + second[1],
    vector[2] + quaternion[3] * twice[2] + second[2],
  ];
}

function axisAngle(axis: Vec3, angle: number): [number, number, number, number] {
  const axisLength = length3(axis);
  if (axisLength < 1e-12 || Math.abs(angle) < 1e-15) return [0, 0, 0, 1];
  const half = angle * 0.5;
  const sine = Math.sin(half) / axisLength;
  return [axis[0] * sine, axis[1] * sine, axis[2] * sine, Math.cos(half)];
}

function actorAt(header: CompiledProgramHeader, t: number) {
  const track = header.actorTrack;
  const closure = smooth5(t);
  const pulse = c2Bump(t, track.window[0], track.window[1]);
  const pulseQuaternion = axisAngle(track.rotationAxis, track.rotationRadians * pulse);
  const baseOrientation = shortestSlerp(track.sourcePose.orientation, [0, 0, 0, 1], closure);
  const orientation = multiplyQuat(baseOrientation, pulseQuaternion);
  const translation: [number, number, number] = [
    track.translationAxis[0] * track.translationAmplitude * pulse,
    track.translationAxis[1] * track.translationAmplitude * pulse,
    track.translationAxis[2] * track.translationAmplitude * pulse,
  ];
  const position: [number, number, number] = [
    track.sourcePose.position[0] * (1 - closure) + translation[0],
    track.sourcePose.position[1] * (1 - closure) + translation[1],
    track.sourcePose.position[2] * (1 - closure) + translation[2],
  ];
  return { position, orientation, translation, pulseQuaternion };
}

function compiledGeometry(
  source: TransitionState,
  target: TransitionState,
  program: TransitionProgram,
  id: number,
  t: number,
) {
  const compiled = program.compiled!;
  const perId = compiled.perId;
  const track = compiled.groupTracks[perId.groupIndex[id]];
  const p = id * 3;
  const q = id * 4;
  const phaseOffset = perId.phaseOffset[id] / 255 * compiled.header.activationPolicy.phaseOffsetRange;
  const morphWidth = Math.max(compiled.header.activationPolicy.localMorphWidthFraction ?? 0.12, 1e-4);
  const latestStart = Math.max(track.releaseEnd, track.revealEnd - morphWidth);
  const localStart = Math.min(track.releaseEnd + phaseOffset, latestStart);
  const localEnd = Math.max(Math.min(localStart + morphWidth, track.revealEnd), localStart + 1e-4);
  const localAlpha = c2Window(t, localStart, localEnd);
  const routeWeight = c2Bump(t, localStart, localEnd);
  const flags = perId.flags[id];
  const bridge = (flags & 4) !== 0 ? c2Bump(t, track.bridgeStart, track.bridgeEnd) : 0;
  const bridgeContraction = bridge * (1 - (compiled.header.activationPolicy.bridgeThickness ?? 1));
  const center: [number, number, number] = [
    mix(track.sourceCenter[0], track.targetCenter[0], localAlpha) + track.routeControl[0] * routeWeight,
    mix(track.sourceCenter[1], track.targetCenter[1], localAlpha) + track.routeControl[1] * routeWeight,
    mix(track.sourceCenter[2], track.targetCenter[2], localAlpha) + track.routeControl[2] * routeWeight,
  ];
  const sourceLocal: Vec3 = [
    source.position[p] - track.sourceCenter[0],
    source.position[p + 1] - track.sourceCenter[1],
    source.position[p + 2] - track.sourceCenter[2],
  ];
  const targetLocal: Vec3 = [
    target.position[p] - track.targetCenter[0],
    target.position[p + 1] - track.targetCenter[1],
    target.position[p + 2] - track.targetCenter[2],
  ];
  const local: [number, number, number] = [
    mix(sourceLocal[0], targetLocal[0], localAlpha),
    mix(sourceLocal[1], targetLocal[1], localAlpha),
    mix(sourceLocal[2], targetLocal[2], localAlpha),
  ];
  const direction = length3(track.direction) > 1e-12 ? normalize3(track.direction) : [1, 0, 0] as const;
  const axialLength = local[0] * direction[0] + local[1] * direction[1] + local[2] * direction[2];
  const axial: Vec3 = [direction[0] * axialLength, direction[1] * axialLength, direction[2] * axialLength];
  const neckLocal: Vec3 = [
    local[0] - (local[0] - axial[0]) * bridgeContraction,
    local[1] - (local[1] - axial[1]) * bridgeContraction,
    local[2] - (local[2] - axial[2]) * bridgeContraction,
  ];
  const position: [number, number, number] = [
    center[0] + neckLocal[0] + perId.residual[p] * routeWeight,
    center[1] + neckLocal[1] + perId.residual[p + 1] * routeWeight,
    center[2] + neckLocal[2] + perId.residual[p + 2] * routeWeight,
  ];

  const sourceNormal = normalize3([source.normal[p], source.normal[p + 1], source.normal[p + 2]]);
  const targetNormal = normalize3([target.normal[p], target.normal[p + 1], target.normal[p + 2]]);
  const normalBlend = normalize3([
    mix(sourceNormal[0], targetNormal[0], localAlpha),
    mix(sourceNormal[1], targetNormal[1], localAlpha),
    mix(sourceNormal[2], targetNormal[2], localAlpha),
  ]);
  const emerging = (flags & 1) !== 0 ? 1 : 0;
  const immersing = (flags & 2) !== 0 ? 1 : 0;
  const transportWeight = c2Bump(t, perId.activationStart[id], perId.activationEnd[id]);
  const depth = perId.depth[id] * compiled.header.activationPolicy.depthRouteFraction
    * transportWeight * (immersing - emerging);
  for (let axis = 0; axis < 3; axis += 1) position[axis] += normalBlend[axis] * depth;

  const settle = compiled.header.settlePolicy;
  const settleWeight = c2Bump(t, settle.window[0], settle.window[1]);
  const residual: Vec3 = [perId.residual[p], perId.residual[p + 1], perId.residual[p + 2]];
  const residualDirection = length3(residual) > 1e-12 ? normalize3(residual) : normalBlend;
  const displacement = Math.hypot(
    target.position[p] - source.position[p],
    target.position[p + 1] - source.position[p + 1],
    target.position[p + 2] - source.position[p + 2],
  );
  const settleDisplacement = displacement * settle.maximumAmplitudeFraction * settleWeight;
  const carry = compiled.header.durationSeconds * quinticInitialVelocityBasis(t);
  for (let axis = 0; axis < 3; axis += 1) {
    position[axis] += residualDirection[axis] * settleDisplacement;
    position[axis] += (source.velocity?.[p + axis] ?? 0) * carry;
  }

  const actor = actorAt(compiled.header, t);
  const actorCenterAlpha = smooth5(t);
  const actorCenter: Vec3 = [
    mix(compiled.header.actorTrack.centerStart[0], compiled.header.actorTrack.centerEnd[0], actorCenterAlpha),
    mix(compiled.header.actorTrack.centerStart[1], compiled.header.actorTrack.centerEnd[1], actorCenterAlpha),
    mix(compiled.header.actorTrack.centerStart[2], compiled.header.actorTrack.centerEnd[2], actorCenterAlpha),
  ];
  const rotated = rotateQuat(actor.pulseQuaternion, [
    position[0] - actorCenter[0],
    position[1] - actorCenter[1],
    position[2] - actorCenter[2],
  ]);
  for (let axis = 0; axis < 3; axis += 1) position[axis] = rotated[axis] + actorCenter[axis] + actor.translation[axis];

  const sourceOrientation: Quat = [source.orientation[q], source.orientation[q + 1], source.orientation[q + 2], source.orientation[q + 3]];
  const targetOrientation: Quat = [target.orientation[q], target.orientation[q + 1], target.orientation[q + 2], target.orientation[q + 3]];
  const orientation = multiplyQuat(actor.pulseQuaternion, shortestSlerp(sourceOrientation, targetOrientation, localAlpha));
  const normal = normalize3(rotateQuat(orientation, [0, 0, 1]));
  return { position, orientation, normal, localAlpha, bridge, actor };
}

function evaluateCompiledElement(
  source: TransitionState,
  target: TransitionState,
  program: TransitionProgram,
  id: number,
  t: number,
): EvaluatedElement {
  const compiled = program.compiled!;
  const perId = compiled.perId;
  const geometry = compiledGeometry(source, target, program, id, t);
  const duration = compiled.header.durationSeconds;
  let velocity: [number, number, number];
  const p = id * 3;
  if (t <= 0) velocity = [source.velocity?.[p] ?? 0, source.velocity?.[p + 1] ?? 0, source.velocity?.[p + 2] ?? 0];
  else if (t >= 1 || duration <= 0) velocity = [0, 0, 0];
  else {
    const epsilon = Math.min(1e-4, 0.25 * t, 0.25 * (1 - t));
    const before = compiledGeometry(source, target, program, id, t - epsilon).position;
    const after = compiledGeometry(source, target, program, id, t + epsilon).position;
    velocity = before.map((value, axis) => (after[axis] - value) / (2 * epsilon * duration)) as typeof velocity;
  }
  const sourceScaleVelocity = (source as Partial<RuntimeTransitionSnapshot>).scaleVelocity?.[id] ?? 0;
  let scale = mix(source.scale[id], target.scale[id], geometry.localAlpha)
    * (1 + geometry.bridge * compiled.header.activationPolicy.bridgePulseMaximum)
    + sourceScaleVelocity * duration * quinticInitialVelocityBasis(t);
  scale = Math.max(0, scale);
  const sourceActive = source.status[id] === 0;
  const targetActive = target.status[id] === 0;
  const activationAlpha = c2Window(t, perId.activationStart[id], perId.activationEnd[id]);
  let activation = sourceActive && targetActive ? 1 : (!sourceActive && !targetActive ? 0 : (targetActive ? activationAlpha : 1 - activationAlpha));
  if (t <= 0) {
    activation = sourceActive ? 1 : 0;
    scale = source.scale[id];
  } else if (t >= 1) {
    activation = targetActive ? 1 : 0;
    scale = target.scale[id];
  }
  const role: [number, number, number] = [
    activation * (1 - geometry.bridge),
    (1 - activation) * (1 - geometry.bridge),
    geometry.bridge,
  ];
  return {
    position: geometry.position,
    velocity,
    normal: geometry.normal,
    orientation: geometry.orientation,
    scale,
    activation,
    bridge: geometry.bridge,
    role,
    status: mix(source.status[id], target.status[id], geometry.localAlpha),
    groupPhase: geometry.localAlpha,
    actorPose: { position: geometry.actor.position, orientation: geometry.actor.orientation },
    phase: phaseAt(program, t),
  };
}

export function evaluateElement(
  source: TransitionState,
  target: TransitionState,
  program: TransitionProgram,
  id: number,
  progress: number,
): EvaluatedElement {
  if (id < 0 || id >= program.recordCount) throw new RangeError(`Persistent ID ${id} is outside the transition program`);
  const t = clamp01(progress);
  if (program.selfTransition) return endpointElement(source, id, "idle");
  if (t <= 0) return endpointElement(source, id, phaseAt(program, t));
  if (program.compiled?.header.reducedMotion) return endpointElement(target, id, "idle");
  if (t >= 1) return endpointElement(target, id, "idle");
  if (program.compiled) return evaluateCompiledElement(source, target, program, id, t);
  const p = id * 3;
  const q = id * 4;
  const track = program.tracks[program.trackIndex[id]];
  const delay = program.phaseDelay[id];
  const release = program.phases.release;
  const approach = program.phases.approach;
  const reveal = program.phases.reveal;
  const macroT = c2Window(t, release[0] + delay * 0.35, approach[1] + delay * 0.2);
  const localT = c2Window(t, release[0] + delay, reveal[1] + delay);
  const routePulse = c2Pulse(t, release[0], (release[1] + reveal[0]) * 0.5, approach[1]);
  const sourceLocal: Vec3 = [
    source.position[p] - track.sourceCenter[0],
    source.position[p + 1] - track.sourceCenter[1],
    source.position[p + 2] - track.sourceCenter[2],
  ];
  const targetLocal: Vec3 = [
    target.position[p] - track.targetCenter[0],
    target.position[p + 1] - track.targetCenter[1],
    target.position[p + 2] - track.targetCenter[2],
  ];
  const center: Vec3 = [
    mix(track.sourceCenter[0], track.targetCenter[0], macroT) + track.route[0] * routePulse,
    mix(track.sourceCenter[1], track.targetCenter[1], macroT) + track.route[1] * routePulse,
    mix(track.sourceCenter[2], track.targetCenter[2], macroT) + track.route[2] * routePulse,
  ];
  const orientation = shortestSlerp(
    [source.orientation[q], source.orientation[q + 1], source.orientation[q + 2], source.orientation[q + 3]],
    [target.orientation[q], target.orientation[q + 1], target.orientation[q + 2], target.orientation[q + 3]],
    localT,
  );
  const normal = normalize3([
    2 * (orientation[0] * orientation[2] + orientation[3] * orientation[1]),
    2 * (orientation[1] * orientation[2] - orientation[3] * orientation[0]),
    1 - 2 * (orientation[0] * orientation[0] + orientation[1] * orientation[1]),
  ]);
  const sourceReserve = source.status[id] === 0 ? 0 : source.reserveDepth[id];
  const targetReserve = target.status[id] === 0 ? 0 : target.reserveDepth[id];
  const depth = mix(sourceReserve, targetReserve, localT) * 0.18 * c2Pulse(t, 0, 0.5, 1);
  const carry = program.sourceVelocity ? (program.durationMs / 1000) * quinticInitialVelocityBasis(t) : 0;
  const position: [number, number, number] = [
    center[0] + mix(sourceLocal[0], targetLocal[0], localT) + program.residual[p] * routePulse - normal[0] * depth + (program.sourceVelocity?.[p] ?? 0) * carry,
    center[1] + mix(sourceLocal[1], targetLocal[1], localT) + program.residual[p + 1] * routePulse - normal[1] * depth + (program.sourceVelocity?.[p + 1] ?? 0) * carry,
    center[2] + mix(sourceLocal[2], targetLocal[2], localT) + program.residual[p + 2] * routePulse - normal[2] * depth + (program.sourceVelocity?.[p + 2] ?? 0) * carry,
  ];
  const legacyPositionOnly = (value: number): [number, number, number] => {
    const macro = c2Window(value, release[0] + delay * 0.35, approach[1] + delay * 0.2);
    const local = c2Window(value, release[0] + delay, reveal[1] + delay);
    const pulse = c2Pulse(value, release[0], (release[1] + reveal[0]) * 0.5, approach[1]);
    const localOrientation = shortestSlerp(
      [source.orientation[q], source.orientation[q + 1], source.orientation[q + 2], source.orientation[q + 3]],
      [target.orientation[q], target.orientation[q + 1], target.orientation[q + 2], target.orientation[q + 3]],
      local,
    );
    const localNormal = normalize3([
      2 * (localOrientation[0] * localOrientation[2] + localOrientation[3] * localOrientation[1]),
      2 * (localOrientation[1] * localOrientation[2] - localOrientation[3] * localOrientation[0]),
      1 - 2 * (localOrientation[0] ** 2 + localOrientation[1] ** 2),
    ]);
    const localDepth = mix(sourceReserve, targetReserve, local) * 0.18 * c2Pulse(value, 0, 0.5, 1);
    const localCarry = program.sourceVelocity ? (program.durationMs / 1000) * quinticInitialVelocityBasis(value) : 0;
    return [0, 1, 2].map((axis) => (
      mix(track.sourceCenter[axis], track.targetCenter[axis], macro)
      + track.route[axis] * pulse
      + mix(sourceLocal[axis], targetLocal[axis], local)
      + program.residual[p + axis] * pulse
      - localNormal[axis] * localDepth
      + (program.sourceVelocity?.[p + axis] ?? 0) * localCarry
    )) as [number, number, number];
  };
  const velocityEpsilon = Math.min(1e-4, 0.25 * t, 0.25 * (1 - t));
  const velocityBefore = legacyPositionOnly(t - velocityEpsilon);
  const velocityAfter = legacyPositionOnly(t + velocityEpsilon);
  const velocity = velocityBefore.map((value, axis) => (
    (velocityAfter[axis] - value) / (2 * velocityEpsilon * Math.max(program.durationMs / 1000, 1e-9))
  )) as [number, number, number];
  const sourceActive = source.status[id] === 0;
  const targetActive = target.status[id] === 0;
  let activation = sourceActive && targetActive ? 1 : 0;
  if (!sourceActive && targetActive) activation = c2Window(t, 0.18 + delay, 0.72 + delay);
  if (sourceActive && !targetActive) activation = 1 - c2Window(t, 0.08 + delay, 0.78 + delay);
  let bridge = program.bridgeWeight[id] * c2Pulse(t, 0.3, 0.5, 0.72);
  let role: [number, number, number] = [activation * (1 - bridge), (1 - activation) * (1 - bridge), bridge];
  const snapshot = source as Partial<RuntimeTransitionSnapshot>;
  if (snapshot.activation && snapshot.bridge && snapshot.role) {
    const closure = c2Window(t, 0, Math.max(release[1], 1e-4));
    activation = mix(snapshot.activation[id], activation, closure);
    bridge = mix(snapshot.bridge[id], bridge, closure);
    role = [
      mix(snapshot.role[p], role[0], closure),
      mix(snapshot.role[p + 1], role[1], closure),
      mix(snapshot.role[p + 2], role[2], closure),
    ];
  }
  const snapshotActor = snapshot.actorPose?.length === 7 ? snapshot.actorPose : null;
  const actorClosure = smooth5(t);
  const actorPose = snapshotActor
    ? {
        position: [snapshotActor[0] * (1 - actorClosure), snapshotActor[1] * (1 - actorClosure), snapshotActor[2] * (1 - actorClosure)] as [number, number, number],
        orientation: shortestSlerp([snapshotActor[3], snapshotActor[4], snapshotActor[5], snapshotActor[6]], [0, 0, 0, 1], actorClosure),
      }
    : { position: [0, 0, 0] as [number, number, number], orientation: [0, 0, 0, 1] as [number, number, number, number] };
  return {
    position,
    velocity,
    normal,
    orientation,
    scale: Math.max(0, mix(source.scale[id], target.scale[id], localT)
      + (program.sourceScaleVelocity?.[id] ?? 0) * (program.durationMs / 1000) * quinticInitialVelocityBasis(t)),
    activation: clamp01(activation),
    bridge,
    role,
    status: mix(source.status[id], target.status[id], localT),
    groupPhase: localT,
    actorPose,
    phase: phaseAt(program, t),
  };
}

export function evaluateDirected(
  source: TransitionState,
  target: TransitionState,
  program: TransitionProgram,
  id: number,
  progress: number,
  reverse = false,
) {
  return evaluateElement(source, target, program, id, reverse ? 1 - clamp01(progress) : progress);
}

export function createRetargetSnapshot(
  source: TransitionState,
  target: TransitionState,
  program: TransitionProgram,
  progress: number,
): RuntimeTransitionSnapshot {
  const count = program.recordCount;
  const position = new Float32Array(count * 3);
  const velocity = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const orientation = new Float32Array(count * 4);
  const scale = new Float32Array(count);
  const scaleVelocity = new Float32Array(count);
  const activation = new Float32Array(count);
  const bridge = new Float32Array(count);
  const role = new Float32Array(count * 3);
  const reserveDepth = new Float32Array(count);
  const component = new Uint8Array(count);
  const shell = new Uint8Array(count);
  const status = new Uint8Array(count);
  const flags = new Uint8Array(count);
  const transitionGroup = new Uint8Array(count);
  const actorPose = new Float32Array(7);
  const epsilonT = Math.min(1e-3, 8 / Math.max(program.durationMs, 1));
  const beforeT = Math.max(0, progress - epsilonT);
  const afterT = Math.min(1, progress + epsilonT);
  const elapsed = Math.max((afterT - beforeT) * Math.max(program.durationMs, 1) / 1000, 1e-6);
  for (let id = 0; id < count; id += 1) {
    const value = evaluateElement(source, target, program, id, progress);
    const before = evaluateElement(source, target, program, id, beforeT);
    const after = evaluateElement(source, target, program, id, afterT);
    const p = id * 3;
    const q = id * 4;
    position.set(value.position, p);
    normal.set(value.normal, p);
    orientation.set(value.orientation, q);
    scale[id] = value.scale;
    activation[id] = value.activation;
    bridge[id] = value.bridge;
    role.set(value.role, p);
    const chooseTarget = value.groupPhase >= 0.5;
    component[id] = chooseTarget ? target.component[id] : source.component[id];
    shell[id] = chooseTarget ? target.shell[id] : source.shell[id];
    transitionGroup[id] = chooseTarget ? target.transitionGroup[id] : source.transitionGroup[id];
    flags[id] = source.flags[id] | target.flags[id];
    reserveDepth[id] = mix(source.reserveDepth[id], target.reserveDepth[id], value.groupPhase);
    status[id] = value.activation >= 0.5 ? 0 : (Math.round(value.status) === 2 ? 2 : 1);
    if (id === 0) actorPose.set([...value.actorPose.position, ...value.actorPose.orientation]);
    for (let axis = 0; axis < 3; axis += 1) velocity[p + axis] = (after.position[axis] - before.position[axis]) / elapsed;
    scaleVelocity[id] = (after.scale - before.scale) / elapsed;
  }
  return {
    recordCount: count,
    position,
    velocity,
    normal,
    orientation,
    scale,
    scaleVelocity,
    angularVelocity: new Float32Array(count * 3),
    reserveDepth,
    component,
    shell,
    status,
    flags,
    transitionGroup,
    actorPose,
    activation,
    bridge,
    role,
  };
}

export function resolveRuntimeProgress(progress: number, reducedMotion: boolean) {
  return reducedMotion ? 1 : clamp01(progress);
}

/** Scroll smoothing clamps resume deltas so hidden tabs cannot jump phases. */
export function smoothScrollProgress(
  current: number,
  target: number,
  deltaSeconds: number,
  viewport: ViewportProfile,
  hidden = false,
  profile = DIRECTED_PLASTIC_RELEASE,
) {
  if (hidden) return clamp01(current);
  const lambda = profile.timingPolicy.variants["lab-scroll-scrub"][viewport].responseLambdaPerSecond
    ?? (viewport === "mobile" ? 14 : 11);
  const dt = Math.min(Math.max(deltaSeconds, 0), 0.05);
  return clamp01(current + (clamp01(target) - current) * (1 - Math.exp(-lambda * dt)));
}

export function finiteProgram(program: TransitionProgram) {
  const arrays: ArrayLike<number>[] = [program.trackIndex, program.residual, program.phaseDelay, program.bridgeWeight];
  return arrays.every((array) => Array.from(array).every(Number.isFinite))
    && program.tracks.every((track) => [...track.sourceCenter, ...track.targetCenter, ...track.route].every(Number.isFinite));
}
