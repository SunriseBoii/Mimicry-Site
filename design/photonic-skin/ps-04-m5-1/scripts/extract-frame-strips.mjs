import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const VIDEO = path.join(ROOT, "design/photonic-skin/ps-04-m5-1/renders/browser/video");
const STRIPS = path.join(ROOT, "design/photonic-skin/ps-04-m5-1/renders/browser/frame-probes");
const KEY = ["cases-to-content", "content-to-cases", "content-to-design", "merch-to-team", "team-to-merch"];

function extract(name) {
  const src = path.join(VIDEO, `${name}.webm`);
  if (!existsSync(src)) return { name, ok: false, reason: "missing video" };
  const dest = path.join(STRIPS, `${name}-strip`);
  mkdirSync(dest, { recursive: true });
  try {
    execFileSync("ffmpeg", ["-y", "-i", src, "-vf", "fps=10", path.join(dest, "f%03d.png")], { stdio: "pipe" });
    return { name, ok: true, frames: readdirSync(dest).filter((file) => file.endsWith(".png")).length };
  } catch (error) {
    return { name, ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

const results = KEY.map(extract);
mkdirSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-1/reports"), { recursive: true });
writeFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-1/reports/frame-strips.json"), JSON.stringify({ capturedAt: new Date().toISOString(), results }, null, 2));
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
