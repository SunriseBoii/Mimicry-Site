import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m4-r5/reports");
const SHEETS = path.join(ROOT, "design/photonic-skin/ps-04-m4-r5/renders/browser/contact-sheets");
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m4`;
mkdirSync(OUT, { recursive: true });
mkdirSync(SHEETS, { recursive: true });

const PAIRS = [
  ["05.1", "05.2", "content-design"],
  ["05.2", "05.3", "design-event"],
  ["05.4", "05.5", "games-video"],
];

function scoreYellowMask(data, width, height) {
  const pixels = new Uint8Array(width * height);
  for (let index = 0; index < pixels.length; index += 1) {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    pixels[index] = r > 180 && g > 180 && b < 80 ? 1 : 0;
  }
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let area = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pixels[y * width + x]) continue;
      area += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (area === 0) {
    return { area: 0, circularity: 0, bboxFill: 0, aspectRatio: 0, spherical: false, masterLike: false };
  }
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  let perimeter = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pixels[y * width + x]) continue;
      if (x === 0 || !pixels[y * width + (x - 1)]) perimeter += 1;
      if (x === width - 1 || !pixels[y * width + (x + 1)]) perimeter += 1;
      if (y === 0 || !pixels[(y - 1) * width + x]) perimeter += 1;
      if (y === height - 1 || !pixels[(y + 1) * width + x]) perimeter += 1;
    }
  }
  const circularity = (4 * Math.PI * area) / Math.max(1, perimeter * perimeter);
  const bboxFill = area / Math.max(1, bw * bh);
  const aspectRatio = bw / Math.max(1, bh);
  const spherical = circularity >= 0.5 && bboxFill >= 0.68 && aspectRatio >= 0.82 && aspectRatio <= 1.22;
  return {
    area,
    circularity: Number(circularity.toFixed(4)),
    bboxFill: Number(bboxFill.toFixed(4)),
    aspectRatio: Number(aspectRatio.toFixed(4)),
    bbox: { width: bw, height: bh },
    spherical,
    masterLike: spherical && area >= 80,
  };
}

async function waitReady(page) {
  await page.waitForSelector("canvas", { timeout: 60000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M4_LAB__;
    return Boolean(canvas && lab && lab.runId === "ps04-m4" && lab.ready);
  }, null, { timeout: 60000 });
}

async function waitSettled(page) {
  await page.waitForFunction(() => {
    const lab = window.__PS04M4_LAB__;
    const tx = lab?.transaction?.();
    if (!lab || lab.loading) return false;
    const geo = typeof lab.geometrySnapshot === "function" ? lab.geometrySnapshot() : null;
    if (geo && geo.status !== "settled") return false;
    if (tx && tx.status === "running") return false;
    return true;
  }, null, { timeout: 25000 });
  await page.waitForTimeout(160);
}

async function goNode(page, id) {
  await page.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), id);
  await page.waitForFunction((node) => window.__PS04M4_LAB__.activeNode === node, id, { timeout: 20000 });
  await page.waitForFunction((node) => {
    const tx = window.__PS04M4_LAB__.transaction?.();
    return Boolean(tx && tx.targetNodeId === node && tx.status !== "running");
  }, id, { timeout: 25000 });
  await waitSettled(page);
}

async function samplePair(page, from, to, name, liftOn) {
  await goNode(page, from);
  const frames = [];
  const beforeRevision = await page.evaluate(() => window.__PS04M4_LAB__.transaction()?.revision ?? 0);
  await page.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), to);
  await page.waitForFunction((prev) => {
    const tx = window.__PS04M4_LAB__.transaction?.();
    return Boolean(tx && (tx.status === "running" || tx.revision !== prev));
  }, beforeRevision, { timeout: 8000 }).catch(() => undefined);
  for (let index = 0; index < 12; index += 1) {
    const file = `${name}-${liftOn ? "lift-on" : "lift-off"}-t${String(index).padStart(2, "0")}.png`;
    await page.screenshot({ path: path.join(SHEETS, file), fullPage: false });
    const frame = await page.evaluate(() => {
      const lab = window.__PS04M4_LAB__;
      const tx = lab.transaction();
      const canvas = document.querySelector("canvas");
      const copy = document.createElement("canvas");
      copy.width = Math.min(canvas.width, 480);
      copy.height = Math.min(canvas.height, 300);
      const c2d = copy.getContext("2d");
      c2d.drawImage(canvas, 0, 0, copy.width, copy.height);
      const image = c2d.getImageData(0, 0, copy.width, copy.height);
      return {
        width: copy.width,
        height: copy.height,
        data: Array.from(image.data),
        tx: {
          status: tx?.status,
          phase: tx?.semanticPhase,
          g: tx?.geometryProgress,
          source: tx?.sourceGeometryId,
          target: tx?.targetGeometryId,
          continuity: tx?.continuityEnabled,
        },
        actorDraw: lab.composition()?.actorDraw,
        continuityLift: lab.diagnostics?.().continuityLift,
      };
    });
    const score = scoreYellowMask(Uint8Array.from(frame.data), frame.width, frame.height);
    const mid = (frame.tx?.g ?? 0) > 0.08 && (frame.tx?.g ?? 0) < 0.92;
    const nonMaster = frame.tx?.source !== "master-neutral" && frame.tx?.target !== "master-neutral";
    frames.push({
      index,
      file,
      score,
      tx: frame.tx,
      actorDraw: frame.actorDraw,
      continuityLift: frame.continuityLift,
      forbidden: Boolean(mid && nonMaster && score.masterLike && frame.actorDraw),
      zeroMask: Boolean(frame.actorDraw && score.area === 0 && index > 0),
    });
    await page.waitForTimeout(70);
  }
  await waitSettled(page);
  return { name, from, to, liftOn, frames };
}

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const report = { capturedAt: new Date().toISOString(), off: [], on: [], pass: true, conclusion: null };
  try {
    for (const liftOn of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      page.setDefaultTimeout(60000);
      const query = liftOn ? "theme=light&dpr=1&actorMask=1&ui=0&continuityLift=1" : "theme=light&dpr=1&actorMask=1&ui=0";
      await page.goto(`${LAB}?${query}`, { waitUntil: "domcontentloaded" });
      await waitReady(page);
      for (const [from, to, name] of PAIRS) {
        const result = await samplePair(page, from, to, name, liftOn);
        (liftOn ? report.on : report.off).push(result);
      }
      await page.close();
    }
    const offForbidden = report.off.flatMap((row) => row.frames.filter((frame) => frame.forbidden));
    const onForbidden = report.on.flatMap((row) => row.frames.filter((frame) => frame.forbidden));
    const offZero = report.off.flatMap((row) => row.frames.filter((frame) => frame.zeroMask));
    const onZero = report.on.flatMap((row) => row.frames.filter((frame) => frame.zeroMask));
    report.summary = {
      offForbidden: offForbidden.length,
      onForbidden: onForbidden.length,
      offZero: offZero.length,
      onZero: onZero.length,
      offMaxCircularity: Math.max(0, ...report.off.flatMap((row) => row.frames.map((frame) => frame.score.circularity))),
      onMaxCircularity: Math.max(0, ...report.on.flatMap((row) => row.frames.map((frame) => frame.score.circularity))),
    };
    if (report.summary.onForbidden > report.summary.offForbidden && report.summary.offForbidden === 0) {
      report.conclusion = "CONFIRMED: radius lift creates MASTER-like sphere; default-off removes it. Overlay remains query-gated only.";
    } else if (report.summary.offForbidden > 0 && report.summary.onForbidden > 0) {
      report.conclusion = "HYPOTHESIS/BLOCKER: sphere remains with lift off; may be frozen program morphology.";
      report.pass = false;
    } else if (report.summary.offForbidden > 0) {
      report.conclusion = "FAIL: sphere remains with lift off.";
      report.pass = false;
    } else {
      report.conclusion = "CONFIRMED: no MASTER-like sphere with lift off. Lift stays disabled.";
    }
    if (report.summary.offZero > 0) {
      report.pass = false;
      report.conclusion = `${report.conclusion} Zero-mask frames with lift off.`;
    }
    writeFileSync(path.join(OUT, "ab-continuity-lift.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify({ pass: report.pass, conclusion: report.conclusion, summary: report.summary }, null, 2)}\n`);
    if (!report.pass) process.exitCode = 1;
  } catch (error) {
    writeFileSync(path.join(OUT, "ab-continuity-lift.json"), JSON.stringify({ ok: false, error: String(error) }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
