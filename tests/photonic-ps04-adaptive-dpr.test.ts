import assert from "node:assert/strict";
import test from "node:test";
import { adaptiveDprCap, initialAdaptiveDpr, nextAdaptiveDpr } from "../app/visual-lab/photonic-skin-ps04-m5/adaptive-dpr";
import { actorSquareCss, placementCenter } from "../app/visual-lab/photonic-skin-ps04-m5/composition";

test("PS-04 starts within the device and pixel budgets", () => {
  assert.equal(adaptiveDprCap(1920, 1080, 2), 1);
  assert.equal(adaptiveDprCap(390, 844, 3), 1.75);
  assert.equal(adaptiveDprCap(1440, 900, 1), 1);
});

test("PS-04 lowers DPR after sustained slow frames without scale oscillation", () => {
  let state = initialAdaptiveDpr(1440, 900, 2);
  assert.equal(state.dpr, 1.5);
  state = nextAdaptiveDpr(state, 24, 4_000, 1440, 900, 2);
  state = nextAdaptiveDpr(state, 24, 4_750, 1440, 900, 2);
  state = nextAdaptiveDpr(state, 24, 5_500, 1440, 900, 2);
  assert.equal(state.dpr, 1.25);
  assert.equal(nextAdaptiveDpr(state, 24, 6_250, 1440, 900, 2).dpr, 1.25);
  assert.equal(nextAdaptiveDpr(state, 0, 6_250, 1920, 1080, 2).dpr, 1);
});

test("390 px composition keeps the actor below the Hero actions and project controls", () => {
  const size = actorSquareCss(390, 844);
  const center = placementCenter("right", 390, 844, size, 0);
  assert.ok(center.y - size / 2 >= 600);
  assert.ok(center.y + size / 2 <= 844);
});
