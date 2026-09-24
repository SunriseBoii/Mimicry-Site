import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const BASE=process.env.PS05_BASE??'http://127.0.0.1:3001';
const RUN=process.env.PS05_RUN??'acceptance-01';
const dir=`design/photonic-skin/ps-05-r1/2026-09-24/${RUN}`;mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const results=[],errors=[],contexts=[];
const taskIds=['explain_changes','engage_and_unite','learn_and_practice','company_and_culture'];
let p;
async function open(width=1840,height=944,motion='no-preference',label='main'){
 const ctx=await browser.newContext({viewport:{width,height},reducedMotion:motion,recordVideo:{dir:dir+'/video',size:{width,height}}});
 contexts.push({ctx,label});p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE+'/');
 await p.waitForSelector('[data-ps05]');await p.waitForFunction(()=>window.__PS04M5_LAB__?.actorResourceReady,undefined,{timeout:90000});
 await observe();await settled('01');return p;
}
async function observe(){await p.evaluate(()=>{
 window.r1samples=[];window.r1record=false;window.r1events=[];
 for(const type of ['click','change','keydown','wheel'])document.addEventListener(type,e=>{if(window.r1record)window.r1events.push({t:performance.now(),type,key:e.key,deltaY:e.deltaY,qa:e.target.dataset.qa,tag:e.target.tagName})},true);
 const canvas=document.querySelector('canvas');window.r1canvas=canvas;
 function sample(){const lab=window.__PS04M5_LAB__,c=lab?.composition();return {t:performance.now(),url:location.href,viewport:[innerWidth,innerHeight],y:scrollY,node:document.documentElement.dataset.m4Node,reading:document.querySelector('[data-ps05]')?.dataset.reading,theme:document.querySelector('[data-ps05]')?.dataset.theme,reduced:document.querySelector('[data-ps05]')?.dataset.reduced,systemReduced:matchMedia('(prefers-reduced-motion: reduce)').matches,canvasCount:document.querySelectorAll('canvas').length,sameCanvas:document.querySelector('canvas')===window.r1canvas,c:c?{x:c.cssCenterX,y:c.cssCenterY,size:c.cssSize,visible:c.visible,draw:c.actorDraw}:null,texts:[...document.querySelectorAll('[data-ps05-copy],[data-motion-snapshot]')].map(el=>{const r=el.getBoundingClientRect();let opacity=1;for(let ancestor=el;ancestor;ancestor=ancestor.parentElement)opacity*=Number(getComputedStyle(ancestor).opacity);return {id:el.closest('[data-node]')?.dataset.node??'snapshot',opacity,x:r.x,y:r.y,w:r.width,h:r.height,inert:!!el.closest('[inert]')}})}}
 window.r1sample=sample;function tick(){if(window.r1record)window.r1samples.push(sample());requestAnimationFrame(tick)}tick();
})}
async function finishContext(){const item=contexts.at(-1);if(!item||item.closed)return;const video=item.ctx.pages()[0]?.video();await item.ctx.close();item.closed=true;if(video)await video.saveAs(`${dir}/${item.label}.webm`);}
async function settled(id){await p.waitForFunction(id=>{
 const s=window.r1sample(),text=s.texts.find(t=>t.id===id);
 const same=s.node===id&&text&&!text.inert&&text.opacity>.999&&!document.querySelector('[data-motion-snapshot]');
 const prev=window.r1settle;
 const key=JSON.stringify([id,Math.round(s.y),Math.round(s.c?.x??0),Math.round(s.c?.y??0)]);
 if(!same||prev?.key!==key){window.r1settle={key,t:performance.now()};return false;}
 return performance.now()-prev.t>180;
 },id,{timeout:20000});}
