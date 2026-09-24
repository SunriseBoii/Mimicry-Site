import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalLayout,mapScrollToProgress,ScrollCompositionController,type CanonicalLayout} from '../app/visual-lab/photonic-skin-ps04-m5/scroll-controller';
import {readingLayout} from '../app/_ps05/layout';
test('PS05: fractional footer offset stays reachable at the rounded browser scroll limit',()=>{
 const keys=['window','document','innerHeight'] as const;
 const previous=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
 try {
  Object.defineProperty(globalThis,'window',{configurable:true,value:{innerWidth:1440,innerHeight:900,scrollY:0}});
  Object.defineProperty(globalThis,'innerHeight',{configurable:true,value:900});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{scrollHeight:1800},querySelector:()=>({getAttribute:()=> 'true'}),querySelectorAll:()=>[
   {dataset:{node:'07'},offsetHeight:900,getBoundingClientRect:()=>({top:0})},
   {dataset:{node:'08'},offsetHeight:900,getBoundingClientRect:()=>({top:900.14})},
  ]}});
  const layout=readingLayout()!;
  assert.equal(mapScrollToProgress({layout,scrollY:900,viewportHeight:900,viewportWidth:1440,unlock:{competencies:true,brief:true},previousActive:'07'}).activeNodeId,'08');
 } finally {keys.forEach((key,i)=>{if(previous[i])Object.defineProperty(globalThis,key,previous[i]!);else Reflect.deleteProperty(globalThis,key)})}
});
test('PS05: long natural-reading sections use measured positions, not an index multiplied by viewport',()=>{
 const base=canonicalLayout(800,{competencies:true,brief:true});
 let y=0;const segments=base.segments.map(segment=>{const value={...segment,start:y,length:segment.id==='03.2'?1900:900};y+=value.length;return value;});
 const layout:CanonicalLayout={...base,documentHeight:y,segments,byId:Object.fromEntries(segments.map(segment=>[segment.id,segment])) as CanonicalLayout['byId'],chapters:{'03':undefined,'05':undefined,'06':undefined}};
 const active=mapScrollToProgress({scrollY:layout.byId['03.2']!.start+1300,viewportHeight:800,viewportWidth:390,unlock:{competencies:true,brief:true},previousActive:'03.2',layout});
 assert.equal(active.activeNodeId,'03.2');
 const controller=new ScrollCompositionController();controller.setLayoutAdapter(()=>layout);controller.setUnlock({competencies:true,brief:true});controller.scrollToNode('03.3','auto');
 assert.equal(controller.getProgress().activeNodeId,'03.3');assert.ok(controller.getProgress().scrollY>=layout.byId['03.3']!.start);
 controller.setLayoutAdapter(null);assert.equal(controller.layout().byId['03.3']!.start,4*900);
});
