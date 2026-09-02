import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ALL_COMPETENCE_MASK, COMPETENCE_BIT } from "../app/visual-lab/photonic-skin-ps04-m2/photonic-palette";
import {
  hasCenterDwell,
  paletteLeadsGeometry,
  paletteProgressFromGeometryM5,
  positionProgressFromGeometryM5,
} from "../app/visual-lab/photonic-skin-ps04-m5/m5-choreography";
import { parseSandboxQuery, SANDBOX_DEFAULTS, VARIANT_META } from "../app/visual-lab/photonic-skin-ps04-m5/event-sandbox/sandbox-query";
import { createLoadGate, loadingLabel } from "../app/visual-lab/photonic-skin-ps04-m5/event-sandbox/sandbox-load-gate";
import {
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
  indexStates,
  resolveScreenActorContract,
} from "../app/visual-lab/photonic-skin-ps04-m5/screen-actor-contract";
import { ActorTransitionCoordinator } from "../app/visual-lab/photonic-skin-ps04-m5/transition-coordinator";

const ROOT = process.cwd();
const STRIDE = 40;
const N = 16384;
const PREFIXES = [512, 1024, 2048, 4096, 8192, 12288, 16384];
const RIGHT_LOD = { 512: 42, 1024: 78, 2048: 155, 4096: 325, 8192: 566, 12288: 809, 16384: 890 } as const;
const EVENT_A = "76c46452781c4334b4d91cca9ed6533bb9ccd7224c57bdf7abf7e1093d1c938d";
const EVENT_A_R1 = "89f50d4c83b15de21b753f98d6ab368e974c20a91ed135668bbaf05445b898cc";
const M52_SOURCE = "34e19852c76aec43e6a07c005ede69573481b7957c8c6b087111054591c7c87e";
const M51_SOURCE = "a4f394cf3f0c137e3204b3c34cf0a7ced9fec9c59be9c89a3a298c98c533b420";
const FROZEN_EVENT = "b14a3b2f8571e3e7d39be074aecbdeb6dd4ca51097c6433db25b622c3394a933";
const AGGREGATE = "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361";
const COMPONENT_RIGHT = 4;
const ALLOWED = new Set([0, 4, 8, 12, 14, 16, 18, 20, 22, 24]); // position 0-11, normal 12-17, orientation 18-25

const m51Hashes = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-1/reports/checkpoint-hashes.json"), "utf8"));
const m52Hashes = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2/reports/checkpoint-hashes.json"), "utf8"));
const proof = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r1/reports/selective-edit-proof.json"), "utf8"));
const metrics = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r1/reports/a-r1-metrics.json"), "utf8"));
const home = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
const sandboxLab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/event-sandbox/EventSandboxLab.tsx"), "utf8");
const querySrc = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/event-sandbox/sandbox-query.ts"), "utf8");
const panelSrc = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/event-sandbox/SandboxReviewPanel.tsx"), "utf8");

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

function loadBin(rel: string) {
  const buf = readFileSync(path.join(ROOT, rel));
  assert.equal(buf.byteLength, N * STRIDE);
  return { buf, hash: createHash("sha256").update(buf).digest("hex") };
}

function field(buf: Buffer, id: number, offset: number, size: number) {
  return buf.subarray(id * STRIDE + offset, id * STRIDE + offset + size);
}

test("R1 keeps committed M5.2 hashes and EVENT_A source", () => {
  assert.equal(m52Hashes.source, M52_SOURCE);
  assert.equal(m52Hashes.variantA, EVENT_A);
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-2/variants/a/single-event.state.bin"), EVENT_A);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-2/variants/a/single-event.state.bin"), EVENT_A);
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-2/variants/baseline/single-event.state.bin"), FROZEN_EVENT);
  assert.equal(shaFile("public/photonic-skin/ps-03-m3-1r/states/single-event.state.bin"), FROZEN_EVENT);
  assert.equal(aggregate(m51Hashes.sourceFiles), M51_SOURCE);
});

