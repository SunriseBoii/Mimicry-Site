import { decodeState, type DecodedState, type StateEntry } from "../../photonic-skin-m4-1/m41-data";
import type { PresentationStateEntry } from "../../photonic-skin-m4-1r/photonic-presentation";
import {
  VARIANT_BUFFER_PATH,
  VARIANT_COMPONENT_MAP_PATH,
  type SandboxIsolateId,
  type VideoVariantId,
} from "./sandbox-query";

const ALL_PROFILES = ["desktop", "mobile390", "silhouette180", "silhouette96"] as const;

const COMBO_GROUPS: Record<Exclude<SandboxIsolateId, "full">, number[]> = {
  camera: [0, 1, 2, 3],
  clapperboard: [4, 5, 6],
  "hinged-bar": [6],
};

const CAMERA_GROUPS: Record<Exclude<SandboxIsolateId, "full">, number[]> = {
  camera: [0, 1, 2, 3],
  clapperboard: [],
  "hinged-bar": [],
};

const BASELINE_GROUPS: Record<Exclude<SandboxIsolateId, "full">, number[]> = {
  camera: [0],
  clapperboard: [1],
  "hinged-bar": [1],
};

export function isVideoStateId(stateId: string) {
  return stateId === "single-video";
}

export async function sha256Hex(payload: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", payload as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isolateIndices(variant: VideoVariantId, isolate: SandboxIsolateId): number[] | null {
  if (isolate === "full") return null;
  if (variant === "baseline") return BASELINE_GROUPS[isolate];
  if (variant.startsWith("camera-")) return CAMERA_GROUPS[isolate];
  return COMBO_GROUPS[isolate];
}

export function cloneVideoEntry(
  entry: StateEntry,
  variant: VideoVariantId,
  bufferBytes: number,
  contentHash: string,
  componentMap: PresentationStateEntry["componentMap"],
  isolate: SandboxIsolateId = "full",
): StateEntry {
  const allowed = isolateIndices(variant, isolate);
  const mapped = (componentMap ?? []).map((component) => ({
    ...component,
    visibleProfiles: allowed && !allowed.includes(component.componentIndex) ? [] : [...ALL_PROFILES],
  }));
  return {
    ...entry,
    bufferBytes,
    contentHash,
    componentMap: mapped,
  } as StateEntry;
}

const mapCache = new Map<VideoVariantId, PresentationStateEntry["componentMap"]>();

export async function loadVideoComponentMap(variant: VideoVariantId, signal?: AbortSignal) {
  const hit = mapCache.get(variant);
  if (hit) return hit;
  const response = await fetch(VARIANT_COMPONENT_MAP_PATH[variant], { signal });
  if (!response.ok) throw new Error(`Video component map missing: ${variant}`);
  const payload = await response.json() as { componentMap: PresentationStateEntry["componentMap"] };
  mapCache.set(variant, payload.componentMap);
  return payload.componentMap;
}

export async function loadVideoVariantBuffer(variant: VideoVariantId, signal?: AbortSignal) {
  const response = await fetch(VARIANT_BUFFER_PATH[variant], { signal });
  if (!response.ok) throw new Error(`Video variant buffer missing: ${variant}`);
  const payload = await response.arrayBuffer();
  return { payload, hash: await sha256Hex(payload) };
}

export async function overlayVideoState(
  state: DecodedState,
  variant: VideoVariantId,
  signal?: AbortSignal,
  isolate: SandboxIsolateId = "full",
) {
  if (!isVideoStateId(state.entry.stateId)) return state;
  const [{ payload, hash }, componentMap] = await Promise.all([
    loadVideoVariantBuffer(variant, signal),
    loadVideoComponentMap(variant, signal),
  ]);
  return decodeState(cloneVideoEntry(state.entry, variant, payload.byteLength, hash, componentMap, isolate), payload);
}

export function bboxOf(state: DecodedState) {
  const live = state.status;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let count = 0;
  let cx = 0, cy = 0, cz = 0;
  for (let id = 0; id < state.recordCount; id += 1) {
    if (live[id] !== 0) continue;
    const p = id * 3;
    const x = state.position[p];
    const y = state.position[p + 1];
    const z = state.position[p + 2];
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
    cx += x; cy += y; cz += z;
    count += 1;
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    centroid: count ? [cx / count, cy / count, cz / count] : [0, 0, 0],
    activeCount: count,
  };
}

export function componentCounts(state: DecodedState) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (let id = 0; id < state.recordCount; id += 1) {
    if (state.status[id] !== 0) continue;
    const component = state.component[id];
    if (component >= 0 && component < counts.length) counts[component] += 1;
  }
  return counts;
}

export function cameraActiveCount(state: DecodedState, variant: VideoVariantId) {
  const allowed = variant === "baseline" ? [0] : [0, 1, 2, 3];
  let count = 0;
  for (let id = 0; id < state.recordCount; id += 1) {
    if (state.status[id] === 0 && allowed.includes(state.component[id])) count += 1;
  }
  return count;
}

export function clapperActiveCount(state: DecodedState, variant: VideoVariantId) {
  const allowed = variant === "baseline" ? [1] : variant.startsWith("camera-") ? [] : [4, 5, 6];
  let count = 0;
  for (let id = 0; id < state.recordCount; id += 1) {
    if (state.status[id] === 0 && allowed.includes(state.component[id])) count += 1;
  }
  return count;
}

export function hingedBarActiveCount(state: DecodedState, variant: VideoVariantId) {
  const index = variant === "baseline" ? -1 : variant.startsWith("camera-") ? -1 : 6;
  if (index < 0) return 0;
  let count = 0;
  for (let id = 0; id < state.recordCount; id += 1) {
    if (state.status[id] === 0 && state.component[id] === index) count += 1;
  }
  return count;
}
