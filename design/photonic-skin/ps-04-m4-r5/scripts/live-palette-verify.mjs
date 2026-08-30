import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m4-r5/reports");
const BROWSER = path.join(ROOT, "design/photonic-skin/ps-04-m4-r5/renders/browser");
const BASE = process.env.PS04M4_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m4`;
mkdirSync(OUT, { recursive: true });
mkdirSync(BROWSER, { recursive: true });

const SINGLES = [
  { node: "05.1", name: "content", mask: 1, hex: "#4C7AFF" },
  { node: "05.2", name: "design", mask: 2, hex: "#9E64EE" },
  { node: "05.3", name: "event", mask: 4, hex: "#F86927" },
  { node: "05.4", name: "games", mask: 8, hex: "#76A713" },
  { node: "05.5", name: "video", mask: 16, hex: "#E34992" },
  { node: "05.6", name: "digital", mask: 32, hex: "#009FAC" },
  { node: "05.7", name: "merch", mask: 64, hex: "#D5A200" },
];

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
    if (!lab || lab.loading) return false;
    const geo = typeof lab.geometrySnapshot === "function" ? lab.geometrySnapshot() : null;
    const uniforms = window.__PS04M4_MATERIAL_UNIFORMS__;
    if (geo && (geo.status !== "settled" || geo.shaderProgress < 0.999)) return false;
    if (uniforms && Number.isFinite(uniforms.geometryProgress) && uniforms.geometryProgress < 0.999) return false;
    const tx = typeof lab.transaction === "function" ? lab.transaction() : null;
    if (tx && tx.status === "running") return false;
    return true;
  }, null, { timeout: 25000 });
  await page.waitForTimeout(180);
}

async function goNode(page, id) {
  await page.evaluate((node) => window.__PS04M4_LAB__.scrollToNode(node, "auto"), id);
  await page.waitForFunction((node) => window.__PS04M4_LAB__.activeNode === node, id, { timeout: 20000 });
  await page.waitForFunction((node) => {
    const lab = window.__PS04M4_LAB__;
    const tx = typeof lab.transaction === "function" ? lab.transaction() : null;
    const issued = typeof lab.lastActorTarget === "function" ? lab.lastActorTarget() : null;
    const geo = typeof lab.geometrySnapshot === "function" ? lab.geometrySnapshot() : null;
    if (!tx || lab.activeNode !== node) return false;
    if (tx.status === "running") return false;
    if (geo && geo.status !== "settled") return false;
    return issued === node || tx.targetNodeId === node;
  }, id, { timeout: 25000 });
  await waitSettled(page);
}

async function probe(page) {
  return page.evaluate((singles) => {
    const lab = window.__PS04M4_LAB__;
    const palette = typeof lab.paletteSnapshot === "function" ? lab.paletteSnapshot() : null;
    const tx = typeof lab.transaction === "function" ? lab.transaction() : null;
    const uniforms = window.__PS04M4_MATERIAL_UNIFORMS__ ?? null;
    const driver = lab.diagnostics?.() ? lab.diagnostics().driverPalette : null;
    const diag = typeof lab.diagnostics === "function" ? lab.diagnostics() : {};
    const canvas = document.querySelector("canvas");
    const ctx = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
    let pixels = null;
    if (canvas) {
      const copy = document.createElement("canvas");
      copy.width = Math.min(canvas.width, 720);
      copy.height = Math.min(canvas.height, 450);
      const c2d = copy.getContext("2d");
      if (c2d) {
        c2d.drawImage(canvas, 0, 0, copy.width, copy.height);
        pixels = c2d.getImageData(0, 0, copy.width, copy.height).data;
      }
    }
    const occupancy = {};
    if (pixels) {
      const colors = singles.map((row) => ({
        name: row.name,
        mask: row.mask,
        rgb: [
          parseInt(row.hex.slice(1, 3), 16),
          parseInt(row.hex.slice(3, 5), 16),
          parseInt(row.hex.slice(5, 7), 16),
        ],
      }));
      const counts = Object.fromEntries(colors.map((row) => [row.name, 0]));
      let actor = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        const a = pixels[index + 3];
        if (a < 8) continue;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (luma < 12) continue;
        actor += 1;
        let best = null;
        let bestDist = 48;
        for (const color of colors) {
          const dist = Math.hypot(r - color.rgb[0], g - color.rgb[1], b - color.rgb[2]);
          if (dist < bestDist) {
            bestDist = dist;
            best = color.name;
          }
        }
        if (best) counts[best] += 1;
      }
      for (const [name, count] of Object.entries(counts)) {
        occupancy[name] = actor === 0 ? 0 : Number((count / actor).toFixed(4));
      }
      occupancy.__actorPixels = actor;
    }
    return {
      node: lab.activeNode,
      sessionId: lab.sessionId,
      tx: tx ? {
        status: tx.status,
        sourceMask: tx.sourcePaletteMask,
        targetMask: tx.targetPaletteMask,
        settledLutHash: tx.settledPaletteLutHash,
        shaderBaseLutHash: tx.shaderBaseLutHash,
        paletteProgress: tx.paletteProgress,
        ownership: tx.paletteOwnershipMode,
        geometryProgress: tx.geometryProgress,
        programReady: tx.programReady,
        revision: tx.revision,
      } : null,
      palette: palette ? {
        settledMask: palette.settledMask,
        targetMask: palette.targetMask,
        shaderMask: palette.shaderMask,
        shaderProgress: palette.shaderProgress,
        ownershipEnabled: palette.ownershipEnabled,
        settledLutHash: palette.settledLutHash,
        targetLutHash: palette.targetLutHash,
        shaderBaseLutHash: palette.shaderBaseLutHash,
        sourceLutHash: palette.sourceLutHash,
        colorPhase: palette.colorPhase,
        activeTransition: palette.activeTransition,
      } : null,
      uniforms,
      driver,
      programCache: typeof lab.programCache === "function" ? lab.programCache() : null,
      programs: lab.stats?.programs ?? null,
      draws: lab.stats?.lastActorDrawCalls ?? null,
      materialUuid: lab.stats?.materialUuid ?? uniforms?.materialUuid ?? null,
      occupancy,
      geometry: typeof lab.geometrySnapshot === "function" ? lab.geometrySnapshot() : null,
      renderAck: typeof lab.renderAck === "function" ? lab.renderAck() : null,
      latencies: typeof lab.latencies === "function" ? lab.latencies() : null,
      webgl: ctx ? { vendor: ctx.getParameter(ctx.VENDOR), renderer: ctx.getParameter(ctx.RENDERER) } : null,
      diagnosticsPhase: diag?.palette?.colorPhase ?? null,
    };
  }, SINGLES);
}

function failuresForSingle(row, sample) {
  const failures = [];
  if (sample.palette?.settledMask !== row.mask) failures.push(`settledMask ${sample.palette?.settledMask} != ${row.mask}`);
  if (sample.palette?.shaderMask !== row.mask) failures.push(`shaderMask ${sample.palette?.shaderMask} != ${row.mask}`);
  if (sample.palette?.shaderProgress !== 1) failures.push(`shaderProgress ${sample.palette?.shaderProgress}`);
  if (sample.palette?.ownershipEnabled !== false) failures.push("ownership still enabled");
  if (sample.palette?.activeTransition != null) failures.push("activeTransition not null");
  if (sample.palette?.settledLutHash !== sample.palette?.targetLutHash) failures.push("settledLut != targetLut");
  if (sample.palette?.shaderBaseLutHash !== sample.palette?.targetLutHash) failures.push("shaderBaseLut != targetLut");
  if (sample.tx?.ownership !== 0) failures.push(`tx ownership ${sample.tx?.ownership}`);
  if (sample.uniforms && sample.uniforms.mask !== row.mask) failures.push(`uniform mask ${sample.uniforms.mask}`);
  if (sample.uniforms && sample.uniforms.progress !== 1) failures.push(`uniform progress ${sample.uniforms.progress}`);
  if (sample.uniforms && sample.uniforms.ownership !== 0) failures.push(`uniform ownership ${sample.uniforms.ownership}`);
  if (sample.geometry && sample.geometry.status !== "settled") failures.push(`geometry status ${sample.geometry.status}`);
  if (sample.geometry && sample.geometry.shaderProgress !== 1) failures.push(`geometry shaderProgress ${sample.geometry.shaderProgress}`);
  if (sample.uniforms && Number.isFinite(sample.uniforms.geometryProgress) && sample.uniforms.geometryProgress !== 1) {
    failures.push(`uniform geometryProgress ${sample.uniforms.geometryProgress}`);
  }
  const occupancy = sample.occupancy ?? {};
  const selected = occupancy[row.name] ?? 0;
  const unselected = SINGLES.filter((item) => item.name !== row.name)
    .map((item) => ({ name: item.name, weight: occupancy[item.name] ?? 0 }))
    .filter((item) => item.weight > 0.04);
  if (unselected.length >= 4) failures.push(`framebuffer all-seven leak ${JSON.stringify(unselected)}`);
  return { failures, selected, unselected };
}

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60000);
  const report = { capturedAt: new Date().toISOString(), singles: [], persistence: [], dark: [], lifecycle: {}, pass: true, failures: [] };
  try {
    await page.goto(`${LAB}?theme=light&dpr=1`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    const bootPhase = await page.evaluate(() => window.__PS04M4_LAB__.paletteSnapshot()?.colorPhase ?? null);

    for (const row of SINGLES) {
      await goNode(page, row.node);
      const sample = await probe(page);
      await page.screenshot({ path: path.join(BROWSER, `${row.name}-settled.png`), fullPage: false });
      const judged = failuresForSingle(row, sample);
      report.singles.push({ ...row, theme: "light", sample, judged });
      if (judged.failures.length) {
        report.pass = false;
        report.failures.push({ node: row.node, theme: "light", failures: judged.failures });
      }
    }

    await goNode(page, "05.2");
    const persistStarted = Date.now();
    for (const delay of [250, 2000, 5000]) {
      const remain = delay - (Date.now() - persistStarted);
      if (remain > 0) await page.waitForTimeout(remain);
      const sample = await probe(page);
      const judged = failuresForSingle(SINGLES[1], sample);
      report.persistence.push({ delayMs: delay, sample, judged });
      if (judged.failures.length) {
        report.pass = false;
        report.failures.push({ node: "05.2", delayMs: delay, failures: judged.failures });
      }
    }

    await page.evaluate(() => window.__PS04M4_LAB__.setTheme("dark"));
    await page.waitForTimeout(400);
    for (const row of SINGLES) {
      await goNode(page, row.node);
      const sample = await probe(page);
      await page.screenshot({ path: path.join(BROWSER, `${row.name}-settled-dark.png`), fullPage: false });
      const judged = failuresForSingle(row, sample);
      report.dark.push({ ...row, theme: "dark", sample, judged });
      if (judged.failures.length) {
        report.pass = false;
        report.failures.push({ node: row.node, theme: "dark", failures: judged.failures });
      }
    }

    const afterTheme = await page.evaluate(() => window.__PS04M4_LAB__.paletteSnapshot()?.colorPhase ?? null);
    await page.evaluate(() => window.__PS04M4_LAB__.setTheme("light"));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitSettled(page);
    const afterResize = await probe(page);
    await page.evaluate(() => window.__PS04M4_LAB__.loseContext());
    await page.waitForTimeout(900);
    await waitSettled(page);
    const afterRestore = await probe(page);
    report.lifecycle = {
      bootPhase,
      afterTheme,
      afterResize: {
        mask: afterResize.palette?.settledMask,
        lut: afterResize.palette?.settledLutHash,
        phase: afterResize.palette?.colorPhase,
      },
      afterRestore: {
        mask: afterRestore.palette?.settledMask,
        lut: afterRestore.palette?.settledLutHash,
        phase: afterRestore.palette?.colorPhase,
        contextState: await page.evaluate(() => window.__PS04M4_LAB__.contextState),
      },
      materialUuidStable: afterResize.materialUuid === afterRestore.materialUuid,
      programs: afterRestore.programs,
    };
    if (bootPhase === 0 || afterTheme === 0) {
      report.pass = false;
      report.failures.push({ lifecycle: "color phase reset to 0" });
    }
    if (afterResize.palette?.settledLutHash !== afterRestore.palette?.settledLutHash) {
      report.pass = false;
      report.failures.push({ lifecycle: "context restore changed settled LUT" });
    }

    writeFileSync(path.join(OUT, "live-route-palette.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify({
      pass: report.pass,
      failures: report.failures,
      programs: afterRestore.programs,
      materialUuid: afterRestore.materialUuid,
    }, null, 2)}\n`);
    if (!report.pass) process.exitCode = 1;
  } catch (error) {
    writeFileSync(path.join(OUT, "live-route-palette.json"), JSON.stringify({ ok: false, error: String(error) }, null, 2));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
