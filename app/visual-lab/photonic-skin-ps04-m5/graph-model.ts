import {
  GRAPH_EDGES,
  SCREEN_NODES,
  graphDistance,
  opacityForDistance,
  type GraphPoint,
  type ScreenNodeId,
} from "./topology";

export const GRAPH_VIEW = Object.freeze({
  width: 88,
  height: 268,
  padding: 14,
  unit: 22,
  ring: 7,
  inner: 2.4,
  stroke: 1.25,
  dash: "2.4 2.2",
});

export interface GraphCamera {
  x: number;
  y: number;
}

export interface UnlockFlags {
  competencies: boolean;
  brief: boolean;
}

export interface GraphNodeView {
  id: ScreenNodeId;
  x: number;
  y: number;
  distance: number;
  opacity: number;
  locked: boolean;
  dashed: boolean;
  interactive: boolean;
  active: boolean;
}

export interface GraphEdgeView {
  from: ScreenNodeId;
  to: ScreenNodeId;
  path: readonly GraphPoint[];
  opacity: number;
  active: boolean;
  progress: number;
}

export interface TravelerState {
  from: ScreenNodeId;
  to: ScreenNodeId;
  progress: number;
  point: GraphPoint;
}

export { opacityForDistance };

export function isNodeUnlocked(id: ScreenNodeId, unlock: UnlockFlags) {
  if (id === "03.2") return unlock.competencies;
  if (id === "03.3") return unlock.brief;
  return true;
}

export function graphNodeViews(active: ScreenNodeId, unlock: UnlockFlags): GraphNodeView[] {
  return SCREEN_NODES.map((node) => {
    const distance = graphDistance(active, node.id);
    const opacity = opacityForDistance(distance);
    const locked = !isNodeUnlocked(node.id, unlock);
    return {
      id: node.id,
      x: node.graph.x,
      y: node.graph.y,
      distance,
      opacity,
      locked,
      dashed: locked,
      interactive: opacity > 0 && !locked,
      active: node.id === active,
    };
  });
}

export function graphEdgeViews(
  active: ScreenNodeId,
  next: ScreenNodeId | null,
  edgeProgress: number,
  unlock: UnlockFlags,
): GraphEdgeView[] {
  const nodes = new Map(graphNodeViews(active, unlock).map((node) => [node.id, node]));
  return GRAPH_EDGES.map((edge) => {
    const a = nodes.get(edge.from)!;
    const b = nodes.get(edge.to)!;
    const opacity = Math.min(a.opacity, b.opacity);
    const forward = edge.from === active && edge.to === next;
    const backward = edge.to === active && edge.from === next;
    return {
      from: edge.from,
      to: edge.to,
      path: edge.path,
      opacity,
      active: forward || backward,
      progress: forward ? edgeProgress : backward ? 1 - edgeProgress : 0,
    };
  });
}

export function pointOnPolyline(path: readonly GraphPoint[], progress: number): GraphPoint {
  const t = Math.min(1, Math.max(0, progress));
  if (path.length === 1) return path[0];
  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const prev = path[index - 1];
    const next = path[index];
    const length = Math.abs(next.x - prev.x) + Math.abs(next.y - prev.y);
    lengths.push(length);
    total += length;
  }
  if (total <= 0) return path[0];
  let remaining = t * total;
  for (let index = 1; index < path.length; index += 1) {
    const length = lengths[index - 1];
    const prev = path[index - 1];
    const next = path[index];
    if (remaining <= length || index === path.length - 1) {
      const local = length <= 0 ? 1 : Math.min(1, remaining / length);
      return {
        x: prev.x + (next.x - prev.x) * local,
        y: prev.y + (next.y - prev.y) * local,
      };
    }
    remaining -= length;
  }
  return path[path.length - 1];
}

export function travelerState(
  active: ScreenNodeId,
  next: ScreenNodeId | null,
  edgeProgress: number,
): TravelerState | null {
  if (!next) return { from: active, to: active, progress: 0, point: SCREEN_NODES.find((node) => node.id === active)!.graph };
  const edge = GRAPH_EDGES.find((item) => item.from === active && item.to === next)
    ?? GRAPH_EDGES.find((item) => item.from === next && item.to === active);
  if (!edge) return { from: active, to: next, progress: edgeProgress, point: SCREEN_NODES.find((node) => node.id === active)!.graph };
  const forward = edge.from === active;
  const progress = forward ? edgeProgress : 1 - edgeProgress;
  return {
    from: active,
    to: next,
    progress: edgeProgress,
    point: pointOnPolyline(edge.path, progress),
  };
}

export function graphCameraFor(active: ScreenNodeId, reducedMotion: boolean, previous?: GraphCamera): GraphCamera {
  const node = SCREEN_NODES.find((item) => item.id === active)!;
  const target = { x: node.graph.x, y: node.graph.y };
  if (reducedMotion || !previous) return target;
  return {
    x: previous.x + (target.x - previous.x) * 0.18,
    y: previous.y + (target.y - previous.y) * 0.18,
  };
}

export function projectGraphPoint(point: GraphPoint, camera: GraphCamera) {
  const originX = GRAPH_VIEW.width / 2;
  const originY = GRAPH_VIEW.height * 0.28;
  return {
    x: originX + (point.x - camera.x) * GRAPH_VIEW.unit,
    y: originY + (point.y - camera.y) * GRAPH_VIEW.unit,
  };
}
