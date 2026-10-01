import sharp from 'sharp';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {THEMES,ACCENTS,EDITORIAL_MATERIAL} from '../app/_ps05/design-tokens.ts';
const root='design/photonic-skin/ps-05-d1',dir=`${root}/final`;
const ids=['01','02','03.1','03.2','03.3','04','05.1','05.2','05.3','05.4','05.5','05.6','05.7','06.1','06.2','06.3','07','08'];
const linear=x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4};
const l=hex=>{const c=hex.replace('#','').match(/../g).map(v=>linear(parseInt(v,16)));return c[0]*.2126+c[1]*.7152+c[2]*.0722};
const ratio=(a,b)=>(Math.max(l(a),l(b))+.05)/(Math.min(l(a),l(b))+.05);
const contrast=[];
for(const [theme,t] of Object.entries(THEMES)){
 for(const [role,color] of Object.entries({ink:t.ink,muted:t.muted,control:t.control,...Object.fromEntries(Object.entries(ACCENTS).map(([id,p])=>[id,p[theme]]))})){
  for(const surface of ['paper','surface']){const value=ratio(color,t[surface]);contrast.push({theme,role,color,background:t[surface],ratio:value,required:role==='control'?3:4.5,pass:value>=(role==='control'?3:4.5)});}
 }
}
writeFileSync(`${root}/contrast.json`,JSON.stringify(contrast,null,2));
if(contrast.some(x=>!x.pass))throw Error('Contrast failure: '+JSON.stringify(contrast.filter(x=>!x.pass)));
const pixels=[];
for(const theme of ['light','dark']){
 const layers=[];
 for(let i=0;i<ids.length;i++){
  const path=`${dir}/1840-${theme}-${ids[i]}.png`;
  layers.push({input:await sharp(path).resize(460,236).toBuffer(),left:i%3*460,top:Math.floor(i/3)*260+24},{input:Buffer.from(`<svg width="460" height="24"><rect width="460" height="24" fill="#ccc"/><text x="12" y="17" font-size="14">${theme} / ${ids[i]}</text></svg>`),left:i%3*460,top:Math.floor(i/3)*260});
  const {data,info}=await sharp(path).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const color=(x,y)=>[...data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3)];
  pixels.push({theme,node:ids[i],samples:[[10,100],[20,920],[1820,900]].map(([x,y])=>({x,y,rgb:color(x,y)}))});
 }
 await sharp({create:{width:1380,height:1560,channels:3,background:'#ccc'}}).composite(layers).png().toFile(`${dir}/sheet-${theme}.png`);
}
writeFileSync(`${root}/background-pixels.json`,JSON.stringify(pixels,null,2));
const material=[];
for(const [phase,path,radius] of [['before',`${root}/before/light-01.png`,150],['after',`${dir}/1840-light-01.png`,180]]){
 const {data,info}=await sharp(path).removeAlpha().raw().toBuffer({resolveWithObject:true});let n=0,neutralBright=0,chromatic=0;
 for(let y=525-radius;y<525+radius;y++)for(let x=1490-radius;x<1490+radius;x++){if((x-1490)**2+(y-525)**2>radius**2)continue;const i=(y*info.width+x)*3,r=data[i],g=data[i+1],b=data[i+2],min=Math.min(r,g,b),max=Math.max(r,g,b);n++;if(min>=210&&max-min<25)neutralBright++;if(max-min>=35)chromatic++;}
 material.push({phase,path,region:'Interior circular mask of the observed Hero sphere; no background pixels',pixels:n,neutralBrightFraction:neutralBright/n,chromaticFraction:chromatic/n});
}
writeFileSync(`${root}/material-pixels.json`,JSON.stringify({material,presets:EDITORIAL_MATERIAL},null,2));
const mobile=[];
for(const [w,h] of [[390,844],[360,800],[320,800],[844,390],[1280,720]])for(const node of ['01','03.1','03.2','03.2-lower','03.3','contact','case','05.7']){
 const path=`${dir}/${w}-light-${node}.png`;if(existsSync(path))mobile.push({path,w,h,node});
}
mkdirSync(`${root}/review`,{recursive:true});
const cards=mobile.map(x=>`<figure><figcaption>${x.w}×${x.h} · ${x.node}</figcaption><a href="../final/${x.path.split('/').at(-1)}"><img loading="lazy" src="../final/${x.path.split('/').at(-1)}" alt="${x.w} ${x.node}"></a></figure>`).join('');
writeFileSync(`${root}/review/index.html`,`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PS‑05.D1 — кадры</title><style>body{margin:40px;font:16px Arial;background:#eee;color:#1f2329}h1{font-weight:500}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:24px}figure{margin:0}figcaption{padding:12px 0}img{width:100%;height:auto}a{color:inherit}</style><h1>PS‑05.D1 / реальная страница</h1><p><a href="../final/sheet-light.png">Все 18 экранов · светлая</a> / <a href="../final/sheet-dark.png">тёмная</a></p><main>${cards}</main></html>`);
console.log(JSON.stringify({contrastChecks:contrast.length,minimumTextContrast:Math.min(...contrast.filter(x=>x.role!=='control').map(x=>x.ratio)),material,build:JSON.parse(readFileSync(`${dir}/manifest.json`)).build},null,2));
