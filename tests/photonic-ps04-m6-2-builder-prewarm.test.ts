import test from "node:test";
import assert from "node:assert/strict";
import { builderToggleNeighborPairs, FramingSandboxProgramCache } from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-prewarm";
import type { DecodedState } from "../app/visual-lab/photonic-skin-m4-1/m41-data";

test("empty 03.2 draft prewarms every first competency choice", () => {
  const pairs = builderToggleNeighborPairs([]);
  assert.deepEqual(pairs, [
    ["master-neutral", "single-event"],
    ["master-neutral", "single-video"],
    ["master-neutral", "single-content"],
    ["master-neutral", "single-design"],
    ["master-neutral", "single-games"],
    ["master-neutral", "single-digital"],
    ["master-neutral", "single-merch"],
  ]);
});

test("03.2 neighbor prewarm follows the current draft in both toggle directions", () => {
  const pairs = builderToggleNeighborPairs(["event", "content"]);
  assert.equal(pairs.length, 7);
  assert.deepEqual(new Set(pairs.map(([source]) => source)), new Set(["complex-gather-content-event"]));
  assert.deepEqual(pairs.map(([, target]) => target), [
    "single-content",
    "complex-gather-content-event-video",
    "single-event",
    "complex-gather-content-design-event",
    "complex-gather-content-event-games",
    "complex-gather-content-digital-event",
    "complex-gather-content-event-merch",
  ]);
  assert.equal(new Set(pairs.map(([, target]) => target)).size, 7);
});

test("decoded neighbor states stay within the cache byte budget", () => {
  const cache = new FramingSandboxProgramCache();
  cache.budgetBytes = 100;
  const state = (stateId: string) => ({
    entry: { stateId },
    position: new Uint8Array(60),
  }) as unknown as DecodedState;
  cache.rememberState(state("first"));
  cache.rememberState(state("second"));
  assert.equal(cache.peekState("first"), null);
  assert.ok(cache.peekState("second"));
  assert.ok(cache.byteLength() <= cache.budgetBytes);
});
