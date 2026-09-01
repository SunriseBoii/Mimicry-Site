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
import { parseSandboxQuery as parseEventQuery, FROZEN_CAMERAS as EVENT_CAMERAS } from "../app/visual-lab/photonic-skin-ps04-m5/event-sandbox/sandbox-query";

const ROOT = process.cwd();
const STRIDE = 40;
const N = 16384;
const PREFIXES = [512, 1024, 2048, 4096, 8192, 12288, 16384];
const FROZEN_VIDEO = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b";
const EVENT_A_R2 = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b";
const EVENT_A = "76c46452781c4334b4d91cca9ed6533bb9ccd7224c57bdf7abf7e1093d1c938d";
const EVENT_A_R1 = "89f50d4c83b15de21b753f98d6ab368e974c20a91ed135668bbaf05445b898cc";
const M52_SOURCE = "34e19852c76aec43e6a07c005ede69573481b7957c8c6b087111054591c7c87e";
const M51_SOURCE = "8ee1cc11289be4b277eccf5a9b578029cfb1625d34eb6dbd0bbc010a768cc556";
const AGGREGATE = "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361";
const HEAD = "93a1a7ab1950e7c36b433febff801cacfbd004df";
const BRANCH = "ps04-m5-sandbox";
const HASHES = {
  baseline: FROZEN_VIDEO,
  "combo-20": "ed88723a879416d4302d0146770c46956019c6941229a0fb28db0d843f67032f",
  "combo-30": "4e9f22ae50cb581951decedf2d479ef3670f504ffdc93abb909befda2c7d7cdb",
  "combo-40": "5efc8dbf7e65928c05727185dd6ef8ee13ccf7f080320bf4bde675c03befe726",
  "camera-20": "db4a0e7f05ab591b22e11413a7dd3aad29d2fba1acf3da081ca87132cc8b6b64",
  "camera-30": "a04c36a24b9f61f536fbc2fea9d74b7aaa1393d61b2e4494b023164ef84ded83",
  "camera-40": "0d08273d1c485b82ae994d32a240fd3c7994f8046d92feeace28c1d13f259d6c",
} as const;
const COMBO_PARTS = ["camera-body", "camera-lens", "camera-top", "camera-rear", "slate-board", "slate-fixed-rail", "slate-hinged-bar"] as const;
const CAMERA_PARTS = ["camera-body", "camera-lens", "camera-top", "camera-rear"] as const;

const m51Hashes = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-1/reports/checkpoint-hashes.json"), "utf8"));
const m52Hashes = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2/reports/checkpoint-hashes.json"), "utf8"));
const home = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
const sandboxLab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/video-sandbox/VideoSandboxLab.tsx"), "utf8");
const querySrc = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/video-sandbox/sandbox-query.ts"), "utf8");
const panelSrc = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/video-sandbox/SandboxReviewPanel.tsx"), "utf8");
const overlaySrc = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/video-sandbox/variant-overlay.ts"), "utf8");
const eventLab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/event-sandbox/EventSandboxLab.tsx"), "utf8");
const orientation = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-03-m3-1r/descriptors/orientation-contract.json"), "utf8"));

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

function componentOf(buf: Buffer, id: number) {
  return buf[id * STRIDE + 30];
}

function statusOf(buf: Buffer, id: number) {
  return buf[id * STRIDE + 32];
}

function lodOf(buf: Buffer, id: number) {
  return buf.readUInt16LE(id * STRIDE + 36);
}

test("M5.3 baseline HEAD is the R2 approval commit on ps04-m5-sandbox", () => {
  const snap = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3/reports/git-snapshot.json"), "utf8"));
  assert.equal(snap.branch, BRANCH);
  assert.equal(snap.head, HEAD);
  assert.match(snap.headMessage, /approve Event A R2/);
  assert.equal(snap.push, false);
  assert.equal(snap.deploy, false);
  assert.equal(snap.m53Committed, false);
});

test("M5.2.R2 human acceptance remains recorded and R2 hash is unchanged", () => {
  const review = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r2/reports/human-review.md"), "utf8");
  const stageManifest = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r2/manifest.json"), "utf8"));
  assert.match(review, /HUMAN PASS \/ SELECTED M5 EVENT CANDIDATE/);
  assert.equal(stageManifest.status, "HUMAN PASS / SELECTED M5 EVENT CANDIDATE");
  assert.equal(stageManifest.selectedCandidate, "EVENT_A_R2");
  assert.equal(stageManifest.notCanonicalYet, true);
  assert.equal(stageManifest.notProductionApproval, true);
  assert.equal(stageManifest.promotionDeferredTo, "PS-04.M5.5");
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-2-r2/variants/a-r2/single-event.state.bin"), EVENT_A_R2);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-2/variants/a-r2/single-event.state.bin"), EVENT_A_R2);
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-2/variants/a/single-event.state.bin"), EVENT_A);
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-2-r1/variants/a-r1/single-event.state.bin"), EVENT_A_R1);
  assert.equal(m52Hashes.source, M52_SOURCE);
  assert.equal(aggregate(m51Hashes.sourceFiles), M51_SOURCE);
});

