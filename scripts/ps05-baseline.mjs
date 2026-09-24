import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const dir = 'design/photonic-skin/ps-05/2026-09-24/baseline';
mkdirSync(dir, {recursive:true});
const browser = await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport:{width:1440,height:900}});
await page.goto('http://127.0.0.1:3000');
await page.waitForSelector('[data-qa="m4-header"]', {timeout:120000});
await page.waitForTimeout(5000);
await page.screenshot({path:`${dir}/01.png`});
await page.getByRole('button',{name:'Собрать проект',exact:true}).first().click();
await page.waitForTimeout(1400); await page.screenshot({path:`${dir}/03.1.png`});
await page.locator('[data-qa="task-engage_and_unite"]').click();
await page.waitForTimeout(300); await page.locator('[data-hit="03.2"]').click();
await page.waitForTimeout(1000);
for (const id of ['event','video','digital','merch']) await page.locator(`[data-qa="competence-${id}"]`).click();
await page.waitForTimeout(1600); await page.screenshot({path:`${dir}/03.2.png`});
await page.locator('[data-qa="confirm-competencies"]').click();
await page.waitForTimeout(300); await page.locator('[data-hit="03.3"]').click();
await page.waitForTimeout(1200); await page.screenshot({path:`${dir}/03.3.png`});
for (const id of ['04','05.1','07']) {
 await page.evaluate(id=>{location.hash=`screen-${id}`},id); await page.waitForTimeout(1500);
 await page.screenshot({path:`${dir}/${id}.png`});
}
await page.setViewportSize({width:390,height:844});
await page.goto('http://127.0.0.1:3000'); await page.waitForTimeout(4000);
await page.screenshot({path:`${dir}/mobile.png`});
writeFileSync(`${dir}/manifest.json`,JSON.stringify({base:'c339450363eb06f4363e33d2d4f639f32c5a28ff',date:new Date().toISOString(),desktop:[1440,900],mobile:[390,844],theme:'light',motion:'normal',builder:['event','video','digital','merch'],canvas:await page.locator('canvas').count()},null,2));
await browser.close();
