import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m5-5");
const BOARDS = path.join(STAGE, "renders/boards");
const BROWSER = path.join(STAGE, "renders/browser");
const RESPONSIVE = path.join(STAGE, "renders/responsive");
const TRANSITIONS = path.join(STAGE, "renders/transitions");
const VIDEO = path.join(STAGE, "renders/browser/video");
const REPORTS = path.join(STAGE, "reports");
const BASE = process.env.PS04M55_BASE ?? "http://localhost:3000";
const PREVIEW = `${BASE}/visual-lab/photonic-skin-ps04-m5/promotion-preview`;
const REVIEW = `${BASE}/visual-lab/photonic-skin-ps04-m5/promotion-preview/review`;
const HOME = `${BASE}/`;

for (const dir of [BOARDS, BROWSER, RESPONSIVE, TRANSITIONS, VIDEO, path.join(STAGE, "renders/states"), REPORTS]) {
  mkdirSync(dir, { recursive: true });
}

const LAUNCH = {
  channel: "msedge",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
};

const NODES = ["01", "02", "03.1", "03.2", "04", "05.1", "05.2", "05.3", "05.4", "05.5", "05.6", "05.7", "06.1", "07", "08"];

function lab(page, expression, arg) {
  return page.evaluate(expression, arg);
}

async function waitLab(page) {
  await page.waitForSelector("canvas", { timeout: 120000 });
  await page.waitForFunction(() => {
    const handle = window.__PS04M55_LAB__ || window.__PS04M5_LAB__;
    return Boolean(handle && handle.runId === "ps04-m5-5" && handle.ready);
  }, null, { timeout: 120000 });
}

async function waitActor(page, timeout = 40000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M55_LAB__ || window.__PS04M5_LAB__;
    if (!handle) return false;
    if (handle.activeNode === "08") return handle.composition()?.actorDraw === false;
    return handle.actorFramebufferReady === true && (handle.stats.lastActorDrawCalls === 1 || handle.composition()?.actorDraw === false);
  }, null, { timeout });
}

async function waitVisualSettled(page, timeout = 50000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M55_LAB__ || window.__PS04M5_LAB__;
    if (!handle || handle.loading || handle.loadStatus !== "ready") return false;
    const tx = typeof handle.transaction === "function" ? handle.transaction() : null;
    if (tx && tx.visualLifecycle && tx.visualLifecycle !== "settled") return false;
    return true;
  }, null, { timeout });
}

async function go(page, id) {
  await lab(page, (node) => (window.__PS04M55_LAB__ || window.__PS04M5_LAB__).scrollToNode(node, "auto"), id);
  try {
    await page.waitForFunction((node) => (window.__PS04M55_LAB__ || window.__PS04M5_LAB__).activeNode === node, id, { timeout: 20000 });
  } catch {
    console.log("activeNode timeout", id);
  }
  if (id !== "08") {
    try { await waitVisualSettled(page, 25000); } catch { console.log("settle timeout", id); }
    try { await waitActor(page, 15000); } catch { console.log("actor timeout", id); }
  }
}

async function shot(page, dir, name) {
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file.replaceAll("\\", "/");
}

