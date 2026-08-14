import type {
  CompiledGroupTrack,
  CompiledPerId,
  CompiledProgramHeader,
  TransitionProgram,
  TriggerMode,
  ViewportProfile,
} from "./m41-evaluator";

export const M3_DATA_BASE = "/photonic-skin/ps-03-m3-1r";
export const M41_DATA_BASE = "/photonic-skin/ps-03-m4-1";
export const STATE_RECORD_STRIDE = 40;
export const M31R_FINGERPRINT = "0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2";
export const M31R_MANIFEST_SHA256 = "530ca41e0faecf291ea9f674a7e383ae8739af0bddad578a765a7c264129ea82";
export const NESTED_LOD_LEVELS = [512, 1024, 2048, 4096, 8192, 12288, 16384] as const;

export type StateRole = "master" | "single" | "complex" | "brand_wide";
export type CompositionMode = "MASTER" | "SINGLE" | "FOCUS" | "GATHER" | "DRIVE" | "BRAND_WIDE";

export interface StateEntry {
  stateId: string;
  stateRole: StateRole;
  compositionMode: CompositionMode;
  competencyIds: string[];
  focusCompetencyId: string | null;
  contentHash: string;
  bufferPath: string;
  bufferBytes: number;
  recordCount: number;
  recordStride: number;
  componentCount: number;
  shellCount: number;
  surfaceArea: number;
  machineQa: {
    activeCount: number;
    reserveCount: number;
    componentQuotas: Record<string, number>;
  };
  approvalStatus: string;
}

export interface M3Manifest {
  stage: "PS-03.M3.1R";
  stateVersion: "3.1.1";
  schemaVersion: string;
  deterministicFingerprint: string;
  identitySpace: { identitySpaceVersion: string; size: number };
  stateRecordLayout: { stride: number; endianness?: string; fields?: string[] };
  stateCount: number;
  states: StateEntry[];
  lodTransitions: { levels: number[] };
  presentationContract: {
    cameras: Record<"canonical" | "alternate" | "side" | "top", readonly [number, number, number]>;
    fovDegrees: number;
  };
}

export interface M41ProgramEntry {
  programId: string;
  artifactId: string;
  sourceStateId: string;
  targetStateId: string;
  sourceStateHash: string;
  targetStateHash: string;
  motionProfileHash: string;
  requestHash: string;
  metadataPath: string;
  metadataBytes: number;
  metadataSha256: string;
  groupTrackPath: string;
  groupTrackBytes: number;
  groupTrackSha256: string;
  perIdPath: string;
  perIdBytes: number;
  perIdSha256: string;
  contentHash: string;
  identityCount: number;
}

export interface M41Manifest {
  stage: "PS-03.M4.1";
  schemaVersion: string;
  aggregateContentHash: string;
  buildConfigHash: string;
  endpointLibrary: {
    stage: "PS-03.M3.1R";
    stateVersion: "3.1.1";
    manifestPath: string;
    manifestSha256: string;
    deterministicFingerprint: string;
    identitySpaceVersion: string;
    identityCount: number;
  };
  motionProfile: { profileId: string; profileVersion: string; contentHash: string };
  programs: M41ProgramEntry[];
  programLayout?: {
    layoutVersion: string;
    endianness: "little";
    groupTracks: { stride: number; recordStride?: number };
    perId: { stride: number; recordStride?: number };
  };
  runtime?: { stateCacheEntries?: number; programCacheEntries?: number };
}

export interface RuntimeManifests {
  m3: M3Manifest;
  m4: M41Manifest;
}

/** Full little-endian decode of the frozen M3 40-byte state record. */
export interface DecodedState {
  entry: StateEntry;
  recordCount: number;
  position: Float32Array;
  normal: Float32Array;
  orientation: Float32Array;
  scale: Float32Array;
  reserveDepth: Float32Array;
  component: Uint8Array;
  shell: Uint8Array;
  status: Uint8Array;
  flags: Uint8Array;
  density: Uint8Array;
  transitionGroup: Uint8Array;
  lodPriority: Uint16Array;
  /** Original frozen M3 records; retained for exact M4 compiler hashes. */
  rawRecords?: Uint8Array;
}

