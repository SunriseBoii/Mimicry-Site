import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function posix(value) {
  return value.replaceAll("\\", "/");
}

function walk(dir) {
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
  "app/visual-lab/photonic-skin-ps04-m2/material-foundation.ts",
  "app/visual-lab/photonic-skin-ps04-m2/page.tsx",
  "app/visual-lab/photonic-skin-ps04-m2/PS04M2Lab.tsx",
  "app/visual-lab/photonic-skin-ps04-m2/PS04M2LabClient.tsx",
  "app/visual-lab/photonic-skin-ps04-m2/PS04M2Scene.tsx",
  "app/visual-lab/photonic-skin-ps04-m2/palette-controller.ts",
  "app/visual-lab/photonic-skin-ps04-m2/photonic-field.ts",
  "app/visual-lab/photonic-skin-ps04-m2/photonic-palette.ts",
  "app/visual-lab/photonic-skin-ps04-m2/ps04m2.module.css",
  "app/visual-lab/photonic-skin-ps04-m2/preview/page.tsx",
  "app/visual-lab/photonic-skin-ps04-m2/preview/PS04M2Preview.tsx",
  "app/visual-lab/photonic-skin-ps04-m2/preview/PS04M2PreviewClient.tsx",
  "app/visual-lab/photonic-skin-ps04-m2/preview/preview.module.css",
  "tests/photonic-ps04-m2.test.ts",
  "design/photonic-skin/ps-04-m2/scripts/build-visual-boards.py",
  "design/photonic-skin/ps-04-m2/scripts/capture-browser-evidence.mjs",
  "design/photonic-skin/ps-04-m2/scripts/measure-field-spans.ts",
  "design/photonic-skin/ps-04-m2/scripts/recapture-hero.mjs",
  "design/photonic-skin/ps-04-m2/scripts/recapture-hero-mobile-and-m1.mjs",
  "design/photonic-skin/ps-04-m2/scripts/run-gpu-parity-probes.mjs",
  "design/photonic-skin/ps-04-m2/scripts/hash-checkpoint.mjs",
];

const m1Manifest = JSON.parse(readFileSync("design/photonic-skin/ps-04-m1/manifest.json", "utf8"));
const m1Source = aggregate(m1Manifest.sourceFiles);
const browserFiles = walk("design/photonic-skin/ps-04-m2/renders/browser");
const boardFiles = walk("design/photonic-skin/ps-04-m2/renders/boards").filter((file) => file.endsWith(".png"));

const payload = {
  m1Source,
  m1SourceExpected: m1Manifest.checkpointAggregates.source,
  m1SourceMatch: m1Source === m1Manifest.checkpointAggregates.source,
  source: aggregate(sourceFiles),
  sourceFiles,
  browserFrames: aggregate(browserFiles),
  browserFiles: browserFiles.map((file) => file.replace("design/photonic-skin/ps-04-m2/renders/browser/", "")),
  approvalBoards: aggregate(boardFiles),
  boardFiles: boardFiles.map((file) => path.posix.basename(file)),
};

writeFileSync("design/photonic-skin/ps-04-m2/reports/checkpoint-hashes.json", JSON.stringify(payload, null, 2));
process.stdout.write(`${JSON.stringify({
  m1SourceMatch: payload.m1SourceMatch,
  source: payload.source,
  browserFrames: payload.browserFrames,
  approvalBoards: payload.approvalBoards,
  browserCount: payload.browserFiles.length,
}, null, 2)}\n`);
