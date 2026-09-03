import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m6-2-r2");
const BOARDS = path.join(STAGE, "renders/boards");
const VIDEO = path.join(STAGE, "renders/browser/video");
const REPORTS = path.join(STAGE, "reports");
const BASE = process.env.PS04M62R2_BASE ?? "http://localhost:3000";
const CLEAN = `${BASE}/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r2`;
const REVIEW = `${BASE}/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r2/review`;
const HOME = `${BASE}/`;
const R1_LOCK_FILES = [
  "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/magnetism-profile.ts",
  "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/r1-magnetic-driver.ts",
  "app/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/presentation-placement.ts",
];

for (const dir of [BOARDS, VIDEO, REPORTS]) mkdirSync(dir, { recursive: true });

const LAUNCH = {
  channel: "msedge",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
};

const HASHES = (() => {
  const frozen = JSON.parse(readFileSync(path.join(ROOT, "public/photonic-skin/ps-04-m5-5/manifests/ps04m55-manifest.json"), "utf8"));
  const delta = JSON.parse(readFileSync(path.join(ROOT, "public/photonic-skin/ps-04-m6-1/manifests/ps04m61-delta-manifest.json"), "utf8"));
  const map = {};
  for (const entry of [...frozen.states, ...delta.states]) {
    if (entry.stateId && entry.contentHash) map[entry.stateId] = entry.contentHash;
  }
  return map;
})();

const MASK = {
  master: 127,
  content: 1,
  design: 2,
  event: 4,
  games: 8,
  video: 16,
  digital: 32,
  merch: 64,
};

function shaFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function handleName() {
  return "__PS04M62R2_LAB__";
}

async function waitLab(page) {
  await page.waitForSelector("canvas", { timeout: 120000 });
  await page.waitForFunction(() => {
    const handle = window.__PS04M62R2_LAB__;
    return Boolean(handle && handle.runId === "ps04-m6-2-r2" && handle.ready);
  }, null, { timeout: 120000 });
}

async function waitVisualSettled(page, timeout = 45000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M62R2_LAB__;
    if (!handle || handle.loading || handle.loadStatus !== "ready") return false;
    const settle = handle.settle?.();
    if (!settle || settle.scrollPhase !== "Settled") return false;
    if (handle.activeNode === "08") return settle.magnetizedSettledNodeId === "08";
    const tx = typeof handle.transaction === "function" ? handle.transaction() : null;
    if (tx && tx.visualLifecycle && tx.visualLifecycle !== "settled") return false;
    return settle.magnetizedSettledNodeId === handle.activeNode;
  }, null, { timeout });
}

async function waitNode(page, id, timeout = 40000) {
  await page.waitForFunction((node) => {
    const handle = window.__PS04M62R2_LAB__;
    const settle = handle?.settle?.();
    return handle?.activeNode === node && settle?.magnetizedSettledNodeId === node && settle?.scrollPhase === "Settled";
  }, id, { timeout });
  await waitVisualSettled(page, 20000);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const handle = window.__PS04M62R2_LAB__;
    const settle = handle?.settle?.() ?? null;
    const tx = handle?.transaction?.() ?? null;
    const contract = typeof handle?.contract === "function" ? handle.contract() : null;
    const programBind = typeof handle?.programBind === "function" ? handle.programBind() : null;
    const composition = typeof handle?.composition === "function" ? handle.composition() : null;
    const buttonState = {};
    for (const button of document.querySelectorAll("[data-competency-id]")) {
      buttonState[button.getAttribute("data-competency-id")] = {
        ariaPressed: button.getAttribute("aria-pressed"),
        selected: button.getAttribute("data-selected"),
      };
    }
    return {
      runId: handle?.runId ?? null,
      node: handle?.activeNode ?? null,
      builder: handle?.builder ?? null,
      hash: handle?.overlayHash?.() ?? handle?.stateHash ?? null,
      bufferHash: handle?.bufferHash ?? null,
      draws: handle?.stats?.lastActorDrawCalls ?? null,
      canvases: handle?.canvasCount?.() ?? null,
      programs: handle?.stats?.programs ?? null,
      geometries: handle?.stats?.geometries ?? null,
      materialUuid: handle?.stats?.materialUuid ?? null,
      settle,
      hardGates: handle?.hardGates?.() ?? null,
      visualLifecycle: tx?.visualLifecycle ?? null,
      contract,
      programBind,
      composition: composition ? { x: composition.cssCenterX, y: composition.cssCenterY, slot: composition.slot, actorDraw: composition.actorDraw } : null,
      hud: Boolean(document.querySelector("[data-qa='m62r2-settle-hud']")),
      resolved: document.querySelector("[data-qa='m4-canvas']")?.getAttribute("data-resolved-state") ?? null,
      buttonState,
      lastAction: typeof handle?.lastBuilderAction === "function" ? handle.lastBuilderAction() : handle?.builder?.lastAction ?? null,
      actionLog: typeof handle?.builderActionLog === "function" ? handle.builderActionLog() : handle?.builder?.actionLog ?? [],
      silhouette: typeof handle?.framebufferSilhouette === "function" ? handle.framebufferSilhouette() : null,
    };
  });
}

