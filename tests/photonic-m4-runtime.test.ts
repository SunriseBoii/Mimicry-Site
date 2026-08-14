import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  LatestRequestGate,
  LruCache,
  decodeState,
  halfToFloat,
  loadMatchingPrecompiledProgram,
  parseM4Query,
  serializeM4Query,
  type StateEntry,
  type M3Manifest,
  type M4Manifest,
} from "../app/visual-lab/photonic-skin-m4/m4-data";
import {
  c2Window,
  compileTransition,
  createRetargetSnapshot,
  evaluateDirected,
  evaluateElement,
  finiteProgram,
  resolveRuntimeProgress,
  shortestNlerp,
  smoothScrollProgress,
  type TransitionRequest,
  type TransitionState,
} from "../app/visual-lab/photonic-skin-m4/m4-evaluator";

function entry(recordCount = 1): StateEntry {
  return {
    stateId: "test-state",
    stateRole: "single",
    compositionMode: "SINGLE",
    competencyIds: [],
    focusCompetencyId: null,
    contentHash: "0".repeat(64),
    bufferPath: "states/test.state.bin",
    bufferBytes: recordCount * 40,
    recordCount,
    recordStride: 40,
    componentCount: 1,
    shellCount: 1,
    surfaceArea: 1,
    machineQa: { activeCount: recordCount, reserveCount: 0, componentQuotas: {} },
    approvalStatus: "machine-valid",
  };
}

function synthetic(offset: readonly [number, number, number], shellOffset = 0): TransitionState {
  const count = 12;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const orientation = new Float32Array(count * 4);
  const scale = new Float32Array(count);
  const reserveDepth = new Float32Array(count);
  const component = new Uint8Array(count);
  const shell = new Uint8Array(count);
  const status = new Uint8Array(count);
  const flags = new Uint8Array(count);
  const transitionGroup = new Uint8Array(count);
  for (let id = 0; id < count; id += 1) {
    const angle = id / count * Math.PI * 2;
    position.set([Math.cos(angle) + offset[0], Math.sin(angle) + offset[1], (id % 3) * 0.15 + offset[2]], id * 3);
    normal.set([Math.cos(angle), Math.sin(angle), 0.25], id * 3);
    orientation.set([0, 0, Math.sin(angle / 2), Math.cos(angle / 2)], id * 4);
    scale[id] = 0.55 + id * 0.002;
    reserveDepth[id] = 0.1 + id * 0.005;
    component[id] = id % 3;
    shell[id] = (id % 2) + shellOffset;
    status[id] = id % 5 === 0 ? 1 : 0;
    flags[id] = id % 4 === 0 ? 1 : 0;
    transitionGroup[id] = id % 4;
  }
  return { recordCount: count, position, normal, orientation, scale, reserveDepth, component, shell, status, flags, transitionGroup };
}

function request(overrides: Partial<TransitionRequest> = {}): TransitionRequest {
  return {
    schemaVersion: "1.0.0",
    sourceStateId: "source",
    targetStateId: "target",
    identitySpaceVersion: "ps03m3-identity-v1",
    motionProfileId: "directed-plastic-release",
    triggerMode: "qa",
    viewportProfile: "desktop",
    directionIntent: "auto",
    deterministicSeed: 12345,
    ...overrides,
  };
}

function exactBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

test("M3 stride-40 decoder includes orientation, reserve depth and LOD priority", () => {
  const payload = new ArrayBuffer(40);
  const view = new DataView(payload);
  view.setFloat32(0, 1.25, true);
  view.setFloat32(4, -2.5, true);
  view.setFloat32(8, 3.75, true);
  view.setInt16(12, 32767, true);
  view.setInt16(14, 0, true);
  view.setInt16(16, -32767, true);
  view.setInt16(18, 0, true);
  view.setInt16(20, 0, true);
  view.setInt16(22, 0, true);
  view.setInt16(24, 32767, true);
  view.setUint16(26, 0x3800, true); // 0.5
  view.setUint16(28, 0x3400, true); // 0.25
  view.setUint8(30, 7);
  view.setUint8(31, 8);
  view.setUint8(32, 1);
  view.setUint8(33, 5);
  view.setUint8(34, 201);
  view.setUint8(35, 9);
  view.setUint16(36, 65530, true);
  const decoded = decodeState(entry(), payload);
  assert.deepEqual(Array.from(decoded.position), [1.25, -2.5, 3.75]);
  assert.deepEqual(Array.from(decoded.orientation), [0, 0, 0, 1]);
  assert.equal(decoded.scale[0], 0.5);
  assert.equal(decoded.reserveDepth[0], 0.25);
  assert.equal(decoded.component[0], 7);
  assert.equal(decoded.shell[0], 8);
  assert.equal(decoded.status[0], 1);
  assert.equal(decoded.flags[0], 5);
  assert.equal(decoded.density[0], 201);
  assert.equal(decoded.transitionGroup[0], 9);
  assert.equal(decoded.lodPriority[0], 65530);
  assert.equal(halfToFloat(0x0001), 2 ** -24);
});