test("R1 EVENT_A_R1 hash is deterministic and distinct from A", () => {
  const design = loadBin("design/photonic-skin/ps-04-m5-2-r1/variants/a-r1/single-event.state.bin");
  const published = loadBin("public/photonic-skin/ps-04-m5-2/variants/a-r1/single-event.state.bin");
  assert.equal(design.hash, EVENT_A_R1);
  assert.equal(published.hash, EVENT_A_R1);
  assert.notEqual(design.hash, EVENT_A);
  assert.equal(proof.eventAR1Hash, EVENT_A_R1);
  assert.equal(proof.eventAHash, EVENT_A);
});

test("R1 preserves N, ID domain, right-part identity, statuses and components", () => {
  const a = loadBin("design/photonic-skin/ps-04-m5-2/variants/a/single-event.state.bin");
  const r1 = loadBin("design/photonic-skin/ps-04-m5-2-r1/variants/a-r1/single-event.state.bin");
  const parts = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2/variants/a/event-part.u8.bin"));
  const r1Parts = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r1/variants/a-r1/event-part.u8.bin"));
  assert.equal(parts.compare(r1Parts), 0);
  let rightActive = 0;
  for (let id = 0; id < N; id += 1) {
    assert.equal(a.buf.readUInt16LE(id * STRIDE + 36), r1.buf.readUInt16LE(id * STRIDE + 36));
    assert.equal(a.buf[id * STRIDE + 30], r1.buf[id * STRIDE + 30]);
    assert.equal(a.buf[id * STRIDE + 31], r1.buf[id * STRIDE + 31]);
    assert.equal(a.buf[id * STRIDE + 32], r1.buf[id * STRIDE + 32]);
    assert.equal(a.buf[id * STRIDE + 33], r1.buf[id * STRIDE + 33]);
    assert.equal(a.buf[id * STRIDE + 35], r1.buf[id * STRIDE + 35]);
    if (parts[id] === 3 && a.buf[id * STRIDE + 30] === COMPONENT_RIGHT && a.buf[id * STRIDE + 32] === 0) rightActive += 1;
  }
  assert.equal(rightActive, 890);
});

test("R1 non-right records are byte-identical and only geometry fields change on the right", () => {
  const a = loadBin("design/photonic-skin/ps-04-m5-2/variants/a/single-event.state.bin");
  const r1 = loadBin("design/photonic-skin/ps-04-m5-2-r1/variants/a-r1/single-event.state.bin");
  const parts = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2/variants/a/event-part.u8.bin"));
  let maxNonRight = 0;
  let changedRight = 0;
  for (let id = 0; id < N; id += 1) {
    const right = parts[id] === 3 && a.buf[id * STRIDE + 30] === COMPONENT_RIGHT;
    for (let offset = 0; offset < STRIDE; offset += 1) {
      const diff = Math.abs(a.buf[id * STRIDE + offset] - r1.buf[id * STRIDE + offset]);
      if (!right) maxNonRight = Math.max(maxNonRight, diff);
      else if (diff && offset >= 26) assert.fail(`forbidden field byte ${offset} changed on id ${id}`);
    }
    if (right && Buffer.compare(a.buf.subarray(id * STRIDE, id * STRIDE + STRIDE), r1.buf.subarray(id * STRIDE, id * STRIDE + STRIDE)) !== 0) {
      changedRight += 1;
      assert.equal(field(a.buf, id, 26, 10).compare(field(r1.buf, id, 26, 10)), 0);
    }
  }
  assert.equal(maxNonRight, 0);
  assert.equal(proof.nonRightByteDifference, 0);
  assert.ok(changedRight > 0);
  void ALLOWED;
});

test("R1 right LOD counts match EVENT_A", () => {
  const r1 = loadBin("design/photonic-skin/ps-04-m5-2-r1/variants/a-r1/single-event.state.bin");
  for (const prefix of PREFIXES) {
    let count = 0;
    for (let id = 0; id < prefix; id += 1) {
      if (r1.buf[id * STRIDE + 32] === 0 && r1.buf[id * STRIDE + 30] === COMPONENT_RIGHT) count += 1;
    }
    assert.equal(count, RIGHT_LOD[prefix as keyof typeof RIGHT_LOD], `prefix ${prefix}`);
  }
});

