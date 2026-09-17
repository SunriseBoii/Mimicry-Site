import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { checkpointSha256 } from "./checkpoint-hash";
import { ALL_COMPETENCE_MASK, COMPETENCE_BIT } from "../app/visual-lab/photonic-skin-ps04-m2/photonic-palette";
import {
  hasCenterDwell,
  paletteLeadsGeometry,
  paletteProgressFromGeometryM5,
  positionProgressFromGeometryM5,
} from "../app/visual-lab/photonic-skin-ps04-m5/m5-choreography";
import {
  FROZEN_CAMERAS,
  ORIGINAL_M53_VIDEO_VARIANTS,
  parseSandboxQuery,
  SANDBOX_DEFAULTS,
  sandboxSearch,
  VARIANT_META,
  VIDEO_VARIANTS,
} from "../app/visual-lab/photonic-skin-ps04-m5/video-sandbox/sandbox-query";
import { cloneVideoEntry } from "../app/visual-lab/photonic-skin-ps04-m5/video-sandbox/variant-overlay";
import { createLoadGate, loadingLabel } from "../app/visual-lab/photonic-skin-ps04-m5/video-sandbox/sandbox-load-gate";
import {
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
  indexStates,
  resolveScreenActorContract,
} from "../app/visual-lab/photonic-skin-ps04-m5/screen-actor-contract";
import { ActorTransitionCoordinator } from "../app/visual-lab/photonic-skin-ps04-m5/transition-coordinator";
import { visibleComponents } from "../app/visual-lab/photonic-skin-m4-1r/photonic-presentation";
import { FROZEN_CAMERAS as EVENT_CAMERAS } from "../app/visual-lab/photonic-skin-ps04-m5/event-sandbox/sandbox-query";

const ROOT = process.cwd();
const STRIDE = 40;
const N = 16384;
const PREFIXES = [512, 1024, 2048, 4096, 8192, 12288, 16384];
const OWNER_SPEC_HASH = "4f7d67fb8ee37a0fb1fb024a8e68b6bf39486db414b6016edbc7fbcb41ba018e";
const FROZEN_VIDEO = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b";
const EVENT_A_R2 = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b";
const AGGREGATE = "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361";
const M53_CHECKPOINT = "72eb53b1a2a76a6851a23b45560ad55ba149cc65";
const ORIGINAL = {
  baseline: FROZEN_VIDEO,
  "combo-20": "ed88723a879416d4302d0146770c46956019c6941229a0fb28db0d843f67032f",
  "combo-30": "4e9f22ae50cb581951decedf2d479ef3670f504ffdc93abb909befda2c7d7cdb",
  "combo-40": "5efc8dbf7e65928c05727185dd6ef8ee13ccf7f080320bf4bde675c03befe726",
  "camera-20": "db4a0e7f05ab591b22e11413a7dd3aad29d2fba1acf3da081ca87132cc8b6b64",
  "camera-30": "a04c36a24b9f61f536fbc2fea9d74b7aaa1393d61b2e4494b023164ef84ded83",
  "camera-40": "0d08273d1c485b82ae994d32a240fd3c7994f8046d92feeace28c1d13f259d6c",
} as const;
const R1 = {
  "combo-20-r1": "f3b6aa2e5b8e91f9f033a6b839f21d9fa7f5cd29722794b86966964e8bf629b5",
  "combo-30-r1": "f54ed82e28cf82f55ca41c45d6c97dd315fb9fcd6c4945d90a70373af25b92f5",
  "combo-40-r1": "2d6957815b6f58f87f1709e0378313cba271530b8fb0e02282b556780448a873",
} as const;

const home = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
const sandboxLab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/video-sandbox/VideoSandboxLab.tsx"), "utf8");
const querySrc = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/video-sandbox/sandbox-query.ts"), "utf8");
const panelSrc = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/video-sandbox/SandboxReviewPanel.tsx"), "utf8");
const overlaySrc = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/video-sandbox/variant-overlay.ts"), "utf8");
const eventLab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/event-sandbox/EventSandboxLab.tsx"), "utf8");
const orientation = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-03-m3-1r/descriptors/orientation-contract.json"), "utf8"));
const spec = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1/references/clapperboard-anatomy-spec.md"), "utf8");
const proof = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1/reports/selective-edit-proof.json"), "utf8"));
const pivot = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1/reports/pivot-proof.json"), "utf8"));
const gates = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1/reports/geometry-gates.json"), "utf8"));
const rootCause = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1/reports/m53-detached-bar-root-cause.json"), "utf8"));
const twoRun = existsSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1/reports/two-run-identity.json"))
  ? JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1/reports/two-run-identity.json"), "utf8"))
  : null;

