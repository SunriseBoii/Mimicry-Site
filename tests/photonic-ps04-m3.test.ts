import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { checkpointAggregate } from "./checkpoint-hash";
import * as THREE from "three";
import { decodeState, type M3Manifest } from "../app/visual-lab/photonic-skin-m4-1/m41-data";
import { compileTransition, DIRECTED_PLASTIC_RELEASE } from "../app/visual-lab/photonic-skin-m4-1/m41-evaluator";
import { FIELD_PARAMETERS } from "../app/visual-lab/photonic-skin-ps04-m2/photonic-field";
import { COMPETENCE_BIT, paletteMaskForState } from "../app/visual-lab/photonic-skin-ps04-m2/photonic-palette";
import {
  IDLE_PRESETS,
  IDLE_PROFILE_POLICY,
  applyIdleNormal,
  applyIdlePoint,
  axisAngle,
  evaluateLiveIdle,
  identityTransform,
  invertIdlePoint,
  overlayEqualsIdentity,
  quatDot,
  shortestSlerp,
} from "../app/visual-lab/photonic-skin-ps04-m3/idle-motion";
import {
  FROZEN_PHASE_SEQUENCE,
  FROZEN_PHASE_WINDOWS,
  paletteProgressFromGeometry,
  residualWeightFromGeometry,
  samplePhaseAdapter,
} from "../app/visual-lab/photonic-skin-ps04-m3/phase-adapter";
import { PhotonicPaletteDriver } from "../app/visual-lab/photonic-skin-ps04-m3/palette-driver";
import { PhotonicMotionSession } from "../app/visual-lab/photonic-skin-ps04-m3/session";
import { compileLiveRetarget } from "../app/visual-lab/photonic-skin-ps04-m3/runtime";

const ROOT = process.cwd();
const m3Scene = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m3/PS04M3Scene.tsx"), "utf8");
const m2Scene = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m2/PS04M2Scene.tsx"), "utf8");

function vertexShader(source: string) {
  const match = source.match(/const vertexShader = `([\s\S]*?)`;/);
  assert.ok(match, "vertex shader must exist");
  return match[1];
}

