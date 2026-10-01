import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import sharp from 'sharp';
const dir='design/photonic-skin/ps-05-motion-01/ready-review';mkdirSync(dir,{recursive:true});
const ff=process.env.LOCALAPPDATA+'/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe';
const sheets=[['keys','ready/keys.webm',[7,7.15,7.3,7.45,7.6,7.75,7.9,8.05,8.2,8.35,8.5,8.65]],['wave','ready/wave-pass.webm',[2.5,2.6,2.7,2.8,2.9,3,3.1,3.2,3.3,3.4,3.5,3.6]]];
for(const [name,file,times] of sheets){const parts=[];for(let i=0;i<times.length;i++){const path=`${dir}/${name}-${times[i]}.png`;execFileSync(ff,['-y','-ss',String(times[i]),'-i',`design/photonic-skin/ps-05-motion-01/${file}`,'-frames:v','1',path],{stdio:'ignore'});parts.push({input:await sharp(path).resize(480,300).png().toBuffer(),left:(i%4)*480,top:Math.floor(i/4)*326+26});parts.push({input:Buffer.from(`<svg width="480" height="26"><rect width="480" height="26" fill="#eee"/><text x="12" y="18" font-size="14">${name} · ${times[i]} s</text></svg>`),left:i%4*480,top:Math.floor(i/4)*326});}await sharp({create:{width:1920,height:978,channels:3,background:'#ddd'}}).composite(parts).png().toFile(`${dir}/${name}-frames.png`);}
const rows=JSON.parse(readFileSync('design/photonic-skin/ps-05-motion-01/ready/keys.json','utf8'));
const phases=rows.filter(r=>r.target==='05.1'&&r.active==='04'&&r.p>0);
const first=phases.slice(0,phases.findIndex((r,i)=>i>0&&r.t-phases[i-1].t>100));
writeFileSync(`${dir}/metrics.json`,JSON.stringify({fontSizes:Object.fromEntries(['04','05.1','05.2'].map(id=>[id,[...new Set(rows.flatMap(r=>r.copies.filter(c=>c.id===id&&c.opacity>0).map(c=>c.font)))]])),sourceProgressError:Math.max(...phases.filter(r=>r.transaction?.programReady&&r.geometry?.status!=='waiting').map(r=>Math.abs(r.p-r.transaction.geometryProgress))),firstTransitionFrames:first.length,canvas:'same element handle asserted across keyboard transitions'},null,2));