function shaFile(file: string) {
  return checkpointSha256(path.join(ROOT, file));
}

function loadBin(rel: string) {
  const buf = readFileSync(path.join(ROOT, rel));
  assert.equal(buf.byteLength, N * STRIDE);
  return { buf, hash: createHash("sha256").update(buf).digest("hex") };
}

function componentOf(buf: Buffer, id: number) {
  return buf[id * STRIDE + 30];
}

function statusOf(buf: Buffer, id: number) {
  return buf[id * STRIDE + 32];
}

function lodOf(buf: Buffer, id: number) {
  return buf.readUInt16LE(id * STRIDE + 36);
}

test("owner specification is present, fully read, and hash-matches", () => {
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-3-r1/references/clapperboard-anatomy-spec.md"), OWNER_SPEC_HASH);
  assert.equal(shaFile("docs/ps-04-m5-3-r1-clapperboard-anatomy-spec.md"), OWNER_SPEC_HASH);
  assert.match(spec, /documentId: PS04-M53R1-CLAPPERBOARD-ANATOMY/);
  assert.match(spec, /Pivot-aware construction/);
  assert.match(spec, /openAngleDegrees: 30/);
  assert.equal(proof.ownerSpec.ownerSpecRead, true);
  assert.equal(proof.ownerSpec.ownerSpecIsSourceOfTruth, true);
  assert.equal(proof.ownerSpec.ownerSpecHash, OWNER_SPEC_HASH);
});

test("M5.3 checkpoint commit is preserved in project history", () => {
  const checkpoint = execFileSync("git", ["rev-parse", M53_CHECKPOINT], { encoding: "utf8" }).trim();
  assert.equal(checkpoint, M53_CHECKPOINT);
  const subject = execFileSync("git", ["show", "-s", "--format=%s", M53_CHECKPOINT], { encoding: "utf8" });
  assert.match(subject, /add Video associative object sandbox/);
  execFileSync("git", ["merge-base", "--is-ancestor", M53_CHECKPOINT, "HEAD"]);
});

test("original M5.3, camera-only, baseline and Event A-R2 hashes are unchanged", () => {
  for (const [name, hash] of Object.entries(ORIGINAL)) {
    assert.equal(shaFile(`design/photonic-skin/ps-04-m5-3/variants/${name}/single-video.state.bin`), hash);
    assert.equal(shaFile(`public/photonic-skin/ps-04-m5-3/variants/${name}/single-video.state.bin`), hash);
  }
  assert.equal(shaFile("public/photonic-skin/ps-03-m3-1r/states/single-video.state.bin"), FROZEN_VIDEO);
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-2-r2/variants/a-r2/single-event.state.bin"), EVENT_A_R2);
  const m41 = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-03-m4-1/exports/ps03m41-manifest.json"), "utf8"));
  assert.equal(m41.aggregateContentHash, AGGREGATE);
});

test("R1 combos are derived from matching M5.3 combos with non-clapper byte identity", () => {
  for (const [name, hash] of Object.entries(R1)) {
    const design = loadBin(`design/photonic-skin/ps-04-m5-3-r1/variants/${name}/single-video.state.bin`);
    const published = loadBin(`public/photonic-skin/ps-04-m5-3-r1/variants/${name}/single-video.state.bin`);
    assert.equal(design.hash, hash);
    assert.equal(published.hash, hash);
    const sourceName = name.replace("-r1", "");
    const source = loadBin(`design/photonic-skin/ps-04-m5-3/variants/${sourceName}/single-video.state.bin`);
    assert.equal(source.hash, ORIGINAL[sourceName as keyof typeof ORIGINAL]);
    const row = proof.variants[name];
    assert.equal(row.derivedFromMatchingM53Combo, true);
    assert.equal(row.nonClapperByteIdentity, true);
    assert.equal(row.slateBoardUnchanged, true);
    assert.equal(row.cameraBodyUnchanged, true);
    assert.equal(row.scaleChanged, false);
    assert.equal(row.densityChanged, false);
    for (let id = 0; id < N; id += 1) {
      assert.equal(lodOf(design.buf, id), id);
      const component = componentOf(design.buf, id);
      if (component <= 4) {
        assert.equal(design.buf.subarray(id * STRIDE, (id + 1) * STRIDE).equals(source.buf.subarray(id * STRIDE, (id + 1) * STRIDE)), true);
      }
    }
  }
});

