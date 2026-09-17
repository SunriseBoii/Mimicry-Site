import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { checkpointAggregate } from "./checkpoint-hash";
import * as THREE from "three";
import { competenceOrder } from "../app/_brand/color-system";
import { decodeState, type M3Manifest } from "../app/visual-lab/photonic-skin-m4-1/m41-data";
import {
  FIELD_DIRECTION,
  FIELD_PARAMETERS,
  actorFieldScalar,
  bandEnvelope,
  measureStateCoverage,
} from "../app/visual-lab/photonic-skin-ps04-m2/photonic-field";
import { PhotonicPaletteController } from "../app/visual-lab/photonic-skin-ps04-m2/palette-controller";
import {
  ALL_COMPETENCE_MASK,
  COMPETENCE_BIT,
  PHOTONIC_COLOR_HEX,
  PHOTONIC_COLOR_TOKENS,
  competenciesFromMask,
  maskFromCompetencies,
  paletteColorLinear,
  paletteStateForMask,
  semanticWeightsForCoordinate,
  validateCompetenceMask,
} from "../app/visual-lab/photonic-skin-ps04-m2/photonic-palette";

const ROOT = process.cwd();
const scenePath = path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m2/PS04M2Scene.tsx");
const m1ScenePath = path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m1/PS04M1Scene.tsx");
const scene = readFileSync(scenePath, "utf8");
const m1Scene = readFileSync(m1ScenePath, "utf8");

function vertexShader(source: string) {
  const match = source.match(/const vertexShader = `([\s\S]*?)`;/);
  assert.ok(match, "vertex shader must exist");
  return match[1];
}

function stripM2FieldBridge(source: string) {
  return source
    .replace("uniform vec3 uFieldOrigin;\nuniform vec3 uFieldDirection;\nuniform float uFieldScale;\n", "")
    .replace("flat out float vFieldScalar;\n", "")
    .replace("  vFieldScalar = dot((center - uFieldOrigin) / uFieldScale, uFieldDirection);\n", "");
}

function exactBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function decodedState(stateId: string) {
  const publicRoot = path.join(ROOT, "public/photonic-skin");
  const manifest = JSON.parse(readFileSync(path.join(publicRoot, "ps-03-m3-1r/manifest.json"), "utf8")) as M3Manifest;
  const entry = manifest.states.find((item) => item.stateId === stateId);
  assert.ok(entry, stateId);
  return decodeState(entry, exactBuffer(readFileSync(path.join(publicRoot, "ps-03-m3-1r", entry.bufferPath))));
}

function distance(a: readonly number[], b: readonly number[]) {
  return Math.hypot(...a.map((value, index) => value - b[index]));
}

test("registry order is the explicit name-to-bit adapter and tokens are fixed sRGB", () => {
  assert.deepEqual(competenceOrder, ["content", "design", "event", "games", "video", "digital", "merch"]);
  competenceOrder.forEach((id, index) => assert.equal(COMPETENCE_BIT[id], 1 << index));
  assert.deepEqual(PHOTONIC_COLOR_HEX, {
    content: "#4C7AFF", design: "#9E64EE", event: "#F86927", games: "#76A713",
    video: "#E34992", digital: "#009FAC", merch: "#D5A200",
  });
  for (const token of PHOTONIC_COLOR_TOKENS) {
    const three = new THREE.Color(token.hex);
    // Three's IEC conversion uses a polynomial approximation whose maximum
    // deviation from the canonical transfer function is about 1.1e-11.
    assert.ok(distance(three.toArray(), token.linear) < 2e-11, `${token.id} converts to Linear-sRGB exactly once`);
  }
});

test("all 127 non-empty masks are deterministic, normalized, and selected-colors-only", () => {
  for (let mask = 1; mask <= ALL_COMPETENCE_MASK; mask += 1) {
    const state = paletteStateForMask(mask);
    assert.equal(maskFromCompetencies(state.selected), mask);
    assert.deepEqual(competenciesFromMask(mask), state.selected);
    for (let sample = 0; sample < 257; sample += 1) {
      const weights = semanticWeightsForCoordinate(sample / 257, state);
      assert.ok(weights.every((weight) => Number.isFinite(weight) && weight >= 0));
      assert.ok(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12);
      weights.forEach((weight, index) => {
        if ((mask & (1 << index)) === 0) assert.equal(weight, 0, `mask=${mask} index=${index}`);
      });
    }
  }
});

