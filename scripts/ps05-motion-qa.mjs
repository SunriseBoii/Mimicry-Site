import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.PS05_BASE??'http://127.0.0.1:3006';
const out=`design/photonic-skin/ps-05-motion-01/${process.env.PS05_RUN??'final'}`;mkdirSync(out,{recursive:true});
const b=await chromium.launch({...(process.env.PS05_BROWSER==='chromium'?{executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium-1234/chrome-win64/chrome.exe'}:{channel:'msedge'}),headless:true,ignoreDefaultArgs:['--hide-scrollbars'],args:['--disable-features=OverlayScrollbar','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const manifest={browser:b.version(),base,build:readFileSync('.next/BUILD_ID','utf8').trim(),checks:[],errors:[]};
const save=()=>writeFileSync(`${out}/manifest.json`,JSON.stringify(manifest,null,2));
const sample=p=>p.evaluate(()=>{const d=document.documentElement.dataset;return {active:d.m4Node,target:d.sceneTarget,preview:d.scenePreview,selecting:d.sceneSelecting,arrival:+d.sceneArrival,p:+d.pageProgress,reading:+d.sceneReading,y:scrollY,actor:window.__PS04M5_LAB__?.composition()}});
async function settled(p,id){await p.waitForFunction(id=>{const d=document.documentElement.dataset;return d.m4Node===id&&!d.sceneTarget&&+getComputedStyle(document.querySelector(`[id="screen-${id}"] [data-ps05-copy]`)).opacity===1},id,{timeout:15000});}
async function jump(p,id){await p.locator(`[data-hit="${id}"]`).click();await settled(p,id);}
async function start(p,id='01',theme='light',params=''){await p.goto(`${base}/?theme=${theme}${params}#screen-${id}`);await settled(p,id);await p.waitForTimeout(1400);}
async function shot(p,name){await p.screenshot({path:`${out}/${name}.png`});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow');manifest.checks.push({name,...await sample(p)});save();}
async function trace(p){await p.evaluate(()=>{window.motionTrace=[];window.recordMotion=true;const start=performance.now();const frame=()=>{const d=document.documentElement.dataset;window.motionTrace.push({t:performance.now()-start,active:d.m4Node,target:d.sceneTarget,preview:d.scenePreview,selecting:d.sceneSelecting,p:+d.pageProgress,y:scrollY,arrival:+d.sceneArrival,actor:window.__PS04M5_LAB__?.composition(),gpu:{...document.querySelector('[data-qa="m4-canvas"]')?.dataset},geometry:window.__PS04M5_LAB__?.geometrySnapshot(),transaction:window.__PS04M5_LAB__?.transaction(),copies:[...document.querySelectorAll('[data-ps05-copy]')].map(e=>{const h=e.querySelector('h1,h2');return {id:e.closest('[data-node]').dataset.node,opacity:+e.style.opacity,transform:getComputedStyle(e).transform,font:getComputedStyle(h).fontSize,heading:h.getBoundingClientRect().toJSON(),rect:e.getBoundingClientRect().toJSON(),wave:h.dataset.wave,band:h.style.getPropertyValue('--band-start')}})});if(window.recordMotion)requestAnimationFrame(frame)};frame()});}
async function saveTrace(p,name){await p.evaluate(()=>window.recordMotion=false);const rows=await p.evaluate(()=>window.motionTrace);writeFileSync(`${out}/${name}.json`,JSON.stringify(rows));return rows;}
async function run(name,size,fn,options={}){
 if(process.env.PS05_ONLY&&!process.env.PS05_ONLY.split(',').some(x=>name.startsWith(x)))return;
 const ctx=await b.newContext({viewport:size,isMobile:size.width<=600,hasTouch:size.width<=600,reducedMotion:options.reduced?'reduce':'no-preference',recordVideo:{dir:out,size}}),p=await ctx.newPage();
 p.on('pageerror',e=>manifest.errors.push({name,error:e.message}));
 try{await fn(p,ctx);if(name!=='webgl-failure')assert.equal(await p.locator('canvas').count(),1);manifest.checks.push({name,pass:true});console.log('PASS',name);}
 catch(e){manifest.errors.push({name,error:e.stack,state:await sample(p),events:await p.evaluate(()=>window.debugEvents)});await p.screenshot({path:`${out}/${name}-failure.png`});console.error('FAIL',name,e.message);process.exitCode=1;}
 finally{const v=p.video();await ctx.close();await v.saveAs(`${out}/${name}.webm`);save();}
}
async function dragStart(p){
 const g=await p.evaluate(()=>{const h=innerHeight,track=h-34,thumb=Math.max(20,h/document.documentElement.scrollHeight*track);return {x:innerWidth-7,y:17+(track-thumb)*scrollY/(document.documentElement.scrollHeight-h)+thumb/2,track,thumb,max:document.documentElement.scrollHeight-h,h}});
 assert.ok(await p.evaluate(()=>innerWidth-document.documentElement.clientWidth)>0,'native scrollbar must be physically present');
 await p.mouse.move(g.x,g.y);await p.mouse.down();return g;
}
async function dragY(p,g,scrollPosition,steps=16){await p.mouse.move(g.x,17+(g.track-g.thumb)*scrollPosition/g.max+g.thumb/2,{steps});}
async function ranges(p){return p.evaluate(()=>{let y=0;return [...document.querySelectorAll('[data-ps05] [data-node]')].map(e=>{const r={id:e.dataset.node,start:y,length:Math.max(innerHeight,e.offsetHeight)};y+=r.length;return r})});}
async function show(p,selector){
 for(let i=0;i<24;i++){
  const r=await p.locator(selector).boundingBox();const h=p.viewportSize().height;
  if(r&&r.y>=155&&r.y+r.height<h-20)return;
  await p.mouse.move(250,Math.min(500,h-80));await p.mouse.wheel(0,r&&r.y<155?-180:180);await p.waitForTimeout(70);
 }
 throw Error(`Could not read to ${selector}`);
}
async function touch(ctx,p,from,to,cancel=false){const c=await ctx.newCDPSession(p);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from[0],y:from[1]}]});for(let i=1;i<=5;i++){await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from[0]+(to[0]-from[0])*i/5,y:from[1]+(to[1]-from[1])*i/5}]});await p.waitForTimeout(20)}await c.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await c.detach();}

