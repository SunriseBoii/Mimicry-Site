import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { withoutActorAnticipation } from "../app/_photonic-skin/playback-program";
import { decodeState, type StateEntry } from "../app/visual-lab/photonic-skin-m4-1/m41-data";
import { compileTransition, evaluateElement } from "../app/visual-lab/photonic-skin-m4-1/m41-evaluator";
import { PhotonicMotionSession } from "../app/visual-lab/photonic-skin-ps04-m3/session";
import { compileLiveRetarget } from "../app/visual-lab/photonic-skin-ps04-m3/runtime";

const root = "public/photonic-skin/ps-04-m5-5/";
const manifest = JSON.parse(readFileSync(root + "manifests/ps04m55-manifest.json", "utf8"));
function state(id: string) {
  const entry = manifest.states.find((entry: StateEntry) => entry.stateId === id);
  return decodeState(entry, Uint8Array.from(readFileSync(root + entry.bufferPath)).buffer);
}
const source = state("single-games"), target = state("single-video");
const compile = (viewport: "desktop" | "mobile") => compileTransition(source, target, {
  schemaVersion: "1.0.0", sourceStateId: source.entry.stateId, targetStateId: target.entry.stateId,
  identitySpaceVersion: manifest.identitySpace.identitySpaceVersion, motionProfileId: "directed-plastic-release",
  triggerMode: "qa", viewportProfile: viewport, directionIntent: "auto", deterministicSeed: 123, reducedMotion: false,
});

for (const viewport of ["desktop", "mobile"] as const) test(`${viewport}: the actor stays level through anticipation without changing particle tracks or timing`, () => {
  const original = compile(viewport);
  const before = structuredClone(original);
  const playback = withoutActorAnticipation(original);
  const window = original.compiled!.header.actorTrack.window;
  const peak = (window[0] + window[1]) / 2;
  const oldPose = evaluateElement(source, target, original, 0, peak).actorPose;
  assert.ok(oldPose.position.some(v => Math.abs(v) > 1e-6) || oldPose.orientation.slice(0, 3).some(v => Math.abs(v) > 1e-6), "fixture must reproduce the wind-up");
  assert.deepEqual(original, before, "shared cached program was mutated");
  assert.deepEqual(playback, {
    ...original,
    compiled: { ...original.compiled!, header: { ...original.compiled!.header,
      actorTrack: { ...original.compiled!.header.actorTrack, rotationRadians: 0, translationAmplitude: 0 },
    } },
  }, "only the global anticipation amplitudes may change");
  assert.strictEqual(withoutActorAnticipation(playback), playback);
  for (let step = 0; step <= 100; step++) {
    const t = step / 100;
    assert.deepEqual(evaluateElement(source, target, playback, 0, t).actorPose, { position: [0, 0, 0], orientation: [0, 0, 0, 1] });
  }
  // Past the short anticipation window, evaluated motion is unchanged too.
  // Stay beyond the finite-difference velocity stencil at the window boundary.
  for (const t of [0, window[1] + .001, .25, .5, .75, 1]) for (const id of [0, 137, 4096, 8191, 16383]) {
    assert.deepEqual(evaluateElement(source, target, playback, id, t), evaluateElement(source, target, original, id, t));
  }
});

test("a rapid retarget captures the level rendered pose and introduces no second wind-up", () => {
  const program = withoutActorAnticipation(compile("desktop"));
  const session = new PhotonicMotionSession();
  session.bootstrapSettled(source, program);
  const captured = session.captureJoint({ source, target, program, progress: .055 });
  assert.deepEqual(Array.from(captured.m4Snapshot!.actorPose), [0, 0, 0, 0, 0, 0, 1]);
  const result = compileLiveRetarget(captured, source, source, manifest, { reducedMotion: false, viewport: "desktop" });
  const next = withoutActorAnticipation(result.program);
  for (const t of [0, .025, .055, .1, .25, 1]) {
    assert.deepEqual(evaluateElement(result.liveSource, source, next, 0, t).actorPose, { position: [0, 0, 0], orientation: [0, 0, 0, 1] });
  }
});
