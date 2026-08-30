import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m4`;
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m4-r6/reports");
mkdirSync(OUT, { recursive: true });

async function waitM4(page) {
  await page.waitForSelector("canvas", { timeout: 60000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M4_LAB__;
    return Boolean(canvas && lab && lab.runId === "ps04-m4" && lab.ready);
  }, null, { timeout: 60000 });
}

async function waitNode(page, id, timeout = 20000) {
  await page.waitForFunction((node) => window.__PS04M4_LAB__.activeNode === node, id, { timeout });
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
    if (tx && tx.status === "running" && tx.visualLifecycle !== "settled") return false;
    return true;
  }, null, { timeout });
}

async function probe(page) {
  return page.evaluate(() => {
    const lab = window.__PS04M4_LAB__;
    const r6 = typeof lab.r6 === "function" ? lab.r6() : null;
    const geo = typeof lab.geometrySnapshot === "function" ? lab.geometrySnapshot() : null;
    const tx = typeof lab.transaction === "function" ? lab.transaction() : null;
    const snap = typeof lab.snapshot === "function" ? lab.snapshot() : null;
    const uniforms = window.__PS04M4_MATERIAL_UNIFORMS__ ?? null;
    return {
      node: lab.activeNode,
      scrollY: window.scrollY,
      sessionStatus: snap?.status ?? null,
      overlayEnabled: snap?.overlayEnabled ?? r6?.overlayEnabled ?? null,
      breath: snap?.phases?.breath ?? r6?.phases?.breath ?? null,
      rotation: snap?.phases?.rotation ?? r6?.phases?.rotation ?? null,
      visualLifecycle: tx?.visualLifecycle ?? r6?.visualLifecycle ?? null,
      resource: r6?.resource ?? (typeof lab.resource === "function" ? lab.resource() : null),
      gpuPool: typeof lab.gpuPool === "function" ? lab.gpuPool() : null,
      shaderProgress: geo?.shaderProgress ?? uniforms?.geometryProgress ?? null,
      settledGeometryId: geo?.settledGeometryId ?? null,
      programReady: tx?.programReady ?? null,
      textures: lab.stats.textures,
      programs: lab.stats.programs,
      draws: lab.stats.lastActorDrawCalls,
      triangles: lab.stats.lastActorTriangles,
      materialUuid: uniforms?.materialUuid ?? lab.stats.materialUuid ?? null,
      heap: performance.memory ? performance.memory.usedJSHeapSize : null,
      stagingEnabled: r6?.stagingEnabled ?? null,
      initTextureCount: r6?.initTextureCount ?? null,
      textureUploadCount: r6?.textureUploadCount ?? null,
      longTasks: r6?.longTasks ?? [],
      gpuTimer: r6?.gpuTimer ?? null,
    };
  });
}

async function measure(page, scenario, run) {
  await page.evaluate((name) => window.__PS04M4_LAB__.startPerf(name), scenario);
  await run();
  const perf = await page.evaluate(() => window.__PS04M4_LAB__.stopPerf());
  const snapshot = await probe(page);
  return { ...perf, snapshot };
}

async function samplePreparing(page, from, to) {
  await page.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), from);
  await waitNode(page, from);
  await waitVisualSettled(page);
  const before = await probe(page);
  await page.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), to);
  await waitNode(page, to);
  const samples = [];
  const started = Date.now();
  while (Date.now() - started < 4000) {
    const row = await probe(page);
    samples.push(row);
    if (row.visualLifecycle === "morphing" || row.visualLifecycle === "settled") break;
    await page.waitForTimeout(50);
  }
  return { before, samples, afterWait: await probe(page) };
}

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const scenarios = {};
  try {
    const stallPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    stallPage.setDefaultTimeout(60000);
    await stallPage.goto(`${LAB}?theme=light&dpr=1&r6Staging=0`, { waitUntil: "domcontentloaded" });
    await waitM4(stallPage);
    let stallCdp = null;
    try {
      stallCdp = await stallPage.context().newCDPSession(stallPage);
      await stallCdp.send("Performance.enable");
      scenarios.r5StallCdpBefore = await stallCdp.send("Performance.getMetrics");
    } catch (error) {
      scenarios.r5StallCdpError = String(error);
    }
    scenarios.r5StallIdle = await probe(stallPage);
    scenarios.r5StallWarm = await measure(stallPage, "r5-warm-content-design-r6Staging-0", async () => {
      await stallPage.evaluate(() => window.__PS04M4_LAB__.scrollToNode("04", "auto"));
      await waitNode(stallPage, "04");
      await waitVisualSettled(stallPage);
      await stallPage.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.1", "auto"));
      await waitNode(stallPage, "05.1");
      await waitVisualSettled(stallPage, 60000);
      await stallPage.waitForTimeout(8000);
      await stallPage.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.2", "auto"));
      await waitNode(stallPage, "05.2");
      await waitVisualSettled(stallPage, 60000);
    });
    if (stallCdp) {
      try {
        scenarios.r5StallCdpAfter = await stallCdp.send("Performance.getMetrics");
      } catch (error) {
        scenarios.r5StallCdpError = String(error);
      }
    }
    await stallPage.close();

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(60000);
    await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await waitM4(page);

    scenarios.idleMaster = await measure(page, "idle-master", async () => {
      await page.waitForTimeout(1200);
    });

    scenarios.navigationDuringPrepare = await samplePreparing(page, "04", "05.1");

    scenarios.idleDuringPrepare = await samplePreparing(page, "05.1", "05.2");

    scenarios.warmContentDesign = await measure(page, "warm-content-design", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.1", "auto"));
      await waitNode(page, "05.1");
      await waitVisualSettled(page);
      await page.waitForTimeout(250);
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.2", "auto"));
      await waitNode(page, "05.2");
      await waitVisualSettled(page);
    });

    scenarios.sequentialSingles = await measure(page, "content-design-event-games", async () => {
      for (const node of ["05.1", "05.2", "05.3", "05.4"]) {
        await page.evaluate((id) => window.__PS04M4_LAB__.scrollToNode(id, "auto"), node);
        await waitNode(page, node);
        await waitVisualSettled(page);
      }
    });

    scenarios.reverse = await measure(page, "games-event-design", async () => {
      for (const node of ["05.4", "05.3", "05.2"]) {
        await page.evaluate((id) => window.__PS04M4_LAB__.scrollToNode(id, "auto"), node);
        await waitNode(page, node);
        await waitVisualSettled(page);
      }
    });

    scenarios.rapid20 = await measure(page, "rapid-20", async () => {
      const nodes = ["05.1", "05.2", "05.3", "05.4", "05.5"];
      for (let index = 0; index < 20; index += 1) {
        const node = nodes[index % nodes.length];
        await page.evaluate((id) => window.__PS04M4_LAB__.scrollToNode(id, "auto"), node);
      }
      await waitVisualSettled(page, 60000);
    });

    scenarios.graphJump = await measure(page, "graph-jump", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("01", "auto"));
      await waitNode(page, "01");
      await waitVisualSettled(page);
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.7", "auto"));
      await waitNode(page, "05.7");
      await waitVisualSettled(page, 60000);
    });

    const cycleTextures = [];
    scenarios.fullCycle1 = await measure(page, "full-down-up-1", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("01", "auto"));
      await waitVisualSettled(page);
      cycleTextures.push(await probe(page));
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("08", "auto"));
      await waitVisualSettled(page);
      cycleTextures.push(await probe(page));
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("01", "auto"));
      await waitVisualSettled(page);
      cycleTextures.push(await probe(page));
    });
    scenarios.fullCycle2 = await measure(page, "full-down-up-2", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("08", "auto"));
      await waitVisualSettled(page);
      cycleTextures.push(await probe(page));
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("01", "auto"));
      await waitVisualSettled(page);
      cycleTextures.push(await probe(page));
    });
    scenarios.resourcePlateau = cycleTextures.map((row) => ({
      node: row.node,
      textures: row.textures,
      pool: row.gpuPool?.textureCount ?? null,
      heap: row.heap,
    }));

    scenarios.reduced = await measure(page, "reduced-motion", async () => {
      await page.goto(`${LAB}?theme=light&dpr=1&reduced=1`, { waitUntil: "domcontentloaded" });
      await waitM4(page);
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.2", "auto"));
      await waitNode(page, "05.2");
      await waitVisualSettled(page);
    });

    scenarios.mobile390 = await measure(page, "emulated-390", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitM4(page);
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.1", "auto"));
      await waitNode(page, "05.1");
      await waitVisualSettled(page);
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await waitM4(page);
    await page.evaluate(() => window.__PS04M4_LAB__.setDpr(1));
    scenarios.dpr1 = await measure(page, "dpr-1", async () => { await page.waitForTimeout(800); });
    await page.evaluate(() => window.__PS04M4_LAB__.setDpr(1.5));
    scenarios.dpr15 = await measure(page, "dpr-1.5", async () => { await page.waitForTimeout(800); });
    await page.evaluate(() => window.__PS04M4_LAB__.setDpr(2));
    scenarios.dpr2 = await measure(page, "dpr-2", async () => { await page.waitForTimeout(800); });
    await page.evaluate(() => window.__PS04M4_LAB__.setDpr(1));

    scenarios.contextRestore = await measure(page, "context-restore", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.1", "auto"));
      await waitNode(page, "05.1");
      await waitVisualSettled(page);
      const before = await probe(page);
      await page.evaluate(() => window.__PS04M4_LAB__.loseContext());
      await page.waitForTimeout(900);
      await waitVisualSettled(page, 60000);
      scenarios.contextRestoreProbe = { before, after: await probe(page) };
    });

    const longTaskMax = (row) => Math.max(0, ...(row?.longTasks ?? row?.r6LongTasks ?? []).map((task) => task.duration));
    const report = {
      capturedAt: new Date().toISOString(),
      note: "rAF from in-page NaturalRafRecorder. r6Staging=0 reproduces the R5 first-visible-bind stall. Default path uses GPU-resident banks. GPU timer samples actor draws via EXT_disjoint_timer_query_webgl2.",
      stallRepro: {
        rAFMax: scenarios.r5StallWarm?.rAF?.max ?? null,
        longTaskMax: longTaskMax(scenarios.r5StallWarm),
        longTasks: scenarios.r5StallWarm?.longTasks ?? scenarios.r5StallWarm?.r6LongTasks ?? [],
        durationMs: scenarios.r5StallWarm?.transitionDurationMs ?? null,
        heap: scenarios.r5StallWarm?.memory ?? scenarios.r5StallWarm?.snapshot?.heap ?? null,
        textures: scenarios.r5StallWarm?.resources?.textures ?? scenarios.r5StallWarm?.snapshot?.textures ?? null,
        initTextureCount: scenarios.r5StallWarm?.initTextureCount ?? scenarios.r5StallWarm?.snapshot?.initTextureCount ?? null,
        textureUploadCount: scenarios.r5StallWarm?.textureUploadCount ?? scenarios.r5StallWarm?.snapshot?.textureUploadCount ?? null,
        gpuTimer: scenarios.r5StallWarm?.gpuTimer ?? scenarios.r5StallWarm?.snapshot?.gpuTimer ?? null,
        r6: scenarios.r5StallWarm?.snapshot ?? null,
        cdp: {
          before: scenarios.r5StallCdpBefore?.metrics ?? null,
          after: scenarios.r5StallCdpAfter?.metrics ?? null,
          error: scenarios.r5StallCdpError ?? null,
        },
      },
      staging: {
        warmRafMax: scenarios.warmContentDesign?.rAF?.max ?? null,
        warmLongTaskMax: longTaskMax(scenarios.warmContentDesign),
        sequentialRafMax: scenarios.sequentialSingles?.rAF?.max ?? null,
        rapidRafMax: scenarios.rapid20?.rAF?.max ?? null,
        programs: scenarios.idleMaster?.resources?.programs ?? null,
        draws: scenarios.idleMaster?.resources?.draws ?? null,
        gpuTimer: scenarios.idleMaster?.gpuTimer ?? null,
        textureUploadCount: scenarios.warmContentDesign?.textureUploadCount ?? null,
      },
      navigationDuringPrepare: scenarios.navigationDuringPrepare,
      idleDuringPrepare: scenarios.idleDuringPrepare,
      resourcePlateau: scenarios.resourcePlateau,
      scenarios,
    };
    writeFileSync(path.join(OUT, "performance-qa.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify({
      stallRafMax: report.stallRepro.rAFMax,
      stallLongTaskMax: report.stallRepro.longTaskMax,
      warmRafMax: report.staging.warmRafMax,
      warmLongTaskMax: report.staging.warmLongTaskMax,
      programs: report.staging.programs,
    }, null, 2)}\n`);
  } catch (error) {
    writeFileSync(path.join(OUT, "performance-qa.json"), JSON.stringify({ ok: false, error: String(error), stack: error.stack }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
