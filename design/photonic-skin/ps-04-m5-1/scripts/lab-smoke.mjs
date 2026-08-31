import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m5-1/reports");
const BASE = process.env.PS04M5_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m5`;
mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(90000);
  const log = [];
  try {
    const started = Date.now();
    await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const canvas = document.querySelector("canvas");
      const lab = window.__PS04M5_LAB__;
      return Boolean(canvas && lab && lab.runId === "ps04-m5" && lab.ready);
    }, null, { timeout: 90000 });
    await page.waitForFunction(() => {
      const lab = window.__PS04M5_LAB__;
      return Boolean(lab?.actorFramebufferReady && lab.stats.lastActorDrawCalls === 1);
    }, null, { timeout: 30000 });
    log.push({ step: "ready", ms: Date.now() - started });
    const idle = await page.evaluate(() => {
      const lab = window.__PS04M5_LAB__;
      const silhouette = typeof lab.framebufferSilhouette === "function" ? lab.framebufferSilhouette() : null;
      return {
        canvases: lab.canvasCount(),
        node: lab.activeNode,
        draws: lab.stats.lastActorDrawCalls,
        triangles: lab.stats.lastActorTriangles,
        programs: lab.stats.programs,
        stage: lab.stage,
        sessionId: lab.sessionId,
        actorDraw: lab.composition()?.actorDraw,
        pixels: silhouette?.pixelCount ?? null,
        failDrawWithoutPixels: lab.stats.lastActorDrawCalls === 1 && (silhouette?.pixelCount ?? 0) === 0,
      };
    });
    log.push({ step: "idle", ...idle });
    await page.evaluate(() => window.__PS04M5_LAB__.scrollToNode("08", "auto"));
    await page.waitForFunction(() => window.__PS04M5_LAB__.activeNode === "08", null, { timeout: 40000 });
    const footer = await page.evaluate(() => {
      const lab = window.__PS04M5_LAB__;
      const silhouette = typeof lab.framebufferSilhouette === "function" ? lab.framebufferSilhouette() : null;
      return {
        draws: lab.stats.lastActorDrawCalls,
        actorDraw: lab.composition()?.actorDraw,
        pixels: silhouette?.pixelCount ?? 0,
      };
    });
    log.push({ step: "footer", ...footer });
    await page.evaluate(() => window.__PS04M5_LAB__.scrollToNode("01", "auto"));
    await page.waitForFunction(() => window.__PS04M5_LAB__.activeNode === "01" && window.__PS04M5_LAB__.stats.lastActorDrawCalls === 1, null, { timeout: 40000 });
    log.push({ step: "footer-return", draws: await page.evaluate(() => window.__PS04M5_LAB__.stats.lastActorDrawCalls) });
    const m4 = await page.goto(`${BASE}/visual-lab/photonic-skin-ps04-m4?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__PS04M4_LAB__?.runId === "ps04-m4" && window.__PS04M4_LAB__.ready, null, { timeout: 90000 });
    log.push({ step: "m4-baseline", status: m4?.status(), runId: await page.evaluate(() => window.__PS04M4_LAB__.runId) });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    log.push({
      step: "production-home",
      title: await page.title(),
      hasLab: await page.evaluate(() => Boolean(window.__PS04M5_LAB__ || window.__PS04M4_LAB__)),
    });
  } finally {
    await browser.close();
  }
  writeFileSync(path.join(OUT, "lab-smoke.json"), JSON.stringify({ capturedAt: new Date().toISOString(), log }, null, 2));
  const idle = log.find((row) => row.step === "idle");
  const footer = log.find((row) => row.step === "footer");
  process.stdout.write(`${JSON.stringify({
    ready: Boolean(log.find((row) => row.step === "ready")),
    idleDraw: idle?.draws,
    failDrawWithoutPixels: idle?.failDrawWithoutPixels === false,
    footerPixels: footer?.pixels,
    m4ok: log.find((row) => row.step === "m4-baseline")?.runId === "ps04-m4",
  }, null, 2)}\n`);
}

main();
