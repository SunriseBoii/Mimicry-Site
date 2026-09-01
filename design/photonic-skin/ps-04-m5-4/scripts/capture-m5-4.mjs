import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m5-4");
const BOARDS = path.join(STAGE, "renders/browser");
const RESPONSIVE = path.join(STAGE, "renders/responsive");
const SAFE = path.join(STAGE, "renders/safe-area");
const TRANSITIONS = path.join(STAGE, "renders/transitions");
const VIDEO = path.join(STAGE, "renders/video");
const REPORTS = path.join(STAGE, "reports");
const BASE = process.env.PS04M54_BASE ?? "http://localhost:3000";
const SANDBOX = `${BASE}/visual-lab/photonic-skin-ps04-m5/framing-sandbox`;
const HOME = `${BASE}/`;

mkdirSync(BOARDS, { recursive: true });
mkdirSync(RESPONSIVE, { recursive: true });
mkdirSync(SAFE, { recursive: true });
mkdirSync(TRANSITIONS, { recursive: true });
mkdirSync(VIDEO, { recursive: true });
mkdirSync(path.join(STAGE, "renders/boards"), { recursive: true });

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
    const handle = window.__PS04M54_LAB__ || window.__PS04M5_LAB__;
    return Boolean(handle && handle.runId === "ps04-m5-4" && handle.ready);
  }, null, { timeout: 120000 });
}

async function waitActor(page, timeout = 40000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M54_LAB__ || window.__PS04M5_LAB__;
    if (!handle) return false;
    if (handle.activeNode === "08") return handle.composition()?.actorDraw === false;
    return handle.actorFramebufferReady === true && (handle.stats.lastActorDrawCalls === 1 || handle.composition()?.actorDraw === false);
  }, null, { timeout });
}

async function waitVisualSettled(page, timeout = 50000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M54_LAB__ || window.__PS04M5_LAB__;
    if (!handle || handle.loading || handle.loadStatus !== "ready") return false;
    const tx = typeof handle.transaction === "function" ? handle.transaction() : null;
    if (tx && tx.visualLifecycle && tx.visualLifecycle !== "settled") return false;
    return true;
  }, null, { timeout });
}

async function go(page, id) {
  await lab(page, (node) => (window.__PS04M54_LAB__ || window.__PS04M5_LAB__).scrollToNode(node, "auto"), id);
  await page.waitForFunction((node) => (window.__PS04M54_LAB__ || window.__PS04M5_LAB__).activeNode === node, id, { timeout: 40000 });
  if (id !== "08") {
    await waitVisualSettled(page, 90000);
    await waitActor(page, 30000);
  }
}

async function shot(page, dir, name) {
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file.replaceAll("\\", "/");
}

function query(args) {
  const params = new URLSearchParams({
    screen: args.screen ?? "about",
    aboutZoom: String(args.aboutZoom ?? 118),
    merchZoom: String(args.merchZoom ?? 108),
    videoZoom: String(args.videoZoom ?? 108),
    viewport: "current",
    diagnostic: args.diagnostic ?? "final",
    theme: args.theme ?? "light",
    mode: "settled",
  });
  return params.toString();
}

async function openSandbox(browser, search, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  await page.goto(`${SANDBOX}?${search}`, { waitUntil: "domcontentloaded" });
  await waitLab(page);
  await waitActor(page);
  await waitVisualSettled(page);
  return { context, page };
}

async function snapshot(page) {
  return lab(page, () => {
    const handle = window.__PS04M54_LAB__ || window.__PS04M5_LAB__;
    const framing = handle.framing?.() ?? null;
    const camera = handle.camera?.() ?? null;
    const composition = handle.composition?.() ?? null;
    return {
      runId: handle.runId,
      node: handle.activeNode,
      hash: handle.overlayHash?.(),
      draws: handle.stats.lastActorDrawCalls,
      triangles: handle.stats.lastActorTriangles,
      programs: handle.stats.programs,
      canvases: handle.canvasCount(),
      framing,
      camera,
      slot: composition ? { x: composition.cssCenterX, y: composition.cssCenterY, size: composition.cssSize, slot: composition.slot, siteFit: composition.siteFitScale, zoom: composition.visualZoomMultiplier } : null,
    };
  });
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
  await setup(page);
  await context.close();
  return name;
}

