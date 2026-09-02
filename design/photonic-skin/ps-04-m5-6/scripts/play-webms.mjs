import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const VIDEO = path.join(ROOT, "design/photonic-skin/ps-04-m5-6/renders/video");
const REPORT = path.join(ROOT, "design/photonic-skin/ps-04-m5-6/reports/video-playback.json");
const files = readdirSync(VIDEO).filter((name) => name.endsWith(".webm")).sort();

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
});
const results = [];
try {
  for (const name of files) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const player = path.join(VIDEO, "_player.html");
    writeFileSync(player, `<!doctype html><html><body style="margin:0;background:#090B0D">
<video id="player" src="./${name}" style="width:100vw;height:100vh;object-fit:contain" playsinline></video>
</body></html>`);
    await page.goto(pathToFileURL(player).href, { waitUntil: "load" });
    const ended = await page.evaluate(async () => {
      const video = document.getElementById("player");
      if (!(video instanceof HTMLVideoElement)) return { ended: false, error: "no video" };
      video.muted = true;
      video.playbackRate = 1;
      await new Promise((resolve) => {
        if (video.readyState >= 1) resolve();
        video.addEventListener("loadedmetadata", resolve, { once: true });
        window.setTimeout(resolve, 4000);
      });
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        return { ended: false, error: "no duration", duration: video.duration };
      }
      const started = performance.now();
      await video.play();
      await new Promise((resolve) => {
        video.addEventListener("ended", resolve, { once: true });
        window.setTimeout(resolve, Math.ceil(video.duration * 1000) + 1500);
      });
      return {
        ended: video.ended || video.currentTime >= video.duration - 0.05,
        duration: video.duration,
        currentTime: video.currentTime,
        playbackRate: video.playbackRate,
        wallClockMs: performance.now() - started,
      };
    });
    results.push({ name, ...ended });
    await context.close();
  }
} finally {
  await browser.close();
}

writeFileSync(REPORT, JSON.stringify({
  playbackRate: 1,
  requiredEnded: true,
  files: results,
  allEnded: results.length > 0 && results.every((row) => row.ended === true),
}, null, 2) + "\n");
console.log(JSON.stringify({ count: results.length, allEnded: results.every((row) => row.ended === true) }, null, 2));
