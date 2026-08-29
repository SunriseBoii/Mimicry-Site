import { readFileSync } from "node:fs";
import { decodeState, type M3Manifest } from "../../../../app/visual-lab/photonic-skin-m4-1/m41-data";
import { actorFieldScalar, FIELD_SCALE } from "../../../../app/visual-lab/photonic-skin-ps04-m2/photonic-field";

const manifest = JSON.parse(readFileSync("public/photonic-skin/ps-03-m3-1r/manifest.json", "utf8")) as M3Manifest;
const ids = [
  "master-neutral",
  "single-content",
  "complex-gather-content-design",
  "complex-drive-content-design-digital-event",
  "brand-wide-gather-content-design-digital-event-games-merch-video",
];

function exact(bytes: Buffer) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

for (const id of ids) {
  const entry = manifest.states.find((state) => state.stateId === id);
  if (!entry) throw new Error(id);
  const state = decodeState(entry, exact(readFileSync(`public/photonic-skin/ps-03-m3-1r/${entry.bufferPath}`)));
  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  const bounds = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
  for (let idIndex = 0; idIndex < state.recordCount; idIndex += 1) {
    if (state.status[idIndex] !== 0 || state.scale[idIndex] <= 0) continue;
    const position = [state.position[idIndex * 3], state.position[idIndex * 3 + 1], state.position[idIndex * 3 + 2]] as [number, number, number];
    const scalar = actorFieldScalar(position);
    min = Math.min(min, scalar);
    max = Math.max(max, scalar);
    count += 1;
    bounds.x[0] = Math.min(bounds.x[0], position[0]);
    bounds.x[1] = Math.max(bounds.x[1], position[0]);
    bounds.y[0] = Math.min(bounds.y[0], position[1]);
    bounds.y[1] = Math.max(bounds.y[1], position[1]);
    bounds.z[0] = Math.min(bounds.z[0], position[2]);
    bounds.z[1] = Math.max(bounds.z[1], position[2]);
  }
  process.stdout.write(`${id} n=${count} scalar=${min.toFixed(3)}..${max.toFixed(3)} span=${(max - min).toFixed(3)} xyz=${(bounds.x[1] - bounds.x[0]).toFixed(2)},${(bounds.y[1] - bounds.y[0]).toFixed(2)},${(bounds.z[1] - bounds.z[0]).toFixed(2)}\n`);
}
process.stdout.write(`FIELD_SCALE=${FIELD_SCALE}\n`);
