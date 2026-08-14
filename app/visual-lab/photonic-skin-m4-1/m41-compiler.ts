/**
 * Browser port of scripts/transition_compiler_v2.py.
 *
 * All policy is declarative and geometry-only. The compiler keeps Float64
 * intermediates, packs the frozen 64/32-byte layouts, and immediately
 * evaluates the decoded/quantized lanes just like the Python reference.
 */

import type {
  CompiledGroupTrack,
  CompiledPerId,
  CompiledProgramHeader,
  MotionProfileDefinition,
  RuntimeTransitionSnapshot,
  SourceSnapshotDescriptor,
  TransitionProgram,
  TransitionRequest,
  TransitionState,
  Vec3,
} from "./m41-evaluator";

const GROUP_STRIDE = 64;
const PER_ID_STRIDE = 32;
const UINT32_MAX = 0xffffffff;
const PROFILE_SHA256 = "f2f25cb2dd6bddc422f0a6d8961fe677ce0f92e10607fecf8692567b8903f381";
const ENDPOINT_LIBRARY_FINGERPRINT = "0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2";
const ENDPOINT_MANIFEST_SHA256 = "530ca41e0faecf291ea9f674a7e383ae8739af0bddad578a765a7c264129ea82";

type Relation = "preserve" | "split" | "merge" | "regroup";
type NumericArray = Float32Array | Float64Array | Uint8Array | Uint16Array | Int16Array;

interface RoutingNode {
  groupIndex: number;
  sourceMacroGroup: number;
  targetMacroGroup: number;
  relation: Relation;
  memberCount: number;
}

interface BridgeTrack {
  groupIndex: number;
  mode: Exclude<Relation, "preserve">;
  start: number;
  peak: number;
  end: number;
  thickness: number;
  memberCount: number;
}

interface CanonicalRequest {
  schemaVersion: "1.0.0";
  sourceStateId?: string;
  sourceSnapshot?: SourceSnapshotDescriptor;
  targetStateId: string;
  identitySpaceVersion: string;
  motionProfileId: string;
  triggerMode: TransitionRequest["triggerMode"];
  viewportProfile: TransitionRequest["viewportProfile"];
  directionIntent: Vec3 | "auto";
  durationOverride?: number;
  deterministicSeed: number;
  probeIdentityCount?: number;
  reducedMotion?: boolean;
}

interface StateEntryLike {
  stateId: string;
  shellCount: number;
  contentHash?: string;
}

interface PyFloat {
  readonly __pythonFloat: number;
}

const pyFloat = (value: number): PyFloat => ({ __pythonFloat: value });

function pythonFloat(value: number) {
  if (!Number.isFinite(value)) throw new Error("Canonical JSON rejects non-finite numbers");
  if (Object.is(value, -0)) return "-0.0";
  let rendered = value.toString();
  // Python's shortest-repr switches to scientific notation below 1e-4,
  // while JavaScript waits until 1e-6.  Convert the intervening exact decimal
  // spelling without re-rounding so canonical JSON bytes remain identical.
  if (value !== 0 && Math.abs(value) < 1e-4 && !/[eE]/.test(rendered)) {
    const sign = rendered.startsWith("-") ? "-" : "";
    const fraction = rendered.replace(/^-?0\./, "");
    const first = fraction.search(/[1-9]/);
    const digits = fraction.slice(first);
    rendered = `${sign}${digits[0]}${digits.length > 1 ? `.${digits.slice(1)}` : ""}e-${String(first + 1).padStart(2, "0")}`;
  }
  if (!rendered.includes(".") && !/[eE]/.test(rendered)) rendered += ".0";
  rendered = rendered.replace(/e([+-]?)(\d+)$/i, (_, sign: string, exponent: string) => (
    `e${sign || "+"}${exponent.padStart(2, "0")}`
  ));
  return rendered;
}

