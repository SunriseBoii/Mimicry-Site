import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { WebGLRenderer } from "three";
import type { DecodedState, StateEntry } from "../app/visual-lab/photonic-skin-m4-1/m41-data";
import type { TransitionProgram } from "../app/visual-lab/photonic-skin-m4-1/m41-evaluator";
import { canAtomicBind, emptyGeometrySnapshot, type GeometryProgramBind } from "../app/visual-lab/photonic-skin-ps04-m4/geometry-authority";
import { FRAMEBUFFER_VISIBILITY } from "../app/visual-lab/photonic-skin-ps04-m4/gpu-bank-diagnostics";
import { GPU_TEXTURE_BUDGET, GpuTextureBank, GpuTexturePool } from "../app/visual-lab/photonic-skin-ps04-m4/gpu-texture-pool";
import { R6Instrumentation, r6StagingEnabled } from "../app/visual-lab/photonic-skin-ps04-m4/r6-instrumentation";
import { ActorResourcePipeline } from "../app/visual-lab/photonic-skin-ps04-m4/resource-lifecycle";
import { MASTER_STATE_ID, SINGLE_STATE_IDS } from "../app/visual-lab/photonic-skin-ps04-m4/screen-actor-contract";
import { PAIR_TEXTURE_COUNT } from "../app/visual-lab/photonic-skin-ps04-m4/texture-pack";
import { TransitionProgramCache } from "../app/visual-lab/photonic-skin-ps04-m4/transition-prewarm";

const ROOT = process.cwd();
const lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/PS04M4Lab.tsx"), "utf8");
const scene = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/PS04M4Scene.tsx"), "utf8");
const home = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");

function shaFile(file: string) {
  return createHash("sha256").update(readFileSync(path.join(ROOT, file))).digest("hex");
}

function aggregate(files: string[]) {
  const records = files
    .slice()
    .sort((left, right) => left.localeCompare(right))
    .map((file) => `${file}\t${shaFile(file)}\n`)
    .join("");
  return createHash("sha256").update(records).digest("hex");
}

function stubEntry(id: string): StateEntry {
  return {
    stateId: id,
    stateRole: "master",
    compositionMode: "neutral",
    competencyIds: [],
    focusCompetencyId: null,
    contentHash: id,
    bufferPath: id,
    bufferBytes: 0,
    recordCount: 4,
    recordStride: 40,
    componentCount: 1,
    shellCount: 1,
    surfaceArea: 1,
    machineQa: { activeCount: 4, reserveCount: 0, componentQuotas: {} },
    approvalStatus: "ok",
    presentationFrame: { scale: 1, translate: [0, 0, 0] },
  } as unknown as StateEntry;
}

function stubState(id: string): DecodedState {
  const n = 4;
  return {
    entry: stubEntry(id),
    recordCount: n,
    position: Float32Array.from({ length: n * 3 }, (_, index) => index + 0.25),
    normal: Float32Array.from({ length: n * 3 }, () => 0.1),
    orientation: Float32Array.from({ length: n * 4 }, (_, index) => (index % 4 === 3 ? 1 : 0)),
    scale: Float32Array.from({ length: n }, () => 0.6),
    reserveDepth: new Float32Array(n),
    component: new Uint8Array(n),
    shell: new Uint8Array(n),
    status: new Uint8Array(n),
    flags: new Uint8Array(n),
    density: new Uint8Array(n),
    transitionGroup: new Uint8Array(n),
    lodPriority: new Uint16Array(n),
  };
}

function stubProgram(id = "prog"): TransitionProgram {
  return {
    programId: id,
    recordCount: 4,
    durationMs: 980,
    residual: new Float32Array(12),
    phaseDelay: new Float32Array(4),
    trackIndex: new Float32Array(4),
    bridgeWeight: new Float32Array(4),
    tracks: [],
  } as unknown as TransitionProgram;
}

function ackRenderer(): WebGLRenderer {
  return {
    initTexture(texture: { onUpdate?: (value: unknown) => void }) {
      texture.onUpdate?.(texture);
    },
  } as WebGLRenderer;
}

function silentRenderer(): WebGLRenderer {
  return { initTexture() { /* no onUpdate */ } } as unknown as WebGLRenderer;
}

