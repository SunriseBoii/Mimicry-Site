import { createRequire } from "node:module";
import { join } from "node:path";
import { homedir } from "node:os";
import { writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); }
catch { playwright = require(join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright")); }
const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForFunction(() => window.__PS04M62_LAB__?.ready === true, undefined, { timeout: 120_000 });
await page.waitForFunction(() => window.__PS04M62_LAB__?.actorFramebufferReady === true, undefined, { timeout: 120_000 });
const initial = await page.evaluate(() => ({ state: window.__PS04M62_LAB__.contextState, frame: window.__PS04M62_LAB__.actorFramebufferReady, canvas: document.querySelector("canvas")?.getContext("webgl2")?.isContextLost() }));
await page.evaluate(() => window.__PS04M62_LAB__.loseContext());
const rows = [];
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(1_000);
  const row = await page.evaluate(() => ({ t: performance.now(), state: window.__PS04M62_LAB__.contextState, frame: window.__PS04M62_LAB__.actorFramebufferReady, contextLost: document.querySelector("canvas")?.getContext("webgl2")?.isContextLost(), poster: document.querySelectorAll('[data-qa="ps04-neutral-poster"]').length }));
  rows.push(row);
  if (row.state === "restored" && !row.contextLost) break;
}
const result = { capturedAt: new Date().toISOString(), initial, rows };
await writeFile("design/photonic-skin/ps-04-final-r1/reports/context-mobile-qa.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
await browser.close();
