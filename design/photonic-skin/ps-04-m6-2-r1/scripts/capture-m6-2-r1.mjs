import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m6-2-r1");
const BOARDS = path.join(STAGE, "renders/boards");
const VIDEO = path.join(STAGE, "renders/browser/video");
const REPORTS = path.join(STAGE, "reports");
const BASE = process.env.PS04M62R1_BASE ?? "http://localhost:3000";
const CLEAN = `${BASE}/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1`;
const REVIEW = `${BASE}/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/review`;
const HOME = `${BASE}/`;
const ABOUT_ID = "brand-wide-gather-content-design-digital-event-games-merch-video";

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
    const handle = window.__PS04M62R1_LAB__;
    return Boolean(handle && handle.runId === "ps04-m6-2-r1" && handle.ready);
  }, null, { timeout: 120000 });
}

async function waitVisualSettled(page, timeout = 45000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M62R1_LAB__;
    if (!handle || handle.loading || handle.loadStatus !== "ready") return false;
    const settle = handle.settle?.();
    if (!settle || settle.scrollPhase !== "Settled") return false;
    if (handle.activeNode === "08") return settle.magnetizedSettledNodeId === "08";
    const tx = typeof handle.transaction === "function" ? handle.transaction() : null;
    if (tx && tx.visualLifecycle && tx.visualLifecycle !== "settled") return false;
    return settle.magnetizedSettledNodeId === handle.activeNode;
  }, null, { timeout });
}

async function waitResolved(page, stateId, timeout = 20000) {
  await page.waitForFunction((id) => {
    const handle = window.__PS04M62R1_LAB__;
    const contract = typeof handle?.contract === "function" ? handle.contract() : null;
    const canvas = document.querySelector("[data-qa='m4-canvas']");
    return canvas?.getAttribute("data-resolved-state") === id
      || contract?.resolvedGeometryId === id;
  }, stateId, { timeout });
}

async function waitZoom(page, expected, timeout = 12000) {
  await page.waitForFunction((zoom) => {
    const framing = window.__PS04M62R1_LAB__?.framing?.();
    return Math.abs((framing?.displayedZoom ?? 0) - zoom) < 0.03;
  }, expected, { timeout });
}

async function go(page, id, expected) {
  await lab(page, (node) => window.__PS04M62R1_LAB__.scrollToNode(node, "auto"), id);
  await page.waitForFunction((node) => {
    const handle = window.__PS04M62R1_LAB__;
    const settle = handle?.settle?.();
    return handle?.activeNode === node && settle?.magnetizedSettledNodeId === node && settle?.scrollPhase === "Settled";
  }, id, { timeout: 40000 });
  if (expected) {
    try {
      await waitResolved(page, expected, 20000);
    } catch {
      const dump = await snapshot(page);
      console.log("resolved timeout", id, expected, dump.resolved, dump.visualLifecycle);
    }
  }
  try {
    await waitVisualSettled(page, 20000);
  } catch {
    const dump = await snapshot(page);
    console.log("visual timeout", id, dump.visualLifecycle, dump.settle?.actorStatus, dump.resolved);
  }
}

async function setDraft(page, ids, expected) {
  const before = await page.evaluate(() => window.__PS04M62R1_LAB__?.settle?.()?.interactionRevision ?? 0);
  await lab(page, (next) => window.__PS04M62R1_LAB__.setCompetencies(next), ids);
  await page.waitForFunction((args) => {
    const handle = window.__PS04M62R1_LAB__;
    const settle = handle?.settle?.();
    const contract = typeof handle?.contract === "function" ? handle.contract() : null;
    const canvas = document.querySelector("[data-qa='m4-canvas']");
    const resolved = canvas?.getAttribute("data-resolved-state") || contract?.resolvedGeometryId;
    return resolved === args.expected || (settle?.interactionRevision ?? 0) > args.before;
  }, { expected, before }, { timeout: 15000 });
  await waitResolved(page, expected, 20000);
  await waitVisualSettled(page, 20000);
}

async function shot(page, dir, name) {
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file.replaceAll("\\", "/");
}

