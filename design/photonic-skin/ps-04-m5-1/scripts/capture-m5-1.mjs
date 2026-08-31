import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m5-1/renders/browser");
const VIDEO = path.join(OUT, "video");
const BOARDS = path.join(ROOT, "design/photonic-skin/ps-04-m5-1/renders/boards");
const PROBES = path.join(OUT, "frame-probes");
const REPORTS = path.join(ROOT, "design/photonic-skin/ps-04-m5-1/reports");
const BASE = process.env.PS04M5_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m5`;
const HOME = `${BASE}/`;

mkdirSync(OUT, { recursive: true });
mkdirSync(VIDEO, { recursive: true });
mkdirSync(BOARDS, { recursive: true });
mkdirSync(PROBES, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

const LAUNCH = {
  channel: "msedge",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
};

const SINGLES = ["05.1", "05.2", "05.3", "05.4", "05.5", "05.6", "05.7"];
const SINGLE_NAMES = [
  ["05.1", "content"], ["05.2", "design"], ["05.3", "event"],
  ["05.4", "games"], ["05.5", "video"], ["05.6", "digital"], ["05.7", "merch"],
];

function lab(page, expression, arg) {
  return page.evaluate(expression, arg);
}

async function waitLab(page) {
  await page.waitForSelector("canvas", { timeout: 90000 });
  await page.waitForFunction(() => {
    const handle = window.__PS04M5_LAB__;
    return Boolean(handle && handle.runId === "ps04-m5" && handle.ready);
  }, null, { timeout: 90000 });
}

async function waitActor(page, timeout = 30000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M5_LAB__;
    if (!handle) return false;
    if (handle.activeNode === "08") return handle.actorFramebufferReady === true && handle.composition()?.actorDraw === false;
    return handle.actorFramebufferReady === true && (handle.stats.lastActorDrawCalls === 1 || handle.composition()?.actorDraw === false);
  }, null, { timeout });
}

async function waitNode(page, id) {
  await page.waitForFunction((node) => window.__PS04M5_LAB__.activeNode === node, id, { timeout: 40000 });
}

async function waitVisualSettled(page, timeout = 40000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M5_LAB__;
    if (!handle || handle.loading) return false;
    if (handle.activeNode === "08") return handle.composition()?.actorDraw === false;
    const geo = typeof handle.geometrySnapshot === "function" ? handle.geometrySnapshot() : null;
    const tx = typeof handle.transaction === "function" ? handle.transaction() : null;
    if (geo && (geo.status !== "settled" || geo.shaderProgress < 0.999)) return false;
    if (tx && tx.visualLifecycle && tx.visualLifecycle !== "settled") return false;
    return true;
  }, null, { timeout });
}

async function dump(page) {
  return lab(page, () => {
    const handle = window.__PS04M5_LAB__;
    return {
      node: handle?.activeNode,
      ready: handle?.ready,
      actorFramebufferReady: handle?.actorFramebufferReady,
      draws: handle?.stats?.lastActorDrawCalls,
      geo: typeof handle.geometrySnapshot === "function" ? handle.geometrySnapshot() : null,
      tx: typeof handle.transaction === "function" ? handle.transaction() : null,
    };
  });
}

async function go(page, id) {
  await lab(page, (node) => window.__PS04M5_LAB__.scrollToNode(node, "auto"), id);
  try {
    await waitNode(page, id);
    if (id !== "08") {
      await waitVisualSettled(page, 90000);
      await waitActor(page, 30000);
    } else {
      await page.waitForFunction(() => window.__PS04M5_LAB__.composition()?.actorDraw === false, null, { timeout: 20000 });
    }
  } catch (error) {
    console.error(`go(${id}) failed`, await dump(page));
    throw error;
  }
}

async function shot(page, name) {
  const file = path.join(BOARDS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file.replaceAll("\\", "/");
}

async function silhouette(page) {
  return lab(page, () => {
    const handle = window.__PS04M5_LAB__;
    return {
      node: handle.activeNode,
      actorDraw: handle.composition()?.actorDraw ?? false,
      actorFramebufferReady: handle.actorFramebufferReady,
      draws: handle.stats.lastActorDrawCalls,
      programs: handle.stats.programs,
      triangles: handle.stats.lastActorTriangles,
      silhouette: typeof handle.framebufferSilhouette === "function" ? handle.framebufferSilhouette() : null,
    };
  });
}

function summarizeTrace(frames = []) {
  const running = frames.filter((frame) => frame.visualLifecycle === "morphing" || frame.visualLifecycle === "settling" || (frame.positionProgress > 0.02 && frame.positionProgress < 0.98));
  const xs = running.map((frame) => frame.actorX);
  let dwell = 0;
  let maxHold = 0;
  let hold = 0;
  const width = 1440;
  for (let index = 1; index < running.length; index += 1) {
    const delta = Math.abs((running[index].actorX ?? 0) - (running[index - 1].actorX ?? 0)) / width;
    const active = running[index].positionProgress > 0.02 && running[index].positionProgress < 0.98;
    if (active && delta <= 0.004) {
      hold += 1;
      if (hold > 2) dwell += 1;
      maxHold = Math.max(maxHold, hold);
    } else hold = 0;
  }
  return {
    frames: frames.length,
    paletteLeads: frames.filter((frame) => frame.paletteLeads).length,
    intermediateActorRequest: frames.some((frame) => frame.intermediateActorRequest),
    centerDeclaredAsTarget: frames.some((frame) => frame.centerDeclaredAsTarget),
    preparePublished: frames.some((frame) => frame.visualLifecycle === "preparing" && frame.visualPublished),
    distinctGeometryIds: [...new Set(frames.flatMap((frame) => [frame.currentGeometryId, frame.targetGeometryId]).filter(Boolean))],
    actorXMin: xs.length ? Math.min(...xs) : null,
    actorXMax: xs.length ? Math.max(...xs) : null,
    dwellFramesOverEpsilon: dwell,
    maxConsecutiveHold: maxHold,
  };
}

async function probeStrip(page, name, durationMs = 1600) {
  const dir = path.join(PROBES, name);
  mkdirSync(dir, { recursive: true });
  const files = [];
  const started = Date.now();
  let index = 0;
  while (Date.now() - started < durationMs) {
    const dest = path.join(dir, `f${String(index).padStart(3, "0")}.png`);
    await page.screenshot({ path: dest, fullPage: false });
    files.push(dest.replaceAll("\\", "/"));
    index += 1;
    await page.waitForTimeout(100);
  }
  return files;
}

async function freshPage(browser, query, viewport = { width: 1440, height: 900 }, dpr = 1) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  await page.goto(`${LAB}?${query}`, { waitUntil: "domcontentloaded" });
  await waitLab(page);
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
  page.setDefaultTimeout(90000);
  const watched = { name, probes: [], trace: null, summary: null };
  try {
    await setup(page, watched);
    await page.waitForTimeout(350);
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
  const inventory = { shots: [], videos: [], screens: [], qa: {}, traces: {} };
  try {
    const fresh = [
      ["01-fresh-light-dpr1", "theme=light&dpr=1", { width: 1440, height: 900 }, 1],
      ["02-fresh-dark-dpr1", "theme=dark&dpr=1", { width: 1440, height: 900 }, 1],
      ["03-fresh-light-dpr1.5", "theme=light&dpr=1.5", { width: 1440, height: 900 }, 1.5],
      ["04-fresh-light-dpr2", "theme=light&dpr=2", { width: 1440, height: 900 }, 2],
      ["05-fresh-dark-dpr1.5", "theme=dark&dpr=1.5", { width: 1440, height: 900 }, 1.5],
      ["06-fresh-dark-dpr2", "theme=dark&dpr=2", { width: 1440, height: 900 }, 2],
      ["07-mobile-390", "theme=light&dpr=1", { width: 390, height: 844 }, 1],
    ];
    for (const [name, query, viewport, dpr] of fresh) {
      const dest = path.join(BOARDS, `${name}.png`);
      if (existsSync(dest)) {
        inventory.shots.push(dest.replaceAll("\\", "/"));
        continue;
      }
      const { context, page } = await freshPage(browser, query, viewport, dpr);
      await waitActor(page);
      inventory.shots.push(await shot(page, name));
      inventory.screens.push({ name, ...(await silhouette(page)) });
      await context.close();
    }

    if (!existsSync(path.join(BOARDS, "24-production-home.png"))) {
      const { context, page } = await freshPage(browser, "theme=light&dpr=1");
      await waitActor(page);
      inventory.shots.push(await shot(page, "10-hero-master"));
      await go(page, "02");
      inventory.shots.push(await shot(page, "11-about-brand-wide"));
      await go(page, "03.1");
      inventory.shots.push(await shot(page, "12-build-family"));
      await go(page, "04");
      inventory.shots.push(await shot(page, "13-cases-master"));
      for (const [node, name] of SINGLE_NAMES) {
        await go(page, node);
        inventory.shots.push(await shot(page, `14-single-${name}-light`));
        inventory.screens.push({ name, ...(await silhouette(page)) });
      }
      await go(page, "06.1");
      inventory.shots.push(await shot(page, "15-team-master"));
      await go(page, "08");
      inventory.shots.push(await shot(page, "16-footer-none"));
      inventory.screens.push({ name: "footer", ...(await silhouette(page)) });
      await go(page, "01");
      await waitActor(page);
      await lab(page, () => window.__PS04M5_LAB__.loseContext());
      await page.waitForTimeout(900);
      await waitActor(page, 30000);
      inventory.shots.push(await shot(page, "17-context-restore"));
      await go(page, "08");
      await go(page, "01");
      inventory.shots.push(await shot(page, "18-resource-cycle-1"));
      await go(page, "08");
      await go(page, "01");
      inventory.shots.push(await shot(page, "18b-resource-cycle-2"));
      await page.goto(HOME, { waitUntil: "domcontentloaded" });
      inventory.shots.push(await shot(page, "24-production-home"));
      inventory.qa.productionHasLab = await page.evaluate(() => Boolean(window.__PS04M5_LAB__ || window.__PS04M4_LAB__));
      inventory.qa.productionTitle = await page.title();
      await context.close();
    }

    if (!existsSync(path.join(BOARDS, "14-single-merch-dark.png"))) {
      const { context, page } = await freshPage(browser, "theme=dark&dpr=1");
      await waitActor(page);
      for (const [node, name] of SINGLE_NAMES) {
        await go(page, node);
        inventory.shots.push(await shot(page, `14-single-${name}-dark`));
      }
      await context.close();
    }

    const captureTransition = async (name, from, to) => recordClip(browser, name, async (page, watched) => {
      await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await go(page, from);
      await lab(page, () => window.__PS04M5_LAB__.startM5Trace());
      await lab(page, (node) => window.__PS04M5_LAB__.scrollToNode(node, "auto"), to);
      watched.probes = await probeStrip(page, name, 1800);
      await waitNode(page, to);
      await waitVisualSettled(page);
      await waitActor(page);
      watched.trace = await lab(page, () => window.__PS04M5_LAB__.stopM5Trace());
      watched.summary = summarizeTrace(watched.trace);
    });

    inventory.videos.push(await captureTransition("cases-to-content", "04", "05.1"));
    inventory.videos.push(await captureTransition("content-to-cases", "05.1", "04"));
    inventory.videos.push(await captureTransition("content-to-design", "05.1", "05.2"));
    inventory.videos.push(await captureTransition("merch-to-team", "05.7", "06.1"));
    inventory.videos.push(await captureTransition("team-to-merch", "06.1", "05.7"));

    inventory.videos.push(await recordClip(browser, "seven-singles", async (page, watched) => {
      await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await lab(page, () => window.__PS04M5_LAB__.startM5Trace());
      for (const node of SINGLES) await go(page, node);
      for (const node of [...SINGLES].reverse().slice(1)) await go(page, node);
      watched.trace = await lab(page, () => window.__PS04M5_LAB__.stopM5Trace());
      watched.summary = summarizeTrace(watched.trace);
    }));

    inventory.videos.push(await recordClip(browser, "rapid-latest-target", async (page, watched) => {
      await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await lab(page, () => window.__PS04M5_LAB__.startM5Trace());
      const nodes = ["05.1", "05.2", "05.3", "05.4", "05.5"];
      for (let index = 0; index < 20; index += 1) {
        await lab(page, (id) => window.__PS04M5_LAB__.scrollToNode(id, "auto"), nodes[index % nodes.length]);
      }
      await waitVisualSettled(page, 60000);
      await waitActor(page);
      watched.trace = await lab(page, () => window.__PS04M5_LAB__.stopM5Trace());
      watched.summary = summarizeTrace(watched.trace);
      watched.finalNode = await lab(page, () => window.__PS04M5_LAB__.activeNode);
    }));

    inventory.videos.push(await recordClip(browser, "full-down-up", async (page, watched) => {
      await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await lab(page, () => window.__PS04M5_LAB__.startM5Trace());
      await go(page, "08");
      watched.footer = await silhouette(page);
      await go(page, "01");
      watched.returnDraws = await lab(page, () => window.__PS04M5_LAB__.stats.lastActorDrawCalls);
      await go(page, "08");
      await go(page, "01");
      watched.trace = await lab(page, () => window.__PS04M5_LAB__.stopM5Trace());
      watched.summary = summarizeTrace(watched.trace);
    }));

    inventory.videos.push(await recordClip(browser, "reduced-motion", async (page, watched) => {
      await page.goto(`${LAB}?theme=light&dpr=1&reduced=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await lab(page, () => window.__PS04M5_LAB__.startM5Trace());
      await go(page, "04");
      await go(page, "05.1");
      await go(page, "05.2");
      await go(page, "06.1");
      watched.trace = await lab(page, () => window.__PS04M5_LAB__.stopM5Trace());
      watched.summary = summarizeTrace(watched.trace);
    }, { reducedMotion: true }));

    inventory.videos.push(await recordClip(browser, "context-restore", async (page, watched) => {
      await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await lab(page, () => window.__PS04M5_LAB__.loseContext());
      await page.waitForTimeout(900);
      await waitActor(page, 30000);
      watched.after = await silhouette(page);
    }));

    inventory.videos.push(await recordClip(browser, "keyboard-navigation", async (page, watched) => {
      await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await page.keyboard.press("PageDown");
      await page.waitForTimeout(700);
      await page.keyboard.press("PageDown");
      await page.waitForTimeout(900);
      watched.node = await lab(page, () => window.__PS04M5_LAB__.activeNode);
    }));

    inventory.videos.push(await recordClip(browser, "graph-jump", async (page, watched) => {
      await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await page.locator('[data-hit="02"]').click({ force: true });
      await waitNode(page, "02");
      await waitVisualSettled(page, 90000);
      await waitActor(page);
      watched.node = await lab(page, () => window.__PS04M5_LAB__.activeNode);
    }));

    inventory.videos.push(await recordClip(browser, "scroll-jitter-boundary", async (page, watched) => {
      await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await go(page, "04");
      await lab(page, () => window.__PS04M5_LAB__.startM5Trace());
      const y = await lab(page, () => window.scrollY);
      for (let index = 0; index < 8; index += 1) {
        await page.mouse.wheel(0, index % 2 === 0 ? 28 : -22);
        await page.waitForTimeout(80);
      }
      await page.waitForTimeout(700);
      watched.scrollY = [y, await lab(page, () => window.scrollY)];
      watched.trace = await lab(page, () => window.__PS04M5_LAB__.stopM5Trace());
      watched.summary = summarizeTrace(watched.trace);
      watched.node = await lab(page, () => window.__PS04M5_LAB__.activeNode);
    }));

    inventory.videos.push(await recordClip(browser, "cold-navigation-content", async (page, watched) => {
      await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await lab(page, () => window.__PS04M5_LAB__.startM5Trace());
      await lab(page, () => window.__PS04M5_LAB__.scrollToNode("05.1", "auto"));
      await waitNode(page, "05.1");
      await waitVisualSettled(page, 90000);
      await waitActor(page);
      watched.trace = await lab(page, () => window.__PS04M5_LAB__.stopM5Trace());
      watched.summary = summarizeTrace(watched.trace);
      watched.screen = await silhouette(page);
    }));

    for (const video of inventory.videos) {
      if (video.trace) inventory.traces[video.name] = { summary: video.summary, frames: video.trace };
    }

    writeFileSync(path.join(REPORTS, "capture-inventory.json"), JSON.stringify({
      capturedAt: new Date().toISOString(),
      shots: inventory.shots,
      videos: inventory.videos.map((row) => ({
        name: row.name,
        file: row.file,
        summary: row.summary,
        probes: row.probes?.length ?? 0,
        node: row.node,
        finalNode: row.finalNode,
        footer: row.footer,
        after: row.after,
        returnDraws: row.returnDraws,
        screen: row.screen,
      })),
      screens: inventory.screens,
      qa: inventory.qa,
    }, null, 2));
    writeFileSync(path.join(REPORTS, "transition-trace.json"), JSON.stringify({
      capturedAt: new Date().toISOString(),
      traces: inventory.traces,
    }, null, 2));
    writeFileSync(path.join(REPORTS, "screen-visibility.json"), JSON.stringify(inventory.screens, null, 2));
    process.stdout.write(`${JSON.stringify({
      shots: inventory.shots.length,
      videos: inventory.videos.length,
      screens: inventory.screens.length,
      required: ["cases-to-content", "content-to-cases", "content-to-design", "seven-singles", "merch-to-team", "team-to-merch", "rapid-latest-target", "full-down-up", "reduced-motion", "context-restore"].every((name) => inventory.videos.some((row) => row.name === name && row.file)),
    }, null, 2)}\n`);
  } catch (error) {
    writeFileSync(path.join(REPORTS, "capture-inventory.json"), JSON.stringify({
      ok: false,
      error: String(error),
      stack: error instanceof Error ? error.stack : null,
      inventory: {
        shots: inventory.shots,
        videos: inventory.videos.map((row) => ({ name: row.name, file: row.file, summary: row.summary })),
      },
    }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
