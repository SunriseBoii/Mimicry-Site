import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalLayout, ScrollCompositionController, type ScrollHost } from '../app/visual-lab/photonic-skin-ps04-m5/scroll-controller';
import { pageTransition, textPhase, displayedNode } from '../app/_ps05/transition';
import { restoreBuilder } from '../app/_ps05/persistence';
import { INITIAL_BUILDER_FLOW, selectTask, setDraftCompetencies, confirmCompetencies } from '../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-flow';
import { editorialLut, EDITORIAL_PIGMENTS } from '../app/_ps05/pigments';

function driver(){
 let now=0;const controller=new ScrollCompositionController({now:()=>now});
 const listeners=new Map<string,EventListenerOrEventListenerObject>();
 const host={scrollY:0,innerWidth:1440,innerHeight:900,scrollTo({top}:ScrollToOptions){this.scrollY=top??0;},addEventListener(type:string,fn:EventListenerOrEventListenerObject){listeners.set(type,fn)},removeEventListener(){},requestAnimationFrame(){return 1},cancelAnimationFrame(){},setTimeout(){return 1},clearTimeout(){}} satisfies ScrollHost;
 controller.setContinuous(true);controller.attach(host);
 return {controller,host,step:(t:number)=>{now=t;controller.tickNavigation(t)},scroll:(y:number)=>{host.scrollY=y;controller.refreshLayout()}};
}
test('D2: every small native delta survives idle and scrollend; no magnetic return',()=>{
 const d=driver();for(let y=1;y<200;y+=3){d.controller.noteUserInput('wheel');d.scroll(y);d.controller.evaluateMagnetism();assert.equal(d.host.scrollY,y);assert.equal(d.controller.getProgress().scrollY,y);assert.equal(d.controller.getMode(),'idle')}
});
test('D2: keyboard/graph motion is cancellable by wheel and old targets cannot complete',()=>{
 const d=driver();d.controller.scrollToNode('02');d.step(200);const y=d.host.scrollY;assert.ok(y>0&&y<902);
 d.controller.noteUserInput('wheel');d.scroll(y-3);d.step(2000);assert.equal(d.host.scrollY,y-3);assert.equal(d.controller.getPendingTarget(),null);
});
test('D2: distant graph uses two endpoints, active changes only at the visual handover',()=>{
 const d=driver();d.controller.scrollToNode('05.7');d.step(100);assert.equal(d.controller.getProgress().activeNodeId,'01');assert.equal(d.controller.getProgress().transition?.to,'05.7');
 d.controller.noteUserInput('touch');const before=d.controller.getProgress().transition!.progress;d.scroll(d.host.scrollY+4);assert.ok(d.controller.getProgress().transition!.progress>before);d.step(2000);assert.equal(d.controller.getPendingTarget(),null);
});
test('D2: opacity and colour phase retrace exactly; full zero is reached before entrance',()=>{
 for(const p of [0,.1,.25,.48,.6,.8,1]){const out=textPhase(p,false),into=textPhase(p,true);assert.ok(out.opacity===0||into.opacity===0);assert.deepEqual(out,textPhase(p,false))}
 assert.equal(textPhase(.48,false).opacity,0);assert.equal(textPhase(.48,true).opacity,0);assert.equal(textPhase(0,false).opacity,1);assert.equal(textPhase(1,true).opacity,1);
 const layout=canonicalLayout(900,{competencies:false,brief:false});const t=pageTransition(layout,0);assert.equal(t.progress,0);assert.equal(pageTransition(layout,150).progress,0);
 assert.equal(displayedNode({...t,from:'01',to:'02',progress:.51},'01'),'01');assert.equal(displayedNode({...t,from:'01',to:'02',progress:.49},'02'),'02');
});
test('D2: manual brief and independent draft/confirmed selections survive reload',()=>{
 let state=selectTask(INITIAL_BUILDER_FLOW,'engage_and_unite');state=setDraftCompetencies(state,['content','design']);state=confirmCompetencies(state).state;state={...state,briefText:'Ручной текст',briefEdited:true};state=setDraftCompetencies(state,['event']);
 const restored=restoreBuilder(JSON.stringify({...state,version:1,overlay:'contact',contact:{name:'private'}}));assert.equal(restored.briefText,'Ручной текст');assert.deepEqual(restored.draft.competencies,['event']);assert.deepEqual(restored.confirmed?.competencies,['content','design']);assert.equal(restored.unlock.brief,true);assert.equal(restored.overlay,null);assert.equal(restored.contact.name,'');
 assert.deepEqual(restoreBuilder('{broken'),INITIAL_BUILDER_FLOW);assert.deepEqual(restoreBuilder(JSON.stringify({version:1,draft:{taskId:'invalid'},unlock:{brief:true}})),INITIAL_BUILDER_FLOW);
});
test('D2: material LUT carries the same semantic pigments through the established coordinator',()=>{
 const lut=editorialLut(1);for(const sample of lut)assert.deepEqual(sample.color,EDITORIAL_PIGMENTS[0]);
 assert.ok(editorialLut(127).every(sample=>sample.presence===1));
});
