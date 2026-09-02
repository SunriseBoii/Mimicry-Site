/**
 * M6.1 builder program cache. Loads M5.5 frozen buffers plus M6.1 delta states.
 * No Event/Video sandbox overlays.
 */

import type { DecodedState, M3Manifest, StateEntry } from "../../photonic-skin-m4-1/m41-data";
import type { M41Manifest } from "../../photonic-skin-m4-1/m41-data";
import { compileTransition, type TransitionProgram } from "../../photonic-skin-m4-1/m41-evaluator";
import { M3_SEED } from "../../photonic-skin-ps04-m3/runtime";
import {
  CANONICAL_BRAND_WIDE_ID,
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
} from "../../photonic-skin-ps04-m5/screen-actor-contract";
import { topologyNeighbors, type ScreenNodeId } from "../../photonic-skin-ps04-m5/topology";
import { decodedStateBytes, programCpuBytes } from "../../photonic-skin-ps04-m5/texture-pack";
import { OWNER_SELECTED_PROFILE_ID } from "../../photonic-skin-ps04-m5/framing";
import { loadBuilderState } from "./delta-runtime";

type PromotionNamespaceId = "candidate" | "frozen";

export const CPU_CACHE_BUDGET_DESKTOP = 96 * 1024 * 1024;
export const CPU_CACHE_BUDGET_MOBILE = 32 * 1024 * 1024;

export type PrewarmStatus = "idle" | "ready" | "compiling" | "cached" | "miss";

export interface PrewarmStats {
  hits: number;
  misses: number;
  compiles: number;
  prewarms: number;
  inflight: number;
  cached: number;
  lastKey: string | null;
  lastStatus: PrewarmStatus;
  bytes: number;
  evictions: number;
}

const DEFAULT_GEOMETRY: Record<string, string> = {
  "01": MASTER_STATE_ID,
  "02": CANONICAL_BRAND_WIDE_ID,
  "03.1": MASTER_STATE_ID,
  "03.2": MASTER_STATE_ID,
  "03.3": MASTER_STATE_ID,
  "04": MASTER_STATE_ID,
  "05.1": SINGLE_STATE_IDS.content,
  "05.2": SINGLE_STATE_IDS.design,
  "05.3": SINGLE_STATE_IDS.event,
  "05.4": SINGLE_STATE_IDS.games,
  "05.5": SINGLE_STATE_IDS.video,
  "05.6": SINGLE_STATE_IDS.digital,
  "05.7": SINGLE_STATE_IDS.merch,
  "06.1": MASTER_STATE_ID,
  "06.2": MASTER_STATE_ID,
  "06.3": MASTER_STATE_ID,
  "07": MASTER_STATE_ID,
};

export function defaultGeometryForNode(nodeId: string): string | null {
  return DEFAULT_GEOMETRY[nodeId] ?? null;
}

export function frozenProgramKey(sourceId: string, targetId: string, reducedMotion: boolean, viewport: string, variant = `${OWNER_SELECTED_PROFILE_ID}|candidate`) {
  return `${variant}|${sourceId}|${targetId}|${reducedMotion ? 1 : 0}|${viewport}`;
}

