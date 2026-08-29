import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m4/reports");
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(60000);
  const log = [];
  try {
    const started = Date.now();
    await page.goto(`${BASE}/visual-lab/photonic-skin-ps04-m4?theme=light&dpr=1.5`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const canvas = document.querySelector("canvas");
      const lab = window.__PS04M4_LAB__;
      return Boolean(canvas && lab && lab.runId === "ps04-m4" && lab.ready);
    }, null, { timeout: 60000 });
    log.push({ step: "ready", ms: Date.now() - started });
    const idle = await page.evaluate(() => {
      const lab = window.__PS04M4_LAB__;
      return {
        canvases: lab.canvasCount(),
        node: lab.activeNode,
        draws: lab.stats.lastActorDrawCalls,
        triangles: lab.stats.lastActorTriangles,
        programs: lab.stats.programs,
        textures: lab.stats.textures,
      };
    });
    log.push({ step: "idle", ...idle });
    if (idle.canvases !== 1) throw new Error(`expected 1 canvas, got ${idle.canvases}`);
    await page.getByRole("button", { name: "Собрать проект" }).click();
    await page.waitForFunction(() => window.__PS04M4_LAB__.activeNode === "03.1", null, { timeout: 15000 });
    log.push({ step: "hero-anchor-build", node: "03.1" });
    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("01", "auto"));
    await page.waitForFunction(() => window.__PS04M4_LAB__.activeNode === "01", null, { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.4", "auto"));
    await page.waitForFunction(() => window.__PS04M4_LAB__.activeNode === "05.4", null, { timeout: 20000 });
    const beforeChapterWheel = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(400);
    const afterChapterWheel = await page.evaluate(() => ({ y: window.scrollY, node: window.__PS04M4_LAB__.activeNode }));
    log.push({ step: "wheel-in-chapter-05", before: beforeChapterWheel, ...afterChapterWheel });
    if (afterChapterWheel.y <= beforeChapterWheel) throw new Error("vertical wheel did not advance document scroll inside pinned chapter");
    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("08", "auto"));
    await page.waitForFunction(() => window.__PS04M4_LAB__.activeNode === "08", null, { timeout: 20000 });
    await page.waitForFunction(() => window.__PS04M4_LAB__.composition().actorDraw === false, null, { timeout: 20000 });
    const footer = await page.evaluate(() => ({
      node: window.__PS04M4_LAB__.activeNode,
      draws: window.__PS04M4_LAB__.stats.lastActorDrawCalls,
      actorDraw: window.__PS04M4_LAB__.composition().actorDraw,
    }));
    log.push({ step: "footer", ...footer });
    const beforeWheel = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(250);
    const afterWheel = await page.evaluate(() => ({ y: window.scrollY, node: window.__PS04M4_LAB__.activeNode }));
    log.push({ step: "wheel-from-footer", beforeWheel, ...afterWheel });
    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("01", "auto"));
    await page.waitForFunction(() => window.__PS04M4_LAB__.activeNode === "01", null, { timeout: 20000 });
    const resources = await page.evaluate(() => ({
      canvases: document.querySelectorAll("canvas").length,
      headers: document.querySelectorAll("[data-qa='m4-header']").length,
      programs: window.__PS04M4_LAB__.stats.programs,
      textures: window.__PS04M4_LAB__.stats.textures,
    }));
    log.push({ step: "return-hero", ...resources });
    if (resources.canvases !== 1 || resources.headers !== 1) throw new Error("canvas/header count drifted");
    const report = { ok: true, capturedAt: new Date().toISOString(), log };
    writeFileSync(path.join(OUT, "lab-smoke.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    const report = { ok: false, error: error instanceof Error ? error.message : String(error), log };
    writeFileSync(path.join(OUT, "lab-smoke.json"), JSON.stringify(report, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
