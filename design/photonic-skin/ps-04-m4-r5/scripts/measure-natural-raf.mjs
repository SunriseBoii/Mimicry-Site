import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m4`;
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m4-r5/reports");
mkdirSync(OUT, { recursive: true });

async function waitM4(page) {
  await page.waitForSelector("canvas", { timeout: 60000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M4_LAB__;
    return Boolean(canvas && lab && lab.runId === "ps04-m4" && lab.ready);
  }, null, { timeout: 60000 });
}

async function waitSettled(page, timeout = 25000) {
  try {
    await page.waitForFunction(() => {
      const lab = window.__PS04M4_LAB__;
      if (!lab || lab.loading) return false;
      if (lab.activeNode === "08") return lab.composition()?.actorDraw === false;
      const geo = typeof lab.geometrySnapshot === "function" ? lab.geometrySnapshot() : null;
      const uniforms = window.__PS04M4_MATERIAL_UNIFORMS__;
      if (geo && (geo.status !== "settled" || geo.shaderProgress < 0.999)) return false;
      if (uniforms && Number.isFinite(uniforms.geometryProgress) && uniforms.geometryProgress < 0.999) return false;
      const tx = lab.transaction?.();
      if (tx && tx.status === "running") return false;
      const expectedGeometry = {
        "05.1": "single-content",
        "05.2": "single-design",
        "05.3": "single-event",
        "05.4": "single-games",
        "05.5": "single-video",
        "05.6": "single-digital",
        "05.7": "single-merch",
      }[lab.activeNode];
      if (expectedGeometry && geo) {
        const visible = geo.settledGeometryId || geo.boundTargetGeometryId;
        if (visible !== expectedGeometry) return false;
      }
      return true;
    }, null, { timeout });
  } catch (error) {
    const dump = await page.evaluate(() => {
      const lab = window.__PS04M4_LAB__;
      return {
        activeNode: lab?.activeNode,
        tx: typeof lab?.transaction === "function" ? lab.transaction() : null,
        geo: typeof lab?.geometrySnapshot === "function" ? lab.geometrySnapshot() : null,
        bind: typeof lab?.programBind === "function" ? lab.programBind() : null,
        uniforms: window.__PS04M4_MATERIAL_UNIFORMS__ ?? null,
        session: typeof lab?.snapshot === "function" ? lab.snapshot() : null,
        lastActor: typeof lab?.lastActorTarget === "function" ? lab.lastActorTarget() : null,
      };
    });
    console.error("waitSettled dump", JSON.stringify(dump, null, 2));
    throw error;
  }
}

async function measure(page, scenario, run) {
  await page.evaluate((name) => window.__PS04M4_LAB__.startPerf(name), scenario);
  await run();
  return page.evaluate(() => window.__PS04M4_LAB__.stopPerf());
}

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60000);
  const scenarios = {};
  try {
    await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await waitM4(page);
    scenarios.idleMaster = await measure(page, "idle-master", async () => {
      await page.waitForTimeout(2500);
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitM4(page);
    scenarios.coldContentDesign = await measure(page, "cold-content-design", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.1", "auto"));
      await waitSettled(page);
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.2", "auto"));
      await waitSettled(page);
    });
    scenarios.coldCache = await page.evaluate(() => window.__PS04M4_LAB__.programCache());

    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.1", "auto"));
    await waitSettled(page);
    await page.waitForTimeout(8000);
    scenarios.warmContentDesign = await measure(page, "warm-content-design", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.2", "auto"));
      await waitSettled(page);
    });
    scenarios.warmCache = await page.evaluate(() => window.__PS04M4_LAB__.programCache());

    scenarios.masterToBrandWide = await measure(page, "master-to-brand-wide", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("02", "auto"));
      await waitSettled(page);
    });

    scenarios.masterRightToSingleLeft = await measure(page, "master-right-to-single-left", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("04", "auto"));
      await waitSettled(page);
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.1", "auto"));
      await waitSettled(page);
    });

    scenarios.contentToDesign = await measure(page, "content-to-design", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.2", "auto"));
      await waitSettled(page);
    });
    scenarios.designToEvent = await measure(page, "design-to-event", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.3", "auto"));
      await waitSettled(page);
    });
    scenarios.eventToGames = await measure(page, "event-to-games", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.4", "auto"));
      await waitSettled(page);
    });
    scenarios.gamesToVideo = await measure(page, "games-to-video", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.5", "auto"));
      await waitSettled(page);
    });
    scenarios.merchToMaster = await measure(page, "merch-to-master", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.7", "auto"));
      await waitSettled(page);
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("06.1", "auto"));
      await waitSettled(page);
    });

    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("03.1", "auto"));
    await waitSettled(page);
    scenarios.buildTasks = await measure(page, "focus-gather-drive-brand-wide", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.selectTask("explain"));
      await page.waitForTimeout(1100);
      await page.evaluate(() => window.__PS04M4_LAB__.selectTask("involve"));
      await page.waitForTimeout(1100);
      await page.evaluate(() => window.__PS04M4_LAB__.selectTask("train"));
      await page.waitForTimeout(1100);
      await page.evaluate(() => window.__PS04M4_LAB__.selectTask("introduce"));
      await waitSettled(page);
    });

    await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("03.2", "auto"));
    await waitSettled(page);
    scenarios.paletteOnly = await measure(page, "palette-only-mask", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.setCompetencies(["content"]));
      await page.waitForTimeout(900);
      await page.evaluate(() => window.__PS04M4_LAB__.setCompetencies(["content", "design"]));
      await page.waitForTimeout(900);
    });

    scenarios.sameMaskGeometry = await measure(page, "same-mask-geometry", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("01", "auto"));
      await waitSettled(page);
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("02", "auto"));
      await waitSettled(page);
    });

    scenarios.rapid20 = await measure(page, "rapid-20-retarget", async () => {
      const nodes = ["05.1", "05.2", "05.3", "05.4", "05.5", "05.1", "05.3", "05.5", "05.2", "05.4",
        "05.1", "05.2", "05.3", "05.4", "05.5", "05.7", "05.1", "05.6", "05.2", "04"];
      for (const node of nodes) {
        await page.evaluate((id) => window.__PS04M4_LAB__.scrollToNode(id, "auto"), node);
        await page.waitForTimeout(40);
      }
      await waitSettled(page, 45000);
    });

    scenarios.magneticScroll = await measure(page, "magnetic-scroll-transition", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("01", "auto"));
      await waitSettled(page);
      await page.mouse.wheel(0, 240);
      await page.evaluate(() => window.__PS04M4_LAB__.noteUserInput("wheel"));
      await page.waitForTimeout(700);
    });

    scenarios.themeSwitch = await measure(page, "theme-switch", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.setTheme("dark"));
      await page.waitForTimeout(400);
      await page.evaluate(() => window.__PS04M4_LAB__.setTheme("light"));
      await page.waitForTimeout(400);
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.__PS04M4_LAB__.setDpr(1));
    scenarios.dpr1 = await measure(page, "dpr-1", async () => { await page.waitForTimeout(800); });
    await page.evaluate(() => window.__PS04M4_LAB__.setDpr(1.5));
    scenarios.dpr15 = await measure(page, "dpr-1.5", async () => { await page.waitForTimeout(800); });
    await page.evaluate(() => window.__PS04M4_LAB__.setDpr(2));
    scenarios.dpr2 = await measure(page, "dpr-2", async () => { await page.waitForTimeout(800); });
    await page.evaluate(() => window.__PS04M4_LAB__.setDpr(1));

    await page.setViewportSize({ width: 390, height: 844 });
    scenarios.emulated390 = await measure(page, "emulated-390", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("01", "auto"));
      await waitSettled(page);
      await page.waitForTimeout(600);
    });
    await page.setViewportSize({ width: 1440, height: 900 });

    scenarios.contextRestore = await measure(page, "context-restore-transition", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.1", "auto"));
      await page.waitForTimeout(200);
      await page.evaluate(() => window.__PS04M4_LAB__.loseContext());
      await page.waitForTimeout(800);
      await waitSettled(page);
    });

    scenarios.fullDownUp = await measure(page, "full-down-up", async () => {
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("01", "auto"));
      await waitSettled(page);
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("08", "auto"));
      await waitSettled(page);
      await page.evaluate(() => window.__PS04M4_LAB__.scrollToNode("01", "auto"));
      await waitSettled(page);
    });

    const report = {
      capturedAt: new Date().toISOString(),
      note: "rAF quantiles come from an in-page natural-rAF recorder. Playwright waitForTimeout is only used to let that recorder collect frames; it is not the performance sample clock.",
      idleVsTransition: {
        idleP95: scenarios.idleMaster?.rAF?.p95,
        contentToDesignP95: scenarios.contentToDesign?.rAF?.p95,
        coldContentDesignP95: scenarios.coldContentDesign?.rAF?.p95,
        warmContentDesignP95: scenarios.warmContentDesign?.rAF?.p95,
        rapid20P95: scenarios.rapid20?.rAF?.p95,
      },
      cache: {
        cold: scenarios.coldCache,
        warm: scenarios.warmCache,
      },
      longTasksCold: scenarios.coldContentDesign?.longTasks?.length ?? 0,
      longTasksWarm: scenarios.warmContentDesign?.longTasks?.length ?? 0,
      gpuTimer: scenarios.idleMaster?.gpuTimer,
      longTasks: Object.fromEntries(Object.entries(scenarios).map(([name, row]) => [name, row?.longTasks?.length ?? 0])),
      resourceContract: scenarios.idleMaster?.resources,
      scenarios,
    };
    writeFileSync(path.join(OUT, "performance-qa.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify(report.idleVsTransition, null, 2)}\n`);
  } catch (error) {
    writeFileSync(path.join(OUT, "performance-qa.json"), JSON.stringify({ ok: false, error: String(error) }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