test("empty and invalid masks are explicit and never fall back to seven colors", () => {
  const empty = paletteStateForMask(0);
  assert.equal(empty.neutralOnly, true);
  assert.deepEqual(semanticWeightsForCoordinate(0.5, empty), [0, 0, 0, 0, 0, 0, 0]);
  for (const invalid of [-1, 128, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "7", null]) {
    assert.throws(() => validateCompetenceMask(invalid));
  }
  assert.throws(() => maskFromCompetencies(["unknown"]));
});

test("field envelope is periodic, C1-soft, and averages to the requested active range", () => {
  const samples = 65536;
  let sum = 0;
  let above = 0;
  for (let index = 0; index < samples; index += 1) {
    const weight = bandEnvelope(index / samples, 0).activeWeight;
    sum += weight;
    if (weight >= FIELD_PARAMETERS.activeThreshold) above += 1;
  }
  const mean = sum / samples;
  assert.ok(mean >= 0.3 && mean <= 0.38, `mean=${mean}`);
  assert.ok(above / samples >= 0.3 && above / samples <= 0.45, `threshold=${above / samples}`);
  assert.ok(Math.abs(bandEnvelope(0.123, 0).activeWeight - bandEnvelope(0.123, 1).activeWeight) < 1e-12);
  const epsilon = 1e-6;
  assert.ok(Math.abs(bandEnvelope(FIELD_PARAMETERS.coreHalfWidth - epsilon, 0).activeWeight - bandEnvelope(FIELD_PARAMETERS.coreHalfWidth + epsilon, 0).activeWeight) < 1e-8);
});

test("representative MASTER, SINGLE, and DRIVE coverage stays in the tuning range on average", (context) => {
  for (const id of ["master-neutral", "single-content", "complex-drive-content-design-digital-event"]) {
    const coverage = measureStateCoverage(decodedState(id), 128);
    assert.ok(coverage.meanActiveWeight.mean >= 0.3 && coverage.meanActiveWeight.mean <= 0.38, `${id}: ${coverage.meanActiveWeight.mean}`);
    assert.ok(Number.isFinite(coverage.aboveThresholdFraction.mean));
    context.diagnostic(`${id} ${JSON.stringify(coverage)}`);
  }
});

test("palette controller preserves phase, bounds memory, and continuity across interrupted retargets", () => {
  const controller = new PhotonicPaletteController(COMPETENCE_BIT.content, 14);
  controller.setPhase(0.37);
  controller.setPeriodSeconds(32);
  assert.equal(controller.snapshot().phase, 0.37);
  const coordinates = Array.from({ length: 1024 }, (_, index) => index / 1024);
  const before = coordinates.map((coordinate) => controller.colorAt(coordinate));
  controller.setMask(COMPETENCE_BIT.design | COMPETENCE_BIT.video);
  const after = coordinates.map((coordinate) => controller.colorAt(coordinate));
  const continuity = Math.max(...before.map((sample, index) => Math.max(
    distance(sample.color, after[index].color),
    Math.abs(sample.presence - after[index].presence),
  )));
  assert.ok(continuity < 0.12, `32-sample retarget continuity error=${continuity}`);
  controller.advance(0.23);
  controller.setMask(COMPETENCE_BIT.event | COMPETENCE_BIT.digital | COMPETENCE_BIT.merch);
  for (let index = 0; index < 200; index += 1) controller.setMask((index % ALL_COMPETENCE_MASK) + 1);
  assert.equal(controller.snapshot().transitionCapacity, 32);
  assert.equal(controller.snapshot().sourceLut.length, 32);
  assert.ok(controller.snapshot().transient);
});

