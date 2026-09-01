import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ALL_COMPETENCE_MASK, COMPETENCE_BIT } from "../app/visual-lab/photonic-skin-ps04-m2/photonic-palette";
import { FROZEN_PHASE_WINDOWS, samplePhaseAdapter } from "../app/visual-lab/photonic-skin-ps04-m3/phase-adapter";
import {
  CASES_CONTENT,
  hasCenterDwell,
  paletteLeadsGeometry,
  paletteProgressFromGeometryM5,
  positionProgressFromGeometryM5,
} from "../app/visual-lab/photonic-skin-ps04-m5/m5-choreography";
import {
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
  indexStates,
  resolveScreenActorContract,
  type ScreenActorContract,
} from "../app/visual-lab/photonic-skin-ps04-m5/screen-actor-contract";
import {
  ActorTransitionCoordinator,
  type DisplayedPlacement,
} from "../app/visual-lab/photonic-skin-ps04-m5/transition-coordinator";
import { parseSandboxQuery } from "../app/visual-lab/photonic-skin-ps04-m5/event-sandbox/sandbox-query";

const ROOT = process.cwd();
const STRIDE = 40;
const N = 16384;
const PREFIXES = [512, 1024, 2048, 4096, 8192, 12288, 16384];
const FROZEN_EVENT = "b14a3b2f8571e3e7d39be074aecbdeb6dd4ca51097c6433db25b622c3394a933";
const M51_SOURCE = "8ee1cc11289be4b277eccf5a9b578029cfb1625d34eb6dbd0bbc010a768cc556";
const PARTS = ["stage", "figure-centre", "figure-left", "figure-right"] as const;
const COMPONENT_PART = [0, 0, 2, 1, 3] as const;

const m51Hashes = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-1/reports/checkpoint-hashes.json"), "utf8"));
const r6r1Hashes = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m4-r6-r1/reports/checkpoint-hashes.json"), "utf8"));
const home = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
const m51Lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/PS04M5Lab.tsx"), "utf8");
const m51Page = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/page.tsx"), "utf8");
const scene = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/PS04M5Scene.tsx"), "utf8");
const sandboxLab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/event-sandbox/EventSandboxLab.tsx"), "utf8");
const palette = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m2/photonic-palette.ts"), "utf8");
const frozenEvent = readFileSync(path.join(ROOT, "public/photonic-skin/ps-03-m3-1r/states/single-event.state.bin"));

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

function variantPath(name: string) {
  return path.join(ROOT, "design/photonic-skin/ps-04-m5-2/variants", name, "single-event.state.bin");
}

function loadBin(name: string) {
  const buf = readFileSync(variantPath(name));
  assert.equal(buf.byteLength, N * STRIDE);
  const position = new Float32Array(N * 3);
  const component = new Uint8Array(N);
  const status = new Uint8Array(N);
  const lod = new Uint16Array(N);
  for (let id = 0; id < N; id += 1) {
    const offset = id * STRIDE;
    position[id * 3] = buf.readFloatLE(offset);
    position[id * 3 + 1] = buf.readFloatLE(offset + 4);
    position[id * 3 + 2] = buf.readFloatLE(offset + 8);
    component[id] = buf[offset + 30];
    status[id] = buf[offset + 32];
    lod[id] = buf.readUInt16LE(offset + 36);
  }
  return { buf, position, component, status, lod, hash: createHash("sha256").update(buf).digest("hex") };
}

function rotateZ(position: Float32Array, degrees: number) {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const out = new Float32Array(position.length);
  for (let id = 0; id < N; id += 1) {
    const x = position[id * 3];
    const y = position[id * 3 + 1];
    const z = position[id * 3 + 2];
    out[id * 3] = cosine * x - sine * y;
    out[id * 3 + 1] = sine * x + cosine * y;
    out[id * 3 + 2] = z;
  }
  return out;
}

function maxAbs(left: Float32Array, right: Float32Array) {
  let max = 0;
  for (let index = 0; index < left.length; index += 1) {
    max = Math.max(max, Math.abs(left[index] - right[index]));
  }
  return max;
}

function partCounts(bin: ReturnType<typeof loadBin>, prefix = N) {
  const counts = { stage: 0, "figure-centre": 0, "figure-left": 0, "figure-right": 0 };
  for (let id = 0; id < prefix; id += 1) {
    if (bin.status[id] !== 0) continue;
    const part = PARTS[COMPONENT_PART[bin.component[id]]];
    counts[part] += 1;
  }
  return counts;
}

