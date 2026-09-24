import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalLayout,ScrollCompositionController} from '../app/visual-lab/photonic-skin-ps04-m5/scroll-controller';
import {scrollCopyOpacity,PlacementTransition} from '../app/_ps05/motion';
import {viewportFromCenter} from '../app/visual-lab/photonic-skin-ps04-m5/composition';

test('FIX-02: native wheel landing on the CSS section start releases the visible task screen',()=>{
 const controller=new ScrollCompositionController();
 controller.setCssAnchorAlignment(true);
 // Replay real browser samples: 02 is committed at +2; wheel stops exactly at
 // the next CSS anchor, inside the magnetic no-op radius. No navigation call.
 const replay=controller as unknown as {viewport:{width:number;height:number};applyScroll:(y:number,force:boolean)=>void};
 replay.viewport={width:1840,height:944};
 replay.applyScroll(946,false);
 assert.equal(controller.getProgress().activeNodeId,'02');
 replay.applyScroll(1888,false);
 assert.equal(controller.getProgress().activeNodeId,'03.1');
});

test('FIX-01: scroll fades visible outgoing/incoming blocks on both axes, with an opaque reading plateau',()=>{
 for(const axis of ['left','top'] as const){
  const extent=axis==='left'?1840:944;
  const opacity=(offset:number)=>scrollCopyOpacity({left:0,top:0,bottom:944,[axis]:offset},1840,944,false);
  assert.equal(opacity(0),1);assert.equal(opacity(2),1);
  assert.ok(opacity(-extent*.2)<1&&opacity(-extent*.2)>0);
  assert.ok(opacity(extent*.6)>0&&opacity(extent*.6)<1);
  assert.equal(opacity(-extent*.2),opacity(extent*.2));
 }
 assert.equal(scrollCopyOpacity({left:20,top:-600,bottom:1100},390,844,true),1);
 assert.equal(scrollCopyOpacity({left:20,top:112,bottom:730},390,844,true),1);
 assert.ok(scrollCopyOpacity({left:20,top:780,bottom:1800},390,844,true)<1);
 assert.ok(scrollCopyOpacity({left:20,top:-1100,bottom:130},390,844,true)<1);
});

test('FIX-03: program placement starts at displayed position, has intermediate samples and retargets continuously',()=>{
 const position=(x:number)=>viewportFromCenter({width:1840,height:944,dpr:1,centerX:x,centerY:472,size:700,visible:true,identity:false,siteFitScale:1,visualZoomMultiplier:1,slot:'right'});
 const motion=new PlacementTransition(),left=position(386.4),right=position(1490.4);
 motion.begin(left,100);
 assert.equal(motion.sample(right,100).cssCenterX,left.cssCenterX);
 const first=motion.sample(right,116).cssCenterX;
 assert.ok(first>left.cssCenterX&&first<left.cssCenterX+10);
 const mid=motion.sample(right,280);
 assert.ok(mid.cssCenterX>first&&mid.cssCenterX<right.cssCenterX);
 motion.begin(mid,280);
 assert.equal(motion.sample(left,280).cssCenterX,mid.cssCenterX);
 assert.ok(motion.sample(left,380).cssCenterX<mid.cssCenterX);
 assert.equal(motion.sample(left,700).cssCenterX,left.cssCenterX);
 // Completion uses the latest destination, not a captured previous endpoint.
 assert.equal(motion.sample(right,900).cssCenterX,right.cssCenterX);
 motion.begin(right,1000);assert.equal(motion.sample(left,1001,true).cssCenterX,left.cssCenterX);
});

test('R1 resize: reading CSS is prepared before measuring anchors, preserving the active destination',()=>{
 const controller=new ScrollCompositionController();
 controller.setUnlock({competencies:true,brief:true});controller.scrollToNode('05.1','auto');
 let prepared=false;
 controller.setLayoutAdapter(()=>{
  assert.equal(prepared,true,'measure only after reading mode is applied');
  return canonicalLayout(720,{competencies:true,brief:true});
 },()=>{prepared=true});
 const host={scrollY:controller.getProgress().scrollY,innerWidth:1280,innerHeight:720,scrollTo({top}:{top:number}){this.scrollY=top},clearTimeout(){},cancelAnimationFrame(){}};
 const replay=controller as unknown as {attached:typeof host;resize:()=>void};
 replay.attached=host;replay.resize();
 assert.equal(controller.getProgress().activeNodeId,'05.1');
 assert.equal(controller.getProgress().viewportHeight,720);
});
