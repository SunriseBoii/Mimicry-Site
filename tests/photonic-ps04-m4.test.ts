import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as THREE from "three";
import type { M3Manifest, StateEntry } from "../app/visual-lab/photonic-skin-m4-1/m41-data";
import { PhotonicMotionSession } from "../app/visual-lab/photonic-skin-ps04-m3/session";
import { ALL_COMPETENCE_MASK, COMPETENCE_BIT } from "../app/visual-lab/photonic-skin-ps04-m2/photonic-palette";
import { competenceOrder } from "../app/_brand/color-system";
import {
  CANONICAL_BRAND_WIDE_ID,
  CANONICAL_DRIVE_ID,
  CANONICAL_FOCUS_ID,
  CANONICAL_GATHER_ID,
  FALLBACK_GEOMETRY_ID,
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
  TASK_FAMILY,
  indexStates,
  resolveActorRequest,
  resolveFamilyGeometry,
  resolveScreenActorContract,
} from "../app/visual-lab/photonic-skin-ps04-m4/actor-resolver";
import {
  confirmCompetencies,
  INITIAL_BUILD_FLOW,
  selectTask,
  setCompetencies,
  simulateSuccess,
  validateContact,
} from "../app/visual-lab/photonic-skin-ps04-m4/build-flow";
import {
  DPR_MATRIX,
  ENVELOPE_PROFILES,
  IDENTITY_COMPOSITION,
  actorSquareCss,
  actorVisibilityGate,
  applyCompositionViewport,
  cssSlotToWebglCss,
  envelopeFits,
  envelopeOverflow,
  legacyPreMultipliedWebglCss,
  multiplyRendererPixelRatio,
  ndcToCanvasCss,
  sampleComposition,
  siteClipTransform,
  slotInteriorCutoff,
  targetForNode,
} from "../app/visual-lab/photonic-skin-ps04-m4/composition";
import { SITE_FIT_PROFILES, siteFitScaleFor } from "../app/visual-lab/photonic-skin-ps04-m4/site-fit";
import { graphNodeViews, isNodeUnlocked } from "../app/visual-lab/photonic-skin-ps04-m4/graph-model";
import {
  MAGNETISM,
  ScrollCompositionController,
  assertMonotonic,
  canonicalLayout,
  compensateUnlock,
  isMagneticEligible,
  magneticEaseOut,
  magnetismGuardsBlock,
  mapScrollToProgress,
  planMagneticSnap,
  restoreScrollY,
} from "../app/visual-lab/photonic-skin-ps04-m4/scroll-controller";
import {
  CHAPTER_IDS,
  GRAPH_EDGES,
  SCREEN_NODES,
  SCREEN_NODE_IDS,
  SVG_OVERRIDES,
  TEMPORARY_STATES,
  assertOrthogonalPath,
  graphDistance as topologyDistance,
} from "../app/visual-lab/photonic-skin-ps04-m4/topology";

const ROOT = process.cwd();
const m3Scene = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m3/PS04M3Scene.tsx"), "utf8");
const m4Scene = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/PS04M4Scene.tsx"), "utf8");
const m3Lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m3/PS04M3Lab.tsx"), "utf8");
const m4Lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/PS04M4Lab.tsx"), "utf8");

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

function vertexShader(source: string) {
  const match = source.match(/const vertexShader = `([\s\S]*?)`;/);
  assert.ok(match, "vertex shader must exist");
  return match[1];
}

function fragmentShader(source: string) {
  const match = source.match(/const fragmentShader = `([\s\S]*?)`;/);
  assert.ok(match, "fragment shader must exist");
  return match[1];
}

function loadManifest() {
  return JSON.parse(readFileSync(path.join(ROOT, "public/photonic-skin/ps-03-m3-1r/manifest.json"), "utf8")) as M3Manifest;
}

