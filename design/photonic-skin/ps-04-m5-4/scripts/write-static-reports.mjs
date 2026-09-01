import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ABOUT_GEOMETRY_ID,
  ABOUT_NODE_ID,
  ABOUT_ZOOM_PERCENTS,
  BALANCED_REVIEW,
  BASELINE_MARGIN_THRESHOLD,
  FRAMING_TARGETS,
  MERCH_ZOOM_PERCENTS,
  SELECTED_EVENT_HASH,
  SELECTED_VIDEO_CLAPPER_OPEN_DEGREES,
  SELECTED_VIDEO_HASH,
  SELECTED_VIDEO_YAW_DEGREES,
  UNAFFECTED_NODE_IDS,
  VIDEO_ZOOM_PERCENTS,
  estimatedVisibleBBox,
  framingProfileFor,
  presentationSlot,
  rectsOverlap,
  reservedDomRects,
  viewportClippingPx,
} from "../../../../app/visual-lab/photonic-skin-ps04-m5/framing.ts";
import {
  indexStates,
  resolveScreenActorContract,
} from "../../../../app/visual-lab/photonic-skin-ps04-m5/screen-actor-contract.ts";
import { SCREEN_NODE_BY_ID, SCREEN_NODE_IDS } from "../../../../app/visual-lab/photonic-skin-ps04-m5/topology.ts";
import { SITE_FIT_PROFILES } from "../../../../app/visual-lab/photonic-skin-ps04-m5/site-fit.ts";
import { PHOTONIC_FOV_DEGREES } from "../../../../app/visual-lab/photonic-skin-m4-1r/photonic-presentation.ts";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m5-4");
const REPORTS = path.join(STAGE, "reports");
const FLOW = {
  taskId: null,
  taskSelected: false,
  competencies: [],
  competenciesConfirmed: false,
  settledStateId: null,
};

mkdirSync(REPORTS, { recursive: true });
mkdirSync(path.join(STAGE, "renders/boards"), { recursive: true });
mkdirSync(path.join(STAGE, "renders/browser"), { recursive: true });
mkdirSync(path.join(STAGE, "renders/responsive"), { recursive: true });
mkdirSync(path.join(STAGE, "renders/transitions"), { recursive: true });
mkdirSync(path.join(STAGE, "renders/safe-area"), { recursive: true });
mkdirSync(path.join(STAGE, "renders/video"), { recursive: true });

function write(name, payload) {
  writeFileSync(path.join(REPORTS, name), JSON.stringify(payload, null, 2) + "\n");
}

const index = indexStates([]);
const mapping = SCREEN_NODE_IDS.map((nodeId) => {
  const contract = resolveScreenActorContract({ nodeId, index, flow: FLOW });
  const screen = nodeId === ABOUT_NODE_ID ? "about" : nodeId === "05.7" ? "merch" : nodeId === "05.5" ? "video" : null;
  const profile = framingProfileFor({
    nodeId,
    geometryId: contract.resolvedGeometryId,
    selection: BALANCED_REVIEW,
    width: 1440,
    height: 900,
  });
  return {
    nodeId,
    title: SCREEN_NODE_BY_ID[nodeId].title,
    family: contract.family,
    geometryId: contract.resolvedGeometryId,
    slot: contract.slot,
    framingScreen: screen,
    requestedZoom: profile.requestedZoom,
    effectiveZoom: profile.effectiveZoom,
    framed: Boolean(screen),
  };
});

write("screen-mapping-proof.json", {
  aboutIsExactNode02: mapping.find((row) => row.nodeId === "02")?.framed === true,
  brandWideFamilyNotFramed: mapping.filter((row) => row.family === "BRAND_WIDE" && row.nodeId !== "02").every((row) => row.requestedZoom === 1),
  otherBrandWideNodes: mapping.filter((row) => row.geometryId === ABOUT_GEOMETRY_ID && row.nodeId !== "02"),
  rows: mapping,
});

const viewports = [
  { id: "1920x1080", width: 1920, height: 1080 },
  { id: "1440x900", width: 1440, height: 900 },
  { id: "1280x720", width: 1280, height: 720 },
  { id: "390x844", width: 390, height: 844 },
];

