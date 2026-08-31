/**
 * R6 resource lifecycle: CPU cache is not GPU readiness, and preparing is
 * not a geometry transition. Navigation never waits on this module.
 */

import type { WebGLRenderer } from "three";
import type { DecodedState, LabFrame } from "../photonic-skin-m4-1/m41-data";
import type { TransitionProgram } from "../photonic-skin-m4-1/m41-evaluator";
import { GpuTexturePool, pairBankKey, type GpuTextureBank } from "./gpu-texture-pool";
import type { R6Instrumentation } from "./r6-instrumentation";
import {
  CPU_CACHE_BUDGET_DESKTOP,
  CPU_CACHE_BUDGET_MOBILE,
  defaultGeometryForNode,
  frozenProgramKey,
  TransitionProgramCache,
} from "./transition-prewarm";
import { topologyNeighbors, type ScreenNodeId } from "./topology";
import { decodedStateBytes, PAIR_CPU_BYTES } from "./texture-pack";

export { CPU_CACHE_BUDGET_DESKTOP, CPU_CACHE_BUDGET_MOBILE };

export type ResourceState =
  | "absent"
  | "cpu-preparing"
  | "cpu-ready"
  | "gpu-staging"
  | "gpu-ready"
  | "bound";

export type VisualLifecycle = "settled" | "preparing" | "morphing" | "settling";

export const SLOT_PREPARE_SECONDS = 0.38;
export const IDLE_HANDOFF_MS = 160;

export interface ActorIntent {
  revision: number;
  navigationToken: number;
  sourceId: string;
  targetId: string;
  reducedMotion: boolean;
  viewport: "desktop" | "mobile";
  prefer: "forward" | "pending";
}

export interface ResourceSnapshot {
  state: ResourceState;
  visual: VisualLifecycle;
  revision: number | null;
  pendingRevision: number | null;
  cacheBytes: number;
  cacheBudget: number;
  cacheEntries: number;
  gpuTextures: number;
  gpuBudget: number;
  gpuReady: boolean;
  pinnedKeys: string[];
}

type IdleHandle = number;

function scheduleSlice(work: () => void): IdleHandle {
  const ric = (globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: (deadline: { timeRemaining: () => number }) => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof ric === "function") {
    return ric((deadline) => {
      if (deadline.timeRemaining() < 1) {
        scheduleSlice(work);
        return;
      }
      work();
    }, { timeout: 32 });
  }
  return globalThis.requestAnimationFrame(() => work()) as unknown as IdleHandle;
}

