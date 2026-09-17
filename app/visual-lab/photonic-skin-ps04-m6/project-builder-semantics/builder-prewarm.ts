import { prepareGeometry } from "../final-r2/geometry-worker-client";
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
import { competenceOrder } from "../../../_brand/color-system";
import { canonicalizeCompetencySet } from "./builder-ids";
import { resolveBuilderState } from "./builder-resolver";
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

/** The seven exact endpoints reachable by one competency toggle on 03.2. */
export function builderToggleNeighborPairs(draft: readonly string[]): Array<readonly [string, string]> {
  const selected = canonicalizeCompetencySet(draft);
  const source = resolveBuilderState({
    screen: "03.2",
    draftCompetencies: selected,
    confirmedCompetencies: null,
  });
  // The release's Event and Video paths are the most demanding first-choice
  // checks; prepare them first, then follow the visible control order.
  const order = ["event", "video", ...competenceOrder.filter((id) => id !== "event" && id !== "video")] as const;
  return order.map((id) => {
    const next = selected.includes(id)
      ? selected.filter((item) => item !== id)
      : [...selected, id];
    const target = resolveBuilderState({
      screen: "03.2",
      draftCompetencies: next,
      confirmedCompetencies: null,
    });
    return [source, target] as const;
  });
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
  private readonly stateLastUsed = new Map<string, number>();
  private readonly pins = new Set<string>();
  private idleHandle: IdleHandle | null = null;
  private cancelled = false;
  private prewarmGeneration = 0;
  private clock = 0;
  variant = `${OWNER_SELECTED_PROFILE_ID}|candidate`;
  namespace: PromotionNamespaceId = "candidate";
  releaseGeometry: boolean | "r2" = false;
  contactSurface = false;
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
    const key = this.states.has(`${this.variant}:${stateId}`) ? `${this.variant}:${stateId}` : stateId;
    const state = this.states.get(key) ?? null;
    if (state) this.stateLastUsed.set(key, ++this.clock);
    return state;
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
    const key = `${this.variant}:${state.entry.stateId}`;
    this.states.set(key, state);
    this.stateLastUsed.set(key, ++this.clock);
    this.evictIfNeeded();
    this.stats.bytes = this.byteLength();
  }

  async loadState(entry: StateEntry, signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const cacheKey = `${this.variant}:full:${entry.stateId}`;
    const hit = this.states.get(cacheKey);
    if (hit) {
      this.stateLastUsed.set(cacheKey, ++this.clock);
      return hit;
    }
    const loaded = await loadBuilderState(entry, signal, { releaseGeometry: this.releaseGeometry, contactSurface: this.contactSurface });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    this.states.set(cacheKey, loaded);
    this.stateLastUsed.set(cacheKey, ++this.clock);
    this.evictIfNeeded();
    this.stats.bytes = this.byteLength();
    return loaded;
  }

  clearVariantCaches() {
    this.states.clear();
    this.stateLastUsed.clear();
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
    const work = (this.releaseGeometry === "r2" && typeof Worker !== "undefined"
      ? prepareGeometry({source:args.source,target:args.target,identitySpace:args.manifest.identitySpace,reducedMotion:args.reducedMotion,viewport}).then(result => result.program)
      : Promise.resolve(compileTransition(args.source, args.target, {
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
    }))).then((program) => {
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
    while (this.byteLength() > this.budgetBytes) {
      let victim: CacheEntry | null = null;
      for (const entry of this.programs.values()) {
        if (this.pins.has(entry.key)) continue;
        if (!victim || entry.lastUsed < victim.lastUsed) victim = entry;
      }
      let stateKey: string | null = null;
      let stateUsed = Number.POSITIVE_INFINITY;
      for (const [key, used] of this.stateLastUsed) {
        if (used < stateUsed) { stateKey = key; stateUsed = used; }
      }
      if (!victim && stateKey === null) break;
      if (stateKey !== null && (!victim || stateUsed < victim.lastUsed)) {
        this.states.delete(stateKey);
        this.stateLastUsed.delete(stateKey);
      } else if (victim) {
        this.programs.delete(victim.key);
      }
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
    this.startPairPrewarm({
      pairs: reachableFrozenPairs(args.current, args.direction ?? 1),
      manifest: args.manifest,
      motion: args.motion,
      reducedMotion: args.reducedMotion,
      hidden: args.hidden,
      initialDelayMs: 160,
    });
  }

  startBuilderNeighborPrewarm(args: {
    draftCompetencies: readonly string[];
    manifest: M3Manifest;
    motion: M41Manifest | null;
    reducedMotion: boolean;
    hidden: () => boolean;
    onProgress?: () => void;
  }) {
    this.startPairPrewarm({
      pairs: builderToggleNeighborPairs(args.draftCompetencies),
      manifest: args.manifest,
      motion: args.motion,
      reducedMotion: args.reducedMotion,
      hidden: args.hidden,
      onProgress: args.onProgress,
      initialDelayMs: 40,
    });
  }

  private startPairPrewarm(args: {
    pairs: readonly (readonly [string, string])[];
    manifest: M3Manifest;
    motion: M41Manifest | null;
    reducedMotion: boolean;
    hidden: () => boolean;
    onProgress?: () => void;
    initialDelayMs: number;
  }) {
    this.cancel();
    this.cancelled = false;
    this.manifest = args.manifest;
    this.motion = args.motion;
    const generation = this.prewarmGeneration;
    const queue = [...args.pairs];
    const current = () => !this.cancelled && generation === this.prewarmGeneration;
    const schedule = (work: () => void, delayMs: number) => {
      if (current()) this.idleHandle = scheduleIdle(work, delayMs);
    };
    const step = () => {
      this.idleHandle = null;
      if (!current()) return;
      if (args.hidden() || typeof document !== "undefined" && document.visibilityState === "hidden") {
        schedule(step, 400);
        return;
      }
      const next = queue.shift();
      if (!next) return;
      const [sourceId, targetId] = next;
      const sourceEntry = args.manifest.states.find((entry) => entry.stateId === sourceId);
      const targetEntry = args.manifest.states.find((entry) => entry.stateId === targetId);
      if (!sourceEntry || !targetEntry) {
        schedule(step, 16);
        return;
      }
      void (async () => {
        try {
          const [source, target] = await Promise.all([this.loadState(sourceEntry), this.loadState(targetEntry)]);
          if (!current()) return;
          // Compilation is synchronous on a cache miss. Run at most one pair
          // per idle callback, never in the state-load microtask.
          const compile = () => {
            this.idleHandle = null;
            if (!current()) return;
            if (args.hidden() || typeof document !== "undefined" && document.visibilityState === "hidden") {
              schedule(compile, 400);
              return;
            }
            void (async () => {
              try {
                await this.getFrozen({
                  source,
                  target,
                  manifest: args.manifest,
                  motion: args.motion,
                  reducedMotion: args.reducedMotion,
                });
                if (current()) {
                  this.stats.prewarms += 1;
                  args.onProgress?.();
                }
              } catch {
                // A cold click can still compile on demand.
              } finally {
                if (current() && queue.length > 0) schedule(step, 120);
              }
            })();
          };
          schedule(compile, 40);
        } catch {
          // Prewarm is best-effort; user path still compiles if needed.
          if (current() && queue.length > 0) schedule(step, 120);
        }
      })();
    };
    schedule(step, args.initialDelayMs);
  }

  pause() {
    if (this.idleHandle != null) cancelIdle(this.idleHandle);
    this.idleHandle = null;
  }

  cancel() {
    this.cancelled = true;
    this.prewarmGeneration += 1;
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
