import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const BASE = process.env.PS04M2_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m2`;
const M1 = `${BASE}/visual-lab/photonic-skin-ps04-m1`;

async function waitReady(page) {
  await page.waitForSelector("canvas", { timeout: 25000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M2_LAB__;
    return Boolean(canvas && canvas.width > 8 && lab && lab.coverage);
  }, { timeout: 25000 });
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
    await page.goto(`${LAB}?state=master-neutral&theme=light&phase=0.25&play=0&dpr=1.5`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    const vertex = await page.evaluate(async () => {
      const button = document.getElementById("ps04m2-gpu-parity-run-color");
      if (!(button instanceof HTMLButtonElement)) return { error: "missing vertex button" };
      button.click();
      const started = performance.now();
      while (performance.now() - started < 50000) {
        if (button.dataset.status === "done") return JSON.parse(button.dataset.result ?? "{}");
        if (button.dataset.status === "error") return { error: button.dataset.error };
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return { error: "timeout", status: button.dataset.status };
    });
    const field = await page.evaluate(async () => {
      if (!window.__PS04M2_FIELD_GPU_PARITY__) return { error: "missing field probe" };
      return window.__PS04M2_FIELD_GPU_PARITY__();
    });
    await page.goto(`${LAB}?state=master-neutral&theme=light&phase=0.25&play=1&dpr=1.5`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await page.waitForTimeout(3500);
    const m2Playing = await page.evaluate(() => ({
      stats: window.__PS04M2_LAB__?.stats,
      environment: window.__PS04M2_LAB__?.environment,
    }));
    await page.goto(`${LAB}?state=master-neutral&theme=light&phase=0.25&play=0&dpr=1.5&renderer=m1`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await page.waitForTimeout(2500);
    const m1Still = await page.evaluate(() => window.__PS04M2_LAB__?.stats);
    await page.goto(`${M1}?state=master-neutral&theme=light`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);
    const m1Route = await page.evaluate(() => ({
      title: document.title,
      canvas: Boolean(document.querySelector("canvas")),
      text: document.body.innerText.slice(0, 280),
    }));
    const report = {
      capturedAt: new Date().toISOString(),
      gpuParity: { vertex, field },
      performance: { m2Playing, m1Still, m1Route },
    };
    mkdirSync(path.join(ROOT, "design/photonic-skin/ps-04-m2/reports"), { recursive: true });
    writeFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m2/reports/browser-qa-probes.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
