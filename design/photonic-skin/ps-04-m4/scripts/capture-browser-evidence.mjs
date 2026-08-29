import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const RUN_ID = process.env.PS04M4_RUN_ID ?? `ps04-m4-${new Date().toISOString().replaceAll(":", "").replaceAll(".", "")}`;
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m4/renders/browser");
const VIDEO = path.join(OUT, "video");
const REPORTS = path.join(ROOT, "design/photonic-skin/ps-04-m4/reports");
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m4`;
const PREVIEW = `${BASE}/visual-lab/photonic-skin-ps04-m4/preview`;

mkdirSync(OUT, { recursive: true });
mkdirSync(VIDEO, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

const SINGLES = ["05.1", "05.2", "05.3", "05.4", "05.5", "05.6", "05.7"];
const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "390x844", width: 390, height: 844 },
];

async function waitReady(page) {
  await page.waitForSelector("canvas", { timeout: 60000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M4_LAB__;
    return Boolean(canvas && canvas.width > 8 && lab && lab.runId === "ps04-m4" && lab.ready);
  }, null, { timeout: 60000 });
  await page.waitForTimeout(400);
}

async function goNode(page, id) {
  await page.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), id);
  await page.waitForFunction((node) => window.__PS04M4_LAB__.activeNode === node, id, { timeout: 20000 });
  await page.waitForTimeout(280);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

async function graphShot(page, name) {
  const graph = page.locator("[data-qa='m4-graph']");
  await graph.screenshot({ path: path.join(OUT, `${name}.png`) });
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
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const log = { runId: RUN_ID, shots: [], videos: [], probes: {} };
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60000);
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await shot(page, "production-homepage-untouched");

    await page.goto(`${LAB}?theme=light&dpr=1&hud=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await shot(page, "hero-light");
    await graphShot(page, "graph-hero-light");
    await page.evaluate(() => window.__PS04M4_LAB__.setTheme("dark"));
    await page.waitForTimeout(400);
    const darkBg = await page.evaluate(() => getComputedStyle(document.querySelector("main")).backgroundColor);
    log.probes.darkBackground = darkBg;
    await shot(page, "hero-dark");
    await page.evaluate(() => window.__PS04M4_LAB__.setTheme("light"));

    await page.getByRole("button", { name: "Собрать проект" }).click();
    await page.waitForFunction(() => window.__PS04M4_LAB__.activeNode === "03.1");
    await page.waitForTimeout(300);
    await shot(page, "hero-anchor-build");
    await goNode(page, "01");
    await page.getByRole("button", { name: "Подключить компетенцию" }).click();
    await page.waitForFunction(() => window.__PS04M4_LAB__.activeNode === "05.1");
    await page.waitForTimeout(300);
    await shot(page, "hero-anchor-competence");

    await goNode(page, "02");
    await shot(page, "about");
    await graphShot(page, "graph-about");
    await goNode(page, "03.1");
    await shot(page, "about-to-task");
    await shot(page, "task-locked-graph");
    await graphShot(page, "graph-task-locked");

    await page.locator("[data-qa='task-explain']").click();
    await page.waitForSelector("[data-node='03.2']");
    await goNode(page, "03.2");
    await shot(page, "unlock-competencies");
    await graphShot(page, "graph-unlock-competencies");
    await page.locator("[data-qa='confirm-competencies']").click();
    await page.waitForTimeout(200);
    await shot(page, "empty-confirm-error");
    await page.locator("[data-qa='competence-content']").click();
    await page.locator("[data-qa='competence-design']").click();
    await page.locator("[data-qa='confirm-competencies']").click();
    await page.waitForSelector("[data-node='03.3']");
    await goNode(page, "03.3");
    await shot(page, "unlock-brief");
    await graphShot(page, "graph-unlock-brief");
    await page.locator("[data-qa='send-brief']").click();
    await page.waitForSelector("[data-qa='m4-contact-dialog']");
    await shot(page, "brief-contact");
    await page.locator("[data-qa='m4-contact-dialog'] input").nth(0).fill("Иван Иванов");
    await page.locator("[data-qa='m4-contact-dialog'] input").nth(1).fill("@ivan");
    await page.locator("[data-qa='m4-contact-dialog'] input[type=checkbox]").check();
    await page.locator("[data-qa='m4-contact-dialog'] button", { hasText: "Имитировать отправку" }).click();
    await page.waitForSelector("[data-qa='m4-success']");
    await shot(page, "brief-success");
    log.probes.successGraphNode = await page.evaluate(() => window.__PS04M4_LAB__.activeNode);
    await page.locator("[data-qa='m4-success'] button", { hasText: "Закрыть" }).click();

    await goNode(page, "04");
    await shot(page, "cases-carousel");
    await graphShot(page, "graph-cases");

    for (const id of SINGLES) {
      await goNode(page, id);
      await shot(page, `competence-${id}-light`);
      await graphShot(page, `graph-${id}`);
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
    await graphShot(page, "graph-studio-clients");

    await goNode(page, "07");
    await shot(page, "contact");
    await goNode(page, "08");
    await page.waitForTimeout(900);
    await shot(page, "footer-no-mimic");
    await graphShot(page, "graph-footer");
    await goNode(page, "07");
    await shot(page, "footer-return");

    await goNode(page, "02");
    await shot(page, "about-header-graph");

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto(`${LAB}?theme=light&dpr=1&hud=0`, { waitUntil: "domcontentloaded" });
      await waitReady(page);
      await shot(page, `viewport-${viewport.name}-hero`);
      await goNode(page, "05.3");
      await shot(page, `viewport-${viewport.name}-event`);
      await goNode(page, "08");
      await shot(page, `viewport-${viewport.name}-footer`);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${LAB}?theme=light&dpr=2&hud=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await shot(page, "dpr-2-hero");
    await page.goto(`${LAB}?theme=light&dpr=1.5&hud=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await shot(page, "dpr-1.5-hero");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${LAB}?theme=light&reduced=1&hud=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await goNode(page, "08");
    await page.waitForTimeout(400);
    await shot(page, "reduced-motion-footer");
    await page.emulateMedia({ reducedMotion: "no-preference" });

    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(`${LAB}?theme=light&hud=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await goNode(page, "03.1");
    await shot(page, "forced-colors-task");
    await page.emulateMedia({ forcedColors: "none" });

    await page.goto(`${LAB}?theme=light&hud=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    await shot(page, "zoom-200");
    await page.evaluate(() => { document.documentElement.style.zoom = "1"; });

    await goNode(page, "05.4");
    await page.evaluate(() => window.__PS04M4_LAB__.loseContext());
    await page.waitForTimeout(600);
    log.probes.context = await page.evaluate(() => window.__PS04M4_LAB__.contextState);
    await shot(page, "context-restore");

    await page.goto(`${PREVIEW}?theme=light&hud=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await shot(page, "preview-hero");
    log.probes.headerCount = await page.evaluate(() => document.querySelectorAll("[data-qa='m4-header']").length);
    log.probes.canvasCount = await page.evaluate(() => document.querySelectorAll("canvas").length);
    log.probes.previewHook = await page.evaluate(() => Boolean(window.__PS04M4_PREVIEW__));

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

    log.videos.push(await recordClip(browser, "chapter-03", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1&hud=0`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await goNode(clip, "03.1");
      await clip.waitForTimeout(500);
      await clip.locator("[data-qa='task-involve']").click();
      await clip.waitForSelector("[data-node='03.2']");
      await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("03.2", "auto"));
      await clip.waitForTimeout(700);
      await clip.locator("[data-qa='competence-event']").click();
      await clip.locator("[data-qa='confirm-competencies']").click();
      await clip.waitForSelector("[data-node='03.3']");
      await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("03.3", "auto"));
      await clip.waitForTimeout(900);
    }));

    log.videos.push(await recordClip(browser, "chapter-05", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1&hud=0`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      for (const id of SINGLES) {
        await clip.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), id);
        await clip.waitForTimeout(700);
      }
    }));

    log.videos.push(await recordClip(browser, "chapter-06", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1&hud=0`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      for (const id of ["06.1", "06.2", "06.3"]) {
        await clip.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), id);
        await clip.waitForTimeout(800);
      }
    }));

    log.videos.push(await recordClip(browser, "dynamic-unlock", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1&hud=0`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await goNode(clip, "03.1");
      await clip.waitForTimeout(500);
      await clip.locator("[data-qa='task-involve']").click();
      await clip.waitForSelector("[data-node='03.2']");
      await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("03.2", "auto"));
      await clip.waitForTimeout(700);
      await clip.locator("[data-qa='competence-event']").click();
      await clip.locator("[data-qa='confirm-competencies']").click();
      await clip.waitForSelector("[data-node='03.3']");
      await clip.evaluate(() => window.__PS04M4_LAB__.scrollToNode("03.3", "auto"));
      await clip.waitForTimeout(1200);
    }));

    log.videos.push(await recordClip(browser, "rapid-reversal", async (clip) => {
      await clip.goto(`${LAB}?theme=light&dpr=1&hud=0`, { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await clip.evaluate(() => {
        const ids = ["05.1", "05.7", "05.2", "05.6", "05.3", "04"];
        ids.forEach((id, index) => setTimeout(() => window.__PS04M4_LAB__.scrollToNode(id, "auto"), index * 180));
      });
      await clip.waitForTimeout(2200);
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

    log.probes.consoleErrors = consoleErrors.filter((item) => !item.includes("THREE.Clock") && !item.includes("ANGLE"));
    log.probes.rawConsole = consoleErrors.slice(0, 20);
    writeFileSync(path.join(REPORTS, "capture-run.json"), JSON.stringify(log, null, 2));
    writeFileSync(path.join(REPORTS, "browser-capture-log.json"), JSON.stringify({ ...log, capturedAt: new Date().toISOString() }, null, 2));
    process.stdout.write(`${JSON.stringify({ shots: "ok", videos: log.videos.length, darkBg, context: log.probes.context }, null, 2)}\n`);
  } catch (error) {
    writeFileSync(path.join(REPORTS, "capture-run.json"), JSON.stringify({ ok: false, error: String(error), log }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await page.close();
    await browser.close();
  }
}

main();
