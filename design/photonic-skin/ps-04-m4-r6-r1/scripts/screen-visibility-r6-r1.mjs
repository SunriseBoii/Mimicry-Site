import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const REPORTS = path.join(ROOT, "design/photonic-skin/ps-04-m4-r6-r1/reports");
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m4`;
mkdirSync(REPORTS, { recursive: true });

const SCREENS = [
  { node: "01", name: "hero-master", expectActor: true },
  { node: "02", name: "about-brand-wide", expectActor: true },
  { node: "03.1", name: "build-family", expectActor: true },
  { node: "04", name: "cases-master", expectActor: true },
  { node: "05.1", name: "content", expectActor: true },
  { node: "05.2", name: "design", expectActor: true },
  { node: "05.3", name: "event", expectActor: true },
  { node: "05.4", name: "games", expectActor: true },
  { node: "05.5", name: "video", expectActor: true },
  { node: "05.6", name: "digital", expectActor: true },
  { node: "05.7", name: "merch", expectActor: true },
  { node: "06.1", name: "subsequent-master", expectActor: true },
  { node: "08", name: "footer", expectActor: false },
];

const LAUNCH = {
  channel: "msedge",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
};

async function waitLab(page) {
  await page.waitForSelector("canvas", { timeout: 90000 });
  await page.waitForFunction(() => {
    const lab = window.__PS04M4_LAB__;
    return Boolean(lab && lab.runId === "ps04-m4" && lab.ready);
  }, null, { timeout: 90000 });
}

async function waitActor(page, timeout = 30000) {
  await page.waitForFunction(() => {
    const lab = window.__PS04M4_LAB__;
    if (!lab) return false;
    if (lab.activeNode === "08") return lab.composition()?.actorDraw === false;
    return lab.actorFramebufferReady === true && lab.stats.lastActorDrawCalls === 1;
  }, null, { timeout });
}

async function go(page, id) {
  await page.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), id);
  await page.waitForFunction((node) => window.__PS04M4_LAB__.activeNode === node, id, { timeout: 40000 });
  if (id === "08") {
    await page.waitForFunction(() => window.__PS04M4_LAB__.composition()?.actorDraw === false, null, { timeout: 20000 });
    return;
  }
  await page.waitForFunction(() => {
    const lab = window.__PS04M4_LAB__;
    if (!lab || lab.loading) return false;
    const geo = typeof lab.geometrySnapshot === "function" ? lab.geometrySnapshot() : null;
    const tx = typeof lab.transaction === "function" ? lab.transaction() : null;
    if (geo && (geo.status !== "settled" || geo.shaderProgress < 0.999)) return false;
    if (tx && tx.visualLifecycle && tx.visualLifecycle !== "settled") return false;
    return true;
  }, null, { timeout: 90000 });
  await waitActor(page, 30000);
}

async function dump(page) {
  return page.evaluate(() => {
    const lab = window.__PS04M4_LAB__;
    const geo = typeof lab.geometrySnapshot === "function" ? lab.geometrySnapshot() : null;
    const silhouette = typeof lab.framebufferSilhouette === "function" ? lab.framebufferSilhouette() : null;
    const samplers = typeof lab.getMaterialSamplerSnapshot === "function" ? lab.getMaterialSamplerSnapshot() : null;
    const live = typeof lab.liveBankGpuParity === "function" ? lab.liveBankGpuParity() : null;
    const inventory = typeof lab.textureInventory === "function" ? lab.textureInventory() : null;
    return {
      node: lab.activeNode,
      labReady: lab.labReady ?? lab.ready,
      actorResourceReady: lab.actorResourceReady,
      actorFramebufferReady: lab.actorFramebufferReady,
      actorDraw: lab.composition()?.actorDraw ?? false,
      draws: lab.stats.lastActorDrawCalls,
      triangles: lab.stats.lastActorTriangles,
      programs: lab.stats.programs,
      textures: lab.stats.textures,
      settledGeometryId: geo?.settledGeometryId ?? null,
      silhouette,
      samplers,
      liveBank: live,
      inventory,
      failDrawWithoutPixels: Boolean(
        lab.stats.lastActorDrawCalls === 1 && (silhouette?.visiblePixelCount === 0) && lab.composition()?.actorDraw,
      ),
    };
  });
}

async function main() {
  const browser = await chromium.launch(LAUNCH);
  const rows = [];
  try {
    const inventoryContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const inventoryPage = await inventoryContext.newPage();
    inventoryPage.setDefaultTimeout(90000);
    await inventoryPage.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await waitLab(inventoryPage);
    await waitActor(inventoryPage);
    const inventoryDump = await dump(inventoryPage);
    writeFileSync(path.join(REPORTS, "texture-inventory.json"), JSON.stringify(inventoryDump.inventory, null, 2));
    await inventoryContext.close();

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    await page.goto(`${LAB}?theme=light&dpr=1&actorMask=1&ui=0`, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await waitActor(page);

    for (const screen of SCREENS) {
      if (screen.node !== "01") await go(page, screen.node);
      else await waitActor(page);
      const row = { ...screen, ...(await dump(page)) };
      const pixels = row.silhouette?.visiblePixelCount ?? 0;
      const bbox = row.silhouette?.bbox;
      row.gate = screen.expectActor
        ? {
            pass: pixels > 0 && (bbox?.width ?? 0) > 0 && (bbox?.height ?? 0) > 0 && row.failDrawWithoutPixels === false,
            failDrawWithoutPixels: row.failDrawWithoutPixels,
          }
        : {
            pass: pixels === 0 && row.actorDraw === false,
            failDrawWithoutPixels: row.failDrawWithoutPixels,
          };
      rows.push(row);
      if (screen.node === "08") {
        await page.screenshot({
          path: path.join(ROOT, "design/photonic-skin/ps-04-m4-r6-r1/renders/boards/20-footer-none.png"),
          fullPage: false,
        });
      }
    }
    await context.close();

    const dark = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const darkPage = await dark.newPage();
    await darkPage.goto(`${LAB}?theme=dark&dpr=1&actorMask=1&ui=0`, { waitUntil: "domcontentloaded" });
    await waitLab(darkPage);
    await waitActor(darkPage);
    const darkHero = { name: "hero-master-dark", ...(await dump(darkPage)) };
    await go(darkPage, "05.1");
    const darkContent = { name: "content-dark", ...(await dump(darkPage)) };
    await dark.close();

    const report = {
      capturedAt: new Date().toISOString(),
      method: "Fresh lab load, then scroll each screen. actorMask=1 readback silhouette. Footer must have zero pixels and actorDraw=false. draw=1 && pixels=0 is FAIL.",
      rows,
      dark: [darkHero, darkContent],
      pass: rows.every((row) => row.gate?.pass === true)
        && (darkHero.silhouette?.visiblePixelCount ?? 0) > 0
        && (darkContent.silhouette?.visiblePixelCount ?? 0) > 0,
    };
    writeFileSync(path.join(REPORTS, "screen-visibility.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify({
      pass: report.pass,
      screens: rows.map((row) => ({
        name: row.name,
        node: row.node,
        pixels: row.silhouette?.visiblePixelCount ?? null,
        bbox: row.silhouette ? [row.silhouette.bboxWidth, row.silhouette.bboxHeight] : null,
        actorDraw: row.actorDraw,
        draws: row.draws,
        pass: row.gate?.pass,
      })),
      darkHeroPixels: darkHero.silhouette?.visiblePixelCount ?? null,
      darkContentPixels: darkContent.silhouette?.visiblePixelCount ?? null,
    }, null, 2)}\n`);
  } catch (error) {
    writeFileSync(path.join(REPORTS, "screen-visibility.json"), JSON.stringify({ ok: false, error: String(error), stack: error.stack, rows }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
