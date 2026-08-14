import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import * as THREE from "three";

import {
  PHOTONIC_FAR,
  PHOTONIC_FOV_DEGREES,
  PHOTONIC_NEAR,
  PHOTONIC_PROFILE_SIZE,
  applyPhotonicPresentationCamera,
  c2PresentationProgress,
  interpolatePresentationFrames,
  presentationMatrix,
  resolvePresentationFrame,
  type PresentationStateEntry,
} from "../app/visual-lab/photonic-skin-m4-1r/photonic-presentation";
import type { M3Manifest } from "../app/visual-lab/photonic-skin-m4-1/m41-data";
import { runPresentationQa } from "../design/photonic-skin/ps-03-m4-1r/scripts/qa-presentation";

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, "public/photonic-skin/ps-03-m3-1r/manifest.json");
const SCENE = path.join(ROOT, "app/visual-lab/photonic-skin-m4-1r/M41Scene.tsx");
const LAB = path.join(ROOT, "app/visual-lab/photonic-skin-m4-1r/M41Lab.tsx");
const CSS = path.join(ROOT, "app/visual-lab/photonic-skin-m4-1r/m41r-lab.module.css");
const reportPromise = runPresentationQa({ write: false });

async function text(file: string) {
  return readFile(file, "utf8");
}

test("camera contract locks Z-up, FOV, square aspect, and clip planes", async () => {
  const manifest = JSON.parse(await text(MANIFEST)) as M3Manifest;
  for (const preset of ["canonical", "alternate"] as const) {
    const camera = applyPhotonicPresentationCamera(new THREE.PerspectiveCamera(), manifest.presentationContract, preset);
    assert.deepEqual(camera.up.toArray(), [0, 0, 1]);
    assert.equal(camera.fov, PHOTONIC_FOV_DEGREES);
    assert.equal(camera.aspect, 1);
    assert.equal(camera.near, PHOTONIC_NEAR);
    assert.equal(camera.far, PHOTONIC_FAR);
  }
});

test("frozen camera preset coordinates remain unchanged", async () => {
  const manifest = JSON.parse(await text(MANIFEST)) as M3Manifest;
  assert.deepEqual(manifest.presentationContract.cameras.canonical, [2.8, -7.8, 4.6]);
  assert.deepEqual(manifest.presentationContract.cameras.alternate, [5.6, -6.4, 4.1]);
  assert.deepEqual(manifest.presentationContract.cameras.side, [8.8, 0, 1.4]);
  assert.deepEqual(manifest.presentationContract.cameras.top, [0.01, -0.01, 9.4]);
});

test("camera mutation order sets up before lookAt", async () => {
  const source = await text(path.join(ROOT, "app/visual-lab/photonic-skin-m4-1r/photonic-presentation.ts"));
  const position = source.indexOf("camera.position.set");
  const up = source.indexOf("camera.up.set", position);
  const lookAt = source.indexOf("camera.lookAt", up);
  const projection = source.indexOf("camera.updateProjectionMatrix", lookAt);
  assert.ok(position >= 0 && position < up && up < lookAt && lookAt < projection);
});

test("all four frozen presentation profiles are exact squares", () => {
  assert.deepEqual(PHOTONIC_PROFILE_SIZE, { desktop: 512, mobile390: 390, silhouette180: 180, silhouette96: 96 });
});

test("C2 presentation interpolation preserves exact endpoints", async () => {
  const manifest = JSON.parse(await text(MANIFEST)) as M3Manifest;
  const source = manifest.states[0] as PresentationStateEntry;
  const target = manifest.states[1] as PresentationStateEntry;
  assert.equal(interpolatePresentationFrames(source, target, 0), resolvePresentationFrame(source));
  assert.equal(interpolatePresentationFrames(source, target, 1), resolvePresentationFrame(target));
  assert.equal(c2PresentationProgress(0), 0);
  assert.equal(c2PresentationProgress(1), 1);
});

test("presentation matrix applies one uniform scale and translated anchor", async () => {
  const manifest = JSON.parse(await text(MANIFEST)) as M3Manifest;
  const frame = resolvePresentationFrame(manifest.states[0]);
  const matrix = presentationMatrix(frame).elements;
  assert.equal(matrix[0], frame.scale);
  assert.equal(matrix[5], frame.scale);
  assert.equal(matrix[10], frame.scale);
  assert.equal(matrix[12], frame.translate[0] * frame.scale);
  assert.equal(matrix[13], frame.translate[1] * frame.scale);
  assert.equal(matrix[14], frame.translate[2] * frame.scale);
});

test("2464-case source/target matrix is complete", async () => {
  const report = await reportPromise;
  assert.equal(report.matrix.expectedCases, 2464);
  assert.equal(report.matrix.executedCases, 2464);
  assert.equal(report.matrix.sourceCases, 1232);
  assert.equal(report.matrix.targetCases, 1232);
  assert.equal(report.matrix.standaloneEndpointCases, 1232);
});

