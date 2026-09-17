import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { checkpointSha256, checkpointText, rawSha256 } from "./checkpoint-hash";
import { ALL_COMPETENCE_MASK, maskFromCompetencies } from "../app/visual-lab/photonic-skin-ps04-m2/photonic-palette";
import { PALETTE_DELAY_FRACTION } from "../app/visual-lab/photonic-skin-ps04-m5/m5-choreography";
import { OWNER_SELECTED_PROFILE_ID } from "../app/visual-lab/photonic-skin-ps04-m5/framing";
import { indexStates, type StateIndex } from "../app/visual-lab/photonic-skin-ps04-m5/screen-actor-contract";
import { TASK_IDS } from "../app/visual-lab/photonic-skin-ps04-m5/build-flow";
import {
  ALL_SEVEN,
  BUILDER_TASK_IDS,
  CANONICAL_COMPETENCY_ORDER,
  EXISTING_M55_PREFIX_SETS,
  FROZEN_EVENT_HASH,
  FROZEN_VIDEO_HASH,
  M55_NAMESPACE,
  M61_NAMESPACE,
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
  canonicalizeCompetencySet,
  driveStateId,
  enumerateMultiCompetencySets,
  enumerateNonEmptyCompetencySets,
  gatherStateId,
  namespaceForStateId,
  type BuilderCompetency,
  HOVER_GEOMETRY_INFLUENCE,
  HOVER_PALETTE_INTENSITY,
  HOVER_ROTATION_BIAS_DEG,
} from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-ids";
import {
  BuilderCoverageError,
  assertNoForbiddenFallback,
  resolveBuilderActorContract,
  resolveBuilderState,
} from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-resolver";
import {
  INITIAL_BUILDER_FLOW,
  confirmCompetencies,
  editBrief,
  selectTask,
  setDraftCompetencies,
} from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-flow";
import { hoverPreviewFor } from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/hover-preview";
import {
  M55_CHECKPOINT,
  PAYLOAD_NAMESPACE,
  RELEASE_LOCK,
  SELECTED_EVENT_HASH,
  SELECTED_VIDEO_HASH,
} from "../app/_photonic-skin/release";
import { PROMOTED_ASSET_NAMESPACE } from "../app/_photonic-skin/runtime";

const ROOT = process.cwd();
const M60_CHECKPOINT = "0ea9e67184c1a8a5be9833d6ccd2e41f919f6a9a";
const RELEASE_LOCK_HASH = "a8609556f082e754f9d803611afee106cdb1069c2e713df579a8200e9ec6aae7";
const FROZEN_M55_MANIFEST_SHA = "69c3e5aa26b99a7d6564f1e4a58d67e5b928294c7f9f617b69cb142c662cc46a";
const STATE_BYTES = 16384 * 40;
const PUBLIC_M61 = path.join(ROOT, "public/photonic-skin/ps-04-m6-1");
const FROZEN_PRODUCTION = [
  "app/page.tsx",
  "app/_photonic-skin/release.ts",
  "app/_photonic-skin/runtime.ts",
  "app/_photonic-skin/ProductionPhotonicSiteClient.tsx",
  "app/_photonic-skin/PhotonicSiteRuntime.tsx",
  "app/visual-lab/photonic-skin-ps04-m5/screen-actor-contract.ts",
  "app/visual-lab/photonic-skin-ps04-m5/m5-choreography.ts",
  "app/visual-lab/photonic-skin-ps04-m5/promotion-preview/page.tsx",
  "app/visual-lab/photonic-skin-ps04-m5/promotion-preview/review/page.tsx",
  "public/photonic-skin/ps-04-m5-5",
];

function shaFile(file: string) {
  return checkpointSha256(path.join(ROOT, file));
}

function readJson(file: string) {
  return JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
}

function git(args: string[]) {
  return execFileSync("git", args, { encoding: "utf8", cwd: ROOT }).trim();
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const output: T[][] = [];
  items.forEach((item, index) => {
    for (const rest of permutations([...items.slice(0, index), ...items.slice(index + 1)])) {
      output.push([item, ...rest]);
    }
  });
  return output;
}

