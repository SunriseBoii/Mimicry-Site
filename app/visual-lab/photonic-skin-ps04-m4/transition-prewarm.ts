/**
 * Route-aware frozen-program prewarm. Ordinary adjacent M4 transitions must
 * not compile on the user path. Live interrupt retargets still compile when
 * a runtime snapshot is the source; those are reported separately.
 */

import type { DecodedState, M3Manifest, StateEntry } from "../photonic-skin-m4-1/m41-data";
import type { M41Manifest } from "../photonic-skin-m4-1/m41-data";
import type { TransitionProgram } from "../photonic-skin-m4-1/m41-evaluator";
import { compileFrozenPair, loadEntry, viewportForFrame } from "../photonic-skin-ps04-m3/runtime";
import {
  CANONICAL_BRAND_WIDE_ID,
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
} from "./screen-actor-contract";
import { GRAPH_EDGES, topologyNeighbors, type ScreenNodeId } from "./topology";

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

export function frozenProgramKey(sourceId: string, targetId: string, reducedMotion: boolean, viewport: string) {
  return `${sourceId}|${targetId}|${reducedMotion ? 1 : 0}|${viewport}`;
}

export function reachableFrozenPairs(current: ScreenNodeId): Array<readonly [string, string]> {
  const pairs: Array<readonly [string, string]> = [];
  const seen = new Set<string>();
  const push = (fromNode: string, toNode: string) => {
    const from = defaultGeometryForNode(fromNode);
    const to = defaultGeometryForNode(toNode);
    if (!from || !to || from === to) return;
    const key = `${from}|${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push([from, to]);
  };
  for (const neighbor of topologyNeighbors(current)) push(current, neighbor);
  for (const neighbor of topologyNeighbors(current)) push(neighbor, current);
  for (const edge of GRAPH_EDGES) {
    push(edge.from, edge.to);
    push(edge.to, edge.from);
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

export class TransitionProgramCache {
  private readonly programs = new Map<string, TransitionProgram>();
  private readonly inflight = new Map<string, Promise<TransitionProgram>>();
  private readonly states = new Map<string, DecodedState>();
  private idleHandle: IdleHandle | null = null;
  private cancelled = false;
  readonly stats: PrewarmStats = {
    hits: 0, misses: 0, compiles: 0, prewarms: 0, inflight: 0, cached: 0, lastKey: null, lastStatus: "idle",
  };

  lookup(sourceId: string, targetId: string, reducedMotion: boolean, viewport = "desktop") {
    const key = frozenProgramKey(sourceId, targetId, reducedMotion, viewport);
    return this.programs.get(key) ?? null;
  }

  status(sourceId: string, targetId: string, reducedMotion: boolean, viewport = "desktop"): PrewarmStatus {
    const key = frozenProgramKey(sourceId, targetId, reducedMotion, viewport);
    if (this.programs.has(key)) return "cached";
    if (this.inflight.has(key)) return "compiling";
    return "miss";
  }

  rememberState(state: DecodedState) {
    this.states.set(state.entry.stateId, state);
  }

  async loadState(entry: StateEntry) {
    const hit = this.states.get(entry.stateId);
    if (hit) return hit;
    const state = await loadEntry(entry);
    this.rememberState(state);
    return state;
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
    const viewport = args.viewport ?? "desktop";
    const key = frozenProgramKey(args.source.entry.stateId, args.target.entry.stateId, args.reducedMotion, viewport);
    this.stats.lastKey = key;
    const cached = this.programs.get(key);
    if (cached) {
      this.stats.hits += 1;
      this.stats.lastStatus = "cached";
      return cached;
    }
    const pending = this.inflight.get(key);
    if (pending) {
      this.stats.lastStatus = "compiling";
      return pending;
    }
    this.stats.misses += 1;
    this.stats.compiles += 1;
    this.stats.lastStatus = "compiling";
    const work = compileFrozenPair(args.source, args.target, args.manifest, args.motion, {
      reducedMotion: args.reducedMotion,
      trigger: "qa",
      viewport: viewportForFrame(viewport),
      signal: args.signal,
    }).then((program) => {
      const frozen = freezeProgram(program);
      this.programs.set(key, frozen);
      this.stats.cached = this.programs.size;
      this.inflight.delete(key);
      this.stats.inflight = this.inflight.size;
      this.stats.lastStatus = "cached";
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

  startRoutePrewarm(args: {
    current: ScreenNodeId;
    manifest: M3Manifest;
    motion: M41Manifest | null;
    reducedMotion: boolean;
    hidden: () => boolean;
  }) {
    this.cancelled = false;
    const queue = reachableFrozenPairs(args.current);
    const neighbors = new Set(topologyNeighbors(args.current).flatMap((id) => {
      const from = defaultGeometryForNode(args.current);
      const to = defaultGeometryForNode(id);
      return from && to && from !== to ? [`${from}|${to}`, `${to}|${from}`] : [];
    }));
    queue.sort((left, right) => {
      const leftNear = neighbors.has(`${left[0]}|${left[1]}`) ? 0 : 1;
      const rightNear = neighbors.has(`${right[0]}|${right[1]}`) ? 0 : 1;
      return leftNear - rightNear;
    });
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
    this.idleHandle = scheduleIdle(step, 1);
  }

  pause() {
    if (this.idleHandle != null) cancelIdle(this.idleHandle);
    this.idleHandle = null;
  }

  cancel() {
    this.cancelled = true;
    this.pause();
  }
}
