/**
 * PS-03.M matter & skin: browser-side decoding of the offline-baked dataset.
 *
 * The offline solver (design/photonic-skin/ps-03-m/scripts/build_ps03m.py)
 * exports a quantised binary blob + JSON manifest. This module decodes them
 * into Float32 arrays ready for DataTextures. Pure functions, no three.js
 * imports, so everything here is unit-testable under node.
 *
 * Coordinate note: the solver works z-up (Blender convention); this decoder
 * converts to three.js y-up as (x, y, z) -> (x, z, -y).
 */

export const SCALE_COUNT = 8192;

export interface StateInfo {
  volume_raw: number;
  normalize_scale: number;
  volume: number;
  volume_error: number;
  area: number;
  components: number;
  surface_scale: number;
  visible: number;
  reserve: number;
  neutral_share: number;
  component_split: { gamepad: number; queen: number } | null;
}

export interface KeyMeta {
  t: number;
  w: number;
  phase: string;
  volume_raw: number;
  volume_corrected: number;
  volume_error: number;
  components: number;
  visible: number;
  transition: number;
  reserve: number;
}

export interface SegmentInfo {
  name: string;
  row_start: number;
  meta: KeyMeta[];
}

export interface Manifest {
  stage: string;
  seed: number;
  scale_count: number;
  v0: number;
  volume_tolerance: number;
  plate_radius: number;
  scale_range: [number, number];
  quant_bounds: { lo: [number, number, number]; hi: [number, number, number] };
  row_bytes: number;
  row_index: Record<string, number>;
  rows_total: number;
  keys_per_segment: number;
  key_times: number[];
  color_offset: number;
  component_offset: number;
  rotation_offset: number;
  bin_size: number;
  bin_sha256: string;
  states: Record<"sphere" | "book" | "game", StateInfo>;
  segments: SegmentInfo[];
  phases: { t: number; name: string }[];
}

export const STATE_ORDER = ["sphere", "book", "game"] as const;
export type StateName = (typeof STATE_ORDER)[number];

export interface DecodedRows {
  /** RGBA32F texel data: xyz world position (y-up) + w = plate scale. */
  positionScale: Float32Array;
  /** RGBA32F texel data: xyz unit normal (y-up) + w = state flag 0|1|2. */
  normalState: Float32Array;
  rows: number;
}

export interface DecodedStatics {
  /** RGBA u8 per end state row: rgb color + chroma flag. */
  colors: Uint8Array; // 3 rows x N x 4
  component: Uint8Array; // N
  rotation: Float32Array; // N
}

const N = SCALE_COUNT;

export function decodeRows(manifest: Manifest, bin: ArrayBuffer): DecodedRows {
  const rows = manifest.rows_total;
  const lo = manifest.quant_bounds.lo;
  const hi = manifest.quant_bounds.hi;
  const positionScale = new Float32Array(rows * N * 4);
  const normalState = new Float32Array(rows * N * 4);

  for (let row = 0; row < rows; row += 1) {
    const base = row * manifest.row_bytes;
    const pos = new Uint16Array(bin, base, N * 3);
    const oct = new Uint8Array(bin, base + N * 6, N * 2);
    const scaleQ = new Uint8Array(bin, base + N * 8, N);
    const stateQ = new Uint8Array(bin, base + N * 9, N);

    for (let i = 0; i < N; i += 1) {
      const px = lo[0] + (pos[i * 3] / 65535) * (hi[0] - lo[0]);
      const py = lo[1] + (pos[i * 3 + 1] / 65535) * (hi[1] - lo[1]);
      const pz = lo[2] + (pos[i * 3 + 2] / 65535) * (hi[2] - lo[2]);

      // Octahedral decode.
      let nx = (oct[i * 2] / 255) * 2 - 1;
      let ny = (oct[i * 2 + 1] / 255) * 2 - 1;
      const nz = 1 - Math.abs(nx) - Math.abs(ny);
      if (nz < 0) {
        const ox = nx;
        nx = (1 - Math.abs(ny)) * Math.sign(ox || 1);
        ny = (1 - Math.abs(ox)) * Math.sign(ny || 1);
      }
      const inv = 1 / Math.max(Math.hypot(nx, ny, nz), 1e-9);

      const t = (row * N + i) * 4;
      // z-up -> y-up conversion.
      positionScale[t] = px;
      positionScale[t + 1] = pz;
      positionScale[t + 2] = -py;
      positionScale[t + 3] = 0.5 + (scaleQ[i] / 255) * 0.7;
      normalState[t] = nx * inv;
      normalState[t + 1] = nz * inv;
      normalState[t + 2] = -ny * inv;
      normalState[t + 3] = stateQ[i];
    }
  }
  return { positionScale, normalState, rows };
}

