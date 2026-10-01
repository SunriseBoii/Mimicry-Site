import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.PS05_BASE??'http://127.0.0.1:3004';
const out=`design/photonic-skin/ps-05-d2/${process.env.PS05_RUN??'motion'}`;mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const manifest={base,browser:browser.version(),scenarios:[],errors:[]};
const save=()=>writeFileSync(`${out}/manifest.json`,JSON.stringify(manifest,null,2));
async function settle(p,id){await p.waitForFunction(id=>document.documentElement.dataset.m4Node===id&&Number(getComputedStyle(document.querySelector(`[id="screen-${id}"] [data-ps05-copy]`)).opacity)===1,id);await p.waitForTimeout(150)}
async function stable(p){await p.waitForTimeout(180);const a=await p.evaluate(()=>({y:scrollY,p:document.documentElement.dataset.pageProgress}));await p.waitForTimeout(850);const b=await p.evaluate(()=>({y:scrollY,p:document.documentElement.dataset.pageProgress}));assert.deepEqual(b,a,'stopping input must not move position or effective progress');return a;}
for(const [name,width,height,theme,reduced] of [['keys',1440,900,'light',false],['keys-dark',1440,900,'dark',false],['slow',1840,944,'light',false],['slow-small',1440,900,'dark',false],['graph-interrupt',1440,900,'light',false],['reduced',1440,900,'dark',true]]){
 if(process.env.PS05_ONLY && !process.env.PS05_ONLY.split(',').includes(name))continue;
 const ctx=await browser.newContext({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference',recordVideo:{dir:out,size:{width,height}}});const p=await ctx.newPage();p.on('pageerror',e=>manifest.errors.push({name,error:e.message}));
 try{
  await p.goto(`${base}/?theme=${theme}#screen-04`);await settle(p,'04');await p.waitForFunction(()=>{const e=document.querySelector('[data-qa="m4-canvas"]');return e?.dataset.gpuTarget===e?.dataset.resolvedState&&+e?.dataset.gpuProgress>=.999},null,{timeout:90000});await p.waitForTimeout(250);
  await p.evaluate(()=>{window.d2trace=[];window.d2record=true;const start=performance.now();const tick=()=>{const copies=[...document.querySelectorAll('[data-ps05-copy]')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),h=e.querySelector('h1,h2');return {id:e.closest('[data-node]').dataset.node,opacity:+s.opacity,transform:s.transform,inert:e.inert,shimmer:e.dataset.shimmer,sweep:s.getPropertyValue('--sweep'),rect:r.toJSON(),font:getComputedStyle(h).fontSize,heading:h.getBoundingClientRect().toJSON()}});const html=document.documentElement.dataset;window.d2trace.push({t:performance.now()-start,y:scrollY,p:+html.pageProgress,from:html.pageFrom,to:html.pageTo,active:html.m4Node,mode:html.m4ScrollMode,copies,actor:window.__PS04M5_LAB__?.composition()});if(window.d2record)requestAnimationFrame(tick)};tick()});
  if(name.startsWith('keys')||reduced){
   await p.keyboard.press('ArrowDown');await settle(p,'05.1');await p.keyboard.press('ArrowUp');await settle(p,'04');
   await p.keyboard.press('ArrowDown');await p.waitForTimeout(80);await p.keyboard.press('ArrowDown');await p.waitForTimeout(80);await p.keyboard.press('ArrowUp');await settle(p,'05.1');
   await p.keyboard.press('ArrowDown');await p.waitForTimeout(120);await p.keyboard.press('ArrowUp');await settle(p,'05.1');
   await p.mouse.wheel(0,24);await stable(p);await p.keyboard.press('ArrowDown');await settle(p,'05.2');
  }else if(name.startsWith('slow')){
   for(let i=0;i<8;i++){await p.mouse.wheel(0,5);await p.waitForTimeout(65)}await stable(p);
   for(let i=0;i<18;i++){await p.mouse.wheel(0,26);await p.waitForTimeout(38)}await stable(p);await p.screenshot({path:`${out}/${name}-exit.png`});
   for(let i=0;i<9;i++){await p.mouse.wheel(0,26);await p.waitForTimeout(38)}await stable(p);await p.screenshot({path:`${out}/${name}-shimmer.png`});
   for(let i=0;i<12;i++){await p.mouse.wheel(0,-18);await p.waitForTimeout(38)}await stable(p);await p.mouse.wheel(0,1200);await stable(p);
  }else{
   await p.locator('[data-hit="05.7"]').click();await p.waitForTimeout(110);await p.mouse.wheel(0,-75);await stable(p);
   await p.keyboard.press('ArrowDown');await p.waitForTimeout(750);await stable(p);
  }
  await p.waitForFunction(()=>{const e=document.querySelector('[data-qa="m4-canvas"]');return e?.dataset.gpuTarget===e?.dataset.resolvedState&&+e?.dataset.gpuProgress>=.999},null,{timeout:90000});
  await p.screenshot({path:`${out}/${name}.png`});await p.evaluate(()=>window.d2record=false);const trace=await p.evaluate(()=>window.d2trace);writeFileSync(`${out}/${name}.json`,JSON.stringify(trace));
  for(const id of ['04','05.1','05.2','05.7']){const shown=trace.flatMap(s=>s.copies.filter(e=>e.id===id&&e.opacity>0));assert.ok(new Set(shown.map(e=>e.font)).size<=1,`${id} changed font size`);assert.ok(shown.every(e=>/^matrix\(1, 0, 0, 1,/.test(e.transform)||e.transform==='none'),`${id} scaled`);}
  assert.equal(await p.locator('[data-motion-snapshot]').count(),0);assert.equal(await p.locator('canvas').count(),1);
  if(name.startsWith('keys')){assert.ok(trace.some(s=>s.copies.some(e=>e.opacity>0&&e.opacity<1)));assert.ok(trace.some(s=>s.copies.some(e=>e.shimmer==='true')));}
  manifest.scenarios.push({name,width,height,theme,reduced,frames:trace.length,pass:true});console.log('PASS',name);
 }catch(e){manifest.errors.push({name,error:e.stack});await p.screenshot({path:`${out}/${name}-failure.png`});console.error('FAIL',name,e.message);process.exitCode=1;}finally{const video=p.video();await ctx.close();await video.saveAs(`${out}/${name}.webm`);save();}
}await browser.close();save();
