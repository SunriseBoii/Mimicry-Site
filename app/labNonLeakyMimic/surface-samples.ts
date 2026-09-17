import type { DecodedState } from "../visual-lab/photonic-skin-m4-1/m41-data";
import { resolvePresentationFrame, visibleComponents } from "../visual-lab/photonic-skin-m4-1r/photonic-presentation";
import type { SurfaceSamples } from "./surface-field";

export function samplesFor(state: DecodedState): SurfaceSamples {
  const frame = resolvePresentationFrame(state.entry);
  const visible = visibleComponents(state.entry, "desktop");
  const positions: number[] = [], normals: number[] = [];
  for (let id = 0; id < state.recordCount; id++) {
    if (state.status[id] !== 0 || !visible.has(state.component[id])) continue;
    for (let axis = 0; axis < 3; axis++) {
      positions.push((state.position[id * 3 + axis] + frame.translate[axis]) * frame.scale);
      normals.push(state.normal[id * 3 + axis]);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), support: Math.sqrt(state.entry.surfaceArea / Math.max(positions.length / 3, 1)) * frame.scale * 2.8 };
}
