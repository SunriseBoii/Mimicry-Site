import assert from "node:assert/strict";
import test from "node:test";
import { parseInitialLabSettings } from "../app/visual-lab/photonic-skin/lab-config";

test("URL settings provide a deterministic screenshot state", () => {
  assert.deepEqual(
    parseInitialLabSettings({
      state: "complex",
      theme: "dark",
      motion: "static",
      preview: "mobile",
    }),
    {
      stateId: "complex",
      theme: "dark",
      motionMode: "static",
      previewMode: "mobile",
    },
  );
});

