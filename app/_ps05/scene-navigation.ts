import type { CanonicalLayout, ScrollHost } from '../visual-lab/photonic-skin-ps04-m5/scroll-controller';
import { SCREEN_NODE_BY_ID, type ScreenNodeId } from '../visual-lab/photonic-skin-ps04-m5/topology';
import { unit, type PageTransition } from './transition';

export const MOTION = { duration:600, reducedDuration:120, prepareLimit:1500, exitFraction:.4, desktopTravel:60, mobileTravel:32, waveDelay:200, waveDuration:800, waveBand:54 } as const;
export const INPUT = { wheelThreshold:48, gestureGap:180, directionRatio:1.2, swipeThreshold:44, boundaryHysteresis:24 } as const;
export type SceneSource = 'command'|'keyboard'|'wheel'|'touch'|'scrollbar'|'restore';
export type SceneSnapshot = { displayed:ScreenNodeId; preview:ScreenNodeId|null; target:ScreenNodeId|null; reading:number; arrival:number; arrivedAt:number; selecting:boolean; transition:PageTransition; source:SceneSource };

/** A gesture is consumed by either reading or a transition. Its tail cannot cross a scene boundary. */
export class WheelIntent {
 private last=-Infinity; private sign=0; private sum=0; private consumed=false; private reading=false;
 sample(delta:number,now:number,busy:boolean,canRead:boolean):'ignore'|'read'|'transition' {
  const fresh=now-this.last>INPUT.gestureGap;
  if(fresh){this.sum=0;this.sign=0;this.consumed=false;this.reading=false;}
  this.last=now;
  if(busy){this.consumed=true;return 'ignore';}
  if(this.consumed)return 'ignore';
  if(canRead){this.reading=true;return 'read';}
  if(this.reading){this.consumed=true;return 'ignore';}
  const sign=Math.sign(delta);
  if(sign!==this.sign){this.sum=0;this.sign=sign;}
  this.sum+=Math.abs(delta);
  if(this.sum<INPUT.wheelThreshold)return 'ignore';
  this.consumed=true;return 'transition';
 }
}

export function sceneAt(layout:CanonicalLayout,y:number,previous:ScreenNodeId|null):ScreenNodeId {
 const old=previous&&layout.byId[previous];
 if(old&&y>=old.start-INPUT.boundaryHysteresis&&y<old.start+old.length+INPUT.boundaryHysteresis)return old.id;
 return (layout.segments.find(s=>y<s.start+s.length)??layout.segments.at(-1)!).id;
}
export function sceneDirection(from:ScreenNodeId,to:ScreenNodeId) {
 return {axis:from.startsWith('03.')&&to.startsWith('03.')?'x' as const:'y' as const,sign:SCREEN_NODE_BY_ID[to].index>SCREEN_NODE_BY_ID[from].index?1:-1};
}

