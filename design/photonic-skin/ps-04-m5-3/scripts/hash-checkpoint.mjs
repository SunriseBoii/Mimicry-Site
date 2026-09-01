import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STAGE = "design/photonic-skin/ps-04-m5-3";

function posix(value) {
  return value.replaceAll("\\", "/");
}

function walk(dir) {
  if (!statSync(dir, { throwIfNoEntry: false })) return [];
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

const m52 = JSON.parse(readFileSync("design/photonic-skin/ps-04-m5-2/reports/checkpoint-hashes.json", "utf8"));
const m51 = JSON.parse(readFileSync("design/photonic-skin/ps-04-m5-1/reports/checkpoint-hashes.json", "utf8"));
const authoring = walk(`${STAGE}/authoring`);
const variants = walk(`${STAGE}/variants`);
const scripts = walk(`${STAGE}/scripts`);
const reports = walk(`${STAGE}/reports`).filter((file) => !file.endsWith("checkpoint-hashes.json"));
const renders = walk(`${STAGE}/renders`);
const sandbox = walk("app/visual-lab/photonic-skin-ps04-m5/video-sandbox");
const sourceFiles = [
  ...sandbox,
  "tests/photonic-ps04-m5-3.test.ts",
  ...scripts,
  ...authoring,
].filter((file) => statSync(file, { throwIfNoEntry: false }));

const payload = {
  method: "SHA-256 over sorted relative-path + TAB + file-SHA256 + LF records",
  stage: "PS-04.M5.3",
  excludedFromHash: [`${STAGE}/manifest.json`, `${STAGE}/reports/checkpoint-hashes.json`],
  branch: "ps04-m5-sandbox",
  m52SourceExpected: "34e19852c76aec43e6a07c005ede69573481b7957c8c6b087111054591c7c87e",
  m52SourceRecorded: m52.source,
  m51Source: aggregate(m51.sourceFiles),
  frozenVideo: shaFile("public/photonic-skin/ps-03-m3-1r/states/single-video.state.bin"),
  eventAR2: shaFile("design/photonic-skin/ps-04-m5-2-r2/variants/a-r2/single-event.state.bin"),
  baseline: shaFile(`${STAGE}/variants/baseline/single-video.state.bin`),
  combo20: shaFile(`${STAGE}/variants/combo-20/single-video.state.bin`),
  combo30: shaFile(`${STAGE}/variants/combo-30/single-video.state.bin`),
  combo40: shaFile(`${STAGE}/variants/combo-40/single-video.state.bin`),
  camera20: shaFile(`${STAGE}/variants/camera-20/single-video.state.bin`),
  camera30: shaFile(`${STAGE}/variants/camera-30/single-video.state.bin`),
  camera40: shaFile(`${STAGE}/variants/camera-40/single-video.state.bin`),
  publicCombo30: shaFile("public/photonic-skin/ps-04-m5-3/variants/combo-30/single-video.state.bin"),
  source: aggregate(sourceFiles),
  sourceFiles,
  authoring: aggregate(authoring),
  variants: aggregate(variants),
  renders: aggregate(renders),
  reports: aggregate(reports),
  m53Committed: false,
  push: false,
  deploy: false,
};

mkdirSync(`${STAGE}/reports`, { recursive: true });
writeFileSync(`${STAGE}/reports/checkpoint-hashes.json`, `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  source: payload.source,
  frozenVideo: payload.frozenVideo,
  combo30: payload.combo30,
  eventAR2: payload.eventAR2,
  m52ok: payload.m52SourceRecorded === payload.m52SourceExpected,
}, null, 2)}\n`);
