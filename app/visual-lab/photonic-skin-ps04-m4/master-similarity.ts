/**
 * Morphology guard: a non-MASTER transition must not pass through a
 * MASTER-like sphere even if no third geometry ID is requested.
 */

export interface BinaryMask {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export interface SilhouetteMetrics {
  area: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
  centroid: { x: number; y: number };
  aspectRatio: number;
  circularity: number;
  radialVariance: number;
  bboxFill: number;
  connectedComponents: number;
  occupancy: number;
}

export interface MasterSimilarityScore {
  iou: number;
  circularity: number;
  radialVariance: number;
  aspectRatio: number;
  occupiedArea: number;
  bboxFill: number;
  connectedComponents: number;
  spherical: boolean;
  masterLike: boolean;
}

export const MASTER_SIMILARITY_THRESHOLDS = Object.freeze({
  iou: 0.62,
  circularity: 0.5,
  aspectRatioLo: 0.82,
  aspectRatioHi: 1.22,
  bboxFill: 0.68,
  minArea: 80,
});

export function maskFromRgba(width: number, height: number, rgba: Uint8Array, test: (r: number, g: number, b: number, a: number) => boolean): BinaryMask {
  const pixels = new Uint8Array(width * height);
  for (let index = 0; index < pixels.length; index += 1) {
    const offset = index * 4;
    pixels[index] = test(rgba[offset]!, rgba[offset + 1]!, rgba[offset + 2]!, rgba[offset + 3]!) ? 1 : 0;
  }
  return { width, height, pixels };
}

export function silhouetteMetrics(mask: BinaryMask): SilhouetteMetrics {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;
  let area = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!mask.pixels[y * mask.width + x]) continue;
      area += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const bbox = area === 0
    ? { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
    : { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const centroid = area === 0 ? { x: 0, y: 0 } : { x: sumX / area, y: sumY / area };
  const aspectRatio = bbox.height <= 0 ? 0 : bbox.width / bbox.height;
  const perimeter = perimeterLength(mask);
  const circularity = area === 0 || perimeter <= 0 ? 0 : (4 * Math.PI * area) / (perimeter * perimeter);
  const radialVariance = radialMoment(mask, centroid, area);
  const bboxArea = Math.max(1, bbox.width * bbox.height);
  const bboxFill = area / bboxArea;
  return {
    area,
    bbox,
    centroid,
    aspectRatio,
    circularity: Number(circularity.toFixed(4)),
    radialVariance: Number(radialVariance.toFixed(4)),
    bboxFill: Number(bboxFill.toFixed(4)),
    connectedComponents: connectedComponents(mask),
    occupancy: mask.width * mask.height === 0 ? 0 : area / (mask.width * mask.height),
  };
}

function perimeterLength(mask: BinaryMask) {
  let length = 0;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!mask.pixels[y * mask.width + x]) continue;
      if (x === 0 || !mask.pixels[y * mask.width + (x - 1)]) length += 1;
      if (x === mask.width - 1 || !mask.pixels[y * mask.width + (x + 1)]) length += 1;
      if (y === 0 || !mask.pixels[(y - 1) * mask.width + x]) length += 1;
      if (y === mask.height - 1 || !mask.pixels[(y + 1) * mask.width + x]) length += 1;
    }
  }
  return length;
}

function radialMoment(mask: BinaryMask, centroid: { x: number; y: number }, area: number) {
  if (area <= 1) return 0;
  let sum = 0;
  let sumSq = 0;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!mask.pixels[y * mask.width + x]) continue;
      const radius = Math.hypot(x - centroid.x, y - centroid.y);
      sum += radius;
      sumSq += radius * radius;
    }
  }
  const mean = sum / area;
  const variance = Math.max(0, sumSq / area - mean * mean);
  return mean <= 1e-6 ? 0 : Math.sqrt(variance) / mean;
}