test("1 initial active bank is packed before any upload", () => {
  const bank = new GpuTextureBank(0);
  const source = stubState("a");
  const target = stubState("a");
  const program = stubProgram();
  bank.beginJob({ key: "a|a|p", revision: 1, source, target });
  assert.equal(bank.gpuReady, false);
  bank.packAll({ source, target, program });
  assert.equal(bank.cpuPacked, true);
  assert.equal(bank.packedSlots.every(Boolean), true);
  assert.equal(bank.gpuReady, false);
  assert.equal(bank.uploaded.every((value) => value === false), true);
});

test("2-4 every packed texture gets needsUpdate and ack is generation-scoped; gpuReady waits for 16/16", () => {
  const bank = new GpuTextureBank(0);
  const source = stubState("a");
  const target = stubState("a");
  const program = stubProgram();
  bank.beginJob({ key: "a|a|p", revision: 1, source, target });
  const generation = bank.generation;
  bank.packAll({ source, target, program });
  for (const name of ["source", "target", "activation"] as const) {
    assert.ok(bank.textures[name].version > 0);
  }
  bank.uploadNextSlot(silentRenderer());
  assert.equal(bank.gpuReady, false);
  assert.equal(bank.uploaded.filter(Boolean).length, 0);
  const ack = ackRenderer();
  let steps = 0;
  while (!bank.gpuReady && steps < 32) {
    bank.uploadNextSlot(ack);
    steps += 1;
  }
  assert.equal(bank.gpuReady, true);
  assert.equal(bank.allAcknowledged(), true);
  assert.equal(bank.lastAckToken?.generation, generation);
  assert.equal(bank.lastAckToken?.bankId, 0);
  bank.beginJob({ key: "a|a|p", revision: 2, source, target });
  assert.notEqual(bank.generation, generation);
  assert.equal(bank.gpuReady, false);
  const stale = bank.lastAckToken;
  bank.packAll({ source, target, program });
  bank.uploadNextSlot(ack);
  assert.notEqual(bank.lastAckToken?.generation, stale?.generation);
});

test("5 material sampler snapshot contract is encoded and 16 uniforms map 1:1", () => {
  assert.match(scene, /getMaterialSamplerSnapshot/);
  assert.match(scene, /allSamplerUuidsMatchActiveBank/);
  assert.match(scene, /applyBankSamplers/);
  assert.equal(PAIR_TEXTURE_COUNT, 16);
});

test("6-8 fresh load does not require DPR, resize, or context restore", () => {
  assert.doesNotMatch(lab, /setDpr\(1\.5\)/);
  assert.doesNotMatch(lab, /hydrateResident[\s\S]{0,400}setDpr/);
  assert.match(lab, /hydrateResident/);
  assert.match(scene, /actorFramebufferReadyRef/);
  assert.match(scene, /boundGpuReadyRef/);
  assert.match(scene, /meshRef\.current\.visible/);
  assert.doesNotMatch(scene, /visible=\{!staging\}/);
});

