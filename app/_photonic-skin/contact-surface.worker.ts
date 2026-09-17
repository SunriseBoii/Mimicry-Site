import { buildContactSurface } from "./contact-surface";
import type { DecodedState } from "../visual-lab/photonic-skin-m4-1/m41-data";
import { contactTopologyUrl, decodeContactTopology } from "./contact-topology";

self.onmessage = async (event: MessageEvent<DecodedState>) => {
  try {
    const state = event.data;
    let surface;
    try {
      const response = await fetch(contactTopologyUrl(state.entry.contentHash), { cache: "force-cache" });
      if (!response.ok || !response.body) throw new Error("Contact topology unavailable");
      const payload = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
      surface = decodeContactTopology(state, payload);
    } catch {
      // Other lab variants and changed assets retain the exact original fitting
      // path. A missing/corrupt precompute must never leave the actor waiting.
      surface = buildContactSurface(state);
    }
    self.postMessage({ surface }, { transfer: [surface.corners.buffer, surface.cornerCounts.buffer, surface.triangles.buffer] });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
