import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import sharp from 'sharp';
const source='design/photonic-skin/ps-05-nav-01/final',out=`${source}/review`;mkdirSync(out,{recursive:true});
const ff=process.env.LOCALAPPDATA+'/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe';
for(const [name,times] of [['map-interactions',[2,2.07,2.14,2.24,4,7]],['native-slow-compact',[2,3,4,5,6,8]],['native-fast-compact',[2,2.3,3,4,5,6]]]){
 const parts=[];
 for(let i=0;i<times.length;i++){
  const png=`${out}/${name}-${i}.png`;
  execFileSync(ff,['-y','-ss',String(times[i]),'-i',`${source}/${name}.webm`,'-frames:v','1',png],{stdio:'ignore'});
  parts.push({input:await sharp(png).resize(480,300).png().toBuffer(),left:(i%3)*480,top:Math.floor(i/3)*324+24});unlinkSync(png);
  parts.push({input:Buffer.from(`<svg width="480" height="24"><rect width="480" height="24" fill="#eee"/><text x="8" y="17" font-size="13">${name} / ${times[i]} s</text></svg>`),left:(i%3)*480,top:Math.floor(i/3)*324});
 }
 await sharp({create:{width:1440,height:648,channels:3,background:'#ddd'}}).composite(parts).png().toFile(`${out}/${name}.png`);
}
const metrics={};
for(const name of ['native-slow-compact','native-fast-compact','native-slow-full','native-fast-full']){
 const rows=JSON.parse(readFileSync(`${source}/${name}.json`)),preview=rows.filter(r=>r.preview);let streak=0,maxStreak=0;
 for(const r of rows){streak=r.preview&&r.center!==r.preview?streak+1:0;maxStreak=Math.max(streak,maxStreak);}
 metrics[name]={frames:rows.length,previewFrames:preview.length,centers:[...new Set(preview.map(r=>r.center))],rafSamplesBeforeReactCommit:preview.filter(r=>r.center!==r.preview).length,longestConsecutiveUncommittedSamples:maxStreak,confirmedPreparationFrames:rows.filter(r=>r.target&&r.p===0&&!r.preview&&r.provisional==='true').length};
}
writeFileSync(`${out}/metrics.json`,JSON.stringify(metrics,null,2));
