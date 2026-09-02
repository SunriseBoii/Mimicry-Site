import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m6-1");
const BOARDS = path.join(STAGE, "renders/boards");
const RESPONSIVE = path.join(STAGE, "renders/responsive");
const REPORTS = path.join(STAGE, "reports");
const BASE = process.env.PS04M61_BASE ?? "http://localhost:3000";
const CLEAN = `${BASE}/visual-lab/photonic-skin-ps04-m6/project-builder-semantics`;
const REVIEW = `${BASE}/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/review`;
const HOME = `${BASE}/`;

for (const dir of [BOARDS, RESPONSIVE, REPORTS]) mkdirSync(dir, { recursive: true });

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
    const handle = window.__PS04M61_LAB__;
    return Boolean(handle && handle.runId === "ps04-m6-1" && handle.ready);
  }, null, { timeout: 120000 });
}

async function waitActor(page, timeout = 40000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M61_LAB__;
    if (!handle) return false;
    if (handle.activeNode === "08") return handle.composition()?.actorDraw === false;
    return handle.actorFramebufferReady === true && (handle.stats.lastActorDrawCalls === 1 || handle.composition()?.actorDraw === false);
  }, null, { timeout });
}

async function waitVisualSettled(page, timeout = 50000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M61_LAB__;
    if (!handle || handle.loading || handle.loadStatus !== "ready") return false;
    const tx = typeof handle.transaction === "function" ? handle.transaction() : null;
    if (tx && tx.visualLifecycle && tx.visualLifecycle !== "settled") return false;
    return true;
  }, null, { timeout });
}

async function go(page, id) {
  await lab(page, (node) => window.__PS04M61_LAB__.scrollToNode(node, "auto"), id);
  try {
    await page.waitForFunction((node) => window.__PS04M61_LAB__.activeNode === node, id, { timeout: 20000 });
  } catch {
    console.log("activeNode timeout", id);
  }
  try { await waitVisualSettled(page, 25000); } catch { console.log("settle timeout", id); }
  try { await waitActor(page, 15000); } catch { console.log("actor timeout", id); }
}

async function waitState(page, stateId) {
  try {
    await page.waitForFunction((id) => window.__PS04M61_LAB__?.builder?.resolvedStateId === id, stateId, { timeout: 40000 });
  } catch {
    const actual = await lab(page, () => window.__PS04M61_LAB__?.builder?.resolvedStateId);
    console.log("state timeout", stateId, "got", actual);
  }
  try { await waitVisualSettled(page, 25000); } catch { console.log("settle timeout", stateId); }
  try { await waitActor(page, 15000); } catch { console.log("actor timeout", stateId); }
}

async function shot(page, dir, name) {
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file.replaceAll("\\", "/");
}

async function snapshot(page) {
  return page.evaluate(() => {
    const handle = window.__PS04M61_LAB__;
    return {
      runId: handle?.runId ?? null,
      node: handle?.activeNode ?? null,
      builder: handle?.builder ?? null,
      hash: handle?.overlayHash?.() ?? handle?.stateHash ?? null,
      draws: handle?.stats?.lastActorDrawCalls ?? null,
      canvases: handle?.canvasCount?.() ?? null,
      eventOverlay: handle?.eventOverlay ?? null,
      videoOverlay: handle?.videoOverlay ?? null,
      runtimeRotationOverride: handle?.runtimeRotationOverride ?? null,
      framingProfile: handle?.framingProfile ?? null,
      namespace: document.querySelector("[data-qa='m4-canvas']")?.getAttribute("data-asset-namespace") ?? null,
      resolved: document.querySelector("[data-qa='m4-canvas']")?.getAttribute("data-resolved-state") ?? null,
    };
  });
}

const boards = [];

async function board(page, name, note) {
  const file = await shot(page, BOARDS, name);
  const snap = await snapshot(page);
  boards.push({ name, file, note, ...snap });
  console.log("board", name, snap.resolved, snap.hash?.slice?.(0, 12));
}

