import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.PS05_BASE??'http://127.0.0.1:3001';
const dir='design/photonic-skin/ps-05/2026-09-24/performance';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
const results=[];
for(const [label,path] of [['PS04-reference','/visual-lab/photonic-skin-ps04-m6/final-r2'],['PS05','/']]){
 const ctx=await browser.newContext({viewport:{width:1440,height:900}});const p=await ctx.newPage();
 await p.addInitScript(()=>{
  window.labPerf={longTasks:[],lcp:null,cls:0};
  new PerformanceObserver(list=>{for(const item of list.getEntries())window.labPerf.longTasks.push(item.duration)}).observe({type:'longtask',buffered:true});
  new PerformanceObserver(list=>{window.labPerf.lcp=list.getEntries().at(-1)?.startTime}).observe({type:'largest-contentful-paint',buffered:true});
  new PerformanceObserver(list=>{for(const item of list.getEntries())if(!item.hadRecentInput)window.labPerf.cls+=item.value}).observe({type:'layout-shift',buffered:true});
 });
 await p.goto(`${base}${path}`);await p.waitForSelector('[data-qa="m4-header"]',{timeout:120000});
 const domMs=await p.evaluate(()=>performance.now());await p.waitForSelector('canvas',{timeout:90000});await p.waitForTimeout(2200);
 const frames=await p.evaluate(()=>new Promise(resolve=>{const values=[];let last=performance.now();const finish=last+4000;function frame(now){values.push(now-last);last=now;if(now<finish)requestAnimationFrame(frame);else{values.sort((a,b)=>a-b);resolve({p50:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],max:Math.max(...values),samples:values.length})}}requestAnimationFrame(frame)}));
 results.push({label,path,domObservedMs:domMs,frames,...await p.evaluate(()=>window.labPerf)});await ctx.close();
}
writeFileSync(`${dir}/lab-comparison.json`,JSON.stringify({conditions:'Same machine, Edge headless / ANGLE D3D11, 1440x900, fresh contexts; lab measurements, not field Web Vitals. PS04 reference shares runtime core; its original DOM components and composition are unchanged.',date:new Date().toISOString(),results},null,2));console.log(results);await browser.close();
