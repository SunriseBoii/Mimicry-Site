import { competenceOrder, type CompetenceId } from "../../../_brand/color-system";
import {
  CONTACT_SIMULATED_DELAY_MS,
  INITIAL_BUILD_FLOW,
  SUCCESS_HOLD_MS,
  closeOverlay as closeM5Overlay,
  openContact as openM5Contact,
  simulateSuccess as simulateM5Success,
  toggleCompetence,
  validateContact,
  type BuildFlowState,
  type ContactDraft,
  type OverlayKind,
} from "../../photonic-skin-ps04-m5/build-flow";
import {
  BUILDER_TASK_IDS,
  canonicalizeCompetencySet,
  type BuilderTaskId,
} from "./builder-ids";
import { resolveBuilderState } from "./builder-resolver";
import { briefBasis, generateBrief } from "../../../_ps05/catalog";

export { CONTACT_SIMULATED_DELAY_MS, SUCCESS_HOLD_MS, toggleCompetence, validateContact };
export type { ContactDraft, OverlayKind, BuilderTaskId };

export interface BuilderTaskOption {
  id: BuilderTaskId;
  label: string;
  briefSeed: string;
}

export const BUILDER_TASK_OPTIONS: readonly BuilderTaskOption[] = Object.freeze([
  { id: "explain_changes", label: "Объяснить изменения.", briefSeed: "Нужно объяснить изменения так, чтобы люди поняли, что происходит и зачем это нужно." },
  { id: "engage_and_unite", label: "Вовлечь и объединить.", briefSeed: "Нужно вовлечь разные группы сотрудников и собрать общее понимание задачи." },
  { id: "learn_and_practice", label: "Обучить и помочь освоить новое.", briefSeed: "Нужно обучить людей и помочь освоить новые правила, инструменты или роли." },
  { id: "company_and_culture", label: "Познакомить с компанией и культурой.", briefSeed: "Нужно познакомить людей с компанией, культурой и тем, как здесь принято работать." },
]);

export const COMPETENCE_LABELS: Readonly<Record<CompetenceId, string>> = Object.freeze({
  content: "Контент",
  design: "Дизайн",
  event: "Event",
  games: "Игры",
  video: "Видео",
  digital: "Digital",
  merch: "Мерч",
});

export interface BuilderDraft {
  taskId: BuilderTaskId | null;
  competencies: CompetenceId[];
  revision: number;
}

export interface BuilderConfirmed {
  taskId: BuilderTaskId;
  competencies: CompetenceId[];
  resolvedStateId: string;
  stateHash: string;
  revision: number;
}

export interface BuilderFlowState {
  draft: BuilderDraft;
  confirmed: BuilderConfirmed | null;
  briefText: string;
  briefEdited: boolean;
  briefStale: boolean;
  generatedText?: string;
  textBasis?: string;
  pendingBrief?: { text: string; basis: string } | null;
  previousBrief?: { text: string; basis: string; edited: boolean } | null;
  unlock: { competencies: boolean; brief: boolean };
  overlay: OverlayKind;
  contact: ContactDraft;
  successVisibleUntil: number | null;
}

export const INITIAL_BUILDER_FLOW: BuilderFlowState = {
  draft: { taskId: null, competencies: [], revision: 0 },
  confirmed: null,
  briefText: "",
  briefEdited: false,
  briefStale: false,
  unlock: { competencies: false, brief: false },
  overlay: null,
  contact: { name: "", channel: "", consent: false },
  successVisibleUntil: null,
};

export function composeBrief(taskId: BuilderTaskId, competencies: readonly CompetenceId[]) {
  return generateBrief(taskId, competencies).text;
}

export function selectTask(state: BuilderFlowState, taskId: BuilderTaskId): BuilderFlowState {
  const stale = Boolean(state.confirmed);
  return {
    ...state,
    draft: {
      ...state.draft,
      taskId,
      revision: state.draft.revision + 1,
    },
    unlock: { ...state.unlock, competencies: true },
    briefStale: stale || state.briefStale,
  };
}

export function setDraftCompetencies(state: BuilderFlowState, competencies: CompetenceId[]): BuilderFlowState {
  const stale = Boolean(state.confirmed);
  return {
    ...state,
    draft: {
      ...state.draft,
      competencies,
      revision: state.draft.revision + 1,
    },
    briefStale: stale || state.briefStale,
  };
}

