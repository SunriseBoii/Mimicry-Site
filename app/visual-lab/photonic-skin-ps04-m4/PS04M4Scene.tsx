"use client";

/**
 * M4 scene adapter: frozen M3 shader/material/evaluator path plus a
 * full-canvas clip-space composition layer. Evaluator math stays identity-equal
 * to M3. Do not edit the M3 route; this copy is the M4 bypass.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { CameraPreset, DebugMode, DecodedState, LabFrame, M3Manifest } from "../photonic-skin-m4-1/m41-data";
import type { TransitionProgram } from "../photonic-skin-m4-1/m41-evaluator";
import {
  IDENTITY_COMPOSITION,
  applyCompositionViewport,
  cssFromDeviceBBox,
  restoreFullCanvasViewport,
  visibleFractionFor,
  type ActorMaskBBox,
  type CompositionViewport,
} from "./composition";
import {
  applyPhotonicPresentationCamera,
  cameraDiagnostic,
  interpolatePresentationFrames,
  resolvePresentationFrame,
  visibleComponents,
} from "../photonic-skin-m4-1r/photonic-presentation";
import {
  MATERIAL_THEME_PRESETS,
  type M2MaterialControllerState,
} from "../photonic-skin-ps04-m3/material-foundation";
import {
  FIELD_DIRECTION,
  FIELD_LUT_SIZE,
  FIELD_ORIGIN,
  FIELD_PARAMETERS,
  FIELD_SCALE,
  bandEnvelope,
} from "../photonic-skin-ps04-m2/photonic-field";
import {
  ALL_COMPETENCE_MASK,
  PALETTE_BLEND_START,
  PHOTONIC_COLOR_TOKENS,
  paletteStateForMask,
  semanticWeightsForCoordinate,
} from "../photonic-skin-ps04-m2/photonic-palette";
import type { OverlayUniforms, PhotonicMotionSession } from "../photonic-skin-ps04-m3/session";

export const IDENTITY_OVERLAY: OverlayUniforms = {
  enabled: false,
  anchor: [0, 0, 0],
  scale: 1,
  quaternion: [0, 0, 0, 1],
};

export interface FieldGpuParityMetrics {
  measured: true;
  valid: boolean;
  semanticSamples: number;
  envelopeSamples: number;
  maxSemanticWeightError: number;
  maxSemanticSumError: number;
  maxUnselectedWeight: number;
  maxEnvelopeError: number;
}

export interface GpuParityMetrics {
  measured: true;
  valid: boolean;
  programId: string;
  sampleCount: number;
  timeSampleCount: number;
  maxPositionError: number;
  p95PositionError: number;
  maxVelocityError: number;
  p95VelocityError: number;
  maxVelocityNormalizedError: number;
  p95VelocityNormalizedError: number;
  maxOrientationError: number;
  p95OrientationError: number;
  maxNormalError: number;
  p95NormalError: number;
  maxScaleError: number;
  p95ScaleError: number;
  maxActivationError: number;
  p95ActivationError: number;
  maxBridgeError: number;
  p95BridgeError: number;
  maxGroupPhaseError: number;
  p95GroupPhaseError: number;
  maxActorPoseError: number;
  p95ActorPoseError: number;
  worstVelocitySample: { t: number; persistentId: number; axis: number; actual: number; expected: number; epsilon: number };
  maxIdleEvalPositionDelta?: number;
}

declare global {
  interface Window {
    __PS04M4_GPU_PARITY__?: () => Promise<GpuParityMetrics>;
    __PS04M4_GPU_PARITY_PROMISE__?: Promise<GpuParityMetrics>;
    __PS04M4_GPU_PARITY_RESULT__?: GpuParityMetrics;
    __PS04M4_GPU_PARITY_STATE__?: { evaluator: EvaluatorMode; compiled: boolean; programId: string };
    __PS04M4_FIELD_GPU_PARITY__?: () => Promise<FieldGpuParityMetrics>;
    __PS04M4_FIELD_GPU_PARITY_RESULT__?: FieldGpuParityMetrics;
    __PS04M4_SCENE_READY__?: boolean;
    __PS04M4_LAB__?: Record<string, unknown>;
    __PS04M4_PREVIEW__?: Record<string, unknown>;
    __PS04M4_MEASURE_ACTOR__?: () => ActorMaskMeasure | null;
  }
}

export interface ActorMaskMeasure {
  actorMaskBBoxCss: ActorMaskBBox | null;
  actorVisibleFraction: number;
  drawingBufferSize: readonly [number, number];
  rendererDpr: number;
  canvasCssSize: readonly [number, number];
}

export interface SceneStats {
  fps: number;
  medianMs: number;
  p95Ms: number;
  drawCalls: number;
  triangles: number;
  textureMiB: number;
  programs: number;
  geometries: number;
  textures: number;
  dpr: number;
  drawingBuffer: readonly [number, number];
  lastActorDrawCalls: number;
  lastActorTriangles: number;
  newFrame: boolean;
}

export interface SceneEnvironment {
  userAgent: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemoryGiB: number | null;
  devicePixelRatio: number;
  webgl2: boolean;
  gpuVendor: string;
  gpuRenderer: string;
  maxVertexTextureUnits: number;
  maxCombinedTextureUnits: number;
  outputColorSpace: string;
  toneMapping: "shader-owned ACES / renderer NoToneMapping";
  antialias: boolean;
  alpha: true;
}

export type EvaluatorMode = "m4" | "m3";

export interface SceneProps {
  source: DecodedState;
  target: DecodedState;
  program: TransitionProgram;
  budget: number;
  progress: number;
  reducedMotion: boolean;
  debugMode: DebugMode;
  cameraPreset: CameraPreset;
  presentationContract: M3Manifest["presentationContract"];
  profile: LabFrame;
  dpr: number;
  diagnosticId?: string;
  selectedId: number;
  evaluator: EvaluatorMode;
  material: M2MaterialControllerState;
  geometryPlayback?: boolean;
  overlay?: OverlayUniforms;
  session?: PhotonicMotionSession;
  sessionShouldAnimate?: boolean;
  compositionRef?: { current: CompositionViewport };
  actorMask?: boolean;
  onStats: (value: SceneStats) => void;
  onEnvironment?: (value: SceneEnvironment) => void;
  onContextState?: (state: "ready" | "lost" | "restored") => void;
}

const STATE_TEXTURE_SIZE = 128;
const TRACK_TEXTURE_WIDTH = 256;
const LIGHT_MATERIAL = MATERIAL_THEME_PRESETS.light;
const DARK_MATERIAL = MATERIAL_THEME_PRESETS.dark;

function dataTexture(data: Float32Array, width: number, height: number) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  return texture;
}

type StateTextureKind = "position" | "normal" | "orientation" | "meta";

function stateTexture(state: DecodedState, kind: StateTextureKind, profile?: LabFrame) {
  const data = new Float32Array(STATE_TEXTURE_SIZE * STATE_TEXTURE_SIZE * 4);
  const shown = profile ? visibleComponents(state.entry, profile) : null;
  for (let id = 0; id < state.recordCount; id += 1) {
    const out = id * 4;
    const p = id * 3;
    const q = id * 4;
    if (kind === "position") {
      data[out] = state.position[p];
      data[out + 1] = state.position[p + 1];
      data[out + 2] = state.position[p + 2];
      data[out + 3] = state.scale[id];
    } else if (kind === "normal") {
      data[out] = state.normal[p];
      data[out + 1] = state.normal[p + 1];
      data[out + 2] = state.normal[p + 2];
      // Frozen M3 route delay; M4 reserve transport uses compiled per-ID depth.
      data[out + 3] = ((id * 0.61803398875) % 1) * 0.08;
    } else if (kind === "orientation") {
      data[out] = state.orientation[q];
      data[out + 1] = state.orientation[q + 1];
      data[out + 2] = state.orientation[q + 2];
      data[out + 3] = state.orientation[q + 3];
    } else if (kind === "meta") {
      data[out] = state.component[id];
      data[out + 1] = state.shell[id];
      data[out + 2] = state.status[id];
      // Preserve flags in the low byte and bind M3.1R component visibility in
      // the high marker without adding a seventeenth vertex texture.
      data[out + 3] = state.flags[id] + ((shown?.has(state.component[id]) ?? true) ? 256 : 0);
    }
  }
  return dataTexture(data, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE);
}

function m3RouteData(source: DecodedState, target: DecodedState) {
  const data = new Float32Array(STATE_TEXTURE_SIZE * STATE_TEXTURE_SIZE * 4);
  const axis = new THREE.Vector3(1, 0, 0);
  const delta = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  const averageNormal = new THREE.Vector3();
  for (let id = 0; id < source.recordCount; id += 1) {
    const p = id * 3;
    const out = id * 4;
    delta.set(target.position[p] - source.position[p], target.position[p + 1] - source.position[p + 1], target.position[p + 2] - source.position[p + 2]);
    averageNormal.set(source.normal[p] + target.normal[p], source.normal[p + 1] + target.normal[p + 1], source.normal[p + 2] + target.normal[p + 2]).normalize();
    lateral.crossVectors(delta, axis);
    if (lateral.lengthSq() < 1e-10) lateral.crossVectors(averageNormal, new THREE.Vector3(0, 1, 0));
    lateral.normalize();
    const group = Math.min(source.transitionGroup[id], target.transitionGroup[id]);
    const amplitude = Math.min(0.36, 0.08 + delta.length() * 0.11) * (group % 2 ? -1 : 1);
    const normalBias = Math.min(0.12, delta.length() * 0.035);
    data[out] = lateral.x * amplitude + averageNormal.x * normalBias;
    data[out + 1] = lateral.y * amplitude + averageNormal.y * normalBias;
    data[out + 2] = lateral.z * amplitude + averageNormal.z * normalBias;
    data[out + 3] = ((id * 0.61803398875) % 1) * 0.08;
  }
  return data;
}

function programTextures(program: TransitionProgram, source: DecodedState, target: DecodedState) {
  const m3Route = m3RouteData(source, target);
  const residual = new Float32Array(STATE_TEXTURE_SIZE * STATE_TEXTURE_SIZE * 4);
  const lanes = new Float32Array(STATE_TEXTURE_SIZE * STATE_TEXTURE_SIZE * 4);
  const velocity = new Float32Array(STATE_TEXTURE_SIZE * STATE_TEXTURE_SIZE * 4);
  const activation = new Float32Array(STATE_TEXTURE_SIZE * STATE_TEXTURE_SIZE * 4);
  for (let id = 0; id < program.recordCount; id += 1) {
    const out = id * 4;
    const p = id * 3;
    residual[out] = program.residual[p];
    residual[out + 1] = program.residual[p + 1];
    residual[out + 2] = program.residual[p + 2];
    residual[out + 3] = program.phaseDelay[id];
    lanes[out] = program.trackIndex[id];
    lanes[out + 1] = program.compiled?.perId.flags[id] ?? program.bridgeWeight[id];
    lanes[out + 2] = program.compiled?.perId.depth[id] ?? 0;
    lanes[out + 3] = m3Route[out];
    velocity[out] = program.sourceVelocity?.[p] ?? 0;
    velocity[out + 1] = program.sourceVelocity?.[p + 1] ?? 0;
    velocity[out + 2] = program.sourceVelocity?.[p + 2] ?? 0;
    velocity[out + 3] = program.sourceScaleVelocity?.[id] ?? 0;
    activation[out] = program.compiled?.perId.activationStart[id] ?? 0.18 + program.phaseDelay[id];
    activation[out + 1] = program.compiled?.perId.activationEnd[id] ?? 0.72 + program.phaseDelay[id];
    activation[out + 2] = m3Route[out + 1];
    activation[out + 3] = m3Route[out + 2];
  }
  const height = Math.max(1, Math.ceil(program.tracks.length / TRACK_TEXTURE_WIDTH));
  const sourceTracks = new Float32Array(TRACK_TEXTURE_WIDTH * height * 4);
  const targetTracks = new Float32Array(TRACK_TEXTURE_WIDTH * height * 4);
  const routes = new Float32Array(TRACK_TEXTURE_WIDTH * height * 4);
  const windows = new Float32Array(TRACK_TEXTURE_WIDTH * height * 4);
  program.tracks.forEach((track, id) => {
    const out = id * 4;
    const exact = program.compiled?.groupTracks[id];
    sourceTracks.set([...track.sourceCenter, exact?.direction[0] ?? 1], out);
    targetTracks.set([...track.targetCenter, exact?.releaseEnd ?? 0.38], out);
    routes.set([...track.route, exact?.revealEnd ?? 0.82], out);
    windows.set([
      exact?.bridgeStart ?? 0.3,
      exact?.bridgeEnd ?? 0.72,
      exact?.direction[1] ?? 0,
      exact?.direction[2] ?? 0,
    ], out);
  });
  return {
    residual: dataTexture(residual, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
    lanes: dataTexture(lanes, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
    velocity: dataTexture(velocity, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
    activation: dataTexture(activation, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
    sourceTracks: dataTexture(sourceTracks, TRACK_TEXTURE_WIDTH, height),
    targetTracks: dataTexture(targetTracks, TRACK_TEXTURE_WIDTH, height),
    routes: dataTexture(routes, TRACK_TEXTURE_WIDTH, height),
    windows: dataTexture(windows, TRACK_TEXTURE_WIDTH, height),
  };
}

const vertexShader = `
precision highp float;
precision highp int;
precision highp sampler2D;
in vec3 position;
in vec3 aSurfaceNormal;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform sampler2D uSource;
uniform sampler2D uTarget;
uniform sampler2D uSourceNormal;
uniform sampler2D uTargetNormal;
uniform sampler2D uSourceQuat;
uniform sampler2D uTargetQuat;
uniform sampler2D uSourceMeta;
uniform sampler2D uTargetMeta;
uniform sampler2D uResidual;
uniform sampler2D uLanes;
uniform sampler2D uVelocity;
uniform sampler2D uActivation;
uniform sampler2D uSourceTracks;
uniform sampler2D uTargetTracks;
uniform sampler2D uTrackRoutes;
uniform sampler2D uTrackWindows;
uniform vec3 uSourceFrameTranslate;
uniform vec3 uTargetFrameTranslate;
uniform float uSourceFrameScale;
uniform float uTargetFrameScale;
uniform float uProgress;
uniform float uBudget;
uniform float uSelected;
uniform float uDurationSeconds;
uniform float uLocalMorphWidth;
uniform float uBridgePulseMaximum;
uniform float uBridgeThickness;
uniform float uDepthRouteFraction;
uniform float uMinimumGeometricScale;
uniform vec2 uSettleWindow;
uniform float uSettleMaximum;
uniform vec3 uActorCenterStart;
uniform vec3 uActorCenterEnd;
uniform vec3 uActorRotationAxis;
uniform float uActorRotationRadians;
uniform vec3 uActorTranslationAxis;
uniform float uActorTranslationAmplitude;
uniform vec2 uActorWindow;
uniform vec3 uActorSourcePosition;
uniform vec4 uActorSourceOrientation;
uniform int uCompiled;
uniform int uDebug;
uniform int uEvaluator;
uniform vec3 uFieldOrigin;
uniform vec3 uFieldDirection;
uniform float uFieldScale;
uniform vec3 uIdleAnchor;
uniform float uIdleScale;
uniform vec4 uIdleQuat;
uniform int uIdleEnabled;
uniform vec2 uSiteClipScale;
uniform vec2 uSiteClipOffset;
uniform float uSiteCompositionEnabled;
out vec3 vColor;
out float vShade;
out vec3 vEvalPosition;
out vec4 vEvalOrientation;
out vec3 vEvalNormal;
out vec4 vEvalChannels;
out vec3 vEvalActorPosition;
out vec4 vEvalActorOrientation;
out vec3 vSurfaceNormalView;
out vec3 vViewPosition;
flat out float vPersistentSeed;
flat out float vFieldScalar;

float smooth5(float value) {
  float t = clamp(value, 0.0, 1.0);
  return t * t * t * (10.0 + t * (-15.0 + 6.0 * t));
}

float c2Window(float value, float start, float end) {
  return smooth5((value - start) / max(end - start, 0.000000001));
}

float c2Bump(float value, float start, float end) {
  float u = clamp((value - start) / max(end - start, 0.000000001), 0.0, 1.0);
  return value > start && value < end ? 64.0 * u * u * u * pow(1.0 - u, 3.0) : 0.0;
}

float initialVelocityBasis(float t) {
  return t - 6.0 * t * t * t + 8.0 * pow(t, 4.0) - 3.0 * pow(t, 5.0);
}

vec3 hashColor(float value) {
  return 0.38 + 0.48 * cos(vec3(0.0, 2.1, 4.2) + value * 1.71);
}

float persistentSeed(int persistentId) {
  uint value = uint(persistentId);
  value ^= value >> 16;
  value *= 0x7feb352du;
  value ^= value >> 15;
  value *= 0x846ca68bu;
  value ^= value >> 16;
  return float(value & 0x00ffffffu) / 16777215.0;
}

vec4 shortestSlerp(vec4 a, vec4 b, float t) {
  a = length(a) > 0.000000001 ? normalize(a) : vec4(0.0, 0.0, 0.0, 1.0);
  b = length(b) > 0.000000001 ? normalize(b) : vec4(0.0, 0.0, 0.0, 1.0);
  float cosine = dot(a, b);
  if (cosine < 0.0) { b = -b; cosine = -cosine; }
  float theta = acos(clamp(cosine, 0.0, 1.0));
  float sine = sin(theta);
  if (sine <= 0.0000001) return normalize(mix(a, b, t));
  return normalize(a * (sin((1.0 - t) * theta) / sine) + b * (sin(t * theta) / sine));
}

vec4 quatMultiply(vec4 a, vec4 b) {
  return normalize(vec4(
    a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    a.w * b.w - dot(a.xyz, b.xyz)
  ));
}

vec4 axisAngle(vec3 axis, float angle) {
  float axisLength = length(axis);
  if (axisLength < 0.000000000001 || abs(angle) < 0.000000000000001) return vec4(0.0, 0.0, 0.0, 1.0);
  float halfAngle = angle * 0.5;
  return vec4(axis / axisLength * sin(halfAngle), cos(halfAngle));
}

vec3 quatRotate(vec4 q, vec3 value) {
  vec3 twice = 2.0 * cross(q.xyz, value);
  return value + q.w * twice + cross(q.xyz, twice);
}

void main() {
  int id = gl_InstanceID;
  ivec2 uv = ivec2(id % 128, id / 128);
  vec4 a = texelFetch(uSource, uv, 0);
  vec4 b = texelFetch(uTarget, uv, 0);
  vec4 na = texelFetch(uSourceNormal, uv, 0);
  vec4 nb = texelFetch(uTargetNormal, uv, 0);
  vec4 qa = texelFetch(uSourceQuat, uv, 0);
  vec4 qb = texelFetch(uTargetQuat, uv, 0);
  vec4 ma = texelFetch(uSourceMeta, uv, 0);
  vec4 mb = texelFetch(uTargetMeta, uv, 0);
  vec4 residual = texelFetch(uResidual, uv, 0);
  vec4 lanes = texelFetch(uLanes, uv, 0);
  vec4 dynamics = texelFetch(uVelocity, uv, 0);
  vec4 activationLanes = texelFetch(uActivation, uv, 0);
  vec2 activationWindow = activationLanes.xy;
  float t = clamp(uProgress, 0.0, 1.0);
  float localT = t;
  float routePulse = 0.0;
  float bridge = 0.0;
  vec4 actorQuaternion = vec4(0.0, 0.0, 0.0, 1.0);
  vec3 actorPosition = vec3(0.0);
  vec4 actorOrientation = vec4(0.0, 0.0, 0.0, 1.0);
  vec3 center;

  if (uEvaluator == 0) {
    float morph = smooth5(t);
    float hump = c2Bump(t, 0.0, 1.0);
    vec3 proofRoute = vec3(lanes.w, activationLanes.z, activationLanes.w);
    center = mix(a.xyz, b.xyz, morph) + proofRoute * hump;
    localT = morph;
    routePulse = hump;
  } else {
    int trackId = int(lanes.x + 0.5);
    ivec2 trackUv = ivec2(trackId % 256, trackId / 256);
    vec4 sourceTrack = texelFetch(uSourceTracks, trackUv, 0);
    vec4 targetTrack = texelFetch(uTargetTracks, trackUv, 0);
    vec4 trackRoute = texelFetch(uTrackRoutes, trackUv, 0);
    vec4 trackWindows = texelFetch(uTrackWindows, trackUv, 0);
    vec3 sourceLocal = a.xyz - sourceTrack.xyz;
    vec3 targetLocal = b.xyz - targetTrack.xyz;
    if (uCompiled == 1) {
      float latestStart = max(targetTrack.w, trackRoute.w - uLocalMorphWidth);
      float localStart = min(targetTrack.w + residual.w, latestStart);
      float localEnd = max(min(localStart + uLocalMorphWidth, trackRoute.w), localStart + 0.0001);
      localT = c2Window(t, localStart, localEnd);
      routePulse = c2Bump(t, localStart, localEnd);
      int flags = int(lanes.y + 0.5);
      bridge = (flags & 4) != 0 ? c2Bump(t, trackWindows.x, trackWindows.y) : 0.0;
      float bridgeContraction = bridge * (1.0 - uBridgeThickness);
      vec3 direction = vec3(sourceTrack.w, trackWindows.z, trackWindows.w);
      direction = length(direction) > 0.000000000001 ? normalize(direction) : vec3(1.0, 0.0, 0.0);
      vec3 localOffset = mix(sourceLocal, targetLocal, localT);
      vec3 axial = dot(localOffset, direction) * direction;
      vec3 transverse = localOffset - axial;
      localOffset = localOffset - transverse * bridgeContraction;
      center = mix(sourceTrack.xyz, targetTrack.xyz, localT)
        + trackRoute.xyz * routePulse
        + localOffset
        + residual.xyz * routePulse;
      vec3 transportedNormal = normalize(mix(normalize(na.xyz), normalize(nb.xyz), localT) + vec3(0.0000001));
      float emerging = (flags & 1) != 0 ? 1.0 : 0.0;
      float immersing = (flags & 2) != 0 ? 1.0 : 0.0;
      center += transportedNormal * lanes.z * uDepthRouteFraction
        * c2Bump(t, activationWindow.x, activationWindow.y) * (immersing - emerging);
      vec3 residualDirection = length(residual.xyz) > 0.000000000001 ? normalize(residual.xyz) : transportedNormal;
      center += residualDirection * length(b.xyz - a.xyz) * uSettleMaximum
        * c2Bump(t, uSettleWindow.x, uSettleWindow.y);
      center += dynamics.xyz * uDurationSeconds * initialVelocityBasis(t);
      float actorPulse = c2Bump(t, uActorWindow.x, uActorWindow.y);
      actorQuaternion = axisAngle(uActorRotationAxis, uActorRotationRadians * actorPulse);
      vec3 actorCenter = mix(uActorCenterStart, uActorCenterEnd, smooth5(t));
      vec3 actorTranslation = uActorTranslationAxis * uActorTranslationAmplitude * actorPulse;
      actorPosition = uActorSourcePosition * (1.0 - smooth5(t)) + actorTranslation;
      actorOrientation = quatMultiply(
        shortestSlerp(uActorSourceOrientation, vec4(0.0, 0.0, 0.0, 1.0), smooth5(t)),
        actorQuaternion
      );
      center = quatRotate(actorQuaternion, center - actorCenter) + actorCenter + actorTranslation;
    } else {
      float delay = residual.w;
      float macroT = c2Window(t, 0.07 + delay * 0.35, 0.94 + delay * 0.2);
      localT = c2Window(t, 0.07 + delay, 0.82 + delay);
      routePulse = c2Bump(t, 0.07, 0.94);
      center = mix(sourceTrack.xyz, targetTrack.xyz, macroT)
        + trackRoute.xyz * routePulse
        + mix(sourceLocal, targetLocal, localT)
        + residual.xyz * routePulse;
      center += dynamics.xyz * uDurationSeconds * t * pow(1.0 - t, 3.0);
      bridge = lanes.y * c2Bump(t, 0.3, 0.72);
    }
  }

  vec4 orientation = shortestSlerp(qa, qb, localT);
  if (uCompiled == 1 && uEvaluator == 1) orientation = quatMultiply(actorQuaternion, orientation);
  vec3 normal = uEvaluator == 0
    ? normalize(mix(na.xyz, nb.xyz, localT) + vec3(0.0001, 0.0002, 0.0003))
    : normalize(quatRotate(orientation, vec3(0.0, 0.0, 1.0)) + vec3(0.0000001));
  if (t <= 0.0) { center = a.xyz; localT = 0.0; routePulse = 0.0; bridge = 0.0; orientation = normalize(qa); normal = normalize(na.xyz); }
  if (t >= 1.0) { center = b.xyz; localT = 1.0; routePulse = 0.0; bridge = 0.0; orientation = normalize(qb); normal = normalize(nb.xyz); }

  float sourceVisible = step(255.5, ma.w);
  float targetVisible = step(255.5, mb.w);
  float sourceFlags = mod(ma.w, 256.0);
  float targetFlags = mod(mb.w, 256.0);
  float sourceActive = (1.0 - step(0.5, ma.z)) * sourceVisible;
  float targetActive = (1.0 - step(0.5, mb.z)) * targetVisible;
  float m3Delay = na.w;
  float activationAlpha = uCompiled == 1 ? c2Window(t, activationWindow.x, activationWindow.y) : c2Window(t, 0.18 + residual.w, 0.72 + residual.w);
  float activation = sourceActive * targetActive;
  if (uEvaluator == 0) {
    activation += (1.0 - sourceActive) * targetActive * smoothstep(0.18 + m3Delay, 0.72 + m3Delay, t);
    activation += sourceActive * (1.0 - targetActive) * (1.0 - smoothstep(0.0, 0.82 - m3Delay, t));
  } else {
    activation += (1.0 - sourceActive) * targetActive * activationAlpha;
    activation += sourceActive * (1.0 - targetActive) * (1.0 - activationAlpha);
  }
  if (t <= 0.0) activation = sourceActive;
  if (t >= 1.0) activation = targetActive;
  if (uDebug == 5) activation = 1.0;
  float lodVisible = float(float(id) < uBudget);
  float selected = 1.0 + (uEvaluator == 0 ? 1.7 : 1.8) * float(abs(float(id) - uSelected) < 0.5);
  float geometricScale = mix(a.w, b.w, localT);
  if (uCompiled == 1 && uEvaluator == 1) geometricScale = geometricScale * (1.0 + bridge * uBridgePulseMaximum)
    + dynamics.w * uDurationSeconds * initialVelocityBasis(t);
  if (t <= 0.0) geometricScale = a.w;
  if (t >= 1.0) geometricScale = b.w;
  float finiteActivationScale = uEvaluator == 0 ? activation : mix(uMinimumGeometricScale, 1.0, clamp(activation, 0.0, 1.0));
  float radius = max(geometricScale, 0.0) * finiteActivationScale * lodVisible * selected;
  vec3 local;
  if (uEvaluator == 0) {
    vec3 up = abs(normal.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(up, normal));
    vec3 bitangent = cross(normal, tangent);
    local = (tangent * position.x + bitangent * position.y + normal * position.z) * radius;
  } else {
    local = quatRotate(orientation, position) * radius;
  }
  float presentationT = smooth5(t);
  vec3 frameTranslate = mix(uSourceFrameTranslate, uTargetFrameTranslate, presentationT);
  float frameScale = mix(uSourceFrameScale, uTargetFrameScale, presentationT);
  if (t <= 0.0) { frameTranslate = uSourceFrameTranslate; frameScale = uSourceFrameScale; }
  if (t >= 1.0) { frameTranslate = uTargetFrameTranslate; frameScale = uTargetFrameScale; }
  vFieldScalar = dot((center - uFieldOrigin) / uFieldScale, uFieldDirection);
  vec3 basePoint = center + local;
  vec4 idleQuat = uIdleEnabled == 1 && length(uIdleQuat) > 0.000000001 ? normalize(uIdleQuat) : vec4(0.0, 0.0, 0.0, 1.0);
  float idleScale = uIdleEnabled == 1 ? uIdleScale : 1.0;
  vec3 idlePoint = uIdleAnchor + idleScale * quatRotate(idleQuat, basePoint - uIdleAnchor);
  vec3 presented = (idlePoint + frameTranslate) * frameScale;
  vec4 clipPosition = projectionMatrix * modelViewMatrix * vec4(presented, 1.0);
  vec4 siteClip = clipPosition;
  if (uSiteCompositionEnabled > 0.5) {
    siteClip.xy = vec2(
      clipPosition.x * uSiteClipScale.x + clipPosition.w * uSiteClipOffset.x,
      clipPosition.y * uSiteClipScale.y + clipPosition.w * uSiteClipOffset.y
    );
  }
  gl_Position = siteClip;
  vec3 surfaceNormal = normalize(quatRotate(idleQuat, quatRotate(orientation, aSurfaceNormal)));
  vSurfaceNormalView = normalize(mat3(modelViewMatrix) * surfaceNormal);
  vViewPosition = (modelViewMatrix * vec4(presented, 1.0)).xyz;
  vPersistentSeed = persistentSeed(id);

  vColor = uEvaluator == 0 ? vec3(0.76, 0.78, 0.77) : vec3(0.76, 0.79, 0.78);
  if (uDebug == 1) {
    float phaseBand = t < 0.11 ? 0.0 : t < 0.38 ? 1.0 : t < 0.68 ? 2.0 : t < 0.82 ? 3.0 : t < 0.94 ? 4.0 : 5.0;
    vColor = hashColor(phaseBand * 2.3);
  }
  if (uDebug == 2) vColor = hashColor(lanes.x + 1.0);
  if (uDebug == 3) vColor = hashColor(mix(ma.y, mb.y, localT) + 7.0);
  if (uDebug == 4) vColor = mix(vec3(0.12, 0.22, 0.28), vec3(1.0, 0.48, 0.16), clamp(bridge, 0.0, 1.0));
  if (uDebug == 5) vColor = mix(vec3(0.96, 0.32, 0.4), vec3(0.24, 0.88, 0.58), max(sourceActive, targetActive));
  if (uDebug == 6) vColor = mix(vec3(0.22, 0.36, 0.48), vec3(0.98, 0.65, 0.14), clamp(length(residual.xyz) * 14.0, 0.0, 1.0));
  if (uDebug == 7) vColor = abs(orientation.xyz) * 0.75 + 0.2;
  if (uDebug == 8) vColor = hashColor(float(id) * 0.013);
  if (uDebug == 9) vColor = hashColor(mix(ma.x, mb.x, localT) + 1.0);
  if (uDebug == 10) vColor = mix(vec3(0.22, 0.3, 0.34), vec3(1.0, 0.36, 0.18), clamp(max(sourceFlags, targetFlags) / 3.0, 0.0, 1.0));
  if (uDebug == 11) vColor = mix(vec3(0.2, 0.42, 0.9), vec3(1.0, 0.7, 0.16), clamp(length(residual.xyz) * 14.0 + routePulse, 0.0, 1.0));
  if (uDebug == 12) vColor = mix(vec3(0.18, 0.62, 0.42), vec3(0.98, 0.24, 0.2), clamp(bridge + (1.0 - activation) * 0.35, 0.0, 1.0));
  if (abs(float(id) - uSelected) < 0.5) vColor = vec3(1.0, 0.92, 0.18);
  vShade = uEvaluator == 0 ? 0.55 + 0.45 * abs(normal.z) : 0.53 + 0.47 * abs(normal.z);
  vEvalPosition = center;
  vEvalOrientation = orientation;
  vEvalNormal = normal;
  vEvalChannels = vec4(geometricScale, activation, bridge, localT);
  vEvalActorPosition = actorPosition;
  vEvalActorOrientation = actorOrientation;
}`;

const fieldShaderFunctions = `
int m2SelectedCount(int mask) {
  int count = 0;
  for (int index = 0; index < 7; index += 1) {
    if ((mask & (1 << index)) != 0) count += 1;
  }
  return count;
}

int m2SelectedIndex(int mask, int ordinal) {
  int cursor = 0;
  for (int index = 0; index < 7; index += 1) {
    if ((mask & (1 << index)) == 0) continue;
    if (cursor == ordinal) return index;
    cursor += 1;
  }
  return 0;
}

void m2SemanticWeights(float coordinate, int mask, out vec4 low, out vec3 high) {
  low = vec4(0.0);
  high = vec3(0.0);
  int count = m2SelectedCount(mask);
  if (count <= 0) return;
  if (count == 1) {
    int only = m2SelectedIndex(mask, 0);
    if (only < 4) low[only] = 1.0; else high[only - 4] = 1.0;
    return;
  }
  float scaled = fract(coordinate) * float(count);
  int ordinal = min(count - 1, int(floor(scaled)));
  float local = scaled - floor(scaled);
  float blend = smoothstep(${PALETTE_BLEND_START.toFixed(2)}, 1.0, local);
  int current = m2SelectedIndex(mask, ordinal);
  int next = m2SelectedIndex(mask, (ordinal + 1) % count);
  if (current < 4) low[current] = 1.0 - blend; else high[current - 4] = 1.0 - blend;
  if (next < 4) low[next] += blend; else high[next - 4] += blend;
}

vec3 m2PaletteColor(float coordinate, int mask) {
  vec4 low;
  vec3 high;
  m2SemanticWeights(coordinate, mask, low, high);
  return uPaletteTokens[0] * low.x
    + uPaletteTokens[1] * low.y
    + uPaletteTokens[2] * low.z
    + uPaletteTokens[3] * low.w
    + uPaletteTokens[4] * high.x
    + uPaletteTokens[5] * high.y
    + uPaletteTokens[6] * high.z;
}

vec4 m2SourceLut(float coordinate) {
  float scaled = fract(coordinate) * ${FIELD_LUT_SIZE.toFixed(1)};
  int index = int(floor(scaled)) % ${FIELD_LUT_SIZE};
  int next = (index + 1) % ${FIELD_LUT_SIZE};
  return mix(uPaletteSourceLut[index], uPaletteSourceLut[next], scaled - floor(scaled));
}

vec2 m2BandEnvelope(float scalar, float phase) {
  float distance = abs(fract(scalar - phase + 0.5) - 0.5);
  float activeWeight = 1.0 - smoothstep(
    ${FIELD_PARAMETERS.coreHalfWidth.toFixed(3)},
    ${FIELD_PARAMETERS.shoulderHalfWidth.toFixed(3)},
    distance
  );
  float core = 1.0 - smoothstep(
    ${(FIELD_PARAMETERS.coreHalfWidth * 0.72).toFixed(4)},
    ${FIELD_PARAMETERS.coreHalfWidth.toFixed(3)},
    distance
  );
  return vec2(activeWeight, core);
}
`;

const fragmentShader = `
precision highp float;
precision highp int;
in vec3 vColor;
in float vShade;
in vec3 vEvalPosition;
in vec4 vEvalOrientation;
in vec3 vEvalNormal;
in vec4 vEvalChannels;
in vec3 vEvalActorPosition;
in vec4 vEvalActorOrientation;
in vec3 vSurfaceNormalView;
in vec3 vViewPosition;
flat in float vPersistentSeed;
flat in float vFieldScalar;
uniform int uDebug;
uniform float uThemeMix;
uniform vec3 uLightAlbedo;
uniform vec3 uDarkAlbedo;
uniform float uLightRoughness;
uniform float uDarkRoughness;
uniform float uLightMetalness;
uniform float uDarkMetalness;
uniform float uLightSpecular;
uniform float uDarkSpecular;
uniform float uLightClearcoat;
uniform float uDarkClearcoat;
uniform float uLightClearcoatRoughness;
uniform float uDarkClearcoatRoughness;
uniform float uLightExposure;
uniform float uDarkExposure;
uniform float uLightAmbient;
uniform float uDarkAmbient;
uniform float uLightKey;
uniform float uDarkKey;
uniform float uLightFill;
uniform float uDarkFill;
uniform float uLightRim;
uniform float uDarkRim;
uniform float uStableVariation;
uniform float uGlobalColorPhase;
uniform int uPaletteMask;
uniform vec3 uPaletteTokens[7];
uniform vec4 uPaletteSourceLut[${FIELD_LUT_SIZE}];
uniform float uPaletteProgress;
uniform float uReducedMotion;
uniform int uColorEnabled;
uniform int uColorLayer;
uniform int uFieldDiagnostic;
uniform int uActorMask;
out vec4 outColor;

const float PI = 3.141592653589793;

float saturate(float value) { return clamp(value, 0.0, 1.0); }

vec3 fresnelSchlick(float cosine, vec3 f0) {
  return f0 + (1.0 - f0) * pow(1.0 - saturate(cosine), 5.0);
}

float distributionGgx(vec3 n, vec3 h, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float nDotH = max(dot(n, h), 0.0);
  float denominator = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * denominator * denominator, 0.00001);
}

float geometrySchlickGgx(float nDotV, float roughness) {
  float r = roughness + 1.0;
  float k = (r * r) / 8.0;
  return nDotV / max(nDotV * (1.0 - k) + k, 0.00001);
}

float geometrySmith(vec3 n, vec3 v, vec3 l, float roughness) {
  return geometrySchlickGgx(max(dot(n, v), 0.0), roughness)
    * geometrySchlickGgx(max(dot(n, l), 0.0), roughness);
}

vec3 studioLight(
  vec3 n,
  vec3 v,
  vec3 l,
  vec3 baseColor,
  vec3 f0,
  float roughness,
  float metalness,
  float strength
) {
  vec3 h = normalize(v + l);
  float nDotL = max(dot(n, l), 0.0);
  float nDotV = max(dot(n, v), 0.0);
  vec3 f = fresnelSchlick(max(dot(h, v), 0.0), f0);
  float d = distributionGgx(n, h, roughness);
  float g = geometrySmith(n, v, l, roughness);
  vec3 specular = d * g * f / max(4.0 * nDotV * nDotL, 0.0001);
  vec3 diffuse = (1.0 - f) * (1.0 - metalness) * baseColor / PI;
  return (diffuse + specular) * nDotL * strength;
}

vec3 acesToneMap(vec3 color) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 color) {
  vec3 lo = color * 12.92;
  vec3 hi = 1.055 * pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(hi, lo, lessThanEqual(color, vec3(0.0031308)));
}

${fieldShaderFunctions}

void main() {
  if (uActorMask == 1) {
    outColor = vec4(1.0, 1.0, 0.0, 1.0);
    return;
  }
  if (uDebug != 0) {
    outColor = vec4(linearToSrgb(max(vColor * vShade, vec3(0.0))), 1.0);
    return;
  }

  float theme = saturate(uThemeMix);
  float stableOffset = (vPersistentSeed - 0.5) * uStableVariation;
  vec3 baseColor = mix(uLightAlbedo, uDarkAlbedo, theme);
  baseColor *= 1.0 + stableOffset * 0.036;

  float phase = fract(uGlobalColorPhase);
  float paletteCoordinate = fract(vFieldScalar - phase);
  vec2 envelope = vec2(0.0);
  vec4 field = vec4(0.0);
  bool evaluateField = uFieldDiagnostic != 0 || (uColorEnabled == 1 && uColorLayer > 0);
  if (evaluateField) {
    envelope = m2BandEnvelope(vFieldScalar, phase);
    float targetPresence = m2SelectedCount(uPaletteMask) > 0 ? 1.0 : 0.0;
    vec4 targetField = vec4(m2PaletteColor(paletteCoordinate, uPaletteMask), targetPresence);
    field = mix(m2SourceLut(paletteCoordinate), targetField, saturate(uPaletteProgress));
  }

  if (uFieldDiagnostic == 1) {
    vec3 diagnostic = mix(vec3(0.08, 0.13, 0.16), vec3(0.92, 0.78, 0.26), fract(vFieldScalar + 0.5));
    outColor = vec4(linearToSrgb(diagnostic), 1.0);
    return;
  }
  if (uFieldDiagnostic == 2) {
    vec3 diagnostic = mix(vec3(0.13, 0.16, 0.18), vec3(0.96, 0.38, 0.16), envelope.x);
    diagnostic = mix(diagnostic, vec3(1.0, 0.93, 0.48), envelope.y);
    outColor = vec4(linearToSrgb(diagnostic), 1.0);
    return;
  }
  if (uFieldDiagnostic == 3) {
    outColor = vec4(linearToSrgb(max(field.rgb * field.a, vec3(0.0))), 1.0);
    return;
  }

  if (uColorEnabled == 1 && uColorLayer > 0) {
    float undertone = mix(
      ${FIELD_PARAMETERS.undertoneStrength.light.toFixed(3)},
      ${FIELD_PARAMETERS.undertoneStrength.dark.toFixed(3)},
      theme
    );
    float activeStrength = uColorLayer == 2 ? envelope.x * mix(
      ${FIELD_PARAMETERS.activeStrength.light.toFixed(3)},
      ${FIELD_PARAMETERS.activeStrength.dark.toFixed(3)},
      theme
    ) : 0.0;
    float layerStrength = saturate((undertone + activeStrength) * field.a);
    vec3 lightAccent = field.rgb * 0.88;
    vec3 darkAccent = mix(field.rgb, vec3(0.72), 0.16);
    baseColor = mix(baseColor, mix(lightAccent, darkAccent, theme), layerStrength);
  }
  float roughness = clamp(
    mix(uLightRoughness, uDarkRoughness, theme) + stableOffset * 0.05,
    0.18,
    0.86
  );
  float metalness = mix(uLightMetalness, uDarkMetalness, theme);
  float specularLevel = clamp(
    mix(uLightSpecular, uDarkSpecular, theme) + stableOffset * 0.03,
    0.0,
    1.0
  );
  float clearcoat = mix(uLightClearcoat, uDarkClearcoat, theme);
  float clearcoatRoughness = mix(uLightClearcoatRoughness, uDarkClearcoatRoughness, theme);
  float exposure = mix(uLightExposure, uDarkExposure, theme);

  vec3 n = normalize(vSurfaceNormalView);
  vec3 v = normalize(-vViewPosition);
  vec3 f0 = mix(vec3(0.04 * specularLevel), baseColor, metalness);
  vec3 keyDirection = normalize(vec3(-0.46, 0.38, 0.80));
  vec3 fillDirection = normalize(vec3(0.58, -0.16, 0.80));
  vec3 color = studioLight(
    n, v, keyDirection, baseColor, f0, roughness, metalness,
    mix(uLightKey, uDarkKey, theme)
  );
  color += studioLight(
    n, v, fillDirection, baseColor, f0, roughness, metalness,
    mix(uLightFill, uDarkFill, theme)
  );

  float lowerContact = mix(0.88, 1.0, smoothstep(-1.45, 0.65, vEvalPosition.z));
  color += baseColor * mix(uLightAmbient, uDarkAmbient, theme) * lowerContact;
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.2) * mix(uLightRim, uDarkRim, theme);
  color += vec3(rim);

  vec3 clearcoatHalf = normalize(v + keyDirection);
  float clearcoatLobe = distributionGgx(n, clearcoatHalf, clearcoatRoughness)
    * max(dot(n, keyDirection), 0.0)
    * clearcoat
    * 0.025;
  color += vec3(clearcoatLobe);

  outColor = vec4(linearToSrgb(acesToneMap(color * exposure)), 1.0);
}
`;

function shader(gl: WebGL2RenderingContext, kind: number, source: string) {
  const value = gl.createShader(kind);
  if (!value) throw new Error("WebGL2 shader allocation failed");
  gl.shaderSource(value, source);
  gl.compileShader(value);
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(value);
    gl.deleteShader(value);
    throw new Error(`WebGL2 parity shader compile failed: ${log}`);
  }
  return value;
}

/** Transform-feedback agreement for all masks, semantic weights, and the periodic band. */
export async function runPS04M4FieldGpuParity(): Promise<FieldGpuParityMetrics> {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", { antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error("WebGL2 is unavailable for color-field parity readback");
  const vertex = shader(gl, gl.VERTEX_SHADER, `#version 300 es
precision highp float;
precision highp int;
in float aCoordinate;
uniform int uMask;
uniform float uPhase;
uniform vec3 uPaletteTokens[7];
uniform vec4 uPaletteSourceLut[${FIELD_LUT_SIZE}];
out vec4 vLow;
out vec4 vHighEnvelope;
${fieldShaderFunctions}
void main() {
  vec4 low;
  vec3 high;
  m2SemanticWeights(aCoordinate, uMask, low, high);
  vLow = low;
  vHighEnvelope = vec4(high, m2BandEnvelope(aCoordinate, uPhase).x);
  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`);
  const fragment = shader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
out vec4 outColor;
void main() { outColor = vec4(0.0); }`);
  const linked = gl.createProgram();
  if (!linked) throw new Error("WebGL2 color-field parity program allocation failed");
  gl.attachShader(linked, vertex);
  gl.attachShader(linked, fragment);
  gl.transformFeedbackVaryings(linked, ["vLow", "vHighEnvelope"], gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(linked);
  if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) {
    throw new Error(`WebGL2 color-field parity link failed: ${gl.getProgramInfoLog(linked)}`);
  }
  gl.useProgram(linked);

  const coordinates = new Float32Array(Array.from({ length: 257 }, (_, index) => -1 + (index * 4) / 256));
  const vao = gl.createVertexArray();
  const coordinateBuffer = gl.createBuffer();
  const feedback = gl.createTransformFeedback();
  const feedbackBuffer = gl.createBuffer();
  if (!vao || !coordinateBuffer || !feedback || !feedbackBuffer) throw new Error("WebGL2 color-field parity buffer allocation failed");
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, coordinateBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, coordinates, gl.STATIC_DRAW);
  const coordinateLocation = gl.getAttribLocation(linked, "aCoordinate");
  gl.enableVertexAttribArray(coordinateLocation);
  gl.vertexAttribPointer(coordinateLocation, 1, gl.FLOAT, false, 0, 0);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
  gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, feedbackBuffer);
  gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, coordinates.length * 8 * 4, gl.DYNAMIC_READ);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, feedbackBuffer);
  const maskLocation = gl.getUniformLocation(linked, "uMask");
  const phaseLocation = gl.getUniformLocation(linked, "uPhase");
  const read = (mask: number, phase: number) => {
    const values = new Float32Array(coordinates.length * 8);
    gl.uniform1i(maskLocation, mask);
    gl.uniform1f(phaseLocation, phase);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, coordinates.length);
    gl.endTransformFeedback();
    gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, values);
    return values;
  };

  let maxSemanticWeightError = 0;
  let maxSemanticSumError = 0;
  let maxUnselectedWeight = 0;
  let maxEnvelopeError = 0;
  let semanticSamples = 0;
  let envelopeSamples = 0;
  gl.enable(gl.RASTERIZER_DISCARD);
  for (let mask = 0; mask <= ALL_COMPETENCE_MASK; mask += 1) {
    const values = read(mask, 0);
    const palette = paletteStateForMask(mask);
    coordinates.forEach((coordinate, sampleIndex) => {
      const expected = semanticWeightsForCoordinate(coordinate, palette);
      const actual = Array.from({ length: 7 }, (_, index) => values[sampleIndex * 8 + index]);
      actual.forEach((weight, index) => {
        maxSemanticWeightError = Math.max(maxSemanticWeightError, Math.abs(weight - expected[index]));
        if ((mask & (1 << index)) === 0) maxUnselectedWeight = Math.max(maxUnselectedWeight, Math.abs(weight));
      });
      maxSemanticSumError = Math.max(maxSemanticSumError, Math.abs(actual.reduce((sum, value) => sum + value, 0) - (mask === 0 ? 0 : 1)));
      semanticSamples += 1;
    });
  }
  for (let phaseIndex = 0; phaseIndex <= 16; phaseIndex += 1) {
    const phase = phaseIndex / 16;
    const values = read(ALL_COMPETENCE_MASK, phase);
    coordinates.forEach((coordinate, sampleIndex) => {
      const expected = bandEnvelope(coordinate, phase).activeWeight;
      maxEnvelopeError = Math.max(maxEnvelopeError, Math.abs(values[sampleIndex * 8 + 7] - expected));
      envelopeSamples += 1;
    });
  }
  gl.disable(gl.RASTERIZER_DISCARD);
  gl.deleteBuffer(feedbackBuffer);
  gl.deleteTransformFeedback(feedback);
  gl.deleteBuffer(coordinateBuffer);
  gl.deleteVertexArray(vao);
  gl.deleteProgram(linked);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  const valid = maxSemanticWeightError <= 2e-6
    && maxSemanticSumError <= 2e-6
    && maxUnselectedWeight <= 2e-6
    && maxEnvelopeError <= 2e-6;
  return {
    measured: true,
    valid,
    semanticSamples,
    envelopeSamples,
    maxSemanticWeightError,
    maxSemanticSumError,
    maxUnselectedWeight,
    maxEnvelopeError,
  };
}

/** Actual transform-feedback readback of the same vertex evaluator used by the Lab. */
export async function runPS04M4GpuGoldenParity(
  source: DecodedState,
  target: DecodedState,
  transition: TransitionProgram,
): Promise<GpuParityMetrics> {
  if (!transition.compiled) throw new Error("GPU golden parity requires a verified precompiled program");
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", { antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error("WebGL2 is unavailable for GPU parity readback");
  if (gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) < 16) throw new Error("GPU exposes fewer than 16 vertex texture units");
  // THREE.GLSL3 normally injects this directive for the visible material;
  // the raw transform-feedback program must provide it explicitly.
  const vertex = shader(gl, gl.VERTEX_SHADER, `#version 300 es\n${vertexShader}`);
  const fragment = shader(gl, gl.FRAGMENT_SHADER, `#version 300 es\n${fragmentShader}`);
  const linked = gl.createProgram();
  if (!linked) throw new Error("WebGL2 parity program allocation failed");
  gl.attachShader(linked, vertex);
  gl.attachShader(linked, fragment);
  gl.transformFeedbackVaryings(linked, [
    "vEvalPosition",
    "vEvalOrientation",
    "vEvalNormal",
    "vEvalChannels",
    "vEvalActorPosition",
    "vEvalActorOrientation",
  ], gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(linked);
  if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) throw new Error(`WebGL2 parity program link failed: ${gl.getProgramInfoLog(linked)}`);
  gl.useProgram(linked);

  const state = {
    uSource: stateTexture(source, "position"),
    uTarget: stateTexture(target, "position"),
    uSourceNormal: stateTexture(source, "normal"),
    uTargetNormal: stateTexture(target, "normal"),
    uSourceQuat: stateTexture(source, "orientation"),
    uTargetQuat: stateTexture(target, "orientation"),
    uSourceMeta: stateTexture(source, "meta"),
    uTargetMeta: stateTexture(target, "meta"),
  };
  const compiled = programTextures(transition, source, target);
  const textures = { ...state, uResidual: compiled.residual, uLanes: compiled.lanes, uVelocity: compiled.velocity,
    uActivation: compiled.activation, uSourceTracks: compiled.sourceTracks, uTargetTracks: compiled.targetTracks,
    uTrackRoutes: compiled.routes, uTrackWindows: compiled.windows };
  const gpuTextures: WebGLTexture[] = [];
  Object.entries(textures).forEach(([name, value], unit) => {
    const texture = gl.createTexture();
    if (!texture) throw new Error("WebGL2 parity texture allocation failed");
    gpuTextures.push(texture);
    const image = value.image as { data: Float32Array; width: number; height: number };
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, image.width, image.height, 0, gl.RGBA, gl.FLOAT, image.data);
    gl.uniform1i(gl.getUniformLocation(linked, name), unit);
  });
  const one = (name: string, value: number) => gl.uniform1f(gl.getUniformLocation(linked, name), value);
  const integer = (name: string, value: number) => gl.uniform1i(gl.getUniformLocation(linked, name), value);
  const two = (name: string, value: readonly [number, number]) => gl.uniform2f(gl.getUniformLocation(linked, name), value[0], value[1]);
  const three = (name: string, value: readonly [number, number, number]) => gl.uniform3f(gl.getUniformLocation(linked, name), value[0], value[1], value[2]);
  const header = transition.compiled.header;
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  gl.uniformMatrix4fv(gl.getUniformLocation(linked, "modelViewMatrix"), false, identity);
  gl.uniformMatrix4fv(gl.getUniformLocation(linked, "projectionMatrix"), false, identity);
  three("uFieldOrigin", FIELD_ORIGIN);
  three("uFieldDirection", FIELD_DIRECTION);
  one("uFieldScale", FIELD_SCALE);
  three("uIdleAnchor", [0, 0, 0]);
  one("uIdleScale", 1);
  gl.uniform4f(gl.getUniformLocation(linked, "uIdleQuat"), 0, 0, 0, 1);
  integer("uIdleEnabled", 0);
  one("uBudget", transition.recordCount);
  one("uSelected", -1);
  one("uDurationSeconds", header.durationSeconds);
  one("uLocalMorphWidth", header.activationPolicy.localMorphWidthFraction ?? 0.12);
  one("uBridgePulseMaximum", header.activationPolicy.bridgePulseMaximum);
  one("uBridgeThickness", header.activationPolicy.bridgeThickness ?? 1);
  one("uDepthRouteFraction", header.activationPolicy.depthRouteFraction);
  one("uMinimumGeometricScale", header.activationPolicy.minimumGeometricScale);
  two("uSettleWindow", header.settlePolicy.window);
  one("uSettleMaximum", header.settlePolicy.maximumAmplitudeFraction);
  three("uActorCenterStart", header.actorTrack.centerStart);
  three("uActorCenterEnd", header.actorTrack.centerEnd);
  three("uActorRotationAxis", header.actorTrack.rotationAxis);
  one("uActorRotationRadians", header.actorTrack.rotationRadians);
  three("uActorTranslationAxis", header.actorTrack.translationAxis);
  one("uActorTranslationAmplitude", header.actorTrack.translationAmplitude);
  two("uActorWindow", header.actorTrack.window);
  three("uActorSourcePosition", header.actorTrack.sourcePose.position);
  gl.uniform4f(
    gl.getUniformLocation(linked, "uActorSourceOrientation"),
    ...header.actorTrack.sourcePose.orientation,
  );
  integer("uCompiled", 1);
  integer("uDebug", 0);
  integer("uEvaluator", 1);

  const vao = gl.createVertexArray();
  const positionBuffer = gl.createBuffer();
  const feedback = gl.createTransformFeedback();
  const feedbackBuffer = gl.createBuffer();
  if (!vao || !positionBuffer || !feedback || !feedbackBuffer) throw new Error("WebGL2 parity buffer allocation failed");
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0]), gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(linked, "position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
  const floatsPerId = 21;
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
  gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, feedbackBuffer);
  gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, transition.recordCount * floatsPerId * 4, gl.DYNAMIC_READ);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, feedbackBuffer);

  const response = await fetch("/photonic-skin/ps-03-m4-1/runtime/ps03m41-golden-fixtures.json");
  if (!response.ok) throw new Error("Python golden fixtures unavailable for GPU parity");
  const golden = await response.json() as {
    fixtureVersion: string;
    persistentIds: number[];
    timeGrid: number[];
    tolerances: { position: number; orientation: number; scale: number; groupPhase?: number; actorPose?: number };
    fixtures: Array<{ programId: string; samples: Array<{ t: number; position: number[][]; orientation: number[][];
      velocity: number[][]; normal: number[][]; scale: number[]; role: number[][]; groupPhase?: number[]; actorPose: number[] }> }>;
  };
  const fixture = golden.fixtures.find((value) => value.programId === transition.programId);
  if (!fixture) throw new Error(`Python golden fixture missing for ${transition.programId}`);
  if (golden.timeGrid.length !== fixture.samples.length) throw new Error("Python golden time-grid/sample count mismatch");
  const error = {
    position: [] as number[],
    velocity: [] as number[],
    velocityNormalized: [] as number[],
    orientation: [] as number[],
    normal: [] as number[],
    scale: [] as number[],
    activation: [] as number[],
    bridge: [] as number[],
    groupPhase: [] as number[],
    actorPose: [] as number[],
  };
  let worstVelocitySample = { t: 0, persistentId: 0, axis: 0, actual: 0, expected: 0, epsilon: 0 };
  let worstVelocityError = -1;
  const record = (values: number[], actual: number, expected: number) => values.push(Math.abs(actual - expected));
  const summarize = (values: number[]) => {
    if (values.length === 0) return { max: Number.POSITIVE_INFINITY, p95: Number.POSITIVE_INFINITY };
    const sorted = [...values].sort((a, b) => a - b);
    return {
      max: sorted[sorted.length - 1],
      p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)],
    };
  };
  const readAt = (progress: number) => {
    const values = new Float32Array(transition.recordCount * floatsPerId);
    one("uProgress", progress);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArraysInstanced(gl.POINTS, 0, 1, transition.recordCount);
    gl.endTransformFeedback();
    gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, values);
    return values;
  };
  gl.enable(gl.RASTERIZER_DISCARD);
  for (const sample of fixture.samples) {
    const values = readAt(sample.t);
    // Keep a stable Float32 separation even for the mandated endpoint±epsilon
    // samples. C2 endpoint closure makes the clipped one-sided chord converge
    // quadratically there, while interior samples remain centered.
    const velocityBeforeT = sample.t > 0 && sample.t < 1 ? Math.max(0, sample.t - 1e-3) : sample.t;
    const velocityAfterT = sample.t > 0 && sample.t < 1 ? Math.min(1, sample.t + 1e-3) : sample.t;
    const velocitySpan = velocityAfterT - velocityBeforeT;
    const before = velocitySpan > 0 ? readAt(velocityBeforeT) : null;
    const after = velocitySpan > 0 ? readAt(velocityAfterT) : null;
    golden.persistentIds.forEach((id, lane) => {
      const offset = id * floatsPerId;
      for (let axis = 0; axis < 3; axis += 1) {
        record(error.position, values[offset + axis], sample.position[lane][axis]);
        record(error.normal, values[offset + 7 + axis], sample.normal[lane][axis]);
        const gpuVelocity = before && after
          ? (after[offset + axis] - before[offset + axis]) / (velocitySpan * header.durationSeconds)
          : 0;
        const velocityError = Math.abs(gpuVelocity - sample.velocity[lane][axis]);
        if (velocityError > worstVelocityError) {
          worstVelocityError = velocityError;
          worstVelocitySample = {
            t: sample.t,
            persistentId: id,
            axis,
            actual: gpuVelocity,
            expected: sample.velocity[lane][axis],
            epsilon: velocitySpan * 0.5,
          };
        }
        record(error.velocity, gpuVelocity, sample.velocity[lane][axis]);
        error.velocityNormalized.push(velocityError / Math.max(1, Math.abs(sample.velocity[lane][axis])));
      }
      for (let axis = 0; axis < 4; axis += 1) record(error.orientation, values[offset + 3 + axis], sample.orientation[lane][axis]);
      record(error.scale, values[offset + 10], sample.scale[lane]);
      const expectedBridge = sample.role[lane][2];
      const expectedActivation = expectedBridge < 1 - 1e-7 ? sample.role[lane][0] / (1 - expectedBridge) : 0;
      record(error.activation, values[offset + 11], expectedActivation);
      record(error.bridge, values[offset + 12], expectedBridge);
      if (sample.groupPhase) record(error.groupPhase, values[offset + 13], sample.groupPhase[lane]);
      for (let axis = 0; axis < 3; axis += 1) record(error.actorPose, values[offset + 14 + axis], sample.actorPose[axis]);
      for (let axis = 0; axis < 4; axis += 1) record(error.actorPose, values[offset + 17 + axis], sample.actorPose[3 + axis]);
    });
  }
  const mid = fixture.samples[Math.floor(fixture.samples.length / 2)] ?? fixture.samples[0];
  integer("uIdleEnabled", 0);
  const evalOff = readAt(mid.t);
  integer("uIdleEnabled", 1);
  one("uIdleScale", 1.012);
  gl.uniform4f(gl.getUniformLocation(linked, "uIdleQuat"), 0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4));
  const evalOn = readAt(mid.t);
  integer("uIdleEnabled", 0);
  one("uIdleScale", 1);
  gl.uniform4f(gl.getUniformLocation(linked, "uIdleQuat"), 0, 0, 0, 1);
  let maxIdleEvalPositionDelta = 0;
  golden.persistentIds.forEach((id) => {
    const offset = id * floatsPerId;
    for (let axis = 0; axis < 3; axis += 1) {
      maxIdleEvalPositionDelta = Math.max(maxIdleEvalPositionDelta, Math.abs(evalOn[offset + axis] - evalOff[offset + axis]));
    }
  });
  gl.disable(gl.RASTERIZER_DISCARD);
  const position = summarize(error.position);
  const velocity = summarize(error.velocity);
  const velocityNormalized = summarize(error.velocityNormalized);
  const orientation = summarize(error.orientation);
  const normal = summarize(error.normal);
  const scale = summarize(error.scale);
  const activation = summarize(error.activation);
  const bridge = summarize(error.bridge);
  const groupPhase = summarize(error.groupPhase);
  const actorPose = summarize(error.actorPose);
  const valid = position.max <= golden.tolerances.position
    // Velocity is reconstructed from two Float32 position readbacks. Its
    // maximum bound follows from the position tolerance divided by the 2 ms
    // chord, while p95 remains much tighter to reject broad drift.
    && velocity.max <= 3e-2
    && velocity.p95 <= 3e-3
    && velocityNormalized.p95 <= 1e-3
    && orientation.max <= golden.tolerances.orientation
    && normal.max <= 3e-5
    && scale.max <= golden.tolerances.scale
    && activation.max <= 3e-5
    && bridge.max <= 3e-5
    && groupPhase.max <= (golden.tolerances.groupPhase ?? 2e-6)
    && actorPose.max <= (golden.tolerances.actorPose ?? golden.tolerances.position);
  Object.values(textures).forEach((texture) => texture.dispose());
  gpuTextures.forEach((texture) => gl.deleteTexture(texture));
  gl.deleteBuffer(feedbackBuffer);
  gl.deleteTransformFeedback(feedback);
  gl.deleteBuffer(positionBuffer);
  gl.deleteVertexArray(vao);
  gl.deleteProgram(linked);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return {
    measured: true,
    valid,
    programId: transition.programId,
    sampleCount: fixture.samples.length * golden.persistentIds.length,
    timeSampleCount: fixture.samples.length,
    maxPositionError: position.max,
    p95PositionError: position.p95,
    maxVelocityError: velocity.max,
    p95VelocityError: velocity.p95,
    maxVelocityNormalizedError: velocityNormalized.max,
    p95VelocityNormalizedError: velocityNormalized.p95,
    maxOrientationError: orientation.max,
    p95OrientationError: orientation.p95,
    maxNormalError: normal.max,
    p95NormalError: normal.p95,
    maxScaleError: scale.max,
    p95ScaleError: scale.p95,
    maxActivationError: activation.max,
    p95ActivationError: activation.p95,
    maxBridgeError: bridge.max,
    p95BridgeError: bridge.p95,
    maxGroupPhaseError: groupPhase.max,
    p95GroupPhaseError: groupPhase.p95,
    maxActorPoseError: actorPose.max,
    p95ActorPoseError: actorPose.p95,
    worstVelocitySample,
    maxIdleEvalPositionDelta,
  };
}