test("Event sandbox route and R2 HUD remain intact", () => {
  assert.match(eventLab, /PS-04.M5.2.R2/);
  assert.match(eventLab, /__PS04M52_LAB__/);
  assert.equal(parseEventQuery("").variant, "a-r2");
  assert.deepEqual(EVENT_CAMERAS.canonical, [2.8, -7.8, 4.6]);
});

test("production / remains SiteShell and Video sandbox is not production", () => {
  assert.match(home, /SiteShell/);
  assert.doesNotMatch(home, /video-sandbox/);
  assert.doesNotMatch(home, /event-sandbox/);
  assert.doesNotMatch(home, /ps-04-m5-3/);
});

test("original SINGLE Video hash is frozen and published as VIDEO_BASELINE", () => {
  assert.equal(shaFile("public/photonic-skin/ps-03-m3-1r/states/single-video.state.bin"), FROZEN_VIDEO);
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-3/variants/baseline/single-video.state.bin"), FROZEN_VIDEO);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-3/variants/baseline/single-video.state.bin"), FROZEN_VIDEO);
  const m41 = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-03-m4-1/exports/ps03m41-manifest.json"), "utf8"));
  assert.equal(m41.aggregateContentHash, AGGREGATE);
});

test("seven original M5.3 Video variants remain published with frozen hashes", () => {
  assert.ok(VIDEO_VARIANTS.includes("combo-30"));
  assert.ok(VIDEO_VARIANTS.includes("combo-30-r1"));
  assert.deepEqual([...ORIGINAL_M53_VIDEO_VARIANTS].sort(), ["baseline", "camera-20", "camera-30", "camera-40", "combo-20", "combo-30", "combo-40"]);
  for (const name of ORIGINAL_M53_VIDEO_VARIANTS) {
    const design = loadBin(`design/photonic-skin/ps-04-m5-3/variants/${name}/single-video.state.bin`);
    const published = loadBin(`public/photonic-skin/ps-04-m5-3/variants/${name}/single-video.state.bin`);
    assert.equal(design.hash, HASHES[name]);
    assert.equal(published.hash, HASHES[name]);
    assert.equal(design.hash, published.hash);
    for (let id = 0; id < N; id += 1) {
      assert.equal(lodOf(design.buf, id), id);
      assert.ok(Number.isFinite(design.buf.readFloatLE(id * STRIDE)));
    }
  }
  assert.notEqual(HASHES["combo-20"], HASHES["combo-30"]);
  assert.notEqual(HASHES["combo-30"], HASHES["combo-40"]);
  assert.notEqual(HASHES["camera-30"], HASHES["combo-30"]);
});

test("two authoring runs reproduce the same hashes", () => {
  const proof = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3/reports/two-run-identity.json"), "utf8"));
  assert.equal(proof.identical, true);
  assert.equal(proof.run1["combo-30"], HASHES["combo-30"]);
  assert.equal(proof.run2["combo-30"], HASHES["combo-30"]);
  assert.equal(proof.run1.baseline, FROZEN_VIDEO);
});

test("clapper board and hinged bar are separate parts with non-empty visibleProfiles", () => {
  const map = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3/variants/combo-30/component-map.json"), "utf8"));
  assert.deepEqual(map.componentIds, [...COMBO_PARTS]);
  assert.equal(map.componentIds[4], "slate-board");
  assert.equal(map.componentIds[6], "slate-hinged-bar");
  assert.notEqual(map.componentIds[4], map.componentIds[6]);
  for (const item of map.componentMap) {
    assert.ok(item.visibleProfiles.includes("desktop"));
    assert.ok(item.visibleProfiles.includes("mobile390"));
    assert.ok(item.visibleProfiles.includes("silhouette180"));
    assert.ok(item.visibleProfiles.includes("silhouette96"));
  }
  const cameraMap = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3/variants/camera-30/component-map.json"), "utf8"));
  assert.deepEqual(cameraMap.componentIds, [...CAMERA_PARTS]);
});