test("2464-case matrix passes with exact matrices and NDC", async () => {
  const report = await reportPromise;
  assert.equal(report.matrix.passedCases, 2464);
  assert.equal(report.matrix.failedCases, 0);
  assert.equal(report.matrix.maximums.cameraMatrixMaxAbs, 0);
  assert.equal(report.matrix.maximums.presentationMatrixMaxAbs, 0);
  assert.equal(report.matrix.maximums.ndcMaxAbs, 0);
});

test("centroid and bounding-box pixel parity are exact", async () => {
  const report = await reportPromise;
  assert.equal(report.matrix.maximums.centroidDeltaPx, 0);
  assert.equal(report.matrix.maximums.bboxDeltaPx, 0);
});

test("silhouette and component-mask IoU are exact", async () => {
  const report = await reportPromise;
  assert.equal(report.matrix.minimums.silhouetteIou, 1);
  assert.equal(report.matrix.minimums.componentIou, 1);
});

test("all corrected endpoint centers remain unclipped", async () => {
  const report = await reportPromise;
  assert.equal(report.matrix.maximums.clippedReference, 0);
  assert.equal(report.matrix.maximums.clippedCandidate, 0);
});

test("canonical and alternate cameras each cover 1232 passing cases", async () => {
  const report = await reportPromise;
  assert.deepEqual(report.matrix.byCamera, {
    canonical: { cases: 1232, passed: 1232 },
    alternate: { cases: 1232, passed: 1232 },
  });
});

test("each square profile covers 616 passing cases", async () => {
  const report = await reportPromise;
  for (const value of Object.values(report.matrix.byProfile)) assert.deepEqual(value, { cases: 616, passed: 616 });
});

test("all seven SINGLE endpoints pass both roles, cameras, and four profiles", async () => {
  const report = await reportPromise;
  const singles = report.cases.filter((item) => item.stateId.startsWith("single-"));
  assert.equal(new Set(singles.map((item) => item.stateId)).size, 7);
  assert.equal(singles.length, 7 * 2 * 2 * 4);
  assert.ok(singles.every((item) => item.pass));
});

test("FOCUS/GATHER/DRIVE and BRAND_WIDE endpoint presentations pass", async () => {
  const report = await reportPromise;
  for (const mode of ["FOCUS", "GATHER", "DRIVE"]) {
    const cases = report.cases.filter((item) => item.compositionMode === mode);
    assert.ok(cases.length > 0, `missing ${mode}`);
    assert.ok(cases.every((item) => item.pass));
  }
  const brand = report.cases.filter((item) => item.stateRole === "brand_wide");
  assert.ok(brand.length > 0);
  assert.ok(brand.every((item) => item.pass));
});

test("Event and Design reproduce the legacy mismatch and eliminate it", async () => {
  const report = await reportPromise;
  assert.equal(report.rootCauseAudit.highlightedStates.length, 8);
  for (const item of report.rootCauseAudit.highlightedStates) {
    if (item.camera === "canonical" || item.camera === "alternate") {
      assert.ok(item.legacyVsApprovedNdcMax > 0.05);
      assert.ok(item.legacySemanticAxisMax > 0.1);
    }
    assert.equal(item.correctedVsApprovedNdcMax, 0);
    assert.equal(item.correctedSemanticAxisMax, 0);
  }
});

test("Event and Design pass all four cameras and all four profiles", async () => {
  const report = await reportPromise;
  assert.equal(report.matrix.eventDesignFourCameraDiagnosticCases, 64);
  assert.equal(report.matrix.eventDesignFourCameraDiagnosticPassed, 64);
  assert.equal(report.eventDesignFourCameraDiagnostics.length, 64);
});

test("legacy audit records non-square canvas and Y-up camera", async () => {
  const report = await reportPromise;
  assert.deepEqual(report.rootCauseAudit.legacyCanvasCss, [874, 398]);
  assert.deepEqual(report.rootCauseAudit.approvedCanvasCss, [512, 512]);
  assert.deepEqual(report.rootCauseAudit.correctedCanvasCss, [512, 512]);
  assert.deepEqual(report.rootCauseAudit.legacyCamera.canonical.up, [0, 1, 0]);
  assert.deepEqual(report.rootCauseAudit.correctedCamera.canonical.up, [0, 0, 1]);
});

test("scene applies presentation after motion and only once", async () => {
  const source = await text(SCENE);
  assert.equal(source.match(/vec3 presented = \(center \+ frameTranslate \+ local\) \* frameScale;/g)?.length, 1);
  assert.equal(source.match(/gl_Position = projectionMatrix \* modelViewMatrix \* vec4\(presented, 1\.0\);/g)?.length, 1);
  assert.ok(!source.includes("<group scale={"));
});

