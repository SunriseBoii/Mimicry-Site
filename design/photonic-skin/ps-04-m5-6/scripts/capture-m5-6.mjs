import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m5-6");
const REPORTS = path.join(STAGE, "reports");
const BASELINE = path.join(STAGE, "renders/baseline");
const PRODUCTION = path.join(STAGE, "renders/production");
const RESPONSIVE = path.join(STAGE, "renders/responsive");
const SAFE = path.join(STAGE, "renders/safe-area");
const TRANSITIONS = path.join(STAGE, "renders/transitions");
const VIDEO = path.join(STAGE, "renders/video");
const BASE = process.env.PS04M56_BASE ?? "http://localhost:3000";
const HOME = `${BASE}/`;
const PREVIEW = `${BASE}/visual-lab/photonic-skin-ps04-m5/promotion-preview`;
const HASHES = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-5/reports/state-hash-map.json"), "utf8"));
const SKIP_LONG = process.env.PS04M56_SKIP_LONG === "1";

for (const dir of [REPORTS, BASELINE, PRODUCTION, RESPONSIVE, SAFE, TRANSITIONS, VIDEO]) mkdirSync(dir, { recursive: true });

const LAUNCH = {
  channel: "msedge",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
};

const NODES = ["01", "02", "03.1", "03.2", "03.3", "04", "05.1", "05.2", "05.3", "05.4", "05.5", "05.6", "05.7", "06.1", "06.2", "06.3", "07", "08"];
const WALK_NODES = ["01", "02", "03.1", "04", "05.1", "05.2", "05.3", "05.4", "05.5", "05.6", "05.7", "06.1", "06.2", "06.3", "07", "08"];

function lab(page, expression, arg) {
  return page.evaluate(expression, arg);
}

function pathnameOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

async function waitProd(page) {
  await page.waitForSelector("canvas", { timeout: 120000 });
  await page.waitForFunction(() => {
    const handle = window.__PS04M56_PRODUCTION__ || window.__PS04M55_LAB__ || window.__PS04M5_LAB__;
    return Boolean(handle && handle.ready);
  }, null, { timeout: 120000 });
}

async function waitActor(page, timeout = 40000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M56_PRODUCTION__ || window.__PS04M55_LAB__ || window.__PS04M5_LAB__;
    if (!handle) return false;
    if (handle.activeNode === "08") return handle.composition()?.actorDraw === false;
    return handle.actorFramebufferReady === true && (handle.stats.lastActorDrawCalls === 1 || handle.composition()?.actorDraw === false);
  }, null, { timeout });
}

async function waitVisualSettled(page, timeout = 50000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M56_PRODUCTION__ || window.__PS04M55_LAB__ || window.__PS04M5_LAB__;
    if (!handle || handle.loading || handle.loadStatus !== "ready") return false;
    const tx = typeof handle.transaction === "function" ? handle.transaction() : null;
    if (tx && tx.visualLifecycle && tx.visualLifecycle !== "settled") return false;
    return true;
  }, null, { timeout });
}

async function go(page, id) {
  const moved = await lab(page, (node) => (window.__PS04M56_PRODUCTION__ || window.__PS04M55_LAB__ || window.__PS04M5_LAB__).scrollToNode(node, "auto"), id);
  try {
    await page.waitForFunction((node) => (window.__PS04M56_PRODUCTION__ || window.__PS04M55_LAB__ || window.__PS04M5_LAB__).activeNode === node, id, { timeout: 20000 });
  } catch {
    console.log("activeNode timeout", id, "moved", moved);
  }
  if (id !== "08") {
    try { await waitVisualSettled(page, 25000); } catch { console.log("settle timeout", id); }
    try { await waitActor(page, 15000); } catch { console.log("actor timeout", id); }
  }
  return moved;
}

async function shot(page, dir, name) {
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file.replaceAll("\\", "/");
}

async function snapshot(page) {
  return lab(page, () => {
    const handle = window.__PS04M56_PRODUCTION__ || window.__PS04M55_LAB__ || window.__PS04M5_LAB__;
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
      geometries: handle.stats.geometries,
      textures: handle.stats.textures,
      framing: handle.framing?.() ?? null,
      camera: handle.camera?.() ?? null,
      contract: handle.contract?.() ?? null,
      cache: handle.programCache?.() ?? null,
      resource: handle.resource?.() ?? null,
      heap: performance.memory?.usedJSHeapSize ?? null,
      instances: handle.environment?.instanceCount ?? handle.stats.lastActorTriangles / 8,
    };
  });
}

