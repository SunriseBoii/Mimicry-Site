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
  "app/visual-lab/photonic-skin-ps04-m4/continuity-overlay.ts",
  "app/visual-lab/photonic-skin-ps04-m4/geometry-id-trace.ts",
  "app/visual-lab/photonic-skin-ps04-m4/graph-model.ts",
  "app/visual-lab/photonic-skin-ps04-m4/natural-raf-recorder.ts",
  "app/visual-lab/photonic-skin-ps04-m4/page.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/palette-authority.ts",
  "app/visual-lab/photonic-skin-ps04-m4/master-similarity.ts",
  "app/visual-lab/photonic-skin-ps04-m4/PS04M4Lab.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/PS04M4LabClient.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/PS04M4Scene.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/ps04m4.module.css",
  "app/visual-lab/photonic-skin-ps04-m4/scroll-controller.ts",
  "app/visual-lab/photonic-skin-ps04-m4/screen-actor-contract.ts",
  "app/visual-lab/photonic-skin-ps04-m4/site-fit.ts",
  "app/visual-lab/photonic-skin-ps04-m4/topology.ts",
  "app/visual-lab/photonic-skin-ps04-m4/transition-coordinator.ts",
  "app/visual-lab/photonic-skin-ps04-m4/transition-prewarm.ts",
  "app/visual-lab/photonic-skin-ps04-m4/components/ContactDialog.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/components/PersistentHeader.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/components/ProgressGraph.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/components/ScreenFixtures.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/preview/page.tsx",
  "app/visual-lab/photonic-skin-ps04-m4/preview/PS04M4PreviewClient.tsx",
  "tests/photonic-ps04-m4.test.ts",
  "tests/photonic-ps04-m4-r3.test.ts",
  "tests/photonic-ps04-m4-r4.test.ts",
  "design/photonic-skin/ps-04-m4-r4/scripts/capture-browser-evidence.mjs",
  "design/photonic-skin/ps-04-m4-r4/scripts/hash-checkpoint.mjs",
  "design/photonic-skin/ps-04-m4-r4/scripts/lab-smoke.mjs",
  "design/photonic-skin/ps-04-m4-r4/scripts/measure-natural-raf.mjs",
  "design/photonic-skin/ps-04-m4-r4/scripts/run-gpu-parity-probes.mjs",
  "design/photonic-skin/ps-04-m4-r4/scripts/watch-recordings.mjs",
  "design/photonic-skin/ps-04-m4-r4/scripts/build-visual-boards.py",
  "design/photonic-skin/ps-04-m4-r4/scripts/visibility-gate.mjs",
  "design/photonic-skin/ps-04-m4-r4/scripts/live-palette-verify.mjs",
  "design/photonic-skin/ps-04-m4-r4/scripts/ab-continuity-lift.mjs",
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

const existing = [...new Set(sourceFiles)].filter((file) => statSync(file, { throwIfNoEntry: false }));
const browserFiles = walk("design/photonic-skin/ps-04-m4-r4/renders/browser");
const boardFiles = walk("design/photonic-skin/ps-04-m4-r4/renders/boards").filter((file) => file.endsWith(".png"));
const reportFiles = walk("design/photonic-skin/ps-04-m4-r4/reports").filter((file) => !file.endsWith("checkpoint-hashes.json"));
const previousM4R2Source = "726bc3bbf3f6c8d754b82204d4d02a20cd519fb836e1c5521c0ccb5d224e4333";
const previousM4R3Source = "9c8f6a4b65c99bee6bfc711af01f6b57d0486e9bd742e708bd7f50580f156284";

const payload = {
  method: "SHA-256 over sorted relative-path + TAB + file-SHA256 + LF records",
  stage: "PS-04.M4.R4",
  excludedFromHash: ["design/photonic-skin/ps-04-m4-r4/manifest.json"],
  previousM4R2SourceExpected: previousM4R2Source,
  m1Source: aggregate(m1Manifest.sourceFiles),
  m1SourceExpected: "4cb80b507605bf439e9de5210e5f022159c716ee286fa81b98f0e943cf5b75eb",
  m2Source: aggregate(m2Manifest.sourceFiles),
  m2SourceExpected: m2Manifest.checkpointAggregates.source,
  m3Source: aggregate(m3SourceFiles),
  m3SourceExpected: m3Manifest.checkpointAggregates.source,
  m41Aggregate: JSON.parse(readFileSync("design/photonic-skin/ps-03-m4-1/exports/ps03m41-manifest.json", "utf8")).aggregateContentHash,
  m41AggregateExpected: "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361",
  m41ManifestSha256: createHash("sha256").update(readFileSync("design/photonic-skin/ps-03-m4-1/exports/ps03m41-manifest.json")).digest("hex"),
  m41ManifestExpected: "d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441",
  m41rPatch: JSON.parse(readFileSync("design/photonic-skin/ps-03-m4-1r/reports/presentation-patch-inventory.json", "utf8")).hash,
  m41rPatchExpected: "228ddce450536d94d625d73f99ceff133371ccfe515a6f21cc3377fa3fda3ca0",
  m31rFingerprint: JSON.parse(readFileSync("design/photonic-skin/ps-03-m3-1r/exports/ps03m31r-manifest.json", "utf8")).deterministicFingerprint,
  m31rFingerprintExpected: "0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2",
  previousM4R1Source: "f86d717b652d66ae30d72fd480a386e9fbf5d8b9efa297325ae8c6f9b10b5d12",
  previousM4R2Source,
  previousM4R3Source,
  source: aggregate(existing),
  sourceFiles: existing,
  browserFrames: browserFiles.length ? aggregate(browserFiles) : null,
  browserFileCount: browserFiles.length,
  approvalBoards: boardFiles.length ? aggregate(boardFiles) : null,
  boardFiles: boardFiles.map((file) => path.posix.basename(file)),
  reports: reportFiles.length ? aggregate(reportFiles) : null,
  reportFiles,
};

mkdirSync("design/photonic-skin/ps-04-m4-r4/reports", { recursive: true });
writeFileSync("design/photonic-skin/ps-04-m4-r4/reports/checkpoint-hashes.json", JSON.stringify(payload, null, 2));
process.stdout.write(`${JSON.stringify({
  m1: payload.m1Source === payload.m1SourceExpected,
  m2: payload.m2Source === payload.m2SourceExpected,
  m3: payload.m3Source === payload.m3SourceExpected,
  m41Aggregate: payload.m41Aggregate === payload.m41AggregateExpected,
  m41Manifest: payload.m41ManifestSha256 === payload.m41ManifestExpected,
  source: payload.source,
  sourceChangedFromR3: payload.source !== previousM4R3Source,
}, null, 2)}\n`);
