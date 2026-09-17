import { buildSurfaceField, type SurfaceSamples } from "./surface-field";

self.onmessage = (event: MessageEvent<{ id: number; samples: SurfaceSamples }>) => {
  const { id, samples } = event.data;
  try {
    const data = buildSurfaceField(samples);
    self.postMessage({ id, data }, { transfer: [data.buffer] });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