function stableJsonText(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON rejects non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJsonText).join(",")}]`;
  if (typeof value === "object") {
    if ("__pythonFloat" in value) return pythonFloat((value as PyFloat).__pythonFloat);
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJsonText(record[key])}`
    )).join(",")}}`;
  }
  throw new Error(`Canonical JSON rejects ${typeof value}`);
}

function stableJsonBytes(value: unknown) {
  return new TextEncoder().encode(`${stableJsonText(value)}\n`);
}

function concatBytes(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, value) => sum + value.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

/** Synchronous SHA-256 keeps the compiler API deterministic in browsers and Node tests. */
export function sha256Hex(input: Uint8Array) {
  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const payload = new Uint8Array(paddedLength);
  payload.set(input);
  payload[input.length] = 0x80;
  const view = new DataView(payload.buffer);
  const bitLength = input.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  const rotate = (value: number, amount: number) => (value >>> amount) | (value << (32 - amount));
  for (let block = 0; block < paddedLength; block += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(block + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15];
      const b = words[index - 2];
      const s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3);
      const s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choose + constants[index] + words[index]) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return Array.from(hash, (value) => value.toString(16).padStart(8, "0")).join("");
}

function roundTiesEven(value: number) {
  const floor = Math.floor(value);
  const fraction = value - floor;
  return fraction > 0.5 || (fraction === 0.5 && (floor & 1) === 1) ? floor + 1 : floor;
}

function floatToHalfBits(input: number) {
  if (Number.isNaN(input)) return 0x7e00;
  const sign = input < 0 || Object.is(input, -0) ? 0x8000 : 0;
  const value = Math.abs(input);
  if (value === Number.POSITIVE_INFINITY) return sign | 0x7c00;
  if (value === 0) return sign;
  if (value > 65504) return sign | 0x7c00;
  if (value < 2 ** -14) {
    const fraction = roundTiesEven(value / 2 ** -24);
    return sign | Math.min(fraction, 0x400);
  }
  let exponent = Math.floor(Math.log2(value));
  let fraction = roundTiesEven((value / 2 ** exponent - 1) * 1024);
  if (fraction === 1024) {
    exponent += 1;
    fraction = 0;
  }
  return sign | ((exponent + 15) << 10) | fraction;
}

function halfBitsToFloat(value: number) {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >>> 10) & 0x1f;
  const fraction = value & 0x3ff;
  if (exponent === 0) return fraction === 0 ? sign * 0 : sign * 2 ** -14 * fraction / 1024;
  if (exponent === 0x1f) return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

const f16 = (value: number) => halfBitsToFloat(floatToHalfBits(value));
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const length3 = (value: Vec3) => Math.hypot(value[0], value[1], value[2]);

function normalize(value: Vec3, fallback: Vec3 = [0, 0, 1]): [number, number, number] {
  const magnitude = length3(value);
  return magnitude > 1e-12
    ? [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude]
    : [...fallback];
}

function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function orthogonal(axis: Vec3): [number, number, number] {
  const absolute = axis.map(Math.abs);
  const lane = absolute[0] <= absolute[1] && absolute[0] <= absolute[2] ? 0 : absolute[1] <= absolute[2] ? 1 : 2;
  const basis: [number, number, number] = [0, 0, 0];
  basis[lane] = 1;
  return normalize(cross(axis, basis));
}

function hashU32(id: number, seed: number) {
  let value = ((id >>> 0) ^ (seed >>> 0)) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value = (value ^ (value >>> 15)) >>> 0;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function quantile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function uniqueCount(values: Uint8Array, active: Uint8Array, count: number) {
  const result = new Set<number>();
  for (let id = 0; id < count; id += 1) if (active[id]) result.add(values[id]);
  return result.size;
}

function meanPosition(state: TransitionState, count: number): [number, number, number] {
  const result: [number, number, number] = [0, 0, 0];
  for (let id = 0; id < count; id += 1) for (let lane = 0; lane < 3; lane += 1) result[lane] += state.position[id * 3 + lane];
  return result.map((value) => value / Math.max(count, 1)) as [number, number, number];
}

/** Jacobi eigensolver for the symmetric 3x3 covariance fallback. */
function principalEigenvector(matrix: number[][]): [number, number, number] {
  const a = matrix.map((row) => [...row]);
  const vectors = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let iteration = 0; iteration < 48; iteration += 1) {
    let p = 0;
    let q = 1;
    if (Math.abs(a[0][2]) > Math.abs(a[p][q])) [p, q] = [0, 2];
    if (Math.abs(a[1][2]) > Math.abs(a[p][q])) [p, q] = [1, 2];
    if (Math.abs(a[p][q]) < 1e-15) break;
    const angle = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    for (let lane = 0; lane < 3; lane += 1) {
      const ap = a[lane][p];
      const aq = a[lane][q];
      a[lane][p] = cosine * ap - sine * aq;
      a[lane][q] = sine * ap + cosine * aq;
    }
    for (let lane = 0; lane < 3; lane += 1) {
      const ap = a[p][lane];
      const aq = a[q][lane];
      a[p][lane] = cosine * ap - sine * aq;
      a[q][lane] = sine * ap + cosine * aq;
      const vp = vectors[lane][p];
      const vq = vectors[lane][q];
      vectors[lane][p] = cosine * vp - sine * vq;
      vectors[lane][q] = sine * vp + cosine * vq;
    }
  }
  const index = a[1][1] > a[0][0] ? (a[2][2] > a[1][1] ? 2 : 1) : (a[2][2] > a[0][0] ? 2 : 0);
  return normalize([vectors[0][index], vectors[1][index], vectors[2][index]]);
}

function principalAxis(source: TransitionState, target: TransitionState, count: number, intent: Vec3 | "auto") {
  if (intent !== "auto" && intent.every(Number.isFinite) && length3(intent) > 1e-10) return normalize(intent);
  const sourceMean = meanPosition(source, count);
  const targetMean = meanPosition(target, count);
  const delta: Vec3 = [targetMean[0] - sourceMean[0], targetMean[1] - sourceMean[1], targetMean[2] - sourceMean[2]];
  if (length3(delta) > 1e-8) return normalize(delta);
  const mean: [number, number, number] = [
    (sourceMean[0] + targetMean[0]) * 0.5,
    (sourceMean[1] + targetMean[1]) * 0.5,
    (sourceMean[2] + targetMean[2]) * 0.5,
  ];
  const covariance = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const state of [source, target]) for (let id = 0; id < count; id += 1) {
    const point = [0, 1, 2].map((lane) => state.position[id * 3 + lane] - mean[lane]);
    for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) covariance[row][column] += point[row] * point[column] / (2 * count);
  }
  const axis = principalEigenvector(covariance);
  const dominant = Math.abs(axis[0]) >= Math.abs(axis[1]) && Math.abs(axis[0]) >= Math.abs(axis[2]) ? 0 : Math.abs(axis[1]) >= Math.abs(axis[2]) ? 1 : 2;
  return axis[dominant] < 0 ? axis.map((value) => -value) as [number, number, number] : axis;
}

function numericShape(name: string, count: number): number[] {
  if (["position", "velocity", "normal"].includes(name)) return [count, 3];
  if (name === "orientation") return [count, 4];
  if (name === "role") return [count, 3];
  return [count];
}

function dtypeString(value: NumericArray) {
  if (value instanceof Float64Array) return "<f8";
  if (value instanceof Float32Array) return "<f4";
  if (value instanceof Uint16Array) return "<u2";
  if (value instanceof Int16Array) return "<i2";
  return "|u1";
}

function arrayPrefixBytes(value: NumericArray, elementCount: number) {
  return new Uint8Array(value.buffer, value.byteOffset, Math.min(value.length, elementCount) * value.BYTES_PER_ELEMENT);
}

function shapeBytes(shape: number[]) {
  const payload = new Uint8Array(shape.length * 8);
  const view = new DataView(payload.buffer);
  shape.forEach((value, lane) => {
    view.setUint32(lane * 8, value >>> 0, true);
    view.setUint32(lane * 8 + 4, Math.floor(value / 0x100000000), true);
  });
  return payload;
}

function transientArrays(state: TransitionState): Record<string, NumericArray> {
  const snapshot = state as Partial<RuntimeTransitionSnapshot>;
  const result: Record<string, NumericArray | undefined> = {
    position: state.position,
    velocity: state.velocity,
    normal: state.normal,
    orientation: state.orientation,
    scale: state.scale,
    scaleVelocity: snapshot.scaleVelocity,
    status: state.status,
    flags: state.flags,
    component: state.component,
    shell: state.shell,
    transitionGroup: state.transitionGroup,
    reserveDepth: state.reserveDepth,
    activation: snapshot.activation,
    bridge: snapshot.bridge,
    role: snapshot.role,
  };
  return Object.fromEntries(Object.entries(result).filter((entry): entry is [string, NumericArray] => Boolean(entry[1])));
}

function recordsHash(state: TransitionState, count: number) {
  if (state.rawRecords && state.rawRecords.byteLength >= count * 40) return sha256Hex(state.rawRecords.subarray(0, count * 40));
  const parts: Uint8Array[] = [];
  for (const name of Object.keys(transientArrays(state)).sort()) {
    const value = transientArrays(state)[name];
    const components = numericShape(name, count).slice(1).reduce((product, lane) => product * lane, 1);
    parts.push(new TextEncoder().encode(name));
    parts.push(new TextEncoder().encode(dtypeString(value)));
    parts.push(shapeBytes(numericShape(name, count)));
    parts.push(arrayPrefixBytes(value, count * components));
  }
  return sha256Hex(concatBytes(...parts));
}

function actorPoseForHash(snapshot: Partial<RuntimeTransitionSnapshot>) {
  const actor = snapshot.actorPose;
  if (!actor || actor.length !== 7) return {};
  return {
    orientation: Array.from(actor.subarray(3, 7), pyFloat),
    position: Array.from(actor.subarray(0, 3), pyFloat),
  };
}

function snapshotHash(state: TransitionState, count: number) {
  if (state.snapshotHash) return state.snapshotHash;
  const arrays = transientArrays(state);
  const order = [
    "position", "velocity", "normal", "orientation", "scale", "scaleVelocity", "status", "flags",
    "component", "shell", "transitionGroup", "reserveDepth", "activation", "bridge", "role",
  ];
  const parts: Uint8Array[] = [];
  for (const name of order) {
    const value = arrays[name];
    if (!value) continue;
    const components = numericShape(name, count).slice(1).reduce((product, lane) => product * lane, 1);
    parts.push(new TextEncoder().encode(name));
    parts.push(new TextEncoder().encode(dtypeString(value)));
    parts.push(shapeBytes(numericShape(name, count)));
    parts.push(arrayPrefixBytes(value, count * components));
  }
  const actorHash = sha256Hex(stableJsonBytes(actorPoseForHash(state as Partial<RuntimeTransitionSnapshot>)));
  parts.push(new TextEncoder().encode(actorHash));
  return sha256Hex(concatBytes(...parts));
}

function normalizeRequest(
  source: TransitionState,
  request: TransitionRequest,
  count: number,
): CanonicalRequest {
  if (request.identitySpaceVersion !== "ps03m3-identity-v1") throw new Error("identitySpaceVersion does not match frozen M3");
  if (request.motionProfileId !== "directed-plastic-release") throw new Error("unsupported motionProfileId");
  if (!Number.isInteger(request.deterministicSeed) || request.deterministicSeed < 0 || request.deterministicSeed > UINT32_MAX) {
    throw new Error("deterministicSeed must be uint32");
  }
  const durationOverride = request.durationOverride ?? (
    request.durationOverrideMs === undefined ? undefined : request.durationOverrideMs / 1000
  );
  const descriptorInput = request.sourceSnapshot;
  const descriptorRecord = descriptorInput && "snapshotHash" in descriptorInput && typeof descriptorInput.snapshotHash === "string"
    ? descriptorInput as SourceSnapshotDescriptor
    : null;
  const descriptor = descriptorInput
    ? (descriptorRecord
      ? {
          snapshotHash: descriptorRecord.snapshotHash,
          recordCount: descriptorRecord.recordCount,
          ...(descriptorRecord.sourceProgramHash ? { sourceProgramHash: descriptorRecord.sourceProgramHash } : {}),
          ...(descriptorRecord.capturedProgress === undefined ? {} : { capturedProgress: descriptorRecord.capturedProgress }),
          ...(descriptorRecord.generation === undefined ? {} : { generation: descriptorRecord.generation }),
        }
      : { snapshotHash: snapshotHash(source, count), recordCount: count })
    : undefined;
  const sourceStateId = descriptor ? undefined : (request.sourceStateId ?? source.entry?.stateId);
  if (!descriptor && !sourceStateId) throw new Error("sourceStateId is required for a frozen endpoint");
  const result: CanonicalRequest = {
    schemaVersion: "1.0.0",
    ...(sourceStateId ? { sourceStateId } : {}),
    ...(descriptor ? { sourceSnapshot: descriptor } : {}),
    targetStateId: request.targetStateId,
    identitySpaceVersion: request.identitySpaceVersion,
    motionProfileId: request.motionProfileId,
    triggerMode: request.triggerMode,
    viewportProfile: request.viewportProfile,
    directionIntent: request.directionIntent ?? "auto",
    ...(durationOverride === undefined ? {} : { durationOverride }),
    deterministicSeed: request.deterministicSeed >>> 0,
    ...(request.probeIdentityCount === undefined ? {} : { probeIdentityCount: request.probeIdentityCount }),
    ...(request.reducedMotion === undefined ? {} : { reducedMotion: request.reducedMotion }),
  };
  const direction = result.directionIntent;
  if (direction !== "auto" && (direction.length !== 3 || !direction.every(Number.isFinite))) throw new Error("directionIntent must be auto or finite vec3");
  return result;
}

function stateEntry(state: TransitionState, fallbackId: string, count: number): StateEntryLike {
  const active = new Uint8Array(count);
  for (let id = 0; id < count; id += 1) active[id] = state.status[id] === 0 ? 1 : 0;
  return {
    stateId: state.entry?.stateId ?? fallbackId,
    shellCount: state.entry?.shellCount ?? uniqueCount(state.shell, active, count),
    contentHash: state.entry?.contentHash,
  };
}

function relation(sourceShellCount: number, targetShellCount: number, sourceMacro: number, targetMacro: number): Relation {
  if (sourceMacro === targetMacro) return "preserve";
  if (targetShellCount > sourceShellCount) return "split";
  if (targetShellCount < sourceShellCount) return "merge";
  return "regroup";
}

function normalAt(state: TransitionState, id: number): [number, number, number] {
  if (state.rawRecords && state.rawRecords.byteLength >= (id + 1) * 40) {
    const view = new DataView(
      state.rawRecords.buffer,
      state.rawRecords.byteOffset,
      state.rawRecords.byteLength,
    );
    const offset = id * 40 + 12;
    return normalize([
      view.getInt16(offset, true) / 32767,
      view.getInt16(offset + 2, true) / 32767,
      view.getInt16(offset + 4, true) / 32767,
    ]);
  }
  const p = id * 3;
  return normalize([state.normal[p], state.normal[p + 1], state.normal[p + 2]]);
}

function durationSeconds(
  request: CanonicalRequest,
  profile: MotionProfileDefinition,
  sourceEntry: StateEntryLike,
  targetEntry: StateEntryLike,
  source: TransitionState,
  target: TransitionState,
  count: number,
) {
  if (request.reducedMotion) return 0;
  const timing = profile.timingPolicy.variants[request.triggerMode][request.viewportProfile];
  let duration = timing.durationSeconds;
  if (request.triggerMode === "route" || request.triggerMode === "qa") {
    const displacements: number[] = [];
    const minimum: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const maximum: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (let id = 0; id < count; id += 1) {
      const p = id * 3;
      displacements.push(Math.hypot(
        target.position[p] - source.position[p],
        target.position[p + 1] - source.position[p + 1],
        target.position[p + 2] - source.position[p + 2],
      ));
      for (let lane = 0; lane < 3; lane += 1) {
        minimum[lane] = Math.min(minimum[lane], source.position[p + lane], target.position[p + lane]);
        maximum[lane] = Math.max(maximum[lane], source.position[p + lane], target.position[p + lane]);
      }
    }
    const bounds = Math.hypot(maximum[0] - minimum[0], maximum[1] - minimum[1], maximum[2] - minimum[2]);
    const relative = quantile(displacements, 0.75) / Math.max(bounds, 1e-6);
    duration += Math.min(0.2, 0.04 * Math.abs(sourceEntry.shellCount - targetEntry.shellCount) + 0.08 * Math.min(relative, 1));
  }
  if (request.durationOverride !== undefined) duration = request.durationOverride;
  const hardCap = timing.hardCapSeconds ?? profile.timingPolicy.durationBoundsSeconds[1];
  if (duration > hardCap + 1e-12) throw new Error(`duration ${duration} exceeds ${request.viewportProfile} ${request.triggerMode} hard cap ${hardCap}`);
  return duration;
}

function compileGeometry(
  source: TransitionState,
  target: TransitionState,
  count: number,
  request: CanonicalRequest,
  profile: MotionProfileDefinition,
  sourceEntry: StateEntryLike,
  targetEntry: StateEntryLike,
) {
  const direction = principalAxis(source, target, count, request.directionIntent);
  const protectedMask = new Uint8Array(count);
  const sourceActive = new Uint8Array(count);
  const targetActive = new Uint8Array(count);
  const shellChanged = new Uint8Array(count);
  const sourceMacro = new Uint16Array(count);
  const targetMacro = new Uint16Array(count);
  const pairSet = new Set<string>();
  for (let id = 0; id < count; id += 1) {
    protectedMask[id] = ((source.flags[id] | target.flags[id]) & 3) !== 0 ? 1 : 0;
    sourceActive[id] = source.status[id] === 0 ? 1 : 0;
    targetActive[id] = target.status[id] === 0 ? 1 : 0;
    shellChanged[id] = source.shell[id] !== target.shell[id] ? 1 : 0;
    sourceMacro[id] = (source.shell[id] << 8) | source.transitionGroup[id];
    targetMacro[id] = (target.shell[id] << 8) | target.transitionGroup[id];
    pairSet.add(`${sourceMacro[id]},${targetMacro[id]}`);
  }
  const pairs = [...pairSet].map((key) => key.split(",").map(Number) as [number, number])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  if (pairs.length > 0xffff) throw new Error("macro routing exceeds uint16 group index budget");
  const pairIndex = new Map(pairs.map((pair, index) => [`${pair[0]},${pair[1]}`, index]));
  const inverse = new Uint16Array(count);
  const memberCount = new Uint16Array(pairs.length);
  for (let id = 0; id < count; id += 1) {
    inverse[id] = pairIndex.get(`${sourceMacro[id]},${targetMacro[id]}`) ?? 0;
    memberCount[inverse[id]] += 1;
  }

  const sourceCenter = Array.from({ length: pairs.length }, () => [0, 0, 0] as [number, number, number]);
  const targetCenter = Array.from({ length: pairs.length }, () => [0, 0, 0] as [number, number, number]);
  const sourceWeight = new Float64Array(pairs.length);
  const targetWeight = new Float64Array(pairs.length);
  const protectedCount = new Uint16Array(pairs.length);
  for (let id = 0; id < count; id += 1) {
    const group = inverse[id];
    const weight0 = (sourceActive[id] ? 1 : 0.25) * (protectedMask[id] ? 1.35 : 1);
    const weight1 = (targetActive[id] ? 1 : 0.25) * (protectedMask[id] ? 1.35 : 1);
    sourceWeight[group] += weight0;
    targetWeight[group] += weight1;
    protectedCount[group] += protectedMask[id];
    for (let lane = 0; lane < 3; lane += 1) {
      sourceCenter[group][lane] += source.position[id * 3 + lane] * weight0;
      targetCenter[group][lane] += target.position[id * 3 + lane] * weight1;
    }
  }
  for (let group = 0; group < pairs.length; group += 1) for (let lane = 0; lane < 3; lane += 1) {
    sourceCenter[group][lane] /= Math.max(sourceWeight[group], 1e-12);
    targetCenter[group][lane] /= Math.max(targetWeight[group], 1e-12);
  }

  const projections = pairs.map((_, group) => (
    ((sourceCenter[group][0] + targetCenter[group][0]) * 0.5) * direction[0]
    + ((sourceCenter[group][1] + targetCenter[group][1]) * 0.5) * direction[1]
    + ((sourceCenter[group][2] + targetCenter[group][2]) * 0.5) * direction[2]
  ));
  const projectionMinimum = Math.min(...projections);
  const projectionSpan = Math.max(...projections) - projectionMinimum;
  const groupOrder = projections.map((value) => (value - projectionMinimum) / Math.max(projectionSpan, 1e-12));
  const windows = profile.phasePolicy.windows;
  const routePolicy = profile.routeFieldPolicy;
  const featurePolicy = profile.featureProtectionPolicy;
  const splitPolicy = profile.splitMergePolicy;
  let amplitudeFactor = request.viewportProfile === "mobile" ? routePolicy.mobileAmplitudeFactor : 1;
  if (request.triggerMode === "preview") amplitudeFactor *= routePolicy.previewAmplitudeFactor;
  const exactGroups: CompiledGroupTrack[] = [];
  const routing: RoutingNode[] = [];
  const relations: Relation[] = [];
  for (let group = 0; group < pairs.length; group += 1) {
    const [sourceMacroValue, targetMacroValue] = pairs[group];
    const mode = relation(sourceEntry.shellCount, targetEntry.shellCount, sourceMacroValue, targetMacroValue);
    relations.push(mode);
    const delta: Vec3 = [
      targetCenter[group][0] - sourceCenter[group][0],
      targetCenter[group][1] - sourceCenter[group][1],
      targetCenter[group][2] - sourceCenter[group][2],
    ];
    const normalSum: [number, number, number] = [0, 0, 0];
    for (let id = 0; id < count; id += 1) if (inverse[id] === group) {
      const normal0 = normalAt(source, id);
      const normal1 = normalAt(target, id);
      for (let lane = 0; lane < 3; lane += 1) normalSum[lane] += 0.5 * (normal0[lane] + normal1[lane]);
    }
    const averageNormal = normalize(normalSum.map((value) => value / memberCount[group]) as [number, number, number], orthogonal(direction));
    let lateral = cross(delta, direction);
    if (length3(lateral) < 1e-9) lateral = cross(averageNormal, direction);
    if (length3(lateral) < 1e-9) lateral = orthogonal(direction);
    lateral = normalize(lateral);
    const signHash = (Math.imul(sourceMacroValue, 73856093) ^ Math.imul(targetMacroValue, 19349663) ^ request.deterministicSeed) >>> 0;
    const sign = (signHash & 1) === 0 ? 1 : -1;
    let amplitude = Math.min(routePolicy.maximumMacroRoute, routePolicy.baseMacroRoute + length3(delta) * routePolicy.distanceFactor);
    amplitude *= amplitudeFactor;
    amplitude *= 1 + (mode === "split" || mode === "merge" ? 0.18 : 0);
    const protectedFraction = protectedCount[group] / Math.max(memberCount[group], 1);
    amplitude *= 1 - protectedFraction * (1 - featurePolicy.routeAmplitudeFactor);
    const route: Vec3 = [
      lateral[0] * amplitude * sign + averageNormal[0] * amplitude * 0.22,
      lateral[1] * amplitude * sign + averageNormal[1] * amplitude * 0.22,
      lateral[2] * amplitude * sign + averageNormal[2] * amplitude * 0.22,
    ];
    let releaseStart = windows.release[0] + groupOrder[group] * profile.phasePolicy.spatialDelayFraction
      + protectedFraction * featurePolicy.sourceReleaseDelay;
    let releaseEnd = Math.max(releaseStart + 0.08, windows.release[1] + groupOrder[group] * profile.phasePolicy.spatialDelayFraction * 0.35);
    let revealStart = windows.reveal[0] + groupOrder[group] * profile.phasePolicy.spatialDelayFraction * 0.45
      - protectedFraction * featurePolicy.targetRevealAdvance;
    let revealEnd = windows.reveal[1] - protectedFraction * 0.025;
    releaseStart = clamp(releaseStart, 0, 0.72);
    releaseEnd = clamp(releaseEnd, releaseStart + 1e-4, 0.78);
    revealStart = clamp(revealStart, releaseStart, 0.8);
    revealEnd = clamp(revealEnd, Math.max(revealStart + 1e-4, releaseEnd), 0.98);
    let flags = mode === "split" ? 1 : mode === "merge" ? 2 : mode === "regroup" ? 4 : 0;
    if (protectedFraction > 0) flags |= 8;
    exactGroups.push({
      sourceCenter: sourceCenter[group].map(Math.fround) as [number, number, number],
      targetCenter: targetCenter[group].map(Math.fround) as [number, number, number],
      routeControl: route.map(Math.fround) as [number, number, number],
      direction: direction.map(f16) as [number, number, number],
      releaseStart: f16(releaseStart),
      releaseEnd: f16(releaseEnd),
      revealStart: f16(revealStart),
      revealEnd: f16(revealEnd),
      bridgeStart: f16(splitPolicy.bridgeWindow[0]),
      bridgeEnd: f16(splitPolicy.bridgeWindow[1]),
      sourceMacro: sourceMacroValue,
      targetMacro: targetMacroValue,
      flags,
      memberCount: memberCount[group],
    });
    routing.push({ groupIndex: group, sourceMacroGroup: sourceMacroValue, targetMacroGroup: targetMacroValue, relation: mode, memberCount: memberCount[group] });
  }

  const localSource = new Float32Array(count * 3);
  const localTarget = new Float32Array(count * 3);
  const residual = new Float32Array(count * 3);
  const depth = new Float32Array(count);
  const activationStart = new Float32Array(count);
  const activationEnd = new Float32Array(count);
  const scaleBias = new Float32Array(count);
  const phaseOffset = new Uint8Array(count);
  const flags = new Uint16Array(count);
  const coherentOrder = new Float64Array(count);
  const pointProjection = new Float64Array(count);
  const distance = new Float64Array(count);
  let pointMinimum = Number.POSITIVE_INFINITY;
  let pointMaximum = Number.NEGATIVE_INFINITY;
  for (let id = 0; id < count; id += 1) {
    const p = id * 3;
    const group = inverse[id];
    for (let lane = 0; lane < 3; lane += 1) {
      localSource[p + lane] = f16(clamp(source.position[p + lane] - sourceCenter[group][lane], -65504, 65504));
      localTarget[p + lane] = f16(clamp(target.position[p + lane] - targetCenter[group][lane], -65504, 65504));
    }
    const midpoint: Vec3 = [
      (source.position[p] + target.position[p]) * 0.5,
      (source.position[p + 1] + target.position[p + 1]) * 0.5,
      (source.position[p + 2] + target.position[p + 2]) * 0.5,
    ];
    pointProjection[id] = midpoint[0] * direction[0] + midpoint[1] * direction[1] + midpoint[2] * direction[2];
    pointMinimum = Math.min(pointMinimum, pointProjection[id]);
    pointMaximum = Math.max(pointMaximum, pointProjection[id]);
    distance[id] = Math.hypot(
      target.position[p] - source.position[p],
      target.position[p + 1] - source.position[p + 1],
      target.position[p + 2] - source.position[p + 2],
    );
  }

  const residualMeans = Array.from({ length: pairs.length }, () => [0, 0, 0] as [number, number, number]);
  const uncenteredResidual = new Float64Array(count * 3);
  for (let id = 0; id < count; id += 1) {
    const p = id * 3;
    let vector: [number, number, number] = [
      hashU32(id, request.deterministicSeed ^ 0xa511e9b3) / UINT32_MAX * 2 - 1,
      hashU32(id, request.deterministicSeed ^ 0x63d83595) / UINT32_MAX * 2 - 1,
      hashU32(id, request.deterministicSeed ^ 0xc2b2ae35) / UINT32_MAX * 2 - 1,
    ];
    vector = normalize(vector);
    const projection = vector[0] * direction[0] + vector[1] * direction[1] + vector[2] * direction[2];
    vector = [vector[0] - projection * direction[0], vector[1] - projection * direction[1], vector[2] - projection * direction[2]];
    vector = length3(vector) < 1e-10 ? orthogonal(direction) : normalize(vector);
    let amplitude = Math.min(profile.routeFieldPolicy.maximumResidual, distance[id] * profile.routeFieldPolicy.residualDistanceFraction);
    amplitude *= amplitudeFactor;
    if (protectedMask[id]) amplitude *= profile.featureProtectionPolicy.routeAmplitudeFactor;
    for (let lane = 0; lane < 3; lane += 1) {
      uncenteredResidual[p + lane] = vector[lane] * amplitude;
      residualMeans[inverse[id]][lane] += uncenteredResidual[p + lane];
    }
  }
  for (let group = 0; group < pairs.length; group += 1) for (let lane = 0; lane < 3; lane += 1) residualMeans[group][lane] /= Math.max(memberCount[group], 1);
  const pointSpan = pointMaximum - pointMinimum;
  const reserve = profile.reserveTransportPolicy;
  for (let id = 0; id < count; id += 1) {
    const p = id * 3;
    const group = inverse[id];
    for (let lane = 0; lane < 3; lane += 1) residual[p + lane] = f16(uncenteredResidual[p + lane] - residualMeans[group][lane]);
    depth[id] = f16(Math.max(source.reserveDepth[id], target.reserveDepth[id]));
    const spatialOrder = (pointProjection[id] - pointMinimum) / Math.max(pointSpan, 1e-12);
    const hashOrder = hashU32(id, request.deterministicSeed ^ 0x9e3779b9) / UINT32_MAX;
    coherentOrder[id] = clamp(0.82 * spatialOrder + 0.18 * hashOrder, 0, 1);
    phaseOffset[id] = roundTiesEven(coherentOrder[id] * 255);
    const emerging = !sourceActive[id] && Boolean(targetActive[id]);
    const immersing = Boolean(sourceActive[id]) && !targetActive[id];
    const ordering = coherentOrder[id] * reserve.spatialOrderingFraction;
    let start = 0;
    let end = 1;
    if (emerging) {
      start = reserve.emergenceWindow[0] + ordering;
      end = reserve.emergenceWindow[1] + ordering * 0.35;
    } else if (immersing) {
      start = reserve.immersionWindow[0] + ordering * 0.35;
      end = reserve.immersionWindow[1] + ordering;
    }
    activationStart[id] = f16(start);
    activationEnd[id] = f16(Math.min(end, 0.98));
    flags[id] = (emerging ? 1 : 0)
      | (immersing ? 2 : 0)
      | (protectedMask[id] ? 8 : 0)
      | (shellChanged[id] ? 16 : 0)
      | (sourceActive[id] ? 32 : 0)
      | (targetActive[id] ? 64 : 0)
      | (source.status[id] === 2 || target.status[id] === 2 ? 128 : 0);
  }

  const bridgeTracks: BridgeTrack[] = [];
  for (let group = 0; group < pairs.length; group += 1) {
    const mode = relations[group];
    if (mode === "preserve") continue;
    const candidates: Array<{ id: number; score: number }> = [];
    const meeting: Vec3 = [
      (sourceCenter[group][0] + targetCenter[group][0]) * 0.5,
      (sourceCenter[group][1] + targetCenter[group][1]) * 0.5,
      (sourceCenter[group][2] + targetCenter[group][2]) * 0.5,
    ];
    for (let id = 0; id < count; id += 1) if (inverse[id] === group && shellChanged[id] && !protectedMask[id]) {
      const p = id * 3;
      const midpoint: Vec3 = [
        (source.position[p] + target.position[p]) * 0.5,
        (source.position[p + 1] + target.position[p + 1]) * 0.5,
        (source.position[p + 2] + target.position[p + 2]) * 0.5,
      ];
      candidates.push({
        id,
        score: Math.hypot(midpoint[0] - meeting[0], midpoint[1] - meeting[1], midpoint[2] - meeting[2])
          + hashU32(id, request.deterministicSeed ^ group) * 1e-15,
      });
    }
    if (!candidates.length) continue;
    candidates.sort((left, right) => left.score - right.score || left.id - right.id);
    const selectedCount = Math.min(
      candidates.length,
      profile.splitMergePolicy.maximumBridgeIdsPerGroup,
      Math.max(1, Math.ceil(memberCount[group] * profile.splitMergePolicy.maximumBridgeFractionPerGroup)),
    );
    for (let candidate = 0; candidate < selectedCount; candidate += 1) flags[candidates[candidate].id] |= 4;
    exactGroups[group].flags |= 16;
    bridgeTracks.push({
      groupIndex: group,
      mode,
      start: profile.splitMergePolicy.bridgeWindow[0],
      peak: profile.splitMergePolicy.bridgePeak,
      end: profile.splitMergePolicy.bridgeWindow[1],
      thickness: profile.splitMergePolicy.bridgeThickness,
      memberCount: selectedCount,
    });
  }
  return {
    direction,
    exactGroups,
    routing,
    bridgeTracks,
    protectedCount,
    perId: {
      localSource,
      localTarget,
      residual,
      depth,
      activationStart,
      activationEnd,
      scaleBias,
      groupIndex: inverse,
      flags,
      phaseOffset,
    } satisfies CompiledPerId,
    distance,
    shellChanged,
  };
}

function packGroups(groups: CompiledGroupTrack[]) {
  const payload = new Uint8Array(groups.length * GROUP_STRIDE);
  const view = new DataView(payload.buffer);
  groups.forEach((group, index) => {
    const offset = index * GROUP_STRIDE;
    for (let lane = 0; lane < 3; lane += 1) {
      view.setFloat32(offset + lane * 4, group.sourceCenter[lane], true);
      view.setFloat32(offset + 12 + lane * 4, group.targetCenter[lane], true);
      view.setFloat32(offset + 24 + lane * 4, group.routeControl[lane], true);
      view.setUint16(offset + 36 + lane * 2, floatToHalfBits(group.direction[lane]), true);
    }
    view.setUint16(offset + 42, floatToHalfBits(group.releaseStart), true);
    view.setUint16(offset + 44, floatToHalfBits(group.releaseEnd), true);
    view.setUint16(offset + 46, floatToHalfBits(group.revealStart), true);
    view.setUint16(offset + 48, floatToHalfBits(group.revealEnd), true);
    view.setUint16(offset + 50, floatToHalfBits(group.bridgeStart), true);
    view.setUint16(offset + 52, floatToHalfBits(group.bridgeEnd), true);
    view.setUint16(offset + 54, group.sourceMacro, true);
    view.setUint16(offset + 56, group.targetMacro, true);
    view.setUint16(offset + 58, group.flags, true);
    view.setUint16(offset + 60, group.memberCount, true);
  });
  return payload;
}

function packPerId(perId: CompiledPerId) {
  const count = perId.groupIndex.length;
  const payload = new Uint8Array(count * PER_ID_STRIDE);
  const view = new DataView(payload.buffer);
  for (let id = 0; id < count; id += 1) {
    const offset = id * PER_ID_STRIDE;
    const p = id * 3;
    for (let lane = 0; lane < 3; lane += 1) {
      view.setUint16(offset + lane * 2, floatToHalfBits(perId.localSource[p + lane]), true);
      view.setUint16(offset + 6 + lane * 2, floatToHalfBits(perId.localTarget[p + lane]), true);
      view.setUint16(offset + 12 + lane * 2, floatToHalfBits(perId.residual[p + lane]), true);
    }
    view.setUint16(offset + 18, floatToHalfBits(perId.depth[id]), true);
    view.setUint16(offset + 20, floatToHalfBits(perId.activationStart[id]), true);
    view.setUint16(offset + 22, floatToHalfBits(perId.activationEnd[id]), true);
    view.setUint16(offset + 24, floatToHalfBits(perId.scaleBias[id]), true);
    view.setUint16(offset + 26, perId.groupIndex[id], true);
    view.setUint16(offset + 28, perId.flags[id], true);
    view.setUint8(offset + 30, perId.phaseOffset[id]);
  }
  return payload;
}

const groupLayout = {
  recordStride: GROUP_STRIDE,
  fields: [
    { name: "sourceCenter", offset: 0, dtype: "<f4", components: 3 },
    { name: "targetCenter", offset: 12, dtype: "<f4", components: 3 },
    { name: "routeControl", offset: 24, dtype: "<f4", components: 3 },
    { name: "direction", offset: 36, dtype: "<f2", components: 3 },
    { name: "releaseStart", offset: 42, dtype: "<f2", components: 1 },
    { name: "releaseEnd", offset: 44, dtype: "<f2", components: 1 },
    { name: "revealStart", offset: 46, dtype: "<f2", components: 1 },
    { name: "revealEnd", offset: 48, dtype: "<f2", components: 1 },
    { name: "bridgeStart", offset: 50, dtype: "<f2", components: 1 },
    { name: "bridgeEnd", offset: 52, dtype: "<f2", components: 1 },
    { name: "sourceMacro", offset: 54, dtype: "<u2", components: 1 },
    { name: "targetMacro", offset: 56, dtype: "<u2", components: 1 },
    { name: "flags", offset: 58, dtype: "<u2", components: 1 },
    { name: "memberCount", offset: 60, dtype: "<u2", components: 1 },
    { name: "_padding", offset: 62, dtype: "|u1", components: 2 },
  ],
};

const perIdLayout = {
  recordStride: PER_ID_STRIDE,
  fields: [
    { name: "localSource", offset: 0, dtype: "<f2", components: 3 },
    { name: "localTarget", offset: 6, dtype: "<f2", components: 3 },
    { name: "residual", offset: 12, dtype: "<f2", components: 3 },
    { name: "depth", offset: 18, dtype: "<f2", components: 1 },
    { name: "activationStart", offset: 20, dtype: "<f2", components: 1 },
    { name: "activationEnd", offset: 22, dtype: "<f2", components: 1 },
    { name: "scaleBias", offset: 24, dtype: "<f2", components: 1 },
    { name: "groupIndex", offset: 26, dtype: "<u2", components: 1 },
    { name: "flags", offset: 28, dtype: "<u2", components: 1 },
    { name: "phaseOffset", offset: 30, dtype: "|u1", components: 1 },
    { name: "_padding", offset: 31, dtype: "|u1", components: 1 },
  ],
};

const integerMetadataKeys = new Set([
  "deterministicSeed", "identityCount", "groupCount", "groupIndex", "sourceMacroGroup", "targetMacroGroup",
  "memberCount", "recordCount", "recordStride", "byteLength", "offset", "components",
]);

function pythonizeMetadata(value: unknown, key = "", path = ""): unknown {
  if (typeof value === "number") {
    const profileIntegerEndpoint = value === 1 && (
      path === "header.phasePolicy.windows.settle"
      || path === "header.settlePolicy.window"
    );
    return integerMetadataKeys.has(key) || profileIntegerEndpoint ? value : pyFloat(value);
  }
  if (Array.isArray(value)) return value.map((item) => pythonizeMetadata(item, key, path));
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
      childKey,
      pythonizeMetadata(child, childKey, path ? `${path}.${childKey}` : childKey),
    ]),
  );
  return value;
}

/** Canonical metadata bytes used by the cross-runtime program hash contract. */
export function pythonMetadataHashBytes(value: unknown) {
  return stableJsonBytes(pythonizeMetadata(value));
}

function makeMetadata(
  programId: string,
  header: Record<string, unknown>,
  routingGraph: RoutingNode[],
  bridgeTracks: BridgeTrack[],
  groupPayload: Uint8Array,
  perIdPayload: Uint8Array,
  hashes: Record<string, string>,
) {
  return {
    schemaVersion: "1.1.0",
    programVersion: "2.1.0",
    programId,
    identitySpaceVersion: "ps03m3-identity-v1",
    header: {
      ...header,
      endpointLibrary: {
        stage: "PS-03.M3.1R",
        stateVersion: "3.1.1",
        deterministicFingerprint: ENDPOINT_LIBRARY_FINGERPRINT,
        manifestSha256: ENDPOINT_MANIFEST_SHA256,
      },
      endpointExactness: {
        times: [0, 1],
        fields: ["position", "normal", "orientation", "scale", "status", "flags", "component", "shell", "transitionGroup", "reserveDepth"],
      },
    },
    routingGraph,
    bridgeTracks,
    buffers: {
      groupTracks: { recordCount: groupPayload.byteLength / GROUP_STRIDE, recordStride: GROUP_STRIDE, byteLength: groupPayload.byteLength, sha256: hashes.groupTracksSha256 },
      perId: { recordCount: perIdPayload.byteLength / PER_ID_STRIDE, recordStride: PER_ID_STRIDE, byteLength: perIdPayload.byteLength, sha256: hashes.perIdSha256 },
    },
    byteLayout: { endianness: "little", groupTracks: groupLayout, perId: perIdLayout },
    hashes,
    provenance: {
      stage: "PS-03.M4.1",
      compiler: "ps03m41-transition-compiler-v2.1",
      geometryOnly: true,
      pairSpecificBranches: false,
      targetSpecificBranches: false,
      endpointLibraryStage: "PS-03.M3.1R",
      endpointLibraryVersion: "3.1.1",
      endpointLibraryFingerprint: ENDPOINT_LIBRARY_FINGERPRINT,
      endpointLibraryManifestSha256: ENDPOINT_MANIFEST_SHA256,
      approvalStatus: "requires-human-approval",
    },
  };
}

function emptyPerId(): CompiledPerId {
  return {
    localSource: new Float32Array(),
    localTarget: new Float32Array(),
    residual: new Float32Array(),
    depth: new Float32Array(),
    activationStart: new Float32Array(),
    activationEnd: new Float32Array(),
    scaleBias: new Float32Array(),
    groupIndex: new Uint16Array(),
    flags: new Uint16Array(),
    phaseOffset: new Uint8Array(),
  };
}

function phaseHeader(profile: MotionProfileDefinition) {
  return {
    sequence: [...profile.phasePolicy.sequence],
    windows: Object.fromEntries(Object.entries(profile.phasePolicy.windows).map(([name, window]) => [name, [...window]])),
    basis: profile.phasePolicy.basis,
  };
}

function sourcePose(source: TransitionState) {
  const actor = (source as Partial<RuntimeTransitionSnapshot>).actorPose;
  if (!actor || actor.length !== 7) return { position: [0, 0, 0] as [number, number, number], orientation: [0, 0, 0, 1] as [number, number, number, number] };
  return {
    position: Array.from(actor.subarray(0, 3)) as [number, number, number],
    orientation: Array.from(actor.subarray(3, 7)) as [number, number, number, number],
  };
}

/** Compile an arbitrary endpoint pair with the Python v2 contract. */
export function compileTransitionExact(
  source: TransitionState,
  target: TransitionState,
  inputRequest: TransitionRequest,
  profile: MotionProfileDefinition,
): TransitionProgram {
  const available = Math.min(source.recordCount, target.recordCount);
  const requestedCount = inputRequest.probeIdentityCount
    ?? (inputRequest.sourceSnapshot ? inputRequest.sourceSnapshot.recordCount : undefined);
  if (requestedCount === undefined && source.recordCount !== target.recordCount) throw new Error("unequal endpoint buffers require an explicit persistent-ID prefix count");
  const count = requestedCount ?? available;
  if (!Number.isInteger(count) || count < 1 || count > available) throw new Error(`probeIdentityCount ${count} exceeds supplied record count ${available}`);
  const request = normalizeRequest(source, inputRequest, count);
  const sourceRecordHash = recordsHash(source, count);
  const targetRecordHash = recordsHash(target, count);
  const sourceDescriptor = request.sourceSnapshot;
  const sourceEntry = stateEntry(source, sourceDescriptor ? `snapshot-${sourceDescriptor.snapshotHash.slice(0, 16)}` : request.sourceStateId!, count);
  if (sourceDescriptor) {
    sourceEntry.stateId = `snapshot-${sourceDescriptor.snapshotHash.slice(0, 16)}`;
    sourceEntry.contentHash = sourceDescriptor.snapshotHash;
    if (sourceDescriptor.recordCount !== count) throw new Error("sourceSnapshot recordCount does not match compile count");
    if (sourceDescriptor.snapshotHash !== snapshotHash(source, count)) throw new Error("sourceSnapshot hash does not match supplied transient records");
  } else if (request.sourceStateId !== sourceEntry.stateId) {
    throw new Error("request sourceStateId does not match source entry");
  }
  const targetEntry = stateEntry(target, request.targetStateId, count);
  if (request.targetStateId !== targetEntry.stateId) throw new Error("request targetStateId does not match target entry");
  const requestHash = sha256Hex(stableJsonBytes(request));
  const programId = `${sourceEntry.stateId}-to-${targetEntry.stateId}-${request.triggerMode}-${request.viewportProfile}-${requestHash.slice(0, 12)}`;
  const noOp = sourceRecordHash === targetRecordHash;
  let exactGroups: CompiledGroupTrack[] = [];
  let perId = emptyPerId();
  let routingGraph: RoutingNode[] = [];
  let bridgeTracks: BridgeTrack[] = [];
  let direction: Vec3 = [0, 0, 0];
  let duration = 0;
  let header: Record<string, unknown>;
  if (noOp) {
    header = {
      compilerVersion: "ps03m41-transition-compiler-v2.1",
      sourceStateId: sourceEntry.stateId,
      targetStateId: targetEntry.stateId,
      sourceKind: sourceDescriptor ? "transient-snapshot" : "frozen-state",
      motionProfileId: profile.profileId,
      motionProfileVersion: profile.profileVersion,
      triggerMode: request.triggerMode,
      viewportProfile: request.viewportProfile,
      deterministicSeed: request.deterministicSeed,
      identityCount: count,
      groupCount: 0,
      durationSeconds: 0,
      isNoOp: true,
      reducedMotion: Boolean(request.reducedMotion),
      directionAxis: [0, 0, 0],
      phasePolicy: phaseHeader(profile),
      actorTrack: {
        sourcePose: { position: [0, 0, 0], orientation: [0, 0, 0, 1] },
        centerStart: meanPosition(source, count),
        centerEnd: meanPosition(target, count),
        translationAxis: [0, 0, 0],
        rotationAxis: [0, 0, 1],
        translationAmplitude: 0,
        rotationRadians: 0,
        window: [0, 1],
      },
    };
  } else {
    const geometry = compileGeometry(source, target, count, request, profile, sourceEntry, targetEntry);
    exactGroups = geometry.exactGroups;
    perId = geometry.perId;
    routingGraph = geometry.routing;
    bridgeTracks = geometry.bridgeTracks;
    direction = geometry.direction;
    duration = durationSeconds(request, profile, sourceEntry, targetEntry, source, target, count);
    const normalSum: [number, number, number] = [0, 0, 0];
    for (let id = 0; id < count; id += 1) {
      const normal0 = normalAt(source, id);
      const normal1 = normalAt(target, id);
      for (let lane = 0; lane < 3; lane += 1) normalSum[lane] += normal0[lane] + normal1[lane];
    }
    const averageNormal = normalize(normalSum, orthogonal(direction));
    let rotationAxis = cross(direction, averageNormal);
    if (length3(rotationAxis) < 1e-9) rotationAxis = orthogonal(direction);
    rotationAxis = normalize(rotationAxis);
    const displacementReference = Math.min(quantile(Array.from(geometry.distance), 0.65), 1);
    const topologyFactor = Math.min(1, Math.abs(targetEntry.shellCount - sourceEntry.shellCount) / 3
      + Array.from(geometry.shellChanged).reduce((sum, value) => sum + value, 0) / count);
    const viewport = request.viewportProfile;
    header = {
      compilerVersion: "ps03m41-transition-compiler-v2.1",
      sourceStateId: sourceEntry.stateId,
      targetStateId: targetEntry.stateId,
      sourceKind: sourceDescriptor ? "transient-snapshot" : "frozen-state",
      motionProfileId: profile.profileId,
      motionProfileVersion: profile.profileVersion,
      triggerMode: request.triggerMode,
      viewportProfile: viewport,
      deterministicSeed: request.deterministicSeed,
      identityCount: count,
      groupCount: exactGroups.length,
      durationSeconds: duration,
      isNoOp: false,
      reducedMotion: Boolean(request.reducedMotion),
      directionAxis: direction.map((value) => Number(value.toFixed(12))),
      phasePolicy: phaseHeader(profile),
      activationPolicy: {
        depthRouteFraction: profile.reserveTransportPolicy.depthRouteFraction,
        minimumGeometricScale: profile.reserveTransportPolicy.minimumGeometricScale,
        bridgePulseMaximum: profile.scalePolicy.bridgePulseMaximum,
        bridgeThickness: profile.splitMergePolicy.bridgeThickness,
        phaseOffsetRange: profile.groupCoherencePolicy.localHandoffSpanFraction,
        localMorphWidthFraction: profile.groupCoherencePolicy.localMorphWidthFraction,
        routeOnlyDuringLocalHandoff: profile.groupCoherencePolicy.routeOnlyDuringLocalHandoff,
        endpointHoldOutsideHandoff: profile.groupCoherencePolicy.endpointHoldOutsideHandoff,
      },
      settlePolicy: {
        maximumAmplitudeFraction: profile.settlePolicy.maximumAmplitudeFraction[viewport],
        window: [...profile.phasePolicy.windows.settle],
      },
      actorTrack: {
        sourcePose: sourcePose(source),
        centerStart: meanPosition(source, count),
        centerEnd: meanPosition(target, count),
        translationAxis: direction.map((value) => Number(value.toFixed(12))),
        // Keep metadata hashing portable across NumPy/libm and JavaScript;
        // this is orders of magnitude below the packed float32 geometry
        // precision and changes no evaluated track.
        rotationAxis: rotationAxis.map((value) => Number(value.toFixed(12))),
        translationAmplitude: profile.globalPosePolicy.translationAmplitudeFraction[viewport] * displacementReference,
        rotationRadians: profile.globalPosePolicy.rotationRadiansMax[viewport] * topologyFactor,
        window: [...profile.phasePolicy.windows.anticipation],
      },
    };
  }

  const groupPayload = packGroups(exactGroups);
  const perIdPayload = noOp ? new Uint8Array() : packPerId(perId);
  const hashes: Record<string, string> = {
    sourceStateSha256: sourceEntry.contentHash ?? sourceRecordHash,
    targetStateSha256: targetEntry.contentHash ?? targetRecordHash,
    sourceRecordsSha256: sourceRecordHash,
    targetRecordsSha256: targetRecordHash,
    motionProfileSha256: profile.profileId === "directed-plastic-release" && profile.profileVersion === "2.2.0"
      ? PROFILE_SHA256
      : sha256Hex(stableJsonBytes(profile)),
    requestSha256: requestHash,
    groupTracksSha256: sha256Hex(groupPayload),
    perIdSha256: sha256Hex(perIdPayload),
    endpointLibraryFingerprint: ENDPOINT_LIBRARY_FINGERPRINT,
    endpointManifestSha256: ENDPOINT_MANIFEST_SHA256,
  };
  const metadataWithoutContent = makeMetadata(programId, header, routingGraph, bridgeTracks, groupPayload, perIdPayload, hashes);
  hashes.contentSha256 = sha256Hex(concatBytes(
    pythonMetadataHashBytes(metadataWithoutContent),
    groupPayload,
    perIdPayload,
  ));
  const metadata = makeMetadata(programId, header, routingGraph, bridgeTracks, groupPayload, perIdPayload, hashes);
  const activation = header.activationPolicy as CompiledProgramHeader["activationPolicy"] | undefined;
  const settle = header.settlePolicy as CompiledProgramHeader["settlePolicy"] | undefined;
  const compiledHeader = {
    ...(metadata.header as unknown as CompiledProgramHeader),
    // Runtime-only defaults are never included in the hashed no-op metadata.
    activationPolicy: activation ?? {
      bridgePulseMaximum: profile.scalePolicy.bridgePulseMaximum,
      bridgeThickness: profile.splitMergePolicy.bridgeThickness,
      depthRouteFraction: profile.reserveTransportPolicy.depthRouteFraction,
      minimumGeometricScale: profile.reserveTransportPolicy.minimumGeometricScale,
      phaseOffsetRange: profile.groupCoherencePolicy.localHandoffSpanFraction,
      localMorphWidthFraction: profile.groupCoherencePolicy.localMorphWidthFraction,
    },
    settlePolicy: settle ?? { maximumAmplitudeFraction: 0, window: profile.phasePolicy.windows.settle },
  };
  const tracks = exactGroups.map((group, index) => ({
    sourceGroup: group.sourceMacro & 0xff,
    targetGroup: group.targetMacro & 0xff,
    sourceShell: group.sourceMacro >>> 8,
    targetShell: group.targetMacro >>> 8,
    sourceCenter: group.sourceCenter,
    targetCenter: group.targetCenter,
    route: group.routeControl,
    mass: group.memberCount,
    protectedMass: geometryProtectedCount(exactGroups, index, perId),
    bridgeWeight: (group.flags & 16) !== 0 ? 1 : 0,
  }));
  const phaseDelay = new Float32Array(count);
  const bridgeWeight = new Float32Array(count);
  if (!noOp) for (let id = 0; id < count; id += 1) {
    phaseDelay[id] = perId.phaseOffset[id] / 255 * profile.groupCoherencePolicy.localHandoffSpanFraction;
    bridgeWeight[id] = (perId.flags[id] & 4) !== 0 ? 1 : 0;
  }
  return {
    schemaVersion: "1.1.0",
    programVersion: "2.1.0",
    programId,
    identitySpaceVersion: request.identitySpaceVersion,
    recordCount: count,
    durationMs: duration * 1000,
    capMs: (profile.timingPolicy.variants[request.triggerMode][request.viewportProfile].hardCapSeconds
      ?? profile.timingPolicy.durationBoundsSeconds[1]) * 1000,
    selfTransition: noOp,
    triggerMode: request.triggerMode,
    viewportProfile: request.viewportProfile,
    directionIntent: direction,
    phases: profile.phasePolicy.windows,
    tracks,
    trackIndex: noOp ? new Uint16Array(count) : perId.groupIndex,
    residual: noOp ? new Float32Array(count * 3) : perId.residual,
    phaseDelay,
    bridgeWeight,
    sourceVelocity: source.velocity,
    sourceScaleVelocity: (source as Partial<RuntimeTransitionSnapshot>).scaleVelocity,
    deterministicSeed: request.deterministicSeed,
    programSource: "on-demand-compiled",
    machineValid: true,
    compiled: {
      header: compiledHeader,
      groupTracks: exactGroups,
      perId,
      hashes,
      groupPayload,
      perIdPayload,
      metadata,
    },
  };
}

function geometryProtectedCount(groups: CompiledGroupTrack[], groupIndex: number, perId: CompiledPerId) {
  let count = 0;
  for (let id = 0; id < perId.groupIndex.length; id += 1) if (perId.groupIndex[id] === groupIndex && (perId.flags[id] & 8) !== 0) count += 1;
  return Math.min(count, groups[groupIndex]?.memberCount ?? 0);
}