function connectedComponents(mask: BinaryMask) {
  const seen = new Uint8Array(mask.pixels.length);
  let count = 0;
  const stack: number[] = [];
  for (let start = 0; start < mask.pixels.length; start += 1) {
    if (!mask.pixels[start] || seen[start]) continue;
    count += 1;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop()!;
      const x = index % mask.width;
      const y = Math.floor(index / mask.width);
      const neighbors = [index - 1, index + 1, index - mask.width, index + mask.width];
      for (const next of neighbors) {
        if (next < 0 || next >= mask.pixels.length || seen[next] || !mask.pixels[next]) continue;
        const nx = next % mask.width;
        const ny = Math.floor(next / mask.width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
  }
  return count;
}

export function diskMask(size: number, radius = size * 0.38): BinaryMask {
  const pixels = new Uint8Array(size * size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      pixels[y * size + x] = Math.hypot(x - cx, y - cy) <= radius ? 1 : 0;
    }
  }
  return { width: size, height: size, pixels };
}

export function normalizeMask(mask: BinaryMask, size = 64): BinaryMask {
  const metrics = silhouetteMetrics(mask);
  const out = new Uint8Array(size * size);
  if (metrics.area === 0) return { width: size, height: size, pixels: out };
  const scale = Math.max(metrics.bbox.width, metrics.bbox.height, 1);
  const cx = metrics.centroid.x;
  const cy = metrics.centroid.y;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / (size - 1) - 0.5) * scale + cx;
      const v = (y / (size - 1) - 0.5) * scale + cy;
      const sx = Math.round(u);
      const sy = Math.round(v);
      if (sx < 0 || sy < 0 || sx >= mask.width || sy >= mask.height) continue;
      out[y * size + x] = mask.pixels[sy * mask.width + sx] ? 1 : 0;
    }
  }
  return { width: size, height: size, pixels: out };
}

export function maskIoU(left: BinaryMask, right: BinaryMask) {
  const width = Math.min(left.width, right.width);
  const height = Math.min(left.height, right.height);
  let intersection = 0;
  let union = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = left.pixels[y * left.width + x] ? 1 : 0;
      const b = right.pixels[y * right.width + x] ? 1 : 0;
      intersection += a & b;
      union += a | b;
    }
  }
  return union === 0 ? 0 : intersection / union;
}

export function scoreMasterSimilarity(frame: BinaryMask, master: BinaryMask = diskMask(64)): MasterSimilarityScore {
  const normalized = normalizeMask(frame);
  const reference = normalizeMask(master);
  const metrics = silhouetteMetrics(normalized);
  const iou = maskIoU(normalized, reference);
  const spherical = metrics.circularity >= MASTER_SIMILARITY_THRESHOLDS.circularity
    && metrics.bboxFill >= MASTER_SIMILARITY_THRESHOLDS.bboxFill
    && metrics.aspectRatio >= MASTER_SIMILARITY_THRESHOLDS.aspectRatioLo
    && metrics.aspectRatio <= MASTER_SIMILARITY_THRESHOLDS.aspectRatioHi;
  const masterLike = metrics.area >= MASTER_SIMILARITY_THRESHOLDS.minArea
    && iou >= MASTER_SIMILARITY_THRESHOLDS.iou
    && spherical;
  return {
    iou: Number(iou.toFixed(4)),
    circularity: metrics.circularity,
    radialVariance: metrics.radialVariance,
    aspectRatio: Number(metrics.aspectRatio.toFixed(4)),
    occupiedArea: metrics.area,
    bboxFill: metrics.bboxFill,
    connectedComponents: metrics.connectedComponents,
    spherical,
    masterLike,
  };
}

export function isForbiddenMasterMorph(args: {
  sourceGeometryId: string | null;
  targetGeometryId: string | null;
  geometryProgress: number;
  score: MasterSimilarityScore;
  sourceEndpointLike?: boolean;
  targetEndpointLike?: boolean;
}) {
  const nonMaster = args.sourceGeometryId !== "master-neutral" && args.targetGeometryId !== "master-neutral";
  const mid = args.geometryProgress > 0.08 && args.geometryProgress < 0.92;
  if (!nonMaster || !mid) return false;
  if (args.sourceEndpointLike || args.targetEndpointLike) return false;
  return args.score.masterLike;
}