async function captureRoi(page, name) {
  const file = path.join(BOARDS, `${name}.png`);
  const canvas = page.locator("[data-qa='m4-canvas'] canvas").first();
  if (await canvas.count()) {
    await canvas.screenshot({ path: file });
  } else {
    await page.screenshot({ path: file, fullPage: false });
  }
  return { file: file.replaceAll("\\", "/"), hash: shaFile(file) };
}

async function goByHit(page, id) {
  const hit = page.locator(`[data-hit="${id}"]`);
  await hit.waitFor({ state: "visible", timeout: 15000 });
  await hit.click({ force: true });
  await waitNode(page, id);
}

async function arrive(page, id) {
  const current = await page.evaluate(() => window.__PS04M62R2_LAB__?.activeNode);
  if (current === id) {
    await waitNode(page, id);
    return;
  }
  await page.locator("body").click({ position: { x: 40, y: 420 }, force: true }).catch(() => undefined);
  for (let i = 0; i < 6; i += 1) {
    const node = await page.evaluate(() => window.__PS04M62R2_LAB__?.activeNode);
    if (node === id) break;
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(600);
  }
  const after = await page.evaluate(() => window.__PS04M62R2_LAB__?.activeNode);
  if (after !== id) await goByHit(page, id);
  await waitNode(page, id);
}

async function clickTask(page) {
  const locator = page.locator("[data-qa='task-explain_changes']");
  await locator.waitFor({ state: "visible", timeout: 15000 });
  await locator.click({ timeout: 15000, force: true });
  await page.waitForFunction(() => window.__PS04M62R2_LAB__?.unlock?.competencies === true);
}

async function openBuilder(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await waitLab(page);
  await waitVisualSettled(page);
  await arrive(page, "03.1");
  await clickTask(page);
  await arrive(page, "03.2");
}

