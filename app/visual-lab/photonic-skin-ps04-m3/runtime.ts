import type { DecodedState, M3Manifest, StateEntry } from "../photonic-skin-m4-1/m41-data";
import {
  PrecompiledProgramUnavailableError,
  loadMatchingPrecompiledProgram,
  loadState,
  type M41Manifest,
} from "../photonic-skin-m4-1/m41-data";
import {
  compileTransition,
  type TriggerMode,
  type ViewportProfile,
} from "../photonic-skin-m4-1/m41-evaluator";
import { runtimeDecoded, type JointSnapshot } from "./session";

export const M3_SEED = 0x50533034;

export function viewportForFrame(frame: string): ViewportProfile {
  return frame === "mobile390" ? "mobile" : "desktop";
}

export async function compileFrozenPair(
  source: DecodedState,
  target: DecodedState,
  manifest: M3Manifest,
  motion: M41Manifest | null,
  options: {
    reducedMotion: boolean;
    trigger?: TriggerMode;
    viewport?: ViewportProfile;
    signal?: AbortSignal;
  },
) {
  const trigger = options.trigger ?? "qa";
  const viewport = options.viewport ?? "desktop";
  if (motion && !options.reducedMotion) {
    try {
      return await loadMatchingPrecompiledProgram(motion, source, target, trigger, viewport, { signal: options.signal });
    } catch (reason) {
      if (!(reason instanceof PrecompiledProgramUnavailableError)) throw reason;
    }
  }
  return compileTransition(source, target, {
    schemaVersion: "1.0.0",
    sourceStateId: source.entry.stateId,
    targetStateId: target.entry.stateId,
    identitySpaceVersion: manifest.identitySpace.identitySpaceVersion,
    motionProfileId: "directed-plastic-release",
    triggerMode: trigger,
    viewportProfile: viewport,
    directionIntent: "auto",
    deterministicSeed: M3_SEED,
    reducedMotion: options.reducedMotion,
  });
}

export function compileLiveRetarget(
  captured: JointSnapshot,
  source: DecodedState,
  target: DecodedState,
  manifest: M3Manifest,
  options: {
    reducedMotion: boolean;
    trigger?: TriggerMode;
    viewport?: ViewportProfile;
  },
) {
  if (!captured.m4Snapshot) {
    return {
      liveSource: source,
      program: compileTransition(source, target, {
        schemaVersion: "1.0.0",
        sourceStateId: source.entry.stateId,
        targetStateId: target.entry.stateId,
        identitySpaceVersion: manifest.identitySpace.identitySpaceVersion,
        motionProfileId: "directed-plastic-release",
        triggerMode: options.trigger ?? "qa",
        viewportProfile: options.viewport ?? "desktop",
        directionIntent: "auto",
        deterministicSeed: M3_SEED,
        reducedMotion: options.reducedMotion,
      }),
    };
  }
  const liveSource = runtimeDecoded(captured.m4Snapshot, source, target, captured.geometryProgress);
  return {
    liveSource,
    program: compileTransition(liveSource, target, {
      schemaVersion: "1.0.0",
      sourceSnapshot: captured.m4Snapshot,
      targetStateId: target.entry.stateId,
      identitySpaceVersion: manifest.identitySpace.identitySpaceVersion,
      motionProfileId: "directed-plastic-release",
      triggerMode: options.trigger ?? "qa",
      viewportProfile: options.viewport ?? "desktop",
      directionIntent: "auto",
      deterministicSeed: M3_SEED,
      reducedMotion: options.reducedMotion,
    }),
  };
}

export async function loadEntry(entry: StateEntry) {
  return loadState(entry);
}