export function halfToFloat(value: number) {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >>> 10) & 0x1f;
  const fraction = value & 0x03ff;
  if (exponent === 0) return fraction === 0 ? sign * 0 : sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 0x1f) return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

export const GROUP_TRACK_STRIDE = 64;
export const PER_ID_STRIDE = 32;

export interface CompiledProgramMetadata {
  schemaVersion: "1.1.0";
  programVersion: "2.1.0";
  programId: string;
  identitySpaceVersion: string;
  header: CompiledProgramHeader;
  buffers: {
    groupTracks: { byteLength: number; recordCount: number; recordStride: number; sha256: string };
    perId: { byteLength: number; recordCount: number; recordStride: number; sha256: string };
  };
  byteLayout: {
    endianness: "little";
    groupTracks: { recordStride: number };
    perId: { recordStride: number };
  };
  hashes: Record<string, string>;
}

function finiteValues(values: readonly number[], label: string) {
  if (!values.every(Number.isFinite)) throw new Error(`Compiled program contains non-finite ${label}`);
}

/** Decode the Python compiler's frozen 64-byte group and 32-byte per-ID layouts. */
export function decodeCompiledProgram(
  metadata: CompiledProgramMetadata,
  groupPayload: ArrayBuffer,
  perIdPayload: ArrayBuffer,
): TransitionProgram {
  const groupInfo = metadata.buffers.groupTracks;
  const perIdInfo = metadata.buffers.perId;
  if (
    metadata.schemaVersion !== "1.1.0"
    || metadata.programVersion !== "2.1.0"
    || metadata.byteLayout.endianness !== "little"
    || groupInfo.recordStride !== GROUP_TRACK_STRIDE
    || metadata.byteLayout.groupTracks.recordStride !== GROUP_TRACK_STRIDE
    || perIdInfo.recordStride !== PER_ID_STRIDE
    || metadata.byteLayout.perId.recordStride !== PER_ID_STRIDE
  ) throw new Error("Compiled TransitionProgram byte layout/version is unsupported");
  if (
    groupPayload.byteLength !== groupInfo.byteLength
    || groupPayload.byteLength !== groupInfo.recordCount * GROUP_TRACK_STRIDE
    || groupInfo.recordCount !== metadata.header.groupCount
  ) throw new Error("Compiled TransitionProgram group buffer length/count mismatch");
  if (
    perIdPayload.byteLength !== perIdInfo.byteLength
    || perIdPayload.byteLength !== perIdInfo.recordCount * PER_ID_STRIDE
    || perIdInfo.recordCount !== metadata.header.identityCount
  ) throw new Error("Compiled TransitionProgram per-ID buffer length/count mismatch");

  const groupView = new DataView(groupPayload);
  const groupTracks: CompiledGroupTrack[] = [];
  const legacyTracks: TransitionProgram["tracks"] = [];
  for (let index = 0; index < groupInfo.recordCount; index += 1) {
    const offset = index * GROUP_TRACK_STRIDE;
    const vector = (lane: number, half = false): [number, number, number] => [0, 1, 2].map((axis) => (
      half
        ? halfToFloat(groupView.getUint16(offset + lane + axis * 2, true))
        : groupView.getFloat32(offset + lane + axis * 4, true)
    )) as [number, number, number];
    const sourceCenter = vector(0);
    const targetCenter = vector(12);
    const routeControl = vector(24);
    const direction = vector(36, true);
    const sourceMacro = groupView.getUint16(offset + 54, true);
    const targetMacro = groupView.getUint16(offset + 56, true);
    const track: CompiledGroupTrack = {
      sourceCenter,
      targetCenter,
      routeControl,
      direction,
      releaseStart: halfToFloat(groupView.getUint16(offset + 42, true)),
      releaseEnd: halfToFloat(groupView.getUint16(offset + 44, true)),
      revealStart: halfToFloat(groupView.getUint16(offset + 46, true)),
      revealEnd: halfToFloat(groupView.getUint16(offset + 48, true)),
      bridgeStart: halfToFloat(groupView.getUint16(offset + 50, true)),
      bridgeEnd: halfToFloat(groupView.getUint16(offset + 52, true)),
      sourceMacro,
      targetMacro,
      flags: groupView.getUint16(offset + 58, true),
      memberCount: groupView.getUint16(offset + 60, true),
    };
    finiteValues([
      ...sourceCenter, ...targetCenter, ...routeControl, ...direction,
      track.releaseStart, track.releaseEnd, track.revealStart, track.revealEnd,
      track.bridgeStart, track.bridgeEnd,
    ], `group track ${index}`);
    groupTracks.push(track);
    legacyTracks.push({
      sourceGroup: sourceMacro & 0xff,
      targetGroup: targetMacro & 0xff,
      sourceShell: sourceMacro >>> 8,
      targetShell: targetMacro >>> 8,
      sourceCenter,
      targetCenter,
      route: routeControl,
      mass: track.memberCount,
      protectedMass: (track.flags & 8) !== 0 ? track.memberCount : 0,
      bridgeWeight: (track.flags & 16) !== 0 ? 1 : 0,
    });
  }

  const count = perIdInfo.recordCount;
  const perIdView = new DataView(perIdPayload);
  const localSource = new Float32Array(count * 3);
  const localTarget = new Float32Array(count * 3);
  const residual = new Float32Array(count * 3);
  const depth = new Float32Array(count);
  const activationStart = new Float32Array(count);
  const activationEnd = new Float32Array(count);
  const scaleBias = new Float32Array(count);
  const groupIndex = new Uint16Array(count);
  const flags = new Uint16Array(count);
  const phaseOffset = new Uint8Array(count);
  for (let id = 0; id < count; id += 1) {
    const offset = id * PER_ID_STRIDE;
    const p = id * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      localSource[p + axis] = halfToFloat(perIdView.getUint16(offset + axis * 2, true));
      localTarget[p + axis] = halfToFloat(perIdView.getUint16(offset + 6 + axis * 2, true));
      residual[p + axis] = halfToFloat(perIdView.getUint16(offset + 12 + axis * 2, true));
    }
    depth[id] = halfToFloat(perIdView.getUint16(offset + 18, true));
    activationStart[id] = halfToFloat(perIdView.getUint16(offset + 20, true));
    activationEnd[id] = halfToFloat(perIdView.getUint16(offset + 22, true));
    scaleBias[id] = halfToFloat(perIdView.getUint16(offset + 24, true));
    groupIndex[id] = perIdView.getUint16(offset + 26, true);
    flags[id] = perIdView.getUint16(offset + 28, true);
    phaseOffset[id] = perIdView.getUint8(offset + 30);
    if (groupIndex[id] >= groupTracks.length) throw new Error(`Compiled ID ${id} has an invalid group index`);
  }
  finiteValues([...localSource, ...localTarget, ...residual, ...depth, ...activationStart, ...activationEnd, ...scaleBias], "per-ID lanes");
  const compiledPerId: CompiledPerId = {
    localSource, localTarget, residual, depth, activationStart, activationEnd,
    scaleBias, groupIndex, flags, phaseOffset,
  };
  const phaseDelay = new Float32Array(count);
  const bridgeWeight = new Float32Array(count);
  const phaseRange = metadata.header.activationPolicy.phaseOffsetRange;
  for (let id = 0; id < count; id += 1) {
    phaseDelay[id] = phaseOffset[id] / 255 * phaseRange;
    bridgeWeight[id] = (flags[id] & 4) !== 0 ? 1 : 0;
  }
  const windows = metadata.header.phasePolicy.windows;
  return {
    schemaVersion: "1.1.0",
    programVersion: "2.1.0",
    programId: metadata.programId,
    identitySpaceVersion: metadata.identitySpaceVersion,
    recordCount: count,
    durationMs: metadata.header.durationSeconds * 1000,
    capMs: metadata.header.durationSeconds * 1000,
    selfTransition: metadata.header.isNoOp,
    triggerMode: metadata.header.triggerMode,
    viewportProfile: metadata.header.viewportProfile,
    directionIntent: metadata.header.directionAxis,
    phases: windows,
    tracks: legacyTracks,
    trackIndex: groupIndex,
    residual,
    phaseDelay,
    bridgeWeight,
    deterministicSeed: metadata.header.deterministicSeed >>> 0,
    programSource: "precompiled",
    machineValid: true,
    compiled: { header: metadata.header, groupTracks, perId: compiledPerId, hashes: metadata.hashes },
  };
}

