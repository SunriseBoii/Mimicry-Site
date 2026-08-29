import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const RUN_ID = process.env.PS04M3_RUN_ID ?? `ps04-m3-${new Date().toISOString().replaceAll(":", "").replaceAll(".", "")}`;
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m3/renders/browser");
const VIDEO = path.join(OUT, "video");
const SEQ = path.join(OUT, "sequences");
const REPORTS = path.join(ROOT, "design/photonic-skin/ps-04-m3/reports");
const BASE = process.env.PS04M3_BASE ?? "http://localhost:3000";
const LAB = `${BASE}/visual-lab/photonic-skin-ps04-m3`;
const PREVIEW = `${BASE}/visual-lab/photonic-skin-ps04-m3/preview`;
const M2 = `${BASE}/visual-lab/photonic-skin-ps04-m2`;

const SINGLES = ["content", "design", "event", "games", "video", "digital", "merch"];
const YAWS = [0, 90, 179, 180, 270, 359];
const BREATHS = [
  { name: "min", breath: 0.75 },
  { name: "base", breath: 0 },
  { name: "max", breath: 0.25 },
];

mkdirSync(OUT, { recursive: true });
mkdirSync(VIDEO, { recursive: true });
mkdirSync(SEQ, { recursive: true });
mkdirSync(REPORTS, { recursive: true });
mkdirSync(path.join(SEQ, "handoff-179"), { recursive: true });
mkdirSync(path.join(SEQ, "retarget-abc"), { recursive: true });
mkdirSync(path.join(SEQ, "phase-boundaries"), { recursive: true });
mkdirSync(path.join(SEQ, "master-color-survey"), { recursive: true });
mkdirSync(path.join(SEQ, "single-rock-excerpt"), { recursive: true });
mkdirSync(path.join(SEQ, "focus-gather-drive"), { recursive: true });
mkdirSync(path.join(SEQ, "master-yaw-probes"), { recursive: true });

function labUrl(params = {}) {
  const query = new URLSearchParams({
    dpr: "1.5",
    profile: "desktop",
    camera: "canonical",
    overlay: "combined",
    ...params,
  });
  return `${LAB}?${query}`;
}

async function waitReady(page, timeout = 45000) {
  await page.waitForSelector("canvas", { timeout });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const lab = window.__PS04M3_LAB__;
    return Boolean(canvas && canvas.width > 8 && lab && lab.runId === "ps04-m3" && lab.ready);
  }, null, { timeout });
  await page.waitForFunction(() => {
    const lab = window.__PS04M3_LAB__;
    return Boolean(window.__PS04M3_SCENE_READY__ || (lab && lab.stats && lab.stats.lastActorDrawCalls > 0));
  }, null, { timeout: 8000 }).catch(() => null);
  await page.waitForTimeout(400);
}

async function waitPreview(page, timeout = 45000) {
  await page.waitForSelector("canvas", { timeout });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    const preview = window.__PS04M3_PREVIEW__;
    return Boolean(canvas && canvas.width > 8 && preview && preview.ready && window.__PS04M3_SCENE_READY__);
  }, null, { timeout });
  await page.waitForTimeout(240);
}

async function labCall(page, name, ...args) {
  return page.evaluate(({ name, args }) => {
    const lab = window.__PS04M3_LAB__;
    if (!lab || typeof lab[name] !== "function") throw new Error(`missing lab hook ${name}`);
    return lab[name](...args);
  }, { name, args });
}

async function fireRequest(page, stateId) {
  await page.evaluate((id) => {
    const lab = window.__PS04M3_LAB__;
    if (!lab || typeof lab.requestState !== "function") throw new Error("missing lab hook requestState");
    void lab.requestState(id);
  }, stateId);
}

async function waitRequested(page, stateId, timeout = 40000) {
  await page.waitForFunction((id) => {
    const lab = window.__PS04M3_LAB__;
    return Boolean(lab && lab.ready && lab.requested === id && lab.loading === false);
  }, stateId, { timeout });
  await page.waitForTimeout(80);
}

