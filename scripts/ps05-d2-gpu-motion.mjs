import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='design/photonic-skin/ps-05-d2/'+(process.env.PS05_COLD?'gpu-cold':'gpu-motion');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const ctx=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}});const p=await ctx.newPage();
async function settled(id){await p.waitForFunction(id=>document.documentElement.dataset.m4Node===id&&+getComputedStyle(document.querySelector(`[id="screen-${id}"] [data-ps05-copy]`)).opacity===1,id);await p.waitForTimeout(150)}
const gpu=()=>p.waitForFunction(()=>{const e=document.querySelector('[data-qa="m4-canvas"]');return e?.dataset.gpuTarget===e?.dataset.resolvedState&&+e?.dataset.gpuProgress>=.999},null,{timeout:90000});
await p.goto('http://127.0.0.1:3005/?theme=light#screen-04');await settled('04');if(process.env.PS05_COLD)await p.waitForTimeout(1500);else await gpu();
await p.waitForFunction(()=>window.__PS04M5_LAB__);await p.evaluate(()=>window.__PS04M5_LAB__.startGeometryLog());
await p.keyboard.press('ArrowDown');await settled('05.1');await p.keyboard.press('ArrowUp');await settled('04');
await p.keyboard.press('ArrowDown');await p.waitForTimeout(80);await p.keyboard.press('ArrowDown');await p.waitForTimeout(80);await p.keyboard.press('ArrowUp');await settled('05.1');
await p.keyboard.press('ArrowDown');await p.waitForTimeout(120);await p.keyboard.press('ArrowUp');await settled('05.1');
await p.mouse.wheel(0,24);await p.waitForTimeout(1000);await p.keyboard.press('ArrowDown');await settled('05.2');
const snapshots=[];
for(let i=0;i<8;i++){snapshots.push(await p.evaluate(()=>{const l=window.__PS04M5_LAB__;return {at:performance.now(),tx:l.transaction(),geo:l.geometrySnapshot(),ack:l.renderAck(),navigation:l.navigation(),settle:l.settle(),resource:l.resource(),overlay:l.idleOverlay(),composition:l.composition()}}));await p.screenshot({path:`${out}/after-${i}.png`});await p.waitForTimeout(500)}
await gpu();await p.screenshot({path:`${out}/settled.png`});writeFileSync(`${out}/snapshots.json`,JSON.stringify(snapshots,null,2));writeFileSync(`${out}/trace.json`,JSON.stringify(await p.evaluate(()=>window.__PS04M5_LAB__.stopGeometryLog())));const video=p.video();await ctx.close();await video.saveAs(`${out}/rapid.webm`);await browser.close();console.log('GPU final endpoint reached');