async function header(label){const menu=p.getByRole('button',{name:'Меню',exact:true});if(await menu.isVisible())await menu.click();await p.getByRole('navigation',{name:'Разделы сайта',exact:true}).getByRole('link',{name:label,exact:true}).click();}
async function go(id){const active=await p.evaluate(()=>document.documentElement.dataset.m4Node);if(active===id){await settled(id);return;}
 if(id==='01')await p.locator('header').getByRole('link').first().click();
 else if(['03.1','04','05.1','06.1','07'].includes(id))await header({'03.1':'Проект','04':'Кейсы','05.1':'Компетенции','06.1':'Студия','07':'Контакт'}[id]);
 else if(id.startsWith('05.')){await header('Компетенции');await settled('05.1');await p.locator(`[id="screen-05.1"] a[href="#screen-${id}"]`).click();}
 else if(id==='03.2'){await header('Проект');await settled('03.1');await p.getByRole('button',{name:/^Выбрать компетенции/}).click();}
 else if(id==='02'){await go('01');await p.keyboard.press('ArrowDown');}
 else if(id==='08'){await header('Контакт');await settled('07');await p.keyboard.press('End');}
 else throw Error('no UI path '+id);
 await settled(id);
}
async function targetY(id){return p.evaluate(id=>{const nodes=[...document.querySelectorAll('[data-ps05] [data-node]')];const el=nodes.find(el=>el.dataset.node===id);return document.querySelector('[data-ps05]').dataset.reading==='true'?el.getBoundingClientRect().top+scrollY+2:nodes.indexOf(el)*innerHeight+2},id)}
async function wheelTo(id){const y=await targetY(id);await p.mouse.move(1100>p.viewportSize().width?p.viewportSize().width-15:1100,p.viewportSize().height-60);
 for(let i=8;i>0;i--){const current=await p.evaluate(()=>scrollY);await p.mouse.wheel(0,(y-current)/i);await p.waitForTimeout(40)}
}
async function action(label,to,fn,extra={}){
 await p.evaluate(()=>{window.r1samples=[];window.r1events=[];window.r1record=true;window.r1samples.push(window.r1sample())});
 const start=await p.evaluate(()=>performance.now());await fn();if(to)await settled(to);else await p.waitForTimeout(550);
 const data=await p.evaluate(()=>{window.r1record=false;return {samples:window.r1samples,events:window.r1events,state:window.r1sample()}});
 const result={label,to,start,...extra,...data};results.push(result);
 assert.equal(data.state.canvasCount,1);assert.equal(data.state.sameCanvas,true);
 console.log(label,data.state.node,data.state.reading);return result;
}
async function cardClicks(){
 for(let i=0;i<taskIds.length;i++){
  const input=p.locator(`[id="screen-03.1"] [data-qa="task-${taskIds[i]}"]`),label=input.locator('..');
  for(const area of ['text','blank','check']){
   const r=await label.boundingBox();assert.ok(r&&r.y>70&&r.y+r.height<p.viewportSize().height,`card ${i} visible before coordinate click`);
   const x=area==='text'?r.x+35:area==='check'?r.x+r.width-26:r.x+r.width*.65;
   const y=area==='blank'?r.y+r.height-15:r.y+31;
   const hit=await p.evaluate(({x,y})=>{const el=document.elementFromPoint(x,y);return {html:el?.outerHTML.slice(0,300),inert:!!el?.closest('[inert]')}},{x,y});assert.equal(hit.inert,false);
   await p.mouse.click(x,y);assert.equal(await input.isChecked(),true);assert.equal(await p.locator('[id="screen-03.1"] input:checked').count(),1);
   results.push({label:`card ${i} ${area}`,hit,pass:true});
  }
 }
 assert.equal(await p.getByRole('button',{name:/^Выбрать компетенции/}).isEnabled(),true);
}
async function select(ids){for(const id of ids)await p.locator(`[data-qa="competence-${id}"]`).click();}
async function builder(){await go('03.1');await p.locator(`[data-qa="task-${taskIds[0]}"]`).click();await action('builder CTA 03.1 to 03.2','03.2',()=>p.getByRole('button',{name:/^Выбрать компетенции/}).click());await select(['event','video']);await action('builder confirmation 03.2 to 03.3','03.3',()=>p.locator('[data-qa="confirm-competencies"]').click());await p.locator('[data-qa="brief-text"]').fill('R1 — мой ручной бриф сохраняется.');await p.getByRole('button',{name:'Изменить состав',exact:true}).click();await settled('03.2');await p.locator('[data-qa="competence-digital"]').click();await p.locator('[data-qa="confirm-competencies"]').click();await settled('03.3');assert.equal(await p.locator('[data-qa="brief-text"]').inputValue(),'R1 — мой ручной бриф сохраняется.');await p.getByRole('button',{name:'Сохранить мой текст',exact:true}).click();await p.locator('[data-qa="send-brief"]').click();await p.getByRole('dialog').waitFor();const y=await p.evaluate(()=>scrollY);await p.getByRole('dialog').hover();await p.mouse.wheel(0,300);assert.equal(await p.evaluate(()=>scrollY),y);await p.keyboard.press('Escape');await p.getByRole('dialog').waitFor({state:'detached'});await go('03.1');await p.locator(`[data-qa="task-${taskIds[1]}"]`).click();}

