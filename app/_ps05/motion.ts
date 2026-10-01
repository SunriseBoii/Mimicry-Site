import { SCREEN_NODE_BY_ID, type ScreenNodeId } from '../visual-lab/photonic-skin-ps04-m5/topology';
import { viewportFromCenter, type CompositionViewport } from '../visual-lab/photonic-skin-ps04-m5/composition';
import { isReadingFlow } from './layout';
import type { ScrollProgress } from '../visual-lab/photonic-skin-ps04-m5/scroll-controller';

const DURATION = 420;
const clamp = (value:number) => Math.max(0,Math.min(1,value));
const ease = (value:number) => value*value*(3-2*value);

/** Coarse offscreen guard; the exchange below sets the visual timing. */
export function scrollCopyOpacity(rect:{left:number;top:number;bottom:number},width:number,height:number,reading:boolean) {
 if(reading) return Math.min(clamp((height-rect.top)/140),clamp((rect.bottom-80)/140));
 const distance=Math.max(Math.abs(rect.left)/width,Math.abs(rect.top)/height);
 return distance<.015?1:clamp(1-distance/.72);
}

/** The old copy reaches zero within its reading position. The new copy stays
 * at zero until it has reached that same visible area. */
export function exchangeOpacity(distance:number,outgoing:boolean) {
 return outgoing?1-ease(clamp((distance-.025)/.315)):ease(clamp((.62-distance)/.50));
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

type Direct={from:ScreenNodeId;to:ScreenNodeId;axis:'X'|'Y';direction:number;incoming:number;exitOpacity:number;exit:HTMLElement|null};
export class Ps05Motion {
 private placement=new PlacementTransition();
 private direct:Direct|null=null;
 private copies:HTMLElement[]=[];
 private overlay:HTMLElement|null=null;
 private lastVisible=new Map<ScreenNodeId,{rect:{left:number;top:number;width:number};opacity:number}>();
 refresh(){this.copies=[...document.querySelectorAll<HTMLElement>('[data-ps05] [data-ps05-copy]')];}
 cancel(){this.overlay?.remove();this.overlay=null;this.direct=null;this.placement.cancel();}
 dispose(){this.cancel();for(const copy of this.copies){copy.style.removeProperty('opacity');copy.style.removeProperty('transform');copy.style.removeProperty('pointer-events');copy.inert=false;}this.copies=[];this.lastVisible.clear();}
 begin(from:ScreenNodeId,to:ScreenNodeId,current:CompositionViewport,reduced:boolean,now:number){
  if(from===to)return;
  const source=document.querySelector<HTMLElement>(`[id="screen-${from}"] [data-ps05-copy]`);
  const destination=document.querySelector<HTMLElement>(`[id="screen-${to}"] [data-ps05-copy]`);
  const root=document.querySelector<HTMLElement>('[data-ps05]');
  if(!source||!destination||!root)return;
  const visible=(el:HTMLElement)=>{const r=el.getBoundingClientRect();return r.bottom>80&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;};
  const sourceOnscreen=visible(source);
  const incoming=sourceOnscreen&&visible(destination)?Number(getComputedStyle(destination).opacity):0;
  let exit=this.direct?.exit??null;
  // Keep the actually visible outgoing layer on rapid reversal, not a fresh
  // fully opaque copy of an incoming layer which has barely appeared yet.
  if(!exit||Number(getComputedStyle(exit).opacity)<=Number(getComputedStyle(source).opacity)){
   exit?.remove();exit=null;
   const cached=this.lastVisible.get(from);
   if((sourceOnscreen||cached)&&!reduced){
    const rect=sourceOnscreen?source.getBoundingClientRect():cached!.rect;
    const sourceOpacity=sourceOnscreen?Number(getComputedStyle(source).opacity):cached!.opacity;
    exit=source.cloneNode(true) as HTMLElement;
    exit.inert=true;exit.setAttribute('aria-hidden','true');exit.removeAttribute('data-ps05-copy');exit.dataset.motionSnapshot='true';
    for(const el of [exit,...exit.querySelectorAll<HTMLElement>('*')])for(const attr of ['id','name','data-qa','aria-live','aria-labelledby','aria-describedby','aria-controls','for','tabindex'])el.removeAttribute(attr);
    Object.assign(exit.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,maxWidth:`${rect.width}px`,margin:'0',transform:'none',opacity:String(sourceOpacity),zIndex:'4',pointerEvents:'none'});
    exit.style.setProperty('width',`${rect.width}px`,'important');
    if(!this.overlay){
     this.overlay=document.createElement('div');
     Object.assign(this.overlay.style,{position:'fixed',inset:'0',zIndex:'4',pointerEvents:'none',background:'transparent'});
     document.body.appendChild(this.overlay);
    }
    this.overlay.className=root.className;
    this.overlay.dataset.theme=root.dataset.theme;
    this.overlay.dataset.reading=root.dataset.reading;
    // The exchange layer is outside the React root. Carry D1's inline tokens
    // across that boundary so outgoing text keeps the exact current theme.
    for(const name of root.style) if(name.startsWith('--')) this.overlay.style.setProperty(name,root.style.getPropertyValue(name));
    this.overlay.appendChild(exit);
   }
  }else{const rect=exit.getBoundingClientRect();exit.style.left=`${rect.left}px`;exit.style.top=`${rect.top}px`;exit.style.transform='none';}
  this.placement.begin(current,now);
  this.direct={from,to,axis:!isReadingFlow()&&!!SCREEN_NODE_BY_ID[from].chapterId&&SCREEN_NODE_BY_ID[from].chapterId===SCREEN_NODE_BY_ID[to].chapterId?'X':'Y',direction:SCREEN_NODE_BY_ID[to].index>SCREEN_NODE_BY_ID[from].index?1:-1,incoming,exit,exitOpacity:exit?Number(getComputedStyle(exit).opacity):0};
  if(!reduced){
   for(const copy of [source,destination]){copy.style.opacity='0';copy.style.pointerEvents='none';copy.inert=true;}
  }
  if(reduced)this.cancel();
 }
 beginWheel(progress:ScrollProgress,deltaY:number,current:CompositionViewport,reduced:boolean,now:number,layout:{segments:{id:ScreenNodeId;start:number}[]}){
  if(reduced||Math.abs(deltaY)<innerHeight*.58)return;
  const index=layout.segments.findIndex(segment=>segment.id===progress.activeNodeId);
  const direction=deltaY>0?1:-1;
  const next=layout.segments[index+direction];
  if(!next||index<0)return;
  if(this.direct?.from===progress.activeNodeId&&this.direct.to===next.id)return;
  if(isReadingFlow()){
   const boundary=direction>0?next.start:layout.segments[index].start;
   if(Math.abs(boundary-progress.scrollY)>Math.abs(deltaY)+innerHeight*.2)return;
  }
  this.begin(progress.activeNodeId,next.id,current,reduced,now);
 }
 update(target:CompositionViewport,reduced:boolean,now:number,progress?:ScrollProgress){
  const u=this.placement.progress(now),direct=this.direct,reading=isReadingFlow();
  if(this.overlay){
   const root=document.querySelector<HTMLElement>('[data-ps05]');
   if(root&&root.dataset.theme!==this.overlay.dataset.theme){
    this.overlay.dataset.theme=root.dataset.theme;
    for(const name of root.style)if(name.startsWith('--'))this.overlay.style.setProperty(name,root.style.getPropertyValue(name));
   }
  }
  for(const copy of this.copies){
   const section=copy.closest<HTMLElement>('[data-node]');if(!section)continue;
   const rect=section.getBoundingClientRect();
   const horizontal=!reading&&Math.abs(rect.left)>2&&Math.abs(rect.top)<innerHeight*.5&&rect.bottom>innerHeight*.5;
   const axis=horizontal?'X':'Y',extent=horizontal?innerWidth:innerHeight,offset=horizontal?rect.left:rect.top;
   const distance=Math.abs(offset)/extent,direction=progress?.direction??1;
   const outgoing=offset*direction<0;
   const longReading=reading&&copy.scrollHeight>innerHeight-170;
   let opacity=1,shift=0;
   if(!reduced){
    if(longReading){
     if(direction>0){
      if(rect.top>0)opacity=ease(clamp((innerHeight*.55-rect.top)/(innerHeight*.39)));
      else if(rect.bottom<innerHeight)opacity=ease(clamp((rect.bottom-innerHeight*.18)/(innerHeight*.34)));
     }else{
      if(rect.top>0)opacity=1-ease(clamp((rect.top-innerHeight*.02)/(innerHeight*.32)));
      else if(rect.bottom<innerHeight)opacity=ease(clamp((rect.bottom-innerHeight*.18)/(innerHeight*.42)));
     }
     shift=direction*(outgoing?-28*(1-opacity):28*(1-opacity));
    }else{
     opacity=exchangeOpacity(distance,outgoing);
     shift=-offset+direction*(outgoing?-28*(1-opacity):28*(1-opacity));
    }
    opacity=Math.min(opacity,scrollCopyOpacity(rect,innerWidth,innerHeight,reading));
   }
   if(direct&&section.dataset.node===direct.from&&!reduced){opacity=0;shift=0;}
   if(direct&&section.dataset.node===direct.to&&!reduced){
    const enter=ease(clamp((u-.18)/.82));
    opacity=direct.incoming+(1-direct.incoming)*enter;
    const destinationOffset=direct.axis==='X'?rect.left:rect.top;
    shift=-destinationOffset+direct.direction*28*(1-enter)*(1-direct.incoming);
   }
   copy.style.transform=reduced?'none':`translate${direct&&section.dataset.node===direct.to?direct.axis:axis}(${shift}px)`;
   copy.style.opacity=String(opacity);
   copy.style.pointerEvents=!reduced&&opacity<.98?'none':'';
   copy.inert=!reduced&&opacity<.02;
   const rendered=copy.getBoundingClientRect();
   if(opacity>.01&&rendered.bottom>80&&rendered.top<innerHeight&&rendered.right>0&&rendered.left<innerWidth){
    this.lastVisible.set(section.dataset.node as ScreenNodeId,{rect:{left:rendered.left,top:rendered.top,width:rendered.width},opacity});
   }
  }
  if(direct?.exit){const exit=ease(clamp(u/.55));direct.exit.style.opacity=String(direct.exitOpacity*(1-exit));direct.exit.style.transform=`translate${direct.axis}(${-direct.direction*28*exit}px)`;}
  const result=this.placement.sample(target,now,reduced);
  if(u>=1||reduced){this.overlay?.remove();this.overlay=null;this.direct=null;}
  return result;
 }
 needsClock(){return this.direct!==null;}
}
