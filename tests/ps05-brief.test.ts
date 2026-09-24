import test from 'node:test';
import assert from 'node:assert/strict';
import { competenceOrder } from '../app/_brand/color-system';
import { CAPABILITIES, TASKS, COMBINATION_RULES, generateBrief } from '../app/_ps05/catalog';
import { INITIAL_BUILDER_FLOW, selectTask, setDraftCompetencies, confirmCompetencies, editBrief, resolveBriefUpdate, closeOverlay } from '../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-flow';
import type { BuilderTaskId } from '../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-ids';
import { createTestTransport, createHttpTransport, validateInquiry, type Inquiry } from '../app/_ps05/transport';
test('PS05: all 508 non-empty combinations are bounded, deterministic, selection-only and duplicate-free', () => {
 let count=0;
 for(const task of Object.keys(TASKS) as BuilderTaskId[]) for(let mask=1;mask<128;mask++) {
  const ids=competenceOrder.filter((_,i)=>mask & (1<<i)); const result=generateBrief(task,ids);
  assert.deepEqual(result,generateBrief(task,[...ids].reverse().concat(ids)));
  assert.ok(result.text.length<1150); assert.ok(result.text.startsWith(TASKS[task].goal));
  for(const id of competenceOrder) assert.equal(result.text.includes(CAPABILITIES[id].phrase),ids.includes(id));
  assert.ok(result.ruleIds.length<=2); assert.equal(new Set(result.ruleIds).size,result.ruleIds.length);
  for(const id of result.ruleIds) assert.ok(COMBINATION_RULES.find(r=>r.id===id)!.requires.every(x=>ids.includes(x)));
  if(!ids.includes('event')) assert.doesNotMatch(result.text,/мероприят|событи|участников/);
  assert.doesNotMatch(result.text,/undefined|null|прототип/); count++;
 }
 assert.equal(count,508);
});
test('PS05: edited text survives confirmation, explicit replacement is reversible, keeping text accepts new basis',()=>{
 let flow=selectTask(INITIAL_BUILDER_FLOW,'engage_and_unite');
 flow=confirmCompetencies(setDraftCompetencies(flow,['event','video','digital','merch'])).state;
 flow=editBrief(flow,'Мой текст — сохранить.');
 flow=confirmCompetencies(setDraftCompetencies(flow,['content'])).state;
 assert.equal(flow.briefText,'Мой текст — сохранить.'); assert.ok(flow.pendingBrief);
 const updated=resolveBriefUpdate(flow,'replace'); assert.match(updated.briefText,/тексты/);
 assert.equal(resolveBriefUpdate(updated,'undo').briefText,flow.briefText);
 flow=resolveBriefUpdate(flow,'keep'); assert.equal(flow.pendingBrief,null);
 flow=confirmCompetencies(flow).state; assert.equal(flow.pendingBrief,null); assert.equal(flow.briefText,'Мой текст — сохранить.');
 flow=closeOverlay(setDraftCompetencies(flow,[]));
 const rejected=confirmCompetencies(flow); assert.ok(rejected.error); assert.deepEqual(rejected.state.confirmed?.competencies,['content']); assert.equal(flow.unlock.brief,true);
});
test('PS05: untouched brief updates with task and selected set',()=>{
 let flow=confirmCompetencies(setDraftCompetencies(selectTask(INITIAL_BUILDER_FLOW,'explain_changes'),['video'])).state;
 flow=confirmCompetencies(setDraftCompetencies(selectTask(flow,'learn_and_practice'),['games'])).state;
 assert.match(flow.briefText,/освоить новое/); assert.doesNotMatch(flow.briefText,/видеоматериалы/); assert.equal(flow.pendingBrief,null);
});
const payload: Inquiry={source:'project',task:'engage_and_unite',competencies:['event'],brief:'Тестовый запрос',name:'Тест',channel:'@test_user',consent:true,requestId:'test-1'};
test('PS05: test transport fails once, retries and confirms a test receipt',async()=>{
 const transport=createTestTransport(true); const signal=new AbortController().signal;
 await assert.rejects(transport(payload,signal),/Тестовый отказ/);
 assert.equal((await transport(payload,signal)).test,true);
 assert.equal(validateInquiry({...payload,channel:'xx'},true).channel!==undefined,true);
  assert.deepEqual(validateInquiry(payload,true),{});
  assert.ok(validateInquiry({...payload,channel:'----------'},true).channel);
  assert.deepEqual(validateInquiry({...payload,channel:'+7 (000) 000-00-00'},true),{});
});
test('PS05: HTTP transport requires explicit receipt; bare HTTP 200 is not success',async()=>{
 const original=globalThis.fetch;
 try { globalThis.fetch=async()=>new Response('{}',{status:200}); await assert.rejects(createHttpTransport('/api/inquiry')(payload,new AbortController().signal),/не подтвердил/); }
 finally { globalThis.fetch=original; }
});
