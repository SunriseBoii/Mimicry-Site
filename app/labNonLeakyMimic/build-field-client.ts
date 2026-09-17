import type { SurfaceSamples } from "./surface-field";

/** A superseded selection terminates its CPU job instead of queueing stale work. */
export function buildFieldInWorker(samples: SurfaceSamples, signal: AbortSignal) {
  return new Promise<Float32Array>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const worker = new Worker(new URL("./surface.worker.ts", import.meta.url));
    const dispose = () => { signal.removeEventListener("abort", abort); worker.terminate(); };
    const abort = () => { dispose(); reject(new DOMException("Aborted", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ data?: Float32Array; error?: string }>) => {
      dispose();
      if (event.data.data) resolve(event.data.data); else reject(new Error(event.data.error ?? "Surface worker failed"));
    };
    worker.onerror = () => { dispose(); reject(new Error("Не удалось построить оболочку")); };
    worker.postMessage({ id: 1, samples }, [samples.positions.buffer, samples.normals.buffer]);
  });
}