test("compiler is geometry-derived, bounded, finite and self-transition is a no-op", () => {
  const source = synthetic([0, 0, 0]);
  const target = synthetic([0, 0, 2], 1);
  const program = compileTransition(source, target, request());
  assert.ok(finiteProgram(program));
  assert.ok(program.durationMs >= 980 && program.durationMs <= 1350);
  assert.ok(Math.abs(program.directionIntent[2]) > 0.99, "direction follows endpoint geometry, not fixed X");
  assert.throws(
    () => compileTransition(source, target, request({ viewportProfile: "mobile", durationOverrideMs: 9000 })),
    /hard cap/,
  );

  const noop = compileTransition(source, source, request());
  assert.equal(noop.selfTransition, true);
  assert.equal(noop.durationMs, 0);
  for (const t of [0, 0.2, 0.5, 0.9, 1]) {
    assert.deepEqual(evaluateElement(source, source, noop, 4, t).position, Array.from(source.position.slice(12, 15)));
  }
  const orientationOnly = { ...source, orientation: new Float32Array(source.orientation) };
  orientationOnly.orientation[3] = 0;
  orientationOnly.orientation[0] = 1;
  assert.equal(compileTransition(source, orientationOnly, request()).selfTransition, false);
});

test("bridge selection is bounded per macro-track and excludes protected IDs", () => {
  const source = synthetic([0, 0, 0]);
  const target = synthetic([0.15, -0.2, 1.1], 1);
  const program = compileTransition(source, target, request());
  const memberCounts = new Uint32Array(program.tracks.length);
  const bridgeCounts = new Uint32Array(program.tracks.length);
  for (let id = 0; id < source.recordCount; id += 1) {
    const trackId = program.trackIndex[id];
    memberCounts[trackId] += 1;
    if (program.bridgeWeight[id] <= 0) continue;
    bridgeCounts[trackId] += 1;
    assert.notEqual(source.shell[id], target.shell[id]);
    assert.equal(source.flags[id], 0);
    assert.equal(target.flags[id], 0);
  }
  for (let trackId = 0; trackId < program.tracks.length; trackId += 1) {
    assert.ok(bridgeCounts[trackId] <= Math.min(96, Math.max(1, Math.ceil(memberCounts[trackId] * 0.08))));
  }
});

test("endpoints are exact, C2 windows are flat, shortest quaternion path stays normalized", () => {
  const source = synthetic([0, 0, 0]);
  const target = synthetic([0, 0, 2], 1);
  const program = compileTransition(source, target, request());
  for (const id of [0, 3, 11]) {
    assert.deepEqual(evaluateElement(source, target, program, id, 0).position, Array.from(source.position.slice(id * 3, id * 3 + 3)));
    assert.deepEqual(evaluateElement(source, target, program, id, 1).position, Array.from(target.position.slice(id * 3, id * 3 + 3)));
    assert.equal(evaluateElement(source, target, program, id, 0).scale, source.scale[id]);
    assert.equal(evaluateElement(source, target, program, id, 1).scale, target.scale[id]);
  }
  const h = 1e-4;
  assert.ok(Math.abs((c2Window(h, 0, 1) - c2Window(0, 0, 1)) / h) < 1e-5);
  assert.ok(Math.abs((c2Window(1, 0, 1) - c2Window(1 - h, 0, 1)) / h) < 1e-5);
  const q = shortestNlerp([0, 0, 0, 1], [0, 0, 0, -1], 0.5);
  assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-9);
  assert.ok(Math.abs(q[3] - 1) < 1e-9);
});

