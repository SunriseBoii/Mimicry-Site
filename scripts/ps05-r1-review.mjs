import sharp from 'sharp';
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const run=process.argv[2]??'acceptance-02';
const dir=`design/photonic-skin/ps-05-r1/2026-09-24/${run}`,manifest=JSON.parse(readFileSync(dir+'/manifest.json'));
const summary=[];
for(const a of manifest.results.filter(a=>a.samples&&a.from)){
 const frames=a.samples,w=frames[0].viewport?.[0]??1840,h=frames[0].viewport?.[1]??944;
 const visible=t=>t.x<w&&t.x+t.w>0&&t.y<h&&t.y+t.h>80;
 const fading=id=>frames.flatMap(f=>f.texts.filter(t=>t.id===id&&visible(t)&&t.opacity>.01&&t.opacity<.99)).length;
 const values=frames.map(f=>f.c.x),start=values[0],end=values.at(-1),range=Math.abs(end-start);
 const intermediate=new Set(values.filter(x=>Math.abs(x-start)>1&&Math.abs(x-end)>1).map(x=>Math.round(x))).size;
 const outgoing=fading(a.input==='wheel'?a.from:'snapshot'),incoming=fading(a.to);
 const result={label:a.label,input:a.input,viewport:[w,h],reading:frames[0].reading,start,end,intermediate,outgoing,incoming,finalOpacity:a.state.texts.find(t=>t.id===a.to)?.opacity};
 if(a.input==='wheel'&&a.state.reduced!=='true'){assert.ok(outgoing>2,a.label+' outgoing fade while visible');assert.ok(incoming>2,a.label+' incoming fade while visible');}
 if(range>100&&!a.label.includes('dark')&&!a.label.includes('boundary')){
  assert.ok(intermediate>4,a.label+' actual intermediate positions');
  if(a.input!=='wheel'){
   // Smoothstep has a known maximum speed (1.5 / 420ms). Compare displacement
   // to elapsed time, including the one-frame observer/runtime ordering skew.
   let ratio=0;
   for(let i=2;i<frames.length;i++)ratio=Math.max(ratio,Math.abs(values[i]-values[i-1])/(range*1.5*(frames[i].t-frames[i-2].t)/420+1));
   result.maxTimeAdjustedSpeedRatio=ratio;assert.ok(ratio<1.2,a.label+' no teleport');
  }
 }
 assert.equal(result.finalOpacity,1,a.label+' readable endpoint');summary.push(result);
}
writeFileSync(dir+'/measurements.json',JSON.stringify(summary,null,2));
const selections=[['wheel 04 to 05.1','wheel-cases-content'],['keyboard 04 to 05.1','keys-cases-content'],['graph 04 to 05.1','graph-cases-content'],['wheel 05.7 to 06.1','wheel-merch-team'],['keyboard 05.7 to 06.1','keys-merch-team'],['interrupt keyboard reversal','interrupted']];
const ffmpeg=join(process.env.LOCALAPPDATA,'ms-playwright/ffmpeg-1011/ffmpeg-win64.exe');
for(const [label,name]of selections){const a=manifest.results.find(a=>a.label===label);if(!a)continue;const out=dir+'/review/'+name;mkdirSync(out,{recursive:true});const start=a.start/1000;
 const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-ss',String(start),'-i',dir+'/main.webm','-t','1.0','-r','10','-y',out+'/frame-%03d.png'],{encoding:'utf8'});if(result.status)throw Error(result.stderr);
 const files=readdirSync(out).filter(f=>f.startsWith('frame-')),layers=[];
 for(let i=0;i<files.length;i++){const x=i%4*460,y=Math.floor(i/4)*265;layers.push({input:await sharp(out+'/'+files[i]).resize({width:460,height:241,fit:'contain',background:'#ddd'}).png().toBuffer(),left:x,top:y+24});layers.push({input:Buffer.from(`<svg width="460" height="24"><rect width="460" height="24" fill="#ddd"/><text x="8" y="17" font-size="13">${name} / ${(start+i/10).toFixed(2)} s</text></svg>`),left:x,top:y});}
 await sharp({create:{width:1840,height:Math.ceil(files.length/4)*265,channels:3,background:'#ddd'}}).composite(layers).png().toFile(out+'/timeline.png');
}
for(const [name,first,last]of [['builder','FIX02 wheel arrival CSS start','wheel horizontal builder reverse'],['boundary-comparison','wheel 04 to 05.1','graph 06.1 to 05.7'],['interruption','interrupt keyboard reversal','wheel during keyboard transition']]){
 const a=manifest.results.find(x=>x.label===first),b=manifest.results.find(x=>x.label===last);if(!a||!b)continue;
 const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-ss',String(a.start/1000),'-i',dir+'/main.webm','-t',String((b.samples.at(-1).t-a.start)/1000+.3),'-c','copy','-y',dir+'/'+name+'.webm'],{encoding:'utf8'});if(result.status)throw Error(result.stderr);
}
console.log(JSON.stringify(summary,null,2));
