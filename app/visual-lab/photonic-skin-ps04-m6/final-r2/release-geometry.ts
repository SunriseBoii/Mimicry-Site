import { sha256Hex, type StateEntry } from "../../photonic-skin-m4-1/m41-data";
import { loadEventManifest, loadEventPayload } from "./event-geometry";
import { loadBuilderVideoManifest, loadBuilderVideoPayload, reviseBuilderVideoEntry } from "./builder-video-geometry";

export const R2_BASE = "/photonic-skin/ps-04-final-r2";
export interface R2Patch {
  sourceHash: string;
  resultHash: string;
  patchPath: string;
  patchHash: string;
  recordCount: number;
  componentIndices: number[];
}
export interface R2Manifest {
  stage: "PS-04.final-r2";
  identitySize: 16384;
  patchRecordStride: 16;
  states: Record<string, R2Patch>;
}
let manifestPromise: Promise<R2Manifest> | null = null;
export function loadR2Manifest() {
  return manifestPromise ??= fetch(`${R2_BASE}/manifest.json`).then(async (response) => {
    if (!response.ok) throw new Error("R2 manifest missing");
    const value = await response.json() as R2Manifest;
    if (value.stage !== "PS-04.final-r2" || value.identitySize !== 16384 || value.patchRecordStride !== 16) {
      throw new Error("R2 manifest layout mismatch");
    }
    return value;
  }).catch((error: unknown) => { manifestPromise = null; throw error; });
}

export function applyR2Patch(source: ArrayBuffer, patch: ArrayBuffer, expected: R2Patch) {
  if (source.byteLength !== 16384 * 40 || patch.byteLength !== expected.recordCount * 16) throw new Error("R2 patch length mismatch");
  const output = source.slice(0);
  const bytes = new Uint8Array(output), data = new Uint8Array(patch), view = new DataView(patch);
  let previous = -1;
  for (let row = 0; row < expected.recordCount; row++) {
    const base = row * 16, id = view.getUint16(base, true), offset = id * 40;
    if (id <= previous || id >= 16384 || !expected.componentIndices.includes(bytes[offset + 30])) throw new Error("R2 identity/component mismatch");
    previous = id;
    bytes.set(data.subarray(base + 2, base + 14), offset);
    bytes.set(data.subarray(base + 14, base + 16), offset + 26);
  }
  return output;
}

export async function reviseR2Entry(entry: StateEntry): Promise<StateEntry> {
  const patch = (await loadR2Manifest()).states[entry.stateId];
  if (patch && patch.sourceHash !== entry.contentHash) throw new Error(`R2 source manifest mismatch: ${entry.stateId}`);
  const intermediate = patch?.resultHash ?? entry.contentHash;
  const event = (await loadEventManifest()).states[entry.stateId];
  if (event && event.sourceHash !== intermediate) throw new Error(`Event R4 source manifest mismatch: ${entry.stateId}`);
  return reviseBuilderVideoEntry({ ...entry, contentHash: event?.resultHash ?? intermediate });
}

export async function loadR2Payload(source: ArrayBuffer, entry: StateEntry, signal?: AbortSignal) {
  const patch = (await loadR2Manifest()).states[entry.stateId];
  const event = (await loadEventManifest()).states[entry.stateId];
  const video = (await loadBuilderVideoManifest()).states[entry.stateId];
  if (!patch) {
    const result = await loadEventPayload(source, entry.stateId, signal);
    if (await sha256Hex(result) !== entry.contentHash) throw new Error(`R2 final hash mismatch: ${entry.stateId}`);
    return result;
  }
  if (await sha256Hex(source) !== patch.sourceHash || (event?.sourceHash ?? video?.sourceHash ?? entry.contentHash) !== patch.resultHash) throw new Error(`R2 source hash mismatch: ${entry.stateId}`);
  const response = await fetch(`${R2_BASE}/${patch.patchPath}`, { signal });
  if (!response.ok) throw new Error(`R2 patch missing: ${entry.stateId}`);
  const data = await response.arrayBuffer();
  if (await sha256Hex(data) !== patch.patchHash) throw new Error(`R2 patch hash mismatch: ${entry.stateId}`);
  const output = applyR2Patch(source, data, patch);
  if (await sha256Hex(output) !== patch.resultHash) throw new Error(`R2 result hash mismatch: ${entry.stateId}`);
  const eventResult = await loadEventPayload(output, entry.stateId, signal);
  const result = await loadBuilderVideoPayload(eventResult, entry, signal);
  if (await sha256Hex(result) !== entry.contentHash) throw new Error(`R2 final hash mismatch: ${entry.stateId}`);
  return result;
}