const smoke = [];
const boards = [];

const browser = await chromium.launch(LAUNCH);
try {
  for (const theme of ["light", "dark"]) {
    for (const [screen, zooms] of [["about", [100, 112, 118, 124]], ["merch", [100, 105, 108, 111]], ["video", [100, 105, 108, 111]]]) {
      const { context, page } = await openSandbox(browser, query({
        screen,
        aboutZoom: screen === "about" ? 118 : 100,
        merchZoom: screen === "merch" ? 108 : 100,
        videoZoom: screen === "video" ? 108 : 100,
        theme,
      }));
      for (const zoom of zooms) {
        await lab(page, (patch) => (window.__PS04M54_LAB__ || window.__PS04M5_LAB__).applySandbox(patch), {
          aboutZoom: screen === "about" ? zoom : 100,
          merchZoom: screen === "merch" ? zoom : 100,
          videoZoom: screen === "video" ? zoom : 100,
        });
        await waitVisualSettled(page);
        await waitActor(page);
        boards.push(await shot(page, BOARDS, `${screen}-${zoom}-${theme}`));
        smoke.push(await snapshot(page));
      }
      await context.close();
    }
  }

  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720], [390, 844]]) {
    for (const screen of ["about", "merch", "video"]) {
      const { context, page } = await openSandbox(browser, query({ screen }), { width: w, height: h });
      boards.push(await shot(page, RESPONSIVE, `${screen}-${w}x${h}`));
      await context.close();
    }
  }

  for (const screen of ["about", "merch", "video"]) {
    const { context, page } = await openSandbox(browser, query({ screen, diagnostic: "safe-area" }));
    boards.push(await shot(page, SAFE, `${screen}-safe-area`));
    await context.close();
  }

  {
    const { context, page } = await openSandbox(browser, query({ screen: "about", aboutZoom: 100, diagnostic: "baseline" }));
    boards.push(await shot(page, BOARDS, "about-baseline-ghost"));
    await context.close();
  }

  {
    const { context, page } = await openSandbox(browser, query({ screen: "walkthrough" }));
    await go(page, "02");
    boards.push(await shot(page, TRANSITIONS, "walkthrough-about"));
    await go(page, "05.7");
    boards.push(await shot(page, TRANSITIONS, "walkthrough-merch"));
    await go(page, "05.5");
    boards.push(await shot(page, TRANSITIONS, "walkthrough-video"));
    await go(page, "03.2");
    boards.push(await shot(page, TRANSITIONS, "cases-content-unaffected"));
    await go(page, "01");
    boards.push(await shot(page, TRANSITIONS, "hero-unaffected"));
    await go(page, "08");
    boards.push(await shot(page, TRANSITIONS, "footer-no-actor"));
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(HOME, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    boards.push(await shot(page, BOARDS, "production-homepage"));
    await context.close();
  }

  await recordClip(browser, "digital-video-digital", async (page) => {
    await page.goto(`${SANDBOX}?${query({ screen: "video", mode: "settled" })}`, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "05.6");
    await go(page, "05.5");
    await go(page, "05.6");
  });

  await recordClip(browser, "merch-team", async (page) => {
    await page.goto(`${SANDBOX}?${query({ screen: "merch" })}`, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "05.7");
    await go(page, "06.1");
  });

  writeFileSync(path.join(REPORTS, "browser-smoke.json"), JSON.stringify({ ok: true, samples: smoke.slice(0, 12), boards }, null, 2));
} finally {
  await browser.close();
}

console.log(JSON.stringify({ boards: boards.length, smoke: smoke.length }, null, 2));
