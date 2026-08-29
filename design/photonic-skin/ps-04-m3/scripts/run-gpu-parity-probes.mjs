import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const BASE = process.env.PS04M3_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m3`;
const M2 = `${BASE}/visual-lab/photonic-skin-ps04-m2`;
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m3/reports");

mkdirSync(OUT, { recursive: true });

const BRAND_WIDE = "brand-wide-drive-content-design-digital-event-games-merch-video";
const GOLDEN_PROGRAM = "master-neutral-to-brand-wide-drive-content-design-digital-event-games-merch-video-qa-desktop-289348ed94b7";

async function waitM3(page) {
  await page.waitForSelector("canvas", { timeout: 45000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M3_LAB__;
    return Boolean(canvas && canvas.width > 8 && lab && lab.runId === "ps04-m3" && lab.ready);
  }, null, { timeout: 45000 });
  await page.waitForTimeout(400);
}

async function waitM2(page) {
  await page.waitForSelector("canvas", { timeout: 25000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M2_LAB__;
    return Boolean(canvas && canvas.width > 8 && lab);
  }, null, { timeout: 25000 });
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  page.setDefaultTimeout(60000);
  try {
    await page.goto(`${LAB}?state=master-neutral&theme=light&overlay=m2&dpr=1.5`, { waitUntil: "domcontentloaded" });
    await waitM3(page);
    await page.evaluate((id) => window.__PS04M3_LAB__.requestState(id), BRAND_WIDE);
    await page.waitForFunction((expected) => {
      const state = window.__PS04M3_GPU_PARITY_STATE__;
      const lab = window.__PS04M3_LAB__;
      return Boolean(
        lab && lab.loading === false && lab.requested === "brand-wide-drive-content-design-digital-event-games-merch-video"
        && state && state.compiled && state.programId === expected,
      );
    }, GOLDEN_PROGRAM, { timeout: 40000 });
    await page.waitForSelector("#ps04m3-gpu-parity-run-motion", { timeout: 10000 });
    const vertex = await page.evaluate(async () => {
      const button = document.getElementById("ps04m3-gpu-parity-run-motion");
      if (!(button instanceof HTMLButtonElement)) {
        return { error: "missing vertex button", gpuState: window.__PS04M3_GPU_PARITY_STATE__ };
      }
      button.click();
      const started = performance.now();
      while (performance.now() - started < 90000) {
        if (button.dataset.status === "done") return JSON.parse(button.dataset.result ?? "{}");
        if (button.dataset.status === "error") return { error: button.dataset.error };
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return { error: "timeout", status: button.dataset.status };
    });
    const field = await page.evaluate(async () => {
      if (!window.__PS04M3_FIELD_GPU_PARITY__) return { error: "missing field probe" };
      return window.__PS04M3_FIELD_GPU_PARITY__();
    });
    await page.goto(`${M2}?state=master-neutral&theme=light&phase=0.25&play=0&dpr=1.5`, { waitUntil: "domcontentloaded" });
    await waitM2(page);
    const m2Still = await page.evaluate(() => ({
      stats: window.__PS04M2_LAB__?.stats,
      environment: window.__PS04M2_LAB__?.environment,
    }));
    const report = {
      capturedAt: new Date().toISOString(),
      gpuParity: { vertex, field },
      m2Still,
    };
    writeFileSync(path.join(OUT, "browser-qa-probes.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (vertex?.error || field?.error || vertex?.valid === false || field?.valid === false) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
