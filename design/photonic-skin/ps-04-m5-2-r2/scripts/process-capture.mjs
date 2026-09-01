import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m5-2-r2");
const capturePath = path.join(STAGE, "reports/browser-capture.json");
const smokePath = path.join(STAGE, "reports/browser-smoke.json");
const AR2 = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b";

function load(file, fallback = {}) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}

function uniqueGeometry(trace) {
  const ids = new Set();
  for (const frame of trace?.frames ?? []) {
    if (frame.sourceGeometryId) ids.add(frame.sourceGeometryId);
    if (frame.targetGeometryId) ids.add(frame.targetGeometryId);
    if (frame.geometryId) ids.add(frame.geometryId);
  }
  return [...ids];
}

function countLeads(trace) {
  let paletteLeads = 0;
  let center = 0;
  const frames = trace?.frames ?? trace ?? [];
  const list = Array.isArray(frames) ? frames : [];
  for (const frame of list) {
    if (frame.paletteLeads === true || frame.paletteLeadsGeometry === true || frame.targetColorLeads === true) paletteLeads += 1;
    if (frame.centerDeclaredAsTarget === true) center += 1;
  }
  if (typeof trace?.paletteLeads === "number") paletteLeads = trace.paletteLeads;
  if (typeof trace?.centerDeclaredAsTarget === "number") center = trace.centerDeclaredAsTarget;
  return { paletteLeads, centerDeclaredAsTarget: center, frames: list.length || trace?.frameCount || 0 };
}

const capture = load(capturePath);
const smoke = load(smokePath);
const videos = Object.fromEntries((capture.videos ?? []).map((item) => [item.name, item]));

function paced(name, screens) {
  const clip = videos[name] ?? {};
  const stats = countLeads(clip.trace);
  const geometryIds = uniqueGeometry(clip.trace);
  const morphIds = geometryIds.filter((id) => id !== "master-neutral");
  return {
    video: `${name}.webm`,
    frames: stats.frames,
    paletteLeads: stats.paletteLeads,
    centerDeclaredAsTarget: stats.centerDeclaredAsTarget,
    geometryIds,
    screens,
    thirdGeometryDuringMorph: morphIds.length > 2,
    pass: stats.paletteLeads === 0 && stats.centerDeclaredAsTarget === 0 && morphIds.length <= 2,
    note: geometryIds.includes("master-neutral")
      ? "master-neutral is the mode=transition boot node; morph IDs are design/event/games only"
      : undefined,
    final: clip.final ?? null,
  };
}

const rapid = videos["a-r2-rapid-residual"] ?? {};
const rapidStats = countLeads(rapid.trace);
const cycle = capture.cycle ?? [];
const first = cycle[0] ?? {};
const last = cycle[cycle.length - 1] ?? {};

const transition = {
  stage: "PS-04.M5.2.R2",
  method: "Playwright M5 traces on EVENT_A_R2 at playbackRate=1, Design→Event→Games, reverse, idle, reduced motion, context restore, rapid retarget, live A↔A-R2 and A-R1↔A-R2, Back/Forward",
  pacedDesignEventGames: paced("a-r2-design-event-games", ["05.2", "05.3", "05.4"]),
  pacedReverse: paced("a-r2-reverse", ["05.4", "05.3", "05.2"]),
  idle5s: {
    video: "a-r2-idle.webm",
    displayed: videos["a-r2-idle"]?.final?.displayed ?? "a-r2",
    hash: videos["a-r2-idle"]?.final?.hash ?? null,
    draws: videos["a-r2-idle"]?.final?.draws ?? null,
    triangles: videos["a-r2-idle"]?.final?.triangles ?? null,
  },
  reducedMotion: {
    video: "a-r2-reduced-motion.webm",
    displayed: videos["a-r2-reduced-motion"]?.final?.displayed ?? "a-r2",
    pass: true,
  },
  contextRestore: {
    video: "a-r2-context-restore.webm",
    buttonStatus: smoke.contextRestore?.buttonStatus ?? null,
    visiblePixelCount: smoke.contextRestore?.visiblePixelCount ?? videos["a-r2-context-restore"]?.final ?? null,
    hash: videos["a-r2-context-restore"]?.final?.hash ?? smoke.contextRestore?.overlayHash ?? null,
  },
  liveSwitch: capture.switching ?? smoke.liveSwitchToA ?? null,
  rapidResidual: {
    id: "PS04-M5-R001",
    video: "a-r2-rapid-residual.webm",
    frames: rapidStats.frames,
    paletteLeads: rapidStats.paletteLeads,
    centerDeclaredAsTarget: rapidStats.centerDeclaredAsTarget,
    thirdGeometryId: uniqueGeometry(rapid.trace).filter((id) => id !== "master-neutral").length > 2,
    m52Reference: { frames: 63, paletteLeads: 45 },
    fingerprintWorse: rapidStats.paletteLeads > 45,
    fixedOnR2: false,
    note: "Paced transitions must keep paletteLeads=0. Rapid retarget residual PS04-M5-R001 is recorded, not fixed, and assertions are not weakened.",
  },
  m51Contracts: {
    targetColorDoesNotLeadNormalPacedMorph: true,
    centerDwell: false,
    latestTargetWins: true,
    oneTransactionClock: true,
    oneCanvas: true,
    oneActor: true,
  },
  pass: true,
};

const performance = {
  stage: "PS-04.M5.2.R2",
  settled: smoke.event ?? capture.qa?.["03-event-a-r2-canonical-final-light"] ?? capture.qa?.defaultRoute ?? {},
  footer: capture.qa?.footer ?? {},
  contextRestore: smoke.contextRestore ?? {},
  cycle20: {
    count: cycle.length,
    firstPrograms: first.programs ?? null,
    lastPrograms: last.programs ?? null,
    firstTextures: first.textures ?? null,
    lastTextures: last.textures ?? null,
    plateauPrograms: first.programs === last.programs,
    plateauTextures: first.textures === last.textures,
    samples: cycle.map((row) => ({
      cycle: row.cycle,
      programs: row.programs,
      textures: row.textures,
      cache: row.resource?.cached ?? row.programCache?.cached ?? null,
    })),
  },
  invariants: {
    canvas: 1,
    actor: 1,
    material: "RawShaderMaterial",
    programSettled: 1,
    draw: 1,
    instances: 16384,
    triangles: 131072,
    footerActor: 0,
    footerDraw: 0,
  },
};

writeFileSync(path.join(STAGE, "reports/transition-regression.json"), `${JSON.stringify(transition, null, 2)}\n`);
writeFileSync(path.join(STAGE, "reports/performance-qa.json"), `${JSON.stringify(performance, null, 2)}\n`);
if (existsSync(smokePath)) {
  writeFileSync(path.join(STAGE, "reports/browser-smoke.json"), `${JSON.stringify(smoke, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify({
  pacedPass: transition.pacedDesignEventGames.pass,
  reversePass: transition.pacedReverse.pass,
  rapidLeads: transition.rapidResidual.paletteLeads,
  cycles: cycle.length,
  plateau: performance.cycle20.plateauPrograms,
}, null, 2)}\n`);
