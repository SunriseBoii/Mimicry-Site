import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m4`;
const M3 = `${BASE}/visual-lab/photonic-skin-ps04-m3`;
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m4-r1/reports");
mkdirSync(OUT, { recursive: true });

async function waitM4(page) {
  await page.waitForSelector("canvas", { timeout: 60000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M4_LAB__;
    return Boolean(canvas && lab && lab.runId === "ps04-m4" && lab.ready);
  }, null, { timeout: 60000 });
}

async function waitM3(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M3_LAB__;
    return Boolean(canvas && canvas.width > 8 && lab && lab.runId === "ps04-m3" && lab.ready);
  }, null, { timeout: 45000 });
}

async function sample(page, ms) {
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const lab = window.__PS04M4_LAB__;
    return {
      stats: lab?.stats,
      environment: lab?.environment,
      node: lab?.activeNode,
      composition: typeof lab?.composition === "function" ? lab.composition() : null,
      canvases: document.querySelectorAll("canvas").length,
    };
  });
}

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60000);
  const scenarios = {};
  try {
    await page.goto(`${M3}?state=master-neutral&theme=light&overlay=combined&dpr=1.5`, { waitUntil: "domcontentloaded" });
    await waitM3(page);
    await page.waitForTimeout(2500);
    scenarios.m3Idle = await page.evaluate(() => ({ stats: window.__PS04M3_LAB__?.stats, environment: window.__PS04M3_LAB__?.environment }));

    await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await waitM4(page);
    scenarios.idleOrdinary = await sample(page, 4000);

    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("03.1"));
    await page.waitForFunction(() => window.__PS04M4_LAB__.activeNode === "03.1");
    scenarios.buildMaster = await sample(page, 1500);

    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.1"));
    await page.waitForFunction(() => window.__PS04M4_LAB__.activeNode === "05.1");
    scenarios.leftPlacement = await sample(page, 1500);

    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("06.2"));
    await page.waitForFunction(() => window.__PS04M4_LAB__.activeNode === "06.2");
    scenarios.rightPlacement = await sample(page, 1500);

    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("08"));
    await page.waitForFunction(() => window.__PS04M4_LAB__.activeNode === "08");
    scenarios.footerExit = await sample(page, 1600);

    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("07"));
    await page.waitForFunction(() => window.__PS04M4_LAB__.activeNode === "07");
    scenarios.footerReturn = await sample(page, 1600);

    const report = {
      capturedAt: new Date().toISOString(),
      environment: scenarios.idleOrdinary?.environment,
      note: "Frame deltas are browser rAF pacing, not GPU timers.",
      resourceContract: {
        canvases: scenarios.idleOrdinary?.canvases,
        draws: scenarios.idleOrdinary?.stats?.lastActorDrawCalls,
        triangles: scenarios.idleOrdinary?.stats?.lastActorTriangles,
        programs: scenarios.idleOrdinary?.stats?.programs,
      },
      scenarios,
    };
    writeFileSync(path.join(OUT, "performance-qa.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify({
      m3p95: scenarios.m3Idle?.stats?.p95Ms,
      m4p95: scenarios.idleOrdinary?.stats?.p95Ms,
      m4draws: scenarios.idleOrdinary?.stats?.lastActorDrawCalls,
      m4tri: scenarios.idleOrdinary?.stats?.lastActorTriangles,
      footerActor: scenarios.footerExit?.composition?.actorDraw,
    }, null, 2)}\n`);
  } catch (error) {
    writeFileSync(path.join(OUT, "performance-qa.json"), JSON.stringify({ ok: false, error: String(error) }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
