import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const BASE = process.env.PS04M3_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m3`;
const M2 = `${BASE}/visual-lab/photonic-skin-ps04-m2`;
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m3/reports");

mkdirSync(OUT, { recursive: true });

async function waitM3(page) {
  await page.waitForSelector("canvas", { timeout: 45000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M3_LAB__;
    return Boolean(canvas && canvas.width > 8 && lab && lab.runId === "ps04-m3" && lab.ready);
  }, null, { timeout: 45000 });
}

async function waitM2(page) {
  await page.waitForSelector("canvas", { timeout: 25000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M2_LAB__;
    return Boolean(canvas && canvas.width > 8 && lab);
  }, null, { timeout: 25000 });
}

async function sampleStats(page, hook, ms) {
  await page.waitForTimeout(1200);
  await page.waitForTimeout(ms);
  return page.evaluate((name) => {
    if (name === "m3") {
      const lab = window.__PS04M3_LAB__;
      return { stats: lab?.stats, environment: lab?.environment, snapshot: typeof lab?.snapshot === "function" ? lab.snapshot() : null };
    }
    const lab = window.__PS04M2_LAB__;
    return { stats: lab?.stats, environment: lab?.environment };
  }, hook);
}

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60000);
  try {
    await page.goto(`${M2}?state=master-neutral&theme=light&phase=0.25&play=1&dpr=1.5`, { waitUntil: "domcontentloaded" });
    await waitM2(page);
    const m2Idle = await sampleStats(page, "m2", 8000);

    await page.goto(`${LAB}?state=master-neutral&theme=light&overlay=combined&dpr=1.5`, { waitUntil: "domcontentloaded" });
    await waitM3(page);
    await page.evaluate(() => {
      window.__PS04M3_LAB__.setIdleChannel("combined");
      window.__PS04M3_LAB__.setPauseAll(false);
    });
    const m3Idle = await sampleStats(page, "m3", 8000);

    await page.evaluate(async () => {
      await window.__PS04M3_LAB__.requestState("single-event");
    });
    const m3Transition = await sampleStats(page, "m3", 4000);

    await page.evaluate(async () => {
      const ids = ["single-design", "single-event", "single-content", "master-neutral"];
      for (let index = 0; index < 12; index += 1) {
        await window.__PS04M3_LAB__.requestState(ids[index % ids.length]);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    });
    const m3Retarget = await sampleStats(page, "m3", 3000);

    const report = {
      capturedAt: new Date().toISOString(),
      method: "R3F reported frame-delta after 1.2s warm-up. Not GPU shader timing. Screenshots were not taken during this run.",
      setup: { dpr: 1.5, viewport: [1440, 920], N: 16384, drawingBufferExpected: "lab pane, not forced 768" },
      summary: {
        m2Idle: m2Idle.stats,
        m3Idle: m3Idle.stats,
        m3Transition: m3Transition.stats,
        m3Retarget: m3Retarget.stats,
      },
      environment: m3Idle.environment,
      m3Session: {
        idle: m3Idle.snapshot && {
          family: m3Idle.snapshot.family,
          scale: m3Idle.snapshot.displayed?.scale,
          status: m3Idle.snapshot.status,
        },
        transition: m3Transition.snapshot && {
          requested: m3Transition.snapshot.requestedStateId,
          status: m3Transition.snapshot.status,
          progress: m3Transition.snapshot.geometryProgress,
        },
        retarget: m3Retarget.snapshot && {
          requested: m3Retarget.snapshot.requestedStateId,
          requestRevision: m3Retarget.snapshot.requestRevision,
          status: m3Retarget.snapshot.status,
        },
      },
    };
    writeFileSync(path.join(OUT, "performance-qa.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify({
      m2p95: m2Idle.stats?.p95Ms,
      m3p95: m3Idle.stats?.p95Ms,
      m3draws: m3Idle.stats?.lastActorDrawCalls,
      m3tri: m3Idle.stats?.lastActorTriangles,
      m3programs: m3Idle.stats?.programs,
      m3textures: m3Idle.stats?.textures,
    }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
