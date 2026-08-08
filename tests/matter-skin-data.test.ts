import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  decodeRows,
  decodeStatics,
  phaseForLocalT,
  rowForKey,
  sampleCounts,
  sampleTimeline,
  SCALE_COUNT,
  type Manifest,
} from "../app/visual-lab/matter-skin/matter-skin-data";
import {
  parseInitialMatterLabSettings,
} from "../app/visual-lab/matter-skin/matter-lab-config";

const dataDir = path.join(process.cwd(), "public", "photonic-skin", "ps03m");
const manifest = JSON.parse(
  readFileSync(path.join(dataDir, "ps03m-manifest.json"), "utf8"),
) as Manifest;
const binBuffer = readFileSync(path.join(dataDir, "ps03m-states.bin"));
const bin = binBuffer.buffer.slice(
  binBuffer.byteOffset,
  binBuffer.byteOffset + binBuffer.byteLength,
);

test("exactly 8192 stable ids exist in every state and key", () => {
  assert.equal(manifest.scale_count, SCALE_COUNT);
  for (const name of ["sphere", "book", "game"] as const) {
    const state = manifest.states[name];
    assert.equal(state.visible + state.reserve, SCALE_COUNT);
  }
  for (const segment of manifest.segments) {
    for (const key of segment.meta) {
      assert.equal(
        key.visible + key.transition + key.reserve,
        SCALE_COUNT,
        `${segment.name} @ t=${key.t}`,
      );
    }
  }
});

test("component counts: sphere 1, book 1, gamepad+queen 2, real split/merge", () => {
  assert.equal(manifest.states.sphere.components, 1);
  assert.equal(manifest.states.book.components, 1);
  assert.equal(manifest.states.game.components, 2);

  const bookGame = manifest.segments.find((s) => s.name === "book-game")!;
  const gameSphere = manifest.segments.find((s) => s.name === "game-sphere")!;
  assert.equal(bookGame.meta[0].components, 1);
  assert.equal(bookGame.meta.at(-1)!.components, 2);
  assert.ok(
    bookGame.meta.some((m) => m.components === 2 && m.t < 1),
    "split happens before the segment ends",
  );
  assert.equal(gameSphere.meta[0].components, 2);
  assert.equal(gameSphere.meta.at(-1)!.components, 1);

  const split = manifest.states.game.component_split!;
  assert.equal(split.gamepad + split.queen, SCALE_COUNT);
  assert.ok(split.gamepad > 1000 && split.queen > 1000);
});

test("volume stays within ±1% of V0 across all states and keys", () => {
  assert.ok(manifest.volume_tolerance <= 0.01);
  for (const name of ["sphere", "book", "game"] as const) {
    assert.ok(manifest.states[name].volume_error <= 0.01, name);
  }
  for (const segment of manifest.segments) {
    for (const key of segment.meta) {
      assert.ok(key.volume_error <= 0.01, `${segment.name} @ t=${key.t}`);
    }
  }
});

test("binary blob matches manifest size and deterministic sha256", () => {
  assert.equal(bin.byteLength, manifest.bin_size);
  const hash = createHash("sha256").update(binBuffer).digest("hex");
  assert.equal(hash, manifest.bin_sha256);
});

test("decoded rows are finite with unit normals and sane scales", () => {
  const rows = decodeRows(manifest, bin);
  assert.equal(rows.rows, manifest.rows_total);
  assert.equal(rows.positionScale.length, manifest.rows_total * SCALE_COUNT * 4);
  for (let i = 0; i < rows.positionScale.length; i += 1) {
    assert.ok(Number.isFinite(rows.positionScale[i]));
    assert.ok(Number.isFinite(rows.normalState[i]));
  }
  const [scaleMin, scaleMax] = manifest.scale_range;
  for (let row = 0; row < rows.rows; row += 1) {
    for (let i = 0; i < SCALE_COUNT; i += 128) {
      const t = (row * SCALE_COUNT + i) * 4;
      const nx = rows.normalState[t];
      const ny = rows.normalState[t + 1];
      const nz = rows.normalState[t + 2];
      const len = Math.hypot(nx, ny, nz);
      assert.ok(Math.abs(len - 1) < 0.02, `normal length row ${row} id ${i}`);
      const scale = rows.positionScale[t + 3];
      assert.ok(scale > 0.3 && scale <= scaleMax + 0.06);
      void scaleMin;
    }
  }
});

test("statics decode: colors for 3 states, component split, rotations", () => {
  const statics = decodeStatics(manifest, bin);
  assert.equal(statics.colors.length, 3 * SCALE_COUNT * 4);
  assert.equal(statics.component.length, SCALE_COUNT);
  assert.equal(statics.rotation.length, SCALE_COUNT);
  const queenCount = statics.component.reduce<number>(
    (acc, c) => acc + (c === 1 ? 1 : 0),
    0,
  );
  assert.equal(queenCount, manifest.states.game.component_split!.queen);
});

test("timeline mapping hits exact state rows at whole progress values", () => {
  const atSphere = sampleTimeline(manifest, 0);
  assert.equal(atSphere.rowA, manifest.row_index["state:sphere"]);
  const atBook = sampleTimeline(manifest, 1);
  assert.equal(atBook.rowA, manifest.row_index["state:book"]);
  const atGame = sampleTimeline(manifest, 2);
  assert.equal(atGame.rowA, manifest.row_index["state:game"]);

  const mid = sampleTimeline(manifest, 1.5);
  assert.equal(mid.segment, 1);
  assert.ok(mid.rowA >= manifest.segments[1].row_start);
  assert.ok(phaseForLocalT(manifest, 0.5).length > 0);

  // Row coverage: every key of every segment resolves to a valid row.
  for (let seg = 0; seg < 3; seg += 1) {
    for (let key = 0; key < manifest.keys_per_segment; key += 1) {
      const row = rowForKey(manifest, seg, key);
      assert.ok(row >= 0 && row < manifest.rows_total);
    }
  }
});

test("counts interpolation stays consistent at 8192", () => {
  for (const progress of [0, 0.37, 1, 1.58, 2, 2.42, 2.999]) {
    const counts = sampleCounts(manifest, progress);
    const total = counts.visible + counts.transition + counts.reserve;
    assert.ok(Math.abs(total - SCALE_COUNT) <= 2, `progress ${progress}`);
    assert.ok(counts.volumeError <= 0.01);
  }
});

test("lab settings parser falls back safely", () => {
  assert.deepEqual(parseInitialMatterLabSettings({}), {
    stateId: "sphere",
    previewMode: "desktop",
    motionProfile: "full",
    debugMode: "none",
  });
  assert.deepEqual(
    parseInitialMatterLabSettings({
      state: "game",
      preview: "mobile",
      motion: "reduced",
      debug: "components",
    }),
    {
      stateId: "game",
      previewMode: "mobile",
      motionProfile: "reduced",
      debugMode: "components",
    },
  );
  assert.equal(
    parseInitialMatterLabSettings({ state: ["book"] }).stateId,
    "book",
  );
});
