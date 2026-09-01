import { decodeState, type DecodedState, type StateEntry } from "../../photonic-skin-m4-1/m41-data";
import type { PresentationStateEntry } from "../../photonic-skin-m4-1r/photonic-presentation";
import { EVENT_VARIANTS, VARIANT_BUFFER_PATH, type EventVariantId } from "./sandbox-query";

const ALL_PROFILES = ["desktop", "mobile390", "silhouette180", "silhouette96"] as const;
const FIGURE_RIGHT_COMPONENT = 4;

export function isEventStateId(stateId: string) {
  return stateId === "single-event";
}

export async function sha256Hex(payload: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", payload as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function cloneEventEntry(entry: StateEntry, variant: EventVariantId, bufferBytes: number, contentHash: string): StateEntry {
  const presented = entry as PresentationStateEntry;
  const componentMap = presented.componentMap?.map((component) => ({
    ...component,
    visibleProfiles: variant === "b" || variant === "c"
      ? [...ALL_PROFILES]
      : component.visibleProfiles,
  }));
  return {
    ...entry,
    bufferBytes,
    contentHash,
    ...(componentMap ? { componentMap } : {}),
  } as StateEntry;
}

export async function loadEventVariantBuffer(variant: EventVariantId, signal?: AbortSignal) {
  const response = await fetch(VARIANT_BUFFER_PATH[variant], { signal });
  if (!response.ok) throw new Error(`Event variant buffer missing: ${variant}`);
  const payload = await response.arrayBuffer();
  return { payload, hash: await sha256Hex(payload) };
}

export async function overlayEventState(state: DecodedState, variant: EventVariantId, signal?: AbortSignal) {
  if (!isEventStateId(state.entry.stateId)) return state;
  const { payload, hash } = await loadEventVariantBuffer(variant, signal);
  return decodeState(cloneEventEntry(state.entry, variant, payload.byteLength, hash), payload);
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
  const counts = [0, 0, 0, 0, 0];
  for (let id = 0; id < state.recordCount; id += 1) {
    if (state.status[id] !== 0) continue;
    counts[state.component[id]] += 1;
  }
  return counts;
}

export function figureRightActiveCount(state: DecodedState) {
  let count = 0;
  for (let id = 0; id < state.recordCount; id += 1) {
    if (state.status[id] === 0 && state.component[id] === FIGURE_RIGHT_COMPONENT) count += 1;
  }
  return count;
}

export { EVENT_VARIANTS };