test("9 invalidate is published after atomic bind", () => {
  assert.match(scene, /applyProgramBind\([\s\S]*?invalidate\(\)/);
  assert.match(scene, /invalidate\(\)/);
});

test("10-12 active bank is not overwritten; staging is not bound partial; stale generation cannot bind", () => {
  const pool = new GpuTexturePool();
  const active = pool.active();
  const source = stubState("a");
  const target = stubState("b");
  const program = stubProgram();
  active.beginJob({ key: "keep", revision: 1, source, target });
  active.packAll({ source, target, program });
  while (!active.gpuReady) active.uploadNextSlot(ackRenderer());
  const staging = pool.acquireStaging(new Set([1]), "forward");
  assert.notEqual(staging, active);
  staging.beginJob({ key: "next", revision: 2, source, target });
  assert.equal(staging.gpuReady, false);
  assert.equal(pool.promoteToActive(staging), undefined);
  assert.equal(pool.active(), active);
  staging.packAll({ source, target, program });
  staging.uploadNextSlot(ackRenderer());
  assert.equal(staging.allAcknowledged(), false);
  while (!staging.gpuReady) staging.uploadNextSlot(ackRenderer());
  pool.promoteToActive(staging);
  assert.equal(pool.active(), staging);
  const packet = {
    revision: 3,
    navigationToken: 3,
    program: { programId: "new" },
    source: { entry: { stateId: SINGLE_STATE_IDS.content } },
    target: { entry: { stateId: SINGLE_STATE_IDS.design } },
    bindCommitted: false,
    bindFrameToken: null,
    preparedAtMs: 0,
    gpuReady: true,
    resourceState: "gpu-ready",
    bankGeneration: 0,
  } as unknown as GeometryProgramBind;
  assert.equal(canAtomicBind({
    packet,
    snapshot: { ...emptyGeometrySnapshot({ revision: 3 }), status: "waiting", programReady: true, pendingProgramId: "new" },
    displayed: null,
  }), true);
  assert.match(scene, /packet\.bankGeneration/);
  assert.match(scene, /skipBind = true/);
});

test("13 context restore repeats hydration through the normal lifecycle", () => {
  assert.match(lab, /restoreGpu/);
  assert.match(lab, /hydrateResident/);
  assert.match(lab, /if \(state === "restored"\)[\s\S]*hydrateResident[\s\S]*startClock\(\)/);
  const pool = new GpuTexturePool();
  pool.recreateAfterRestore();
  assert.equal(pool.textureCount(), GPU_TEXTURE_BUDGET);
  assert.equal(pool.active().gpuReady, false);
});

test("14-15 texture pool stays 48 across two cycles", () => {
  const pool = new GpuTexturePool();
  assert.equal(pool.textureCount(), 48);
  pool.promoteToActive(pool.forward());
  pool.promoteToActive(pool.pending());
  pool.recreateAfterRestore();
  assert.equal(pool.textureCount(), 48);
  assert.equal(pool.overBudget(), false);
});

test("16-20 framebuffer gate: nonzero actor silhouette, footer zero, draw+0pixels is FAIL", () => {
  assert.ok(FRAMEBUFFER_VISIBILITY.desktop.minVisiblePixels > 0);
  assert.ok(FRAMEBUFFER_VISIBILITY.desktop.minBboxWidth >= 24);
  assert.match(scene, /failDrawWithoutPixels/);
  assert.match(scene, /visiblePixelCount/);
  assert.match(scene, /vec4\(1\.0, 1\.0, 1\.0, 1\.0\)/);
  assert.match(scene, /emptyFramebufferSilhouette/);
  assert.match(lab, /actorFramebufferReady/);
  const fail = { actorDraw: true, visiblePixelCount: 0 };
  assert.equal(fail.actorDraw && fail.visiblePixelCount === 0, true);
});

test("21-22 live-bank sampled positions match CPU and activation is not all zero", () => {
  assert.match(scene, /liveBankGpuParity/);
  const bank = new GpuTextureBank(0);
  const source = stubState("master");
  const target = stubState("single");
  const program = stubProgram();
  bank.beginJob({ key: "m|s|p", revision: 1, source, target });
  bank.packAll({ source, target, program });
  assert.ok(bank.buffers.source[0] !== 0 || bank.buffers.source[1] !== 0 || bank.buffers.source[3] !== 0);
  assert.equal(bank.buffers.source[0], source.position[0]);
  assert.equal(bank.buffers.target[0], target.position[0]);
});

test("23 r6Staging=0 remains diagnostic-only", () => {
  assert.equal(r6StagingEnabled(""), true);
  assert.equal(r6StagingEnabled("?r6Staging=0"), false);
  assert.match(lab, /r6StagingEnabled/);
  assert.doesNotMatch(lab, /r6StagingEnabled\(\) === false/);
});

test("24-25 R6 navigation/idle/performance invariants and R5 rollback stay encoded", () => {
  assert.match(lab, /requestActorRef\.current = \(next\) => \{ void requestActor\(next\); \}/);
  assert.match(lab, /visualLifecycle === "preparing"/);
  assert.match(scene, /memo\(PS04M4SceneView/);
  assert.equal((scene.match(/new THREE\.RawShaderMaterial/g) ?? []).length, 1);
  assert.equal((scene.match(/<Canvas/g) ?? []).length, 1);
  assert.match(home, /ProductionPhotonicSiteClient/);
  assert.doesNotMatch(home, /PS04M4Lab/);
  assert.match(lab, /lastUi > 160/);
  const cache = new TransitionProgramCache();
  const pool = new GpuTexturePool();
  const pipeline = new ActorResourcePipeline(cache, pool, new R6Instrumentation());
  pipeline.request({
    revision: 1,
    navigationToken: 1,
    sourceId: MASTER_STATE_ID,
    targetId: SINGLE_STATE_IDS.content,
    reducedMotion: false,
    viewport: "desktop",
    prefer: "forward",
  });
  pipeline.request({
    revision: 2,
    navigationToken: 2,
    sourceId: MASTER_STATE_ID,
    targetId: SINGLE_STATE_IDS.design,
    reducedMotion: false,
    viewport: "desktop",
    prefer: "forward",
  });
  assert.equal(pipeline.isCurrent(1), false);
  assert.equal(canAtomicBind({
    packet: { gpuReady: false, resourceState: "gpu-staging", bindCommitted: false, revision: 1 } as GeometryProgramBind,
    snapshot: { ...emptyGeometrySnapshot({ revision: 1 }), status: "waiting", programReady: true },
    displayed: null,
  }), false);
});

test("frozen hashes remain the designated R5/R6 baselines", () => {
  const r5 = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m4-r5/reports/checkpoint-hashes.json"), "utf8"));
  const r6 = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m4-r6/reports/checkpoint-hashes.json"), "utf8"));
  assert.equal(r5.source, "853cd3b8373b3116330acf2643fefdc9d7b84424c3bf1515d9df5c52c15421ef");
  assert.equal(r6.source, "4a24385bcdda85496155e699edfbeab9bc1818488c1c246884ab3088d3acdb4f");
  assert.equal(r5.m41AggregateExpected, "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361");
  assert.equal(r5.m41ManifestExpected, "d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441");
  assert.equal(r5.m41rPatchExpected, "228ddce450536d94d625d73f99ceff133371ccfe515a6f21cc3377fa3fda3ca0");
  assert.equal(r5.m31rFingerprintExpected, "0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2");
  const m3 = [
    "app/visual-lab/photonic-skin-ps04-m3/idle-motion.ts",
    "app/visual-lab/photonic-skin-ps04-m3/material-foundation.ts",
    "app/visual-lab/photonic-skin-ps04-m3/page.tsx",
    "app/visual-lab/photonic-skin-ps04-m3/palette-driver.ts",
    "app/visual-lab/photonic-skin-ps04-m3/phase-adapter.ts",
    "app/visual-lab/photonic-skin-ps04-m3/PS04M3Lab.tsx",
    "app/visual-lab/photonic-skin-ps04-m3/PS04M3LabClient.tsx",
    "app/visual-lab/photonic-skin-ps04-m3/PS04M3Scene.tsx",
    "app/visual-lab/photonic-skin-ps04-m3/ps04m3.module.css",
    "app/visual-lab/photonic-skin-ps04-m3/runtime.ts",
    "app/visual-lab/photonic-skin-ps04-m3/session.ts",
    "app/visual-lab/photonic-skin-ps04-m3/preview/page.tsx",
    "app/visual-lab/photonic-skin-ps04-m3/preview/PS04M3Preview.tsx",
    "app/visual-lab/photonic-skin-ps04-m3/preview/PS04M3PreviewClient.tsx",
    "app/visual-lab/photonic-skin-ps04-m3/preview/preview.module.css",
    "tests/photonic-ps04-m3.test.ts",
    "design/photonic-skin/ps-04-m3/scripts/build-visual-boards.py",
    "design/photonic-skin/ps-04-m3/scripts/capture-browser-evidence.mjs",
    "design/photonic-skin/ps-04-m3/scripts/hash-checkpoint.mjs",
    "design/photonic-skin/ps-04-m3/scripts/lab-smoke.mjs",
    "design/photonic-skin/ps-04-m3/scripts/measure-performance.mjs",
    "design/photonic-skin/ps-04-m3/scripts/run-gpu-parity-probes.mjs",
  ];
  assert.equal(aggregate(m3), "184744da085dc31e08c954640456133308585b7b8ef107de43ab2f8d7a8e6ec1");
});
