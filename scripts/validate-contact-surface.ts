import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { loadBuilderRuntime, loadBuilderState } from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/delta-runtime";
import { buildContactSurface } from "../app/_photonic-skin/contact-surface";

const publicRoot = path.resolve("public");
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  const file = path.resolve(publicRoot, `.${new URL(url, "http://localhost").pathname}`);
  assert.ok(file.startsWith(publicRoot + path.sep));
  return new Response(await readFile(file));
};
const { m3 } = await loadBuilderRuntime(undefined, { releaseGeometry: "r2" });
const all = process.argv.includes("--all");
const only = process.argv.find(arg => arg.startsWith("--state="))?.slice(8);
const results = [];
for (const entry of m3.states.filter(e => only ? e.stateId === only : all || e.stateRole === "master" || e.stateRole === "single")) {
  const state = await loadBuilderState(entry, undefined, { releaseGeometry: "r2" });
  const surface = buildContactSurface(state);
  const active = state.status.reduce((sum, status) => sum + (status === 0 ? 1 : 0), 0);
  const incidence = new Uint16Array(state.recordCount);
  for (const id of surface.triangles) incidence[id]++;
  let splitFans = 0;
  for (let id = 0; id < state.recordCount; id++) if (state.status[id] === 0 && surface.cornerCounts[id] !== incidence[id] * 2) splitFans++;
  const result = { id: entry.stateId, expectedActive: active, splitFans, ...surface.stats };
  results.push(result);
  console.log(JSON.stringify(result));
  assert.equal(surface.stats.boundaryEdges, 0, `${entry.stateId}: open edges`);
  assert.equal(surface.stats.nonManifoldEdges, 0, `${entry.stateId}: non-manifold edges`);
  assert.equal(surface.stats.active, active, `${entry.stateId}: missing active scales`);
  assert.ok(surface.corners.every(Number.isFinite), `${entry.stateId}: non-finite contour`);
  if (process.argv.includes("--debug") && surface.stats.boundaryEdges) {
    const edges = new Map<string, number[][]>();
    for (let f = 0; f < surface.triangles.length; f += 3) for (let j = 0; j < 3; j++) {
      const a = surface.triangles[f + j], b = surface.triangles[f + (j + 1) % 3];
      const key = [a,b].sort((a,b) => a-b).join(":");
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key)!.push([a,b]);
    }
    const boundary = [...edges.values()].filter(e => e.length === 1).map(e => e[0]);
    const incidence = new Map<number, number>();
    boundary.flat().forEach(id => incidence.set(id, (incidence.get(id) ?? 0) + 1));
    console.log("boundary", boundary, "branch vertices", [...incidence].filter(([,n]) => n !== 2));
  }
}
await mkdir("artifacts/contact-scales", { recursive: true });
const reportName = only ? `state-${only}.json` : all ? "topology.json" : "base-topology.json";
await writeFile(`artifacts/contact-scales/${reportName}`, JSON.stringify(results, null, 2));
console.log(`PASS: ${results.length} states, closed edges and complete active coverage.`);
