import { sha256Hex, type M41Manifest } from "../visual-lab/photonic-skin-m4-1/m41-data";

/** Frozen M4.1 program index, copied into the PS-04 release asset namespace. */
export const PS04_MOTION_MANIFEST_PATH = "/photonic-skin/ps-04-release-motion-r1/manifest.json";
export const PS04_MOTION_MANIFEST_SHA256 = "d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441";
export const PS04_ROUTE_DURATION_MS = Object.freeze({ desktop: 650, mobile: 550 });

export async function loadPS04MotionManifest(signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<M41Manifest> {
  const response = await fetchImpl(PS04_MOTION_MANIFEST_PATH, { signal });
  if (!response.ok) throw new Error(`PS-04 motion manifest unavailable (${response.status})`);
  const text = (await response.text()).replace(/\r\n/g, "\n");
  const actual = await sha256Hex(text);
  if (actual !== PS04_MOTION_MANIFEST_SHA256) throw new Error("PS-04 motion manifest SHA-256 mismatch");
  const manifest = JSON.parse(text) as M41Manifest;
  if (
    manifest.stage !== "PS-03.M4.1"
    || manifest.endpointLibrary?.identityCount !== 16384
    || manifest.motionProfile?.profileVersion !== "2.2.0"
    || !manifest.aggregateContentHash
    || !manifest.buildConfigHash
  ) throw new Error("PS-04 motion manifest has an incompatible frozen program index");
  return manifest;
}