await run('keys',{width:1440,height:900},async p=>{
 await start(p,'04');await trace(p);const canvas=await p.locator('canvas').elementHandle();
 await p.keyboard.press('ArrowDown');await settled(p,'05.1');await p.waitForTimeout(1050);await p.keyboard.press('ArrowUp');await settled(p,'04');
 await p.keyboard.down('ArrowDown');for(let i=0;i<14;i++){await p.waitForTimeout(65);await p.keyboard.down('ArrowDown');}await p.keyboard.up('ArrowDown');await settled(p,'05.1');await p.waitForTimeout(250);assert.equal((await sample(p)).active,'05.1');
 await p.keyboard.press('ArrowDown');await settled(p,'05.2');await p.keyboard.press('ArrowUp');await settled(p,'05.1');
 assert.equal(await canvas.evaluate(e=>e===document.querySelector('canvas')),true);
 const frames=await saveTrace(p,'keys');
 for(const id of ['04','05.1','05.2']){const f=frames.flatMap(r=>r.copies.filter(c=>c.id===id&&c.opacity>0));assert.equal(new Set(f.map(c=>c.font)).size,1,`${id} font flash`);assert.ok(f.every(c=>/^matrix\(1, 0, 0, 1,/.test(c.transform)),`${id} scale`);}
 const outFrames=frames.filter(r=>r.target==='05.1'&&r.active==='04'&&r.p>0&&r.p<.4).map(r=>r.copies.find(c=>c.id==='04'));
 assert.ok(outFrames.length>2);assert.ok(outFrames.at(-1).rect.y<outFrames[0].rect.y-25,'noticeable outgoing travel');
 assert.ok(frames.some(r=>r.p>=.4&&r.p<1&&r.target==='05.1'&&r.copies.find(c=>c.id==='04').opacity===0));
 await shot(p,'keys-final');
});
await run('wheel',{width:1440,height:900},async p=>{
 await start(p,'04');await trace(p);await p.mouse.move(700,700);const y=(await sample(p)).y;
 await p.mouse.wheel(0,10);await p.waitForTimeout(50);await p.mouse.wheel(0,-15);await p.waitForTimeout(70);assert.equal((await sample(p)).y,y);assert.equal((await sample(p)).target,'');
 await p.waitForTimeout(230);for(let i=0;i<6;i++){await p.mouse.wheel(0,9);await p.waitForTimeout(30)}await settled(p,'05.1');
 await p.waitForTimeout(220);await p.mouse.wheel(0,180);for(let i=0;i<42;i++){await p.mouse.wheel(0,Math.max(1,45-i));await p.waitForTimeout(25)}await settled(p,'05.2');assert.equal((await sample(p)).active,'05.2');
 await p.waitForTimeout(230);await p.mouse.wheel(0,80);await settled(p,'05.3');await p.waitForTimeout(1000);assert.equal((await sample(p)).active,'05.3');
 await saveTrace(p,'wheel');await shot(p,'wheel-final');
});
await run('scrollbar-slow',{width:1440,height:900},async p=>{
 await start(p,'04');await trace(p);const list=await ranges(p),dest=list.find(r=>r.id==='05.6'),original=await sample(p),originalUrl=p.url(),historyLength=await p.evaluate(()=>history.length),g=await dragStart(p);
 await dragY(p,g,dest.start+dest.length*.4,40);await p.waitForTimeout(1300);const held=await sample(p);assert.equal(held.active,'04');assert.equal(held.target,'');assert.equal(held.preview,'05.6');assert.equal(held.arrival,original.arrival);assert.equal(p.url(),originalUrl);assert.equal(await p.evaluate(()=>history.length),historyLength);assert.equal(held.actor.cssCenterX,original.actor.cssCenterX);assert.equal(held.actor.cssSize,original.actor.cssSize);await shot(p,'scrollbar-held');
 await p.mouse.up();await settled(p,'05.6');const released=await sample(p);await p.waitForTimeout(600);assert.equal((await sample(p)).y,released.y);await saveTrace(p,'scrollbar-slow');await shot(p,'scrollbar-slow-final');
});
await run('scrollbar-fast',{width:1440,height:900},async p=>{
 await start(p,'01');await trace(p);let list=await ranges(p),g=await dragStart(p);let dest=list.find(r=>r.id==='07');await dragY(p,g,dest.start+dest.length*.5,1);await p.mouse.up();await settled(p,'07');assert.equal((await sample(p)).arrival,2);await shot(p,'scrollbar-fast-final');
 // Return the thumb to its original range: no arrival, no wave restart.
 let before=await sample(p);g=await dragStart(p);await dragY(p,g,list.find(r=>r.id==='05.2').start+400);await dragY(p,g,before.y);await p.mouse.up();await p.waitForTimeout(900);assert.equal((await sample(p)).arrival,before.arrival);
 // Start a graph exchange, take the native thumb and release a different final choice.
 await p.locator('[data-hit="04"]').click();await p.waitForTimeout(80);g=await dragStart(p);dest=list.find(r=>r.id==='06.3');await dragY(p,g,dest.start+350,1);await p.mouse.up();await settled(p,'06.3');
 await saveTrace(p,'scrollbar-fast');await shot(p,'scrollbar-during-transition');
});
await run('graph-wave-dark',{width:1440,height:900},async p=>{
 await start(p,'01','dark');await trace(p);const a=(await sample(p)).arrival;assert.equal(await p.locator('[data-hit="03.2"]').isDisabled(),true);
 await p.locator('[data-hit="01"]').click();await p.waitForTimeout(1050);assert.equal((await sample(p)).arrival,a);
 await p.locator('[data-hit="05.7"]').click();await p.waitForTimeout(70);await p.locator('[data-hit="02"]').click();await settled(p,'05.7');
 await p.waitForTimeout(450);assert.ok(await p.locator('[data-wave="true"]').count());await shot(p,'wave-solid-band');
 await p.locator('[data-hit="04"]').click();await settled(p,'04');await p.waitForTimeout(1200);assert.equal(await p.locator('[data-wave="true"]').count(),0);
 await p.goBack();await settled(p,'05.7');await p.goForward();await settled(p,'04');
 const rows=await saveTrace(p,'graph-wave-dark');assert.ok(rows.every(r=>['01','05.7','04'].includes(r.active)));await shot(p,'graph-final');
});
await run('wave-pass',{width:1440,height:900},async p=>{
 await start(p,'04');await trace(p);await jump(p,'05.1');await p.waitForTimeout(1250);await shot(p,'wave-pass-complete');await p.waitForTimeout(500);
 const rows=await saveTrace(p,'wave-pass');const active=rows.filter(r=>r.active==='05.1'&&!r.target),waves=active.filter(r=>r.copies.find(c=>c.id==='05.1').wave==='true');
 assert.ok(waves.length>10);assert.ok(waves.at(-1).t-waves[0].t>700);assert.ok(active.every(r=>r.copies.find(c=>c.id==='05.1').opacity===1));assert.equal(new Set(active.map(r=>r.copies.find(c=>c.id==='05.1').transform)).size,1);assert.equal(await p.locator('[data-wave="true"]').count(),0);
});
await run('reduced',{width:1280,height:720},async p=>{
 await start(p,'04','dark');await trace(p);await p.keyboard.press('ArrowDown');await settled(p,'05.1');await p.keyboard.press('ArrowUp');await settled(p,'04');await p.waitForTimeout(1200);
 const rows=await saveTrace(p,'reduced');assert.ok(rows.every(r=>r.copies.every(c=>c.transform==='matrix(1, 0, 0, 1, 0, 0)'||c.opacity===0)));assert.equal(await p.locator('[data-wave="true"]').count(),0);await shot(p,'reduced-final');
},{reduced:true});
for(const [width,height] of [[1440,900],[1280,720],[390,844],[320,844]])await run(`regression-${width}`,{width,height},async(p,ctx)=>{
 await start(p,'03.1','light','&review=ps05&transport=retry');const canvas=await p.locator('canvas').elementHandle();
 await p.locator('[data-qa="task-engage_and_unite"]').check();await p.keyboard.press('ArrowDown');assert.equal((await sample(p)).active,'03.1');
 await show(p,'[id="screen-03.1"] button');await p.getByRole('button',{name:/^Выбрать компетенции/}).click();await settled(p,'03.2');
 await p.locator('[data-qa="competence-content"]').check();await p.locator('[data-qa="competence-design"]').check();await show(p,'[data-qa="confirm-competencies"]');await p.locator('[data-qa="confirm-competencies"]').click();await settled(p,'03.3');
 await p.getByRole('button',{name:/Изменить запрос/}).click();await p.locator('[data-qa="brief-text"]').fill(`Ручной бриф MOTION ${width}\nВторая строка`);await p.keyboard.press('ArrowUp');assert.equal((await sample(p)).active,'03.3');await p.getByRole('button',{name:/Готово/}).click();await p.reload();await settled(p,'03.3');assert.match(await p.locator('[data-qa="brief-reading"]').innerText(),/Ручной бриф MOTION/);await shot(p,`${width}-brief-reload`);
 await show(p,'[data-qa="send-brief"]');await p.locator('[data-qa="send-brief"]').click();const dialog=p.getByRole('dialog');await dialog.getByRole('button',{name:/Отправить тестовый/}).click();assert.ok(await dialog.locator('[aria-invalid="true"]').count());await dialog.getByLabel('Как вас зовут').fill('Тест MOTION');await dialog.getByLabel('Телефон или Telegram',{exact:true}).fill('@motion_test');await dialog.getByRole('button',{name:/Отправить тестовый/}).click();await p.getByRole('alert').waitFor();await dialog.getByRole('button',{name:/Отправить тестовый/}).click();await p.getByRole('heading',{name:'Тестовый запрос принят'}).waitFor();await p.getByRole('button',{name:'Закрыть',exact:true}).click();
 await jump(p,'04');await p.getByRole('button',{name:/Открыть: От идеи/}).click();await p.getByRole('dialog').waitFor();await p.goBack();await p.getByRole('dialog').waitFor({state:'detached'});await p.goForward();await p.getByRole('dialog').waitFor();await p.keyboard.press('Escape');
 for(const theme of ['light','dark']){
  if(theme==='dark'){await p.locator('button[aria-controls="ps05-nav"]').click();await p.getByRole('button',{name:'Тёмная тема',exact:true}).click();await p.keyboard.press('Escape');}
  for(const id of ['01','03.1','03.2','03.3','05.1','05.7','07','08']){await jump(p,id);await p.waitForTimeout(1050);await shot(p,`${width}-${theme}-${id}`);}
 }
 assert.equal(await canvas.evaluate(e=>e.isConnected).catch(()=>false),false,'reload intentionally replaces document canvas');assert.equal(await p.locator('canvas').count(),1);
 if(width<=390){
  await p.evaluate(()=>{window.debugEvents=[];for(const name of ['click','scroll','scrollend','touchend'])addEventListener(name,e=>window.debugEvents.push({name,t:performance.now(),hit:e.target?.closest?.('[data-hit]')?.dataset.hit,node:document.documentElement.dataset.m4Node,target:document.documentElement.dataset.sceneTarget,selecting:document.documentElement.dataset.sceneSelecting,y:scrollY}),true)});
  await jump(p,'03.1');await touch(ctx,p,[200,500],[200,489],true);assert.equal((await sample(p)).active,'03.1');
  await touch(ctx,p,[200,620],[200,300]);assert.equal((await sample(p)).active,'03.1','long section reads first');
  for(let i=0;i<6;i++)await touch(ctx,p,[200,620],[200,280]);await p.waitForFunction(()=>!document.documentElement.dataset.sceneTarget);
  await jump(p,'01');await p.setViewportSize({width:844,height:390});await settled(p,'01');await shot(p,`${width}-landscape`);
 }
});
await run('touch-boundary',{width:390,height:844},async(p,ctx)=>{
 await start(p,'03.1');await trace(p);await p.locator('[data-qa="task-engage_and_unite"]').tap();assert.equal(await p.locator('[data-qa="task-engage_and_unite"]').isChecked(),true);
 // Read to the bottom, then use one distinct swipe to leave.
 const list=await ranges(p),s=list.find(r=>r.id==='03.1');
 while((await sample(p)).reading<s.length-844-1){await touch(ctx,p,[300,640],[300,300]);}
 assert.equal((await sample(p)).active,'03.1');await touch(ctx,p,[300,640],[300,300]);await settled(p,'03.2');await saveTrace(p,'touch-boundary');await shot(p,'touch-boundary-final');
});
await run('webgl-failure',{width:390,height:844},async p=>{
 await p.route('**/photonic-skin/**',r=>r.abort());await start(p,'01');await jump(p,'03.1');await p.locator('[data-qa="task-engage_and_unite"]').check();await jump(p,'03.2');await p.locator('[data-qa="competence-design"]').check();await show(p,'[data-qa="confirm-competencies"]');await p.locator('[data-qa="confirm-competencies"]').click();await settled(p,'03.3');await p.getByRole('button',{name:/Изменить запрос/}).click();await p.locator('[data-qa="brief-text"]').fill('DOM доступен без WebGL');await shot(p,'webgl-failure-editing');
});
await b.close();save();console.log(manifest.checks.length,'checks',manifest.errors.length,'errors');