export function decodeState(entry: StateEntry, payload: ArrayBuffer): DecodedState {
  if (entry.recordStride !== STATE_RECORD_STRIDE) {
    throw new Error(`Invalid ${entry.stateId} state stride: ${entry.recordStride}`);
  }
  if (payload.byteLength !== entry.bufferBytes || payload.byteLength !== entry.recordCount * STATE_RECORD_STRIDE) {
    throw new Error(`Invalid ${entry.stateId} state buffer length`);
  }
  const count = entry.recordCount;
  const view = new DataView(payload);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const orientation = new Float32Array(count * 4);
  const scale = new Float32Array(count);
  const reserveDepth = new Float32Array(count);
  const component = new Uint8Array(count);
  const shell = new Uint8Array(count);
  const status = new Uint8Array(count);
  const flags = new Uint8Array(count);
  const density = new Uint8Array(count);
  const transitionGroup = new Uint8Array(count);
  const lodPriority = new Uint16Array(count);

  for (let id = 0; id < count; id += 1) {
    const offset = id * STATE_RECORD_STRIDE;
    const p = id * 3;
    const q = id * 4;
    for (let axis = 0; axis < 3; axis += 1) {
      position[p + axis] = view.getFloat32(offset + axis * 4, true);
      normal[p + axis] = view.getInt16(offset + 12 + axis * 2, true) / 32767;
    }
    let qLength = 0;
    for (let lane = 0; lane < 4; lane += 1) {
      const value = view.getInt16(offset + 18 + lane * 2, true) / 32767;
      orientation[q + lane] = value;
      qLength += value * value;
    }
    qLength = Math.sqrt(qLength);
    if (qLength > 1e-12) {
      for (let lane = 0; lane < 4; lane += 1) orientation[q + lane] /= qLength;
    } else {
      orientation[q + 3] = 1;
    }
    scale[id] = halfToFloat(view.getUint16(offset + 26, true));
    reserveDepth[id] = halfToFloat(view.getUint16(offset + 28, true));
    component[id] = view.getUint8(offset + 30);
    shell[id] = view.getUint8(offset + 31);
    status[id] = view.getUint8(offset + 32);
    flags[id] = view.getUint8(offset + 33);
    density[id] = view.getUint8(offset + 34);
    transitionGroup[id] = view.getUint8(offset + 35);
    lodPriority[id] = view.getUint16(offset + 36, true);
  }
  return {
    entry,
    recordCount: count,
    position,
    normal,
    orientation,
    scale,
    reserveDepth,
    component,
    shell,
    status,
    flags,
    density,
    transitionGroup,
    lodPriority,
    rawRecords: new Uint8Array(payload),
  };
}