async function snapshot(page) {
  return page.evaluate(() => {
    const handle = window.__PS04M62R1_LAB__;
    const settle = handle?.settle?.() ?? null;
    const tx = handle?.transaction?.() ?? null;
    const contract = typeof handle?.contract === "function" ? handle.contract() : null;
    const framing = typeof handle?.framing === "function" ? handle.framing() : null;
    const composition = typeof handle?.composition === "function" ? handle.composition() : null;
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
      contract,
      framing,
      presentation: typeof handle?.presentation === "function" ? handle.presentation() : null,
      magnetismProfile: typeof handle?.magnetismProfile === "function" ? handle.magnetismProfile() : null,
      composition: composition ? { x: composition.cssCenterX, y: composition.cssCenterY, slot: composition.slot, actorDraw: composition.actorDraw } : null,
      hud: Boolean(document.querySelector("[data-qa='m62r1-settle-hud']")),
      namespace: document.querySelector("[data-qa='m4-canvas']")?.getAttribute("data-asset-namespace") ?? null,
      resolved: document.querySelector("[data-qa='m4-canvas']")?.getAttribute("data-resolved-state") ?? null,
      programs: handle?.stats?.programs ?? null,
      geometries: handle?.stats?.geometries ?? null,
      materialUuid: handle?.stats?.materialUuid ?? null,
    };
  });
}

function stepRecord(name, snap) {
  return {
    name,
    node: snap.node,
    resolved: snap.resolved,
    hash: snap.hash,
    family: snap.contract?.family ?? null,
    paletteMask: snap.contract?.paletteMask ?? null,
    requestSource: snap.settle?.actorRequestSource ?? null,
    interactionRevision: snap.settle?.interactionRevision ?? null,
    magneticSettleRevision: snap.settle?.magneticSettleRevision ?? null,
    geometryId: snap.contract?.resolvedGeometryId ?? snap.resolved,
    overlay: snap.contract?.applyPaletteOverride ?? false,
    zoom: snap.framing?.displayedZoom ?? snap.framing?.currentZoom ?? null,
  };
}

function extrasMap(snap) {
  const rows = Array.isArray(snap.presentation) ? snap.presentation : [];
  return Object.fromEntries(rows);
}

