"use client";

import { useEffect, useRef, useState } from "react";
import {
  LatestRequestGate,
  PrecompiledProgramUnavailableError,
  StaleRequestError,
  getOrCompileProgram,
  loadLatestStatePair,
  loadMatchingPrecompiledProgram,
  loadRuntimeManifests,
  type DecodedState,
  type M3Manifest,
  type M41Manifest,
} from "../photonic-skin-m4-1/m41-data";
import {
  compileTransition,
  type TransitionProgram,
  type TriggerMode,
  type ViewportProfile,
} from "../photonic-skin-m4-1/m41-evaluator";

const DEFAULT_SEED = 0x50533034;

interface RuntimeOptions {
  initialSourceId?: string;
  initialTargetId?: string;
  reducedMotion: boolean;
  trigger?: Exclude<TriggerMode, "preview">;
  viewport?: ViewportProfile;
}

function programKey(
  source: DecodedState,
  target: DecodedState,
  trigger: TriggerMode,
  viewport: ViewportProfile,
  seed: number,
) {
  return ["ps04-m1", source.entry.contentHash, target.entry.contentHash, trigger, viewport, seed >>> 0].join(":");
}

export function usePS04Runtime({
  initialSourceId,
  initialTargetId,
  reducedMotion,
  trigger = "route",
  viewport = "desktop",
}: RuntimeOptions) {
  const [manifest, setManifest] = useState<M3Manifest | null>(null);
  const [motionManifest, setMotionManifest] = useState<M41Manifest | null>(null);
  const [sourceId, setSourceId] = useState(initialSourceId ?? "");
  const [targetId, setTargetId] = useState(initialTargetId ?? "");
  const [source, setSource] = useState<DecodedState | null>(null);
  const [target, setTarget] = useState<DecodedState | null>(null);
  const [program, setProgram] = useState<TransitionProgram | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadMs, setLoadMs] = useState(0);
  const gate = useRef(new LatestRequestGate());

  useEffect(() => {
    const controller = new AbortController();
    const started = performance.now();
    loadRuntimeManifests(controller.signal).then(({ m3, m4 }) => {
      const query = new URLSearchParams(window.location.search);
      const master = m3.states.find((entry) => entry.stateRole === "master") ?? m3.states[0];
      const fallbackTarget = m3.states.find((entry) => entry.stateId === "single-event")
        ?? m3.states.find((entry) => entry.stateRole === "single")
        ?? master;
      const requestedSource = initialSourceId ?? query.get("source") ?? "";
      const requestedTarget = initialTargetId ?? query.get("state") ?? query.get("target") ?? "";
      setManifest(m3);
      setMotionManifest(m4);
      setSourceId(m3.states.some((entry) => entry.stateId === requestedSource) ? requestedSource : master.stateId);
      setTargetId(m3.states.some((entry) => entry.stateId === requestedTarget) ? requestedTarget : fallbackTarget.stateId);
      setLoadMs(Math.round(performance.now() - started));
    }).catch((reason: Error) => {
      if (reason.name !== "AbortError") setError(reason.message);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [initialSourceId, initialTargetId]);

  useEffect(() => {
    if (!manifest || !sourceId || !targetId) return;
    let mounted = true;
    const started = performance.now();
    queueMicrotask(() => {
      if (mounted) setLoading(true);
    });
    loadLatestStatePair(manifest, sourceId, targetId, gate.current).then(async (pair) => {
      const seed = DEFAULT_SEED;
      const nextProgram = await getOrCompileProgram(
        programKey(pair.source, pair.target, trigger, viewport, seed),
        async () => {
          if (motionManifest && !reducedMotion) {
            try {
              return await loadMatchingPrecompiledProgram(
                motionManifest,
                pair.source,
                pair.target,
                trigger,
                viewport,
                { signal: pair.signal },
              );
            } catch (reason) {
              if (!(reason instanceof PrecompiledProgramUnavailableError)) throw reason;
            }
          }
          return compileTransition(pair.source, pair.target, {
            schemaVersion: "1.0.0",
            sourceStateId: sourceId,
            targetStateId: targetId,
            identitySpaceVersion: manifest.identitySpace.identitySpaceVersion,
            motionProfileId: "directed-plastic-release",
            triggerMode: trigger,
            viewportProfile: viewport,
            directionIntent: "auto",
            deterministicSeed: seed,
            reducedMotion,
          });
        },
      );
      if (!mounted) return;
      setSource(pair.source);
      setTarget(pair.target);
      setProgram(nextProgram);
      setLoadMs(Math.round(performance.now() - started));
      setError(null);
    }).catch((reason: Error) => {
      if (mounted && reason.name !== "AbortError" && !(reason instanceof StaleRequestError)) {
        setError(reason.message);
      }
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [manifest, motionManifest, reducedMotion, sourceId, targetId, trigger, viewport]);

  useEffect(() => () => gate.current.cancel(), []);

  return {
    manifest,
    motionManifest,
    sourceId,
    targetId,
    setSourceId,
    setTargetId,
    source,
    target,
    program,
    loading,
    error,
    loadMs,
  };
}