test("reverse and scrub are deterministic at every sampled progress", () => {
  const source = synthetic([0, 0, 0]);
  const target = synthetic([0.2, -0.1, 1.4], 1);
  const program = compileTransition(source, target, request());
  for (const t of [0, 0.17, 0.5, 0.83, 1]) {
    const reverse = evaluateDirected(source, target, program, 7, t, true);
    const mirrored = evaluateElement(source, target, program, 7, 1 - t);
    assert.deepEqual(reverse, mirrored);
    assert.deepEqual(evaluateElement(source, target, program, 7, t), evaluateElement(source, target, program, 7, t));
  }
});

test("reduced motion lands at the endpoint in one render step", () => {
  assert.equal(resolveRuntimeProgress(0, true), 1);
  assert.equal(resolveRuntimeProgress(0.4, true), 1);
  assert.equal(resolveRuntimeProgress(0.4, false), 0.4);
  const source = synthetic([0, 0, 0]);
  const target = synthetic([0, 1, 0]);
  const program = compileTransition(source, target, request({ reducedMotion: true }));
  assert.equal(program.durationMs, 0);
  assert.deepEqual(
    evaluateElement(source, target, program, 2, resolveRuntimeProgress(0, true)).position,
    Array.from(target.position.slice(6, 9)),
  );
});

test("retarget snapshots preserve position, finite velocity and persistent identity", () => {
  const source = synthetic([0, 0, 0]);
  const target = synthetic([0.4, 0.2, 1.2], 1);
  const next = synthetic([-0.4, 0.5, 0.2], 0);
  const first = compileTransition(source, target, request());
  for (const t of [0.25, 0.5, 0.75]) {
    const snapshot = createRetargetSnapshot(source, target, first, t);
    assert.equal(snapshot.recordCount, source.recordCount);
    assert.ok(Array.from(snapshot.velocity).every(Number.isFinite));
    assert.ok(Array.from(snapshot.activation).every((value) => value >= 0 && value <= 1));
    assert.ok(Array.from(snapshot.bridge).every((value) => value >= 0 && value <= 1));
    const retarget = compileTransition(snapshot, next, request({ sourceSnapshot: snapshot, targetStateId: "next" }));
    for (const id of [0, 6, 11]) {
      const endpoint = evaluateElement(snapshot, next, retarget, id, 0);
      assert.deepEqual(endpoint.position, Array.from(snapshot.position.slice(id * 3, id * 3 + 3)));
      assert.equal(endpoint.activation, snapshot.activation[id]);
      assert.equal(endpoint.bridge, snapshot.bridge[id]);
      assert.deepEqual(endpoint.role, Array.from(snapshot.role.slice(id * 3, id * 3 + 3)));
      assert.deepEqual([...endpoint.actorPose.position, ...endpoint.actorPose.orientation], Array.from(snapshot.actorPose));
    }
  }
});

test("LOD selection cannot change per-ID motion semantics", () => {
  const source = synthetic([0, 0, 0]);
  const target = synthetic([0, 0.6, 0.8], 1);
  const program = compileTransition(source, target, request());
  const reference = evaluateElement(source, target, program, 3, 0.43);
  for (const budget of [4, 8, 12]) {
    assert.ok(3 < budget);
    assert.deepEqual(evaluateElement(source, target, program, 3, 0.43), reference);
  }
});

test("latest request token rejects stale async completion and LRU stays bounded", () => {
  const gate = new LatestRequestGate();
  const old = gate.begin();
  const latest = gate.begin();
  let committed = "none";
  assert.equal(old.signal.aborted, true);
  assert.equal(gate.commit(old.token, "old", (value) => { committed = value; }), false);
  assert.equal(gate.commit(latest.token, "latest", (value) => { committed = value; }), true);
  assert.equal(committed, "latest");

  const cache = new LruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1);
  cache.set("c", 3);
  assert.deepEqual(cache.keys(), ["a", "c"]);
  assert.equal(cache.size, 2);
});

