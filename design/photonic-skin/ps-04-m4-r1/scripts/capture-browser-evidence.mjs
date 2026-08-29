import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { actorVisibilityGate } from "./visibility-gate.mjs";

const ROOT = process.cwd();
const RUN_ID = process.env.PS04M4_R1_RUN_ID ?? `ps04-m4-r1-${new Date().toISOString().replaceAll(":", "").replaceAll(".", "")}`;
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m4-r1/renders/browser");
const VIDEO = path.join(OUT, "video");
const LEGACY = path.join(ROOT, "design/photonic-skin/ps-04-m4-r1/renders/legacy");
const REPORTS = path.join(ROOT, "design/photonic-skin/ps-04-m4-r1/reports");
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m4`;
const PREVIEW = `${LAB}/preview`;
const QUICK = process.env.PS04M4_R1_QUICK === "1";
const OLD = path.join(ROOT, "design/photonic-skin/ps-04-m4/renders/browser");

mkdirSync(OUT, { recursive: true });
mkdirSync(VIDEO, { recursive: true });
mkdirSync(LEGACY, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

const SINGLES = ["05.1", "05.2", "05.3", "05.4", "05.5", "05.6", "05.7"];
const NODES = ["01", "02", "03.1", "03.2", "03.3", "04", "05.1", "05.2", "05.3", "05.4", "05.5", "05.6", "05.7", "06.1", "06.2", "06.3", "07", "08"];
const DPR_MATRIX = [1, 1.25, 1.5, 2];
const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "390x844", width: 390, height: 844 },
];

function copyLegacy(name) {
  const from = path.join(OLD, `${name}.png`);
  if (!existsSync(from)) return false;
  copyFileSync(from, path.join(LEGACY, `${name}.png`));
  copyFileSync(from, path.join(OUT, `legacy-${name}.png`));
  return true;
}

async function waitReady(page) {
  await page.waitForSelector("canvas", { timeout: 60000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M4_LAB__;
    return Boolean(canvas && canvas.width > 8 && lab && lab.runId === "ps04-m4" && lab.ready);
  }, null, { timeout: 60000 });
  await page.waitForTimeout(420);
}

async function waitSettled(page, extra = 380) {
  await page.waitForFunction(() => {
    const lab = window.__PS04M4_LAB__;
    if (!lab || lab.loading) return false;
    const composition = typeof lab.composition === "function" ? lab.composition() : null;
    if (lab.activeNode === "08") {
      return Boolean(composition && composition.actorDraw === false);
    }
    if (composition && composition.actorDraw === false) return true;
    const snap = typeof lab.snapshot === "function" ? lab.snapshot() : null;
    if (!snap) return true;
    return snap.geometryProgress == null || snap.geometryProgress >= 0.999;
  }, null, { timeout: 25000 });
  await page.waitForTimeout(extra);
}

async function goNode(page, id) {
  await page.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), id);
  await page.waitForFunction((node) => window.__PS04M4_LAB__.activeNode === node, id, { timeout: 20000 });
  await page.waitForTimeout(120);
  await page.waitForFunction((node) => window.__PS04M4_LAB__.activeNode === node, id, { timeout: 8000 });
  await waitSettled(page);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

async function diagnostics(page) {
  return page.evaluate(() => {
    const lab = window.__PS04M4_LAB__;
    const measureFn = lab.measure;
    const diag = typeof lab.diagnostics === "function" ? lab.diagnostics() : {};
    const measured = typeof measureFn === "function" ? measureFn() : null;
    const canvas = document.querySelector("canvas");
    return {
      ...diag,
      actorMaskBBoxCss: measured && measured.actorMaskBBoxCss ? measured.actorMaskBBoxCss : (diag.actorMaskBBoxCss || null),
      actorVisibleFraction: measured && typeof measured.actorVisibleFraction === "number" ? measured.actorVisibleFraction : (typeof diag.actorVisibleFraction === "number" ? diag.actorVisibleFraction : 0),
      windowDevicePixelRatio: window.devicePixelRatio,
      canvasClient: canvas ? [canvas.clientWidth, canvas.clientHeight] : [0, 0],
      canvasBuffer: canvas ? [canvas.width, canvas.height] : [0, 0],
      sessionId: lab.sessionId,
      canvases: document.querySelectorAll("canvas").length,
      stats: {
        drawCalls: lab.stats.lastActorDrawCalls,
        triangles: lab.stats.lastActorTriangles,
        programs: lab.stats.programs,
        fps: lab.stats.fps,
        p95Ms: lab.stats.p95Ms,
      },
    };
  });
}

function evaluateGate(diag) {
  const composition = {
    cssCenterX: Array.isArray(diag.actorCenterCss) ? diag.actorCenterCss[0] : 0,
    slot: diag.slot,
    canvasCssWidth: Array.isArray(diag.canvasCssSize) ? diag.canvasCssSize[0] : 0,
    canvasCssHeight: Array.isArray(diag.canvasCssSize) ? diag.canvasCssSize[1] : 0,
  };
  return actorVisibilityGate({
    actorDraw: Boolean(diag.actorDraw),
    bbox: diag.actorMaskBBoxCss,
    visibleFraction: diag.actorVisibleFraction ?? 0,
    centerX: composition.cssCenterX,
    slot: diag.slot ?? "none",
    canvasWidth: composition.canvasCssWidth,
    canvasHeight: composition.canvasCssHeight,
    cssLeftByDpr: [diag.actorViewportCss?.left ?? 0],
    cssSizeByDpr: [diag.actorViewportCss?.width ?? 0],
  });
}

async function recordClip(browser, name, setup, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO, size: viewport },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const watched = { name, startedAt: new Date().toISOString() };
  try {
    const t0 = Date.now();
    await setup(page);
    await page.waitForTimeout(400);
    watched.elapsedMs = Date.now() - t0;
    watched.playback = "recorded at wall-clock 1x; dwell is real time, not accelerated";
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
  for (const name of ["hero-light", "dpr-1.5-hero", "dpr-2-hero", "about", "cases-carousel"]) {
    copyLegacy(name);
  }

  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const log = {
    runId: RUN_ID,
    stage: "PS-04.M4.R1",
    shots: [],
    videos: [],
    dpr: [],
    screens: [],
    gates: [],
    probes: {},
  };
  const consoleErrors = [];

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(60000);
    page.on("pageerror", (error) => consoleErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(350);
    await shot(page, "production-homepage-untouched");
    log.probes.productionHasM4 = await page.evaluate(() => Boolean(document.querySelector("[data-qa='m4-canvas']")));

    for (const dpr of DPR_MATRIX) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
      const probe = await context.newPage();
      probe.setDefaultTimeout(60000);
      await probe.goto(`${LAB}?theme=light&dpr=${dpr}&hud=0&actorMask=1&ui=0&diag=1`, { waitUntil: "domcontentloaded" });
      await waitReady(probe);
      await waitSettled(probe, 500);
      const hero = await diagnostics(probe);
      await shot(probe, `dpr-${dpr}-hero-mask`);
      await probe.goto(`${LAB}?theme=light&dpr=${dpr}&hud=0`, { waitUntil: "domcontentloaded" });
      await waitReady(probe);
      await shot(probe, `dpr-${dpr}-hero`);
      log.dpr.push({ dpr, windowDpr: hero.windowDevicePixelRatio, ...hero, gate: evaluateGate(hero) });
      await context.close();
    }

    const cssLeft = log.dpr.map((row) => row.actorViewportCss?.left ?? 0);
    const cssSize = log.dpr.map((row) => row.actorViewportCss?.width ?? 0);
    log.probes.dprCssInvariant = {
      cssLeft,
      cssSize,
      leftDrift: Math.max(...cssLeft) - Math.min(...cssLeft),
      sizeDrift: Math.max(...cssSize) - Math.min(...cssSize),
    };

    await page.goto(`${LAB}?theme=light&dpr=1&hud=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await shot(page, "hero-light");
    await page.evaluate(() => window.__PS04M4_LAB__.setTheme("dark"));
    await page.waitForTimeout(350);
    await shot(page, "hero-dark");
    await page.evaluate(() => window.__PS04M4_LAB__.setTheme("light"));

    await goNode(page, "02");
    await shot(page, "about-light");
    await page.evaluate(() => window.__PS04M4_LAB__.setTheme("dark"));
    await page.waitForTimeout(350);
    await shot(page, "about-dark");
    await page.evaluate(() => window.__PS04M4_LAB__.setTheme("light"));

    await goNode(page, "03.1");
    await shot(page, "build-initial-master");
    log.screens.push({ node: "03.1", phase: "before-task", ...(await diagnostics(page)) });

    for (const [task, name] of [["explain", "task-focus"], ["involve", "task-gather"], ["train", "task-drive"], ["introduce", "task-brand-wide"]]) {
      await page.evaluate((id) => window.__PS04M4_LAB__.selectTask(id), task);
      await page.waitForTimeout(900);
      await shot(page, name);
      log.screens.push({ node: "03.1", task, ...(await diagnostics(page)) });
    }

    await page.evaluate(() => window.__PS04M4_LAB__.selectTask("explain"));
    await page.waitForTimeout(500);
    await goNode(page, "03.2");
    const maskSets = [
      [["content"], "mask-1"],
      [["content", "design"], "mask-2"],
      [["content", "design", "event"], "mask-3"],
      [["content", "design", "event", "games"], "mask-4"],
      [["content", "design", "event", "games", "video", "digital", "merch"], "mask-7"],
    ];
    for (const [ids, name] of maskSets) {
      await page.evaluate((next) => window.__PS04M4_LAB__.setCompetencies(next), ids);
      await page.waitForTimeout(450);
      await shot(page, name);
      log.screens.push({ node: "03.2", mask: name, ...(await diagnostics(page)) });
    }
    await page.evaluate(() => window.__PS04M4_LAB__.setCompetencies(["content", "design"]));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__PS04M4_LAB__.confirmCompetencies());
    await page.waitForTimeout(400);
    await goNode(page, "03.3");
    await shot(page, "brief");
    const brief = await diagnostics(page);
    await page.evaluate(() => window.__PS04M4_LAB__.openContact());
    await page.waitForTimeout(350);
    await shot(page, "brief-contact");
    const contact = await diagnostics(page);
    await page.locator("[data-qa='m4-contact-dialog'] input").nth(0).fill("Иван Иванов");
    await page.locator("[data-qa='m4-contact-dialog'] input").nth(1).fill("@ivan");
    await page.locator("[data-qa='m4-contact-dialog'] input[type=checkbox]").check();
    await page.locator("[data-qa='m4-contact-dialog'] button", { hasText: "Имитировать отправку" }).click();
    await page.waitForSelector("[data-qa='m4-success']");
    await shot(page, "brief-success");
    const success = await diagnostics(page);
    log.probes.overlayActorStable = {
      briefId: brief.resolvedGeometryId,
      contactId: contact.resolvedGeometryId,
      successId: success.resolvedGeometryId,
      briefMask: brief.paletteMask,
      contactMask: contact.paletteMask,
      successMask: success.paletteMask,
    };
    await page.locator("[data-qa='m4-success'] button", { hasText: "Закрыть" }).click();

    await goNode(page, "04");
    await shot(page, "cases-master");
    for (const id of SINGLES) {
      await goNode(page, id);
      await shot(page, `competence-${id}-light`);
    }
    await page.evaluate(() => window.__PS04M4_LAB__.setTheme("dark"));
    for (const id of SINGLES) {
      await goNode(page, id);
      await shot(page, `competence-${id}-dark`);
    }
    await page.evaluate(() => window.__PS04M4_LAB__.setTheme("light"));

    await goNode(page, "06.1");
    await shot(page, "studio-team");
    await goNode(page, "06.2");
    await shot(page, "studio-partners");
    await goNode(page, "06.3");
    await shot(page, "studio-clients");
    await goNode(page, "07");
    await shot(page, "contact");
    await goNode(page, "08");
    await page.waitForTimeout(700);
    await shot(page, "footer-no-mimic");
    log.probes.footer = await diagnostics(page);
    await goNode(page, "07");
    await shot(page, "footer-return");
    log.probes.footerReturn = await diagnostics(page);
    log.probes.footerSessionStable = log.probes.footer.sessionId === log.probes.footerReturn.sessionId
      && log.probes.footer.canvases === 1
      && log.probes.footerReturn.canvases === 1;

    await page.goto(`${LAB}?theme=light&dpr=1&hud=0&actorMask=1&ui=0&diag=1`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await page.evaluate(() => window.__PS04M4_LAB__.selectTask("involve"));
    await page.waitForFunction(() => window.__PS04M4_LAB__.unlock.competencies === true, null, { timeout: 10000 });
    await page.evaluate(() => window.__PS04M4_LAB__.setCompetencies(["content", "design"]));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__PS04M4_LAB__.confirmCompetencies());
    await page.waitForFunction(() => window.__PS04M4_LAB__.unlock.brief === true, null, { timeout: 10000 });
    await page.waitForTimeout(400);
    for (const id of NODES) {
      await goNode(page, id);
      await shot(page, `diag-${id.replace(".", "-")}`);
      const row = await diagnostics(page);
      const gate = evaluateGate(row);
      log.screens.push({ node: id, phase: "mask-diag", ...row, gate });
      log.gates.push({ node: id, pass: gate.pass, failures: gate.failures, family: row.requestedFamily, geometry: row.resolvedGeometryId, fraction: row.actorVisibleFraction, bbox: row.actorMaskBBoxCss, actorDraw: row.actorDraw });
    }

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto(`${LAB}?theme=light&dpr=1&hud=0`, { waitUntil: "domcontentloaded" });
      await waitReady(page);
      await shot(page, `viewport-${viewport.name}-hero`);
      await goNode(page, "02");
      await shot(page, `viewport-${viewport.name}-about`);
      await goNode(page, "05.3");
      await shot(page, `viewport-${viewport.name}-event`);
      await goNode(page, "08");
      await shot(page, `viewport-${viewport.name}-footer`);
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${LAB}?theme=light&dpr=1&hud=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await shot(page, "wide-1920-hero");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await shot(page, "narrow-390-hero");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    await shot(page, "wide-restore-1920-hero");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${LAB}?theme=light&reduced=1&hud=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await goNode(page, "08");
    await shot(page, "reduced-motion-footer");
    await page.emulateMedia({ reducedMotion: "no-preference" });

    await page.goto(`${LAB}?theme=light&hud=0&node=05.4`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await page.evaluate(() => window.__PS04M4_LAB__.loseContext());
    await page.waitForTimeout(700);
    log.probes.context = await page.evaluate(() => window.__PS04M4_LAB__.contextState);
    await shot(page, "context-restore");

    await page.goto(`${PREVIEW}?theme=light&hud=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await shot(page, "preview-hero");
    log.probes.preview = await page.evaluate(() => ({
      headerCount: document.querySelectorAll("[data-qa='m4-header']").length,
      canvasCount: document.querySelectorAll("canvas").length,
      hook: Boolean(window.__PS04M4_PREVIEW__),
    }));

    for (const id of NODES) {
      await page.goto(`${LAB}?theme=light&dpr=1&hud=0&node=${id}`, { waitUntil: "domcontentloaded" });
      await waitReady(page);
      const row = await diagnostics(page);
      log.probes[`direct-${id}`] = {
        requested: id,
        landed: row.activeNodeId,
        family: row.requestedFamily,
        geometry: row.resolvedGeometryId,
        canvases: row.canvases,
      };
    }

    if (!QUICK) {
      const DOWN = ["01", "02", "03.1", "04", "05.1", "05.2", "05.3", "05.4", "05.5", "05.6", "05.7", "06.1", "06.2", "06.3", "07", "08"];
      const UP = ["07", "06.3", "05.4", "04", "03.1", "02", "01"];
      log.videos.push(await recordClip(browser, "full-down-up", async (clip) => {
        await clip.goto(`${LAB}?theme=light&dpr=1&hud=0`, { waitUntil: "domcontentloaded" });
        await waitReady(clip);
        for (const id of DOWN) {
          await clip.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), id);
          await clip.waitForTimeout(700);
        }
        for (const id of UP) {
          await clip.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), id);
          await clip.waitForTimeout(650);
        }
      }));
      log.videos.push(await recordClip(browser, "rapid-task-mask-retarget", async (clip) => {
        await clip.goto(`${LAB}?theme=light&dpr=1&hud=0`, { waitUntil: "domcontentloaded" });
        await waitReady(clip);
        await goNode(clip, "03.1");
        for (const task of ["explain", "involve", "train", "introduce", "explain"]) {
          await clip.evaluate((id) => window.__PS04M4_LAB__.selectTask(id), task);
          await clip.waitForTimeout(280);
        }
        await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("03.2", "auto"));
        await clip.waitForTimeout(400);
        const sets = [["content"], ["content", "design"], ["event"], ["content", "design", "event", "games", "video"]];
        for (const ids of sets) {
          await clip.evaluate((next) => window.__PS04M4_LAB__.setCompetencies(next), ids);
          await clip.waitForTimeout(260);
        }
      }));
      log.videos.push(await recordClip(browser, "footer-exit-return", async (clip) => {
        await clip.goto(`${LAB}?theme=light&dpr=1&hud=0`, { waitUntil: "domcontentloaded" });
        await waitReady(clip);
        await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("07", "auto"));
        await clip.waitForTimeout(800);
        await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("08", "auto"));
        await clip.waitForTimeout(1200);
        await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("07", "auto"));
        await clip.waitForTimeout(1000);
      }));
    }

    log.probes.consoleErrors = consoleErrors.filter((item) => !item.includes("THREE.Clock") && !item.includes("ANGLE"));
    log.probes.gateSummary = {
      failed: log.gates.filter((row) => !row.pass),
      passed: log.gates.filter((row) => row.pass).map((row) => row.node),
    };
    writeFileSync(path.join(REPORTS, "capture-run.json"), JSON.stringify(log, null, 2));
    writeFileSync(path.join(REPORTS, "dpr-diagnostics.json"), JSON.stringify({ capturedAt: new Date().toISOString(), dpr: log.dpr, invariant: log.probes.dprCssInvariant }, null, 2));
    writeFileSync(path.join(REPORTS, "visibility-gates.json"), JSON.stringify({ capturedAt: new Date().toISOString(), gates: log.gates }, null, 2));
    const failed = log.gates.filter((row) => !row.pass);
    const drift = log.probes.dprCssInvariant;
    process.stdout.write(`${JSON.stringify({
      shots: "ok",
      videos: log.videos.length,
      dprDrift: drift,
      context: log.probes.context,
      footerSession: log.probes.footerSessionStable,
      overlayStable: log.probes.overlayActorStable,
      failedGates: failed,
    }, null, 2)}\n`);
    if (failed.length > 0 || (drift && (drift.leftDrift > 2 || drift.sizeDrift > 2))) {
      process.exitCode = 2;
    }
    await page.close();
  } catch (error) {
    writeFileSync(path.join(REPORTS, "capture-run.json"), JSON.stringify({ ok: false, error: String(error), log }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
