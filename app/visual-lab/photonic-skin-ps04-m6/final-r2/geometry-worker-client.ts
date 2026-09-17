import type { DecodedState, M3Manifest } from "../../photonic-skin-m4-1/m41-data";
import type { TransitionProgram } from "../../photonic-skin-m4-1/m41-evaluator";
import type { JointSnapshot } from "../../photonic-skin-ps04-m3/session";

export interface GeometryJob {
  source: DecodedState;
  target: DecodedState;
  identitySpace: M3Manifest["identitySpace"];
  reducedMotion: boolean;
  viewport: "desktop" | "mobile";
  captured?: JointSnapshot;
  rendered?: {source: DecodedState; target: DecodedState; program: TransitionProgram; progress: number};
}
export function prepareGeometry(job: GeometryJob, signal?: AbortSignal): Promise<{liveSource: DecodedState; program: TransitionProgram}> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Superseded", "AbortError")); return; }
    const worker = idleWorkers.pop() ?? new Worker(new URL("./geometry.worker.ts", import.meta.url), {type:"module"});
    const cleanup = (reuse: boolean) => {
      worker.onmessage = null; worker.onerror = null;
      if (reuse && idleWorkers.length < 2) idleWorkers.push(worker); else worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => { cleanup(false); reject(new DOMException("Superseded", "AbortError")); };
    signal?.addEventListener("abort", abort, {once:true});
    worker.onmessage = (event) => {
      cleanup(true);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    worker.onerror = (event) => { cleanup(false); reject(new Error(event.message)); };
    worker.postMessage(job);
  });
}

// Reuse initialized modules across transitions. Up to two idle workers are kept;
// aborted work is terminated so an obsolete computation cannot block a new one.
const idleWorkers: Worker[] = [];