function stripIdleOverlay(source: string) {
  return source
    .replace("uniform vec3 uIdleAnchor;\nuniform float uIdleScale;\nuniform vec4 uIdleQuat;\nuniform int uIdleEnabled;\n", "")
    .replace("  vec3 basePoint = center + local;\n  vec4 idleQuat = uIdleEnabled == 1 && length(uIdleQuat) > 0.000000001 ? normalize(uIdleQuat) : vec4(0.0, 0.0, 0.0, 1.0);\n  float idleScale = uIdleEnabled == 1 ? uIdleScale : 1.0;\n  vec3 idlePoint = uIdleAnchor + idleScale * quatRotate(idleQuat, basePoint - uIdleAnchor);\n  vec3 presented = (idlePoint + frameTranslate) * frameScale;\n", "  vec3 presented = (center + frameTranslate + local) * frameScale;\n")
    .replace("  vec3 surfaceNormal = normalize(quatRotate(idleQuat, quatRotate(orientation, aSurfaceNormal)));\n", "  vec3 surfaceNormal = normalize(quatRotate(orientation, aSurfaceNormal));\n");
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

test("PS-04.M3 frozen hashes and old routes remain exact", () => {
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
  const m2Manifest = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m2/manifest.json"), "utf8")) as { checkpointAggregates: { source: string }; sourceFiles: string[] };
  assert.equal(checkpointAggregate(m2Manifest.sourceFiles, "f9e4522"), m2Manifest.checkpointAggregates.source);
  assert.ok(readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-m4-1r/page.tsx"), "utf8").length > 0);
  assert.ok(readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m1/page.tsx"), "utf8").length > 0);
  assert.ok(readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m2/page.tsx"), "utf8").length > 0);
});

test("M3 vertex evaluator matches M2 after the idle overlay is stripped", () => {
  assert.equal(stripIdleOverlay(vertexShader(m3Scene)), vertexShader(m2Scene));
  const fieldLine = m3Scene.indexOf("vFieldScalar = dot((center - uFieldOrigin) / uFieldScale, uFieldDirection)");
  const idleLine = m3Scene.indexOf("vec3 idlePoint = uIdleAnchor + idleScale * quatRotate(idleQuat, basePoint - uIdleAnchor)");
  const presentedLine = m3Scene.indexOf("vec3 presented = (idlePoint + frameTranslate) * frameScale");
  assert.ok(fieldLine > 0 && fieldLine < idleLine && idleLine < presentedLine);
});

test("identity overlay is a no-op and inverse returns the frozen point", () => {
  const identity = identityTransform();
  const point = [0.31, -0.44, 0.18] as const;
  const normal = [0.0, 0.0, 1.0] as const;
  assert.ok(distance(applyIdlePoint(point, identity), point) < 1e-12);
  assert.ok(distance(applyIdleNormal(normal, identity), normal) < 1e-12);
  const live = evaluateLiveIdle({
    phases: { breath: 0.37, rotation: 0.41 },
    family: "single",
    profile: "desktop",
  });
  const moved = applyIdlePoint(point, live);
  const restored = invertIdlePoint(moved, live);
  assert.ok(distance(restored, point) < 1e-9);
  const n = applyIdleNormal(normal, live);
  assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-9);
});

test("uniform actor scale does not open gaps between a center and its local vertex", () => {
  const live = evaluateLiveIdle({
    phases: { breath: 0.25, rotation: 0 },
    family: "master",
    profile: "desktop",
    channel: "breathing",
  });
  const center = [0.2, 0.1, -0.05] as const;
  const local = [0.035, 0, 0] as const;
  const vertex = [center[0] + local[0], center[1] + local[1], center[2] + local[2]] as const;
  const c = applyIdlePoint(center, live);
  const v = applyIdlePoint(vertex, live);
  const gap = distance(v, c);
  assert.ok(Math.abs(gap - 0.035 * live.scale) < 1e-9);
});

test("MASTER turns a full revolution; object families only rock about Z-up", () => {
  assert.equal(IDLE_PRESETS.master.rotationMode, "turn");
  assert.ok(Math.abs(IDLE_PRESETS.master.rotationPeriodSeconds - 180) < 1e-12);
  const start = evaluateLiveIdle({ phases: { breath: 0, rotation: 0 }, family: "master", profile: "desktop", channel: "rotation" });
  const half = evaluateLiveIdle({ phases: { breath: 0, rotation: 0.5 }, family: "master", profile: "desktop", channel: "rotation" });
  assert.ok(overlayEqualsIdentity(start));
  assert.ok(Math.abs(half.angleRadians - Math.PI) < 1e-9);
  for (const family of ["single", "focus", "gather", "drive", "brand-wide"] as const) {
    const extreme = evaluateLiveIdle({ phases: { breath: 0, rotation: 0.25 }, family, profile: "desktop", channel: "rotation" });
    assert.ok(Math.abs(extreme.angleRadians) <= IDLE_PRESETS[family].rotationAmplitudeRadians + 1e-9);
    assert.ok(Math.abs(extreme.angleRadians) < 0.1);
  }
  const three = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const ours = axisAngle([0, 0, 1], Math.PI / 2);
  assert.ok(distance(ours, [three.x, three.y, three.z, three.w]) < 1e-9);
  const flipped = shortestSlerp(ours, [-ours[0], -ours[1], -ours[2], -ours[3]], 0.5);
  assert.ok(Math.abs(Math.abs(quatDot(flipped, ours)) - 1) < 1e-9);
});

test("180 keeps reduced breath without rotation; 96 disables decorative idle", () => {
  assert.equal(IDLE_PROFILE_POLICY.silhouette180.rotationScale, 0);
  assert.equal(IDLE_PROFILE_POLICY.silhouette96.enabled, false);
  const at180 = evaluateLiveIdle({ phases: { breath: 0.25, rotation: 0.25 }, family: "drive", profile: "silhouette180" });
  assert.ok(Math.abs(at180.angleRadians) < 1e-12);
  assert.ok(at180.scale !== 1);
  const at96 = evaluateLiveIdle({ phases: { breath: 0.25, rotation: 0.25 }, family: "drive", profile: "silhouette96" });
  assert.ok(overlayEqualsIdentity(at96));
});

test("phase adapter uses frozen M4 windows and does not divide by zero", () => {
  assert.deepEqual([...FROZEN_PHASE_SEQUENCE], [...DIRECTED_PLASTIC_RELEASE.phasePolicy.sequence]);
  assert.deepEqual(FROZEN_PHASE_WINDOWS, DIRECTED_PLASTIC_RELEASE.phasePolicy.windows);
  assert.equal(paletteProgressFromGeometry(0), 0);
  assert.equal(paletteProgressFromGeometry(0.10), 0);
  assert.equal(paletteProgressFromGeometry(FROZEN_PHASE_WINDOWS.regroup[0] - 0.001), 0);
  assert.equal(paletteProgressFromGeometry(FROZEN_PHASE_WINDOWS.reveal[0]), 1);
  assert.equal(residualWeightFromGeometry(0), 1);
  assert.ok(residualWeightFromGeometry(FROZEN_PHASE_WINDOWS.reveal[0]) < 1e-12);
  const zero = samplePhaseAdapter({ program: null, progress: 0.4, playingTransition: true, reducedMotion: true });
  assert.equal(zero.paletteProgress, 1);
  assert.equal(zero.residualWeight, 0);
  assert.equal(zero.zeroDuration, true);
});

test("geometry-linked palette does not run the free 0.8s timer", () => {
  const driver = new PhotonicPaletteDriver(COMPETENCE_BIT.content, 14);
  driver.setMask(COMPETENCE_BIT.design, { mode: "geometry-linked" });
  driver.advance(0.8);
  assert.equal(driver.snapshot().paletteProgress, 0);
  driver.setGeometryLinkedProgress(0.4);
  assert.ok(Math.abs(driver.snapshot().paletteProgress - 0.4) < 1e-12);
  driver.setGeometryLinkedProgress(1);
  assert.equal(driver.snapshot().transient, false);
  const free = new PhotonicPaletteDriver(COMPETENCE_BIT.content, 14);
  free.setMask(COMPETENCE_BIT.design, { mode: "free" });
  for (let step = 0; step < 10; step += 1) free.advance(0.1);
  assert.equal(free.snapshot().paletteProgress, 1);
  assert.equal(free.setMask(COMPETENCE_BIT.design), false);
});

test("session is FPS-independent, ignores duplicate ticks, and pause freezes every clock", () => {
  const session = new PhotonicMotionSession({ overlayMode: "m3-idle" });
  session.tick(1 / 30);
  const a = session.snapshot().phases;
  const clone = new PhotonicMotionSession({ overlayMode: "m3-idle" });
  for (let i = 0; i < 2; i += 1) clone.tick(1 / 60);
  const b = clone.snapshot().phases;
  assert.ok(Math.abs(a.breath - b.breath) < 1e-9);
  assert.ok(Math.abs(a.rotation - b.rotation) < 1e-9);
  session.tick(0.05, 7);
  const before = session.snapshot().phases.breath;
  session.tick(0.05, 7);
  assert.equal(session.snapshot().phases.breath, before);
  const paused = session.snapshot().phases.color;
  session.setPauseAll(true);
  session.tick(0.2, 8);
  assert.equal(session.snapshot().phases.color, paused);
  assert.equal(session.snapshot().phases.breath, before);
});

test("handoff captures displayed overlay and latest request wins a 20-hit stress", () => {
  const master = decodedState("master-neutral");
  const event = decodedState("single-event");
  const design = decodedState("single-design");
  const program = compileTransition(master, event, {
    schemaVersion: "1.0.0",
    sourceStateId: master.entry.stateId,
    targetStateId: event.entry.stateId,
    identitySpaceVersion: "ps03m3-identity-v1",
    motionProfileId: "directed-plastic-release",
    triggerMode: "qa",
    viewportProfile: "desktop",
    deterministicSeed: 0x50533034,
  });
  const session = new PhotonicMotionSession({ overlayMode: "m3-combined" });
  session.bootstrapSettled(master, program);
  session.seekIdlePhases(0.2, 179 / 360);
  const before = session.displayedTransform();
  const revision = session.beginRequest(event.entry.stateId);
  const captured = session.captureJoint();
  assert.equal(captured.m4Snapshot, null, "settled capture must not evaluate 16384 live-source IDs");
  assert.ok(distance(captured.overlay.quaternion, before.quaternion) < 1e-12);
  assert.ok(Math.abs(captured.overlay.scale - before.scale) < 1e-12);
  session.commitTransition({ revision, source: master, target: event, program, captured, play: true });
  const first = session.displayedTransform();
  assert.ok(distance(first.quaternion, before.quaternion) < 1e-6, "first transition frame must keep displayed orientation");
  const ids = [event, design, master];
  let last = event.entry.stateId;
  const m3Manifest = JSON.parse(readFileSync(path.join(ROOT, "public/photonic-skin/ps-03-m3-1r/manifest.json"), "utf8")) as M3Manifest;
  for (let index = 0; index < 20; index += 1) {
    const next = ids[index % ids.length];
    const nextRevision = session.beginRequest(next.entry.stateId);
    const shot = session.captureJoint();
    const currentSource = session.getSource() ?? master;
    const { liveSource, program: nextProgram } = compileLiveRetarget(shot, currentSource, next, m3Manifest, {
      reducedMotion: false,
      trigger: "qa",
      viewport: "desktop",
    });
    session.commitTransition({
      revision: nextRevision,
      source: liveSource,
      target: next,
      program: nextProgram,
      captured: shot,
      play: true,
    });
    last = next.entry.stateId;
  }
  assert.equal(session.snapshot().requestedStateId, last);
  assert.equal(session.snapshot().requestRevision, 21);
  const stale = session.beginRequest("single-content");
  session.beginRequest(design.entry.stateId);
  assert.equal(session.isCurrent(stale), false);
});

test("reduced motion jumps to the target and disables idle", () => {
  const session = new PhotonicMotionSession({ overlayMode: "m3-combined", reducedMotion: true });
  assert.ok(overlayEqualsIdentity(session.displayedTransform()));
  session.tick(1);
  assert.ok(overlayEqualsIdentity(session.displayedTransform()));
  assert.equal(session.snapshot().shouldAnimate, false);
});

test("M3 keeps one RawShaderMaterial path and does not add palette textures", () => {
  assert.equal((m3Scene.match(/new THREE\.RawShaderMaterial/g) ?? []).length, 1);
  assert.equal((m3Scene.match(/<instancedMesh/g) ?? []).length, 1);
  assert.match(m3Scene, /uniform vec4 uPaletteSourceLut\[\$\{FIELD_LUT_SIZE\}\]/);
  assert.doesNotMatch(m3Scene, /sampler.*Palette|paletteTexture/);
  assert.match(m3Scene, /lastActorDrawCalls/);
});

test("field remains sampled on center_base before idle", () => {
  const shader = vertexShader(m3Scene);
  const field = shader.indexOf("vFieldScalar = dot((center - uFieldOrigin) / uFieldScale, uFieldDirection)");
  const idle = shader.indexOf("idlePoint");
  assert.ok(field > 0 && field < idle);
  assert.doesNotMatch(shader, /vFieldScalar = dot\(\(idlePoint/);
});

test("same-mask FOCUS/GATHER/DRIVE does not force a palette fade", () => {
  const gather = decodedState("complex-gather-content-design");
  const drive = decodedState("complex-drive-content-design");
  assert.equal(paletteMaskForState(gather.entry), paletteMaskForState(drive.entry));
  const driver = new PhotonicPaletteDriver(paletteMaskForState(gather.entry), FIELD_PARAMETERS.periodsSeconds.complex);
  assert.equal(driver.setMask(paletteMaskForState(drive.entry), { mode: "geometry-linked" }), false);
});

test("phase adapter covers all 35 frozen programs including short/zero duration", () => {
  const m41 = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-03-m4-1/exports/ps03m41-manifest.json"), "utf8")) as {
    programs: Array<{ metadataPath: string; programId: string }>;
  };
  assert.equal(m41.programs.length, 35);
  for (const program of m41.programs) {
    const metadata = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-03-m4-1", program.metadataPath), "utf8")) as {
      header: { phasePolicy: { windows: typeof FROZEN_PHASE_WINDOWS }; reducedMotion?: boolean; durationMs?: number };
    };
    const windows = metadata.header.phasePolicy.windows;
    assert.equal(paletteProgressFromGeometry(0, windows), 0);
    assert.equal(paletteProgressFromGeometry(windows.regroup[0], windows), 0);
    assert.ok(paletteProgressFromGeometry((windows.regroup[0] + windows.reveal[0]) / 2, windows) > 0);
    assert.equal(paletteProgressFromGeometry(windows.reveal[0], windows), 1);
    assert.equal(paletteProgressFromGeometry(1, windows), 1);
    assert.equal(residualWeightFromGeometry(0, windows), 1);
    assert.ok(residualWeightFromGeometry(windows.reveal[0], windows) < 1e-12);
    const zero = samplePhaseAdapter({ program: null, progress: 0.5, playingTransition: true, reducedMotion: false });
    assert.equal(zero.zeroDuration, true);
    assert.equal(zero.paletteProgress, 1);
  }
});

test("handoff is C0; C2 residual fade is not C1 at the click", () => {
  const master = decodedState("master-neutral");
  const event = decodedState("single-event");
  const program = compileTransition(master, event, {
    schemaVersion: "1.0.0",
    sourceStateId: master.entry.stateId,
    targetStateId: event.entry.stateId,
    identitySpaceVersion: "ps03m3-identity-v1",
    motionProfileId: "directed-plastic-release",
    triggerMode: "qa",
    viewportProfile: "desktop",
    deterministicSeed: 0x50533034,
  });
  const session = new PhotonicMotionSession({ overlayMode: "m3-combined" });
  session.bootstrapSettled(master, program);
  session.seekIdlePhases(0.25, 179 / 360);
  const displayed = session.displayedTransform();
  const revision = session.beginRequest(event.entry.stateId);
  const captured = session.captureJoint();
  session.commitTransition({ revision, source: master, target: event, program, captured, play: false });
  const epsilon = 1e-4;
  const at0 = session.displayedTransform();
  session.seekGeometryProgress(epsilon);
  const after = session.displayedTransform();
  session.seekGeometryProgress(0);
  const again = session.displayedTransform();
  assert.ok(distance(at0.quaternion, displayed.quaternion) < 1e-6);
  assert.ok(Math.abs(at0.scale - displayed.scale) < 1e-6);
  assert.ok(distance(again.quaternion, at0.quaternion) < 1e-9);
  const angleRate = Math.abs(after.angleRadians - at0.angleRadians) / epsilon;
  assert.ok(angleRate < 2, `C2 residual should start near-zero derivative, got ${angleRate}`);
});

test("palette driver keeps 32 LUT samples across 127 masks and interrupt chains", () => {
  const driver = new PhotonicPaletteDriver(COMPETENCE_BIT.content, 14);
  for (let mask = 1; mask <= 127; mask += 1) {
    driver.setMask(mask, { mode: "geometry-linked" });
    driver.setGeometryLinkedProgress(0.37);
    const shot = driver.snapshot();
    assert.equal(shot.sourceLut.length, 32);
    assert.equal(shot.palette.mask, mask);
    assert.ok((shot.transientMask & mask) === mask);
  }
  driver.setGeometryLinkedProgress(1);
  const settled = driver.snapshot();
  assert.equal(settled.paletteProgress, 1);
  assert.equal(settled.transient, false);
  assert.equal(settled.transientMask, 127);
  assert.equal(settled.sourceLut.length, 32);
});

test("long session wrap stays in [0,1) and hidden time does not catch up", () => {
  const session = new PhotonicMotionSession({ overlayMode: "m3-idle" });
  for (let step = 0; step < 2000; step += 1) session.tick(0.1);
  const phases = session.snapshot().phases;
  assert.ok(phases.breath >= 0 && phases.breath < 1);
  assert.ok(phases.rotation >= 0 && phases.rotation < 1);
  assert.ok(phases.color >= 0 && phases.color < 1);
  const frozen = session.snapshot().phases.breath;
  session.setHidden(true);
  session.tick(5, 99);
  assert.equal(session.snapshot().phases.breath, frozen);
});
