import { textPhase, TRANSITION } from './transition';
import { viewportFromCenter, type CompositionViewport } from '../visual-lab/photonic-skin-ps04-m5/composition';
import { isReadingFlow } from './layout';
import type { ScrollProgress } from '../visual-lab/photonic-skin-ps04-m5/scroll-controller';
import { MOTION } from './scene-navigation';

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

/** Real DOM blocks retain their section, inherited type and wrapping on every frame. */
export class Ps05Motion {
 private waveUntil=0;
 private arrival=-1;
 private copies:HTMLElement[]=[];
 refresh(){this.copies=[...document.querySelectorAll<HTMLElement>('[data-ps05] [data-ps05-copy]')];}
 dispose(){for(const copy of this.copies){copy.style.removeProperty('opacity');copy.style.removeProperty('transform');copy.style.removeProperty('pointer-events');copy.inert=false;}this.copies=[];}
 update(target:CompositionViewport,reduced:boolean,_now:number,progress?:ScrollProgress){
  if(progress?.scene)return this.updateScene(target,reduced,_now,progress);
  const t=progress?.transition;if(!t)return target;
  const reading=isReadingFlow(),travel=innerWidth<=600?TRANSITION.mobileTravel:TRANSITION.travel;
  for(const copy of this.copies){
   const section=copy.closest<HTMLElement>('[data-node]');if(!section)continue;
   const id=section.dataset.node,rect=section.getBoundingClientRect();
   const incoming=id===t.to&&t.from!==t.to,outgoing=id===t.from;
   const visible=incoming||outgoing;
   const sample=textPhase(t.progress,incoming);
   const opacity=!visible?0:reduced?(id===progress.activeNodeId?1:0):t.from===t.to?1:sample.opacity;
   const long=reading&&copy.scrollHeight>innerHeight-190;
   const hold=outgoing&&long?Math.max(0,progress.scrollY-t.start):-rect.top;
   const local=reduced?0:incoming?travel*(1-sample.phase):-travel*sample.phase;
   const y=long&&outgoing?hold+local:-rect.top+local;
   copy.style.transform=reduced?'none':`translate(${-rect.left}px, ${y}px)`;
   if(long&&outgoing&&t.progress===0)copy.style.transform='none';
   copy.style.opacity=String(opacity);
   copy.style.setProperty('--sweep',`${150-sample.phase*200}%`);
   copy.dataset.shimmer=String(!reduced&&visible&&sample.phase>0&&sample.phase<1);
   copy.style.pointerEvents=opacity<.9?'none':'';
   copy.inert=id!==progress.activeNodeId||opacity<.9;
   section.inert=copy.inert;
   section.setAttribute('aria-hidden',String(copy.inert));
  }
  return target;
 }
 private updateScene(target:CompositionViewport,reduced:boolean,now:number,progress:ScrollProgress){
  const scene=progress.scene!,t=scene.transition,running=!!scene.target;
  if(this.arrival!==scene.arrival){this.arrival=scene.arrival;this.waveUntil=reduced?0:scene.arrivedAt+MOTION.waveDelay+MOTION.waveDuration;}
  const wave=now-scene.arrivedAt-MOTION.waveDelay;
  for(const copy of this.copies){
   const section=copy.closest<HTMLElement>('[data-node]');if(!section)continue;
   const id=section.dataset.node,incoming=running&&id===t.to,outgoing=id===t.from,visible=incoming||outgoing;
   section.style.visibility=visible?'visible':'hidden';
   const reading=incoming?(t.toReading??0):outgoing?(t.fromReading??0):0;
   section.style.top=`${-reading}px`;
   const phase=incoming?clamp((t.progress-MOTION.exitFraction)/(1-MOTION.exitFraction)):clamp(t.progress/MOTION.exitFraction);
   const eased=incoming?1-Math.pow(1-phase,3):ease(phase);
   const opacity=!visible?0:!running?1:incoming?eased:1-eased;
   // Keep the visible edge of long/scrolled content inside the viewport until opacity reaches zero.
   const rect=copy.getBoundingClientRect(),matrix=new DOMMatrixReadOnly(getComputedStyle(copy).transform);
   const naturalTop=rect.top-matrix.m42,naturalBottom=rect.bottom-matrix.m42;
   const desired=innerWidth<=600?MOTION.mobileTravel:MOTION.desktopTravel;
   const space=(t.sign??1)>0?naturalTop-8:innerHeight-naturalBottom-8;
   // A long section already extends outside the reading viewport. Move its visible
   // reading fragment as a block too; do not turn a boundary exit into a static fade.
   const travel=t.axis==='x'||space<=0?desired:Math.min(desired,space);
   const move=!running||reduced?0:(incoming?1-eased:-eased)*travel*(t.sign??1);
   copy.style.transform=t.axis==='x'?`translate3d(${move}px,0,0)`:`translate3d(0,${move}px,0)`;
   copy.style.opacity=String(opacity);copy.style.pointerEvents=!running&&id===scene.displayed?'':'none';
   section.inert=running||id!==scene.displayed;copy.inert=section.inert;section.setAttribute('aria-hidden',String(section.inert));
   copy.dataset.shimmer='false';
   const fields=[...copy.querySelectorAll<HTMLElement>('[data-color-flow]')];
   const flowing=!running&&id===scene.displayed&&!reduced&&wave>=0&&wave<MOTION.waveDuration;
   if(flowing&&fields.length){
    const first=fields[0].getBoundingClientRect().top,last=fields.at(-1)!.getBoundingClientRect().bottom;
    const y=-MOTION.waveBand+(last-first+MOTION.waveBand)*clamp(wave/MOTION.waveDuration);
    for(const field of fields){const offset=field.getBoundingClientRect().top-first;field.style.setProperty('--band-start',`${y-offset}px`);field.style.setProperty('--band-end',`${y+MOTION.waveBand-offset}px`);field.dataset.wave='true';}
   }else if(!running||!outgoing){for(const field of fields)field.dataset.wave='false';}
  }
  return target;
 }
 needsClock(){return this.waveUntil>performance.now();}
}
