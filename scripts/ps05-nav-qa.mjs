import {chromium} from 'playwright-core';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.PS05_BASE??'http://127.0.0.1:3007',out=`design/photonic-skin/ps-05-nav-01/${process.env.PS05_RUN??'ready'}`;
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,ignoreDefaultArgs:['--hide-scrollbars'],args:['--disable-features=OverlayScrollbar','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const manifest={browser:browser.version(),base,build:readFileSync('.next/BUILD_ID','utf8').trim(),checks:[],errors:[]};
const ids=['01','02','03.1','03.2','03.3','04','05.1','05.2','05.3','05.4','05.5','05.6','05.7','06.1','06.2','06.3','07','08'];
const save=()=>writeFileSync(`${out}/manifest.json`,JSON.stringify(manifest,null,2));
const sample=p=>p.evaluate(()=>{const d=document.documentElement.dataset,g=document.querySelector('[data-qa="m4-graph"]'),a=window.__PS04M5_LAB__?.composition(),gpu=document.querySelector('[data-qa="m4-canvas"]')?.dataset;return {displayed:d.m4Node,preview:d.scenePreview,target:d.sceneTarget,arrival:+d.sceneArrival,selecting:d.sceneSelecting,center:g.dataset.center,expanded:g.dataset.expanded,provisional:g.dataset.provisional,y:scrollY,hash:location.hash,history:history.length,brief:JSON.stringify(localStorage),actor:a?{x:a.cssCenterX,y:a.cssCenterY,size:a.cssSize,source:gpu?.gpuSource,target:gpu?.gpuTarget,progress:gpu?.gpuProgress}:null};});
async function settled(p,id){await p.waitForFunction(id=>{const d=document.documentElement.dataset;return d.m4Node===id&&!d.sceneTarget&&document.querySelector('[data-qa="m4-graph"]').dataset.center===id},id,{timeout:18000});}
async function start(p,id='01',theme='light'){await p.goto(`${base}/?theme=${theme}#screen-${id}`);await settled(p,id);await p.waitForFunction(()=>{const g=document.querySelector('[data-qa="m4-canvas"]')?.dataset;return g?.loadStatus==='ready'&&Number(g.firstVisibleMs)>0;},{},{timeout:20000});await p.waitForTimeout(300);}
async function full(p){if(await p.getByRole('button',{name:'Показать всю карту',exact:true}).count())await p.getByRole('button',{name:'Показать всю карту',exact:true}).click();await p.waitForTimeout(240);}
async function jump(p,id){if(!await p.locator(`[data-hit="${id}"]`).count())await full(p);await p.locator(`[data-hit="${id}"]`).click();await settled(p,id);await p.waitForTimeout(230);}
async function shot(p,name){await p.screenshot({path:`${out}/${name}.png`});}
async function trace(p){await p.evaluate(()=>{window.navFrames=[];window.navRecord=true;const start=performance.now();const frame=()=>{const d=document.documentElement.dataset,g=document.querySelector('[data-qa="m4-graph"]');window.navFrames.push({t:performance.now()-start,displayed:d.m4Node,preview:d.scenePreview,target:d.sceneTarget,arrival:+d.sceneArrival,center:g.dataset.center,provisional:g.dataset.provisional,selecting:d.sceneSelecting,p:+d.pageProgress,y:scrollY,hash:location.hash});if(window.navRecord)requestAnimationFrame(frame);};frame();});}
async function endTrace(p,name){await p.evaluate(()=>window.navRecord=false);const rows=await p.evaluate(()=>window.navFrames);writeFileSync(`${out}/${name}.json`,JSON.stringify(rows));return rows;}
async function run(name,width,height,fn,options={}){
 if(process.env.PS05_ONLY&&!process.env.PS05_ONLY.split(',').some(x=>name.startsWith(x)))return;
 const ctx=await browser.newContext({viewport:{width,height},hasTouch:width<600,isMobile:width<600,reducedMotion:options.reduced?'reduce':'no-preference',...(options.video?{recordVideo:{dir:out,size:{width,height}}}:{})}),p=await ctx.newPage();
 p.on('pageerror',e=>manifest.errors.push({name,error:e.message}));
 try{await fn(p,ctx);manifest.checks.push({name,pass:true});console.log('PASS',name);}
 catch(e){manifest.errors.push({name,error:e.stack,state:await sample(p).catch(()=>null)});await shot(p,`${name}-failure`);console.error('FAIL',name,e.message);process.exitCode=1;}
 finally{const v=p.video();await ctx.close();if(v){await v.saveAs(`${out}/${name}.webm`);await v.delete();}save();}
}
async function ranges(p){return p.evaluate(()=>{let y=0;return [...document.querySelectorAll('[data-ps05] [data-node]')].map(e=>{const r={id:e.dataset.node,start:y,length:Math.max(innerHeight,e.offsetHeight)};y+=r.length;return r;});});}
async function dragStart(p){const g=await p.evaluate(()=>{const h=innerHeight,track=h-34,thumb=Math.max(20,h/document.documentElement.scrollHeight*track);return {x:innerWidth-7,y:17+(track-thumb)*scrollY/(document.documentElement.scrollHeight-h)+thumb/2,track,thumb,max:document.documentElement.scrollHeight-h};});assert.ok(await p.evaluate(()=>innerWidth-document.documentElement.clientWidth)>0);await p.mouse.move(g.x,g.y);await p.mouse.down();return g;}
async function dragTo(p,g,y,steps=16){await p.mouse.move(g.x,17+(g.track-g.thumb)*y/g.max+g.thumb/2,{steps});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function assertPreview(p,id,before){const s=await sample(p);assert.equal(s.preview,id);assert.equal(s.center,id);assert.equal(s.provisional,'true');for(const key of ['displayed','arrival','hash','history','brief','actor'])assert.deepEqual(s[key],before[key],`held ${key}`);await checkGraph(p);}
async function checkGraph(p){
 const s=await sample(p),actual=await p.locator('[data-hit]').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.hit,font:getComputedStyle(n).fontSize,weight:getComputedStyle(n).fontWeight,selected:n.dataset.selected,current:n.getAttribute('aria-current'),r:n.getBoundingClientRect().toJSON(),label:n.lastElementChild.getBoundingClientRect().toJSON(),locked:n.disabled})));
 assert.deepEqual(actual.map(n=>n.id),s.expanded==='true'?ids:ids.filter(id=>Math.abs(ids.indexOf(id)-ids.indexOf(s.center))<=3));
 assert.ok(actual.every(n=>n.font==='12px'));
 assert.deepEqual(actual.filter(n=>n.weight==='700').map(n=>n.id),[s.center]);
 assert.ok(actual.every(n=>!n.current||n.id===s.displayed));
 for(let i=0;i<actual.length;i++)for(let j=i+1;j<actual.length;j++){
  const a=actual[i].label,b=actual[j].label;assert.ok(!(a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y),`label overlap ${actual[i].id}/${actual[j].id}`);
  for(const [label,hit] of [[a,actual[j].r],[b,actual[i].r]])assert.ok(!(label.x<hit.right&&label.right>hit.x&&label.y<hit.bottom&&label.bottom>hit.y),`hit overlap ${actual[i].id}/${actual[j].id}`);
 }
 const crossings=await p.evaluate(()=>{
  const result=[],labels=[...document.querySelectorAll('[data-hit]')].map(n=>({id:n.dataset.hit,r:n.lastElementChild.getBoundingClientRect()}));
  for(const path of document.querySelectorAll('[data-edge]')){
   const matrix=path.getScreenCTM(),points=[...path.getAttribute('d').matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(m=>new DOMPoint(+m[1],+m[2]).matrixTransform(matrix));
   for(let i=1;i<points.length;i++)for(const {id,r} of labels){const a=points[i-1],b=points[i];if(a.x===b.x?a.x>r.left&&a.x<r.right&&Math.max(a.y,b.y)>r.top&&Math.min(a.y,b.y)<r.bottom:a.y>r.top&&a.y<r.bottom&&Math.max(a.x,b.x)>r.left&&Math.min(a.x,b.x)<r.right)result.push(`${path.dataset.edge}/${id}`);}
  }return result;
 });assert.deepEqual(crossings,[],'labels do not cross structural edges');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 if(s.expanded!=='true'){
  const viewport=await p.locator('#route-map').boundingBox(),toggle=await p.getByRole('button',{name:'Показать всю карту',exact:true}).boundingBox();
  for(const n of actual){assert.ok(n.label.x>=viewport.x-1&&n.label.right<=viewport.x+viewport.width+1,`${n.id} horizontal clipping`);assert.ok(n.label.y>=viewport.y-1&&n.label.bottom<=viewport.y+viewport.height+1,`${n.id} vertical clipping`);assert.ok(n.label.right<=toggle.x,`${n.id} covers toggle`);}
 }
}
for(const expanded of [false,true]){
 const mode=expanded?'full':'compact';
 await run(`native-slow-${mode}`,1440,900,async p=>{
 await start(p,'04');if(expanded)await full(p);await trace(p);const list=await ranges(p),before=await sample(p),g=await dragStart(p);
  for(const id of ['05.1','05.2','05.4','05.6']){const d=list.find(r=>r.id===id);await dragTo(p,g,d.start+d.length*.4,14);await assertPreview(p,id,before);await p.waitForTimeout(200);}
  await p.waitForTimeout(1300);await assertPreview(p,'05.6',before);await shot(p,`native-held-${mode}`);
  for(const id of ['05.4','05.2']){const d=list.find(r=>r.id===id);await dragTo(p,g,d.start+d.length*.4,14);await assertPreview(p,id,before);}
  // Release just inside a range boundary; commit the controller's actual hysteresis choice.
  const boundary=list.find(r=>r.id==='05.3');await dragTo(p,g,boundary.start+10,8);const final=(await sample(p)).preview;const from=(await p.evaluate(()=>window.navFrames.length));await p.mouse.up();await settled(p,final);const rows=await endTrace(p,`native-slow-${mode}`);assert.ok(rows.slice(from).every(r=>r.center===final),'no release snapback');assert.equal((await sample(p)).expanded,String(expanded));
 },{video:true});
 await run(`native-fast-${mode}`,1440,900,async p=>{
  await start(p);if(expanded)await full(p);await trace(p);const list=await ranges(p);let before=await sample(p),g=await dragStart(p),d=list.find(r=>r.id==='07');
  await dragTo(p,g,d.start+d.length*.5,1);await assertPreview(p,'07',before);const from=await p.evaluate(()=>window.navFrames.length);await p.mouse.up();await settled(p,'07');assert.equal((await sample(p)).arrival,before.arrival+1);
  assert.ok((await p.evaluate(()=>window.navFrames)).slice(from).every(r=>r.center==='07'));
  // Out and back in one held drag does not restart the screen or wave.
  before=await sample(p);g=await dragStart(p);d=list.find(r=>r.id==='05.2');await dragTo(p,g,d.start+400,1);await assertPreview(p,'05.2',before);await dragTo(p,g,before.y,1);await assertPreview(p,'07',before);await p.mouse.up();await p.waitForTimeout(750);assert.equal((await sample(p)).arrival,before.arrival);
  // Capture native thumb during a running command; only the final released choice is queued.
  if(expanded)await p.getByRole('button',{name:'Свернуть карту',exact:true}).click();
  await full(p);await p.locator('[data-hit="04"]').click();await p.waitForTimeout(80);if(expanded)await full(p);
  g=await dragStart(p);d=list.find(r=>r.id==='06.3');await dragTo(p,g,d.start+350,1);assert.equal((await sample(p)).center,'06.3');const after=await p.evaluate(()=>window.navFrames.length);await p.mouse.up();await settled(p,'06.3');const rows=await endTrace(p,`native-fast-${mode}`);assert.ok(rows.slice(after).every(r=>r.center==='06.3'),'queued confirmation does not flash running target');await shot(p,`native-fast-final-${mode}`);
 },{video:true});
}
await run('map-interactions',1440,900,async p=>{
 await start(p);await trace(p);const original=await sample(p),toggle=await p.getByRole('button',{name:'Показать всю карту',exact:true}).boundingBox();await full(p);await checkGraph(p);assert.equal(await p.locator('[data-hit="03.2"]').isDisabled(),true);assert.equal(await p.locator('[data-hit="03.3"]').isDisabled(),true);
 assert.deepEqual({...await sample(p),expanded:'false'},original);await p.keyboard.press('Escape');assert.equal(await p.getByRole('button',{name:'Показать всю карту',exact:true}).evaluate(e=>e===document.activeElement),true);
 await full(p);await p.getByRole('button',{name:'Свернуть карту',exact:true}).click();assert.deepEqual(await sample(p),original);
 await full(p);await p.mouse.click(400,850);assert.equal((await sample(p)).expanded,'false');
 await full(p);await p.locator('[data-hit="01"]').click();assert.equal((await sample(p)).arrival,original.arrival);
 await full(p);await p.locator('[data-hit="05.7"]').click();await settled(p,'05.7');await p.waitForTimeout(240);assert.equal((await sample(p)).arrival,original.arrival+1);assert.equal((await sample(p)).expanded,'false');await checkGraph(p);assert.deepEqual(await p.getByRole('button',{name:'Показать всю карту',exact:true}).boundingBox(),toggle);
 await p.waitForTimeout(300);assert.ok(await p.locator('[data-wave="true"]').count());await p.waitForTimeout(850);assert.equal(await p.locator('[data-wave="true"]').count(),0);
 assert.equal(await p.evaluate(()=>document.activeElement?.id),'heading-05.7');
 const rows=await endTrace(p,'map-interactions');assert.ok(rows.every(r=>['01','05.7'].includes(r.displayed)));await shot(p,'map-direct-arrival');
},{video:true});
async function show(p,selector){for(let i=0;i<40;i++){const r=await p.locator(selector).boundingBox(),h=p.viewportSize().height,top=p.viewportSize().width<600?(await p.locator('#route-map').boundingBox()).y+(await p.locator('#route-map').boundingBox()).height+12:150;if(r&&r.y>=top&&r.y+r.height<h-20)return;await p.mouse.move(20,h-60);await p.mouse.wheel(0,r&&r.y<top?-100:100);await p.waitForTimeout(60);}throw Error(`Cannot read to ${selector}`);}
async function build(p){await jump(p,'03.1');await show(p,'[data-qa="task-engage_and_unite"]');await p.locator('[data-qa="task-engage_and_unite"]').check();await show(p,'[id="screen-03.1"] button');await p.getByRole('button',{name:/^Выбрать компетенции/}).click();await settled(p,'03.2');await show(p,'[data-qa="competence-content"]');await p.locator('[data-qa="competence-content"]').check();await p.locator('[data-qa="competence-design"]').check();await show(p,'[data-qa="confirm-competencies"]');await p.locator('[data-qa="confirm-competencies"]').click();await settled(p,'03.3');await show(p,'button[aria-controls="brief-editor"]');await p.getByRole('button',{name:/Изменить запрос/}).click();await p.locator('[data-qa="brief-text"]').fill('Ручной бриф NAV-01\nСохранить после карты и reload.');await show(p,'button[aria-controls="brief-editor"]');await p.getByRole('button',{name:/Готово/}).click();}
for(const [width,height] of [[1440,900],[1280,720],[390,844],[320,844]])await run(`layout-${width}`,width,height,async p=>{
 await start(p);await build(p);await p.reload();await settled(p,'03.3');assert.match(await p.locator('[data-qa="brief-reading"]').innerText(),/Ручной бриф NAV-01/);
 for(const id of ids){await jump(p,id);await checkGraph(p);if(['01','03.2','05.4','06.1','08'].includes(id))await shot(p,`${width}-${id}`);}
 for(const theme of ['light','dark']){
  if(theme==='dark'){await p.locator('button[aria-controls="ps05-nav"]').click();await p.getByRole('button',{name:'Тёмная тема',exact:true}).click();await p.keyboard.press('Escape');}
  await full(p);await checkGraph(p);await shot(p,`${width}-full-${theme}`);const before=await sample(p);
  // Full-map wheel and keys (including boundary) never switch the main scene.
  await p.locator('#route-map').focus();await p.keyboard.press('End');await p.keyboard.press('ArrowDown');await p.locator('#route-map').hover();await p.mouse.wheel(0,2000);await p.waitForTimeout(300);assert.equal((await sample(p)).arrival,before.arrival);assert.equal((await sample(p)).y,before.y);await p.keyboard.press('Escape');
  if(theme==='dark'){for(const id of ['01','05.4','06.1','08']){await jump(p,id);await checkGraph(p);}await shot(p,`${width}-dark-end`);}
 }
 await jump(p,'03.3');assert.match(await p.locator('[data-qa="brief-reading"]').innerText(),/Ручной бриф NAV-01/);
});
await run('reduced',1280,720,async p=>{await start(p,'04','dark');await full(p);assert.equal(await p.locator('#route-map').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await p.locator('[data-hit="05.7"]').click();await settled(p,'05.7');await checkGraph(p);assert.equal(await p.locator('[data-wave="true"]').count(),0);await shot(p,'reduced');},{reduced:true});
await run('inputs',390,844,async(p,ctx)=>{
 await start(p,'04');await p.keyboard.press('ArrowDown');await settled(p,'05.1');await p.keyboard.press('ArrowUp');await settled(p,'04');await p.mouse.move(20,700);const wheelBefore=await sample(p);await p.mouse.wheel(0,100);await p.waitForTimeout(800);const wheelAfter=await sample(p);assert.ok(wheelAfter.y>wheelBefore.y||wheelAfter.displayed==='05.1');
 await jump(p,'01');const c=await ctx.newCDPSession(p);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:300,y:680}]});for(let i=1;i<=6;i++)await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:300,y:680-i*45}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(800);assert.equal((await sample(p)).displayed,'01');assert.ok((await sample(p)).y>0,'long mobile hero reads on touch');await c.detach();await checkGraph(p);
},{video:true});
await browser.close();save();console.log(manifest.checks.length,'passed;',manifest.errors.length,'errors');
