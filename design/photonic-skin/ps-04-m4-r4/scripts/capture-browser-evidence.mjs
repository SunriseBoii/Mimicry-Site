import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m4-r4/renders/browser");
const VIDEO = path.join(OUT, "video");
const SHEETS = path.join(OUT, "contact-sheets");
const REPORTS = path.join(ROOT, "design/photonic-skin/ps-04-m4-r4/reports");
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m4`;
const PREVIEW = `${LAB}/preview`;
const QUICK = process.env.PS04M4_R4_QUICK === "1";
const VIDEOS_ONLY = process.env.PS04M4_R4_VIDEOS_ONLY === "1";
const R2 = path.join(ROOT, "design/photonic-skin/ps-04-m4-r2/renders/browser");

mkdirSync(OUT, { recursive: true });
mkdirSync(VIDEO, { recursive: true });
mkdirSync(SHEETS, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

async function waitReady(page) {
  await page.waitForSelector("canvas", { timeout: 60000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M4_LAB__;
    return Boolean(canvas && canvas.width > 8 && lab && lab.runId === "ps04-m4" && lab.ready);
  }, null, { timeout: 60000 });
}

async function waitSettled(page, extra = 200) {
  await page.waitForFunction(() => {
    const lab = window.__PS04M4_LAB__;
    if (!lab || lab.loading) return false;
    const tx = typeof lab.transaction === "function" ? lab.transaction() : null;
    if (lab.activeNode === "08") return lab.composition()?.actorDraw === false;
    if (tx && tx.status === "running") return false;
    const snap = typeof lab.snapshot === "function" ? lab.snapshot() : null;
    return !snap || snap.geometryProgress == null || snap.geometryProgress >= 0.999;
  }, null, { timeout: 25000 });
  await page.waitForTimeout(extra);
}

async function goNode(page, id) {
  await page.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), id);
  await page.waitForFunction((node) => window.__PS04M4_LAB__.activeNode === node, id, { timeout: 20000 });
  await waitSettled(page);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

async function diagnostics(page) {
  return page.evaluate(() => {
    const lab = window.__PS04M4_LAB__;
    const diag = typeof lab.diagnostics === "function" ? lab.diagnostics() : {};
    const measured = typeof lab.measure === "function" ? lab.measure() : null;
    const tx = typeof lab.transaction === "function" ? lab.transaction() : null;
    const canvas = document.querySelector("canvas");
    return {
      ...diag,
      transaction: tx,
      actorMaskBBoxCss: measured?.actorMaskBBoxCss ?? diag.actorMaskBBoxCss ?? null,
      actorVisibleFraction: measured?.actorVisibleFraction ?? diag.actorVisibleFraction ?? 0,
      canvases: document.querySelectorAll("canvas").length,
      canvasBuffer: canvas ? [canvas.width, canvas.height] : [0, 0],
      stats: {
        drawCalls: lab.stats.lastActorDrawCalls,
        triangles: lab.stats.lastActorTriangles,
        programs: lab.stats.programs,
      },
    };
  });
}

function bboxMetrics(box) {
  if (!box) return null;
  const width = box.width ?? (box.right - box.left);
  const height = box.height ?? (box.bottom - box.top);
  return {
    width, height,
    area: width * height,
    maxDim: Math.max(width, height),
    centroid: [box.left + width / 2, box.top + height / 2],
    finite: Number.isFinite(width) && Number.isFinite(height),
  };
}

async function contactSheet(page, from, to, name) {
  await goNode(page, from);
  await page.evaluate(() => window.__PS04M4_LAB__.startTrace());
  const sourceShot = `${name}-t00`;
  await page.screenshot({ path: path.join(SHEETS, `${sourceShot}.png`), fullPage: false });
  const beforeRevision = await page.evaluate(() => window.__PS04M4_LAB__.transaction()?.revision ?? 0);
  await page.evaluate((node) => {
    const lab = window.__PS04M4_LAB__;
    window.__PS04M4_LAST_SAMPLE__ = lab.sampleTransition(1400);
    lab.scrollToNode(node, "auto");
  }, to);
  await page.waitForFunction((prev) => {
    const tx = window.__PS04M4_LAB__.transaction?.();
    return Boolean(tx && (tx.status === "running" || tx.revision !== prev));
  }, beforeRevision, { timeout: 8000 }).catch(() => undefined);
  const frames = [{
    index: 0,
    file: sourceShot,
    node: await page.evaluate(() => window.__PS04M4_LAB__.activeNode),
    transaction: await page.evaluate(() => window.__PS04M4_LAB__.transaction()),
    silhouette: null,
    actorDraw: true,
  }];
  for (let index = 1; index < 10; index += 1) {
    const file = `${name}-t${String(index).padStart(2, "0")}`;
    await page.screenshot({ path: path.join(SHEETS, `${file}.png`), fullPage: false });
    const diag = await diagnostics(page);
    const metrics = bboxMetrics(diag.actorMaskBBoxCss);
    frames.push({
      index,
      file,
      node: await page.evaluate(() => window.__PS04M4_LAB__.activeNode),
      transaction: diag.transaction,
      silhouette: metrics,
      actorDraw: diag.actorDraw,
      visibleFraction: diag.actorVisibleFraction,
      programs: diag.stats.programs,
      draws: diag.stats.drawCalls,
    });
    await page.waitForTimeout(90);
  }
  const sampled = await page.evaluate(async () => window.__PS04M4_LAST_SAMPLE__);
  const trace = await page.evaluate(() => window.__PS04M4_LAB__.stopTrace());
  await waitSettled(page);
  return {
    name, from, to, frames, sampled,
    requestedFrozenIds: [...new Set((trace ?? []).map((row) => row.requestedGeometryId).filter(Boolean))],
  };
}

async function recordClip(browser, name, setup, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO, size: viewport },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const watched = { name };
  try {
    await setup(page);
    await page.waitForTimeout(360);
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
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60000);
  const capture = { shots: [], sheets: [], videos: [], gates: [], traces: [] };
  let contextState = null;
  try {
    if (!VIDEOS_ONLY) {
    await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await goNode(page, "04");
    await shot(page, "cases-master");
    capture.sheets.push(await contactSheet(page, "04", "05.1", "master-content"));
    await shot(page, "content-settled");
    capture.sheets.push(await contactSheet(page, "05.1", "05.2", "content-design"));
    await shot(page, "design-settled");
    capture.sheets.push(await contactSheet(page, "05.2", "05.3", "design-event"));
    await shot(page, "event-settled");
    capture.sheets.push(await contactSheet(page, "05.3", "05.4", "event-games"));
    await shot(page, "games-settled");
    capture.sheets.push(await contactSheet(page, "05.4", "05.5", "games-video"));
    await shot(page, "video-settled");
    capture.sheets.push(await contactSheet(page, "05.5", "05.6", "video-digital"));
    await shot(page, "digital-settled");
    capture.sheets.push(await contactSheet(page, "05.6", "05.7", "digital-merch"));
    await shot(page, "merch-settled");
    capture.sheets.push(await contactSheet(page, "05.7", "06.1", "merch-master"));
    await shot(page, "master-after-merch");
    capture.sheets.push(await contactSheet(page, "01", "02", "master-brand-wide"));
    await shot(page, "about-brand-wide");

    await goNode(page, "03.1");
    await page.evaluate(() => window.__PS04M4_LAB__.selectTask("explain"));
    await waitSettled(page);
    await shot(page, "task-focus");
    await page.evaluate(() => window.__PS04M4_LAB__.selectTask("involve"));
    await waitSettled(page);
    await shot(page, "task-gather");
    await page.evaluate(() => window.__PS04M4_LAB__.selectTask("train"));
    await waitSettled(page);
    await shot(page, "task-drive");
    await page.evaluate(() => window.__PS04M4_LAB__.selectTask("introduce"));
    await waitSettled(page);
    await shot(page, "task-brand-wide");

    await goNode(page, "03.2");
    await page.evaluate(() => window.__PS04M4_LAB__.setCompetencies(["content"]));
    await page.waitForTimeout(900);
    await shot(page, "palette-only-content");
    await page.evaluate(() => window.__PS04M4_LAB__.setCompetencies(["content", "design", "event"]));
    await page.waitForTimeout(900);
    await shot(page, "palette-only-three");

    await goNode(page, "05.1");
    await shot(page, "left-single");
    await goNode(page, "06.1");
    await shot(page, "right-master");
    capture.sheets.push(await contactSheet(page, "05.1", "06.1", "left-right-slot"));

    await goNode(page, "01");
    await page.evaluate(() => window.__PS04M4_LAB__.setTheme("dark"));
    await page.waitForTimeout(300);
    await shot(page, "hero-dark");
    for (const [node, name] of [["05.1", "content"], ["05.2", "design"], ["05.3", "event"], ["05.4", "games"], ["05.5", "video"], ["05.6", "digital"], ["05.7", "merch"]]) {
      await goNode(page, node);
      await shot(page, `${name}-dark-settled`);
    }
    await page.evaluate(() => window.__PS04M4_LAB__.setTheme("light"));
    await shot(page, "hero-light");

    await page.evaluate(() => window.__PS04M4_LAB__.setReduced(true));
    await goNode(page, "05.2");
    await shot(page, "reduced-design");
    await page.evaluate(() => window.__PS04M4_LAB__.setReduced(false));

    await goNode(page, "08");
    await shot(page, "footer-no-mimic");
    await goNode(page, "07");
    await shot(page, "footer-return");

    await goNode(page, "01");
    await page.evaluate(() => window.__PS04M4_LAB__.loseContext());
    await page.waitForTimeout(900);
    await shot(page, "context-restore");
    contextState = await page.evaluate(() => window.__PS04M4_LAB__.contextState);

    if (!QUICK) {
      for (const dpr of [1, 1.5, 2]) {
        await page.evaluate((value) => window.__PS04M4_LAB__.setDpr(value), dpr);
        await goNode(page, "01");
        await shot(page, `dpr-${dpr}-hero`);
      }
      await page.evaluate(() => window.__PS04M4_LAB__.setDpr(1));
      await page.setViewportSize({ width: 390, height: 844 });
      await goNode(page, "01");
      await shot(page, "viewport-390x844-hero");
      await page.setViewportSize({ width: 1440, height: 900 });
    }

    await page.goto(`${PREVIEW}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await shot(page, "preview-hero");

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await shot(page, "production-homepage-untouched");
    if (existsSync(path.join(R2, "production-homepage-untouched.png"))) {
      copyFileSync(path.join(R2, "production-homepage-untouched.png"), path.join(OUT, "r2-production-homepage-untouched.png"));
    }

    await page.goto(`${LAB}?theme=light&dpr=1&actorMask=1&ui=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    capture.sheets.push(await contactSheet(page, "04", "05.1", "mask-master-content"));
    capture.sheets.push(await contactSheet(page, "05.1", "05.2", "mask-content-design"));
    capture.sheets.push(await contactSheet(page, "05.2", "05.3", "mask-design-event"));
    capture.sheets.push(await contactSheet(page, "05.5", "05.6", "mask-video-digital"));
    capture.sheets.push(await contactSheet(page, "05.6", "05.7", "mask-digital-merch"));

    writeFileSync(path.join(REPORTS, "capture-stills.json"), JSON.stringify({
      capturedAt: new Date().toISOString(),
      sessionId: "ps04-m4-r4",
      contextState,
      sheets: capture.sheets.map((sheet) => ({
        name: sheet.name,
        from: sheet.from,
        to: sheet.to,
        requestedFrozenIds: sheet.requestedFrozenIds,
      })),
    }, null, 2));
    } else {
      contextState = "videos-only";
    }

    capture.videos.push(await recordClip(browser, "user-sequence", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await goNode(clip, "04");
      await clip.waitForTimeout(280);
      for (const node of ["05.1", "05.2", "05.3", "05.4", "05.5"]) {
        await clip.evaluate((id) => window.__PS04M4_LAB__.scrollToNode(id, "auto"), node);
        await clip.waitForTimeout(1100);
      }
    }));
    capture.videos.push(await recordClip(browser, "rapid-forward-reverse", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await goNode(clip, "05.1");
      for (const node of ["05.2", "05.3", "05.4", "05.5", "05.4", "05.3", "05.2", "05.1"]) {
        await clip.evaluate((id) => window.__PS04M4_LAB__.scrollToNode(id, "auto"), node);
        await clip.waitForTimeout(80);
      }
      await waitSettled(clip);
    }));
    capture.videos.push(await recordClip(browser, "full-down-up", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await goNode(clip, "01");
      await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("08", "auto"));
      await clip.waitForTimeout(1600);
      await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("01", "auto"));
      await clip.waitForTimeout(1600);
    }));
    capture.videos.push(await recordClip(browser, "content-design", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await goNode(clip, "05.1");
      await clip.waitForTimeout(240);
      await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.2", "auto"));
      await waitSettled(clip);
    }));
    capture.videos.push(await recordClip(browser, "reverse-sequence", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await goNode(clip, "05.7");
      for (const node of ["05.6", "05.5", "05.4", "05.3", "05.2", "05.1", "04"]) {
        await clip.evaluate((id) => window.__PS04M4_LAB__.scrollToNode(id, "auto"), node);
        await clip.waitForTimeout(1100);
      }
    }));
    capture.videos.push(await recordClip(browser, "reduced-motion", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await clip.evaluate(() => window.__PS04M4_LAB__.setReduced(true));
      await goNode(clip, "05.1");
      await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.2", "auto"));
      await waitSettled(clip);
    }));
    capture.videos.push(await recordClip(browser, "warmed-content-design", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await goNode(clip, "05.1");
      await clip.waitForTimeout(8000);
      await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.2", "auto"));
      await waitSettled(clip);
    }));
    capture.videos.push(await recordClip(browser, "content-design-lift-on", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1&continuityLift=1`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await goNode(clip, "05.1");
      await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("05.2", "auto"));
      await waitSettled(clip);
    }));

    const silhouette = [];
    for (const sheet of capture.sheets) {
      const sampled = Array.isArray(sheet.sampled) ? sheet.sampled : [];
      const areaSource = sampled.length
        ? sampled.map((row) => row.area).filter((value) => Number.isFinite(value) && value > 0)
        : sheet.frames.map((frame) => frame.silhouette?.area).filter((value) => Number.isFinite(value));
      const empty = sampled.length
        ? sampled.filter((row) => row.actorDraw && row.visibleFraction != null && !(row.area > 0))
        : sheet.frames.filter((frame) => frame.actorDraw && frame.silhouette && !(frame.silhouette.area > 0));
      const collapse = [];
      if (areaSource.length > 2) {
        const endpoint = Math.min(areaSource[0], areaSource[areaSource.length - 1]);
        const floor = endpoint * 0.3;
        areaSource.forEach((area, index) => {
          if (area < floor) collapse.push({ index, area, floor });
        });
      }
      const third = sheet.requestedFrozenIds.filter((id) => !String(id).startsWith("runtime-snapshot-"));
      const running = sampled.filter((row) => row.semanticPhase && row.semanticPhase !== "settle");
      silhouette.push({
        name: sheet.name,
        emptyActorFrames: empty.length,
        collapseFrames: collapse,
        requestedFrozenIds: third,
        thirdGeometry: third.length > 2,
        sampledFrames: sampled.length,
        runningSamples: running.length,
        minArea: areaSource.length ? Math.min(...areaSource) : null,
        maxArea: areaSource.length ? Math.max(...areaSource) : null,
      });
    }

    const report = {
      capturedAt: new Date().toISOString(),
      sessionId: "ps04-m4-r4",
      contextState,
      videos: capture.videos,
      sheets: capture.sheets.map((sheet) => ({
        name: sheet.name,
        from: sheet.from,
        to: sheet.to,
        requestedFrozenIds: sheet.requestedFrozenIds,
        frames: sheet.frames.map((frame) => ({
          index: frame.index,
          phase: frame.transaction?.semanticPhase,
          geometryProgress: frame.transaction?.geometryProgress,
          paletteProgress: frame.transaction?.paletteProgress,
          siteProgress: frame.transaction?.siteProgress,
          revision: frame.transaction?.revision,
          source: frame.transaction?.sourceGeometryId,
          target: frame.transaction?.targetGeometryId,
          silhouette: frame.silhouette,
          actorDraw: frame.actorDraw,
        })),
      })),
      silhouette,
      productionHomepageCaptured: true,
    };
    writeFileSync(path.join(REPORTS, "capture-run.json"), JSON.stringify(report, null, 2));
    writeFileSync(path.join(REPORTS, "geometry-id-trace.json"), JSON.stringify(silhouette, null, 2));
    process.stdout.write(`${JSON.stringify({
      sheets: capture.sheets.length,
      videos: capture.videos.length,
      empty: silhouette.reduce((sum, row) => sum + row.emptyActorFrames, 0),
      third: silhouette.filter((row) => row.thirdGeometry).map((row) => row.name),
      contextState,
    }, null, 2)}\n`);
  } catch (error) {
    writeFileSync(path.join(REPORTS, "capture-run.json"), JSON.stringify({ ok: false, error: String(error) }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
