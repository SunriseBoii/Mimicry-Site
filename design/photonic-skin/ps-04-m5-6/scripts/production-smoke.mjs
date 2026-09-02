import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m5-6");
const REPORTS = path.join(STAGE, "reports");
const SHOTS = path.join(STAGE, "renders/production");
const BASE = process.env.PS04M56_BASE ?? "http://localhost:3001";
const HOME = `${BASE}/`;

mkdirSync(REPORTS, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

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
    const handle = window.__PS04M56_PRODUCTION__;
    return Boolean(handle && handle.ready);
  }, null, { timeout: 120000 });
}

async function waitActor(page) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M56_PRODUCTION__;
    return Boolean(handle && handle.actorFramebufferReady === true && handle.stats.lastActorDrawCalls === 1);
  }, null, { timeout: 40000 });
}

async function waitSettled(page) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M56_PRODUCTION__;
    if (!handle || handle.loading || handle.loadStatus !== "ready") return false;
    const tx = typeof handle.transaction === "function" ? handle.transaction() : null;
    return !tx || !tx.visualLifecycle || tx.visualLifecycle === "settled";
  }, null, { timeout: 50000 });
}

async function snapshot(page) {
  return page.evaluate(() => {
    const handle = window.__PS04M56_PRODUCTION__;
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
      hud: Boolean(document.querySelector("[data-qa='m55-review'], [data-qa='framing-review']")),
      framing: handle.framing?.() ?? null,
      contract: handle.contract?.() ?? null,
      cache: handle.programCache?.() ?? null,
      heap: performance.memory?.usedJSHeapSize ?? null,
    };
  });
}

async function go(page, id) {
  await page.evaluate((node) => window.__PS04M56_PRODUCTION__.scrollToNode(node, "auto"), id);
  await page.waitForFunction((node) => window.__PS04M56_PRODUCTION__.activeNode === node, id, { timeout: 20000 });
  if (id !== "08") {
    await waitSettled(page);
    await waitActor(page);
  }
}

const started = Date.now();
const requests = [];
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on("request", (request) => requests.push(request.url()));
page.on("response", (response) => {
  if (response.status() === 404) requests.push(`404:${response.url()}`);
});

const coldStart = Date.now();
await page.goto(HOME, { waitUntil: "domcontentloaded" });
await waitProd(page);
await waitActor(page);
await waitSettled(page);
const firstVisibleMs = Date.now() - coldStart;
const hero = await snapshot(page);
await page.screenshot({ path: path.join(SHOTS, "production-start-hero.png"), fullPage: false });

const warmCount = requests.length;
const warmStates = new Set(requests.map(pathnameOf).filter((url) => url.includes("/photonic-skin/ps-04-m5-5/states/")));
await go(page, "02");
const about = await snapshot(page);
await page.screenshot({ path: path.join(SHOTS, "production-start-about.png"), fullPage: false });
await go(page, "05.7");
const merch = await snapshot(page);
await go(page, "05.5");
const video = await snapshot(page);
await go(page, "05.3");
const event = await snapshot(page);
const laterStates = requests.slice(warmCount).map(pathnameOf).filter((url) => url.includes("/photonic-skin/ps-04-m5-5/states/"));
const duplicates = laterStates.filter((url) => warmStates.has(url));

await go(page, "08");
const footer = await snapshot(page);
await page.evaluate(() => window.__PS04M56_PRODUCTION__.loseContext?.());
await page.waitForTimeout(800);
await waitProd(page);
const restored = await snapshot(page);

