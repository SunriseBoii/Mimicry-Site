import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { M31RManifest } from "../app/visual-lab/photonic-skin-m3-1r/m31r-data";

const root = process.cwd();
const finalPath = path.join(root, "public/photonic-skin/ps-03-m3-1r");
const oldPath = path.join(root, "public/photonic-skin/ps-03-m3-1");
const manifest = JSON.parse(readFileSync(path.join(finalPath, "manifest.json"), "utf8")) as M31RManifest;
const baseline = JSON.parse(readFileSync(path.join(oldPath, "manifest.json"), "utf8")) as M31RManifest;
const mapping = JSON.parse(readFileSync(path.join(finalPath, "state-mapping.json"), "utf8")) as { states: Array<{ stateId: string; eventPresent: boolean; geometryChanged: boolean; bufferByteIdentical: boolean }> };

test("M3.1R freezes the promoted production camera contract", () => {
  assert.equal(manifest.stage, "PS-03.M3.1R");
  assert.equal(manifest.stateVersion, "3.1.1");
  assert.equal(manifest.buildVersion, "ps03m31r-presentation-builder-v1");
  assert.deepEqual(manifest.presentationContract.cameras.canonical, [2.8, -7.8, 4.6]);
  assert.deepEqual(manifest.presentationContract.cameras.alternate, [5.6, -6.4, 4.1]);
  assert.deepEqual(manifest.presentationContract.cameras.side, [8.8, 0, 1.4]);
  assert.deepEqual(manifest.presentationContract.cameras.top, [0.01, -0.01, 9.4]);
  assert.equal(manifest.presentationContract.fovDegrees, 33);
  assert.equal(manifest.presentationContract.cameraAnimated, false);
});

test("M3.1R changes exactly 83 Event buffers and preserves 71 non-Event buffers", () => {
  assert.equal(mapping.states.filter((entry) => entry.eventPresent).length, 83);
  assert.equal(mapping.states.filter((entry) => entry.eventPresent && entry.geometryChanged).length, 83);
  assert.equal(mapping.states.filter((entry) => !entry.eventPresent && entry.bufferByteIdentical).length, 71);
  for (const item of mapping.states.filter((entry) => !entry.eventPresent)) {
    const old = readFileSync(path.join(oldPath, "states", `${item.stateId}.state.bin`));
    const next = readFileSync(path.join(finalPath, "states", `${item.stateId}.state.bin`));
    assert.equal(Buffer.compare(old, next), 0, item.stateId);
  }
});

test("M3.1R preserves semantic IDs and freezes Event at yaw +18 only", () => {
  assert.deepEqual(manifest.states.map((entry) => entry.stateId), baseline.states.map((entry) => entry.stateId));
  assert.deepEqual(manifest.eventOrientationContract.selectedEulerDegrees, [0, 0, 18]);
  assert.equal(Object.keys(manifest.eventOrientationContract.translationOverrides).length, 2);
  assert.notEqual(manifest.deterministicFingerprint, baseline.deterministicFingerprint);
});

test("M3.1R public QA is complete and green", () => {
  const qa = JSON.parse(readFileSync(path.join(finalPath, "qa-summary.json"), "utf8")) as { machinePass: boolean; stateCount: number; checkedStateViews: number; checkedOwnerRows: number; checkedComponents: number; failureCount: number };
  assert.equal(qa.machinePass, true);
  assert.equal(qa.stateCount, 154);
  assert.equal(qa.checkedStateViews, 1232);
  assert.equal(qa.checkedOwnerRows, 4528);
  assert.equal(qa.checkedComponents, 10200);
  assert.equal(qa.failureCount, 0);
});

test("M3.1R Lab contains only static endpoint review controls", () => {
  const source = readFileSync(path.join(root, "app/visual-lab/photonic-skin-m3-1r/M31RLab.tsx"), "utf8");
  assert.match(source, /M3\.1R \/ NEW CANONICAL/);
  assert.match(source, /M3\.1R \/ NEW ALTERNATE/);
  assert.match(source, /FOCUS_LEAD/);
  assert.match(source, /FOCUS_SUPPORT/);
  assert.doesNotMatch(source, />PLAY</);
  assert.doesNotMatch(source, /requestAnimationFrame/);
});
