import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m4-r6-r1/renders/browser");
const VIDEO = path.join(OUT, "video");
const BOARDS = path.join(ROOT, "design/photonic-skin/ps-04-m4-r6-r1/renders/boards");
const REPORTS = path.join(ROOT, "design/photonic-skin/ps-04-m4-r6-r1/reports");
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m4`;
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

async function waitLab(page) {
  await page.waitForSelector("canvas", { timeout: 90000 });
  await page.waitForFunction(() => {
    const lab = window.__PS04M4_LAB__;
    return Boolean(lab && lab.runId === "ps04-m4" && lab.ready);
  }, null, { timeout: 90000 });
}

async function waitActor(page, timeout = 30000) {
  await page.waitForFunction(() => {
    const lab = window.__PS04M4_LAB__;
    if (!lab) return false;
    if (lab.activeNode === "08") return lab.actorFramebufferReady === true && lab.composition()?.actorDraw === false;
    return lab.actorFramebufferReady === true && (lab.stats.lastActorDrawCalls === 1 || lab.composition()?.actorDraw === false);
  }, null, { timeout });
}

async function waitNode(page, id) {
  await page.waitForFunction((node) => window.__PS04M4_LAB__.activeNode === node, id, { timeout: 40000 });
}

async function waitVisualSettled(page, timeout = 40000) {
  await page.waitForFunction(() => {
    const lab = window.__PS04M4_LAB__;
    if (!lab || lab.loading) return false;
    if (lab.activeNode === "08") return lab.composition()?.actorDraw === false;
    const geo = typeof lab.geometrySnapshot === "function" ? lab.geometrySnapshot() : null;
    const tx = typeof lab.transaction === "function" ? lab.transaction() : null;
    if (geo && (geo.status !== "settled" || geo.shaderProgress < 0.999)) return false;
    if (tx && tx.visualLifecycle && tx.visualLifecycle !== "settled") return false;
    return true;
  }, null, { timeout });
}

async function dump(page) {
  return page.evaluate(() => {
    const lab = window.__PS04M4_LAB__;
    return {
      node: lab?.activeNode,
      ready: lab?.ready,
      actorFramebufferReady: lab?.actorFramebufferReady,
      draws: lab?.stats?.lastActorDrawCalls,
      geo: typeof lab.geometrySnapshot === "function" ? lab.geometrySnapshot() : null,
      tx: typeof lab.transaction === "function" ? lab.transaction() : null,
      resource: typeof lab.resource === "function" ? lab.resource() : null,
      gpu: typeof lab.gpuPool === "function" ? lab.gpuPool() : null,
    };
  });
}

async function go(page, id) {
  await page.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), id);
  try {
    await waitNode(page, id);
    if (id !== "08") {
      await waitVisualSettled(page, 90000);
      await waitActor(page, 30000);
    } else {
      await page.waitForFunction(() => window.__PS04M4_LAB__.composition()?.actorDraw === false, null, { timeout: 20000 });
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
  return page.evaluate(() => {
    const lab = window.__PS04M4_LAB__;
    return {
      node: lab.activeNode,
      actorDraw: lab.composition()?.actorDraw ?? false,
      actorFramebufferReady: lab.actorFramebufferReady,
      draws: lab.stats.lastActorDrawCalls,
      silhouette: typeof lab.framebufferSilhouette === "function" ? lab.framebufferSilhouette() : null,
      liveBank: typeof lab.liveBankGpuParity === "function" ? lab.liveBankGpuParity() : null,
      samplers: typeof lab.getMaterialSamplerSnapshot === "function" ? lab.getMaterialSamplerSnapshot() : null,
    };
  });
}

async function freshPage(browser, query, viewport = { width: 1440, height: 900 }, dpr = 1) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  await page.goto(`${LAB}?${query}`, { waitUntil: "domcontentloaded" });
  await waitLab(page);
  return { context, page };
}

async function recordClip(browser, name, setup, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO, size: viewport },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  const watched = { name };
  try {
    await setup(page);
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
  const inventory = { shots: [], videos: [], screens: [] };
  try {
    const fresh = [
      ["02-r6r1-fresh-light-dpr1", "theme=light&dpr=1", { width: 1440, height: 900 }, 1],
      ["04-r6r1-fresh-dark-dpr1", "theme=dark&dpr=1", { width: 1440, height: 900 }, 1],
      ["09-fresh-light-dpr1", "theme=light&dpr=1", { width: 1440, height: 900 }, 1],
      ["10-fresh-light-dpr1.5", "theme=light&dpr=1.5", { width: 1440, height: 900 }, 1.5],
      ["11-fresh-light-dpr2", "theme=light&dpr=2", { width: 1440, height: 900 }, 2],
      ["10b-fresh-dark-dpr1.5", "theme=dark&dpr=1.5", { width: 1440, height: 900 }, 1.5],
      ["11b-fresh-dark-dpr2", "theme=dark&dpr=2", { width: 1440, height: 900 }, 2],
      ["12-mobile-390", "theme=light&dpr=1", { width: 390, height: 844 }, 1],
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

    const singles = [
      ["05.1", "content"], ["05.2", "design"], ["05.3", "event"],
      ["05.4", "games"], ["05.5", "video"], ["05.6", "digital"], ["05.7", "merch"],
    ];
    if (!existsSync(path.join(BOARDS, "24-production-home.png"))) {
    const { context, page } = await freshPage(browser, "theme=light&dpr=1");
    await waitActor(page);
    inventory.shots.push(await shot(page, "13-hero-master"));
    await go(page, "02");
    inventory.shots.push(await shot(page, "14-about-brand-wide"));
    await go(page, "03.1");
    inventory.shots.push(await shot(page, "15-build-family"));
    await go(page, "04");
    inventory.shots.push(await shot(page, "16-cases-master"));
    for (const [node, name] of singles) {
      await go(page, node);
      inventory.shots.push(await shot(page, `17-single-${name}-light`));
      inventory.screens.push({ name, ...(await silhouette(page)) });
    }
    await go(page, "06.1");
    inventory.shots.push(await shot(page, "19-subsequent-master"));
    await go(page, "08");
    inventory.shots.push(await shot(page, "20-footer-none"));
    inventory.screens.push({ name: "footer", ...(await silhouette(page)) });
    await go(page, "01");
    await waitActor(page);
    await page.evaluate(() => window.__PS04M4_LAB__.loseContext());
    await page.waitForTimeout(900);
    await waitActor(page, 30000);
    inventory.shots.push(await shot(page, "12-context-restore"));
    await go(page, "01");
    await go(page, "08");
    await go(page, "01");
    inventory.shots.push(await shot(page, "23-resource-cycle-1"));
    await go(page, "08");
    await go(page, "01");
    inventory.shots.push(await shot(page, "23b-resource-cycle-2"));
    await page.goto(HOME, { waitUntil: "domcontentloaded" });
    inventory.shots.push(await shot(page, "24-production-home"));
    await context.close();
    }

    if (!existsSync(path.join(BOARDS, "18-single-merch-dark.png"))) {
    const { context: darkCtx, page: darkPage } = await freshPage(browser, "theme=dark&dpr=1");
    await waitActor(darkPage);
    for (const [node, name] of singles) {
      await go(darkPage, node);
      inventory.shots.push(await shot(darkPage, `18-single-${name}-dark`));
    }
    await darkCtx.close();
    }

    const { context: maskCtx, page: maskPage } = await freshPage(browser, "theme=light&dpr=1&actorMask=1&ui=0");
    await waitActor(maskPage);
    inventory.shots.push(await shot(maskPage, "21-mask-bbox-hero"));
    await go(maskPage, "05.1");
    inventory.shots.push(await shot(maskPage, "21b-mask-bbox-content"));
    inventory.screens.push({ name: "mask-content", ...(await silhouette(maskPage)) });
    await maskCtx.close();

    const { context: parityCtx, page: parityPage } = await freshPage(browser, "theme=light&dpr=1");
    await waitActor(parityPage);
    const live = await silhouette(parityPage);
    writeFileSync(path.join(REPORTS, "live-bank-parity.json"), JSON.stringify(live, null, 2));
    inventory.shots.push(await shot(parityPage, "22-live-bank-parity"));
    await parityCtx.close();

    inventory.videos.push(await recordClip(browser, "fresh-load-no-interaction", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(clip);
      await waitActor(clip);
      await clip.waitForTimeout(1800);
    }));
    inventory.videos.push(await recordClip(browser, "cold-navigation-visible", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(clip);
      await waitActor(clip);
      await go(clip, "04");
      await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.1", "auto"));
      await waitNode(clip, "05.1");
      await waitActor(clip);
      await waitVisualSettled(clip);
    }));
    inventory.videos.push(await recordClip(browser, "continuous-idle-visible", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(clip);
      await waitActor(clip);
      await go(clip, "05.1");
      await clip.waitForTimeout(2200);
    }));
    inventory.videos.push(await recordClip(browser, "warm-content-design", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(clip);
      await waitActor(clip);
      await go(clip, "05.1");
      await go(clip, "05.2");
    }));
    inventory.videos.push(await recordClip(browser, "seven-singles", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(clip);
      await waitActor(clip);
      for (const node of ["05.1", "05.2", "05.3", "05.4", "05.5", "05.6", "05.7"]) await go(clip, node);
      for (const node of ["05.6", "05.5", "05.4", "05.3", "05.2", "05.1"]) await go(clip, node);
    }));
    inventory.videos.push(await recordClip(browser, "right-left", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(clip);
      await waitActor(clip);
      await go(clip, "04");
      await go(clip, "05.1");
    }));
    inventory.videos.push(await recordClip(browser, "rapid-latest-target", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(clip);
      await waitActor(clip);
      const nodes = ["05.1", "05.2", "05.3", "05.4", "05.5"];
      for (let index = 0; index < 20; index += 1) {
        await clip.evaluate((id) => window.__PS04M4_LAB__.scrollToNode(id, "auto"), nodes[index % nodes.length]);
      }
      await waitVisualSettled(clip, 60000);
      await waitActor(clip);
    }));
    inventory.videos.push(await recordClip(browser, "context-restore", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(clip);
      await waitActor(clip);
      await clip.evaluate(() => window.__PS04M4_LAB__.loseContext());
      await clip.waitForTimeout(900);
      await waitActor(clip, 30000);
    }));
    inventory.videos.push(await recordClip(browser, "second-resource-cycle", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(clip);
      await waitActor(clip);
      await go(clip, "08");
      await go(clip, "01");
      await go(clip, "08");
      await go(clip, "01");
    }));

    writeFileSync(path.join(REPORTS, "capture-inventory.json"), JSON.stringify({ capturedAt: new Date().toISOString(), ...inventory }, null, 2));
    writeFileSync(path.join(REPORTS, "screen-visibility.json"), JSON.stringify(inventory.screens, null, 2));
    process.stdout.write(`${JSON.stringify({ shots: inventory.shots.length, videos: inventory.videos.length, screens: inventory.screens.length }, null, 2)}\n`);
  } catch (error) {
    writeFileSync(path.join(REPORTS, "capture-inventory.json"), JSON.stringify({ ok: false, error: String(error), stack: error.stack, inventory }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
