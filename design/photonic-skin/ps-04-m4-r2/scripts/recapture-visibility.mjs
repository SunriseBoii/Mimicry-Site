import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { actorVisibilityGate } from "./visibility-gate.mjs";

const ROOT = process.cwd();
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m4`;
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m4-r2/renders/browser");
const REPORTS = path.join(ROOT, "design/photonic-skin/ps-04-m4-r2/reports");
const NODES = ["01", "02", "03.1", "03.2", "03.3", "04", "05.1", "05.2", "05.3", "05.4", "05.5", "05.6", "05.7", "06.1", "06.2", "06.3", "07", "08"];
mkdirSync(OUT, { recursive: true });
mkdirSync(REPORTS, { recursive: true });

async function waitReady(page) {
  await page.waitForFunction(() => window.__PS04M4_LAB__ && window.__PS04M4_LAB__.ready, null, { timeout: 60000 });
  await page.waitForTimeout(300);
}

async function goNode(page, id) {
  await page.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), id);
  await page.waitForFunction((node) => window.__PS04M4_LAB__.activeNode === node, id, { timeout: 20000 });
  if (id === "08") {
    await page.waitForFunction(() => window.__PS04M4_LAB__.composition().actorDraw === false, null, { timeout: 8000 });
  } else {
    await page.waitForFunction(() => {
      const snap = window.__PS04M4_LAB__.snapshot();
      return !snap || snap.geometryProgress >= 0.999;
    }, null, { timeout: 20000 });
    await page.waitForTimeout(700);
  }
}

function gate(diag) {
  return actorVisibilityGate({
    actorDraw: Boolean(diag.actorDraw),
    bbox: diag.actorMaskBBoxCss,
    visibleFraction: diag.actorVisibleFraction ?? 0,
    centerX: Array.isArray(diag.actorCenterCss) ? diag.actorCenterCss[0] : 0,
    slot: diag.slot ?? "none",
    canvasWidth: Array.isArray(diag.canvasCssSize) ? diag.canvasCssSize[0] : 0,
    canvasHeight: Array.isArray(diag.canvasCssSize) ? diag.canvasCssSize[1] : 0,
    cssLeftByDpr: [diag.actorViewportCss && diag.actorViewportCss.left || 0],
    cssSizeByDpr: [diag.actorViewportCss && diag.actorViewportCss.width || 0],
  });
}

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const gates = [];
  try {
    await page.goto(`${LAB}?theme=light&dpr=1&hud=0&actorMask=1&ui=0&diag=1`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await page.evaluate(() => window.__PS04M4_LAB__.selectTask("involve"));
    await page.waitForFunction(() => window.__PS04M4_LAB__.unlock.competencies === true);
    await page.evaluate(() => window.__PS04M4_LAB__.setCompetencies(["content", "design"]));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__PS04M4_LAB__.confirmCompetencies());
    await page.waitForFunction(() => window.__PS04M4_LAB__.unlock.brief === true);
    for (const id of NODES) {
      await goNode(page, id);
      await page.screenshot({ path: path.join(OUT, `diag-${id.replace(".", "-")}.png`), fullPage: false });
      const row = await page.evaluate(() => {
        const lab = window.__PS04M4_LAB__;
        const measured = lab.measure();
        const diag = lab.diagnostics();
        return { ...diag, actorMaskBBoxCss: measured && measured.actorMaskBBoxCss, actorVisibleFraction: measured && measured.actorVisibleFraction };
      });
      const result = gate(row);
      gates.push({
        node: id,
        pass: result.pass,
        failures: result.failures,
        family: row.requestedFamily,
        geometry: row.resolvedGeometryId,
        fraction: row.actorVisibleFraction,
        bbox: row.actorMaskBBoxCss,
        actorDraw: row.actorDraw,
        siteFitScale: row.siteFitScale,
      });
    }
    await page.goto(`${LAB}?theme=light&dpr=1&hud=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await goNode(page, "05.7");
    await page.screenshot({ path: path.join(OUT, "competence-05.7-light.png"), fullPage: false });
    await page.evaluate(() => window.__PS04M4_LAB__.setTheme("dark"));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, "competence-05.7-dark.png"), fullPage: false });
    writeFileSync(path.join(REPORTS, "visibility-gates.json"), JSON.stringify({ capturedAt: new Date().toISOString(), gates }, null, 2));
    const failed = gates.filter((row) => !row.pass);
    process.stdout.write(`${JSON.stringify({ failed, merch: gates.find((row) => row.node === "05.7"), footer: gates.find((row) => row.node === "08") }, null, 2)}\n`);
    if (failed.length) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main();