try{
 if(process.env.PS05_SUITE!=='responsive'){
 await open();
 await action('FIX02 wheel to 02 exact anchor','02',()=>p.mouse.wheel(0,946));
 await action('FIX02 wheel arrival CSS start','03.1',()=>p.mouse.wheel(0,942));
 await action('FIX02 all coordinate card areas','03.1',cardClicks);
 await p.screenshot({path:dir+'/tasks-clickable.png'});
 await p.keyboard.press('ArrowLeft');assert.equal(await p.locator(`[data-qa="task-${taskIds[2]}"]`).isChecked(),true);assert.equal(await p.evaluate(()=>document.documentElement.dataset.m4Node),'03.1');
 await builder();await p.screenshot({path:dir+'/builder-complete.png'});
 await go('03.1');await action('wheel horizontal builder forward','03.2',()=>wheelTo('03.2'),{input:'wheel',from:'03.1'});await action('wheel horizontal builder reverse','03.1',()=>wheelTo('03.1'),{input:'wheel',from:'03.2'});
 for(const theme of ['light','dark']){
 if(theme==='dark')await p.getByRole('button',{name:'Тёмная тема',exact:true}).click();
 for(const [from,to] of [['04','05.1'],['05.1','04'],['05.7','06.1'],['06.1','05.7']]){
  for(const input of ['wheel','keyboard','graph']){
   await go(from);
   let actual=input;
   if(input==='graph'){const r=await p.locator(`[data-hit="${to}"]`).boundingBox();if(!r||r.x<0||r.y<80||r.x+r.width>1840||r.y+r.height>944)actual='keyboard (graph node outside viewport)';}
   const forward=['04','05.7'].includes(from);
   await action(`${theme==='dark'?'dark ':''}${input} ${from} to ${to}`,to,()=>actual==='wheel'?wheelTo(to):actual==='graph'?p.locator(`[data-hit="${to}"]`).click():p.keyboard.press(forward?'ArrowDown':'ArrowUp'),{input:actual,from});
  }
 }
 }
 await go('04');await action('interrupt keyboard reversal','04',async()=>{await p.keyboard.press('ArrowDown');await p.waitForTimeout(90);await p.keyboard.press('ArrowUp')},{input:'keyboard',from:'04'});
 await action('interrupt graph with graph','04',async()=>{await p.locator('[data-hit="05.1"]').click();await p.waitForTimeout(70);await p.locator('[data-hit="04"]').click()},{input:'graph',from:'04'});
 await action('wheel during keyboard transition','04',async()=>{await p.keyboard.press('ArrowDown');await p.waitForTimeout(70);await wheelTo('04')},{input:'keyboard+wheel',from:'04'});
 await go('05.1');await action('direct far competence','05.7',()=>p.locator('[id="screen-05.1"] a[href="#screen-05.7"]').click(),{input:'link',from:'05.1'});
 await go('08');assert.equal((await p.evaluate(()=>window.r1sample())).c.draw,false);
 // Each entry route in a clean session; no callbacks or state injection.
 for(const entry of ['hero','keyboard','graph','reload']){
  await p.goto(BASE+'/');await p.waitForFunction(()=>window.__PS04M5_LAB__?.actorFramebufferReady);await observe();await settled('01');
  if(entry==='hero')await p.getByRole('button',{name:/^Собрать проект.*Начнём/}).click();
  if(entry==='keyboard'){await p.keyboard.press('ArrowDown');await settled('02');await p.keyboard.press('ArrowDown');}
  if(entry==='graph'){await p.locator('[data-hit="02"]').click();await settled('02');await p.locator('[data-hit="03.1"]').click();}
  if(entry==='reload'){await header('Проект');await settled('03.1');await p.reload();await p.waitForFunction(()=>window.__PS04M5_LAB__?.actorFramebufferReady);await observe();}
  await settled('03.1');await cardClicks();results.push({label:'entry '+entry,pass:true});
 }
 await finishContext();
 }
 // Responsive and alternate motion/theme paths.
 if(process.env.PS05_SUITE!=='main'){
 for(const [label,w,h,motion] of [['standard',1440,900,'no-preference'],['short',1280,720,'no-preference'],['mobile',390,844,'no-preference'],['reduced',1840,944,'reduce']]){
  await open(w,h,motion,label);await go('03.1');
  await p.locator(`[data-qa="task-${taskIds[0]}"]`).click();await p.getByRole('button',{name:/^Выбрать компетенции/}).click();await settled('03.2');await select(['content','design','event','games','video','digital','merch']);
  if(w>1100&&h>=800){
   await p.locator('[id="screen-03.2"]').getByRole('button',{name:'Организация мероприятия',exact:true}).click();
   for(const summary of await p.locator('[id="works-builder-event"] summary').all())await summary.click();
   const reading=await p.locator('[data-ps05]').getAttribute('data-reading');assert.equal(reading,'true','content height selects desktop reading layout');
   const before=await p.evaluate(()=>window.r1sample());
   await action(label+' long content reading','03.2',()=>p.mouse.wheel(0,120),{input:'wheel within long section',before});
  }
  await p.locator('[data-qa="confirm-competencies"]').click();await settled('03.3');
  await p.screenshot({path:dir+`/${label}-brief.png`});results.push({label:label+' builder',state:await p.evaluate(()=>window.r1sample()),pass:true});
  await go('04');await action(label+' wheel boundary','05.1',()=>wheelTo('05.1'),{input:'wheel',from:'04'});
  const menu=p.getByRole('button',{name:'Меню',exact:true});if(await menu.isVisible())await menu.click();await p.getByRole('button',{name:'Тёмная тема',exact:true}).click();if(await p.getByRole('button',{name:'Закрыть меню',exact:true}).isVisible())await p.getByRole('button',{name:'Закрыть меню',exact:true}).click();
  await go('03.1');await p.locator(`[data-qa="task-${taskIds[2]}"]`).click();await go('04');await action(label+' dark direct','05.1',()=>p.getByRole('button',{name:/Посмотреть, что мы можем/}).click(),{input:'CTA',from:'04'});
  await p.screenshot({path:dir+`/${label}-dark-content.png`});
  await finishContext();
 }
 }
}catch(e){errors.push(String(e.stack??e));console.error(e);if(p)await p.screenshot({path:dir+'/failure.png'}).catch(()=>{});process.exitCode=1;}
finally{
 writeFileSync(dir+'/manifest.json',JSON.stringify({date:new Date().toISOString(),url:BASE+'/',build:readFileSync('.next/BUILD_ID','utf8').trim(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--short'],{encoding:'utf8'}),browser:browser.version(),results,errors},null,2));
 for(const {ctx,label,closed}of contexts){if(closed)continue;const page=ctx.pages()[0],video=page?.video();await ctx.close();if(video)await video.saveAs(`${dir}/${label}.webm`);}
 await browser.close();console.log(JSON.stringify({checks:results.length,errors}));
}
