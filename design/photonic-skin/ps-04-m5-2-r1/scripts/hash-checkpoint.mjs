import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STAGE = "design/photonic-skin/ps-04-m5-2-r1";

function posix(value) {
  return value.replaceAll("\\", "/");
}

function walk(dir) {
  if (!statSync(dir, { throwIfNoEntry: false })) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "_player.html" || name.startsWith("page@")) continue;
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

const m52 = JSON.parse(readFileSync("design/photonic-skin/ps-04-m5-2/reports/checkpoint-hashes.json", "utf8"));
const m51 = JSON.parse(readFileSync("design/photonic-skin/ps-04-m5-1/reports/checkpoint-hashes.json", "utf8"));
const authoring = walk(`${STAGE}/authoring`);
const variants = walk(`${STAGE}/variants`);
const scripts = walk(`${STAGE}/scripts`);
const reports = walk(`${STAGE}/reports`).filter((file) => !file.endsWith("checkpoint-hashes.json"));
const renders = walk(`${STAGE}/renders`);
const sandbox = walk("app/visual-lab/photonic-skin-ps04-m5/event-sandbox");
const sourceFiles = [
  ...sandbox,
  "tests/photonic-ps04-m5-2-r1.test.ts",
  ...scripts,
  ...authoring,
].filter((file) => statSync(file, { throwIfNoEntry: false }));

const payload = {
  method: "SHA-256 over sorted relative-path + TAB + file-SHA256 + LF records",
  stage: "PS-04.M5.2.R1",
  excludedFromHash: [`${STAGE}/manifest.json`, `${STAGE}/reports/checkpoint-hashes.json`],
  m52SourceExpected: "34e19852c76aec43e6a07c005ede69573481b7957c8c6b087111054591c7c87e",
  m52SourceRecorded: m52.source,
  m51Source: aggregate(m51.sourceFiles),
  eventA: createHash("sha256").update(readFileSync("design/photonic-skin/ps-04-m5-2/variants/a/single-event.state.bin")).digest("hex"),
  eventAR1: createHash("sha256").update(readFileSync(`${STAGE}/variants/a-r1/single-event.state.bin`)).digest("hex"),
  publicAR1: createHash("sha256").update(readFileSync("public/photonic-skin/ps-04-m5-2/variants/a-r1/single-event.state.bin")).digest("hex"),
  frozenEvent: createHash("sha256").update(readFileSync("public/photonic-skin/ps-03-m3-1r/states/single-event.state.bin")).digest("hex"),
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
  source: payload.source,
  a: payload.eventA,
  ar1: payload.eventAR1,
  m52ok: payload.m52SourceRecorded === payload.m52SourceExpected,
}, null, 2)}\n`);
