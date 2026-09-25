import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const out = `design/photonic-skin/ps-05-r2/2026-09-25/${process.env.PS05_R2_QA_RUN ?? 'qa'}`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const manifest = { build: readFileSync('.next/BUILD_ID', 'utf8').trim(), browser: browser.version(), url: 'http://127.0.0.1:3001/', checks: [], errors: [] };
const only = process.env.PS05_R2_ONLY ? new Set(process.env.PS05_R2_ONLY.split(',')) : null;

async function run(name, viewport, action, options = {}) {
  if (only && !only.has(name)) return;
  const context = await browser.newContext({ viewport, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const record = { name, viewport, reduced: !!options.reduced, observations: [] };
  manifest.checks.push(record);
  page.on('pageerror', error => manifest.errors.push(`${name}: ${error.message}`));
  const state = () => page.evaluate(() => ({ node: document.documentElement.dataset.m4Node, scrollY, reading: document.querySelector('[data-ps05]')?.getAttribute('data-reading'), theme: document.querySelector('[data-ps05]')?.getAttribute('data-theme'), reduced: document.querySelector('[data-ps05]')?.getAttribute('data-reduced'), snapshots: document.querySelectorAll('[data-motion-snapshot]').length, canvas: document.querySelectorAll('canvas').length, actor: window.__PS04M5_LAB__?.composition() }));
  const settle = async id => { await page.waitForFunction(id => { const copy = document.querySelector(`[id="screen-${id}"] [data-ps05-copy]`); return document.documentElement.dataset.m4Node === id && copy && Number(getComputedStyle(copy).opacity) > .999 && !copy.inert && !document.querySelector('[data-motion-snapshot]'); }, id, { timeout: 30000 }); await page.waitForTimeout(130); };
  const go = async id => { await page.goto(`${manifest.url}#screen-${id}`); await page.reload(); await settle(id); };
  const wheel = async (from, to, fast = false) => {
    await settle(from);
    let target = await page.evaluate(({ from, to }) => {
      if (from === '03.1' && to === '03.2') return scrollY + innerHeight;
      if (from === '03.2' && to === '03.1') return scrollY - innerHeight;
      if (from === '06.1' && to === '05.7') return scrollY - innerHeight;
      const top = document.getElementById(`screen-${to}`).getBoundingClientRect().top + scrollY;
      return Math.round(top) + 2;
    }, { from, to });
    if (fast) await page.mouse.wheel(0, target - await page.evaluate(() => scrollY));
    else for (let i = 8; i > 0; i--) { const current = await page.evaluate(() => scrollY); await page.mouse.wheel(0, (target - current) / i); await page.waitForTimeout(45); }
    await settle(to);
    const end = await state();
    assert.equal(end.node, to);
    assert.equal(end.snapshots, 0);
    record.observations.push({ action: `${from} → ${to} ${fast ? 'fast wheel' : 'wheel'}`, end });
  };
  try { await action({ page, state, settle, go, wheel, record }); }
  catch (error) { manifest.errors.push(`${name}: ${error.stack ?? error}`); process.exitCode = 1; try { await page.screenshot({ path: `${out}/${name}-failure.png` }); } catch {} }
  await context.close();
  writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`${name}: ${record.observations.length} observations`);
}

await run('desktop-light', { width: 1840, height: 944 }, async ({ page, state, settle, go, wheel, record }) => {
  for (const [from, to] of [['01','02'],['02','01'],['02','03.1'],['03.1','02'],['04','05.1'],['05.1','04'],['05.7','06.1'],['06.1','05.7']]) { await go(from); await wheel(from, to); }
  await go('03.1');
  await page.locator('[data-qa^="task-"]').first().check();
  await wheel('03.1','03.2');
  await page.locator('[data-qa="competence-event"]').check();
  assert.equal(await page.locator('[data-qa="competence-event"]').isChecked(), true);
  record.observations.push({ action: '03.2 choice clickable', end: await state() });
  await wheel('03.2','03.1');
  await page.locator('[data-qa^="task-"]').last().check();
  assert.equal(await page.locator('[data-qa^="task-"]').last().isChecked(), true);
  await page.getByRole('button', { name: /Выбрать компетенции/ }).click(); await settle('03.2');
  if (!await page.locator('[data-qa="competence-event"]').isChecked()) await page.locator('[data-qa="competence-event"]').check();
  await page.locator('[data-qa="confirm-competencies"]').click(); await settle('03.3');
  await page.locator('[data-qa="brief-text"]').fill('Ручной текст R2 для проверки сохранения.');
  await page.getByRole('button', { name: 'Изменить состав' }).click(); await settle('03.2');
  await page.locator('[data-qa="confirm-competencies"]').click(); await settle('03.3');
  assert.equal(await page.locator('[data-qa="brief-text"]').inputValue(), 'Ручной текст R2 для проверки сохранения.');
  record.observations.push({ action: '03.3 manual brief survives round trip', end: await state() });
  await go('04');
  await page.keyboard.press('ArrowDown'); await settle('05.1');
  record.observations.push({ action: 'keyboard 04 → 05.1', end: await state() });
  await page.locator('[data-hit="04"]').click(); await settle('04');
  record.observations.push({ action: 'graph 05.1 → 04', end: await state() });
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80); await page.mouse.wheel(0, -944); await settle('04');
  record.observations.push({ action: 'wheel reverses keyboard transition', end: await state() });
  await page.getByRole('navigation', { name: 'Разделы сайта' }).getByRole('link', { name: 'Компетенции' }).click(); await page.waitForTimeout(80); await page.setViewportSize({ width: 1280, height: 720 }); await settle('05.1');
  assert.equal((await state()).reading, 'true');
  record.observations.push({ action: 'resize during transition', end: await state() });
  await page.setViewportSize({ width: 1840, height: 944 }); await settle('05.1');
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(80);
  await page.getByRole('navigation', { name: 'Разделы сайта' }).getByRole('link', { name: 'Контакт' }).click(); await settle('07');
  record.observations.push({ action: 'direct chapter choice interrupts transition', end: await state() });
  await go('05.7'); await page.keyboard.press('ArrowDown'); await settle('06.1');
  record.observations.push({ action: 'keyboard 05.7 → 06.1', end: await state() });
  await page.keyboard.press('ArrowUp'); await settle('05.7');
  record.observations.push({ action: 'keyboard 06.1 → 05.7', end: await state() });
  await go('05.7'); await page.locator('[data-hit="06.1"]').click(); await settle('06.1');
  record.observations.push({ action: 'graph 05.7 → 06.1', end: await state() });
  await go('08'); assert.equal((await state()).actor?.visible, false); record.observations.push({ action: 'footer actor hidden', end: await state() });
});

