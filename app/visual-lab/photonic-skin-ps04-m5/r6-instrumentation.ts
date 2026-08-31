/**
 * Query-gated R6 performance marks. Default lab route is unchanged;
 * `?r6Staging=0` keeps the R5 first-visible-bind path for stall reproduction.
 */

export type R6MarkName =
  | "r6:navigation-intent"
  | "r6:semantic-node-commit"
  | "r6:actor-request"
  | "r6:cache-lookup"
  | "r6:cache-hit"
  | "r6:cache-miss"
  | "r6:compile-frozen-pair"
  | "r6:compile-transition"
  | "r6:compile-live-retarget"
  | "r6:freeze-program"
  | "r6:typed-array-copy"
  | "r6:data-texture-create"
  | "r6:texture-image-data"
  | "r6:needs-update"
  | "r6:init-texture"
  | "r6:texture-on-update"
  | "r6:atomic-uniform-bind"
  | "r6:first-render-after-bind"
  | "r6:geometry-transaction-start"
  | "r6:geometry-settle"
  | "r6:palette-settle"
  | "r6:idle-handoff"
  | "r6:react-commit"
  | "r6:dispose-eviction"
  | "r6:gpu-staging-slice"
  | "r6:gpu-ready"
  | "r6:actor-draw";

export interface R6MarkRecord {
  name: string;
  atMs: number;
  detail?: Record<string, unknown>;
}

export interface R6MeasureRecord {
  name: string;
  durationMs: number;
  startMs: number;
  endMs: number;
  detail?: Record<string, unknown>;
}

export interface R6LongTask {
  duration: number;
  start: number;
  name: string;
}

function performanceNow() {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

export function r6GpuTimerEnabled(search = typeof window === "undefined" ? "" : window.location.search) {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return query.get("r6GpuTimer") !== "0";
}

export function r6StagingEnabled(search = typeof window === "undefined" ? "" : window.location.search) {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return query.get("r6Staging") !== "0";
}

export function r6DiagEnabled(search = typeof window === "undefined" ? "" : window.location.search) {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return query.get("r6Diag") === "1" || query.get("r6Staging") === "0" || r6StagingEnabled(search);
}

export class R6Instrumentation {
  readonly marks: R6MarkRecord[] = [];
  readonly measures: R6MeasureRecord[] = [];
  readonly longTasks: R6LongTask[] = [];
  textureUploadCount = 0;
  initTextureCount = 0;
  dataTextureCreateCount = 0;
  typedArrayCopyCount = 0;
  typedArrayBytes = 0;
  atomicBindCount = 0;
  staleBindRejected = 0;
  private longTaskObserver: PerformanceObserver | null = null;
  private readonly pending = new Map<string, number>();

  startLongTasks() {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      this.longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTasks.push({ duration: entry.duration, start: entry.startTime, name: entry.name });
        }
      });
      this.longTaskObserver.observe({ entryTypes: ["longtask"] });
    } catch {
      this.longTaskObserver = null;
    }
  }

  stopLongTasks() {
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
  }

  mark(name: R6MarkName | string, detail?: Record<string, unknown>) {
    const atMs = performanceNow();
    this.marks.push({ name, atMs, detail });
    if (typeof performance !== "undefined" && typeof performance.mark === "function") {
      try {
        performance.mark(name, detail ? { detail } : undefined);
      } catch {
        performance.mark(name);
      }
    }
    return atMs;
  }

  begin(name: string) {
    const at = this.mark(name);
    this.pending.set(name, at);
    return at;
  }

  end(name: string, detail?: Record<string, unknown>) {
    const startMs = this.pending.get(name) ?? performanceNow();
    this.pending.delete(name);
    const endMs = performanceNow();
    const durationMs = Math.max(0, endMs - startMs);
    this.measures.push({ name, durationMs, startMs, endMs, detail });
    if (typeof performance !== "undefined" && typeof performance.measure === "function") {
      try {
        performance.measure(name, { start: startMs, end: endMs, detail });
      } catch {
        // mark/measure names may collide with user timings; keep the in-memory record.
      }
    }
    return durationMs;
  }

  noteTextureUpload(bytes?: number) {
    this.textureUploadCount += 1;
    if (bytes) this.typedArrayBytes += bytes;
    this.mark("r6:texture-on-update", { bytes: bytes ?? null, count: this.textureUploadCount });
  }

  noteStaleBind() {
    this.staleBindRejected += 1;
    this.mark("r6:dispose-eviction", { reason: "stale-revision" });
  }

  noteAtomicBind(revision?: number) {
    this.atomicBindCount += 1;
    this.mark("r6:atomic-uniform-bind", { revision: revision ?? null, count: this.atomicBindCount });
  }

  noteInitTexture(slot?: string, durationMs?: number) {
    this.initTextureCount += 1;
    this.mark("r6:init-texture", { slot: slot ?? null, durationMs: durationMs ?? null, count: this.initTextureCount });
  }

  snapshot() {
    return {
      marks: this.marks.slice(),
      measures: this.measures.slice(),
      longTasks: this.longTasks.slice(),
      textureUploadCount: this.textureUploadCount,
      initTextureCount: this.initTextureCount,
      dataTextureCreateCount: this.dataTextureCreateCount,
      typedArrayCopyCount: this.typedArrayCopyCount,
      typedArrayBytes: this.typedArrayBytes,
      atomicBindCount: this.atomicBindCount,
      staleBindRejected: this.staleBindRejected,
    };
  }

  reset() {
    this.marks.length = 0;
    this.measures.length = 0;
    this.longTasks.length = 0;
    this.textureUploadCount = 0;
    this.initTextureCount = 0;
    this.dataTextureCreateCount = 0;
    this.typedArrayCopyCount = 0;
    this.typedArrayBytes = 0;
    this.atomicBindCount = 0;
    this.staleBindRejected = 0;
    this.pending.clear();
  }
}

