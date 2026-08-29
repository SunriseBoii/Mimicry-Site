import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function posix(value) {
  return value.replaceAll("\\", "/");
}

function walk(dir) {
  if (!statSync(dir, { throwIfNoEntry: false })) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(posix(path.relative(ROOT, full)));
  }
  return out.sort((left, right) => left.localeCompare(right));
}

function aggregate(files) {
  const records = files
    .slice()
    .sort((left, right) => left.localeCompare(right))
    .map((file) => `${file}\t${createHash("sha256").update(readFileSync(path.join(ROOT, file))).digest("hex")}\n`)
    .join("");
  return createHash("sha256").update(records).digest("hex");
}

const sourceFiles = [
  "app/visual-lab/photonic-skin-ps04-m3/idle-motion.ts",
  "app/visual-lab/photonic-skin-ps04-m3/material-foundation.ts",
  "app/visual-lab/photonic-skin-ps04-m3/page.tsx",
  "app/visual-lab/photonic-skin-ps04-m3/palette-driver.ts",
  "app/visual-lab/photonic-skin-ps04-m3/phase-adapter.ts",
  "app/visual-lab/photonic-skin-ps04-m3/PS04M3Lab.tsx",
  "app/visual-lab/photonic-skin-ps04-m3/PS04M3LabClient.tsx",
  "app/visual-lab/photonic-skin-ps04-m3/PS04M3Scene.tsx",
  "app/visual-lab/photonic-skin-ps04-m3/ps04m3.module.css",
  "app/visual-lab/photonic-skin-ps04-m3/runtime.ts",
  "app/visual-lab/photonic-skin-ps04-m3/session.ts",
  "app/visual-lab/photonic-skin-ps04-m3/preview/page.tsx",
  "app/visual-lab/photonic-skin-ps04-m3/preview/PS04M3Preview.tsx",
  "app/visual-lab/photonic-skin-ps04-m3/preview/PS04M3PreviewClient.tsx",
  "app/visual-lab/photonic-skin-ps04-m3/preview/preview.module.css",
  "tests/photonic-ps04-m3.test.ts",
  "design/photonic-skin/ps-04-m3/scripts/build-visual-boards.py",
  "design/photonic-skin/ps-04-m3/scripts/capture-browser-evidence.mjs",
  "design/photonic-skin/ps-04-m3/scripts/hash-checkpoint.mjs",
  "design/photonic-skin/ps-04-m3/scripts/lab-smoke.mjs",
  "design/photonic-skin/ps-04-m3/scripts/measure-performance.mjs",
  "design/photonic-skin/ps-04-m3/scripts/run-gpu-parity-probes.mjs",
];

const m1Manifest = JSON.parse(readFileSync("design/photonic-skin/ps-04-m1/manifest.json", "utf8"));
const m2Manifest = JSON.parse(readFileSync("design/photonic-skin/ps-04-m2/manifest.json", "utf8"));
const m1Source = aggregate(m1Manifest.sourceFiles);
const m2Source = aggregate(m2Manifest.sourceFiles);
const browserFiles = walk("design/photonic-skin/ps-04-m3/renders/browser");
const boardFiles = walk("design/photonic-skin/ps-04-m3/renders/boards").filter((file) => file.endsWith(".png"));
const reportFiles = walk("design/photonic-skin/ps-04-m3/reports").filter((file) => !file.endsWith("checkpoint-hashes.json"));

const payload = {
  method: "SHA-256 over sorted relative-path + TAB + file-SHA256 + LF records",
  excludedFromHash: ["design/photonic-skin/ps-04-m3/manifest.json"],
  m1Source,
  m1SourceExpected: m1Manifest.checkpointAggregates.source,
  m1SourceMatch: m1Source === m1Manifest.checkpointAggregates.source,
  m2Source,
  m2SourceExpected: m2Manifest.checkpointAggregates.source,
  m2SourceMatch: m2Source === m2Manifest.checkpointAggregates.source,
  source: aggregate(sourceFiles),
  sourceFiles,
  browserFrames: browserFiles.length ? aggregate(browserFiles) : null,
  browserFileCount: browserFiles.length,
  browserFiles: browserFiles.map((file) => file.replace("design/photonic-skin/ps-04-m3/renders/browser/", "")),
  approvalBoards: boardFiles.length ? aggregate(boardFiles) : null,
  boardFiles: boardFiles.map((file) => path.posix.basename(file)),
  reports: reportFiles.length ? aggregate(reportFiles) : null,
  reportFiles,
};

mkdirSync("design/photonic-skin/ps-04-m3/reports", { recursive: true });
writeFileSync("design/photonic-skin/ps-04-m3/reports/checkpoint-hashes.json", JSON.stringify(payload, null, 2));
process.stdout.write(`${JSON.stringify({
  m1SourceMatch: payload.m1SourceMatch,
  m2SourceMatch: payload.m2SourceMatch,
  source: payload.source,
  browserFrames: payload.browserFrames,
  approvalBoards: payload.approvalBoards,
  browserCount: payload.browserFileCount,
  boardCount: payload.boardFiles.length,
}, null, 2)}\n`);