function loadMergedIndex(): { frozen: { states: Array<{ stateId: string; contentHash: string; competencyIds?: string[]; promotion?: { donors?: string[] } }> }; delta: ReturnType<typeof readJson>; index: StateIndex } {
  const frozen = readJson("public/photonic-skin/ps-04-m5-5/manifests/ps04m55-manifest.json");
  const delta = readJson("public/photonic-skin/ps-04-m6-1/manifests/ps04m61-delta-manifest.json");
  const byId = new Map();
  for (const entry of frozen.states) byId.set(entry.stateId, entry);
  for (const entry of delta.states) byId.set(entry.stateId, entry);
  return { frozen, delta, index: indexStates([...byId.values()]) };
}

test("M6.1 HUMAN PASS is checkpointed once and authorizes only M6.2", () => {
  execFileSync("git", ["merge-base", "--is-ancestor", M60_CHECKPOINT, "HEAD"], { cwd: ROOT });
  execFileSync("git", ["merge-base", "--is-ancestor", M55_CHECKPOINT, "HEAD"], { cwd: ROOT });
  const log = git(["log", "--oneline", "--grep", "approve project builder Mimic semantics"]);
  const commits = log.split(/\r?\n/).filter(Boolean);
  assert.equal(commits.length, 1);
  const checkpoint = git(["log", "-1", "--format=%H", "--grep", "approve project builder Mimic semantics"]);
  execFileSync("git", ["merge-base", "--is-ancestor", checkpoint, "HEAD"], { cwd: ROOT });
  assert.equal(git(["rev-parse", `${checkpoint}^`]), M60_CHECKPOINT);
  const m60Review = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m5-6/reports/human-review.md"), "utf8");
  assert.match(m60Review, /HUMAN PASS \/ APPROVED AS PS-04.M6 BASELINE/);
  assert.equal(shaFile("design/photonic-skin/ps-04-m5-6/release-lock.json"), RELEASE_LOCK_HASH);
  const m61 = readJson("design/photonic-skin/ps-04-m6-1/manifest.json");
  const review = readFileSync(path.join(ROOT, "design/photonic-skin/ps-04-m6-1/reports/human-review.md"), "utf8");
  assert.equal(m61.status, "PS-04.M6.1 — HUMAN PASS / PROJECT BUILDER MIMIC SEMANTICS APPROVED");
  assert.equal(m61.humanPass, true);
  assert.equal(m61.approvedFor, "PS-04.M6.2");
  assert.equal(m61.productionApproval, false);
  assert.equal(m61.deployApproval, false);
  assert.equal(m61.productionDeployApproval, false);
  assert.equal(m61.ps04CloseApproval, false);
  assert.equal(m61.push, false);
  assert.equal(m61.deploy, false);
  assert.equal(m61.m62Started, false);
  assert.match(review, /approvedFor = PS-04\.M6\.2/);
  assert.match(review, /productionDeployApproval = false/);
  const isolation = readJson("design/photonic-skin/ps-04-m6-1/reports/git-isolation.json");
  assert.equal(isolation.m61HumanPass, true);
  assert.equal(isolation.approvedFor, "PS-04.M6.2");
  assert.equal(isolation.productionDeployApproval, false);
  assert.equal(isolation.m62Started, false);
  const status = git(["status", "--porcelain"]);
  assert.doesNotMatch(status, /^\s*[MADRCU].*\sapp\/page\.tsx$/m);
});

test("four builder task IDs are brief-only and distinct from M5 morph-mode tasks", () => {
  assert.deepEqual([...BUILDER_TASK_IDS], [
    "explain_changes",
    "engage_and_unite",
    "learn_and_practice",
    "company_and_culture",
  ]);
  assert.deepEqual([...TASK_IDS], ["explain", "involve", "train", "introduce"]);
  for (const id of BUILDER_TASK_IDS) assert.equal((TASK_IDS as readonly string[]).includes(id), false);
});

test("canonical competency order is frozen and independent of UI click order", () => {
  assert.deepEqual([...CANONICAL_COMPETENCY_ORDER], [
    "content", "design", "digital", "event", "games", "merch", "video",
  ]);
  assert.deepEqual(
    canonicalizeCompetencySet(["video", "event", "video", "games"]),
    ["event", "games", "video"],
  );
  assert.equal(enumerateNonEmptyCompetencySets().length, 127);
  assert.equal(enumerateMultiCompetencySets().length, 120);
});