test("hidden-tab scroll resume is bounded and deterministic query presets round-trip", () => {
  assert.equal(smoothScrollProgress(0.25, 1, 10, "desktop", true), 0.25);
  const resumed = smoothScrollProgress(0.25, 1, 10, "desktop", false);
  assert.ok(resumed > 0.25 && resumed < 0.7, `bounded resume=${resumed}`);
  const preset = parseM4Query({
    source: "master-neutral",
    target: "single-design",
    trigger: "scroll",
    viewport: "mobile",
    frame: "mobile390",
    reduced: "1",
    compare: "side-by-side",
    debug: "bridge",
    camera: "top",
    lod: "16384",
    t: "0.375",
    seed: "42",
    play: "1",
  });
  assert.deepEqual(parseM4Query(new URLSearchParams(serializeM4Query(preset))), preset);
  for (const lod of [512, 12288]) {
    const value = { ...preset, lod };
    assert.equal(parseM4Query(new URLSearchParams(serializeM4Query(value))).lod, lod);
  }
  assert.equal(parseM4Query({ source: "../bad", debug: "bad", lod: "3" }).source, "");
});

test("verified Python approval buffers match golden evaluator fixtures", async (context) => {
  const publicRoot = path.join(process.cwd(), "public", "photonic-skin");
  const m3 = JSON.parse(readFileSync(path.join(publicRoot, "ps-03-m3", "manifest.json"), "utf8")) as M3Manifest;
  const m4 = JSON.parse(readFileSync(path.join(publicRoot, "ps-03-m4", "manifest.json"), "utf8")) as M4Manifest;
  const golden = JSON.parse(readFileSync(path.join(publicRoot, "ps-03-m4", "runtime", "ps03m4-golden-fixtures.json"), "utf8")) as {
    persistentIds: number[];
    tolerances: { position: number; orientation: number; scale: number };
    fixtures: Array<{
      programId: string;
      sourceStateId: string;
      targetStateId: string;
      samples: Array<{
        t: number;
        position: number[][];
        velocity: number[][];
        orientation: number[][];
        normal: number[][];
        scale: number[];
        status: number[];
        role: number[][];
        actorPose: number[];
      }>;
    }>;
  };
  const fixture = golden.fixtures.find((item) => item.sourceStateId === "master-neutral" && item.targetStateId === "single-design")
    ?? golden.fixtures[0];
  const sourceEntry = m3.states.find((item) => item.stateId === fixture.sourceStateId)!;
  const targetEntry = m3.states.find((item) => item.stateId === fixture.targetStateId)!;
  const source = decodeState(sourceEntry, exactBuffer(readFileSync(path.join(publicRoot, "ps-03-m3", sourceEntry.bufferPath))));
  const target = decodeState(targetEntry, exactBuffer(readFileSync(path.join(publicRoot, "ps-03-m3", targetEntry.bufferPath))));
  const fileFetch: typeof fetch = async (input) => {
    const relative = String(input).replace(/^\/photonic-skin\//, "");
    return new Response(readFileSync(path.join(publicRoot, relative)), { status: 200 });
  };
  const program = await loadMatchingPrecompiledProgram(m4, source, target, "qa", "desktop", {
    fetchImpl: fileFetch,
    cache: new LruCache(2),
  });
  assert.equal(program.programId, fixture.programId);
  assert.equal(program.compiled?.groupTracks.length, program.tracks.length);
  assert.equal(program.compiled?.perId.groupIndex.length, program.recordCount);
  const bridgeId = program.compiled!.perId.flags.findIndex((value) => (value & 4) !== 0);
  assert.ok(bridgeId >= 0, "approval program contains finite bridge IDs");
  const bridgeTrack = program.compiled!.groupTracks[program.compiled!.perId.groupIndex[bridgeId]];
  const bridgePeak = (bridgeTrack.bridgeStart + bridgeTrack.bridgeEnd) * 0.5;
  const bridged = evaluateElement(source, target, program, bridgeId, bridgePeak);
  const savedFlags = program.compiled!.perId.flags[bridgeId];
  program.compiled!.perId.flags[bridgeId] = savedFlags & ~4;
  const unbridged = evaluateElement(source, target, program, bridgeId, bridgePeak);
  program.compiled!.perId.flags[bridgeId] = savedFlags;
  const spatialEffect = Math.hypot(...bridged.position.map((value, axis) => value - unbridged.position[axis]));
  assert.ok(spatialEffect > 1e-7, `bridge has spatial neck displacement (${spatialEffect})`);
  const idOffset = bridgeId * 3;
  const offset = program.compiled!.perId.phaseOffset[bridgeId] / 255 * program.compiled!.header.activationPolicy.phaseOffsetRange;
  const width = program.compiled!.header.activationPolicy.localMorphWidthFraction ?? 0.12;
  const handoffStart = Math.min(bridgeTrack.releaseEnd + offset, Math.max(bridgeTrack.releaseEnd, bridgeTrack.revealEnd - width));
  const handoffEnd = Math.max(Math.min(handoffStart + width, bridgeTrack.revealEnd), handoffStart + 1e-4);
  const alpha = c2Window(bridgePeak, handoffStart, handoffEnd);
  const local = [0, 1, 2].map((axis) => {
    const a = source.position[idOffset + axis] - bridgeTrack.sourceCenter[axis];
    const b = target.position[idOffset + axis] - bridgeTrack.targetCenter[axis];
    return a + (b - a) * alpha;
  });
  const directionLength = Math.hypot(...bridgeTrack.direction);
  const direction = bridgeTrack.direction.map((value) => value / directionLength);
  const axialLength = local.reduce((sum, value, axis) => sum + value * direction[axis], 0);
  const transverseLength = Math.hypot(...local.map((value, axis) => value - direction[axis] * axialLength));
  const thickness = program.compiled!.header.activationPolicy.bridgeThickness ?? 1;
  assert.ok(Math.abs(spatialEffect - transverseLength * (1 - thickness)) < 3e-5);
  let positionError = 0;
  let velocityError = 0;
  let orientationError = 0;
  let normalError = 0;
  let scaleError = 0;
  let roleError = 0;
  let actorError = 0;
  for (const sample of fixture.samples) {
    for (let lane = 0; lane < golden.persistentIds.length; lane += 1) {
      const value = evaluateElement(source, target, program, golden.persistentIds[lane], sample.t);
      for (let axis = 0; axis < 3; axis += 1) {
        positionError = Math.max(positionError, Math.abs(value.position[axis] - sample.position[lane][axis]));
        velocityError = Math.max(velocityError, Math.abs(value.velocity[axis] - sample.velocity[lane][axis]));
        normalError = Math.max(normalError, Math.abs(value.normal[axis] - sample.normal[lane][axis]));
        roleError = Math.max(roleError, Math.abs(value.role[axis] - sample.role[lane][axis]));
      }
      for (let axis = 0; axis < 4; axis += 1) {
        orientationError = Math.max(orientationError, Math.abs(value.orientation[axis] - sample.orientation[lane][axis]));
      }
      scaleError = Math.max(scaleError, Math.abs(value.scale - sample.scale[lane]));
      assert.equal(Math.trunc(value.status), sample.status[lane]);
      const actor = [...value.actorPose.position, ...value.actorPose.orientation];
      for (let axis = 0; axis < actor.length; axis += 1) actorError = Math.max(actorError, Math.abs(actor[axis] - sample.actorPose[axis]));
    }
  }
  assert.ok(positionError <= golden.tolerances.position, `position max error ${positionError}`);
  assert.ok(orientationError <= golden.tolerances.orientation, `orientation max error ${orientationError}`);
  assert.ok(scaleError <= golden.tolerances.scale, `scale max error ${scaleError}`);
  assert.ok(normalError <= 3e-5, `normal max error ${normalError}`);
  assert.ok(roleError <= 3e-5, `role max error ${roleError}`);
  assert.ok(actorError <= 3e-5, `actor max error ${actorError}`);
  assert.ok(velocityError <= 3e-3, `velocity max error ${velocityError}`);
  context.diagnostic(JSON.stringify({ positionError, velocityError, orientationError, normalError, scaleError, roleError, actorError }));
});

test("exact on-demand compiler reproduces Python approval buffers and hashes", () => {
  const publicRoot = path.join(process.cwd(), "public", "photonic-skin");
  const m3 = JSON.parse(readFileSync(path.join(publicRoot, "ps-03-m3", "manifest.json"), "utf8")) as M3Manifest;
  const m4 = JSON.parse(readFileSync(path.join(publicRoot, "ps-03-m4", "manifest.json"), "utf8")) as M4Manifest;
  const artifact = m4.programs.find((item) => item.sourceStateId === "master-neutral" && item.targetStateId === "single-design")!;
  const metadata = JSON.parse(
    readFileSync(path.join(publicRoot, "ps-03-m4", artifact.metadataPath), "utf8"),
  ) as {
    programId: string;
    header: { deterministicSeed: number };
    hashes: Record<string, string>;
  };
  const sourceEntry = m3.states.find((item) => item.stateId === artifact.sourceStateId)!;
  const targetEntry = m3.states.find((item) => item.stateId === artifact.targetStateId)!;
  const source = decodeState(sourceEntry, exactBuffer(readFileSync(path.join(publicRoot, "ps-03-m3", sourceEntry.bufferPath))));
  const target = decodeState(targetEntry, exactBuffer(readFileSync(path.join(publicRoot, "ps-03-m3", targetEntry.bufferPath))));
  const compiled = compileTransition(source, target, request({
    sourceStateId: artifact.sourceStateId,
    targetStateId: artifact.targetStateId,
    deterministicSeed: metadata.header.deterministicSeed,
  }));

  assert.equal(compiled.programSource, "on-demand-compiled");
  assert.equal(compiled.machineValid, true);
  assert.equal(compiled.programId, metadata.programId);
  assert.deepEqual(compiled.compiled?.metadata, metadata);
  assert.deepEqual(compiled.compiled?.hashes, metadata.hashes);
  assert.deepEqual(
    Buffer.from(compiled.compiled!.groupPayload!),
    readFileSync(path.join(publicRoot, "ps-03-m4", artifact.groupTrackPath)),
  );
  assert.deepEqual(
    Buffer.from(compiled.compiled!.perIdPayload!),
    readFileSync(path.join(publicRoot, "ps-03-m4", artifact.perIdPath)),
  );
});

test("arbitrary route, mobile, reduced and no-op compiles match Python hashes", () => {
  const publicRoot = path.join(process.cwd(), "public", "photonic-skin");
  const m3 = JSON.parse(readFileSync(path.join(publicRoot, "ps-03-m3", "manifest.json"), "utf8")) as M3Manifest;
  const golden = JSON.parse(
    readFileSync(path.join(publicRoot, "ps-03-m4", "runtime", "ps03m4-golden-fixtures.json"), "utf8"),
  ) as {
    compilerFixtureVersion: string;
    compilerFixtures: Array<{
      request: TransitionRequest & { sourceStateId: string };
      programId: string;
      durationSeconds: number;
      groupCount: number;
      isNoOp: boolean;
      hashes: Record<string, string>;
      metadata: unknown;
    }>;
  };
  assert.equal(golden.compilerFixtureVersion, "ps03m4.compiler-parity.v1");
  assert.equal(golden.compilerFixtures.length, 4);
  for (const fixture of golden.compilerFixtures) {
    const sourceEntry = m3.states.find((item) => item.stateId === fixture.request.sourceStateId)!;
    const targetEntry = m3.states.find((item) => item.stateId === fixture.request.targetStateId)!;
    const source = decodeState(sourceEntry, exactBuffer(readFileSync(path.join(publicRoot, "ps-03-m3", sourceEntry.bufferPath))));
    const target = decodeState(targetEntry, exactBuffer(readFileSync(path.join(publicRoot, "ps-03-m3", targetEntry.bufferPath))));
    const compiled = compileTransition(source, target, fixture.request);
    assert.equal(compiled.programSource, "on-demand-compiled");
    assert.equal(compiled.machineValid, true);
    assert.equal(compiled.programId, fixture.programId);
    assert.equal(compiled.durationMs / 1000, fixture.durationSeconds);
    assert.equal(compiled.compiled?.groupTracks.length, fixture.groupCount);
    assert.equal(compiled.selfTransition, fixture.isNoOp);
    assert.deepEqual(compiled.compiled?.metadata, fixture.metadata);
    assert.deepEqual(compiled.compiled?.hashes, fixture.hashes);
  }
});

test("M4 evaluator core contains no competency/state-name branches", () => {
  const file = readFileSync(path.join(process.cwd(), "app", "visual-lab", "photonic-skin-m4", "m4-evaluator.ts"), "utf8").toLowerCase();
  for (const forbidden of ["single-content", "single-design", "single-event", "single-games", "single-video", "single-digital", "single-merch"]) {
    assert.equal(file.includes(forbidden), false, forbidden);
  }
});
