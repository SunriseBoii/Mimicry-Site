/** Offline QA of the actual Final R2 payloads; run with npx tsx scripts/validate-non-leaky.ts. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { loadBuilderRuntime, loadBuilderState } from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/delta-runtime";
import { buildSurfaceField, FIELD_HALF } from "../app/labNonLeakyMimic/surface-field";
import { samplesFor } from "../app/labNonLeakyMimic/surface-samples";

const publicRoot = path.resolve("public");
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  const file = path.resolve(publicRoot, `.${new URL(url, "http://localhost").pathname}`);
  assert.ok(file.startsWith(publicRoot + path.sep));
  const bytes = await readFile(file);
  return new Response(bytes);
};
const { m3 } = await loadBuilderRuntime(undefined, { releaseGeometry: "r2" });
const results: Array<{ id: string; size: number; samples: number; negative: number; ms: number }> = [];
for (const entry of m3.states) {
  const start = performance.now();
  const samples = samplesFor(await loadBuilderState(entry, undefined, { releaseGeometry: "r2" }));
  const size = entry.stateRole === "single" || entry.stateRole === "master" ? 96 : 24;
  const field = buildSurfaceField(samples, size);
  let negative = 0;
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const value = field[x + size * (y + size * z)];
    assert.ok(Number.isFinite(value), `${entry.stateId}: non-finite`);
    if (!x || !y || !z || x === size - 1 || y === size - 1 || z === size - 1) assert.ok(value > 0, `${entry.stateId}: open boundary`);
    if (value < 0) negative++;
  }
  assert.ok(negative > 0, `${entry.stateId}: empty`);
  assert.ok(samples.positions.every(value => Math.abs(value) < FIELD_HALF - .15));
  results.push({ id: entry.stateId, size, samples: samples.positions.length / 3, negative, ms: Math.round(performance.now() - start) });
  if (results.length % 48 === 0) console.log(`${results.length}/${m3.states.length} states passed`);
}
await mkdir("artifacts/non-leaky-mimic", { recursive: true });
await writeFile("artifacts/non-leaky-mimic/validation.json", JSON.stringify({ stateCount: results.length, scope: "All patched states: finite, nonempty, closed field boundary and no cropping. Eight base forms at production 96^3; combinations at 24^3. This is not an exhaustive pixel test of all transitions.", results }, null, 2));
console.log(`PASS: ${results.length} patched states. Eight base forms at 96³.`);
