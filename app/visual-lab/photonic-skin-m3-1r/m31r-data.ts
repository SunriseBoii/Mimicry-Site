import {
  M31_DATA_BASE,
  loadState,
  stateLabel,
  titleCase,
  visibleComponents,
  type CameraPreset,
  type DecodedState,
  type M31Manifest,
  type StateEntry,
  type ViewProfile,
} from "../photonic-skin-m3-1/m31-data";

export const M31R_DATA_BASE = "/photonic-skin/ps-03-m3-1r";

export interface M31RManifest extends M31Manifest {
  baselineM31: { stage: string; stateVersion: string; deterministicFingerprint: string; manifestPath: string };
  eventOrientationContract: {
    selectedEulerDegrees: [number, number, number];
    translationOverrides: Record<string, [number, number, number]>;
  };
  approval: { status: string; humanReviewRequired: boolean; m4Recompiled: boolean };
}

export interface M31RQa {
  status: string;
  machinePass: boolean;
  stateCount: number;
  checkedStateViews: number;
  checkedOwnerRows: number;
  checkedComponents: number;
  failureCount: number;
  deterministicFingerprint: string;
}

async function fetchJson<T>(path: string, message: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(message);
  return (await response.json()) as T;
}

export function loadM31RManifest() {
  return fetchJson<M31RManifest>(`${M31R_DATA_BASE}/manifest.json`, "PS-03.M3.1R manifest is unavailable");
}

export function loadM31BaselineManifest() {
  return fetchJson<M31Manifest>(`${M31_DATA_BASE}/manifest.json`, "PS-03.M3.1 baseline manifest is unavailable");
}

export function loadM31RQa() {
  return fetchJson<M31RQa>(`${M31R_DATA_BASE}/qa-summary.json`, "PS-03.M3.1R QA summary is unavailable");
}

export function loadM31RState(entry: StateEntry): Promise<DecodedState> {
  return loadState(entry, M31R_DATA_BASE);
}

export function loadM31BaselineState(entry: StateEntry): Promise<DecodedState> {
  return loadState(entry, M31_DATA_BASE);
}

export {
  M31_DATA_BASE,
  stateLabel,
  titleCase,
  visibleComponents,
  type CameraPreset,
  type DecodedState,
  type M31Manifest,
  type StateEntry,
  type ViewProfile,
};
