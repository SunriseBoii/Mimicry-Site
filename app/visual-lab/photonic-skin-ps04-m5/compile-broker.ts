/**
 * Main-thread facade for the compile worker. Falls back in-process when
 * Worker is unavailable (Node tests, failed URL). Latest-request-wins is
 * enforced by TransitionProgramCache inflight keys, not by this broker.
 */

import type { DecodedState, M3Manifest } from "../photonic-skin-m4-1/m41-data";
import type { M41Manifest } from "../photonic-skin-m4-1/m41-data";
import type { TransitionProgram } from "../photonic-skin-m4-1/m41-evaluator";
import { compileFrozenPair, viewportForFrame } from "../photonic-skin-ps04-m3/runtime";

type WorkerOk = { requestId: number; ok: true; program: TransitionProgram };
type WorkerErr = { requestId: number; ok: false; error: string };

export class CompileBroker {
  private worker: Worker | null | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, {
    resolve: (program: TransitionProgram) => void;
    reject: (reason: Error) => void;
  }>();

  lastError: string | null = null;
  lastReceiveMs = 0;
  workerStarted = false;

  get usingWorker() {
    return Boolean(this.ensure());
  }

  dispose() {
    for (const pending of this.pending.values()) pending.reject(new Error("compile broker disposed"));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  async compile(args: {
    source: DecodedState;
    target: DecodedState;
    manifest: M3Manifest;
    motion: M41Manifest | null;
    reducedMotion: boolean;
    viewport: "desktop" | "mobile";
    signal?: AbortSignal;
  }) {
    const worker = this.ensure();
    if (!worker) {
      return compileFrozenPair(args.source, args.target, args.manifest, args.motion, {
        reducedMotion: args.reducedMotion,
        trigger: "qa",
        viewport: viewportForFrame(args.viewport),
        signal: args.signal,
      });
    }
    const requestId = this.nextId++;
    return new Promise<TransitionProgram>((resolve, reject) => {
      if (args.signal?.aborted) {
        reject(new DOMException("Program request aborted", "AbortError"));
        return;
      }
      const onAbort = () => {
        this.pending.delete(requestId);
        reject(new DOMException("Program request aborted", "AbortError"));
      };
      args.signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.set(requestId, {
        resolve: (program) => {
          args.signal?.removeEventListener("abort", onAbort);
          resolve(program);
        },
        reject: (reason) => {
          args.signal?.removeEventListener("abort", onAbort);
          reject(reason);
        },
      });
      worker.postMessage({
        requestId,
        sourceId: args.source.entry.stateId,
        targetId: args.target.entry.stateId,
        reducedMotion: args.reducedMotion,
        viewport: args.viewport,
      });
    });
  }

  private ensure() {
    if (this.worker !== undefined) return this.worker;
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      this.worker = null;
      return null;
    }
    try {
      const worker = new Worker(new URL("./compile-worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<WorkerOk | WorkerErr>) => {
        const receivedAt = typeof performance !== "undefined" ? performance.now() : 0;
        const pending = this.pending.get(event.data.requestId);
        if (!pending) return;
        this.pending.delete(event.data.requestId);
        if (event.data.ok) {
          this.lastReceiveMs = typeof performance !== "undefined" ? performance.now() - receivedAt : 0;
          pending.resolve(event.data.program);
        } else pending.reject(new Error(event.data.error));
      };
      worker.onerror = (event) => {
        this.lastError = event.message || "worker error";
        this.worker = null;
      };
      this.worker = worker;
      this.workerStarted = true;
      return worker;
    } catch (reason) {
      this.lastError = reason instanceof Error ? reason.message : String(reason);
      this.worker = null;
      return null;
    }
  }
}

export const compileBroker = new CompileBroker();