test("resolver covers empty set, 7 singles, and all 120 multi-sets without fallback", () => {
  const { index } = loadMergedIndex();
  const empty = resolveBuilderState({
    screen: "03.2",
    draftCompetencies: [],
    confirmedCompetencies: null,
  });
  assert.equal(empty, MASTER_STATE_ID);

  for (const competency of CANONICAL_COMPETENCY_ORDER) {
    assert.equal(resolveBuilderState({
      screen: "03.2",
      draftCompetencies: [competency],
      confirmedCompetencies: null,
    }), SINGLE_STATE_IDS[competency]);
    assert.equal(resolveBuilderState({
      screen: "03.3",
      draftCompetencies: [],
      confirmedCompetencies: [competency],
    }), SINGLE_STATE_IDS[competency]);
  }

  const multi = enumerateMultiCompetencySets();
  assert.equal(multi.length, 120);
  for (const set of multi) {
    const gather = gatherStateId(set);
    const drive = driveStateId(set);
    assert.equal(resolveBuilderState({
      screen: "03.2",
      draftCompetencies: set,
      confirmedCompetencies: null,
    }), gather);
    for (const screen of ["03.3", "03.3A", "03.3B"] as const) {
      assert.equal(resolveBuilderState({
        screen,
        draftCompetencies: ["content"],
        confirmedCompetencies: set,
      }), drive);
    }
    const gatherContract = resolveBuilderActorContract({
      nodeId: "03.2",
      index,
      flow: { taskId: "explain_changes", draftCompetencies: set, confirmedCompetencies: null },
    });
    assertNoForbiddenFallback(gatherContract);
    assert.equal(gatherContract.resolvedGeometryId, gather);
    assert.equal(gatherContract.family, "GATHER");
    assert.equal(gatherContract.resolution, "exact");
    assert.equal(gatherContract.paletteMask, maskFromCompetencies(set));
    for (const nodeId of ["03.3"] as const) {
      const driveContract = resolveBuilderActorContract({
        nodeId,
        index,
        flow: { taskId: "learn_and_practice", draftCompetencies: ["merch"], confirmedCompetencies: set },
      });
      assertNoForbiddenFallback(driveContract);
      assert.equal(driveContract.resolvedGeometryId, drive);
      assert.equal(driveContract.family, "DRIVE");
      assert.equal(driveContract.paletteMask, maskFromCompetencies(set));
    }
  }
});

test("03.1 stays MASTER after any task and ignores draft/confirmed competencies", () => {
  const { index } = loadMergedIndex();
  for (const taskId of BUILDER_TASK_IDS) {
    const id = resolveBuilderState({
      screen: "03.1",
      draftCompetencies: ["video", "games"],
      confirmedCompetencies: ["content", "design", "digital"],
    });
    assert.equal(id, MASTER_STATE_ID);
    const contract = resolveBuilderActorContract({
      nodeId: "03.1",
      index,
      flow: { taskId, draftCompetencies: ["event", "video"], confirmedCompetencies: ALL_SEVEN },
    });
    assertNoForbiddenFallback(contract);
    assert.equal(contract.resolvedGeometryId, MASTER_STATE_ID);
    assert.equal(contract.family, "MASTER");
    assert.equal(contract.paletteMask, ALL_COMPETENCE_MASK);
  }
});

test("permutations of one set canonicalize to the same GATHER and DRIVE IDs", () => {
  const sample: BuilderCompetency[] = ["games", "merch", "video"];
  const gather = gatherStateId(canonicalizeCompetencySet(sample));
  const drive = driveStateId(canonicalizeCompetencySet(sample));
  for (const order of permutations(sample)) {
    assert.equal(resolveBuilderState({
      screen: "03.2",
      draftCompetencies: order,
      confirmedCompetencies: null,
    }), gather);
    assert.equal(resolveBuilderState({
      screen: "03.3",
      draftCompetencies: order,
      confirmedCompetencies: order,
    }), drive);
  }
});

test("task does not change geometry or palette for the same screen and set", () => {
  const { index } = loadMergedIndex();
  const set: BuilderCompetency[] = ["event", "video"];
  const geometry = new Set<string>();
  const masks = new Set<number>();
  for (const taskId of BUILDER_TASK_IDS) {
    const gather = resolveBuilderActorContract({
      nodeId: "03.2",
      index,
      flow: { taskId, draftCompetencies: set, confirmedCompetencies: null },
    });
    const drive = resolveBuilderActorContract({
      nodeId: "03.3",
      overlay: "contact",
      index,
      flow: { taskId, draftCompetencies: ["content"], confirmedCompetencies: set },
    });
    geometry.add(gather.resolvedGeometryId ?? "");
    geometry.add(drive.resolvedGeometryId ?? "");
    masks.add(gather.paletteMask);
    masks.add(drive.paletteMask);
    assert.equal(gather.resolvedGeometryId, "complex-gather-event-video");
    assert.equal(drive.resolvedGeometryId, "complex-drive-event-video");
    assert.equal(drive.nodeId, "03.3A");
  }
  assert.equal(geometry.size, 2);
  assert.equal(masks.size, 1);
  assert.equal([...masks][0], maskFromCompetencies(set));
});

