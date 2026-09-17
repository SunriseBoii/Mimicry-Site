/**
 * CPU packing for the 16 Mimic DataTextures. Evaluator math is not here;
 * these buffers only transport already-compiled endpoints and tracks.
 */

import * as THREE from "three";
import type { DecodedState, LabFrame } from "../photonic-skin-m4-1/m41-data";
import type { TransitionProgram } from "../photonic-skin-m4-1/m41-evaluator";
import { visibleComponents } from "../photonic-skin-m4-1r/photonic-presentation";

export const STATE_TEXTURE_SIZE = 128;
export const TRACK_TEXTURE_WIDTH = 256;
export const TRACK_TEXTURE_HEIGHT = 4;
export const STATE_TEXEL_BYTES = 16;
export const PAIR_TEXTURE_COUNT = 16;

export const TEXTURE_SLOT_NAMES = [
  "source",
  "target",
  "sourceNormal",
  "targetNormal",
  "sourceQuat",
  "targetQuat",
  "sourceMeta",
  "targetMeta",
  "residual",
  "lanes",
  "velocity",
  "activation",
  "sourceTracks",
  "targetTracks",
  "routes",
  "windows",
] as const;

export type TextureSlotName = (typeof TEXTURE_SLOT_NAMES)[number];
export type StateTextureKind = "position" | "normal" | "orientation" | "meta";

export interface StateTextureSet {
  source: THREE.DataTexture;
  target: THREE.DataTexture;
  sourceNormal: THREE.DataTexture;
  targetNormal: THREE.DataTexture;
  sourceQuat: THREE.DataTexture;
  targetQuat: THREE.DataTexture;
  sourceMeta: THREE.DataTexture;
  targetMeta: THREE.DataTexture;
}

export interface CompiledTextureSet {
  residual: THREE.DataTexture;
  lanes: THREE.DataTexture;
  velocity: THREE.DataTexture;
  activation: THREE.DataTexture;
  sourceTracks: THREE.DataTexture;
  targetTracks: THREE.DataTexture;
  routes: THREE.DataTexture;
  windows: THREE.DataTexture;
}

export interface PairTextureSet extends StateTextureSet, CompiledTextureSet {}

export interface TextureSlotSpec {
  name: TextureSlotName;
  purpose: string;
  width: number;
  height: number;
  format: "RGBA";
  type: "Float";
  byteSize: number;
  sampler: string;
  updateFrequency: "per-pair" | "per-endpoint";
}

export const TEXTURE_SLOT_SPECS: readonly TextureSlotSpec[] = TEXTURE_SLOT_NAMES.map((name) => {
  const track = name === "sourceTracks" || name === "targetTracks" || name === "routes" || name === "windows";
  const width = track ? TRACK_TEXTURE_WIDTH : STATE_TEXTURE_SIZE;
  const height = track ? TRACK_TEXTURE_HEIGHT : STATE_TEXTURE_SIZE;
  const sampler = {
    source: "uSource",
    target: "uTarget",
    sourceNormal: "uSourceNormal",
    targetNormal: "uTargetNormal",
    sourceQuat: "uSourceQuat",
    targetQuat: "uTargetQuat",
    sourceMeta: "uSourceMeta",
    targetMeta: "uTargetMeta",
    residual: "uResidual",
    lanes: "uLanes",
    velocity: "uVelocity",
    activation: "uActivation",
    sourceTracks: "uSourceTracks",
    targetTracks: "uTargetTracks",
    routes: "uTrackRoutes",
    windows: "uTrackWindows",
  }[name];
  return {
    name,
    purpose: name,
    width,
    height,
    format: "RGBA",
    type: "Float",
    byteSize: width * height * STATE_TEXEL_BYTES,
    sampler,
    updateFrequency: (name.startsWith("source") && !name.includes("Tracks")) || (name.startsWith("target") && !name.includes("Tracks"))
      ? "per-endpoint"
      : "per-pair",
  };
});

export const PAIR_CPU_BYTES = TEXTURE_SLOT_SPECS.reduce((sum, spec) => sum + spec.byteSize, 0);

