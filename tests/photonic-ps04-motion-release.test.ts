import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadPS04MotionManifest, PS04_ROUTE_DURATION_MS } from "../app/_photonic-skin/ps04-motion-release";

test("PS-04 release loads the frozen motion index with canonical LF on Windows", async () => {
  const manifestText = readFileSync("public/photonic-skin/ps-04-release-motion-r1/manifest.json", "utf8");
  const fetchImpl = async () => new Response(manifestText.replace(/\r?\n/g, "\r\n"));
  const manifest = await loadPS04MotionManifest(undefined, fetchImpl as typeof fetch);
  assert.equal(manifest.stage, "PS-03.M4.1");
  assert.equal(manifest.endpointLibrary.identityCount, 16384);
  assert.deepEqual(PS04_ROUTE_DURATION_MS, { desktop: 650, mobile: 550 });
});
