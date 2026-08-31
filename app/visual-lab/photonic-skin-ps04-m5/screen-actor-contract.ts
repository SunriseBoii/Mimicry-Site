import type { CompetenceId } from "../../_brand/color-system";
import type { CompositionMode, StateEntry } from "../photonic-skin-m4-1/m41-data";
import {
  ALL_COMPETENCE_MASK,
  COMPETENCE_BIT,
  maskFromCompetencies,
  paletteMaskForState,
  type CompetenceMask,
} from "../photonic-skin-ps04-m2/photonic-palette";
import type { OverlayKind, TaskId } from "./build-flow";
import type { FitProfile } from "./site-fit";
import {
  SCREEN_NODE_BY_ID,
  SCREEN_NODE_IDS,
  type ActorPlacement,
  type ScreenNodeId,
  type TemporaryStateId,
} from "./topology";

export type ActorFamily = CompositionMode | "none";
export type ActorSlot = ActorPlacement;
export type ResolutionKind = "exact" | "same-family-fallback" | "none";
export type ActorScreenId = ScreenNodeId | TemporaryStateId;

export const MASTER_STATE_ID = "master-neutral";
export const CANONICAL_BRAND_WIDE_ID = "brand-wide-gather-content-design-digital-event-games-merch-video";
export const CANONICAL_GATHER_ID = CANONICAL_BRAND_WIDE_ID;
/** @deprecated Name kept for M4 tests that assert cross-family fallback is gone. */
export const FALLBACK_GEOMETRY_ID = CANONICAL_GATHER_ID;
export const CANONICAL_DRIVE_ID = "brand-wide-drive-content-design-digital-event-games-merch-video";
/**
 * FOCUS has no all-seven frozen state (max six competencies). This 6-competence
 * content-focus state is the canonical same-family geometry for missing exact masks.
 */
export const CANONICAL_FOCUS_ID = "complex-focus-content-design-digital-event-games-merch-focus-content";

export const SINGLE_STATE_IDS: Readonly<Record<CompetenceId, string>> = Object.freeze({
  content: "single-content",
  design: "single-design",
  event: "single-event",
  games: "single-games",
  video: "single-video",
  digital: "single-digital",
  merch: "single-merch",
});

export const TASK_FAMILY: Readonly<Record<TaskId, Exclude<ActorFamily, "MASTER" | "SINGLE" | "none">>> = Object.freeze({
  explain: "FOCUS",
  involve: "GATHER",
  train: "DRIVE",
  introduce: "BRAND_WIDE",
});

export const CANONICAL_FAMILY_GEOMETRY: Readonly<Record<Exclude<ActorFamily, "SINGLE" | "none">, string>> = Object.freeze({
  MASTER: MASTER_STATE_ID,
  BRAND_WIDE: CANONICAL_BRAND_WIDE_ID,
  GATHER: CANONICAL_GATHER_ID,
  DRIVE: CANONICAL_DRIVE_ID,
  FOCUS: CANONICAL_FOCUS_ID,
});

export interface ScreenActorContract {
  nodeId: ActorScreenId;
  hostNodeId: ScreenNodeId;
  family: ActorFamily;
  requestedFamily: ActorFamily;
  resolvedGeometryId: string | null;
  paletteMask: CompetenceMask;
  slot: ActorSlot;
  fitProfile: FitProfile;
  resolution: ResolutionKind;
  applyPaletteOverride: boolean;
  reason: string;
}

export interface FlowContext {
  taskId: TaskId | null;
  taskSelected: boolean;
  competencies: readonly CompetenceId[];
  competenciesConfirmed: boolean;
  settledStateId: string;
}

export interface StateIndex {
  byId: Map<string, StateEntry>;
  byModeMask: Map<string, StateEntry[]>;
}

export function hostNodeId(id: ActorScreenId): ScreenNodeId {
  if (id === "03.3A" || id === "03.3B") return "03.3";
  return id;
}

export function overlayScreenId(nodeId: ScreenNodeId, overlay: OverlayKind): ActorScreenId {
  if (nodeId !== "03.3" || overlay === null) return nodeId;
  return overlay === "contact" ? "03.3A" : "03.3B";
}

export function maskFromIds(ids: readonly CompetenceId[]): CompetenceMask {
  return ids.length === 0 ? 0 : maskFromCompetencies(ids);
}

export function indexStates(states: readonly StateEntry[]): StateIndex {
  const byId = new Map<string, StateEntry>();
  const byModeMask = new Map<string, StateEntry[]>();
  for (const entry of states) {
    byId.set(entry.stateId, entry);
    const mask = paletteMaskForState(entry);
    const list = byModeMask.get(`${entry.compositionMode}:${mask}`) ?? [];
    list.push(entry);
    byModeMask.set(`${entry.compositionMode}:${mask}`, list);
    byModeMask.set(`${entry.compositionMode}:${mask}:${entry.focusCompetencyId ?? ""}`, [entry]);
  }
  return { byId, byModeMask };
}