test("controller handles no-op, pause, reduced motion, hidden resume, and period changes", () => {
  const controller = new PhotonicPaletteController(COMPETENCE_BIT.content, 14);
  assert.equal(controller.setMask(COMPETENCE_BIT.content), false);
  controller.setPhase(0.4);
  controller.advance(-1);
  controller.advance(10, { hidden: true });
  assert.equal(controller.snapshot().phase, 0.4);
  controller.setPlaying(false);
  controller.advance(0.1);
  assert.equal(controller.snapshot().phase, 0.4);
  controller.setPlaying(true);
  controller.setReducedMotion(true);
  controller.advance(0.1);
  assert.equal(controller.snapshot().phase, 0.4);
  controller.setMask(COMPETENCE_BIT.design);
  controller.advance(0.1);
  assert.ok(controller.snapshot().paletteProgress > 0 && controller.snapshot().paletteProgress < 1);
  controller.advance(0.1);
  assert.equal(controller.snapshot().paletteProgress, 1);
  assert.equal(controller.snapshot().transientMask, COMPETENCE_BIT.design);
});

test("M2 vertex evaluator is byte-identical to M1 after the actor-space field bridge is removed", () => {
  assert.equal(stripM2FieldBridge(vertexShader(scene)), vertexShader(m1Scene));
  const fieldLine = scene.indexOf("vFieldScalar = dot((center - uFieldOrigin) / uFieldScale, uFieldDirection)");
  const presentationLine = scene.indexOf("vec3 presented = (center + frameTranslate + local) * frameScale");
  assert.ok(fieldLine > 0 && fieldLine < presentationLine);
});

test("color-off keeps the exact M1 lighting suffix and field is actor-space only", () => {
  const marker = "  float roughness = clamp(";
  assert.equal(scene.slice(scene.indexOf(marker), scene.indexOf("}\n`;", scene.indexOf(marker))), m1Scene.slice(m1Scene.indexOf(marker), m1Scene.indexOf("}\n`;", m1Scene.indexOf(marker))));
  assert.match(scene, /if \(uColorEnabled == 1 && uColorLayer > 0\)/);
  assert.doesNotMatch(scene, /gl_FragCoord|cameraPosition|component.*Field|field.*component/i);
  assert.match(scene, /flat out float vFieldScalar/);
});

test("M2 remains one RawShaderMaterial, one actor draw, and adds no texture fetch to color", () => {
  assert.equal((scene.match(/new THREE\.RawShaderMaterial/g) ?? []).length, 1);
  assert.equal((scene.match(/<instancedMesh/g) ?? []).length, 1);
  assert.doesNotMatch(scene, /MeshStandardMaterial|MeshPhysicalMaterial|onBeforeCompile/);
  assert.doesNotMatch(scene, /emissive|bloom|transmission|iridescence|displacement/);
  assert.match(scene, /uniform vec4 uPaletteSourceLut\[\$\{FIELD_LUT_SIZE\}\]/);
  assert.doesNotMatch(scene, /sampler.*Palette|paletteTexture|uPaletteSourceLut[^\n]*needsUpdate/);
});

