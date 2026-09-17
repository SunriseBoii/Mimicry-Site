import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); }
catch { playwright = require(join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright")); }

const out = process.env.PS04_RAPID_OUT || "design/photonic-skin/ps-04-final-r1/reports/rapid-gpu-repro.json";
const cycles = Number(process.env.PS04_RAPID_CYCLES || "3");
const mobile = process.env.PS04_RAPID_MOBILE === "1";
const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: mobile ? 3 : 2 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForFunction(() => window.__PS04M62_LAB__?.ready === true, undefined, { timeout: 120_000 });
const snaps = [];
async function snap(label) {
  snaps.push(await page.evaluate((label) => {
    const h = window.__PS04M62_LAB__;
    const host = document.querySelector('[data-qa="m4-canvas"]');
    return { label, t: performance.now(), hash: location.hash,
      domScreen: host?.getAttribute("data-screen"), domResolved: host?.getAttribute("data-resolved-state"),
      committedNode: h.committedNode(), contract: h.contract(), transaction: h.transaction(),
      settle: h.settle(), geometry: h.geometrySnapshot(), programBind: h.programBind(),
      resource: h.resource(), latencies: h.latencies() };
  }, label));
}
await page.evaluate(() => { window.__PS04M62_LAB__.startGeometryLog(); window.__PS04M62_LAB__.startM5Trace(); });
for (let i = 0; i < cycles; i++) {
  await page.evaluate(() => window.__PS04M62_LAB__.scrollToNode("05.3", "auto", "programmatic"));
  await page.waitForFunction(() => window.__PS04M62_LAB__.committedNode() === "05.3", undefined, { timeout: 10_000 }).catch(() => undefined);
  await snap(`cycle-${i}-event`);
  await page.getByRole("button", { name: "Проект", exact: true }).click();
  await page.waitForFunction(() => window.__PS04M62_LAB__.committedNode() === "03.1", undefined, { timeout: 10_000 }).catch(() => undefined);
  await snap(`cycle-${i}-project`);
  await page.getByRole("button", { name: "Компетенции", exact: true }).click();
  await page.waitForFunction(() => window.__PS04M62_LAB__.committedNode() === "05.1", undefined, { timeout: 10_000 }).catch(() => undefined);
  await snap(`cycle-${i}-content-immediate`);
  await page.waitForTimeout(1_000);
  await snap(`cycle-${i}-content-1s`);
  await page.waitForTimeout(4_000);
  await snap(`cycle-${i}-content-5s`);
}
const final = await page.evaluate(() => ({ geometryLog: window.__PS04M62_LAB__.stopGeometryLog(), m5Trace: window.__PS04M62_LAB__.stopM5Trace(), hardGates: window.__PS04M62_LAB__.hardGates() }));
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ capturedAt: new Date().toISOString(), snaps, ...final, pageErrors: errors }, null, 2) + "\n");
await browser.close();
console.log(`wrote ${out}`);
for (const s of snaps) console.log(`${s.label}: ${s.hash} resolved=${s.domResolved} tx=${s.transaction?.status}/${s.transaction?.targetGeometryId} gpu=${s.geometry?.boundTargetGeometryId} settled=${s.geometry?.settledGeometryId}`);