export class DisjointGpuTimer {
  private gl: WebGL2RenderingContext | null = null;
  private ext: {
    TIME_ELAPSED_EXT: number;
    GPU_DISJOINT_EXT: number;
    QUERY_RESULT_EXT?: number;
    QUERY_RESULT_AVAILABLE_EXT?: number;
  } | null = null;
  private active: WebGLQuery | null = null;
  private pending: WebGLQuery[] = [];
  lastGpuMs: number | null = null;
  available = false;
  disjoint = false;
  samples: number[] = [];

  attach(gl: WebGL2RenderingContext | null) {
    this.gl = gl;
    if (!gl) {
      this.available = false;
      this.ext = null;
      return;
    }
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    this.ext = ext;
    this.available = Boolean(ext);
  }

  enabled = true;

  begin() {
    if (!this.enabled) return;
    const gl = this.gl;
    const ext = this.ext;
    if (!gl || !ext || this.active) return;
    this.disjoint = Boolean(gl.getParameter(ext.GPU_DISJOINT_EXT));
    if (this.disjoint) return;
    const query = gl.createQuery();
    if (!query) return;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    this.active = query;
  }

  end() {
    if (!this.enabled) return;
    const gl = this.gl;
    const ext = this.ext;
    if (!gl || !ext || !this.active) return;
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
    this.poll();
  }

  poll() {
    const gl = this.gl;
    const ext = this.ext;
    if (!gl || !ext) return;
    this.disjoint = Boolean(gl.getParameter(ext.GPU_DISJOINT_EXT));
    while (this.pending.length > 0) {
      const query = this.pending[0]!;
      const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
      if (!available) break;
      this.pending.shift();
      if (this.disjoint) {
        gl.deleteQuery(query);
        continue;
      }
      const nanos = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
      const ms = nanos / 1e6;
      this.lastGpuMs = ms;
      this.samples.push(ms);
      if (this.samples.length > 240) this.samples.shift();
      gl.deleteQuery(query);
    }
  }

  snapshot() {
    const sorted = this.samples.slice().sort((a, b) => a - b);
    const quantile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null;
    return {
      available: this.available,
      extension: this.available ? "EXT_disjoint_timer_query_webgl2" as const : null,
      disjoint: this.disjoint,
      gpuMs: this.lastGpuMs,
      count: this.samples.length,
      p50: quantile(0.5),
      p95: quantile(0.95),
      max: sorted[sorted.length - 1] ?? null,
    };
  }
}