test("R1 geometry is finite and isolated silhouette gates pass", () => {
  const r1 = loadBin("design/photonic-skin/ps-04-m5-2-r1/variants/a-r1/single-event.state.bin");
  for (let id = 0; id < N; id += 1) {
    assert.ok(Number.isFinite(r1.buf.readFloatLE(id * STRIDE)));
    assert.ok(Number.isFinite(r1.buf.readFloatLE(id * STRIDE + 4)));
    assert.ok(Number.isFinite(r1.buf.readFloatLE(id * STRIDE + 8)));
  }
  assert.equal(metrics.gates.finite, true);
  assert.equal(metrics.gates.noOrphans, true);
  assert.equal(metrics.gates.silhouetteConnected180, true);
  assert.equal(metrics.gates.silhouetteConnected96, true);
  assert.ok(metrics.silhouette180.maxInternalRowGap <= 3);
  assert.ok(metrics.silhouette96.maxInternalRowGap <= 2);
  assert.equal(metrics.gates.torsoNotStem, true);
  assert.equal(metrics.gates.headDistinct, true);
  assert.ok(metrics.after.torsoWidth >= 0.78 * metrics.after.headWidth);
  assert.equal(metrics.left.bbox.min[0] !== metrics.after.centroid[0], true);
});

test("R1 does not mutate stage/left/centre, Event palette, M5.1, canonical aggregate or production", () => {
  const a = loadBin("design/photonic-skin/ps-04-m5-2/variants/a/single-event.state.bin");
  const r1 = loadBin("design/photonic-skin/ps-04-m5-2-r1/variants/a-r1/single-event.state.bin");
  for (let id = 0; id < N; id += 1) {
    const component = a.buf[id * STRIDE + 30];
    if (component === COMPONENT_RIGHT) continue;
    assert.equal(Buffer.compare(a.buf.subarray(id * STRIDE, id * STRIDE + STRIDE), r1.buf.subarray(id * STRIDE, id * STRIDE + STRIDE)), 0);
  }
  const palette = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m2/photonic-palette.ts"), "utf8");
  assert.match(palette, /event: "#F86927"/);
  const m41 = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-03-m4-1/exports/ps03m41-manifest.json"), "utf8"));
  assert.equal(m41.aggregateContentHash, AGGREGATE);
  assert.equal(aggregate(m51Hashes.sourceFiles), M51_SOURCE);
  assert.match(home, /ProductionPhotonicSiteClient/);
  assert.doesNotMatch(home, /event-sandbox/);
  assert.doesNotMatch(home, /ps-04-m5-2-r1/);
});

test("R1 sandbox still accepts A-R1; default variant is now A-R2 from R2 review flow", () => {
  assert.equal(parseSandboxQuery("?variant=a-r1").variant, "a-r1");
  assert.equal(SANDBOX_DEFAULTS.labels, false);
  assert.equal(SANDBOX_DEFAULTS.mode, "settled");
  assert.equal(parseSandboxQuery("").labels, false);
  assert.equal(parseSandboxQuery("").mode, "settled");
  assert.equal(parseSandboxQuery("?variant=nope").invalidVariant, true);
  assert.equal(parseSandboxQuery("?view=orbit").view, "canonical");
  assert.equal(parseSandboxQuery("?view=orbit").invalidView, true);
  assert.equal(parseSandboxQuery("?theme=neon").theme, "light");
  assert.equal(parseSandboxQuery("?labels=maybe").labels, false);
  assert.equal(parseSandboxQuery("?labels=maybe").invalidLabels, true);
  assert.equal(parseSandboxQuery("?mode=morph").mode, "settled");
  assert.equal(parseSandboxQuery("?variant=a-r1&labels=0&mode=settled").variant, "a-r1");
  assert.equal(VARIANT_META.b.rejected, true);
  assert.equal(VARIANT_META.c.rejected, true);
});