test("draft does not leak into confirmed until confirm, and brief edits do not change geometry", () => {
  let flow = INITIAL_BUILDER_FLOW;
  flow = selectTask(flow, "explain_changes");
  flow = setDraftCompetencies(flow, ["event", "video"]);
  assert.equal(flow.confirmed, null);
  assert.equal(resolveBuilderState({
    screen: "03.2",
    draftCompetencies: flow.draft.competencies,
    confirmedCompetencies: null,
  }), "complex-gather-event-video");
  assert.equal(resolveBuilderState({
    screen: "03.3",
    draftCompetencies: flow.draft.competencies,
    confirmedCompetencies: null,
  }), MASTER_STATE_ID);

  const confirmed = confirmCompetencies(flow);
  assert.equal(confirmed.error, null);
  flow = confirmed.state;
  assert.deepEqual(flow.confirmed?.competencies, ["event", "video"]);
  assert.equal(flow.confirmed?.resolvedStateId, "complex-drive-event-video");
  assert.equal(flow.briefStale, false);

  flow = setDraftCompetencies(flow, ["games"]);
  assert.equal(flow.briefStale, true);
  assert.deepEqual(flow.confirmed?.competencies, ["event", "video"]);
  assert.equal(resolveBuilderState({
    screen: "03.2",
    draftCompetencies: flow.draft.competencies,
    confirmedCompetencies: flow.confirmed?.competencies ?? null,
  }), "single-games");
  assert.equal(resolveBuilderState({
    screen: "03.3",
    draftCompetencies: flow.draft.competencies,
    confirmedCompetencies: flow.confirmed?.competencies ?? null,
  }), "complex-drive-event-video");

  const before = flow.confirmed?.resolvedStateId;
  flow = editBrief(flow, "Произвольный текст брифа не должен менять Mimic.");
  assert.equal(flow.confirmed?.resolvedStateId, before);
  assert.equal(resolveBuilderState({
    screen: "03.3B",
    draftCompetencies: flow.draft.competencies,
    confirmedCompetencies: flow.confirmed?.competencies ?? null,
  }), before);
});

test("missing exact endpoint fails closed with STATE COVERAGE INCOMPLETE", () => {
  const empty = indexStates([]);
  assert.throws(
    () => resolveBuilderActorContract({
      nodeId: "03.2",
      index: empty,
      flow: { taskId: "explain_changes", draftCompetencies: ["event", "video"], confirmedCompetencies: null },
    }),
    (error: unknown) => error instanceof BuilderCoverageError
      && error.kind === "STATE_COVERAGE_INCOMPLETE"
      && /STATE COVERAGE INCOMPLETE/.test(error.message),
  );
  assert.throws(
    () => assertNoForbiddenFallback({
      nodeId: "03.2",
      hostNodeId: "03.2",
      family: "FOCUS",
      requestedFamily: "FOCUS",
      resolvedGeometryId: "complex-focus-content-design-digital-event-games-merch-focus-content",
      paletteMask: 3,
      slot: "right",
      fitProfile: "complex",
      resolution: "same-family-fallback",
      applyPaletteOverride: true,
      reason: "test",
    }),
    /Forbidden builder fallback/,
  );
});

