import sharp from 'sharp';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
const root='design/photonic-skin/ps-05-d2';
async function sheet(files,path,columns=3,w=480){
 const tiles=await Promise.all(files.map(async(name)=>{const s=sharp(`${root}/${name}`);const m=await s.metadata();const h=Math.round(m.height*w/m.width);return {input:await s.resize(w,h).extend({top:22,bottom:0,left:0,right:0,background:'#dddddd'}).composite([{input:Buffer.from(`<svg width="${w}" height="22"><text x="8" y="16" font-family="Arial" font-size="12">${name.split('/').at(-1)}</text></svg>`),top:0,left:0}]).png().toBuffer(),h:h+22}}));
 const rowHeight=Math.max(...tiles.map(t=>t.h));await sharp({create:{width:columns*w,height:Math.ceil(tiles.length/columns)*rowHeight,channels:3,background:'#dddddd'}}).composite(tiles.map((t,i)=>({input:t.input,left:i%columns*w,top:Math.floor(i/columns)*rowHeight}))).png().toFile(`${root}/review/${path}`);
}
const frames=readdirSync(`${root}/review`).filter(f=>/^keys-\d+\.png$/.test(f)).map(f=>'review/'+f);
if(frames.length)await sheet(frames,'keys-timeline.png',5,288);
const ready=readdirSync(`${root}/review`).filter(f=>/^ready-\d+\.png$/.test(f)).map(f=>'review/'+f);
if(ready.length)await sheet(ready,'ready-timeline.png',5,288);
const first=readdirSync(`${root}/review`).filter(f=>/^first-\d+\.png$/.test(f)).map(f=>'review/'+f);
if(first.length)await sheet(first,'first-transition.png',4,480);
await sheet(['release/1440-light-03.2.png','release/1440-dark-03.2.png','release/1440-light-03.3.png','release/1440-dark-03.3.png'],'builder-themes.png',2,720);
await sheet(['release/1280-light-03.1.png','release/1280-dark-03.1.png','supplement/390-light-all7-materials-03.3.png','supplement/390-dark-all7-materials-03.3.png','release/320-light-03.2.png','release/320-dark-03.2.png'],'responsive.png',2,520);
await sheet(Array.from({length:14},(_,i)=>`release/1440-${i<7?'light':'dark'}-05.${i%7+1}.png`),'seven-materials.png',2,720);
const palette={content:['435F8C','7F93B3'],design:['745794','A58CBD'],event:['AF4953','C78085'],games:['456B54','84A28D'],video:['984C78','BA86A8'],digital:['2F6C79','78A3AD'],merch:['935C45','BF927E']};
const luminance=hex=>{const c=hex.match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};
const contrast=(a,b)=>{const l=[luminance(a),luminance(b)].sort((a,b)=>b-a);return +( (l[0]+.05)/(l[1]+.05)).toFixed(2)};
writeFileSync(`${root}/review/contrast.json`,JSON.stringify(Object.fromEntries(Object.entries(palette).map(([id,[l,d]])=>[id,{light:contrast(l,'FFFFFF'),dark:contrast(d,'0D0D0F'),lightSurface:contrast(l,'F5F5F6'),darkSurface:contrast(d,'18181B')}])),null,2));
const trace=JSON.parse(readFileSync(`${root}/motion-release/keys.json`,'utf8'));
const metrics=Object.fromEntries(['04','05.1','05.2'].map(id=>{const shown=trace.flatMap(f=>f.copies.filter(c=>c.id===id&&c.opacity>0));return [id,{fontSizes:[...new Set(shown.map(c=>c.font))],widths:[...new Set(shown.map(c=>+c.rect.width.toFixed(2)))],scaleOne:shown.every(c=>/^matrix\(1, 0, 0, 1,/.test(c.transform)||c.transform==='none')}] }));
writeFileSync(`${root}/review/frame-metrics.json`,JSON.stringify(metrics,null,2));
console.log('Review sheets and metrics saved');
