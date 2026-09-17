import assert from "node:assert/strict";
import test from "node:test";
import { buildSurfaceField, mixFields, MORPH_BRIDGE } from "../app/labNonLeakyMimic/surface-field";

function sphere(cx = 0) {
  const positions = new Float32Array(1200 * 3), normals = new Float32Array(1200 * 3);
  for (let i = 0; i < 1200; i++) {
    const z = 1 - 2 * (i + .5) / 1200;
    const theta = i * Math.PI * (3 - Math.sqrt(5));
    const radius = Math.sqrt(1 - z * z);
    normals.set([Math.cos(theta) * radius, Math.sin(theta) * radius, z], i * 3);
    positions.set([normals[i * 3] + cx, normals[i * 3 + 1], z], i * 3);
  }
  return { positions, normals, support: .17 };
}

test("closed shell fills the sphere interior and has no axial pinholes", () => {
  const size = 40, half = 2;
  const field = buildSurfaceField(sphere(), size, half);
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = x + size * (y + size * z);
    assert.ok(Number.isFinite(field[i]));
    if (!x || !y || !z || x === size - 1 || y === size - 1 || z === size - 1) assert.ok(field[i] > 0);
    const px = x * 4 / (size - 1) - 2, py = y * 4 / (size - 1) - 2, pz = z * 4 / (size - 1) - 2;
    if (px * px + py * py + pz * pz < .9 ** 2) assert.ok(field[i] < 0, `interior leak at ${x},${y},${z}`);
  }
});

test("interpolation and retarget snapshots preserve exact endpoints and volume bridge", () => {
  const a = buildSurfaceField(sphere(-.4), 24, 2);
  const b = buildSurfaceField(sphere(.4), 24, 2);
  assert.deepEqual(mixFields(a, b, 0), a);
  assert.deepEqual(mixFields(a, b, 1), b);
  for (const t of [.1, .25, .5, .75, .9]) {
    const mixed = mixFields(a, b, t);
    assert.ok(mixed.some(value => value < 0));
    for (let i = 0; i < mixed.length; i++) assert.ok(Math.abs(mixed[i] - (a[i] * (1 - t) + b[i] * t - MORPH_BRIDGE * 4 * t * (1 - t))) < 1e-6);
  }
});

test("invalid or out-of-bounds geometry fails visibly rather than rendering an open clipped surface", () => {
  assert.throws(() => buildSurfaceField({ positions: new Float32Array(), normals: new Float32Array(), support: .1 }));
  assert.throws(() => buildSurfaceField(sphere(5)));
});
