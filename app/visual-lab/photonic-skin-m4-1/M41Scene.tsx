"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { CameraPreset, DebugMode, DecodedState, M3Manifest } from "./m41-data";
import type { TransitionProgram } from "./m41-evaluator";

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
}

declare global {
  interface Window {
    __PS03M41_GPU_PARITY__?: () => Promise<GpuParityMetrics>;
    __PS03M41_GPU_PARITY_PROMISE__?: Promise<GpuParityMetrics>;
    __PS03M41_GPU_PARITY_RESULT__?: GpuParityMetrics;
    __PS03M41_GPU_PARITY_STATE__?: { evaluator: EvaluatorMode; compiled: boolean; programId: string };
  }
}

export interface SceneStats {
  fps: number;
  medianMs: number;
  p95Ms: number;
  drawCalls: number;
  triangles: number;
  textureMiB: number;
}

export type EvaluatorMode = "m4" | "m3";

interface SceneProps {
  source: DecodedState;
  target: DecodedState;
  program: TransitionProgram;
  budget: number;
  progress: number;
  reducedMotion: boolean;
  debugMode: DebugMode;
  cameraPreset: CameraPreset;
  presentationContract: M3Manifest["presentationContract"];
  selectedId: number;
  evaluator: EvaluatorMode;
  onStats: (value: SceneStats) => void;
  onContextState?: (state: "ready" | "lost" | "restored") => void;
}

const STATE_TEXTURE_SIZE = 128;
const TRACK_TEXTURE_WIDTH = 256;

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

