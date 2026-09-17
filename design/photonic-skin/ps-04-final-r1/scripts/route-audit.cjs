/* eslint-disable @typescript-eslint/no-require-imports -- Standalone QA runner uses the bundled CommonJS Playwright runtime. */
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');

const reduced = !process.argv.includes('--motion') && process.env.PS04_REDUCED !== '0';
const reportPath = path.join(__dirname, '..', 'reports', reduced ? 'route-audit.json' : 'route-audit-motion.json');

const ids = ['01', '02', '03.1', '03.2', '03.3', '04', '05.1', '05.2', '05.3', '05.4', '05.5', '05.6', '05.7', '06.1', '06.2', '06.3', '07', '08'];
const targets = ['master-neutral', 'brand-wide-gather-content-design-digital-event-games-merch-video', 'master-neutral', 'complex-gather-content-event', 'complex-drive-content-event', 'master-neutral', 'single-content', 'single-design', 'single-event', 'single-games', 'single-video', 'single-digital', 'single-merch', 'master-neutral', 'master-neutral', 'master-neutral', 'master-neutral', null];

async function diagnostic(page) {
  return page.evaluate(() => {
    const h = window.__PS04M61_LAB__;
    const session = h.snapshot();
    return {
      hash: location.hash,
      active: h.activeNode,
      contract: h.contract(),
      session: {
        status: session.status,
        sourceStateId: session.sourceStateId,
        targetStateId: session.targetStateId,
        geometryProgress: session.geometryProgress,
        revision: session.revision,
        requestRevision: session.requestRevision,
        reducedMotion: session.reducedMotion,
      },
      transaction: h.transaction(),
      settle: h.settle(),
      geometry: h.geometrySnapshot(),
      programBind: h.programBind(),
      resource: h.resource(),
      renderAck: h.renderAck(),
      navigation: h.navigation(),
      canvas: { ...(document.querySelector('[data-qa=m4-canvas]')?.dataset || {}) },
      error: document.querySelector('main')?.dataset.error,
    };
  });
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto('http://localhost:3000/#screen-03.1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__PS04M61_LAB__?.ready, { timeout: 15000 });
    await page.locator('[data-qa=task-explain_changes]').click();
    await page.evaluate(() => { location.hash = '#screen-03.2'; });
    await page.waitForFunction(() => window.__PS04M61_LAB__?.activeNode === '03.2');
    await page.locator('[data-qa=competence-content]').click();
    await page.locator('[data-qa=competence-event]').click();
    await page.locator('[data-qa=confirm-competencies]').click();
    const results = [];
    const diagnostics = {};
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], target = targets[i];
      await page.evaluate(id => { location.hash = '#screen-' + id; }, id);
      const start = Date.now();
      let passed = false;
      while (Date.now() - start < 10000) {
        const state = await page.evaluate(() => {
          const h = window.__PS04M61_LAB__;
          return { active: h.activeNode, gpu: h.geometrySnapshot()?.boundTargetGeometryId, semantic: h.contract()?.semanticTarget?.geometryId || h.contract()?.geometryId };
        });
        if (state.active === id && (target === null || state.gpu === target)) { passed = true; break; }
        await page.waitForTimeout(100);
      }
      const d = await diagnostic(page);
      results.push({ id, target, passed, ms: Date.now() - start, active: d.active, gpu: d.geometry?.boundTargetGeometryId, semantic: d.contract?.semanticTarget?.geometryId || d.contract?.geometryId });
      if (!passed || id === '04' || id === '06.1') {
        diagnostics[id] = d;
        console.log('DIAGNOSTIC ' + id + ' ' + JSON.stringify(d));
      }
    }
    console.log('RESULTS ' + JSON.stringify(results));
    console.log('ERRORS ' + JSON.stringify(errors));

    const edgePage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const edge = {};
    await edgePage.goto('http://localhost:3000/#screen-03.2', { waitUntil: 'domcontentloaded' });
    await edgePage.waitForFunction(() => window.__PS04M61_LAB__?.ready);
    await edgePage.waitForTimeout(500);
    edge.lockedBoot = await edgePage.evaluate(() => ({ hash: location.hash, active: window.__PS04M61_LAB__.activeNode }));
    const deepEventPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await deepEventPage.goto('http://localhost:3000/#screen-05.3', { waitUntil: 'domcontentloaded' });
    await deepEventPage.waitForFunction(() => window.__PS04M61_LAB__?.ready);
    edge.deepEvent = await deepEventPage.evaluate(() => {
      const h = window.__PS04M61_LAB__;
      return { hash: location.hash, active: h.activeNode, semantic: h.contract()?.resolvedGeometryId, gpu: h.geometrySnapshot()?.boundTargetGeometryId };
    });
    await deepEventPage.close();
    await edgePage.evaluate(() => { location.hash = '#screen-05.3'; });
    await edgePage.waitForFunction(() => window.__PS04M61_LAB__?.activeNode === '05.3');
    await edgePage.evaluate(() => { location.hash = '#screen-03.2'; });
    await edgePage.waitForTimeout(500);
    edge.lockedHash = await edgePage.evaluate(() => ({ hash: location.hash, active: window.__PS04M61_LAB__.activeNode }));
    await edgePage.goto('http://localhost:3000/#screen-05.1', { waitUntil: 'domcontentloaded' });
    await edgePage.waitForFunction(() => window.__PS04M61_LAB__?.ready);
    edge.reduced = await edgePage.evaluate(() => window.__PS04M61_LAB__.snapshot().reducedMotion);
    for (const [key, id] of [['ArrowDown', '05.2'], ['ArrowUp', '05.1'], ['End', '08'], ['Home', '01']]) {
      await edgePage.keyboard.press(key);
      await edgePage.waitForFunction(id => window.__PS04M61_LAB__?.activeNode === id, id);
      edge[key] = await edgePage.evaluate(() => ({ hash: location.hash, active: window.__PS04M61_LAB__.activeNode }));
    }
    await edgePage.keyboard.press('ArrowDown');
    await edgePage.waitForFunction(() => window.__PS04M61_LAB__?.activeNode === '02');
    await edgePage.keyboard.press('End');
    await edgePage.waitForFunction(() => window.__PS04M61_LAB__?.activeNode === '08');
    await edgePage.goBack();
    await edgePage.waitForFunction(() => window.__PS04M61_LAB__?.activeNode === '02');
    edge.back = await edgePage.evaluate(() => ({ hash: location.hash, active: window.__PS04M61_LAB__.activeNode }));
    await edgePage.goForward();
    await edgePage.waitForFunction(() => window.__PS04M61_LAB__?.activeNode === '08');
    edge.forward = await edgePage.evaluate(() => ({ hash: location.hash, active: window.__PS04M61_LAB__.activeNode }));
    fs.writeFileSync(reportPath, JSON.stringify({ results, diagnostics, errors, edge }, null, 2));
    console.log('EDGE ' + JSON.stringify(edge));
    if (results.some(result => !result.passed)
      || errors.length > 0
      || edge.lockedBoot.hash !== '#screen-03.1'
      || edge.deepEvent.hash !== '#screen-05.3'
      || edge.deepEvent.active !== '05.3'
      || edge.deepEvent.semantic !== 'single-event'
      || edge.deepEvent.gpu !== 'single-event'
      || edge.lockedHash.hash !== '#screen-05.3'
      || edge.reduced !== reduced
      || edge.ArrowDown.active !== '05.2'
      || edge.ArrowUp.active !== '05.1'
      || edge.End.active !== '08'
      || edge.Home.active !== '01'
      || edge.back.active !== '02'
      || edge.forward.active !== '08') process.exitCode = 1;
    await edgePage.close();
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
