import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  applyReleasePatch,
  type ReleaseGeometryManifest,
} from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/delta-runtime";

const root = process.cwd();
const assetRoot = path.join(root, "public", "photonic-skin");
const releaseRoot = path.join(assetRoot, "ps-04-final-r1");
const manifest = JSON.parse(readFileSync(path.join(releaseRoot, "manifest.json"), "utf8")) as ReleaseGeometryManifest;

function hash(bytes: Uint8Array | ArrayBuffer) {
  return createHash("sha256").update(Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes)).digest("hex");
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

test("release Event patch covers every derived state and verifies every source/result", () => {
  assert.equal(manifest.stage, "PS-04.final-r1");
  assert.equal(manifest.identitySize, 16384);
  assert.equal(manifest.patchRecordStride, 28);
  const entries = Object.entries(manifest.states);
  assert.equal(entries.length, 203);
  assert.equal(entries.filter(([, item]) => item.sourceNamespace === "ps-04-m5-5").length, 83);
  assert.equal(entries.filter(([, item]) => item.sourceNamespace === "ps-04-m6-1").length, 120);

  const frozenManifests = new Map([
    ["ps-04-m5-5", JSON.parse(readFileSync(path.join(assetRoot, "ps-04-m5-5", "manifests", "ps04m55-manifest.json"), "utf8"))],
    ["ps-04-m6-1", JSON.parse(readFileSync(path.join(assetRoot, "ps-04-m6-1", "manifests", "ps04m61-delta-manifest.json"), "utf8"))],
  ]);

  for (const [stateId, revision] of entries) {
    const sourceEntry = frozenManifests.get(revision.sourceNamespace).states.find((item: { stateId: string }) => item.stateId === stateId);
    assert.ok(sourceEntry, `${stateId}: frozen manifest entry`);
    assert.equal(sourceEntry.contentHash, revision.sourceHash, `${stateId}: source manifest hash`);
    assert.equal(sourceEntry.componentMap.find((item: { componentId: string; competencyId: string }) => item.competencyId === "event" && item.componentId === "figure-left")?.componentIndex, revision.componentIndex);
    const frozen = readFileSync(path.join(assetRoot, revision.sourceNamespace, sourceEntry.bufferPath));
    const patch = readFileSync(path.join(releaseRoot, revision.patchPath));
    assert.equal(hash(frozen), revision.sourceHash, `${stateId}: frozen bytes`);
    assert.equal(hash(patch), revision.patchHash, `${stateId}: patch bytes`);
    const result = new Uint8Array(applyReleasePatch(arrayBuffer(frozen), arrayBuffer(patch), revision));
    assert.equal(hash(result), revision.resultHash, `${stateId}: exact release bytes`);
    for (let id = 0; id < 16384; id += 1) {
      const base = id * 40;
      for (let byte = 26; byte < 40; byte += 1) {
        if (result[base + byte] !== frozen[base + byte]) assert.fail(`${stateId}: record ${id} identity/palette metadata changed`);
      }
      if (frozen[base + 30] !== revision.componentIndex) {
        for (let byte = 0; byte < 26; byte += 1) {
          if (result[base + byte] !== frozen[base + byte]) assert.fail(`${stateId}: record ${id} non-target geometry changed`);
        }
      }
    }
  }
  assert.equal(hash(readFileSync(path.join(releaseRoot, "event-a-r3.state.bin"))), manifest.states["single-event"].resultHash);
});
