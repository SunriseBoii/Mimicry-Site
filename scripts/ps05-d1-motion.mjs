import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import assert from 'node:assert/strict';

const phase = process.env.PS05_R2_PHASE ?? 'wheel-light';
const out = `design/photonic-skin/ps-05-d1/motion/${phase}`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const cases = (process.env.PS05_R2_CASES ?? '04:05.1,05.1:04,05.7:06.1,06.1:05.7').split(',').map(pair => pair.split(':'));
const [viewportWidth, viewportHeight] = (process.env.PS05_R2_VIEWPORT ?? '1840x944').split('x').map(Number);
const input = process.env.PS05_INPUT ?? 'wheel';
const theme = process.env.PS05_THEME ?? 'light';
const fast = process.env.PS05_R2_FAST === '1';
const longReading = process.env.PS05_R2_LONG === '1';
const manifest = { phase, build: readFileSync('.next/BUILD_ID', 'utf8').trim(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }), browser: browser.version(), url: 'http://127.0.0.1:3003/', cases: [], errors: [] };

for (const [from, to] of cases) {
  const name = `${from}-to-${to}`;
  const dir = `${out}/${name}`;
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: viewportWidth, height: viewportHeight }, reducedMotion: 'no-preference', recordVideo: { dir: out, size: { width: viewportWidth, height: viewportHeight } } });
  const page = await context.newPage();
  const record = { from, to, capturedAt: new Date().toISOString(), input: input === 'wheel' ? (fast ? 'mouse.wheel one strong step' : 'mouse.wheel eight small steps') : input, viewport: [viewportWidth, viewportHeight], theme, motion: 'normal', frames: [] };
  manifest.cases.push(record);
  page.on('pageerror', error => manifest.errors.push(`${name}: ${error.message}`));
  try {
    await page.goto(`${manifest.url}?theme=${theme}#screen-${longReading ? '03.1' : from}`);
    if (longReading) {
      await page.waitForFunction(() => document.documentElement.dataset.m4Node === '03.1');
      await page.locator('[data-qa^="task-"]').first().check();
      await page.getByRole('button', { name: /Выбрать компетенции/ }).click();
      await page.waitForFunction(() => document.documentElement.dataset.m4Node === '03.2' && !document.querySelector('[data-motion-snapshot]'));
      await page.waitForTimeout(150);
      for (const input of await page.locator('[data-qa^="competence-"]').all()) await input.check();
      if (from === '04') await page.getByRole('link', { name: 'Кейсы' }).first().click();
      else if (from !== '03.2') throw Error(`long reading setup for ${from} is not implemented`);
    }
    await page.waitForFunction(id => document.documentElement.dataset.m4Node === id && getComputedStyle(document.querySelector(`[id="screen-${id}"] [data-ps05-copy]`)).opacity === '1', from, { timeout: 60000 });
    if (from === '03.1' && to === '03.2') await page.locator('[data-qa^="task-"]').first().check();
    await page.waitForTimeout(500);
    record.layout = await page.locator('[data-ps05]').getAttribute('data-reading');
    await page.evaluate(({ from, to }) => {
      window.__r2Samples = [];
      window.__r2Capturing = true;
      window.__r2WheelEvents = [];
      window.addEventListener('wheel', event => { const r = document.querySelector(`[id="screen-${from}"] [data-ps05-copy]`)?.getBoundingClientRect(); window.__r2WheelEvents.push({ time: performance.now(), scrollY, deltaY: event.deltaY, source: r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, snapshots: document.querySelectorAll('[data-motion-snapshot]').length }); }, { capture: true, passive: true });
      const inspect = (id) => {
        const section = document.getElementById(`screen-${id}`);
        const copy = section?.querySelector('[data-ps05-copy]');
        const heading = document.getElementById(`heading-${id}`);
        if (!copy || !heading) return null;
        const bounds = (element) => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
        let opacity = 1;
        for (let element = copy; element; element = element.parentElement) opacity *= Number(getComputedStyle(element).opacity);
        const lead = copy.querySelector(':scope > p');
        const action = copy.querySelector('button');
        return { section: bounds(section), copy: bounds(copy), heading: bounds(heading), lead: lead ? bounds(lead) : null, action: action ? bounds(action) : null, opacity, transform: getComputedStyle(copy).transform, inert: section.inert || copy.inert, pointerEvents: getComputedStyle(copy).pointerEvents };
      };
      const tick = () => {
        if (!window.__r2Capturing) return;
        const layer = document.querySelector('[data-motion-snapshot]');
        window.__r2Samples.push({ time: performance.now(), scrollY, active: document.documentElement.dataset.m4Node, from: inspect(from), to: inspect(to), layer: layer ? { opacity: Number(getComputedStyle(layer).opacity), color: getComputedStyle(layer.querySelector('h1,h2')).color, rect: (() => { const r = layer.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })() } : null });
        setTimeout(tick, 16);
      };
      tick();
    }, { from, to });
    const start = await page.evaluate(() => performance.now());
    let capturing = true;
    const shots = (async () => {
      for (let i = 0; capturing && i < 14; i++) {
        const file = `${String(i).padStart(2, '0')}.png`;
        const time = (await page.evaluate(() => performance.now())) - start;
        await page.screenshot({ path: `${dir}/${file}` });
        record.frames.push({ file, ms: Math.round(time) });
        await page.waitForTimeout(35);
      }
    })();
    const target = await page.evaluate(id => {
      const section=document.getElementById('screen-'+id),chapter=section.closest('[data-chapter]');
      if(document.querySelector('[data-ps05]').dataset.reading!=='true'&&chapter)return chapter.getBoundingClientRect().top+scrollY+[...chapter.querySelectorAll('[data-node]')].indexOf(section)*innerHeight;
      return section.getBoundingClientRect().top+scrollY;
    },to);
    if(input==='graph') {await page.locator('button[aria-controls="route-map"]').click();await page.locator('[data-hit="'+to+'"]').click();}
    else if(input==='keys') {await page.mouse.click(1000,820);await page.keyboard.press(Number(to)>Number(from)?'ArrowDown':'ArrowUp');}
    else
    if (fast) await page.mouse.wheel(0, target - await page.evaluate(() => scrollY));
    else for (let i = 8; i > 0; i--) {
      const current = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0, (target - current) / i);
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(500);
    capturing = false;
    await shots;
    await page.waitForFunction(id=>document.documentElement.dataset.m4Node===id&&!document.querySelector('[data-motion-snapshot]'),to,{timeout:30000});
    const samples = await page.evaluate(() => { window.__r2Capturing = false; return window.__r2Samples; });
    writeFileSync(`${dir}/trace.json`, JSON.stringify(samples, null, 2));
    writeFileSync(`${dir}/wheel.json`, JSON.stringify(await page.evaluate(() => window.__r2WheelEvents), null, 2));
    record.end = { active: await page.evaluate(() => document.documentElement.dataset.m4Node), scrollY: await page.evaluate(() => scrollY) };
    assert.equal(record.end.active,to);
    record.copyExchange={
      outgoingInsideZero:samples.filter(x=>x.layer&&x.layer.opacity<=.001&&x.layer.rect.top>0&&x.layer.rect.bottom<viewportHeight).length,
      incomingInsideZero:samples.filter(x=>x.to&&x.to.opacity<=.001&&x.to.heading.top>70&&x.to.heading.top<viewportHeight).length,
      intermediateOpacity:samples.filter(x=>(x.layer?.opacity>0&&x.layer?.opacity<1)||(x.from?.opacity>0&&x.from?.opacity<1)).length,
    };
    const tileWidth = 460, tileHeight = 260;
    const composites = [];
    for (let i = 0; i < record.frames.length; i++) {
      const frame = record.frames[i], x = i % 4 * tileWidth, y = Math.floor(i / 4) * tileHeight;
      composites.push({ input: await sharp(`${dir}/${frame.file}`).resize(tileWidth, 236, { fit: 'contain', background: '#ddd' }).png().toBuffer(), left: x, top: y + 24 });
      composites.push({ input: Buffer.from(`<svg width="460" height="24"><rect width="460" height="24" fill="#ddd"/><text x="8" y="17" font-family="Arial" font-size="12">${from} → ${to} / +${frame.ms} ms</text></svg>`), left: x, top: y });
    }
    await sharp({ create: { width: 1840, height: Math.ceil(record.frames.length / 4) * tileHeight, channels: 3, background: '#ddd' } }).composite(composites).png().toFile(`${dir}/timeline.png`);
  } catch (error) { manifest.errors.push(`${name}: ${error.stack ?? error}`); process.exitCode = 1; }
  const video = page.video();
  await context.close();
  await video.saveAs(`${dir}/transition.webm`);
  writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`${phase} ${name}`);
}
await browser.close();