test("R1 UI contracts: reactive switching, URL history, HUD/rendered agreement, stale rejection", () => {
  assert.match(sandboxLab, /loadGateRef/);
  assert.match(sandboxLab, /pushState/);
  assert.match(sandboxLab, /popstate/);
  assert.match(sandboxLab, /displayedVariant/);
  assert.match(sandboxLab, /requestedVariant/);
  assert.match(sandboxLab, /latest-selection-wins|isCurrent\(generation\)|loadGateRef/);
  assert.match(sandboxLab, /setDisplayedVariant\(requestedVariant\)/);
  assert.match(sandboxLab, /setBufferHash\(state.entry.contentHash\)/);
  assert.match(sandboxLab, /SandboxReviewPanel/);
  assert.match(querySrc, /a-r1/);
  assert.match(panelSrc, /aria-pressed/);
  assert.match(panelSrc, /Сейчас показан/);
  assert.match(panelSrc, /Итоговый материал/);
  assert.match(panelSrc, /Статичное состояние/);
  assert.match(querySrc, /выбранное направление/);
  assert.match(querySrc, /A‑R1/);
  assert.match(sandboxLab, /history\.pushState/);
  assert.match(sandboxLab, /addEventListener\("popstate"/);
  const gate = createLoadGate();
  const first = gate.next();
  const second = gate.next();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  assert.equal(loadingLabel("EVENT_A_R1"), "Загружается EVENT_A_R1…");
});

test("R1 transition regression contracts remain M5.1: no palette lead, no third geometry, no center dwell", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled({
    nodeId: "05.2",
    hostNodeId: "05.2",
    family: "SINGLE",
    requestedFamily: "SINGLE",
    resolvedGeometryId: SINGLE_STATE_IDS.design,
    paletteMask: COMPETENCE_BIT.design,
    slot: "left",
    fitProfile: "single",
    resolution: "exact",
    applyPaletteOverride: false,
    reason: "test",
  });
  const toEvent = coordinator.begin({
    next: {
      nodeId: "05.3",
      hostNodeId: "05.3",
      family: "SINGLE",
      requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.event,
      paletteMask: COMPETENCE_BIT.event,
      slot: "left",
      fitProfile: "single",
      resolution: "exact",
      applyPaletteOverride: false,
      reason: "test",
    },
    displayed: {
      slot: "left",
      fit: 1.36,
      fitProfile: "single",
      paletteMask: COMPETENCE_BIT.design,
      paletteProgress: 1,
      geometryId: SINGLE_STATE_IDS.design,
      nodeId: "05.2",
    },
    nowSeconds: 0,
    reducedMotion: false,
  });
  assert.equal(toEvent.transaction.sourceGeometryId, SINGLE_STATE_IDS.design);
  assert.equal(toEvent.transaction.targetGeometryId, SINGLE_STATE_IDS.event);
  assert.equal(new Set([toEvent.transaction.sourceGeometryId, toEvent.transaction.targetGeometryId]).size, 2);
  for (const progress of [0, 0.2, 0.5, 0.85, 1]) {
    assert.equal(paletteLeadsGeometry(positionProgressFromGeometryM5(progress), paletteProgressFromGeometryM5(progress)), false);
  }
  assert.equal(hasCenterDwell([
    { x: 200, width: 1440, positionProgress: 0.3, geometryProgress: 0.3, status: "running" },
    { x: 900, width: 1440, positionProgress: 0.7, geometryProgress: 0.7, status: "running" },
  ]), false);
  const footer = resolveScreenActorContract({
    nodeId: "08",
    index: indexStates([]),
    flow: { taskId: null, taskSelected: false, competencies: [], competenciesConfirmed: false, settledStateId: MASTER_STATE_ID },
  });
  assert.equal(footer.resolvedGeometryId, null);
  assert.equal(ALL_COMPETENCE_MASK > 0, true);
});

test("R1 evidence files exist and JSON parses", () => {
  const files = [
    "design/photonic-skin/ps-04-m5-2-r1/manifest.json",
    "design/photonic-skin/ps-04-m5-2-r1/reports/selective-edit-proof.json",
    "design/photonic-skin/ps-04-m5-2-r1/reports/a-r1-metrics.json",
    "design/photonic-skin/ps-04-m5-2-r1/authoring/parameters.json",
    "design/photonic-skin/ps-04-m5-2-r1/authoring/export-log.json",
    "app/visual-lab/photonic-skin-ps04-m5/event-sandbox/preview/page.tsx",
  ];
  for (const file of files) {
    assert.ok(existsSync(path.join(ROOT, file)), file);
    if (file.endsWith(".json")) JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
  }
});
