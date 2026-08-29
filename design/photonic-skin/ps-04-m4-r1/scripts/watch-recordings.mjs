import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const VIDEO = path.join(ROOT, "design/photonic-skin/ps-04-m4-r1/renders/browser/video");
const STILLS = path.join(ROOT, "design/photonic-skin/ps-04-m4-r1/renders/browser/video-probes");
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m4-r1/reports/video-playback.json");
mkdirSync(STILLS, { recursive: true });

function probe(file) {
  try {
    const json = execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { encoding: "utf8" });
    return JSON.parse(json);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function playAtOneX(browser, file) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const player = path.join(VIDEO, "_player.html");
  writeFileSync(player, `<!doctype html><html><body style="margin:0;background:#090B0D">
<video id="player" src="./${path.basename(file)}" style="width:100vw;height:100vh;object-fit:contain" playsinline></video>
</body></html>`);
  await page.goto(pathToFileURL(player).href, { waitUntil: "load" });
  const result = await page.evaluate(async () => {
    const video = document.getElementById("player");
    if (!(video instanceof HTMLVideoElement)) return { error: "no video" };
    video.muted = true;
    video.playbackRate = 1;
    await new Promise((resolve, reject) => {
      if (video.readyState >= 1) resolve();
      video.addEventListener("loadedmetadata", resolve, { once: true });
      video.addEventListener("error", () => reject(new Error("video error")), { once: true });
      window.setTimeout(() => resolve(), 4000);
    });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return { error: "no duration", duration };
    const marks = [0.2, 0.5, 0.8].map((t) => t * duration);
    const started = performance.now();
    await video.play();
    await new Promise((resolve) => {
      const done = () => resolve();
      video.addEventListener("ended", done, { once: true });
      window.setTimeout(done, Math.ceil(duration * 1000) + 1200);
    });
    return {
      duration,
      playbackRate: video.playbackRate,
      wallClockMs: performance.now() - started,
      marks,
      ended: video.ended || video.currentTime >= duration - 0.15,
    };
  });
  const stills = [];
  if (result.marks) {
    for (const [index, time] of result.marks.entries()) {
      await page.evaluate((seek) => {
        const video = document.getElementById("player");
        if (video instanceof HTMLVideoElement) video.currentTime = seek;
      }, time);
      await page.waitForTimeout(180);
      const dest = path.join(STILLS, `${path.basename(file, ".webm")}-t${index + 1}.png`);
      await page.screenshot({ path: dest, fullPage: false });
      stills.push(dest.replaceAll("\\", "/"));
    }
  }
  await context.close();
  return { ...result, stills, playedAtOneX: result.playbackRate === 1 };
}

async function main() {
  const files = readdirSync(VIDEO)
    .filter((name) => name.endsWith(".webm") && !name.startsWith("recording"))
    .map((name) => path.join(VIDEO, name));
  const named = files.filter((file) => /full-down-up|rapid-task-mask-retarget|footer-exit/.test(path.basename(file)));
  const targets = named.length ? named : files;
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const watched = [];
  try {
    for (const file of targets) {
      const info = probe(file);
      const duration = Number(info.format?.duration ?? 0);
      const playback = await playAtOneX(browser, file);
      watched.push({
        file: file.replaceAll("\\", "/"),
        ffprobeSeconds: duration,
        videoCodec: info.streams?.find((stream) => stream.codec_type === "video")?.codec_name ?? null,
        playback,
        review: playback.playedAtOneX && playback.ended
          ? "played at 1x until end in this session; not ffprobe-only"
          : "playback incomplete or failed",
      });
    }
  } finally {
    await browser.close();
  }
  const report = {
    capturedAt: new Date().toISOString(),
    method: "Chromium HTMLVideoElement playbackRate=1 from a local player page, wall-clock wait for ended, plus ffprobe container metadata",
    watched,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify({ count: watched.length, ok: watched.every((item) => item.playback?.playedAtOneX) }, null, 2)}\n`);
}

main();
