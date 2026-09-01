import { writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.PS04M53_BASE ?? process.env.PS04M52_BASE ?? "http://localhost:3000";
const SANDBOX = `${BASE}/visual-lab/photonic-skin-ps04-m5/video-sandbox`;
const PREVIEW = `${SANDBOX}/preview`;
const EVENT = `${BASE}/visual-lab/photonic-skin-ps04-m5/event-sandbox`;
const M51 = `${BASE}/visual-lab/photonic-skin-ps04-m5`;
const HOME = `${BASE}/`;
const OUT = path.join(process.cwd(), "design/photonic-skin/ps-04-m5-3/reports/browser-smoke.json");
const COMBO_30 = "4e9f22ae50cb581951decedf2d479ef3670f504ffdc93abb909befda2c7d7cdb";
const BASELINE = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b";
const EVENT_A_R2 = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b";

async function waitVideo(page) {
  await page.waitForSelector("canvas", { timeout: 120000 });
  await page.waitForFunction(() => {
    const handle = window.__PS04M53_LAB__ || window.__PS04M5_LAB__;
    return Boolean(handle && handle.runId === "ps04-m5-3" && handle.stage === "PS-04.M5.3" && handle.ready);
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
    await waitVideo(page);
    report.defaultRoute = await page.evaluate(() => {
      const handle = window.__PS04M53_LAB__ || window.__PS04M5_LAB__;
      const hud = document.querySelector("[data-qa='m53-hud']")?.textContent ?? "";
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
        yaw: handle.yaw,
        query: window.location.search,
        hudHasCombo30: hud.includes("VIDEO_COMBO_30"),
        hudDecision: hud.includes("no Video candidate selected"),
        notCanonicalClaim: !/canonical selection|финально утвержд/.test(hud.toLowerCase()),
        draws: handle.stats.lastActorDrawCalls,
        triangles: handle.stats.lastActorTriangles,
        canvases: handle.canvasCount(),
        programs: handle.stats.programs,
      };
    });

    let reloads = 0;
    page.on("load", () => { reloads += 1; });
    const afterOpen = reloads;
    await page.click('[data-qa="m53-variant-baseline"]');
    await page.waitForFunction((hash) => {
      const handle = window.__PS04M53_LAB__ || window.__PS04M5_LAB__;
      return handle?.displayedVariant === "baseline" && handle.loadStatus === "ready" && handle.overlayHash?.() === hash;
    }, BASELINE, { timeout: 120000 });
    report.liveSwitchToBaseline = {
      documentReloads: reloads - afterOpen,
      displayed: await page.evaluate(() => (window.__PS04M53_LAB__ || window.__PS04M5_LAB__).displayedVariant),
      hash: await page.evaluate(() => (window.__PS04M53_LAB__ || window.__PS04M5_LAB__).overlayHash?.()),
    };

    await page.click('[data-qa="m53-variant-combo-30"]');
    await page.waitForFunction((hash) => {
      const handle = window.__PS04M53_LAB__ || window.__PS04M5_LAB__;
      return handle?.displayedVariant === "combo-30" && handle.loadStatus === "ready" && handle.overlayHash?.() === hash;
    }, COMBO_30, { timeout: 120000 });

    report.combo30 = await page.evaluate(() => {
      const handle = window.__PS04M53_LAB__ || window.__PS04M5_LAB__;
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
        cameraActive: handle.cameraActive?.(),
        clapperActive: handle.clapperActive?.(),
        hingedBarActive: handle.hingedBarActive?.(),
      };
    });

    await page.evaluate(() => (window.__PS04M53_LAB__ || window.__PS04M5_LAB__).loseContext());
    await page.waitForTimeout(1200);
    await waitVideo(page);
    report.contextRestore = await page.evaluate(() => {
      const handle = window.__PS04M53_LAB__ || window.__PS04M5_LAB__;
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

    await page.goto(`${EVENT}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
      return handle?.runId === "ps04-m5-2" && handle.ready;
    }, null, { timeout: 90000 });
    report.eventSandbox = await page.evaluate(() => {
      const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
      return { runId: handle.runId, stage: handle.stage, displayed: handle.displayedVariant, hash: handle.overlayHash?.() };
    });

    await page.goto(`${M51}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__PS04M5_LAB__?.runId === "ps04-m5" && window.__PS04M5_LAB__?.ready, null, { timeout: 60000 });
    report.m51 = await page.evaluate(() => ({
      runId: window.__PS04M5_LAB__?.runId,
      sandboxHandle: Boolean(window.__PS04M53_LAB__),
    }));

    await page.goto(HOME, { waitUntil: "domcontentloaded" });
    report.production = await page.evaluate(() => ({
      title: document.title,
      hasSandbox: Boolean(window.__PS04M53_LAB__),
      hasM51: Boolean(window.__PS04M5_LAB__),
      siteShell: Boolean(document.querySelector("main")) && !document.querySelector("[data-qa='m4-canvas']"),
    }));

    await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
    await waitVideo(page);
    report.preview = await page.evaluate(() => ({
      displayed: (window.__PS04M53_LAB__ || window.__PS04M5_LAB__).displayedVariant,
      hash: (window.__PS04M53_LAB__ || window.__PS04M5_LAB__).overlayHash?.(),
    }));
    await context.close();
  } finally {
    await browser.close();
  }
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    defaultDisplayed: report.defaultRoute?.displayed,
    defaultHash: report.defaultRoute?.hash,
    liveReloads: report.liveSwitchToBaseline?.documentReloads,
    pixels: report.combo30?.visiblePixelCount,
    restorePixels: report.contextRestore?.visiblePixelCount,
    eventSandbox: report.eventSandbox?.runId,
    eventHash: report.eventSandbox?.hash,
    m51: report.m51?.runId,
    expectedCombo30: COMBO_30,
    expectedEventAR2: EVENT_A_R2,
  }, null, 2)}\n`);
}

main();
