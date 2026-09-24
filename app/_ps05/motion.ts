import { SCREEN_NODE_BY_ID, type ScreenNodeId } from '../visual-lab/photonic-skin-ps04-m5/topology';
import { viewportFromCenter, type CompositionViewport } from '../visual-lab/photonic-skin-ps04-m5/composition';
import { isReadingFlow } from './layout';

const DURATION = 420;
const clamp = (value:number) => Math.max(0,Math.min(1,value));
const ease = (value:number) => value*value*(3-2*value);

/** Native parent tracks supply spatial movement. Long reading sections retain
 * a fully opaque plateau; only their real viewport entry/exit fades. */
export function scrollCopyOpacity(rect:{left:number;top:number;bottom:number},width:number,height:number,reading:boolean) {
 if(reading) return Math.min(clamp((height-rect.top)/140),clamp((rect.bottom-80)/140));
 const distance=Math.max(Math.abs(rect.left)/width,Math.abs(rect.top)/height);
 return distance<.015?1:clamp(1-distance/.72);
}

/** Outer placement only. Retarget from the rendered position and sample the
 * live destination so fresh wheel/resize cannot complete to a stale slot. */
export class PlacementTransition {
 private from:CompositionViewport|null=null;
 private start=0;
 begin(from:CompositionViewport,now:number){this.from=from;this.start=now;}
 progress(now:number){return this.from?clamp((now-this.start)/DURATION):1;}
 cancel(){this.from=null;}
 sample(target:CompositionViewport,now:number,reduced=false):CompositionViewport {
  const u=ease(this.progress(now)),from=this.from;
  if(!from||u>=1||reduced){this.cancel();return target;}
  return viewportFromCenter({width:target.canvasCssWidth,height:target.canvasCssHeight,dpr:target.rendererDpr,
   centerX:from.cssCenterX+(target.cssCenterX-from.cssCenterX)*u,
   centerY:from.cssCenterY+(target.cssCenterY-from.cssCenterY)*u,
   size:from.cssSize+(target.cssSize-from.cssSize)*u,
   visible:target.visible,identity:target.identity,siteFitScale:target.siteFitScale,visualZoomMultiplier:target.visualZoomMultiplier,slot:target.slot});
 }
}

type Direct={to:ScreenNodeId;axis:'X'|'Y';direction:number;incoming:number;exitOpacity:number;exit:HTMLElement|null};
export class Ps05Motion {
 private placement=new PlacementTransition();
 private direct:Direct|null=null;
 private copies:HTMLElement[]=[];
 refresh(){this.copies=[...document.querySelectorAll<HTMLElement>('[data-ps05] [data-ps05-copy]')];}
 cancel(){this.direct?.exit?.remove();this.direct=null;this.placement.cancel();}
 dispose(){this.cancel();for(const copy of this.copies){copy.style.removeProperty('opacity');copy.style.removeProperty('transform');}this.copies=[];}
 begin(from:ScreenNodeId,to:ScreenNodeId,current:CompositionViewport,reduced:boolean,now:number){
  if(from===to)return;
  const source=document.querySelector<HTMLElement>(`[id="screen-${from}"] [data-ps05-copy]`);
  const destination=document.querySelector<HTMLElement>(`[id="screen-${to}"] [data-ps05-copy]`);
  const root=document.querySelector<HTMLElement>('[data-ps05]');
  if(!source||!destination||!root)return;
  const visible=(el:HTMLElement)=>{const r=el.getBoundingClientRect();return r.bottom>80&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;};
  const incoming=visible(destination)?Number(getComputedStyle(destination).opacity):0;
  let exit=this.direct?.exit??null;
  // Keep the actually visible outgoing layer on rapid reversal, not a fresh
  // fully opaque copy of an incoming layer which has barely appeared yet.
  if(!exit||Number(getComputedStyle(exit).opacity)<=Number(getComputedStyle(source).opacity)){
   exit?.remove();exit=null;
   if(visible(source)&&!reduced){
    const rect=source.getBoundingClientRect();exit=source.cloneNode(true) as HTMLElement;
    exit.inert=true;exit.setAttribute('aria-hidden','true');exit.removeAttribute('data-ps05-copy');exit.dataset.motionSnapshot='true';
    for(const el of [exit,...exit.querySelectorAll<HTMLElement>('*')])for(const attr of ['id','name','data-qa'])el.removeAttribute(attr);
    Object.assign(exit.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,maxWidth:`${rect.width}px`,margin:'0',transform:'none',zIndex:'4',pointerEvents:'none'});
    exit.style.setProperty('width',`${rect.width}px`,'important');root.appendChild(exit);
   }
  }else{const rect=exit.getBoundingClientRect();exit.style.left=`${rect.left}px`;exit.style.top=`${rect.top}px`;exit.style.transform='none';}
  this.placement.begin(current,now);
  this.direct={to,axis:!isReadingFlow()&&!!SCREEN_NODE_BY_ID[from].chapterId&&SCREEN_NODE_BY_ID[from].chapterId===SCREEN_NODE_BY_ID[to].chapterId?'X':'Y',direction:SCREEN_NODE_BY_ID[to].index>SCREEN_NODE_BY_ID[from].index?1:-1,incoming,exit,exitOpacity:exit?Number(getComputedStyle(exit).opacity):0};
  if(reduced)this.cancel();
 }
 update(target:CompositionViewport,reduced:boolean,now:number){
  const u=this.placement.progress(now),direct=this.direct,reading=isReadingFlow();
  for(const copy of this.copies){
   const section=copy.closest<HTMLElement>('[data-node]');if(!section)continue;
   // Native tracks own the full-screen displacement: never translate twice.
   copy.style.transform='none';
   const rect=(reading?copy:section).getBoundingClientRect();
   let opacity=reduced?1:scrollCopyOpacity(rect,innerWidth,innerHeight,reading);
   if(direct&&section.dataset.node===direct.to&&!reduced){
    const enter=ease(clamp((u-.18)/.82));
    opacity*=direct.incoming+(1-direct.incoming)*enter;
    copy.style.transform=`translate${direct.axis}(${direct.direction*24*(1-enter)*(1-direct.incoming)}px)`;
   }
   copy.style.opacity=String(opacity);
  }
  if(direct?.exit){const exit=ease(clamp(u/.55));direct.exit.style.opacity=String(direct.exitOpacity*(1-exit));direct.exit.style.transform=`translate${direct.axis}(${-direct.direction*28*exit}px)`;}
  const result=this.placement.sample(target,now,reduced);
  if(u>=1||reduced){this.direct?.exit?.remove();this.direct=null;}
  return result;
 }
 needsClock(){return this.direct!==null;}
}
