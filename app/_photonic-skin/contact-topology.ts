import type { DecodedState } from "../visual-lab/photonic-skin-m4-1/m41-data";
import { contactSurfaceFromTriangles, type ContactSurface } from "./contact-surface";

// Bump the directory and magic when the contour/topology algorithm changes.
export const CONTACT_TOPOLOGY_BASE = "/photonic-skin/contact-v1";
const MAGIC = 0x3153434d; // MCS1, little endian
const HEADER_BYTES = 44;

export function contactTopologyUrl(contentHash: string) {
  if (!/^[a-f0-9]{64}$/i.test(contentHash)) throw new Error("Invalid contact source hash");
  return `${CONTACT_TOPOLOGY_BASE}/${contentHash.toLowerCase()}.bin.gz`;
}

/** Store connectivity only, never quantize accepted contour coordinates. */
export function encodeContactTopology(state: DecodedState, surface: ContactSurface): ArrayBuffer {
  const payload = new ArrayBuffer(HEADER_BYTES + surface.triangles.length * 2);
  const view = new DataView(payload);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, surface.triangles.length, true);
  view.setUint32(8, surface.stats.repairedFaces, true);
  for (let i = 0; i < 32; i++) view.setUint8(12 + i, parseInt(state.entry.contentHash.slice(i * 2, i * 2 + 2), 16));
  surface.triangles.forEach((id, index) => {
    if (id >= state.recordCount || id > 65535) throw new Error("Contact identity exceeds storage range");
    view.setUint16(HEADER_BYTES + index * 2, id, true);
  });
  return payload;
}

export function decodeContactTopology(state: DecodedState, payload: ArrayBuffer): ContactSurface {
  if (payload.byteLength < HEADER_BYTES) throw new Error("Truncated contact topology");
  const view = new DataView(payload);
  const count = view.getUint32(4, true);
  if (view.getUint32(0, true) !== MAGIC || count === 0 || count % 3 || count > state.recordCount * 24 || payload.byteLength !== HEADER_BYTES + count * 2) {
    throw new Error("Invalid contact topology layout");
  }
  const hash = Array.from(new Uint8Array(payload, 12, 32), value => value.toString(16).padStart(2, "0")).join("");
  if (hash !== state.entry.contentHash.toLowerCase()) throw new Error("Contact topology source mismatch");
  const triangles = new Uint32Array(count);
  for (let i = 0; i < count; i++) triangles[i] = view.getUint16(HEADER_BYTES + i * 2, true);
  const surface = contactSurfaceFromTriangles(state, triangles, view.getUint32(8, true));
  const expectedActive = state.status.reduce((sum, status) => sum + Number(status === 0), 0);
  if (surface.stats.boundaryEdges || surface.stats.nonManifoldEdges || surface.stats.active !== expectedActive) {
    throw new Error("Incomplete contact topology");
  }
  return surface;
}
