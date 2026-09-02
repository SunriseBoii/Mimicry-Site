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
import { M55_MANIFEST_PATH, M55_NAMESPACE, M61_DELTA_MANIFEST_PATH, M61_NAMESPACE, namespaceForStateId } from "./builder-ids";

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

const stateCache = new LruCache<string, DecodedState>(12);

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

export async function loadBuilderRuntime(signal?: AbortSignal): Promise<BuilderRuntimeManifests> {
  const [frozen, delta, m4] = await Promise.all([
    loadFrozenM55Manifest(signal),
    loadBuilderDeltaManifest(signal),
    loadM41Manifest(signal),
  ]);
  return { m3: mergeBuilderManifest(frozen, delta), m4, delta };
}

export async function loadBuilderState(entry: StateEntry, signal?: AbortSignal): Promise<DecodedState> {
  const namespace = namespaceForStateId(entry.stateId);
  const cacheKey = `${namespace}:${entry.stateId}:${entry.contentHash}`;
  const hit = stateCache.get(cacheKey);
  if (hit) return hit;
  const response = await fetch(`${dataBaseFor(namespace)}/${entry.bufferPath}`, { signal });
  if (!response.ok) throw new Error(`Builder state missing: ${namespace}/${entry.stateId}`);
  const payload = await response.arrayBuffer();
  const actual = await sha256Hex(payload);
  if (actual !== entry.contentHash.toLowerCase()) throw new Error(`${entry.stateId} SHA-256 mismatch`);
  const decoded = decodeState(entry, payload);
  stateCache.set(cacheKey, decoded);
  return decoded;
}