export function stateTexelCount() {
  return STATE_TEXTURE_SIZE * STATE_TEXTURE_SIZE * 4;
}

export function trackTexelCount() {
  return TRACK_TEXTURE_WIDTH * TRACK_TEXTURE_HEIGHT * 4;
}

export function dataTexture(data: Float32Array, width: number, height: number) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.unpackAlignment = 1;
  return texture;
}

export function markTextureDataChanged(texture: THREE.DataTexture) {
  texture.needsUpdate = true;
}

export function floatBufferStats(data: Float32Array) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let nanCount = 0;
  let infCount = 0;
  let checksum = 2166136261;
  const step = Math.max(1, Math.floor(data.length / 4096));
  for (let index = 0; index < data.length; index += 1) {
    const value = data[index]!;
    if (Number.isNaN(value)) nanCount += 1;
    else if (!Number.isFinite(value)) infCount += 1;
    else {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (index % step === 0) {
      checksum ^= Math.imul(Math.round(value * 1024) | 0, index + 1);
      checksum = Math.imul(checksum, 16777619);
    }
  }
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;
  return {
    byteLength: data.byteLength,
    checksum: (checksum >>> 0).toString(16),
    min,
    max,
    nanCount,
    infCount,
    nonzero: max > 0 || min < 0,
  };
}

export function packStateInto(
  data: Float32Array,
  state: DecodedState,
  kind: StateTextureKind,
  profile?: LabFrame,
) {
  data.fill(0);
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
      data[out + 3] = ((id * 0.61803398875) % 1) * 0.08;
    } else if (kind === "orientation") {
      data[out] = state.orientation[q];
      data[out + 1] = state.orientation[q + 1];
      data[out + 2] = state.orientation[q + 2];
      data[out + 3] = state.orientation[q + 3];
    } else {
      data[out] = state.component[id];
      data[out + 1] = state.shell[id];
      data[out + 2] = state.status[id];
      data[out + 3] = state.flags[id] + ((shown?.has(state.component[id]) ?? true) ? 256 : 0);
    }
  }
  return data;
}