function CameraRig({
  preset,
  contract,
  diagnosticId,
}: {
  preset: CameraPreset;
  contract: M3Manifest["presentationContract"];
  diagnosticId: string;
}) {
  const { camera } = useThree();
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) throw new Error("M4.1R requires a PerspectiveCamera");
    applyPhotonicPresentationCamera(camera, contract, preset);
    const diagnostic = cameraDiagnostic(camera, preset);
    const host = window as Window & {
      __PS03M41R_PRESENTATION_DIAGNOSTICS__?: Record<string, ReturnType<typeof cameraDiagnostic>>;
    };
    host.__PS03M41R_PRESENTATION_DIAGNOSTICS__ = {
      ...host.__PS03M41R_PRESENTATION_DIAGNOSTICS__,
      [diagnosticId]: diagnostic,
    };
    const existing = JSON.parse(document.documentElement.dataset.ps03M41rCameraDiagnostics ?? "{}") as Record<string, ReturnType<typeof cameraDiagnostic>>;
    document.documentElement.dataset.ps03M41rCameraDiagnostics = JSON.stringify({ ...existing, [diagnosticId]: diagnostic });
  }, [camera, contract, diagnosticId, preset]);
  return null;
}

function DemandRenderInvalidator({ signature }: { signature: string }) {
  const { invalidate } = useThree();
  useEffect(() => {
    invalidate();
    const frame = requestAnimationFrame(() => invalidate());
    const settle = window.setTimeout(() => invalidate(), 120);
    const stats = window.setTimeout(() => invalidate(), 1100);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      window.clearTimeout(stats);
    };
  }, [invalidate, signature]);
  return null;
}

