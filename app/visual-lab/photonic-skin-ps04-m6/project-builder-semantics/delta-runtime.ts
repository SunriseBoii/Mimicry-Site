import { loadR2Manifest, loadR2Payload, reviseR2Entry } from "../final-r2/release-geometry";
import { prepareContactSurface } from "../../../_photonic-skin/contact-surface-client";
import { SharedRequests } from "../../../_photonic-skin/shared-requests";
import { loadEventManifest } from "../final-r2/event-geometry";
import {
  decodeState,
  LruCache,
  loadM41Manifest,
  sha256Hex,
  type DecodedState,
  type M3Manifest,
  type M41Manifest,
  type StateEntry,
} from "../../photonic-skin-m4-1/m41-data";
import { NESTED_LOD_LEVELS } from "../../photonic-skin-m4-1/m41-data";
import {
  M55_MANIFEST_PATH,
  M55_NAMESPACE,
  M61_DELTA_MANIFEST_PATH,
  M61_NAMESPACE,
  PS04_RELEASE_GEOMETRY_BASE,
  PS04_RELEASE_GEOMETRY_MANIFEST_PATH,
  namespaceForStateId,
} from "./builder-ids";

export interface BuilderDeltaManifest {
  stage: "PS-04.M6.1";
  frozenPayloadNamespace: typeof M55_NAMESPACE;
  frozenStateCount: number;
  newStateCount: number;
  identitySpace: M3Manifest["identitySpace"];
  stateRecordLayout: M3Manifest["stateRecordLayout"];
  presentationContract: M3Manifest["presentationContract"];
  states: StateEntry[];
  resolverMap: Record<string, { namespace: string; stateId: string; contentHash: string; bufferPath: string }>;
}

export interface BuilderRuntimeManifests {
  m3: M3Manifest;
  m4: M41Manifest;
  delta: BuilderDeltaManifest;
}

export interface ReleaseGeometryState {
  sourceNamespace: typeof M55_NAMESPACE | typeof M61_NAMESPACE;
  sourceHash: string;
  resultHash: string;
  patchPath: string;
  patchHash: string;
  patchBytes: number;
  recordCount: number;
  componentIndex: number;
}

export interface ReleaseGeometryManifest {
  stage: "PS-04.final-r1";
  identitySize: 16384;
  patchRecordStride: 28;
  states: Record<string, ReleaseGeometryState>;
}

export interface BuilderLoadOptions {
  contactSurface?: boolean;
  releaseGeometry?: boolean | "r2";
}

const stateCache = new LruCache<string, DecodedState>(12);
const pendingStates = new SharedRequests<DecodedState>();
let releaseManifestPromise: Promise<ReleaseGeometryManifest> | null = null;

export async function loadReleaseGeometryManifest(signal?: AbortSignal): Promise<ReleaseGeometryManifest> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (!releaseManifestPromise) {
    // The manifest is shared by concurrent prewarms. An aborted React effect must
    // not poison the shared request used by the replacement effect.
    releaseManifestPromise = fetch(PS04_RELEASE_GEOMETRY_MANIFEST_PATH)
      .then(async (response) => {
        if (!response.ok) throw new Error(`PS-04 release geometry manifest missing (${response.status})`);
        const parsed = await response.json() as ReleaseGeometryManifest;
        if (parsed.stage !== "PS-04.final-r1" || parsed.identitySize !== 16384 || parsed.patchRecordStride !== 28) {
          throw new Error("PS-04 release geometry manifest version/layout mismatch");
        }
        return parsed;
      })
      .catch((error: unknown) => {
        releaseManifestPromise = null;
        throw error;
      });
  }
  const manifest = await releaseManifestPromise;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return manifest;
}

export function applyReleasePatch(source: ArrayBuffer, patch: ArrayBuffer, expected: ReleaseGeometryState): ArrayBuffer {
  if (source.byteLength !== 16384 * 40 || patch.byteLength !== expected.patchBytes || patch.byteLength !== expected.recordCount * 28) {
    throw new Error("PS-04 release geometry patch length mismatch");
  }
  const copy = source.slice(0);
  const bytes = new Uint8Array(copy);
  const patchBytes = new Uint8Array(patch);
  const view = new DataView(patch);
  let previousId = -1;
  for (let row = 0; row < expected.recordCount; row += 1) {
    const base = row * 28;
    const id = view.getUint16(base, true);
    if (id <= previousId || id >= 16384 || bytes[id * 40 + 30] !== expected.componentIndex) {
      throw new Error("PS-04 release geometry patch identity/component mismatch");
    }
    previousId = id;
    // The first 26 bytes are the three geometry fields. Metadata at byte 26+
    // retains its approved M5.5/M6.1 values, including scale and palette owner.
    bytes.set(patchBytes.subarray(base + 2, base + 28), id * 40);
  }
  return copy;
}

function dataBaseFor(namespace: string) {
  return namespace === M61_NAMESPACE ? "/photonic-skin/ps-04-m6-1" : "/photonic-skin/ps-04-m5-5";
}

export async function loadFrozenM55Manifest(signal?: AbortSignal): Promise<M3Manifest> {
  const response = await fetch(M55_MANIFEST_PATH, { signal });
  if (!response.ok) throw new Error(`M5.5 manifest missing (${response.status})`);
  const parsed = JSON.parse(new TextDecoder().decode(await response.arrayBuffer())) as M3Manifest;
  if (parsed.stateCount !== 154 || parsed.states.length !== 154) throw new Error("M5.5 aggregate is not 154 states");
  if (parsed.identitySpace.size !== 16384) throw new Error("M5.5 identity N is not 16384");
  if (parsed.stateRecordLayout.stride !== 40) throw new Error("M5.5 stride is not 40");
  return { ...parsed, lodTransitions: { levels: [...NESTED_LOD_LEVELS] } };
}

