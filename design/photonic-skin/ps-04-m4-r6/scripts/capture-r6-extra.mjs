import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const BOARDS = path.join(ROOT, "design/photonic-skin/ps-04-m4-r6/renders/boards");
const REPORTS = path.join(ROOT, "design/photonic-skin/ps-04-m4-r6/reports");
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m4`;
mkdirSync(BOARDS, { recursive: true });

async function waitReady(page) {
  await page.waitForSelector("canvas", { timeout: 60000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M4_LAB__;
    return Boolean(canvas && lab && lab.runId === "ps04-m4" && lab.ready);
  }, null, { timeout: 60000 });
}

async function waitNode(page, id) {
  await page.waitForFunction((node) => window.__PS04M4_LAB__.activeNode === node, id, { timeout: 20000 });
}

async function waitVisualSettled(page, timeout = 60000) {
  await page.waitForFunction(() => {
    const lab = window.__PS04M4_LAB__;
    if (!lab || lab.loading) return false;
    if (lab.activeNode === "08") return lab.composition()?.actorDraw === false;
    const geo = typeof lab.geometrySnapshot === "function" ? lab.geometrySnapshot() : null;
    const tx = typeof lab.transaction === "function" ? lab.transaction() : null;
    if (geo && (geo.status !== "settled" || geo.shaderProgress < 0.999)) return false;
    if (tx && tx.visualLifecycle && tx.visualLifecycle !== "settled") return false;
    return true;
  }, null, { timeout });
}

async function go(page, id) {
  await page.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), id);
  await waitNode(page, id);
  if (id !== "08") await waitVisualSettled(page, 60000);
}

async function shot(page, name) {
  const file = path.join(BOARDS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file.replaceAll("\\", "/");
}

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const extra = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(60000);
    await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await go(page, "05.1");
    extra.push(await shot(page, "13-dpr-1"));
    await page.evaluate(() => window.__PS04M4_LAB__.setDpr(1.5));
    await page.waitForTimeout(400);
    extra.push(await shot(page, "14-dpr-1.5"));
    await page.evaluate(() => window.__PS04M4_LAB__.setDpr(2));
    await page.waitForTimeout(400);
    extra.push(await shot(page, "15-dpr-2"));
    await page.evaluate(() => window.__PS04M4_LAB__.setDpr(1));
    await page.evaluate(() => window.__PS04M4_LAB__.loseContext());
    await page.waitForTimeout(900);
    await waitVisualSettled(page, 60000);
    extra.push(await shot(page, "16-context-restore"));
    await go(page, "01");
    await go(page, "08");
    await go(page, "01");
    extra.push(await shot(page, "17-resource-cycle-1"));
    await go(page, "08");
    await go(page, "01");
    extra.push(await shot(page, "18-resource-cycle-2"));
    await page.close();

    const inventoryPath = path.join(REPORTS, "capture-inventory.json");
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    const existing = new Set(inventory.shots);
    for (const file of extra) {
      if (!existing.has(file)) inventory.shots.push(file);
    }
    inventory.extraCapturedAt = new Date().toISOString();
    writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));
    process.stdout.write(`${JSON.stringify({ extra: extra.length, shots: inventory.shots.length }, null, 2)}\n`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
