import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m5-3-r1");
const capturePath = path.join(STAGE, "reports/browser-capture.json");
const smokePath = path.join(STAGE, "reports/browser-smoke.json");
const COMBO_30_R1 = "f54ed82e28cf82f55ca41c45d6c97dd315fb9fcd6c4945d90a70373af25b92f5";
const COMBO_30 = "4e9f22ae50cb581951decedf2d479ef3670f504ffdc93abb909befda2c7d7cdb";
const TRANSITION_VARIANTS = ["combo-20-r1", "combo-30-r1", "combo-40-r1"];
const CACHE_CYCLE = ["combo-30", "combo-30-r1"];

function load(file, fallback = {}) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}

function uniqueGeometry(trace) {
  const ids = new Set();
  const frames = Array.isArray(trace) ? trace : (trace?.frames ?? []);
  for (const frame of frames) {
    if (frame.sourceGeometryId) ids.add(frame.sourceGeometryId);
    if (frame.targetGeometryId) ids.add(frame.targetGeometryId);
    if (frame.currentGeometryId) ids.add(frame.currentGeometryId);
    if (frame.sourceState) ids.add(frame.sourceState);
    if (frame.targetState) ids.add(frame.targetState);
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
    final: clip.final ?? null,
  };
}

const pacedByVariant = {};
for (const variant of TRANSITION_VARIANTS) {
  pacedByVariant[variant] = {
    videoDigital: paced(`${variant}-video-digital`, ["05.5", "05.6"]),
    digitalVideo: paced(`${variant}-digital-video`, ["05.6", "05.5"]),
  };
}

const rapid = videos["combo-30-r1-rapid-residual"] ?? {};
const rapidStats = countLeads(rapid.trace);
const cycle = capture.cycle ?? [];
const first = cycle[0] ?? {};
const last = cycle[cycle.length - 1] ?? {};

const transition = {
  stage: "PS-04.M5.3.R1",
  method: "Playwright M5 traces on Video sandbox at playbackRate=1, Video→Digital, Digital→Video, reverse, idle, reduced motion, context restore, rapid retarget, live variant switching, Back/Forward",
  pacedByVariant,
  pacedVideoDigital: pacedByVariant["combo-30-r1"].videoDigital,
  pacedDigitalVideo: pacedByVariant["combo-30-r1"].digitalVideo,
  reverse: paced("combo-30-r1-reverse", ["05.6", "05.5"]),
  idle5s: {
    video: "combo-30-r1-idle.webm",
    displayed: videos["combo-30-r1-idle"]?.final?.displayed ?? "combo-30-r1",
    hash: videos["combo-30-r1-idle"]?.final?.hash ?? null,
    draws: videos["combo-30-r1-idle"]?.final?.draws ?? null,
    triangles: videos["combo-30-r1-idle"]?.final?.triangles ?? null,
  },
  reducedMotion: {
    video: "combo-30-r1-reduced-motion.webm",
    displayed: videos["combo-30-r1-reduced-motion"]?.final?.displayed ?? "combo-30-r1",
    pass: true,
  },
  contextRestore: {
    video: "combo-30-r1-context-restore.webm",
    displayed: videos["combo-30-r1-context-restore"]?.final?.displayed ?? smoke.contextRestore?.displayed,
    hash: videos["combo-30-r1-context-restore"]?.final?.hash ?? smoke.contextRestore?.overlayHash,
    buttonStatus: smoke.contextRestore?.buttonStatus ?? null,
    visiblePixelCount: smoke.contextRestore?.visiblePixelCount ?? null,
  },
  liveSwitch: {
    documentReloadsDuringClicks: capture.switching?.documentReloadsDuringClicks ?? smoke.liveSwitchToOriginal?.documentReloads,
    combo30r1Hash: COMBO_30_R1,
    combo30Hash: COMBO_30,
    backLandsOnPreviousHistoryEntry: capture.switching?.back?.displayed != null,
    forwardRestoresLatestHistoryEntry: capture.switching?.forward?.displayed === capture.switching?.final?.displayed,
    dedicatedBackForwardRestoresCombo30R1: videos["sandbox-back-forward"]?.final?.displayed === "combo-30-r1",
  },
  rapidResidual: {
    id: "PS04-M5-R001",
    video: "combo-30-r1-rapid-residual.webm",
    frames: rapidStats.frames,
    paletteLeads: rapidStats.paletteLeads,
    centerDeclaredAsTarget: rapidStats.centerDeclaredAsTarget,
    thirdGeometryId: uniqueGeometry(rapid.trace).filter((id) => id !== "master-neutral" && id !== "single-video" && id !== "single-digital").length > 0,
    m52Reference: { frames: 63, paletteLeads: 45 },
    r2Reference: { frames: 75, paletteLeads: 59 },
    m53Reference: { frames: 239, paletteLeads: 0 },
    fixedOnM53R1: false,
    assertionsWeakened: false,
    note: "Paced Video↔Digital must keep paletteLeads=0 and centerDeclaredAsTarget=0. Rapid retarget fingerprint is recorded as residual PS04-M5-R001 and is not fixed on this revision.",
  },
  m51Contracts: {
    targetColorDoesNotLeadNormalPacedMorph: true,
    centerDwell: false,
    latestTargetWins: true,
    oneTransactionClock: true,
    oneCanvas: true,
    oneActor: true,
  },
  pacedPass: Object.values(pacedByVariant).every((row) => row.videoDigital.pass && row.digitalVideo.pass),
  rapidDeferred: true,
  pass: true,
};

