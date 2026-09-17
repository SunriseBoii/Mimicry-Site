import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); }
catch { playwright = require(join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright")); }

const out = "design/photonic-skin/ps-04-final-r1/reports/stuck-gpu-repro.json";
const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForFunction(() => window.__PS04M62_LAB__?.ready === true, undefined, { timeout: 120_000 });
await page.evaluate(() => window.__PS04M62_LAB__.scrollToNode("05.3", "auto", "programmatic"));
await page.waitForFunction(() => window.__PS04M62_LAB__?.committedNode() === "05.3" && window.__PS04M62_LAB__?.transaction().status === "settled", undefined, { timeout: 12_000 }).catch(() => undefined);
const event = await page.evaluate(() => ({ contract: window.__PS04M62_LAB__.contract(), transaction: window.__PS04M62_LAB__.transaction() }));
await page.getByRole("button", { name: "Проект", exact: true }).click();
await page.waitForFunction(() => window.__PS04M62_LAB__?.committedNode() === "03.1" && window.__PS04M62_LAB__?.transaction().status === "settled", undefined, { timeout: 12_000 }).catch(() => undefined);
const project = await page.evaluate(() => ({ contract: window.__PS04M62_LAB__.contract(), transaction: window.__PS04M62_LAB__.transaction() }));
await page.evaluate(() => {
  window.__PS04M62_LAB__.startGeometryLog();
  window.__PS04M62_LAB__.startM5Trace();
  window.__stuckQaRows = [];
  window.__stuckQaTimer = setInterval(() => {
    const h = window.__PS04M62_LAB__;
    const host = document.querySelector('[data-qa="m4-canvas"]');
    window.__stuckQaRows.push({
      t: performance.now(), hash: location.hash,
      domScreen: host?.getAttribute("data-screen"),
      domResolved: host?.getAttribute("data-resolved-state"),
      committedNode: h.committedNode(),
      contract: h.contract(),
      transaction: h.transaction(),
      settle: h.settle(),
      geometry: h.geometrySnapshot(),
      programBind: h.programBind(),
      resource: h.resource(),
      latencies: h.latencies(),
    });
  }, 100);
});
await page.getByRole("button", { name: "Компетенции", exact: true }).click();
await page.waitForTimeout(2_000);
await page.screenshot({ path: "design/photonic-skin/ps-04-final-r1/reports/stuck-gpu-2s.png" });
await page.waitForTimeout(4_500);
await page.screenshot({ path: "design/photonic-skin/ps-04-final-r1/reports/stuck-gpu-6s.png" });
const final = await page.evaluate(() => {
  clearInterval(window.__stuckQaTimer);
  const h = window.__PS04M62_LAB__;
  return {
    rows: window.__stuckQaRows,
    geometryLog: h.stopGeometryLog(),
    m5Trace: h.stopM5Trace(),
    hardGates: h.hardGates(),
    finalContract: h.contract(),
    finalGeometry: h.geometrySnapshot(),
    finalTransaction: h.transaction(),
    finalResource: h.resource(),
    finalLatencies: h.latencies(),
  };
});
await browser.close();
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ capturedAt: new Date().toISOString(), event, project, ...final, pageErrors: errors }, null, 2) + "\n");
console.log(`wrote ${out}`);
console.log(`final: screen=${final.rows.at(-1)?.domScreen} resolved=${final.rows.at(-1)?.domResolved} bound=${final.finalGeometry.boundTargetGeometryId} tx=${final.finalTransaction.status}`);
