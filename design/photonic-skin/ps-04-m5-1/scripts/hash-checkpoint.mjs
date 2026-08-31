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
  ...walk("app/visual-lab/photonic-skin-ps04-m5"),
  "tests/photonic-ps04-m5-1.test.ts",
  ...walk("design/photonic-skin/ps-04-m5-1/scripts"),
].filter((file) => file !== "design/photonic-skin/ps-04-m5-1/scripts/rename-m5-lab.mjs");

const m1Manifest = JSON.parse(readFileSync("design/photonic-skin/ps-04-m1/manifest.json", "utf8"));
const m2Manifest = JSON.parse(readFileSync("design/photonic-skin/ps-04-m2/manifest.json", "utf8"));
const m3Manifest = JSON.parse(readFileSync("design/photonic-skin/ps-04-m3/manifest.json", "utf8"));
const m3SourceFiles = [
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
const r6r1 = JSON.parse(readFileSync("design/photonic-skin/ps-04-m4-r6-r1/reports/checkpoint-hashes.json", "utf8"));
const rejectedR6 = JSON.parse(readFileSync("design/photonic-skin/ps-04-m4-r6/reports/checkpoint-hashes.json", "utf8"));
const existing = [...new Set(sourceFiles)].filter((file) => statSync(file, { throwIfNoEntry: false }));
const browserFiles = walk("design/photonic-skin/ps-04-m5-1/renders/browser").filter((file) => !file.includes("/page@"));
const boardFiles = walk("design/photonic-skin/ps-04-m5-1/renders/boards").filter((file) => file.endsWith(".png"));
const reportFiles = walk("design/photonic-skin/ps-04-m5-1/reports").filter((file) => !file.endsWith("checkpoint-hashes.json"));

const payload = {
  method: "SHA-256 over sorted relative-path + TAB + file-SHA256 + LF records",
  stage: "PS-04.M5.1",
  excludedFromHash: ["design/photonic-skin/ps-04-m5-1/manifest.json"],
  rejectedR6Source: rejectedR6.source,
  rejectedR6SourceExpected: "4a24385bcdda85496155e699edfbeab9bc1818488c1c246884ab3088d3acdb4f",
  m1Source: aggregate(m1Manifest.sourceFiles),
  m1SourceExpected: "4cb80b507605bf439e9de5210e5f022159c716ee286fa81b98f0e943cf5b75eb",
  m2Source: aggregate(m2Manifest.sourceFiles),
  m2SourceExpected: "f04bc262cdc80e6061d2ad7fdb6501f60aa0a31105a55f876a8eaa26f0266c0d",
  m3Source: aggregate(m3SourceFiles),
  m3SourceExpected: m3Manifest.checkpointAggregates.source,
  previousM4R1Source: r6r1.previousM4R1Source ?? "f86d717b652d66ae30d72fd480a386e9fbf5d8b9efa297325ae8c6f9b10b5d12",
  previousM4R2Source: r6r1.previousM4R2Source ?? "726bc3bbf3f6c8d754b82204d4d02a20cd519fb836e1c5521c0ccb5d224e4333",
  previousM4R3Source: r6r1.previousM4R3Source ?? "9c8f6a4b65c99bee6bfc711af01f6b57d0486e9bd742e708bd7f50580f156284",
  previousM4R4Source: r6r1.previousM4R4Source ?? "37e99fe9e6b9a10a6bc735351948fd678facdb50bee6c0ae980dd65bee752069",
  previousM4R5Source: "853cd3b8373b3116330acf2643fefdc9d7b84424c3bf1515d9df5c52c15421ef",
  previousM4R6R1Source: r6r1.source,
  previousM4R6R1SourceExpected: "60546b434ed857a9c967a28dca9ee7d1f0fdb705ca8bbaed654384e677f13116",
  source: aggregate(existing),
  sourceFiles: existing,
  browserFrames: browserFiles.length ? aggregate(browserFiles) : null,
  browserFileCount: browserFiles.length,
  approvalBoards: boardFiles.length ? aggregate(boardFiles) : null,
  boardFiles: boardFiles.map((file) => path.posix.basename(file)),
  reports: reportFiles.length ? aggregate(reportFiles) : null,
  reportFiles,
};

mkdirSync("design/photonic-skin/ps-04-m5-1/reports", { recursive: true });
writeFileSync("design/photonic-skin/ps-04-m5-1/reports/checkpoint-hashes.json", JSON.stringify(payload, null, 2));
process.stdout.write(`${JSON.stringify({
  m1: payload.m1Source === payload.m1SourceExpected,
  m2: payload.m2Source === payload.m2SourceExpected,
  m3: payload.m3Source === payload.m3SourceExpected,
  r6r1: payload.previousM4R6R1Source === payload.previousM4R6R1SourceExpected,
  rejectedR6: payload.rejectedR6Source === payload.rejectedR6SourceExpected,
  source: payload.source,
}, null, 2)}\n`);
