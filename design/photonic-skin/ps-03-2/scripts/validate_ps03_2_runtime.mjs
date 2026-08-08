/** Isolated Three.js runtime validation for the final PS-03.2 GLB. */

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  };
}

const scriptPath = fileURLToPath(import.meta.url);
const stageDir = path.resolve(path.dirname(scriptPath), '..');
const glbPath = path.join(stageDir, 'exports', 'photonic-skin-c-r1-morph-system.glb');
const outputPath = path.join(stageDir, 'exports', 'ps03-2-three-runtime-validation.json');

const targetNames = [
  'BRAND_WIDE',
  'SINGLE_CONTENT_SEQUENCE',
  'SINGLE_DESIGN_TORSION',
  'SINGLE_EVENT_CONVERGENCE',
  'SINGLE_GAMES_BRANCH',
  'SINGLE_VIDEO_TEMPORAL',
  'SINGLE_DIGITAL_SIGNAL',
  'SINGLE_MERCH_WRAP',
  'COMPLEX_FOCUS',
  'COMPLEX_GATHER',
  'COMPLEX_DRIVE',
  'TRANSITION_TENSION',
];
const terminalNames = ['MASTER', ...targetNames.slice(0, 11)];
// glTF is Y-up: Blender's authored X/Y/Z envelope 6.8/3.6/3.2 is exposed
// by GLTFLoader as runtime X/Y/Z = 6.8/3.2/3.6.
const envelope = [6.8, 3.2, 3.6];
const envelopeTolerance = 0.002;
const minimumTerminalFill = 0.879;

function parseGlb(arrayBuffer) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
  });
}

function weightVector(entries = {}) {
  const result = new Float64Array(targetNames.length);
  for (const [name, value] of Object.entries(entries)) {
    const index = targetNames.indexOf(name);
    if (index < 0) throw new Error(`Unknown target ${name}`);
    result[index] = value;
  }
  return result;
}

function terminalWeights(name) {
  return name === 'MASTER' ? weightVector() : weightVector({ [name]: 1 });
}

function lerpWeights(left, right, t) {
  const result = new Float64Array(targetNames.length);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = left[index] * (1 - t) + right[index] * t;
  }
  return result;
}

function addWeight(left, targetName, amount) {
  const result = Float64Array.from(left);
  result[targetNames.indexOf(targetName)] += amount;
  return result;
}

function evaluatedBounds(geometry, weights) {
  const base = geometry.attributes.position;
  const morphs = geometry.morphAttributes.position;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let finite = true;
  for (let vertex = 0; vertex < base.count; vertex += 1) {
    const point = [base.getX(vertex), base.getY(vertex), base.getZ(vertex)];
    for (let target = 0; target < morphs.length; target += 1) {
      const influence = weights[target];
      if (influence === 0) continue;
      point[0] += morphs[target].getX(vertex) * influence;
      point[1] += morphs[target].getY(vertex) * influence;
      point[2] += morphs[target].getZ(vertex) * influence;
    }
    for (let axis = 0; axis < 3; axis += 1) {
      finite &&= Number.isFinite(point[axis]);
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  const size = max.map((value, axis) => value - min[axis]);
  const fill = size.map((value, axis) => value / envelope[axis]);
  const insideEnvelope = size.every(
    (value, axis) => value <= envelope[axis] + envelopeTolerance,
  );
  return {
    min: min.map((value) => Number(value.toFixed(6))),
    max: max.map((value) => Number(value.toFixed(6))),
    size: size.map((value) => Number(value.toFixed(6))),
    fill: fill.map((value) => Number(value.toFixed(6))),
    finite,
    inside_envelope: insideEnvelope,
  };
}

function sampleState(geometry, weights, requireTerminalFill = true) {
  const bounds = evaluatedBounds(geometry, weights);
  const fillPass = bounds.fill.every((value) => value >= minimumTerminalFill);
  return {
    weights: Object.fromEntries(
      targetNames
        .map((name, index) => [name, Number(weights[index].toFixed(6))])
        .filter(([, value]) => value !== 0),
    ),
    bounds,
    canonical_fill_desirable: fillPass,
    passed:
      bounds.finite && bounds.inside_envelope && (!requireTerminalFill || fillPass),
  };
}

const bytes = await readFile(glbPath);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await parseGlb(arrayBuffer);
const meshes = [];
gltf.scene.traverse((node) => {
  if (node.isMesh) meshes.push(node);
});
if (meshes.length !== 1) throw new Error(`Expected one mesh, received ${meshes.length}`);

const mesh = meshes[0];
const geometry = mesh.geometry;
const dictionary = mesh.morphTargetDictionary ?? {};
const dictionaryOrder = Object.entries(dictionary)
  .sort((left, right) => left[1] - right[1])
  .map(([name]) => name);
const attributeNames = Object.keys(geometry.attributes).sort();
const customMaskAttribute = attributeNames.find((name) => name.toLowerCase() === '_photonic_mask');
const customSlotAttribute = attributeNames.find((name) => name.toLowerCase() === '_photonic_slot');

const oneHot = terminalNames.map((name) => ({
  name,
  ...sampleState(geometry, terminalWeights(name)),
}));

const directPairs = [];
for (let leftIndex = 0; leftIndex < terminalNames.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < terminalNames.length; rightIndex += 1) {
    const left = terminalNames[leftIndex];
    const right = terminalNames[rightIndex];
    const samples = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      t,
      ...sampleState(
        geometry,
        lerpWeights(terminalWeights(left), terminalWeights(right), t),
      ),
    }));
    directPairs.push({ source: left, target: right, samples, passed: samples.every((item) => item.passed) });
  }
}

