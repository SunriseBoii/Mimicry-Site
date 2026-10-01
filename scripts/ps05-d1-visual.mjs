import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.PS05_BASE??'http://127.0.0.1:3002';
const out=`design/photonic-skin/ps-05-d1/${process.env.PS05_RUN??'iteration-1'}`;mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:1840,height:944}});const checks=[],errors=[];
p.on('pageerror',e=>errors.push(e.message));
async function ready(id){await p.waitForFunction(id=>{const c=document.querySelector(`[id="screen-${id}"] [data-ps05-copy]`);return document.documentElement.dataset.m4Node===id&&c&&!c.inert&&Number(getComputedStyle(c).opacity)>.999&&!document.querySelector('[data-motion-snapshot]')},id,{timeout:30000});await p.waitForTimeout(500)}
async function shot(name){await p.screenshot({path:`${out}/${name}.png`});checks.push({name,...await p.evaluate(()=>({node:document.documentElement.dataset.m4Node,reading:document.querySelector('[data-ps05]').dataset.reading,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,canvas:document.querySelectorAll('canvas').length,bg:getComputedStyle(document.querySelector('[data-ps05]')).backgroundColor}))});}
try{
 await p.goto(base+'/?review=ps05&theme=light');await p.waitForSelector('canvas',{timeout:90000});await p.waitForTimeout(3000);
 await p.getByRole('button',{name:/^Собрать проект Начнём/}).click();await ready('03.1');await p.locator('[data-qa="task-engage_and_unite"]').check();await p.getByRole('button',{name:/^Выбрать компетенции/}).click();await ready('03.2');for(const id of ['event','video','digital','merch'])await p.locator(`[data-qa="competence-${id}"]`).check();await p.waitForTimeout(1500);await shot('selection-4');await p.locator('[data-qa="confirm-competencies"]').click();await ready('03.3');
 for(const theme of ['light','dark']){
  if(theme==='dark'){await p.getByRole('button',{name:'Меню',exact:true}).click();await p.getByRole('button',{name:'Тёмная тема',exact:true}).click();await p.keyboard.press('Escape');}
  for(const id of ['01','02','03.1','03.2','03.3','04','05.1','05.2','05.3','05.4','05.5','05.6','05.7','06.1','06.2','06.3','07','08']){await p.evaluate(id=>{location.hash=`screen-${id}`},id);await ready(id);await p.waitForTimeout(800);await shot(`${theme}-${id}`);}
 }
 await p.setViewportSize({width:390,height:844});await p.goto(base+'/?theme=light');await p.waitForSelector('canvas');await p.waitForTimeout(2500);await shot('mobile-01');await p.getByRole('button',{name:/^Собрать проект Начнём/}).click();await ready('03.1');await shot('mobile-03.1');
}catch(e){errors.push(e.stack);await p.screenshot({path:`${out}/failure.png`});process.exitCode=1}finally{writeFileSync(`${out}/manifest.json`,JSON.stringify({base,checks,errors},null,2));await b.close();}
