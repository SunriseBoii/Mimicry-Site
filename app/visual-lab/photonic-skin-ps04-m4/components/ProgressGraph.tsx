"use client";

import { useEffect, useRef } from "react";
import {
  GRAPH_EDGES,
  SCREEN_NODES,
  SCREEN_NODE_BY_ID,
  type ScreenNodeId,
} from "../topology";
import {
  GRAPH_VIEW,
  graphCameraFor,
  graphNodeViews,
  isNodeUnlocked,
  opacityForDistance,
  projectGraphPoint,
  travelerState,
  type UnlockFlags,
} from "../graph-model";
import type { ScrollProgress } from "../scroll-controller";
import styles from "../ps04m4.module.css";

export function ProgressGraph({
  progressRef,
  unlock,
  reducedMotion,
  onNavigate,
}: {
  progressRef: { current: ScrollProgress };
  unlock: UnlockFlags;
  reducedMotion: boolean;
  onNavigate: (id: ScreenNodeId) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const hitsRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const svg = svgRef.current;
      const hits = hitsRef.current;
      const progress = progressRef.current;
      if (svg && hits && progress) {
        cameraRef.current = graphCameraFor(progress.activeNodeId, reducedMotion, cameraRef.current);
        const camera = cameraRef.current;
        const nodes = graphNodeViews(progress.activeNodeId, unlock);
        const traveler = travelerState(progress.activeNodeId, progress.nextNodeId, progress.edgeProgress);
        for (const node of nodes) {
          const el = svg.querySelector(`[data-ring="${node.id}"]`);
          const button = hits.querySelector(`[data-hit="${node.id}"]`);
          const point = projectGraphPoint({ x: node.x, y: node.y }, camera);
          if (el instanceof SVGGElement) {
            el.setAttribute("transform", `translate(${point.x} ${point.y})`);
            el.setAttribute("opacity", String(node.opacity));
            el.setAttribute("display", node.opacity <= 0 ? "none" : "inline");
            const ring = el.querySelector("[data-ring-circle]");
            if (ring instanceof SVGCircleElement) {
              if (node.dashed) ring.setAttribute("stroke-dasharray", GRAPH_VIEW.dash);
              else ring.removeAttribute("stroke-dasharray");
            }
            const marker = el.querySelector("[data-active-marker]");
            if (marker instanceof SVGCircleElement) marker.setAttribute("opacity", node.active ? "1" : "0");
          }
          if (button instanceof HTMLButtonElement) {
            button.style.left = `${point.x}px`;
            button.style.top = `${point.y}px`;
            button.style.display = node.opacity <= 0 ? "none" : "block";
            button.tabIndex = node.interactive ? 0 : -1;
            button.disabled = !node.interactive;
            button.setAttribute("aria-hidden", node.interactive ? "false" : "true");
            if (node.active) button.setAttribute("aria-current", "step");
            else button.removeAttribute("aria-current");
            if (node.locked) button.setAttribute("aria-disabled", "true");
            else button.removeAttribute("aria-disabled");
          }
        }
        for (const edge of GRAPH_EDGES) {
          const el = svg.querySelector(`[data-edge="${edge.from}-${edge.to}"]`);
          if (!(el instanceof SVGElement)) continue;
          const a = nodes.find((node) => node.id === edge.from)!;
          const b = nodes.find((node) => node.id === edge.to)!;
          const opacity = Math.min(a.opacity, b.opacity);
          const d = edge.path
            .map((point, index) => {
              const projected = projectGraphPoint(point, camera);
              return `${index === 0 ? "M" : "L"}${projected.x} ${projected.y}`;
            })
            .join(" ");
          el.setAttribute("d", d);
          el.setAttribute("opacity", String(opacity));
          el.setAttribute("display", opacity <= 0 ? "none" : "inline");
        }
        const marker = svg.querySelector("[data-traveler]");
        if (marker instanceof SVGElement && traveler) {
          const point = projectGraphPoint(traveler.point, camera);
          marker.setAttribute("cx", String(point.x));
          marker.setAttribute("cy", String(point.y));
          marker.setAttribute("opacity", String(opacityForDistance(0)));
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [progressRef, reducedMotion, unlock]);

  return (
    <div className={styles.graph} data-qa="m4-graph" role="navigation" aria-label="Прогресс маршрута, ортогональный граф экранов">
      <svg
        ref={svgRef}
        width={GRAPH_VIEW.width}
        height={GRAPH_VIEW.height}
        viewBox={`0 0 ${GRAPH_VIEW.width} ${GRAPH_VIEW.height}`}
        aria-hidden="true"
      >
        {GRAPH_EDGES.map((edge) => (
          <path
            key={`${edge.from}-${edge.to}`}
            data-edge={`${edge.from}-${edge.to}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={GRAPH_VIEW.stroke}
          />
        ))}
        {SCREEN_NODES.map((node) => (
          <g key={node.id} data-ring={node.id}>
            <circle
              data-ring-circle="true"
              r={GRAPH_VIEW.ring}
              fill="none"
              stroke="currentColor"
              strokeWidth={GRAPH_VIEW.stroke}
              strokeDasharray={node.dynamic ? GRAPH_VIEW.dash : undefined}
            />
            <circle r={GRAPH_VIEW.inner} fill="currentColor" data-active-marker="true" opacity={0} />
          </g>
        ))}
        <circle data-traveler="true" r={2.2} fill="currentColor" />
      </svg>
      <div ref={hitsRef} className={styles.graphHits}>
        {SCREEN_NODES.map((node) => (
          <button
            key={node.id}
            type="button"
            data-hit={node.id}
            aria-label={`${node.title}, экран ${node.index + 1} из 18`}
            onClick={() => {
              if (!isNodeUnlocked(node.id, unlock)) return;
              onNavigate(node.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function graphLabel(id: ScreenNodeId) {
  return SCREEN_NODE_BY_ID[id].title;
}
