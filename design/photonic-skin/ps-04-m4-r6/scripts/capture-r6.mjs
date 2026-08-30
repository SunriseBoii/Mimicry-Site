import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m4-r6/renders/browser");
const VIDEO = path.join(OUT, "video");
const BOARDS = path.join(ROOT, "design/photonic-skin/ps-04-m4-r6/renders/boards");
const REPORTS = path.join(ROOT, "design/photonic-skin/ps-04-m4-r6/reports");
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m4`;
const HOME = `${BASE}/`;

mkdirSync(OUT, { recursive: true });
mkdirSync(VIDEO, { recursive: true });
mkdirSync(BOARDS, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

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

async function waitVisualSettled(page, timeout = 40000) {
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

async function recordClip(browser, name, setup, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO, size: viewport },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const watched = { name };
  try {
    await setup(page);
    await page.waitForTimeout(400);
  } finally {
    const video = page.video();
    await page.close();
    await context.close();
    if (video) {
      const dest = path.join(VIDEO, `${name}.webm`);
      await video.saveAs(dest);
      watched.file = dest.replaceAll("\\", "/");
    }
  }
  return watched;
}

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const inventory = { shots: [], videos: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(60000);

    await page.goto(`${LAB}?theme=light&dpr=1&r6Staging=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await go(page, "05.1");
    await page.waitForTimeout(8000);
    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.2", "auto"));
    await page.waitForTimeout(200);
    inventory.shots.push(await shot(page, "01-r5-warm-stall-repro"));
    await waitVisualSettled(page, 60000);
    inventory.shots.push(await shot(page, "01b-r5-stall-settled"));

    await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    inventory.shots.push(await shot(page, "02-idle-master"));
    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.1", "auto"));
    await waitNode(page, "05.1");
    inventory.shots.push(await shot(page, "03-navigation-while-preparing"));
    await waitVisualSettled(page);
    inventory.shots.push(await shot(page, "04-atomic-gpu-ready-morph-settled"));

    await go(page, "04");
    inventory.shots.push(await shot(page, "05-master-cases"));
    await go(page, "05.1");
    inventory.shots.push(await shot(page, "06-content"));
    await go(page, "05.2");
    inventory.shots.push(await shot(page, "07-design"));
    for (const [node, name] of [["05.3", "event"], ["05.4", "games"], ["05.5", "video"], ["05.6", "digital"], ["05.7", "merch"]]) {
      await go(page, node);
      inventory.shots.push(await shot(page, `08-${name}`));
    }
    await go(page, "08");
    inventory.shots.push(await shot(page, "09-footer"));
    await go(page, "07");
    inventory.shots.push(await shot(page, "10-footer-return"));

    await page.goto(`${LAB}?theme=light&dpr=1&reduced=1`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await go(page, "05.2");
    inventory.shots.push(await shot(page, "11-reduced-motion"));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await go(page, "05.1");
    inventory.shots.push(await shot(page, "12-mobile-390"));
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await go(page, "05.1");
    inventory.shots.push(await shot(page, "13-dpr-1"));
    await page.evaluate(() => window.__PS04M4_LAB__.setDpr(1.5));
    await page.waitForTimeout(400);
    inventory.shots.push(await shot(page, "14-dpr-1.5"));
    await page.evaluate(() => window.__PS04M4_LAB__.setDpr(2));
    await page.waitForTimeout(400);
    inventory.shots.push(await shot(page, "15-dpr-2"));
    await page.evaluate(() => window.__PS04M4_LAB__.setDpr(1));

    await page.evaluate(() => window.__PS04M4_LAB__.loseContext());
    await page.waitForTimeout(900);
    await waitVisualSettled(page, 60000);
    inventory.shots.push(await shot(page, "16-context-restore"));

    await go(page, "01");
    await go(page, "08");
    await go(page, "01");
    inventory.shots.push(await shot(page, "17-resource-cycle-1"));
    await go(page, "08");
    await go(page, "01");
    inventory.shots.push(await shot(page, "18-resource-cycle-2"));

    await page.goto(HOME, { waitUntil: "domcontentloaded" });
    inventory.shots.push(await shot(page, "20-production-home"));
    await page.close();

    inventory.videos.push(await recordClip(browser, "navigation-during-cold-prepare", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await go(clip, "04");
      await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.1", "auto"));
      await waitNode(clip, "05.1");
      await clip.waitForTimeout(1800);
      await waitVisualSettled(clip);
    }));
    inventory.videos.push(await recordClip(browser, "continuous-idle-before-morph", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await go(clip, "05.1");
      await clip.waitForTimeout(600);
      await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.2", "auto"));
      await waitNode(clip, "05.2");
      await clip.waitForTimeout(2200);
      await waitVisualSettled(clip);
    }));
    inventory.videos.push(await recordClip(browser, "warm-content-design", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await go(clip, "05.1");
      await clip.waitForTimeout(400);
      await go(clip, "05.2");
    }));
    inventory.videos.push(await recordClip(browser, "seven-singles-down-up", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      for (const node of ["05.1", "05.2", "05.3", "05.4", "05.5", "05.6", "05.7"]) await go(clip, node);
      for (const node of ["05.6", "05.5", "05.4", "05.3", "05.2", "05.1"]) await go(clip, node);
    }));
    inventory.videos.push(await recordClip(browser, "rapid-latest-target", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      const nodes = ["05.1", "05.2", "05.3", "05.4", "05.5"];
      for (let index = 0; index < 12; index += 1) {
        await clip.evaluate((id) => window.__PS04M4_LAB__.scrollToNode(id, "auto"), nodes[index % nodes.length]);
      }
      await waitVisualSettled(clip, 60000);
    }));
    inventory.videos.push(await recordClip(browser, "right-left", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await go(clip, "04");
      await clip.waitForTimeout(300);
      await go(clip, "05.1");
    }));
    inventory.videos.push(await recordClip(browser, "resource-second-cycle", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await go(clip, "08");
      await go(clip, "01");
      await go(clip, "08");
      await go(clip, "01");
    }));
    inventory.videos.push(await recordClip(browser, "reduced-motion", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1&reduced=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await go(clip, "05.1");
      await go(clip, "05.2");
      await go(clip, "05.3");
    }));
    inventory.videos.push(await recordClip(browser, "footer-exit-return", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await go(clip, "07");
      await go(clip, "08");
      await clip.waitForTimeout(400);
      await go(clip, "07");
    }));

    writeFileSync(path.join(REPORTS, "capture-inventory.json"), JSON.stringify({ capturedAt: new Date().toISOString(), ...inventory }, null, 2));
    process.stdout.write(`${JSON.stringify({ shots: inventory.shots.length, videos: inventory.videos.length }, null, 2)}\n`);
  } catch (error) {
    writeFileSync(path.join(REPORTS, "capture-inventory.json"), JSON.stringify({ ok: false, error: String(error), stack: error.stack }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
