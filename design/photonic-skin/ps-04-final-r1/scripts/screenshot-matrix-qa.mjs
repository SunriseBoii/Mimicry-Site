import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require(process.env.PS04_PLAYWRIGHT_MODULE || "playwright");
} catch {
  playwright = require(join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
}
const { chromium } = playwright;
const baseUrl = process.env.PS04_QA_URL || "http://localhost:3000";
const outDir = "design/photonic-skin/ps-04-final-r1/renders/screenshot-matrix";
const reportPath = "design/photonic-skin/ps-04-final-r1/reports/screenshot-matrix-qa.json";
const onlyCase = process.argv[2] || process.env.PS04_QA_CASE;
const onlyNode = process.argv[3] || process.env.PS04_QA_NODE;
await mkdir(outDir, { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });

const browser = await chromium.launch({ headless: true });
const cases = [
  { id: "desktop-1440", width: 1440, height: 900, dpr: 1 },
  { id: "mobile-390", width: 390, height: 844, dpr: 2 },
  { id: "desktop-1920", width: 1920, height: 1080, dpr: 1, smoke: true },
  { id: "desktop-1280", width: 1280, height: 720, dpr: 1, smoke: true },
];
const nodes = [
  { id: "01", name: "hero" },
  { id: "05.3", name: "event" },
  { id: "05.5", name: "video" },
  { id: "03.2", name: "builder" },
];
const results = [];

for (const testCase of cases) {
  if (onlyCase && testCase.id !== onlyCase) continue;
  const context = await browser.newContext({
    viewport: { width: testCase.width, height: testCase.height },
    deviceScaleFactor: testCase.dpr,
    isMobile: testCase.id.startsWith("mobile"),
    hasTouch: testCase.id.startsWith("mobile"),
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForFunction(() => window.__PS04M62_LAB__?.ready === true && document.querySelector("canvas"), null, { timeout: 120_000 });
    await page.waitForFunction(() => window.__PS04M5_SCENE_READY__ === true, null, { timeout: 120_000 }).catch(() => undefined);
    await page.evaluate(() => {
      window.__PS04M62_LAB__.selectTask("explain_changes");
      window.__PS04M62_LAB__.setCompetencies(["event", "video"]);
    });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => window.__PS04M62_LAB__.setTheme(value), theme);
      await page.waitForTimeout(250);
      for (const node of nodes) {
        if (onlyNode && node.id !== onlyNode) continue;
        // Smoke viewports check hero and Event only; the full matrix is on canonical desktop/mobile sizes.
        if (testCase.smoke && !["01", "05.3"].includes(node.id)) continue;
        await page.evaluate((id) => window.__PS04M62_LAB__.scrollToNode(id, "auto", "programmatic"), node.id);
        let settled = true;
        try {
          await page.waitForFunction((id) => {
            const handle = window.__PS04M62_LAB__;
            const tx = handle?.transaction?.();
            return handle?.committedNode?.() === id && tx?.status === "settled";
          }, node.id, { timeout: 12_000 });
        } catch { settled = false; }
        await page.waitForTimeout(400);
        const metadata = await page.evaluate(() => {
          const handle = window.__PS04M62_LAB__;
          const canvas = document.querySelector("canvas");
          const host = document.querySelector('[data-qa="m4-canvas"]');
          const canvasRect = canvas?.getBoundingClientRect();
          return {
            activeNode: handle.activeNode,
            committedNode: handle.committedNode(),
            transaction: handle.transaction(),
            resolvedGeometryId: handle.contract()?.resolvedGeometryId,
            boundGeometryId: handle.geometrySnapshot()?.boundTargetGeometryId,
            canvasRect: canvasRect ? { x: canvasRect.x, y: canvasRect.y, width: canvasRect.width, height: canvasRect.height } : null,
            hostScreen: host?.getAttribute("data-screen"),
            hostResolvedState: host?.getAttribute("data-resolved-state"),
            htmlTheme: document.documentElement.getAttribute("data-theme"),
            bodyBg: getComputedStyle(document.body).backgroundColor,
            horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth),
            viewport: [innerWidth, innerHeight],
          };
        });
        const path = join(outDir, `${testCase.id}-${theme}-${node.name}.png`);
        await page.screenshot({ path, fullPage: false, animations: "disabled" });
        results.push({ caseId: testCase.id, theme, node: node.id, screenshot: path, settled, ...metadata, errors: [...errors] });
        console.log(`${testCase.id} ${theme} ${node.name}: ${settled ? "settled" : "timeout"}, ${metadata.resolvedGeometryId} -> ${metadata.boundGeometryId}`);
      }
    }
  } catch (error) {
    results.push({ caseId: testCase.id, fatal: String(error), errors });
    console.error(`${testCase.id}: ${error}`);
  }
  await context.close();
}

await browser.close();
if (onlyCase || onlyNode) {
  const partialPath = "design/photonic-skin/ps-04-final-r1/reports/screenshot-matrix-qa-reshoot.json";
  await writeFile(partialPath, JSON.stringify({ baseUrl, capturedAt: new Date().toISOString(), cases, results }, null, 2) + "\n");
  console.log(`Saved ${partialPath}`);
} else {
  await writeFile(reportPath, JSON.stringify({ baseUrl, capturedAt: new Date().toISOString(), cases, results }, null, 2) + "\n");
  console.log(`Saved ${reportPath}`);
}