await run('desktop-dark', { width: 1840, height: 944 }, async ({ page, state, go, wheel, record }) => {
  await go('04'); await page.getByRole('button', { name: 'Тёмная тема' }).click(); assert.equal((await state()).theme, 'dark');
  await wheel('04','05.1'); await wheel('05.1','04');
  for (const [from, to] of [['01','02'],['02','01'],['02','03.1'],['03.1','02'],['05.7','06.1'],['06.1','05.7']]) { await go(from); if ((await state()).theme !== 'dark') await page.getByRole('button', { name: 'Тёмная тема' }).click(); await wheel(from, to); }
  record.observations.push({ action: 'dark theme', end: await state() });
});

await run('reading-1280', { width: 1280, height: 720 }, async ({ state, go, wheel, record }) => {
  await go('04'); assert.equal((await state()).reading, 'true');
  await wheel('04','05.1'); await wheel('05.1','04');
  record.observations.push({ action: 'reading route exchange', end: await state() });
});

await run('reading-1440-long', { width: 1440, height: 900 }, async ({ page, state, settle, go, wheel, record }) => {
  await go('03.1'); await page.locator('[data-qa^="task-"]').first().check();
  await page.getByRole('button', { name: /Выбрать компетенции/ }).click(); await settle('03.2');
  for (const input of await page.locator('[data-qa^="competence-"]').all()) await input.check();
  await page.waitForTimeout(150);
  assert.equal((await state()).reading, 'true');
  const before = await page.evaluate(() => ({ y: scrollY, opacity: Number(getComputedStyle(document.querySelector('[id="screen-03.2"] [data-ps05-copy]')).opacity), height: document.getElementById('screen-03.2').offsetHeight }));
  await page.mouse.wheel(0, 220); await page.waitForTimeout(180);
  const inside = await page.evaluate(() => ({ y: scrollY, opacity: Number(getComputedStyle(document.querySelector('[id="screen-03.2"] [data-ps05-copy]')).opacity) }));
  assert.ok(inside.y > before.y && inside.y < before.y + before.height - 400);
  assert.ok(inside.opacity > .99, 'long paragraph must remain readable inside one screen');
  record.observations.push({ action: 'long 03.2 internal wheel', before, inside });
  await page.getByRole('navigation', { name: 'Разделы сайта' }).getByRole('link', { name: 'Кейсы' }).click(); await settle('04');
  await wheel('04','05.1');
});

await run('mobile-390', { width: 390, height: 844 }, async ({ page, state, go, wheel, record }) => {
  await go('04'); assert.equal((await state()).reading, 'true'); await wheel('04','05.1');
  await go('07'); const field = page.locator('[id="screen-07"] textarea'); await field.fill('Нужен разговор о проекте.');
  await page.getByRole('button', { name: /Оставить контакты/ }).click(); await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape'); assert.equal(await field.inputValue(), 'Нужен разговор о проекте.');
  record.observations.push({ action: 'mobile form and dialog', end: await state() });
});

await run('reduced', { width: 1840, height: 944 }, async ({ page, state, go, wheel, record }) => {
  await go('04'); await page.getByRole('button', { name: 'Меньше движения' }).click(); assert.equal((await state()).reduced, 'true');
  await wheel('04','05.1',true); await wheel('05.1','04',true);
  assert.equal((await state()).snapshots, 0);
  record.observations.push({ action: 'reduced content visible', end: await state() });
});

await browser.close();
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ checks: manifest.checks.length, errors: manifest.errors.length }));