function TrackOverlay({ program, mode, frame }: { program: TransitionProgram; mode: DebugMode; frame: ReturnType<typeof resolvePresentationFrame> }) {
  const visible = mode === "groups" || mode === "bridge" || mode === "trajectories";
  const resources = useMemo(() => {
    const linePositions: number[] = [];
    const pointPositions: number[] = [];
    program.tracks.forEach((track, index) => {
      const exact = program.compiled?.groupTracks[index];
      const isBridge = exact ? (exact.flags & 16) !== 0 : track.bridgeWeight > 0;
      if (mode === "bridge" && !isBridge) return;
      const control = [0, 1, 2].map((axis) => (
        (track.sourceCenter[axis] + track.targetCenter[axis]) * 0.5 + track.route[axis]
      ));
      linePositions.push(...track.sourceCenter, ...control, ...control, ...track.targetCenter);
      pointPositions.push(...track.sourceCenter, ...track.targetCenter);
    });
    const lines = new THREE.BufferGeometry();
    lines.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
    const points = new THREE.BufferGeometry();
    points.setAttribute("position", new THREE.Float32BufferAttribute(pointPositions, 3));
    const lineMaterial = new THREE.LineBasicMaterial({ color: mode === "bridge" ? 0xff7a24 : 0x50d6ff, transparent: true, opacity: 0.9 });
    const pointMaterial = new THREE.PointsMaterial({ color: 0xffe26a, size: 0.055, sizeAttenuation: true });
    return { lines, points, lineMaterial, pointMaterial };
  }, [mode, program]);
  useEffect(() => () => {
    resources.lines.dispose();
    resources.points.dispose();
    resources.lineMaterial.dispose();
    resources.pointMaterial.dispose();
  }, [resources]);
  if (!visible) return null;
  return (
    <group
      position={[frame.translate[0] * frame.scale, frame.translate[1] * frame.scale, frame.translate[2] * frame.scale]}
      scale={frame.scale}
    >
      <lineSegments geometry={resources.lines} material={resources.lineMaterial} />
      <points geometry={resources.points} material={resources.pointMaterial} />
    </group>
  );
}