test("combo LOD prefixes keep body, lens, board and hinged bar", () => {
  const combo = loadBin("design/photonic-skin/ps-04-m5-3/variants/combo-30/single-video.state.bin");
  const camera = loadBin("design/photonic-skin/ps-04-m5-3/variants/camera-30/single-video.state.bin");
  for (const prefix of PREFIXES) {
    const comboCounts = [0, 0, 0, 0, 0, 0, 0];
    const cameraCounts = [0, 0, 0, 0];
    for (let id = 0; id < prefix; id += 1) {
      if (statusOf(combo.buf, id) === 0) comboCounts[componentOf(combo.buf, id)] += 1;
      if (statusOf(camera.buf, id) === 0 && componentOf(camera.buf, id) < 4) cameraCounts[componentOf(camera.buf, id)] += 1;
    }
    assert.ok(comboCounts[0] > 0, `body at ${prefix}`);
    assert.ok(comboCounts[1] > 0, `lens at ${prefix}`);
    assert.ok(comboCounts[4] > 0, `board at ${prefix}`);
    assert.ok(comboCounts[6] > 0, `bar at ${prefix}`);
    assert.ok(cameraCounts[0] > 0, `camera body at ${prefix}`);
    assert.ok(cameraCounts[1] > 0, `camera lens at ${prefix}`);
    assert.ok(cameraCounts[2] + cameraCounts[3] > 0, `camera asymmetry at ${prefix}`);
  }
});

test("overlay packed activation keeps Video parts visible; isolation is not a second actor", () => {
  const sidecar = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3/variants/combo-30/component-map.json"), "utf8"));
  const frozen = {
    stateId: "single-video",
    componentMap: [
      { componentIndex: 0, visibleProfiles: ["desktop"] },
      { componentIndex: 1, visibleProfiles: ["desktop", "mobile390"] },
    ],
  } as never;
  const full = cloneVideoEntry(frozen, "combo-30", 10, "x", sidecar.componentMap);
  const map = (full as unknown as { componentMap: Array<{ componentIndex: number; visibleProfiles: string[] }> }).componentMap;
  assert.equal(map.length, 7);
  for (const item of map) {
    const shown = visibleComponents(full as never, "desktop");
    assert.ok(shown.has(item.componentIndex));
    assert.ok(item.visibleProfiles.includes("silhouette180"));
  }
  const isolated = cloneVideoEntry(frozen, "combo-30", 10, "x", sidecar.componentMap, "hinged-bar");
  const iso = visibleComponents(isolated as never, "desktop");
  assert.equal(iso.has(6), true);
  assert.equal(iso.has(0), false);
  assert.equal(iso.has(4), false);
  assert.match(overlaySrc, /ALL_PROFILES/);
  assert.doesNotMatch(sandboxLab, /new THREE\.Mesh/);
  assert.match(sandboxLab, /one actor|InstancedMesh|PS04M5Scene/);
});

test("Video sandbox still exposes original M5.3 variants and R1 URL contract", () => {
  assert.equal(SANDBOX_DEFAULTS.variant, "combo-30-r1");
  assert.equal(SANDBOX_DEFAULTS.view, "canonical");
  assert.equal(SANDBOX_DEFAULTS.theme, "light");
  assert.equal(SANDBOX_DEFAULTS.labels, false);
  assert.equal(SANDBOX_DEFAULTS.mode, "settled");
  assert.equal(parseSandboxQuery("").variant, "combo-30-r1");
  assert.equal(parseSandboxQuery("?variant=nope").variant, "combo-30-r1");
  assert.equal(parseSandboxQuery("?variant=nope").invalidVariant, true);
  assert.equal(parseSandboxQuery("?variant=baseline").variant, "baseline");
  assert.equal(parseSandboxQuery("?variant=combo-30").variant, "combo-30");
  assert.equal(parseSandboxQuery("?variant=combo-20&view=alternate&theme=dark&labels=1&mode=transition").mode, "transition");
  assert.match(sandboxSearch({ variant: "combo-30", view: "canonical", theme: "light", labels: false, mode: "settled" }), /variant=combo-30/);
  assert.doesNotMatch(sandboxSearch({ variant: "combo-30", view: "canonical", theme: "light", labels: false, mode: "settled" }), /isolate=/);
  assert.equal(VARIANT_META["combo-30"].hudName, "VIDEO_COMBO_30");
  assert.equal(VARIANT_META["combo-30"].signedYawDegrees, -30);
  assert.match(VARIANT_META["combo-30"].decision, /detached|rejected/);
  assert.match(sandboxLab, /loadGateRef/);
  assert.match(sandboxLab, /pushState/);
  assert.match(sandboxLab, /popstate/);
  assert.match(sandboxLab, /displayedVariant/);
  assert.match(sandboxLab, /requestedVariant/);
  assert.match(sandboxLab, /setDisplayedVariant\(requestedVariant\)/);
  assert.match(sandboxLab, /PS-04.M5.3/);
  assert.match(panelSrc, /aria-pressed/);
  assert.match(panelSrc, /displayedMeta\?\.hudName/);
  assert.match(querySrc, /VIDEO_COMBO_30/);
  assert.match(querySrc, /combo-30/);
  const gate = createLoadGate();
  const first = gate.next();
  const second = gate.next();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  assert.equal(loadingLabel("VIDEO_COMBO_30"), "Загружается VIDEO_COMBO_30…");
});

