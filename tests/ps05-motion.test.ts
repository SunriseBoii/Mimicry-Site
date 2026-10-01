import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneNavigation, WheelIntent, sceneAt, sceneDirection } from '../app/_ps05/scene-navigation';
import { canonicalLayout, ScrollCompositionController, type ScrollHost } from '../app/visual-lab/photonic-skin-ps04-m5/scroll-controller';

function fixture(){
 let now=0;const layout=canonicalLayout(900,{competencies:false,brief:false});
 const host={scrollY:0,innerWidth:1440,innerHeight:900,scrollTo({top}:ScrollToOptions){this.scrollY=top??0;},addEventListener(){},removeEventListener(){},requestAnimationFrame(){return 1},cancelAnimationFrame(){},setTimeout(){return 1},clearTimeout(){}} satisfies ScrollHost;
 const scene=new SceneNavigation({host:()=>host,layout:()=>layout,now:()=>now,notify:()=>{},blocked:()=>false,reduced:()=>false});
 return {scene,host,layout,step:(t:number)=>{now=t;scene.tick(now);}};
}
test('MOTION: confirmed navigation is atomic, no command queue or reversal, exact endpoints',()=>{
 const {scene,step}=fixture();assert.equal(scene.request('05.7'),true);step(240);
 assert.equal(scene.snapshot().displayed,'01');assert.equal(scene.snapshot().transition.progress,.4);
 assert.equal(scene.request('02'),false);step(600);assert.equal(scene.snapshot().displayed,'05.7');assert.equal(scene.snapshot().transition.progress,1);assert.equal(scene.busy(),false);
 assert.equal(scene.request('05.7'),false);assert.equal(scene.snapshot().arrival,1);assert.equal(scene.request('04'),true);
});
test('MOTION: scrollbar preview and pause never commit; one final destination after release',()=>{
 const {scene,host,layout,step}=fixture();host.scrollY=layout.byId['05.5']!.start+120;scene.nativeScroll();step(3000);
 assert.equal(scene.snapshot().displayed,'01');assert.equal(scene.snapshot().preview,'05.5');assert.equal(scene.snapshot().arrival,0);
 scene.release();step(3600);assert.equal(scene.snapshot().displayed,'05.5');assert.equal(host.scrollY,layout.byId['05.5']!.start+120);
});
test('MOTION: own native scroll and scrollend do not restart a transition',()=>{
 const {scene,step}=fixture();scene.request('02');scene.nativeScroll();scene.release();step(600);scene.release();assert.equal(scene.snapshot().arrival,1);assert.equal(scene.busy(),false);
});
test('MOTION: drag during animation saves only its final released target',()=>{
 const {scene,host,layout,step}=fixture();scene.request('02');scene.nativeScroll();step(120);
 host.scrollY=layout.byId['05.3']!.start+90;scene.nativeScroll();host.scrollY=layout.byId['07']!.start+80;scene.nativeScroll();scene.release();
 step(600);assert.equal(scene.snapshot().displayed,'02');assert.equal(scene.snapshot().target,'07');step(1200);assert.equal(scene.snapshot().displayed,'07');assert.equal(scene.snapshot().arrival,2);
});
test('MOTION: wheel accumulation, reversal, idle reset, one continuous inertia tail',()=>{
 const w=new WheelIntent();assert.equal(w.sample(20,0,false,false),'ignore');assert.equal(w.sample(-30,40,false,false),'ignore');assert.equal(w.sample(-20,80,false,false),'transition');
 for(let t=100;t<1400;t+=20)assert.equal(w.sample(10,t,t<680,false),'ignore');
 assert.equal(w.sample(60,1600,false,false),'transition');
 const small=new WheelIntent();small.sample(30,0,false,false);assert.equal(small.sample(30,500,false,false),'ignore');assert.equal(small.sample(18,550,false,false),'transition');
});
test('MOTION: reading gesture consumes inertia at boundary; next separate gesture navigates',()=>{
 const w=new WheelIntent();assert.equal(w.sample(120,0,false,true),'read');assert.equal(w.sample(60,40,false,false),'ignore');assert.equal(w.sample(60,220,false,false),'ignore');assert.equal(w.sample(60,420,false,false),'transition');
});
test('MOTION: range hysteresis, locked routes absent, builder horizontal and sections vertical',()=>{
 const {layout}=fixture();assert.equal(sceneAt(layout,910,'01'),'01');assert.equal(sceneAt(layout,940,'01'),'02');assert.equal(layout.byId['03.2'],undefined);
 assert.deepEqual(sceneDirection('03.1','03.3'),{axis:'x',sign:1});assert.deepEqual(sceneDirection('05.7','03.1'),{axis:'y',sign:-1});
});
test('MOTION: controller isolates confirmed progress from raw scrollY and legacy magnetism',()=>{
 let now=0;const controller=new ScrollCompositionController({now:()=>now});const {host}=fixture();controller.setScenes(true);controller.attach(host);controller.scrollToNode('02');now=120;controller.tickNavigation(now);const p=controller.getProgress().transition!.progress;
 controller.noteUserInput('wheel');host.scrollY=8000;controller.refreshLayout();assert.equal(controller.getProgress().transition!.progress,p);assert.equal(controller.getProgress().activeNodeId,'01');
 now=600;controller.tickNavigation(now);assert.equal(controller.getProgress().activeNodeId,'02');assert.equal(controller.getPendingTarget(),null);
});
test('MOTION: resource preparation keeps old content at p=0, then uses one bounded clock',()=>{
 const {host,layout}=fixture();let now=0,ready=false;
 const s=new SceneNavigation({host:()=>host,layout:()=>layout,now:()=>now,notify:()=>{},blocked:()=>false,reduced:()=>false,ready:()=>ready});
 s.request('05.1');now=150;s.tick(now);assert.equal(s.snapshot().transition.progress,0);
 ready=true;now=200;s.tick(now);now=500;s.tick(now);assert.equal(s.snapshot().transition.progress,.5);
 now=800;s.tick(now);assert.equal(s.snapshot().displayed,'05.1');
 ready=false;s.request('04');now=2300;s.tick(now);now=2900;s.tick(now);assert.equal(s.snapshot().displayed,'04');
});
