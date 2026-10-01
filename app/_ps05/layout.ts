import type { CanonicalLayout } from '../visual-lab/photonic-skin-ps04-m5/scroll-controller';
import type { ScreenNodeId } from '../visual-lab/photonic-skin-ps04-m5/topology';
import { viewportFromCenter, type CompositionViewport } from '../visual-lab/photonic-skin-ps04-m5/composition';

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
export function ps05Composition(original:CompositionViewport,node:ScreenNodeId):CompositionViewport {
 const width=original.canvasCssWidth,height=original.canvasCssHeight;
 if(node==='08') return {...original,visible:false,actorDraw:false};
 const narrow=width<=1100;
 if(narrow) {
  const slot=document.querySelector<HTMLElement>(`[id="screen-${node}"] [data-actor-slot]`);
  const rect=slot?.getBoundingClientRect();
  if(!rect) return original;
  return viewportFromCenter({width,height,dpr:original.rendererDpr,centerX:rect.left+rect.width/2,centerY:rect.top+rect.height/2,size:Math.min(280,rect.width*.72,rect.height),visible:rect.bottom>72&&rect.top<height,identity:false,siteFitScale:original.siteFitScale,visualZoomMultiplier:original.visualZoomMultiplier,slot:original.slot});
 }
 // Map the established left/right presentation continuously into the reserved outer columns.
 const ratio=Math.max(0,Math.min(1,(original.cssCenterX/width-.245)/(.76-.245)));
 const x=width*(.21+ratio*.60);
 return viewportFromCenter({width,height,dpr:original.rendererDpr,centerX:x,centerY:original.cssCenterY,size:original.cssSize*.94,visible:original.visible,identity:false,siteFitScale:original.siteFitScale,visualZoomMultiplier:original.visualZoomMultiplier,slot:original.slot});
}