function contract(partial: Partial<ScreenActorContract> = {}): ScreenActorContract {
  return {
    nodeId: "01",
    hostNodeId: "01",
    family: "MASTER",
    requestedFamily: "MASTER",
    resolvedGeometryId: MASTER_STATE_ID,
    paletteMask: ALL_COMPETENCE_MASK,
    slot: "right",
    fitProfile: "master",
    resolution: "exact",
    applyPaletteOverride: false,
    reason: "test",
    ...partial,
  };
}

function displayed(partial: Partial<DisplayedPlacement> = {}): DisplayedPlacement {
  return {
    slot: "right",
    fit: 1,
    fitProfile: "master",
    paletteMask: ALL_COMPETENCE_MASK,
    paletteProgress: 1,
    geometryId: MASTER_STATE_ID,
    nodeId: "01",
    ...partial,
  };
}

function single(nodeId: "05.2" | "05.3" | "05.4", competency: "design" | "event" | "games"): ScreenActorContract {
  return contract({
    nodeId,
    hostNodeId: nodeId,
    family: "SINGLE",
    requestedFamily: "SINGLE",
    resolvedGeometryId: SINGLE_STATE_IDS[competency],
    paletteMask: COMPETENCE_BIT[competency],
    slot: "left",
    fitProfile: "single",
  });
}

test("M5.2 baseline endpoint is the frozen SINGLE Event, byte-identical", () => {
  const baseline = loadBin("baseline");
  assert.equal(baseline.hash, FROZEN_EVENT);
  assert.equal(createHash("sha256").update(frozenEvent).digest("hex"), FROZEN_EVENT);
  assert.equal(Buffer.compare(baseline.buf, frozenEvent), 0);
  assert.equal(baseline.buf.byteLength, N * STRIDE);
});

test("M5.2 EVENT_A is a proven +180° Z rigid rotation and is invertible", () => {
  const baseline = loadBin("baseline");
  const rotated = loadBin("a");
  const expected = rotateZ(baseline.position, 180);
  assert.ok(maxAbs(rotated.position, expected) < 1e-5, "closed-form rotation");
  const inverse = rotateZ(rotated.position, -180);
  assert.ok(maxAbs(inverse, baseline.position) < 1e-5, "inverse rotation");
  let pairwise = 0;
  for (let i = 0; i < 64; i += 1) {
    for (let j = i + 1; j < 64; j += 1) {
      const dx = baseline.position[i * 3] - baseline.position[j * 3];
      const dy = baseline.position[i * 3 + 1] - baseline.position[j * 3 + 1];
      const dz = baseline.position[i * 3 + 2] - baseline.position[j * 3 + 2];
      const ex = rotated.position[i * 3] - rotated.position[j * 3];
      const ey = rotated.position[i * 3 + 1] - rotated.position[j * 3 + 1];
      const ez = rotated.position[i * 3 + 2] - rotated.position[j * 3 + 2];
      pairwise = Math.max(pairwise, Math.abs(Math.hypot(dx, dy, dz) - Math.hypot(ex, ey, ez)));
    }
  }
  assert.ok(pairwise < 1e-5, `pairwise ${pairwise}`);
  assert.deepEqual([...rotated.lod], [...baseline.lod]);
  assert.deepEqual([...rotated.component], [...baseline.component]);
});

test("M5.2 variants share N, ID domain, finite positions, and strict LOD prefixes", () => {
  for (const name of ["baseline", "a", "b", "c"] as const) {
    const bin = loadBin(name);
    assert.equal(bin.lod.length, N);
    const seen = new Set<number>();
    for (let id = 0; id < N; id += 1) {
      assert.equal(bin.lod[id], id);
      assert.ok(Number.isFinite(bin.position[id * 3]));
      assert.ok(Number.isFinite(bin.position[id * 3 + 1]));
      assert.ok(Number.isFinite(bin.position[id * 3 + 2]));
      seen.add(bin.lod[id]);
    }
    assert.equal(seen.size, N);
    const publicCopy = readFileSync(path.join(ROOT, "public/photonic-skin/ps-04-m5-2/variants", name, "single-event.state.bin"));
    assert.equal(createHash("sha256").update(publicCopy).digest("hex"), bin.hash);
    const again = loadBin(name);
    assert.equal(again.hash, bin.hash);
  }
});

