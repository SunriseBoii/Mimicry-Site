import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { loadBuilderRuntime, loadBuilderState } from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/delta-runtime";
import { buildContactSurface } from "../app/_photonic-skin/contact-surface";
import { contactStateTexture } from "../app/_photonic-skin/contact-rendering";
import { compileTransition } from "../app/visual-lab/photonic-skin-m4-1/m41-evaluator";
import { M3_SEED } from "../app/visual-lab/photonic-skin-ps04-m3/runtime";
import { contactTopologyUrl, decodeContactTopology } from "../app/_photonic-skin/contact-topology";

const publicRoot = path.resolve("public");
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  const file = path.resolve(publicRoot, `.${new URL(url, "http://localhost").pathname}`);
  assert.ok(file.startsWith(publicRoot + path.sep));
  return new Response(await readFile(file));
};
const { m3 } = await loadBuilderRuntime(undefined, { releaseGeometry: "r2" });
const source = await loadBuilderState(m3.states.find(e => e.stateId === "master-neutral")!, undefined, { releaseGeometry: "r2" });
const results = [];
const optimized = process.argv.includes("--optimized");
for (const id of ["master-neutral", "single-content", "single-event", "single-video", "complex-gather-content-design-merch", "complex-gather-content-event-video"]) {
  const begin = performance.now();
  const target = await loadBuilderState(m3.states.find(e => e.stateId === id)!, undefined, { releaseGeometry: "r2" });
  const loaded = performance.now();
  target.contactSurface = optimized
    ? decodeContactTopology(target, Uint8Array.from(gunzipSync(await readFile(path.join(publicRoot, contactTopologyUrl(target.entry.contentHash))))).buffer)
    : buildContactSurface(target);
  const contact = performance.now();
  compileTransition(source, target, {
    schemaVersion: "1.0.0", sourceStateId: source.entry.stateId, targetStateId: id,
    identitySpaceVersion: m3.identitySpace.identitySpaceVersion, motionProfileId: "directed-plastic-release",
    triggerMode: "qa", viewportProfile: "desktop", directionIntent: "auto", deterministicSeed: M3_SEED, reducedMotion: false,
  });
  const compiled = performance.now();
  contactStateTexture(target).dispose();
  const atlasMs = performance.now() - compiled;
  const surfaceHash = createHash("sha256").update(new Uint8Array(target.contactSurface.corners.buffer)).update(target.contactSurface.cornerCounts).update(new Uint8Array(target.contactSurface.triangles.buffer)).digest("hex");
  const result = { id, loadMs: loaded - begin, contactMs: contact - loaded, motionMs: compiled - contact, atlasMs, surfaceHash };
  results.push(result);
  console.log(JSON.stringify(result));
}
await mkdir("artifacts/contact-scales", { recursive: true });
if (optimized) {
  const baseline = JSON.parse(await readFile("artifacts/contact-scales/preparation-baseline.json", "utf8")) as typeof results;
  for (const result of results) assert.equal(result.surfaceHash, baseline.find(before => before.id === result.id)?.surfaceHash, `${result.id}: accepted geometry changed`);
}
await writeFile(`artifacts/contact-scales/preparation-${optimized ? "optimized" : "baseline"}.json`, JSON.stringify(results, null, 2));