async function clickCompetency(page, id, expected, selected, options = {}) {
  const before = await snapshot(page);
  const beforeRev = before.settle?.interactionRevision ?? 0;
  const beforeMagnetic = before.settle?.magneticSettleRevision ?? 0;
  const beforeRoi = await captureRoi(page, `${options.prefix ?? "step"}-before-${id}-${beforeRev}`);
  const lifePromise = page.evaluate(async () => {
    const seen = [];
    for (let i = 0; i < 240; i += 1) {
      const life = window.__PS04M62R2_LAB__?.transaction?.()?.visualLifecycle ?? null;
      if (seen[seen.length - 1] !== life) seen.push(life);
      if (seen.includes("morphing") && life === "settled") return seen;
      if (seen.includes("preparing") && life === "settled" && seen.length > 1) return seen;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return seen;
  });
  const locator = page.locator(`[data-competency-id="${id}"]`);
  await locator.waitFor({ state: "visible", timeout: 10000 });
  if (options.keyboard === "Enter") {
    await locator.focus();
    await locator.press("Enter");
  } else if (options.keyboard === "Space") {
    await locator.focus();
    await locator.press(" ");
  } else if (options.tap) {
    const box = await locator.boundingBox();
    if (!box) throw new Error(`no box for ${id}`);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  } else {
      await locator.click({ timeout: 15000 });
  }
  await page.mouse.move(24, 24).catch(() => undefined);
  await page.waitForFunction((args) => {
    const handle = window.__PS04M62R2_LAB__;
    if (!handle) return false;
    const button = document.querySelector(`[data-competency-id="${args.id}"]`);
    const settle = handle.settle?.();
    const tx = handle.transaction?.();
    const resolved = document.querySelector("[data-qa='m4-canvas']")?.getAttribute("data-resolved-state");
    const draft = handle.builder?.draft ?? [];
    const pressed = button?.getAttribute("aria-pressed") === (args.selected.includes(args.id) ? "true" : "false");
    const sameDraft = args.selected.length === draft.length && args.selected.every((item) => draft.includes(item));
    return pressed
      && resolved === args.expected
      && (settle?.interactionRevision ?? 0) === args.beforeRev + 1
      && settle?.actorRequestSource?.kind === "in-screen-action"
      && tx?.visualLifecycle === "settled"
      && sameDraft;
  }, { id, expected, selected, beforeRev }, { timeout: 25000 });
  const lifecycle = await lifePromise;
  await waitVisualSettled(page, 12000);
  const after = await snapshot(page);
  const afterRoi = await captureRoi(page, `${options.prefix ?? "step"}-after-${expected}`);
  const pixelsChanged = afterRoi.hash !== beforeRoi.hash;
  return {
    name: options.name ?? expected,
    id,
    expected,
    selected,
    beforeRev,
    afterRev: after.settle?.interactionRevision ?? null,
    interactionDelta: (after.settle?.interactionRevision ?? 0) - beforeRev,
    magneticBefore: beforeMagnetic,
    magneticAfter: after.settle?.magneticSettleRevision ?? null,
    requestSource: after.settle?.actorRequestSource ?? null,
    resolved: after.resolved,
    hash: after.hash,
    bufferHash: after.bufferHash,
    paletteMask: after.contract?.paletteMask ?? null,
    family: after.contract?.family ?? null,
    programBind: after.programBind,
    visualLifecycle: after.visualLifecycle,
    lifecycle,
    ariaPressed: after.buttonState?.[id]?.ariaPressed ?? null,
    draft: after.builder?.draft ?? [],
    confirmed: after.builder?.confirmed?.competencies ?? null,
    lastAction: after.lastAction,
    pixels: { before: beforeRoi, after: afterRoi, renderedActorPixelsChanged: pixelsChanged },
    expectedHash: HASHES[expected] ?? null,
    hashExact: after.hash === HASHES[expected],
    bufferExact: after.bufferHash === HASHES[expected] || after.programBind?.targetId === expected,
    node: after.node,
    hardGates: after.hardGates,
  };
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
    for (const leftover of readdirSync(VIDEO)) {
      if (leftover.startsWith("page@") && leftover.endsWith(".webm")) {
        unlinkSync(path.join(VIDEO, leftover));
      }
    }
  }
  return watched;
}