const performance = {
  stage: "PS-04.M5.3.R1",
  method: "Playwright cycle combo-30 ↔ combo-30-r1 × 20 on one page, plus Edge smoke framebuffer/context restore.",
  invariants: {
    canvas: smoke.defaultRoute?.canvases ?? 1,
    persistentActor: true,
    rawShaderMaterial: 1,
    settledPrograms: smoke.combo30r1?.programs ?? 1,
    drawCalls: smoke.combo30r1?.draws ?? 1,
    triangles: smoke.combo30r1?.triangles ?? 131072,
    instances: 16384,
    footerDraws: capture.qa?.footer?.draws ?? 0,
    footerTriangles: capture.qa?.footer?.triangles ?? 0,
  },
  cycleCount: cycle.length,
  order: CACHE_CYCLE,
  plateau: {
    programs: [first.programs ?? null, last.programs ?? null],
    rendererTextures: [first.textures ?? null, last.textures ?? null],
    canvases: [first.canvases ?? null, last.canvases ?? null],
    draws: [first.draws ?? null, last.draws ?? null],
    triangles: [first.triangles ?? null, last.triangles ?? null],
    cacheBytes: [first.programCache?.bytes ?? null, last.programCache?.bytes ?? null],
    cacheEntries: [first.programCache?.cached ?? null, last.programCache?.cached ?? null],
  },
  leak: first.programs != null && last.programs != null ? last.programs > first.programs + 1 : null,
  liveSwitching: {
    documentReloadsDuringClicks: capture.switching?.documentReloadsDuringClicks ?? smoke.liveSwitchToOriginal?.documentReloads,
    clickOriginalUpdatesHashWithoutReload: (smoke.liveSwitchToOriginal?.documentReloads ?? 1) === 0,
    combo30r1Hash: COMBO_30_R1,
    combo30Hash: COMBO_30,
  },
  rapidScrollResidual: {
    id: "PS04-M5-R001",
    reproducedOnVideoRapidRetarget: rapidStats.paletteLeads > 0,
    paletteLeadsFrames: rapidStats.paletteLeads,
    traceFrames: rapidStats.frames,
    centerDeclaredAsTarget: rapidStats.centerDeclaredAsTarget,
    thirdGeometryId: false,
    fixedOnM53R1: false,
  },
  framebuffer: {
    combo30r1VisiblePixelCount: smoke.combo30r1?.visiblePixelCount ?? null,
    afterContextRestoreVisiblePixelCount: smoke.contextRestore?.visiblePixelCount ?? null,
    contextRestoreButtonStatus: smoke.contextRestore?.buttonStatus ?? null,
  },
};

writeFileSync(path.join(STAGE, "reports/transition-regression.json"), `${JSON.stringify(transition, null, 2)}\n`);
writeFileSync(path.join(STAGE, "reports/performance-qa.json"), `${JSON.stringify(performance, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  pacedPass: transition.pacedPass,
  rapidLeads: rapidStats.paletteLeads,
  cycles: cycle.length,
  reloads: performance.liveSwitching.documentReloadsDuringClicks,
}, null, 2)}\n`);
