import { writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.PS04M52R2_BASE ?? process.env.PS04M52_BASE ?? "http://localhost:3000";
const SANDBOX = `${BASE}/visual-lab/photonic-skin-ps04-m5/event-sandbox`;
const PREVIEW = `${SANDBOX}/preview`;
const M51 = `${BASE}/visual-lab/photonic-skin-ps04-m5`;
const HOME = `${BASE}/`;
const OUT = path.join(process.cwd(), "design/photonic-skin/ps-04-m5-2-r2/reports/browser-smoke.json");
const AR2 = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b";
const A = "76c46452781c4334b4d91cca9ed6533bb9ccd7224c57bdf7abf7e1093d1c938d";
const AR1 = "89f50d4c83b15de21b753f98d6ab368e974c20a91ed135668bbaf05445b898cc";

async function waitSandbox(page) {
  await page.waitForSelector("canvas", { timeout: 120000 });
  await page.waitForFunction(() => {
    const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
    return Boolean(handle && handle.runId === "ps04-m5-2" && handle.stage === "PS-04.M5.2.R2" && handle.ready);
  }, null, { timeout: 120000 });
}

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const report = { capturedAt: new Date().toISOString(), base: BASE };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);

    await page.goto(SANDBOX, { waitUntil: "domcontentloaded" });
    await waitSandbox(page);
    report.defaultRoute = await page.evaluate(() => {
      const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
      const hud = document.querySelector("[data-qa='m52-hud']")?.textContent ?? "";
      return {
        runId: handle.runId,
        stage: handle.stage,
        requested: handle.requestedVariant,
        displayed: handle.displayedVariant,
        hash: handle.overlayHash?.(),
        view: handle.view,
        labels: handle.labels,
        playMode: handle.playMode,
        theme: handle.theme,
        query: window.location.search,
        hudHasAR2: hud.includes("EVENT_A_R2"),
        hudDecision: hud.includes("viewer-right refined"),
        notCanonicalClaim: !/canonical selection|финально утвержд/.test(hud.toLowerCase()),
      };
    });

    let reloads = 0;
    page.on("load", () => { reloads += 1; });
    const afterOpen = reloads;
    await page.click('[data-qa="m52-variant-a"]');
    await page.waitForFunction((hash) => {
      const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
      return handle?.displayedVariant === "a" && handle.loadStatus === "ready" && handle.overlayHash?.() === hash;
    }, A, { timeout: 120000 });
    report.liveSwitchToA = {
      documentReloads: reloads - afterOpen,
      displayed: await page.evaluate(() => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).displayedVariant),
      hash: await page.evaluate(() => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).overlayHash?.()),
    };

    await page.locator("[data-qa='m52-archived-r1']").evaluate((el) => {
      if (el instanceof HTMLDetailsElement) el.open = true;
    });
    await page.click('[data-qa="m52-variant-a-r1"]');
    await page.waitForFunction((hash) => {
      const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
      return handle?.displayedVariant === "a-r1" && handle.loadStatus === "ready" && handle.overlayHash?.() === hash;
    }, AR1, { timeout: 120000 });
    report.liveSwitchToAR1 = {
      documentReloads: reloads - afterOpen,
      hash: await page.evaluate(() => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).overlayHash?.()),
    };

    await page.click('[data-qa="m52-variant-a-r2"]');
    await page.waitForFunction((hash) => {
      const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
      return handle?.displayedVariant === "a-r2" && handle.loadStatus === "ready" && handle.overlayHash?.() === hash;
    }, AR2, { timeout: 120000 });

    report.event = await page.evaluate(() => {
      const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
      const silhouette = handle.framebufferSilhouette?.();
      return {
        runId: handle.runId,
        displayed: handle.displayedVariant,
        overlayHash: handle.overlayHash?.(),
        node: handle.activeNode,
        draws: handle.stats.lastActorDrawCalls,
        triangles: handle.stats.lastActorTriangles,
        programs: handle.stats.programs,
        textures: handle.stats.textures,
        canvases: handle.canvasCount(),
        actorDraw: handle.composition()?.actorDraw,
        visiblePixelCount: silhouette?.visiblePixelCount ?? null,
        viewerRightActive: handle.viewerRightActive?.(),
        figureRightActive: handle.figureRightActive?.(),
      };
    });

    await page.evaluate(() => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).loseContext());
    await page.waitForTimeout(1200);
    await waitSandbox(page);
    report.contextRestore = await page.evaluate(() => {
      const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
      const silhouette = handle.framebufferSilhouette?.();
      const button = document.getElementById("ps04m5-context-restore-run-motion");
      return {
        buttonStatus: button instanceof HTMLButtonElement ? button.dataset.status ?? null : "missing",
        overlayHash: handle.overlayHash?.(),
        displayed: handle.displayedVariant,
        draws: handle.stats.lastActorDrawCalls,
        triangles: handle.stats.lastActorTriangles,
        programs: handle.stats.programs,
        visiblePixelCount: silhouette?.visiblePixelCount ?? null,
      };
    });

    await page.goto(`${M51}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__PS04M5_LAB__?.runId === "ps04-m5" && window.__PS04M5_LAB__?.ready, null, { timeout: 60000 });
    report.m51 = await page.evaluate(() => ({
      runId: window.__PS04M5_LAB__?.runId,
      sandboxHandle: Boolean(window.__PS04M52_LAB__),
    }));

    await page.goto(HOME, { waitUntil: "domcontentloaded" });
    report.production = await page.evaluate(() => ({
      title: document.title,
      hasSandbox: Boolean(window.__PS04M52_LAB__),
      hasM51: Boolean(window.__PS04M5_LAB__),
      siteShell: Boolean(document.querySelector("main")) && !document.querySelector("[data-qa='m4-canvas']"),
    }));

    await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
    await waitSandbox(page);
    report.preview = await page.evaluate(() => ({
      displayed: (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).displayedVariant,
      hash: (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).overlayHash?.(),
    }));
    await context.close();
  } finally {
    await browser.close();
  }
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    defaultDisplayed: report.defaultRoute?.displayed,
    liveReloads: report.liveSwitchToA?.documentReloads,
    pixels: report.event?.visiblePixelCount,
    restorePixels: report.contextRestore?.visiblePixelCount,
    m51: report.m51?.runId,
  }, null, 2)}\n`);
}

main();
