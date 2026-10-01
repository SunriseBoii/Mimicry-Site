import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.PS05_BASE??'http://127.0.0.1:3004';
const out=`design/photonic-skin/ps-05-d2/${process.env.PS05_RUN??'qa'}`;mkdirSync(out,{recursive:true});
const browser=await chromium.launch({...(process.env.PS05_BROWSER==='chromium'?{executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium-1234/chrome-win64/chrome.exe'}:{channel:'msedge'}),headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const ids=['01','02','03.1','03.2','03.3','04','05.1','05.2','05.3','05.4','05.5','05.6','05.7','06.1','06.2','06.3','07','08'];
const names=['content','design','event','games','video','digital','merch'];const four=['event','video','digital','merch'];
const manifest={date:new Date().toISOString(),base,build:readFileSync('.next/BUILD_ID','utf8').trim(),browser:browser.version(),checks:[],errors:[]};
const save=()=>writeFileSync(`${out}/manifest.json`,JSON.stringify(manifest,null,2));
const only=process.env.PS05_ONLY?.split(',');
async function settle(p,id){await p.waitForFunction(id=>{const c=document.querySelector(`[id="screen-${id}"] [data-ps05-copy]`);return document.documentElement.dataset.m4Node===id&&c&&!c.inert&&Number(getComputedStyle(c).opacity)>.999&&!document.querySelector('[data-motion-snapshot]')},id,{timeout:30000});await p.waitForTimeout(150)}
async function gpu(p){if((p.viewportSize()?.width??0)<=1100)return;await p.waitForFunction(()=>{const e=document.querySelector('[data-qa="m4-canvas"]');return e?.getAttribute('data-gpu-target')===e?.getAttribute('data-resolved-state')&&Number(e?.getAttribute('data-gpu-progress'))>=.999},null,{timeout:90000});}
async function start(p,query='?theme=light'){await p.goto(base+'/'+query);await p.waitForSelector('[data-ps05-copy]');await settle(p,new URL(p.url()).hash.replace('#screen-','')||'01');await p.waitForSelector('canvas',{timeout:90000});await gpu(p);}
async function menu(p){const t=p.locator('button[aria-controls="ps05-nav"]');if(await t.getAttribute('aria-expanded')==='false')await t.click();}
async function header(p,label){await menu(p);await p.getByRole('navigation',{name:'Разделы сайта',exact:true}).getByRole('link',{name:new RegExp(label)}).click();}
async function jump(p,id){await p.locator(`[data-hit="${id}"]`).click();await settle(p,id);}
async function theme(p,theme){if(await p.locator('[data-ps05]').getAttribute('data-theme')!==theme){await menu(p);await p.getByRole('button',{name:theme==='dark'?'Тёмная тема':'Светлая тема',exact:true}).click();await p.keyboard.press('Escape');await p.waitForTimeout(250);}}
async function selection(p,set){for(const id of names)await p.locator(`[data-qa="competence-${id}"]`).setChecked(set.includes(id));await gpu(p);}
async function build(p,set=four){await header(p,'Проект');await settle(p,'03.1');await p.locator('[data-qa="task-engage_and_unite"]').check();await p.getByRole('button',{name:/^Выбрать компетенции/}).click();await settle(p,'03.2');await selection(p,set);}
async function confirm(p){await p.locator('[data-qa="confirm-competencies"]').click();await settle(p,'03.3');await gpu(p);}
async function shot(p,name){
 await p.screenshot({path:`${out}/${name}.png`});
 const data=await p.evaluate(()=>{const root=document.querySelector('[data-ps05]'),c=document.querySelector('[data-qa="m4-canvas"]'),head=document.querySelector('[data-qa="m4-header"]');return {width:innerWidth,height:innerHeight,theme:root.dataset.theme,node:document.documentElement.dataset.m4Node,reading:root.dataset.reading,overflow:document.documentElement.scrollWidth>innerWidth+1,canvas:document.querySelectorAll('canvas').length,background:getComputedStyle(root).backgroundColor,ink:getComputedStyle(root).color,header:{y:head.getBoundingClientRect().y,display:getComputedStyle(head).display},gpu:{target:c?.dataset.gpuTarget,resolved:c?.dataset.resolvedState,progress:c?.dataset.gpuProgress},actor:window.__PS04M5_LAB__?.composition()}});
 manifest.checks.push({screenshot:name+'.png',...data});save();assert.equal(data.overflow,false,`${name}: horizontal overflow`);assert.equal(data.background,data.theme==='light'?'rgb(255, 255, 255)':'rgb(13, 13, 15)');assert.equal(data.ink,data.theme==='light'?'rgb(31, 35, 41)':'rgb(255, 255, 255)');
}
async function run(name,viewport,action,options={}){
 if(only&&!only.some(s=>name.startsWith(s)))return;
 const ctx=await browser.newContext({viewport,reducedMotion:options.reduced?'reduce':'no-preference',isMobile:viewport.width<=844,hasTouch:viewport.width<=844,recordVideo:options.video?{dir:`${out}/video`,size:viewport}:undefined});
 const p=await ctx.newPage();p.on('pageerror',e=>manifest.errors.push({name,error:e.message}));
 try{await action(p);manifest.checks.push({name,pass:true});console.log('PASS',name)}catch(e){manifest.errors.push({name,error:e.stack});console.error('FAIL',name,e.message);await p.screenshot({path:`${out}/${name}-failure.png`}).catch(()=>{});process.exitCode=1}finally{const v=p.video();await ctx.close();if(v)await v.saveAs(`${out}/${name}.webm`);save();}
}

for(const width of [1440])await run(`matrix-${width}`,{width,height:width===1840?944:900},async p=>{
 await start(p,'?review=ps05&theme=light');const canvas=await p.locator('canvas').elementHandle();await build(p,four);await confirm(p);
 for(const t of ['light','dark']){await theme(p,t);for(const id of ids){await jump(p,id);if(id!=='08')await gpu(p);await shot(p,`${width}-${t}-${id}`);}}
 assert.equal(await canvas.evaluate(el=>el===document.querySelector('canvas')),true);assert.equal((await p.evaluate(()=>window.__PS04M5_LAB__?.composition()))?.visible,false);
});

for(const [width,height] of [[1280,720],[390,844],[320,844]])await run(`responsive-${width}`,{width,height},async p=>{
 await start(p,'?review=ps05&transport=success&theme=light');
 for(const t of ['light','dark']){
  await theme(p,t);await jump(p,'01');await shot(p,`${width}-${t}-01`);await header(p,'Проект');await settle(p,'03.1');await shot(p,`${width}-${t}-03.1`);await build(p,names);await shot(p,`${width}-${t}-03.2`);
  await p.locator('[data-qa="confirm-competencies"]').scrollIntoViewIfNeeded();await p.waitForTimeout(300);await shot(p,`${width}-${t}-03.2-lower`);await confirm(p);await shot(p,`${width}-${t}-03.3`);
  await p.locator('[data-qa="send-brief"]').click();await shot(p,`${width}-${t}-contact`);await p.keyboard.press('Escape');await jump(p,'04');await p.getByRole('button',{name:/Открыть: От идеи/}).click();await shot(p,`${width}-${t}-case`);await p.keyboard.press('Escape');await jump(p,'05.7');await shot(p,`${width}-${t}-05.7`);
 }
},{video:false});

await run('interactions',{width:1840,height:944},async p=>{
 await start(p,'?review=ps05&transport=retry&theme=light');
 // Deliberate hover, keyboard disclosure, focus restoration, every route reachable.
 const trigger=p.locator('button[aria-controls="ps05-nav"]');await trigger.hover();await p.waitForFunction(()=>document.querySelector('button[aria-controls="ps05-nav"]').getAttribute('aria-expanded')==='true',null,{timeout:5000});await p.mouse.move(1000,500);await p.waitForTimeout(500);assert.equal(await trigger.getAttribute('aria-expanded'),'false');
 await trigger.focus();await p.keyboard.press('Enter');await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>!!document.activeElement.closest('#ps05-nav')),true);await p.keyboard.press('Escape');assert.equal(await trigger.evaluate(e=>e===document.activeElement),true);
 assert.equal(await p.locator('[data-hit]').count(),18);assert.equal(await p.locator('[data-hit="03.2"]').isDisabled(),true);await shot(p,'graph-locked');await p.keyboard.press('Escape');
 await p.getByRole('button',{name:/^Подключить компетенцию Усилим/}).click();await settle(p,'05.1');await gpu(p);await shot(p,'direct-competence');
 await header(p,'Проект');await settle(p,'03.1');for(const task of ['explain_changes','engage_and_unite','learn_and_practice','company_and_culture']){await p.locator(`[data-qa="task-${task}"]`).check();assert.equal(await p.locator(`[data-qa="task-${task}"]`).isChecked(),true);await shot(p,`task-${task}`);}
 await build(p,[]);assert.equal(await p.locator('[data-qa="confirm-competencies"]').isDisabled(),true);await shot(p,'selection-0');
 for(const t of ['light','dark']){await theme(p,t);for(const set of [[],...names.map(id=>[id]),['content','design'],['games','digital'],['event','video'],['event','merch'],four,names]){await selection(p,set);await shot(p,`${t}-selection-${set.join('-')||'empty'}`);if(set.length){await confirm(p);await shot(p,`${t}-brief-${set.join('-')}`);await jump(p,'03.2');}}}
 await selection(p,four);await p.getByRole('button',{name:'Организация мероприятия',exact:true}).click();await p.locator('[id="works-builder-event"]').getByText('Концепция и программа',{exact:true}).click();await shot(p,'work-examples');await p.getByRole('button',{name:'Организация мероприятия',exact:true}).click();
 for(let i=0;i<12;i++)await p.locator(`[data-qa="competence-${names[i%7]}"]`).click();await selection(p,four);await confirm(p);await p.getByRole('button',{name:/Изменить запрос/}).click();await p.locator('[data-qa="brief-text"]').fill('Ручной запрос D1: сохранить этот текст после изменения состава.');await p.getByRole('button',{name:/Готово/}).click();await p.reload();await settle(p,'03.3');assert.match(await p.locator('[data-qa="brief-reading"]').innerText(),/Ручной запрос D1/);
 await p.getByRole('button',{name:'Изменить состав',exact:true}).click();await settle(p,'03.2');await selection(p,['content','design']);await confirm(p);assert.match(await p.locator('[data-qa="brief-reading"]').innerText(),/Ручной запрос D1/);
 await p.getByRole('button',{name:'Обновить по выбору',exact:true}).click();assert.doesNotMatch(await p.locator('[data-qa="brief-reading"]').innerText(),/Ручной запрос D1/);await p.getByRole('button',{name:'Восстановить предыдущий текст',exact:true}).click();assert.match(await p.locator('[data-qa="brief-reading"]').innerText(),/Ручной запрос D1/);
 await p.locator('[data-qa="send-brief"]').click();let d=p.getByRole('dialog');await d.getByRole('button',{name:/Отправить тестовый/}).click();assert.ok(await d.locator('[aria-invalid="true"]').count());await d.getByLabel('Как вас зовут').fill('Тест D1');await d.getByLabel('Телефон или Telegram',{exact:true}).fill('@test_d1');await p.keyboard.press('Escape');assert.equal(await p.locator('[data-qa="send-brief"]').evaluate(e=>e===document.activeElement),true);
 await p.locator('[data-qa="send-brief"]').click();d=p.getByRole('dialog');assert.equal(await d.getByLabel('Как вас зовут').inputValue(),'Тест D1');await d.getByRole('button',{name:/Отправить тестовый/}).click();await p.getByRole('alert').waitFor();await shot(p,'form-error');await d.getByRole('button',{name:/Отправить тестовый/}).dblclick();await p.getByRole('heading',{name:'Тестовый запрос принят'}).waitFor();await shot(p,'form-success');await p.getByRole('button',{name:'Закрыть',exact:true}).click();
 for(const variant of ['A','B']){await start(p,`?review=ps05&caseMotion=${variant}&theme=dark#screen-04`);await p.getByRole('button',{name:/Открыть: От идеи/}).click();await p.getByRole('dialog').waitFor();await p.waitForTimeout(500);await shot(p,`case-${variant}`);assert.match(p.url(),/case=layout-study/);await p.goBack();await p.getByRole('dialog').waitFor({state:'detached'});await p.goForward();await p.getByRole('dialog').waitFor();await p.keyboard.press('Escape');await p.getByRole('dialog').waitFor({state:'detached'});await p.waitForTimeout(400);assert.equal(await p.locator('[data-transition-cover]').count(),0);}
 await start(p,'?theme=dark#screen-05.6');await p.reload();await settle(p,'05.6');assert.equal(await p.locator('[data-ps05]').getAttribute('data-theme'),'dark');await gpu(p);await shot(p,'reload-digital');
},{video:true});

await run('accessibility',{width:1440,height:900},async p=>{
 await start(p,'?theme=light');await p.addScriptTag({content:readFileSync('node_modules/axe-core/axe.min.js','utf8')});
 for(const t of ['light','dark']){await theme(p,t);for(const id of ['01','03.1','05.1','07']){await jump(p,id);const violations=await p.evaluate(async()=> (await window.axe.run(document.querySelector('[data-ps05]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);writeFileSync(`${out}/axe-${t}-${id}.json`,JSON.stringify(violations,null,2));assert.equal(violations.length,0,`axe ${t} ${id}: ${violations.map(v=>v.id)}`);}}
 await build(p,four);await confirm(p);await p.locator('[data-qa="send-brief"]').click();assert.equal(await p.getByRole('button',{name:/^Отправить запрос/}).isDisabled(),true);const violations=await p.evaluate(async()=> (await window.axe.run(document.querySelector('dialog'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);writeFileSync(`${out}/axe-dialog.json`,JSON.stringify(violations,null,2));assert.equal(violations.length,0);await p.keyboard.press('Escape');
 // User preference and system preference, separately.
 await menu(p);await p.getByRole('button',{name:'Меньше движения',exact:true}).click();await p.keyboard.press('Escape');assert.equal(await p.locator('[data-ps05]').getAttribute('data-reduced'),'true');await jump(p,'04');assert.equal(await p.locator('[data-motion-snapshot]').count(),0);await shot(p,'manual-reduced');
},{reduced:false});
await run('system-reduced',{width:390,height:844},async p=>{await start(p);assert.equal(await p.locator('[data-ps05]').getAttribute('data-reduced'),'true');await build(p,four);await confirm(p);await shot(p,'system-reduced-brief');},{reduced:true});
await run('failed-3d',{width:390,height:844},async p=>{await p.route('**/photonic-skin/**',r=>r.abort());await p.goto(base+'/?theme=light');await p.waitForSelector('[data-ps05]');await build(p,four);await confirm(p);await p.getByRole('button',{name:/Изменить запрос/}).click();await p.locator('[data-qa="brief-text"]').fill('DOM работает при недоступных 3D-ресурсах.');await shot(p,'failed-3d-brief');});
await browser.close();save();console.log(`${manifest.checks.length} checks/captures, ${manifest.errors.length} errors`);
