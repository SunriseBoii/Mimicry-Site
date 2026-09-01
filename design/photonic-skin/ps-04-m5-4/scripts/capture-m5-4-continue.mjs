import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m5-4");
const BOARDS = path.join(STAGE, "renders/browser");
const TRANSITIONS = path.join(STAGE, "renders/transitions");
const VIDEO = path.join(STAGE, "renders/video");
const REPORTS = path.join(STAGE, "reports");
const BASE = process.env.PS04M54_BASE ?? "http://localhost:3000";
const SANDBOX = `${BASE}/visual-lab/photonic-skin-ps04-m5/framing-sandbox`;
const HOME = `${BASE}/`;
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
  await lab(page, (node) => (window.__PS04M54_LAB__ || window.__PS04M5_LAB__).scrollToNode(node, "auto", "restore"), id);
  await page.waitForFunction((node) => (window.__PS04M54_LAB__ || window.__PS04M5_LAB__).activeNode === node, id, { timeout: 60000 });
  if (id !== "08") {
    await waitVisualSettled(page, 90000);
    await waitActor(page, 30000);
  } else {
    await page.waitForFunction(() => (window.__PS04M54_LAB__ || window.__PS04M5_LAB__).composition()?.actorDraw === false, null, { timeout: 20000 });
  }
}

async function shot(page, dir, name) {
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file.replaceAll("\\", "/");
}

function query(screen) {
  return new URLSearchParams({
    screen,
    aboutZoom: "118",
    merchZoom: "108",
    videoZoom: "108",
    viewport: "current",
    diagnostic: "final",
    theme: "light",
    mode: "settled",
  }).toString();
}

async function recordClip(browser, name, setup) {
  const viewport = { width: 1440, height: 900 };
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO, size: viewport },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  await setup(page);
  const video = page.video();
  await context.close();
  if (video) {
    const src = await video.path();
    const dest = path.join(VIDEO, `${name}.webm`);
    copyFileSync(src, dest);
  }
  return name;
}

const browser = await chromium.launch(LAUNCH);
const boards = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  await page.goto(`${SANDBOX}?${query("about")}`, { waitUntil: "domcontentloaded" });
  await waitLab(page);
  await waitActor(page);
  await go(page, "04");
  boards.push(await shot(page, TRANSITIONS, "cases"));
  await go(page, "05.1");
  boards.push(await shot(page, TRANSITIONS, "content"));
  await go(page, "05.2");
  boards.push(await shot(page, TRANSITIONS, "design"));
  await go(page, "05.3");
  boards.push(await shot(page, TRANSITIONS, "event"));
  await go(page, "05.4");
  boards.push(await shot(page, TRANSITIONS, "games"));
  await go(page, "01");
  boards.push(await shot(page, TRANSITIONS, "hero-unaffected"));
  await go(page, "08");
  boards.push(await shot(page, TRANSITIONS, "footer-no-actor"));
  await context.close();

  {
    const home = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await home.newPage();
    await page.goto(HOME, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    boards.push(await shot(page, BOARDS, "production-homepage"));
    await home.close();
  }

  await recordClip(browser, "digital-video-digital", async (page) => {
    await page.goto(`${SANDBOX}?${query("video")}`, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "05.6");
    await go(page, "05.5");
    await go(page, "05.6");
  });
  await recordClip(browser, "merch-team", async (page) => {
    await page.goto(`${SANDBOX}?${query("merch")}`, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "05.7");
    await go(page, "06.1");
  });
  await recordClip(browser, "about-entry-exit", async (page) => {
    await page.goto(`${SANDBOX}?${query("about")}`, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "01");
    await go(page, "02");
    await go(page, "03.1");
  });
  await recordClip(browser, "rapid-residual", async (page) => {
    await page.goto(`${SANDBOX}?${query("video")}`, { waitUntil: "domcontentloaded" });
    await waitLab(page);
    await go(page, "05.3");
    await lab(page, () => {
      const handle = window.__PS04M54_LAB__ || window.__PS04M5_LAB__;
      handle.scrollToNode("05.6", "auto");
      handle.scrollToNode("05.5", "auto");
      handle.scrollToNode("05.4", "auto");
      handle.scrollToNode("05.5", "auto");
    });
    await page.waitForTimeout(1800);
    await waitVisualSettled(page, 90000);
  });

  writeFileSync(path.join(REPORTS, "browser-smoke.json"), JSON.stringify({
    ok: true,
    continued: true,
    boards,
    note: "Primary candidate boards captured in capture-m5-4.mjs; this run finishes unaffected screens, production, and WebM clips.",
  }, null, 2));
} finally {
  await browser.close();
}

console.log(JSON.stringify({ continued: boards.length }, null, 2));
