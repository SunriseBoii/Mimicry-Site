import { writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.PS04M52_BASE ?? "http://localhost:3001";
const SANDBOX = `${BASE}/visual-lab/photonic-skin-ps04-m5/event-sandbox`;
const M51 = `${BASE}/visual-lab/photonic-skin-ps04-m5`;
const HOME = `${BASE}/`;
const OUT = path.join(process.cwd(), "design/photonic-skin/ps-04-m5-2/reports/browser-smoke.json");

async function waitSandbox(page) {
  await page.waitForSelector("canvas", { timeout: 120000 });
  await page.waitForFunction(() => {
    const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
    return Boolean(handle && handle.runId === "ps04-m5-2" && handle.ready);
  }, null, { timeout: 120000 });
  await page.waitForFunction(() => {
    const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
    const hash = handle.overlayHash?.() ?? "";
    const counts = handle.componentCounts?.() ?? [];
    const geo = handle.geometrySnapshot?.();
    return hash.startsWith("ps04-m5-2-")
      && handle.activeNode === "05.3"
      && geo?.settledGeometryId === "single-event"
      && Array.isArray(counts) && counts.length >= 5 && counts.some((value) => value > 1000);
  }, null, { timeout: 90000 });
}

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const report = { capturedAt: new Date().toISOString() };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    await page.goto(`${SANDBOX}?variant=c&view=canonical&theme=light&labels=0&mode=settled&dpr=1`, { waitUntil: "domcontentloaded" });
    await waitSandbox(page);
    await page.waitForTimeout(400);
    report.event = await page.evaluate(() => {
      const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
      const silhouette = handle.framebufferSilhouette?.();
      const memory = performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      } : null;
      return {
        runId: handle.runId,
        variant: handle.variant,
        overlayHash: handle.overlayHash?.(),
        node: handle.activeNode,
        draws: handle.stats.lastActorDrawCalls,
        triangles: handle.stats.lastActorTriangles,
        programs: handle.stats.programs,
        textures: handle.stats.textures,
        canvases: handle.canvasCount(),
        actorDraw: handle.composition()?.actorDraw,
        visiblePixelCount: silhouette?.visiblePixelCount ?? null,
        actorDrawWithoutPixels: silhouette?.failDrawWithoutPixels ?? null,
        memory,
      };
    });

    await page.evaluate(() => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).loseContext());
    await page.waitForTimeout(1200);
    await waitSandbox(page);
    report.contextRestore = await page.evaluate(() => {
      const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
      const silhouette = handle.framebufferSilhouette?.();
      const button = document.getElementById("ps04m5-context-restore-run-motion");
      return {
        buttonStatus: button instanceof HTMLButtonElement ? button.dataset.status ?? null : "missing",
        overlayHash: handle.overlayHash?.(),
        draws: handle.stats.lastActorDrawCalls,
        triangles: handle.stats.lastActorTriangles,
        programs: handle.stats.programs,
        actorDraw: handle.composition()?.actorDraw,
        visiblePixelCount: silhouette?.visiblePixelCount ?? null,
        settledGeometryId: handle.geometrySnapshot?.()?.settledGeometryId ?? null,
      };
    });
    await page.screenshot({
      path: path.join(process.cwd(), "design/photonic-skin/ps-04-m5-2/renders/boards/21-context-restore.png"),
      fullPage: false,
    });

    await page.goto(`${M51}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__PS04M5_LAB__?.runId === "ps04-m5" && window.__PS04M5_LAB__?.ready, null, { timeout: 60000 });
    report.m51 = await page.evaluate(() => ({
      runId: window.__PS04M5_LAB__?.runId,
      sandboxHandle: Boolean(window.__PS04M52_LAB__),
      node: window.__PS04M5_LAB__?.activeNode,
    }));

    await page.goto(HOME, { waitUntil: "domcontentloaded" });
    report.production = await page.evaluate(() => ({
      title: document.title,
      hasSandbox: Boolean(window.__PS04M52_LAB__),
      hasM51: Boolean(window.__PS04M5_LAB__),
      hasM4: Boolean(window.__PS04M4_LAB__),
      siteShell: Boolean(document.querySelector("[data-site-shell], .site-shell, main")) && !document.querySelector("[data-qa='m4-canvas']"),
    }));
    await context.close();
  } finally {
    await browser.close();
  }
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    pixels: report.event?.visiblePixelCount,
    restorePixels: report.contextRestore?.visiblePixelCount,
    m51: report.m51?.runId,
    productionLabs: report.production,
  }, null, 2)}\n`);
}

main();