test("pivot uses board normal, hinge pivot, and 30° lift", () => {
  assert.equal(rootCause.confirmed, true);
  assert.equal(gates.pass, true);
  for (const name of Object.keys(R1)) {
    const row = pivot.variants[name];
    assert.equal(Math.abs(row.openAngleAbs - 30) < 1, true);
    assert.ok(row.pivotError <= 1e-4);
    assert.equal(row.barTipAboveBarRoot, true);
    assert.ok(row.dotOpenBarDirectionV > 0);
    assert.ok(Math.abs(row.tipRise - row.expectedTipRise) / row.expectedTipRise < 0.08);
    const n = row.rotationAxis;
    const length = Math.hypot(n[0], n[1], n[2]);
    assert.ok(Math.abs(n[1] / length) > 0.8, "rotation axis is board normal, not long X");
  }
  assert.equal(pivot.kinematicsLocal.signedOpenAngle, -30);
  assert.deepEqual(pivot.kinematicsLocal.rotationAxisLocal, [0, 1, 0]);
});

test("bar root meets hinge, wedge opens, clapper is one assembly", () => {
  for (const name of Object.keys(R1)) {
    const row = gates.variants[name];
    assert.equal(row.contact.pass, true);
    assert.ok(row.connectivity.mainShare >= 0.98);
    assert.equal(row.connectivity.remoteIsland, false);
    assert.equal(row.connectivity.morphologicalClosingUsed, false);
    assert.equal(row.silhouette.silhouette180.detachedBarIsland, false);
    assert.equal(row.silhouette.silhouette96.detachedBarIsland, false);
    const gaps = row.wedge.map((item: { gap: number }) => item.gap);
    assert.ok(gaps[gaps.length - 1] > gaps[0]);
  }
});

test("LOD prefixes keep board, rail, hinge and bar without ID renumbering", () => {
  const combo = loadBin("design/photonic-skin/ps-04-m5-3-r1/variants/combo-30-r1/single-video.state.bin");
  for (const prefix of PREFIXES) {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (let id = 0; id < prefix; id += 1) {
      if (statusOf(combo.buf, id) === 0) counts[componentOf(combo.buf, id)] += 1;
      assert.equal(lodOf(combo.buf, id), id);
    }
    assert.ok(counts[4] > 0, `board at ${prefix}`);
    assert.ok(counts[5] > 0, `rail/hinge at ${prefix}`);
    assert.ok(counts[6] > 0, `bar at ${prefix}`);
    const lod = gates.variants["combo-30-r1"].lod[String(prefix)];
    assert.ok(lod.hinge > 0, `hinge samples at ${prefix}`);
  }
});

