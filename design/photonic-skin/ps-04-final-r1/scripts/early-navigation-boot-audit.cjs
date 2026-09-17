/* eslint-disable @typescript-eslint/no-require-imports -- Standalone production browser probe. */
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');

const reportPath = path.join(__dirname, '..', 'reports', 'early-navigation-boot-audit.json');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await page.goto('http://localhost:3000/#screen-05.3', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__PS04M61_LAB__ && !document.querySelector('canvas'));
    const before = await page.evaluate(() => ({ hash: location.hash, loading: window.__PS04M61_LAB__.loading, scrollY }));
    const moved = await page.evaluate(() => window.__PS04M61_LAB__.scrollToNode('05.4', 'auto', 'restore'));
    await page.waitForFunction(() => {
      const h = window.__PS04M61_LAB__;
      return h?.ready && !document.querySelector('[data-qa=ps04-neutral-poster]')
        && h.activeNode === '05.4' && h.contract()?.resolvedGeometryId === 'single-games'
        && h.geometrySnapshot()?.boundTargetGeometryId === 'single-games';
    }, null, { timeout: 30000 });
    const after = await page.evaluate(() => {
      const h = window.__PS04M61_LAB__;
      return { hash: location.hash, active: h.activeNode, semantic: h.contract()?.resolvedGeometryId,
        gpu: h.geometrySnapshot()?.boundTargetGeometryId, actorRequests: h.settle()?.actorRequestCount,
        ackTarget: h.renderAck()?.drawnTargetId, poster: Boolean(document.querySelector('[data-qa=ps04-neutral-poster]')) };
    });
    const failures = [
      ...(!moved ? ['early destination rejected'] : []),
      ...(after.hash !== '#screen-05.4' ? ['hash did not follow early destination'] : []),
      ...(after.ackTarget !== 'single-games' ? ['poster released before Games GPU ACK'] : []),
      ...errors,
    ];
    fs.writeFileSync(reportPath, JSON.stringify({ before, moved, after, errors, failures }, null, 2));
    console.log(JSON.stringify({ before, moved, after, errors, failures }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