export function reachableFrozenPairs(current: ScreenNodeId, direction: 1 | -1 = 1): Array<readonly [string, string]> {
  const pairs: Array<readonly [string, string]> = [];
  const seen = new Set<string>();
  const push = (fromNode: string | undefined, toNode: string | undefined) => {
    if (!fromNode || !toNode) return;
    const from = defaultGeometryForNode(fromNode);
    const to = defaultGeometryForNode(toNode);
    if (!from || !to || from === to) return;
    const key = `${from}|${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push([from, to]);
  };
  const neighbors = topologyNeighbors(current);
  const next = direction === 1 ? neighbors[0] : neighbors[neighbors.length - 1];
  const previous = direction === 1 ? neighbors[neighbors.length - 1] : neighbors[0];
  push(current, next);
  push(next, current);
  push(current, previous);
  push(previous, current);
  if (neighbors[1]) {
    push(current, neighbors[1]);
    push(neighbors[1], current);
  }
  if (current === "04") {
    push("04", "05.1");
    push("05.1", "04");
  }
  return pairs;
}

type IdleHandle = number;

function scheduleIdle(work: () => void, timeout: number): IdleHandle {
  const ric = (globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof ric === "function") return ric(work, { timeout });
  return globalThis.setTimeout(work, Math.min(timeout, 48)) as unknown as IdleHandle;
}

function cancelIdle(handle: IdleHandle) {
  const cic = (globalThis as typeof globalThis & {
    cancelIdleCallback?: (id: number) => void;
  }).cancelIdleCallback;
  if (typeof cic === "function") {
    cic(handle);
    return;
  }
  globalThis.clearTimeout(handle);
}

function freezeProgram(program: TransitionProgram): TransitionProgram {
  return {
    ...program,
    trackIndex: Uint16Array.from(program.trackIndex),
    residual: Float32Array.from(program.residual),
    phaseDelay: Float32Array.from(program.phaseDelay),
    bridgeWeight: Float32Array.from(program.bridgeWeight),
    sourceVelocity: program.sourceVelocity ? Float32Array.from(program.sourceVelocity) : undefined,
    sourceScaleVelocity: program.sourceScaleVelocity ? Float32Array.from(program.sourceScaleVelocity) : undefined,
    tracks: program.tracks.map((track) => ({ ...track })),
  };
}

interface CacheEntry {
  key: string;
  program: TransitionProgram;
  bytes: number;
  lastUsed: number;
  pin: number;
}

export class FramingSandboxProgramCache {
  private readonly programs = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<TransitionProgram>>();
  private readonly states = new Map<string, DecodedState>();
  private readonly pins = new Set<string>();
  private idleHandle: IdleHandle | null = null;
  private cancelled = false;
  private clock = 0;
  variant = `${OWNER_SELECTED_PROFILE_ID}|candidate`;
  namespace: PromotionNamespaceId = "candidate";
  manifest: M3Manifest | null = null;
  motion: M41Manifest | null = null;
  budgetBytes = CPU_CACHE_BUDGET_DESKTOP;
  readonly stats: PrewarmStats = {
    hits: 0, misses: 0, compiles: 0, prewarms: 0, inflight: 0, cached: 0, lastKey: null, lastStatus: "idle",
    bytes: 0, evictions: 0,
  };

  setBudget(mobile: boolean) {
    this.budgetBytes = mobile ? CPU_CACHE_BUDGET_MOBILE : CPU_CACHE_BUDGET_DESKTOP;
    this.evictIfNeeded();
  }

  size() {
    return this.programs.size;
  }

  byteLength() {
    let bytes = 0;
    for (const entry of this.programs.values()) bytes += entry.bytes;
    for (const state of this.states.values()) bytes += decodedStateBytes(state);
    return bytes;
  }

  pinnedKeys() {
    return [...this.pins];
  }

  peekState(stateId: string) {
    return this.states.get(`${this.variant}:${stateId}`) ?? this.states.get(stateId) ?? null;
  }

  lookup(sourceId: string, targetId: string, reducedMotion: boolean, viewport = "desktop") {
    const key = frozenProgramKey(sourceId, targetId, reducedMotion, viewport, this.variant);
    const entry = this.programs.get(key);
    if (entry) {
      entry.lastUsed = ++this.clock;
      return entry.program;
    }
    return null;
  }

  status(sourceId: string, targetId: string, reducedMotion: boolean, viewport = "desktop"): PrewarmStatus {
    const key = frozenProgramKey(sourceId, targetId, reducedMotion, viewport, this.variant);
    if (this.programs.has(key)) return "cached";
    if (this.inflight.has(key)) return "compiling";
    return "miss";
  }

  pin(key: string) {
    this.pins.add(key);
  }

  unpin(key: string) {
    this.pins.delete(key);
  }

  replacePins(keys: readonly string[], previous?: ReadonlySet<string> | readonly string[], keep: Iterable<string> = []) {
    const next = new Set(keys);
    const prior = previous ? new Set(previous) : this.pins;
    const preserved = new Set(keep);
    for (const key of prior) {
      if (!next.has(key) && !preserved.has(key)) this.unpin(key);
    }
    for (const key of next) this.pin(key);
    return next;
  }

  rememberState(state: DecodedState) {
    this.states.set(`${this.variant}:${state.entry.stateId}`, state);
  }

  async loadState(entry: StateEntry, signal?: AbortSignal) {
    const cacheKey = `${this.variant}:full:${entry.stateId}`;
    const hit = this.states.get(cacheKey);
    if (hit) return hit;
    const loaded = await loadBuilderState(entry, signal);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    this.states.set(cacheKey, loaded);
    return loaded;
  }

  clearVariantCaches() {
    this.states.clear();
    this.programs.clear();
    this.inflight.clear();
    this.stats.cached = 0;
    this.stats.bytes = this.byteLength();
  }

  async getFrozen(args: {
    source: DecodedState;
    target: DecodedState;
    manifest: M3Manifest;
    motion: M41Manifest | null;
    reducedMotion: boolean;
    viewport?: "desktop" | "mobile";
    signal?: AbortSignal;
  }) {
    this.manifest = args.manifest;
    this.motion = args.motion;
    const viewport = args.viewport ?? "desktop";
    const key = frozenProgramKey(args.source.entry.stateId, args.target.entry.stateId, args.reducedMotion, viewport, this.variant);
    this.stats.lastKey = key;
    const cached = this.programs.get(key);
    if (cached) {
      cached.lastUsed = ++this.clock;
      this.stats.hits += 1;
      this.stats.lastStatus = "cached";
      return cached.program;
    }
    const pending = this.inflight.get(key);
    if (pending) {
      this.stats.lastStatus = "compiling";
      return pending;
    }
    this.stats.misses += 1;
    this.stats.compiles += 1;
    this.stats.lastStatus = "compiling";
    const work = Promise.resolve(compileTransition(args.source, args.target, {
      schemaVersion: "1.0.0",
      sourceStateId: args.source.entry.stateId,
      targetStateId: args.target.entry.stateId,
      identitySpaceVersion: args.manifest.identitySpace.identitySpaceVersion,
      motionProfileId: "directed-plastic-release",
      triggerMode: "qa",
      viewportProfile: viewport,
      directionIntent: "auto",
      deterministicSeed: M3_SEED,
      reducedMotion: args.reducedMotion,
    })).then((program) => {
      const frozen = freezeProgram(program);
      const bytes = programCpuBytes(frozen);
      this.programs.set(key, {
        key,
        program: frozen,
        bytes,
        lastUsed: ++this.clock,
        pin: this.pins.has(key) ? 1 : 0,
      });
      this.stats.cached = this.programs.size;
      this.stats.bytes = this.byteLength();
      this.inflight.delete(key);
      this.stats.inflight = this.inflight.size;
      this.stats.lastStatus = "cached";
      this.evictIfNeeded();
      return frozen;
    }).catch((reason) => {
      this.inflight.delete(key);
      this.stats.inflight = this.inflight.size;
      this.stats.lastStatus = "miss";
      throw reason;
    });
    this.inflight.set(key, work);
    this.stats.inflight = this.inflight.size;
    return work;
  }

  evictIfNeeded() {
    while (this.byteLength() > this.budgetBytes && this.programs.size > 0) {
      let victim: CacheEntry | null = null;
      for (const entry of this.programs.values()) {
        if (this.pins.has(entry.key)) continue;
        if (!victim || entry.lastUsed < victim.lastUsed) victim = entry;
      }
      if (!victim) break;
      this.programs.delete(victim.key);
      this.stats.evictions += 1;
      this.stats.cached = this.programs.size;
      this.stats.bytes = this.byteLength();
    }
  }

  startRoutePrewarm(args: {
    current: ScreenNodeId;
    manifest: M3Manifest;
    motion: M41Manifest | null;
    reducedMotion: boolean;
    hidden: () => boolean;
    direction?: 1 | -1;
  }) {
    this.cancelled = false;
    this.manifest = args.manifest;
    this.motion = args.motion;
    const queue = reachableFrozenPairs(args.current, args.direction ?? 1);
    const step = () => {
      if (this.cancelled) return;
      if (args.hidden() || typeof document !== "undefined" && document.visibilityState === "hidden") {
        this.idleHandle = scheduleIdle(step, 400);
        return;
      }
      const next = queue.shift();
      if (!next) return;
      const [sourceId, targetId] = next;
      const sourceEntry = args.manifest.states.find((entry) => entry.stateId === sourceId);
      const targetEntry = args.manifest.states.find((entry) => entry.stateId === targetId);
      if (!sourceEntry || !targetEntry) {
        this.idleHandle = scheduleIdle(step, 16);
        return;
      }
      void (async () => {
        try {
          const source = await this.loadState(sourceEntry);
          const target = await this.loadState(targetEntry);
          if (this.cancelled) return;
          await this.getFrozen({
            source,
            target,
            manifest: args.manifest,
            motion: args.motion,
            reducedMotion: args.reducedMotion,
          });
          this.stats.prewarms += 1;
        } catch {
          // Prewarm is best-effort; user path still compiles if needed.
        } finally {
          if (!this.cancelled && queue.length > 0) this.idleHandle = scheduleIdle(step, 120);
        }
      })();
    };
    this.idleHandle = scheduleIdle(step, 160);
  }

  pause() {
    if (this.idleHandle != null) cancelIdle(this.idleHandle);
    this.idleHandle = null;
  }

  cancel() {
    this.cancelled = true;
    this.pause();
  }

  insertStubForTest(key: string, bytes: number) {
    this.programs.set(key, {
      key,
      program: { programId: key } as TransitionProgram,
      bytes,
      lastUsed: ++this.clock,
      pin: 0,
    });
    this.stats.cached = this.programs.size;
    this.stats.bytes = this.byteLength();
    this.evictIfNeeded();
  }
}
