import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='design/photonic-skin/ps-05-nav-01/review';mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true,ignoreDefaultArgs:['--hide-scrollbars'],args:['--disable-features=OverlayScrollbar','--use-gl=angle','--use-angle=d3d11']});
const measurements=[];
for(const width of [1440,1280,390,320]){
 const p=await b.newPage({viewport:{width,height:width===1280?720:width<400?844:900}});
 for(const id of ['01','05.4','06.1']){
  await p.goto(`http://127.0.0.1:3007/?theme=light#screen-${id}`);await p.waitForFunction(id=>document.documentElement.dataset.m4Node===id,id);await p.waitForTimeout(1800);
  await p.screenshot({path:`${out}/${width}-${id}.png`});
  measurements.push(await p.evaluate(()=>({width:innerWidth,node:document.documentElement.dataset.m4Node,overflow:document.documentElement.scrollWidth>innerWidth,graph:document.getElementById('route-map').getBoundingClientRect().toJSON(),labels:[...document.querySelectorAll('[data-hit]')].map(n=>({id:n.dataset.hit,font:getComputedStyle(n).fontSize,weight:getComputedStyle(n).fontWeight,r:n.querySelector('span:last-child').getBoundingClientRect().toJSON()}))})));
 }
 await p.getByRole('button',{name:'Показать всю карту',exact:true}).click();await p.waitForTimeout(300);await p.screenshot({path:`${out}/${width}-full.png`});await p.close();
}
writeFileSync(`${out}/measurements.json`,JSON.stringify(measurements,null,2));await b.close();
