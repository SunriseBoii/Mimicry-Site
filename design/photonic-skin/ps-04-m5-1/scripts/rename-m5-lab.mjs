import { readdirSync, renameSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const root = "app/visual-lab/photonic-skin-ps04-m5";

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const renameMap = new Map([
  ["PS04M4Lab.tsx", "PS04M5Lab.tsx"],
  ["PS04M4LabClient.tsx", "PS04M5LabClient.tsx"],
  ["PS04M4Scene.tsx", "PS04M5Scene.tsx"],
  ["ps04m4.module.css", "ps04m5.module.css"],
  ["PS04M4PreviewClient.tsx", "PS04M5PreviewClient.tsx"],
]);

for (const file of walk(root)) {
  const mapped = renameMap.get(path.basename(file));
  if (mapped) renameSync(file, path.join(path.dirname(file), mapped));
}

const replacements = [
  ["PS04M4", "PS04M5"],
  ["ps04m4.module", "ps04m5.module"],
  ["__PS04M4_", "__PS04M5_"],
  ["ps04-m4-r6-r1", "ps04-m5-1"],
  ["PS-04.M4.R6.R1", "PS-04.M5.1"],
  ['runId: "ps04-m4"', 'runId: "ps04-m5"'],
  ["ps04m4.nativeSetGeometryLinkedProgress", "ps04m5.nativeSetGeometryLinkedProgress"],
];

for (const file of walk(root)) {
  if (!/\.(ts|tsx|css)$/.test(file)) continue;
  let text = readFileSync(file, "utf8");
  const before = text;
  for (const [from, to] of replacements) text = text.split(from).join(to);
  if (text !== before) writeFileSync(file, text);
}

process.stdout.write(`${walk(root).length} files\n`);
