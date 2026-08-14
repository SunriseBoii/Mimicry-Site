import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  baselineStateFor,
  filterStates,
  stateLabel,
  visibleComponents,
  type M31Manifest,
  type StateEntry,
} from "../app/visual-lab/photonic-skin-m3-1/m31-data";

const root = process.cwd();
const manifest = JSON.parse(readFileSync(path.join(root, "public/photonic-skin/ps-03-m3-1/manifest.json"), "utf8")) as M31Manifest;
const baseline = JSON.parse(readFileSync(path.join(root, "design/photonic-skin/ps-03-m3/exports/ps03m3-manifest.json"), "utf8")) as { states: StateEntry[] };

test("M3.1 state labels follow the semantic UI contract", () => {
  const single = manifest.states.find((entry) => entry.stateId === "single-design")!;
  const focus = manifest.states.find((entry) => entry.compositionMode === "FOCUS")!;
  const gather = manifest.states.find((entry) => entry.compositionMode === "GATHER" && entry.stateRole === "complex")!;
  const brand = manifest.states.find((entry) => entry.stateRole === "brand_wide" && entry.compositionMode === "DRIVE")!;
  assert.equal(stateLabel(single), "SINGLE / Design");
  assert.doesNotMatch(stateLabel(single), /focus/i);
  assert.match(stateLabel(focus), /^COMPLEX \/ Focus \/ .+ \/ Lead: /);
  assert.match(stateLabel(gather), /^COMPLEX \/ Gather \/ /);
  assert.match(stateLabel(brand), /^BRAND WIDE \/ Drive \/ /);
});

test("role, cardinality, and lead filters are independent and exact", () => {
  assert.equal(filterStates(manifest.states, { role: "FOCUS", cardinality: 4, lead: "ALL" }).length, 38);
  assert.equal(filterStates(manifest.states, { role: "GATHER", cardinality: 7, lead: "ALL" }).length, 0);
  assert.equal(filterStates(manifest.states, { role: "BRAND_WIDE", cardinality: 7, lead: "ALL" }).length, 2);
  const contentLead = filterStates(manifest.states, { role: "FOCUS", cardinality: "ALL", lead: "content" });
  assert.ok(contentLead.length > 0);
  assert.ok(contentLead.every((entry) => entry.focusCompetencyId === "content"));
});

test("every M3.1 endpoint has an explicit M3 baseline mapping", () => {
  for (const entry of manifest.states) {
    assert.equal(baselineStateFor(entry, baseline.states)?.stateId, entry.stateId);
  }
});

test("profile component visibility implements absent-or-readable simplification", () => {
  const drive = manifest.states.find((entry) => entry.stateId === "complex-drive-content-design-digital-event")!;
  const figureLeft = drive.componentMap!.find((entry) => entry.componentId === "figure-left")!;
  const figureRight = drive.componentMap!.find((entry) => entry.componentId === "figure-right")!;
  assert.equal(visibleComponents(drive, "desktop").has(figureLeft.componentIndex), false);
  assert.equal(visibleComponents(drive, "mobile390").has(figureRight.componentIndex), false);
  assert.equal(visibleComponents(drive, "desktop").has(figureRight.componentIndex), true);
});

test("public QA summary is machine-pass for the complete view matrix", () => {
  const qa = JSON.parse(readFileSync(path.join(root, "public/photonic-skin/ps-03-m3-1/qa-summary.json"), "utf8")) as { passed: boolean; stateViewCount: number; failureCount: number };
  assert.equal(qa.passed, true);
  assert.equal(qa.stateViewCount, 1232);
  assert.equal(qa.failureCount, 0);
});
