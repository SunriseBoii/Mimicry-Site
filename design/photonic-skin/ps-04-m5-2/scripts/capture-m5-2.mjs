import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m5-2/renders/browser");
const VIDEO = path.join(OUT, "video");
const BOARDS = path.join(ROOT, "design/photonic-skin/ps-04-m5-2/renders/boards");
const REPORTS = path.join(ROOT, "design/photonic-skin/ps-04-m5-2/reports");
const BASE = process.env.PS04M52_BASE ?? "http://localhost:3001";
const SANDBOX = `${BASE}/visual-lab/photonic-skin-ps04-m5/event-sandbox`;
const M51 = `${BASE}/visual-lab/photonic-skin-ps04-m5`;
const HOME = `${BASE}/`;

mkdirSync(OUT, { recursive: true });
mkdirSync(VIDEO, { recursive: true });
mkdirSync(BOARDS, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

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
    const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
    return Boolean(handle && handle.runId === "ps04-m5-2" && handle.ready);
  }, null, { timeout: 120000 });
}

async function waitEventOverlay(page) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
    if (!handle || handle.runId !== "ps04-m5-2" || !handle.ready) return false;
    const hash = typeof handle.overlayHash === "function" ? handle.overlayHash() : null;
    const geo = typeof handle.geometrySnapshot === "function" ? handle.geometrySnapshot() : null;
    const counts = typeof handle.componentCounts === "function" ? handle.componentCounts() : null;
    const overlay = typeof hash === "string" && hash.startsWith("ps04-m5-2-");
    const eventSettled = geo?.settledGeometryId === "single-event" && (geo.status === "settled" || geo.shaderProgress >= 0.999);
    const notMaster = Array.isArray(counts) ? counts.slice(1).some((value) => value > 0) : overlay;
    return overlay && eventSettled && notMaster && handle.activeNode === "05.3";
  }, null, { timeout: 120000 });
}

async function waitM51(page) {
  await page.waitForSelector("canvas", { timeout: 120000 });
  await page.waitForFunction(() => {
    const handle = window.__PS04M5_LAB__;
    return Boolean(handle && handle.runId === "ps04-m5" && handle.ready);
  }, null, { timeout: 120000 });
}

async function waitActor(page, timeout = 40000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
    if (!handle) return false;
    if (handle.activeNode === "08") return handle.actorFramebufferReady === true && handle.composition()?.actorDraw === false;
    return handle.actorFramebufferReady === true && (handle.stats.lastActorDrawCalls === 1 || handle.composition()?.actorDraw === false);
  }, null, { timeout });
}

async function waitNode(page, id) {
  await page.waitForFunction((node) => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).activeNode === node, id, { timeout: 40000 });
}

async function waitVisualSettled(page, timeout = 50000) {
  await page.waitForFunction(() => {
    const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
    if (!handle || handle.loading) return false;
    if (handle.activeNode === "08") return handle.composition()?.actorDraw === false;
    const geo = typeof handle.geometrySnapshot === "function" ? handle.geometrySnapshot() : null;
    const tx = typeof handle.transaction === "function" ? handle.transaction() : null;
    if (geo && (geo.status !== "settled" || geo.shaderProgress < 0.999)) return false;
    if (tx && tx.visualLifecycle && tx.visualLifecycle !== "settled") return false;
    return true;
  }, null, { timeout });
}

async function go(page, id) {
  await lab(page, (node) => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).scrollToNode(node, "auto"), id);
  await waitNode(page, id);
  if (id !== "08") {
    await waitVisualSettled(page, 90000);
    await waitActor(page, 30000);
    if (id === "05.3") await waitEventOverlay(page);
  } else {
    await page.waitForFunction(() => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).composition()?.actorDraw === false, null, { timeout: 20000 });
  }
}

