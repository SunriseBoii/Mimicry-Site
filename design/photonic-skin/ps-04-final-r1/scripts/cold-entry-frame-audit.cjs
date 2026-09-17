/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Chrome DevTools frame capture. */
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');

const outDir = path.join(__dirname, '..', 'reports', 'cold-entry-frames');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', event => {
    frames.push({ receivedAt: Date.now(), metadata: event.metadata, png: Buffer.from(event.data, 'base64') });
    void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId });
  });
  try {
    await cdp.send('Page.enable');
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: 1440, maxHeight: 900 });
    await page.addInitScript(() => {
      window.__ps04ColdFrames = [];
      window.__ps04PosterOffAt = null;
      let seenPoster = false;
      const started = performance.now();
      setInterval(() => {
        const h = window.__PS04M61_LAB__;
        const poster = Boolean(document.querySelector('[data-qa=ps04-neutral-poster]'));
        if (poster) seenPoster = true;
        if (seenPoster && !poster && window.__ps04PosterOffAt === null) window.__ps04PosterOffAt = Date.now();
        const geo = h?.geometrySnapshot?.();
        const ack = h?.renderAck?.();
        const settle = h?.settle?.();
        const tx = h?.transaction?.();
        const nav = h?.navigation?.();
        window.__ps04ColdFrames.push({
          ms: Math.round(performance.now() - started), now: Date.now(), poster,
          canvasCount: document.querySelectorAll('canvas').length,
          hash: location.hash, scrollY: window.scrollY, active: h?.activeNode ?? null,
          semantic: h?.contract?.()?.resolvedGeometryId ?? null,
          gpu: geo?.boundTargetGeometryId ?? null,
          ackTarget: ack?.drawnTargetId ?? null,
          ackProgram: ack?.drawnProgramId ?? null,
          phase: settle?.scrollPhase ?? null,
          settledNode: settle?.magnetizedSettledNodeId ?? null,
          candidate: settle?.snapCandidateNodeId ?? null,
          actorRequests: settle?.actorRequestCount ?? null,
          actorSource: settle?.actorRequestSource ?? null,
          actorCommitted: settle?.actorCommittedNodeId ?? null,
          navMode: nav?.mode ?? null,
          navTarget: nav?.pendingTarget ?? null,
          txTarget: tx?.targetNodeId ?? null,
          txGeometry: tx?.targetGeometryId ?? null,
          txStatus: tx?.status ?? null,
          firstVisible: document.querySelector('[data-qa=m4-canvas]')?.dataset.firstVisibleMs ?? null,
        });
      }, 12);
    });
    await page.goto('http://localhost:3000/#screen-05.3', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__ps04PosterOffAt !== null, null, { timeout: 60000 });
    await page.waitForTimeout(450);
    await cdp.send('Page.stopScreencast');
    const detail = await page.evaluate(() => ({ offAt: window.__ps04PosterOffAt, timeline: window.__ps04ColdFrames }));
    const around = frames.filter(frame => Math.abs(frame.receivedAt - detail.offAt) <= 500);
    around.forEach((frame, index) => {
      const file = `frame-${String(index).padStart(2, '0')}-${frame.receivedAt - detail.offAt}ms.png`;
      fs.writeFileSync(path.join(outDir, file), frame.png);
      frame.file = file;
    });
    const report = {
      offAt: detail.offAt,
      totalScreencastFrames: frames.length,
      nearbyFrames: around.map(({ receivedAt, metadata, file }) => ({ receivedAt, deltaMs: receivedAt - detail.offAt, metadata, file })),
      timeline: detail.timeline,
    };
    const visible = detail.timeline.find(row => row.now >= detail.offAt);
    const prematureRequests = detail.timeline.filter(row => row.canvasCount === 0 && (row.actorRequests ?? 0) > 0);
    const wrongVisibleFrames = detail.timeline.filter(row => !row.poster && row.canvasCount > 0
      && (row.ackTarget !== 'single-event' || row.gpu !== 'single-event'));
    report.failures = [
      ...(prematureRequests.length ? [`${prematureRequests.length} preboot actor request samples`] : []),
      ...(!visible || visible.ackTarget !== 'single-event' || visible.gpu !== 'single-event'
        ? ['poster released without Event GPU endpoint'] : []),
      ...(wrongVisibleFrames.length ? [`${wrongVisibleFrames.length} visible non-Event GPU samples`] : []),
    ];
    fs.writeFileSync(path.join(outDir, 'trace.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ offAt: detail.offAt, totalScreencastFrames: frames.length, failures: report.failures, nearbyFrames: report.nearbyFrames, timelineEdges: detail.timeline.filter((row, i, all) => i === 0 || row.poster !== all[i - 1].poster || row.gpu !== all[i - 1].gpu || row.ackTarget !== all[i - 1].ackTarget) }, null, 2));
    if (report.failures.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
