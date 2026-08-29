import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m2/renders/browser");
const BASE = process.env.PS04M2_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m2`;
const PREVIEW = `${BASE}/visual-lab/photonic-skin-ps04-m2/preview`;
const M1 = `${BASE}/visual-lab/photonic-skin-ps04-m1`;
const LEGACY = `${BASE}/visual-lab/photonic-skin-m4-1r`;

const SINGLES = ["content", "design", "event", "games", "video", "digital", "merch"];
const PHASES = [0, 0.25, 0.5, 0.75];

mkdirSync(OUT, { recursive: true });
mkdirSync(path.join(OUT, "sequences"), { recursive: true });

function labUrl(params) {
  const query = new URLSearchParams({
    play: "0",
    dpr: "1.5",
    profile: "desktop",
    camera: "canonical",
    color: "1",
    layer: "full",
    field: "material",
    renderer: "m2",
    variation: "1",
    ...params,
  });
  return `${LAB}?${query}`;
}

async function waitReady(page, timeout = 25000) {
  await page.waitForSelector("canvas", { timeout });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M2_LAB__;
    return Boolean(canvas && canvas.width > 8 && lab && lab.coverage && lab.snapshot);
  }, null, { timeout });
  await page.waitForTimeout(320);
}

async function shotFigure(page, name) {
  const figure = page.locator("[data-qa='ps04m2-stage'] figure").first();
  await figure.waitFor({ state: "visible", timeout: 20000 });
  await figure.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function shotPage(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

async function captureLab(page, name, params) {
  try {
    await page.setViewportSize({ width: 1440, height: 920 });
    await page.goto(labUrl(params), { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitReady(page);
    await shotFigure(page, name);
    const lab = await page.evaluate(() => window.__PS04M2_LAB__);
    return lab;
  } catch (error) {
    process.stdout.write(`FAILED ${name}: ${error instanceof Error ? error.message : String(error)}\n`);
    await shotPage(page, `${name}-FAILED`).catch(() => null);
    return null;
  }
}

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1440, height: 920 } });
  page.setDefaultTimeout(45000);
  const log = [];
  const record = (name, extra) => {
    log.push({ name, at: new Date().toISOString(), ...extra });
    process.stdout.write(`captured ${name}\n`);
  };

  try {
    const env = await captureLab(page, "master-light-phase-025", {
      state: "master-neutral", theme: "light", phase: "0.25",
    });
    record("master-light-phase-025", { stats: env?.stats, gpu: env?.environment?.gpuRenderer });

    for (const theme of ["light", "dark"]) {
      await captureLab(page, `m1-bypass-${theme}`, {
        state: "master-neutral", theme, phase: "0.25", color: "0", renderer: "m2",
      });
      record(`m1-bypass-${theme}`);
      await captureLab(page, `m1-renderer-${theme}`, {
        state: "master-neutral", theme, phase: "0.25", renderer: "m1",
      });
      record(`m1-renderer-${theme}`);
      await captureLab(page, `master-${theme}-color`, {
        state: "master-neutral", theme, phase: "0.25",
      });
      record(`master-${theme}-color`);
    }

    for (const theme of ["light", "dark"]) {
      for (const phase of PHASES) {
        const name = `master-${theme}-phase-${String(phase).replace(".", "")}`;
        await captureLab(page, name, { state: "master-neutral", theme, phase: String(phase) });
        record(name);
      }
    }

    for (const theme of ["light", "dark"]) {
      for (const camera of ["canonical", "alternate"]) {
        for (const competence of SINGLES) {
          const name = `single-${competence}-${camera}-${theme}`;
          await captureLab(page, name, {
            state: `single-${competence}`, theme, camera, phase: "0.25",
          });
          record(name);
        }
      }
    }

    for (const theme of ["light", "dark"]) {
      for (const phase of PHASES) {
        const name = `slash-content-${theme}-phase-${String(phase).replace(".", "")}`;
        await captureLab(page, name, { state: "single-content", theme, phase: String(phase) });
        record(name);
      }
    }

    const two = {
      focus: "complex-focus-content-design-focus-content",
      gather: "complex-gather-content-design",
      drive: "complex-drive-content-design",
      focusContrast: "complex-focus-digital-event-focus-digital",
    };
    const three = {
      focus: "complex-focus-content-design-digital-focus-content",
      gather: "complex-gather-content-design-digital",
      drive: "complex-drive-content-design-digital",
    };
    const four = {
      focus: "complex-focus-content-design-digital-event-focus-content",
      gather: "complex-gather-content-design-digital-event",
      drive: "complex-drive-content-design-digital-event",
    };

    for (const theme of ["light", "dark"]) {
      for (const [family, state] of Object.entries(two)) {
        const name = `two-${family}-${theme}`;
        await captureLab(page, name, { state, theme, phase: "0.25" });
        record(name);
      }
      for (const [family, state] of Object.entries(three)) {
        const name = `three-${family}-${theme}`;
        await captureLab(page, name, { state, theme, phase: "0.25" });
        record(name);
      }
      for (const [family, state] of Object.entries(four)) {
        const name = `four-${family}-${theme}`;
        await captureLab(page, name, { state, theme, phase: "0.25" });
        record(name);
      }
    }

    const brand = "brand-wide-gather-content-design-digital-event-games-merch-video";
    const brandDrive = "brand-wide-drive-content-design-digital-event-games-merch-video";
    for (const theme of ["light", "dark"]) {
      for (const phase of PHASES) {
        const name = `brand-wide-${theme}-phase-${String(phase).replace(".", "")}`;
        await captureLab(page, name, { state: brand, theme, phase: String(phase) });
        record(name);
      }
      await captureLab(page, `brand-wide-drive-${theme}`, { state: brandDrive, theme, phase: "0.25" });
      record(`brand-wide-drive-${theme}`);
    }

    for (const theme of ["light", "dark"]) {
      await captureLab(page, `closeup-neutral-${theme}`, {
        state: "single-content", theme, phase: "0.25", layer: "neutral", closeup: "1",
      });
      record(`closeup-neutral-${theme}`);
      await captureLab(page, `closeup-full-${theme}`, {
        state: "single-content", theme, phase: "0.25", closeup: "1",
      });
      record(`closeup-full-${theme}`);
    }

    for (const theme of ["light", "dark"]) {
      await captureLab(page, `mobile-${theme}`, {
        state: "master-neutral", theme, phase: "0.31", profile: "mobile390",
      });
      record(`mobile-${theme}`);
      await captureLab(page, `silhouette180-${theme}`, {
        state: brandDrive, theme, phase: "0.25", profile: "silhouette180",
      });
      record(`silhouette180-${theme}`);
      await captureLab(page, `silhouette96-${theme}`, {
        state: brandDrive, theme, phase: "0.25", profile: "silhouette96",
      });
      record(`silhouette96-${theme}`);
      await captureLab(page, `silhouette96-gather-${theme}`, {
        state: brand, theme, phase: "0.25", profile: "silhouette96",
      });
      record(`silhouette96-gather-${theme}`);
    }

    for (const camera of ["canonical", "side", "top"]) {
      await captureLab(page, `field-camera-${camera}`, {
        state: "single-content", theme: "light", phase: "0.25", camera, field: "coordinate",
      });
      record(`field-camera-${camera}`);
    }
    await captureLab(page, "field-coverage", {
      state: "single-content", theme: "light", phase: "0.25", field: "coverage",
    });
    record("field-coverage");
    await captureLab(page, "field-semantic", {
      state: "master-neutral", theme: "light", phase: "0.25", field: "semantic",
    });
    record("field-semantic");

    await captureLab(page, "reduced-motion", {
      state: "single-content", theme: "light", phase: "0.31", reduced: "1",
    });
    record("reduced-motion");
    await captureLab(page, "custom-mismatch", {
      state: "single-content", theme: "light", phase: "0.25",
      palette: "custom", mask: String(0b1111111),
    });
    record("custom-mismatch");

    await page.goto(labUrl({ state: "single-content", theme: "light", phase: "0.37", play: "0" }), { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await page.click("button:has-text('Lose / restore context')");
    await page.waitForFunction(() => window.__PS04M2_LAB__ && window.__PS04M2_LAB__.contextState === "restored", null, { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(400);
    await shotFigure(page, "context-restored");
    record("context-restored");

    await page.setViewportSize({ width: 820, height: 920 });
    await page.goto(labUrl({ state: "master-neutral", theme: "light", phase: "0.25" }), { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await shotPage(page, "resize-narrow");
    record("resize-narrow");
    await page.setViewportSize({ width: 1440, height: 920 });
    await page.waitForTimeout(400);
    await shotPage(page, "resize-wide");
    record("resize-wide");

    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${PREVIEW}?theme=${theme}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(() => window.__PS04M2_SCENE_READY__, null, { timeout: 25000 });
      await page.waitForTimeout(400);
      await shotPage(page, `hero-desktop-${theme}`);
      record(`hero-desktop-${theme}`);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await shotPage(page, `hero-mobile-${theme}`);
      record(`hero-mobile-${theme}`);
    }

    await page.setViewportSize({ width: 1440, height: 920 });
    await page.goto(M1, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1800);
    await shotPage(page, "legacy-m1-route");
    record("legacy-m1-route");
    await page.goto(LEGACY, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1800);
    await shotPage(page, "legacy-m41r-route");
    record("legacy-m41r-route");

    const sequence = async (folder, params, frames, intervalMs) => {
      const dir = path.join(OUT, "sequences", folder);
      mkdirSync(dir, { recursive: true });
      await page.setViewportSize({ width: 1440, height: 920 });
      await page.goto(labUrl({ ...params, play: "1" }), { waitUntil: "domcontentloaded" });
      await waitReady(page);
      await page.evaluate(() => {
        const controller = window.__PS04M2_LAB__;
        return controller;
      });
      const timestamps = [];
      const started = Date.now();
      for (let index = 0; index < frames; index += 1) {
        const figure = page.locator("[data-qa='ps04m2-stage'] figure").first();
        await figure.screenshot({ path: path.join(dir, `frame-${String(index).padStart(2, "0")}.png`) });
        timestamps.push({ index, ms: Date.now() - started });
        if (index < frames - 1) await page.waitForTimeout(intervalMs);
      }
      writeFileSync(path.join(dir, "timestamps.json"), JSON.stringify({ folder, params, intervalMs, timestamps }, null, 2));
      record(`sequence-${folder}`, { frames, intervalMs });
    };

    await sequence("single-content-cycle", { state: "single-content", theme: "light", play: "1" }, 8, 1750);
    await sequence("master-cycle", { state: "master-neutral", theme: "light", play: "1" }, 8, 4000);
    await sequence("gather-cycle", { state: "complex-gather-content-design", theme: "dark", play: "1" }, 8, 4000);

    await page.goto(labUrl({ state: "single-content", theme: "light", phase: "0.2", play: "0" }), { waitUntil: "domcontentloaded" });
    await waitReady(page);
    const retargetDir = path.join(OUT, "sequences", "retarget");
    mkdirSync(retargetDir, { recursive: true });
    await page.locator("[data-qa='ps04m2-stage'] figure").first().screenshot({ path: path.join(retargetDir, "frame-00.png") });
    await page.click("button:has-text('Run A → B → C interruption')");
    for (const [index, delay] of [120, 280, 500, 900].entries()) {
      await page.waitForTimeout(delay);
      await page.locator("[data-qa='ps04m2-stage'] figure").first().screenshot({ path: path.join(retargetDir, `frame-${String(index + 1).padStart(2, "0")}.png`) });
    }
    record("sequence-retarget");

    await page.goto(labUrl({
      state: "single-event", source: "master-neutral", theme: "light", phase: "0.25", play: "0",
    }), { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await page.locator("label:has-text('Static frozen endpoint') input").uncheck().catch(() => null);
    await page.waitForTimeout(200);
    const geoDir = path.join(OUT, "sequences", "geometry-color");
    mkdirSync(geoDir, { recursive: true });
    for (const [index, progress] of [0, 0.25, 0.5, 0.75, 1].entries()) {
      await page.evaluate((value) => {
        const input = [...document.querySelectorAll("input[type='range']")].find((node) => node.parentElement?.textContent?.includes("Frozen transition"));
        if (!input) return;
        input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, progress);
      await page.waitForTimeout(250);
      await page.locator("[data-qa='ps04m2-stage'] figure").first().screenshot({ path: path.join(geoDir, `frame-${String(index).padStart(2, "0")}.png`) });
    }
    record("sequence-geometry-color");

    await page.setViewportSize({ width: 1440, height: 920 });
    await page.goto(labUrl({ state: "master-neutral", theme: "light", phase: "0.25", play: "0" }), { waitUntil: "domcontentloaded" });
    await waitReady(page);
    const vertex = await page.evaluate(async () => {
      const button = document.getElementById("ps04m2-gpu-parity-run-color");
      if (!(button instanceof HTMLButtonElement)) return { error: "missing vertex button" };
      button.click();
      const started = performance.now();
      while (performance.now() - started < 40000) {
        if (button.dataset.status === "done") return JSON.parse(button.dataset.result ?? "{}");
        if (button.dataset.status === "error") return { error: button.dataset.error };
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return { error: "timeout" };
    });
    const field = await page.evaluate(async () => {
      if (!window.__PS04M2_FIELD_GPU_PARITY__) return { error: "missing field probe" };
      return window.__PS04M2_FIELD_GPU_PARITY__();
    });
    const perfM2 = await page.evaluate(() => window.__PS04M2_LAB__);
    await page.goto(labUrl({ state: "master-neutral", theme: "light", phase: "0.25", play: "1", renderer: "m2" }), { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await page.waitForTimeout(2500);
    const warmM2 = await page.evaluate(() => window.__PS04M2_LAB__?.stats);
    await page.goto(`${M1}?state=master-neutral&theme=light`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);
    const warmM1 = await page.evaluate(() => {
      const text = document.body.innerText;
      return { text: text.slice(0, 400) };
    });

    const report = {
      capturedAt: new Date().toISOString(),
      base: BASE,
      frames: log,
      gpuParity: { vertex, field },
      performance: { m2Still: perfM2?.stats, m2Playing: warmM2, m1Hint: warmM1, environment: perfM2?.environment },
    };
    mkdirSync(path.join(ROOT, "design/photonic-skin/ps-04-m2/reports"), { recursive: true });
    writeFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m2/reports/browser-capture-log.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`done ${log.length} frames\n`);
    process.stdout.write(`vertexParity ${JSON.stringify(vertex)}\n`);
    process.stdout.write(`fieldParity ${JSON.stringify(field)}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