test("frozen hashes, inventory, M1 source snapshot, and old routes remain exact", () => {
  const m41Path = path.join(ROOT, "design/photonic-skin/ps-03-m4-1/exports/ps03m41-manifest.json");
  const m41Bytes = readFileSync(m41Path);
  const m41 = JSON.parse(m41Bytes.toString("utf8")) as { aggregateContentHash: string; programs: unknown[] };
  assert.equal(createHash("sha256").update(m41Bytes).digest("hex"), "d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441");
  assert.equal(m41.aggregateContentHash, "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361");
  assert.equal(m41.programs.length, 35);
  const m31 = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-03-m3-1r/exports/ps03m31r-manifest.json"), "utf8")) as { stateCount: number; deterministicFingerprint: string };
  assert.equal(m31.stateCount, 154);
  assert.equal(m31.deterministicFingerprint, "0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2");
  assert.equal(readdirSync(path.join(ROOT, "design/photonic-skin/ps-03-m4-1/programs/approval")).length, 105);
  const patchInventory = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-03-m4-1r/reports/presentation-patch-inventory.json"), "utf8")) as { hash: string };
  assert.equal(patchInventory.hash, "228ddce450536d94d625d73f99ceff133371ccfe515a6f21cc3377fa3fda3ca0");
  const m1Manifest = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m1/manifest.json"), "utf8")) as { sourceFiles: string[]; checkpointAggregates: { source: string } };
  assert.equal(checkpointAggregate(m1Manifest.sourceFiles, "ded950b"), m1Manifest.checkpointAggregates.source);
  assert.ok(readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-m4-1r/page.tsx"), "utf8").length > 0);
  assert.ok(readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m1/page.tsx"), "utf8").length > 0);
});

test("field direction is actor-space Z-up and yields a 15-25 degree slash", () => {
  const length = Math.hypot(...FIELD_DIRECTION);
  assert.ok(Math.abs(length - 1) < 1e-12);
  const fromVertical = Math.acos(FIELD_DIRECTION[2]) * 180 / Math.PI;
  const bandTilt = 90 - fromVertical;
  assert.ok(bandTilt >= 15 && bandTilt <= 25, `bandTilt=${bandTilt}`);
});

test("click order does not change a mask, and wrap is C0-continuous", () => {
  assert.equal(maskFromCompetencies(["design", "content"]), maskFromCompetencies(["content", "design"]));
  const seven = paletteStateForMask(ALL_COMPETENCE_MASK);
  assert.deepEqual(semanticWeightsForCoordinate(0, seven), semanticWeightsForCoordinate(1, seven));
  assert.deepEqual(semanticWeightsForCoordinate(-0.25, seven), semanticWeightsForCoordinate(0.75, seven));
  assert.equal(bandEnvelope(0, 0.31).activeWeight, bandEnvelope(1, 0.31).activeWeight);
  assert.equal(bandEnvelope(0.4, 0).activeWeight, bandEnvelope(0.4, 1).activeWeight);
});

test("one actor-space field spans components without local normalization", () => {
  const state = decodedState("complex-focus-content-design-focus-content");
  const byComponent = new Map<number, { min: number; max: number; count: number }>();
  let globalMin = Number.POSITIVE_INFINITY;
  let globalMax = Number.NEGATIVE_INFINITY;
  for (let id = 0; id < state.recordCount; id += 1) {
    if (state.status[id] !== 0 || state.scale[id] <= 0) continue;
    const offset = id * 3;
    const scalar = actorFieldScalar([state.position[offset], state.position[offset + 1], state.position[offset + 2]]);
    globalMin = Math.min(globalMin, scalar);
    globalMax = Math.max(globalMax, scalar);
    const current = byComponent.get(state.component[id]) ?? { min: scalar, max: scalar, count: 0 };
    current.min = Math.min(current.min, scalar);
    current.max = Math.max(current.max, scalar);
    current.count += 1;
    byComponent.set(state.component[id], current);
  }
  assert.ok(byComponent.size >= 2);
  const globalSpan = globalMax - globalMin;
  assert.ok(globalSpan > 0.15);
  for (const [component, stats] of byComponent) {
    const span = stats.max - stats.min;
    assert.ok(span <= globalSpan + 1e-12, `component ${component} span ${span} exceeded global ${globalSpan}`);
  }
  const smallest = [...byComponent.values()].sort((left, right) => left.count - right.count)[0];
  assert.ok(smallest.max - smallest.min < globalSpan * 0.85);
});

test("settled retarget drops removed colors completely and immediate replace skips transient", () => {
  const controller = new PhotonicPaletteController(COMPETENCE_BIT.content, 14);
  controller.setMask(COMPETENCE_BIT.content | COMPETENCE_BIT.design, { immediate: true });
  assert.equal(controller.snapshot().transient, false);
  assert.equal(controller.snapshot().paletteProgress, 1);
  controller.setMask(COMPETENCE_BIT.event);
  for (let step = 0; step < 10; step += 1) controller.advance(0.1);
  assert.equal(controller.snapshot().transient, false);
  assert.equal(controller.snapshot().transientMask, COMPETENCE_BIT.event);
  const expected = paletteColorLinear(0.37, paletteStateForMask(COMPETENCE_BIT.event));
  const actual = controller.colorAt(0.37);
  assert.ok(distance(actual.color, expected) < 1e-12);
  assert.equal(actual.presence, 1);
  controller.setMask(0);
  for (let step = 0; step < 10; step += 1) controller.advance(0.1);
  assert.equal(controller.colorAt(0.5).presence, 0);
});