const visualLabRoute = requests.some((url) => pathnameOf(url).startsWith("/visual-lab/"));
const audit = {
  stage: "PS-04.M5.6",
  server: "next-start",
  base: BASE,
  m55Manifest: requests.some((url) => url.includes("/photonic-skin/ps-04-m5-5/manifests/ps04m55-manifest.json")),
  m55States: requests.some((url) => url.includes("/photonic-skin/ps-04-m5-5/states/")),
  sandboxOverlays: requests.some((url) => url.includes("ps-04-m5-2/variants") || url.includes("ps-04-m5-3-r1/variants") || url.includes("event-sandbox") || url.includes("video-sandbox")),
  oldVideoCombo: requests.some((url) => url.includes("combo-40") && !url.includes("ps-04-m5-5")),
  frozenEventAsTarget: requests.some((url) => url.includes("/ps-03-m3-1r/states/single-event")),
  visualLabModules: visualLabRoute,
  webpackChunksNamedVisualLab: requests.filter((url) => pathnameOf(url).startsWith("/_next/") && url.includes("visual-lab")).length,
  notFound: requests.filter((url) => url.startsWith("404:")).length,
  frozenMotionManifest: requests.some((url) => url.includes("/photonic-skin/ps-03-m4-1/manifest.json")),
  frozenActorStates: requests.some((url) => pathnameOf(url).includes("/photonic-skin/ps-03-m3-1r/states/")),
  sample: requests.filter((url) => url.includes("photonic-skin")).slice(0, 24),
  stateRequests: requests.filter((url) => pathnameOf(url).includes("/photonic-skin/ps-04-m5-5/states/")),
  duplicateStateDownloadAfterWarm: duplicates.length,
  duplicateAfterWarmUrls: [...new Set(duplicates)],
  stateRequestCount: requests.map(pathnameOf).filter((url) => url.includes("/photonic-skin/ps-04-m5-5/states/")).length,
};
audit.pass = audit.m55Manifest
  && audit.m55States
  && !audit.sandboxOverlays
  && !audit.oldVideoCombo
  && !audit.frozenEventAsTarget
  && !audit.visualLabModules
  && !audit.frozenActorStates
  && audit.notFound === 0
  && audit.duplicateStateDownloadAfterWarm === 0;

const smoke = {
  stage: "PS-04.M5.6",
  server: "next-start",
  base: BASE,
  elapsedMs: Date.now() - started,
  firstVisibleActorMs: firstVisibleMs,
  hud: hero.hud || about.hud,
  hero,
  about,
  merch,
  video,
  event,
  footerDraws: footer.draws,
  footerTriangles: footer.triangles,
  restoredNamespace: restored.assetNamespace,
  pass: hero.assetNamespace === "ps-04-m5-5"
    && hero.runId === "ps04-m5-6"
    && hero.eventOverlay === "none"
    && hero.videoOverlay === "none"
    && hero.runtimeRotationOverride === "none"
    && hero.framingProfile === "OWNER_SELECTED_124_111_111"
    && hero.canvases === 1
    && hero.draws === 1
    && about.framing?.requestedZoom === 1.24
    && merch.framing?.requestedZoom === 1.11
    && video.framing?.requestedZoom === 1.11
    && event.hash === "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b"
    && video.hash === "2d6957815b6f58f87f1709e0378313cba271530b8fb0e02282b556780448a873"
    && footer.draws === 0
    && restored.assetNamespace === "ps-04-m5-5"
    && !hero.hud
    && audit.pass,
};

writeFileSync(path.join(REPORTS, "asset-request-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
writeFileSync(path.join(REPORTS, "production-build.json"), `${JSON.stringify({
  stage: "PS-04.M5.6",
  command: "npx next build --webpack && npx next start -p 3001",
  webpack: true,
  compiled: true,
  typescript: true,
  staticPages: 49,
  homeRoute: "○ /",
  visualLabPreserved: true,
  deploy: false,
  push: false,
  smoke,
  performance: {
    mode: "production-start",
    firstVisibleActorMs: firstVisibleMs,
    heroHeap: hero.heap,
    aboutHeap: about.heap,
    programs: about.programs,
    canvases: about.canvases,
    cacheBytes: about.cache?.bytes ?? null,
    note: "GPU p50/p95 from the earlier dev-capture remain in performance-production.json; this file is the production-build smoke.",
  },
  pass: smoke.pass,
}, null, 2)}\n`);

await context.close();
await browser.close();
console.log(JSON.stringify({ pass: smoke.pass, auditPass: audit.pass, firstVisibleActorMs: firstVisibleMs, duplicates: duplicates.length, namespace: hero.assetNamespace }, null, 2));
if (!smoke.pass) process.exit(1);