function cancelSlice(handle: IdleHandle) {
  const cic = (globalThis as typeof globalThis & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
  if (typeof cic === "function") {
    cic(handle);
    return;
  }
  globalThis.cancelAnimationFrame(handle);
}

export class InputYieldGate {
  pending = false;
  private attached = false;
  private readonly onInput = () => {
    this.pending = true;
  };

  attach() {
    if (this.attached || typeof window === "undefined") return;
    this.attached = true;
    window.addEventListener("wheel", this.onInput, { passive: true, capture: true });
    window.addEventListener("touchstart", this.onInput, { passive: true, capture: true });
    window.addEventListener("pointerdown", this.onInput, { passive: true, capture: true });
    window.addEventListener("keydown", this.onInput, { capture: true });
  }

  detach() {
    if (!this.attached || typeof window === "undefined") return;
    this.attached = false;
    window.removeEventListener("wheel", this.onInput, true);
    window.removeEventListener("touchstart", this.onInput, true);
    window.removeEventListener("pointerdown", this.onInput, true);
    window.removeEventListener("keydown", this.onInput, true);
  }

  consume() {
    const pending = this.pending;
    this.pending = false;
    return pending;
  }
}

export interface PipelineReadyPacket {
  revision: number;
  navigationToken: number;
  program: TransitionProgram;
  source: DecodedState;
  target: DecodedState;
  bank: GpuTextureBank;
  gpuReady: true;
  preparedAtMs: number;
}

export class ActorResourcePipeline {
  readonly pool: GpuTexturePool;
  readonly cache: TransitionProgramCache;
  readonly yieldGate = new InputYieldGate();
  state: ResourceState = "absent";
  visual: VisualLifecycle = "settled";
  pending: ActorIntent | null = null;
  lastReady: PipelineReadyPacket | null = null;
  private sliceHandle: IdleHandle | null = null;
  private stagingBank: GpuTextureBank | null = null;
  private stagingSource: DecodedState | null = null;
  private stagingTarget: DecodedState | null = null;
  private stagingProgram: TransitionProgram | null = null;
  private stagingProfile: LabFrame = "desktop";
  private cancelled = false;
  private renderer: WebGLRenderer | null = null;
  private silentHydrate = false;
  pinnedIntentKey: string | null = null;
  onReady: ((packet: PipelineReadyPacket) => void) | null = null;

  constructor(
    cache: TransitionProgramCache,
    pool: GpuTexturePool,
    readonly instrumentation: R6Instrumentation,
  ) {
    this.cache = cache;
    this.pool = pool;
  }

  attachRenderer(renderer: WebGLRenderer | null) {
    this.renderer = renderer;
  }

  snapshot(): ResourceSnapshot {
    return {
      state: this.state,
      visual: this.visual,
      revision: this.pool.active().revision,
      pendingRevision: this.pending?.revision ?? null,
      cacheBytes: this.cache.byteLength(),
      cacheBudget: this.cache.budgetBytes,
      cacheEntries: this.cache.size(),
      gpuTextures: this.pool.textureCount(),
      gpuBudget: this.pool.snapshot().budget,
      gpuReady: this.pool.active().gpuReady,
      pinnedKeys: this.cache.pinnedKeys(),
    };
  }

  isCurrent(revision: number) {
    return this.pending?.revision === revision;
  }

  request(intent: ActorIntent) {
    this.silentHydrate = false;
    this.instrumentation.mark("r6:actor-request", { revision: intent.revision, targetId: intent.targetId });
    this.pending = intent;
    this.visual = "preparing";
    this.state = "cpu-preparing";
    const key = frozenProgramKey(intent.sourceId, intent.targetId, intent.reducedMotion, intent.viewport);
    if (this.pinnedIntentKey && this.pinnedIntentKey !== key) this.cache.unpin(this.pinnedIntentKey);
    this.cache.pin(key);
    this.pinnedIntentKey = key;
    this.cancelSlice();
    this.stagingBank = null;
    this.stagingProgram = null;
    void this.runCpu(intent);
  }

  cancelPending(reason = "cancelled") {
    this.instrumentation.mark("r6:dispose-eviction", { reason, revision: this.pending?.revision ?? null });
    this.pending = null;
    this.cancelSlice();
    if (this.state !== "bound") this.state = this.pool.active().gpuReady ? "bound" : "absent";
    if (this.visual === "preparing") this.visual = "settled";
  }

  markBound(revision: number) {
    if (this.pending && this.pending.revision !== revision) return;
    this.visual = "morphing";
    this.state = "bound";
    this.pending = null;
  }

  hydrateResident(args: {
    revision: number;
    navigationToken: number;
    source: DecodedState;
    target: DecodedState;
    program: TransitionProgram;
    viewport: "desktop" | "mobile";
  }) {
    const key = pairBankKey(args.source.entry.stateId, args.target.entry.stateId, args.program.programId);
    const active = this.pool.active();
    if (active.gpuReady && active.key === key) {
      active.revision = args.revision;
      this.state = this.state === "bound" ? "bound" : "gpu-ready";
      return;
    }
    if (active.gpuReady) return;
    this.silentHydrate = true;
    this.pending = {
      revision: args.revision,
      navigationToken: args.navigationToken,
      sourceId: args.source.entry.stateId,
      targetId: args.target.entry.stateId,
      reducedMotion: false,
      viewport: args.viewport,
      prefer: "forward",
    };
    active.beginJob({ key, revision: args.revision, source: args.source, target: args.target });
    this.stagingBank = active;
    this.stagingSource = args.source;
    this.stagingTarget = args.target;
    this.stagingProgram = args.program;
    this.stagingProfile = args.viewport === "mobile" ? "mobile390" : "desktop";
    this.state = "gpu-staging";
    this.yieldGate.attach();
    this.queueSlice();
  }

  markSettled() {
    this.visual = "settled";
    this.state = "bound";
  }

  private async runCpu(intent: ActorIntent) {
    const manifest = this.cache.manifest;
    if (!manifest) {
      this.state = "absent";
      return;
    }
    const load = async (id: string) => {
      const hit = this.cache.peekState(id);
      if (hit) return hit;
      const entry = manifest.states.find((item) => item.stateId === id);
      if (!entry) return null;
      return this.cache.loadState(entry);
    };
    const source = await load(intent.sourceId);
    const target = await load(intent.targetId);
    if (!source || !target) {
      this.state = "absent";
      return;
    }
    if (!this.isCurrent(intent.revision)) return;
    this.instrumentation.begin("r6:cache-lookup");
    const cached = this.cache.lookup(intent.sourceId, intent.targetId, intent.reducedMotion, intent.viewport);
    if (cached) this.instrumentation.mark("r6:cache-hit", { key: frozenProgramKey(intent.sourceId, intent.targetId, intent.reducedMotion, intent.viewport) });
    else this.instrumentation.mark("r6:cache-miss");
    this.instrumentation.end("r6:cache-lookup");
    this.instrumentation.begin("r6:compile-frozen-pair");
    let program: TransitionProgram;
    try {
      program = await this.cache.getFrozen({
        source,
        target,
        manifest: this.cache.manifest!,
        motion: this.cache.motion,
        reducedMotion: intent.reducedMotion,
        viewport: intent.viewport,
      });
    } catch {
      if (this.isCurrent(intent.revision)) this.state = "absent";
      return;
    }
    this.instrumentation.end("r6:compile-frozen-pair", { programId: program.programId });
    if (!this.isCurrent(intent.revision)) return;
    this.state = "cpu-ready";
    const key = pairBankKey(source.entry.stateId, target.entry.stateId, program.programId);
    const existing = this.pool.findByKey(key);
    if (existing?.gpuReady) {
      existing.revision = intent.revision;
      this.finishReady(intent, program, source, target, existing);
      return;
    }
    const pinned = new Set<number>();
    if (this.pool.active().revision != null) pinned.add(this.pool.active().revision!);
    if (this.pending) pinned.add(this.pending.revision);
    const continueActive = existing === this.pool.active() && !this.pool.active().gpuReady;
    const bank = continueActive
      ? this.pool.active()
      : existing && existing !== this.pool.active()
        ? existing
        : this.pool.acquireStaging(pinned, intent.prefer);
    if (bank === this.pool.active() && this.pool.active().gpuReady) {
      this.instrumentation.noteStaleBind();
      return;
    }
    bank.beginJob({ key, revision: intent.revision, source, target });
    this.stagingBank = bank;
    this.stagingSource = source;
    this.stagingTarget = target;
    this.stagingProgram = program;
    this.stagingProfile = intent.viewport === "mobile" ? "mobile390" : "desktop";
    this.state = "gpu-staging";
    this.yieldGate.attach();
    this.queueSlice();
  }

  private queueSlice() {
    this.cancelSlice();
    this.sliceHandle = scheduleSlice(() => this.stepSlice());
  }

  private cancelSlice() {
    if (this.sliceHandle != null) cancelSlice(this.sliceHandle);
    this.sliceHandle = null;
  }

  private stepSlice() {
    const intent = this.pending;
    const bank = this.stagingBank;
    const program = this.stagingProgram;
    const source = this.stagingSource;
    const target = this.stagingTarget;
    if (!intent || !bank || !program || !source || !target) return;
    if (!this.isCurrent(intent.revision)) return;
    if (this.yieldGate.consume()) {
      this.queueSlice();
      return;
    }
    this.instrumentation.begin("r6:gpu-staging-slice");
    if (bank.nextPackIndex() >= 0) {
      bank.packNextSlot({ source, target, program, profile: this.stagingProfile });
      this.instrumentation.end("r6:gpu-staging-slice", { kind: "pack", bank: bank.id, packed: bank.packedSlots.filter(Boolean).length });
      this.queueSlice();
      return;
    }
    const renderer = this.renderer;
    if (!renderer) {
      this.instrumentation.end("r6:gpu-staging-slice", { kind: "wait-renderer" });
      this.queueSlice();
      return;
    }
    const uploaded = bank.uploadNextSlot(renderer, this.instrumentation);
    this.instrumentation.end("r6:gpu-staging-slice", uploaded);
    if (!bank.gpuReady) {
      this.queueSlice();
      return;
    }
    this.finishReady(intent, program, source, target, bank);
  }

  private finishReady(
    intent: ActorIntent,
    program: TransitionProgram,
    source: DecodedState,
    target: DecodedState,
    bank: GpuTextureBank,
  ) {
    if (!this.isCurrent(intent.revision) && !this.silentHydrate) return;
    this.state = "gpu-ready";
    this.instrumentation.mark("r6:gpu-ready", { revision: intent.revision, bank: bank.id, generation: bank.generation });
    const packet: PipelineReadyPacket = {
      revision: intent.revision,
      navigationToken: intent.navigationToken,
      program,
      source,
      target,
      bank,
      gpuReady: true,
      preparedAtMs: typeof performance !== "undefined" ? performance.now() : 0,
    };
    this.lastReady = packet;
    if (this.silentHydrate) {
      this.silentHydrate = false;
      this.pending = null;
      return;
    }
    this.onReady?.(packet);
  }

  lookahead(current: ScreenNodeId, direction: 1 | -1) {
    const neighbors = topologyNeighbors(current);
    const next = direction === 1 ? neighbors[0] : neighbors[neighbors.length - 1];
    const previous = direction === 1 ? neighbors[neighbors.length - 1] : neighbors[0];
    const keys: Array<readonly [string, string]> = [];
    const push = (fromNode: string | null | undefined, toNode: string | null | undefined) => {
      if (!fromNode || !toNode) return;
      const from = defaultGeometryForNode(fromNode);
      const to = defaultGeometryForNode(toNode);
      if (!from || !to || from === to) return;
      keys.push([from, to]);
    };
    push(current, next);
    push(next, current);
    push(current, previous);
    push(previous, current);
    if (current === "04") push("04", "05.1");
    return keys;
  }

  contextLost() {
    this.pool.markContextLost();
    if (this.state === "bound" || this.state === "gpu-ready") this.state = "gpu-staging";
  }

  contextRestored(renderer: WebGLRenderer) {
    this.renderer = renderer;
    this.pool.recreateAfterRestore();
    this.state = "absent";
  }

  restoreGpu() {
    if (this.renderer) this.contextRestored(this.renderer);
  }

  dispose() {
    this.cancelled = true;
    this.cancelSlice();
    this.yieldGate.detach();
    this.cache.cancel();
    this.pool.dispose();
  }
}

export function estimatedPairResidentBytes(program: TransitionProgram, source: DecodedState, target: DecodedState) {
  return PAIR_CPU_BYTES + decodedStateBytes(source) + decodedStateBytes(target) + (program.residual?.byteLength ?? 0);
}
