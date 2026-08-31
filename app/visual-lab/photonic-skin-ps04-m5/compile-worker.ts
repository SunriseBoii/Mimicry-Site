/**
 * Dedicated CPU compile worker. No DOM, no Three.js, no actor bind.
 * Frozen evaluator math is imported unchanged.
 */

import {
  loadMatchingPrecompiledProgram,
  loadRuntimeManifests,
  loadState,
  PrecompiledProgramUnavailableError,
  type M3Manifest,
  type M41Manifest,
} from "../photonic-skin-m4-1/m41-data";
import { compileTransition, type ViewportProfile } from "../photonic-skin-m4-1/m41-evaluator";

const M3_SEED = 0x50533034;

type WorkerRequest = {
  requestId: number;
  sourceId: string;
  targetId: string;
  reducedMotion: boolean;
  viewport: "desktop" | "mobile";
};

let manifests: { m3: M3Manifest; m4: M41Manifest } | null = null;

async function compileFrozenPairOnWorker(
  sourceId: string,
  targetId: string,
  reducedMotion: boolean,
  viewport: ViewportProfile,
) {
  if (!manifests) manifests = await loadRuntimeManifests();
  const sourceEntry = manifests.m3.states.find((entry) => entry.stateId === sourceId);
  const targetEntry = manifests.m3.states.find((entry) => entry.stateId === targetId);
  if (!sourceEntry || !targetEntry) throw new Error(`missing state ${sourceId} → ${targetId}`);
  const source = await loadState(sourceEntry);
  const target = await loadState(targetEntry);
  if (!reducedMotion) {
    try {
      return await loadMatchingPrecompiledProgram(manifests.m4, source, target, "qa", viewport);
    } catch (reason) {
      if (!(reason instanceof PrecompiledProgramUnavailableError)) throw reason;
    }
  }
  return compileTransition(source, target, {
    schemaVersion: "1.0.0",
    sourceStateId: source.entry.stateId,
    targetStateId: target.entry.stateId,
    identitySpaceVersion: manifests.m3.identitySpace.identitySpaceVersion,
    motionProfileId: "directed-plastic-release",
    triggerMode: "qa",
    viewportProfile: viewport,
    directionIntent: "auto",
    deterministicSeed: M3_SEED,
    reducedMotion,
  });
}

function collectProgramBuffers(program: Awaited<ReturnType<typeof compileFrozenPairOnWorker>>) {
  const buffers: ArrayBuffer[] = [];
  const add = (view?: ArrayBufferView | null) => {
    if (view && view.buffer instanceof ArrayBuffer && !buffers.includes(view.buffer)) buffers.push(view.buffer);
  };
  add(program.trackIndex);
  add(program.residual);
  add(program.phaseDelay);
  add(program.bridgeWeight);
  add(program.sourceVelocity ?? null);
  add(program.sourceScaleVelocity ?? null);
  const perId = program.compiled?.perId;
  if (perId) {
    add(perId.localSource);
    add(perId.localTarget);
    add(perId.residual);
    add(perId.depth);
    add(perId.activationStart);
    add(perId.activationEnd);
    add(perId.scaleBias);
    add(perId.groupIndex);
    add(perId.flags);
    add(perId.phaseOffset);
  }
  return buffers;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { requestId, sourceId, targetId, reducedMotion, viewport } = event.data;
  try {
    const program = await compileFrozenPairOnWorker(sourceId, targetId, reducedMotion, viewport);
    const scope = self as unknown as { postMessage: (message: unknown, transfer: Transferable[]) => void };
    scope.postMessage({ requestId, ok: true, program }, collectProgramBuffers(program));
  } catch (reason) {
    self.postMessage({
      requestId,
      ok: false,
      error: reason instanceof Error ? reason.message : String(reason),
    });
  }
};
