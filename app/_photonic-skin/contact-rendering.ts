import * as THREE from "three";
import type { DecodedState } from "../visual-lab/photonic-skin-m4-1/m41-data";
import { packStateInto, stateTexture } from "../visual-lab/photonic-skin-ps04-m5/texture-pack";
import { CONTACT_CORNERS } from "./contact-surface";

export function contactStateTexture(state: DecodedState) {
  if (!state.contactSurface) return stateTexture(state, "position");
  const stride = state.contactSurface.cornerStride;
  const width = 512, height = Math.ceil((stride + 1) / 4) * 128;
  const data = new Float32Array(width * height * 4);
  const base = packStateInto(new Float32Array(128 * 128 * 4), state, "position");
  for (let id = 0; id < state.recordCount; id++) {
    const x = id % 128, y = Math.floor(id / 128);
    data.set(base.subarray(id * 4, id * 4 + 4), (x + y * width) * 4);
    for (let corner = 0; corner < stride; corner++) {
      const page = corner + 1;
      const index = (x + (page % 4) * 128 + (y + Math.floor(page / 4) * 128) * width) * 4;
      const source = (id * stride + corner) * 3;
      data[index] = state.contactSurface.corners[source];
      data[index + 1] = state.contactSurface.corners[source + 1];
      data[index + 2] = state.contactSurface.corners[source + 2];
      data[index + 3] = state.contactSurface.cornerCounts[id] >= 3 ? 1 : 0;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return texture;
}

/** Indexed real tile roofs. Each settled boundary is shared with a neighbour. */
export function createContactGeometry() {
  const positions = [0, 0, .28 * .035], slots = [-1], insets = [0], indices: number[] = [];
  const ring = [[1.18, 0], [0, .86], [-1.18, 0], [0, -.86]];
  for (let i = 0; i < CONTACT_CORNERS; i++) {
    const at = i * 4 / CONTACT_CORNERS, side = Math.floor(at), t = at - side;
    const a = ring[side], b = ring[(side + 1) % 4];
    positions.push((a[0] + (b[0] - a[0]) * t) * .035, (a[1] + (b[1] - a[1]) * t) * .035, .025 * .035);
    positions.push((a[0] + (b[0] - a[0]) * t) * .035 * .84, (a[1] + (b[1] - a[1]) * t) * .035 * .84, (.28 * .16 + .025 * .84) * .035);
    slots.push(i, i); insets.push(0, 1);
    const outer = 1 + i * 2, inner = outer + 1, nextOuter = 1 + ((i + 1) % CONTACT_CORNERS) * 2, nextInner = nextOuter + 1;
    indices.push(0, inner, nextInner, inner, outer, nextOuter, inner, nextOuter, nextInner);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aContactCorner", new THREE.Float32BufferAttribute(slots, 1));
  geometry.setAttribute("aContactInset", new THREE.Float32BufferAttribute(insets, 1));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  geometry.setAttribute("aSurfaceNormal", geometry.getAttribute("normal"));
  return geometry;
}
