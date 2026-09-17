/** A closed, sampled shell. No particle alpha, independent tiles or camera-facing patches. */
export const FIELD_SIZE = 96;
export const FIELD_HALF = 2.8;
export const FIELD_STEP = FIELD_HALF * 2 / (FIELD_SIZE - 1);
export const SHELL_THICKNESS = FIELD_STEP * 0.85;
export const MORPH_BRIDGE = 0.36;

export interface SurfaceSamples {
  positions: Float32Array;
  normals: Float32Array;
  support: number;
}

interface Node { id: number; axis: number; left: Node | null; right: Node | null }

function tree(ids: number[], positions: Float32Array, depth = 0): Node | null {
  if (!ids.length) return null;
  const axis = depth % 3;
  ids.sort((a, b) => positions[a * 3 + axis] - positions[b * 3 + axis]);
  const mid = ids.length >> 1;
  return { id: ids[mid], axis, left: tree(ids.slice(0, mid), positions, depth + 1), right: tree(ids.slice(mid + 1), positions, depth + 1) };
}

/** Four nearest oriented samples; KD traversal keeps volume generation off the quadratic path. */
export function buildSurfaceField(samples: SurfaceSamples, size = FIELD_SIZE, half = FIELD_HALF) {
  const { positions: p, normals: n } = samples;
  if (!p.length || p.length !== n.length || p.length % 3 || !p.every(Number.isFinite) || !n.every(Number.isFinite)) {
    throw new Error("Invalid surface samples");
  }
  if (p.some(value => Math.abs(value) >= half - FIELD_STEP * 3)) throw new Error("Surface exceeds the volume bounds");
  const root = tree(Array.from({ length: p.length / 3 }, (_, i) => i), p);
  const data = new Float32Array(size ** 3);
  const step = half * 2 / (size - 1);
  const thickness = step * 0.85;
  const support = Math.max(samples.support, step * 2.5);
  const ids = new Int32Array(4), distances = new Float64Array(4);
  let qx = 0, qy = 0, qz = 0;
  const nearest = (node: Node | null): void => {
    if (!node) return;
    const id = node.id, i = id * 3;
    const dx = qx - p[i], dy = qy - p[i + 1], dz = qz - p[i + 2];
    const distance = dx * dx + dy * dy + dz * dz;
    if (distance < distances[3]) {
      let at = 3;
      while (at > 0 && distance < distances[at - 1]) {
        distances[at] = distances[at - 1]; ids[at] = ids[at - 1]; at--;
      }
      distances[at] = distance; ids[at] = id;
    }
    const delta = node.axis === 0 ? dx : node.axis === 1 ? dy : dz;
    nearest(delta < 0 ? node.left : node.right);
    if (delta * delta <= distances[3]) nearest(delta < 0 ? node.right : node.left);
  };
  for (let z = 0; z < size; z++) {
    qz = -half + z * step;
    for (let y = 0; y < size; y++) {
      qy = -half + y * step;
      for (let x = 0; x < size; x++) {
        const index = x + size * (y + size * z);
        // Strictly positive boundary for every endpoint AND every interpolation.
        if (!x || !y || !z || x === size - 1 || y === size - 1 || z === size - 1) { data[index] = step; continue; }
        qx = -half + x * step;
        distances.fill(Infinity); ids.fill(-1); nearest(root);
        const base = ids[0] * 3;
        let weight = 0, plane = 0;
        for (let k = 0; k < 4; k++) {
          if (ids[k] < 0) continue;
          const i = ids[k] * 3;
          // Never average opposing sides of a thin component into a zero normal.
          const alignment = n[i] * n[base] + n[i + 1] * n[base + 1] + n[i + 2] * n[base + 2];
          if (alignment < 0.5) continue;
          const w = 1 / (distances[k] + step * step * 0.15);
          plane += w * ((qx - p[i]) * n[i] + (qy - p[i + 1]) * n[i + 1] + (qz - p[i + 2]) * n[i + 2]);
          weight += w;
        }
        const signed = weight ? Math.abs(plane / weight) - thickness : Math.sqrt(distances[0]) - thickness;
        data[index] = Math.max(signed, Math.sqrt(distances[0]) - support);
      }
    }
  }
  // Fill enclosed interiors. Outside flood fill preserves intentional openings
  // (handles, arches, gaps between separate objects) instead of taking a hull.
  const outside = new Uint8Array(data.length);
  const queue = new Int32Array(data.length);
  let head = 0, tail = 1;
  outside[0] = 1;
  while (head < tail) {
    const i = queue[head++];
    const x = i % size, y = Math.floor(i / size) % size, z = Math.floor(i / (size * size));
    const visit = (j: number) => {
      if (!outside[j] && data[j] > 0) { outside[j] = 1; queue[tail++] = j; }
    };
    if (x > 0) visit(i - 1); if (x < size - 1) visit(i + 1);
    if (y > 0) visit(i - size); if (y < size - 1) visit(i + size);
    if (z > 0) visit(i - size * size); if (z < size - 1) visit(i + size * size);
  }
  for (let i = 0; i < data.length; i++) if (!outside[i] && data[i] > 0) data[i] = -data[i];
  return data;
}

export function mixFields(a: Float32Array, b: Float32Array, t: number) {
  if (a.length !== b.length) throw new Error("Volume sizes differ");
  const progress = Math.max(0, Math.min(1, t));
  const bridge = MORPH_BRIDGE * 4 * progress * (1 - progress);
  return Float32Array.from(a, (value, i) => value + (b[i] - value) * progress - bridge);
}
