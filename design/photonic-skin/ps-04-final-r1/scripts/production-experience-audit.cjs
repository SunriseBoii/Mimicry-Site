/* eslint-disable @typescript-eslint/no-require-imports -- Standalone production browser probe. */
const { chromium } = require('playwright-core');
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.PS04_BASE || 'http://localhost:3000';
const reportPath = path.join(__dirname, '..', 'reports', 'production-experience-audit.json');
const onlyDeep = process.argv.includes('--deep-only');

async function state(page) {
  return page.evaluate(() => {
    const h = window.__PS04M61_LAB__;
    const canvas = document.querySelector('[data-qa=m4-canvas]');
    const tx = h?.transaction?.();
    const geo = h?.geometrySnapshot?.();
    const st = h?.settle?.();
    const nav = h?.navigation?.();
    const magnetism = h?.magnetism?.();
    const silhouette = h?.framebufferSilhouette?.();
    return {
      t: Math.round(performance.now()),
      hash: location.hash,
      scrollY: Math.round(scrollY),
      ready: h?.ready ?? false,
      active: h?.activeNode ?? null,
      committed: h?.committedNode?.() ?? null,
      semantic: h?.contract?.()?.resolvedGeometryId ?? null,
      txTarget: tx?.targetGeometryId ?? null,
      txStatus: tx?.status ?? null,
      txProgress: tx?.geometryProgress ?? null,
      gpu: geo?.boundTargetGeometryId ?? null,
      gpuStatus: geo?.status ?? null,
      bind: h?.programBind?.()?.bindCommitted ?? null,
      settle: st?.magnetizedSettledNodeId ?? null,
      settlePhase: st?.scrollPhase ?? null,
      settleObserved: st?.observedNodeId ?? null,
      settleCandidate: st?.snapCandidateNodeId ?? null,
      settleDestination: st?.magneticDestinationNodeId ?? null,
      settleDistance: st?.distanceToAnchorPx ?? null,
      gestureActive: st?.gestureActive ?? null,
      inputQuietMs: st?.inputQuietForMs ?? null,
      navMode: nav?.mode ?? null,
      navCandidate: nav?.magneticCandidateId ?? null,
      navFastGesture: nav?.fastGesture ?? null,
      magnetismVelocity: magnetism?.velocityPxPerMs ?? null,
      magnetismSuppressed: magnetism?.suppressed ?? null,
      magnetismLastInput: magnetism?.lastInput ?? null,
      canvasScreen: canvas?.dataset.screen ?? null,
      canvasResolved: canvas?.dataset.resolvedState ?? null,
      canvasLoad: canvas?.dataset.loadStatus ?? null,
      canvasGpu: canvas?.dataset.gpuTarget ?? null,
      canvasQuaternion: canvas?.dataset.overlayQuaternion ?? null,
      poster: Boolean(document.querySelector('[data-qa=ps04-neutral-poster]')),
      canvasCount: document.querySelectorAll('canvas').length,
      silhouettePixels: silhouette?.visiblePixelCount ?? null,
      actorDraw: silhouette?.actorDraw ?? null,
      error: document.querySelector('main')?.dataset.error ?? null,
    };
  });
}

async function waitTarget(page, nodeId, geometryId, timeout = 12000) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await state(page);
    if (last.active === nodeId && last.semantic === geometryId && last.gpu === geometryId
      && last.txStatus === 'settled' && last.settle === nodeId && last.settlePhase === 'Settled') return last;
    await page.waitForTimeout(80);
  }
  throw new Error(`Target ${nodeId}/${geometryId} missed: ${JSON.stringify(last)}`);
}

async function rawCanvas(page) {
  const box = await page.locator('[data-qa=m4-canvas]').boundingBox();
  if (!box) return null;
  const clip = {
    x: Math.max(0, Math.round(box.x)),
    y: Math.max(0, Math.round(box.y)),
    width: Math.min(1440, Math.round(box.width)),
    height: Math.min(900, Math.round(box.height)),
  };
  if (!clip.width || !clip.height) return null;
  const png = await page.screenshot({ clip, animations: 'allow' });
  return sharp(png).resize(160, 100, { fit: 'fill' }).removeAlpha().raw().toBuffer();
}

function changedPixels(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  let n = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) >= 18) n++;
  }
  return n;
}

