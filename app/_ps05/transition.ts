import type { CanonicalLayout } from '../visual-lab/photonic-skin-ps04-m5/scroll-controller';
import type { ScreenNodeId } from '../visual-lab/photonic-skin-ps04-m5/topology';

export const TRANSITION = { duration: 560, travel: 28, mobileTravel: 18, window: .8, hysteresis: .025 } as const;
export const unit = (n:number) => Math.max(0,Math.min(1,n));
export const smooth = (n:number) => {const t=unit(n);return t*t*(3-2*t)};
export type PageTransition = {from:ScreenNodeId;to:ScreenNodeId;progress:number;start:number;end:number;fromStart:number;toStart:number;direct?:boolean;axis?:'x'|'y';sign?:number;fromReading?:number;toReading?:number};

/** Position, not input direction or an idle timer, defines the reversible image. */
export function pageTransition(layout:CanonicalLayout,y:number):PageTransition {
 let index=0;
 for(let i=0;i<layout.segments.length;i++)if(y>=layout.segments[i].start)index=i;
 const from=layout.segments[index],to=layout.segments[index+1]??from;
 const end=to.start,start=Math.max(from.start,end-layout.viewportHeight*TRANSITION.window);
 return {from:from.id,to:to.id,progress:from===to?0:unit((y-start)/Math.max(1,end-start)),start,end,fromStart:from.start,toStart:to.start};
}
export function displayedNode(t:PageTransition,previous:ScreenNodeId):ScreenNodeId {
 const threshold=previous===t.to ? .5-TRANSITION.hysteresis : .5+TRANSITION.hysteresis;
 return t.progress>=threshold?t.to:t.from;
}
export function textPhase(progress:number,incoming:boolean) {
 const phase=incoming?unit((progress-.48)/.46):unit((progress-.06)/.42);
 return {opacity:incoming?smooth(phase):1-smooth(phase),phase};
}