export function confirmCompetencies(state: BuilderFlowState): { state: BuilderFlowState; error: string | null } {
  if (!state.draft.taskId || !state.unlock.competencies) {
    return { state, error: "Сначала выберите задачу." };
  }
  if (state.draft.competencies.length === 0) {
    return { state, error: "Выберите хотя бы одну компетенцию, чтобы собрать черновик." };
  }
  const canonical = canonicalizeCompetencySet(state.draft.competencies);
  const resolvedStateId = resolveBuilderState({
    screen: "03.3",
    draftCompetencies: state.draft.competencies,
    confirmedCompetencies: canonical,
  });
  const generated = generateBrief(state.draft.taskId, canonical);
  const basisChanged = state.textBasis !== generated.basis;
  const briefText = state.briefEdited ? state.briefText : generated.text;
  const revision = (state.confirmed?.revision ?? 0) + 1;
  return {
    error: null,
    state: {
      ...state,
      confirmed: {
        taskId: state.draft.taskId,
        competencies: canonical,
        resolvedStateId,
        stateHash: state.confirmed?.resolvedStateId === resolvedStateId ? state.confirmed.stateHash : "",
        revision,
      },
      unlock: { competencies: true, brief: true },
      briefText,
      briefStale: false,
      generatedText: generated.text,
      textBasis: state.briefEdited ? state.textBasis : generated.basis,
      pendingBrief: state.briefEdited && basisChanged ? generated : null,
    },
  };
}

export function bindConfirmedHash(state: BuilderFlowState, stateHash: string): BuilderFlowState {
  if (!state.confirmed) return state;
  return { ...state, confirmed: { ...state.confirmed, stateHash } };
}

export function editBrief(state: BuilderFlowState, briefText: string): BuilderFlowState {
  return { ...state, briefText, briefEdited: true };
}

export function resolveBriefUpdate(state: BuilderFlowState, action: 'replace' | 'keep' | 'undo'): BuilderFlowState {
  if (action === 'undo' && state.previousBrief) {
    return { ...state, briefText: state.previousBrief.text, textBasis: state.previousBrief.basis, briefEdited: state.previousBrief.edited, previousBrief: null };
  }
  if (!state.confirmed || !state.pendingBrief) return state;
  const basis = briefBasis(state.confirmed.taskId, state.confirmed.competencies);
  if (action === 'keep') return { ...state, textBasis: basis, pendingBrief: null };
  return { ...state, previousBrief: { text: state.briefText, basis: state.textBasis ?? '', edited: state.briefEdited }, briefText: state.pendingBrief.text, textBasis: basis, pendingBrief: null, briefEdited: false };
}

export function openContact(state: BuilderFlowState): BuilderFlowState {
  return { ...state, overlay: "contact" };
}

export function closeOverlay(state: BuilderFlowState): BuilderFlowState {
  return { ...state, overlay: null, successVisibleUntil: null };
}

export function simulateSuccess(state: BuilderFlowState, now = Date.now()): BuilderFlowState {
  return {
    ...state,
    overlay: "success",
    successVisibleUntil: now + SUCCESS_HOLD_MS,
    contact: { name: "", channel: "", consent: false },
  };
}

export function builderView(state: BuilderFlowState) {
  return {
    taskId: state.draft.taskId,
    draftCompetencies: state.draft.competencies,
    confirmedCompetencies: state.confirmed?.competencies ?? null,
  };
}

/** Compatibility snapshot for scroll unlock / magnetism that still speak M5 flow shape. */
export function asUnlockFlow(state: BuilderFlowState): Pick<BuildFlowState, "unlock" | "overlay" | "contact" | "successVisibleUntil"> {
  return {
    unlock: state.unlock,
    overlay: state.overlay,
    contact: state.contact,
    successVisibleUntil: state.successVisibleUntil,
  };
}

export function isBuilderTask(value: string): value is BuilderTaskId {
  return (BUILDER_TASK_IDS as readonly string[]).includes(value);
}

export { competenceOrder, INITIAL_BUILD_FLOW, closeM5Overlay, openM5Contact, simulateM5Success };
