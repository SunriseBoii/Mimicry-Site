import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m3/reports");
const BASE = process.env.PS04M3_BASE ?? "http://localhost:3000";
mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  page.setDefaultTimeout(45000);
  const log = [];
  try {
    const started = Date.now();
    await page.goto(`${BASE}/visual-lab/photonic-skin-ps04-m3?state=master-neutral&theme=light&overlay=combined&dpr=1.5`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => {
      const canvas = document.querySelector("canvas");
      const lab = window.__PS04M3_LAB__;
      return Boolean(canvas && canvas.width > 8 && lab && lab.runId === "ps04-m3" && lab.ready);
    }, null, { timeout: 45000 });
    log.push({ step: "ready", ms: Date.now() - started });
    const before = await page.evaluate(() => {
      const lab = window.__PS04M3_LAB__;
      const shot = lab.snapshot();
      return {
        requested: shot.requestedStateId,
        draws: lab.stats.lastActorDrawCalls,
        triangles: lab.stats.lastActorTriangles,
        programs: lab.stats.programs,
        textures: lab.stats.textures,
        overlayEnabled: shot.overlayEnabled,
        scale: shot.displayed.scale,
      };
    });
    log.push({ step: "idle", ms: Date.now() - started, ...before });
    const clickStart = Date.now();
    await page.evaluate(async () => {
      await window.__PS04M3_LAB__.requestState("single-event");
    });
    await page.waitForFunction(() => {
      const lab = window.__PS04M3_LAB__;
      return Boolean(lab && lab.loading === false && lab.requested === "single-event");
    }, null, { timeout: 30000 });
    const after = await page.evaluate(() => {
      const lab = window.__PS04M3_LAB__;
      const shot = lab.snapshot();
      return {
        requested: shot.requestedStateId,
        settled: shot.settledStateId,
        status: shot.status,
        progress: shot.geometryProgress,
        loading: lab.loading,
        phase: shot.phaseAdapter.motionPhase,
      };
    });
    log.push({ step: "event-request", ms: Date.now() - clickStart, ...after });
    if (after.loading || after.requested !== "single-event") {
      throw new Error(`requestState hung or missed target: ${JSON.stringify(after)}`);
    }
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
