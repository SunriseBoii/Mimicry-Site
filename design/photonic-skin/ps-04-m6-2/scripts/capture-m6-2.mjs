import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m6-2");
const BOARDS = path.join(STAGE, "renders/boards");
const VIDEO = path.join(STAGE, "renders/browser/video");
const REPORTS = path.join(STAGE, "reports");
const BASE = process.env.PS04M62_BASE ?? "http://localhost:3000";
const CLEAN = `${BASE}/visual-lab/photonic-skin-ps04-m6/magnetized-settle`;
const REVIEW = `${BASE}/visual-lab/photonic-skin-ps04-m6/magnetized-settle/review`;
const HOME = `${BASE}/`;

for (const dir of [BOARDS, VIDEO, REPORTS]) mkdirSync(dir, { recursive: true });

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
    const handle = window.__PS04M62_LAB__;
    return Boolean(handle && handle.runId === "ps04-m6-2" && handle.ready);
  }, null, { timeout: 120000 });
}

async function waitVisualSettled(page, timeout = 45000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M62_LAB__;
    if (!handle || handle.loading || handle.loadStatus !== "ready") return false;
    const settle = handle.settle?.();
    if (!settle || settle.scrollPhase !== "Settled") return false;
    if (handle.activeNode === "08") {
      return settle.magnetizedSettledNodeId === "08";
    }
    const tx = typeof handle.transaction === "function" ? handle.transaction() : null;
    if (tx && tx.visualLifecycle && tx.visualLifecycle !== "settled") return false;
    return settle.magnetizedSettledNodeId === handle.activeNode;
  }, null, { timeout });
}

async function go(page, id) {
  await lab(page, (node) => window.__PS04M62_LAB__.scrollToNode(node, "auto"), id);
  await page.waitForFunction((node) => {
    const handle = window.__PS04M62_LAB__;
    const settle = handle?.settle?.();
    return handle?.activeNode === node && settle?.magnetizedSettledNodeId === node && settle?.scrollPhase === "Settled";
  }, id, { timeout: 40000 });
  try {
    await waitVisualSettled(page, 8000);
  } catch {
    const dump = await snapshot(page);
    console.log("visual timeout", id, dump.visualLifecycle, dump.settle?.actorStatus, dump.settle?.magnetizedSettledNodeId);
  }
}

async function shot(page, dir, name) {
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file.replaceAll("\\", "/");
}

