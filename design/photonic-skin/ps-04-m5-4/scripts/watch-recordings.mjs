import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const VIDEO = path.join(ROOT, "design/photonic-skin/ps-04-m5-4/renders/video");
const STILLS = path.join(ROOT, "design/photonic-skin/ps-04-m5-4/renders/video-probes");
const OUT = path.join(ROOT, "design/photonic-skin/ps-04-m5-4/reports/video-playback.json");
const REQUIRED = [
  "digital-video-digital.webm",
  "merch-team.webm",
  "about-entry-exit.webm",
  "rapid-residual.webm",
];
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
  await context.close();
  return result;
}

const files = REQUIRED.map((name) => path.join(VIDEO, name)).filter((file) => readdirSync(VIDEO).includes(path.basename(file)));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const playback = [];
try {
  for (const file of files) {
    const probed = probe(file);
    const played = await playAtOneX(browser, file);
    playback.push({ file: file.replaceAll("\\", "/"), probed, played });
  }
} finally {
  await browser.close();
}
const report = {
  count: playback.length,
  requiredPresent: REQUIRED.every((name) => readdirSync(VIDEO).includes(name)),
  requiredPlayed: playback.every((row) => row.played?.ended === true && row.played?.playbackRate === 1),
  playback,
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ count: report.count, requiredPresent: report.requiredPresent, requiredPlayed: report.requiredPlayed }, null, 2));
