import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const report = path.join(root, "design/photonic-skin/ps-04-final-r1/reports/navigation-lag-probe.json");
mkdirSync(path.dirname(report), { recursive: true });
const url = `${process.env.PS04_BASE ?? "http://localhost:3000"}/visual-lab/photonic-skin-ps04-m6/final-r1`;
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-gl=angle", "--use-angle=d3d11"] });

async function scenario(name, rapid) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.__PS04M61_LAB__?.ready, null, { timeout: 90000 });
  await page.evaluate(() => window.__PS04M61_LAB__.scrollToNode("05.3", "auto"));
  await page.waitForFunction(() => window.__PS04M61_LAB__?.geometrySnapshot?.()?.settledGeometryId === "single-event", null, { timeout: 30000 });
  if (rapid) {
    for (const node of ["05.1", "05.2", "05.3", "05.4", "05.5", "05.6", "05.7", "05.6", "05.4", "05.3"]) {
      await page.evaluate((id) => window.__PS04M61_LAB__.scrollToNode(id, "smooth"), node);
      await page.waitForTimeout(105);
    }
    try {
      await page.waitForFunction(() => window.__PS04M61_LAB__?.geometrySnapshot?.()?.settledGeometryId === "single-event", null, { timeout: 30000 });
    } catch {
      const snapshot = await page.evaluate(() => {
        const handle = window.__PS04M61_LAB__;
        return {
          activeNode: handle.activeNode,
          geometry: handle.geometrySnapshot(),
          transaction: handle.transaction(),
          navigation: handle.navigation(),
          settle: handle.settle(),
          scrollY,
        };
      });
      await page.close();
      return { name, preflightError: "Event did not settle after rapid route within 30 seconds", snapshot, rows: [] };
    }
  }
  const rows = await page.evaluate(async () => {
    const handle = window.__PS04M61_LAB__;
    handle.scrollToNode("01", "smooth");
    const started = performance.now();
    const samples = [];
    while (performance.now() - started < 4200) {
      const tx = handle.transaction();
      const geo = handle.geometrySnapshot();
      const nav = handle.navigation();
      samples.push({
        ms: Math.round(performance.now() - started),
        activeNode: handle.activeNode,
        committedNode: handle.committedNode(),
        targetNodeId: tx.targetNodeId,
        targetGeometryId: tx.targetGeometryId,
        settledGeometryId: geo.settledGeometryId,
        lifecycle: tx.visualLifecycle,
        mode: nav.mode,
        magneticCandidate: nav.magneticCandidateId,
        scrollY: Math.round(scrollY),
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return samples;
  });
  await page.close();
  return { name, rows };
}

try {
  const plain = await scenario("direct-05.3-to-01", false);
  const rapid = await scenario("rapid-then-05.3-to-01", true);
  writeFileSync(report, JSON.stringify({ url, plain, rapid }, null, 2) + "\n");
  for (const item of [plain, rapid]) {
    const firstMasterTarget = item.rows.find((row) => row.targetGeometryId === "master-neutral")?.ms ?? null;
    const firstMasterSettled = item.rows.find((row) => row.settledGeometryId === "master-neutral")?.ms ?? null;
    console.log(`${item.name}: target master ${firstMasterTarget} ms; settled master ${firstMasterSettled} ms${item.preflightError ? `; ${item.preflightError}` : ""}`);
  }
} finally {
  await browser.close();
}