test("delta authors exactly 230 new project-complex states and reuses 18 frozen builder endpoints", () => {
  const { frozen, delta } = loadMergedIndex();
  assert.equal(frozen.states.length, 154);
  assert.equal(delta.stage, "PS-04.M6.1");
  assert.equal(delta.newStateCount, 230);
  assert.equal(delta.states.length, 230);
  assert.equal(delta.frozenPayloadNamespace, M55_NAMESPACE);
  assert.equal(delta.frozenManifestSha256, FROZEN_M55_MANIFEST_SHA);
  assert.equal(rawSha256(path.join(ROOT, "public/photonic-skin/ps-04-m5-5/manifests/ps04m55-manifest.json")), FROZEN_M55_MANIFEST_SHA);
  assert.equal(delta.event.hash, FROZEN_EVENT_HASH);
  assert.equal(delta.video.hash, FROZEN_VIDEO_HASH);
  assert.equal(delta.overlays, "none");
  assert.equal(delta.runtimeRotationOverride, "none");
  assert.equal(Object.keys(delta.resolverMap).length, 248);

  const bins = readdirSync(path.join(PUBLIC_M61, "states")).filter((name) => name.endsWith(".state.bin"));
  assert.equal(bins.length, 230);
  const maps = readdirSync(path.join(PUBLIC_M61, "component-maps")).filter((name) => name.endsWith(".json"));
  assert.equal(maps.length, 230);

  for (const set of EXISTING_M55_PREFIX_SETS) {
    for (const id of [gatherStateId(set), driveStateId(set)]) {
      assert.equal(namespaceForStateId(id), M55_NAMESPACE);
      assert.ok(frozen.states.some((entry: { stateId: string }) => entry.stateId === id));
      assert.equal(delta.states.some((entry: { stateId: string }) => entry.stateId === id), false);
      assert.equal(existsSync(path.join(PUBLIC_M61, "states", `${id}.state.bin`)), false);
    }
  }

  const gatherSeven = gatherStateId(ALL_SEVEN);
  const driveSeven = driveStateId(ALL_SEVEN);
  assert.equal(namespaceForStateId(gatherSeven), M61_NAMESPACE);
  assert.equal(namespaceForStateId(driveSeven), M61_NAMESPACE);
  const brandGather = frozen.states.find((entry: { stateId: string }) => entry.stateId === "brand-wide-gather-content-design-digital-event-games-merch-video");
  const brandDrive = frozen.states.find((entry: { stateId: string }) => entry.stateId === "brand-wide-drive-content-design-digital-event-games-merch-video");
  const projectGather = delta.states.find((entry: { stateId: string }) => entry.stateId === gatherSeven);
  const projectDrive = delta.states.find((entry: { stateId: string }) => entry.stateId === driveSeven);
  assert.ok(brandGather && brandDrive && projectGather && projectDrive);
  assert.equal(projectGather.contentHash, brandGather.contentHash);
  assert.equal(projectDrive.contentHash, brandDrive.contentHash);
  assert.equal(projectGather.stateRole, "complex");
  assert.equal(projectDrive.stateRole, "complex");
  assert.deepEqual(projectGather.competencyIds, [...ALL_SEVEN]);
});

test("every new buffer has exact owners, frozen donors, finite identity, and no FOCUS/BRAND_WIDE IDs", () => {
  const integrity = readJson("design/photonic-skin/ps-04-m6-1/reports/asset-integrity.json");
  const identity = readJson("design/photonic-skin/ps-04-m6-1/reports/identity-lod.json");
  const { delta } = loadMergedIndex();
  assert.equal(integrity.newStateCount, 230);
  assert.equal(integrity.allExactOwners, true);
  assert.equal(integrity.allFinite, true);
  assert.equal(identity.N, 16384);
  assert.equal(identity.stride, 40);
  assert.equal(identity.allFinite, true);
  assert.equal(integrity.rows.length, 230);

  for (const row of integrity.rows) {
    assert.deepEqual(row.owners, row.competencies);
    assert.deepEqual(row.unselectedOwners, []);
    assert.equal(row.N, 16384);
    assert.equal(row.stride, 40);
    assert.equal(row.finite, true);
    assert.equal(row.namespace, M61_NAMESPACE);
    assert.doesNotMatch(row.stateId, /^complex-focus-/);
    assert.doesNotMatch(row.stateId, /^brand-wide-/);
    const file = path.join(PUBLIC_M61, "states", `${row.stateId}.state.bin`);
    assert.equal(statSync(file).size, STATE_BYTES);
    assert.equal(shaFile(path.relative(ROOT, file).replaceAll("\\", "/")), row.contentHash);
    if (row.competencies.includes("event")) assert.ok(row.donors.includes("EVENT_A_R2"));
    else assert.equal(row.donors.includes("EVENT_A_R2"), false);
    if (row.competencies.includes("video")) assert.ok(row.donors.includes("VIDEO_COMBO_40_R1"));
    else assert.equal(row.donors.includes("VIDEO_COMBO_40_R1"), false);
  }

  for (const entry of delta.states) {
    assert.equal(entry.recordCount, 16384);
    assert.equal(entry.recordStride, 40);
    assert.equal(entry.stateRole, "complex");
    assert.match(entry.compositionMode, /^(GATHER|DRIVE)$/);
    assert.equal(entry.focusCompetencyId, null);
  }
});