const retargetChains = [
  ['SINGLE_CONTENT_SEQUENCE', 'SINGLE_DESIGN_TORSION', 'SINGLE_EVENT_CONVERGENCE'],
  ['SINGLE_GAMES_BRANCH', 'SINGLE_DIGITAL_SIGNAL', 'SINGLE_VIDEO_TEMPORAL'],
  ['COMPLEX_FOCUS', 'COMPLEX_GATHER', 'COMPLEX_DRIVE'],
  ['BRAND_WIDE', 'SINGLE_MERCH_WRAP', 'MASTER'],
];
const retarget = [];
for (const states of retargetChains) {
  const [first, second, third] = states;
  const switches = [];
  for (const switchProgress of [0.25, 0.5, 0.75]) {
    const snapshot = lerpWeights(terminalWeights(first), terminalWeights(second), switchProgress);
    const samples = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      t,
      ...sampleState(geometry, lerpWeights(snapshot, terminalWeights(third), t)),
    }));
    switches.push({ switch_progress: switchProgress, coordinate_jump_at_switch: 0, samples, passed: samples.every((item) => item.passed) });
  }
  retarget.push({ states, switches, passed: switches.every((item) => item.passed) });
}

const additive = terminalNames.map((terminal) => {
  const base = terminalWeights(terminal);
  const samples = [0.04, 0.06, 1].map((weight) => ({
    weight,
    ...sampleState(
      geometry,
      addWeight(base, 'TRANSITION_TENSION', weight),
      weight <= 0.06,
    ),
  }));
  return { terminal, samples, passed: samples.every((item) => item.passed) };
});

const structuralChecks = {
  gltf_loader_success: true,
  one_mesh: meshes.length === 1,
  indexed_geometry: geometry.index !== null,
  triangle_count: geometry.index?.count / 3 === 16640,
  runtime_vertex_count: geometry.attributes.position.count === 8692,
  morph_targets_relative: geometry.morphTargetsRelative === true,
  morph_target_count: geometry.morphAttributes.position?.length === 12,
  morph_dictionary_count: Object.keys(dictionary).length === 12,
  target_order: JSON.stringify(dictionaryOrder) === JSON.stringify(targetNames),
  influences_count: mesh.morphTargetInfluences?.length === 12,
  position: Boolean(geometry.attributes.position),
  normal: Boolean(geometry.attributes.normal),
  tangent: Boolean(geometry.attributes.tangent),
  uv: Boolean(geometry.attributes.uv),
  photonic_mask: Boolean(customMaskAttribute),
  photonic_slot: Boolean(customSlotAttribute),
  one_hot_bounds: oneHot.every((item) => item.passed),
  all_66_direct_pairs: directPairs.length === 66 && directPairs.every((item) => item.passed),
  retarget: retarget.every((item) => item.passed),
  additive: additive.every((item) => item.passed),
};

const report = {
  stage: 'PS-03.2',
  validator: 'Three.js GLTFLoader / isolated Node runtime',
  node_version: process.version,
  three_revision: THREE.REVISION,
  file: glbPath,
  file_size_bytes: bytes.byteLength,
  file_sha256: createHash('sha256').update(bytes).digest('hex'),
  scene_name: gltf.scene.name,
  mesh_name: mesh.name,
  runtime_vertex_count: geometry.attributes.position.count,
  triangle_count: geometry.index.count / 3,
  geometry_attributes: attributeNames,
  custom_attributes: { photonic_mask: customMaskAttribute, photonic_slot: customSlotAttribute },
  morph_targets_relative: geometry.morphTargetsRelative,
  morph_target_dictionary: dictionary,
  morph_target_influences_length: mesh.morphTargetInfluences.length,
  target_order: dictionaryOrder,
  one_hot_states: oneHot,
  direct_pair_count: directPairs.length,
  direct_pair_samples: directPairs,
  retarget,
  additive,
  checks: structuralChecks,
  passed: Object.values(structuralChecks).every(Boolean),
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('PS032_THREE_RUNTIME', {
  passed: report.passed,
  revision: THREE.REVISION,
  targets: dictionaryOrder.length,
  pairs: directPairs.length,
  vertices: report.runtime_vertex_count,
});
if (!report.passed) {
  console.error('PS032_THREE_FAILURES', Object.entries(structuralChecks).filter(([, value]) => !value));
  process.exitCode = 1;
}