/** PS-05 mode of the existing controller. No RAF, native smooth scroll or idle/settle timer. */
export class SceneNavigation {
 displayed:ScreenNodeId='01'; preview:ScreenNodeId|null=null; reading=0; arrival=0; arrivedAt=0;
 private running:{from:ScreenNodeId;to:ScreenNodeId;start:number;requestedAt:number;waiting:boolean;progress:number;fromReading:number;toReading:number;source:SceneSource}|null=null;
 private source:SceneSource='restore'; private selecting=false; private held=false;
 private queued:ScreenNodeId|null=null; private expectedY:number|null=null; private lastY=0; private dragMoved=false;
 private nativeInput:'touch'|'wheel'|null=null;
 private wheel=new WheelIntent(); private touch:{x:number;y:number;lastY:number;used:boolean;reading:boolean;target:EventTarget|null}|null=null;
 constructor(private env:{host:()=>ScrollHost|null;layout:()=>CanonicalLayout;now:()=>number;notify:()=>void;blocked:()=>boolean;reduced:()=>boolean;ready?:(id:ScreenNodeId)=>boolean}){}
 snapshot():SceneSnapshot {
  const r=this.running,layout=this.env.layout();
  const from=r?.from??this.displayed,to=r?.to??this.displayed;
  return {displayed:this.displayed,preview:this.preview,target:r?.to??null,reading:this.reading,arrival:this.arrival,arrivedAt:this.arrivedAt,selecting:this.selecting,source:this.source,
   transition:{from,to,progress:r?.progress??1,start:0,end:1,fromStart:layout.byId[from]?.start??0,toStart:layout.byId[to]?.start??0,direct:true,fromReading:r?.fromReading??this.reading,toReading:r?.toReading??this.reading,...sceneDirection(from,to)}};
 }
 busy(){return this.running!==null;}
 maxRead(id=this.displayed){const s=this.env.layout().byId[id];return Math.max(0,(s?.length??0)-this.env.layout().viewportHeight);}
 private write(y:number){const h=this.env.host();if(!h||this.selecting)return;this.expectedY=Math.round(y);this.lastY=this.expectedY;h.scrollTo({top:this.expectedY,behavior:'instant' as ScrollBehavior});}
 request(id:ScreenNodeId,source:SceneSource='command') {
  if(!this.env.layout().byId[id]||this.env.blocked())return false;
  if(source==='restore'){
   this.running=null;
   const changed=this.displayed!==id;
   this.displayed=id;this.reading=0;this.preview=null;this.selecting=false;this.queued=null;this.source=source;
   this.write(this.env.layout().byId[id]!.start);
   if(changed||!this.arrival){this.arrival++;this.arrivedAt=this.env.now();}
   this.env.notify();return true;
  }
  if(this.running||this.selecting||id===this.displayed)return false;
  if(source==='command'||source==='keyboard')this.nativeInput=null;
  const toReading=source==='scrollbar'?Math.min(this.maxRead(id),Math.max(0,this.lastY-this.env.layout().byId[id]!.start)):0;
  this.source=source;this.preview=null;
  this.running={from:this.displayed,to:id,start:this.env.now(),requestedAt:this.env.now(),waiting:!!this.env.ready&&!this.env.ready(id)&&!this.env.reduced(),progress:0,fromReading:this.reading,toReading,source};
  // A single native position update, never an animated scroll competing with a hand.
  if(source!=='scrollbar')this.write(this.env.layout().byId[id]!.start);
  this.env.notify();return true;
 }
 tick(now:number){
  const r=this.running;if(!r)return;
  if(r.waiting){
   // Frozen GPU resources may need preparation. Keep the complete old scene until ready;
   // the shared 600 ms clock starts only once. A missing renderer cannot lock the DOM.
   if(!this.env.ready?.(r.to)&&now-r.requestedAt<MOTION.prepareLimit)return;
   r.waiting=false;r.start=now;
  }
  r.progress=unit((now-r.start)/(this.env.reduced()?MOTION.reducedDuration:MOTION.duration));if(r.progress===1)this.finish();else this.env.notify();
 }
 finish(){
  const r=this.running;if(!r)return;
  this.running=null;this.displayed=r.to;this.reading=r.toReading;this.arrival++;this.arrivedAt=this.env.now();this.source=r.source;
  if(typeof document!=='undefined'){
   if(r.source!=='restore'){const hash=`#screen-${r.to}`;if(location.hash!==hash)history.pushState({node:r.to},'',hash);}
   if(r.source==='keyboard'||r.source==='command'){
    // Inert is cleared by the synchronous publish before focus is assigned.
    this.env.notify();
    if(!document.activeElement?.closest('nav,header'))document.getElementById(`heading-${r.to}`)?.focus({preventScroll:true});
   }
  }
  this.env.notify();
  const queued=this.queued;this.queued=null;if(queued&&!this.selecting)this.request(queued,'scrollbar');
 }
 resize(){
  this.finish();this.reading=Math.min(this.reading,this.maxRead());
  if(!this.selecting)this.write((this.env.layout().byId[this.displayed]?.start??0)+this.reading);
  this.env.notify();
 }
 nativeScroll(){
  const y=this.env.host()?.scrollY??0;
  if(this.expectedY!==null&&Math.abs(y-this.expectedY)<2){this.expectedY=null;this.lastY=y;return;}
  if(Math.abs(y-this.lastY)<.5)return;
  this.expectedY=null;this.lastY=y;
  if(this.env.blocked())return;
  // Native panning starting in an editable/nested element is reading, never a
  // scrollbar choice. Contain its momentum at this scene's boundary.
  if(this.nativeInput&&!this.held&&!this.selecting){
   const start=this.env.layout().byId[this.displayed]!.start;
   if(!this.running)this.reading=Math.min(this.maxRead(),Math.max(0,y-start));
   const bounded=start+this.reading;
   if(Math.abs(y-bounded)>1)this.write(bounded);
   this.env.notify();return;
  }
  this.selecting=true;
  this.dragMoved=true;
  this.preview=sceneAt(this.env.layout(),y,this.preview??this.displayed);
  if(this.preview===this.displayed&&!this.running)this.reading=Math.min(this.maxRead(),Math.max(0,y-this.env.layout().byId[this.displayed]!.start));
  this.env.notify();
 }
 release(){
  if(!this.selecting||this.held)return;
  const id=this.preview;this.selecting=false;this.preview=null;
  if(id&&this.running)this.queued=id;
  else if(id)this.request(id,'scrollbar');
  this.env.notify();
 }
 private blockedTarget(target:EventTarget|null){return typeof Element!=='undefined'&&target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="listbox"],dialog[open]');}
 private nested(target:EventTarget|null,delta:number,horizontal=false){
  if(typeof Element==='undefined'||!(target instanceof Element))return false;
  for(let e:Element|null=target;e&&e!==document.body;e=e.parentElement){
   const css=getComputedStyle(e),overflow=horizontal?css.overflowX:css.overflowY;
   const length=horizontal?e.scrollWidth-e.clientWidth:e.scrollHeight-e.clientHeight,pos=horizontal?e.scrollLeft:e.scrollTop;
   if(/auto|scroll/.test(overflow)&&length>1&&(delta>0?pos<length-1:pos>1))return true;
  }return false;
 }
 private read(delta:number){this.reading=Math.min(this.maxRead(),Math.max(0,this.reading+delta));this.write(this.env.layout().byId[this.displayed]!.start+this.reading);this.env.notify();}
 private canRead(delta:number){return delta>0?this.reading<this.maxRead()-1:this.reading>1;}
 private neighbor(delta:number,horizontal=false){const a=this.env.layout().segments,i=a.findIndex(s=>s.id===this.displayed),id=a[i+(delta>0?1:-1)]?.id;return id&&(!horizontal||(id.startsWith('03.')&&this.displayed.startsWith('03.')))?id:null;}
 private onWheel=(raw:Event)=>{
  const e=raw as WheelEvent;if(e.ctrlKey||e.metaKey)return;this.nativeInput='wheel';if(this.env.blocked()||this.blockedTarget(e.target))return;
  const horizontal=Math.abs(e.deltaX)>Math.abs(e.deltaY)*INPUT.directionRatio;
  const value=horizontal?e.deltaX:e.deltaY;if(!value||this.nested(e.target,value,horizontal))return;
  const next=this.neighbor(value,horizontal);if(horizontal&&!next)return;
  e.preventDefault();
  const delta=value*(e.deltaMode===1?16:e.deltaMode===2?this.env.layout().viewportHeight:1);
  const action=this.wheel.sample(delta,this.env.now(),this.busy()||this.selecting,!horizontal&&this.canRead(delta));
  if(action==='read')this.read(delta);else if(action==='transition'&&next)this.request(next,'wheel');
 };
 private onKey=(raw:Event)=>{
  const e=raw as KeyboardEvent;if(this.env.blocked()||this.blockedTarget(e.target)||e.ctrlKey||e.metaKey||e.altKey)return;
  if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','PageDown','PageUp','Home','End',' '].includes(e.key))return;
  if(e.key===' '&&e.target instanceof Element&&e.target.closest('button,a,summary'))return;
  const delta=['ArrowUp','ArrowLeft','PageUp','Home'].includes(e.key)||e.shiftKey?-1:1,horizontal=['ArrowLeft','ArrowRight'].includes(e.key);
  if(this.nested(e.target,delta,horizontal))return;
  const next=e.key==='Home'?'01':e.key==='End'?'08':this.neighbor(delta,horizontal);
  if(horizontal&&!next)return;
  e.preventDefault();if(e.repeat||this.busy()||this.selecting)return;
  if(['PageDown','PageUp',' '].includes(e.key)&&this.canRead(delta)){this.read(delta*this.env.layout().viewportHeight*.75);return;}
  if(next)this.request(next,'keyboard');
 };
 private onTouchStart=(raw:Event)=>{const e=raw as TouchEvent,t=e.touches[0];this.nativeInput='touch';this.touch=e.touches.length===1&&!this.blockedTarget(e.target)?{x:t.clientX,y:t.clientY,lastY:t.clientY,used:false,reading:false,target:e.target}:null;};
 private onTouchMove=(raw:Event)=>{
  const e=raw as TouchEvent,t=e.touches[0],g=this.touch;if(!g||e.touches.length!==1||this.env.blocked())return;
  const delta=g.lastY-t.clientY;g.lastY=t.clientY;
  const dx=g.x-t.clientX,dy=g.y-t.clientY;
  if(Math.abs(dx)>Math.abs(dy)||this.nested(g.target,delta)||window.getSelection()?.type==='Range')return;
  e.preventDefault();if(g.used||this.busy()||this.selecting){g.used=true;return;}
  if(this.canRead(delta)){g.reading=true;this.read(delta);return;}
  if(g.reading){g.used=true;return;}
  if(Math.abs(dy)<INPUT.swipeThreshold)return;
  g.used=true;const next=this.neighbor(dy);if(next)this.request(next,'touch');
 };
 private onTouchEnd=()=>{this.touch=null;};
 private onDown=(raw:Event)=>{const e=raw as PointerEvent;if(e.pointerType==='mouse'){this.nativeInput=null;if(e.clientX>=document.documentElement.clientWidth){this.held=true;this.dragMoved=false;this.selecting=true;this.preview=this.displayed;this.env.notify();}}};
 private onUp=()=>{this.held=false;const host=this.env.host();if(!this.dragMoved)this.release();else if(host&&!('onscrollend' in host))host.requestAnimationFrame(()=>this.release());};
 private onEnd=(event:Event)=>{if(event.target!==document&&event.target!==window)return;this.nativeInput=null;this.release();};
 private onVisibility=()=>{if(document.hidden){this.held=false;this.selecting=false;this.preview=null;this.queued=null;this.finish();this.env.notify();}};
 private onFocus=(event:Event)=>{
  if(this.busy()||this.selecting||!(event.target instanceof HTMLElement)||event.target.closest('[data-node]')?.getAttribute('data-node')!==this.displayed)return;
  const rect=event.target.getBoundingClientRect(),height=this.env.layout().viewportHeight,top=innerWidth<=1100?146:82;
  if(rect.bottom>height-24)this.read(rect.bottom-height+32);
  else if(rect.top<top)this.read(rect.top-top-8);
 };
 attach(host:ScrollHost){
  this.lastY=host.scrollY;
  const current=this.env.layout().byId[this.displayed];
  if(current&&(host.scrollY<current.start||host.scrollY>=current.start+current.length))this.write(current.start+this.reading);
  const events:[string,EventListener,AddEventListenerOptions][]=[['wheel',this.onWheel,{passive:false}],['keydown',this.onKey,{capture:true}],['touchstart',this.onTouchStart,{passive:true}],['touchmove',this.onTouchMove,{passive:false}],['touchend',this.onTouchEnd,{}],['touchcancel',this.onTouchEnd,{}],['pointerdown',this.onDown,{capture:true}],['pointerup',this.onUp,{capture:true}],['pointercancel',this.onUp,{capture:true}],['scrollend',this.onEnd,{}]];
  events.push(['focusin',this.onFocus,{}]);
  for(const [name,fn,options] of events)host.addEventListener(name,fn,options);
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.onVisibility);
  return()=>{for(const [name,fn,options] of events)host.removeEventListener(name,fn,options);if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.onVisibility);};
 }
}
