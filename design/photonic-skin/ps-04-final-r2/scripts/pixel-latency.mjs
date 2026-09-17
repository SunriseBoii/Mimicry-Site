import {chromium} from 'playwright-core';
import sharp from 'sharp';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await page.goto(process.env.PS04_BASE ?? 'http://localhost:3001');await page.waitForFunction(()=>window.__PS04M62_LAB__?.ready);
 await page.evaluate(()=>window.__PS04M62_LAB__.selectTask('explain_changes'));
 await page.waitForFunction(()=>window.__PS04M62_LAB__.unlock.competencies);
 await page.evaluate(()=>window.__PS04M62_LAB__.scrollToNode('03.2','auto','programmatic'));
 const wait=expected=>page.waitForFunction(expected=>{const h=window.__PS04M62_LAB__;return h.activeNode==='03.2'&&h.renderAck().drawnTargetId===expected&&h.transaction().status==='settled'&&h.renderAck().drawnProgress===1;},expected,{timeout:20000});
 await wait('master-neutral');
 await page.evaluate(()=>window.__PS04M62_LAB__.setReviewPhase(0.25));
 await page.evaluate(()=>{
  window.__r2LongTasks=[];
  new PerformanceObserver(list=>window.__r2LongTasks.push(...list.getEntries().map(entry=>({start:entry.startTime,duration:entry.duration})))).observe({type:'longtask'});
 });
 const geometry=await page.evaluate(()=>({origin:performance.timeOrigin,rect:window.__PS04M62_LAB__.composition(),environment:window.__PS04M62_LAB__.environment}));
 const cdp=await page.context().newCDPSession(page);const frames=[];const requests=[];
 cdp.on('Page.screencastFrame',frame=>{frames.push({time:frame.metadata.timestamp*1000-geometry.origin,data:frame.data});void cdp.send('Page.screencastFrameAck',{sessionId:frame.sessionId});});
 await cdp.send('Page.startScreencast',{format:'jpeg',quality:90,maxWidth:1440,maxHeight:900,everyNthFrame:1});
 const selected=new Set();
 for(const id of ['video','event','event','merch','merch','games']){
  await page.waitForTimeout(160);
  const at=await page.evaluate(()=>performance.now());
  if (selected.has(id)) selected.delete(id); else selected.add(id);
  const expected=selected.size===1?`single-${[...selected][0]}`:`complex-gather-${[...selected].sort().join('-')}`;
  await page.locator(`[data-qa="competence-${id}"]`).click();await wait(expected);await page.waitForTimeout(100);
  const end=await page.evaluate(()=>performance.now());requests.push({id,at,end});
 }
 await cdp.send('Page.stopScreencast');
 const r=geometry.rect,rect={left:Math.max(0,Math.floor(r.cssLeft)),top:Math.max(0,Math.floor(r.cssTop)),width:Math.min(Math.floor(r.cssWidth),1440-Math.floor(r.cssLeft)),height:Math.min(Math.floor(r.cssHeight),900-Math.floor(r.cssTop))};
 for(const frame of frames)frame.pixels=await sharp(Buffer.from(frame.data,'base64')).extract(rect).removeAlpha().raw().toBuffer();
 for(const request of requests){
  const before=frames.filter(f=>f.time<request.at).at(-1);if(!before)continue;
  const changed=frames.find(f=>{
   if(f.time<request.at||f.time>request.end)return false;
   let count=0;for(let i=0;i<f.pixels.length;i+=3){if(Math.abs(f.pixels[i]-before.pixels[i])+Math.abs(f.pixels[i+1]-before.pixels[i+1])+Math.abs(f.pixels[i+2]-before.pixels[i+2])>36)count++;}
   return count/(f.pixels.length/3)>.005;
  });
  request.firstChangedPixelMs=changed?Number((changed.time-request.at).toFixed(1)):null;
 }
 const runtime=await page.evaluate(()=>({longTasks:window.__r2LongTasks,stats:window.__PS04M62_LAB__.stats}));
 writeFileSync('design/photonic-skin/ps-04-final-r2/reports/pixel-latency.json',JSON.stringify({method:'CDP compositor JPEG90, fixed builder actor crop; >0.5% pixels with RGB sum delta >36; includes input dispatch and preparation; not a presentation-timestamp hardware benchmark',environment:geometry.environment,rect,frameCount:frames.length,requests,...runtime},null,2));
 console.log(requests);
}finally{await browser.close();}