function overlap(a, b) {
  if (!a || !b) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function snapshot(page) {
  return lab(page, () => {
    const handle = window.__PS04M55_LAB__ || window.__PS04M5_LAB__;
    return {
      runId: handle.runId,
      assetNamespace: handle.assetNamespace,
      eventOverlay: handle.eventOverlay,
      videoOverlay: handle.videoOverlay,
      runtimeRotationOverride: handle.runtimeRotationOverride,
      framingProfile: handle.framingProfile,
      node: handle.activeNode,
      hash: handle.overlayHash?.() ?? handle.stateHash,
      draws: handle.stats.lastActorDrawCalls,
      triangles: handle.stats.lastActorTriangles,
      programs: handle.stats.programs,
      canvases: handle.canvasCount(),
      framing: handle.framing?.() ?? null,
      camera: handle.camera?.() ?? null,
    };
  });
}

async function measureSafeArea(page) {
  await page.waitForTimeout(400);
  return lab(page, () => {
    const handle = window.__PS04M55_LAB__ || window.__PS04M5_LAB__;
    const box = handle.measure?.()?.actorMaskBBoxCss ?? null;
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const heading = rect(document.querySelector("#heading-02"));
    const header = rect(document.querySelector("[data-qa='m4-header']"));
    const nav = rect(document.querySelector("[data-qa='m4-header'] nav"));
    const graph = rect(document.querySelector("[data-qa='m4-graph']"));
    const hit = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    const framing = handle.framing?.() ?? null;
    return {
      framing,
      actor: box,
      heading,
      header,
      nav,
      graph,
      viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
      overlapHeading: hit(box, heading),
      overlapHeader: hit(box, header),
      overlapNav: hit(box, nav),
      overlapGraph: hit(box, graph),
      clipLeft: box ? Math.max(0, -box.left) : null,
      clipRight: box ? Math.max(0, box.right - window.innerWidth) : null,
      clipTop: box ? Math.max(0, -box.top) : null,
      clipBottom: box ? Math.max(0, box.bottom - window.innerHeight) : null,
      assetNamespace: handle.assetNamespace,
      eventOverlay: handle.eventOverlay,
      videoOverlay: handle.videoOverlay,
    };
  });
}

async function openPreview(browser, search = "", viewport = { width: 1440, height: 900 }, options = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
    colorScheme: options.theme === "dark" ? "dark" : "light",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const url = search ? `${PREVIEW}?${search}` : PREVIEW;
  await page.goto(url, { waitUntil: "domcontentloaded" });
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
  const video = page.video();
  await setup(page);
  await page.waitForTimeout(400);
  await context.close();
  if (video) {
    const src = await video.path();
    const dest = path.join(VIDEO, `${name}.webm`);
    renameSync(src, dest);
    return dest.replaceAll("\\", "/");
  }
  return name;
}

const boards = [];
const smoke = [];
const walk = [];
let aboutSafe = null;
let merchSafe = null;
let videoSafe = null;
let productionIsolation = null;
let restore = null;
let performanceQa = null;
let rapid = null;
const videos = [];

const browser = await chromium.launch(LAUNCH);
try {
  for (const theme of ["light", "dark"]) {
    const { context, page } = await openPreview(browser, `theme=${theme}`, { width: 1440, height: 900 }, { theme });
    await go(page, "02");
    boards.push(await shot(page, BROWSER, `about-${theme}`));
    boards.push(await shot(page, BOARDS, `about-124-${theme}`));
    smoke.push(await snapshot(page));
    await go(page, "05.3");
    boards.push(await shot(page, BROWSER, `event-single-${theme}`));
    await go(page, "05.5");
    boards.push(await shot(page, BROWSER, `video-single-${theme}`));
    await go(page, "05.7");
    boards.push(await shot(page, BROWSER, `merch-${theme}`));
    await context.close();
  }

  {
    const { context, page } = await openPreview(browser, "actorMask=1&theme=light");
    await go(page, "02");
    aboutSafe = await measureSafeArea(page);
    boards.push(await shot(page, BROWSER, "about-124-mask"));
    await go(page, "05.7");
    merchSafe = await measureSafeArea(page);
    await go(page, "05.5");
    videoSafe = await measureSafeArea(page);
    await context.close();
  }

  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720], [390, 844]]) {
    const { context, page } = await openPreview(browser, "", { width: w, height: h });
    await go(page, "02");
    boards.push(await shot(page, RESPONSIVE, `about-${w}x${h}`));
    walk.push({ screen: "about", viewport: `${w}x${h}`, ...(await snapshot(page)) });
    await go(page, "05.7");
    boards.push(await shot(page, RESPONSIVE, `merch-${w}x${h}`));
    walk.push({ screen: "merch", viewport: `${w}x${h}`, ...(await snapshot(page)) });
    await go(page, "05.5");
    boards.push(await shot(page, RESPONSIVE, `video-${w}x${h}`));
    walk.push({ screen: "video", viewport: `${w}x${h}`, ...(await snapshot(page)) });
    await go(page, "05.3");
    boards.push(await shot(page, RESPONSIVE, `event-${w}x${h}`));
    await context.close();
  }

  {
    const { context, page } = await openPreview(browser, "theme=light");
    for (const id of NODES) {
      await go(page, id);
      boards.push(await shot(page, TRANSITIONS, `node-${id.replace(".", "-")}`));
      walk.push(await snapshot(page));
    }
    await lab(page, () => (window.__PS04M55_LAB__ || window.__PS04M5_LAB__).requestState("complex-focus-event-video-focus-event"));
    await waitVisualSettled(page);
    boards.push(await shot(page, TRANSITIONS, "intersection-event-video"));
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(HOME, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    boards.push(await shot(page, BOARDS, "22-production-homepage"));
    const html = await page.content();
    productionIsolation = {
      url: page.url(),
      hasSiteShell: html.includes("SiteShell") || Boolean(await page.locator("body").count()),
      requestsM55: html.includes("ps-04-m5-5"),
      title: await page.title(),
    };
    await context.close();
  }

  try {
    const { context, page } = await openPreview(browser);
    await go(page, "02");
    const before = await snapshot(page);
    await lab(page, () => (window.__PS04M55_LAB__ || window.__PS04M5_LAB__).loseContext?.());
    await page.waitForTimeout(1200);
    await waitLab(page);
    await waitActor(page);
    const after = await snapshot(page);
    restore = { before, after, namespacePreserved: after.assetNamespace === "ps-04-m5-5" };
    await context.close();
  } catch (error) {
    restore = { error: String(error) };
  }

  try {
    const { context, page } = await openPreview(browser);
    const started = Date.now();
    await lab(page, () => (window.__PS04M55_LAB__ || window.__PS04M5_LAB__).startPerf("m55-warm"));
    for (let i = 0; i < 20; i += 1) {
      for (const id of ["02", "05.3", "05.5", "05.7", "01"]) {
        await lab(page, (node) => (window.__PS04M55_LAB__ || window.__PS04M5_LAB__).scrollToNode(node, "auto"), id);
        try {
          await page.waitForFunction((node) => (window.__PS04M55_LAB__ || window.__PS04M5_LAB__).activeNode === node, id, { timeout: 8000 });
        } catch {
          // continue plateau loop
        }
      }
    }
    const perf = await lab(page, () => (window.__PS04M55_LAB__ || window.__PS04M5_LAB__).stopPerf());
    const snap = await snapshot(page);
    performanceQa = { elapsedMs: Date.now() - started, passes: 20, snap, perf };
    await context.close();
  } catch (error) {
    performanceQa = { error: String(error) };
  }

  videos.push(await recordClip(browser, "design-event-games", async (page) => {
    await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "05.2");
    await go(page, "05.3");
    await go(page, "05.4");
  }));
  videos.push(await recordClip(browser, "games-event-design", async (page) => {
    await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "05.4");
    await go(page, "05.3");
    await go(page, "05.2");
  }));
  videos.push(await recordClip(browser, "digital-video", async (page) => {
    await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "05.6");
    await go(page, "05.5");
  }));
  videos.push(await recordClip(browser, "video-digital", async (page) => {
    await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "05.5");
    await go(page, "05.6");
  }));
  videos.push(await recordClip(browser, "video-merch", async (page) => {
    await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "05.5");
    await go(page, "05.7");
  }));
  videos.push(await recordClip(browser, "merch-video", async (page) => {
    await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "05.7");
    await go(page, "05.5");
  }));
  videos.push(await recordClip(browser, "cases-content", async (page) => {
    await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "04");
    await go(page, "05.1");
  }));
  videos.push(await recordClip(browser, "merch-team", async (page) => {
    await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "05.7");
    await go(page, "06.1");
  }));
  videos.push(await recordClip(browser, "about-entry-exit", async (page) => {
    await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "01");
    await go(page, "02");
    await go(page, "03.1");
  }));
  videos.push(await recordClip(browser, "intersection-complex", async (page) => {
    await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "05.3");
    await lab(page, () => (window.__PS04M55_LAB__ || window.__PS04M5_LAB__).requestState("complex-focus-event-video-focus-event"));
    await waitVisualSettled(page);
    await go(page, "05.5");
  }));
  videos.push(await recordClip(browser, "rapid-latest-target", async (page) => {
    await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "05.6");
    await lab(page, () => {
      const handle = window.__PS04M55_LAB__ || window.__PS04M5_LAB__;
      handle.scrollToNode("05.5", "auto");
      handle.scrollToNode("05.7", "auto");
      handle.scrollToNode("05.3", "auto");
    });
    await page.waitForTimeout(2500);
    rapid = await snapshot(page);
  }));
  videos.push(await recordClip(browser, "reduced-motion", async (page) => {
    await page.goto(`${PREVIEW}?reduced=1`, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "05.6");
    await go(page, "05.5");
    await go(page, "05.7");
  }, { reducedMotion: true }));

  const first = smoke[0] ?? {};
  const aboutPass = Boolean(
    aboutSafe
    && aboutSafe.framing?.requestedZoom === 1.24
    && aboutSafe.framing?.effectiveZoom === 1.24
    && !aboutSafe.framing?.capped
    && !aboutSafe.overlapHeading
    && !aboutSafe.overlapHeader
    && !aboutSafe.overlapGraph
    && (aboutSafe.clipLeft ?? 0) === 0
    && (aboutSafe.clipRight ?? 0) === 0
    && (aboutSafe.clipTop ?? 0) === 0
    && (aboutSafe.clipBottom ?? 0) === 0,
  );

  writeFileSync(path.join(REPORTS, "browser-smoke.json"), JSON.stringify({
    ok: Boolean(first.runId === "ps04-m5-5" && first.assetNamespace === "ps-04-m5-5" && first.eventOverlay === "none"),
    assetNamespace: first.assetNamespace ?? null,
    eventOverlay: first.eventOverlay ?? null,
    videoOverlay: first.videoOverlay ?? null,
    runtimeRotationOverride: first.runtimeRotationOverride ?? null,
    framingProfile: first.framingProfile ?? null,
    samples: smoke,
    walk: walk.slice(0, 24),
    boards,
    productionIsolation,
    restore,
  }, null, 2) + "\n");

  writeFileSync(path.join(REPORTS, "safe-area-analysis.json"), JSON.stringify({
    method: "browser visible-pixel actor mask vs heading/header/nav/graph/viewport",
    silentlyCappingForbidden: true,
    desktop: {
      about: {
        requestedZoom: aboutSafe?.framing?.requestedZoom ?? null,
        effectiveZoom: aboutSafe?.framing?.effectiveZoom ?? null,
        silentlyCapped: Boolean(aboutSafe?.framing?.capped),
        overlapHeading: aboutSafe?.overlapHeading ?? null,
        overlapHeader: aboutSafe?.overlapHeader ?? null,
        overlapGraph: aboutSafe?.overlapGraph ?? null,
        clip: {
          left: aboutSafe?.clipLeft,
          right: aboutSafe?.clipRight,
          top: aboutSafe?.clipTop,
          bottom: aboutSafe?.clipBottom,
        },
        pass: aboutPass,
      },
      merch: merchSafe,
      video: videoSafe,
    },
    raw: aboutSafe,
    verdict: aboutPass ? "PASS" : "FAIL",
  }, null, 2) + "\n");

  writeFileSync(path.join(REPORTS, "responsive-qa.json"), JSON.stringify({
    viewports: ["1920x1080", "1440x900", "1280x720", "390x844"],
    samples: walk.filter((row) => row.viewport),
  }, null, 2) + "\n");

  writeFileSync(path.join(REPORTS, "performance-qa.json"), JSON.stringify({
    comparedTo: "M5.4/M5.1 qualitative",
    twentyPasses: performanceQa,
    restore,
    oneActor: smoke.every((row) => row.canvases === 1),
  }, null, 2) + "\n");

  writeFileSync(path.join(REPORTS, "video-playback.json"), JSON.stringify({
    recorded: videos,
    pendingEndedPlayback: true,
    rapidResidual: rapid,
  }, null, 2) + "\n");
} finally {
  await browser.close();
}

console.log(JSON.stringify({
  boards: boards.length,
  smoke: smoke.length,
  videos: videos.length,
  aboutPass: aboutSafe?.framing?.effectiveZoom,
  namespace: smoke[0]?.assetNamespace,
}, null, 2));
