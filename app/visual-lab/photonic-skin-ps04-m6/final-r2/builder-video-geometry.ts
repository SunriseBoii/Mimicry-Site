import { sha256Hex, type StateEntry } from "../../photonic-skin-m4-1/m41-data";
import { applyR2Patch, type R2Patch } from "./release-geometry";

const BASE = "/photonic-skin/ps-04-builder-video-r3";
interface VideoPatch extends R2Patch { presentationFrame: { translate: [number, number, number]; scale: number; anchor: [number, number, number] } }
interface VideoManifest { stage: "PS-04.builder-video-r3"; identitySize: 16384; patchRecordStride: 16; states: Record<string, VideoPatch> }
let manifest: Promise<VideoManifest> | null = null;
export function loadBuilderVideoManifest() {
  return manifest ??= fetch(`${BASE}/manifest.json`).then(async response => {
    if (!response.ok) throw new Error("Builder Video R3 manifest missing");
    const value = await response.json() as VideoManifest;
    if (value.stage !== "PS-04.builder-video-r3" || value.identitySize !== 16384 || value.patchRecordStride !== 16 || Object.keys(value.states).length !== 126) throw new Error("Builder Video R3 manifest mismatch");
    return value;
  }).catch((error: unknown) => { manifest = null; throw error; });
}

export async function reviseBuilderVideoEntry(entry: StateEntry): Promise<StateEntry> {
  const patch = (await loadBuilderVideoManifest()).states[entry.stateId];
  if (!patch) return entry;
  if (entry.contentHash !== patch.sourceHash) throw new Error(`Builder Video R3 source manifest mismatch: ${entry.stateId}`);
  const revised = { ...entry, contentHash: patch.resultHash, presentationFrame: patch.presentationFrame };
  return revised;
}

export async function loadBuilderVideoPayload(source: ArrayBuffer, entry: StateEntry, signal?: AbortSignal) {
  const patch = (await loadBuilderVideoManifest()).states[entry.stateId];
  if (!patch) return source;
  if (await sha256Hex(source) !== patch.sourceHash || entry.contentHash !== patch.resultHash) throw new Error(`Builder Video R3 source mismatch: ${entry.stateId}`);
  const response = await fetch(`${BASE}/${patch.patchPath}`, { signal });
  if (!response.ok) throw new Error(`Builder Video R3 patch missing: ${entry.stateId}`);
  const data = await response.arrayBuffer();
  if (await sha256Hex(data) !== patch.patchHash) throw new Error(`Builder Video R3 patch hash mismatch: ${entry.stateId}`);
  const result = applyR2Patch(source, data, patch);
  if (await sha256Hex(result) !== patch.resultHash) throw new Error(`Builder Video R3 result mismatch: ${entry.stateId}`);
  return result;
}
