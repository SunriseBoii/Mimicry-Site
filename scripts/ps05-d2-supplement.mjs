import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.PS05_BASE??'http://127.0.0.1:3005';
const out='design/photonic-skin/ps-05-d2/supplement';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const manifest={base,build:readFileSync('.next/BUILD_ID','utf8').trim(),browser:browser.version(),checks:[],errors:[]};
const save=()=>writeFileSync(`${out}/manifest.json`,JSON.stringify(manifest,null,2));
const all=['content','design','event','games','video','digital','merch'];
async function settle(p,id){await p.waitForFunction(id=>document.documentElement.dataset.m4Node===id&&+getComputedStyle(document.querySelector(`[id="screen-${id}"] [data-ps05-copy]`)).opacity===1,id);}
async function gpu(p){await p.waitForFunction(()=>{const e=document.querySelector('[data-qa="m4-canvas"]');return e?.dataset.gpuTarget===e?.dataset.resolvedState&&+e?.dataset.gpuProgress>=.999},null,{timeout:90000});}
async function jump(p,id){await p.locator(`[data-hit="${id}"]`).click();await settle(p,id);}
async function stable(p){await p.waitForTimeout(500);const a=await p.evaluate(()=>({y:scrollY,p:document.documentElement.dataset.pageProgress}));await p.waitForTimeout(800);assert.deepEqual(await p.evaluate(()=>({y:scrollY,p:document.documentElement.dataset.pageProgress})),a);return a;}
async function shot(p,name){await p.screenshot({path:`${out}/${name}.png`});manifest.checks.push({name,pass:true});save();}
async function run(name,viewport,fn,options={}){
 const ctx=await browser.newContext({viewport,isMobile:viewport.width<600,hasTouch:viewport.width<600,recordVideo:{dir:out,size:viewport},...options});const p=await ctx.newPage();p.on('pageerror',e=>manifest.errors.push({name,error:e.message}));
 try{await fn(p,ctx);manifest.checks.push({name,pass:true});console.log('PASS',name)}catch(e){manifest.errors.push({name,error:e.stack});console.error('FAIL',name,e.message);await shot(p,name+'-failure');process.exitCode=1}finally{const v=p.video();await ctx.close();await v.saveAs(`${out}/${name}.webm`);save()}
}
for(const theme of ['light','dark'])await run(`mobile-gpu-${theme}`,{width:390,height:844},async(p,ctx)=>{
 await p.goto(`${base}/?theme=${theme}#screen-03.1`);await settle(p,'03.1');await p.locator('[data-qa="task-engage_and_unite"]').check();await p.getByRole('button',{name:/^Выбрать компетенции/}).click();await settle(p,'03.2');
 for(const id of all)await p.locator(`[data-qa="competence-${id}"]`).check();await gpu(p);
 await p.locator('[id="screen-03.2"] [data-actor-slot]').scrollIntoViewIfNeeded();await shot(p,`390-${theme}-all7-materials-03.2`);
 await p.locator('[data-qa="confirm-competencies"]').click();await settle(p,'03.3');await p.locator('[id="screen-03.3"] [data-actor-slot]').scrollIntoViewIfNeeded();await gpu(p);await shot(p,`390-${theme}-all7-materials-03.3`);
 await jump(p,'04');await p.locator('[data-hit="05.7"]').click();await p.waitForTimeout(120);
 const cdp=await ctx.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:170,y:500}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:170,y:570}]});await p.waitForTimeout(160);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const stopped=await stable(p);manifest.checks.push({name:`${theme}-touch-interrupt-stable`,...stopped});await shot(p,`390-${theme}-touch-stop`);
});
await run('fields-and-context-loss',{width:1440,height:900},async p=>{
 await p.goto(`${base}/?theme=light#screen-03.1`);await settle(p,'03.1');await p.locator('[data-qa="task-engage_and_unite"]').check();await p.keyboard.press('ArrowDown');await p.waitForTimeout(650);assert.equal(await p.locator('html').getAttribute('data-m4-node'),'03.1');
 await p.getByRole('button',{name:/^Выбрать компетенции/}).click();await settle(p,'03.2');await p.locator('[data-qa="competence-design"]').check();await p.keyboard.press('ArrowDown');await p.waitForTimeout(650);assert.equal(await p.locator('html').getAttribute('data-m4-node'),'03.2');
 await p.locator('[data-qa="confirm-competencies"]').click();await settle(p,'03.3');await p.getByRole('button',{name:/Изменить запрос/}).click();await p.locator('[data-qa="brief-text"]').fill('Первая строка\nВторая строка\nТретья строка');await p.keyboard.press('ArrowUp');await p.waitForTimeout(650);assert.equal(await p.locator('html').getAttribute('data-m4-node'),'03.3');
 await gpu(p);const lost=await p.evaluate(()=>{const c=document.querySelector('canvas'),gl=c.getContext('webgl2')??c.getContext('webgl');const ext=gl?.getExtension('WEBGL_lose_context');ext?.loseContext();return !!ext});assert.equal(lost,true);await p.waitForTimeout(500);
 await p.locator('[data-qa="brief-text"]').fill('Редактирование после потери WebGL-контекста работает.');await p.getByRole('button',{name:/Готово/}).click();await shot(p,'context-loss-editable');await jump(p,'07');await shot(p,'context-loss-contact');assert.equal(await p.locator('canvas').count(),1);
});
await run('boundary-and-first-frames',{width:1440,height:900},async p=>{
 await p.goto(`${base}/?theme=light#screen-05.7`);await settle(p,'05.7');await gpu(p);
 await p.locator('[id="heading-05.7"]').focus();
 await p.evaluate(()=>{window.firstFrames=[];const start=performance.now();window.frameStart=start;const tick=()=>{window.firstFrames.push({t:performance.now()-start,y:scrollY,active:document.documentElement.dataset.m4Node,copy:[...document.querySelectorAll('[data-ps05-copy]')].map(e=>{const h=e.querySelector('h1,h2'),s=getComputedStyle(e);return{id:e.closest('[data-node]').dataset.node,opacity:+s.opacity,transform:s.transform,font:getComputedStyle(h).fontSize,width:h.getBoundingClientRect().width,top:h.getBoundingClientRect().top,sweep:s.getPropertyValue('--sweep')}})});if(performance.now()-start<1800)requestAnimationFrame(tick)};tick()});
 await p.keyboard.press('ArrowDown');const frames=[];
 for(let i=0;i<9;i++){await p.screenshot({path:`${out}/first-frame-${i}.png`});frames.push(await p.evaluate(()=>performance.now()-window.frameStart));await p.waitForTimeout(25)}
 await settle(p,'06.1');await p.keyboard.press('ArrowUp');await settle(p,'05.7');await p.mouse.wheel(0,380);const stopped=await stable(p);await p.mouse.wheel(0,-140);await stable(p);await p.keyboard.press('ArrowDown');await settle(p,'06.1');
 const trace=await p.evaluate(()=>window.firstFrames);writeFileSync(`${out}/first-frames.json`,JSON.stringify({frames,trace},null,2));manifest.checks.push({name:'merch-team-forward-reverse-wheel',...stopped});await shot(p,'merch-team');
 await p.setViewportSize({width:1280,height:720});await settle(p,'06.1');await jump(p,'03.1');await shot(p,'1280-task-clear-slot');
});
await browser.close();save();console.log(manifest.checks.length,'checks;',manifest.errors.length,'errors');
