import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MATERIAL_THEME_PRESETS,
  STABLE_VARIATION_CONTRACT,
  defaultMaterialController,
  stableSeedForPersistentId,
} from "../app/visual-lab/photonic-skin-ps04-m1/material-foundation";

const scenePath = "app/visual-lab/photonic-skin-ps04-m1/PS04M1Scene.tsx";
const frozenScenePath = "app/visual-lab/photonic-skin-m4-1r/M41Scene.tsx";
const scene = readFileSync(scenePath, "utf8");
const frozenScene = readFileSync(frozenScenePath, "utf8");

function vertexShader(source: string) {
  const match = source.match(/const vertexShader = `([\s\S]*?)`;/);
  assert.ok(match, "vertex shader must exist");
  return match[1];
}

function stripM1SurfaceBridge(source: string) {
  return source
    .replace("in vec3 aSurfaceNormal;\n", "")
    .replace("out vec3 vSurfaceNormalView;\nout vec3 vViewPosition;\nflat out float vPersistentSeed;\n", "")
    .replace(
      /\nfloat persistentSeed\(int persistentId\) \{[\s\S]*?\n\}\n(?=\nvec4 shortestSlerp)/,
      "",
    )
    .replace(
      [
        "  vec3 surfaceNormal = normalize(quatRotate(orientation, aSurfaceNormal));",
        "  vSurfaceNormalView = normalize(mat3(modelViewMatrix) * surfaceNormal);",
        "  vViewPosition = (modelViewMatrix * vec4(presented, 1.0)).xyz;",
        "  vPersistentSeed = persistentSeed(id);",
        "",
      ].join("\n"),
      "",
    );
}

test("PS-04.M1 preserves the complete frozen evaluator vertex shader math", () => {
  assert.equal(stripM1SurfaceBridge(vertexShader(scene)), vertexShader(frozenScene));
});

test("material foundation stays one RawShaderMaterial pipeline", () => {
  assert.match(scene, /new THREE\.RawShaderMaterial/);
  assert.doesNotMatch(scene, /MeshStandardMaterial|MeshPhysicalMaterial|onBeforeCompile/);
  assert.equal((scene.match(/<instancedMesh/g) ?? []).length, 1);
  assert.doesNotMatch(scene, /displacement|emissive|bloom|transmission|iridescence/);
});

test("theme presets remain inside the approved M1 material ranges", () => {
  assert.equal(MATERIAL_THEME_PRESETS.light.background, "#F5F2EB");
  assert.equal(MATERIAL_THEME_PRESETS.light.substrate, "#E9E5DC");
  assert.ok(MATERIAL_THEME_PRESETS.light.roughness >= 0.52 && MATERIAL_THEME_PRESETS.light.roughness <= 0.62);
  assert.ok(MATERIAL_THEME_PRESETS.light.metalness >= 0 && MATERIAL_THEME_PRESETS.light.metalness <= 0.06);
  assert.equal(MATERIAL_THEME_PRESETS.dark.background, "#090B0D");
  assert.equal(MATERIAL_THEME_PRESETS.dark.substrate, "#15181B");
  assert.ok(MATERIAL_THEME_PRESETS.dark.roughness >= 0.38 && MATERIAL_THEME_PRESETS.dark.roughness <= 0.48);
  assert.ok(MATERIAL_THEME_PRESETS.dark.metalness >= 0.35 && MATERIAL_THEME_PRESETS.dark.metalness <= 0.55);
});

test("stable variation is deterministic, ID-bound, and geometry-neutral", () => {
  const first = Array.from({ length: 16384 }, (_, id) => stableSeedForPersistentId(id));
  const second = Array.from({ length: 16384 }, (_, id) => stableSeedForPersistentId(id));
  assert.deepEqual(first, second);
  assert.ok(new Set(first).size > 16000);
  assert.ok(first.every((value) => value >= 0 && value <= 1));
  assert.equal(STABLE_VARIATION_CONTRACT.changesGeometry, false);
  assert.equal(STABLE_VARIATION_CONTRACT.changesPerFrame, false);
  assert.match(scene, /float stableOffset = \(vPersistentSeed - 0\.5\) \* uStableVariation/);
  const positionLine = scene.indexOf("gl_Position = projectionMatrix");
  const variationLine = scene.indexOf("float stableOffset");
  assert.ok(positionLine >= 0 && variationLine > positionLine);
});

test("future palette controls are reserved but cannot color M1", () => {
  const controller = defaultMaterialController("light");
  assert.deepEqual(controller.paletteFrom, [0, 0, 0]);
  assert.deepEqual(controller.paletteTo, [0, 0, 0]);
  assert.equal(controller.paletteProgress, 0);
  assert.equal(controller.globalColorPhase, 0);
  assert.equal(controller.materialNeutral, true);
  assert.match(scene, /uniform vec3 uPaletteFrom/);
  assert.doesNotMatch(scene, /mix\(uPaletteFrom, uPaletteTo/);
});

test("frozen PS-03 manifest and M4.1R patch inventory remain exact", () => {
  const manifest = readFileSync("design/photonic-skin/ps-03-m4-1/exports/ps03m41-manifest.json");
  assert.equal(
    createHash("sha256").update(manifest).digest("hex"),
    "d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441",
  );
  const inventory = JSON.parse(
    readFileSync("design/photonic-skin/ps-03-m4-1r/reports/presentation-patch-inventory.json", "utf8"),
  ) as { hash: string; files: Array<{ path: string; sha256: string }> };
  assert.equal(inventory.hash, "228ddce450536d94d625d73f99ceff133371ccfe515a6f21cc3377fa3fda3ca0");
  for (const entry of inventory.files) {
    assert.equal(createHash("sha256").update(readFileSync(entry.path)).digest("hex"), entry.sha256);
  }
});