test("R1 sandbox defaults, HUD contract and isolates", () => {
  assert.equal(SANDBOX_DEFAULTS.variant, "combo-30-r1");
  assert.equal(parseSandboxQuery("").variant, "combo-30-r1");
  assert.equal(parseSandboxQuery("?variant=combo-30-r1&view=canonical&theme=light&labels=0&mode=settled").variant, "combo-30-r1");
  assert.match(sandboxSearch({ variant: "combo-30-r1", view: "canonical", theme: "light", labels: false, mode: "settled" }), /variant=combo-30-r1/);
  assert.equal(VARIANT_META["combo-30-r1"].hudName, "VIDEO_COMBO_30_R1");
  assert.equal(VARIANT_META["combo-30-r1"].clapperOpenDegrees, 30);
  assert.equal(VARIANT_META["combo-30-r1"].signedYawDegrees, -30);
  assert.match(VARIANT_META["combo-30-r1"].hingeStatus, /connected/);
  assert.match(panelSrc, /Composition yaw/);
  assert.match(panelSrc, /Clapper open angle/);
  assert.match(panelSrc, /Hinge:/);
  assert.match(panelSrc, /R1 — соединённый шарнир/);
  assert.match(panelSrc, /M5.3 — брусок отделён/);
  assert.match(panelSrc, /aria-pressed/);
  assert.match(querySrc, /combo-30-r1/);
  assert.match(sandboxLab, /PS-04.M5.3.R1/);
  assert.match(sandboxLab, /displayedVariant/);
  assert.match(sandboxLab, /requestedVariant/);
  assert.doesNotMatch(sandboxLab, /new THREE\.Mesh/);
  assert.ok(VIDEO_VARIANTS.includes("combo-20-r1"));
  assert.ok(VIDEO_VARIANTS.includes("combo-30"));
  assert.equal(loadingLabel("VIDEO_COMBO_30_R1"), "Загружается VIDEO_COMBO_30_R1…");
  const gate = createLoadGate();
  const first = gate.next();
  const second = gate.next();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
});

test("cameras, production, Event A-R2 and aggregate Video states stay frozen", () => {
  assert.deepEqual([...FROZEN_CAMERAS.canonical], orientation.cameraRolePromotion.canonical);
  assert.deepEqual(FROZEN_CAMERAS.canonical, EVENT_CAMERAS.canonical);
  assert.match(home, /ProductionPhotonicSiteClient/);
  assert.doesNotMatch(home, /video-sandbox/);
  assert.doesNotMatch(home, /ps-04-m5-3-r1/);
  assert.match(eventLab, /PS-04.M5.2.R2/);
  assert.match(sandboxLab, /cameraPreset=\{view === "opposite" \? "canonical" : view\}/);
  assert.doesNotMatch(querySrc, /force_visible/);
  assert.equal(overlaySrc.includes("hinge: [5, 6]"), true);
});

test("Video → Digital choreography and footer remain one-clock", () => {
  const coordinator = new ActorTransitionCoordinator();
  coordinator.adoptSettled({
    nodeId: "05.5",
    hostNodeId: "05.5",
    family: "SINGLE",
    requestedFamily: "SINGLE",
    resolvedGeometryId: SINGLE_STATE_IDS.video,
    paletteMask: COMPETENCE_BIT.video,
    slot: "left",
    fitProfile: "single",
    resolution: "exact",
    applyPaletteOverride: false,
    reason: "test",
  });
  const toDigital = coordinator.begin({
    next: {
      nodeId: "05.6",
      hostNodeId: "05.6",
      family: "SINGLE",
      requestedFamily: "SINGLE",
      resolvedGeometryId: SINGLE_STATE_IDS.digital,
      paletteMask: COMPETENCE_BIT.digital,
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
      paletteMask: COMPETENCE_BIT.video,
      paletteProgress: 1,
      geometryId: SINGLE_STATE_IDS.video,
      nodeId: "05.5",
    },
    nowSeconds: 0,
    reducedMotion: false,
  });
  assert.equal(toDigital.transaction.sourceGeometryId, SINGLE_STATE_IDS.video);
  assert.equal(toDigital.transaction.targetGeometryId, SINGLE_STATE_IDS.digital);
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

test("R1 overlay keeps clapper visible and isolation is not a second actor", () => {
  const sidecar = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1/variants/combo-30-r1/component-map.json"), "utf8"));
  const frozen = { stateId: "single-video", componentMap: [{ componentIndex: 0, visibleProfiles: ["desktop"] }] } as never;
  const full = cloneVideoEntry(frozen, "combo-30-r1", 10, "x", sidecar.componentMap);
  const shown = visibleComponents(full as never, "desktop");
  assert.equal(shown.has(4), true);
  assert.equal(shown.has(5), true);
  assert.equal(shown.has(6), true);
  const hinge = cloneVideoEntry(frozen, "combo-30-r1", 10, "x", sidecar.componentMap, "hinge");
  const iso = visibleComponents(hinge as never, "desktop");
  assert.equal(iso.has(5), true);
  assert.equal(iso.has(6), true);
  assert.equal(iso.has(0), false);
});

test("owner HUMAN PASS records VIDEO_COMBO_40_R1 without canonical promotion", () => {
  const review = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1/reports/human-review.md"), "utf8");
  const stageManifest = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1/manifest.json"), "utf8"));
  assert.match(review, /HUMAN PASS \/ SELECTED M5 VIDEO CANDIDATE/);
  assert.equal(stageManifest.status, "HUMAN PASS / SELECTED M5 VIDEO CANDIDATE");
  assert.equal(stageManifest.selectedCandidate, "VIDEO_COMBO_40_R1");
  assert.equal(stageManifest.selectedComposition, "camera+clapperboard");
  assert.equal(stageManifest.selectedCompositionYawDegrees, -40);
  assert.equal(stageManifest.selectedClapperOpenAngleDegrees, 30);
  assert.equal(stageManifest.selectedHash, R1["combo-40-r1"]);
  assert.equal(stageManifest.notCanonicalYet, true);
  assert.equal(stageManifest.notProductionApproval, true);
  assert.equal(stageManifest.productionApproval, false);
  assert.equal(stageManifest.promotionDeferredTo, "PS-04.M5.5");
  assert.equal(stageManifest.m54Started, false);
  assert.equal(VARIANT_META["combo-40-r1"].signedYawDegrees, -40);
  assert.equal(VARIANT_META["combo-40-r1"].clapperOpenDegrees, 30);
  assert.match(VARIANT_META["combo-40-r1"].decision, /HUMAN PASS/);
  assert.match(VARIANT_META["combo-40-r1"].decision, /SELECTED M5 VIDEO CANDIDATE/);
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-3-r1/variants/combo-40-r1/single-video.state.bin"), R1["combo-40-r1"]);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-3-r1/variants/combo-40-r1/single-video.state.bin"), R1["combo-40-r1"]);
  assert.equal(shaFile("public/photonic-skin/ps-03-m3-1r/states/single-video.state.bin"), FROZEN_VIDEO);
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-2-r2/variants/a-r2/single-event.state.bin"), EVENT_A_R2);
});

