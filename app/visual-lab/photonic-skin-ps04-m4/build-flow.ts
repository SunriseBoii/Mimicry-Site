import { competenceOrder, type CompetenceId } from "../../_brand/color-system";
import { COMPETENCE_BIT, maskFromCompetencies, type CompetenceMask } from "../photonic-skin-ps04-m2/photonic-palette";

export const TASK_IDS = ["explain", "involve", "train", "introduce"] as const;
export type TaskId = (typeof TASK_IDS)[number];

export interface TaskOption {
  id: TaskId;
  label: string;
  briefSeed: string;
}

export const TASK_OPTIONS: readonly TaskOption[] = Object.freeze([
  { id: "explain", label: "Объяснить изменения.", briefSeed: "Нужно объяснить изменения так, чтобы люди поняли, что происходит и зачем это нужно." },
  { id: "involve", label: "Вовлечь и объединить.", briefSeed: "Нужно вовлечь разные группы сотрудников и собрать общее понимание задачи." },
  { id: "train", label: "Обучить и помочь освоить новое.", briefSeed: "Нужно обучить людей и помочь освоить новые правила, инструменты или роли." },
  { id: "introduce", label: "Познакомить с компанией и культурой.", briefSeed: "Нужно познакомить людей с компанией, культурой и тем, как здесь принято работать." },
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

export type OverlayKind = null | "contact" | "success";

export interface ContactDraft {
  name: string;
  channel: string;
  consent: boolean;
}

export interface BuildFlowState {
  taskId: TaskId | null;
  competencies: CompetenceId[];
  competenciesConfirmed: boolean;
  briefText: string;
  briefEdited: boolean;
  unlock: { competencies: boolean; brief: boolean };
  overlay: OverlayKind;
  contact: ContactDraft;
  successVisibleUntil: number | null;
}

export const SUCCESS_HOLD_MS = 4200;
export const CONTACT_SIMULATED_DELAY_MS = 480;

export const INITIAL_BUILD_FLOW: BuildFlowState = {
  taskId: null,
  competencies: [],
  competenciesConfirmed: false,
  briefText: "",
  briefEdited: false,
  unlock: { competencies: false, brief: false },
  overlay: null,
  contact: { name: "", channel: "", consent: false },
  successVisibleUntil: null,
};

export function competenceMaskOf(ids: readonly CompetenceId[]): CompetenceMask {
  return maskFromCompetencies(ids);
}

export function toggleCompetence(current: readonly CompetenceId[], id: CompetenceId): CompetenceId[] {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return competenceOrder.filter((item) => next.has(item));
}

export function composeBrief(taskId: TaskId, competencies: readonly CompetenceId[]) {
  const task = TASK_OPTIONS.find((item) => item.id === taskId);
  const names = competencies.map((id) => COMPETENCE_LABELS[id]).join(", ");
  return [
    task?.briefSeed ?? "",
    names ? `В работу предлагаем взять: ${names}.` : "Компетенции ещё не выбраны.",
    "Это черновик прототипа, не финальный бриф и не результат модели.",
  ].join(" ");
}

export function selectTask(state: BuildFlowState, taskId: TaskId): BuildFlowState {
  const briefText = state.briefEdited ? state.briefText : (state.competenciesConfirmed ? composeBrief(taskId, state.competencies) : "");
  return {
    ...state,
    taskId,
    unlock: { ...state.unlock, competencies: true },
    briefText,
  };
}

export function setCompetencies(state: BuildFlowState, competencies: CompetenceId[]): BuildFlowState {
  const briefText = state.briefEdited && state.unlock.brief
    ? state.briefText
    : state.unlock.brief
      ? composeBrief(state.taskId ?? "explain", competencies)
      : state.briefText;
  return { ...state, competencies, briefText };
}

export function confirmCompetencies(state: BuildFlowState): { state: BuildFlowState; error: string | null } {
  if (state.competencies.length === 0) {
    return { state, error: "Выберите хотя бы одну компетенцию, чтобы собрать черновик." };
  }
  if (!state.unlock.competencies || !state.taskId) {
    return { state, error: "Сначала выберите задачу." };
  }
  const briefText = state.briefEdited ? state.briefText : composeBrief(state.taskId, state.competencies);
  return {
    error: null,
    state: {
      ...state,
      competenciesConfirmed: true,
      unlock: { competencies: true, brief: true },
      briefText,
    },
  };
}

export function editBrief(state: BuildFlowState, briefText: string): BuildFlowState {
  return { ...state, briefText, briefEdited: true };
}

export interface ContactErrors {
  name?: string;
  channel?: string;
  consent?: string;
}

export function validateContact(contact: ContactDraft): ContactErrors {
  const errors: ContactErrors = {};
  if (contact.name.trim().length < 2) errors.name = "Укажите имя и фамилию текстом, не только цветом поля.";
  if (contact.channel.trim().length < 3) errors.channel = "Укажите телефон или Telegram.";
  if (!contact.consent) errors.consent = "Нужно согласие на обработку данных, чтобы имитировать отправку.";
  return errors;
}

export function openContact(state: BuildFlowState): BuildFlowState {
  return { ...state, overlay: "contact" };
}

export function closeOverlay(state: BuildFlowState): BuildFlowState {
  return { ...state, overlay: null, successVisibleUntil: null };
}

export function simulateSuccess(state: BuildFlowState, now = Date.now()): BuildFlowState {
  return {
    ...state,
    overlay: "success",
    successVisibleUntil: now + SUCCESS_HOLD_MS,
    contact: { name: "", channel: "", consent: false },
  };
}

export function bitForCompetence(id: CompetenceId) {
  return COMPETENCE_BIT[id];
}