test("PS-04.M4 frozen hashes and old routes remain exact", () => {
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
  assert.equal(aggregate(m1Manifest.sourceFiles), "4cb80b507605bf439e9de5210e5f022159c716ee286fa81b98f0e943cf5b75eb");
  const m2Manifest = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m2/manifest.json"), "utf8")) as { sourceFiles: string[]; checkpointAggregates: { source: string } };
  assert.equal(aggregate(m2Manifest.sourceFiles), "f04bc262cdc80e6061d2ad7fdb6501f60aa0a31105a55f876a8eaa26f0266c0d");
  assert.equal(shaFile("design/photonic-skin/ps-04-m2/manifest.json"), "14a612a53d4006a595a8e70c0d19c86ec0eb76549aa73a5e3ea878ce4c3ea9f8");
  assert.equal(shaFile("design/photonic-skin/ps-04-m3/manifest.json"), "1c80aeb9e02e1e17988311bc73dc86b87f53cd5ae3e223550f017cd8736f6fac");
  const m3SourceFiles = [
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
  assert.equal(aggregate(m3SourceFiles), "184744da085dc31e08c954640456133308585b7b8ef107de43ab2f8d7a8e6ec1");
  assert.ok(readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m1/page.tsx"), "utf8").length > 0);
  assert.ok(readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m2/page.tsx"), "utf8").length > 0);
  assert.ok(readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m3/page.tsx"), "utf8").length > 0);
  assert.ok(readFileSync(path.join(ROOT, "app/page.tsx"), "utf8").includes("SiteShell"));
  assert.doesNotMatch(m3Lab, /photonic-skin-ps04-m4/);
  assert.match(m4Lab, /PhotonicMotionSession/);
});

function evaluatorMain(source: string) {
  const shader = vertexShader(source).replace(
    /\nuniform vec2 uSiteClipScale;\nuniform vec2 uSiteClipOffset;\nuniform float uSiteCompositionEnabled;/,
    "",
  );
  const start = shader.indexOf("void main()");
  const needle = "vec3 presented = (idlePoint + frameTranslate) * frameScale;";
  const end = shader.indexOf(needle);
  assert.ok(start >= 0 && end > start, "evaluator main must exist");
  return shader.slice(start, end + needle.length);
}

test("M4 composition identity keeps the frozen M3 vertex evaluator", () => {
  assert.equal(evaluatorMain(m4Scene), evaluatorMain(m3Scene));
  assert.match(fragmentShader(m4Scene), /uActorMask/);
  assert.match(m4Scene, /applyCompositionViewport/);
  assert.match(m4Scene, /liveCamera\.aspect = 1/);
  assert.match(m4Scene, /meshRef\.current\.visible/);
  assert.match(m4Scene, /restoreFullCanvasViewport|getViewport/);
  assert.match(m4Scene, /uSiteClipScale/);
  assert.match(m4Scene, /uSiteClipOffset/);
  assert.match(m4Scene, /uSiteCompositionEnabled/);
  assert.match(m4Scene, /clipPosition\.x \* uSiteClipScale/);
  assert.match(m4Scene, /uContinuityEnabled > 0.5 && uEvaluator == 1/);
  assert.match(m4Scene, /vPaletteOwnership/);
  assert.match(fragmentShader(m4Scene), /uPaletteOwnershipMode > 0.5/);
  assert.doesNotMatch(m4Lab, /Math\.exp\(-dt \/ 0\.28\)/);
  assert.doesNotMatch(m4Lab, /setMask\(request\.paletteMask, \{ mode: "immediate" \}\)/);
  assert.match(m4Lab, /ActorTransitionCoordinator/);
  assert.equal((m4Scene.match(/new THREE\.RawShaderMaterial/g) ?? []).length, 1);
  assert.equal((m4Scene.match(/<instancedMesh/g) ?? []).length, 1);
  assert.doesNotMatch(m4Scene, /uCompose(?!ition)/);
  assert.match(m4Lab, /siteFitScale/);
});

test("topology registry has 18 nodes, 3 chapters, 2 temporary non-nodes", () => {
  assert.equal(SCREEN_NODE_IDS.length, 18);
  assert.equal(SCREEN_NODES.length, 18);
  assert.equal(CHAPTER_IDS.length, 3);
  assert.equal(TEMPORARY_STATES.length, 2);
  assert.equal(TEMPORARY_STATES.every((item) => item.graphRing === false), true);
  assert.equal(SCREEN_NODES.filter((node) => node.actorPlacement === "left").length, 7);
  assert.equal(SCREEN_NODES.find((node) => node.id === "08")?.actorPlacement, "none");
  assert.match(SVG_OVERRIDES.footerActor, /footer/);
  for (const edge of GRAPH_EDGES) assertOrthogonalPath(edge.path);
  assert.equal(topologyDistance("01", "08"), 17);
  assert.equal(topologyDistance("03.1", "03.3"), 2);
  assert.equal(topologyDistance("05.7", "06.1"), 1);
});

test("graph distance fade hides d>3 and locks dynamic rings until unlock", () => {
  const locked = graphNodeViews("01", { competencies: false, brief: false });
  const brief = locked.find((node) => node.id === "03.3")!;
  assert.equal(brief.dashed, true);
  assert.equal(brief.interactive, false);
  assert.ok(brief.distance > 3 ? brief.opacity === 0 : true);
  const near = graphNodeViews("05.4", { competencies: true, brief: true });
  assert.equal(near.find((node) => node.id === "05.4")?.opacity, 1);
  assert.equal(topologyDistance("05.4", "05.1"), 3);
  assert.equal(near.find((node) => node.id === "05.1")?.opacity, 0.12);
  assert.equal(near.find((node) => node.id === "04")?.opacity, 0);
  assert.equal(isNodeUnlocked("03.2", { competencies: false, brief: false }), false);
  assert.equal(isNodeUnlocked("03.2", { competencies: true, brief: false }), true);
});

test("canonical scroll mapping is monotonic and unlock compensation keeps the current node", () => {
  const locked = { competencies: false, brief: false };
  const layout = canonicalLayout(800, locked);
  assertMonotonic(layout);
  assert.equal(layout.byId["03.2"], undefined);
  assert.equal(layout.byId["03.1"]?.start, 1600);
  const atTask = mapScrollToProgress({ scrollY: 2000, viewportHeight: 800, viewportWidth: 1440, unlock: locked });
  assert.equal(atTask.activeNodeId, "03.1");
  const opened = { competencies: true, brief: true };
  const compensated = compensateUnlock({
    scrollY: 2000,
    viewportHeight: 800,
    viewportWidth: 1440,
    previous: locked,
    next: opened,
    previousActive: "03.1",
  });
  const after = canonicalLayout(800, opened);
  assert.equal(after.byId["03.2"] !== undefined, true);
  assert.ok(Math.abs(compensated - restoreScrollY(after, "03.1", atTask.edgeProgress)) < 2);
  const past = mapScrollToProgress({ scrollY: 2800, viewportHeight: 800, viewportWidth: 1440, unlock: locked });
  assert.equal(past.activeNodeId, "04");
  const moved = compensateUnlock({
    scrollY: 2800,
    viewportHeight: 800,
    viewportWidth: 1440,
    previous: locked,
    next: opened,
    previousActive: "04",
  });
  assert.ok(Math.abs(moved - restoreScrollY(after, "04", past.edgeProgress)) < 2);
  const chapter = mapScrollToProgress({
    scrollY: after.chapters["05"]!.start + 800 * 2.4,
    viewportHeight: 800,
    viewportWidth: 1440,
    unlock: opened,
  });
  assert.equal(chapter.activeNodeId, "05.3");
  assert.ok(chapter.chapterTranslate["05"] < -2);
  const reverse = mapScrollToProgress({
    scrollY: after.byId["02"]!.start + 10,
    viewportHeight: 800,
    viewportWidth: 1440,
    unlock: opened,
    previousActive: "03.1",
    direction: -1,
  });
  assert.ok(reverse.activeNodeId === "02" || reverse.activeNodeId === "03.1");
  const jumped = mapScrollToProgress({
    scrollY: restoreScrollY(after, "05.4", 0),
    viewportHeight: 800,
    viewportWidth: 1440,
    unlock: opened,
    previousActive: "01",
    direction: 1,
  });
  assert.equal(jumped.activeNodeId, "05.4");
  const adjacent = mapScrollToProgress({
    scrollY: after.byId["02"]!.start + 2,
    viewportHeight: 800,
    viewportWidth: 1440,
    unlock: opened,
    previousActive: "01",
    direction: 1,
    ignoreHysteresis: true,
  });
  assert.equal(adjacent.activeNodeId, "02");
});

test("hysteresis does not flip neighbours on a one-pixel boundary", () => {
  const unlock = { competencies: true, brief: true };
  const layout = canonicalLayout(1000, unlock);
  const boundary = layout.byId["02"]!.start;
  const down = mapScrollToProgress({
    scrollY: boundary + 1,
    viewportHeight: 1000,
    viewportWidth: 1440,
    unlock,
    previousActive: "01",
    direction: 1,
  });
  assert.equal(down.activeNodeId, "01");
  const crossed = mapScrollToProgress({
    scrollY: boundary + 600,
    viewportHeight: 1000,
    viewportWidth: 1440,
    unlock,
    previousActive: "01",
    direction: 1,
  });
  assert.equal(crossed.activeNodeId, "02");
  const held = mapScrollToProgress({
    scrollY: boundary + 2,
    viewportHeight: 1000,
    viewportWidth: 1440,
    unlock,
    previousActive: "02",
    direction: 1,
  });
  assert.equal(held.activeNodeId, "02");
  const reverseHold = mapScrollToProgress({
    scrollY: boundary - 2,
    viewportHeight: 1000,
    viewportWidth: 1440,
    unlock,
    previousActive: "02",
    direction: -1,
  });
  assert.equal(reverseHold.activeNodeId, "02");
});

test("dynamic flow is monotonic and contact validation is textual", () => {
  let state = selectTask(INITIAL_BUILD_FLOW, "explain");
  assert.equal(state.unlock.competencies, true);
  assert.equal(state.unlock.brief, false);
  const empty = confirmCompetencies(state);
  assert.equal(empty.error !== null, true);
  assert.equal(empty.state.unlock.brief, false);
  state = setCompetencies(state, ["content", "design"]);
  const confirmed = confirmCompetencies(state);
  assert.equal(confirmed.error, null);
  assert.equal(confirmed.state.unlock.brief, true);
  state = selectTask(confirmed.state, "train");
  assert.equal(state.unlock.brief, true);
  assert.equal(state.unlock.competencies, true);
  const errors = validateContact({ name: "", channel: "", consent: false });
  assert.ok(errors.name && errors.channel && errors.consent);
  const success = simulateSuccess(confirmed.state, 1000);
  assert.equal(success.overlay, "success");
  assert.equal(success.successVisibleUntil, 1000 + 4200);
});

test("resolver never invents a state id and never crosses family on fallback", () => {
  const manifest = loadManifest();
  assert.equal(manifest.states.length, 154);
  const ids = new Set(manifest.states.map((entry: StateEntry) => entry.stateId));
  const index = indexStates(manifest.states);
  assert.ok(ids.has(MASTER_STATE_ID));
  assert.ok(ids.has(CANONICAL_BRAND_WIDE_ID));
  assert.ok(ids.has(CANONICAL_GATHER_ID));
  assert.ok(ids.has(CANONICAL_DRIVE_ID));
  assert.ok(ids.has(CANONICAL_FOCUS_ID));
  for (const stateId of Object.values(SINGLE_STATE_IDS)) assert.ok(ids.has(stateId));

  const idle = {
    taskId: null,
    taskSelected: false,
    competencies: [] as const,
    competenciesConfirmed: false,
    settledStateId: MASTER_STATE_ID,
  };
  const hero = resolveScreenActorContract({ nodeId: "01", index, flow: idle });
  assert.equal(hero.resolvedGeometryId, MASTER_STATE_ID);
  assert.equal(hero.family, "MASTER");
  assert.equal(hero.slot, "right");
  const about = resolveScreenActorContract({ nodeId: "02", index, flow: idle });
  assert.equal(about.family, "BRAND_WIDE");
  assert.equal(about.resolvedGeometryId, CANONICAL_BRAND_WIDE_ID);
  const footer = resolveScreenActorContract({ nodeId: "08", index, flow: idle });
  assert.equal(footer.resolvedGeometryId, null);
  assert.equal(footer.resolution, "none");
  assert.equal(footer.slot, "none");
  const cases = resolveScreenActorContract({ nodeId: "04", index, flow: idle });
  assert.equal(cases.family, "MASTER");
  for (const id of ["06.1", "06.2", "06.3", "07"] as const) {
    const row = resolveScreenActorContract({ nodeId: id, index, flow: idle });
    assert.equal(row.family, "MASTER");
    assert.equal(row.resolvedGeometryId, MASTER_STATE_ID);
  }
  const single = resolveScreenActorContract({ nodeId: "05.3", index, flow: idle });
  assert.equal(single.resolvedGeometryId, "single-event");
  assert.equal(single.family, "SINGLE");
  assert.equal(single.slot, "left");
  assert.equal(single.paletteMask, COMPETENCE_BIT.event);

  assert.equal(TASK_FAMILY.explain, "FOCUS");
  assert.equal(TASK_FAMILY.involve, "GATHER");
  assert.equal(TASK_FAMILY.train, "DRIVE");
  assert.equal(TASK_FAMILY.introduce, "BRAND_WIDE");

  const afterTask = { ...idle, taskId: "explain" as const, taskSelected: true };
  const taskSelected = resolveScreenActorContract({ nodeId: "03.1", index, flow: afterTask });
  assert.equal(taskSelected.family, "FOCUS");
  assert.equal(taskSelected.paletteMask, ALL_COMPETENCE_MASK);
  assert.equal(taskSelected.resolution, "same-family-fallback");
  assert.equal(taskSelected.resolvedGeometryId, CANONICAL_FOCUS_ID);

  const tasks = [
    ["explain", "FOCUS", CANONICAL_FOCUS_ID],
    ["involve", "GATHER", CANONICAL_GATHER_ID],
    ["train", "DRIVE", CANONICAL_DRIVE_ID],
    ["introduce", "BRAND_WIDE", CANONICAL_BRAND_WIDE_ID],
  ] as const;
  for (const [taskId, family, canonical] of tasks) {
    const row = resolveScreenActorContract({
      nodeId: "03.1",
      index,
      flow: { ...idle, taskId, taskSelected: true },
    });
    assert.equal(row.family, family);
    assert.ok(row.resolvedGeometryId);
    assert.ok(ids.has(row.resolvedGeometryId!));
    if (row.resolution === "same-family-fallback") assert.equal(row.resolvedGeometryId, canonical);
    if (family === "FOCUS") assert.notEqual(row.resolvedGeometryId, FALLBACK_GEOMETRY_ID);
  }

  let exact = 0;
  let fallback = 0;
  for (let mask = 1; mask <= 127; mask += 1) {
    const competencies = competenceOrder.filter((id) => (mask & COMPETENCE_BIT[id]) !== 0);
    const request = resolveActorRequest({
      nodeId: "03.2",
      index,
      flow: { ...idle, taskId: "explain", taskSelected: true, competencies },
    });
    assert.ok(request.stateId && ids.has(request.stateId), `invented ${request.stateId}`);
    assert.equal(request.contract.family, "FOCUS");
    assert.notEqual(request.stateId, FALLBACK_GEOMETRY_ID);
    const entry = index.byId.get(request.stateId)!;
    assert.equal(entry.compositionMode, "FOCUS");
    assert.equal(request.paletteMask, mask);
    if (request.resolution === "exact") exact += 1;
    else {
      fallback += 1;
      assert.equal(request.resolution, "same-family-fallback");
      assert.equal(request.stateId, CANONICAL_FOCUS_ID);
    }
  }
  assert.equal(exact + fallback, 127);
  assert.ok(exact > 0 && fallback > 0);

  const driveMissing = resolveFamilyGeometry(index, "DRIVE", 1);
  assert.equal(driveMissing.resolution, "same-family-fallback");
  assert.equal(driveMissing.entry.stateId, CANONICAL_DRIVE_ID);
  assert.equal(driveMissing.entry.compositionMode, "DRIVE");

  const brief = resolveScreenActorContract({
    nodeId: "03.3",
    overlay: "contact",
    index,
    flow: {
      taskId: "involve",
      taskSelected: true,
      competencies: ["content", "design"],
      competenciesConfirmed: true,
      settledStateId: MASTER_STATE_ID,
    },
  });
  assert.equal(brief.nodeId, "03.3A");
  assert.equal(brief.hostNodeId, "03.3");
  assert.equal(brief.family, "GATHER");
  const success = resolveScreenActorContract({
    nodeId: "03.3",
    overlay: "success",
    index,
    flow: {
      taskId: "involve",
      taskSelected: true,
      competencies: ["content", "design"],
      competenciesConfirmed: true,
      settledStateId: MASTER_STATE_ID,
    },
  });
  assert.equal(success.resolvedGeometryId, brief.resolvedGeometryId);
  assert.equal(success.paletteMask, brief.paletteMask);
});

test("site composition uses CSS logical pixels and footer has no actor", () => {
  assert.equal(targetForNode("08").visible, false);
  assert.equal(targetForNode("05.1").placement, "left");
  assert.equal(targetForNode("01").placement, "right");
  applyCompositionViewport({
    setViewport: () => undefined,
    setScissor: () => undefined,
    setScissorTest: () => undefined,
  }, IDENTITY_COMPOSITION);
  assert.equal(IDENTITY_COMPOSITION.identity, true);
  for (const profile of ENVELOPE_PROFILES) {
    const right = envelopeFits(profile.width, profile.height, "right");
    const left = envelopeFits(profile.width, profile.height, "left");
    assert.ok(right.inViewport && left.inViewport);
    assert.equal(right.overlapsGraph, false);
    const sample = sampleComposition({
      width: profile.width,
      height: profile.height,
      dpr: 2,
      placement: "right",
      exitProgress: 0,
      reducedMotion: false,
    });
    assert.equal(sample.cssWidth, sample.cssHeight);
    assert.equal(sample.width, profile.width);
    assert.equal(sample.height, profile.height);
    assert.equal(sample.x, 0);
    assert.equal(sample.y, 0);
    assert.ok(Math.abs(sample.deviceWidth - Math.round(sample.width * 2)) <= 1);
    assert.ok(actorSquareCss(profile.width, profile.height) <= Math.min(profile.width, profile.height));
  }
  const session = new PhotonicMotionSession();
  session.setOffscreen(true);
  session.tick(1, 1);
  assert.equal(session.snapshot().lastTickDt, 0);
});

test("M4 lab keeps one session owner and does not replace production homepage", () => {
  assert.match(m4Lab, /new PhotonicMotionSession/);
  assert.match(m4Lab, /beginRequest/);
  assert.match(m4Lab, /isCurrent/);
  assert.match(m4Lab, /useLayoutEffect/);
  assert.equal((m4Lab.match(/new PhotonicMotionSession/g) ?? []).length, 1);
  assert.doesNotMatch(readFileSync(path.join(ROOT, "app/page.tsx"), "utf8"), /photonic-skin-ps04-m4/);
  const cameraUp = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-m4-1r/photonic-presentation.ts"), "utf8");
  assert.match(cameraUp, /PHOTONIC_WORLD_UP = \[0, 0, 1\]/);
  assert.ok(new THREE.Vector3(0, 0, 1).equals(new THREE.Vector3(...([0, 0, 1] as const))));
});

test("approved mapping table covers all 18 nodes", () => {
  const index = indexStates(loadManifest().states);
  const idle = {
    taskId: null,
    taskSelected: false,
    competencies: [] as const,
    competenciesConfirmed: false,
    settledStateId: MASTER_STATE_ID,
  };
  const singles: Record<string, string> = {
    "05.1": "single-content",
    "05.2": "single-design",
    "05.3": "single-event",
    "05.4": "single-games",
    "05.5": "single-video",
    "05.6": "single-digital",
    "05.7": "single-merch",
  };
  for (const id of SCREEN_NODE_IDS) {
    const row = resolveScreenActorContract({ nodeId: id, index, flow: idle });
    if (id === "08") {
      assert.equal(row.family, "none");
      continue;
    }
    if (singles[id]) {
      assert.equal(row.family, "SINGLE");
      assert.equal(row.resolvedGeometryId, singles[id]);
      assert.equal(row.slot, "left");
      continue;
    }
    if (id === "02") {
      assert.equal(row.family, "BRAND_WIDE");
      continue;
    }
    assert.equal(row.family, "MASTER");
    assert.equal(row.slot, "right");
  }
});

test("DPR conversion happens exactly once and CSS slot is invariant", () => {
  const width = 1440;
  const height = 900;
  const css = DPR_MATRIX.map((dpr) => sampleComposition({
    width, height, dpr, placement: "right", exitProgress: 0, reducedMotion: false,
  }));
  const base = css[0];
  for (const sample of css) {
    assert.ok(Math.abs(sample.cssLeft - base.cssLeft) <= 2);
    assert.ok(Math.abs(sample.cssTop - base.cssTop) <= 2);
    assert.ok(Math.abs(sample.cssWidth - base.cssWidth) <= 2);
    assert.ok(Math.abs(sample.cssCenterX - base.cssCenterX) <= 2);
    const slot = { left: sample.cssLeft, top: sample.cssTop, width: sample.cssWidth, height: sample.cssHeight };
    const webgl = cssSlotToWebglCss(slot, height);
    assert.ok(Math.abs(webgl.x - sample.cssLeft) <= 1);
    const canvasDevice = multiplyRendererPixelRatio({ x: 0, y: 0, width, height }, sample.rendererDpr);
    const envelopeDevice = multiplyRendererPixelRatio(webgl, sample.rendererDpr);
    assert.equal(canvasDevice.x, sample.deviceX);
    assert.equal(canvasDevice.width, sample.deviceWidth);
    assert.equal(envelopeDevice.x, sample.envelopeDeviceX);
    const legacy = legacyPreMultipliedWebglCss(slot, height, sample.rendererDpr);
    const doubled = multiplyRendererPixelRatio(legacy, sample.rendererDpr);
    if (sample.rendererDpr === 1) {
      assert.equal(doubled.x, envelopeDevice.x);
    } else {
      assert.ok(doubled.x > envelopeDevice.x + 8);
    }
  }
  const broken = css.find((sample) => sample.rendererDpr === 2)!;
  const drawingW = broken.drawingBufferWidth;
  const slot = { left: broken.cssLeft, top: broken.cssTop, width: broken.cssWidth, height: broken.cssHeight };
  const doubled = multiplyRendererPixelRatio(legacyPreMultipliedWebglCss(slot, height, 2), 2);
  assert.ok(doubled.x + doubled.width * 0.5 > drawingW, "legacy double-DPR must push MASTER off the buffer at dpr 2");
  const calls: number[][] = [];
  let scissor: boolean | null = null;
  applyCompositionViewport({
    setViewport: (...args: number[]) => { calls.push(args); },
    setScissor: () => undefined,
    setScissorTest: (value: boolean) => { scissor = value; },
  }, broken);
  assert.equal(calls[0][2], broken.canvasCssWidth);
  assert.equal(calls[0][3], broken.canvasCssHeight);
  assert.equal(scissor, false);
  assert.ok(broken.cssWidth < broken.canvasCssWidth);
});

test("actor visibility gate rejects draw-without-silhouette and canvas clipping", () => {
  const sample = sampleComposition({
    width: 1440, height: 900, dpr: 1, placement: "right", exitProgress: 0, reducedMotion: false,
  });
  const missing = actorVisibilityGate({
    actorDraw: true,
    bbox: null,
    visibleFraction: 0,
    centerX: sample.cssCenterX,
    slot: "right",
    canvasWidth: 1440,
    canvasHeight: 900,
    cssLeftByDpr: [sample.cssLeft],
    cssSizeByDpr: [sample.cssSize],
  });
  assert.equal(missing.pass, false);
  assert.ok(missing.failures.includes("draw-without-silhouette"));
  const okBox = {
    left: sample.cssLeft + 20,
    top: sample.cssTop + 20,
    width: sample.cssWidth - 40,
    height: sample.cssHeight - 40,
    right: sample.cssLeft + sample.cssWidth - 20,
    bottom: sample.cssTop + sample.cssHeight - 20,
    pixelCount: 4000,
  };
  const visible = actorVisibilityGate({
    actorDraw: true,
    bbox: okBox,
    visibleFraction: 1,
    centerX: sample.cssCenterX,
    slot: "right",
    canvasWidth: 1440,
    canvasHeight: 900,
    cssLeftByDpr: [100, 100, 100.4, 101],
    cssSizeByDpr: [480, 480, 480.5, 481],
  });
  assert.equal(visible.pass, true);
  const clipped = actorVisibilityGate({
    actorDraw: true,
    bbox: { left: 1420, top: 200, width: 40, height: 400, right: 1460, bottom: 600, pixelCount: 80 },
    visibleFraction: 0.4,
    centerX: 1430,
    slot: "right",
    canvasWidth: 1440,
    canvasHeight: 900,
    cssLeftByDpr: [100, 400],
    cssSizeByDpr: [480, 480],
  });
  assert.equal(clipped.pass, false);
});

test("identity mode bypasses M4 site fit", () => {
  assert.equal(siteFitScaleFor("brandWide", true), 1);
  assert.equal(siteFitScaleFor("none", false), 1);
  assert.ok(SITE_FIT_PROFILES.brandWide > 1);
  const identity = sampleComposition({
    width: 512, height: 512, dpr: 1.5, placement: "right", exitProgress: 0, reducedMotion: false, identity: true, fitProfile: "brandWide",
  });
  assert.equal(identity.siteFitScale, 1);
  assert.equal(identity.siteCompositionEnabled, 0);
  assert.deepEqual(identity.siteClipScale, [1, 1]);
  assert.equal(identity.x, 0);
  assert.equal(identity.width, 512);
});

test("05.* SINGLEs use one-bit masks and Build-flow never promotes a single competence to SINGLE", () => {
  const index = indexStates(loadManifest().states);
  const idle = {
    taskId: null,
    taskSelected: false,
    competencies: [] as const,
    competenciesConfirmed: false,
    settledStateId: MASTER_STATE_ID,
  };
  const bits: Record<string, number> = {
    "05.1": COMPETENCE_BIT.content,
    "05.2": COMPETENCE_BIT.design,
    "05.3": COMPETENCE_BIT.event,
    "05.4": COMPETENCE_BIT.games,
    "05.5": COMPETENCE_BIT.video,
    "05.6": COMPETENCE_BIT.digital,
    "05.7": COMPETENCE_BIT.merch,
  };
  for (const [id, bit] of Object.entries(bits)) {
    const row = resolveScreenActorContract({ nodeId: id as "05.1", index, flow: idle });
    assert.equal(row.family, "SINGLE");
    assert.equal(row.paletteMask, bit);
    assert.equal(row.slot, "left");
    assert.equal(row.resolution, "exact");
  }
  const oneBit = resolveScreenActorContract({
    nodeId: "03.2",
    index,
    flow: {
      taskId: "train",
      taskSelected: true,
      competencies: ["content"],
      competenciesConfirmed: false,
      settledStateId: MASTER_STATE_ID,
    },
  });
  assert.equal(oneBit.family, "DRIVE");
  assert.notEqual(oneBit.family, "SINGLE");
  assert.notEqual(oneBit.resolvedGeometryId, SINGLE_STATE_IDS.content);
  assert.equal(oneBit.paletteMask, COMPETENCE_BIT.content);
  if (oneBit.resolution === "same-family-fallback") {
    assert.equal(oneBit.resolvedGeometryId, CANONICAL_DRIVE_ID);
  }

  const beforeTask = resolveScreenActorContract({ nodeId: "03.1", index, flow: idle });
  assert.equal(beforeTask.family, "MASTER");
  assert.equal(beforeTask.resolvedGeometryId, MASTER_STATE_ID);
  assert.equal(beforeTask.paletteMask, ALL_COMPETENCE_MASK);

  const about = resolveScreenActorContract({ nodeId: "02", index, flow: idle });
  assert.equal(about.paletteMask, ALL_COMPETENCE_MASK);
  assert.equal(about.resolution, "exact");
});

test("one session owner, one Canvas, footer reverse does not remount the session", () => {
  assert.equal((m4Lab.match(/new PhotonicMotionSession/g) ?? []).length, 1);
  assert.match(m4Lab, /useMemo\(\(\) => new PhotonicMotionSession/);
  assert.equal((m4Lab.match(/<PS04M4Scene/g) ?? []).length, 1);
  assert.equal((m4Scene.match(/<Canvas/g) ?? []).length, 1);
  assert.match(
    readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m4/screen-actor-contract.ts"), "utf8"),
    /footer has no Mimic; session stays mounted/,
  );
  assert.doesNotMatch(m4Lab, /key=\{.*activeNode/);
  assert.match(m4Lab, /sessionId = "ps04-m4-r4"/);
});

test("direct-load contract is host-node equivalent for every node", () => {
  const index = indexStates(loadManifest().states);
  const flow = {
    taskId: "train" as const,
    taskSelected: true,
    competencies: ["content"] as const,
    competenciesConfirmed: true,
    settledStateId: MASTER_STATE_ID,
  };
  for (const id of SCREEN_NODE_IDS) {
    const row = resolveScreenActorContract({ nodeId: id, index, flow });
    assert.equal(row.hostNodeId, id);
    if (id === "03.1" || id === "03.2" || id === "03.3") assert.equal(row.family, "DRIVE");
  }
});

function planAt(scrollY: number, extra: Partial<Parameters<typeof planMagneticSnap>[0]> = {}) {
  return planMagneticSnap({
    scrollY,
    viewportHeight: 800,
    unlock: extra.unlock ?? { competencies: true, brief: true },
    direction: extra.direction ?? 1,
    velocityPxPerMs: extra.velocityPxPerMs ?? 0,
    fullyStopped: extra.fullyStopped ?? true,
    lastConfidentDirection: extra.lastConfidentDirection ?? 1,
    fastGesture: extra.fastGesture,
  });
}

class FakeHost {
  scrollY = 0;
  innerWidth = 1440;
  innerHeight = 800;
  now = 0;
  private nextId = 1;
  private readonly listeners = new Map<string, Set<EventListener>>();
  readonly rafs = new Map<number, FrameRequestCallback>();
  readonly timeouts = new Map<number, { cb: () => void; at: number }>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener as EventListener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(listener as EventListener);
  }

  requestAnimationFrame(callback: FrameRequestCallback) {
    const id = this.nextId++;
    this.rafs.set(id, callback);
    return id;
  }

  cancelAnimationFrame(handle: number) {
    this.rafs.delete(handle);
  }

  setTimeout(handler: TimerHandler, timeout = 0) {
    const id = this.nextId++;
    this.timeouts.set(id, { cb: handler as () => void, at: this.now + Number(timeout) });
    return id;
  }

  clearTimeout(handle?: number) {
    if (handle) this.timeouts.delete(handle);
  }

  scrollTo(options: ScrollToOptions) {
    this.scrollY = options.top ?? 0;
    this.emit("scroll");
  }

  emit(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener(new Event(type)));
  }

  flushRaf() {
    const pending = [...this.rafs.entries()];
    this.rafs.clear();
    for (const [, callback] of pending) callback(this.now);
  }

  advance(ms: number) {
    this.now += ms;
    for (const [id, item] of [...this.timeouts]) {
      if (item.at <= this.now) {
        this.timeouts.delete(id);
        item.cb();
      }
    }
    this.flushRaf();
  }
}

test("M4.R2 magnetism: near stop snaps, far stop does not, fast input does not reverse", () => {
  const near = planAt(150);
  assert.equal(near?.nodeId, "01");
  assert.ok((near?.distance ?? 0) <= 800 * MAGNETISM.activationRadiusFactor);
  assert.equal(planAt(400), null);
  const down = planAt(180, { fastGesture: true, lastConfidentDirection: 1, fullyStopped: false, velocityPxPerMs: 1.2 });
  assert.equal(down, null);
  const up = planAt(620, { fastGesture: true, lastConfidentDirection: -1, fullyStopped: false, velocityPxPerMs: -1.2, direction: -1 });
  assert.equal(up, null);
  assert.equal(planAt(2), null);
  const skip = planAt(800 * 2 + 10);
  assert.ok(skip === null || skip.nodeId === "03.1" || skip.nodeId === "02");
  if (skip) assert.notEqual(skip.nodeId, "04");
  assert.equal(isMagneticEligible("03.3A", { competencies: true, brief: true }), false);
  assert.equal(isMagneticEligible("03.3B", { competencies: true, brief: true }), false);
  assert.equal(isMagneticEligible("03.2", { competencies: false, brief: false }), false);
  assert.equal(isMagneticEligible("03.2", { competencies: true, brief: false }), true);
  const locked = planMagneticSnap({
    scrollY: 1600 + 40,
    viewportHeight: 800,
    unlock: { competencies: false, brief: false },
    direction: 1,
    velocityPxPerMs: 0,
    fullyStopped: true,
    lastConfidentDirection: 1,
  });
  assert.ok(!locked || locked.nodeId !== "03.2");
  const unlockedNearNext = planMagneticSnap({
    scrollY: canonicalLayout(800, { competencies: true, brief: false }).byId["03.2"]!.start + 40,
    viewportHeight: 800,
    unlock: { competencies: true, brief: false },
    direction: 1,
    velocityPxPerMs: 0,
    fullyStopped: true,
    lastConfidentDirection: 1,
  });
  assert.equal(unlockedNearNext?.nodeId, "03.2");
  const chapter = canonicalLayout(800, { competencies: true, brief: true });
  const from54 = chapter.byId["05.4"]!.start + 40;
  const horizontal = planMagneticSnap({
    scrollY: from54,
    viewportHeight: 800,
    unlock: { competencies: true, brief: true },
    direction: 1,
    velocityPxPerMs: 0,
    fullyStopped: true,
    lastConfidentDirection: 1,
  });
  assert.equal(horizontal?.nodeId, "05.4");
  assert.ok(Math.abs((horizontal?.targetY ?? 0) - restoreScrollY(chapter, "05.4", 0)) < 1);
  const toward55 = planMagneticSnap({
    scrollY: chapter.byId["05.5"]!.start - 80,
    viewportHeight: 800,
    unlock: { competencies: true, brief: true },
    direction: 1,
    velocityPxPerMs: 0,
    fullyStopped: true,
    lastConfidentDirection: 1,
  });
  assert.equal(toward55?.nodeId, "05.5");
  assert.notEqual(toward55?.targetY, restoreScrollY(chapter, "05.4", 0));
  const ease = [0, 0.25, 0.5, 0.75, 1].map(magneticEaseOut);
  for (let i = 1; i < ease.length; i += 1) assert.ok(ease[i] >= ease[i - 1]);
  assert.equal(ease[0], 0);
  assert.equal(ease[4], 1);
  assert.equal(magnetismGuardsBlock({
    dialogOpen: true, pointerHeld: false, focusEditing: false, textSelecting: false,
    documentHidden: false, layoutSettling: false, unmounted: false,
  }), true);
});

test("M4.R2 magnetism controller: cancel, same-target, restore, reduced, unmount", () => {
  const host = new FakeHost();
  const controller = new ScrollCompositionController({ now: () => host.now });
  controller.attach(host);
  controller.setUnlock({ competencies: true, brief: true });
  host.scrollY = 150;
  host.emit("scroll");
  host.flushRaf();
  controller.noteUserInput("wheel");
  host.advance(MAGNETISM.inputIdleMs);
  assert.equal(controller.getMode(), "magnetic");
  const token = controller.getMagnetism().revision;
  controller.noteUserInput("wheel");
  assert.equal(controller.getMode(), "user");
  assert.ok(controller.getMagnetism().revision > token);
  host.advance(MAGNETISM.inputIdleMs);
  assert.equal(controller.getMode(), "magnetic");
  controller.noteUserInput("touch");
  assert.equal(controller.getMode(), "user");
  controller.scrollToNode("02", "auto");
  assert.equal(controller.getProgress().activeNodeId, "02");
  const afterHeader = host.scrollY;
  controller.evaluateMagnetism();
  assert.equal(controller.getMode(), "idle");
  assert.equal(host.scrollY, afterHeader);
  controller.scrollToNode("02", "auto");
  assert.equal(host.scrollY, afterHeader);
  controller.scrollToNode("05.4", "auto", "restore");
  const restored = host.scrollY;
  controller.evaluateMagnetism();
  assert.equal(host.scrollY, restored);
  controller.setMagnetismGuards({ dialogOpen: true });
  host.scrollY = restored + 120;
  host.emit("scroll");
  host.flushRaf();
  controller.noteUserInput("wheel");
  host.advance(MAGNETISM.inputIdleMs);
  assert.notEqual(controller.getMode(), "magnetic");
  controller.setMagnetismGuards({ dialogOpen: false, focusEditing: true });
  controller.noteUserInput("wheel");
  host.advance(MAGNETISM.inputIdleMs);
  assert.notEqual(controller.getMode(), "magnetic");
  controller.setMagnetismGuards({ focusEditing: false });
  controller.setReducedMotion(true);
  host.scrollY = restoreScrollY(controller.layout(), "01", 0) + 120;
  host.emit("scroll");
  host.flushRaf();
  controller.noteUserInput("keyboard");
  host.advance(MAGNETISM.inputIdleMs);
  assert.equal(controller.getProgress().activeNodeId, "01");
  assert.equal(controller.getMode(), "idle");
  assert.equal(host.rafs.size, 0);
  for (let i = 0; i < 8; i += 1) {
    host.scrollY += 90;
    host.emit("scroll");
    host.flushRaf();
    controller.noteUserInput("wheel");
  }
  assert.equal(controller.getMode(), "user");
  controller.detach();
  host.advance(1000);
  assert.equal(host.timeouts.size, 0);
  assert.equal(host.rafs.size, 0);
  assert.equal(controller.getMagnetism().suppressed, true);
});

test("M4.R2 full-canvas clip-space composition preserves square projection", () => {
  const right = sampleComposition({
    width: 1440, height: 900, dpr: 1, placement: "right", exitProgress: 0, reducedMotion: false,
  });
  const left = sampleComposition({
    width: 1440, height: 900, dpr: 1, placement: "left", exitProgress: 0, reducedMotion: false,
  });
  assert.equal(right.width, 1440);
  assert.equal(right.height, 900);
  assert.equal(right.x, 0);
  assert.notEqual(right.cssWidth, right.width);
  assert.equal(right.cssWidth, right.cssHeight);
  const clipRight = siteClipTransform({
    canvasWidth: 1440, canvasHeight: 900, slotLeft: right.cssLeft, slotTop: right.cssTop, slotSize: right.cssSize,
  });
  const clipLeft = siteClipTransform({
    canvasWidth: 1440, canvasHeight: 900, slotLeft: left.cssLeft, slotTop: left.cssTop, slotSize: left.cssSize,
  });
  assert.ok(Math.abs(clipRight.scaleX - right.cssSize / 1440) < 1e-9);
  assert.ok(Math.abs(clipRight.scaleY - right.cssSize / 900) < 1e-9);
  assert.ok(Math.abs(clipLeft.offsetX - ((2 * (left.cssLeft + left.cssSize * 0.5)) / 1440 - 1)) < 1e-9);
  const mapped = ndcToCanvasCss(0, 0, clipRight, 1440, 900);
  assert.ok(Math.abs(mapped.x - right.cssCenterX) < 0.51);
  assert.ok(Math.abs(mapped.y - right.cssCenterY) < 0.51);
  const rightEdge = ndcToCanvasCss(1, 0, clipRight, 1440, 900);
  assert.ok(Math.abs(rightEdge.x - (right.cssLeft + right.cssSize)) < 0.51);
  const webglY = cssSlotToWebglCss({
    left: right.cssLeft, top: right.cssTop, width: right.cssSize, height: right.cssSize,
  }, 900).y + right.cssSize / 2;
  assert.ok(Math.abs(clipRight.centerY - webglY) < 0.51);
  for (const dpr of [1, 1.25, 1.5, 2] as const) {
    const sample = sampleComposition({
      width: 1440, height: 900, dpr, placement: "right", exitProgress: 0, reducedMotion: false,
    });
    assert.ok(Math.abs(sample.cssLeft - right.cssLeft) <= 2);
    assert.ok(Math.abs(sample.cssSize - right.cssSize) <= 2);
    assert.equal(sample.width, 1440);
    assert.equal(sample.siteCompositionEnabled, 1);
  }
  const identity = sampleComposition({
    width: 1440, height: 900, dpr: 2, placement: "right", exitProgress: 0, reducedMotion: false, identity: true,
  });
  assert.equal(identity.siteCompositionEnabled, 0);
  const footer = sampleComposition({
    width: 1440, height: 900, dpr: 1, placement: "exit", exitProgress: 1, reducedMotion: true,
  });
  assert.equal(footer.actorDraw, false);
  const overflowBox = {
    left: right.cssLeft - 40, top: right.cssTop + 20, width: right.cssWidth + 80, height: right.cssHeight - 40,
    right: right.cssLeft + right.cssWidth + 40, bottom: right.cssTop + right.cssHeight - 20, pixelCount: 9000,
  };
  const overflow = envelopeOverflow(overflowBox, {
    left: right.cssLeft, top: right.cssTop, width: right.cssWidth, height: right.cssHeight,
  });
  assert.equal(overflow.overflow, true);
  const visible = actorVisibilityGate({
    actorDraw: true,
    bbox: overflowBox,
    visibleFraction: 1,
    centerX: right.cssCenterX,
    slot: "right",
    canvasWidth: 1440,
    canvasHeight: 900,
    cssLeftByDpr: [right.cssLeft],
    cssSizeByDpr: [right.cssSize],
    phase: "transition",
  });
  assert.equal(visible.pass, true);
  const cutoff = slotInteriorCutoff(
    {
      left: right.cssLeft, top: right.cssTop, width: right.cssWidth, height: right.cssHeight,
      right: right.cssLeft + right.cssWidth, bottom: right.cssTop + right.cssHeight, pixelCount: 100,
    },
    { left: right.cssLeft, top: right.cssTop, width: right.cssWidth, height: right.cssHeight },
    1440,
    900,
  );
  assert.equal(cutoff.cutoff, true);
  assert.match(m4Lab, /sessionId = "ps04-m4-r4"/);
  assert.equal((m4Scene.match(/<Canvas/g) ?? []).length, 1);
  assert.equal((m4Scene.match(/new THREE\.RawShaderMaterial/g) ?? []).length, 1);
  assert.equal((m4Scene.match(/<instancedMesh/g) ?? []).length, 1);
});