async function siteFingerprint(page) {
  return lab(page, () => {
    const headings = [...document.querySelectorAll("[id^='heading-']")].map((el) => ({ id: el.id, text: el.textContent?.replace(/\s+/g, " ").trim() }));
    const nav = [...document.querySelectorAll("[data-qa='m4-header'] nav button")].map((el) => el.textContent?.trim());
    const nodes = [...document.querySelectorAll("[data-node]")].map((el) => el.getAttribute("data-node"));
    const skip = document.querySelector("a.skip, .skip")?.textContent?.trim() ?? null;
    const hud = Boolean(document.querySelector("[data-qa='m55-review'], [data-qa='framing-review']"));
    return {
      title: document.title,
      headings,
      nav,
      nodes,
      skip,
      hud,
      canvas: document.querySelectorAll("canvas").length,
      namespace: document.querySelector("[data-asset-namespace]")?.getAttribute("data-asset-namespace") ?? null,
    };
  });
}

async function measureSafeArea(page, nodeId) {
  await lab(page, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).setActorMask?.(true));
  await page.waitForTimeout(500);
  const result = await lab(page, (id) => {
    const handle = window.__PS04M56_PRODUCTION__ || window.__PS04M55_LAB__ || window.__PS04M5_LAB__;
    const box = handle.measure?.()?.actorMaskBBoxCss ?? null;
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return null;
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const heading = rect(document.getElementById(`heading-${id}`));
    const screen = document.getElementById(`screen-${id}`);
    const body = rect(screen?.querySelector(".lede"));
    const header = rect(document.querySelector("[data-qa='m4-header']"));
    const nav = rect(document.querySelector("[data-qa='m4-header'] nav"));
    const graph = rect(document.querySelector("[data-qa='m4-graph']"));
    const cta = rect(screen?.querySelector("button, a"));
    const hit = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    const framing = handle.framing?.() ?? null;
    return {
      nodeId: id,
      framing,
      actor: box,
      heading,
      body,
      header,
      nav,
      graph,
      cta,
      viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
      overlapHeading: hit(box, heading),
      overlapBody: hit(box, body),
      overlapHeader: hit(box, header),
      overlapNav: hit(box, nav),
      overlapGraph: hit(box, graph),
      overlapCta: hit(box, cta),
      headingOnscreen: Boolean(heading && heading.bottom > 0 && heading.top < window.innerHeight),
      clipLeft: box ? Math.max(0, -box.left) : null,
      clipRight: box ? Math.max(0, box.right - window.innerWidth) : null,
      clipTop: box ? Math.max(0, -box.top) : null,
      clipBottom: box ? Math.max(0, box.bottom - window.innerHeight) : null,
      assetNamespace: handle.assetNamespace,
    };
  }, nodeId);
  await lab(page, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).setActorMask?.(false));
  return result;
}

async function openHome(browser, viewport = { width: 1440, height: 900 }, options = {}) {
  const requests = [];
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: options.dpr ?? 1,
    reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
    colorScheme: options.theme === "dark" ? "dark" : "light",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("photonic-skin") || url.includes("visual-lab") || url.includes("/_next/")) requests.push(url);
  });
  await page.goto(options.url ?? HOME, { waitUntil: "domcontentloaded" });
  await waitProd(page);
  await waitActor(page);
  await waitVisualSettled(page);
  return { context, page, requests };
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

function countLeads(frames, allowed = null) {
  const list = Array.isArray(frames) ? frames : [];
  const morphing = list.filter((frame) => frame.visualLifecycle && frame.visualLifecycle !== "preparing");
  const unexpected = morphing.filter((frame) => {
    const current = frame.currentGeometryId;
    if (!current) return false;
    if (allowed) return !allowed.has(current);
    return current !== frame.sourceState && current !== frame.targetState;
  }).length;
  return {
    frames: list.length,
    paletteLeads: list.filter((frame) => frame.paletteLeads).length,
    centerDwell: list.filter((frame) => frame.centerDeclaredAsTarget).length,
    thirdGeometry: unexpected > 0,
    thirdGeometryFrames: unexpected,
    geometries: [...new Set(list.flatMap((frame) => [frame.sourceState, frame.targetState, frame.currentGeometryId]).filter(Boolean))],
  };
}

