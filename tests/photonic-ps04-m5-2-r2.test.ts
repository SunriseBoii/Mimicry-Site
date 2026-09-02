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
import { cloneEventEntry } from "../app/visual-lab/photonic-skin-ps04-m5/event-sandbox/variant-overlay";
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
const VIEWER_RIGHT_LOD = { 512: 50, 1024: 84, 2048: 181, 4096: 371, 8192: 651, 12288: 915, 16384: 1014 } as const;
const EVENT_A = "76c46452781c4334b4d91cca9ed6533bb9ccd7224c57bdf7abf7e1093d1c938d";
const EVENT_A_R1 = "89f50d4c83b15de21b753f98d6ab368e974c20a91ed135668bbaf05445b898cc";
const EVENT_A_R2 = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b";
const M52_SOURCE = "34e19852c76aec43e6a07c005ede69573481b7957c8c6b087111054591c7c87e";
const M51_SOURCE = "a4f394cf3f0c137e3204b3c34cf0a7ced9fec9c59be9c89a3a298c98c533b420";
const FROZEN_EVENT = "b14a3b2f8571e3e7d39be074aecbdeb6dd4ca51097c6433db25b622c3394a933";
const AGGREGATE = "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361";
const VIEWER_RIGHT_COMPONENT = 2;
const VIEWER_LEFT_COMPONENT = 4;
const HEAD = "948686a50960f5847517d95611f0c549c84a45f8";
const BRANCH = "ps04-m5-sandbox";

const m51Hashes = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-1/reports/checkpoint-hashes.json"), "utf8"));
const m52Hashes = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2/reports/checkpoint-hashes.json"), "utf8"));
const mapping = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r2/reports/screen-space-part-map.json"), "utf8"));
const proof = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r2/reports/selective-edit-proof.json"), "utf8"));
const metrics = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r2/reports/a-r2-metrics.json"), "utf8"));
const rootCause = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r2/reports/point-vs-flake-root-cause.json"), "utf8"));
const coverage = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r2/reports/instance-coverage.json"), "utf8"));
const home = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
const sandboxLab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/event-sandbox/EventSandboxLab.tsx"), "utf8");
const querySrc = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/event-sandbox/sandbox-query.ts"), "utf8");
const panelSrc = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/event-sandbox/SandboxReviewPanel.tsx"), "utf8");
const overlaySrc = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/event-sandbox/variant-overlay.ts"), "utf8");

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

test("R2 records actual branch and does not rewrite R1 history", () => {
  const git = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r2/reports/git-snapshot.json"), "utf8");
  const snap = JSON.parse(git);
  assert.equal(snap.branch, BRANCH);
  assert.equal(snap.head, HEAD);
  assert.equal(snap.reset, false);
  assert.equal(snap.revert, false);
  assert.equal(snap.amend, false);
  assert.match(snap.headMessage, /refine Event A right figure/);
});

test("R2 keeps committed M5.2 hashes, EVENT_A and EVENT_A_R1 unchanged", () => {
  assert.equal(m52Hashes.source, M52_SOURCE);
  assert.equal(m52Hashes.variantA, EVENT_A);
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-2/variants/a/single-event.state.bin"), EVENT_A);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-2/variants/a/single-event.state.bin"), EVENT_A);
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-2-r1/variants/a-r1/single-event.state.bin"), EVENT_A_R1);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-2/variants/a-r1/single-event.state.bin"), EVENT_A_R1);
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-2/variants/baseline/single-event.state.bin"), FROZEN_EVENT);
  assert.equal(shaFile("public/photonic-skin/ps-03-m3-1r/states/single-event.state.bin"), FROZEN_EVENT);
  assert.equal(aggregate(m51Hashes.sourceFiles), M51_SOURCE);
});