export async function loadBuilderDeltaManifest(signal?: AbortSignal): Promise<BuilderDeltaManifest> {
  const response = await fetch(M61_DELTA_MANIFEST_PATH, { signal });
  if (!response.ok) throw new Error(`M6.1 delta manifest missing (${response.status})`);
  const parsed = JSON.parse(new TextDecoder().decode(await response.arrayBuffer())) as BuilderDeltaManifest;
  if (parsed.stage !== "PS-04.M6.1") throw new Error("Delta stage is not PS-04.M6.1");
  if (parsed.newStateCount !== 230 || parsed.states.length !== 230) {
    throw new Error("M6.1 delta is not 230 project-complex states");
  }
  if (parsed.identitySpace.size !== 16384) throw new Error("M6.1 identity N is not 16384");
  if (parsed.stateRecordLayout.stride !== 40) throw new Error("M6.1 stride is not 40");
  return parsed;
}

export function mergeBuilderManifest(frozen: M3Manifest, delta: BuilderDeltaManifest): M3Manifest {
  const byId = new Map<string, StateEntry>();
  for (const entry of frozen.states) byId.set(entry.stateId, entry);
  for (const entry of delta.states) byId.set(entry.stateId, entry);
  const states = [...byId.values()].sort((a, b) => a.stateId.localeCompare(b.stateId));
  return {
    ...frozen,
    stateCount: states.length,
    states,
    lodTransitions: { levels: [...NESTED_LOD_LEVELS] },
  };
}

export async function loadBuilderRuntime(signal?: AbortSignal, options: BuilderLoadOptions = {}): Promise<BuilderRuntimeManifests> {
  const [frozen, delta, m4, release] = await Promise.all([
    loadFrozenM55Manifest(signal),
    loadBuilderDeltaManifest(signal),
    loadM41Manifest(signal),
    options.releaseGeometry ? loadReleaseGeometryManifest(signal) : Promise.resolve(null),
  ]);
  const merged = mergeBuilderManifest(frozen, delta);
  if (!release) return { m3: merged, m4, delta };
  const states = merged.states.map((entry) => {
    const revised = release.states[entry.stateId];
    if (!revised) return entry;
    if (revised.sourceHash !== entry.contentHash || revised.sourceNamespace !== namespaceForStateId(entry.stateId)) {
      throw new Error(`PS-04 release source mismatch: ${entry.stateId}`);
    }
    return { ...entry, contentHash: revised.resultHash };
  });
  if (Object.keys(release.states).length !== 203) throw new Error("PS-04 Event release state coverage mismatch");
  return { m3: { ...merged, states: options.releaseGeometry === "r2" ? await Promise.all(states.map(reviseR2Entry)) : states }, m4, delta };
}

export async function loadBuilderState(entry: StateEntry, signal?: AbortSignal, options: BuilderLoadOptions = {}): Promise<DecodedState> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const namespace = namespaceForStateId(entry.stateId);
  const cacheKey = `${namespace}:${entry.stateId}:${entry.contentHash}:${options.releaseGeometry || "frozen"}:${options.contactSurface ? "contact" : "original"}`;
  const hit = stateCache.get(cacheKey);
  if (hit) return hit;
  return pendingStates.run(cacheKey, async (signal) => {
    const release = options.releaseGeometry ? await loadReleaseGeometryManifest(signal) : null;
    const revised = release?.states[entry.stateId];
    const r2 = options.releaseGeometry === "r2" ? (await loadR2Manifest()).states[entry.stateId] : null;
    const event = options.releaseGeometry === "r2" ? (await loadEventManifest()).states[entry.stateId] : null;
    const expectedSourceHash = revised?.sourceHash ?? r2?.sourceHash ?? entry.contentHash;
    if (revised && (revised.resultHash !== (r2?.sourceHash ?? event?.sourceHash ?? entry.contentHash) || revised.sourceNamespace !== namespace)) {
      throw new Error(`PS-04 release state/manifest mismatch: ${entry.stateId}`);
    }
    const [response, patchResponse] = await Promise.all([
      fetch(`${dataBaseFor(namespace)}/${entry.bufferPath}`, { signal }),
      revised ? fetch(`${PS04_RELEASE_GEOMETRY_BASE}/${revised.patchPath}`, { signal }) : Promise.resolve(null),
    ]);
    if (!response.ok) throw new Error(`Builder state missing: ${namespace}/${entry.stateId}`);
    if (patchResponse && !patchResponse.ok) throw new Error(`PS-04 release patch missing: ${entry.stateId}`);
    let payload = await response.arrayBuffer();
    const sourceHash = await sha256Hex(payload);
    if (sourceHash !== expectedSourceHash.toLowerCase()) throw new Error(`${entry.stateId} frozen SHA-256 mismatch`);
    if (revised && patchResponse) {
      const patch = await patchResponse.arrayBuffer();
      if (await sha256Hex(patch) !== revised.patchHash) throw new Error(`${entry.stateId} release patch SHA-256 mismatch`);
      payload = applyReleasePatch(payload, patch, revised);
      if (await sha256Hex(payload) !== revised.resultHash) throw new Error(`${entry.stateId} release result SHA-256 mismatch`);
    }
    if (options.releaseGeometry === "r2") payload = await loadR2Payload(payload, entry, signal);
    const decoded = decodeState(entry, payload);
    if (options.contactSurface) decoded.contactSurface = await prepareContactSurface(decoded, signal);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    stateCache.set(cacheKey, decoded);
    return decoded;
  }, signal);
}
