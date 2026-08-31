import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STAGE = "design/photonic-skin/ps-04-m5-2";

function posix(value) {
  return value.replaceAll("\\", "/");
}

function walk(dir) {
  if (!statSync(dir, { throwIfNoEntry: false })) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "_player.html") continue;
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

const m51 = JSON.parse(readFileSync("design/photonic-skin/ps-04-m5-1/reports/checkpoint-hashes.json", "utf8"));
const r6r1 = JSON.parse(readFileSync("design/photonic-skin/ps-04-m4-r6-r1/reports/checkpoint-hashes.json", "utf8"));
const authoring = walk(`${STAGE}/authoring`);
const variants = walk(`${STAGE}/variants`);
const scripts = walk(`${STAGE}/scripts`);
const reports = walk(`${STAGE}/reports`).filter((file) => !file.endsWith("checkpoint-hashes.json"));
const renders = walk(`${STAGE}/renders`);
const sandbox = walk("app/visual-lab/photonic-skin-ps04-m5/event-sandbox");
const sourceFiles = [
  ...sandbox,
  "tests/photonic-ps04-m5-2.test.ts",
  ...scripts,
  ...authoring,
].filter((file) => statSync(file, { throwIfNoEntry: false }));

const payload = {
  method: "SHA-256 over sorted relative-path + TAB + file-SHA256 + LF records",
  stage: "PS-04.M5.2",
  excludedFromHash: [`${STAGE}/manifest.json`, `${STAGE}/reports/checkpoint-hashes.json`],
  m51Source: aggregate(m51.sourceFiles),
  m51SourceExpected: "8ee1cc11289be4b277eccf5a9b578029cfb1625d34eb6dbd0bbc010a768cc556",
  previousM4R6R1Source: r6r1.source,
  frozenEvent: createHash("sha256").update(readFileSync("public/photonic-skin/ps-03-m3-1r/states/single-event.state.bin")).digest("hex"),
  frozenEventExpected: "b14a3b2f8571e3e7d39be074aecbdeb6dd4ca51097c6433db25b622c3394a933",
  m31rFingerprintExpected: "0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2",
  m41AggregateExpected: "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361",
  m41ManifestExpected: "d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441",
  m41rPatchExpected: "228ddce450536d94d625d73f99ceff133371ccfe515a6f21cc3377fa3fda3ca0",
  source: aggregate(sourceFiles),
  sourceFiles,
  authoring: aggregate(authoring),
  variants: aggregate(variants),
  baselineImported: createHash("sha256").update(readFileSync(`${STAGE}/variants/baseline/single-event.state.bin`)).digest("hex"),
  variantA: createHash("sha256").update(readFileSync(`${STAGE}/variants/a/single-event.state.bin`)).digest("hex"),
  variantB: createHash("sha256").update(readFileSync(`${STAGE}/variants/b/single-event.state.bin`)).digest("hex"),
  variantC: createHash("sha256").update(readFileSync(`${STAGE}/variants/c/single-event.state.bin`)).digest("hex"),
  renders: aggregate(renders),
  reports: aggregate(reports),
};

mkdirSync(`${STAGE}/reports`, { recursive: true });
writeFileSync(`${STAGE}/reports/checkpoint-hashes.json`, `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  source: payload.source,
  baseline: payload.baselineImported,
  a: payload.variantA,
  b: payload.variantB,
  c: payload.variantC,
  m51ok: payload.m51Source === payload.m51SourceExpected,
}, null, 2)}\n`);