function M41Content(props: SceneProps) {
  const { gl, get } = useThree();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const progressRef = useRef(props.progress);
  const lastSourceLut = useRef<unknown>(null);
  const readyRef = useRef(false);
  const frameStats = useRef({ elapsed: 0, frames: 0, samples: [] as number[] });
  const stateTextures = useMemo(() => ({
    source: stateTexture(props.source, "position"),
    target: stateTexture(props.target, "position"),
    sourceNormal: stateTexture(props.source, "normal"),
    targetNormal: stateTexture(props.target, "normal"),
    sourceQuat: stateTexture(props.source, "orientation"),
    targetQuat: stateTexture(props.target, "orientation"),
    sourceMeta: stateTexture(props.source, "meta", props.profile),
    targetMeta: stateTexture(props.target, "meta", props.profile),
  }), [props.profile, props.source, props.target]);
  const sourceFrame = useMemo(() => resolvePresentationFrame(props.source.entry), [props.source.entry]);
  const targetFrame = useMemo(() => resolvePresentationFrame(props.target.entry), [props.target.entry]);
  const currentFrame = interpolatePresentationFrames(
    props.source.entry,
    props.target.entry,
    props.reducedMotion ? 1 : props.progress,
  );
  const compiledTextures = useMemo(
    () => programTextures(props.program, props.source, props.target),
    [props.program, props.source, props.target],
  );
  const textureCount = Object.keys(stateTextures).length + Object.keys(compiledTextures).length;
  const paletteTokens = useMemo(
    () => PHOTONIC_COLOR_TOKENS.map((token) => new THREE.Color().fromArray([...token.linear])),
    [],
  );
  const initialColorSnapshot = useMemo(
    () => props.material.colorController.snapshot(),
    [props.material.colorController],
  );
  const sourceLutUniforms = useMemo(
    () => Array.from({ length: FIELD_LUT_SIZE }, (_, index) => {
      const sample = initialColorSnapshot.sourceLut[index];
      return new THREE.Vector4(sample.color[0], sample.color[1], sample.color[2], sample.presence);
    }),
    [initialColorSnapshot],
  );
  const uniformsRef = useRef({
    uSource: { value: stateTextures.source },
    uTarget: { value: stateTextures.target },
    uSourceNormal: { value: stateTextures.sourceNormal },
    uTargetNormal: { value: stateTextures.targetNormal },
    uSourceQuat: { value: stateTextures.sourceQuat },
    uTargetQuat: { value: stateTextures.targetQuat },
    uSourceMeta: { value: stateTextures.sourceMeta },
    uTargetMeta: { value: stateTextures.targetMeta },
    uResidual: { value: compiledTextures.residual },
    uLanes: { value: compiledTextures.lanes },
    uVelocity: { value: compiledTextures.velocity },
    uActivation: { value: compiledTextures.activation },
    uSourceTracks: { value: compiledTextures.sourceTracks },
    uTargetTracks: { value: compiledTextures.targetTracks },
    uTrackRoutes: { value: compiledTextures.routes },
    uTrackWindows: { value: compiledTextures.windows },
    uSourceFrameTranslate: { value: new THREE.Vector3(...sourceFrame.translate) },
    uTargetFrameTranslate: { value: new THREE.Vector3(...targetFrame.translate) },
    uSourceFrameScale: { value: sourceFrame.scale },
    uTargetFrameScale: { value: targetFrame.scale },
    uProgress: { value: 0 },
    uBudget: { value: 0 },
    uSelected: { value: 0 },
    uDurationSeconds: { value: props.program.durationMs / 1000 },
    uLocalMorphWidth: { value: props.program.compiled?.header.activationPolicy.localMorphWidthFraction ?? 0.12 },
    uBridgePulseMaximum: { value: props.program.compiled?.header.activationPolicy.bridgePulseMaximum ?? 0.035 },
    uBridgeThickness: { value: props.program.compiled?.header.activationPolicy.bridgeThickness ?? 1 },
    uDepthRouteFraction: { value: props.program.compiled?.header.activationPolicy.depthRouteFraction ?? 0.18 },
    uMinimumGeometricScale: { value: props.program.compiled?.header.activationPolicy.minimumGeometricScale ?? 0.18 },
    uSettleWindow: { value: new THREE.Vector2(...(props.program.compiled?.header.settlePolicy.window ?? [0.86, 1])) },
    uSettleMaximum: { value: props.program.compiled?.header.settlePolicy.maximumAmplitudeFraction ?? 0.018 },
    uActorCenterStart: { value: new THREE.Vector3(...(props.program.compiled?.header.actorTrack.centerStart ?? [0, 0, 0])) },
    uActorCenterEnd: { value: new THREE.Vector3(...(props.program.compiled?.header.actorTrack.centerEnd ?? [0, 0, 0])) },
    uActorRotationAxis: { value: new THREE.Vector3(...(props.program.compiled?.header.actorTrack.rotationAxis ?? [0, 0, 1])) },
    uActorRotationRadians: { value: props.program.compiled?.header.actorTrack.rotationRadians ?? 0 },
    uActorTranslationAxis: { value: new THREE.Vector3(...(props.program.compiled?.header.actorTrack.translationAxis ?? [0, 0, 0])) },
    uActorTranslationAmplitude: { value: props.program.compiled?.header.actorTrack.translationAmplitude ?? 0 },
    uActorWindow: { value: new THREE.Vector2(...(props.program.compiled?.header.actorTrack.window ?? [0, 1])) },
    uActorSourcePosition: { value: new THREE.Vector3(...(props.program.compiled?.header.actorTrack.sourcePose.position ?? [0, 0, 0])) },
    uActorSourceOrientation: { value: new THREE.Vector4(...(props.program.compiled?.header.actorTrack.sourcePose.orientation ?? [0, 0, 0, 1])) },
    uCompiled: { value: props.program.compiled ? 1 : 0 },
    uDebug: { value: 0 },
    uEvaluator: { value: 1 },
    uFieldOrigin: { value: new THREE.Vector3(...FIELD_ORIGIN) },
    uFieldDirection: { value: new THREE.Vector3(...FIELD_DIRECTION) },
    uFieldScale: { value: FIELD_SCALE },
    uIdleAnchor: { value: new THREE.Vector3(...(props.overlay?.anchor ?? IDENTITY_OVERLAY.anchor)) },
    uIdleScale: { value: props.overlay?.scale ?? 1 },
    uIdleQuat: { value: new THREE.Vector4(...(props.overlay?.quaternion ?? IDENTITY_OVERLAY.quaternion)) },
    uIdleEnabled: { value: props.overlay?.enabled ? 1 : 0 },
    uSiteClipScale: { value: new THREE.Vector2(1, 1) },
    uSiteClipOffset: { value: new THREE.Vector2(0, 0) },
    uSiteCompositionEnabled: { value: 0 },
    uThemeMix: { value: props.material.themeMix },
    uLightAlbedo: { value: new THREE.Color(LIGHT_MATERIAL.albedo) },
    uDarkAlbedo: { value: new THREE.Color(DARK_MATERIAL.albedo) },
    uLightRoughness: { value: LIGHT_MATERIAL.roughness },
    uDarkRoughness: { value: DARK_MATERIAL.roughness },
    uLightMetalness: { value: LIGHT_MATERIAL.metalness },
    uDarkMetalness: { value: DARK_MATERIAL.metalness },
    uLightSpecular: { value: LIGHT_MATERIAL.specular },
    uDarkSpecular: { value: DARK_MATERIAL.specular },
    uLightClearcoat: { value: LIGHT_MATERIAL.clearcoat },
    uDarkClearcoat: { value: DARK_MATERIAL.clearcoat },
    uLightClearcoatRoughness: { value: LIGHT_MATERIAL.clearcoatRoughness },
    uDarkClearcoatRoughness: { value: DARK_MATERIAL.clearcoatRoughness },
    uLightExposure: { value: LIGHT_MATERIAL.exposure },
    uDarkExposure: { value: DARK_MATERIAL.exposure },
    uLightAmbient: { value: LIGHT_MATERIAL.ambientStrength },
    uDarkAmbient: { value: DARK_MATERIAL.ambientStrength },
    uLightKey: { value: LIGHT_MATERIAL.keyStrength },
    uDarkKey: { value: DARK_MATERIAL.keyStrength },
    uLightFill: { value: LIGHT_MATERIAL.fillStrength },
    uDarkFill: { value: DARK_MATERIAL.fillStrength },
    uLightRim: { value: LIGHT_MATERIAL.rimStrength },
    uDarkRim: { value: DARK_MATERIAL.rimStrength },
    uStableVariation: { value: props.material.stableVariation ? 1 : 0 },
    uGlobalColorPhase: { value: initialColorSnapshot.phase },
    uPaletteMask: { value: initialColorSnapshot.palette.mask },
    uPaletteTokens: { value: paletteTokens },
    uPaletteSourceLut: { value: sourceLutUniforms },
    uPaletteProgress: { value: initialColorSnapshot.paletteProgress },
    uReducedMotion: { value: props.material.reducedMotion ? 1 : 0 },
    uColorEnabled: { value: props.material.colorEnabled ? 1 : 0 },
    uColorLayer: { value: props.material.colorLayer === "neutral" ? 0 : props.material.colorLayer === "undertone" ? 1 : 2 },
    uFieldDiagnostic: { value: props.material.diagnostic === "material" ? 0 : props.material.diagnostic === "coordinate" ? 1 : props.material.diagnostic === "coverage" ? 2 : 3 },
    uActorMask: { value: props.actorMask ? 1 : 0 },
  });
  const material = useMemo(() => new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader,
    // Uniform objects are intentionally mutable GPU state, not React state.
    // eslint-disable-next-line react-hooks/refs
    uniforms: uniformsRef.current,
    toneMapped: false,
  }), []);
  const geometry = useMemo(() => {
    const value = new THREE.OctahedronGeometry(0.035, 0);
    value.setAttribute("aSurfaceNormal", value.getAttribute("normal"));
    return value;
  }, []);

  useEffect(() => {
    progressRef.current = props.reducedMotion ? 1 : props.progress;
  }, [props.progress, props.reducedMotion]);

  useEffect(() => {
    uniformsRef.current.uBudget.value = props.budget;
    uniformsRef.current.uSelected.value = props.selectedId;
    uniformsRef.current.uEvaluator.value = props.evaluator === "m4" ? 1 : 0;
    const debugModes: DebugMode[] = ["neutral", "phase", "groups", "shells", "bridge", "reserve", "residual", "orientation", "identity", "components", "features", "trajectories", "collision"];
    uniformsRef.current.uDebug.value = debugModes.indexOf(props.debugMode);
  }, [props.budget, props.debugMode, props.evaluator, props.selectedId]);

  useEffect(() => {
    uniformsRef.current.uThemeMix.value = props.material.themeMix;
    uniformsRef.current.uStableVariation.value = props.material.stableVariation ? 1 : 0;
    uniformsRef.current.uReducedMotion.value = props.material.reducedMotion ? 1 : 0;
    uniformsRef.current.uColorEnabled.value = props.material.colorEnabled ? 1 : 0;
    uniformsRef.current.uColorLayer.value = props.material.colorLayer === "neutral" ? 0 : props.material.colorLayer === "undertone" ? 1 : 2;
    uniformsRef.current.uFieldDiagnostic.value = props.material.diagnostic === "material" ? 0 : props.material.diagnostic === "coordinate" ? 1 : props.material.diagnostic === "coverage" ? 2 : 3;
    uniformsRef.current.uActorMask.value = props.actorMask ? 1 : 0;
  }, [props.actorMask, props.material]);

  useEffect(() => {
    if (props.actorMask) gl.setClearColor(0x140028, 1);
    else gl.setClearColor(0x000000, 0);
  }, [gl, props.actorMask]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    Object.values(stateTextures).forEach((texture) => texture.dispose());
    Object.values(compiledTextures).forEach((texture) => texture.dispose());
  }, [compiledTextures, geometry, material, stateTextures]);

  const lastActorDraw = useRef({ calls: 0, triangles: 0 });
  const restoreRef = useRef({
    viewport: new THREE.Vector4(),
    scissor: new THREE.Vector4(),
    scissorTest: false,
  });
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const sessionSnap = props.session?.snapshot();
    progressRef.current = props.reducedMotion ? 1 : (sessionSnap?.geometryProgress ?? props.progress);
    uniformsRef.current.uProgress.value = progressRef.current;
    const overlay = sessionSnap?.overlay ?? props.overlay ?? IDENTITY_OVERLAY;
    uniformsRef.current.uIdleEnabled.value = overlay.enabled ? 1 : 0;
    uniformsRef.current.uIdleScale.value = overlay.enabled ? overlay.scale : 1;
    uniformsRef.current.uIdleAnchor.value.set(...overlay.anchor);
    uniformsRef.current.uIdleQuat.value.set(...overlay.quaternion);
    const color = sessionSnap?.palette ?? props.material.colorController.snapshot();
    uniformsRef.current.uGlobalColorPhase.value = color.phase;
    uniformsRef.current.uPaletteMask.value = color.palette.mask;
    uniformsRef.current.uPaletteProgress.value = color.paletteProgress;
    uniformsRef.current.uReducedMotion.value = color.reducedMotion ? 1 : 0;
    if (lastSourceLut.current !== color.sourceLut) {
      color.sourceLut.forEach((sample, index) => {
        sourceLutUniforms[index].set(sample.color[0], sample.color[1], sample.color[2], sample.presence);
      });
      lastSourceLut.current = color.sourceLut;
    }

    const actorCalls = gl.info.render.calls;
    const actorTriangles = gl.info.render.triangles;
    const newFrame = actorCalls > 0;
    if (newFrame) {
      lastActorDraw.current = { calls: actorCalls, triangles: actorTriangles };
    }

    frameStats.current.elapsed += delta;
    frameStats.current.frames += 1;
    frameStats.current.samples.push(delta * 1000);
    if (frameStats.current.samples.length > 180) frameStats.current.samples.shift();
    const publish = !readyRef.current || frameStats.current.elapsed >= 0.75;
    if (publish) {
      const samples = [...frameStats.current.samples].sort((a, b) => a - b);
      const quantile = (p: number) => samples[Math.min(samples.length - 1, Math.floor(samples.length * p))] ?? 0;
      const elapsed = Math.max(frameStats.current.elapsed, delta);
      const canvas = gl.domElement;
      props.onStats({
        fps: Math.round(frameStats.current.frames / elapsed),
        medianMs: Number(quantile(0.5).toFixed(2)),
        p95Ms: Number(quantile(0.95).toFixed(2)),
        drawCalls: actorCalls,
        triangles: actorTriangles,
        textureMiB: Number((textureCount * STATE_TEXTURE_SIZE * STATE_TEXTURE_SIZE * 16 / 1048576).toFixed(2)),
        programs: gl.info.programs?.length ?? 0,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        dpr: gl.getPixelRatio(),
        drawingBuffer: [canvas.width, canvas.height],
        lastActorDrawCalls: lastActorDraw.current.calls,
        lastActorTriangles: lastActorDraw.current.triangles,
        newFrame,
      });
      if (lastActorDraw.current.calls > 0) window.__PS04M4_SCENE_READY__ = true;
      readyRef.current = true;
      if (frameStats.current.elapsed >= 0.75) {
        frameStats.current.elapsed = 0;
        frameStats.current.frames = 0;
      }
    }
    gl.info.reset();
  });

  const applySiteComposition = () => {
    const cssW = gl.domElement.clientWidth || 1;
    const cssH = gl.domElement.clientHeight || 1;
    gl.getViewport(restoreRef.current.viewport);
    gl.getScissor(restoreRef.current.scissor);
    restoreRef.current.scissorTest = gl.getScissorTest();
    const liveCamera = get().camera;
    if (liveCamera instanceof THREE.PerspectiveCamera && Math.abs(liveCamera.aspect - 1) > 1e-6) {
      liveCamera.aspect = 1;
      liveCamera.updateProjectionMatrix();
    }
    const requested = props.compositionRef?.current;
    const viewport: CompositionViewport = requested ?? {
      ...IDENTITY_COMPOSITION,
      width: cssW,
      height: cssH,
      canvasCssWidth: cssW,
      canvasCssHeight: cssH,
    };
    if (meshRef.current) {
      meshRef.current.visible = viewport.actorDraw && viewport.visible;
      meshRef.current.scale.setScalar(viewport.identity ? 1 : viewport.siteFitScale);
    }
    uniformsRef.current.uSiteClipScale.value.set(
      viewport.siteClipScale?.[0] ?? 1,
      viewport.siteClipScale?.[1] ?? 1,
    );
    uniformsRef.current.uSiteClipOffset.value.set(
      viewport.siteClipOffset?.[0] ?? 0,
      viewport.siteClipOffset?.[1] ?? 0,
    );
    uniformsRef.current.uSiteCompositionEnabled.value = viewport.identity || !viewport.actorDraw
      ? 0
      : viewport.siteCompositionEnabled;
    applyCompositionViewport(gl, viewport);
  };

  const restoreSiteComposition = () => {
    const previous = restoreRef.current;
    if (previous.viewport.z > 0 && previous.viewport.w > 0) {
      gl.setViewport(previous.viewport.x, previous.viewport.y, previous.viewport.z, previous.viewport.w);
      gl.setScissor(previous.scissor.x, previous.scissor.y, previous.scissor.z, previous.scissor.w);
      gl.setScissorTest(previous.scissorTest);
      return;
    }
    restoreFullCanvasViewport(gl, gl.domElement.clientWidth || 1, gl.domElement.clientHeight || 1);
  };

  useEffect(() => {
    window.__PS04M4_MEASURE_ACTOR__ = () => measureActorMask(gl, props.actorMask === true);
    return () => {
      if (window.__PS04M4_MEASURE_ACTOR__) delete window.__PS04M4_MEASURE_ACTOR__;
    };
  }, [gl, props.actorMask]);

  return (
    <>
      <CameraRig
        preset={props.cameraPreset}
        contract={props.presentationContract}
        diagnosticId={props.diagnosticId ?? "main"}
      />
      <TrackOverlay program={props.program} mode={props.debugMode} frame={currentFrame} />
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, props.source.recordCount]}
        frustumCulled={false}
        onBeforeRender={applySiteComposition}
        onAfterRender={restoreSiteComposition}
      />
    </>
  );
}

