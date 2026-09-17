import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require(process.env.PS04_PLAYWRIGHT_MODULE || "playwright");
} catch {
  playwright = require(join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
}
const { chromium } = playwright;
const baseUrl = process.env.PS04_QA_URL || "http://localhost:3000";
const outputPath = process.argv[2] || "design/photonic-skin/ps-04-final-r1/reports/performance-qa.json";
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
});

const quantile = (values, p) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runViewport(label, width, height, deviceScaleFactor) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(() => window.__PS04M62_LAB__?.ready === true && document.querySelector("canvas"), undefined, { timeout: 120_000 });
  await page.waitForFunction(() => window.__PS04M5_SCENE_READY__ === true, undefined, { timeout: 120_000 }).catch(() => undefined);
  const initialCanvas = await page.locator("canvas").elementHandle();
  const environment = await page.evaluate(() => {
    const handle = window.__PS04M62_LAB__;
    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    const memory = performance.memory;
    return {
      userAgent: navigator.userAgent,
      viewport: [innerWidth, innerHeight],
      devicePixelRatio,
      rendererDpr: handle.stats.dpr,
      canvasCss: [canvas?.clientWidth ?? 0, canvas?.clientHeight ?? 0],
      drawingBuffer: [canvas?.width ?? 0, canvas?.height ?? 0],
      preserveDrawingBuffer: gl?.getContextAttributes()?.preserveDrawingBuffer ?? null,
      webglRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
      webglVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
      memoryBeforeBytes: memory?.usedJSHeapSize ?? null,
      actorFramebufferReady: handle.actorFramebufferReady,
      posterCount: document.querySelectorAll('[data-qa="ps04-neutral-poster"]').length,
    };
  });

  const sequence = ["02", "05.1", "05.3", "05.5", "03.1", "01", "05.3", "05.5", "05.3", "05.5", "01"];
  const transitions = [];
  await page.evaluate(() => window.__PS04M62_LAB__.startPerf("PS04-final-route-transitions"));
  for (const nodeId of sequence) {
    const invokedAt = Date.now();
    await page.evaluate((id) => window.__PS04M62_LAB__.scrollToNode(id, "auto", "programmatic"), nodeId);
    let settled = true;
    try {
      await page.waitForFunction((id) => {
        const handle = window.__PS04M62_LAB__;
        const tx = handle?.transaction();
        return handle?.committedNode() === id && tx?.status === "settled";
      }, nodeId, { timeout: 8_000 });
    } catch {
      settled = false;
    }
    const sample = await page.evaluate(() => {
      const handle = window.__PS04M62_LAB__;
      const latencies = handle.latencies();
      const geometry = handle.geometrySnapshot();
      return {
        committedNode: handle.committedNode(),
        visibleScreen: handle.activeNode,
        semanticTarget: handle.contract()?.resolvedGeometryId ?? null,
        boundTarget: geometry.boundTargetGeometryId,
        geometryStatus: geometry.status,
        transactionStatus: handle.transaction().status,
        firstVisibleTransitionMs: latencies.firstVisibleTransitionMs,
        firstWebglChangeMs: latencies.firstWebglChangeAtMs && latencies.intentAtMs
          ? Math.max(0, latencies.firstWebglChangeAtMs - latencies.intentAtMs)
          : null,
        requestDelayMs: latencies.requestDelayMs,
        transitionDurationMs: latencies.transitionDurationMs,
        sceneP95Ms: handle.stats.p95Ms,
        rendererDpr: handle.stats.dpr,
      };
    });
    transitions.push({ nodeId, settled, wallMs: Date.now() - invokedAt, ...sample });
    console.log(`${label}: ${nodeId} ${settled ? "settled" : "TIMEOUT"} first=${sample.firstVisibleTransitionMs ?? "n/a"}ms`);
  }
  const perf = await page.evaluate(() => window.__PS04M62_LAB__.stopPerf());

  const cdp = await context.newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage").catch(() => undefined);
  await sleep(300);
  const afterRepeat = await page.evaluate(() => ({
    memoryBytes: performance.memory?.usedJSHeapSize ?? null,
    canvasCount: document.querySelectorAll("canvas").length,
    resources: window.__PS04M62_LAB__.resource(),
    stats: window.__PS04M62_LAB__.stats,
  }));
  const resizeTo = label === "desktop" ? { width: 1280, height: 720 } : { width: 430, height: 844 };
  await page.setViewportSize(resizeTo);
  await sleep(1_200);
  const resize = await page.evaluate((canvas) => ({
    canvasPreserved: canvas === document.querySelector("canvas"),
    cssSize: [canvas.clientWidth, canvas.clientHeight],
    drawingBuffer: [canvas.width, canvas.height],
    rendererDpr: window.__PS04M62_LAB__.stats.dpr,
    actorFramebufferReady: window.__PS04M62_LAB__.actorFramebufferReady,
  }), initialCanvas);
  await page.evaluate(() => window.__PS04M62_LAB__.setDpr(1));
  await sleep(800);
  const dprChange = await page.evaluate((canvas) => ({
    canvasPreserved: canvas === document.querySelector("canvas"),
    drawingBuffer: [canvas.width, canvas.height],
    rendererDpr: window.__PS04M62_LAB__.stats.dpr,
    actorFramebufferReady: window.__PS04M62_LAB__.actorFramebufferReady,
  }), initialCanvas);

  await page.evaluate(() => window.__PS04M62_LAB__.loseContext());
  await sleep(2_000);
  const contextRestore = await page.evaluate((canvas) => ({
    canvasPreserved: canvas === document.querySelector("canvas"),
    contextState: window.__PS04M62_LAB__.contextState,
    actorFramebufferReady: window.__PS04M62_LAB__.actorFramebufferReady,
    posterCount: document.querySelectorAll('[data-qa="ps04-neutral-poster"]').length,
    rendererDpr: window.__PS04M62_LAB__.stats.dpr,
  }), initialCanvas);

  await context.close();
  return {
    environment,
    transitions,
    firstVisibleTransitionP95Ms: quantile(transitions.map((row) => row.firstVisibleTransitionMs), 0.95),
    firstWebglChangeP95Ms: quantile(transitions.map((row) => row.firstWebglChangeMs), 0.95),
    perf,
    afterRepeat,
    resize,
    dprChange,
    contextRestore,
    pageErrors: errors,
  };
}

const result = { capturedAt: new Date().toISOString(), url: baseUrl, browserMode: "headless Chromium", viewports: {} };
try {
  result.viewports.desktop = await runViewport("desktop", 1440, 900, 2);
  result.viewports.mobile = await runViewport("mobile", 390, 844, 3);
} finally {
  await browser.close();
}
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(result, null, 2) + "\n");
console.log(`wrote ${outputPath}`);
