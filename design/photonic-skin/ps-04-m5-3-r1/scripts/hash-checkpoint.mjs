import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STAGE = "design/photonic-skin/ps-04-m5-3-r1";
const OWNER = "4f7d67fb8ee37a0fb1fb024a8e68b6bf39486db414b6016edbc7fbcb41ba018e";

function posix(value) {
  return value.replaceAll("\\", "/");
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "_player.html" || name.startsWith("page@") || name === "__pycache__" || name.endsWith(".pyc")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(posix(path.relative(ROOT, full)));
  }
  return out.sort((left, right) => left.localeCompare(right));
}

function shaFile(file) {
  return createHash("sha256").update(readFileSync(path.join(ROOT, file))).digest("hex");
}

function aggregate(files) {
  const records = files
    .slice()
    .sort((left, right) => left.localeCompare(right))
    .map((file) => `${file}\t${shaFile(file)}\n`)
    .join("");
  return createHash("sha256").update(records).digest("hex");
}

const m53 = JSON.parse(readFileSync("design/photonic-skin/ps-04-m5-3/reports/checkpoint-hashes.json", "utf8"));
const authoring = walk(`${STAGE}/authoring`);
const variants = walk(`${STAGE}/variants`);
const scripts = walk(`${STAGE}/scripts`);
const reports = walk(`${STAGE}/reports`).filter((file) => !file.endsWith("checkpoint-hashes.json"));
const renders = walk(`${STAGE}/renders`);
const sandbox = walk("app/visual-lab/photonic-skin-ps04-m5/video-sandbox");
const sourceFiles = [
  ...sandbox,
  "tests/photonic-ps04-m5-3-r1.test.ts",
  ...scripts,
  ...authoring,
].filter((file) => existsSync(file));

const payload = {
  method: "SHA-256 over sorted relative-path + TAB + file-SHA256 + LF records",
  stage: "PS-04.M5.3.R1",
  ownerSpecRead: true,
  ownerSpecHash: OWNER,
  ownerSpecIsSourceOfTruth: true,
  excludedFromHash: [`${STAGE}/manifest.json`, `${STAGE}/reports/checkpoint-hashes.json`],
  branch: "ps04-m5-sandbox",
  m53Checkpoint: "72eb53b1a2a76a6851a23b45560ad55ba149cc65",
  frozenVideo: shaFile("public/photonic-skin/ps-03-m3-1r/states/single-video.state.bin"),
  eventAR2: shaFile("design/photonic-skin/ps-04-m5-2-r2/variants/a-r2/single-event.state.bin"),
  combo20: m53.combo20,
  combo30: m53.combo30,
  combo40: m53.combo40,
  camera20: m53.camera20,
  camera30: m53.camera30,
  camera40: m53.camera40,
  baseline: m53.baseline,
  combo20r1: shaFile(`${STAGE}/variants/combo-20-r1/single-video.state.bin`),
  combo30r1: shaFile(`${STAGE}/variants/combo-30-r1/single-video.state.bin`),
  combo40r1: shaFile(`${STAGE}/variants/combo-40-r1/single-video.state.bin`),
  publicCombo30r1: shaFile("public/photonic-skin/ps-04-m5-3-r1/variants/combo-30-r1/single-video.state.bin"),
  source: aggregate(sourceFiles),
  sourceFiles,
  authoring: aggregate(authoring),
  variants: aggregate(variants),
  renders: aggregate(renders),
  reports: aggregate(reports),
  r1Committed: false,
  push: false,
  deploy: false,
};

mkdirSync(`${STAGE}/reports`, { recursive: true });
writeFileSync(`${STAGE}/reports/checkpoint-hashes.json`, `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  ownerSpecHash: payload.ownerSpecHash,
  combo30r1: payload.combo30r1,
  combo30unchanged: payload.combo30 === m53.combo30,
  frozenVideo: payload.frozenVideo,
}, null, 2)}\n`);
