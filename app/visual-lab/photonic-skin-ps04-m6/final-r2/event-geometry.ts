import { sha256Hex } from "../../photonic-skin-m4-1/m41-data";

const BASE = "/photonic-skin/ps-04-event-r4";
interface EventPatch {
  sourceHash: string; resultHash: string; patchHash: string; patchPath: string;
  recordCount: number; componentIndex: number;
}
interface EventManifest {
  stage: "PS-04.event-r4"; identitySize: 16384; patchRecordStride: 28;
  states: Record<string, EventPatch>;
}
let manifest: Promise<EventManifest> | null = null;
export function loadEventManifest() {
  return manifest ??= fetch(`${BASE}/manifest.json`).then(async response => {
    if (!response.ok) throw new Error("Event R4 manifest missing");
    const value = await response.json() as EventManifest;
    if (value.stage !== "PS-04.event-r4" || value.identitySize !== 16384 || value.patchRecordStride !== 28 || Object.keys(value.states).length !== 203) throw new Error("Event R4 manifest mismatch");
    return value;
  }).catch((error: unknown) => { manifest = null; throw error; });
}

export function applyEventPatch(source: ArrayBuffer, patch: ArrayBuffer, expected: EventPatch) {
  if (source.byteLength !== 16384 * 40 || patch.byteLength !== expected.recordCount * 28) throw new Error("Event R4 patch length mismatch");
  const output = source.slice(0), bytes = new Uint8Array(output), data = new Uint8Array(patch), view = new DataView(patch);
  let previous = -1;
  for (let row = 0; row < expected.recordCount; row++) {
    const base = row * 28, id = view.getUint16(base, true);
    if (id <= previous || id >= 16384 || bytes[id * 40 + 30] !== expected.componentIndex) throw new Error("Event R4 identity/component mismatch");
    previous = id;
    bytes.set(data.subarray(base + 2, base + 28), id * 40);
  }
  return output;
}

export async function loadEventPayload(source: ArrayBuffer, stateId: string, signal?: AbortSignal) {
  const patch = (await loadEventManifest()).states[stateId];
  if (!patch) return source;
  if (await sha256Hex(source) !== patch.sourceHash) throw new Error(`Event R4 source mismatch: ${stateId}`);
  const response = await fetch(`${BASE}/${patch.patchPath}`, { signal });
  if (!response.ok) throw new Error(`Event R4 patch missing: ${stateId}`);
  const data = await response.arrayBuffer();
  if (await sha256Hex(data) !== patch.patchHash) throw new Error(`Event R4 patch hash mismatch: ${stateId}`);
  const result = applyEventPatch(source, data, patch);
  if (await sha256Hex(result) !== patch.resultHash) throw new Error(`Event R4 result mismatch: ${stateId}`);
  return result;
}
