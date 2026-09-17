import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Quaternion, Vector3 } from "three";
import { decodeState, type StateEntry } from "../app/visual-lab/photonic-skin-m4-1/m41-data";
import { buildContactSurface, captureMasterPaletteWeight } from "../app/_photonic-skin/contact-surface";
import { contactStateTexture } from "../app/_photonic-skin/contact-rendering";
import { packStateInto } from "../app/visual-lab/photonic-skin-ps04-m5/texture-pack";
import { encodeContactTopology, decodeContactTopology } from "../app/_photonic-skin/contact-topology";

const root = "public/photonic-skin/ps-04-m5-5/";
const manifest = JSON.parse(readFileSync(root + "manifests/ps04m55-manifest.json", "utf8"));
function load(id: string) {
  const entry = manifest.states.find((entry: StateEntry) => entry.stateId === id) as StateEntry;
  return decodeState(entry, Uint8Array.from(readFileSync(root + entry.bufferPath)).buffer);
}

for (const id of ["master-neutral", "single-content", "single-video", "complex-focus-content-video-focus-content"]) test(`${id}: every primal edge is covered by coincident scale seams`, () => {
  const state = load(id);
  const original = { position: state.position.slice(), orientation: state.orientation.slice(), scale: state.scale.slice(), status: state.status.slice() };
  const surface = buildContactSurface(state);
  assert.deepEqual(decodeContactTopology(state, encodeContactTopology(state, surface)), surface, "precomputation changed the accepted contours");
  assert.equal(surface.stats.boundaryEdges, 0);
  assert.equal(surface.stats.nonManifoldEdges, 0);
  assert.equal(surface.stats.active, state.status.reduce((sum, v) => sum + Number(v === 0), 0));
  for (const key of ["position", "orientation", "scale", "status"] as const) assert.deepEqual(state[key], original[key], `${key} changed`);
  const position = (id: number) => new Vector3().fromArray(state.position, id * 3);
  const rings = Array.from({ length: state.recordCount }, (_, id) => {
    const q = new Quaternion().fromArray(state.orientation, id * 4), p = position(id);
    return Array.from({ length: surface.cornerCounts[id] }, (_, j) => new Vector3()
      .fromArray(surface.corners, (id * surface.cornerStride + j) * 3)
      .multiplyScalar(state.scale[id]).applyQuaternion(q).add(p));
  });
  const near = (a: Vector3, b: Vector3) => a.distanceToSquared(b) < 1e-11;
  const hasSeam = (id: number, a: Vector3, b: Vector3) => rings[id].some((v, j) => {
    const next = rings[id][(j + 1) % rings[id].length];
    return (near(v, a) && near(next, b)) || (near(v, b) && near(next, a));
  });
  for (let i = 0; i < surface.triangles.length; i += 3) {
    const ids = Array.from(surface.triangles.subarray(i, i + 3));
    const center = ids.map(position).reduce((sum, v) => sum.add(v), new Vector3()).multiplyScalar(1 / 3);
    for (let j = 0; j < 3; j++) {
      const a = ids[j], b = ids[(j + 1) % 3], midpoint = position(a).add(position(b)).multiplyScalar(.5);
      assert.ok(hasSeam(a, midpoint, center), `Missing seam at ${a}`);
      assert.ok(hasSeam(b, midpoint, center), `Missing seam at ${b}`);
    }
  }
});

test("contact atlas preserves every original motion texel and uses the same sampler", () => {
  const state = load("master-neutral");
  state.contactSurface = buildContactSurface(state);
  const original = packStateInto(new Float32Array(128 * 128 * 4), state, "position");
  const texture = contactStateTexture(state);
  const image = texture.image as { data: Float32Array; width: number; height: number };
  for (let id = 0; id < state.recordCount; id++) {
    const offset = ((id % 128) + Math.floor(id / 128) * image.width) * 4;
    assert.deepEqual(image.data.subarray(offset, offset + 4), original.subarray(id * 4, id * 4 + 4));
  }
  assert.ok(image.data.every(Number.isFinite));
  texture.dispose();
});

test("an interrupted master palette continues from its visible mixture", () => {
  const source = load("master-neutral"), target = load("single-content");
  const snapshot = { ...source, refinedMasterWeight: captureMasterPaletteWeight(source, target, .25) };
  assert.equal(snapshot.refinedMasterWeight, .84375);
  assert.equal(captureMasterPaletteWeight(snapshot, source, 0), .84375);
  assert.equal(captureMasterPaletteWeight(snapshot, source, 1), 1);
  assert.equal(captureMasterPaletteWeight(snapshot, target, 1), 0);
});

test("contact assets reject stale, truncated and invalid identity data", () => {
  const state = load("master-neutral");
  const payload = encodeContactTopology(state, buildContactSurface(state));
  assert.throws(() => decodeContactTopology(load("single-content"), payload), /source mismatch/);
  assert.throws(() => decodeContactTopology(state, payload.slice(0, 20)), /Truncated/);
  assert.throws(() => decodeContactTopology(state, payload.slice(0, -2)), /layout/);
  const invalid = payload.slice(0);
  new DataView(invalid).setUint16(44, 65535, true);
  assert.throws(() => decodeContactTopology(state, invalid), /identity/);
});
