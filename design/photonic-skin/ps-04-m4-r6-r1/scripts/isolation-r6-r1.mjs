import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const BOARDS = path.join(ROOT, "design/photonic-skin/ps-04-m4-r6-r1/renders/boards");
const REPORTS = path.join(ROOT, "design/photonic-skin/ps-04-m4-r6-r1/reports");
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m4`;
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

async function probe(page) {
  return page.evaluate(() => {
    const lab = window.__PS04M4_LAB__;
    const silhouette = typeof lab.framebufferSilhouette === "function" ? lab.framebufferSilhouette() : null;
    const samplers = typeof lab.getMaterialSamplerSnapshot === "function" ? lab.getMaterialSamplerSnapshot() : null;
    const inventory = typeof lab.textureInventory === "function" ? lab.textureInventory() : null;
    const live = typeof lab.liveBankGpuParity === "function" ? lab.liveBankGpuParity() : null;
    return {
      sessionId: lab.sessionId,
      stage: lab.stage,
      node: lab.activeNode,
      labReady: lab.labReady ?? lab.ready,
      actorResourceReady: lab.actorResourceReady,
      actorFramebufferReady: lab.actorFramebufferReady,
      draws: lab.stats.lastActorDrawCalls,
      triangles: lab.stats.lastActorTriangles,
      programs: lab.stats.programs,
      textures: lab.stats.textures,
      actorDraw: lab.composition()?.actorDraw ?? null,
      silhouette,
      samplers,
      liveBank: live,
      gpuReady: lab.resource?.()?.gpuReady ?? lab.gpuPool?.()?.gpuReady ?? null,
      bank: lab.gpuPool?.() ?? null,
      failDrawWithoutPixels: Boolean(lab.stats.lastActorDrawCalls === 1 && (silhouette?.visiblePixelCount === 0)),
    };
  });
}

async function openFresh(browser, query = "theme=light&dpr=1", viewport = { width: 1440, height: 900 }, dpr = 1) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  await page.goto(`${LAB}?${query}`, { waitUntil: "domcontentloaded" });
  await waitLab(page);
  return { context, page };
}

async function shot(page, name) {
  const file = path.join(BOARDS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file.replaceAll("\\", "/");
}

async function runCase(browser, name, action) {
  const started = Date.now();
  const { context, page } = await openFresh(browser);
  const readyMs = Date.now() - started;
  const afterReady = await probe(page);
  let appearedAtMs = afterReady.actorFramebufferReady ? readyMs : null;
  if (action === "wait5") {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const now = await probe(page);
      if (now.actorFramebufferReady && appearedAtMs == null) appearedAtMs = Date.now() - started;
      await page.waitForTimeout(200);
    }
  } else if (action === "invalidate") {
    await page.evaluate(() => window.__PS04M4_LAB__.forceInvalidateOnly());
    await page.waitForTimeout(800);
  } else if (action === "rebind") {
    await page.evaluate(() => window.__PS04M4_LAB__.forceRebindActiveBankOnly());
    await page.waitForTimeout(800);
  } else if (action === "reupload") {
    await page.evaluate(() => window.__PS04M4_LAB__.forceReuploadActiveBankOnly());
    await page.waitForTimeout(800);
  } else if (action === "republish") {
    await page.evaluate(() => window.__PS04M4_LAB__.forceFullBankRepublish());
    await page.waitForTimeout(800);
  } else if (action === "dpr15") {
    await page.evaluate(() => window.__PS04M4_LAB__.setDpr(1.5));
    await page.waitForTimeout(800);
  } else if (action === "resize") {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(800);
  } else if (action === "restore") {
    await page.evaluate(() => window.__PS04M4_LAB__.loseContext());
    await page.waitForTimeout(1200);
  }
  const after = await probe(page);
  const file = await shot(page, name);
  await context.close();
  return {
    name,
    readyMs,
    appearedAtMs,
    afterReady: {
      actorFramebufferReady: afterReady.actorFramebufferReady,
      visiblePixelCount: afterReady.silhouette?.visiblePixelCount ?? null,
      draws: afterReady.draws,
    },
    after,
    screenshot: file,
    actorVisible: Boolean(after.actorFramebufferReady && (after.silhouette?.visiblePixelCount ?? 0) > 0),
    failDrawWithoutPixels: after.failDrawWithoutPixels,
  };
}

async function main() {
  const browser = await chromium.launch(LAUNCH);
  const rows = [];
  try {
    rows.push(await runCase(browser, "06-isolation-fresh-default", "wait5"));
    rows.push(await runCase(browser, "06-isolation-invalidate-only", "invalidate"));
    rows.push(await runCase(browser, "07-isolation-rebind-only", "rebind"));
    rows.push(await runCase(browser, "08-isolation-reupload-only", "reupload"));
    rows.push(await runCase(browser, "08b-isolation-full-republish", "republish"));
    const stagingOff = await (async () => {
      const started = Date.now();
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.goto(`${LAB}?theme=light&dpr=1&r6Staging=0`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await page.waitForTimeout(1200);
      const after = await probe(page);
      const screenshot = await shot(page, "05-control-r6staging-0");
      await context.close();
      return { name: "05-control-r6staging-0", readyMs: Date.now() - started, after, screenshot, actorVisible: (after.draws ?? 0) > 0 };
    })();
    rows.push(stagingOff);
    rows.push(await runCase(browser, "10-positive-dpr-1.5", "dpr15"));
    rows.push(await runCase(browser, "11-positive-resize", "resize"));
    rows.push(await runCase(browser, "12-positive-context-restore", "restore"));
    const report = {
      capturedAt: new Date().toISOString(),
      method: "Each case uses a new Playwright browser context on /visual-lab/photonic-skin-ps04-m4?theme=light&dpr=1 unless noted. Isolation commands never switch DPR/resize/context except the dedicated positive-control rows.",
      rows,
    };
    writeFileSync(path.join(REPORTS, "isolation-matrix.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify(rows.map((row) => ({ name: row.name, visible: row.actorVisible, pixels: row.after?.silhouette?.visiblePixelCount ?? null, ready: row.after?.actorFramebufferReady })), null, 2)}\n`);
  } catch (error) {
    writeFileSync(path.join(REPORTS, "isolation-matrix.json"), JSON.stringify({ ok: false, error: String(error), stack: error.stack, rows }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