export function packM3RouteInto(data: Float32Array, source: DecodedState, target: DecodedState) {
  data.fill(0);
  const axis = new THREE.Vector3(1, 0, 0);
  const delta = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  const averageNormal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let id = 0; id < source.recordCount; id += 1) {
    const p = id * 3;
    const out = id * 4;
    delta.set(
      target.position[p] - source.position[p],
      target.position[p + 1] - source.position[p + 1],
      target.position[p + 2] - source.position[p + 2],
    );
    averageNormal
      .set(
        source.normal[p] + target.normal[p],
        source.normal[p + 1] + target.normal[p + 1],
        source.normal[p + 2] + target.normal[p + 2],
      )
      .normalize();
    lateral.crossVectors(delta, axis);
    if (lateral.lengthSq() < 1e-10) lateral.crossVectors(averageNormal, up);
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

export function packProgramInto(
  buffers: {
    residual: Float32Array;
    lanes: Float32Array;
    velocity: Float32Array;
    activation: Float32Array;
    sourceTracks: Float32Array;
    targetTracks: Float32Array;
    routes: Float32Array;
    windows: Float32Array;
    m3Route: Float32Array;
  },
  program: TransitionProgram,
  source: DecodedState,
  target: DecodedState,
) {
  packM3RouteInto(buffers.m3Route, source, target);
  buffers.residual.fill(0);
  buffers.lanes.fill(0);
  buffers.velocity.fill(0);
  buffers.activation.fill(0);
  buffers.sourceTracks.fill(0);
  buffers.targetTracks.fill(0);
  buffers.routes.fill(0);
  buffers.windows.fill(0);
  for (let id = 0; id < program.recordCount; id += 1) {
    const out = id * 4;
    const p = id * 3;
    buffers.residual[out] = program.residual[p];
    buffers.residual[out + 1] = program.residual[p + 1];
    buffers.residual[out + 2] = program.residual[p + 2];
    buffers.residual[out + 3] = program.phaseDelay[id];
    buffers.lanes[out] = program.trackIndex[id];
    buffers.lanes[out + 1] = program.compiled?.perId.flags[id] ?? program.bridgeWeight[id];
    buffers.lanes[out + 2] = program.compiled?.perId.depth[id] ?? 0;
    buffers.lanes[out + 3] = buffers.m3Route[out];
    buffers.velocity[out] = program.sourceVelocity?.[p] ?? 0;
    buffers.velocity[out + 1] = program.sourceVelocity?.[p + 1] ?? 0;
    buffers.velocity[out + 2] = program.sourceVelocity?.[p + 2] ?? 0;
    buffers.velocity[out + 3] = program.sourceScaleVelocity?.[id] ?? 0;
    buffers.activation[out] = program.compiled?.perId.activationStart[id] ?? 0.18 + program.phaseDelay[id];
    buffers.activation[out + 1] = program.compiled?.perId.activationEnd[id] ?? 0.72 + program.phaseDelay[id];
    buffers.activation[out + 2] = buffers.m3Route[out + 1];
    buffers.activation[out + 3] = buffers.m3Route[out + 2];
  }
  const maxTracks = TRACK_TEXTURE_WIDTH * TRACK_TEXTURE_HEIGHT;
  program.tracks.forEach((track, id) => {
    if (id >= maxTracks) return;
    const out = id * 4;
    const exact = program.compiled?.groupTracks[id];
    buffers.sourceTracks[out] = track.sourceCenter[0];
    buffers.sourceTracks[out + 1] = track.sourceCenter[1];
    buffers.sourceTracks[out + 2] = track.sourceCenter[2];
    buffers.sourceTracks[out + 3] = exact?.direction[0] ?? 1;
    buffers.targetTracks[out] = track.targetCenter[0];
    buffers.targetTracks[out + 1] = track.targetCenter[1];
    buffers.targetTracks[out + 2] = track.targetCenter[2];
    buffers.targetTracks[out + 3] = exact?.releaseEnd ?? 0.38;
    buffers.routes[out] = track.route[0];
    buffers.routes[out + 1] = track.route[1];
    buffers.routes[out + 2] = track.route[2];
    buffers.routes[out + 3] = exact?.revealEnd ?? 0.82;
    buffers.windows[out] = exact?.bridgeStart ?? 0.3;
    buffers.windows[out + 1] = exact?.bridgeEnd ?? 0.72;
    buffers.windows[out + 2] = exact?.direction[1] ?? 0;
    buffers.windows[out + 3] = exact?.direction[2] ?? 0;
  });
}

export function stateTexture(state: DecodedState, kind: StateTextureKind, profile?: LabFrame) {
  return dataTexture(packStateInto(new Float32Array(stateTexelCount()), state, kind, profile), STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE);
}

export function programTextures(program: TransitionProgram, source: DecodedState, target: DecodedState): CompiledTextureSet {
  const residual = new Float32Array(stateTexelCount());
  const lanes = new Float32Array(stateTexelCount());
  const velocity = new Float32Array(stateTexelCount());
  const activation = new Float32Array(stateTexelCount());
  const sourceTracks = new Float32Array(trackTexelCount());
  const targetTracks = new Float32Array(trackTexelCount());
  const routes = new Float32Array(trackTexelCount());
  const windows = new Float32Array(trackTexelCount());
  const m3Route = new Float32Array(stateTexelCount());
  packProgramInto({
    residual, lanes, velocity, activation, sourceTracks, targetTracks, routes, windows, m3Route,
  }, program, source, target);
  return {
    residual: dataTexture(residual, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
    lanes: dataTexture(lanes, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
    velocity: dataTexture(velocity, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
    activation: dataTexture(activation, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
    sourceTracks: dataTexture(sourceTracks, TRACK_TEXTURE_WIDTH, TRACK_TEXTURE_HEIGHT),
    targetTracks: dataTexture(targetTracks, TRACK_TEXTURE_WIDTH, TRACK_TEXTURE_HEIGHT),
    routes: dataTexture(routes, TRACK_TEXTURE_WIDTH, TRACK_TEXTURE_HEIGHT),
    windows: dataTexture(windows, TRACK_TEXTURE_WIDTH, TRACK_TEXTURE_HEIGHT),
  };
}

export function createStateTextureSet(source: DecodedState, target: DecodedState, profile?: LabFrame): StateTextureSet {
  return {
    source: stateTexture(source, "position"),
    target: stateTexture(target, "position"),
    sourceNormal: stateTexture(source, "normal"),
    targetNormal: stateTexture(target, "normal"),
    sourceQuat: stateTexture(source, "orientation"),
    targetQuat: stateTexture(target, "orientation"),
    sourceMeta: stateTexture(source, "meta", profile),
    targetMeta: stateTexture(target, "meta", profile),
  };
}

export function disposeTextureSet(textures: Partial<Record<string, THREE.Texture | null | undefined>>) {
  for (const texture of Object.values(textures)) texture?.dispose();
}

export function slotKind(name: TextureSlotName): StateTextureKind | "program" {
  if (name === "source" || name === "target") return "position";
  if (name === "sourceNormal" || name === "targetNormal") return "normal";
  if (name === "sourceQuat" || name === "targetQuat") return "orientation";
  if (name === "sourceMeta" || name === "targetMeta") return "meta";
  return "program";
}

export function slotIsSource(name: TextureSlotName) {
  return name.startsWith("source") && !name.includes("Tracks");
}

export function typedArrayBytes(value: ArrayBufferView | null | undefined) {
  return value?.byteLength ?? 0;
}

export function decodedStateBytes(state: {
  position?: ArrayBufferView;
  normal?: ArrayBufferView;
  orientation?: ArrayBufferView;
  scale?: ArrayBufferView;
  reserveDepth?: ArrayBufferView;
  component?: ArrayBufferView;
  shell?: ArrayBufferView;
  status?: ArrayBufferView;
  flags?: ArrayBufferView;
  transitionGroup?: ArrayBufferView;
  velocity?: ArrayBufferView;
  rawRecords?: ArrayBufferView;
  contactSurface?: { corners: ArrayBufferView; cornerCounts: ArrayBufferView; triangles: ArrayBufferView };
}) {
  return typedArrayBytes(state.position)
    + typedArrayBytes(state.normal)
    + typedArrayBytes(state.orientation)
    + typedArrayBytes(state.scale)
    + typedArrayBytes(state.reserveDepth)
    + typedArrayBytes(state.component)
    + typedArrayBytes(state.shell)
    + typedArrayBytes(state.status)
    + typedArrayBytes(state.flags)
    + typedArrayBytes(state.transitionGroup)
    + typedArrayBytes(state.velocity)
    + typedArrayBytes(state.rawRecords)
    + typedArrayBytes(state.contactSurface?.corners)
    + typedArrayBytes(state.contactSurface?.cornerCounts)
    + typedArrayBytes(state.contactSurface?.triangles);
}

export function programCpuBytes(program: TransitionProgram) {
  let bytes = typedArrayBytes(program.trackIndex)
    + typedArrayBytes(program.residual)
    + typedArrayBytes(program.phaseDelay)
    + typedArrayBytes(program.bridgeWeight)
    + typedArrayBytes(program.sourceVelocity)
    + typedArrayBytes(program.sourceScaleVelocity);
  const compiled = program.compiled;
  if (compiled) {
    bytes += typedArrayBytes(compiled.perId.localSource)
      + typedArrayBytes(compiled.perId.localTarget)
      + typedArrayBytes(compiled.perId.residual)
      + typedArrayBytes(compiled.perId.depth)
      + typedArrayBytes(compiled.perId.activationStart)
      + typedArrayBytes(compiled.perId.activationEnd)
      + typedArrayBytes(compiled.perId.scaleBias)
      + typedArrayBytes(compiled.perId.groupIndex)
      + typedArrayBytes(compiled.perId.flags)
      + typedArrayBytes(compiled.perId.phaseOffset)
      + typedArrayBytes(compiled.groupPayload)
      + typedArrayBytes(compiled.perIdPayload);
  }
  return bytes;
}
