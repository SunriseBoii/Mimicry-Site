"use client";

import type { MagnetizedSettleTelemetry } from "./magnetized-settle-runtime";

export function MagnetizedSettleHud(props: {
  telemetry: MagnetizedSettleTelemetry | null;
  extras?: Array<[string, string | number | boolean | null]>;
  qa?: string;
  title?: string;
}) {
  const t = props.telemetry;
  if (!t) return null;
  const qa = props.qa ?? "m62-settle-hud";
  const prefix = qa.replace(/-settle-hud$/, "");
  const rows: Array<[string, string | number | boolean | null]> = [
    ["scrollPhase", t.scrollPhase],
    ["observedNodeId", t.observedNodeId],
    ["snapCandidateNodeId", t.snapCandidateNodeId],
    ["magneticDestinationNodeId", t.magneticDestinationNodeId],
    ["magnetizedSettledNodeId", t.magnetizedSettledNodeId],
    ["magneticSettleRevision", t.magneticSettleRevision],
    ["actorRequestSource", t.actorRequestSource ? `${t.actorRequestSource.kind}` : null],
    ["interactionRevision", t.interactionRevision],
    ["lastAppliedInteractionRevision", t.lastAppliedInteractionRevision],
    ["distanceToAnchorPx", t.distanceToAnchorPx.toFixed(2)],
    ["scrollVelocityVhPerSecond", t.scrollVelocityVhPerSecond.toFixed(4)],
    ["gestureActive", t.gestureActive],
    ["inputQuietForMs", Math.round(t.inputQuietForMs)],
    ["candidateStableForMs", Math.round(t.candidateStableForMs)],
    ["layoutRevision", t.layoutRevision],
    ["actorStatus", t.actorStatus],
    ["actorVisualStarted", t.actorVisualStarted],
    ["actorCommittedNodeId", t.actorCommittedNodeId],
    ["actorEndpointKey", t.actorEndpointKey],
    ["queuedActorNodeId", t.queuedActorNodeId],
    ["queuedSettleRevision", t.queuedSettleRevision],
    ["actorRequestCount", t.actorRequestCount],
    ["cancelledBeforeVisualStartCount", t.cancelledBeforeVisualStartCount],
    ["ignoredCandidateCount", t.ignoredCandidateCount],
    ["compileLiveRetargetCount", t.compileLiveRetargetCount],
    ["requestsToCrossedNodes", t.requestsToCrossedNodes],
    ["maxActorQueueDepth", t.maxActorQueueDepth],
    ["staleQueuedTransitionStarts", t.staleQueuedTransitionStarts],
    ["runningMorphInterruptedByScroll", t.runningMorphInterruptedByScroll],
    ...(props.extras ?? []),
  ];
  return (
    <aside
      data-qa={qa}
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 40,
        width: 320,
        maxHeight: "46vh",
        overflow: "auto",
        padding: "10px 12px",
        borderRadius: 10,
        background: "rgba(8, 10, 14, 0.78)",
        color: "#f4f1ea",
        font: "11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        pointerEvents: "none",
      }}
    >
      <div style={{ marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase", opacity: 0.7 }}>{props.title ?? "M6.2 settle"}</div>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ opacity: 0.65 }}>{label}</span>
          <span data-qa={`${prefix}-${label}`}>{value == null ? "—" : String(value)}</span>
        </div>
      ))}
    </aside>
  );
}
