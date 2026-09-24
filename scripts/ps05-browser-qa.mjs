import {chromium} from 'playwright-core';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const BASE=process.env.PS05_BASE??'http://127.0.0.1:3000';
const RUN=process.env.PS05_RUN??'final';
const dir=`design/photonic-skin/ps-05/2026-09-24/${RUN}`;mkdirSync(dir,{recursive:true});
const results=[],errors=[];const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const ids=['01','02','03.1','03.2','03.3','04','05.1','05.2','05.3','05.4','05.5','05.6','05.7','06.1','06.2','06.3','07','08'];
const names=['content','design','event','games','video','digital','merch'];
const four=['event','video','digital','merch'];

async function ready(page){await page.waitForSelector('[data-ps05]',{timeout:120000});await page.waitForSelector('canvas',{timeout:90000});await page.waitForTimeout(1600)}
async function node(page,id){await page.waitForFunction(id=>document.documentElement.dataset.m4Node===id&&!document.getElementById('screen-'+id)?.inert,id,{timeout:15000});await page.waitForTimeout(450)}
async function header(page,label){const menu=page.getByRole('button',{name:'Меню',exact:true});if(await menu.isVisible())await menu.click();await page.getByRole('navigation',{name:'Разделы сайта',exact:true}).getByRole('link',{name:label,exact:true}).click()}
async function jump(page,id){
 const active=await page.evaluate(()=>document.documentElement.dataset.m4Node);
 if(active===id){await page.locator(`[id="heading-${id}"]`).scrollIntoViewIfNeeded();return;}
 const hit=page.locator(`[data-hit="${id}"]`);
 if(await hit.isVisible()&&await hit.isEnabled()){await hit.click();}
 else if(id==='01'){await page.locator('header').getByRole('link').first().click()}
 else if(id==='02'){await page.evaluate(()=>{location.hash='screen-02'})}
 else if(id.startsWith('05.')){await header(page,'Компетенции');await node(page,'05.1');if(id!=='05.1')await page.locator('[id="screen-05.1"] a').filter({hasText:({ '05.2':'Дизайн','05.3':'Event','05.4':'Игры','05.5':'Видео','05.6':'Digital','05.7':'Мерч'})[id]}).first().click()}
 else if(id.startsWith('06.')){await header(page,'Студия');await node(page,'06.1');if(id!=='06.1')await page.locator(`[id="screen-06.1"] a[href="#screen-${id}"]`).click()}
 else if(['03.1','04','07'].includes(id))await header(page,{'03.1':'Проект','04':'Кейсы','07':'Контакт'}[id]);
 else await page.evaluate(id=>{location.hash=`screen-${id}`},id);
 await node(page,id);
}
async function shot(page,name){await page.screenshot({path:`${dir}/${name}.png`});const data=await page.evaluate(()=>({width:innerWidth,height:innerHeight,theme:document.querySelector('[data-ps05]').dataset.theme,reading:document.querySelector('[data-ps05]').dataset.reading,node:document.documentElement.dataset.m4Node,canvases:document.querySelectorAll('canvas').length,overflow:document.documentElement.scrollWidth>innerWidth+1,gpu:Object.fromEntries([...document.querySelector('[data-qa="m4-canvas"]').attributes].filter(a=>/data-gpu|data-resolved|data-load|data-frame/.test(a.name)).map(a=>[a.name,a.value]))}));results.push({screenshot:`${name}.png`,...data});assert.equal(data.overflow,false,`overflow ${name}`);}
async function select(page,selected){for(const id of names)await page.locator(`[data-qa="competence-${id}"]`).setChecked(selected.includes(id));await page.waitForTimeout(800)}
async function endpoint(page,state){await page.waitForFunction(state=>{const h=document.querySelector('[data-qa="m4-canvas"]');return h?.getAttribute('data-gpu-target')===state&&Number(h?.getAttribute('data-gpu-progress'))>=.999},state,{timeout:45000})}
async function build(page,selected=four){await header(page,'Проект');await node(page,'03.1');await page.locator('[data-qa="task-engage_and_unite"]').check();assert.equal(await page.evaluate(()=>document.documentElement.dataset.m4Node),'03.1');await page.getByRole('button',{name:/^Выбрать компетенции/}).click();await node(page,'03.2');await select(page,selected);}
async function confirm(page){await page.locator('[data-qa="confirm-competencies"]').click();await node(page,'03.3')}
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:`${dir}/video`,size:{width:1440,height:900}}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`${BASE}/?review=ps05&transport=retry`);await ready(page);
 const canvas=await page.locator('canvas').elementHandle();
 await shot(page,'light-01');await build(page,[]);assert.equal(await page.locator('[data-qa="confirm-competencies"]').isDisabled(),true);await endpoint(page,'master-neutral');
 for(const selected of [['content'],['event','video'],four,names]){await select(page,selected);const state=selected.length===1?`single-${selected[0]}`:`complex-gather-${[...selected].sort().join('-')}`;await endpoint(page,state);await shot(page,`selection-${selected.length}`)}
 await select(page,four);await endpoint(page,'complex-gather-digital-event-merch-video');
 const thesis=page.locator('[id="screen-03.2"]').getByRole('button',{name:'Организация мероприятия',exact:true});await thesis.click();assert.equal(await page.locator('[id="screen-03.2"] input:checked').count(),4);await shot(page,'work-expanded');await thesis.click();
 await confirm(page);await endpoint(page,'complex-drive-digital-event-merch-video');await shot(page,'generated-brief');
 await page.locator('[data-qa="brief-text"]').fill('Тестовый ручной текст. Не терять при изменении состава.');await page.getByRole('button',{name:'Изменить состав',exact:true}).click();await node(page,'03.2');await select(page,['content','design']);await confirm(page);assert.match(await page.locator('[data-qa="brief-text"]').inputValue(),/Тестовый ручной/);
 await page.getByRole('button',{name:'Обновить по выбору',exact:true}).click();assert.doesNotMatch(await page.locator('[data-qa="brief-text"]').inputValue(),/Тестовый ручной/);await page.getByRole('button',{name:'Восстановить предыдущий текст',exact:true}).click();assert.match(await page.locator('[data-qa="brief-text"]').inputValue(),/Тестовый ручной/);
 await page.getByRole('button',{name:'Изменить состав',exact:true}).click();await node(page,'03.2');await select(page,[]);assert.equal(await page.locator('[data-qa="confirm-competencies"]').isDisabled(),true);await jump(page,'03.3');assert.match(await page.locator('[data-qa="brief-text"]').inputValue(),/Тестовый ручной/);
 await page.locator('[data-qa="send-brief"]').click();let dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:/Отправить тестовый/}).click();assert.ok(await dialog.locator('[aria-invalid="true"]').count());await dialog.getByLabel('Как вас зовут').fill('Тестовый посетитель');await dialog.getByLabel('Телефон или Telegram',{exact:true}).fill('@test_ps05');
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('dialog')),true);
 const before=await page.locator('[data-qa="m4-canvas"]').getAttribute('data-resolved-state');await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.locator('[data-qa="send-brief"]').evaluate(el=>el===document.activeElement),true);
 await page.locator('[data-qa="send-brief"]').click();dialog=page.getByRole('dialog');assert.equal(await dialog.getByLabel('Как вас зовут').inputValue(),'Тестовый посетитель');await dialog.getByRole('button',{name:/Отправить тестовый/}).click();await page.getByRole('alert').waitFor();await shot(page,'contact-error');await dialog.getByRole('button',{name:/Отправить тестовый/}).dblclick();await page.getByRole('heading',{name:'Тестовый запрос принят'}).waitFor();assert.equal(await page.locator('[data-qa="m4-canvas"]').getAttribute('data-resolved-state'),before);await shot(page,'contact-success');await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 await build(page,four);await confirm(page);if(await page.getByRole('button',{name:'Обновить по выбору',exact:true}).isVisible())await page.getByRole('button',{name:'Обновить по выбору',exact:true}).click();
 // All 18 logical screens, both themes. No business state injected into a store.
 for(const theme of ['light','dark']){if(theme==='dark')await page.getByRole('button',{name:'Тёмная тема',exact:true}).click();for(const id of ids){await jump(page,id);await page.waitForTimeout(400);if(id!=='08')await endpoint(page,await page.locator('[data-qa="m4-canvas"]').getAttribute('data-resolved-state'));await shot(page,`${theme}-${id}`)}}
 assert.equal(await canvas.evaluate(el=>el===document.querySelector('canvas')),true);results.push({check:'persistent Canvas',pass:true});
 // Rapid direct jump / reversal through real header actions.
 await header(page,'Компетенции');await header(page,'Кейсы');await header(page,'Проект');await node(page,'03.1');await page.waitForTimeout(1500);assert.equal(await page.locator('[data-motion-snapshot]').count(),0);
 // Same case with ordinary and shared-cover transitions, URL, history, focus.
 for(const variant of ['A','B']){
  await page.goto(`${BASE}/?review=ps05&caseMotion=${variant}#screen-04`);await ready(page);await node(page,'04');await page.getByRole('button',{name:/Открыть: От идеи/}).click();await page.getByRole('dialog').waitFor();await page.waitForTimeout(600);await shot(page,`case-${variant}`);assert.match(page.url(),/case=layout-study/);await page.goBack();await page.getByRole('dialog').waitFor({state:'detached'});await page.goForward();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Закрыть',exact:true}).click();await page.waitForTimeout(450);assert.equal(await page.locator('[data-transition-cover]').count(),0);
 }
 const mainVideo=page.video();await context.close();await mainVideo.saveAs(`${dir}/desktop-flow-and-cases.webm`);
 // Responsive matrix, with natural reading, touch emulation and reduced motion.
 for(const [label,width,height,motion] of [['mobile',390,844,'no-preference'],['narrow',360,800,'no-preference'],['reflow',320,800,'reduce'],['landscape',844,390,'no-preference'],['short',1280,720,'no-preference']]){
  const ctx=await browser.newContext({viewport:{width,height},isMobile:width<1100,hasTouch:width<1100,reducedMotion:motion,recordVideo:label==='mobile'?{dir:`${dir}/video`,size:{width,height}}:undefined});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(`${BASE}/?review=ps05&transport=success`);await ready(p);await shot(p,`${label}-01`);await build(p,names);await shot(p,`${label}-03.2`);await p.locator('[data-qa="confirm-competencies"]').scrollIntoViewIfNeeded();await p.waitForTimeout(350);await shot(p,`${label}-03.2-lower`);await confirm(p);await shot(p,`${label}-03.3`);await p.locator('[data-qa="send-brief"]').click();await shot(p,`${label}-contact`);await p.keyboard.press('Escape');await jump(p,'05.7');await shot(p,`${label}-05.7`);await jump(p,'04');await p.getByRole('button',{name:/Открыть: От идеи/}).click();await shot(p,`${label}-case`);await p.keyboard.press('Escape');await p.waitForTimeout(300);await jump(p,'08');await shot(p,`${label}-08`);
  if(label==='mobile'){await header(p,'Проект');await node(p,'03.1');const menu=p.getByRole('button',{name:'Меню',exact:true});await menu.click();await p.getByRole('button',{name:'Тёмная тема',exact:true}).click();await p.getByRole('button',{name:'Закрыть меню',exact:true}).click();for(const id of ['01','03.1','03.2','03.3','05.1','08']){await jump(p,id);await shot(p,`mobile-dark-${id}`)}const video=p.video();await ctx.close();await video.saveAs(`${dir}/mobile-flow.webm`);}else await ctx.close();
 }
 // Actual DOM accessibility audit, degraded WebGL and loading independence.
 const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const p=await ctx.newPage();await p.goto(BASE);await ready(p);await p.addScriptTag({content:readFileSync('node_modules/axe-core/axe.min.js','utf8')});
 const axe=await p.evaluate(async()=>await window.axe.run(document.querySelector('[data-ps05]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));writeFileSync(`${dir}/axe.json`,JSON.stringify(axe.violations,null,2));results.push({check:'axe',violations:axe.violations.map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.length}))});
 await build(p,four);await confirm(p);await shot(p,'reduced-brief');await p.getByRole('button',{name:'Скопировать текст',exact:true}).click();await p.getByRole('status').filter({hasText:'Скопировано'}).waitFor({timeout:5000}).catch(()=>{});
 await p.locator('[data-qa="send-brief"]').click();assert.equal(await p.getByRole('button',{name:/^Отправить запрос/}).isDisabled(),true);await shot(p,'transport-unavailable');await ctx.close();
 const failed=await browser.newContext({viewport:{width:390,height:844}});const f=await failed.newPage();await f.route('**/photonic-skin/**',route=>route.abort());await f.goto(BASE);await f.waitForSelector('[data-ps05]');await header(f,'Проект');await node(f,'03.1');await shot(f,'unavailable-3d');await failed.close();
 console.log(`PASS: ${results.length} captures/checks; runtime errors ${errors.length}`);
}catch(error){errors.push(String(error.stack??error));console.error(error);process.exitCode=1;}
finally{writeFileSync(`${dir}/manifest.json`,JSON.stringify({date:new Date().toISOString(),base:BASE,results,errors},null,2));await browser.close();}



