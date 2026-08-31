import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const BASE = process.env.PS04M5_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m5`;
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m5-1/reports");
mkdirSync(OUT, { recursive: true });

const R6 = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m4-r6-r1/reports/performance-qa.json"), "utf8"));

async function waitLab(page) {
  await page.waitForSelector("canvas", { timeout: 60000 });
  await page.waitForFunction(() => {
    const handle = window.__PS04M5_LAB__;
    return Boolean(handle && handle.runId === "ps04-m5" && handle.ready);
  }, null, { timeout: 60000 });
}

async function waitNode(page, id, timeout = 20000) {
  await page.waitForFunction((node) => window.__PS04M5_LAB__.activeNode === node, id, { timeout });
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
    if (tx && tx.status === "running" && tx.visualLifecycle !== "settled") return false;
    return true;
  }, null, { timeout });
}

async function probe(page) {
  return page.evaluate(() => {
    const handle = window.__PS04M5_LAB__;
    const r6 = typeof handle.r6 === "function" ? handle.r6() : null;
    const geo = typeof handle.geometrySnapshot === "function" ? handle.geometrySnapshot() : null;
    const tx = typeof handle.transaction === "function" ? handle.transaction() : null;
    const snap = typeof handle.snapshot === "function" ? handle.snapshot() : null;
    return {
      node: handle.activeNode,
      scrollY: window.scrollY,
      sessionStatus: snap?.status ?? null,
      visualLifecycle: tx?.visualLifecycle ?? r6?.visualLifecycle ?? null,
      resource: r6?.resource ?? (typeof handle.resource === "function" ? handle.resource() : null),
      gpuPool: typeof handle.gpuPool === "function" ? handle.gpuPool() : null,
      shaderProgress: geo?.shaderProgress ?? null,
      settledGeometryId: geo?.settledGeometryId ?? null,
      textures: handle.stats.textures,
      programs: handle.stats.programs,
      draws: handle.stats.lastActorDrawCalls,
      triangles: handle.stats.lastActorTriangles,
      heap: performance.memory ? performance.memory.usedJSHeapSize : null,
      initTextureCount: r6?.initTextureCount ?? null,
      textureUploadCount: r6?.textureUploadCount ?? null,
      longTasks: r6?.longTasks ?? [],
    };
  });
}

async function measure(page, scenario, run) {
  await page.evaluate((name) => window.__PS04M5_LAB__.startPerf(name), scenario);
  await run();
  const perf = await page.evaluate(() => window.__PS04M5_LAB__.stopPerf());
  const snapshot = await probe(page);
  return { ...perf, snapshot };
}

function r6Max(name) {
  const row = R6.scenarios?.[name] ?? R6[name];
  return row?.rAF?.max ?? null;
}

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const scenarios = {};
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(60000);
    await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await waitLab(page);

    scenarios.idleMaster = await measure(page, "idle-master", async () => {
      await page.waitForTimeout(1200);
    });

    scenarios.warmContentDesign = await measure(page, "warm-content-design", async () => {
      await page.evaluate(() => window.__PS04M5_LAB__.scrollToNode("05.1", "auto"));
      await waitNode(page, "05.1");
      await waitVisualSettled(page);
      await page.waitForTimeout(250);
      await page.evaluate(() => window.__PS04M5_LAB__.scrollToNode("05.2", "auto"));
      await waitNode(page, "05.2");
      await waitVisualSettled(page);
    });

    scenarios.casesToContent = await measure(page, "cases-to-content", async () => {
      await page.evaluate(() => window.__PS04M5_LAB__.scrollToNode("04", "auto"));
      await waitNode(page, "04");
      await waitVisualSettled(page);
      await page.evaluate(() => window.__PS04M5_LAB__.scrollToNode("05.1", "auto"));
      await waitNode(page, "05.1");
      await waitVisualSettled(page);
    });

    scenarios.merchToTeam = await measure(page, "merch-to-team", async () => {
      await page.evaluate(() => window.__PS04M5_LAB__.scrollToNode("05.7", "auto"));
      await waitNode(page, "05.7");
      await waitVisualSettled(page);
      await page.evaluate(() => window.__PS04M5_LAB__.scrollToNode("06.1", "auto"));
      await waitNode(page, "06.1");
      await waitVisualSettled(page);
    });

    scenarios.sequentialSingles = await measure(page, "content-design-event-games", async () => {
      for (const node of ["05.1", "05.2", "05.3", "05.4"]) {
        await page.evaluate((id) => window.__PS04M5_LAB__.scrollToNode(id, "auto"), node);
        await waitNode(page, node);
        await waitVisualSettled(page);
      }
    });

    scenarios.reverse = await measure(page, "games-event-design", async () => {
      for (const node of ["05.4", "05.3", "05.2"]) {
        await page.evaluate((id) => window.__PS04M5_LAB__.scrollToNode(id, "auto"), node);
        await waitNode(page, node);
        await waitVisualSettled(page);
      }
    });

    scenarios.rapid20 = await measure(page, "rapid-20", async () => {
      const nodes = ["05.1", "05.2", "05.3", "05.4", "05.5"];
      for (let index = 0; index < 20; index += 1) {
        await page.evaluate((id) => window.__PS04M5_LAB__.scrollToNode(id, "auto"), nodes[index % nodes.length]);
      }
      await waitVisualSettled(page, 60000);
    });

    const cycleTextures = [];
    scenarios.fullCycle1 = await measure(page, "full-down-up-1", async () => {
      await page.evaluate(() => window.__PS04M5_LAB__.scrollToNode("01", "auto"));
      await waitVisualSettled(page);
      cycleTextures.push(await probe(page));
      await page.evaluate(() => window.__PS04M5_LAB__.scrollToNode("08", "auto"));
      await waitVisualSettled(page);
      cycleTextures.push(await probe(page));
      await page.evaluate(() => window.__PS04M5_LAB__.scrollToNode("01", "auto"));
      await waitVisualSettled(page);
      cycleTextures.push(await probe(page));
    });
    scenarios.fullCycle2 = await measure(page, "full-down-up-2", async () => {
      await page.evaluate(() => window.__PS04M5_LAB__.scrollToNode("08", "auto"));
      await waitVisualSettled(page);
      cycleTextures.push(await probe(page));
      await page.evaluate(() => window.__PS04M5_LAB__.scrollToNode("01", "auto"));
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
      await waitLab(page);
      await page.evaluate(() => window.__PS04M5_LAB__.scrollToNode("04", "auto"));
      await waitNode(page, "04");
      await waitVisualSettled(page);
      await page.evaluate(() => window.__PS04M5_LAB__.scrollToNode("05.1", "auto"));
      await waitNode(page, "05.1");
      await waitVisualSettled(page);
    });

    scenarios.contextRestore = await measure(page, "context-restore", async () => {
      await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitLab(page);
      await page.evaluate(() => window.__PS04M5_LAB__.loseContext());
      await page.waitForTimeout(900);
      await waitVisualSettled(page, 60000);
    });
  } finally {
    await browser.close();
  }

  const comparison = {
    r6r1IdleMasterMax: R6.scenarios?.idleMaster?.rAF?.max ?? 12.2,
    r6r1WarmContentDesignMax: R6.scenarios?.warmContentDesign?.rAF?.max ?? 18.1,
    m5IdleMasterMax: scenarios.idleMaster?.rAF?.max ?? null,
    m5WarmContentDesignMax: scenarios.warmContentDesign?.rAF?.max ?? null,
  };

  const payload = {
    capturedAt: new Date().toISOString(),
    note: "Ordinary navigation uses default GPU staging. Rapid-20 and context restore are stress, not mixed into ordinary-nav gates. rAF from in-page NaturalRafRecorder.",
    comparison,
    scenarios,
    r6ReferenceMax: {
      idleMaster: r6Max("idleMaster") ?? 12.2,
      warmContentDesign: r6Max("warmContentDesign") ?? 18.1,
    },
  };
  writeFileSync(path.join(OUT, "performance-qa.json"), JSON.stringify(payload, null, 2));
  process.stdout.write(`${JSON.stringify({
    idle: scenarios.idleMaster?.rAF?.max,
    warm: scenarios.warmContentDesign?.rAF?.max,
    cases: scenarios.casesToContent?.rAF?.max,
    merch: scenarios.merchToTeam?.rAF?.max,
    rapid: scenarios.rapid20?.rAF?.max,
    idleLong: scenarios.idleMaster?.longTasks?.length ?? 0,
    warmLong: scenarios.warmContentDesign?.longTasks?.length ?? 0,
  }, null, 2)}\n`);
}

main();
