import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const revision = process.env.PS04_REVISION ?? 'r2';
const mobile = process.env.PS04_MOBILE === '1';
const out = `design/photonic-skin/ps-04-final-r2/renders/${revision}-${mobile ? 'mobile' : 'desktop'}`;
mkdirSync(out, {recursive:true});
const browser = await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const context = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},deviceScaleFactor:1,recordVideo:{dir:out,size:mobile?{width:390,height:844}:{width:1440,height:900}}});
const page = await context.newPage();
const errors=[]; const observations=[];
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(process.env.PS04_QA_URL ?? `http://localhost:3001/visual-lab/photonic-skin-ps04-m6/final-${revision}`,{timeout:120000});
 await page.waitForFunction(()=>window.__PS04M62_LAB__?.ready, null,{timeout:120000});
 async function settle(expected = null){
  await page.waitForFunction(expected=>{
   const h=window.__PS04M62_LAB__,a=h.renderAck();
   const destination=decodeURIComponent(location.hash.replace('#screen-',''));
   return (!destination || h.activeNode===destination) && (!expected || a.drawnTargetId===expected)
    && h.transaction()?.status==='settled' && a.drawnProgress===1 && a.drawnTargetId===h.contract()?.resolvedGeometryId;
  },expected,{timeout:20000});
 }
 async function go(id){await page.evaluate(id=>window.__PS04M62_LAB__.scrollToNode(id,'auto','programmatic'),id);await settle();}
 for(const theme of ['light','dark']){
  await page.evaluate(t=>window.__PS04M62_LAB__.setTheme(t),theme);
  await page.evaluate(()=>window.__PS04M62_LAB__.setReviewPhase(0.25));
  for(const [name,id] of [['hero','01'],['event','05.3'],['games','05.4'],['video','05.5']]){
   await go(id); await page.waitForTimeout(200);
   await page.screenshot({path:`${out}/${theme}-${name}.png`});
   observations.push(await page.evaluate(({name,theme})=>({name,theme,ack:window.__PS04M62_LAB__.renderAck(),environment:window.__PS04M62_LAB__.environment,composition:window.__PS04M62_LAB__.composition()}),{name,theme}));
  }
  await page.evaluate(()=>window.__PS04M62_LAB__.resetFlow());
  await go('03.1'); await page.locator('[data-qa="task-explain_changes"]').click();await go('03.2');
  for(const [label,competencies] of [['event-video',['event','video']],['merch-video',['merch','video']],['design-digital-event-video',['design','digital','event','video']],['all-seven',['content','design','digital','event','games','merch','video']]]){
   // Exercise the real buttons, including deselection and reconfirmation.
   const selected=await page.evaluate(()=>window.__PS04M62_LAB__.builder.draft);
   for(const id of selected) if(!competencies.includes(id))await page.locator(`[data-qa="competence-${id}"]`).click();
   for(const id of competencies)if(!selected.includes(id))await page.locator(`[data-qa="competence-${id}"]`).click();
   await settle(`complex-gather-${[...competencies].sort().join('-')}`);await page.screenshot({path:`${out}/${theme}-${label}-gather.png`});
   observations.push(await page.evaluate(({label,theme})=>({name:label,theme,ack:window.__PS04M62_LAB__.renderAck(),composition:window.__PS04M62_LAB__.composition()}),{label,theme}));
   await page.locator('[data-qa="confirm-competencies"]').click();await go('03.3');
   await page.screenshot({path:`${out}/${theme}-${label}-drive.png`});await go('03.2');
  }
 }
 await go('05.1');
 await page.evaluate(()=>window.__PS04M62_LAB__.setReviewPhase(null));
 await page.evaluate(()=>{
  window.__r2Trace=[];window.__r2Tracing=true;
  const tick=()=>{if(!window.__r2Tracing)return;const h=window.__PS04M62_LAB__;
   window.__r2Trace.push({t:performance.now(),node:h.activeNode,hash:location.hash,contract:h.contract()?.resolvedGeometryId,ack:h.renderAck(),program:h.programBind(),tx:h.transaction()?.status});requestAnimationFrame(tick);};tick();
 });
 for(const interval of [40,60,80]){
  for(const key of ['ArrowRight','ArrowRight','ArrowRight','ArrowLeft','ArrowLeft','ArrowRight']){
   await page.keyboard.press(key);await page.waitForTimeout(interval);
  }
  await settle();
 }
 await page.goBack();await settle();await page.goForward();await settle();
 await page.mouse.wheel(0,-700);await page.waitForTimeout(1800);await settle();
 const trace=await page.evaluate(()=>{window.__r2Tracing=false;return window.__r2Trace;});
 writeFileSync(`${out}/trace.json`,JSON.stringify(trace,null,2));
 writeFileSync(`${out}/observations.json`,JSON.stringify({errors,observations},null,2));
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(`PASS ${out}; ${trace.length} frames`);
} catch(error){
 const state=await page.evaluate(()=>({body:document.body.innerText.slice(-1500),handle:window.__PS04M62_LAB__?{ready:window.__PS04M62_LAB__.ready,ack:window.__PS04M62_LAB__.renderAck(),contract:window.__PS04M62_LAB__.contract(),geo:window.__PS04M62_LAB__.geometrySnapshot(),tx:window.__PS04M62_LAB__.transaction()}:null}));
 writeFileSync(`${out}/failure.json`,JSON.stringify({error:String(error),errors,state},null,2));
 await page.screenshot({path:`${out}/failure.png`});throw error;
} finally {await context.close();await browser.close();}