async function trace(page, name, action, expectedNode, expectedGeometry, options = {}) {
  const before = await state(page);
  const baseline = options.pixels === false ? null : await rawCanvas(page);
  await page.waitForTimeout(100);
  const idle = baseline ? changedPixels(baseline, await rawCanvas(page)) : null;
  const threshold = baseline ? Math.max(160, (idle || 0) * 3) : null;
  const started = Date.now();
  await action();
  const actionReturnMs = Date.now() - started;
  const rows = [];
  while (Date.now() - started < (options.duration || 2200)) {
    const s = await state(page);
    const pixels = baseline ? changedPixels(baseline, await rawCanvas(page)) : null;
    rows.push({ ms: Date.now() - started, ...s, changedPixels: pixels });
    await page.waitForTimeout(35);
  }
  let final;
  try { final = await waitTarget(page, expectedNode, expectedGeometry, options.timeout || 10000); }
  catch (error) { final = { error: String(error), ...(await state(page)) }; }
  let later = null;
  if (options.followupMs) {
    await page.waitForTimeout(options.followupMs);
    later = await state(page);
  }
  return {
    name,
    before,
    actionReturnMs,
    expectedNode,
    expectedGeometry,
    idleChangedPixels: idle,
    pixelThreshold: threshold,
    firstChangedPixelMs: rows.find(row => row.changedPixels !== null && row.changedPixels >= threshold)?.ms ?? null,
    firstSemanticMs: rows.find(row => row.txTarget === expectedGeometry)?.ms ?? null,
    firstGpuMs: rows.find(row => row.gpu === expectedGeometry && row.active === expectedNode)?.ms ?? null,
    final,
    later,
    rows,
  };
}

