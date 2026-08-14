import * as THREE from "three";
import type {
  CameraPreset,
  DecodedState,
  LabFrame,
  M3Manifest,
  StateEntry,
} from "../photonic-skin-m4-1/m41-data";

export const M41R_STAGE = "PS-03.M4.1R" as const;
export const M41_BASELINE_AGGREGATE = "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361";
export const M41_BASELINE_MANIFEST_SHA256 = "d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441";
export const PHOTONIC_WORLD_UP = [0, 0, 1] as const;
export const PHOTONIC_PRESENTATION_ANCHOR = [0, 0, 0] as const;
export const PHOTONIC_FOV_DEGREES = 33;
export const PHOTONIC_NEAR = 0.01;
export const PHOTONIC_FAR = 100;

export const PHOTONIC_PROFILE_SIZE: Record<LabFrame, number> = {
  desktop: 512,
  mobile390: 390,
  silhouette180: 180,
  silhouette96: 96,
};

export interface PresentationFrame {
  anchor?: readonly [number, number, number];
  translate: readonly [number, number, number];
  scale: number;
  cameraRig?: string;
  targetNdcHalfSpan?: number;
}

export interface PresentationComponent {
  componentIndex: number;
  visibleProfiles: LabFrame[];
}

export type PresentationStateEntry = StateEntry & {
  presentationFrame?: PresentationFrame;
  componentMap?: PresentationComponent[];
};

export interface CameraDiagnostic {
  preset: CameraPreset;
  position: number[];
  up: number[];
  quaternion: number[];
  fov: number;
  aspect: number;
  near: number;
  far: number;
  matrixWorld: number[];
  matrixWorldInverse: number[];
  projectionMatrix: number[];
  viewProjectionMatrix: number[];
}

export function c2PresentationProgress(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (10 + t * (-15 + 6 * t));
}

export function resolvePresentationFrame(entry: StateEntry): PresentationFrame {
  const frame = (entry as PresentationStateEntry).presentationFrame;
  if (!frame) throw new Error(`Frozen presentationFrame missing for ${entry.stateId}`);
  if (!Number.isFinite(frame.scale) || frame.scale <= 0) throw new Error(`Invalid presentation scale for ${entry.stateId}`);
  if (frame.translate.length !== 3 || frame.translate.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid presentation translate for ${entry.stateId}`);
  }
  return frame;
}

export function interpolatePresentationFrames(source: StateEntry, target: StateEntry, progress: number): PresentationFrame {
  const a = resolvePresentationFrame(source);
  const b = resolvePresentationFrame(target);
  const t = c2PresentationProgress(progress);
  if (progress <= 0) return a;
  if (progress >= 1) return b;
  return {
    anchor: [0, 0, 0],
    cameraRig: "production-fixed-v1",
    targetNdcHalfSpan: a.targetNdcHalfSpan ?? b.targetNdcHalfSpan ?? 0.8,
    translate: [
      a.translate[0] + (b.translate[0] - a.translate[0]) * t,
      a.translate[1] + (b.translate[1] - a.translate[1]) * t,
      a.translate[2] + (b.translate[2] - a.translate[2]) * t,
    ],
    scale: a.scale + (b.scale - a.scale) * t,
  };
}

export function visibleComponents(entry: StateEntry, profile: LabFrame) {
  const map = (entry as PresentationStateEntry).componentMap;
  if (!map) return new Set(Array.from({ length: entry.componentCount }, (_, index) => index));
  return new Set(map.filter((component) => component.visibleProfiles.includes(profile)).map((component) => component.componentIndex));
}

export function applyPhotonicPresentationCamera(
  camera: THREE.PerspectiveCamera,
  contract: M3Manifest["presentationContract"],
  preset: CameraPreset,
) {
  const position = contract.cameras[preset];
  if (contract.fovDegrees !== PHOTONIC_FOV_DEGREES) throw new Error(`Frozen FOV mismatch: ${contract.fovDegrees}`);
  camera.position.set(...position);
  camera.up.set(...PHOTONIC_WORLD_UP);
  camera.fov = PHOTONIC_FOV_DEGREES;
  camera.aspect = 1;
  camera.near = PHOTONIC_NEAR;
  camera.far = PHOTONIC_FAR;
  camera.lookAt(...PHOTONIC_PRESENTATION_ANCHOR);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

export function createPhotonicPresentationCamera(
  contract: M3Manifest["presentationContract"],
  preset: CameraPreset,
) {
  return applyPhotonicPresentationCamera(
    new THREE.PerspectiveCamera(PHOTONIC_FOV_DEGREES, 1, PHOTONIC_NEAR, PHOTONIC_FAR),
    contract,
    preset,
  );
}

export function createLegacyM41Camera(
  contract: M3Manifest["presentationContract"],
  preset: CameraPreset,
  aspect: number,
) {
  const camera = new THREE.PerspectiveCamera(contract.fovDegrees, aspect, 0.1, 50);
  camera.position.set(...contract.cameras[preset]);
  // Intentionally records the pre-fix Three.js Y-up behavior.
  camera.lookAt(...PHOTONIC_PRESENTATION_ANCHOR);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

export function presentationMatrix(frame: PresentationFrame) {
  const scale = frame.scale;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(frame.translate[0] * scale, frame.translate[1] * scale, frame.translate[2] * scale),
    new THREE.Quaternion(),
    new THREE.Vector3(scale, scale, scale),
  );
}

export function cameraDiagnostic(camera: THREE.PerspectiveCamera, preset: CameraPreset): CameraDiagnostic {
  camera.updateMatrixWorld(true);
  const viewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  return {
    preset,
    position: camera.position.toArray(),
    up: camera.up.toArray(),
    quaternion: camera.quaternion.toArray(),
    fov: camera.fov,
    aspect: camera.aspect,
    near: camera.near,
    far: camera.far,
    matrixWorld: camera.matrixWorld.toArray(),
    matrixWorldInverse: camera.matrixWorldInverse.toArray(),
    projectionMatrix: camera.projectionMatrix.toArray(),
    viewProjectionMatrix: viewProjection.toArray(),
  };
}

export function projectPresentedPoint(
  point: readonly [number, number, number],
  frame: PresentationFrame,
  camera: THREE.PerspectiveCamera,
) {
  const projected = new THREE.Vector3(point[0], point[1], point[2])
    .applyMatrix4(presentationMatrix(frame))
    .project(camera);
  return projected.toArray() as [number, number, number];
}

export function presentedPoint(state: DecodedState, id: number, frame = resolvePresentationFrame(state.entry)) {
  const offset = id * 3;
  const scale = frame.scale;
  return [
    (state.position[offset] + frame.translate[0]) * scale,
    (state.position[offset + 1] + frame.translate[1]) * scale,
    (state.position[offset + 2] + frame.translate[2]) * scale,
  ] as const;
}

export function semanticAxes(camera: THREE.PerspectiveCamera) {
  const origin = new THREE.Vector3(0, 0, 0).project(camera);
  const up = new THREE.Vector3(0, 0, 1).project(camera).sub(origin).normalize();
  const forward = new THREE.Vector3(0, 1, 0).project(camera).sub(origin).normalize();
  return { up: up.toArray(), forward: forward.toArray() };
}