test("M5.2 B/C keep stage and three figures on every LOD prefix", () => {
  for (const name of ["b", "c"] as const) {
    const bin = loadBin(name);
    for (const prefix of PREFIXES) {
      const counts = partCounts(bin, prefix);
      for (const part of PARTS) {
        assert.ok(counts[part] > 0, `${name} ${prefix} missing ${part}`);
      }
    }
  }
});

test("M5.2 C four-part sidecar membership covers all IDs", () => {
  const sidecar = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2/variants/c/event-part.json"), "utf8"));
  assert.deepEqual(sidecar.eventPartNames, PARTS);
  const bin = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2/variants/c/event-part.u8.bin"));
  assert.equal(bin.byteLength, N);
  const counts = [0, 0, 0, 0];
  for (const value of bin) counts[value] += 1;
  assert.ok(counts.every((count) => count > 0));
});

test("M5.2 does not mutate canonical aggregate, M5.1 source, frozen hashes, Event palette, or shader", () => {
  assert.equal(aggregate(m51Hashes.sourceFiles), M51_SOURCE);
  assert.ok(!m51Hashes.sourceFiles.some((file: string) => file.includes("event-sandbox")));
  assert.equal(createHash("sha256").update(frozenEvent).digest("hex"), FROZEN_EVENT);
  const m41Path = path.join(ROOT, "design/photonic-skin/ps-03-m4-1/exports/ps03m41-manifest.json");
  const m41Bytes = readFileSync(m41Path);
  const m41 = JSON.parse(m41Bytes.toString("utf8")) as { aggregateContentHash: string };
  assert.equal(createHash("sha256").update(m41Bytes).digest("hex"), "d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441");
  assert.equal(m41.aggregateContentHash, "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361");
  const m31 = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-03-m3-1r/exports/ps03m31r-manifest.json"), "utf8"));
  assert.equal(m31.deterministicFingerprint, "0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2");
  const patch = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-03-m4-1r/reports/presentation-patch-inventory.json"), "utf8"));
  assert.equal(patch.hash, "228ddce450536d94d625d73f99ceff133371ccfe515a6f21cc3377fa3fda3ca0");
  assert.equal(aggregate(r6r1Hashes.sourceFiles), "60546b434ed857a9c967a28dca9ee7d1f0fdb705ca8bbaed654384e677f13116");
  assert.match(palette, /event: "#F86927"/);
  assert.equal((scene.match(/new THREE\.RawShaderMaterial/g) ?? []).length, 1);
  assert.equal((scene.match(/<Canvas/g) ?? []).length, 1);
  assert.equal((scene.match(/<instancedMesh/g) ?? []).length, 1);
  assert.match(m51Lab, /sessionId = "ps04-m5-1"/);
  assert.doesNotMatch(m51Page, /event-sandbox/);
  assert.match(home, /SiteShell/);
  assert.doesNotMatch(home, /photonic-skin-ps04-m5/);
  assert.doesNotMatch(home, /event-sandbox/);
});