export function decodeStatics(manifest: Manifest, bin: ArrayBuffer): DecodedStatics {
  const colors = new Uint8Array(3 * N * 4);
  let cursor = manifest.color_offset;
  for (let s = 0; s < 3; s += 1) {
    const rgb = new Uint8Array(bin, cursor, N * 3);
    const chroma = new Uint8Array(bin, cursor + N * 3, N);
    for (let i = 0; i < N; i += 1) {
      const t = (s * N + i) * 4;
      colors[t] = rgb[i * 3];
      colors[t + 1] = rgb[i * 3 + 1];
      colors[t + 2] = rgb[i * 3 + 2];
      colors[t + 3] = chroma[i];
    }
    cursor += N * 4;
  }
  const component = new Uint8Array(bin.slice(manifest.component_offset, manifest.component_offset + N));
  const rotation = new Float32Array(bin.slice(manifest.rotation_offset, manifest.rotation_offset + N * 4));
  return { colors, component, rotation };
}

/**
 * Timeline: global progress P in [0, 3) maps to segment k = floor(P) and
 * local t = frac(P). Segment keys include both end states.
 */
export interface TimelineSample {
  segment: number;
  localT: number;
  rowA: number;
  rowB: number;
  mix: number;
  colorRowA: number;
  colorRowB: number;
  colorMix: number;
  phase: string;
}

export function rowForKey(manifest: Manifest, segment: number, key: number): number {
  const keys = manifest.keys_per_segment;
  const seg = manifest.segments[segment];
  const [src, dst] = seg.name.split("-") as [StateName, StateName];
  if (key <= 0) return manifest.row_index[`state:${src}`];
  if (key >= keys - 1) return manifest.row_index[`state:${dst}`];
  return seg.row_start + (key - 1);
}

export function phaseForLocalT(manifest: Manifest, localT: number): string {
  let label = manifest.phases[0]?.name ?? "idle";
  for (const phase of manifest.phases) {
    if (localT >= phase.t) label = phase.name;
  }
  return label;
}

export function sampleTimeline(manifest: Manifest, progress: number): TimelineSample {
  const cycles = manifest.segments.length;
  let p = progress % cycles;
  if (p < 0) p += cycles;
  const segment = Math.min(Math.floor(p), cycles - 1);
  const localT = p - segment;
  const steps = manifest.keys_per_segment - 1;
  const idx = localT * steps;
  const j0 = Math.min(Math.floor(idx), steps - 1);
  const j1 = j0 + 1;
  const mix = idx - j0;

  const seg = manifest.segments[segment];
  const [src, dst] = seg.name.split("-") as [StateName, StateName];
  return {
    segment,
    localT,
    rowA: rowForKey(manifest, segment, j0),
    rowB: rowForKey(manifest, segment, j1),
    mix,
    colorRowA: STATE_ORDER.indexOf(src),
    colorRowB: STATE_ORDER.indexOf(dst),
    colorMix: smoothstep(0.25, 0.75, localT),
    phase: localT <= 0 ? "idle" : phaseForLocalT(manifest, localT),
  };
}

export interface CountSample {
  visible: number;
  transition: number;
  reserve: number;
  volume: number;
  volumeError: number;
  components: number;
}

export function sampleCounts(manifest: Manifest, progress: number): CountSample {
  const s = sampleTimeline(manifest, progress);
  const seg = manifest.segments[s.segment];
  const steps = manifest.keys_per_segment - 1;
  const idx = s.localT * steps;
  const j0 = Math.min(Math.floor(idx), steps - 1);
  const j1 = j0 + 1;
  const f = idx - j0;
  const a = seg.meta[j0];
  const b = seg.meta[j1];
  const lerp = (x: number, y: number) => x + (y - x) * f;
  return {
    visible: Math.round(lerp(a.visible, b.visible)),
    transition: Math.round(lerp(a.transition, b.transition)),
    reserve: Math.round(lerp(a.reserve, b.reserve)),
    volume: lerp(a.volume_corrected, b.volume_corrected),
    volumeError: Math.max(a.volume_error, b.volume_error),
    components: f < 0.5 ? a.components : b.components,
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const u = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return u * u * (3 - 2 * u);
}

export const DATA_BASE_PATH = "/photonic-skin/ps03m";

export async function loadMatterSkinData(): Promise<{
  manifest: Manifest;
  rows: DecodedRows;
  statics: DecodedStatics;
  fetchedBytes: number;
}> {
  const manifestResponse = await fetch(`${DATA_BASE_PATH}/ps03m-manifest.json`);
  if (!manifestResponse.ok) throw new Error("PS-03.M manifest missing");
  const manifestText = await manifestResponse.text();
  const manifest = JSON.parse(manifestText) as Manifest;
  const binResponse = await fetch(`${DATA_BASE_PATH}/ps03m-states.bin`);
  if (!binResponse.ok) throw new Error("PS-03.M binary data missing");
  const bin = await binResponse.arrayBuffer();
  if (bin.byteLength !== manifest.bin_size) {
    throw new Error(
      `PS-03.M binary size mismatch: ${bin.byteLength} != ${manifest.bin_size}`,
    );
  }
  return {
    manifest,
    rows: decodeRows(manifest, bin),
    statics: decodeStatics(manifest, bin),
    fetchedBytes: bin.byteLength + manifestText.length,
  };
}
