import type { DecodedState } from "../visual-lab/photonic-skin-m4-1/m41-data";

export const CONTACT_CORNERS = 64;
export const masterPaletteWeight = (state: DecodedState) => state.refinedMasterWeight ?? (state.entry.stateRole === "master" ? 1 : 0);
export function captureMasterPaletteWeight(source: DecodedState, target: DecodedState, progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  const eased = t * t * (3 - 2 * t);
  return masterPaletteWeight(source) * (1 - eased) + masterPaletteWeight(target) * eased;
}
type V3 = [number, number, number];
type Face = [number, number, number];
interface KdNode { id: number; axis: number; left: KdNode | null; right: KdNode | null }
export interface ContactSurface {
  triangles: Uint32Array;
  /** Local offsets before the existing quaternion/scale/motion evaluator. */
  corners: Float32Array;
  cornerStride: number;
  cornerCounts: Uint8Array;
  stats: { faces: number; boundaryEdges: number; nonManifoldEdges: number; active: number; maxCorners: number; repairedFaces: number };
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => { const length = Math.hypot(...a) || 1; return a.map(v => v / length) as V3; };
const point = (array: Float32Array, id: number): V3 => [array[id * 3], array[id * 3 + 1], array[id * 3 + 2]];
const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;

function kdTree(ids: number[], positions: Float32Array, depth = 0): KdNode | null {
  if (!ids.length) return null;
  const axis = depth % 3, mid = ids.length >> 1;
  ids.sort((a, b) => positions[a * 3 + axis] - positions[b * 3 + axis]);
  return { id: ids[mid], axis, left: kdTree(ids.slice(0, mid), positions, depth + 1), right: kdTree(ids.slice(mid + 1), positions, depth + 1) };
}

/** Reconstruct a local surface triangulation, then use its dual as shared tile edges. */
export function buildContactSurface(state: DecodedState): ContactSurface {
  const groups = new Map<number, number[]>();
  for (let id = 0; id < state.recordCount; id++) {
    if (state.status[id] !== 0) continue;
    const key = state.component[id] * 256 + state.shell[id];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(id);
  }
  const p = state.position, normal = state.normal;
  const candidates = new Map<string, { face: Face; count: number; quality: number }>();
  const basis = (id: number) => {
    const n = unit(point(normal, id));
    const u = unit(cross(Math.abs(n[2]) < .9 ? [0, 0, 1] : [0, 1, 0], n));
    return { n, u, v: cross(n, u) };
  };
  for (const ids of groups.values()) {
    const root = kdTree([...ids], p);
    for (const id of ids) {
      const center = point(p, id), { n, u, v } = basis(id);
      const near: Array<{ id: number; d: number }> = [];
      const search = (node: KdNode | null) => {
        if (!node) return;
        const delta = sub(center, point(p, node.id)), d = dot(delta, delta);
        if (node.id !== id && dot(n, point(normal, node.id)) > .15) {
          let at = near.length;
          while (at > 0 && near[at - 1].d > d) at--;
          near.splice(at, 0, { id: node.id, d });
          if (near.length > 24) near.pop();
        }
        const split = delta[node.axis];
        search(split < 0 ? node.left : node.right);
        if (near.length < 24 || split * split < near[near.length - 1].d) search(split < 0 ? node.right : node.left);
      };
      search(root);
      if (near.length < 3) continue;
      const radius = Math.sqrt(near[Math.min(11, near.length - 1)].d) * 2;
      const planes = near.map(item => {
        const d = sub(point(p, item.id), center);
        return { id: item.id, x: dot(d, u), y: dot(d, v), distance: dot(d, d) / 2 };
      }).filter(plane => plane.x * plane.x + plane.y * plane.y > 1e-12);
      let polygon = [[-radius, -radius], [radius, -radius], [radius, radius], [-radius, radius]];
      for (const plane of planes) {
        const clipped: number[][] = [];
        for (let j = 0; j < polygon.length; j++) {
          const a = polygon[j], b = polygon[(j + 1) % polygon.length];
          const da = a[0] * plane.x + a[1] * plane.y - plane.distance;
          const db = b[0] * plane.x + b[1] * plane.y - plane.distance;
          if (da <= 0) clipped.push(a);
          if ((da < 0) !== (db < 0)) {
            const t = da / (da - db);
            clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
          }
        }
        polygon = clipped;
      }
      for (const vertex of polygon) {
        const incident = planes.map(plane => ({ id: plane.id, error: Math.abs(vertex[0] * plane.x + vertex[1] * plane.y - plane.distance) })).sort((a, b) => a.error - b.error);
        if (incident[1].error > radius * radius * 1e-5) continue;
        const sorted = [id, incident[0].id, incident[1].id].sort((a, b) => a - b) as Face;
        const key = sorted.join(":");
        const known = candidates.get(key);
        if (known) { known.count++; continue; }
        const [a, b, c] = sorted.map(index => point(p, index));
        const faceN = cross(sub(b, a), sub(c, a));
        const meanN = sorted.map(index => point(normal, index)).reduce((sum, x) => sum.map((value, axis) => value + x[axis]) as V3, [0, 0, 0] as V3);
        if (Math.hypot(...faceN) < 1e-12 || dot(unit(faceN), unit(meanN)) ** 2 < .15) continue;
        const face: Face = dot(faceN, meanN) > 0 ? sorted : [sorted[0], sorted[2], sorted[1]];
        candidates.set(key, { face, count: 1, quality: dot(sub(a, b), sub(a, b)) + dot(sub(b, c), sub(b, c)) + dot(sub(c, a), sub(c, a)) });
      }
    }
  }
  let faces: Face[] = [];
  const edges = new Map<string, { count: number; from: number; to: number }>();
  const faceKeys = new Set<string>();
  const addFace = (face: Face) => {
    const faceKey = [...face].sort((a,b) => a-b).join(":");
    if (faceKeys.has(faceKey)) return false;
    for (let j = 0; j < 3; j++) {
      const a = face[j], b = face[(j + 1) % 3], edge = edges.get(edgeKey(a, b));
      if (edge && (edge.count >= 2 || edge.from === a)) return false;
    }
    faces.push(face);
    faceKeys.add(faceKey);
    for (let j = 0; j < 3; j++) {
      const a = face[j], b = face[(j + 1) % 3], key = edgeKey(a, b), edge = edges.get(key);
      if (edge) edge.count++; else edges.set(key, { count: 1, from: a, to: b });
    }
    return true;
  };
  for (const candidate of [...candidates.values()].filter(value => value.count >= 2).sort((a, b) => b.count - a.count || a.quality - b.quality)) addFace(candidate.face);
  let repairedFaces = 0;
  // Small missing Delaunay fans at changes of curvature are closed explicitly.
  const repairHoles = (final = false) => {
  for (let pass = 0; pass < 5; pass++) {
    const starts = new Map<number, number[]>();
    for (const edge of edges.values()) if (edge.count === 1) {
      if (!starts.has(edge.to)) starts.set(edge.to, []);
      starts.get(edge.to)!.push(edge.from);
    }
    const visited = new Set<string>();
    for (const [start, nexts] of starts) for (const next of nexts) {
      if (visited.has(edgeKey(start, next))) continue;
      const ring = [start]; let current = next;
      while (current !== start && ring.length < 128) {
        ring.push(current);
        const choices = starts.get(current)?.filter(value => !visited.has(edgeKey(current, value)) && (value === start || !ring.includes(value)));
        if (!choices?.length) break;
        const next = choices[0]; visited.add(edgeKey(current, next)); current = next;
      }
      if (current !== start || ring.length < 3 || ring.length >= 128) continue;
      // Remove short ears instead of attaching the whole hole to one scale.
      // This bounds valence and avoids the long spikes of a root triangle fan.
      while (ring.length > 3) {
        const ears = ring.map((id, j) => {
          const a = ring[(j + ring.length - 1) % ring.length], c = ring[(j + 1) % ring.length];
          const diagonal = edges.get(edgeKey(a, c));
          const ab = sub(point(p, id), point(p, a)), ac = sub(point(p, c), point(p, a));
          const normalFit = dot(unit(cross(ab, ac)), unit([0, 1, 2].map(axis => normal[a * 3 + axis] + normal[id * 3 + axis] + normal[c * 3 + axis]) as V3));
          return { j, face: [a, id, c] as Face, quality: dot(ac, ac) / Math.max(.01, normalFit + .1), valid: (!diagonal || diagonal.count < 2) && (final || normalFit > -.8) };
        }).filter(ear => ear.valid).sort((a, b) => a.quality - b.quality);
        const ear = ears.find(ear => addFace(ear.face));
        if (!ear) break;
        repairedFaces++; ring.splice(ear.j, 1);
      }
      if (ring.length === 3 && addFace(ring as Face)) repairedFaces++;
    }
  }
  };
  repairHoles();
  // A conflicting diagonal can strand a four-edge hole, and two local fans
  // can touch at a single vertex. Remove only those conflicts, then retriangulate
  // the enlarged boundary instead of covering the crack with another surface.
  for (let pass = 0; pass < 16; pass++) {
    const boundary = [...edges.values()].filter(edge => edge.count === 1);
    if (!boundary.length) break;
    const counts = new Map<number, number>();
    for (const edge of boundary) for (const id of [edge.from, edge.to]) counts.set(id, (counts.get(id) ?? 0) + 1);
    const conflicts = (face: Face) => face.some(id => (counts.get(id) ?? 0) > 2)
      || face.some((a, j) => counts.has(a) && counts.has(face[(j + 1) % 3]) && edges.get(edgeKey(a, face[(j + 1) % 3]))!.count === 2);
    let kept = faces.filter(face => !conflicts(face));
    if (kept.length === faces.length) kept = faces.filter(face => !face.some((a, j) => edges.get(edgeKey(a, face[(j + 1) % 3]))!.count === 1));
    faces = []; edges.clear(); faceKeys.clear();
    for (const face of kept) addFace(face);
    repairHoles();
  }
  repairHoles(true);
  // A three-sample island has no enclosed surface. Closing it with its reversed
  // duplicate would create a zero-volume sheet. Reinsert those samples in the
  // surrounding patch instead.
  const supported = faces.filter(face => !face.every((a, j) => edges.get(edgeKey(a, face[(j + 1) % 3]))!.count === 1));
  faces = []; edges.clear(); faceKeys.clear();
  for (const face of supported) addFace(face);
  // Reinsert isolated samples in the repaired patch. This preserves every
  // original active ID and its motion track, including samples on thin rims.
  const used = new Set(faces.flat());
  for (const ids of groups.values()) for (const id of ids) {
    if (used.has(id)) continue;
    const x = point(p, id), n = point(normal, id);
    let best = -1, score = Infinity;
    for (let i = 0; i < faces.length; i++) {
      const face = faces[i];
      if (state.component[face[0]] !== state.component[id] || state.shell[face[0]] !== state.shell[id]) continue;
      const [a, b, c] = face.map(index => point(p, index));
      const ab = sub(b, a), ac = sub(c, a), ax = sub(x, a), fn = unit(cross(ab, ac));
      if (dot(fn, n) < 0) continue;
      const d00 = dot(ab, ab), d01 = dot(ab, ac), d11 = dot(ac, ac), d20 = dot(ax, ab), d21 = dot(ax, ac);
      const denominator = d00 * d11 - d01 * d01;
      if (denominator < 1e-14) continue;
      const v = (d11 * d20 - d01 * d21) / denominator, w = (d00 * d21 - d01 * d20) / denominator;
      const distance = Math.abs(dot(ax, fn)) + Math.max(0, -v, -w, v + w - 1) * Math.sqrt(d00 + d11);
      if (distance < score) { score = distance; best = i; }
    }
    if (best >= 0) {
      const [a, b, c] = faces[best];
      faces[best] = [a, b, id]; faces.push([b, c, id], [c, a, id]);
      used.add(id);
    }
  }
  // Rebuild adjacency after insertions for topology checks and dual edge walks.
  const completed = faces; faces = []; edges.clear(); faceKeys.clear();
  for (const face of completed) addFace(face);
  // Improve repaired patches with local edge flips. Besides avoiding needle
  // triangles, this prevents one scale from collecting an entire hole's rim.
  for (let pass = 0; pass < 12; pass++) {
    const adjacent = new Map<string, number[]>(), degree = new Uint16Array(state.recordCount);
    faces.forEach((face, index) => {
      for (let j = 0; j < 3; j++) {
        degree[face[j]]++;
        const key = edgeKey(face[j], face[(j + 1) % 3]);
        if (!adjacent.has(key)) adjacent.set(key, []);
        adjacent.get(key)!.push(index);
      }
    });
    const changed = new Set<number>();
    for (const indices of adjacent.values()) {
      if (indices.length !== 2 || indices.some(index => changed.has(index))) continue;
      const [i, j] = indices, first = faces[i], second = faces[j];
      const shared = first.filter(id => second.includes(id));
      if (shared.length !== 2) continue;
      const c = first.find(id => !shared.includes(id))!, d = second.find(id => !shared.includes(id))!;
      if (adjacent.has(edgeKey(c, d))) continue;
      const at = first.indexOf(c), a = first[(at + 1) % 3], b = first[(at + 2) % 3];
      const newA: Face = [c, a, d], newB: Face = [c, d, b];
      const oldLength = sub(point(p, a), point(p, b)), newLength = sub(point(p, c), point(p, d));
      const improveValence = Math.max(degree[a], degree[b]) > 12 && Math.max(degree[c], degree[d]) + 1 < Math.max(degree[a], degree[b]);
      if (!improveValence && dot(newLength, newLength) >= dot(oldLength, oldLength) * .95) continue;
      const fits = (face: Face) => {
        const [x,y,z] = face.map(id => point(p, id));
        const mean = face.map(id => point(normal, id)).reduce((sum, n) => sum.map((v, axis) => v + n[axis]) as V3, [0,0,0] as V3);
        return dot(unit(cross(sub(y,x),sub(z,x))), unit(mean));
      };
      if (fits(newA) < .1 || fits(newB) < .1) continue;
      faces[i] = newA; faces[j] = newB; changed.add(i); changed.add(j);
      adjacent.delete(edgeKey(a,b)); adjacent.set(edgeKey(c,d), [i,j]);
      degree[a]--; degree[b]--; degree[c]++; degree[d]++;
    }
    if (!changed.size) break;
  }
  const improved = faces; faces = []; edges.clear(); faceKeys.clear();
  for (const face of improved) addFace(face);
  return contactSurfaceFromTriangles(state, new Uint32Array(faces.flat()), repairedFaces);
}

/** The inexpensive half of fitting: use the exact, precomputed neighbour graph. */
export function contactSurfaceFromTriangles(state: DecodedState, triangles: Uint32Array, repairedFaces = 0): ContactSurface {
  const p = state.position;
  const faces: Face[] = [];
  const edges = new Map<string, { count: number }>();
  if (triangles.length % 3) throw new Error("Invalid contact triangle count");
  for (let i = 0; i < triangles.length; i += 3) {
    const face: Face = [triangles[i], triangles[i + 1], triangles[i + 2]];
    if (face.some(id => id >= state.recordCount || state.status[id] !== 0) || new Set(face).size !== 3) {
      throw new Error("Invalid contact triangle identity");
    }
    faces.push(face);
    for (let j = 0; j < 3; j++) {
      const key = edgeKey(face[j], face[(j + 1) % 3]);
      const edge = edges.get(key);
      if (edge) edge.count++; else edges.set(key, { count: 1 });
    }
  }
  const centers = faces.map(face => {
    const points = face.map(id => point(p, id));
    return [0, 1, 2].map(axis => (points[0][axis] + points[1][axis] + points[2][axis]) / 3) as V3;
  });
  const incident = Array.from({ length: state.recordCount }, () => [] as number[]);
  faces.forEach((face, i) => face.forEach(id => incident[id].push(i)));
  const corners = new Float32Array(state.recordCount * CONTACT_CORNERS * 3);
  const cornerCounts = new Uint8Array(state.recordCount);
  let maxCorners = 0, active = 0;
  for (let id = 0; id < state.recordCount; id++) {
    if (state.status[id] !== 0 || incident[id].length < 3) continue;
    const center = point(p, id);
    // Follow oriented connectivity, rather than tangent angles: angular sorting
    // can cross edges around a concave corner. Midpoints partition each primal
    // triangle exactly, so neighbouring scale roofs share the very same seam.
    const next = new Map<number, { end: number; face: number }>();
    for (const index of incident[id]) {
      const face = faces[index], at = face.indexOf(id);
      next.set(face[(at + 1) % 3], { end: face[(at + 2) % 3], face: index });
    }
    const loops: Array<Array<{ p: V3 }>> = [];
    while (next.size) {
      const loop: Array<{ p: V3 }> = [];
      let neighbour = next.keys().next().value as number;
      while (next.has(neighbour)) {
        const item = next.get(neighbour)!;
        next.delete(neighbour);
        const other = point(p, neighbour);
        loop.push({ p: center.map((v, axis) => (v + other[axis]) / 2) as V3 }, { p: centers[item.face] });
        neighbour = item.end;
      }
      loops.push(loop);
    }
    const quat = state.orientation.subarray(id * 4, id * 4 + 4);
    const roofHeight = .28 * .035 * .4 * state.scale[id];
    const peak: V3 = [center[0] + 2 * (quat[0] * quat[2] + quat[3] * quat[1]) * roofHeight,
      center[1] + 2 * (quat[1] * quat[2] - quat[3] * quat[0]) * roofHeight,
      center[2] + (1 - 2 * (quat[0] ** 2 + quat[1] ** 2)) * roofHeight];
    // Touching surface fans get separate closed loops joined by degenerate
    // triangles at the roof peak; never draw a chord across unrelated fans.
    const ring = loops.length === 1 ? loops[0] : loops.flatMap(loop => [...loop, loop[0], { p: peak }]);
    if (ring.length > CONTACT_CORNERS) throw new Error(`${state.entry.stateId}: contact tile ${id} exceeds ${CONTACT_CORNERS} corners (${ring.length})`);
    maxCorners = Math.max(maxCorners, ring.length); active++;
    cornerCounts[id] = ring.length;
    const q = state.orientation.subarray(id * 4, id * 4 + 4);
    const qv: V3 = [-q[0], -q[1], -q[2]];
    for (let j = 0; j < ring.length; j++) {
      const delta = sub(ring[j].p, center);
      const c = cross(qv, delta), cc = cross(qv, c);
      const offset = (id * CONTACT_CORNERS + j) * 3;
      for (let axis = 0; axis < 3; axis++) corners[offset + axis] = (delta[axis] + 2 * (q[3] * c[axis] + cc[axis])) / Math.max(state.scale[id], 1e-6);
    }
    // Padded vertices repeat the first corner. Reusing its exact Float32 value
    // avoids dozens of identical quaternion transforms for every scale.
    const first = id * CONTACT_CORNERS * 3;
    for (let j = ring.length; j < CONTACT_CORNERS; j++) {
      corners[first + j * 3] = corners[first];
      corners[first + j * 3 + 1] = corners[first + 1];
      corners[first + j * 3 + 2] = corners[first + 2];
    }
  }
  const packed = new Float32Array(state.recordCount * maxCorners * 3);
  for (let id = 0; id < state.recordCount; id++) packed.set(corners.subarray(id * CONTACT_CORNERS * 3, id * CONTACT_CORNERS * 3 + maxCorners * 3), id * maxCorners * 3);
  return { triangles, corners: packed, cornerStride: maxCorners, cornerCounts, stats: { faces: faces.length, active, maxCorners, repairedFaces, boundaryEdges: [...edges.values()].filter(edge => edge.count === 1).length, nonManifoldEdges: [...edges.values()].filter(edge => edge.count > 2).length } };
}
