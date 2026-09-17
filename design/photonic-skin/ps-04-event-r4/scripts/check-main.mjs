import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const out='design/photonic-skin/ps-04-event-r4/renders';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3002/#screen-05.3');
 await page.waitForFunction(()=>window.__PS04M62_LAB__?.ready);
 await page.waitForFunction(()=>{const h=window.__PS04M62_LAB__,a=h.renderAck();return a.drawnTargetId==='single-event'&&a.drawnProgress===1&&h.transaction()?.status==='settled';},null,{timeout:30000});
 for(const theme of ['light','dark']) {
  await page.evaluate(t=>{window.__PS04M62_LAB__.setTheme(t);window.__PS04M62_LAB__.setReviewPhase(.25);},theme);
  await page.waitForTimeout(200);
  await page.screenshot({path:`${out}/main-${theme}-event.png`});
 }
 writeFileSync(`${out}/main-check.json`,JSON.stringify({errors,ack:await page.evaluate(()=>window.__PS04M62_LAB__.renderAck())},null,2));
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('PASS production / Event R4');
} finally { await browser.close(); }