function stateTexture(state: DecodedState, kind: StateTextureKind) {
  const data = new Float32Array(STATE_TEXTURE_SIZE * STATE_TEXTURE_SIZE * 4);
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
      data[out + 3] = state.flags[id];
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
out vec3 vColor;
out float vShade;
out vec3 vEvalPosition;
out vec4 vEvalOrientation;
out vec3 vEvalNormal;
out vec4 vEvalChannels;
out vec3 vEvalActorPosition;
out vec4 vEvalActorOrientation;

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

  float sourceActive = 1.0 - step(0.5, ma.z);
  float targetActive = 1.0 - step(0.5, mb.z);
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
  gl_Position = projectionMatrix * modelViewMatrix * vec4(center + local, 1.0);

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
  if (uDebug == 10) vColor = mix(vec3(0.22, 0.3, 0.34), vec3(1.0, 0.36, 0.18), clamp(max(ma.w, mb.w) / 3.0, 0.0, 1.0));
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

const fragmentShader = `
precision highp float;
in vec3 vColor;
in float vShade;
in vec3 vEvalPosition;
in vec4 vEvalOrientation;
in vec3 vEvalNormal;
in vec4 vEvalChannels;
in vec3 vEvalActorPosition;
in vec4 vEvalActorOrientation;
out vec4 outColor;
void main() { outColor = vec4(vColor * vShade, 1.0); }
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

/** Actual transform-feedback readback of the same vertex evaluator used by the Lab. */
export async function runM41GpuGoldenParity(
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
  };
}

function CameraRig({ preset, contract }: { preset: CameraPreset; contract: M3Manifest["presentationContract"] }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(...contract.cameras[preset]);
    // Three/Fiber exposes its active camera as an imperative scene object.
    // eslint-disable-next-line react-hooks/immutability
    if (camera instanceof THREE.PerspectiveCamera) camera.fov = contract.fovDegrees;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, contract, preset]);
  return null;
}

function TrackOverlay({ program, mode }: { program: TransitionProgram; mode: DebugMode }) {
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
    <>
      <lineSegments geometry={resources.lines} material={resources.lineMaterial} />
      <points geometry={resources.points} material={resources.pointMaterial} />
    </>
  );
}

function M41Content(props: SceneProps) {
  const { gl } = useThree();
  const progressRef = useRef(props.progress);
  const frameStats = useRef({ elapsed: 0, frames: 0, samples: [] as number[] });
  const stateTextures = useMemo(() => ({
    source: stateTexture(props.source, "position"),
    target: stateTexture(props.target, "position"),
    sourceNormal: stateTexture(props.source, "normal"),
    targetNormal: stateTexture(props.target, "normal"),
    sourceQuat: stateTexture(props.source, "orientation"),
    targetQuat: stateTexture(props.target, "orientation"),
    sourceMeta: stateTexture(props.source, "meta"),
    targetMeta: stateTexture(props.target, "meta"),
  }), [props.source, props.target]);
  const compiledTextures = useMemo(
    () => programTextures(props.program, props.source, props.target),
    [props.program, props.source, props.target],
  );
  const textureCount = Object.keys(stateTextures).length + Object.keys(compiledTextures).length;
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
  });
  const material = useMemo(() => new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader,
    // Uniform objects are intentionally mutable GPU state, not React state.
    // eslint-disable-next-line react-hooks/refs
    uniforms: uniformsRef.current,
  }), []);
  const geometry = useMemo(() => new THREE.OctahedronGeometry(0.035, 0), []);

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

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    Object.values(stateTextures).forEach((texture) => texture.dispose());
    Object.values(compiledTextures).forEach((texture) => texture.dispose());
  }, [compiledTextures, geometry, material, stateTextures]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    progressRef.current = props.reducedMotion ? 1 : props.progress;
    // Static state/program/group textures remain untouched per frame.
    uniformsRef.current.uProgress.value = progressRef.current;

    frameStats.current.elapsed += delta;
    frameStats.current.frames += 1;
    frameStats.current.samples.push(delta * 1000);
    if (frameStats.current.samples.length > 180) frameStats.current.samples.shift();
    if (frameStats.current.elapsed >= 0.75) {
      const samples = [...frameStats.current.samples].sort((a, b) => a - b);
      const quantile = (p: number) => samples[Math.min(samples.length - 1, Math.floor(samples.length * p))] ?? 0;
      props.onStats({
        fps: Math.round(frameStats.current.frames / frameStats.current.elapsed),
        medianMs: Number(quantile(0.5).toFixed(2)),
        p95Ms: Number(quantile(0.95).toFixed(2)),
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        textureMiB: Number((textureCount * STATE_TEXTURE_SIZE * STATE_TEXTURE_SIZE * 16 / 1048576).toFixed(2)),
      });
      frameStats.current.elapsed = 0;
      frameStats.current.frames = 0;
    }
  });

  return (
    <>
      <CameraRig preset={props.cameraPreset} contract={props.presentationContract} />
      <TrackOverlay program={props.program} mode={props.debugMode} />
      <instancedMesh args={[geometry, material, props.source.recordCount]} frustumCulled={false} />
    </>
  );
}

export function M41Scene(props: SceneProps) {
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
    window.__PS03M41_GPU_PARITY_STATE__ = {
      evaluator: props.evaluator,
      compiled: Boolean(props.program.compiled),
      programId: props.program.programId,
    };
    // eslint-disable-next-line react-hooks/immutability -- explicit QA-only browser hook
    window.__PS03M41_GPU_PARITY__ = props.evaluator === "m4" && props.program.compiled
      ? () => runM41GpuGoldenParity(props.source, props.target, props.program)
      : undefined;
  }
  return (
    <div
      ref={containerRef}
      data-canvas-width={canvasSize.width}
      data-canvas-height={canvasSize.height}
      style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden", position: "relative" }}
    >
      {props.evaluator === "m4" && props.program.compiled ? (
        <button
          id="ps03m41-gpu-parity-run"
          type="button"
          aria-label="Run GPU parity probe"
          style={{ position: "fixed", left: 0, top: 0, width: 8, height: 8, opacity: 0.01, zIndex: 9999 }}
          onClick={(event) => {
            const button = event.currentTarget;
            button.dataset.status = "running";
            delete button.dataset.result;
            delete button.dataset.error;
            const parityPromise = runM41GpuGoldenParity(props.source, props.target, props.program);
            window.__PS03M41_GPU_PARITY_PROMISE__ = parityPromise;
            void parityPromise.then((result) => {
              window.__PS03M41_GPU_PARITY_RESULT__ = result;
              const currentButton = document.getElementById("ps03m41-gpu-parity-run");
              if (!(currentButton instanceof HTMLButtonElement)) return;
              currentButton.dataset.result = JSON.stringify(result);
              currentButton.dataset.status = "done";
            }).catch((reason: unknown) => {
              const currentButton = document.getElementById("ps03m41-gpu-parity-run");
              if (!(currentButton instanceof HTMLButtonElement)) return;
              currentButton.dataset.error = reason instanceof Error ? reason.message : String(reason);
              currentButton.dataset.status = "error";
            });
          }}
        />
      ) : null}
      {props.evaluator === "m4" ? (
        <button
          id="ps03m41-context-restore-run"
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
      style={{ width: canvasSize.width, height: canvasSize.height }}
      camera={{ fov: props.presentationContract.fovDegrees, near: 0.1, far: 50 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        rendererRef.current = gl;
        props.onContextState?.("ready");
        const canvas = gl.domElement;
        const context = gl.getContext();
        const rendererInfo = context.getExtension("WEBGL_debug_renderer_info");
        canvas.dataset.ps03m41Environment = JSON.stringify({
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
        });
        canvas.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          const button = document.getElementById("ps03m41-context-restore-run");
          if (button instanceof HTMLButtonElement) button.dataset.status = "lost";
          props.onContextState?.("lost");
        });
        canvas.addEventListener("webglcontextrestored", () => {
          const button = document.getElementById("ps03m41-context-restore-run");
          if (button instanceof HTMLButtonElement) button.dataset.status = "restored";
          props.onContextState?.("restored");
        });
      }}
    >
      <color attach="background" args={["#090b0c"]} />
      <M41Content
        key={`${props.source.entry.contentHash}:${props.target.entry.contentHash}:${props.program.programId}:${props.evaluator}`}
        {...props}
      />
      </Canvas>
    </div>
  );
}