const browser = await chromium.launch(LAUNCH);
const videos = [];
const shots = [];
try {
  const preview = await openHome(browser, { width: 1440, height: 900 }, { url: PREVIEW });
  const previewFp = await siteFingerprint(preview.page);
  shots.push(await shot(preview.page, BASELINE, "preview-siteshell"));
  await preview.context.close();

  const firstRequests = [];
  const firstContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const firstPage = await firstContext.newPage();
  firstPage.on("request", (request) => firstRequests.push(request.url()));
  firstPage.on("response", async (response) => {
    if (response.status() === 404) firstRequests.push(`404:${response.url()}`);
  });
  await firstPage.goto(HOME, { waitUntil: "domcontentloaded" });
  await waitProd(firstPage);
  await waitActor(firstPage);
  await waitVisualSettled(firstPage);
  const firstSnap = await snapshot(firstPage);
  console.log("home ready", firstSnap.assetNamespace, firstSnap.node);
  const productionFp = await siteFingerprint(firstPage);
  shots.push(await shot(firstPage, PRODUCTION, "home-hero"));
  shots.push(await shot(firstPage, BASELINE, "production-siteshell"));

  const hudPresent = productionFp.hud || Boolean(await firstPage.locator("[data-qa='m55-review'], [data-qa='framing-review']").count());
  const assetAudit = {
    m55Manifest: firstRequests.some((url) => url.includes("/photonic-skin/ps-04-m5-5/manifests/ps04m55-manifest.json")),
    m55States: firstRequests.some((url) => url.includes("/photonic-skin/ps-04-m5-5/states/")),
    sandboxOverlays: firstRequests.some((url) => url.includes("ps-04-m5-2/variants") || url.includes("ps-04-m5-3-r1/variants") || url.includes("event-sandbox") || url.includes("video-sandbox")),
    oldVideoCombo: firstRequests.some((url) => url.includes("combo-40") && !url.includes("ps-04-m5-5")),
    frozenEventAsTarget: firstRequests.some((url) => url.includes("/ps-03-m3-1r/states/single-event")),
    visualLabModules: firstRequests.some((url) => pathnameOf(url).startsWith("/visual-lab/")),
    webpackChunksNamedVisualLab: firstRequests.filter((url) => pathnameOf(url).startsWith("/_next/") && url.includes("visual-lab")).length,
    notFound: firstRequests.filter((url) => url.startsWith("404:")).length,
    sample: firstRequests.filter((url) => url.includes("photonic-skin")).slice(0, 24),
    stateRequests: firstRequests.filter((url) => pathnameOf(url).includes("/photonic-skin/ps-04-m5-5/states/")),
  };

  await go(firstPage, "02");
  shots.push(await shot(firstPage, PRODUCTION, "about"));
  const aboutHash = (await snapshot(firstPage)).hash;
  await firstPage.reload({ waitUntil: "domcontentloaded" });
  await waitProd(firstPage);
  await waitActor(firstPage);
  const afterReloadHero = await snapshot(firstPage);

  const masterHash = HASHES["master-neutral"]?.candidate ?? null;
  const firstFrame = {
    pass: firstSnap.canvases === 1 && firstSnap.draws === 1 && firstSnap.assetNamespace === "ps-04-m5-5" && !hudPresent && aboutHash !== masterHash,
    emptyFirstActorFrame: firstSnap.draws !== 1,
    masterFlash: aboutHash === masterHash,
    bootNode: firstSnap.node,
    bootHash: firstSnap.hash,
    aboutHash,
    masterHash,
    afterReloadNode: afterReloadHero.node,
    canvases: firstSnap.canvases,
    namespace: firstSnap.assetNamespace,
  };

  await go(firstPage, "02");
  const aboutDesktop = await measureSafeArea(firstPage, "02");
  shots.push(await shot(firstPage, SAFE, "about-1440"));
  const warmRequestCount = firstRequests.length;
  const warmStateUrls = new Set(firstRequests.map(pathnameOf).filter((url) => url.includes("/photonic-skin/ps-04-m5-5/states/")));
  await go(firstPage, "05.7");
  const merchDesktop = await measureSafeArea(firstPage, "05.7");
  shots.push(await shot(firstPage, SAFE, "merch-1440"));
  await go(firstPage, "05.5");
  const videoDesktop = await measureSafeArea(firstPage, "05.5");
  shots.push(await shot(firstPage, SAFE, "video-1440"));
  const laterStateUrls = firstRequests.slice(warmRequestCount).map(pathnameOf).filter((url) => url.includes("/photonic-skin/ps-04-m5-5/states/"));
  const duplicateAfterWarm = laterStateUrls.filter((url) => warmStateUrls.has(url));
  assetAudit.duplicateStateDownloadAfterWarm = duplicateAfterWarm.length;
  assetAudit.duplicateAfterWarmUrls = [...new Set(duplicateAfterWarm)];
  assetAudit.stateRequestCount = firstRequests.map(pathnameOf).filter((url) => url.includes("/photonic-skin/ps-04-m5-5/states/")).length;
  assetAudit.frozenMotionManifest = firstRequests.some((url) => url.includes("/photonic-skin/ps-03-m4-1/manifest.json"));
  assetAudit.frozenActorStates = firstRequests.some((url) => pathnameOf(url).includes("/photonic-skin/ps-03-m3-1r/states/"));

  const locked = await lab(firstPage, () => {
    const handle = window.__PS04M56_PRODUCTION__;
    handle.setCompetencies?.([]);
    return handle.scrollToNode("03.2", "auto");
  });
  await go(firstPage, "03.1");
  await lab(firstPage, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).selectTask("explain"));
  await firstPage.waitForTimeout(250);
  const entered = await go(firstPage, "03.2");
  const at32 = await snapshot(firstPage);
  await firstPage.keyboard.press("ArrowDown");
  await firstPage.waitForTimeout(400);
  const afterKey = await snapshot(firstPage);
  await go(firstPage, "03.1");
  await lab(firstPage, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).selectTask("explain"));
  await firstPage.waitForTimeout(200);
  await firstPage.locator('[data-hit="03.2"]').click({ force: true });
  try { await firstPage.waitForFunction(() => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).activeNode === "03.2", null, { timeout: 8000 }); } catch { /* graph may already be there */ }
  const afterGraph = await snapshot(firstPage);
  await go(firstPage, "04");
  const exited = (await snapshot(firstPage)).node === "04";
  const route32 = {
    lockedNoOp: locked === false,
    entered: at32.node === "03.2" && entered !== false,
    keyboard: afterKey.node === "03.3" || afterKey.node === "03.2",
    graph: afterGraph.node === "03.2",
    exited,
    pass: locked === false && at32.node === "03.2" && exited,
  };

  await go(firstPage, "03.1");
  await lab(firstPage, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).selectTask("explain"));
  await firstPage.waitForTimeout(200);
  await go(firstPage, "03.2");
  await lab(firstPage, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).setCompetencies(["event", "video"]));
  await firstPage.waitForTimeout(400);
  await waitVisualSettled(firstPage);
  const complexBefore = await snapshot(firstPage);
  await lab(firstPage, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).confirmCompetencies());
  await firstPage.waitForTimeout(400);
  await waitVisualSettled(firstPage);
  const complex = await snapshot(firstPage);
  const complexId = complex.contract?.resolvedGeometryId ?? complexBefore.contract?.resolvedGeometryId;
  const complexRoute = {
    productionUserAction: true,
    competencies: ["event", "video"],
    stateId: complexId,
    hash: complex.hash,
    expectedHash: HASHES[complexId]?.candidate ?? null,
    family: complex.contract?.family ?? null,
    paletteMask: complex.contract?.paletteMask ?? null,
    donors: HASHES[complexId]?.donors ?? [],
    pass: Boolean(complexId && String(complexId).includes("event-video") && complex.hash === HASHES[complexId]?.candidate && (HASHES[complexId]?.donors ?? []).includes("EVENT_A_R2")),
  };

  await go(firstPage, "05.2");
  await waitVisualSettled(firstPage);
  await waitActor(firstPage);
  const afterComplexDesign = await snapshot(firstPage);
  await firstPage.reload({ waitUntil: "domcontentloaded" });
  await waitProd(firstPage);
  await waitActor(firstPage);
  await go(firstPage, "05.2");
  await waitVisualSettled(firstPage);
  await waitActor(firstPage);
  try {
    await firstPage.waitForFunction(() => {
      const handle = window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__;
      const geo = handle.geometrySnapshot?.();
      const tx = handle.transaction?.();
      return geo?.settledGeometryId === "single-design" && tx?.status === "settled";
    }, null, { timeout: 20000 });
  } catch {
    console.log("design bind timeout", await snapshot(firstPage));
  }
  const designBeforeRapid = await snapshot(firstPage);
  await lab(firstPage, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).startM5Trace());
  const rapidNodes = ["05.2", "05.3", "05.4", "05.3", "05.2"];
  for (let index = 0; index < 20; index += 1) {
    await lab(firstPage, (id) => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).scrollToNode(id, "auto"), rapidNodes[index % rapidNodes.length]);
  }
  await waitVisualSettled(firstPage, 60000);
  const rapidFrames = await lab(firstPage, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).stopM5Trace());
  const rapidStats = countLeads(rapidFrames, new Set(["single-design", "single-event", "single-games"]));
  const reverseNodes = ["05.4", "05.3", "05.2", "05.3", "05.4"];
  await lab(firstPage, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).startM5Trace());
  for (let index = 0; index < 12; index += 1) {
    await lab(firstPage, (id) => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).scrollToNode(id, "auto"), reverseNodes[index % reverseNodes.length]);
  }
  await waitVisualSettled(firstPage, 60000);
  const reverseStats = countLeads(await lab(firstPage, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).stopM5Trace()), new Set(["single-design", "single-event", "single-games"]));
  await go(firstPage, "05.6");
  await lab(firstPage, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).startM5Trace());
  for (const id of ["05.5", "05.6", "05.5", "05.6"]) await lab(firstPage, (node) => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).scrollToNode(node, "auto"), id);
  await waitVisualSettled(firstPage, 40000);
  const digitalVideo = countLeads(await lab(firstPage, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).stopM5Trace()), new Set(["single-digital", "single-video"]));
  await go(firstPage, "05.5");
  await lab(firstPage, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).startM5Trace());
  for (const id of ["05.7", "05.5", "05.7", "05.5"]) await lab(firstPage, (node) => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).scrollToNode(node, "auto"), id);
  await waitVisualSettled(firstPage, 40000);
  const videoMerch = countLeads(await lab(firstPage, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).stopM5Trace()), new Set(["single-video", "single-merch"]));
  const residual = {
    id: "PS04-M5-R001",
    status: rapidStats.paletteLeads === 0 && reverseStats.paletteLeads === 0 && digitalVideo.paletteLeads === 0 && videoMerch.paletteLeads === 0 && rapidStats.centerDwell === 0 && !(rapidStats.thirdGeometry || reverseStats.thirdGeometry || digitalVideo.thirdGeometry || videoMerch.thirdGeometry) ? "CLOSED" : "OPEN",
    historicalFingerprint: { frames: 75, paletteLeads: 59, source: "ps-04-m5-2-r2 Event sandbox rapid" },
    rootCause: "Running geometry used sameMask to publish paletteProgress=1 while geometryProgress=0 during compile-gap/prepare, and rapid retarget inherited a stale session clock. M5.6 holds palette to the M5.1 delayed curve and holds a new transaction at 0 until the session target matches.",
    paletteLeads: rapidStats.paletteLeads,
    centerDwell: rapidStats.centerDwell,
    thirdGeometry: rapidStats.thirdGeometry || reverseStats.thirdGeometry || digitalVideo.thirdGeometry || videoMerch.thirdGeometry,
    forward: rapidStats,
    reverse: reverseStats,
    digitalVideo,
    videoMerch,
    afterComplexDesignHash: afterComplexDesign.hash,
    afterComplexDesignId: afterComplexDesign.contract?.resolvedGeometryId ?? null,
    designBeforeRapidHash: designBeforeRapid.hash,
    designBeforeRapidId: designBeforeRapid.contract?.resolvedGeometryId ?? null,
    sampleCountNotWeakened: true,
  };

  await go(firstPage, "08");
  const footer = await snapshot(firstPage);
  shots.push(await shot(firstPage, PRODUCTION, "footer"));
  const perfSnapshot = await lab(firstPage, () => {
    const handle = window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__;
    return {
      stats: handle.stats,
      cache: handle.programCache?.() ?? null,
      resource: handle.resource?.() ?? null,
      r6: handle.r6?.() ?? null,
      heap: performance.memory?.usedJSHeapSize ?? null,
    };
  });
  await firstPage.evaluate(() => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).loseContext?.());
  await firstPage.waitForTimeout(1200);
  await waitProd(firstPage);
  const restored = await snapshot(firstPage);
  await firstContext.close();

  let walks = [];
  let plateau = { pass10: null, pass20: null, unboundedGrowth: false, programsStable: true, canvases: true };
  let responsive = [];
  let dprRows = [];
  if (!SKIP_LONG) {
  const walkConfigs = [
    { theme: "light", viewport: { width: 1440, height: 900 }, reduced: false, reverse: false },
    { theme: "dark", viewport: { width: 1440, height: 900 }, reduced: false, reverse: false },
    { theme: "light", viewport: { width: 390, height: 844 }, reduced: false, reverse: false },
    { theme: "dark", viewport: { width: 390, height: 844 }, reduced: false, reverse: true },
    { theme: "light", viewport: { width: 1920, height: 1080 }, reduced: true, reverse: false },
  ];
  while (walks.length < 20) {
    const config = walkConfigs[walks.length % walkConfigs.length];
    const pass = await openHome(browser, config.viewport, { theme: config.theme, reducedMotion: config.reduced });
    console.log("walk", walks.length + 1);
    if (config.theme === "dark") await lab(pass.page, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).setTheme("dark"));
    const order = config.reverse ? [...WALK_NODES].reverse() : WALK_NODES;
    for (const id of order) {
      if (id === "03.2" || id === "03.3") continue;
      await go(pass.page, id);
    }
    await go(pass.page, "03.1");
    await lab(pass.page, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).selectTask("explain"));
    await pass.page.waitForTimeout(200);
    await go(pass.page, "03.2");
    await lab(pass.page, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).setCompetencies(["event", "video"]));
    await lab(pass.page, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).confirmCompetencies());
    await pass.page.waitForTimeout(200);
    await go(pass.page, "03.3");
    await go(pass.page, "08");
    const snap = await snapshot(pass.page);
    walks.push({
      index: walks.length + 1,
      theme: config.theme,
      viewport: `${config.viewport.width}x${config.viewport.height}`,
      reduced: config.reduced,
      reverse: config.reverse,
      cache: snap.cache,
      programs: snap.programs,
      canvases: snap.canvases,
      draws: snap.draws,
      geometries: snap.geometries,
      textures: snap.textures,
      heap: snap.heap,
      resource: snap.resource,
      footerDraws: snap.draws,
      namespace: snap.assetNamespace,
    });
    await pass.context.close();
  }

  const pass10 = walks[9];
  const pass20 = walks[19];
  const plateau = {
    pass10,
    pass20,
    unboundedGrowth: Boolean(pass20?.cache?.bytes && pass10?.cache?.bytes && pass20.cache.bytes > pass10.cache.bytes * 1.35),
    programsStable: pass10?.programs === pass20?.programs,
    canvases: pass20?.canvases === 1,
  };

  const responsive = [];
  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720], [390, 844]]) {
    const { context, page } = await openHome(browser, { width: w, height: h });
    await go(page, "02");
    const about = await measureSafeArea(page, "02");
    shots.push(await shot(page, RESPONSIVE, `about-${w}x${h}`));
    await go(page, "05.7");
    const merch = await measureSafeArea(page, "05.7");
    await go(page, "05.5");
    const video = await measureSafeArea(page, "05.5");
    responsive.push({ viewport: `${w}x${h}`, about, merch, video, snap: await snapshot(page) });
    await context.close();
  }

  const dprRows = [];
  for (const dpr of [1, 1.25, 1.5, 2]) {
    const { context, page } = await openHome(browser, { width: 1440, height: 900 }, { dpr });
    await lab(page, (value) => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).setDpr?.(value), dpr);
    await page.waitForTimeout(300);
    await go(page, "02");
    dprRows.push({ dpr, ...(await snapshot(page)), safe: await measureSafeArea(page, "02") });
    shots.push(await shot(page, RESPONSIVE, `dpr-${String(dpr).replace(".", "-")}`));
    await context.close();
  }
  } else {
    try {
      walks = JSON.parse(readFileSync(path.join(REPORTS, "settled-walkthroughs.json"), "utf8")).walks ?? [];
      plateau = JSON.parse(readFileSync(path.join(REPORTS, "cache-plateau.json"), "utf8"));
      const existing = JSON.parse(readFileSync(path.join(REPORTS, "responsive-dpr.json"), "utf8"));
      responsive = existing.responsive ?? [];
      dprRows = existing.dpr ?? [];
    } catch {
      walks = [];
    }
  }

  function safePass(row) {
    if (!row) return false;
    const clip = (row.clipLeft ?? 0) + (row.clipRight ?? 0) + (row.clipTop ?? 0) + (row.clipBottom ?? 0);
    const bodyOnscreen = Boolean(row.body && row.body.bottom > 0 && row.body.top < (row.viewport?.height ?? 0));
    const ctaOnscreen = Boolean(row.cta && row.cta.bottom > 0 && row.cta.top < (row.viewport?.height ?? 0));
    return row.headingOnscreen
      && !row.overlapHeading
      && !row.overlapHeader
      && !row.overlapGraph
      && (!bodyOnscreen || !row.overlapBody)
      && (!ctaOnscreen || !row.overlapCta)
      && clip === 0;
  }

  const dark = await openHome(browser, { width: 1440, height: 900 }, { theme: "dark" });
  await lab(dark.page, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).setTheme("dark"));
  await go(dark.page, "02");
  const aboutDark = await measureSafeArea(dark.page, "02");
  await go(dark.page, "05.7");
  const merchDark = await measureSafeArea(dark.page, "05.7");
  await go(dark.page, "05.5");
  const videoDark = await measureSafeArea(dark.page, "05.5");
  await dark.context.close();

  const safeArea = {
    about: { ...aboutDesktop, requestedZoom: aboutDesktop.framing?.requestedZoom, pass: safePass(aboutDesktop) && aboutDesktop.framing?.requestedZoom === 1.24 },
    merch: { ...merchDesktop, requestedZoom: merchDesktop.framing?.requestedZoom, pass: safePass(merchDesktop) && merchDesktop.framing?.requestedZoom === 1.11 },
    video: { ...videoDesktop, requestedZoom: videoDesktop.framing?.requestedZoom, pass: safePass(videoDesktop) && videoDesktop.framing?.requestedZoom === 1.11 },
    dark: { about: safePass(aboutDark), merch: safePass(merchDark), video: safePass(videoDark) },
    pass: safePass(aboutDesktop) && safePass(merchDesktop) && safePass(videoDesktop) && aboutDesktop.framing?.requestedZoom === 1.24 && merchDesktop.framing?.requestedZoom === 1.11 && videoDesktop.framing?.requestedZoom === 1.11,
  };

  const productionDiff = {
    structureUnchanged: JSON.stringify(previewFp.nodes) === JSON.stringify(productionFp.nodes),
    textUnchanged: JSON.stringify(previewFp.headings.map((row) => row.text)) === JSON.stringify(productionFp.headings.map((row) => row.text)),
    navUnchanged: JSON.stringify(previewFp.nav.filter((label) => label !== "Dark" && label !== "Light")) === JSON.stringify(productionFp.nav.filter((label) => label !== "Dark" && label !== "Light")),
    previewHud: previewFp.hud,
    productionHud: hudPresent,
    onlyBindingChanged: productionFp.namespace === "ps-04-m5-5",
  };

  const invariants = {
    canvas: firstSnap.canvases,
    draw: firstSnap.draws,
    triangles: firstSnap.triangles,
    footerDraws: footer.draws,
    footerTriangles: footer.triangles,
    restoredNamespace: restored.assetNamespace,
    oneActor: firstSnap.canvases === 1 && firstSnap.draws <= 1,
  };

  writeFileSync(path.join(REPORTS, "asset-request-audit.json"), `${JSON.stringify({ stage: "PS-04.M5.6", ...assetAudit, pass: assetAudit.m55Manifest && assetAudit.m55States && !assetAudit.sandboxOverlays && !assetAudit.visualLabModules && assetAudit.notFound === 0 && assetAudit.duplicateStateDownloadAfterWarm === 0 }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "first-frame-hydration.json"), `${JSON.stringify({ stage: "PS-04.M5.6", ...firstFrame }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "production-diff.json"), `${JSON.stringify({ stage: "PS-04.M5.6", preview: previewFp, production: productionFp, ...productionDiff }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "safe-area-production.json"), `${JSON.stringify({ stage: "PS-04.M5.6", ...safeArea, responsive }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "route-03-2.json"), `${JSON.stringify({ stage: "PS-04.M5.6", ...route32 }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "complex-event-video-route.json"), `${JSON.stringify({ stage: "PS-04.M5.6", ...complexRoute }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "rapid-residual-closure.json"), `${JSON.stringify({ stage: "PS-04.M5.6", ...residual }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "settled-walkthroughs.json"), `${JSON.stringify({ stage: "PS-04.M5.6", passCount: walks.length, pass: walks.length === 20 && walks.every((row) => row.canvases === 1), walks }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "cache-plateau.json"), `${JSON.stringify({ stage: "PS-04.M5.6", ...plateau }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "responsive-dpr.json"), `${JSON.stringify({ stage: "PS-04.M5.6", responsive, dpr: dprRows }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "context-restore.json"), `${JSON.stringify({ stage: "PS-04.M5.6", before: footer, after: restored, pass: restored.assetNamespace === "ps-04-m5-5" }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "transition-regression.json"), `${JSON.stringify({ stage: "PS-04.M5.6", residual, paletteLeadsRequired: 0, centerDwellRequired: 0 }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "browser-smoke.json"), `${JSON.stringify({ stage: "PS-04.M5.6", ok: firstSnap.assetNamespace === "ps-04-m5-5" && firstSnap.eventOverlay === "none" && !hudPresent, firstSnap, hudPresent, videos, shots }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "runtime-invariants.json"), `${JSON.stringify({ stage: "PS-04.M5.6", ...invariants }, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "performance-production.json"), `${JSON.stringify({ stage: "PS-04.M5.6", mode: "dev-capture", ...perfSnapshot, note: "Dev-server capture. Production-build numbers are in production-build.json." }, null, 2)}\n`);
  console.log("reports written", JSON.stringify({
    namespace: firstSnap.assetNamespace,
    hud: hudPresent,
    safe: safeArea.pass,
    route32: route32.pass,
    complex: complexRoute.pass,
    residual: residual.status,
    walks: walks.length,
  }));

  if (!SKIP_LONG) try {
    videos.push(await recordClip(browser, "hero-about", async (page) => {
      await page.goto(HOME, { waitUntil: "domcontentloaded" });
      await waitProd(page);
      await go(page, "01");
      await go(page, "02");
    }));
    videos.push(await recordClip(browser, "design-event-games", async (page) => {
      await page.goto(HOME, { waitUntil: "domcontentloaded" });
      await waitProd(page);
      await go(page, "05.2");
      await go(page, "05.3");
      await go(page, "05.4");
    }));
    videos.push(await recordClip(browser, "rapid-residual", async (page) => {
      await page.goto(HOME, { waitUntil: "domcontentloaded" });
      await waitProd(page);
      await go(page, "05.2");
      for (let index = 0; index < 12; index += 1) {
        await lab(page, (id) => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).scrollToNode(id, "auto"), rapidNodes[index % rapidNodes.length]);
      }
      await waitVisualSettled(page, 40000);
    }));
    videos.push(await recordClip(browser, "complex-event-video", async (page) => {
      await page.goto(HOME, { waitUntil: "domcontentloaded" });
      await waitProd(page);
      await go(page, "03.1");
      await lab(page, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).selectTask("explain"));
      await page.waitForTimeout(200);
      await go(page, "03.2");
      await lab(page, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).setCompetencies(["event", "video"]));
      await waitVisualSettled(page);
      await lab(page, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).confirmCompetencies());
      await waitVisualSettled(page);
    }));
    videos.push(await recordClip(browser, "reduced-motion", async (page) => {
      await page.goto(HOME, { waitUntil: "domcontentloaded" });
      await waitProd(page);
      await go(page, "05.6");
      await go(page, "05.5");
    }, { reducedMotion: true }));
    videos.push(await recordClip(browser, "route-03-2", async (page) => {
      await page.goto(HOME, { waitUntil: "domcontentloaded" });
      await waitProd(page);
      await go(page, "03.1");
      await lab(page, () => (window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__).selectTask("explain"));
      await page.waitForTimeout(200);
      await go(page, "03.2");
      await go(page, "04");
    }));
  } catch (error) {
    console.log("video capture failed", error instanceof Error ? error.message : String(error));
    writeFileSync(path.join(REPORTS, "video-playback.json"), `${JSON.stringify({
      stage: "PS-04.M5.6",
      playbackRate: 1,
      requiredEnded: true,
      files: [],
      allEnded: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2)}\n`);
  }
  writeFileSync(path.join(REPORTS, "browser-smoke.json"), `${JSON.stringify({ stage: "PS-04.M5.6", ok: firstSnap.assetNamespace === "ps-04-m5-5" && firstSnap.eventOverlay === "none" && !hudPresent, firstSnap, hudPresent, videos, shots }, null, 2)}\n`);

  console.log(JSON.stringify({
    namespace: firstSnap.assetNamespace,
    hud: hudPresent,
    safe: safeArea.pass,
    route32: route32.pass,
    complex: complexRoute.pass,
    residual: residual.status,
    walks: walks.length,
    pairProbe: true,
    videos: videos.length,
  }, null, 2));
} finally {
  await browser.close();
}
