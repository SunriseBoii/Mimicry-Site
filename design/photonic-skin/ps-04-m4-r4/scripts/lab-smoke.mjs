import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m4-r4/reports");
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
    await page.goto(`${BASE}/visual-lab/photonic-skin-ps04-m4?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
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
        sessionId: lab.sessionId,
        stage: lab.stage,
      };
    });
    log.push({ step: "idle", ...idle });
    if (idle.canvases !== 1) throw new Error(`expected 1 canvas, got ${idle.canvases}`);
    if (idle.draws !== 1) throw new Error(`expected 1 actor draw, got ${idle.draws}`);
    if (idle.triangles !== 131072) throw new Error(`expected 131072 triangles, got ${idle.triangles}`);
    if (idle.sessionId !== "ps04-m4-r4") throw new Error(`expected sessionId ps04-m4-r4, got ${idle.sessionId}`);
    await page.getByRole("button", { name: "Собрать проект" }).click();
    await page.waitForFunction(() => window.__PS04M4_LAB__.activeNode === "03.1", null, { timeout: 15000 });
    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("08", "auto"));
    await page.waitForFunction(() => window.__PS04M4_LAB__.activeNode === "08", null, { timeout: 20000 });
    await page.waitForFunction(() => window.__PS04M4_LAB__.composition().actorDraw === false, null, { timeout: 20000 });
    const footer = await page.evaluate(() => ({
      node: window.__PS04M4_LAB__.activeNode,
      actorDraw: window.__PS04M4_LAB__.composition().actorDraw,
      canvases: window.__PS04M4_LAB__.canvasCount(),
      sessionId: window.__PS04M4_LAB__.sessionId,
    }));
    log.push({ step: "footer", ...footer });
    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("07", "auto"));
    await page.waitForFunction(() => window.__PS04M4_LAB__.activeNode === "07", null, { timeout: 20000 });
    const restored = await page.evaluate(() => ({
      node: window.__PS04M4_LAB__.activeNode,
      canvases: window.__PS04M4_LAB__.canvasCount(),
      sessionId: window.__PS04M4_LAB__.sessionId,
      actorDraw: window.__PS04M4_LAB__.composition().actorDraw,
      draws: window.__PS04M4_LAB__.stats.lastActorDrawCalls,
    }));
    log.push({ step: "footer-return", ...restored });
    if (restored.canvases !== 1 || restored.sessionId !== idle.sessionId) {
      throw new Error("footer reverse remounted the session or canvas");
    }
    const report = { ok: true, capturedAt: new Date().toISOString(), log };
    writeFileSync(path.join(OUT, "lab-smoke.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify(report.log.map((row) => row.step), null, 2)}\n`);
  } catch (error) {
    writeFileSync(path.join(OUT, "lab-smoke.json"), JSON.stringify({ ok: false, error: String(error), log }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