async function touchSwipe(page, cdp) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 780 }] });
  for (let i = 1; i <= 18; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300, y: 780 - i * 40 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function unlockBuilder(page) {
  await page.goto(`${base}/#screen-03.1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__PS04M61_LAB__?.ready, null, { timeout: 90000 });
  await page.locator('[data-qa=task-explain_changes]').click();
  await page.evaluate(() => { location.hash = '#screen-03.2'; });
  await page.waitForFunction(() => window.__PS04M61_LAB__?.activeNode === '03.2');
  await page.locator('[data-qa=competence-content]').click();
  await page.locator('[data-qa=competence-event]').click();
  await page.locator('[data-qa=confirm-competencies]').click();
  await page.evaluate(() => { location.hash = '#screen-05.3'; });
  await waitTarget(page, '05.3', 'single-event', 20000);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const errors = [];
  const report = { at: new Date().toISOString(), base, reducedMotion: false, deepLink: null, lockedDeepLink: null, scenarios: [], errors, failures: [] };
  try {
    const deep = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
    deep.on('pageerror', e => errors.push(`deep pageerror: ${String(e)}`));
    deep.on('console', m => { if (m.type() === 'error') errors.push(`deep console: ${m.text()}`); });
    await deep.addInitScript(() => {
      window.__ps04DeepTimeline = [];
      const started = performance.now();
      const timer = setInterval(() => {
        const h = window.__PS04M61_LAB__;
        const canvas = document.querySelector('[data-qa=m4-canvas]');
        window.__ps04DeepTimeline.push({
          ms: Math.round(performance.now() - started), hash: location.hash,
          active: h?.activeNode ?? null, semantic: h?.contract?.()?.resolvedGeometryId ?? null,
          gpu: h?.geometrySnapshot?.()?.boundTargetGeometryId ?? null,
          screen: canvas?.dataset.screen ?? null, canvasGpu: canvas?.dataset.gpuTarget ?? null,
          load: canvas?.dataset.loadStatus ?? null, scrollY: Math.round(scrollY),
          poster: Boolean(document.querySelector('[data-qa=ps04-neutral-poster]')),
          canvasCount: document.querySelectorAll('canvas').length,
        });
        if (performance.now() - started > 6000) clearInterval(timer);
      }, 25);
    });
    await deep.goto(`${base}/#screen-05.3`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await deep.waitForFunction(() => window.__PS04M61_LAB__?.ready, null, { timeout: 90000 });
    await deep.waitForTimeout(1200);
    report.deepLink = { final: await state(deep), timeline: await deep.evaluate(() => window.__ps04DeepTimeline) };
    await deep.close();

    const locked = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
    await locked.goto(`${base}/#screen-03.2`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await locked.waitForFunction(() => window.__PS04M61_LAB__?.ready, null, { timeout: 90000 });
    await locked.waitForTimeout(250);
    report.lockedDeepLink = await state(locked);
    await locked.close();

    if (!onlyDeep) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
      page.on('pageerror', e => errors.push(`desktop pageerror: ${String(e)}`));
      page.on('console', m => { if (m.type() === 'error') errors.push(`desktop console: ${m.text()}`); });
      await unlockBuilder(page);
      report.scenarios.push(await trace(page, 'graph Event to Project', () => page.getByRole('button', { name: 'Проект', exact: true }).click(), '03.1', 'master-neutral'));
      report.scenarios.push(await trace(page, 'graph Project to Competencies', () => page.getByRole('button', { name: 'Компетенции', exact: true }).click(), '05.1', 'single-content'));
      report.scenarios.push(await trace(page, 'hash Content to Event', () => page.evaluate(() => { location.hash = '#screen-05.3'; }), '05.3', 'single-event'));
      report.scenarios.push(await trace(page, 'Back Event to Content', () => page.goBack(), '05.1', 'single-content', { pixels: false }));
      report.scenarios.push(await trace(page, 'Forward Content to Event', () => page.goForward(), '05.3', 'single-event', { pixels: false }));
      report.scenarios.push(await trace(page, 'wheel Event to Games', async () => { await page.mouse.move(800, 550); await page.mouse.wheel(0, 750); }, '05.4', 'single-games', { followupMs: 3000 }));
      if ((await state(page)).active !== '05.4') {
        report.scenarios.push(await trace(page, 'wheel continuation to Games', () => page.mouse.wheel(0, 450), '05.4', 'single-games', { pixels: false }));
      }
      if ((await state(page)).active !== '05.4') {
        await page.evaluate(() => { location.hash = '#screen-05.4'; });
        await waitTarget(page, '05.4', 'single-games');
      }
      report.scenarios.push(await trace(page, 'rapid reverse Games to Event', async () => {
        for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowUp']) {
          await page.keyboard.press(key);
          await page.waitForTimeout(60);
        }
      }, '05.3', 'single-event', { followupMs: 5000 }));
      await page.close();

      const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
      mobile.on('pageerror', e => errors.push(`mobile pageerror: ${String(e)}`));
      mobile.on('console', m => { if (m.type() === 'error') errors.push(`mobile console: ${m.text()}`); });
      await unlockBuilder(mobile);
      const cdp = await mobile.context().newCDPSession(mobile);
      report.scenarios.push(await trace(mobile, 'touch Event to Games', () => touchSwipe(mobile, cdp), '05.4', 'single-games', { pixels: false, followupMs: 3000 }));
      await mobile.close();
    }
  } catch (error) {
    report.fatal = String(error?.stack || error);
    process.exitCode = 1;
  } finally {
    if (report.deepLink && (report.deepLink.final.hash !== '#screen-05.3'
      || report.deepLink.final.active !== '05.3'
      || report.deepLink.final.semantic !== 'single-event'
      || report.deepLink.final.gpu !== 'single-event')) report.failures.push('cold Event deep link');
    if (report.lockedDeepLink && (report.lockedDeepLink.hash !== '#screen-03.1'
      || report.lockedDeepLink.active !== '03.1'
      || report.lockedDeepLink.semantic !== 'master-neutral'
      || report.lockedDeepLink.gpu !== 'master-neutral')) report.failures.push('locked builder deep link');
    for (const scenario of report.scenarios) {
      if (scenario.final.active !== scenario.expectedNode
        || scenario.final.semantic !== scenario.expectedGeometry
        || scenario.final.gpu !== scenario.expectedGeometry
        || scenario.final.settle !== scenario.expectedNode
        || scenario.final.settlePhase !== 'Settled') report.failures.push(scenario.name);
    }
    if (errors.length) report.failures.push('browser errors');
    if (report.failures.length) process.exitCode = 1;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
  console.log(JSON.stringify({ deepLink: report.deepLink?.final, lockedDeepLink: report.lockedDeepLink, scenarios: report.scenarios.map(s => ({ name: s.name, actionReturnMs: s.actionReturnMs, firstChangedPixelMs: s.firstChangedPixelMs, firstSemanticMs: s.firstSemanticMs, firstGpuMs: s.firstGpuMs, final: s.final, later: s.later, idleChangedPixels: s.idleChangedPixels, pixelThreshold: s.pixelThreshold })), errors, failures: report.failures, fatal: report.fatal }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
