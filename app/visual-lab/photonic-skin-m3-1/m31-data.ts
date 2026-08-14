export const M31_DATA_BASE = "/photonic-skin/ps-03-m3-1";
export const M3_DATA_BASE = "/photonic-skin/ps-03-m3";

export type StateRole = "master" | "single" | "complex" | "brand_wide";
export type CompositionMode = "MASTER" | "SINGLE" | "FOCUS" | "GATHER" | "DRIVE";
export type ViewProfile = "desktop" | "mobile390" | "silhouette180" | "silhouette96";
export type CameraPreset = "canonical" | "alternate" | "side" | "top";
export type RoleFilter = "ALL" | "MASTER" | "SINGLE" | "FOCUS" | "GATHER" | "DRIVE" | "BRAND_WIDE";

export interface ComponentMapEntry {
  componentIndex: number;
  competencyId: string;
  componentId: string;
  semanticOwner: string;
  assemblyRole: string;
  visibleProfiles: ViewProfile[];
}

export interface StateEntry {
  stateId: string;
  stateVersion?: string;
  stateRole: StateRole;
  compositionMode: CompositionMode;
  competencyIds: string[];
  focusCompetencyId: string | null;
  displayName?: string;
  contentHash: string;
  baselineStateId?: string;
  bufferPath: string;
  bufferBytes: number;
  recordCount: number;
  recordStride: number;
  componentCount: number;
  shellCount: number;
  machineValidationStatus?: string;
  geometryChangedFromM3?: boolean;
  presentationFrame?: {
    translate: [number, number, number];
    scale: number;
    targetNdcHalfSpan: number;
    cameraRig: string;
  };
  componentMap?: ComponentMapEntry[];
  machineQa: {
    activeCount: number;
    reserveCount: number;
    componentQuotas: Record<string, number>;
  };
}

export interface M31Manifest {
  stage: string;
  schemaVersion: string;
  stateVersion: string;
  buildVersion: string;
  deterministicFingerprint: string;
  descriptorHash: string;
  stateCount: number;
  identitySpace: { identitySpaceVersion: string; size: number; recordStride: number };
  baseline: { stage: string; deterministicFingerprint: string; manifestSha256: string; stateCount: number };
  frozenM4: { deterministicFingerprint: string; deterministicAggregateSha256: string; stateCount: number; stateBuffersCopiedIntoM4: boolean };
  presentationContract: {
    fovDegrees: number;
    cameraAnimated: boolean;
    cameras: Record<CameraPreset, [number, number, number]>;
    profiles: Record<ViewProfile, { width: number; height: number; safeMargin: number }>;
  };
  inventory: Array<{ stateRole: StateRole; compositionMode: CompositionMode; cardinality: number; count: number }>;
  states: StateEntry[];
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

export interface QaSummary {
  status?: string;
  passed?: boolean;
  stateCount?: number;
  stateViewCount?: number;
  failureCount?: number;
  generatedAt?: string;
}

export interface StateFilters {
  role: RoleFilter;
  cardinality: number | "ALL";
  lead: string | "ALL";
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
    throw new Error(`Invalid fixed-stride state buffer: ${entry.stateId}`);
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

async function fetchJson<T>(path: string, message: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(message);
  return (await response.json()) as T;
}

export function loadM31Manifest() {
  return fetchJson<M31Manifest>(`${M31_DATA_BASE}/manifest.json`, "PS-03.M3.1 manifest is unavailable");
}

export function loadM3Manifest() {
  return fetchJson<{ states: StateEntry[] }>(`${M3_DATA_BASE}/manifest.json`, "PS-03.M3 baseline manifest is unavailable");
}

export async function loadQaSummary(): Promise<QaSummary | null> {
  const response = await fetch(`${M31_DATA_BASE}/qa-summary.json`);
  return response.ok ? (await response.json()) as QaSummary : null;
}

export function loadState(entry: StateEntry, dataBase = M31_DATA_BASE): Promise<DecodedState> {
  const key = `${dataBase}:${entry.stateId}:${entry.contentHash}`;
  const cached = stateCache.get(key);
  if (cached) return cached;
  const request = fetch(`${dataBase}/${entry.bufferPath}`).then(async (response) => {
    if (!response.ok) throw new Error(`State buffer is unavailable: ${entry.stateId}`);
    return decodeState(entry, await response.arrayBuffer());
  });
  stateCache.set(key, request);
  return request;
}

export function stateLabel(entry: StateEntry) {
  if (entry.displayName) return entry.displayName;
  if (entry.stateRole === "master") return "MASTER / Neutral";
  const competencies = entry.competencyIds.map(titleCase).join(" + ");
  if (entry.stateRole === "single") return `SINGLE / ${competencies}`;
  const mode = titleCase(entry.compositionMode.toLowerCase());
  if (entry.stateRole === "brand_wide") return `BRAND WIDE / ${mode} / ${competencies}`;
  const lead = entry.compositionMode === "FOCUS" && entry.focusCompetencyId
    ? ` / Lead: ${titleCase(entry.focusCompetencyId)}`
    : "";
  return `COMPLEX / ${mode} / ${competencies}${lead}`;
}

export function titleCase(value: string) {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}

export function filterStates(states: StateEntry[], filters: StateFilters) {
  return states.filter((entry) => {
    const roleMatches = filters.role === "ALL"
      || (filters.role === "MASTER" && entry.stateRole === "master")
      || (filters.role === "SINGLE" && entry.stateRole === "single")
      || (filters.role === "BRAND_WIDE" && entry.stateRole === "brand_wide")
      || (["FOCUS", "GATHER", "DRIVE"] as string[]).includes(filters.role)
        && entry.stateRole === "complex" && entry.compositionMode === filters.role;
    const cardinalityMatches = filters.cardinality === "ALL" || entry.competencyIds.length === filters.cardinality;
    const leadMatches = filters.lead === "ALL" || entry.focusCompetencyId === filters.lead;
    return roleMatches && cardinalityMatches && leadMatches;
  });
}

export function visibleComponents(entry: StateEntry, profile: ViewProfile) {
  if (!entry.componentMap) return new Set(Array.from({ length: entry.componentCount }, (_, index) => index));
  return new Set(entry.componentMap.filter((component) => component.visibleProfiles.includes(profile)).map((component) => component.componentIndex));
}

export function baselineStateFor(entry: StateEntry, baselineStates: StateEntry[]) {
  const stateId = entry.baselineStateId ?? entry.stateId;
  return baselineStates.find((candidate) => candidate.stateId === stateId) ?? null;
}