function fitForFamily(family: ActorFamily): FitProfile {
  if (family === "none") return "none";
  if (family === "MASTER") return "master";
  if (family === "SINGLE") return "single";
  if (family === "BRAND_WIDE") return "brandWide";
  return "complex";
}

function slotFor(nodeId: ScreenNodeId): ActorSlot {
  return SCREEN_NODE_BY_ID[nodeId].actorPlacement;
}

function familyMatches(entry: StateEntry, family: Exclude<ActorFamily, "none" | "SINGLE" | "MASTER">) {
  if (family === "BRAND_WIDE") return entry.stateRole === "brand_wide";
  return entry.compositionMode === family;
}

function exactInFamily(index: StateIndex, family: Exclude<ActorFamily, "none">, mask: CompetenceMask, focus?: CompetenceId | null) {
  if (family === "MASTER") return index.byId.get(MASTER_STATE_ID) ?? null;
  if (family === "SINGLE") return null;
  if (family === "BRAND_WIDE") {
    if (mask !== ALL_COMPETENCE_MASK) return null;
    return index.byId.get(CANONICAL_BRAND_WIDE_ID) ?? null;
  }
  if (focus) {
    const focused = index.byModeMask.get(`${family}:${mask}:${focus}`);
    if (focused?.[0] && familyMatches(focused[0], family)) return focused[0];
  }
  const list = (index.byModeMask.get(`${family}:${mask}`) ?? []).filter((entry) => familyMatches(entry, family));
  if (focus) {
    const match = list.find((entry) => entry.focusCompetencyId === focus);
    if (match) return match;
  }
  return list[0] ?? null;
}

export function resolveFamilyGeometry(
  index: StateIndex,
  family: Exclude<ActorFamily, "none">,
  mask: CompetenceMask,
): { entry: StateEntry; resolution: ResolutionKind; applyPaletteOverride: boolean; reason: string } {
  if (family === "MASTER") {
    const entry = index.byId.get(MASTER_STATE_ID);
    if (!entry) throw new Error("Frozen MASTER geometry is missing");
    return { entry, resolution: "exact", applyPaletteOverride: false, reason: "MASTER master-neutral" };
  }
  if (family === "SINGLE") {
    throw new Error("SINGLE resolution uses per-competence IDs, not family+mask search");
  }
  const focus = family === "FOCUS"
    ? (["content", "design", "event", "games", "video", "digital", "merch"] as const).find((id) => (mask & COMPETENCE_BIT[id]) !== 0) ?? null
    : null;
  const exact = mask === 0 ? null : exactInFamily(index, family, mask, focus);
  if (exact && index.byId.has(exact.stateId) && familyMatches(exact, family)) {
    return {
      entry: exact,
      resolution: "exact",
      applyPaletteOverride: false,
      reason: `exact ${family} ${exact.stateId}`,
    };
  }
  const canonicalId = CANONICAL_FAMILY_GEOMETRY[family];
  const canonical = index.byId.get(canonicalId);
  if (!canonical || !familyMatches(canonical, family)) {
    throw new Error(`No same-family frozen state for ${family}; refusing cross-family fallback`);
  }
  return {
    entry: canonical,
    resolution: "same-family-fallback",
    applyPaletteOverride: true,
    reason: `no exact ${family} mask ${mask}; same-family ${canonicalId} + palette override`,
  };
}

function contract(
  nodeId: ActorScreenId,
  host: ScreenNodeId,
  family: ActorFamily,
  geometry: string | null,
  mask: CompetenceMask,
  resolution: ResolutionKind,
  applyPaletteOverride: boolean,
  reason: string,
): ScreenActorContract {
  return {
    nodeId,
    hostNodeId: host,
    family,
    requestedFamily: family,
    resolvedGeometryId: geometry,
    paletteMask: mask,
    slot: slotFor(host),
    fitProfile: fitForFamily(family),
    resolution,
    applyPaletteOverride,
    reason,
  };
}

function noneContract(nodeId: ActorScreenId, host: ScreenNodeId, reason: string): ScreenActorContract {
  return contract(nodeId, host, "none", null, 0, "none", false, reason);
}

