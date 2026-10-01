import { competenceOrder, type CompetenceId } from '../_brand/color-system';
import { TASKS } from './catalog';
import { INITIAL_BUILDER_FLOW, selectTask, setDraftCompetencies, confirmCompetencies, type BuilderFlowState, type BuilderTaskId } from '../visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-flow';
export const BUILDER_STORAGE_KEY='mimicry:builder:v1';
/** Rebuild permissions and resolved states through the existing flow, never trust stored unlocks. */
export function restoreBuilder(json:string|null):BuilderFlowState {
 try {
  const data=JSON.parse(json??'null');if(!data||data.version!==1)return INITIAL_BUILDER_FLOW;
  const task=(value:unknown):value is BuilderTaskId=>typeof value==='string'&&Object.hasOwn(TASKS,value);
  const ids=(value:unknown):CompetenceId[]=>Array.isArray(value)?competenceOrder.filter(id=>value.includes(id)):[];
  if(!task(data.draft?.taskId))return INITIAL_BUILDER_FLOW;
  let state=INITIAL_BUILDER_FLOW;
  if(task(data.confirmed?.taskId)&&ids(data.confirmed?.competencies).length){state=selectTask(state,data.confirmed.taskId);state=setDraftCompetencies(state,ids(data.confirmed.competencies));state=confirmCompetencies(state).state;}
  state=selectTask(state,data.draft.taskId);state=setDraftCompetencies(state,ids(data.draft.competencies));
  for(const key of ['briefText','generatedText','textBasis'] as const)if(typeof data[key]==='string')state={...state,[key]:data[key]};
  state.briefEdited=data.briefEdited===true;state.briefStale=data.briefStale===true;
  if(data.pendingBrief&&typeof data.pendingBrief.text==='string'&&typeof data.pendingBrief.basis==='string')state.pendingBrief={text:data.pendingBrief.text,basis:data.pendingBrief.basis};
  if(data.previousBrief&&typeof data.previousBrief.text==='string'&&typeof data.previousBrief.basis==='string')state.previousBrief={text:data.previousBrief.text,basis:data.previousBrief.basis,edited:data.previousBrief.edited===true};
  return state;
 }catch{return INITIAL_BUILDER_FLOW;}
}
export function loadBuilder(){try{return restoreBuilder(localStorage.getItem(BUILDER_STORAGE_KEY));}catch{return INITIAL_BUILDER_FLOW;}}
export function saveBuilder(state:BuilderFlowState){try{const {draft,confirmed,briefText,briefEdited,briefStale,generatedText,textBasis,pendingBrief,previousBrief}=state;localStorage.setItem(BUILDER_STORAGE_KEY,JSON.stringify({version:1,draft,confirmed,briefText,briefEdited,briefStale,generatedText,textBasis,pendingBrief,previousBrief}));}catch{/* Storage denial does not block editing. */}}