test("root transform stays identity and actor transform is not reapplied on a group", async () => {
  const source = await text(SCENE);
  assert.ok(!source.includes("<group rotation="));
  assert.ok(!source.includes("<group quaternion="));
  assert.ok(!source.includes("<group position="));
  assert.equal((await reportPromise).invariants.rootTransform, "identity");
  assert.equal((await reportPromise).invariants.doublePresentationTransform, false);
});

test("endpoint branches keep evaluator center and quaternion exact", async () => {
  const source = await text(SCENE);
  assert.ok(source.includes("if (t <= 0.0) { center = a.xyz;"));
  assert.ok(source.includes("if (t >= 1.0) { center = b.xyz;"));
  assert.ok(source.includes("orientation = normalize(qa)"));
  assert.ok(source.includes("orientation = normalize(qb)"));
});

test("state quaternion convention remains xyzw", async () => {
  const data = await text(path.join(ROOT, "app/visual-lab/photonic-skin-m4-1/m41-data.ts"));
  const scene = await text(SCENE);
  assert.ok(data.includes("orientation[q + lane] = value"));
  assert.ok(scene.includes("new THREE.Vector4(...(props.program.compiled?.header.actorTrack.sourcePose.orientation"));
  assert.equal((await reportPromise).contract.quaternionConvention, "xyzw");
});

test("component visibility is bound into source and target endpoint activation", async () => {
  const source = await text(SCENE);
  assert.ok(source.includes("const shown = profile ? visibleComponents(state.entry, profile) : null"));
  assert.ok(source.includes("float sourceVisible = step(255.5, ma.w)"));
  assert.ok(source.includes("float targetVisible = step(255.5, mb.w)"));
});

test("full 16384 LOD is the M4.1R default while explicit URL LOD survives", async () => {
  const source = await text(LAB);
  assert.ok(source.includes("useState(16384)"));
  assert.ok(source.includes("queryParams.has(\"lod\")"));
  assert.ok(source.includes(": m3.identitySpace.size"));
});

test("DPR 1/1.5/2 changes drawing-buffer density only", async () => {
  const scene = await text(SCENE);
  const lab = await text(LAB);
  assert.ok(scene.includes("dpr={props.dpr}"));
  assert.ok(lab.includes("([1, 1.5, 2] as const)"));
  assert.ok(lab.includes("params.set(\"dpr\", String(dpr))"));
  assert.equal((await reportPromise).contract.aspect, 1);
});

test("ResizeObserver recovers square canvas without mutating the camera contract", async () => {
  const scene = await text(SCENE);
  const css = await text(CSS);
  assert.ok(scene.includes("const observer = new ResizeObserver"));
  assert.ok(css.includes("aspect-ratio: 1 / 1"));
  assert.ok(scene.includes("applyPhotonicPresentationCamera(camera, contract, preset)"));
});

test("comparison UI exposes every requested parity mode", async () => {
  const source = await text(LAB);
  for (const mode of ["side-by-side", "blink", "difference", "silhouette-xor", "component-difference"]) {
    assert.ok(source.includes(`\"${mode}\"`), `missing ${mode}`);
  }
  assert.ok(source.includes("PRESENTATION PARITY"));
});

test("CSS fixes desktop/mobile/180/96 viewports to square dimensions", async () => {
  const source = await text(CSS);
  for (const size of [512, 390, 180, 96]) {
    assert.ok(source.includes(`${size}px`), `missing ${size}px profile`);
  }
  assert.ok(source.includes("aspect-ratio: 1 / 1"));
});

test("retarget snapshots carry one interpolated presentation frame", async () => {
  const source = await text(LAB);
  assert.ok(source.includes("const presentationFrame = interpolatePresentationFrames(source.entry, target.entry, progress)"));
  assert.ok(source.includes("presentationFrame,"));
});

test("retarget, reduced motion, and static idle resolve to the exact target frame", async () => {
  const lab = await text(LAB);
  const scene = await text(SCENE);
  assert.ok(lab.includes("setProgress(reducedMotion ? 1 : 0)"));
  assert.ok(scene.includes("progressRef.current = props.reducedMotion ? 1 : props.progress"));
  assert.ok(scene.includes("if (t >= 1.0) { frameTranslate = uTargetFrameTranslate; frameScale = uTargetFrameScale; }"));
});

test("frozen endpoint manifest hash remains exact", async () => {
  const bytes = await readFile(MANIFEST);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "530ca41e0faecf291ea9f674a7e383ae8739af0bddad578a765a7c264129ea82");
});

test("frozen M4.1 approval manifest and aggregate remain exact", async () => {
  const file = path.join(ROOT, "public/photonic-skin/ps-03-m4-1/manifest.json");
  const bytes = await readFile(file);
  const manifest = JSON.parse(bytes.toString("utf8")) as { aggregateContentHash: string };
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441");
  assert.equal(manifest.aggregateContentHash, "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361");
});

test("machine status remains gated on human presentation review", async () => {
  assert.equal((await reportPromise).status, "MACHINE PASS / HUMAN REVIEW REQUIRED");
});
