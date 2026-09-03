/**
 * Scroll-coupled presentation placement. Pure function of layout anchors and
 * scrollY. Does not create actor requests, compiles, or queue entries.
 */

import { c2Window } from "../../photonic-skin-ps04-m3/idle-motion";
import {
  actorSquareCss,
  placementCenter,
  sampleComposition,
  type Placement,
} from "../../photonic-skin-ps04-m5/composition";
import type { CanonicalLayout } from "../../photonic-skin-ps04-m5/scroll-controller";
import { SCREEN_NODE_BY_ID, type ScreenNodeId } from "../../photonic-skin-ps04-m5/topology";

export interface RouteSegment {
  presentationSourceNodeId: ScreenNodeId;
  presentationTargetNodeId: ScreenNodeId;
  routeSegmentProgress: number;
}

export interface DisplayedPlacement {
  x: number;
  y: number;
  size: number;
  slot: Placement;
}

export interface PresentationPlacementSample extends RouteSegment {
  easedProgress: number;
  displayedPlacement: DisplayedPlacement;
  visible: boolean;
  actorDraw: boolean;
  lastValidSlot: Exclude<Placement, "exit" | "none">;
}

export interface PlacementChannelTelemetry {
  placementActorRequestCount: number;
  placementCompileCount: number;
  placementQueueDepth: number;
  postSettlePlacementDeltaPx: number;
}

export function createPlacementChannelTelemetry(): PlacementChannelTelemetry {
  return {
    placementActorRequestCount: 0,
    placementCompileCount: 0,
    placementQueueDepth: 0,
    postSettlePlacementDeltaPx: 0,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function actorSlotForNode(nodeId: ScreenNodeId): Placement {
  return SCREEN_NODE_BY_ID[nodeId].actorPlacement;
}

export function isDrawnSlot(slot: Placement): slot is "left" | "right" {
  return slot === "left" || slot === "right";
}

export function routeSegmentAt(scrollY: number, layout: CanonicalLayout): RouteSegment {
  const segments = layout.segments;
  if (segments.length === 0) {
    return {
      presentationSourceNodeId: "01",
      presentationTargetNodeId: "01",
      routeSegmentProgress: 1,
    };
  }
  const maxY = Math.max(0, layout.documentHeight - 1);
  const y = clamp(scrollY, 0, maxY);
  let index = 0;
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (y < segments[i + 1].start) {
      index = i;
      break;
    }
    index = i + 1;
  }
  const source = segments[index];
  const target = segments[index + 1] ?? source;
  const span = Math.max(1, target.start - source.start);
  const progress = source.id === target.id ? 1 : clamp((y - source.start) / span, 0, 1);
  return {
    presentationSourceNodeId: source.id,
    presentationTargetNodeId: target.id,
    routeSegmentProgress: progress,
  };
}

export function presentationSlotForNode(
  nodeId: ScreenNodeId,
  lastValidSlot: Exclude<Placement, "exit" | "none">,
): Exclude<Placement, "exit"> {
  const slot = actorSlotForNode(nodeId);
  if (isDrawnSlot(slot)) return slot;
  return lastValidSlot;
}

export function computePresentationPlacement(args: {
  scrollY: number;
  layout: CanonicalLayout;
  width: number;
  height: number;
  dpr: number;
  identity?: boolean;
  magnetizedSettledNodeId: ScreenNodeId | null;
  scrollPhase: string;
  lastValidSlot: Exclude<Placement, "exit" | "none">;
}): PresentationPlacementSample {
  const segment = routeSegmentAt(args.scrollY, args.layout);
  const footerSettled = args.magnetizedSettledNodeId === "08" && args.scrollPhase === "Settled";
  const sourceSlot = presentationSlotForNode(segment.presentationSourceNodeId, args.lastValidSlot);
  const targetSlot = presentationSlotForNode(segment.presentationTargetNodeId, args.lastValidSlot);
  const lastValidSlot = isDrawnSlot(targetSlot)
    ? targetSlot
    : (isDrawnSlot(sourceSlot) ? sourceSlot : args.lastValidSlot);
  const mix = c2Window(segment.routeSegmentProgress, 0, 1);
  const size = actorSquareCss(args.width, args.height);
  const from = placementCenter(sourceSlot, args.width, args.height, size, 0);
  const to = placementCenter(targetSlot, args.width, args.height, size, 0);
  const x = from.x + (to.x - from.x) * mix;
  const y = from.y + (to.y - from.y) * mix;
  const slot = mix >= 1 ? targetSlot : sourceSlot;
  return {
    ...segment,
    easedProgress: mix,
    displayedPlacement: { x, y, size, slot },
    visible: !footerSettled,
    actorDraw: !footerSettled,
    lastValidSlot,
  };
}

export function settledSlotSample(args: {
  nodeId: ScreenNodeId;
  width: number;
  height: number;
  dpr: number;
  lastValidSlot: Exclude<Placement, "exit" | "none">;
}) {
  const slot = presentationSlotForNode(args.nodeId, args.lastValidSlot);
  return sampleComposition({
    width: args.width,
    height: args.height,
    dpr: args.dpr,
    placement: slot,
    exitProgress: 0,
    reducedMotion: true,
  });
}

export function placementDeltaPx(
  displayed: DisplayedPlacement,
  settled: { cssCenterX: number; cssCenterY: number },
) {
  return Math.hypot(displayed.x - settled.cssCenterX, displayed.y - settled.cssCenterY);
}
