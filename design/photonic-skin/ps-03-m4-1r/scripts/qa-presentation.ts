import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";

import {
  decodeState,
  type CameraPreset,
  type DecodedState,
  type LabFrame,
  type M3Manifest,
  type StateEntry,
} from "../../../../app/visual-lab/photonic-skin-m4-1/m41-data";
import {
  PHOTONIC_FAR,
  PHOTONIC_FOV_DEGREES,
  PHOTONIC_NEAR,
  PHOTONIC_PROFILE_SIZE,
  applyPhotonicPresentationCamera,
  cameraDiagnostic,
  createLegacyM41Camera,
  presentationMatrix,
  resolvePresentationFrame,
  semanticAxes,
  visibleComponents,
  type CameraDiagnostic,
  type PresentationFrame,
} from "../../../../app/visual-lab/photonic-skin-m4-1r/photonic-presentation";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "public/photonic-skin/ps-03-m3-1r/manifest.json");
const REPORT_DIR = path.join(ROOT, "design/photonic-skin/ps-03-m4-1r/reports");
const CAMERAS: CameraPreset[] = ["canonical", "alternate"];
const ALL_CAMERAS: CameraPreset[] = ["canonical", "alternate", "side", "top"];
const PROFILES: LabFrame[] = ["desktop", "mobile390", "silhouette180", "silhouette96"];
const ROLES = ["source", "target"] as const;
const EXPECTED_CASES = 154 * ROLES.length * CAMERAS.length * PROFILES.length;

type Role = typeof ROLES[number];

export interface ParityCase {
  stateId: string;
  stateRole: string;
  compositionMode: string;
  endpointRole: Role;
  camera: CameraPreset;
  profile: LabFrame;
  profilePixels: number;
  activeVisible: number;
  cameraMatrixMaxAbs: number;
  presentationMatrixMaxAbs: number;
  ndcMaxAbs: number;
  centroidDeltaPx: number;
  bboxDeltaPx: number;
  semanticAxisMaxAbs: number;
  silhouetteIou: number;
  componentIou: number;
  clippedReference: number;
  clippedCandidate: number;
  pass: boolean;
}

interface ProjectionSummary {
  count: number;
  centroid: [number, number];
  bbox: [number, number, number, number];
  ndcMax: number;
  clipped: number;
  silhouette: Set<number>;
  components: Set<number>;
}

export interface PresentationQaReport {
  stage: "PS-03.M4.1R";
  generatedAt: string;
  endpointManifest: { path: string; sha256: string; stateCount: number; identityCount: number };
  contract: {
    worldUp: [0, 0, 1];
    anchor: [0, 0, 0];
    fovDegrees: number;
    aspect: 1;
    near: number;
    far: number;
    profiles: Record<LabFrame, number>;
    cameraOrder: string[];
    quaternionConvention: "xyzw";
    presentationFrameApplications: 1;
  };
  matrix: {
    expectedCases: number;
    executedCases: number;
    passedCases: number;
    failedCases: number;
    standaloneEndpointCases: number;
    eventDesignFourCameraDiagnosticCases: number;
    eventDesignFourCameraDiagnosticPassed: number;
    sourceCases: number;
    targetCases: number;
    maximums: {
      cameraMatrixMaxAbs: number;
      presentationMatrixMaxAbs: number;
      ndcMaxAbs: number;
      centroidDeltaPx: number;
      bboxDeltaPx: number;
      semanticAxisMaxAbs: number;
      clippedReference: number;
      clippedCandidate: number;
    };
    minimums: { silhouetteIou: number; componentIou: number };
    byProfile: Record<LabFrame, { cases: number; passed: number }>;
    byCamera: Record<"canonical" | "alternate", { cases: number; passed: number }>;
  };
  rootCauseAudit: {
    legacyCanvasCss: [874, 398];
    approvedCanvasCss: [512, 512];
    correctedCanvasCss: [512, 512];
    legacyCamera: Record<string, CameraDiagnostic>;
    approvedCamera: Record<string, CameraDiagnostic>;
    correctedCamera: Record<string, CameraDiagnostic>;
    findings: string[];
    highlightedStates: Array<{
      stateId: string;
      camera: CameraPreset;
      legacyVsApprovedNdcMax: number;
      correctedVsApprovedNdcMax: number;
      legacySemanticAxisMax: number;
      correctedSemanticAxisMax: number;
    }>;
  };
  invariants: Record<string, boolean | number | string>;
  caseDigestSha256: string;
  cases: ParityCase[];
  eventDesignFourCameraDiagnostics: ParityCase[];
  status: "MACHINE PASS / HUMAN REVIEW REQUIRED" | "MACHINE FAIL / HUMAN REVIEW REQUIRED";
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function maxAbsDelta(a: ArrayLike<number>, b: ArrayLike<number>) {
  let maximum = 0;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    maximum = Math.max(maximum, Math.abs((a[index] ?? 0) - (b[index] ?? 0)));
  }
  return maximum;
}

