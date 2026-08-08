/** Isolated Three.js r185 runtime validation for the final PS-03.3 GLB. */

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
  };
}

const scriptPath = fileURLToPath(import.meta.url);
const stageDir = path.resolve(path.dirname(scriptPath), '..');
const glbPath = path.join(stageDir, 'exports', 'photonic-skin-c-r1-associative-morph-system.glb');
const outputPath = path.join(stageDir, 'exports', 'ps03-3-three-runtime-validation.json');
const targetNames = [
  'BRAND_WIDE', 'SINGLE_CONTENT_SEQUENCE', 'SINGLE_DESIGN_TORSION',
  'SINGLE_EVENT_CONVERGENCE', 'SINGLE_GAMES_BRANCH', 'SINGLE_VIDEO_TEMPORAL',
  'SINGLE_DIGITAL_SIGNAL', 'SINGLE_MERCH_WRAP', 'COMPLEX_FOCUS',
  'COMPLEX_GATHER', 'COMPLEX_DRIVE', 'TRANSITION_TENSION',
];
const terminalNames = ['MASTER', ...targetNames.slice(0, 11)];
// GLB runtime axes are X/Y/Z = Blender X/Z/Y.
const envelope = [6.8, 3.2, 3.6];
const tolerance = 0.002;
const minimumFill = 0.879;

function parseGlb(buffer) {
  return new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
}

function weights(entries = {}) {
  const result = new Float64Array(targetNames.length);
  for (const [name, value] of Object.entries(entries)) {
    const index = targetNames.indexOf(name);
    if (index < 0) throw new Error(`Unknown target ${name}`);
    result[index] = value;
  }
  return result;
}

function terminalWeights(name) { return name === 'MASTER' ? weights() : weights({ [name]: 1 }); }

function lerpWeights(left, right, t) {
  return Float64Array.from(left, (value, index) => value * (1 - t) + right[index] * t);
}

function addWeight(base, name, value) {
  const result = Float64Array.from(base);
  result[targetNames.indexOf(name)] += value;
  return result;
}

function evaluatedBounds(geometry, influences) {
  const base = geometry.attributes.position;
  const morphs = geometry.morphAttributes.position;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let finite = true;
  for (let vertex = 0; vertex < base.count; vertex += 1) {
    const point = [base.getX(vertex), base.getY(vertex), base.getZ(vertex)];
    for (let target = 0; target < morphs.length; target += 1) {
      if (influences[target] === 0) continue;
      point[0] += morphs[target].getX(vertex) * influences[target];
      point[1] += morphs[target].getY(vertex) * influences[target];
      point[2] += morphs[target].getZ(vertex) * influences[target];
    }
    for (let axis = 0; axis < 3; axis += 1) {
      finite &&= Number.isFinite(point[axis]);
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  const size = max.map((value, axis) => value - min[axis]);
  const fill = size.map((value, axis) => value / envelope[axis]);
  return {
    min: min.map((value) => Number(value.toFixed(6))),
    max: max.map((value) => Number(value.toFixed(6))),
    size: size.map((value) => Number(value.toFixed(6))),
    fill: fill.map((value) => Number(value.toFixed(6))),
    finite,
    inside_envelope: size.every((value, axis) => value <= envelope[axis] + tolerance),
  };
}

function sample(geometry, influences, requireFill = true) {
  const bounds = evaluatedBounds(geometry, influences);
  const fillPass = bounds.fill.every((value) => value >= minimumFill);
  return {
    weights: Object.fromEntries(targetNames.map((name, index) => [name, Number(influences[index].toFixed(6))]).filter(([, value]) => value !== 0)),
    bounds,
    canonical_fill_desirable: fillPass,
    passed: bounds.finite && bounds.inside_envelope && (!requireFill || fillPass),
  };
}

const bytes = await readFile(glbPath);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await parseGlb(arrayBuffer);
const meshes = [];
gltf.scene.traverse((node) => { if (node.isMesh) meshes.push(node); });
if (meshes.length !== 1) throw new Error(`Expected one mesh, received ${meshes.length}`);
const mesh = meshes[0];
const geometry = mesh.geometry;
const dictionary = mesh.morphTargetDictionary ?? {};
const dictionaryOrder = Object.entries(dictionary).sort((a, b) => a[1] - b[1]).map(([name]) => name);
const attributeNames = Object.keys(geometry.attributes).sort();
const maskAttribute = attributeNames.find((name) => name.toLowerCase() === '_photonic_mask');
const slotAttribute = attributeNames.find((name) => name.toLowerCase() === '_photonic_slot');

const oneHot = terminalNames.map((name) => ({ name, ...sample(geometry, terminalWeights(name)) }));
const directPairs = [];
for (let leftIndex = 0; leftIndex < terminalNames.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < terminalNames.length; rightIndex += 1) {
    const source = terminalNames[leftIndex];
    const target = terminalNames[rightIndex];
    const samples = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      t, ...sample(geometry, lerpWeights(terminalWeights(source), terminalWeights(target), t)),
    }));
    directPairs.push({ source, target, samples, passed: samples.every((item) => item.passed) });
  }
}