test("signed yaw is negative around +Z and cameras/framing stay frozen", () => {
  const params = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3/authoring/parameters.json"), "utf8"));
  assert.equal(params.yawSign, -1);
  assert.deepEqual(params.signedYawDegrees, [-20, -30, -40]);
  assert.equal(params.yawAxis, "+Z");
  assert.deepEqual([...FROZEN_CAMERAS.canonical], orientation.cameraRolePromotion.canonical);
  assert.deepEqual([...FROZEN_CAMERAS.alternate], orientation.cameraRolePromotion.alternate);
  assert.deepEqual([...FROZEN_CAMERAS.side], orientation.cameraRolePromotion.side);
  assert.deepEqual([...FROZEN_CAMERAS.top], orientation.cameraRolePromotion.top);
  assert.deepEqual(FROZEN_CAMERAS.canonical, EVENT_CAMERAS.canonical);
  assert.deepEqual(FROZEN_CAMERAS.opposite, EVENT_CAMERAS.opposite);
  assert.match(sandboxLab, /cameraPreset=\{view === "opposite" \? "canonical" : view\}/);
  assert.doesNotMatch(querySrc, /force_visible/);
});

test("Video → Digital and Digital → Video keep M5.1 choreography contracts", () => {
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
  const reverse = coordinator.begin({
    next: {
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
    },
    displayed: {
      slot: "left",
      fit: 1.36,
      fitProfile: "single",
      paletteMask: COMPETENCE_BIT.digital,
      paletteProgress: 1,
      geometryId: SINGLE_STATE_IDS.digital,
      nodeId: "05.6",
    },
    nowSeconds: 1,
    reducedMotion: false,
  });
  assert.equal(reverse.transaction.sourceGeometryId, SINGLE_STATE_IDS.digital);
  assert.equal(reverse.transaction.targetGeometryId, SINGLE_STATE_IDS.video);
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
  assert.equal(SINGLE_STATE_IDS.video, "single-video");
  assert.equal(SINGLE_STATE_IDS.digital, "single-digital");
});

test("Video aggregate inventory is recorded and canonical states are not rewritten", () => {
  const impact = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3/reports/video-state-impact.json"), "utf8"));
  assert.equal(impact.videoContainingStateCount, 65);
  assert.equal(impact.canonicalAggregateUntouched, true);
  assert.equal(impact.frozenSingleVideoUntouched, true);
  assert.equal(impact.variantsNotPromoted, true);
  const anatomy = JSON.parse(readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-3/reports/anatomy-validation.json"), "utf8"));
  assert.equal(anatomy.pass, true);
});

test("M5.3 evidence files exist", () => {
  const files = [
    "design/photonic-skin/ps-04-m5-3/manifest.json",
    "design/photonic-skin/ps-04-m5-3/reports/video-baseline-analysis.md",
    "design/photonic-skin/ps-04-m5-3/reports/video-state-impact.json",
    "design/photonic-skin/ps-04-m5-3/reports/candidate-parameters.json",
    "design/photonic-skin/ps-04-m5-3/reports/anatomy-validation.json",
    "design/photonic-skin/ps-04-m5-3/reports/lod-validation.json",
    "design/photonic-skin/ps-04-m5-3/authoring/parameters.json",
    "app/visual-lab/photonic-skin-ps04-m5/video-sandbox/page.tsx",
    "app/visual-lab/photonic-skin-ps04-m5/video-sandbox/preview/page.tsx",
    "public/photonic-skin/ps-04-m5-3/variants/combo-30/single-video.state.bin",
  ];
  for (const file of files) {
    assert.ok(existsSync(path.join(ROOT, file)), file);
    if (file.endsWith(".json")) JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
  }
});