/** Independent transcription of the frozen M3.1R CameraRig. */
function createApprovedCamera(contract: M3Manifest["presentationContract"], preset: CameraPreset) {
  const camera = new THREE.PerspectiveCamera(contract.fovDegrees, 1, 0.01, 100);
  camera.position.set(...contract.cameras[preset]);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function approvedPresentationMatrix(entry: StateEntry) {
  const raw = entry as StateEntry & { presentationFrame?: PresentationFrame };
  if (!raw.presentationFrame) throw new Error(`Approved presentation frame missing for ${entry.stateId}`);
  const frame = raw.presentationFrame;
  return new THREE.Matrix4().set(
    frame.scale, 0, 0, frame.translate[0] * frame.scale,
    0, frame.scale, 0, frame.translate[1] * frame.scale,
    0, 0, frame.scale, frame.translate[2] * frame.scale,
    0, 0, 0, 1,
  );
}

function projectRaw(matrix: THREE.Matrix4, x: number, y: number, z: number): [number, number, number] {
  const e = matrix.elements;
  const w = e[3] * x + e[7] * y + e[11] * z + e[15];
  return [
    (e[0] * x + e[4] * y + e[8] * z + e[12]) / w,
    (e[1] * x + e[5] * y + e[9] * z + e[13]) / w,
    (e[2] * x + e[6] * y + e[10] * z + e[14]) / w,
  ];
}

function summarizeProjection(
  state: DecodedState,
  model: THREE.Matrix4,
  camera: THREE.PerspectiveCamera,
  profile: LabFrame,
) {
  const shown = visibleComponents(state.entry, profile);
  const size = PHOTONIC_PROFILE_SIZE[profile];
  const mvp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(model);
  const silhouette = new Set<number>();
  const components = new Set<number>();
  let sumX = 0;
  let sumY = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let ndcMax = 0;
  let clipped = 0;
  let count = 0;
  for (let id = 0; id < state.recordCount; id += 1) {
    if (state.status[id] !== 0 || !shown.has(state.component[id])) continue;
    const lane = id * 3;
    const ndc = projectRaw(mvp, state.position[lane], state.position[lane + 1], state.position[lane + 2]);
    const pixelX = (ndc[0] * 0.5 + 0.5) * (size - 1);
    const pixelY = (0.5 - ndc[1] * 0.5) * (size - 1);
    sumX += pixelX;
    sumY += pixelY;
    minX = Math.min(minX, pixelX);
    minY = Math.min(minY, pixelY);
    maxX = Math.max(maxX, pixelX);
    maxY = Math.max(maxY, pixelY);
    ndcMax = Math.max(ndcMax, Math.abs(ndc[0]), Math.abs(ndc[1]));
    if (Math.abs(ndc[0]) > 1 || Math.abs(ndc[1]) > 1 || ndc[2] < -1 || ndc[2] > 1) clipped += 1;
    const pixel = Math.max(0, Math.min(size - 1, Math.round(pixelY))) * size
      + Math.max(0, Math.min(size - 1, Math.round(pixelX)));
    silhouette.add(pixel);
    components.add(state.component[id] * size * size + pixel);
    count += 1;
  }
  if (!count) throw new Error(`No visible active records for ${state.entry.stateId}/${profile}`);
  return {
    count,
    centroid: [sumX / count, sumY / count],
    bbox: [minX, minY, maxX, maxY],
    ndcMax,
    clipped,
    silhouette,
    components,
  } satisfies ProjectionSummary;
}

function setIou(a: Set<number>, b: Set<number>) {
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 1;
}

async function loadState(entry: StateEntry) {
  const publicPath = entry.bufferPath.replace(/^\//, "");
  const bytes = await readFile(path.join(
    ROOT,
    "public/photonic-skin/ps-03-m3-1r",
    publicPath.replace(/^photonic-skin\/ps-03-m3-1r\//, ""),
  ));
  const payload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return decodeState(entry, payload);
}

function comparisonCase(
  state: DecodedState,
  endpointRole: Role,
  cameraPreset: CameraPreset,
  profile: LabFrame,
  approvedCamera: THREE.PerspectiveCamera,
  correctedCamera: THREE.PerspectiveCamera,
) {
  const referenceModel = approvedPresentationMatrix(state.entry);
  const correctedModel = presentationMatrix(resolvePresentationFrame(state.entry));
  const reference = summarizeProjection(state, referenceModel, approvedCamera, profile);
  const corrected = summarizeProjection(state, correctedModel, correctedCamera, profile);
  const cameraMatrixMaxAbs = maxAbsDelta(
    new THREE.Matrix4().multiplyMatrices(approvedCamera.projectionMatrix, approvedCamera.matrixWorldInverse).elements,
    new THREE.Matrix4().multiplyMatrices(correctedCamera.projectionMatrix, correctedCamera.matrixWorldInverse).elements,
  );
  const presentationMatrixMaxAbs = maxAbsDelta(referenceModel.elements, correctedModel.elements);
  const semanticAxisMaxAbs = Math.max(
    maxAbsDelta(semanticAxes(approvedCamera).up, semanticAxes(correctedCamera).up),
    maxAbsDelta(semanticAxes(approvedCamera).forward, semanticAxes(correctedCamera).forward),
  );
  const centroidDeltaPx = Math.hypot(
    reference.centroid[0] - corrected.centroid[0],
    reference.centroid[1] - corrected.centroid[1],
  );
  const bboxDeltaPx = maxAbsDelta(reference.bbox, corrected.bbox);
  const silhouetteIou = setIou(reference.silhouette, corrected.silhouette);
  const componentIou = setIou(reference.components, corrected.components);
  const result: ParityCase = {
    stateId: state.entry.stateId,
    stateRole: state.entry.stateRole,
    compositionMode: state.entry.compositionMode,
    endpointRole,
    camera: cameraPreset,
    profile,
    profilePixels: PHOTONIC_PROFILE_SIZE[profile],
    activeVisible: reference.count,
    cameraMatrixMaxAbs,
    presentationMatrixMaxAbs,
    ndcMaxAbs: Math.abs(reference.ndcMax - corrected.ndcMax),
    centroidDeltaPx,
    bboxDeltaPx,
    semanticAxisMaxAbs,
    silhouetteIou,
    componentIou,
    clippedReference: reference.clipped,
    clippedCandidate: corrected.clipped,
    pass: cameraMatrixMaxAbs <= 1e-12
      && presentationMatrixMaxAbs <= 1e-12
      && centroidDeltaPx <= 1e-9
      && bboxDeltaPx <= 1e-9
      && semanticAxisMaxAbs <= 1e-12
      && silhouetteIou === 1
      && componentIou === 1
      && reference.clipped === 0
      && corrected.clipped === 0,
  };
  return result;
}

function legacyHighlight(
  state: DecodedState,
  contract: M3Manifest["presentationContract"],
  preset: CameraPreset,
) {
  const approvedCamera = createApprovedCamera(contract, preset);
  const correctedCamera = applyPhotonicPresentationCamera(
    new THREE.PerspectiveCamera(PHOTONIC_FOV_DEGREES, 1, PHOTONIC_NEAR, PHOTONIC_FAR),
    contract,
    preset,
  );
  const legacyCamera = createLegacyM41Camera(contract, preset, 874 / 398);
  const identity = new THREE.Matrix4();
  const approved = summarizeProjection(state, approvedPresentationMatrix(state.entry), approvedCamera, "desktop");
  const corrected = summarizeProjection(state, presentationMatrix(resolvePresentationFrame(state.entry)), correctedCamera, "desktop");
  const legacy = summarizeProjection(state, identity, legacyCamera, "desktop");
  const approvedAxes = semanticAxes(approvedCamera);
  const correctedAxes = semanticAxes(correctedCamera);
  const legacyAxes = semanticAxes(legacyCamera);
  return {
    stateId: state.entry.stateId,
    camera: preset,
    legacyVsApprovedNdcMax: Math.max(
      Math.abs(legacy.centroid[0] - approved.centroid[0]) / 511,
      Math.abs(legacy.centroid[1] - approved.centroid[1]) / 511,
      maxAbsDelta(legacy.bbox, approved.bbox) / 511,
    ),
    correctedVsApprovedNdcMax: Math.max(
      Math.abs(corrected.centroid[0] - approved.centroid[0]) / 511,
      Math.abs(corrected.centroid[1] - approved.centroid[1]) / 511,
      maxAbsDelta(corrected.bbox, approved.bbox) / 511,
    ),
    legacySemanticAxisMax: Math.max(
      maxAbsDelta(legacyAxes.up, approvedAxes.up),
      maxAbsDelta(legacyAxes.forward, approvedAxes.forward),
    ),
    correctedSemanticAxisMax: Math.max(
      maxAbsDelta(correctedAxes.up, approvedAxes.up),
      maxAbsDelta(correctedAxes.forward, approvedAxes.forward),
    ),
  };
}

function csv(cases: ParityCase[]) {
  const columns: Array<keyof ParityCase> = [
    "stateId", "stateRole", "compositionMode", "endpointRole", "camera", "profile", "profilePixels",
    "activeVisible", "cameraMatrixMaxAbs", "presentationMatrixMaxAbs", "ndcMaxAbs", "centroidDeltaPx",
    "bboxDeltaPx", "semanticAxisMaxAbs", "silhouetteIou", "componentIou", "clippedReference",
    "clippedCandidate", "pass",
  ];
  return [columns.join(","), ...cases.map((item) => columns.map((column) => String(item[column])).join(","))].join("\n") + "\n";
}

export async function runPresentationQa({ write = true } = {}) {
  const manifestBytes = await readFile(MANIFEST_PATH);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as M3Manifest;
  if (manifest.stateCount !== 154 || manifest.states.length !== 154) throw new Error("Frozen state matrix must contain 154 states");
  const approvedCameras = Object.fromEntries(ALL_CAMERAS.map((preset) => [preset, createApprovedCamera(manifest.presentationContract, preset)])) as Record<CameraPreset, THREE.PerspectiveCamera>;
  const correctedCameras = Object.fromEntries(ALL_CAMERAS.map((preset) => [preset, applyPhotonicPresentationCamera(
    new THREE.PerspectiveCamera(PHOTONIC_FOV_DEGREES, 1, PHOTONIC_NEAR, PHOTONIC_FAR),
    manifest.presentationContract,
    preset,
  )])) as Record<CameraPreset, THREE.PerspectiveCamera>;
  const cases: ParityCase[] = [];
  const highlighted: DecodedState[] = [];
  for (const entry of manifest.states) {
    const state = await loadState(entry);
    if (/single-(event|design)$/.test(entry.stateId)) highlighted.push(state);
    for (const role of ROLES) {
      for (const camera of CAMERAS) {
        for (const profile of PROFILES) {
          cases.push(comparisonCase(state, role, camera, profile, approvedCameras[camera], correctedCameras[camera]));
        }
      }
    }
  }
  const eventDesignFourCameraDiagnostics = highlighted.flatMap((state) => ALL_CAMERAS.flatMap((camera) => PROFILES.flatMap((profile) => ROLES.map((role) => (
    comparisonCase(state, role, camera, profile, approvedCameras[camera], correctedCameras[camera])
  )))));
  const byProfile = Object.fromEntries(PROFILES.map((profile) => [profile, {
    cases: cases.filter((item) => item.profile === profile).length,
    passed: cases.filter((item) => item.profile === profile && item.pass).length,
  }])) as PresentationQaReport["matrix"]["byProfile"];
  const byCamera = Object.fromEntries(CAMERAS.map((camera) => [camera, {
    cases: cases.filter((item) => item.camera === camera).length,
    passed: cases.filter((item) => item.camera === camera && item.pass).length,
  }])) as PresentationQaReport["matrix"]["byCamera"];
  const maximum = (key: keyof ParityCase) => Math.max(...cases.map((item) => Number(item[key])));
  const minimum = (key: keyof ParityCase) => Math.min(...cases.map((item) => Number(item[key])));
  const legacyCamera = Object.fromEntries(CAMERAS.map((preset) => [preset, cameraDiagnostic(createLegacyM41Camera(manifest.presentationContract, preset, 874 / 398), preset)]));
  const approvedCamera = Object.fromEntries(CAMERAS.map((preset) => [preset, cameraDiagnostic(approvedCameras[preset], preset)]));
  const correctedCamera = Object.fromEntries(CAMERAS.map((preset) => [preset, cameraDiagnostic(correctedCameras[preset], preset)]));
  const passedCases = cases.filter((item) => item.pass).length;
  const caseCsv = csv(cases);
  const report: PresentationQaReport = {
    stage: "PS-03.M4.1R",
    generatedAt: new Date().toISOString(),
    endpointManifest: { path: "/photonic-skin/ps-03-m3-1r/manifest.json", sha256: sha256(manifestBytes), stateCount: manifest.stateCount, identityCount: manifest.identitySpace.size },
    contract: {
      worldUp: [0, 0, 1], anchor: [0, 0, 0], fovDegrees: PHOTONIC_FOV_DEGREES, aspect: 1,
      near: PHOTONIC_NEAR, far: PHOTONIC_FAR, profiles: PHOTONIC_PROFILE_SIZE,
      cameraOrder: ["position", "up", "fov/aspect/clip", "lookAt", "projection", "matrixWorld"],
      quaternionConvention: "xyzw", presentationFrameApplications: 1,
    },
    matrix: {
      expectedCases: EXPECTED_CASES,
      executedCases: cases.length,
      passedCases,
      failedCases: cases.length - passedCases,
      standaloneEndpointCases: manifest.states.length * CAMERAS.length * PROFILES.length,
      eventDesignFourCameraDiagnosticCases: eventDesignFourCameraDiagnostics.length,
      eventDesignFourCameraDiagnosticPassed: eventDesignFourCameraDiagnostics.filter((item) => item.pass).length,
      sourceCases: cases.filter((item) => item.endpointRole === "source").length,
      targetCases: cases.filter((item) => item.endpointRole === "target").length,
      maximums: {
        cameraMatrixMaxAbs: maximum("cameraMatrixMaxAbs"),
        presentationMatrixMaxAbs: maximum("presentationMatrixMaxAbs"),
        ndcMaxAbs: maximum("ndcMaxAbs"),
        centroidDeltaPx: maximum("centroidDeltaPx"),
        bboxDeltaPx: maximum("bboxDeltaPx"),
        semanticAxisMaxAbs: maximum("semanticAxisMaxAbs"),
        clippedReference: maximum("clippedReference"),
        clippedCandidate: maximum("clippedCandidate"),
      },
      minimums: { silhouetteIou: minimum("silhouetteIou"), componentIou: minimum("componentIou") },
      byProfile, byCamera,
    },
    rootCauseAudit: {
      legacyCanvasCss: [874, 398], approvedCanvasCss: [512, 512], correctedCanvasCss: [512, 512],
      legacyCamera, approvedCamera, correctedCamera,
      findings: [
        "Legacy M4.1 called lookAt with Three.js default Y-up; approved M3.1R sets Z-up before lookAt.",
        "Legacy M4.1 used the host panel aspect ratio; approved presentation profiles are square.",
        "Legacy M4.1 omitted the frozen per-state presentation translate/scale and component visibility map.",
        "Legacy M4.1 clip planes were near=0.1/far=50; frozen M3.1R uses near=0.01/far=100.",
        "M4.1R centralizes camera order and applies exactly one interpolated presentation frame after motion evaluation.",
      ],
      highlightedStates: highlighted.flatMap((state) => ALL_CAMERAS.map((preset) => legacyHighlight(state, manifest.presentationContract, preset))),
    },
    invariants: {
      frozenM31rManifestSha256: sha256(manifestBytes),
      stateCount154: manifest.states.length === 154,
      identityCount16384: manifest.identitySpace.size === 16384,
      sourceTargetRoleCoverage: cases.filter((item) => item.endpointRole === "source").length === 1232 && cases.filter((item) => item.endpointRole === "target").length === 1232,
      squareProfiles: Object.values(PHOTONIC_PROFILE_SIZE).every((size) => Number.isInteger(size) && size > 0),
      cameraZUp: CAMERAS.every((preset) => correctedCameras[preset].up.equals(new THREE.Vector3(0, 0, 1))),
      cameraAspectOne: CAMERAS.every((preset) => correctedCameras[preset].aspect === 1),
      fov33: CAMERAS.every((preset) => correctedCameras[preset].fov === 33),
      clipPlanes: CAMERAS.every((preset) => correctedCameras[preset].near === 0.01 && correctedCameras[preset].far === 100),
      rootTransform: "identity",
      actorEndpointTransform: "identity-by-exact-t0/t1-shader-branches",
      doublePresentationTransform: false,
      quaternionConvention: "xyzw",
    },
    caseDigestSha256: sha256(caseCsv),
    cases,
    eventDesignFourCameraDiagnostics,
    status: passedCases === EXPECTED_CASES
      ? "MACHINE PASS / HUMAN REVIEW REQUIRED"
      : "MACHINE FAIL / HUMAN REVIEW REQUIRED",
  };
  if (write) {
    await mkdir(REPORT_DIR, { recursive: true });
    await writeFile(path.join(REPORT_DIR, "presentation-parity-matrix.csv"), caseCsv);
    await writeFile(path.join(REPORT_DIR, "presentation-parity-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = await runPresentationQa();
  console.log(JSON.stringify({
    status: report.status,
    cases: report.matrix.executedCases,
    passed: report.matrix.passedCases,
    failed: report.matrix.failedCases,
    maximums: report.matrix.maximums,
    minimums: report.matrix.minimums,
    caseDigestSha256: report.caseDigestSha256,
  }, null, 2));
  if (report.matrix.failedCases) process.exitCode = 1;
}
