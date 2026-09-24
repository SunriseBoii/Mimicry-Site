import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const dir=`design/photonic-skin/ps-05-r1/2026-09-24/${process.env.PS05_RUN??'baseline-anchor'}`;
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const ctx=await browser.newContext({viewport:{width:1840,height:944},reducedMotion:'no-preference',recordVideo:{dir:dir+'/video',size:{width:1840,height:944}}});
const p=await ctx.newPage();const errors=[],actions=[];p.on('pageerror',e=>errors.push(e.message));
await ctx.tracing.start({screenshots:true,snapshots:true});
async function state(){return p.evaluate(()=>({node:document.documentElement.dataset.m4Node,y:scrollY,root:{...document.querySelector('[data-ps05]').dataset},motion:matchMedia('(prefers-reduced-motion: reduce)').matches,progress:window.__PS04M5_LAB__?.progress(),composition:window.__PS04M5_LAB__?.composition(),cards:[...document.querySelectorAll('[name="project-task"]')].map(el=>{const r=el.getBoundingClientRect();return {qa:el.dataset.qa,checked:el.checked,inert:!!el.closest('[inert]'),rect:r.toJSON(),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,350)}})}))}
async function record(label,fn){actions.push({label,start:await p.evaluate(()=>performance.now()),before:await state()});await fn();await p.waitForTimeout(1100);Object.assign(actions.at(-1),{after:await state()});console.log(label,actions.at(-1).after.node,actions.at(-1).after.y)}
try{
await p.goto('http://127.0.0.1:3001/');await p.waitForSelector('[data-ps05]');await p.waitForSelector('canvas');await p.waitForTimeout(2200);
await p.evaluate(()=>{window.r1samples=[];window.r1events=[];for(const type of ['pointerdown','click','change'])document.addEventListener(type,e=>window.r1events.push({t:performance.now(),type,target:e.target.outerHTML.slice(0,240)}),true);function tick(){const lab=window.__PS04M5_LAB__;window.r1samples.push({t:performance.now(),y:scrollY,node:document.documentElement.dataset.m4Node,c:lab?.composition(),texts:[...document.querySelectorAll('[data-ps05-copy],[data-motion-snapshot]')].map(el=>{let opacity=1;for(let parent=el;parent;parent=parent.parentElement)opacity*=Number(getComputedStyle(parent).opacity);const r=el.getBoundingClientRect();return {id:el.closest('[data-node]')?.dataset.node??'snapshot',opacity,x:r.x,y:r.y,w:r.width,h:r.height,inert:!!el.closest('[inert]')}})});window.r1raf=requestAnimationFrame(tick)}tick()});
await p.mouse.move(900,800);
await record('wheel to 02',()=>p.mouse.wheel(0,946));
await record('wheel lands exactly on visible 03.1',async()=>{const delta=await p.evaluate(()=>1888-scrollY);await p.mouse.wheel(0,delta)});
await p.screenshot({path:dir+'/wheel-arrival.png'});
for(let i=0;i<4;i++)await record('coordinate card '+i,async()=>{const r=await p.locator('[name="project-task"]').nth(i).boundingBox();if(r&&r.y>80&&r.y+r.height<944)await p.mouse.click(r.x+r.width/2,r.y+r.height/2)});
await p.screenshot({path:dir+'/after-clicks.png'});
if(process.env.PS05_CARDS_ONLY)throw new Error('Cards-only diagnostic completed');
await record('header cases',()=>p.getByRole('navigation',{name:'Разделы сайта',exact:true}).getByRole('link',{name:'Кейсы',exact:true}).click());
await record('graph 05.1',()=>p.locator('[data-hit="05.1"]').click());
await record('graph 04',()=>p.locator('[data-hit="04"]').click());
for(let i=0;i<4;i++)await record('boundary wheel 240 '+i,()=>p.mouse.wheel(0,240));
await record('direct Merch',()=>p.locator('[id="screen-05.1"] a[href="#screen-05.7"]').click());
await record('graph 06.1',()=>p.locator('[data-hit="06.1"]').click());
await record('graph 05.7',()=>p.locator('[data-hit="05.7"]').click());
}catch(e){errors.push(String(e));console.error(e)}finally{
const data=await p.evaluate(()=>({samples:window.r1samples,events:window.r1events,buttons:[...document.querySelectorAll('button')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.y>=0&&r.bottom<=innerHeight}).map(el=>({text:el.textContent,label:el.getAttribute('aria-label')}))}));
writeFileSync(dir+'/trace.json',JSON.stringify({date:new Date().toISOString(),build:readFileSync('.next/BUILD_ID','utf8').trim(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--short'],{encoding:'utf8'}),url:p.url(),browser:browser.version(),viewport:p.viewportSize(),actions,errors,...data},null,2));
await ctx.tracing.stop({path:dir+'/browser-trace.zip'});const video=p.video();await ctx.close();await video.saveAs(dir+'/before-fixes.webm');await browser.close();console.log(JSON.stringify({errors}));
}