export class LruCache<K, V> {
  readonly limit: number;
  private readonly values = new Map<K, V>();

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError("LRU limit must be a positive integer");
    this.limit = limit;
  }

  get size() {
    return this.values.size;
  }

  has(key: K) {
    return this.values.has(key);
  }

  get(key: K) {
    const value = this.values.get(key);
    if (value === undefined) return undefined;
    this.values.delete(key);
    this.values.set(key, value);
    return value;
  }

  set(key: K, value: V) {
    this.values.delete(key);
    this.values.set(key, value);
    while (this.values.size > this.limit) {
      const oldest = this.values.keys().next().value as K | undefined;
      if (oldest === undefined) break;
      this.values.delete(oldest);
    }
    return value;
  }

  delete(key: K) {
    return this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }

  keys() {
    return [...this.values.keys()];
  }
}

export const runtimeStateCache = new LruCache<string, DecodedState>(4);
export const runtimeProgramCache = new LruCache<string, TransitionProgram>(6);

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function sha256Hex(payload: ArrayBuffer | string) {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 Web Crypto is unavailable; compiled program integrity cannot be verified");
  const input = typeof payload === "string" ? new TextEncoder().encode(payload).buffer : payload;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function verifySha256(payload: ArrayBuffer, expected: string, label: string) {
  const actual = await sha256Hex(payload);
  if (actual !== expected.toLowerCase()) throw new Error(`${label} SHA-256 mismatch`);
  return actual;
}

async function fetchBytes(url: string, signal: AbortSignal | undefined, fetchImpl: FetchLike) {
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw new Error(`Runtime asset is unavailable (${response.status}): ${url}`);
  return response.arrayBuffer();
}

async function fetchJson<T>(url: string, signal?: AbortSignal, fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw new Error(`Runtime asset is unavailable (${response.status}): ${url}`);
  return await response.json() as T;
}

export async function loadM3Manifest(signal?: AbortSignal, fetchImpl: FetchLike = fetch, expectedSha256?: string) {
  const payload = await fetchBytes(`${M3_DATA_BASE}/manifest.json`, signal, fetchImpl);
  await verifySha256(payload, expectedSha256 ?? M31R_MANIFEST_SHA256, "Frozen PS-03.M3.1R manifest");
  const parsed = JSON.parse(new TextDecoder().decode(payload)) as Omit<M3Manifest, "lodTransitions">;
  if (
    parsed.stage !== "PS-03.M3.1R"
    || parsed.stateVersion !== "3.1.1"
    || parsed.deterministicFingerprint !== M31R_FINGERPRINT
    || parsed.stateCount !== 154
    || parsed.states.length !== 154
    || parsed.stateRecordLayout.stride !== STATE_RECORD_STRIDE
    || parsed.identitySpace.size !== 16384
  ) {
    throw new Error("Frozen PS-03.M3.1R identity/state/version contract does not match M4.1");
  }
  return { ...parsed, lodTransitions: { levels: [...NESTED_LOD_LEVELS] } } as M3Manifest;
}

export async function loadM41Manifest(signal?: AbortSignal, fetchImpl?: FetchLike) {
  const manifest = await fetchJson<M41Manifest>(`${M41_DATA_BASE}/manifest.json`, signal, fetchImpl);
  if (
    manifest.stage !== "PS-03.M4.1"
    || manifest.endpointLibrary?.stage !== "PS-03.M3.1R"
    || manifest.endpointLibrary?.stateVersion !== "3.1.1"
    || manifest.endpointLibrary?.deterministicFingerprint !== M31R_FINGERPRINT
    || manifest.endpointLibrary?.manifestSha256 !== M31R_MANIFEST_SHA256
    || manifest.endpointLibrary?.identityCount !== 16384
    || manifest.motionProfile?.profileVersion !== "2.2.0"
    || !manifest.aggregateContentHash
    || !manifest.buildConfigHash
  ) throw new Error("PS-03.M4.1 manifest is absent or incompatible with the final endpoint rebase");
  return manifest;
}

export async function loadRuntimeManifests(signal?: AbortSignal, fetchImpl: FetchLike = fetch): Promise<RuntimeManifests> {
  const m4 = await loadM41Manifest(signal, fetchImpl);
  const m3 = await loadM3Manifest(signal, fetchImpl, m4.endpointLibrary.manifestSha256);
  if (m4.endpointLibrary.deterministicFingerprint !== m3.deterministicFingerprint) {
    throw new Error("M4.1 manifest references a different frozen M3.1R fingerprint");
  }
  return { m3, m4 };
}

export interface LoadStateOptions {
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
  cache?: LruCache<string, DecodedState>;
}

export async function loadState(entry: StateEntry, options: LoadStateOptions = {}) {
  const cache = options.cache ?? runtimeStateCache;
  const cached = cache.get(entry.stateId);
  if (cached) return cached;
  const response = await (options.fetchImpl ?? fetch)(`${M3_DATA_BASE}/${entry.bufferPath}`, { signal: options.signal });
  if (!response.ok) throw new Error(`State buffer is unavailable: ${entry.stateId}`);
  const payload = await response.arrayBuffer();
  await verifySha256(payload, entry.contentHash, `${entry.stateId} state buffer`);
  const decoded = decodeState(entry, payload);
  if (options.signal?.aborted) throw new DOMException("State request aborted", "AbortError");
  cache.set(entry.stateId, decoded);
  return decoded;
}

export interface RequestHandle {
  token: number;
  signal: AbortSignal;
}

export class LatestRequestGate {
  private sequence = 0;
  private controller: AbortController | null = null;

  begin(): RequestHandle {
    this.controller?.abort();
    this.controller = new AbortController();
    this.sequence += 1;
    return { token: this.sequence, signal: this.controller.signal };
  }

  isCurrent(token: number) {
    return token === this.sequence && !this.controller?.signal.aborted;
  }

  commit<T>(token: number, value: T, write: (value: T) => void) {
    if (!this.isCurrent(token)) return false;
    write(value);
    return true;
  }

  cancel() {
    this.controller?.abort();
    this.sequence += 1;
  }
}

export class StaleRequestError extends Error {
  constructor() {
    super("A newer transition request superseded this load");
    this.name = "StaleRequestError";
  }
}

export async function loadLatestStatePair(
  manifest: M3Manifest,
  sourceId: string,
  targetId: string,
  gate: LatestRequestGate,
  options: Omit<LoadStateOptions, "signal"> = {},
) {
  const sourceEntry = manifest.states.find((entry) => entry.stateId === sourceId);
  const targetEntry = manifest.states.find((entry) => entry.stateId === targetId);
  if (!sourceEntry || !targetEntry) throw new Error("Transition pair does not exist in the M3 manifest");
  const handle = gate.begin();
  const pair = await Promise.all([
    loadState(sourceEntry, { ...options, signal: handle.signal }),
    loadState(targetEntry, { ...options, signal: handle.signal }),
  ]);
  if (!gate.isCurrent(handle.token)) throw new StaleRequestError();
  return { token: handle.token, signal: handle.signal, source: pair[0], target: pair[1] };
}

export class PrecompiledProgramUnavailableError extends Error {
  constructor(sourceStateId: string, targetStateId: string, trigger: TriggerMode, viewport: ViewportProfile) {
    super(`No matching precompiled approval program: ${sourceStateId} -> ${targetStateId} (${trigger}/${viewport})`);
    this.name = "PrecompiledProgramUnavailableError";
  }
}

export interface LoadPrecompiledProgramOptions {
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
  cache?: LruCache<string, TransitionProgram>;
}

/**
 * Resolve an approval artifact by the complete request tuple. Endpoint names
 * are manifest lookup keys only; all motion remains encoded in numeric tracks.
 */
export async function loadMatchingPrecompiledProgram(
  manifest: M41Manifest,
  source: DecodedState,
  target: DecodedState,
  trigger: TriggerMode,
  viewport: ViewportProfile,
  options: LoadPrecompiledProgramOptions = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = options.cache ?? runtimeProgramCache;
  const candidates = manifest.programs.filter((entry) => (
    entry.sourceStateId === source.entry.stateId && entry.targetStateId === target.entry.stateId
  ));
  for (const entry of candidates) {
    const bindingKey = [
      entry.programId,
      manifest.aggregateContentHash,
      manifest.buildConfigHash,
      manifest.endpointLibrary.deterministicFingerprint,
      manifest.motionProfile.contentHash,
      entry.contentHash,
    ].join(":");
    const cached = cache.get(bindingKey);
    if (cached && cached.triggerMode === trigger && cached.viewportProfile === viewport) return cached;
    const metadataPayload = await fetchBytes(`${M41_DATA_BASE}/${entry.metadataPath}`, options.signal, fetchImpl);
    if (metadataPayload.byteLength !== entry.metadataBytes) throw new Error(`${entry.programId} metadata length mismatch`);
    const metadataSha = await verifySha256(metadataPayload, entry.metadataSha256, `${entry.programId} metadata`);
    const metadata = JSON.parse(new TextDecoder().decode(metadataPayload)) as CompiledProgramMetadata;
    if (
      metadata.programId !== entry.programId
      || metadata.header.sourceStateId !== entry.sourceStateId
      || metadata.header.targetStateId !== entry.targetStateId
    ) throw new Error(`${entry.programId} metadata identity mismatch`);
    if (metadata.header.triggerMode !== trigger || metadata.header.viewportProfile !== viewport) continue;
    if (
      source.entry.contentHash !== entry.sourceStateHash
      || target.entry.contentHash !== entry.targetStateHash
      || metadata.hashes.sourceStateSha256 !== entry.sourceStateHash
      || metadata.hashes.targetStateSha256 !== entry.targetStateHash
    ) throw new Error(`${entry.programId} endpoint hash mismatch`);
    if (
      metadata.identitySpaceVersion !== manifest.endpointLibrary.identitySpaceVersion
      || metadata.header.identityCount !== entry.identityCount
      || metadata.hashes.motionProfileSha256 !== entry.motionProfileHash
      || entry.motionProfileHash !== manifest.motionProfile.contentHash
      || metadata.hashes.requestSha256 !== entry.requestHash
      || metadata.hashes.endpointLibraryFingerprint !== manifest.endpointLibrary.deterministicFingerprint
      || metadata.hashes.endpointManifestSha256 !== manifest.endpointLibrary.manifestSha256
      || metadata.header.endpointLibrary?.deterministicFingerprint !== manifest.endpointLibrary.deterministicFingerprint
      || metadata.header.endpointLibrary?.manifestSha256 !== manifest.endpointLibrary.manifestSha256
    ) throw new Error(`${entry.programId} request/profile/identity hash binding mismatch`);
    if (
      manifest.programLayout
      && (
        manifest.programLayout.endianness !== "little"
        || (manifest.programLayout.groupTracks.stride ?? manifest.programLayout.groupTracks.recordStride) !== GROUP_TRACK_STRIDE
        || (manifest.programLayout.perId.stride ?? manifest.programLayout.perId.recordStride) !== PER_ID_STRIDE
      )
    ) throw new Error("M4 manifest program layout is incompatible with the browser decoder");
    const [groupPayload, perIdPayload] = await Promise.all([
      fetchBytes(`${M41_DATA_BASE}/${entry.groupTrackPath}`, options.signal, fetchImpl),
      fetchBytes(`${M41_DATA_BASE}/${entry.perIdPath}`, options.signal, fetchImpl),
    ]);
    if (groupPayload.byteLength !== entry.groupTrackBytes || perIdPayload.byteLength !== entry.perIdBytes) {
      throw new Error(`${entry.programId} compiled buffer length mismatch`);
    }
    const [groupSha, perIdSha] = await Promise.all([
      verifySha256(groupPayload, entry.groupTrackSha256, `${entry.programId} group buffer`),
      verifySha256(perIdPayload, entry.perIdSha256, `${entry.programId} per-ID buffer`),
    ]);
    if (
      groupSha !== metadata.buffers.groupTracks.sha256
      || groupSha !== metadata.hashes.groupTracksSha256
      || perIdSha !== metadata.buffers.perId.sha256
      || perIdSha !== metadata.hashes.perIdSha256
    ) throw new Error(`${entry.programId} internal buffer hash mismatch`);
    const contentHash = await sha256Hex(`${JSON.stringify({
      groupTracks: groupSha,
      metadata: metadataSha,
      perId: perIdSha,
    })}\n`);
    if (contentHash !== entry.contentHash) throw new Error(`${entry.programId} aggregate content hash mismatch`);
    const program = decodeCompiledProgram(metadata, groupPayload, perIdPayload);
    if (options.signal?.aborted) throw new DOMException("Program request aborted", "AbortError");
    cache.set(bindingKey, program);
    return program;
  }
  throw new PrecompiledProgramUnavailableError(source.entry.stateId, target.entry.stateId, trigger, viewport);
}

export async function getOrCompileProgram(
  key: string,
  compile: () => TransitionProgram | Promise<TransitionProgram>,
  cache = runtimeProgramCache,
) {
  const cached = cache.get(key);
  if (cached) return cached;
  const program = await compile();
  cache.set(key, program);
  return program;
}

export function labelState(entry: StateEntry) {
  if (entry.stateRole === "master") return "MASTER / Sphere";
  const competencies = entry.competencyIds.join(" + ");
  const focus = entry.focusCompetencyId ? ` · focus ${entry.focusCompetencyId}` : "";
  return `${entry.compositionMode} / ${competencies}${focus}`;
}

export type DebugMode = "neutral" | "phase" | "groups" | "shells" | "bridge" | "reserve" | "residual" | "orientation" | "identity"
  | "components" | "features" | "trajectories" | "collision";
export type CameraPreset = "canonical" | "alternate" | "side" | "top";
export type ComparisonMode = "m41" | "endpoint" | "previous-m4" | "side-by-side";
export type LabFrame = "desktop" | "mobile390" | "silhouette180" | "silhouette96";

export interface M41QueryPreset {
  source: string;
  target: string;
  trigger: "route" | "lab-scroll-scrub" | "qa";
  viewport: "desktop" | "mobile";
  frame: LabFrame;
  reduced: boolean;
  comparison: ComparisonMode;
  debug: DebugMode;
  camera: CameraPreset;
  lod: number;
  progress: number;
  seed: number;
  autoplay: boolean;
}

const DEBUG_MODES: DebugMode[] = ["neutral", "phase", "groups", "shells", "bridge", "reserve", "residual", "orientation", "identity", "components", "features", "trajectories", "collision"];
const CAMERAS: CameraPreset[] = ["canonical", "alternate", "side", "top"];
const COMPARISONS: ComparisonMode[] = ["m41", "endpoint", "previous-m4", "side-by-side"];
const FRAMES: LabFrame[] = ["desktop", "mobile390", "silhouette180", "silhouette96"];
const LODS = [512, 1024, 2048, 4096, 8192, 12288, 16384];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function queryRecord(input: URLSearchParams | Record<string, string | string[] | undefined>) {
  if (input instanceof URLSearchParams) return Object.fromEntries(input.entries());
  return input;
}

function enumValue<T extends string>(value: string | undefined, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? value as T : fallback;
}

function safeStateId(value: string | undefined) {
  return value && /^[a-z0-9][a-z0-9-]{0,159}$/i.test(value) ? value : "";
}

export function parseM41Query(input: URLSearchParams | Record<string, string | string[] | undefined>): M41QueryPreset {
  const values = queryRecord(input);
  const number = (key: string) => Number(first(values[key]));
  const requestedLod = number("lod");
  return {
    source: safeStateId(first(values.source)),
    target: safeStateId(first(values.target)),
    trigger: enumValue(first(values.trigger), ["route", "lab-scroll-scrub", "qa"] as const, "route"),
    viewport: enumValue(first(values.viewport), ["desktop", "mobile"] as const, "desktop"),
    frame: enumValue(first(values.frame), FRAMES, "desktop"),
    reduced: first(values.reduced) === "1" || first(values.reduced) === "true",
    comparison: enumValue(first(values.compare), COMPARISONS, "m41"),
    debug: enumValue(first(values.debug), DEBUG_MODES, "neutral"),
    camera: enumValue(first(values.camera), CAMERAS, "canonical"),
    lod: LODS.includes(requestedLod) ? requestedLod : 8192,
    progress: Math.min(1, Math.max(0, Number.isFinite(number("t")) ? number("t") : 0)),
    seed: Number.isInteger(number("seed")) ? number("seed") >>> 0 : 0x4d344c42,
    autoplay: first(values.play) === "1" || first(values.play) === "true",
  };
}

export function serializeM41Query(preset: M41QueryPreset) {
  const query = new URLSearchParams({
    source: preset.source,
    target: preset.target,
    trigger: preset.trigger,
    viewport: preset.viewport,
    frame: preset.frame,
    reduced: preset.reduced ? "1" : "0",
    compare: preset.comparison,
    debug: preset.debug,
    camera: preset.camera,
    lod: String(preset.lod),
    t: preset.progress.toFixed(3),
    seed: String(preset.seed >>> 0),
    play: preset.autoplay ? "1" : "0",
  });
  return query.toString();
}
