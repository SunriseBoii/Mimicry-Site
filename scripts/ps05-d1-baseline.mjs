import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const dir='design/photonic-skin/ps-05-d1/before';
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1840,height:944}});
const errors=[],shots=[];
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:3001/?review=ps05');
 await page.waitForSelector('canvas');await page.waitForTimeout(4000);
 await page.getByRole('button',{name:/^Собрать проект Начнём/}).click();await page.waitForTimeout(900);
 await page.locator('[data-qa="task-engage_and_unite"]').check();
 await page.getByRole('button',{name:/^Выбрать компетенции/}).click();await page.waitForTimeout(1000);
 for(const id of ['event','video','digital','merch'])await page.locator(`[data-qa="competence-${id}"]`).check();
 await page.locator('[data-qa="confirm-competencies"]').click();await page.waitForTimeout(1000);
 for(const theme of ['light','dark']) {
  if(theme==='dark')await page.getByRole('button',{name:'Тёмная тема',exact:true}).click();
  for(const id of ['01','02','03.1','03.2','03.3','04','05.1','05.2','05.3','05.4','05.5','05.6','05.7','06.1','06.2','06.3','07','08']) {
   await page.evaluate(id=>{location.hash=`screen-${id}`},id);await page.waitForTimeout(1200);
   await page.screenshot({path:`${dir}/${theme}-${id}.png`});shots.push({theme,id});
  }
 }
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:3001/');await page.waitForTimeout(3000);await page.screenshot({path:`${dir}/mobile.png`});
}finally{writeFileSync(`${dir}/manifest.json`,JSON.stringify({build:readFileSync('.next/BUILD_ID','utf8'),shots,errors},null,2));await browser.close();}
