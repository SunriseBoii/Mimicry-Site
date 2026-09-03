/**
 * Single production-like builder action path for DOM, keyboard, and QA handles.
 * Domain reduction is pure. Publishing an in-screen actor request happens once
 * in the lab dispatcher, never inside a React state updater.
 */

import type { CompetenceId } from "../../../_brand/color-system";
import { canonicalizeCompetencySet } from "../project-builder-semantics/builder-ids";
import {
  confirmCompetencies,
  selectTask,
  setDraftCompetencies,
  toggleCompetence,
  type BuilderFlowState,
  type BuilderTaskId,
} from "../project-builder-semantics/builder-flow";

export type BuilderUiActionSource = "user-ui" | "keyboard" | "qa-handle";

export type ProjectBuilderAction =
  | {
    type: "toggle-competency";
    competencyId: CompetenceId;
    hostNodeId: "03.2";
    source: BuilderUiActionSource;
  }
  | {
    type: "set-competencies";
    competencyIds: readonly CompetenceId[];
    hostNodeId: "03.2";
    source: BuilderUiActionSource;
  }
  | {
    type: "select-task";
    taskId: BuilderTaskId;
    source: BuilderUiActionSource;
  }
  | {
    type: "confirm-competencies";
    source: BuilderUiActionSource;
  };

export interface BuilderActionReduction {
  state: BuilderFlowState;
  error: string | null;
  publishInScreen: boolean;
}

export function reduceProjectBuilderAction(
  state: BuilderFlowState,
  action: ProjectBuilderAction,
): BuilderActionReduction {
  if (action.type === "toggle-competency") {
    if (action.hostNodeId !== "03.2") {
      return { state, error: null, publishInScreen: false };
    }
    const next = canonicalizeCompetencySet(toggleCompetence(state.draft.competencies, action.competencyId));
    return {
      state: setDraftCompetencies(state, next),
      error: null,
      publishInScreen: true,
    };
  }
  if (action.type === "set-competencies") {
    if (action.hostNodeId !== "03.2") {
      return { state, error: null, publishInScreen: false };
    }
    return {
      state: setDraftCompetencies(state, canonicalizeCompetencySet(action.competencyIds)),
      error: null,
      publishInScreen: true,
    };
  }
  if (action.type === "select-task") {
    return { state: selectTask(state, action.taskId), error: null, publishInScreen: false };
  }
  const confirmed = confirmCompetencies(state);
  return { state: confirmed.state, error: confirmed.error, publishInScreen: false };
}

export interface BuilderActionTrace {
  type: ProjectBuilderAction["type"];
  source: BuilderUiActionSource;
  competencyId: CompetenceId | null;
  hostNodeId: "03.2" | null;
  draftRevision: number;
  selected: CompetenceId[];
  confirmed: CompetenceId[] | null;
  interactionRevision: number;
  lastAppliedInteractionRevision: number;
  magneticSettleRevision: number;
  requestSourceKind: "in-screen-action" | "route-settle" | null;
  published: boolean;
  atMs: number;
}
