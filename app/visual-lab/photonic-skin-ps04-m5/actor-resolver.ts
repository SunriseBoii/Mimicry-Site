/**
 * Compatibility façade. Semantic mapping lives in screen-actor-contract.ts.
 */

export {
  APPROVED_STATIC_MAPPING,
  CANONICAL_BRAND_WIDE_ID,
  CANONICAL_DRIVE_ID,
  CANONICAL_FAMILY_GEOMETRY,
  CANONICAL_FOCUS_ID,
  CANONICAL_GATHER_ID,
  FALLBACK_GEOMETRY_ID,
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
  TASK_FAMILY,
  hostNodeId,
  indexStates,
  mappingTable,
  maskFromIds,
  overlayScreenId,
  resolveFamilyGeometry,
  resolveScreenActorContract,
  type ActorFamily,
  type ActorScreenId,
  type FlowContext,
  type ResolutionKind,
  type ScreenActorContract,
  type StateIndex,
} from "./screen-actor-contract";

export {
  CANONICAL_BRAND_WIDE_ID as BRAND_WIDE_GATHER_ID,
  CANONICAL_DRIVE_ID as BRAND_WIDE_DRIVE_ID,
} from "./screen-actor-contract";

import type { OverlayKind } from "./build-flow";
import { resolveScreenActorContract, type FlowContext, type ScreenActorContract, type StateIndex } from "./screen-actor-contract";
import type { ScreenNodeId } from "./topology";
import type { CompositionMode } from "../photonic-skin-m4-1/m41-data";
import type { CompetenceMask } from "../photonic-skin-ps04-m2/photonic-palette";

export interface ActorRequest {
  nodeId: ScreenNodeId;
  stateId: string | null;
  paletteMask: CompetenceMask;
  geometryMode: CompositionMode | "NONE";
  resolution: ScreenActorContract["resolution"];
  reason: string;
  applyPaletteOverride: boolean;
  contract: ScreenActorContract;
}

export function requestFromContract(contract: ScreenActorContract): ActorRequest {
  return {
    nodeId: contract.hostNodeId,
    stateId: contract.resolvedGeometryId,
    paletteMask: contract.paletteMask,
    geometryMode: contract.family === "none" ? "NONE" : contract.family,
    resolution: contract.resolution,
    reason: contract.reason,
    applyPaletteOverride: contract.applyPaletteOverride || contract.resolution === "same-family-fallback",
    contract,
  };
}

export function resolveActorRequest(args: {
  nodeId: ScreenNodeId;
  index: StateIndex;
  flow: FlowContext;
  overlay?: OverlayKind;
}): ActorRequest {
  return requestFromContract(resolveScreenActorContract(args));
}
