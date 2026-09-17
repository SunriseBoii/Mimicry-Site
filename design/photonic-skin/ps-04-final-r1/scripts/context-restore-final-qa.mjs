import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); }
catch { playwright = require(join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright")); }

const baseUrl = process.env.PS04_QA_URL || "http://localhost:3000";
const outputPath = "design/photonic-skin/ps-04-final-r1/reports/context-restore-final-qa.json";
const browser = await playwright.chromium.launch({ headless: true });
const result = { capturedAt: new Date().toISOString(), browserMode: "headless Chromium", baseUrl, viewports: {} };

for (const [name, viewport, deviceScaleFactor] of [
  ["desktop", { width: 1440, height: 900 }, 2],
  ["mobile", { width: 390, height: 844 }, 3],
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(() => window.__PS04M62_LAB__?.ready === true && window.__PS04M62_LAB__?.actorFramebufferReady === true, undefined, { timeout: 120_000 });
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const host = document.querySelector('[data-qa="m4-canvas"]');
    if (!canvas || !host) throw new Error("PS04 canvas/host absent");
    window.__PS04_CONTEXT_QA__ = { events: [], posters: [] };
    const sample = (event) => ({
      event, t: performance.now(),
      framebufferReady: window.__PS04M62_LAB__.actorFramebufferReady,
      resourceReady: window.__PS04M62_LAB__.actorResourceReady,
      posterCount: document.querySelectorAll('[data-qa="ps04-neutral-poster"]').length,
      scenePosterVisible: (() => {
        const poster = document.querySelector('[data-qa="ps04-scene-poster"]');
        return poster ? getComputedStyle(poster).visibility === "visible" : null;
      })(),
      contextLost: canvas.getContext("webgl2")?.isContextLost() ?? null,
    });
    canvas.addEventListener("webglcontextlost", () => {
      window.__PS04_CONTEXT_QA__.events.push(sample("lost"));
      queueMicrotask(() => window.__PS04_CONTEXT_QA__.events.push(sample("lost-microtask")));
      requestAnimationFrame(() => window.__PS04_CONTEXT_QA__.events.push(sample("lost-next-frame")));
    });
    canvas.addEventListener("webglcontextrestored", () => {
      window.__PS04_CONTEXT_QA__.events.push(sample("restored"));
      requestAnimationFrame(() => window.__PS04_CONTEXT_QA__.events.push(sample("restored-next-frame")));
    });
    const observer = new MutationObserver(() => {
      window.__PS04_CONTEXT_QA__.posters.push(sample("poster-mutation"));
    });
    observer.observe(host, { childList: true, subtree: true });
    window.__PS04_CONTEXT_QA__.observer = observer;
  });
  await page.evaluate(() => window.__PS04M62_LAB__.loseContext());
  let recovered = true;
  try {
    await page.waitForFunction(() => window.__PS04M62_LAB__?.contextState === "restored" && window.__PS04M62_LAB__?.actorFramebufferReady === true, undefined, { timeout: 20_000 });
  } catch { recovered = false; }
  await page.waitForTimeout(350);
  const data = await page.evaluate(() => {
    const qa = window.__PS04_CONTEXT_QA__;
    qa.observer.disconnect();
    return { events: qa.events, posters: qa.posters, final: {
      contextState: window.__PS04M62_LAB__.contextState,
      framebufferReady: window.__PS04M62_LAB__.actorFramebufferReady,
      resourceReady: window.__PS04M62_LAB__.actorResourceReady,
      posterCount: document.querySelectorAll('[data-qa="ps04-neutral-poster"]').length,
      scenePosterVisible: (() => {
        const poster = document.querySelector('[data-qa="ps04-scene-poster"]');
        return poster ? getComputedStyle(poster).visibility === "visible" : null;
      })(),
    } };
  });
  result.viewports[name] = { recovered, errors, ...data };
  await page.close();
}

await browser.close();
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ desktop: { recovered: result.viewports.desktop.recovered, events: result.viewports.desktop.events }, mobile: { recovered: result.viewports.mobile.recovered, events: result.viewports.mobile.events } }, null, 2));
console.log(`wrote ${outputPath}`);
