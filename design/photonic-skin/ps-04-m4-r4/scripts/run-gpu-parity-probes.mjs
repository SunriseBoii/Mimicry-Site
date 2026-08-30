import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m4`;
const M3 = `${BASE}/visual-lab/photonic-skin-ps04-m3`;
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m4-r4/reports");
mkdirSync(OUT, { recursive: true });

const GOLDEN_PROGRAM = "master-neutral-to-brand-wide-drive-content-design-digital-event-games-merch-video-qa-desktop-289348ed94b7";
const BRAND_WIDE = "brand-wide-drive-content-design-digital-event-games-merch-video";

async function waitM4(page) {
  await page.waitForFunction(() => window.__PS04M4_LAB__?.ready, null, { timeout: 60000 });
}

async function waitM3(page) {
  await page.waitForFunction(() => window.__PS04M3_LAB__?.ready, null, { timeout: 45000 });
}

async function clickParity(page, id) {
  return page.evaluate(async (buttonId) => {
    const button = document.getElementById(buttonId);
    if (!(button instanceof HTMLButtonElement)) return { error: `missing ${buttonId}` };
    button.click();
    const started = performance.now();
    while (performance.now() - started < 90000) {
      if (button.dataset.status === "done") return JSON.parse(button.dataset.result ?? "{}");
      if (button.dataset.status === "error") return { error: button.dataset.error };
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return { error: "timeout", status: button.dataset.status };
  }, id);
}

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(90000);
  try {
    await page.goto(`${M3}?state=master-neutral&theme=light&overlay=m2&dpr=1.5`, { waitUntil: "domcontentloaded" });
    await waitM3(page);
    await page.evaluate((id) => window.__PS04M3_LAB__.requestState(id), BRAND_WIDE);
    await page.waitForFunction((expected) => {
      const state = window.__PS04M3_GPU_PARITY_STATE__;
      const lab = window.__PS04M3_LAB__;
      return Boolean(lab && lab.loading === false && state && state.compiled && state.programId === expected);
    }, GOLDEN_PROGRAM, { timeout: 40000 });
    const m3Vertex = await clickParity(page, "ps04m3-gpu-parity-run-motion");
    const m3Field = await page.evaluate(() => window.__PS04M3_FIELD_GPU_PARITY__?.());

    await page.goto(`${LAB}?theme=light&dpr=1.5&identity=1`, { waitUntil: "domcontentloaded" });
    await waitM4(page);
    await page.evaluate((id) => window.__PS04M4_LAB__.requestState(id), BRAND_WIDE);
    await page.waitForTimeout(2500);
    const m4VertexIdentity = await clickParity(page, "ps04m4-gpu-parity-run-motion");
    const m4FieldIdentity = await page.evaluate(() => window.__PS04M4_FIELD_GPU_PARITY__?.());

    await page.goto(`${LAB}?theme=light&dpr=1.5`, { waitUntil: "domcontentloaded" });
    await waitM4(page);
    await page.evaluate((id) => window.__PS04M4_LAB__.requestState(id), BRAND_WIDE);
    await page.waitForTimeout(2500);
    const m4Vertex = await clickParity(page, "ps04m4-gpu-parity-run-motion");
    const m4Field = await page.evaluate(() => window.__PS04M4_FIELD_GPU_PARITY__?.());

    const report = {
      capturedAt: new Date().toISOString(),
      tolerancesUnchanged: { vertex: "552/46", field: "32896+4369" },
      note: "Identity/parity mode bypasses M4 site fit and R3 continuity/ownership overlays. Ordinary GPU vertex probe still samples frozen vEvalChannels; visual mass overlay does not write those varyings.",
      m3: { vertex: m3Vertex, field: m3Field },
      m4Identity: { vertex: m4VertexIdentity, field: m4FieldIdentity },
      m4: { vertex: m4Vertex, field: m4Field },
    };
    writeFileSync(path.join(OUT, "gpu-parity.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify({
      m3Valid: m3Vertex?.valid,
      m4IdentityValid: m4VertexIdentity?.valid,
      m4Valid: m4Vertex?.valid,
      m3FieldValid: m3Field?.valid,
      m4IdentityFieldValid: m4FieldIdentity?.valid,
      m4FieldValid: m4Field?.valid,
    }, null, 2)}\n`);
  } catch (error) {
    writeFileSync(path.join(OUT, "gpu-parity.json"), JSON.stringify({ ok: false, error: String(error) }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