async function main() {
  const browser = await chromium.launch(LAUNCH);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const productionRequests = [];
  const reviewRequests = [];

  const reviewPage = await context.newPage();
  reviewPage.on("request", (request) => {
    const url = request.url();
    if (url.includes("ps-04-m6-1") || url.includes("ps-04-m5-5")) reviewRequests.push(url);
  });
  await reviewPage.goto(`${REVIEW}?theme=light`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await waitLab(reviewPage);

  await go(reviewPage, "03.1");
  await waitState(reviewPage, "master-neutral");
  await board(reviewPage, "03-1-before-task", "03.1 potential before task");
  await lab(reviewPage, () => window.__PS04M61_LAB__.selectTask("explain_changes"));
  await waitState(reviewPage, "master-neutral");
  await board(reviewPage, "03-1-after-task", "03.1 still MASTER after task");

  await go(reviewPage, "03.2");
  await waitState(reviewPage, "master-neutral");
  await board(reviewPage, "03-2-empty", "03.2 empty set stays MASTER");

  await lab(reviewPage, () => window.__PS04M61_LAB__.setCompetencies(["event"]));
  await waitState(reviewPage, "single-event");
  await board(reviewPage, "03-2-single-event", "03.2 one competency = SINGLE");

  await lab(reviewPage, () => window.__PS04M61_LAB__.setCompetencies(["event", "video"]));
  await waitState(reviewPage, "complex-gather-event-video");
  await board(reviewPage, "03-2-gather-event-video", "Event+Video GATHER");

  await lab(reviewPage, () => window.__PS04M61_LAB__.setCompetencies(["games", "merch", "video"]));
  await waitState(reviewPage, "complex-gather-games-merch-video");
  await board(reviewPage, "03-2-gather-games-merch-video", "Games+Merch+Video GATHER");

  await lab(reviewPage, () => window.__PS04M61_LAB__.setCompetencies(["digital", "event", "games", "merch"]));
  await waitState(reviewPage, "complex-gather-digital-event-games-merch");
  await board(reviewPage, "03-2-gather-four-no-content-design", "four competencies without Content/Design");

  await lab(reviewPage, () => window.__PS04M61_LAB__.setCompetencies(["content", "design", "digital", "event", "games", "merch", "video"]));
  await waitState(reviewPage, "complex-gather-content-design-digital-event-games-merch-video");
  await board(reviewPage, "03-2-gather-all-seven", "all seven GATHER");

  await lab(reviewPage, () => window.__PS04M61_LAB__.confirmCompetencies());
  await go(reviewPage, "03.3");
  await waitState(reviewPage, "complex-drive-content-design-digital-event-games-merch-video");
  await board(reviewPage, "03-3-drive-all-seven", "all seven DRIVE");

  await lab(reviewPage, () => window.__PS04M61_LAB__.resetFlow());
  await go(reviewPage, "03.1");
  await lab(reviewPage, () => window.__PS04M61_LAB__.selectTask("engage_and_unite"));
  await go(reviewPage, "03.2");
  await lab(reviewPage, () => window.__PS04M61_LAB__.setCompetencies(["event", "video"]));
  await waitState(reviewPage, "complex-gather-event-video");
  await board(reviewPage, "same-set-gather", "same set GATHER");
  await lab(reviewPage, () => window.__PS04M61_LAB__.confirmCompetencies());
  await go(reviewPage, "03.3");
  await waitState(reviewPage, "complex-drive-event-video");
  await board(reviewPage, "same-set-drive", "same set DRIVE");

  await lab(reviewPage, () => window.__PS04M61_LAB__.editBrief("Редактирование брифа не должно менять геометрию Mimic."));
  await waitState(reviewPage, "complex-drive-event-video");
  await board(reviewPage, "03-3-brief-edit", "brief text edit keeps confirmed DRIVE");

  await go(reviewPage, "03.2");
  await lab(reviewPage, () => window.__PS04M61_LAB__.setCompetencies(["games"]));
  await waitState(reviewPage, "single-games");
  await board(reviewPage, "edit-after-confirm-draft", "draft after confirm is SINGLE games");
  await go(reviewPage, "03.3");
  await waitState(reviewPage, "complex-drive-event-video");
  await board(reviewPage, "edit-after-confirm-confirmed", "confirmed Mimic stays Event+Video DRIVE");

  await lab(reviewPage, (theme) => window.__PS04M61_LAB__.setTheme(theme), "dark");
  await reviewPage.waitForTimeout(400);
  await board(reviewPage, "03-3-dark", "Dark theme, same confirmed set");
  await lab(reviewPage, (theme) => window.__PS04M61_LAB__.setTheme(theme), "light");

  await reviewPage.setViewportSize({ width: 390, height: 844 });
  await go(reviewPage, "03.2");
  await waitState(reviewPage, "single-games");
  await shot(reviewPage, RESPONSIVE, "03-2-mobile-390");
  await reviewPage.setViewportSize({ width: 1440, height: 900 });

  const cleanPage = await context.newPage();
  await cleanPage.goto(`${CLEAN}?theme=light`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await waitLab(cleanPage);
  await go(cleanPage, "03.1");
  await lab(cleanPage, () => window.__PS04M61_LAB__.selectTask("learn_and_practice"));
  await go(cleanPage, "03.2");
  await lab(cleanPage, () => window.__PS04M61_LAB__.setCompetencies(["event", "video"]));
  await waitState(cleanPage, "complex-gather-event-video");
  await board(cleanPage, "clean-03-2-gather-event-video", "clean route, no HUD");
  const hud = await cleanPage.locator("[data-qa='m61-review-panel']").count();

  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/photonic-skin/")) productionRequests.push(url);
  });
  await page.goto(HOME, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("canvas", { timeout: 120000 });
  await page.waitForFunction(() => {
    const handle = window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__;
    return Boolean(handle && handle.ready);
  }, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const production = await page.evaluate(() => {
    const handle = window.__PS04M56_PRODUCTION__ || window.__PS04M5_LAB__;
    return {
      runId: handle?.runId ?? null,
      assetNamespace: handle?.assetNamespace ?? null,
      m61: Boolean(window.__PS04M61_LAB__),
    };
  });
  await shot(page, BOARDS, "production-home-unchanged");

  const productionRequestsM61 = productionRequests.some((url) => url.includes("ps-04-m6-1"));
  const reviewUsedDelta = reviewRequests.some((url) => url.includes("/photonic-skin/ps-04-m6-1/"));
  const smoke = {
    ok: !productionRequestsM61 && production.m61 === false && production.runId !== "ps04-m6-1" && hud === 0,
    runId: "ps04-m6-1",
    productionRunId: production.runId,
    productionAssetNamespace: production.assetNamespace,
    productionRequestsM61,
    productionHasM61Handle: production.m61,
    cleanHudCount: hud,
    reviewUsedDelta,
    eventOverlay: "none",
    videoOverlay: "none",
    runtimeRotationOverride: "none",
    boards: boards.map((item) => ({ name: item.name, resolved: item.resolved, hash: item.hash, draws: item.draws, canvases: item.canvases })),
  };
  writeFileSync(path.join(REPORTS, "browser-smoke.json"), `${JSON.stringify(smoke, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "human-boards.json"), `${JSON.stringify(boards, null, 2)}\n`);
  console.log("smoke", smoke.ok, "productionRunId", production.runId, "m61Requests", productionRequestsM61);
  await browser.close();
  if (!smoke.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
