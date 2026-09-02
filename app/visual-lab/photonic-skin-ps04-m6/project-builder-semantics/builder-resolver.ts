import {
  ALL_COMPETENCE_MASK,
  maskFromCompetencies,
  paletteMaskForState,
  type CompetenceMask,
} from "../../photonic-skin-ps04-m2/photonic-palette";
import {
  indexStates,
  resolveScreenActorContract,
  type FlowContext,
  type ScreenActorContract,
  type StateIndex,
} from "../../photonic-skin-ps04-m5/screen-actor-contract";
import type { OverlayKind } from "../../photonic-skin-ps04-m5/build-flow";
import type { ScreenNodeId } from "../../photonic-skin-ps04-m5/topology";
import {
  BUILDER_SCREENS,
  CANONICAL_COMPETENCY_ORDER,
  MASTER_STATE_ID,
  SINGLE_STATE_IDS,
  canonicalizeCompetencySet,
  driveStateId,
  gatherStateId,
  namespaceForStateId,
  type BuilderCompetency,
  type BuilderScreen,
  type BuilderTaskId,
} from "./builder-ids";

export class BuilderCoverageError extends Error {
  readonly kind = "STATE_COVERAGE_INCOMPLETE";
  constructor(readonly stateId: string, readonly screen: BuilderScreen) {
    super(`PS-04.M6.1 FAIL / STATE COVERAGE INCOMPLETE: missing exact ${stateId} for ${screen}`);
    this.name = "BuilderCoverageError";
  }
}

export interface BuilderResolveInput {
  screen: BuilderScreen;
  draftCompetencies: readonly string[];
  confirmedCompetencies: readonly string[] | null;
}

export function hostBuilderScreen(screen: BuilderScreen): "03.1" | "03.2" | "03.3" {
  if (screen === "03.3A" || screen === "03.3B") return "03.3";
  return screen;
}

export function resolveBuilderState(input: BuilderResolveInput): string {
  if (input.screen === "03.1") return MASTER_STATE_ID;

  const source = input.screen === "03.2"
    ? input.draftCompetencies
    : (input.confirmedCompetencies ?? []);

  const selected = canonicalizeCompetencySet(source);
  if (selected.length === 0) return MASTER_STATE_ID;
  if (selected.length === 1) return SINGLE_STATE_IDS[selected[0]];
  if (input.screen === "03.2") return gatherStateId(selected);
  return driveStateId(selected);
}

export function builderPhase(screen: BuilderScreen, stateId: string): "potential" | "gather" | "drive" | "single" {
  if (screen === "03.1" || stateId === MASTER_STATE_ID) return "potential";
  if (stateId.startsWith("single-")) return "single";
  if (stateId.startsWith("complex-gather-")) return "gather";
  return "drive";
}

export function paletteMaskForBuilderState(stateId: string, competencies: readonly BuilderCompetency[]): CompetenceMask {
  if (stateId === MASTER_STATE_ID) return ALL_COMPETENCE_MASK;
  if (competencies.length === 0) return ALL_COMPETENCE_MASK;
  return maskFromCompetencies(competencies);
}

export function overlayToBuilderScreen(host: ScreenNodeId, overlay: OverlayKind): BuilderScreen | null {
  if (host === "03.1" || host === "03.2") return host;
  if (host !== "03.3") return null;
  if (overlay === "contact") return "03.3A";
  if (overlay === "success") return "03.3B";
  return "03.3";
}

export interface BuilderFlowView {
  taskId: BuilderTaskId | null;
  draftCompetencies: readonly string[];
  confirmedCompetencies: readonly string[] | null;
}

function familyForStateId(stateId: string): ScreenActorContract["family"] {
  if (stateId === MASTER_STATE_ID) return "MASTER";
  if (stateId.startsWith("single-")) return "SINGLE";
  if (stateId.startsWith("complex-gather-")) return "GATHER";
  if (stateId.startsWith("complex-drive-")) return "DRIVE";
  return "MASTER";
}

export function resolveBuilderActorContract(args: {
  nodeId: ScreenNodeId;
  overlay?: OverlayKind;
  index: StateIndex;
  flow: BuilderFlowView;
}): ScreenActorContract {
  const overlay = args.overlay ?? null;
  const builderScreen = overlayToBuilderScreen(args.nodeId, overlay);
  if (!builderScreen) {
    const m5Flow: FlowContext = {
      taskId: null,
      taskSelected: false,
      competencies: [],
      competenciesConfirmed: false,
      settledStateId: MASTER_STATE_ID,
    };
    return resolveScreenActorContract({
      nodeId: args.nodeId,
      overlay,
      index: args.index,
      flow: m5Flow,
    });
  }

  const stateId = resolveBuilderState({
    screen: builderScreen,
    draftCompetencies: args.flow.draftCompetencies,
    confirmedCompetencies: args.flow.confirmedCompetencies,
  });
  const entry = args.index.byId.get(stateId);
  if (!entry) throw new BuilderCoverageError(stateId, builderScreen);

  const selected = builderScreen === "03.2"
    ? canonicalizeCompetencySet(args.flow.draftCompetencies)
    : canonicalizeCompetencySet(args.flow.confirmedCompetencies ?? []);
  const mask = paletteMaskForBuilderState(stateId, selected);
  const exactMask = paletteMaskForState(entry);
  if (stateId !== MASTER_STATE_ID && exactMask !== mask) {
    throw new BuilderCoverageError(stateId, builderScreen);
  }

  const family = familyForStateId(stateId);
  const host = hostBuilderScreen(builderScreen);
  return {
    nodeId: builderScreen,
    hostNodeId: host,
    family,
    requestedFamily: family,
    resolvedGeometryId: stateId,
    paletteMask: mask,
    slot: "right",
    fitProfile: family === "MASTER" ? "master" : family === "SINGLE" ? "single" : "complex",
    resolution: "exact",
    applyPaletteOverride: false,
    reason: `${builderScreen} exact ${stateId} ns=${namespaceForStateId(stateId)}`,
  };
}

export function assertNoForbiddenFallback(contract: ScreenActorContract) {
  if (contract.resolution !== "exact") {
    throw new Error(`Forbidden builder fallback: ${contract.resolution} ${contract.reason}`);
  }
  if (contract.applyPaletteOverride) {
    throw new Error(`Forbidden builder palette override: ${contract.reason}`);
  }
  const id = contract.resolvedGeometryId ?? "";
  if (id.startsWith("complex-focus-") || id.startsWith("brand-wide-")) {
    throw new Error(`Forbidden FOCUS/BRAND_WIDE builder geometry: ${id}`);
  }
}

export { indexStates, BUILDER_SCREENS, CANONICAL_COMPETENCY_ORDER };
