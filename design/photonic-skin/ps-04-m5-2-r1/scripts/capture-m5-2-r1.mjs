import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r1");
const BOARDS = path.join(STAGE, "renders/boards");
const VIDEO = path.join(STAGE, "renders/browser/video");
const REPORTS = path.join(STAGE, "reports");
const BASE = process.env.PS04M52R1_BASE ?? process.env.PS04M52_BASE ?? "http://localhost:3000";
const SANDBOX = `${BASE}/visual-lab/photonic-skin-ps04-m5/event-sandbox`;
const PREVIEW = `${SANDBOX}/preview`;
const M51 = `${BASE}/visual-lab/photonic-skin-ps04-m5`;
const HOME = `${BASE}/`;
const AR1 = "a-r1";
const SKIP_STATIC = process.env.CAPTURE_SKIP_STATIC === "1";

mkdirSync(BOARDS, { recursive: true });
mkdirSync(VIDEO, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

const LAUNCH = {
  channel: "msedge",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
};

function lab(page, expression, arg) {
  return page.evaluate(expression, arg);
}

async function waitLab(page) {
  await page.waitForSelector("canvas", { timeout: 120000 });
  await page.waitForFunction(() => {
    const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
    return Boolean(handle && handle.runId === "ps04-m5-2" && handle.stage === "PS-04.M5.2.R1" && handle.ready && handle.displayedVariant);
  }, null, { timeout: 120000 });
}

async function selectVariant(page, id) {
  if (id === "b" || id === "c") {
    await page.locator("[data-qa='m52-rejected-variants']").evaluate((el) => {
      if (el instanceof HTMLDetailsElement) el.open = true;
    });
  }
  await page.click(`[data-qa="m52-variant-${id}"]`);
  await waitDisplayed(page, id);
}

async function waitDisplayed(page, variant) {
  await page.waitForFunction((id) => {
    const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
    if (!handle || handle.stage !== "PS-04.M5.2.R1") return false;
    return handle.displayedVariant === id && handle.loadStatus === "ready" && handle.overlayHash() && handle.ready;
  }, variant, { timeout: 120000 });
}

async function waitActor(page, timeout = 40000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
    if (!handle) return false;
    if (handle.activeNode === "08") return handle.actorFramebufferReady === true && handle.composition()?.actorDraw === false;
    return handle.actorFramebufferReady === true && (handle.stats.lastActorDrawCalls === 1 || handle.composition()?.actorDraw === false);
  }, null, { timeout });
}

async function waitNode(page, id) {
  await page.waitForFunction((node) => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).activeNode === node, id, { timeout: 40000 });
}

async function waitVisualSettled(page, timeout = 50000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
    if (!handle || handle.loading || handle.loadStatus !== "ready") return false;
    if (handle.activeNode === "08") return handle.composition()?.actorDraw === false;
    const geo = typeof handle.geometrySnapshot === "function" ? handle.geometrySnapshot() : null;
    const tx = typeof handle.transaction === "function" ? handle.transaction() : null;
    if (geo && (geo.status !== "settled" || geo.shaderProgress < 0.999)) return false;
    if (tx && tx.visualLifecycle && tx.visualLifecycle !== "settled") return false;
    return true;
  }, null, { timeout });
}

async function go(page, id) {
  await lab(page, (node) => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).scrollToNode(node, "auto"), id);
  await waitNode(page, id);
  if (id !== "08") {
    await waitVisualSettled(page, 90000);
    await waitActor(page, 30000);
  } else {
    await page.waitForFunction(() => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).composition()?.actorDraw === false, null, { timeout: 20000 });
  }
}