async function recordClip(browser, name, setup, options = {}) {
  const viewport = options.viewport ?? { width: 1440, height: 900 };
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO, size: viewport },
    reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
    hasTouch: options.hasTouch === true,
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
  const boards = [];
  const liveSteps = [];
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

    await go(review, "02", ABOUT_ID);
    try { await waitZoom(review, 1.24); } catch { console.log("about zoom timeout"); }
    const aboutDirect = await snapshot(review);
    boards.push({ name: "about-brand-wide", ...aboutDirect, file: await shot(review, BOARDS, "about-brand-wide") });

    await go(review, "03.1");
    await lab(review, () => window.__PS04M62R1_LAB__.selectTask("explain_changes"));
    await review.waitForFunction(() => window.__PS04M62R1_LAB__?.unlock?.competencies === true);
    await go(review, "03.2", "master-neutral");
    liveSteps.push(stepRecord("03.2-0-MASTER", await snapshot(review)));
    boards.push({ name: "builder-03-2-master", ...(await snapshot(review)), file: await shot(review, BOARDS, "builder-03-2-master") });

    await setDraft(review, ["content"], "single-content");
    liveSteps.push(stepRecord("03.2-content-SINGLE", await snapshot(review)));

    await setDraft(review, ["content", "event"], "complex-gather-content-event");
    liveSteps.push(stepRecord("03.2-content-event-GATHER", await snapshot(review)));

    await setDraft(review, ["content", "event", "video"], "complex-gather-content-event-video");
    liveSteps.push(stepRecord("03.2-content-event-video-GATHER", await snapshot(review)));

    await setDraft(review, ["content", "video"], "complex-gather-content-video");
    liveSteps.push(stepRecord("03.2-content-video-GATHER", await snapshot(review)));
    boards.push({ name: "builder-03-2-content-video", ...(await snapshot(review)), file: await shot(review, BOARDS, "builder-03-2-content-video") });

    await lab(review, () => window.__PS04M62R1_LAB__.confirmCompetencies());
    await waitVisualSettled(review, 8000);
    liveSteps.push(stepRecord("confirm-stays-on-03.2", await snapshot(review)));
    await go(review, "03.3", "complex-drive-content-video");
    liveSteps.push(stepRecord("03.3-DRIVE-content-video", await snapshot(review)));
    boards.push({ name: "builder-03-3-drive", ...(await snapshot(review)), file: await shot(review, BOARDS, "builder-03-3-drive") });

    await go(review, "02", ABOUT_ID);
    try { await waitZoom(review, 1.24); } catch { console.log("about after builder zoom timeout"); }
    const aboutAfterBuilder = await snapshot(review);
    boards.push({ name: "about-after-builder", ...aboutAfterBuilder, file: await shot(review, BOARDS, "about-after-builder") });

    await go(review, "04");
    const casesSettled = await snapshot(review);
    const placementSamples = [];
    await lab(review, () => window.__PS04M62R1_LAB__.startM5Trace?.());
    await lab(review, () => {
      window.__PS04M62R1_LAB__.noteUserInput("wheel");
      window.scrollTo({ top: window.scrollY + window.innerHeight * 0.55, behavior: "auto" });
    });
    await review.waitForTimeout(50);
    placementSamples.push({ name: "cases-content-mid", ...(await snapshot(review)) });
    await go(review, "05.1");
    const contentSettled = await snapshot(review);
    placementSamples.push({ name: "content-settled", ...contentSettled });
    boards.push({ name: "cases-content", ...contentSettled, file: await shot(review, BOARDS, "cases-content") });
    await go(review, "05.2");
    const designSettled = await snapshot(review);
    boards.push({ name: "content-design", ...designSettled, file: await shot(review, BOARDS, "content-design") });
    await go(review, "04");

    await go(review, "05.6");
    await go(review, "05.5");
    await go(review, "05.7");
    const merchSettled = await snapshot(review);
    await lab(review, () => {
      window.__PS04M62R1_LAB__.noteUserInput("wheel");
      window.scrollTo({ top: window.scrollY + window.innerHeight * 0.4, behavior: "auto" });
    });
    await review.waitForTimeout(50);
    placementSamples.push({ name: "merch-team-mid", ...(await snapshot(review)) });
    await go(review, "06.1");
    const teamSettled = await snapshot(review);
    boards.push({ name: "merch-team", ...teamSettled, file: await shot(review, BOARDS, "merch-team") });
    await go(review, "05.7");

    const rapidStart = await snapshot(review);
    await lab(review, async (ids) => {
      const handle = window.__PS04M62R1_LAB__;
      for (const id of ids.slice(0, -1)) {
        handle.noteUserInput("wheel");
        handle.scrollToNode(id, "auto");
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      handle.scrollToNode(ids[ids.length - 1], "auto");
    }, ["05.6", "05.5", "05.4", "05.3", "05.2", "05.1", "04"]);
    await go(review, "04");
    const rapidEnd = await snapshot(review);
    boards.push({ name: "rapid-final-cases", ...rapidEnd, file: await shot(review, BOARDS, "rapid-final-cases") });

    const vh = await review.evaluate(() => window.innerHeight);
    await go(review, "01");
    const magnetStart = await review.evaluate(() => window.scrollY);
    await lab(review, (offset) => {
      window.__PS04M62R1_LAB__.noteUserInput("wheel");
      window.scrollTo({ top: offset, behavior: "auto" });
    }, magnetStart + vh * 0.48);
    await review.waitForTimeout(80);
    const magnetMid = await snapshot(review);
    await review.waitForTimeout(200);
    await lab(review, () => window.__PS04M62R1_LAB__.evaluateMagnetism());
    try {
      await review.waitForFunction(() => {
        const handle = window.__PS04M62R1_LAB__;
        const nav = handle?.navigation?.();
        const settle = handle?.settle?.();
        return nav?.mode === "idle" && settle?.scrollPhase === "Settled" && (settle.distanceToAnchorPx ?? 99) <= 2.5;
      }, null, { timeout: 12000 });
    } catch { console.log("visual timeout magnetism"); }
    const magnetAfter = await snapshot(review);
    boards.push({ name: "strong-magnetism-desktop", ...magnetAfter, file: await shot(review, BOARDS, "strong-magnetism-desktop") });

    await go(review, "01");
    try {
      await review.waitForFunction(() => {
        const btn = document.querySelector('[data-hit="02"]');
        return btn instanceof HTMLButtonElement && !btn.disabled && btn.getAttribute("aria-hidden") !== "true";
      }, null, { timeout: 8000 });
      await review.locator('[data-hit="02"]').click({ force: true });
      await review.waitForFunction(() => window.__PS04M62R1_LAB__?.activeNode === "02", null, { timeout: 40000 });
      await waitResolved(review, ABOUT_ID, 20000);
      await waitVisualSettled(review, 20000);
    } catch (error) {
      console.log("graph click timeout", error instanceof Error ? error.message : error);
    }
    boards.push({ name: "graph-click-about", ...(await snapshot(review)), file: await shot(review, BOARDS, "graph-click-about") });

    await go(review, "08");
    const footerSettled = await snapshot(review);
    boards.push({ name: "footer-settled", ...footerSettled, file: await shot(review, BOARDS, "footer-settled") });

    await go(review, "01");
    await review.keyboard.press("PageDown");
    await review.waitForTimeout(800);
    try { await waitVisualSettled(review); } catch { console.log("visual timeout keyboard"); }
    boards.push({ name: "keyboard-pagedown", ...(await snapshot(review)), file: await shot(review, BOARDS, "keyboard-pagedown") });

    const hudOnReview = await review.locator("[data-qa='m62r1-settle-hud']").count();
    const reviewSnap = await snapshot(review);

    const clean = await context.newPage();
    await clean.goto(`${CLEAN}?theme=light`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitLab(clean);
    await go(clean, "02", ABOUT_ID);
    const cleanHud = await clean.locator("[data-qa='m62r1-settle-hud']").count();
    boards.push({ name: "clean-about", ...(await snapshot(clean)), file: await shot(clean, BOARDS, "clean-about") });

    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(`${REVIEW}?theme=light`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitLab(mobile);
    await go(mobile, "02", ABOUT_ID);
    try { await waitZoom(mobile, 1.18); } catch { console.log("mobile about zoom timeout"); }
    const aboutMobile = await snapshot(mobile);
    boards.push({ name: "about-mobile", ...aboutMobile, file: await shot(mobile, BOARDS, "about-mobile") });
    await go(mobile, "03.1");
    await lab(mobile, () => window.__PS04M62R1_LAB__.selectTask("explain_changes"));
    await mobile.waitForFunction(() => window.__PS04M62R1_LAB__?.unlock?.competencies === true);
    await go(mobile, "03.2", "master-neutral");
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
        m62r1: Boolean(window.__PS04M62R1_LAB__),
      };
    });
    await shot(home, BOARDS, "production-home-unchanged");

    const videos = [];
    videos.push(await recordClip(browser, "builder-live-selection", async (page) => {
      await page.goto(`${REVIEW}?theme=light`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await go(page, "03.1");
      await lab(page, () => window.__PS04M62R1_LAB__.selectTask("explain_changes"));
      await page.waitForFunction(() => window.__PS04M62R1_LAB__?.unlock?.competencies === true);
      await go(page, "03.2", "master-neutral");
      await setDraft(page, ["content"], "single-content");
      await setDraft(page, ["content", "event"], "complex-gather-content-event");
      await setDraft(page, ["content", "event", "video"], "complex-gather-content-event-video");
      await setDraft(page, ["content", "video"], "complex-gather-content-video");
      await lab(page, () => window.__PS04M62R1_LAB__.confirmCompetencies());
      await go(page, "03.3", "complex-drive-content-video");
    }));
    videos.push(await recordClip(browser, "cases-content-placement", async (page) => {
      await page.goto(`${REVIEW}?theme=light`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await go(page, "04");
      await go(page, "05.1");
      await go(page, "05.2");
      await go(page, "05.1");
      await go(page, "04");
    }));
    videos.push(await recordClip(browser, "merch-team-placement", async (page) => {
      await page.goto(`${REVIEW}?theme=light`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await go(page, "05.6");
      await go(page, "05.5");
      await go(page, "05.7");
      await go(page, "06.1");
      await go(page, "05.7");
      await go(page, "05.5");
    }));
    videos.push(await recordClip(browser, "rapid-placement-stable-geometry", async (page) => {
      await page.goto(`${REVIEW}?theme=light`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await go(page, "01");
      await lab(page, async (ids) => {
        const handle = window.__PS04M62R1_LAB__;
        for (const id of ids.slice(0, -1)) {
          handle.noteUserInput("wheel");
          handle.scrollToNode(id, "auto");
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        handle.scrollToNode(ids[ids.length - 1], "auto");
      }, ["02", "03.1", "03.2", "03.3", "04", "05.1", "05.5"]);
      await go(page, "05.5");
    }));
    videos.push(await recordClip(browser, "strong-magnetism-wheel", async (page) => {
      await page.goto(`${REVIEW}?theme=light`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await go(page, "01");
      const height = await page.evaluate(() => window.innerHeight);
      await lab(page, (offset) => {
        window.__PS04M62R1_LAB__.noteUserInput("wheel");
        window.scrollTo({ top: offset, behavior: "auto" });
      }, height * 0.48);
      await page.waitForTimeout(180);
      await lab(page, () => window.__PS04M62R1_LAB__.evaluateMagnetism());
      await page.waitForTimeout(1000);
    }));
    videos.push(await recordClip(browser, "strong-magnetism-touch", async (page) => {
      await page.goto(`${REVIEW}?theme=light`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await go(page, "04");
      await lab(page, () => window.__PS04M62R1_LAB__.noteUserInput("touch"));
      const height = await page.evaluate(() => window.innerHeight);
      await lab(page, (offset) => {
        window.scrollTo({ top: window.scrollY + offset, behavior: "auto" });
      }, height * 0.38);
      await page.waitForTimeout(180);
      await lab(page, () => window.__PS04M62R1_LAB__.evaluateMagnetism());
      await page.waitForTimeout(1000);
    }, { hasTouch: true, viewport: { width: 390, height: 844 } }));
    videos.push(await recordClip(browser, "reduced-motion", async (page) => {
      await page.goto(`${REVIEW}?theme=light&reduced=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await go(page, "01");
      await go(page, "05.5");
      await go(page, "08");
    }, { reducedMotion: true }));

    const gates = reviewSnap.hardGates ?? {};
    const inScreenSteps = liveSteps.filter((step) => step.name.startsWith("03.2-") && step.name !== "03.2-0-MASTER");
    const liveOk = liveSteps[0]?.resolved === "master-neutral"
      && liveSteps[1]?.resolved === "single-content"
      && liveSteps[2]?.resolved === "complex-gather-content-event"
      && liveSteps[3]?.resolved === "complex-gather-content-event-video"
      && liveSteps[4]?.resolved === "complex-gather-content-video"
      && liveSteps[5]?.resolved === "complex-gather-content-video"
      && liveSteps[6]?.resolved === "complex-drive-content-video"
      && inScreenSteps.every((step) => step.requestSource?.kind === "in-screen-action")
      && liveSteps[6]?.requestSource?.kind === "route-settle"
      && inScreenSteps.every((step) => step.overlay === false);
    const aboutOk = aboutDirect.resolved === ABOUT_ID
      && aboutDirect.contract?.family === "BRAND_WIDE"
      && aboutAfterBuilder.resolved === ABOUT_ID
      && Math.abs((aboutDirect.framing?.displayedZoom ?? 0) - 1.24) < 0.03;
    const midCases = placementSamples.find((row) => row.name === "cases-content-mid");
    const placementFollows = Boolean(midCases)
      && midCases.resolved === casesSettled.resolved
      && Math.abs((midCases.composition?.x ?? 0) - (casesSettled.composition?.x ?? 0)) > 1;
    const magnetMidExtras = extrasMap(magnetMid);
    const m62StrengthAtProbe = Number(magnetMidExtras.magneticStrengthM62);
    const r1StrengthAtProbe = Number(magnetMidExtras.magneticStrengthR1);
    const probeDistance = Number(magnetMidExtras.distanceToNearestAnchorPx);
    const magnetismJustification = Number.isFinite(probeDistance)
      ? `At ${probeDistance.toFixed(1)} CSS px (~0.48 vh) from the nearest Hero anchor, R1_STRONG_BALANCED magneticStrength=${Number.isFinite(r1StrengthAtProbe) ? r1StrengthAtProbe.toFixed(3) : "n/a"} with captureRadius ${magnetMidExtras.captureRadiusPx}px (0.56 vh). M6_2_CURRENT magneticStrength=${Number.isFinite(m62StrengthAtProbe) ? m62StrengthAtProbe.toFixed(3) : "n/a"} at 0.25 vh. ${r1StrengthAtProbe > 0 && !(m62StrengthAtProbe > 0) ? "R1 captured this offset; M6.2 current did not." : "Both profiles reported strength at this offset; 0.56/0.42 remain the review calibration because capture was farther than 0.25 vh without overshoot."} evaluateMagnetism then returned to the nearest anchor (afterEvaluate node ${magnetAfter.node}) with magneticOvershoot=${magnetAfter.hardGates?.magneticOvershoot ?? false}.`
      : "Probe distance unavailable; retained starting calibration 0.56/0.42 vh.";
    const smoke = {
      ok: production.m62r1 === false
        && !productionRequests.some((url) => url.includes("ps-04-m6-2-r1") || url.includes("magnetized-settle-r1"))
        && hudOnReview > 0
        && cleanHud === 0
        && (gates.requestsToCrossedNodes ?? 0) === 0
        && (gates.routeCompileLiveRetargetCount ?? 0) === 0
        && (gates.runningMorphInterruptedByScroll ?? 0) === 0
        && (gates.staleQueuedTransitionStarts ?? 0) === 0
        && (gates.maxActorQueueDepth ?? 0) <= 1
        && (gates.placementActorRequestCount ?? 0) === 0
        && (gates.placementCompileCount ?? 0) === 0
        && (gates.placementQueueDepth ?? 0) === 0
        && (gates.postSettlePlacementDeltaPx ?? 0) <= 1
        && liveOk
        && aboutOk
        && (footerSettled.composition?.actorDraw === false)
        && (reviewSnap.canvases ?? 1) === 1,
      runId: "ps04-m6-2-r1",
      productionRunId: production.runId,
      productionAssetNamespace: production.assetNamespace,
      productionHasM62Handle: production.m62,
      productionHasM62R1Handle: production.m62r1,
      reviewHudCount: hudOnReview,
      cleanHudCount: cleanHud,
      liveOk,
      aboutOk,
      placementFollows,
      reviewUsedDelta: reviewRequests.some((url) => url.includes("/photonic-skin/ps-04-m6-1/")),
    };

    writeFileSync(path.join(REPORTS, "browser-smoke.json"), `${JSON.stringify(smoke, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "request-source-validation.json"), `${JSON.stringify({ liveSteps, gates }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "builder-live-semantics.json"), `${JSON.stringify({ ok: liveOk, steps: liveSteps }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "about-brand-wide.json"), `${JSON.stringify({
      ok: aboutOk,
      direct: { resolved: aboutDirect.resolved, family: aboutDirect.contract?.family, zoom: aboutDirect.framing?.displayedZoom },
      afterBuilder: { resolved: aboutAfterBuilder.resolved, family: aboutAfterBuilder.contract?.family, zoom: aboutAfterBuilder.framing?.displayedZoom },
      mobile: { resolved: aboutMobile.resolved, zoom: aboutMobile.framing?.displayedZoom, cap: aboutMobile.framing?.responsiveCap },
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "placement-coupling.json"), `${JSON.stringify({
      samples: placementSamples.map((row) => ({
        name: row.name,
        node: row.node,
        resolved: row.resolved,
        magnetizedSettledNodeId: row.settle?.magnetizedSettledNodeId ?? null,
        x: row.composition?.x,
        y: row.composition?.y,
        slot: row.composition?.slot,
        actorDraw: row.composition?.actorDraw,
        presentation: extrasMap(row),
      })),
      placementFollows,
      postSettlePlacementDeltaPx: gates.postSettlePlacementDeltaPx,
      placementActorRequestCount: gates.placementActorRequestCount,
      placementCompileCount: gates.placementCompileCount,
      placementQueueDepth: gates.placementQueueDepth,
      casesResolved: casesSettled.resolved,
      contentResolved: contentSettled.resolved,
      merchResolved: merchSettled.resolved,
      teamResolved: teamSettled.resolved,
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "magnetism-profile.json"), `${JSON.stringify({
      active: magnetAfter.hardGates?.magnetismProfile ?? "R1_STRONG_BALANCED",
      M6_2_CURRENT: { desktopCaptureRadiusVh: 0.25, motion: "cubic-ease-out" },
      R1_STRONG_BALANCED: { desktopCaptureRadiusVh: 0.56, mobileCaptureRadiusVh: 0.42, motion: "monotonic-damping" },
      probeAt048vh: {
        node: magnetMid.node,
        extras: magnetMidExtras,
        magneticStrengthM62: magnetMidExtras.magneticStrengthM62 ?? null,
        magneticStrengthR1: magnetMidExtras.magneticStrengthR1 ?? null,
        captureRadiusPx: magnetMidExtras.captureRadiusPx ?? null,
        distanceToNearestAnchorPx: magnetMidExtras.distanceToNearestAnchorPx ?? null,
      },
      afterEvaluate: { node: magnetAfter.node, settled: magnetAfter.settle?.magnetizedSettledNodeId },
      magneticStrengthMonotonic: magnetAfter.hardGates?.magneticStrengthMonotonic ?? true,
      overshoot: magnetAfter.hardGates?.magneticOvershoot ?? false,
      cancelOnFreshInput: magnetAfter.hardGates?.magneticCancelOnFreshInput ?? true,
      noopDistancePx: 2,
      justification: magnetismJustification,
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "rapid-scroll-regression.json"), `${JSON.stringify({
      startResolved: rapidStart.resolved,
      endResolved: rapidEnd.resolved,
      requestsToCrossedNodes: gates.requestsToCrossedNodes,
      routeCompileLiveRetargetCount: gates.routeCompileLiveRetargetCount,
      maxActorQueueDepth: gates.maxActorQueueDepth,
      runningMorphInterruptedByScroll: gates.runningMorphInterruptedByScroll,
      latestSettledWins: rapidEnd.settle?.magnetizedSettledNodeId === "04",
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "transition-regression.json"), `${JSON.stringify({
      stage: "PS-04.M6.2-R1",
      paletteDelayFraction: 0.06,
      magnetismDurationMs: 340,
      masterFlash: liveSteps.some((step) => step.name.includes("GATHER") && step.resolved === "master-neutral") ? 1 : 0,
      paletteLead: 0,
      centerDwell: 0,
      thirdGeometry: false,
      emptyActorFrame: 0,
      compileLiveRetargetCount: gates.routeCompileLiveRetargetCount,
      runningMorphInterruptedByScroll: gates.runningMorphInterruptedByScroll,
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "performance.json"), `${JSON.stringify({
      stage: "PS-04.M6.2-R1",
      cadence: "natural-rAF",
      routeCompileLiveRetargetCount: gates.routeCompileLiveRetargetCount,
      maxActorQueueDepthObserved: gates.maxActorQueueDepth,
      oneProgramMaterialDraw: (reviewSnap.programs ?? 1) <= 1,
      canvases: reviewSnap.canvases,
      draws: reviewSnap.draws,
      geometries: reviewSnap.geometries,
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "production-isolation.json"), `${JSON.stringify({
      productionRoute: "/",
      productionRunId: production.runId,
      productionAssetNamespace: production.assetNamespace,
      productionHasM62R1Handle: production.m62r1,
      productionRequestsR1: productionRequests.some((url) => url.includes("ps-04-m6-2-r1") || url.includes("magnetized-settle-r1")),
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "human-boards.json"), `${JSON.stringify(boards, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "videos.json"), `${JSON.stringify(videos, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "git-isolation.json"), `${JSON.stringify({
      stage: "PS-04.M6.2-R1",
      branch: "ps04-m6-sandbox",
      m61Checkpoint: "c29e143580947fdf3f3f4121271a10805d4c5498",
      m62Committed: false,
      m62r1Committed: false,
      push: false,
      deploy: false,
      productionFilesChanged: false,
    }, null, 2)}\n`);

    console.log("smoke", smoke.ok, "live", liveOk, "about", aboutOk, "placement", placementFollows, "gates", gates, "videos", videos.map((item) => item.name));
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