async function shot(page, name) {
  const file = path.join(BOARDS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file.replaceAll("\\", "/");
}

async function openSandbox(browser, query, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  await page.goto(`${SANDBOX}?${query}`, { waitUntil: "domcontentloaded" });
  await waitLab(page);
  if (!String(query).includes("mode=transition")) {
    await waitEventOverlay(page);
  }
  await waitActor(page);
  await waitVisualSettled(page);
  return { context, page };
}

async function snapshot(page) {
  return lab(page, () => {
    const handle = window.__PS04M52_LAB__ || window.__PS04M5_LAB__;
    const silhouette = typeof handle.framebufferSilhouette === "function" ? handle.framebufferSilhouette() : null;
    return {
      runId: handle.runId,
      variant: handle.variant,
      view: handle.view,
      node: handle.activeNode,
      draws: handle.stats.lastActorDrawCalls,
      triangles: handle.stats.lastActorTriangles,
      programs: handle.stats.programs,
      textures: handle.stats.textures,
      canvases: handle.canvasCount(),
      actorDraw: handle.composition()?.actorDraw,
      pixels: silhouette?.pixelCount ?? null,
      geo: typeof handle.geometrySnapshot === "function" ? handle.geometrySnapshot() : null,
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
  const inventory = { shots: [], videos: [], qa: {}, cycle: [] };
  try {
    const canonicalBoards = [
      ["baseline", "light", "1", "baseline-canonical-light"],
      ["baseline", "dark", "1", "baseline-canonical-dark"],
      ["a", "light", "1", "a-rotate180-canonical-light"],
      ["a", "dark", "1", "a-rotate180-canonical-dark"],
      ["b", "light", "1", "b-open-stage-canonical-light"],
      ["b", "dark", "1", "b-open-stage-canonical-dark"],
      ["c", "light", "1", "c-four-islands-canonical-light"],
      ["c", "dark", "1", "c-four-islands-canonical-dark"],
    ];
    for (const [variant, theme, labels, name] of canonicalBoards) {
      const { context, page } = await openSandbox(browser, `variant=${variant}&view=canonical&theme=${theme}&labels=${labels}&mode=settled&dpr=1`);
      inventory.shots.push(await shot(page, name));
      inventory.qa[name] = await snapshot(page);
      await context.close();
    }

    const extraViews = [
      ["canonical", "0", "four-up-unlabelled-browser-baseline", "baseline"],
      ["opposite", "1", "opposite-baseline", "baseline"],
      ["opposite", "1", "opposite-b", "b"],
      ["opposite", "1", "opposite-c", "c"],
      ["side", "1", "side-b", "b"],
      ["side", "1", "side-c", "c"],
      ["top", "1", "top-b", "b"],
      ["top", "1", "top-c", "c"],
    ];
    for (const [view, labels, name, variant] of extraViews) {
      const { context, page } = await openSandbox(browser, `variant=${variant}&view=${view}&theme=light&labels=${labels}&mode=settled&dpr=1`);
      inventory.shots.push(await shot(page, name));
      await context.close();
    }

    {
      const { context, page } = await openSandbox(browser, "variant=c&view=canonical&theme=light&labels=1&mode=settled&dpr=1");
      await go(page, "08");
      inventory.shots.push(await shot(page, "20-footer-no-actor"));
      inventory.qa.footer = await snapshot(page);
      await context.close();
    }

    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.goto(`${M51}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitM51(page);
      await waitActor(page);
      inventory.shots.push(await shot(page, "18-m51-route-regression"));
      inventory.qa.m51 = { runId: await page.evaluate(() => window.__PS04M5_LAB__?.runId), node: await page.evaluate(() => window.__PS04M5_LAB__?.activeNode) };
      await page.goto(HOME, { waitUntil: "domcontentloaded" });
      inventory.shots.push(await shot(page, "19-production-homepage"));
      inventory.qa.productionHasLab = await page.evaluate(() => Boolean(window.__PS04M5_LAB__ || window.__PS04M52_LAB__ || window.__PS04M4_LAB__));
      await context.close();
    }

    const captureDeg = async (name, variant, sequence, extraQuery = "") => recordClip(browser, name, async (page, watched) => {
      await page.goto(`${SANDBOX}?variant=${variant}&view=canonical&theme=light&labels=1&mode=transition&dpr=1${extraQuery}`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await go(page, sequence[0]);
      await lab(page, () => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).startM5Trace());
      for (const node of sequence.slice(1)) await go(page, node);
      watched.trace = await lab(page, () => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).stopM5Trace());
      watched.final = await snapshot(page);
    });

    inventory.videos.push(await captureDeg("baseline-design-event-games", "baseline", ["05.2", "05.3", "05.4"]));
    inventory.videos.push(await captureDeg("a-design-event-games", "a", ["05.2", "05.3", "05.4"]));
    inventory.videos.push(await captureDeg("b-design-event-games", "b", ["05.2", "05.3", "05.4"]));
    inventory.videos.push(await captureDeg("c-design-event-games", "c", ["05.2", "05.3", "05.4"]));
    inventory.videos.push(await captureDeg("a-reverse", "a", ["05.4", "05.3", "05.2"]));
    inventory.videos.push(await captureDeg("b-reverse", "b", ["05.4", "05.3", "05.2"]));
    inventory.videos.push(await captureDeg("c-reverse", "c", ["05.4", "05.3", "05.2"]));

    inventory.videos.push(await recordClip(browser, "b-idle", async (page, watched) => {
      await page.goto(`${SANDBOX}?variant=b&view=canonical&theme=light&labels=1&mode=settled&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await go(page, "05.3");
      await page.waitForTimeout(5200);
      watched.final = await snapshot(page);
    }));
    inventory.videos.push(await recordClip(browser, "c-idle", async (page, watched) => {
      await page.goto(`${SANDBOX}?variant=c&view=canonical&theme=light&labels=1&mode=settled&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await go(page, "05.3");
      await page.waitForTimeout(5200);
      watched.final = await snapshot(page);
    }));
    inventory.videos.push(await recordClip(browser, "event-rapid-retarget", async (page, watched) => {
      await page.goto(`${SANDBOX}?variant=c&view=canonical&theme=light&labels=1&mode=transition&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await go(page, "05.2");
      await lab(page, () => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).startM5Trace());
      const nodes = ["05.2", "05.3", "05.4", "05.3", "05.2"];
      for (let index = 0; index < 20; index += 1) {
        await lab(page, (id) => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).scrollToNode(id, "auto"), nodes[index % nodes.length]);
      }
      await waitVisualSettled(page, 60000);
      watched.trace = await lab(page, () => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).stopM5Trace());
      watched.final = await snapshot(page);
      watched.note = "PS04-M5-R001 may appear; not fixed on M5.2";
    }));
    inventory.videos.push(await recordClip(browser, "event-reduced-motion", async (page, watched) => {
      await page.goto(`${SANDBOX}?variant=c&view=canonical&theme=light&labels=1&mode=transition&dpr=1&reduced=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await waitActor(page);
      await go(page, "05.2");
      await go(page, "05.3");
      await go(page, "05.4");
      watched.final = await snapshot(page);
    }, { reducedMotion: true }));

    {
      const { context, page } = await openSandbox(browser, "variant=baseline&view=canonical&theme=light&labels=1&mode=settled&dpr=1");
      const variants = ["baseline", "a", "b", "c"];
      for (let cycle = 0; cycle < 20; cycle += 1) {
        for (const variant of variants) {
          await page.goto(`${SANDBOX}?variant=${variant}&view=canonical&theme=light&labels=1&mode=settled&dpr=1`, { waitUntil: "domcontentloaded" });
          await waitLab(page);
          await waitActor(page);
        }
        inventory.cycle.push({
          cycle,
          ...(await snapshot(page)),
          resource: await lab(page, () => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).resource?.() ?? null),
          gpu: await lab(page, () => (window.__PS04M52_LAB__ || window.__PS04M5_LAB__).gpuPool?.() ?? null),
        });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  writeFileSync(path.join(REPORTS, "browser-capture.json"), JSON.stringify({ capturedAt: new Date().toISOString(), ...inventory }, null, 2));
  process.stdout.write(`${JSON.stringify({ shots: inventory.shots.length, videos: inventory.videos.length, cycles: inventory.cycle.length }, null, 2)}\n`);
}

main();