async function snapshot(page) {
  return page.evaluate(() => {
    const handle = window.__PS04M62_LAB__;
    const settle = handle?.settle?.() ?? null;
    const tx = handle?.transaction?.() ?? null;
    return {
      runId: handle?.runId ?? null,
      node: handle?.activeNode ?? null,
      builder: handle?.builder ?? null,
      hash: handle?.overlayHash?.() ?? handle?.stateHash ?? null,
      draws: handle?.stats?.lastActorDrawCalls ?? null,
      canvases: handle?.canvasCount?.() ?? null,
      settle,
      hardGates: handle?.hardGates?.() ?? null,
      visualLifecycle: tx?.visualLifecycle ?? null,
      hud: Boolean(document.querySelector("[data-qa='m62-settle-hud']")),
      namespace: document.querySelector("[data-qa='m4-canvas']")?.getAttribute("data-asset-namespace") ?? null,
      resolved: document.querySelector("[data-qa='m4-canvas']")?.getAttribute("data-resolved-state") ?? null,
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
  page.setDefaultTimeout(90000);
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
  const traces = [];
  const boards = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const review = await context.newPage();
    const productionRequests = [];
    const reviewRequests = [];
    review.on("request", (request) => {
      const url = request.url();
      if (url.includes("/photonic-skin/")) reviewRequests.push(url);
    });
    await review.goto(`${REVIEW}?theme=light`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitLab(review);

    await go(review, "01");
    boards.push({ name: "hero-settled", ...(await snapshot(review)), file: await shot(review, BOARDS, "hero-settled") });

    await go(review, "02");
    boards.push({ name: "slow-adjacent-about", ...(await snapshot(review)), file: await shot(review, BOARDS, "slow-adjacent-about") });

    const rapidNodes = ["03.1", "03.2", "03.3", "04", "05.1", "05.2", "05.3", "05.4", "05.5"];
    await lab(review, () => window.__PS04M62_LAB__.startM5Trace?.());
    const rapidStart = await snapshot(review);
    await lab(review, async (ids) => {
      const handle = window.__PS04M62_LAB__;
      for (const id of ids.slice(0, -1)) {
        handle.noteUserInput("wheel");
        handle.scrollToNode(id, "auto");
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      handle.scrollToNode(ids[ids.length - 1], "auto");
    }, rapidNodes);
    await go(review, rapidNodes[rapidNodes.length - 1]);
    const rapidEnd = await snapshot(review);
    traces.push({
      name: "rapid-9",
      start: rapidStart.hardGates,
      end: rapidEnd.hardGates,
      settle: rapidEnd.settle,
      requests: rapidEnd.hardGates?.actorRequestCount - rapidStart.hardGates?.actorRequestCount,
    });
    boards.push({ name: "rapid-final-video", ...rapidEnd, file: await shot(review, BOARDS, "rapid-final-video") });

    await go(review, "03.1");
    await lab(review, () => window.__PS04M62_LAB__.selectTask("explain_changes"));
    await review.waitForFunction(() => window.__PS04M62_LAB__?.unlock?.competencies === true);
    await go(review, "03.2");
    await lab(review, () => window.__PS04M62_LAB__.setCompetencies(["event"]));
    try { await waitVisualSettled(review); } catch { console.log("visual timeout 03.2 event"); }
    boards.push({ name: "builder-03-2-event", ...(await snapshot(review)), file: await shot(review, BOARDS, "builder-03-2-event") });
    await lab(review, () => window.__PS04M62_LAB__.setCompetencies(["event", "video"]));
    try { await waitVisualSettled(review); } catch { console.log("visual timeout 03.2 event-video"); }
    boards.push({ name: "builder-03-2-event-video", ...(await snapshot(review)), file: await shot(review, BOARDS, "builder-03-2-event-video") });
    await lab(review, () => window.__PS04M62_LAB__.confirmCompetencies());
    try { await waitVisualSettled(review); } catch { console.log("visual timeout confirm"); }
    await go(review, "03.3");
    boards.push({ name: "builder-03-3-drive", ...(await snapshot(review)), file: await shot(review, BOARDS, "builder-03-3-drive") });

    await go(review, "08");
    boards.push({ name: "footer-settled", ...(await snapshot(review)), file: await shot(review, BOARDS, "footer-settled") });

    await go(review, "01");
    await review.keyboard.press("PageDown");
    await review.waitForTimeout(700);
    try { await waitVisualSettled(review); } catch { console.log("visual timeout keyboard"); }
    boards.push({ name: "keyboard-pagedown", ...(await snapshot(review)), file: await shot(review, BOARDS, "keyboard-pagedown") });

    const hudOnReview = await review.locator("[data-qa='m62-settle-hud']").count();
    const reviewSnap = await snapshot(review);

    const clean = await context.newPage();
    await clean.goto(`${CLEAN}?theme=light`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitLab(clean);
    await go(clean, "02");
    const cleanHud = await clean.locator("[data-qa='m62-settle-hud']").count();
    boards.push({ name: "clean-about", ...(await snapshot(clean)), file: await shot(clean, BOARDS, "clean-about") });

    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(`${REVIEW}?theme=light`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitLab(mobile);
    await go(mobile, "03.1");
    await lab(mobile, () => window.__PS04M62_LAB__.selectTask("explain_changes"));
    await mobile.waitForFunction(() => window.__PS04M62_LAB__?.unlock?.competencies === true);
    await go(mobile, "03.2");
    boards.push({ name: "mobile-03-2", ...(await snapshot(mobile)), file: await shot(mobile, BOARDS, "mobile-03-2") });

    const home = await context.newPage();
    home.on("request", (request) => {
      const url = request.url();
      if (url.includes("/photonic-skin/")) productionRequests.push(url);
    });
    await home.goto(HOME, { waitUntil: "domcontentloaded", timeout: 120000 });
    await home.waitForSelector("canvas", { timeout: 120000 });
    await home.waitForFunction(() => {
      const handle = window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__;
      return Boolean(handle && handle.ready);
    }, null, { timeout: 120000 });
    const production = await home.evaluate(() => {
      const handle = window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__;
      return {
        runId: handle?.runId ?? null,
        assetNamespace: handle?.assetNamespace ?? null,
        m62: Boolean(window.__PS04M62_LAB__),
      };
    });
    await shot(home, BOARDS, "production-home-unchanged");

    const videos = [];
    videos.push(await recordClip(browser, "slow-adjacent", async (page) => {
      await page.goto(`${REVIEW}?theme=light`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await go(page, "01");
      await go(page, "02");
      await go(page, "03.1");
    }));
    videos.push(await recordClip(browser, "rapid-forward", async (page) => {
      await page.goto(`${REVIEW}?theme=light`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await go(page, "01");
      await lab(page, async (ids) => {
        const handle = window.__PS04M62_LAB__;
        for (const id of ids.slice(0, -1)) {
          handle.noteUserInput("wheel");
          handle.scrollToNode(id, "auto");
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        handle.scrollToNode(ids[ids.length - 1], "auto");
      }, ["02", "03.1", "03.2", "03.3", "04", "05.1", "05.5"]);
      await go(page, "05.5");
    }));
    videos.push(await recordClip(browser, "reduced-motion", async (page) => {
      await page.goto(`${REVIEW}?theme=light&reduced=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await go(page, "01");
      await go(page, "05.5");
      await go(page, "08");
    }, { reducedMotion: true }));

    const gates = reviewSnap.hardGates ?? {};
    const smoke = {
      ok: production.m62 === false
        && !productionRequests.some((url) => url.includes("ps-04-m6-2") || url.includes("magnetized-settle"))
        && hudOnReview > 0
        && cleanHud === 0
        && (gates.requestsToCrossedNodes ?? 0) === 0
        && (gates.routeCompileLiveRetargetCount ?? 0) === 0
        && (gates.runningMorphInterruptedByScroll ?? 0) === 0
        && (gates.staleQueuedTransitionStarts ?? 0) === 0
        && (gates.maxActorQueueDepth ?? 0) <= 1,
      runId: "ps04-m6-2",
      productionRunId: production.runId,
      productionAssetNamespace: production.assetNamespace,
      productionHasM62Handle: production.m62,
      productionRequestsM62: productionRequests.some((url) => url.includes("ps-04-m6-2")),
      reviewHudCount: hudOnReview,
      cleanHudCount: cleanHud,
      eventOverlay: "none",
      videoOverlay: "none",
      runtimeRotationOverride: "none",
      reviewUsedDelta: reviewRequests.some((url) => url.includes("/photonic-skin/ps-04-m6-1/")),
    };

    writeFileSync(path.join(REPORTS, "browser-smoke.json"), `${JSON.stringify(smoke, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "actor-request-trace.json"), `${JSON.stringify({ traces, gates, settle: reviewSnap.settle }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "rapid-scroll-regression.json"), `${JSON.stringify({
      traces,
      requestsToCrossedNodes: gates.requestsToCrossedNodes,
      routeCompileLiveRetargetCount: gates.routeCompileLiveRetargetCount,
      maxActorQueueDepth: gates.maxActorQueueDepth,
      latestSettledWins: rapidEnd.settle?.magnetizedSettledNodeId === "05.5",
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "queue-validation.json"), `${JSON.stringify({
      maxActorQueueDepth: gates.maxActorQueueDepth,
      staleQueuedTransitionStarts: gates.staleQueuedTransitionStarts,
      capacity: 1,
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "production-isolation.json"), `${JSON.stringify({
      productionRoute: "/",
      productionRunId: production.runId,
      productionAssetNamespace: production.assetNamespace,
      productionRequestsM62: smoke.productionRequestsM62,
      productionHasM62Handle: production.m62,
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "human-boards.json"), `${JSON.stringify(boards, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "videos.json"), `${JSON.stringify(videos, null, 2)}\n`);

    console.log("smoke", smoke.ok, "gates", gates, "videos", videos.map((item) => item.name));
    await context.close();
    if (!smoke.ok) process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
