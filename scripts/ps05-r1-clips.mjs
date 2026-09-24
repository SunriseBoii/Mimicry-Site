import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const dir=`design/photonic-skin/ps-05-r1/2026-09-24/${process.env.PS05_RUN??'clips-final'}`;mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});const manifest={build:readFileSync('.next/BUILD_ID','utf8').trim(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--short'],{encoding:'utf8'}),browser:browser.version(),viewport:[1840,944],theme:'light',motion:'normal',clips:[],errors:[]};
const ids=['01','02','03.1','04','05.1','05.2','05.3','05.4','05.5','05.6','05.7','06.1','06.2','06.3','07','08'];
for(const [from,to,boundary]of [['04','05.1','cases-content'],['05.7','06.1','merch-team']])for(const method of ['wheel','keyboard','graph']){
 const name=method+'-'+boundary,folder=dir+'/'+name;mkdirSync(folder,{recursive:true});const ctx=await browser.newContext({viewport:{width:1840,height:944},reducedMotion:'no-preference',recordVideo:{dir:dir+'/video',size:{width:1840,height:944}}});const p=await ctx.newPage();p.on('pageerror',e=>manifest.errors.push(e.message));const record={name,url:`http://127.0.0.1:3001/#screen-${from}`,actions:[]};manifest.clips.push(record);
 try{
  await p.goto(record.url);await p.waitForFunction(()=>window.__PS04M5_LAB__?.actorFramebufferReady,undefined,{timeout:60000});
  await p.waitForFunction(from=>document.documentElement.dataset.m4Node===from&&getComputedStyle(document.querySelector(`[id="screen-${from}"] [data-ps05-copy]`)).opacity==='1',from);await p.waitForTimeout(350);
  for(const [source,target,phase]of [[from,to,'forward'],[to,from,'reverse']]){
   const frames=[],start=await p.evaluate(()=>performance.now());let capturing=true;let actual=method;
   if(method==='graph'){const r=await p.locator(`[data-hit="${target}"]`).boundingBox();if(!r||r.x<0||r.y<80||r.x+r.width>1840||r.y+r.height>944)actual='keyboard (graph target outside viewport)';}
   const capture=(async()=>{for(let i=0;capturing&&i<18;i++){const filename=`${phase}-${String(i).padStart(2,'0')}.png`;const t=await p.evaluate(()=>performance.now());await p.screenshot({path:folder+'/'+filename});frames.push({filename,time:(t-start)/1000});await p.waitForTimeout(45)}})();
   if(actual==='wheel'){await p.mouse.move(1100,820);const y=ids.indexOf(target)*944+2;for(let i=8;i>0;i--){const current=await p.evaluate(()=>scrollY);await p.mouse.wheel(0,(y-current)/i);await p.waitForTimeout(45)}}
   else if(actual==='graph')await p.locator(`[data-hit="${target}"]`).click();
   else await p.keyboard.press(phase==='forward'?'ArrowDown':'ArrowUp');
   await p.waitForFunction(target=>document.documentElement.dataset.m4Node===target&&getComputedStyle(document.querySelector(`[id="screen-${target}"] [data-ps05-copy]`)).opacity==='1'&&!document.querySelector('[data-motion-snapshot]'),target);
   await p.waitForTimeout(350);capturing=false;await capture;
   const end=await p.evaluate(()=>{const c=window.__PS04M5_LAB__.composition();return {node:document.documentElement.dataset.m4Node,x:c.cssCenterX,reading:document.querySelector('[data-ps05]').getAttribute('data-reading')}});assert.equal(end.node,target);
   record.actions.push({source,target,phase,input:actual,start,frames,end});
   const caption=actual.startsWith('keyboard (')?'keyboard (graph fallback)':actual;
   const layers=[];for(let i=0;i<frames.length;i++){const x=i%4*460,y=Math.floor(i/4)*260;layers.push({input:await sharp(folder+'/'+frames[i].filename).resize(460,236).png().toBuffer(),left:x,top:y+24});layers.push({input:Buffer.from(`<svg width="460" height="24"><rect width="460" height="24" fill="#ddd"/><text x="6" y="17" font-size="11">${caption} ${source} to ${target} / capture start +${frames[i].time.toFixed(2)}s</text></svg>`),left:x,top:y});}await sharp({create:{width:1840,height:Math.ceil(frames.length/4)*260,channels:3,background:'#ddd'}}).composite(layers).png().toFile(folder+'/'+phase+'-timeline.png');
  }
 }catch(e){manifest.errors.push(String(e));console.error(e);process.exitCode=1;}
 const video=p.video();await ctx.close();await video.saveAs(dir+'/'+name+'.webm');writeFileSync(dir+'/manifest.json',JSON.stringify(manifest,null,2));console.log(name);
}
await browser.close();
