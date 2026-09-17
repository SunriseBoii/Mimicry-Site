import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const out = path.join(root, "design/photonic-skin/ps-04-final-r1/renders/video");
const reportPath = path.join(root, "design/photonic-skin/ps-04-final-r1/reports/transition-video-capture.json");
mkdirSync(out, { recursive: true });
const base = process.env.PS04_BASE ?? "http://localhost:3000";
const url = `${base}/visual-lab/photonic-skin-ps04-m6/final-r1`;
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
});

async function record(name, width, height, deviceScaleFactor) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor,
    recordVideo: { dir: out, size: { width, height } },
  });
  const page = await context.newPage();
  const video = page.video();
  const marks = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.__PS04M61_LAB__?.ready === true, null, { timeout: 90000 });

  async function go(node, holdMs) {
    await page.evaluate((id) => window.__PS04M61_LAB__.scrollToNode(id, "smooth"), node);
    await page.waitForTimeout(holdMs);
    const snapshot = await page.evaluate(() => ({
      node: window.__PS04M61_LAB__?.activeNode,
      settled: window.__PS04M61_LAB__?.geometrySnapshot?.()?.settledGeometryId,
      target: window.__PS04M61_LAB__?.transaction?.()?.targetGeometryId,
      lifecycle: window.__PS04M61_LAB__?.transaction?.()?.visualLifecycle,
    }));
    marks.push({ requested: node, holdMs, ...snapshot });
  }

  await go("01", 700);
  await go("02", 1100);
  await go("03.1", 1000);
  await page.evaluate(() => window.__PS04M61_LAB__.selectTask("explain_changes"));
  await go("03.2", 900);
  await page.evaluate(() => window.__PS04M61_LAB__.setCompetencies(["event", "video"]));
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.__PS04M61_LAB__.confirmCompetencies());
  await go("03.3", 1100);
  await go("05.1", 900);
  await go("05.3", 1000);
  await go("05.5", 1000);
  for (const node of ["05.1", "05.2", "05.3", "05.4", "05.5", "05.6", "05.7", "05.6", "05.4", "05.3"]) {
    await go(node, 105);
  }
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__PS04M61_LAB__.setTheme("dark"));
  await page.waitForTimeout(650);
  await go("05.3", 600);
  await go("01", 900);
  await page.waitForFunction(() => {
    const handle = window.__PS04M61_LAB__;
    return handle?.activeNode === "01"
      && handle?.geometrySnapshot?.()?.settledGeometryId === "master-neutral"
      && handle?.transaction?.()?.visualLifecycle === "settled";
  }, null, { timeout: 12000 });
  await page.waitForTimeout(450);
  marks.push({ requested: "01", holdMs: "until-settled", ...await page.evaluate(() => ({
    node: window.__PS04M61_LAB__?.activeNode,
    settled: window.__PS04M61_LAB__?.geometrySnapshot?.()?.settledGeometryId,
    target: window.__PS04M61_LAB__?.transaction?.()?.targetGeometryId,
    lifecycle: window.__PS04M61_LAB__?.transaction?.()?.visualLifecycle,
  })) });
  await page.close();
  const output = path.join(out, `${name}-transitions.webm`);
  const rawVideo = await video.path();
  await video.saveAs(output);
  if (path.dirname(path.resolve(rawVideo)) === path.resolve(out) && path.resolve(rawVideo) !== path.resolve(output)) {
    unlinkSync(rawVideo);
  }
  await context.close();
  return { name, width, height, deviceScaleFactor, file: output.replaceAll("\\", "/"), marks, errors };
}

try {
  const desktop = await record("desktop-1440", 1440, 900, 1);
  const mobile = await record("mobile-390", 390, 844, 2);
  writeFileSync(reportPath, JSON.stringify({ url, desktop, mobile }, null, 2) + "\n");
  console.log(`Saved ${desktop.file} and ${mobile.file}`);
} finally {
  await browser.close();
}