test("two independent authoring runs emit identical hashes", () => {
  assert.ok(twoRun, "two-run-identity.json must exist");
  assert.equal(twoRun.identical, true);
  assert.equal(twoRun.combo30r1, R1["combo-30-r1"]);
});

test("browser smoke, paced transitions and cache plateau when captured", () => {
  const smokePath = path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1/reports/browser-smoke.json");
  const transitionPath = path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1/reports/transition-regression.json");
  const perfPath = path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1/reports/performance-qa.json");
  if (!existsSync(smokePath) || !existsSync(transitionPath) || !existsSync(perfPath)) return;
  const smoke = JSON.parse(readFileSync(smokePath, "utf8"));
  const transition = JSON.parse(readFileSync(transitionPath, "utf8"));
  const perf = JSON.parse(readFileSync(perfPath, "utf8"));
  assert.equal(smoke.defaultRoute.displayed, "combo-30-r1");
  assert.equal(smoke.defaultRoute.hash, R1["combo-30-r1"]);
  assert.equal(smoke.defaultRoute.canvases, 1);
  assert.equal(smoke.combo30r1.draws, 1);
  assert.equal(smoke.combo30r1.triangles, 131072);
  assert.equal(smoke.liveSwitchToOriginal.documentReloads, 0);
  assert.equal(smoke.production.hasSandbox, false);
  assert.equal(smoke.eventSandbox.hash, EVENT_A_R2);
  assert.equal(transition.pacedPass, true);
  assert.equal(transition.pacedVideoDigital.paletteLeads, 0);
  assert.equal(transition.pacedVideoDigital.centerDeclaredAsTarget, 0);
  assert.equal(transition.rapidResidual.assertionsWeakened, false);
  assert.equal(transition.rapidResidual.fixedOnM53R1, false);
  assert.equal(perf.cycleCount, 20);
  assert.equal(perf.invariants.instances, 16384);
  assert.equal(perf.leak, false);
});

test("original M53 variant list remains a subset of the sandbox", () => {
  for (const name of ORIGINAL_M53_VIDEO_VARIANTS) {
    assert.ok((VIDEO_VARIANTS as readonly string[]).includes(name));
  }
});
