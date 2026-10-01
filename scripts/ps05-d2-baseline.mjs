import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='design/photonic-skin/ps-05-d2/baseline';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const result={browser:browser.version(),scenarios:[],errors:[]};
for(const [name,width,height] of [['keys',1440,900],['slow',1840,944],['graph-interrupt',1440,900]]){
 const ctx=await browser.newContext({viewport:{width,height},recordVideo:{dir:out,size:{width,height}}});const p=await ctx.newPage();
 p.on('pageerror',e=>result.errors.push(e.message));
 await p.goto('http://127.0.0.1:3003/?theme=light#screen-04');await p.waitForFunction(()=>document.documentElement.dataset.m4Node==='04');await p.waitForTimeout(2500);
 await p.evaluate(()=>{window.d2trace=[];const start=performance.now();function tick(){const elements=[...document.querySelectorAll('[data-ps05-copy],[data-motion-snapshot]')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),h=e.querySelector('h1,h2');return {node:e.closest('[data-node]')?.dataset.node,snapshot:!!e.dataset.motionSnapshot,opacity:s.opacity,transform:s.transform,rect:{x:r.x,y:r.y,w:r.width,h:r.height},text:h?.textContent,font:h&&getComputedStyle(h).fontSize}}).filter(e=>+e.opacity>0&&e.rect.y<innerHeight&&e.rect.y+e.rect.h>0);window.d2trace.push({t:performance.now()-start,y:scrollY,active:document.documentElement.dataset.m4Node,mode:document.documentElement.dataset.m4ScrollMode,elements});if(performance.now()-start<8500)requestAnimationFrame(tick)}tick()});
 if(name==='keys'){await p.keyboard.press('ArrowDown');await p.waitForTimeout(900);await p.keyboard.press('ArrowUp');await p.waitForTimeout(900);await p.keyboard.press('ArrowDown');await p.waitForTimeout(80);await p.keyboard.press('ArrowDown');await p.waitForTimeout(80);await p.keyboard.press('ArrowUp');}
 if(name==='slow'){for(let i=0;i<8;i++){await p.mouse.wheel(0,12);await p.waitForTimeout(85)}await p.waitForTimeout(1100);for(let i=0;i<12;i++){await p.mouse.wheel(0,42);await p.waitForTimeout(60)}await p.waitForTimeout(1100);await p.mouse.wheel(0,-30)}
 if(name==='graph-interrupt'){await p.locator('button[aria-controls="route-map"]').click();await p.locator('[data-hit="05.7"]').click();await p.waitForTimeout(110);await p.mouse.wheel(0,-75)}
 await p.waitForTimeout(4000);await p.screenshot({path:`${out}/${name}.png`});const trace=await p.evaluate(()=>window.d2trace);writeFileSync(`${out}/${name}.json`,JSON.stringify(trace));result.scenarios.push({name,width,height,start:trace[0],end:trace.at(-1)});const v=p.video();await ctx.close();await v.saveAs(`${out}/${name}.webm`);
}await browser.close();writeFileSync(`${out}/manifest.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
