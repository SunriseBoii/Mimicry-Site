import type { CanonicalLayout } from '../visual-lab/photonic-skin-ps04-m5/scroll-controller';
import { SCREEN_NODE_BY_ID, type ScreenNodeId } from '../visual-lab/photonic-skin-ps04-m5/topology';
import { smooth, type PageTransition } from './transition';
import { actorSquareCss, placementCenter, viewportFromCenter, type CompositionViewport } from '../visual-lab/photonic-skin-ps04-m5/composition';

/** One native scrollbar: each range contains reading distance followed by a scene selection range. */
export function sceneLayout():CanonicalLayout|null {
 const root=document.querySelector<HTMLElement>('[data-ps05]');if(!root)return null;
 let start=0;
 const segments=[...root.querySelectorAll<HTMLElement>('[data-node]')].map(element=>{
  const length=Math.max(innerHeight,element.offsetHeight);
  const segment={id:element.dataset.node as ScreenNodeId,start,length};start+=length;return segment;
 });
 if(!segments.length)return null;
 const documentHeight=start+innerHeight;
 root.style.setProperty('--scene-document-height',`${documentHeight}px`);
 return {viewportHeight:innerHeight,documentHeight,segments,byId:Object.fromEntries(segments.map(s=>[s.id,s])) as CanonicalLayout['byId'],chapters:{'03':undefined,'05':undefined,'06':undefined}};
}

export const isReadingFlow = () => typeof window !== 'undefined' && (window.innerWidth <= 1100 || window.innerHeight < 800 || document.querySelector('[data-ps05]')?.getAttribute('data-reading') === 'true');

/** Measured layout only for natural reading; the desktop canonical topology stays intact. */
export function readingLayout(): CanonicalLayout | null {
 if (!isReadingFlow()) return null;
 const sections=[...document.querySelectorAll<HTMLElement>('[data-ps05] [data-node]')];
 if(!sections.length) return null;
 // Native wheel positions are integral CSS pixels in Chromium. A measured
 // start at e.g. 4619.14 must commit the section when wheel lands on 4619.
 const segments=sections.map(element=>({id:element.dataset.node as ScreenNodeId,start:Math.round(element.getBoundingClientRect().top+window.scrollY),length:element.offsetHeight}));
 // CSS heights may be fractional while scrollHeight is rounded to whole pixels.
 // Keep the final anchor reachable at the browser's actual maximum scroll.
 const last=segments.at(-1);
 if(last) last.start=Math.min(last.start,Math.max(0,document.documentElement.scrollHeight-innerHeight));
 const byId=Object.fromEntries(segments.map(segment=>[segment.id,segment])) as CanonicalLayout['byId'];
 return {viewportHeight:innerHeight,documentHeight:document.documentElement.scrollHeight,segments,byId,chapters:{'03':undefined,'05':undefined,'06':undefined}};
}

/** Outer presentation slot only. Frozen camera, model scale, material and endpoint remain untouched. */
export function ps05Composition(original:CompositionViewport,node:ScreenNodeId,transition?:PageTransition):CompositionViewport {
 const width=original.canvasCssWidth,height=original.canvasCssHeight;
 if(node==='08'&&(!transition||transition.from===transition.to)) return {...original,visible:false,actorDraw:false};
 const narrow=width<=1100;
 if(narrow) {
  const slot=document.querySelector<HTMLElement>(`[id="screen-${node}"] [data-actor-slot]`);
  let rect=slot?.getBoundingClientRect();
  if(!rect) return original;
  if(transition&&transition.from!==transition.to){
   const a=document.querySelector<HTMLElement>(`[id="screen-${transition.from}"] [data-actor-slot]`)?.getBoundingClientRect();
   const b=document.querySelector<HTMLElement>(`[id="screen-${transition.to}"] [data-actor-slot]`)?.getBoundingClientRect();
   const u=smooth(transition.progress);
   if(a&&b)rect=new DOMRect(a.x+(b.x-a.x)*u,a.y+(b.y-a.y)*u,a.width+(b.width-a.width)*u,a.height+(b.height-a.height)*u);
  }
  return viewportFromCenter({width,height,dpr:original.rendererDpr,centerX:rect.left+rect.width/2,centerY:rect.top+rect.height/2,size:Math.min(280,rect.width*.72,rect.height),visible:rect.bottom>72&&rect.top<height,identity:false,siteFitScale:original.siteFitScale,visualZoomMultiplier:original.visualZoomMultiplier,slot:original.slot});
 }
 // Map the established left/right presentation continuously into the reserved outer columns.
 const side=(id:ScreenNodeId)=>SCREEN_NODE_BY_ID[id].actorPlacement==='left'?0:1;
 const ratio=transition?side(transition.from)+(side(transition.to)-side(transition.from))*smooth(transition.progress):side(node);
 const leftLane=width-248-Math.min(width*.51,width-620);
 const baseSize=actorSquareCss(width,height);
 const leftSize=Math.min(baseSize*.94,leftLane*.82);
 const copyRight=Math.min(width*.6,1080)+Math.min(84,Math.max(24,width*.044));
 const rightEdge=width-248;
 const rightSize=Math.min(baseSize*.94,Math.max(190,(rightEdge-copyRight)*1.2));
 const left=leftLane/2,right=(copyRight+rightEdge)/2;
 const x=left+(right-left)*ratio;
 return viewportFromCenter({width,height,dpr:original.rendererDpr,centerX:x,centerY:placementCenter('right',width,height,baseSize,0).y,size:leftSize+(rightSize-leftSize)*ratio,visible:true,identity:false,siteFitScale:original.siteFitScale,visualZoomMultiplier:original.visualZoomMultiplier,slot:original.slot});
}