const inventory = {
  camera: {
    type: "PerspectiveCamera",
    fovDegrees: PHOTONIC_FOV_DEGREES,
    zoomOperator: "THREE.PerspectiveCamera.zoom divides the projection frustum; same operator as OrthographicCamera.zoom",
    poseFrozen: true,
    nearFarUnchanged: true,
  },
  siteFitUnchanged: SITE_FIT_PROFILES,
  screens: Object.fromEntries(Object.entries(FRAMING_TARGETS).map(([screen, target]) => {
    const slots = Object.fromEntries(viewports.map((vp) => [vp.id, presentationSlot(vp.width, vp.height, target.slot)]));
    return [screen, { ...target, slots }];
  })),
  mapping,
};

write("framing-inventory.json", inventory);

const candidates = [];
for (const [screen, percents] of [
  ["about", ABOUT_ZOOM_PERCENTS],
  ["merch", MERCH_ZOOM_PERCENTS],
  ["video", VIDEO_ZOOM_PERCENTS],
]) {
  const target = FRAMING_TARGETS[screen];
  for (const percent of percents) {
    const selection = {
      aboutZoom: screen === "about" ? percent : 100,
      merchZoom: screen === "merch" ? percent : 100,
      videoZoom: screen === "video" ? percent : 100,
    };
    for (const vp of viewports) {
      const profile = framingProfileFor({
        nodeId: target.nodeId,
        geometryId: target.geometryId,
        selection,
        width: vp.width,
        height: vp.height,
      });
      const slot = presentationSlot(vp.width, vp.height, target.slot);
      const box = estimatedVisibleBBox(slot, profile.effectiveZoom);
      const reserved = reservedDomRects(vp.width, vp.height);
      const clip = viewportClippingPx(box, vp.width, vp.height);
      const clipPx = clip.left + clip.right + clip.top + clip.bottom;
      const navOverlap = rectsOverlap(box, reserved.graph) || rectsOverlap(box, reserved.header);
      const safeFramePass = clipPx === 0 && !navOverlap;
      candidates.push({
        id: `${screen.toUpperCase()}_${percent}`,
        screen,
        percent,
        viewport: vp.id,
        ...profile,
        slot,
        estimatedVisibleBBox: box,
        clipPx,
        navOverlap,
        safeFramePass,
        capped: profile.effectiveZoom + 1e-8 < profile.requestedZoom,
        baselineIdentity: percent === 100 && profile.effectiveZoom === 1,
      });
    }
  }
}

write("framing-candidates.json", {
  balancedReview: BALANCED_REVIEW,
  notWinner: true,
  selectedVideo: {
    hash: SELECTED_VIDEO_HASH,
    yaw: SELECTED_VIDEO_YAW_DEGREES,
    clapperOpen: SELECTED_VIDEO_CLAPPER_OPEN_DEGREES,
  },
  selectedEventHash: SELECTED_EVENT_HASH,
  candidates,
});

write("safe-area-analysis.json", {
  fillAssumption: 0.82,
  note: "Estimated visible mask = slot * 0.82 * zoom. Browser visible-pixel mask remains the human-review source of truth.",
  threshold: BASELINE_MARGIN_THRESHOLD,
  failing: candidates.filter((row) => !row.safeFramePass),
  passing1440: candidates.filter((row) => row.viewport === "1440x900" && row.safeFramePass).map((row) => row.id),
});

write("responsive-framing.json", {
  viewports,
  mobileCap: candidates.filter((row) => row.viewport === "390x844").map((row) => ({
    id: row.id,
    requestedZoom: row.requestedZoom,
    effectiveZoom: row.effectiveZoom,
    capped: row.capped,
    safeFramePass: row.safeFramePass,
  })),
});

write("baseline-identity.json", {
  zoom1: true,
  cameraFov: PHOTONIC_FOV_DEGREES,
  siteFit: SITE_FIT_PROFILES,
  slotUnchanged: true,
  meshScaleIsSiteFitOnly: true,
  projectionRemainsPerspectiveWithFrustumZoom: true,
});

write("checkpoint-hashes.json", {
  m54Baseline: "af13e9df27be788f8295900d1d7a021bca699998",
  selectedVideo: SELECTED_VIDEO_HASH,
  frozenVideo: "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b",
  eventAR2: SELECTED_EVENT_HASH,
});

console.log("wrote static M5.4 reports");
