import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STAGE = path.join(ROOT, "design/photonic-skin/ps-04-m5-6");
const REPORTS = path.join(STAGE, "reports");
const PUBLIC = path.join(ROOT, "public/photonic-skin/ps-04-m5-5");
const M55 = path.join(ROOT, "design/photonic-skin/ps-04-m5-5");

function sha(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function inventoryHash(dir) {
  const files = readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  const records = files.map((name) => `${name}\t${sha(path.join(dir, name))}\n`).join("");
  return createHash("sha256").update(records).digest("hex");
}

mkdirSync(REPORTS, { recursive: true });
mkdirSync(path.join(STAGE, "renders/baseline"), { recursive: true });
mkdirSync(path.join(STAGE, "renders/production"), { recursive: true });
mkdirSync(path.join(STAGE, "renders/responsive"), { recursive: true });
mkdirSync(path.join(STAGE, "renders/safe-area"), { recursive: true });
mkdirSync(path.join(STAGE, "renders/transitions"), { recursive: true });
mkdirSync(path.join(STAGE, "renders/video"), { recursive: true });
mkdirSync(path.join(STAGE, "scripts"), { recursive: true });
mkdirSync(path.join(STAGE, "tests"), { recursive: true });

const hashes = {
  promotedManifest: sha(path.join(PUBLIC, "manifests/ps04m55-manifest.json")),
  stateHashMap: sha(path.join(M55, "reports/state-hash-map.json")),
  componentMapInventory: inventoryHash(path.join(PUBLIC, "component-maps")),
  productionRuntimeConfig: createHash("sha256")
    .update(readFileSync(path.join(ROOT, "app/_photonic-skin/release.ts")))
    .update(readFileSync(path.join(ROOT, "app/_photonic-skin/runtime.ts")))
    .digest("hex"),
  cameraFramingContract: sha(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/framing.ts")),
  m51ChoreographyConstants: sha(path.join(ROOT, "app/visual-lab/photonic-skin-ps04-m5/m5-choreography.ts")),
};

const lock = {
  stage: "PS-04.M5.6",
  releaseStatus: "LOCAL_PRODUCTION_INTEGRATION_CANDIDATE",
  sourceCheckpoint: "184c696eb5455da762ac47e2dcd9035ad8236a78",
  payloadNamespace: "ps-04-m5-5",
  stateCount: 154,
  selectionLockHash: "14cb2c37d5fac29b2f69a7a8ee1c342be13c67ac9007cd1b256b668663eb9392",
  event: {
    id: "EVENT_A_R2",
    hash: "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b",
  },
  video: {
    id: "VIDEO_COMBO_40_R1",
    hash: "2d6957815b6f58f87f1709e0378313cba271530b8fb0e02282b556780448a873",
    compositionYawDegrees: -40,
    clapperOpenAngleDegrees: 30,
  },
  framing: {
    id: "OWNER_SELECTED_124_111_111",
    aboutRequestedZoom: 1.24,
    aboutMobileCap: 1.18,
    merchRequestedZoom: 1.11,
    merchMobileCap: 1.08,
    videoRequestedZoom: 1.11,
    videoMobileCap: 1.08,
  },
  hashes,
  deployApproved: false,
  ps04Closed: false,
};

writeFileSync(path.join(STAGE, "release-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
writeFileSync(path.join(REPORTS, "source-checkpoint.json"), `${JSON.stringify({
  stage: "PS-04.M5.6",
  sourceCheckpoint: lock.sourceCheckpoint,
  message: "feat(photonic-skin): approve integrated M5 promotion candidate",
  payloadNamespace: "ps-04-m5-5",
  immutable: true,
}, null, 2)}\n`);
writeFileSync(path.join(REPORTS, "release-binding.json"), `${JSON.stringify({
  ...lock,
  productionRoute: "/",
  labPreview: "/visual-lab/photonic-skin-ps04-m5/promotion-preview",
  labReview: "/visual-lab/photonic-skin-ps04-m5/promotion-preview/review",
  descriptor: "/photonic-skin/release/ps-04-m5-6.json",
}, null, 2)}\n`);
writeFileSync(path.join(STAGE, "manifest.json"), `${JSON.stringify({
  stage: "PS-04.M5.6",
  status: "LOCAL_PRODUCTION_INTEGRATION_CANDIDATE",
  sourceCheckpoint: lock.sourceCheckpoint,
  payloadNamespace: "ps-04-m5-5",
  productionRoute: "/",
  deployApproved: false,
  productionDeployApproval: false,
  ps04Closed: false,
  ps04CloseApproval: false,
  commitCreated: false,
  push: false,
  deploy: false,
  machinePass: false,
  humanProductionReviewRequired: true,
}, null, 2)}\n`);

const hashesMap = JSON.parse(readFileSync(path.join(M55, "reports/state-hash-map.json"), "utf8"));
const bins = readdirSync(path.join(PUBLIC, "states")).filter((name) => name.endsWith(".state.bin")).sort();
writeFileSync(path.join(REPORTS, "payload-integrity.json"), `${JSON.stringify({
  stage: "PS-04.M5.6",
  payloadNamespace: "ps-04-m5-5",
  rebuilt: false,
  copiedDonors: false,
  stateCount: bins.length,
  eventHash: sha(path.join(PUBLIC, "states/single-event.state.bin")),
  videoHash: sha(path.join(PUBLIC, "states/single-video.state.bin")),
  hashesMatchLock: sha(path.join(PUBLIC, "states/single-event.state.bin")) === lock.event.hash
    && sha(path.join(PUBLIC, "states/single-video.state.bin")) === lock.video.hash,
  mapCount: Object.keys(hashesMap).length,
  pass: bins.length === 154 && Object.keys(hashesMap).length === 154,
}, null, 2)}\n`);

console.log(JSON.stringify({ releaseLock: sha(path.join(STAGE, "release-lock.json")), hashes }, null, 2));