const chains = [
  ['SINGLE_CONTENT_SEQUENCE', 'SINGLE_DESIGN_TORSION', 'SINGLE_EVENT_CONVERGENCE'],
  ['SINGLE_GAMES_BRANCH', 'SINGLE_DIGITAL_SIGNAL', 'SINGLE_VIDEO_TEMPORAL'],
  ['COMPLEX_FOCUS', 'COMPLEX_GATHER', 'COMPLEX_DRIVE'],
  ['BRAND_WIDE', 'SINGLE_MERCH_WRAP', 'MASTER'],
];
const retarget = chains.map((states) => {
  const [first, second, third] = states;
  const switches = [0.25, 0.5, 0.75].map((switchProgress) => {
    const snapshot = lerpWeights(terminalWeights(first), terminalWeights(second), switchProgress);
    const samples = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      t, ...sample(geometry, lerpWeights(snapshot, terminalWeights(third), t)),
    }));
    return { switch_progress: switchProgress, coordinate_jump_at_switch: 0, samples, passed: samples.every((item) => item.passed) };
  });
  return { states, switches, passed: switches.every((item) => item.passed) };
});

const additive = terminalNames.map((terminal) => {
  const base = terminalWeights(terminal);
  const samples = [0.04, 0.06, 1].map((weight) => ({
    weight, ...sample(geometry, addWeight(base, 'TRANSITION_TENSION', weight), weight <= 0.06),
  }));
  return { terminal, samples, passed: samples.every((item) => item.passed) };
});

const checks = {
  three_r185: THREE.REVISION === '185', gltf_loader_success: true,
  one_mesh: meshes.length === 1, indexed_geometry: geometry.index !== null,
  triangle_count: geometry.index?.count / 3 === 16640,
  runtime_vertex_count: geometry.attributes.position.count === 8692,
  morph_targets_relative: geometry.morphTargetsRelative === true,
  morph_target_count: geometry.morphAttributes.position?.length === 12,
  morph_dictionary_count: Object.keys(dictionary).length === 12,
  target_order: JSON.stringify(dictionaryOrder) === JSON.stringify(targetNames),
  influences_count: mesh.morphTargetInfluences?.length === 12,
  position: Boolean(geometry.attributes.position), normal: Boolean(geometry.attributes.normal),
  tangent: Boolean(geometry.attributes.tangent), uv: Boolean(geometry.attributes.uv),
  photonic_mask: Boolean(maskAttribute), photonic_slot: Boolean(slotAttribute),
  one_hot_bounds: oneHot.every((item) => item.passed),
  all_66_direct_pairs: directPairs.length === 66 && directPairs.every((item) => item.passed),
  retarget: retarget.every((item) => item.passed), additive: additive.every((item) => item.passed),
};

const report = {
  stage: 'PS-03.3', system: 'D / Controlled Associative Hierarchy',
  validator: 'Three.js GLTFLoader / isolated Node runtime', node_version: process.version,
  three_revision: THREE.REVISION, file: glbPath, file_size_bytes: bytes.byteLength,
  file_sha256: createHash('sha256').update(bytes).digest('hex'),
  scene_name: gltf.scene.name, mesh_name: mesh.name,
  runtime_vertex_count: geometry.attributes.position.count,
  triangle_count: geometry.index.count / 3, geometry_attributes: attributeNames,
  custom_attributes: { photonic_mask: maskAttribute, photonic_slot: slotAttribute },
  morph_targets_relative: geometry.morphTargetsRelative,
  morph_target_dictionary: dictionary, target_order: dictionaryOrder,
  morph_target_influences_length: mesh.morphTargetInfluences.length,
  one_hot_states: oneHot, direct_pair_count: directPairs.length,
  direct_pair_samples: directPairs, retarget, additive, checks,
  passed: Object.values(checks).every(Boolean),
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('PS033_THREE_RUNTIME', { passed: report.passed, revision: THREE.REVISION, targets: dictionaryOrder.length, pairs: directPairs.length, vertices: report.runtime_vertex_count });
if (!report.passed) {
  console.error('PS033_THREE_FAILURES', Object.entries(checks).filter(([, value]) => !value));
  process.exitCode = 1;
}
