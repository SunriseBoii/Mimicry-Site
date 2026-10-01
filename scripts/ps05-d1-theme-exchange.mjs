import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// A real wheel event and a real menu click overlap the 420 ms R2 exchange.
const out = 'design/photonic-skin/ps-05-d1/theme-exchange';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1840, height: 944 }, recordVideo: { dir: out } });
const page = await context.newPage();
const report = { build: readFileSync('.next/BUILD_ID', 'utf8').trim(), checks: [], errors: [] };
page.on('pageerror', error => report.errors.push(error.message));
try {
 await page.goto('http://127.0.0.1:3003/?theme=light#screen-04');
 await page.waitForFunction(() => document.documentElement.dataset.m4Node === '04' && getComputedStyle(document.querySelector('[id="screen-04"] [data-ps05-copy]')).opacity === '1');
 await page.locator('button[aria-controls="ps05-nav"]').click();
 await page.evaluate(() => {
  window.themeSamples = [];
  window.themeTimer = setInterval(() => {
   const root = document.querySelector('[data-ps05]'), layer = document.querySelector('[data-motion-snapshot]');
   if (layer) window.themeSamples.push({ time: performance.now(), theme: root.dataset.theme, layerTheme: layer.parentElement.dataset.theme, color: getComputedStyle(layer.querySelector('h1,h2')).color, opacity: getComputedStyle(layer).opacity });
  }, 8);
 });
 await page.mouse.move(900, 700);
 await page.mouse.wheel(0, 944);
 await page.getByRole('button', { name: 'Тёмная тема', exact: true }).click();
 await page.waitForFunction(() => !document.querySelector('[data-motion-snapshot]') && document.documentElement.dataset.m4Node === '05.1');
 const samples = await page.evaluate(() => { clearInterval(window.themeTimer); return window.themeSamples; });
 writeFileSync(`${out}/trace.json`, JSON.stringify(samples, null, 2));
 const synchronized = samples.filter(row => row.theme === 'dark' && row.layerTheme === 'dark');
 assert.ok(synchronized.length > 0, 'Theme changed while the outgoing R2 layer still existed');
 assert.ok(synchronized.every(row => row.color === 'rgb(255, 255, 255)'), 'Outgoing heading inherits pure white after the theme change');
 assert.equal(await page.locator('canvas').count(), 1);
 await page.keyboard.press('Escape');
 await page.locator('[id="screen-05.1"]').getByRole('button', { name: /Обсудить/ }).click();
 await page.waitForFunction(() => document.documentElement.dataset.m4Node === '07' && getComputedStyle(document.querySelector('[id="screen-07"] [data-ps05-copy]')).opacity === '1');
 await page.getByRole('button', { name: 'Оставить контакты', exact: true }).click();
 await page.getByRole('dialog').waitFor();
 report.checks.push({ name: 'Theme tokens remain synchronized during R2; contact clickable after wheel', synchronizedSamples: synchronized.length, samples: samples.length });
 await page.screenshot({ path: `${out}/after-wheel-contact.png` });
} catch (error) {
 report.errors.push(error.stack ?? String(error)); process.exitCode = 1;
} finally {
 const video = page.video(); await context.close(); await video.saveAs(`${out}/theme-during-wheel.webm`); await browser.close();
 writeFileSync(`${out}/manifest.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
