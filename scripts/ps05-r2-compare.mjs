import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const root = 'design/photonic-skin/ps-05-r2/2026-09-25';
const output = `${root}/r1-r2-side-by-side.png`;
const rows = [
  { label: 'R1 · исходный wheel 04 → 05.1', folder: `${root}/baseline/04-to-05.1`, phase: 'baseline' },
  { label: 'R2 · итоговый wheel 04 → 05.1', folder: `${root}/accepted-slow/04-to-05.1`, phase: 'accepted-slow' },
];
const targets = [0, 200, 400, 600];
const tile = { width: 460, imageHeight: 236, captionHeight: 32 };
const composites = [];
for (let row = 0; row < rows.length; row++) {
  const item = rows[row];
  const manifest = JSON.parse(readFileSync(`${root}/${item.phase}/manifest.json`, 'utf8'));
  const frames = manifest.cases.find(entry => entry.from === '04' && entry.to === '05.1').frames;
  for (let col = 0; col < targets.length; col++) {
    const frame = frames.reduce((best, candidate) => Math.abs(candidate.ms - targets[col]) < Math.abs(best.ms - targets[col]) ? candidate : best);
    const x = col * tile.width, y = row * (tile.imageHeight + tile.captionHeight);
    const caption = `${item.label} · +${frame.ms} мс`;
    composites.push({ input: Buffer.from(`<svg width="460" height="32"><rect width="460" height="32" fill="#d9dde0"/><text x="9" y="21" fill="#17191b" font-family="Arial" font-size="14">${caption}</text></svg>`), left: x, top: y });
    composites.push({ input: await sharp(`${item.folder}/${frame.file}`).resize(tile.width, tile.imageHeight).png().toBuffer(), left: x, top: y + tile.captionHeight });
  }
}
await sharp({ create: { width: 1840, height: rows.length * (tile.imageHeight + tile.captionHeight), channels: 3, background: '#ddd' } }).composite(composites).png().toFile(output);
console.log(output);
