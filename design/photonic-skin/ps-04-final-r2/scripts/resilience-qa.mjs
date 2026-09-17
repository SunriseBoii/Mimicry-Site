import { chromium } from 'playwright-core';
import { mkdirSync,writeFileSync } from 'node:fs';
const out='design/photonic-skin/ps-04-final-r2/reports';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const results=[];
try {
 for(const reduced of [false,true]){
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.PS04_BASE ?? 'http://localhost:3001'}/#screen-05.5`);
  await page.waitForFunction(()=>window.__PS04M62_LAB__?.ready);
  const wait=()=>page.waitForFunction(()=>{const h=window.__PS04M62_LAB__;return h.renderAck().drawnProgress===1&&h.renderAck().drawnTargetId===h.contract()?.resolvedGeometryId&&h.transaction().status==='settled';},null,{timeout:20000});
  await wait();
  const capture=label=>page.evaluate(label=>({label,ack:window.__PS04M62_LAB__.renderAck(),stats:window.__PS04M62_LAB__.stats,environment:window.__PS04M62_LAB__.environment}),label);
  const states=[await capture('anchor-load')];
  await page.locator('[data-hit="05.4"]').click();await wait();states.push(await capture('graph'));
  await page.keyboard.press('ArrowLeft');await wait();states.push(await capture('keyboard'));
  await page.reload();await page.waitForFunction(()=>window.__PS04M62_LAB__?.ready);await wait();states.push(await capture('reload'));
  for(const size of [{width:1920,height:1080},{width:1280,height:720},{width:390,height:844},{width:1440,height:900}]){
   await page.setViewportSize(size);await page.waitForTimeout(200);await wait();states.push(await capture(`resize-${size.width}`));
  }
  await page.evaluate(()=>{
   const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_lose_context');
   ext.loseContext();setTimeout(()=>ext.restoreContext(),150);
  });
  await page.waitForFunction(()=>window.__PS04M62_LAB__.contextState==='restored',null,{timeout:20000});await wait();states.push(await capture('context-restored'));
  for(let i=0;i<3;i++)for(const node of ['05.3','05.4','05.5']){
   await page.evaluate(id=>window.__PS04M62_LAB__.scrollToNode(id,'auto','programmatic'),node);await wait();
  }
  states.push(await capture('after-repeated-routes'));
  results.push({reduced,errors,states});await context.close();
 }
 const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const touchPage=await touchContext.newPage();
 await touchPage.goto(`${process.env.PS04_BASE ?? 'http://localhost:3001'}/#screen-05.3`);
 await touchPage.waitForFunction(()=>window.__PS04M62_LAB__?.ready&&window.__PS04M62_LAB__.renderAck().drawnTargetId==='single-event');
 const cdp=await touchContext.newCDPSession(touchPage);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:600}]});
 for(const y of [540,460,380,280,180]){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:190,y}]});await touchPage.waitForTimeout(30);
 }
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await cdp.send('Input.synthesizeScrollGesture',{x:190,y:700,yDistance:-700,gestureSourceType:'touch',speed:700});
 await touchPage.waitForTimeout(1800);
 await touchPage.waitForFunction(()=>{const h=window.__PS04M62_LAB__;return h.transaction().status==='settled'&&h.renderAck().drawnProgress===1&&h.renderAck().drawnTargetId===h.contract().resolvedGeometryId;},null,{timeout:20000});
 results.push(await touchPage.evaluate(()=>({touchEmulation:true,changedNode:window.__PS04M62_LAB__.activeNode!=='05.3',node:window.__PS04M62_LAB__.activeNode,ack:window.__PS04M62_LAB__.renderAck()})));
 await touchContext.close();
 writeFileSync(`${out}/resilience.json`,JSON.stringify(results,null,2));
 console.log('PASS reload, hash, keyboard, four sizes, context restore, reduced motion');
}finally{await browser.close();}