test("M5.2 sandbox route is isolated and validates variant query params", () => {
  assert.match(sandboxLab, /ps04-m5-2-event-sandbox/);
  assert.match(sandboxLab, /runId: "ps04-m5-2"/);
  assert.equal(parseSandboxQuery("").variant, "a-r1");
  assert.equal(parseSandboxQuery("?variant=a&view=opposite&theme=dark&labels=0&mode=transition").variant, "a");
  assert.equal(parseSandboxQuery("?variant=a").view, "canonical");
  assert.equal(parseSandboxQuery("?variant=nope").variant, "a-r1");
  assert.equal(parseSandboxQuery("?variant=nope").invalidVariant, true);
  assert.equal(parseSandboxQuery("?view=orbit").view, "canonical");
  assert.equal(parseSandboxQuery("?theme=neon").theme, "light");
  const page = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/event-sandbox/page.tsx"), "utf8");
  assert.match(page, /EventSandboxLabClient/);
  assert.ok(existsSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/event-sandbox/preview/page.tsx")));
});

test("M5.2 keeps M5.1 Design→Event→Games choreography: no third geometry, no palette lead, no center dwell", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled(single("05.2", "design"));
  const toEvent = coordinator.begin({
    next: single("05.3", "event"),
    displayed: displayed({
      nodeId: "05.2",
      geometryId: SINGLE_STATE_IDS.design,
      paletteMask: COMPETENCE_BIT.design,
      slot: "left",
      fitProfile: "single",
      fit: 1.36,
      paletteProgress: 1,
    }),
    nowSeconds: 0,
    reducedMotion: false,
  });
  assert.notEqual(toEvent.decision.kind, "noop");
  assert.equal(toEvent.transaction.sourceGeometryId, SINGLE_STATE_IDS.design);
  assert.equal(toEvent.transaction.targetGeometryId, SINGLE_STATE_IDS.event);
  const ids = new Set([toEvent.transaction.sourceGeometryId, toEvent.transaction.targetGeometryId]);
  assert.equal(ids.size, 2);
  for (const progress of [0, 0.15, 0.4, 0.72, 0.99, 1]) {
    const geometry = positionProgressFromGeometryM5(progress);
    const paletteProgress = paletteProgressFromGeometryM5(progress);
    assert.equal(paletteLeadsGeometry(geometry, paletteProgress), false);
  }
  const phase = samplePhaseAdapter({
    program: { durationMs: 980, selfTransition: false, phases: FROZEN_PHASE_WINDOWS } as never,
    progress: 0.45,
    playingTransition: true,
  });
  assert.equal(typeof phase.motionPhase, "string");
  coordinator.adoptSettled(single("05.3", "event"));
  const toGames = coordinator.begin({
    next: single("05.4", "games"),
    displayed: displayed({
      nodeId: "05.3",
      geometryId: SINGLE_STATE_IDS.event,
      paletteMask: COMPETENCE_BIT.event,
      slot: "left",
      fitProfile: "single",
      fit: 1.36,
      paletteProgress: 1,
    }),
    nowSeconds: 1,
    reducedMotion: false,
  });
  assert.equal(toGames.transaction.sourceGeometryId, SINGLE_STATE_IDS.event);
  assert.equal(toGames.transaction.targetGeometryId, SINGLE_STATE_IDS.games);
  coordinator.adoptSettled(single("05.4", "games"));
  const reverse = coordinator.begin({
    next: single("05.2", "design"),
    displayed: displayed({
      nodeId: "05.4",
      geometryId: SINGLE_STATE_IDS.games,
      paletteMask: COMPETENCE_BIT.games,
      slot: "left",
      fitProfile: "single",
      fit: 1.36,
      paletteProgress: 1,
    }),
    nowSeconds: 2,
    reducedMotion: false,
  });
  assert.equal(reverse.transaction.sourceGeometryId, SINGLE_STATE_IDS.games);
  assert.equal(reverse.transaction.targetGeometryId, SINGLE_STATE_IDS.design);
  assert.equal(hasCenterDwell([
    { x: 200, width: 1440, positionProgress: 0.3, geometryProgress: 0.3, status: "running" },
    { x: 480, width: 1440, positionProgress: 0.5, geometryProgress: 0.5, status: "running" },
    { x: 900, width: 1440, positionProgress: 0.7, geometryProgress: 0.7, status: "running" },
  ]), false);
  coordinator.adoptSettled(single("05.2", "design"));
  const reduced = coordinator.begin({
    next: single("05.3", "event"),
    displayed: displayed({
      nodeId: "05.2",
      geometryId: SINGLE_STATE_IDS.design,
      paletteMask: COMPETENCE_BIT.design,
      slot: "left",
      fitProfile: "single",
      fit: 1.36,
    }),
    nowSeconds: 3,
    reducedMotion: true,
  });
  assert.equal(reduced.transaction.status, "settled");
  assert.equal(reduced.transaction.geometryProgress, 1);
  const footer = resolveScreenActorContract({
    nodeId: "08",
    index: indexStates([]),
    flow: {
      taskId: null,
      taskSelected: false,
      competencies: [],
      competenciesConfirmed: false,
      settledStateId: MASTER_STATE_ID,
    },
  });
  assert.equal(footer.family, "none");
  assert.equal(footer.resolvedGeometryId, null);
  assert.equal(CASES_CONTENT.target, "05.1");
});

test("M5.2 sandbox compiles Event overlays in-process rather than via frozen precompiled programs", () => {
  const prewarm = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/event-sandbox/sandbox-prewarm.ts"), "utf8");
  assert.match(prewarm, /compileTransition\(/);
  assert.doesNotMatch(prewarm, /loadMatchingPrecompiledProgram/);
  assert.match(prewarm, /overlayEventState/);
  assert.match(sandboxLab, /EventSandboxProgramCache/);
  assert.doesNotMatch(sandboxLab, /from "\.\.\/transition-prewarm"/);
});