export function resolveScreenActorContract(args: {
  nodeId: ScreenNodeId;
  overlay?: OverlayKind;
  index: StateIndex;
  flow: FlowContext;
}): ScreenActorContract {
  const host = args.nodeId;
  const nodeId = overlayScreenId(host, args.overlay ?? null);
  const selectedMask = maskFromIds(args.flow.competencies);
  const taskFamily = args.flow.taskId ? TASK_FAMILY[args.flow.taskId] : null;

  if (host === "08") {
    return noneContract(nodeId, host, "footer has no Mimic; session stays mounted");
  }

  const node = SCREEN_NODE_BY_ID[host];
  if (node.competenceId) {
    const stateId = SINGLE_STATE_IDS[node.competenceId];
    return contract(
      nodeId,
      host,
      "SINGLE",
      stateId,
      COMPETENCE_BIT[node.competenceId],
      "exact",
      false,
      `frozen SINGLE ${stateId}`,
    );
  }

  if (host === "01" || host === "04" || host === "06.1" || host === "06.2" || host === "06.3" || host === "07") {
    return contract(nodeId, host, "MASTER", MASTER_STATE_ID, ALL_COMPETENCE_MASK, "exact", false, `${host} MASTER sphere, all seven`);
  }

  if (host === "02") {
    return contract(nodeId, host, "BRAND_WIDE", CANONICAL_BRAND_WIDE_ID, ALL_COMPETENCE_MASK, "exact", false, "About canonical BRAND_WIDE all seven");
  }

  if (host === "03.1") {
    if (!taskFamily) {
      return contract(nodeId, host, "MASTER", MASTER_STATE_ID, ALL_COMPETENCE_MASK, "exact", false, "Task screen before selection keeps MASTER");
    }
    const found = resolveFamilyGeometry(args.index, taskFamily, ALL_COMPETENCE_MASK);
    return contract(nodeId, host, taskFamily, found.entry.stateId, ALL_COMPETENCE_MASK, found.resolution, found.applyPaletteOverride, `Task selected ${args.flow.taskId} → ${taskFamily}. ${found.reason}`);
  }

  if (host === "03.2") {
    if (!taskFamily) {
      return contract(nodeId, host, "MASTER", MASTER_STATE_ID, ALL_COMPETENCE_MASK, "exact", false, "Competence screen without a task keeps MASTER");
    }
    const mask = selectedMask || ALL_COMPETENCE_MASK;
    const found = resolveFamilyGeometry(args.index, taskFamily, mask);
    return contract(nodeId, host, taskFamily, found.entry.stateId, mask, found.resolution, true, `03.2 ${taskFamily} mask ${mask}. ${found.reason}`);
  }

  if (host === "03.3") {
    if (!taskFamily) {
      return contract(nodeId, host, "MASTER", MASTER_STATE_ID, ALL_COMPETENCE_MASK, "exact", false, "Brief without a task keeps MASTER");
    }
    const mask = args.flow.competenciesConfirmed && selectedMask ? selectedMask : (selectedMask || ALL_COMPETENCE_MASK);
    const found = resolveFamilyGeometry(args.index, taskFamily, mask);
    const overlayNote = nodeId === "03.3" ? "Brief" : `overlay ${nodeId} keeps Brief actor`;
    return contract(nodeId, host, taskFamily, found.entry.stateId, mask, found.resolution, true, `${overlayNote} ${taskFamily} mask ${mask}. ${found.reason}`);
  }

  return contract(nodeId, host, "MASTER", MASTER_STATE_ID, ALL_COMPETENCE_MASK, "exact", false, "documented default MASTER");
}

export function mappingTable(index: StateIndex, flow: FlowContext, overlay: OverlayKind = null) {
  return SCREEN_NODE_IDS.map((id) => resolveScreenActorContract({ nodeId: id, overlay: id === "03.3" ? overlay : null, index, flow }));
}

export const APPROVED_STATIC_MAPPING: ReadonlyArray<{
  nodeId: ActorScreenId;
  family: ActorFamily;
  palette: "all-seven" | "selected" | "single" | "zero";
  slot: ActorSlot;
}> = Object.freeze([
  { nodeId: "01", family: "MASTER", palette: "all-seven", slot: "right" },
  { nodeId: "02", family: "BRAND_WIDE", palette: "all-seven", slot: "right" },
  { nodeId: "03.1", family: "MASTER", palette: "all-seven", slot: "right" },
  { nodeId: "04", family: "MASTER", palette: "all-seven", slot: "right" },
  { nodeId: "05.1", family: "SINGLE", palette: "single", slot: "left" },
  { nodeId: "05.2", family: "SINGLE", palette: "single", slot: "left" },
  { nodeId: "05.3", family: "SINGLE", palette: "single", slot: "left" },
  { nodeId: "05.4", family: "SINGLE", palette: "single", slot: "left" },
  { nodeId: "05.5", family: "SINGLE", palette: "single", slot: "left" },
  { nodeId: "05.6", family: "SINGLE", palette: "single", slot: "left" },
  { nodeId: "05.7", family: "SINGLE", palette: "single", slot: "left" },
  { nodeId: "06.1", family: "MASTER", palette: "all-seven", slot: "right" },
  { nodeId: "06.2", family: "MASTER", palette: "all-seven", slot: "right" },
  { nodeId: "06.3", family: "MASTER", palette: "all-seven", slot: "right" },
  { nodeId: "07", family: "MASTER", palette: "all-seven", slot: "right" },
  { nodeId: "08", family: "none", palette: "zero", slot: "none" },
]);