test("hover preview stays ephemeral and respects caps, touch, and static mode", () => {
  const mouse = hoverPreviewFor("event", { reducedMotion: false, staticMode: false, pointerType: "mouse" });
  assert.equal(mouse.active, true);
  assert.equal(mouse.targetStateId, "single-event");
  assert.ok(mouse.geometryInfluence <= HOVER_GEOMETRY_INFLUENCE);
  assert.ok(mouse.paletteIntensity <= HOVER_PALETTE_INTENSITY);
  assert.ok(mouse.rotationBiasDeg <= HOVER_ROTATION_BIAS_DEG);
  const touch = hoverPreviewFor("event", { reducedMotion: false, staticMode: false, pointerType: "touch" });
  assert.equal(touch.active, false);
  const staticMode = hoverPreviewFor("event", { reducedMotion: false, staticMode: true, pointerType: "mouse" });
  assert.equal(staticMode.active, false);
  const reduced = hoverPreviewFor("event", { reducedMotion: true, staticMode: false, pointerType: "keyboard" });
  assert.equal(reduced.geometryInfluence, 0);
  assert.equal(reduced.rotationBiasDeg, 0);
});

test("M5.5 payload, Event/Video, framing, and choreography stay frozen", () => {
  assert.equal(PAYLOAD_NAMESPACE, "ps-04-m5-5");
  assert.equal(PROMOTED_ASSET_NAMESPACE, "ps-04-m5-5");
  assert.equal(RELEASE_LOCK.event.hash, SELECTED_EVENT_HASH);
  assert.equal(RELEASE_LOCK.video.hash, SELECTED_VIDEO_HASH);
  assert.equal(SELECTED_EVENT_HASH, FROZEN_EVENT_HASH);
  assert.equal(SELECTED_VIDEO_HASH, FROZEN_VIDEO_HASH);
  assert.equal(OWNER_SELECTED_PROFILE_ID, "OWNER_SELECTED_124_111_111");
  assert.equal(PALETTE_DELAY_FRACTION, 0.06);
  assert.equal(RELEASE_LOCK.eventOverlay, "none");
  assert.equal(RELEASE_LOCK.runtimeRotationOverride, "none");
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-5/states/single-event.state.bin"), SELECTED_EVENT_HASH);
  assert.equal(shaFile("public/photonic-skin/ps-04-m5-5/states/single-video.state.bin"), SELECTED_VIDEO_HASH);
  execFileSync("git", ["diff", "--exit-code", "0ea9e67", "c29e143", "--", ...FROZEN_PRODUCTION], { cwd: ROOT });
});

test("production / and M5 promotion-preview do not bind the M6.1 namespace", () => {
  const home = checkpointText("app/page.tsx", "c29e143");
  const client = checkpointText("app/_photonic-skin/ProductionPhotonicSiteClient.tsx", "c29e143");
  const runtime = checkpointText("app/_photonic-skin/runtime.ts", "c29e143");
  const release = checkpointText("app/_photonic-skin/release.ts", "c29e143");
  const preview = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/promotion-preview/page.tsx"), "utf8");
  const lab = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/promotion-preview/PromotionPreviewLab.tsx"), "utf8");
  for (const text of [home, client, runtime, release, preview, lab]) {
    assert.doesNotMatch(text, /ps-04-m6-1/);
    assert.doesNotMatch(text, /project-builder-semantics/);
    assert.doesNotMatch(text, /__PS04M61_LAB__/);
  }
  assert.match(home, /ProductionPhotonicSiteClient/);
  assert.doesNotMatch(home, /visual-lab/);
  const clean = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/page.tsx"), "utf8");
  const review = readFileSync(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/review/page.tsx"), "utf8");
  assert.match(clean, /mode="preview"/);
  assert.match(review, /mode="lab"/);
});

const smokePath = path.join(ROOT, "design/photonic-skin/ps-04-m6-1/reports/browser-smoke.json");
test("browser smoke, if captured", { skip: !existsSync(smokePath) }, () => {
  const smoke = readJson("design/photonic-skin/ps-04-m6-1/reports/browser-smoke.json");
  assert.equal(smoke.ok, true);
  assert.equal(smoke.runId, "ps04-m6-1");
  assert.equal(smoke.productionRequestsM61, false);
  assert.equal(smoke.eventOverlay, "none");
  assert.equal(smoke.videoOverlay, "none");
  assert.equal(smoke.runtimeRotationOverride, "none");
});
