/**
 * PS-04.M5.6 canonical release binding.
 * Production loads immutable ps-04-m5-5 buffers through this descriptor.
 * No geometry authoring, overlays, or query-driven selection.
 */

export const M56_STAGE = "PS-04.M5.6";
export const M56_RUN_ID = "ps04-m5-6";
export const M56_SESSION_ID = "ps04-m5-6-production";

export const M55_CHECKPOINT = "184c696eb5455da762ac47e2dcd9035ad8236a78";
export const PAYLOAD_NAMESPACE = "ps-04-m5-5";
export const PAYLOAD_DATA_BASE = "/photonic-skin/ps-04-m5-5";
export const PAYLOAD_MANIFEST_PATH = `${PAYLOAD_DATA_BASE}/manifests/ps04m55-manifest.json`;
export const RELEASE_DESCRIPTOR_PATH = "/photonic-skin/release/ps-04-m5-6.json";

export const SELECTION_LOCK_HASH = "14cb2c37d5fac29b2f69a7a8ee1c342be13c67ac9007cd1b256b668663eb9392";
export const SELECTED_EVENT_ID = "EVENT_A_R2";
export const SELECTED_EVENT_HASH = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b";
export const SELECTED_VIDEO_ID = "VIDEO_COMBO_40_R1";
export const SELECTED_VIDEO_HASH = "2d6957815b6f58f87f1709e0378313cba271530b8fb0e02282b556780448a873";
export const SELECTED_VIDEO_YAW_DEGREES = -40;
export const SELECTED_VIDEO_CLAPPER_OPEN_DEGREES = 30;
export const FRAMING_PROFILE_ID = "OWNER_SELECTED_124_111_111";

export const RELEASE_FRAMING = Object.freeze({
  id: FRAMING_PROFILE_ID,
  aboutRequestedZoom: 1.24,
  aboutMobileCap: 1.18,
  merchRequestedZoom: 1.11,
  merchMobileCap: 1.08,
  videoRequestedZoom: 1.11,
  videoMobileCap: 1.08,
  aboutZoomPercent: 124 as const,
  merchZoomPercent: 111 as const,
  videoZoomPercent: 111 as const,
});

export const RELEASE_LOCK = Object.freeze({
  stage: M56_STAGE,
  releaseStatus: "LOCAL_PRODUCTION_INTEGRATION_CANDIDATE",
  sourceCheckpoint: M55_CHECKPOINT,
  payloadNamespace: PAYLOAD_NAMESPACE,
  stateCount: 154,
  selectionLockHash: SELECTION_LOCK_HASH,
  event: { id: SELECTED_EVENT_ID, hash: SELECTED_EVENT_HASH },
  video: {
    id: SELECTED_VIDEO_ID,
    hash: SELECTED_VIDEO_HASH,
    compositionYawDegrees: SELECTED_VIDEO_YAW_DEGREES,
    clapperOpenAngleDegrees: SELECTED_VIDEO_CLAPPER_OPEN_DEGREES,
  },
  framing: {
    id: FRAMING_PROFILE_ID,
    aboutRequestedZoom: RELEASE_FRAMING.aboutRequestedZoom,
    aboutMobileCap: RELEASE_FRAMING.aboutMobileCap,
    merchRequestedZoom: RELEASE_FRAMING.merchRequestedZoom,
    merchMobileCap: RELEASE_FRAMING.merchMobileCap,
    videoRequestedZoom: RELEASE_FRAMING.videoRequestedZoom,
    videoMobileCap: RELEASE_FRAMING.videoMobileCap,
  },
  eventOverlay: "none",
  videoOverlay: "none",
  runtimeRotationOverride: "none",
  deployApproved: false,
  ps04Closed: false,
});