async function shot(page, name) {
  const file = path.join(BOARDS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file.replaceAll("\\", "/");
}

async function snapshot(page) {
  return lab(page, () => {
    const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
    return {
      runId: handle.runId,
      requested: handle.requestedVariant,
      displayed: handle.displayedVariant,
      hash: handle.overlayHash?.(),
      view: handle.view,
      labels: handle.labels,
      playMode: handle.playMode,
      node: handle.activeNode,
      draws: handle.stats.lastActorDrawCalls,
      triangles: handle.stats.lastActorTriangles,
      programs: handle.stats.programs,
      textures: handle.stats.textures,
      canvases: handle.canvasCount(),
      loadStatus: handle.loadStatus,
    };
  });
}

async function openSandbox(browser, query, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  await page.goto(query ? `${SANDBOX}?${query}` : SANDBOX, { waitUntil: "domcontentloaded" });
  await waitLab(page);
  await waitActor(page);
  await waitVisualSettled(page);
  return { context, page };
}

async function recordClip(browser, name, setup, options = {}) {
  const viewport = options.viewport ?? { width: 1440, height: 900 };
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO, size: viewport },
    reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const watched = { name };
  try {
    await setup(page, watched);
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
  const browser = await chromium.launch(LAUNCH);
  const inventory = { base: BASE, shots: [], videos: [], qa: {}, cycle: [], switching: {} };
  try {
    if (SKIP_STATIC) {
      inventory.qa.skippedStatic = true;
    } else {
    {
      const { context, page } = await openSandbox(browser, "");
      inventory.qa.defaultRoute = await snapshot(page);
      inventory.shots.push(await shot(page, "00-default-a-r1"));
      await context.close();
    }

    const boards = [
      [`variant=a&view=canonical&theme=light&labels=0&mode=settled&dpr=1`, "01-event-a-canonical-final-light"],
      [`variant=${AR1}&view=canonical&theme=light&labels=0&mode=settled&dpr=1`, "02-event-a-r1-canonical-final-light"],
      [`variant=${AR1}&view=canonical&theme=dark&labels=0&mode=settled&dpr=1`, "05-a-r1-canonical-dark"],
      [`variant=${AR1}&view=alternate&theme=light&labels=0&mode=settled&dpr=1`, "06-a-r1-alternate"],
      [`variant=${AR1}&view=opposite&theme=light&labels=0&mode=settled&dpr=1`, "07-a-r1-opposite"],
      [`variant=${AR1}&view=side&theme=light&labels=0&mode=settled&dpr=1`, "08-a-r1-side"],
      [`variant=${AR1}&view=top&theme=light&labels=0&mode=settled&dpr=1`, "09-a-r1-top"],
      [`variant=${AR1}&view=canonical&theme=light&labels=1&mode=settled&dpr=1`, "10-a-r1-component-diagnostic"],
    ];
    for (const [query, name] of boards) {
      const { context, page } = await openSandbox(browser, query);
      inventory.shots.push(await shot(page, name));
      inventory.qa[name] = await snapshot(page);
      await context.close();
    }

    {
      const { context, page } = await openSandbox(browser, `variant=${AR1}&view=canonical&theme=light&labels=0&mode=settled&dpr=1`);
      inventory.shots.push(await shot(page, "16-control-panel-desktop"));
      await go(page, "08");
      inventory.shots.push(await shot(page, "20-footer-no-actor"));
      inventory.qa.footer = await snapshot(page);
      await context.close();
    }

    {
      const { context, page } = await openSandbox(browser, `variant=${AR1}&view=canonical&theme=light&labels=0&mode=settled&dpr=1`, { width: 390, height: 844 });
      inventory.shots.push(await shot(page, "17-control-panel-mobile"));
      inventory.qa.mobile = await snapshot(page);
      await context.close();
    }

    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      let reloads = 0;
      page.on("load", () => { reloads += 1; });
      await page.goto(`${SANDBOX}?variant=${AR1}&view=canonical&theme=light&labels=0&mode=settled&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitDisplayed(page, AR1);
      const afterOpen = reloads;
      for (const id of ["baseline", "a", "b", "c", AR1]) {
        await selectVariant(page, id);
      }
      inventory.switching = {
        documentReloadsDuringClicks: reloads - afterOpen,
        final: await snapshot(page),
      };
      await page.goBack();
      await waitLab(page);
      inventory.switching.back = await snapshot(page);
      await page.goForward();
      await waitLab(page);
      inventory.switching.forward = await snapshot(page);
      inventory.shots.push(await shot(page, "03-live-switch-final"));
      await context.close();
    }

    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.goto(`${M51}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__PS04M5_LAB__?.runId === "ps04-m5" && window.__PS04M5_LAB__?.ready, null, { timeout: 60000 });
      inventory.shots.push(await shot(page, "19-m51-route-regression"));
      inventory.qa.m51 = await page.evaluate(() => ({ runId: window.__PS04M5_LAB__?.runId, node: window.__PS04M5_LAB__?.activeNode }));
      await page.goto(HOME, { waitUntil: "domcontentloaded" });
      inventory.shots.push(await shot(page, "18-production-homepage"));
      inventory.qa.productionHasLab = await page.evaluate(() => Boolean(window.__PS04M5_LAB__ || window.__PS04M52_LAB__ || window.__PS04M4_LAB__));
      await page.goto(`${PREVIEW}`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      inventory.shots.push(await shot(page, "preview-a-r1"));
      inventory.qa.preview = await snapshot(page);
      await context.close();
    }
    }

    const captureDeg = async (name, sequence, extraQuery = "") => recordClip(browser, name, async (page, watched) => {
      await page.goto(`${SANDBOX}?variant=${AR1}&view=canonical&theme=light&labels=0&mode=transition&dpr=1${extraQuery}`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await go(page, sequence[0]);
      await lab(page, () => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).startM5Trace());
      for (const node of sequence.slice(1)) await go(page, node);
      watched.trace = await lab(page, () => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).stopM5Trace());
      watched.final = await snapshot(page);
    });

    inventory.videos.push(await captureDeg("a-r1-design-event-games", ["05.2", "05.3", "05.4"]));
    inventory.videos.push(await captureDeg("a-r1-reverse", ["05.4", "05.3", "05.2"]));
    inventory.videos.push(await recordClip(browser, "a-r1-idle", async (page, watched) => {
      await page.goto(`${SANDBOX}?variant=${AR1}&view=canonical&theme=light&labels=0&mode=settled&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await go(page, "05.3");
      await page.waitForTimeout(5200);
      watched.final = await snapshot(page);
    }));
    inventory.videos.push(await recordClip(browser, "a-r1-reduced-motion", async (page, watched) => {
      await page.goto(`${SANDBOX}?variant=${AR1}&view=canonical&theme=light&labels=0&mode=transition&dpr=1&reduced=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await go(page, "05.2");
      await go(page, "05.3");
      await go(page, "05.4");
      watched.final = await snapshot(page);
    }, { reducedMotion: true }));
    inventory.videos.push(await recordClip(browser, "a-r1-context-restore", async (page, watched) => {
      await page.goto(`${SANDBOX}?variant=${AR1}&view=canonical&theme=light&labels=0&mode=settled&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await lab(page, () => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).loseContext());
      await page.waitForTimeout(1200);
      await waitLab(page);
      watched.final = await snapshot(page);
    }));
    inventory.videos.push(await recordClip(browser, "sandbox-live-variant-switching", async (page, watched) => {
      await page.goto(`${SANDBOX}?variant=${AR1}&view=canonical&theme=light&labels=0&mode=settled&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      for (const id of ["a", "baseline", "b", "c", AR1]) {
        await selectVariant(page, id);
      }
      watched.final = await snapshot(page);
    }));
    inventory.videos.push(await recordClip(browser, "sandbox-back-forward", async (page, watched) => {
      await page.goto(`${SANDBOX}?variant=${AR1}&view=canonical&theme=light&labels=0&mode=settled&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await page.click('[data-qa="m52-variant-a"]');
      await waitDisplayed(page, "a");
      await page.click(`[data-qa="m52-variant-${AR1}"]`);
      await waitDisplayed(page, AR1);
      await page.goBack();
      await waitDisplayed(page, "a");
      await page.goForward();
      await waitDisplayed(page, AR1);
      watched.final = await snapshot(page);
    }));
    inventory.videos.push(await recordClip(browser, "sandbox-mobile-controls", async (page, watched) => {
      await page.goto(`${SANDBOX}?variant=${AR1}&view=canonical&theme=light&labels=0&mode=settled&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await page.click('[data-qa="m52-variant-a"]');
      await waitDisplayed(page, "a");
      watched.final = await snapshot(page);
    }, { viewport: { width: 390, height: 844 } }));
    inventory.videos.push(await recordClip(browser, "a-r1-rapid-residual", async (page, watched) => {
      await page.goto(`${SANDBOX}?variant=${AR1}&view=canonical&theme=light&labels=0&mode=transition&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await go(page, "05.2");
      await lab(page, () => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).startM5Trace());
      const nodes = ["05.2", "05.3", "05.4", "05.3", "05.2"];
      for (let index = 0; index < 20; index += 1) {
        await lab(page, (id) => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).scrollToNode(id, "auto"), nodes[index % nodes.length]);
      }
      await waitVisualSettled(page, 60000);
      watched.trace = await lab(page, () => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).stopM5Trace());
      watched.final = await snapshot(page);
      watched.note = "PS04-M5-R001 may appear; not fixed on R1";
    }));

    {
      const { context, page } = await openSandbox(browser, `variant=${AR1}&view=canonical&theme=light&labels=0&mode=settled&dpr=1`);
      const variants = [AR1, "a", "baseline", "b", "c", AR1];
      for (let cycle = 0; cycle < 20; cycle += 1) {
        for (const variant of variants) {
          await selectVariant(page, variant);
        }
        inventory.cycle.push({
          cycle,
          ...(await snapshot(page)),
          resource: await lab(page, () => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).resource?.() ?? null),
        });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  writeFileSync(path.join(REPORTS, "browser-capture.json"), `${JSON.stringify({ capturedAt: new Date().toISOString(), ...inventory }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ base: BASE, shots: inventory.shots.length, videos: inventory.videos.length, cycles: inventory.cycle.length, switching: inventory.switching }, null, 2)}\n`);
}

main();
