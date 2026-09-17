import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
import { loadBuilderRuntime, loadBuilderState } from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/delta-runtime";
import { buildContactSurface } from "../app/_photonic-skin/contact-surface";
import { contactTopologyUrl, encodeContactTopology, decodeContactTopology } from "../app/_photonic-skin/contact-topology";

const publicRoot = path.resolve("public");
const reportRoot = path.resolve("artifacts/contact-scales");
const shard = process.argv.find(arg => arg.startsWith("--shard="))?.slice(8).split("/").map(Number);
if (!shard) {
  // Bounded build-time parallelism; nothing is reconstructed on the visitor's CPU.
  const workers = 3;
  await Promise.all(Array.from({ length: workers }, (_, index) => new Promise<void>((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), [`--shard=${index}/${workers}`], { execArgv: ["--import", "tsx"], stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Contact build worker ${index} failed (${code})`)));
  })));
  const parts = await Promise.all(Array.from({ length: workers }, (_, i) => readFile(path.join(reportRoot, `precomputed-part-${i}.json`), "utf8").then(JSON.parse)));
  const results = parts.flat().sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(results.length, 384);
  await writeFile(path.join(reportRoot, "precomputed-topology.json"), JSON.stringify(results, null, 2));
  console.log(`PASS: ${results.length} exact contact surfaces; ${results.reduce((sum, r) => sum + r.bytes, 0)} compressed bytes.`);
} else {
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const file = path.resolve(publicRoot, `.${new URL(url, "http://localhost").pathname}`);
    assert.ok(file.startsWith(publicRoot + path.sep));
    return new Response(await readFile(file));
  };
  const { m3 } = await loadBuilderRuntime(undefined, { releaseGeometry: "r2" });
  const results = [];
  await mkdir(path.join(publicRoot, "photonic-skin/contact-v1"), { recursive: true });
  await mkdir(reportRoot, { recursive: true });
  for (const [index, entry] of m3.states.entries()) {
    if (index % shard[1] !== shard[0]) continue;
    const state = await loadBuilderState(entry, undefined, { releaseGeometry: "r2" });
    const begin = performance.now();
    const expected = buildContactSurface(state);
    const built = performance.now();
    const compressed = gzipSync(new Uint8Array(encodeContactTopology(state, expected)), { level: 9 });
    const compressedAt = performance.now();
    const actual = decodeContactTopology(state, Uint8Array.from(gunzipSync(compressed)).buffer);
    const restored = performance.now();
    assert.deepEqual(actual, expected, `${entry.stateId}: changed accepted surface`);
    await writeFile(path.join(publicRoot, contactTopologyUrl(entry.contentHash)), compressed);
    const surfaceHash = createHash("sha256").update(new Uint8Array(actual.corners.buffer)).update(actual.cornerCounts).update(new Uint8Array(actual.triangles.buffer)).digest("hex");
    const result = { id: entry.stateId, contentHash: entry.contentHash, bytes: compressed.length, buildMs: built - begin, restoreMs: restored - compressedAt, surfaceHash, ...actual.stats };
    results.push(result);
    console.log(`[${index + 1}/384] ${entry.stateId}: ${compressed.length} bytes, ${Math.round(result.buildMs)} → ${Math.round(result.restoreMs)} ms`);
  }
  await writeFile(path.join(reportRoot, `precomputed-part-${shard[0]}.json`), JSON.stringify(results, null, 2));
}
