export const DATA_BASE = "/photonic-skin/ps-03-m3";

export type StateRole = "master" | "single" | "complex" | "brand_wide";
export type CompositionMode = "MASTER" | "SINGLE" | "FOCUS" | "GATHER" | "DRIVE";

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

export interface TransitionEntry {
  transitionId: string;
  fromState: string;
  toState: string;
  routeKind: string;
  durationSeconds: number;
  bufferPath: string;
  bufferBytes: number;
}

export interface M3Manifest {
  stage: string;
  schemaVersion: string;
  deterministicFingerprint: string;
  identitySpace: {
    identitySpaceVersion: string;
    size: number;
  };
  v0: number;
  masterSurfaceArea: number;
  skinScaleCap: number;
  stateRecordLayout: { stride: number };
  canonicalCombinationCount: number;
  stateCount: number;
  states: StateEntry[];
  transitionCount: number;
  transitions: TransitionEntry[];
  lodTransitions: { levels: number[] };
}

export interface DecodedState {
  entry: StateEntry;
  position: Float32Array;
  normal: Float32Array;
  scale: Float32Array;
  component: Uint8Array;
  shell: Uint8Array;
  status: Uint8Array;
  flags: Uint8Array;
  density: Uint8Array;
  transitionGroup: Uint8Array;
}

const stateCache = new Map<string, Promise<DecodedState>>();

function halfToFloat(value: number) {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const fraction = value & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

export function decodeState(entry: StateEntry, payload: ArrayBuffer): DecodedState {
  if (entry.recordStride !== 40 || payload.byteLength !== entry.bufferBytes) {
    throw new Error(`Invalid ${entry.stateId} state buffer layout`);
  }
  const count = entry.recordCount;
  const view = new DataView(payload);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const scale = new Float32Array(count);
  const component = new Uint8Array(count);
  const shell = new Uint8Array(count);
  const status = new Uint8Array(count);
  const flags = new Uint8Array(count);
  const density = new Uint8Array(count);
  const transitionGroup = new Uint8Array(count);
  for (let id = 0; id < count; id += 1) {
    const offset = id * 40;
    for (let axis = 0; axis < 3; axis += 1) {
      position[id * 3 + axis] = view.getFloat32(offset + axis * 4, true);
      normal[id * 3 + axis] = view.getInt16(offset + 12 + axis * 2, true) / 32767;
    }
    scale[id] = halfToFloat(view.getUint16(offset + 26, true));
    component[id] = view.getUint8(offset + 30);
    shell[id] = view.getUint8(offset + 31);
    status[id] = view.getUint8(offset + 32);
    flags[id] = view.getUint8(offset + 33);
    density[id] = view.getUint8(offset + 34);
    transitionGroup[id] = view.getUint8(offset + 35);
  }
  return { entry, position, normal, scale, component, shell, status, flags, density, transitionGroup };
}

export async function loadManifest(): Promise<M3Manifest> {
  const response = await fetch(`${DATA_BASE}/manifest.json`);
  if (!response.ok) throw new Error("PS-03.M3 manifest is unavailable");
  return (await response.json()) as M3Manifest;
}

export function loadState(entry: StateEntry): Promise<DecodedState> {
  const cached = stateCache.get(entry.stateId);
  if (cached) return cached;
  const request = fetch(`${DATA_BASE}/${entry.bufferPath}`).then(async (response) => {
    if (!response.ok) throw new Error(`State buffer is unavailable: ${entry.stateId}`);
    return decodeState(entry, await response.arrayBuffer());
  });
  stateCache.set(entry.stateId, request);
  return request;
}

export function labelState(entry: StateEntry) {
  if (entry.stateRole === "master") return "MASTER / Sphere";
  const competencies = entry.competencyIds.join(" + ");
  const focus = entry.focusCompetencyId ? ` · focus ${entry.focusCompetencyId}` : "";
  return `${entry.compositionMode} / ${competencies}${focus}`;
}