test("R2 screen-space mapping proves viewer-right through canonical projection", () => {
  assert.equal(mapping.rule, "viewer-right = figure with the largest canonical screen-space X");
  assert.equal(mapping.mappingMatchesOwnerHypothesis, true);
  assert.equal(mapping.viewerRight.componentId, VIEWER_RIGHT_COMPONENT);
  assert.equal(mapping.viewerRight.eventPart, 2);
  assert.equal(mapping.viewerRight.semanticName, "figure-left");
  assert.equal(mapping.viewerRight.activeCount, 1014);
  assert.equal(mapping.viewerLeft.componentId, VIEWER_LEFT_COMPONENT);
  assert.equal(mapping.viewerLeft.semanticName, "figure-right");
  assert.equal(mapping.r1WrongTarget, true);
  assert.ok(mapping.viewerRight.canonicalScreenX > mapping.viewerCentre.canonicalScreenX);
  assert.ok(mapping.viewerCentre.canonicalScreenX > mapping.viewerLeft.canonicalScreenX);
  assert.equal(mapping.viewerRight.VIEWER_RIGHT_COMPONENT, 2);
  assert.doesNotMatch(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r2/scripts/refine_event_a_viewer_right.py"), "utf8"), /COMPONENT_RIGHT\s*=/);
});

test("R2 root cause is empty visibleProfiles → minimumGeometricScale, not a global size hack", () => {
  assert.equal(rootCause.causeId, "empty-visibleProfiles-forces-minimumGeometricScale");
  assert.equal(rootCause.viewerRightAsPacked.visibleOnDesktopProfile, false);
  assert.equal(rootCause.footprintRatioVsViewerLeft, 0.18);
  assert.equal(rootCause.interpretation.scaleFieldChangeRequired, false);
  assert.equal(coverage.pointCloudOnOriginalA, true);
  assert.equal(coverage.flakeLikeOnAR2WhenVisible, true);
  assert.equal(metrics.gates.noGlobalScaleHack, true);
  assert.equal(metrics.gates.flakeFootprintVsLeft, true);
});

test("R2 hash is deterministic, distinct from A and R1, and published", () => {
  const design = loadBin("design/photonic-skin/ps-04-m5-2-r2/variants/a-r2/single-event.state.bin");
  const published = loadBin("public/photonic-skin/ps-04-m5-2/variants/a-r2/single-event.state.bin");
  assert.equal(design.hash, EVENT_A_R2);
  assert.equal(published.hash, EVENT_A_R2);
  assert.notEqual(design.hash, EVENT_A);
  assert.notEqual(design.hash, EVENT_A_R1);
  assert.equal(proof.eventAR2Hash, EVENT_A_R2);
  assert.equal(proof.eventAHash, EVENT_A);
  assert.equal(proof.derivedDirectlyFromEventA, true);
  assert.equal(proof.derivedFromEventAR1, false);
});

test("R2 only changes viewer-right records; viewer-left matches original A, not R1", () => {
  const a = loadBin("design/photonic-skin/ps-04-m5-2/variants/a/single-event.state.bin");
  const r1 = loadBin("design/photonic-skin/ps-04-m5-2-r1/variants/a-r1/single-event.state.bin");
  const r2 = loadBin("design/photonic-skin/ps-04-m5-2-r2/variants/a-r2/single-event.state.bin");
  const parts = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2/variants/a/event-part.u8.bin"));
  const r2Parts = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r2/variants/a-r2/event-part.u8.bin"));
  assert.equal(parts.compare(r2Parts), 0);
  let maxNonTarget = 0;
  let changedTarget = 0;
  let viewerRightActive = 0;
  let viewerLeftDiffVsA = 0;
  let viewerLeftDiffR1 = 0;
  for (let id = 0; id < N; id += 1) {
    const component = a.buf[id * STRIDE + 30];
    const target = parts[id] === 2 && component === VIEWER_RIGHT_COMPONENT;
    for (let offset = 0; offset < STRIDE; offset += 1) {
      const diff = Math.abs(a.buf[id * STRIDE + offset] - r2.buf[id * STRIDE + offset]);
      if (!target) maxNonTarget = Math.max(maxNonTarget, diff);
      else if (diff && offset >= 26) assert.fail(`forbidden field byte ${offset} changed on id ${id}`);
    }
    if (target && Buffer.compare(a.buf.subarray(id * STRIDE, id * STRIDE + STRIDE), r2.buf.subarray(id * STRIDE, id * STRIDE + STRIDE)) !== 0) {
      changedTarget += 1;
    }
    if (component === VIEWER_RIGHT_COMPONENT && a.buf[id * STRIDE + 32] === 0) viewerRightActive += 1;
    if (component === VIEWER_LEFT_COMPONENT) {
      viewerLeftDiffVsA = Math.max(viewerLeftDiffVsA, Buffer.compare(a.buf.subarray(id * STRIDE, id * STRIDE + STRIDE), r2.buf.subarray(id * STRIDE, id * STRIDE + STRIDE)) === 0 ? 0 : 1);
      if (Buffer.compare(a.buf.subarray(id * STRIDE, id * STRIDE + STRIDE), r1.buf.subarray(id * STRIDE, id * STRIDE + STRIDE)) !== 0) viewerLeftDiffR1 = 1;
    }
    assert.equal(a.buf.readUInt16LE(id * STRIDE + 36), r2.buf.readUInt16LE(id * STRIDE + 36));
    assert.equal(a.buf[id * STRIDE + 30], r2.buf[id * STRIDE + 30]);
    assert.equal(a.buf[id * STRIDE + 32], r2.buf[id * STRIDE + 32]);
  }
  assert.equal(maxNonTarget, 0);
  assert.equal(proof.nonTargetByteDifference, 0);
  assert.equal(proof.viewerLeftByteDifferenceVsA, 0);
  assert.equal(proof.wrongR1GeometryNotInherited, true);
  assert.ok(changedTarget > 0);
  assert.equal(viewerRightActive, 1014);
  assert.equal(viewerLeftDiffVsA, 0);
  assert.equal(viewerLeftDiffR1, 1);
});

test("R2 viewer-right LOD presence matches original EVENT_A", () => {
  const r2 = loadBin("design/photonic-skin/ps-04-m5-2-r2/variants/a-r2/single-event.state.bin");
  for (const prefix of PREFIXES) {
    let count = 0;
    for (let id = 0; id < prefix; id += 1) {
      if (r2.buf[id * STRIDE + 32] === 0 && r2.buf[id * STRIDE + 30] === VIEWER_RIGHT_COMPONENT) count += 1;
    }
    assert.equal(count, VIEWER_RIGHT_LOD[prefix as keyof typeof VIEWER_RIGHT_LOD], `prefix ${prefix}`);
  }
});

test("R2 geometry is finite and visual flake/silhouette gates pass", () => {
  const r2 = loadBin("design/photonic-skin/ps-04-m5-2-r2/variants/a-r2/single-event.state.bin");
  for (let id = 0; id < N; id += 1) {
    assert.ok(Number.isFinite(r2.buf.readFloatLE(id * STRIDE)));
  }
  assert.equal(metrics.gates.finite, true);
  assert.equal(metrics.gates.noOrphans, true);
  assert.equal(metrics.gates.silhouetteConnected180, true);
  assert.equal(metrics.gates.headReadable, true);
  assert.equal(metrics.gates.torsoReadable, true);
  assert.equal(metrics.gates.flakeFootprintVsLeft, true);
  assert.equal(metrics.gates.packedAWasSparse, true);
  assert.equal(metrics.machinePass, true);
  assert.equal(metrics.visualMachineFailSparse, false);
  assert.ok(coverage.aR2OverlayVisible.coverageRatio >= 0.55);
});

test("R2 does not mutate production, canonical aggregate, M5.1 or Event palette", () => {
  const palette = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m2/photonic-palette.ts"), "utf8");
  assert.match(palette, /event: "#F86927"/);
  const m41 = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-03-m4-1/exports/ps03m41-manifest.json"), "utf8"));
  assert.equal(m41.aggregateContentHash, AGGREGATE);
  assert.equal(aggregate(m51Hashes.sourceFiles), M51_SOURCE);
  assert.match(home, /ProductionPhotonicSiteClient/);
  assert.doesNotMatch(home, /event-sandbox/);
  assert.doesNotMatch(home, /ps-04-m5-2-r2/);
});

test("R2 sandbox defaults to A-R2 settled unlabelled canonical light", () => {
  assert.equal(SANDBOX_DEFAULTS.variant, "a-r2");
  assert.equal(SANDBOX_DEFAULTS.labels, false);
  assert.equal(SANDBOX_DEFAULTS.mode, "settled");
  assert.equal(SANDBOX_DEFAULTS.view, "canonical");
  assert.equal(SANDBOX_DEFAULTS.theme, "light");
  assert.equal(parseSandboxQuery("").variant, "a-r2");
  assert.equal(parseSandboxQuery("?variant=nope").variant, "a-r2");
  assert.equal(parseSandboxQuery("?variant=a-r1").variant, "a-r1");
  assert.equal(parseSandboxQuery("?variant=a-r2&labels=0&mode=settled").variant, "a-r2");
  assert.equal(VARIANT_META["a-r2"].hudName, "EVENT_A_R2");
  assert.match(VARIANT_META["a-r2"].decision, /viewer-right refined/);
  assert.match(VARIANT_META["a-r2"].decision, /HUMAN PASS/);
  assert.match(VARIANT_META["a-r2"].decision, /SELECTED M5 EVENT CANDIDATE/);
  assert.equal(VARIANT_META["a-r1"].rejected, true);
  assert.match(VARIANT_META["a-r1"].title, /слева/);
  assert.equal(VARIANT_META.b.rejected, true);
  assert.equal(VARIANT_META.c.rejected, true);
  assert.doesNotMatch(VARIANT_META["a-r2"].decision, /canonical/);
  assert.doesNotMatch(VARIANT_META["a-r2"].decision, /финально утвержд/);
});

test("R2 overlay unhides only viewer-right on A-R2 and keeps A packed-hidden", () => {
  const entry = {
    stateId: "single-event",
    componentMap: [
      { componentIndex: 2, visibleProfiles: [] },
      { componentIndex: 3, visibleProfiles: ["desktop"] },
      { componentIndex: 4, visibleProfiles: ["desktop"] },
    ],
  } as never;
  const a = cloneEventEntry(entry, "a", 10, "x");
  const r2 = cloneEventEntry(entry, "a-r2", 10, "x");
  const mapA = (a as unknown as { componentMap: Array<{ componentIndex: number; visibleProfiles: string[] }> }).componentMap;
  const mapR2 = (r2 as unknown as { componentMap: Array<{ componentIndex: number; visibleProfiles: string[] }> }).componentMap;
  assert.equal(mapA[0].visibleProfiles.length, 0);
  assert.ok(mapR2[0].visibleProfiles.includes("desktop"));
  assert.deepEqual(mapR2[1].visibleProfiles, ["desktop"]);
  const isolated = cloneEventEntry(entry, "a-r2", 10, "x", "viewer-right");
  const mapIso = (isolated as unknown as { componentMap: Array<{ componentIndex: number; visibleProfiles: string[] }> }).componentMap;
  assert.ok(mapIso[0].visibleProfiles.includes("desktop"));
  assert.equal(mapIso[1].visibleProfiles.length, 0);
  assert.equal(mapIso[2].visibleProfiles.length, 0);
  assert.match(overlaySrc, /VIEWER_RIGHT_COMPONENT/);
});

test("R2 UI keeps R1 usability: requested/displayed, history, live switch", () => {
  assert.match(sandboxLab, /loadGateRef/);
  assert.match(sandboxLab, /pushState/);
  assert.match(sandboxLab, /popstate/);
  assert.match(sandboxLab, /displayedVariant/);
  assert.match(sandboxLab, /requestedVariant/);
  assert.match(sandboxLab, /setDisplayedVariant\(requestedVariant\)/);
  assert.match(sandboxLab, /PS-04.M5.2.R2/);
  assert.match(panelSrc, /aria-pressed/);
  assert.match(panelSrc, /EVENT_A_R2/);
  assert.match(panelSrc, /HUMAN PASS/);
  assert.match(panelSrc, /promotion deferred to M5.5/);
  assert.match(querySrc, /a-r2/);
  const gate = createLoadGate();
  const first = gate.next();
  const second = gate.next();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  assert.equal(loadingLabel("EVENT_A_R2"), "Загружается EVENT_A_R2…");
});

test("R2 transition regression contracts remain M5.1", () => {
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

test("R2 records HUMAN PASS and defers canonical promotion to M5.5", () => {
  const review = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r2/reports/human-review.md"), "utf8");
  const stageManifest = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r2/manifest.json"), "utf8"));
  assert.match(review, /HUMAN PASS \/ SELECTED M5 EVENT CANDIDATE/);
  assert.match(review, /можно переходить к PS‑04\.M5\.3/);
  assert.equal(stageManifest.status, "HUMAN PASS / SELECTED M5 EVENT CANDIDATE");
  assert.equal(stageManifest.selectedDirection, "EVENT_A");
  assert.equal(stageManifest.selectedCandidate, "EVENT_A_R2");
  assert.equal(stageManifest.notCanonicalYet, true);
  assert.equal(stageManifest.notProductionApproval, true);
  assert.equal(stageManifest.productionApproval, false);
  assert.equal(stageManifest.promotionDeferredTo, "PS-04.M5.5");
  assert.equal(stageManifest.m53Started, false);
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-2-r2/variants/a-r2/single-event.state.bin"), EVENT_A_R2);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-2/variants/a-r2/single-event.state.bin"), EVENT_A_R2);
});

test("R2 evidence files exist", () => {
  const files = [
    "design/photonic-skin/ps-04-m5-2-r2/manifest.json",
    "design/photonic-skin/ps-04-m5-2-r2/reports/human-review.md",
    "design/photonic-skin/ps-04-m5-2-r2/reports/selective-edit-proof.json",
    "design/photonic-skin/ps-04-m5-2-r2/reports/screen-space-part-map.json",
    "design/photonic-skin/ps-04-m5-2-r2/reports/point-vs-flake-root-cause.json",
    "design/photonic-skin/ps-04-m5-2-r2/reports/two-run-identity.json",
    "design/photonic-skin/ps-04-m5-2-r2/authoring/parameters.json",
    "public/photonic-skin/ps-04-m5-2/variants/a-r2/single-event.state.bin",
  ];
  for (const file of files) {
    assert.ok(existsSync(path.join(ROOT, file)), file);
    if (file.endsWith(".json")) JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
  }
});
