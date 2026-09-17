import type { DecodedState } from "../visual-lab/photonic-skin-m4-1/m41-data";
import { buildContactSurface, type ContactSurface } from "./contact-surface";

const idleWorkers: Worker[] = [];

export function prepareContactSurface(state: DecodedState, signal?: AbortSignal): Promise<ContactSurface> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  if (typeof Worker === "undefined") return Promise.resolve(buildContactSurface(state));
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const worker = idleWorkers.pop() ?? new Worker(new URL("./contact-surface.worker.ts", import.meta.url), { type: "module" });
    const done = (reuse: boolean) => {
      worker.onmessage = null; worker.onerror = null;
      if (reuse && idleWorkers.length < 2) idleWorkers.push(worker); else worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => { done(false); reject(new DOMException("Aborted", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ surface?: ContactSurface; error?: string }>) => {
      done(true); if (event.data.surface) resolve(event.data.surface); else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => { done(false); reject(new Error(event.message)); };
    worker.postMessage(state);
  });
}