function measureActorMask(gl: THREE.WebGLRenderer, actorMask: boolean): ActorMaskMeasure | null {
  const context = gl.getContext();
  const dpr = gl.getPixelRatio() || 1;
  const canvas = gl.domElement;
  const drawingW = canvas.width;
  const drawingH = canvas.height;
  const cssW = canvas.clientWidth || 1;
  const cssH = canvas.clientHeight || 1;
  if (drawingW < 2 || drawingH < 2) {
    return {
      actorMaskBBoxCss: null,
      actorVisibleFraction: 0,
      drawingBufferSize: [drawingW, drawingH],
      rendererDpr: dpr,
      canvasCssSize: [cssW, cssH],
    };
  }
  const pixels = new Uint8Array(drawingW * drawingH * 4);
  context.readPixels(0, 0, drawingW, drawingH, context.RGBA, context.UNSIGNED_BYTE, pixels);
  let minX = drawingW;
  let minY = drawingH;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < drawingH; y += 1) {
    for (let x = 0; x < drawingW; x += 1) {
      const offset = (y * drawingW + x) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const a = pixels[offset + 3];
      const hit = actorMask
        ? r > 180 && g > 180 && b < 40 && a > 8
        : a > 12;
      if (!hit) continue;
      count += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const bbox = cssFromDeviceBBox({ minX, minY, maxX, maxY, count }, drawingH, dpr);
  return {
    actorMaskBBoxCss: bbox,
    actorVisibleFraction: visibleFractionFor(bbox, cssW, cssH),
    drawingBufferSize: [drawingW, drawingH],
    rendererDpr: dpr,
    canvasCssSize: [cssW, cssH],
  };
}

export function PS04M4Scene(props: SceneProps) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = (width: number, height: number) => setCanvasSize({ width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) });
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) update(box.width, box.height);
    });
    observer.observe(node);
    update(node.clientWidth, node.clientHeight);
    return () => observer.disconnect();
  }, []);
  // QA hook is intentionally assigned during the client render rather than
  // from inside the R3F tree: Fast Refresh can remount Canvas effects after a
  // context error and otherwise make the actual GPU probe unreachable.
  if (typeof window !== "undefined") {
    // eslint-disable-next-line react-hooks/immutability -- explicit QA-only browser hook
    window.__PS04M4_GPU_PARITY_STATE__ = {
      evaluator: props.evaluator,
      compiled: Boolean(props.program.compiled),
      programId: props.program.programId,
    };
    // eslint-disable-next-line react-hooks/immutability -- explicit QA-only browser hook
    window.__PS04M4_GPU_PARITY__ = props.evaluator === "m4" && props.program.compiled
      ? () => runPS04M4GpuGoldenParity(props.source, props.target, props.program)
      : undefined;
    // eslint-disable-next-line react-hooks/immutability -- explicit QA-only browser hook
    window.__PS04M4_FIELD_GPU_PARITY__ = runPS04M4FieldGpuParity;
  }
  const qaSuffix = props.diagnosticId ?? "main";
  const gpuParityButtonId = `ps04m4-gpu-parity-run-${qaSuffix}`;
  const contextRestoreButtonId = `ps04m4-context-restore-run-${qaSuffix}`;
  return (
    <div
      ref={containerRef}
      data-canvas-width={canvasSize.width}
      data-canvas-height={canvasSize.height}
      style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden", position: "relative" }}
    >
      {props.evaluator === "m4" && props.program.compiled ? (
        <button
          id={gpuParityButtonId}
          type="button"
          aria-label="Run GPU parity probe"
          style={{ position: "fixed", left: 0, top: 0, width: 8, height: 8, opacity: 0.01, zIndex: 9999 }}
          onClick={(event) => {
            const button = event.currentTarget;
            button.dataset.status = "running";
            delete button.dataset.result;
            delete button.dataset.error;
            const parityPromise = runPS04M4GpuGoldenParity(props.source, props.target, props.program);
            window.__PS04M4_GPU_PARITY_PROMISE__ = parityPromise;
            void parityPromise.then((result) => {
              window.__PS04M4_GPU_PARITY_RESULT__ = result;
              const currentButton = document.getElementById(gpuParityButtonId);
              if (!(currentButton instanceof HTMLButtonElement)) return;
              currentButton.dataset.result = JSON.stringify(result);
              currentButton.dataset.status = "done";
            }).catch((reason: unknown) => {
              const currentButton = document.getElementById(gpuParityButtonId);
              if (!(currentButton instanceof HTMLButtonElement)) return;
              currentButton.dataset.error = reason instanceof Error ? reason.message : String(reason);
              currentButton.dataset.status = "error";
            });
          }}
        />
      ) : null}
      {props.evaluator === "m4" ? (
        <button
          id={contextRestoreButtonId}
          type="button"
          aria-label="Run WebGL context restore probe"
          style={{ position: "fixed", left: 8, top: 0, width: 8, height: 8, opacity: 0.01, zIndex: 9999 }}
          onClick={(event) => {
            const button = event.currentTarget;
            const renderer = rendererRef.current;
            const extension = renderer?.getContext().getExtension("WEBGL_lose_context");
            if (!renderer || !extension) {
              button.dataset.status = "unsupported";
              return;
            }
            button.dataset.status = "losing";
            extension.loseContext();
            window.setTimeout(() => extension.restoreContext(), 80);
          }}
        />
      ) : null}
      <Canvas
      key={`${props.profile}:${props.dpr}`}
      style={{ width: canvasSize.width, height: canvasSize.height, pointerEvents: "none" }}
      camera={{ fov: props.presentationContract.fovDegrees, near: 0.01, far: 100, manual: true }}
      dpr={props.dpr}
      frameloop={props.sessionShouldAnimate || props.geometryPlayback ? "always" : "demand"}
      gl={{ antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        rendererRef.current = gl;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.NoToneMapping;
        gl.toneMappingExposure = 1;
        gl.shadowMap.enabled = false;
        gl.info.autoReset = false;
        gl.setClearColor(0x000000, 0);
        props.onContextState?.("ready");
        const canvas = gl.domElement;
        const context = gl.getContext();
        const rendererInfo = context.getExtension("WEBGL_debug_renderer_info");
        const environment: SceneEnvironment = {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          hardwareConcurrency: navigator.hardwareConcurrency,
          deviceMemoryGiB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
          devicePixelRatio: window.devicePixelRatio,
          webgl2: context instanceof WebGL2RenderingContext,
          gpuVendor: rendererInfo ? context.getParameter(rendererInfo.UNMASKED_VENDOR_WEBGL) : "not measured",
          gpuRenderer: rendererInfo ? context.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : "not measured",
          maxVertexTextureUnits: context.getParameter(context.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
          maxCombinedTextureUnits: context.getParameter(context.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
          outputColorSpace: gl.outputColorSpace,
          toneMapping: "shader-owned ACES / renderer NoToneMapping",
          antialias: Boolean(context.getContextAttributes()?.antialias),
          alpha: true,
        };
        canvas.dataset.ps04M4Environment = JSON.stringify(environment);
        props.onEnvironment?.(environment);
        canvas.addEventListener("webglcontextlost", (event) => {
          if (!canvas.isConnected) return;
          event.preventDefault();
          const button = document.getElementById(contextRestoreButtonId);
          if (button instanceof HTMLButtonElement) button.dataset.status = "lost";
          props.onContextState?.("lost");
        });
        canvas.addEventListener("webglcontextrestored", () => {
          if (!canvas.isConnected) return;
          const button = document.getElementById(contextRestoreButtonId);
          if (button instanceof HTMLButtonElement) button.dataset.status = "restored";
          props.onContextState?.("restored");
        });
      }}
    >
      <DemandRenderInvalidator signature={`${canvasSize.width}:${canvasSize.height}:${props.source.entry.contentHash}:${props.target.entry.contentHash}:${props.program.programId}:${props.progress}:${props.overlay?.enabled ? 1 : 0}:${props.overlay?.scale ?? 1}:${props.overlay?.quaternion?.join(",") ?? ""}:${props.material.theme}:${props.material.themeMix}:${props.material.colorEnabled}:${props.material.colorLayer}:${props.material.diagnostic}:${props.material.colorController.snapshot().phase}:${props.material.colorController.snapshot().palette.mask}:${props.material.colorController.snapshot().paletteProgress}:${props.actorMask ? 1 : 0}`} />
      <M41Content
        key={`${props.source.entry.contentHash}:${props.target.entry.contentHash}:${props.program.programId}:${props.evaluator}:${props.profile}`}
        {...props}
      />
      </Canvas>
    </div>
  );
}