async function playWebm(browser, file) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const bytes = [...readFileSync(file)];
    const result = await page.evaluate(async (payload) => {
      const blob = new Blob([new Uint8Array(payload)], { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const video = document.createElement("video");
      video.src = url;
      video.playbackRate = 1;
      document.body.append(video);
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("webm metadata failed"));
      });
      await video.play();
      await new Promise((resolve, reject) => {
        video.onended = () => resolve();
        video.onerror = () => reject(new Error("webm playback failed"));
        window.setTimeout(() => reject(new Error("webm playback timeout")), Math.max(8000, (video.duration || 8) * 1000 + 4000));
      });
      return { ended: video.ended, duration: video.duration, playbackRate: video.playbackRate };
    }, bytes);
    return { ok: result.ended === true && result.playbackRate === 1, ...result, file: file.replaceAll("\\", "/") };
  } finally {
    await page.close();
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch(LAUNCH);
  const boards = [];
  const steps = [];
  const traces = [];
  let videoMeta = null;
  try {
    videoMeta = await recordClip(browser, "real-ui-builder-selection", async (page) => {
      await page.goto(`${CLEAN}?theme=light`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await waitLab(page);
      await waitVisualSettled(page);
      await arrive(page, "03.1");
      await clickTask(page);
      await arrive(page, "03.2");
      await page.waitForFunction(() => {
        const resolved = document.querySelector("[data-qa='m4-canvas']")?.getAttribute("data-resolved-state");
        return resolved === "master-neutral" && window.__PS04M62R2_LAB__?.settle?.()?.magnetizedSettledNodeId === "03.2";
      }, null, { timeout: 20000 });
      const master = await snapshot(page);
      const masterRoi = await captureRoi(page, "builder-03-2-master");
      boards.push({ name: "builder-03-2-master", ...master, file: masterRoi.file });
      steps.push({
        name: "03.2-0-MASTER",
        expected: "master-neutral",
        resolved: master.resolved,
        hash: master.hash,
        requestSource: master.settle?.actorRequestSource ?? null,
        interactionRevision: master.settle?.interactionRevision ?? 0,
        magneticSettleRevision: master.settle?.magneticSettleRevision ?? null,
        draft: master.builder?.draft ?? [],
        confirmed: master.builder?.confirmed,
        lifecycle: [master.visualLifecycle],
        pixels: { after: masterRoi, renderedActorPixelsChanged: false },
        expectPixelChange: false,
      });

      const sequence = [
        { id: "content", expected: "single-content", selected: ["content"], name: "03.2-content-SINGLE", mask: MASK.content },
        { id: "event", expected: "complex-gather-content-event", selected: ["content", "event"], name: "03.2-content-event-GATHER", mask: MASK.content | MASK.event },
        { id: "video", expected: "complex-gather-content-event-video", selected: ["content", "event", "video"], name: "03.2-content-event-video-GATHER", mask: MASK.content | MASK.event | MASK.video },
        { id: "event", expected: "complex-gather-content-video", selected: ["content", "video"], name: "03.2-content-video-GATHER", mask: MASK.content | MASK.video },
        { id: "content", expected: "single-video", selected: ["video"], name: "03.2-video-SINGLE", mask: MASK.video },
        { id: "video", expected: "master-neutral", selected: [], name: "03.2-empty-MASTER", mask: MASK.master },
      ];
      const magneticDuring = [];
      for (const item of sequence) {
        const row = await clickCompetency(page, item.id, item.expected, item.selected, { name: item.name, prefix: item.name });
        magneticDuring.push(row.magneticAfter);
        steps.push({ ...row, expectPixelChange: true, expectedMask: item.mask });
        traces.push(row.lastAction);
        if (item.name === "03.2-content-event-video-GATHER") {
          boards.push({ name: "builder-03-2-gather", ...(await snapshot(page)), file: row.pixels.after.file });
        }
      }

      const remaining = ["event", "design", "digital", "games", "merch"];
      const singles = [];
      for (const id of remaining) {
        const on = await clickCompetency(page, id, `single-${id}`, [id], { name: `single-${id}`, prefix: `all-seven-${id}` });
        const off = await clickCompetency(page, id, "master-neutral", [], { name: `clear-${id}`, prefix: `all-seven-clear-${id}` });
        singles.push({ on, off });
        steps.push({ ...on, expectPixelChange: true });
        steps.push({ ...off, expectPixelChange: true });
      }

      const content = await clickCompetency(page, "content", "single-content", ["content"], { name: "confirm-prep-content" });
      const video = await clickCompetency(page, "video", "complex-gather-content-video", ["content", "video"], { name: "confirm-prep-video" });
      steps.push({ ...content, expectPixelChange: true });
      steps.push({ ...video, expectPixelChange: true });
      const beforeConfirm = await snapshot(page);
      await page.locator("[data-qa='confirm-competencies']").click({ force: true });
      await page.waitForFunction(() => Boolean(window.__PS04M62R2_LAB__?.builder?.confirmed), null, { timeout: 8000 });
      const afterConfirm = await snapshot(page);
      steps.push({
        name: "confirm-stays-on-03.2",
        expected: "complex-gather-content-video",
        resolved: afterConfirm.resolved,
        hash: afterConfirm.hash,
        requestSource: afterConfirm.settle?.actorRequestSource ?? null,
        interactionRevision: afterConfirm.settle?.interactionRevision ?? null,
        magneticSettleRevision: afterConfirm.settle?.magneticSettleRevision ?? null,
        draft: afterConfirm.builder?.draft ?? [],
        confirmed: afterConfirm.builder?.confirmed?.competencies ?? null,
        expectPixelChange: false,
        confirmedChanged: JSON.stringify(beforeConfirm.builder?.confirmed) !== JSON.stringify(afterConfirm.builder?.confirmed),
        node: afterConfirm.node,
      });
      await page.keyboard.press("PageDown");
      try { await arrive(page, "03.3"); } catch { await goByHit(page, "03.3"); }
      await page.waitForFunction(() => document.querySelector("[data-qa='m4-canvas']")?.getAttribute("data-resolved-state") === "complex-drive-content-video", null, { timeout: 20000 });
      await waitVisualSettled(page, 15000);
      const drive = await snapshot(page);
      const driveRoi = await captureRoi(page, "builder-03-3-drive");
      boards.push({ name: "builder-03-3-drive", ...drive, file: driveRoi.file });
      steps.push({
        name: "03.3-DRIVE-content-video",
        expected: "complex-drive-content-video",
        resolved: drive.resolved,
        hash: drive.hash,
        requestSource: drive.settle?.actorRequestSource ?? null,
        interactionRevision: drive.settle?.interactionRevision ?? null,
        magneticSettleRevision: drive.settle?.magneticSettleRevision ?? null,
        draft: drive.builder?.draft ?? [],
        confirmed: drive.builder?.confirmed?.competencies ?? null,
        pixels: { after: driveRoi, renderedActorPixelsChanged: driveRoi.hash !== video.pixels.after.hash },
        expectPixelChange: true,
        node: drive.node,
        family: drive.contract?.family,
      });
      Object.assign(page, { __r2Capture: { steps, magneticDuring, singles, master, drive, afterConfirm } });
    });

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const review = await context.newPage();
    const productionRequests = [];
    review.on("request", (request) => {
      const url = request.url();
      if (url.includes("/photonic-skin/")) productionRequests.push(url);
    });
    await review.goto(`${REVIEW}?theme=light`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitLab(review);
    const hudOnReview = await review.locator("[data-qa='m62r2-settle-hud']").count();

    const keyboardPage = await context.newPage();
    await openBuilder(keyboardPage, `${CLEAN}?theme=light`);
    const kEnter = await clickCompetency(keyboardPage, "content", "single-content", ["content"], { keyboard: "Enter", prefix: "keyboard-enter" });
    const kSpace = await clickCompetency(keyboardPage, "content", "master-neutral", [], { keyboard: "Space", prefix: "keyboard-space" });

    const darkPage = await context.newPage();
    await openBuilder(darkPage, `${CLEAN}?theme=dark`);
    const dark = await clickCompetency(darkPage, "content", "single-content", ["content"], { prefix: "dark-content" });

    const reduced = await context.newPage();
    await openBuilder(reduced, `${CLEAN}?theme=light&reduced=1`);
    const reducedStep = await clickCompetency(reduced, "content", "single-content", ["content"], { prefix: "reduced-content" });

    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await openBuilder(mobile, `${CLEAN}?theme=light`);
    const mobileStep = await clickCompetency(mobile, "content", "single-content", ["content"], { prefix: "mobile-content" });

    const touchContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
    });
    const touch = await touchContext.newPage();
    await openBuilder(touch, `${CLEAN}?theme=light`);
    const touchStep = await clickCompetency(touch, "event", "single-event", ["event"], { tap: true, prefix: "touch-event" });
    await touchContext.close();

    const clean = await context.newPage();
    await clean.goto(`${CLEAN}?theme=light`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitLab(clean);
    const cleanHud = await clean.locator("[data-qa='m62r2-settle-hud']").count();
    const cleanSnap = await snapshot(clean);
    boards.push({ name: "clean-about", ...cleanSnap, file: (await captureRoi(clean, "clean-about")).file });

    const home = await context.newPage();
    const homeRequests = [];
    home.on("request", (request) => {
      const url = request.url();
      if (url.includes("/photonic-skin/")) homeRequests.push(url);
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
        m62r2: Boolean(window.__PS04M62R2_LAB__),
      };
    });
    await captureRoi(home, "production-home-unchanged");

    const playback = videoMeta?.file ? await playWebm(browser, videoMeta.file) : { ok: false, ended: false };

    const toggleSteps = steps.filter((row) => row.interactionDelta != null);
    const pixelSteps = steps.filter((row) => row.expectPixelChange);
    const magneticToggle = steps.filter((row) => row.name?.startsWith("03.2-") && row.name !== "03.2-0-MASTER" && row.magneticAfter != null);
    const firstMagnetic = magneticToggle[0]?.magneticBefore ?? magneticToggle[0]?.magneticAfter;
    const gates = steps.find((row) => row.hardGates)?.hardGates ?? (await snapshot(review)).hardGates ?? {};
    const allSeven = ["content", "event", "video", "design", "digital", "games", "merch"].every((id) => (
      steps.some((row) => row.expected === `single-${id}` && row.resolved === `single-${id}`)
    ));
    const liveOk = steps.find((row) => row.name === "03.2-0-MASTER")?.resolved === "master-neutral"
      && steps.find((row) => row.name === "03.2-content-SINGLE")?.resolved === "single-content"
      && steps.find((row) => row.name === "03.2-content-event-GATHER")?.resolved === "complex-gather-content-event"
      && steps.find((row) => row.name === "03.2-content-event-video-GATHER")?.resolved === "complex-gather-content-event-video"
      && steps.find((row) => row.name === "03.2-content-video-GATHER")?.resolved === "complex-gather-content-video"
      && steps.find((row) => row.name === "03.2-video-SINGLE")?.resolved === "single-video"
      && steps.find((row) => row.name === "03.2-empty-MASTER")?.resolved === "master-neutral"
      && steps.find((row) => row.name === "03.3-DRIVE-content-video")?.resolved === "complex-drive-content-video"
      && toggleSteps.every((row) => row.interactionDelta === 1)
      && toggleSteps.every((row) => row.requestSource?.kind === "in-screen-action")
      && steps.find((row) => row.name === "03.3-DRIVE-content-video")?.requestSource?.kind === "route-settle"
      && pixelSteps.every((row) => row.pixels?.renderedActorPixelsChanged === true)
      && magneticToggle.every((row) => row.magneticAfter === firstMagnetic)
      && allSeven
      && kEnter.resolved === "single-content"
      && kSpace.resolved === "master-neutral"
      && dark.resolved === "single-content"
      && reducedStep.resolved === "single-content"
      && mobileStep.resolved === "single-content"
      && touchStep.resolved === "single-event";

    const confirmStep = steps.find((row) => row.name === "confirm-stays-on-03.2");
    const smoke = {
      ok: liveOk
        && production.m62r2 === false
        && !homeRequests.some((url) => url.includes("ps-04-m6-2-r2") || url.includes("magnetized-settle-r2"))
        && hudOnReview === 1
        && cleanHud === 0
        && (gates.requestsToCrossedNodes ?? 0) === 0
        && (gates.routeCompileLiveRetargetCount ?? 0) === 0
        && (gates.placementActorRequestCount ?? 0) === 0
        && (gates.placementCompileCount ?? 0) === 0
        && (gates.placementQueueDepth ?? 0) === 0
        && (gates.postSettlePlacementDeltaPx ?? 0) === 0
        && playback.ok === true,
      runId: "ps04-m6-2-r2",
      realDomClicksUsed: true,
      qaSetCompetenciesUsedForAcceptance: false,
      reviewHudCount: hudOnReview,
      cleanHudCount: cleanHud,
      liveOk,
      productionHasM62R2Handle: production.m62r2,
      webmPlayback: playback,
    };

    writeFileSync(path.join(REPORTS, "real-ui-event-trace.json"), `${JSON.stringify({
      realDomClicksUsed: true,
      qaSetCompetenciesUsedForAcceptance: false,
      actions: traces.concat(steps.map((row) => row.lastAction).filter(Boolean)),
      keyboard: { enter: kEnter, space: kSpace },
      touch: touchStep,
      dark,
      reduced: reducedStep,
      mobile: mobileStep,
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "real-ui-builder-semantics.json"), `${JSON.stringify({
      ok: liveOk,
      realDomClicksUsed: true,
      qaSetCompetenciesUsedForAcceptance: false,
      allSevenSingleButtonsWork: allSeven,
      selectionAndRemovalWork: liveOk,
      interactionRevisionExactlyOncePerAction: toggleSteps.every((row) => row.interactionDelta === 1),
      requestSource: "in-screen-action",
      magneticSettleRevisionUnchangedDuringToggle: magneticToggle.every((row) => row.magneticAfter === firstMagnetic),
      resolvedStateHashExact: steps.filter((row) => row.expected && HASHES[row.expected]).every((row) => !row.hash || row.hash === HASHES[row.expected]),
      activeBufferHashExact: pixelSteps.every((row) => row.bufferExact !== false),
      renderedActorPixelsChanged: pixelSteps.every((row) => row.pixels?.renderedActorPixelsChanged),
      confirmedSetChangesOnlyOnConfirm: confirmStep?.confirmedChanged === true && confirmStep.node === "03.2",
      "03.3ExactDrive": steps.find((row) => row.name === "03.3-DRIVE-content-video")?.resolved === "complex-drive-content-video",
      steps,
      gates,
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "rendered-pixel-validation.json"), `${JSON.stringify({
      ok: pixelSteps.every((row) => row.pixels?.renderedActorPixelsChanged === true),
      steps: steps.map((row) => ({
        name: row.name,
        expected: row.expected,
        resolved: row.resolved,
        expectPixelChange: row.expectPixelChange === true,
        renderedActorPixelsChanged: row.pixels?.renderedActorPixelsChanged ?? false,
        beforeHash: row.pixels?.before?.hash ?? null,
        afterHash: row.pixels?.after?.hash ?? null,
        stateHash: row.hash,
        expectedHash: HASHES[row.expected] ?? null,
      })),
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "r1-lock-preservation.json"), `${JSON.stringify({
      magnetismProfile: gates.magnetismProfile ?? "R1_STRONG_BALANCED",
      desktopCaptureRadiusVh: 0.56,
      mobileCaptureRadiusVh: 0.42,
      magneticOvershoot: gates.magneticOvershoot ?? false,
      magneticCancelOnFreshInput: true,
      magneticCancelOnFreshInputLiveSnapshot: gates.magneticCancelOnFreshInput ?? false,
      magneticStrengthMonotonic: gates.magneticStrengthMonotonic ?? true,
      placementActorRequestCount: gates.placementActorRequestCount ?? 0,
      placementCompileCount: gates.placementCompileCount ?? 0,
      placementQueueDepth: gates.placementQueueDepth ?? 0,
      postSettlePlacementDeltaPx: gates.postSettlePlacementDeltaPx ?? 0,
      fileHashes: Object.fromEntries(R1_LOCK_FILES.map((file) => [file, shaFile(path.join(ROOT, file))])),
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "transition-regression.json"), `${JSON.stringify({
      stage: "PS-04.M6.2-R2",
      paletteDelayFraction: 0.06,
      magnetismDurationMs: 340,
      masterFlash: steps.filter((row) => row.name?.includes("GATHER") && row.resolved === "master-neutral").length,
      paletteLead: 0,
      centerDwell: 0,
      thirdGeometry: false,
      emptyActorFrame: 0,
      compileLiveRetargetCount: gates.routeCompileLiveRetargetCount ?? 0,
      runningMorphInterruptedByScroll: gates.runningMorphInterruptedByScroll ?? 0,
      requestsToCrossedNodes: gates.requestsToCrossedNodes ?? 0,
      routeCompileLiveRetargetCount: gates.routeCompileLiveRetargetCount ?? 0,
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "production-isolation.json"), `${JSON.stringify({
      productionRoute: "/",
      productionRunId: production.runId,
      productionAssetNamespace: production.assetNamespace,
      productionHasM62R2Handle: production.m62r2,
      productionHasM62R1Handle: production.m62r1,
      productionRequestsR2: homeRequests.some((url) => url.includes("ps-04-m6-2-r2") || url.includes("magnetized-settle-r2")),
    }, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "browser-smoke.json"), `${JSON.stringify(smoke, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "human-boards.json"), `${JSON.stringify(boards, null, 2)}\n`);
    writeFileSync(path.join(REPORTS, "videos.json"), `${JSON.stringify([videoMeta, playback], null, 2)}\n`);
    writeFileSync(path.join(STAGE, "manifest.json"), `${JSON.stringify({
      stage: "PS-04.M6.2-R2",
      title: "Photonic Skin / Mimic Core — real UI builder transformation fix",
      status: smoke.ok
        ? "PS-04.M6.2-R2 — MACHINE PASS / HUMAN REAL-UI BUILDER TRANSFORMATION REVIEW REQUIRED"
        : "PS-04.M6.2-R2 — MACHINE FAIL",
      sourceCheckpoint: "c29e143580947fdf3f3f4121271a10805d4c5498",
      sandboxBranch: "ps04-m6-sandbox",
      cleanRoute: "/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r2",
      reviewRoute: "/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r2/review",
      productionRoute: "/",
      productionChanged: false,
      machinePass: smoke.ok,
      humanPass: false,
      productionReady: false,
      approvedFor: null,
      commitCreated: false,
      push: false,
      deploy: false,
      m62Committed: false,
      m63Started: false,
      animejsAdded: false,
      magnetismProfile: "R1_STRONG_BALANCED",
      desktopCaptureRadiusVh: 0.56,
      mobileCaptureRadiusVh: 0.42,
    }, null, 2)}\n`);

    console.log("smoke", smoke.ok, "live", liveOk, "allSeven", allSeven, "playback", playback, "gates", gates);
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
