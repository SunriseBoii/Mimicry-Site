import {
  decodeState,
  LruCache,
  loadM41Manifest,
  loadState,
  NESTED_LOD_LEVELS,
  sha256Hex,
  type DecodedState,
  type M3Manifest,
  type M41Manifest,
  type StateEntry,
} from "../../photonic-skin-m4-1/m41-data";

export const PROMOTED_ASSET_NAMESPACE = "ps-04-m5-5";
export const PROMOTED_DATA_BASE = "/photonic-skin/ps-04-m5-5";
export const PROMOTED_MANIFEST_PATH = `${PROMOTED_DATA_BASE}/manifests/ps04m55-manifest.json`;
export const SELECTION_LOCK_PATH = `${PROMOTED_DATA_BASE}/promotion-selection.json`;
export const FROZEN_DATA_BASE = "/photonic-skin/ps-03-m3-1r";

export type PromotionNamespaceId = "candidate" | "frozen";

const promotedCache = new LruCache<string, DecodedState>(8);

export async function loadPromotedManifest(signal?: AbortSignal): Promise<M3Manifest> {
  const response = await fetch(PROMOTED_MANIFEST_PATH, { signal });
  if (!response.ok) throw new Error(`Promoted M5.5 manifest missing (${response.status})`);
  const payload = await response.arrayBuffer();
  const parsed = JSON.parse(new TextDecoder().decode(payload)) as M3Manifest & { promotion?: { stage?: string } };
  if (parsed.stateCount !== 154 || parsed.states.length !== 154) throw new Error("Promoted aggregate is not 154 states");
  if (parsed.identitySpace.size !== 16384) throw new Error("Promoted identity N is not 16384");
  if (parsed.stateRecordLayout.stride !== 40) throw new Error("Promoted stride is not 40");
  return { ...parsed, lodTransitions: { levels: [...NESTED_LOD_LEVELS] } };
}

export async function loadPromotedRuntime(signal?: AbortSignal): Promise<{ m3: M3Manifest; m4: M41Manifest }> {
  const [m3, m4] = await Promise.all([loadPromotedManifest(signal), loadM41Manifest(signal)]);
  return { m3, m4 };
}

export async function loadPromotedState(entry: StateEntry, signal?: AbortSignal) {
  const cacheKey = `${PROMOTED_ASSET_NAMESPACE}:${entry.stateId}:${entry.contentHash}`;
  const hit = promotedCache.get(cacheKey);
  if (hit) return hit;
  const response = await fetch(`${PROMOTED_DATA_BASE}/${entry.bufferPath}`, { signal });
  if (!response.ok) throw new Error(`Promoted state missing: ${entry.stateId}`);
  const payload = await response.arrayBuffer();
  const actual = await sha256Hex(payload);
  if (actual !== entry.contentHash.toLowerCase()) throw new Error(`${entry.stateId} promoted SHA-256 mismatch`);
  const decoded = decodeState(entry, payload);
  promotedCache.set(cacheKey, decoded);
  return decoded;
}

export async function loadNamespaceState(entry: StateEntry, namespace: PromotionNamespaceId, signal?: AbortSignal) {
  if (namespace === "frozen") return loadState(entry, { signal });
  return loadPromotedState(entry, signal);
}
