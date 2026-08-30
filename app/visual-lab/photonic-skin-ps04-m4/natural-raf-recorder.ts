/**
 * In-page natural-rAF performance recorder. Independent of Playwright
 * screenshot cadence, waitForTimeout(50), and video capture sampling.
 */

export interface RafQuantiles {
  p50: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
  count: number;
  over16_7: number;
  over33_3: number;
  over50: number;
  consecutiveMissedMax: number;
}

export interface NaturalRafReport {
  scenario: string;
  estimatedRefreshMs: number;
  rAF: RafQuantiles;
  transitionRequestLatencyMs: number | null;
  transitionDurationMs: number | null;
  scrollHandlerMs: RafQuantiles | null;
  sessionTickMs: RafQuantiles | null;
  uniformUpdateMs: RafQuantiles | null;
  reactCommitCount: number;
  shaderProgramCount: number | null;
  geometryRecreationCount: number;
  materialRecreationCount: number;
  textureUploadCount: number;
  longTasks: Array<{ duration: number; start: number; name: string }>;
  gpuTimer: {
    available: boolean;
    extension: "EXT_disjoint_timer_query_webgl2" | null;
    disjoint: boolean | null;
    gpuMs: RafQuantiles | null;
    note: string;
  };
  memory: {
    before: MemorySample | null;
    after: MemorySample | null;
  };
  resources: {
    canvases: number;
    programs: number | null;
    textures: number | null;
    geometries: number | null;
    draws: number | null;
  };
}

interface MemorySample {
  jsHeapUsedBytes: number | null;
  jsHeapTotalBytes: number | null;
}

function quantile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

function summarize(values: number[]): RafQuantiles {
  const sorted = values.slice().sort((a, b) => a - b);
  let consecutive = 0;
  let consecutiveMax = 0;
  for (const value of values) {
    if (value > 16.7) {
      consecutive += 1;
      consecutiveMax = Math.max(consecutiveMax, consecutive);
    } else consecutive = 0;
  }
  return {
    p50: Number(quantile(sorted, 0.5).toFixed(3)),
    p95: Number(quantile(sorted, 0.95).toFixed(3)),
    p99: Number(quantile(sorted, 0.99).toFixed(3)),
    max: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
    mean: Number((values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)).toFixed(3)),
    count: values.length,
    over16_7: values.filter((value) => value > 16.7).length,
    over33_3: values.filter((value) => value > 33.3).length,
    over50: values.filter((value) => value > 50).length,
    consecutiveMissedMax: consecutiveMax,
  };
}

function memorySample(): MemorySample | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
  if (!memory) return { jsHeapUsedBytes: null, jsHeapTotalBytes: null };
  return { jsHeapUsedBytes: memory.usedJSHeapSize, jsHeapTotalBytes: memory.totalJSHeapSize };
}

export class NaturalRafRecorder {
  private running = false;
  private frame = 0;
  private previous = 0;
  private readonly deltas: number[] = [];
  private readonly tickMs: number[] = [];
  private readonly uniformMs: number[] = [];
  private readonly scrollMs: number[] = [];
  private readonly longTasks: NaturalRafReport["longTasks"] = [];
  private observer: PerformanceObserver | null = null;
  private scenario = "";
  private before: MemorySample | null = null;
  private requestLatencyMs: number | null = null;
  private transitionDurationMs: number | null = null;
  private reactCommits = 0;
  private geometryRecreations = 0;
  private materialRecreations = 0;
  private textureUploads = 0;
  private resources: NaturalRafReport["resources"] = {
    canvases: 0, programs: null, textures: null, geometries: null, draws: null,
  };

  markReactCommit() { this.reactCommits += 1; }
  markGeometry() { this.geometryRecreations += 1; }
  markMaterial() { this.materialRecreations += 1; }
  markTextureUpload() { this.textureUploads += 1; }
  noteTickMs(ms: number) { if (this.running) this.tickMs.push(ms); }
  noteUniformMs(ms: number) { if (this.running) this.uniformMs.push(ms); }
  noteScrollMs(ms: number) { if (this.running) this.scrollMs.push(ms); }
  noteRequestLatency(ms: number) { this.requestLatencyMs = ms; }
  noteTransitionDuration(ms: number) { this.transitionDurationMs = ms; }
  noteResources(partial: Partial<NaturalRafReport["resources"]>) {
    this.resources = { ...this.resources, ...partial };
  }

  start(scenario: string) {
    this.stop();
    this.running = true;
    this.scenario = scenario;
    this.deltas.length = 0;
    this.tickMs.length = 0;
    this.uniformMs.length = 0;
    this.scrollMs.length = 0;
    this.longTasks.length = 0;
    this.reactCommits = 0;
    this.geometryRecreations = 0;
    this.materialRecreations = 0;
    this.textureUploads = 0;
    this.requestLatencyMs = null;
    this.transitionDurationMs = null;
    this.before = memorySample();
    this.previous = performance.now();
    if (typeof PerformanceObserver !== "undefined") {
      try {
        this.observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.longTasks.push({ duration: entry.duration, start: entry.startTime, name: entry.name });
          }
        });
        this.observer.observe({ entryTypes: ["longtask"] });
      } catch {
        this.observer = null;
      }
    }
    const loop = (now: number) => {
      if (!this.running) return;
      const delta = now - this.previous;
      this.previous = now;
      this.deltas.push(delta);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): NaturalRafReport {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.observer = null;
    const gpu = probeGpuTimer();
    return {
      scenario: this.scenario,
      estimatedRefreshMs: Number((this.deltas.slice(0, 30).reduce((sum, value) => sum + value, 0) / Math.max(Math.min(this.deltas.length, 30), 1)).toFixed(3)),
      rAF: summarize(this.deltas),
      transitionRequestLatencyMs: this.requestLatencyMs,
      transitionDurationMs: this.transitionDurationMs,
      scrollHandlerMs: this.scrollMs.length ? summarize(this.scrollMs) : null,
      sessionTickMs: this.tickMs.length ? summarize(this.tickMs) : null,
      uniformUpdateMs: this.uniformMs.length ? summarize(this.uniformMs) : null,
      reactCommitCount: this.reactCommits,
      shaderProgramCount: this.resources.programs,
      geometryRecreationCount: this.geometryRecreations,
      materialRecreationCount: this.materialRecreations,
      textureUploadCount: this.textureUploads,
      longTasks: this.longTasks.slice(),
      gpuTimer: gpu,
      memory: { before: this.before, after: memorySample() },
      resources: this.resources,
    };
  }
}

function probeGpuTimer(): NaturalRafReport["gpuTimer"] {
  if (typeof document === "undefined") {
    return {
      available: false,
      extension: null,
      disjoint: null,
      gpuMs: null,
      note: "GPU timer unavailable outside a document",
    };
  }
  const canvas = document.querySelector("canvas");
  const gl = canvas?.getContext("webgl2") as WebGL2RenderingContext | null;
  if (!gl) {
    return {
      available: false,
      extension: null,
      disjoint: null,
      gpuMs: null,
      note: "WebGL2 context not available to the recorder",
    };
  }
  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  if (!ext) {
    return {
      available: false,
      extension: null,
      disjoint: null,
      gpuMs: null,
      note: "EXT_disjoint_timer_query_webgl2 unavailable",
    };
  }
  return {
    available: true,
    extension: "EXT_disjoint_timer_query_webgl2",
    disjoint: Boolean(gl.getParameter(ext.GPU_DISJOINT_EXT)),
    gpuMs: null,
    note: "Extension present. GPU time is sampled separately from CPU/rAF; a single probe does not time the actor draw.",
  };
}
