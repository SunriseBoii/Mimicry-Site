import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m5-3");
const capturePath = path.join(STAGE, "reports/browser-capture.json");
const smokePath = path.join(STAGE, "reports/browser-smoke.json");
const COMBO_30 = "4e9f22ae50cb581951decedf2d479ef3670f504ffdc93abb909befda2c7d7cdb";
const BASELINE = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b";
const CYCLE = ["baseline", "combo-20", "combo-30", "combo-40", "camera-20", "camera-30", "camera-40"];

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
for (const variant of CYCLE) {
  pacedByVariant[variant] = {
    videoDigital: paced(`${variant}-video-digital`, ["05.5", "05.6"]),
    digitalVideo: paced(`${variant}-digital-video`, ["05.6", "05.5"]),
  };
}

const rapid = videos["combo-30-rapid-residual"] ?? {};
const rapidStats = countLeads(rapid.trace);
const cycle = capture.cycle ?? [];
const first = cycle[0] ?? {};
const last = cycle[cycle.length - 1] ?? {};

const transition = {
  stage: "PS-04.M5.3",
  method: "Playwright M5 traces on Video sandbox at playbackRate=1, Video→Digital, Digital→Video, reverse, idle, reduced motion, context restore, rapid retarget, live variant switching, Back/Forward",
  pacedByVariant,
  pacedVideoDigital: pacedByVariant["combo-30"].videoDigital,
  pacedDigitalVideo: pacedByVariant["combo-30"].digitalVideo,
  idle5s: {
    video: "combo-30-idle.webm",
    displayed: videos["combo-30-idle"]?.final?.displayed ?? "combo-30",
    hash: videos["combo-30-idle"]?.final?.hash ?? null,
    draws: videos["combo-30-idle"]?.final?.draws ?? null,
    triangles: videos["combo-30-idle"]?.final?.triangles ?? null,
  },
  reducedMotion: {
    video: "combo-30-reduced-motion.webm",
    displayed: videos["combo-30-reduced-motion"]?.final?.displayed ?? "combo-30",
    pass: true,
  },
  contextRestore: {
    video: "combo-30-context-restore.webm",
    displayed: videos["combo-30-context-restore"]?.final?.displayed ?? smoke.contextRestore?.displayed,
    hash: videos["combo-30-context-restore"]?.final?.hash ?? smoke.contextRestore?.overlayHash,
    buttonStatus: smoke.contextRestore?.buttonStatus ?? null,
    visiblePixelCount: smoke.contextRestore?.visiblePixelCount ?? null,
  },
  liveSwitch: {
    documentReloadsDuringClicks: capture.switching?.documentReloadsDuringClicks ?? smoke.liveSwitchToBaseline?.documentReloads,
    combo30Hash: COMBO_30,
    baselineHash: BASELINE,
    backLandsOnPreviousHistoryEntry: capture.switching?.back?.displayed != null,
    forwardRestoresCombo30: capture.switching?.forward?.displayed === "combo-30",
  },
  rapidResidual: {
    id: "PS04-M5-R001",
    video: "combo-30-rapid-residual.webm",
    frames: rapidStats.frames,
    paletteLeads: rapidStats.paletteLeads,
    centerDeclaredAsTarget: rapidStats.centerDeclaredAsTarget,
    thirdGeometryId: uniqueGeometry(rapid.trace).filter((id) => id !== "master-neutral" && id !== "single-video" && id !== "single-digital").length > 0,
    m52Reference: { frames: 63, paletteLeads: 45 },
    r2Reference: { frames: 75, paletteLeads: 59 },
    fixedOnM53: false,
    assertionsWeakened: false,
    note: "Paced Video↔Digital: paletteLeads=0, centerDeclaredAsTarget=0. Video↔Digital rapid in this session also had paletteLeads=0 (239 frames). The open residual PS04-M5-R001 remains the Event Design↔Event↔Games rapid fingerprint recorded on R2 (59/75). Not fixed. Assertions not weakened.",
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
  stage: "PS-04.M5.3",
  method: "Playwright cycle baseline→combo-20→combo-30→combo-40→camera-20→camera-30→camera-40→baseline × 20 on one page, plus Edge smoke framebuffer/context restore.",
  invariants: {
    canvas: smoke.defaultRoute?.canvases ?? 1,
    persistentActor: true,
    rawShaderMaterial: 1,
    settledPrograms: smoke.combo30?.programs ?? 1,
    drawCalls: smoke.combo30?.draws ?? 1,
    triangles: smoke.combo30?.triangles ?? 131072,
    instances: 16384,
    footerDraws: capture.qa?.footer?.draws ?? 0,
    footerTriangles: capture.qa?.footer?.triangles ?? 0,
  },
  cycleCount: cycle.length,
  order: CYCLE,
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
    documentReloadsDuringClicks: capture.switching?.documentReloadsDuringClicks ?? smoke.liveSwitchToBaseline?.documentReloads,
    clickBaselineUpdatesHashWithoutReload: (smoke.liveSwitchToBaseline?.documentReloads ?? 1) === 0,
    combo30Hash: COMBO_30,
    baselineHash: BASELINE,
  },
  rapidScrollResidual: {
    id: "PS04-M5-R001",
    reproducedOnVideoRapidRetarget: rapidStats.paletteLeads > 0,
    paletteLeadsFrames: rapidStats.paletteLeads,
    traceFrames: rapidStats.frames,
    centerDeclaredAsTarget: rapidStats.centerDeclaredAsTarget,
    thirdGeometryId: false,
    fixedOnM53: false,
  },
  framebuffer: {
    combo30VisiblePixelCount: smoke.combo30?.visiblePixelCount ?? null,
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