async function shotFigure(page, name) {
  const figure = page.locator("[data-qa='ps04m3-stage'] figure").first();
  await figure.waitFor({ state: "visible", timeout: 20000 });
  await figure.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function shotPage(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

async function captureLab(page, name, params, afterReady) {
  await page.setViewportSize({ width: 1440, height: 920 });
  await page.goto(labUrl(params), { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitReady(page);
  if (afterReady) await afterReady(page);
  await shotFigure(page, name);
  const snapshot = await page.evaluate(() => {
    const lab = window.__PS04M3_LAB__;
    return { stats: lab?.stats, snapshot: typeof lab?.snapshot === "function" ? lab.snapshot() : lab?.snapshot, theme: lab?.theme };
  });
  return snapshot;
}

async function denseSequence(page, folder, frames, intervalMs, label) {
  const dir = path.join(SEQ, folder);
  mkdirSync(dir, { recursive: true });
  const timestamps = [];
  const started = Date.now();
  for (let index = 0; index < frames; index += 1) {
    const figure = page.locator("[data-qa='ps04m3-stage'] figure").first();
    await figure.screenshot({ path: path.join(dir, `frame-${String(index).padStart(3, "0")}.png`) });
    timestamps.push({ index, ms: Date.now() - started });
    if (index < frames - 1) await page.waitForTimeout(intervalMs);
  }
  writeFileSync(path.join(dir, "timestamps.json"), JSON.stringify({
    folder, label, intervalMs, frames, captureHz: 1000 / intervalMs, timestamps, runId: RUN_ID,
  }, null, 2));
}

async function recordClip(browser, name, seconds, setup) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 920 },
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO, size: { width: 1440, height: 920 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  try {
    await setup(page);
    await page.waitForTimeout(Math.round(seconds * 1000));
  } finally {
    const video = page.video();
    await page.close();
    await context.close();
    if (video) {
      const dest = path.join(VIDEO, `${name}.webm`);
      await video.saveAs(dest);
      await video.delete().catch(() => null);
      return dest;
    }
  }
  return null;
}

async function main() {
  const failures = [];
  const log = [];
  const record = (name, extra = {}) => {
    log.push({ name, at: new Date().toISOString(), ...extra });
    process.stdout.write(`captured ${name}\n`);
  };
  writeFileSync(path.join(REPORTS, "capture-run.json"), JSON.stringify({ runId: RUN_ID, startedAt: new Date().toISOString(), status: "running" }, null, 2));

  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1440, height: 920 } });
  page.setDefaultTimeout(60000);
  page.on("pageerror", (error) => failures.push({ type: "pageerror", message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push({ type: "console", message: message.text() });
  });

  try {
    if (!process.env.PS04M3_VIDEOS_ONLY) {
    await captureLab(page, "bypass-m2ref-master-light", { state: "master-neutral", theme: "light", overlay: "m2" });
    record("bypass-m2ref-master-light");
    await captureLab(page, "bypass-m2ref-master-dark", { state: "master-neutral", theme: "dark", overlay: "m2" });
    record("bypass-m2ref-master-dark");
    await captureLab(page, "bypass-identity-master-light", {
      state: "master-neutral", theme: "light", overlay: "combined",
    }, async () => {
      await labCall(page, "setPauseAll", true);
      await labCall(page, "seekIdlePhases", 0, 0);
      await labCall(page, "seekColorPhase", 0.25);
    });
    record("bypass-identity-master-light");

    await page.goto(`${M2}?state=master-neutral&theme=light&phase=0.25&play=0&dpr=1.5`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("canvas", { timeout: 25000 });
    await page.waitForTimeout(400);
    await page.locator("[data-qa='ps04m2-stage'] figure").first().screenshot({ path: path.join(OUT, "m2-route-master-light.png") }).catch(async () => {
      await shotPage(page, "m2-route-master-light");
    });
    record("m2-route-master-light");

    for (const theme of ["light", "dark"]) {
      for (const breath of BREATHS) {
        const name = `master-${theme}-breath-${breath.name}`;
        await captureLab(page, name, { state: "master-neutral", theme, overlay: "combined" }, async () => {
          await labCall(page, "setIdleChannel", "breathing");
          await labCall(page, "setPauseAll", true);
          await labCall(page, "seekIdlePhases", breath.breath, 0);
          await labCall(page, "seekColorPhase", 0.25);
        });
        record(name);
      }
      for (const yaw of YAWS) {
        const name = `master-${theme}-yaw-${yaw}`;
        await captureLab(page, name, { state: "master-neutral", theme, overlay: "combined" }, async () => {
          await labCall(page, "setIdleChannel", "rotation");
          await labCall(page, "setPauseAll", true);
          await labCall(page, "seekIdlePhases", 0, yaw / 360);
          await labCall(page, "seekColorPhase", 0.25);
        });
        record(name);
      }
    }

    for (const theme of ["light", "dark"]) {
      for (const camera of ["canonical", "alternate"]) {
        for (const competence of SINGLES) {
          const name = `single-${competence}-${camera}-${theme}`;
          await captureLab(page, name, {
            state: `single-${competence}`, theme, camera, overlay: "combined",
          }, async () => {
            await labCall(page, "setIdleChannel", "combined");
            await labCall(page, "setPauseAll", true);
            await labCall(page, "seekIdlePhases", 0.25, 0.25);
            await labCall(page, "seekColorPhase", 0.25);
          });
          record(name);
        }
      }
    }

    const compounds = {
      focus: "complex-focus-content-design-focus-content",
      gather: "complex-gather-content-design",
      drive: "complex-drive-content-design",
      brand: "brand-wide-drive-content-design-digital-event-games-merch-video",
    };
    for (const theme of ["light", "dark"]) {
      for (const [label, state] of Object.entries(compounds)) {
        const name = `compound-${label}-${theme}`;
        await captureLab(page, name, { state, theme, overlay: "combined" }, async () => {
          await labCall(page, "setPauseAll", true);
          await labCall(page, "seekIdlePhases", 0.25, 0.25);
          await labCall(page, "seekColorPhase", 0.25);
        });
        record(name);
      }
    }

    const phases = [
      ["pre", 0],
      ["release", 0.10],
      ["regroup", 0.24],
      ["reveal", 0.40],
      ["approach", 0.70],
      ["settle", 0.92],
    ];
    await page.goto(labUrl({ state: "master-neutral", theme: "light", overlay: "combined" }), { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await labCall(page, "setPauseAll", true);
    await labCall(page, "seekIdlePhases", 0, 90 / 360);
    await labCall(page, "requestState", "single-event");
    await waitRequested(page, "single-event");
    for (const [label, progress] of phases) {
      await labCall(page, "seekGeometryProgress", progress);
      await page.waitForTimeout(80);
      await shotFigure(page, `phase-${label}-light`);
      record(`phase-${label}-light`);
    }

    for (const theme of ["light", "dark"]) {
      await captureLab(page, `silhouette180-${theme}`, {
        state: "complex-drive-content-design", theme, profile: "silhouette180", overlay: "combined",
      }, async () => {
        await labCall(page, "setPauseAll", true);
        await labCall(page, "seekIdlePhases", 0.25, 0.25);
      });
      record(`silhouette180-${theme}`);
      await captureLab(page, `silhouette96-${theme}`, {
        state: "complex-drive-content-design", theme, profile: "silhouette96", overlay: "combined",
      }, async () => {
        await labCall(page, "setPauseAll", true);
        await labCall(page, "seekIdlePhases", 0.25, 0.25);
      });
      record(`silhouette96-${theme}`);
      await captureLab(page, `mobile390-${theme}`, {
        state: "single-content", theme, profile: "mobile390", overlay: "combined",
      }, async () => {
        await labCall(page, "setPauseAll", true);
        await labCall(page, "seekIdlePhases", 0.25, 0.25);
      });
      record(`mobile390-${theme}`);
    }

    await captureLab(page, "reduced-motion", {
      state: "master-neutral", theme: "light", overlay: "combined", reduced: "1",
    });
    record("reduced-motion");
    await captureLab(page, "pause-all", { state: "master-neutral", theme: "light", overlay: "combined" }, async () => {
      await labCall(page, "setPauseAll", true);
      await labCall(page, "seekIdlePhases", 0.3, 0.2);
    });
    record("pause-all");
    await captureLab(page, "hidden-freeze", { state: "master-neutral", theme: "light", overlay: "combined" }, async () => {
      await labCall(page, "setPauseAll", false);
      await labCall(page, "seekIdlePhases", 0.2, 0.3);
      await labCall(page, "setHidden", true);
    });
    record("hidden-freeze");
    await captureLab(page, "dpr-1", { state: "single-content", theme: "light", overlay: "combined", dpr: "1" }, async () => {
      await labCall(page, "setPauseAll", true);
      await labCall(page, "seekIdlePhases", 0.25, 0.25);
    });
    record("dpr-1");
    await captureLab(page, "dpr-2", { state: "single-content", theme: "light", overlay: "combined", dpr: "2" }, async () => {
      await labCall(page, "setPauseAll", true);
      await labCall(page, "seekIdlePhases", 0.25, 0.25);
    });
    record("dpr-2");
    await captureLab(page, "side-by-side", { state: "master-neutral", theme: "light", overlay: "combined", compare: "1" }, async () => {
      await labCall(page, "setPauseAll", true);
      await labCall(page, "seekIdlePhases", 0.25, 0.2);
    });
    record("side-by-side");

    await page.goto(labUrl({ state: "single-event", theme: "dark", overlay: "combined" }), { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await labCall(page, "seekIdlePhases", 0.2, 90 / 360);
    await labCall(page, "requestState", "single-design");
    await page.waitForTimeout(180);
    await labCall(page, "loseContext");
    await page.waitForTimeout(600);
    await shotFigure(page, "context-restore-retarget-dark");
    record("context-restore-retarget-dark");

    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${PREVIEW}?theme=${theme}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await waitPreview(page);
      await shotPage(page, `hero-desktop-${theme}`);
      record(`hero-desktop-${theme}`);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500);
      await shotPage(page, `hero-mobile-${theme}`);
      record(`hero-mobile-${theme}`);
    }
    await page.setViewportSize({ width: 1440, height: 920 });
    await page.goto(`${PREVIEW}?theme=dark`, { waitUntil: "domcontentloaded" });
    await waitPreview(page);
    await shotPage(page, "hero-first-frame-dark");
    record("hero-first-frame-dark");

    await page.goto(labUrl({ state: "master-neutral", theme: "light", overlay: "combined" }), { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await labCall(page, "setIdleChannel", "combined");
    await labCall(page, "setPauseAll", true);
    await labCall(page, "seekColorPhase", 0);
    await labCall(page, "setColorWavePaused", false);
    await labCall(page, "setPauseAll", false);
    await denseSequence(page, "master-color-survey", 65, 500, "4 fps survey of a 32s MASTER color cycle; not a 30fps proof");
    record("sequence-master-color-survey");

    await page.goto(labUrl({ state: "single-content", theme: "light", overlay: "combined" }), { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await labCall(page, "setIdleChannel", "combined");
    await labCall(page, "setPauseAll", false);
    await denseSequence(page, "single-rock-excerpt", 120, 67, "≈15 fps excerpt of SINGLE rock (8s of the 26s period); full tempo is the realtime webm");
    record("sequence-single-rock-excerpt");

    await page.goto(labUrl({ state: "master-neutral", theme: "light", overlay: "combined" }), { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await labCall(page, "setPauseAll", true);
    await labCall(page, "seekIdlePhases", 0, 179 / 360);
    await shotFigure(page, "handoff-179-before");
    const pre = path.join(SEQ, "handoff-179");
    await page.locator("[data-qa='ps04m3-stage'] figure").first().screenshot({ path: path.join(pre, "frame-000.png") });
    await labCall(page, "setPauseAll", false);
    await fireRequest(page, "single-event");
    await denseSequence(page, "handoff-179", 90, 33, "≈30 fps, 3s, MASTER yaw 179° → SINGLE event; request fired, not awaited, so the click frame is in the clip");
    record("sequence-handoff-179");

    await page.goto(labUrl({ state: "single-content", theme: "light", overlay: "combined" }), { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await labCall(page, "setPauseAll", false);
    await page.locator("[data-qa='ps04m3-stage'] figure").first().screenshot({ path: path.join(SEQ, "retarget-abc", "frame-000.png") });
    const retargetDir = path.join(SEQ, "retarget-abc");
    mkdirSync(retargetDir, { recursive: true });
    const retargetTs = [];
    const retargetStarted = Date.now();
    await fireRequest(page, "single-design");
    for (let index = 0; index < 90; index += 1) {
      if (index === 4) await fireRequest(page, "single-event");
      await page.locator("[data-qa='ps04m3-stage'] figure").first().screenshot({
        path: path.join(retargetDir, `frame-${String(index).padStart(3, "0")}.png`),
      });
      retargetTs.push({ index, ms: Date.now() - retargetStarted });
      if (index < 89) await page.waitForTimeout(33);
    }
    writeFileSync(path.join(retargetDir, "timestamps.json"), JSON.stringify({
      folder: "retarget-abc",
      label: "≈30 fps A→B→C; B at frame 0, C at frame 4 (~132 ms); last request wins",
      intervalMs: 33,
      frames: 90,
      timestamps: retargetTs,
      runId: RUN_ID,
    }, null, 2));
    record("sequence-retarget-abc");

    await page.goto(labUrl({ state: "complex-focus-content-design-focus-content", theme: "dark", overlay: "combined" }), { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await labCall(page, "setPauseAll", false);
    await fireRequest(page, "complex-gather-content-design");
    await page.waitForTimeout(350);
    await fireRequest(page, "complex-drive-content-design");
    await denseSequence(page, "focus-gather-drive", 60, 50, "20 fps same-mask FOCUS→GATHER→DRIVE");
    record("sequence-focus-gather-drive");

    await page.goto(labUrl({ state: "master-neutral", theme: "light", overlay: "combined" }), { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await labCall(page, "setPauseAll", true);
    await labCall(page, "seekIdlePhases", 0, 90 / 360);
    await labCall(page, "requestState", "single-event");
    await waitRequested(page, "single-event");
    const dir = path.join(SEQ, "phase-boundaries");
    mkdirSync(dir, { recursive: true });
    const marks = [0, 0.069, 0.07, 0.109, 0.11, 0.239, 0.24, 0.399, 0.40, 0.619, 0.62, 0.859, 0.86, 1];
    for (const [index, progress] of marks.entries()) {
      await labCall(page, "seekGeometryProgress", progress);
      await page.waitForTimeout(40);
      await page.locator("[data-qa='ps04m3-stage'] figure").first().screenshot({
        path: path.join(dir, `frame-${String(index).padStart(2, "0")}-t${String(progress).replace(".", "")}.png`),
      });
    }
    writeFileSync(path.join(dir, "timestamps.json"), JSON.stringify({ marks, label: "deterministic M4 phase-boundary probes" }, null, 2));
    record("sequence-phase-boundaries");

    await page.goto(labUrl({ state: "master-neutral", theme: "light", overlay: "combined" }), { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await labCall(page, "setPauseAll", true);
    const yawDir = path.join(SEQ, "master-yaw-probes");
    mkdirSync(yawDir, { recursive: true });
    for (const yaw of YAWS) {
      await labCall(page, "seekIdlePhases", 0, yaw / 360);
      await page.waitForTimeout(40);
      await page.locator("[data-qa='ps04m3-stage'] figure").first().screenshot({ path: path.join(yawDir, `yaw-${yaw}.png`) });
    }
    record("sequence-master-yaw-probes");
    }

    const videos = {};
    videos.masterIdle32s = await recordClip(browser, "master-idle-32s-realtime", 32, async (clip) => {
      await clip.goto(labUrl({ state: "master-neutral", theme: "light", overlay: "combined" }), { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await labCall(clip, "setIdleChannel", "combined");
      await labCall(clip, "setPauseAll", false);
    });
    record("video-master-idle-32s");
    videos.singleRock26s = await recordClip(browser, "single-content-rock-26s-realtime", 26, async (clip) => {
      await clip.goto(labUrl({ state: "single-content", theme: "light", overlay: "combined" }), { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await labCall(clip, "setIdleChannel", "combined");
      await labCall(clip, "setPauseAll", false);
    });
    record("video-single-rock-26s");
    videos.handoff179 = await recordClip(browser, "handoff-179-realtime", 5, async (clip) => {
      await clip.goto(labUrl({ state: "master-neutral", theme: "light", overlay: "combined" }), { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await labCall(clip, "setPauseAll", true);
      await labCall(clip, "seekIdlePhases", 0, 179 / 360);
      await clip.waitForTimeout(400);
      await labCall(clip, "setPauseAll", false);
      await labCall(clip, "requestState", "single-event");
    });
    record("video-handoff-179");
    videos.retarget = await recordClip(browser, "retarget-abc-realtime", 5, async (clip) => {
      await clip.goto(labUrl({ state: "single-content", theme: "light", overlay: "combined" }), { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await labCall(clip, "requestState", "single-design");
      await clip.waitForTimeout(180);
      await labCall(clip, "requestState", "single-event");
    });
    record("video-retarget-abc");
    videos.focusGatherDrive = await recordClip(browser, "focus-gather-drive-realtime", 6, async (clip) => {
      await clip.goto(labUrl({ state: "complex-focus-content-design-focus-content", theme: "dark", overlay: "combined" }), { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await labCall(clip, "requestState", "complex-gather-content-design");
      await clip.waitForTimeout(400);
      await labCall(clip, "requestState", "complex-drive-content-design");
    });
    record("video-focus-gather-drive");
    videos.masterTurnAccelerated = await recordClip(browser, "master-turn-15s-ACCELERATED-NOT-REALTIME", 0.2, async (clip) => {
      await clip.goto(labUrl({ state: "master-neutral", theme: "dark", overlay: "combined" }), { waitUntil: "domcontentloaded" });
      await waitReady(clip);
      await labCall(clip, "setIdleChannel", "rotation");
      await labCall(clip, "setPauseAll", true);
      for (let step = 0; step <= 180; step += 1) {
        await labCall(clip, "seekIdlePhases", 0, step / 180);
        await clip.waitForTimeout(80);
      }
    });
    record("video-master-turn-accelerated-labeled");

    const report = {
      runId: RUN_ID,
      capturedAt: new Date().toISOString(),
      base: BASE,
      frames: log,
      failures,
      videos,
    };
    writeFileSync(path.join(REPORTS, "browser-capture-log.json"), JSON.stringify(report, null, 2));
    writeFileSync(path.join(REPORTS, "capture-run.json"), JSON.stringify({ runId: RUN_ID, finishedAt: new Date().toISOString(), status: failures.length ? "completed-with-console-noise" : "ok", count: log.length }, null, 2));
    process.stdout.write(`done ${log.length} records run ${RUN_ID}\n`);
    if (failures.some((item) => item.type === "pageerror")) process.exitCode = 1;
  } catch (error) {
    writeFileSync(path.join(REPORTS, "capture-run.json"), JSON.stringify({
      runId: RUN_ID, status: "failed", error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
