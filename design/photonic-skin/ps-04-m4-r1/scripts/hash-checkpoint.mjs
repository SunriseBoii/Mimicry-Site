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
  "app/visual-lab/photonic-skin-ps04-m4/actor-resolver.ts",
  "app/visual-lab/photonic-skin-ps04-m4/build-flow.ts",
  "app/visual-lab/photonic-skin-ps04-m4/composition.ts",
  "app/visual-lab/photonic-skin-ps04-m4/graph-model.ts",
  "app/visual-lab/photonic-skin-ps04-m4/page.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/PS04M4Lab.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/PS04M4LabClient.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/PS04M4Scene.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/ps04m4.module.css",
  "app/visual-lab/photonic-skin-ps04-m4/scroll-controller.ts",
  "app/visual-lab/photonic-skin-ps04-m4/screen-actor-contract.ts",
  "app/visual-lab/photonic-skin-ps04-m4/site-fit.ts",
  "app/visual-lab/photonic-skin-ps04-m4/topology.ts",
  "app/visual-lab/photonic-skin-ps04-m4/components/ContactDialog.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/components/PersistentHeader.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/components/ProgressGraph.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/components/ScreenFixtures.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/preview/page.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/preview/PS04M4PreviewClient.tsx",
  "tests/photonic-ps04-m4.test.ts",
  "design/photonic-skin/ps-04-m4-r1/scripts/capture-browser-evidence.mjs",
  "design/photonic-skin/ps-04-m4-r1/scripts/hash-checkpoint.mjs",
  "design/photonic-skin/ps-04-m4-r1/scripts/lab-smoke.mjs",
  "design/photonic-skin/ps-04-m4-r1/scripts/measure-performance.mjs",
  "design/photonic-skin/ps-04-m4-r1/scripts/run-gpu-parity-probes.mjs",
  "design/photonic-skin/ps-04-m4-r1/scripts/watch-recordings.mjs",
  "design/photonic-skin/ps-04-m4-r1/scripts/build-visual-boards.py",
  "design/photonic-skin/ps-04-m4-r1/scripts/visibility-gate.mjs",
];

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

const existing = sourceFiles.filter((file) => statSync(file, { throwIfNoEntry: false }));
const browserFiles = walk("design/photonic-skin/ps-04-m4-r1/renders/browser");
const boardFiles = walk("design/photonic-skin/ps-04-m4-r1/renders/boards").filter((file) => file.endsWith(".png"));
const reportFiles = walk("design/photonic-skin/ps-04-m4-r1/reports").filter((file) => !file.endsWith("checkpoint-hashes.json"));
const oldM4Source = "e45efd4b2c4ad38cf55d18c861e43bee342b22d118ec8ec79cfd3cfba6274ec5";

const payload = {
  method: "SHA-256 over sorted relative-path + TAB + file-SHA256 + LF records",
  stage: "PS-04.M4.R1",
  excludedFromHash: ["design/photonic-skin/ps-04-m4-r1/manifest.json"],
  previousM4SourceCheckpoint: oldM4Source,
  m1Source: aggregate(m1Manifest.sourceFiles),
  m1SourceExpected: "4cb80b507605bf439e9de5210e5f022159c716ee286fa81b98f0e943cf5b75eb",
  m2Source: aggregate(m2Manifest.sourceFiles),
  m2SourceExpected: m2Manifest.checkpointAggregates.source,
  m2ManifestSha256: createHash("sha256").update(readFileSync("design/photonic-skin/ps-04-m2/manifest.json")).digest("hex"),
  m3Source: aggregate(m3SourceFiles),
  m3SourceExpected: m3Manifest.checkpointAggregates.source,
  m3ManifestSha256: createHash("sha256").update(readFileSync("design/photonic-skin/ps-04-m3/manifest.json")).digest("hex"),
  m41AggregateExpected: "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361",
  m41ManifestExpected: "d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441",
  m41rPatchExpected: "228ddce450536d94d625d73f99ceff133371ccfe515a6f21cc3377fa3fda3ca0",
  m31rFingerprintExpected: "0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2",
  source: aggregate(existing),
  sourceFiles: existing,
  browserFrames: browserFiles.length ? aggregate(browserFiles) : null,
  browserFileCount: browserFiles.length,
  approvalBoards: boardFiles.length ? aggregate(boardFiles) : null,
  boardFiles: boardFiles.map((file) => path.posix.basename(file)),
  reports: reportFiles.length ? aggregate(reportFiles) : null,
  reportFiles,
};

mkdirSync("design/photonic-skin/ps-04-m4-r1/reports", { recursive: true });
writeFileSync("design/photonic-skin/ps-04-m4-r1/reports/checkpoint-hashes.json", JSON.stringify(payload, null, 2));
process.stdout.write(`${JSON.stringify({
  m1: payload.m1Source === payload.m1SourceExpected,
  m2: payload.m2Source === payload.m2SourceExpected,
  m3: payload.m3Source === payload.m3SourceExpected,
  sourceChangedFromM4: payload.source !== oldM4Source,
  source: payload.source,
  browserCount: payload.browserFileCount,
  boardCount: payload.boardFiles.length,
}, null, 2)}\n`);
