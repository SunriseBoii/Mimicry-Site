"use client";

import type { KeyboardEvent } from "react";
import {
  ABOUT_ZOOM_PERCENTS,
  MERCH_ZOOM_PERCENTS,
  VIDEO_ZOOM_PERCENTS,
  type AboutZoomPercent,
  type MerchZoomPercent,
  type VideoZoomPercent,
  SELECTED_VIDEO_HASH,
  SELECTED_VIDEO_YAW_DEGREES,
  SELECTED_VIDEO_CLAPPER_OPEN_DEGREES,
  OWNER_SELECTED_PROFILE_ID,
} from "../framing";
import {
  DIAGNOSTIC_LABELS,
  FRAMING_DIAGNOSTICS,
  FRAMING_SCREENS,
  FRAMING_THEMES,
  FRAMING_VIEWPORTS,
  SCREEN_LABELS,
  type FramingDiagnosticId,
  type FramingPlayMode,
  type FramingScreenQuery,
  type FramingThemeId,
  type FramingViewportId,
} from "../framing-sandbox/sandbox-query";
import { loadingLabel, type SandboxLoadStatus } from "../framing-sandbox/sandbox-load-gate";
import styles from "../framing-sandbox/framing-sandbox.module.css";
import type { PromotionNamespaceId } from "./promoted-runtime";

function Group<T extends string | number>(props: {
  label: string;
  value: T;
  ids: readonly T[];
  names?: Record<string, string>;
  qa: string;
  onChange: (id: T) => void;
}) {
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = props.ids.indexOf(props.value);
    if (index < 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      props.onChange(props.ids[(index + 1) % props.ids.length]);
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      props.onChange(props.ids[(index - 1 + props.ids.length) % props.ids.length]);
    }
  };
  return (
    <div className={styles.sandboxSection}>
      <h2>{props.label}</h2>
      <div className={styles.sandboxGroup} role="group" aria-label={props.label} onKeyDown={onKey}>
        {props.ids.map((id) => (
          <button
            key={String(id)}
            type="button"
            className={styles.sandboxBtn}
            data-qa={`${props.qa}-${id}`}
            data-active={props.value === id ? "true" : "false"}
            aria-pressed={props.value === id}
            onClick={() => props.onChange(id)}
          >
            {props.names?.[String(id)] ?? (typeof id === "number" ? `${id}%` : String(id))}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FramingReviewPanel(props: {
  mode: "lab" | "preview";
  screen: FramingScreenQuery;
  aboutZoom: AboutZoomPercent;
  merchZoom: MerchZoomPercent;
  videoZoom: VideoZoomPercent;
  viewport: FramingViewportId;
  diagnostic: FramingDiagnosticId;
  theme: FramingThemeId;
  playMode: FramingPlayMode;
  loadStatus: SandboxLoadStatus;
  requestedZoom: number;
  displayedZoom: number;
  sourceZoom: number;
  targetZoom: number;
  currentZoom: number;
  effectiveZoom: number;
  framingRevision: number;
  nodeId: string;
  geometryId: string | null;
  hash: string | null;
  cap: number;
  capped: boolean;
  onScreen: (id: FramingScreenQuery) => void;
  onAboutZoom: (value: AboutZoomPercent) => void;
  onMerchZoom: (value: MerchZoomPercent) => void;
  onVideoZoom: (value: VideoZoomPercent) => void;
  onViewport: (id: FramingViewportId) => void;
  onDiagnostic: (id: FramingDiagnosticId) => void;
  onTheme: (id: FramingThemeId) => void;
  onMode: (id: FramingPlayMode) => void;
  namespace?: PromotionNamespaceId;
  onNamespace?: (id: PromotionNamespaceId) => void;
  assetNamespace?: string;
  eventOverlay?: string;
  videoOverlay?: string;
  runtimeRotationOverride?: string;
  framingProfile?: string;
  onOpenLab?: () => void;
}) {
  const statusText = props.loadStatus === "loading"
    ? loadingLabel("FRAMING")
    : props.loadStatus === "error"
      ? "Ошибка загрузки"
      : "ready";

  if (props.mode === "preview") {
    return null;
  }

  return (
    <aside className={styles.sandboxPanel} data-qa="m55-review-panel">
      <div className={styles.sandboxHud} data-qa="m55-hud">
        <div className={styles.sandboxKicker}>PS‑04.M5.5 PROMOTION PREVIEW</div>
        <div><strong>assetNamespace:</strong> {props.assetNamespace ?? "ps-04-m5-5"}</div>
        <div><strong>stateHash:</strong> {props.hash ?? "—"}</div>
        <div><strong>eventOverlay:</strong> {props.eventOverlay ?? "none"}</div>
        <div><strong>videoOverlay:</strong> {props.videoOverlay ?? "none"}</div>
        <div><strong>runtimeRotationOverride:</strong> {props.runtimeRotationOverride ?? "none"}</div>
        <div><strong>framingProfile:</strong> {props.framingProfile ?? OWNER_SELECTED_PROFILE_ID}</div>
        <div><strong>Requested framing:</strong> {props.requestedZoom.toFixed(3)}</div>
        <div><strong>Displayed framing:</strong> {props.displayedZoom.toFixed(3)}</div>
        <div><strong>Source zoom:</strong> {props.sourceZoom.toFixed(3)}</div>
        <div><strong>Target zoom:</strong> {props.targetZoom.toFixed(3)}</div>
        <div><strong>Current zoom:</strong> {props.currentZoom.toFixed(3)}</div>
        <div><strong>Effective responsive zoom:</strong> {props.effectiveZoom.toFixed(3)}</div>
        <div><strong>Framing revision:</strong> {props.framingRevision}</div>
        <div><strong>Status:</strong> <span aria-live="polite">{statusText}</span></div>
        <div className={styles.sandboxMuted}>node {props.nodeId} · geometry {props.geometryId ?? "none"}</div>
        <div className={styles.sandboxMuted}>Video {SELECTED_VIDEO_HASH.slice(0, 12)}… yaw {SELECTED_VIDEO_YAW_DEGREES}° open {SELECTED_VIDEO_CLAPPER_OPEN_DEGREES}°</div>
        <div className={styles.sandboxMuted}>Cap {props.cap.toFixed(3)} · capped {props.capped ? "yes" : "no"} · BALANCED_REVIEW is not the candidate default</div>
      </div>
      <Group label="Screen" value={props.screen} ids={FRAMING_SCREENS} names={SCREEN_LABELS} qa="m54-screen" onChange={props.onScreen} />
      <Group label="About scale" value={props.aboutZoom} ids={ABOUT_ZOOM_PERCENTS} qa="m54-about-zoom" onChange={props.onAboutZoom} />
      <Group label="Merch scale" value={props.merchZoom} ids={MERCH_ZOOM_PERCENTS} qa="m54-merch-zoom" onChange={props.onMerchZoom} />
      <Group label="Video scale" value={props.videoZoom} ids={VIDEO_ZOOM_PERCENTS} qa="m54-video-zoom" onChange={props.onVideoZoom} />
      <Group label="Viewport" value={props.viewport} ids={FRAMING_VIEWPORTS} qa="m54-viewport" onChange={props.onViewport} />
      <Group label="Diagnostics" value={props.diagnostic} ids={FRAMING_DIAGNOSTICS} names={DIAGNOSTIC_LABELS} qa="m54-diagnostic" onChange={props.onDiagnostic} />
      <Group label="Theme" value={props.theme} ids={FRAMING_THEMES} qa="m54-theme" onChange={props.onTheme} />
      <div className={styles.sandboxSection}>
        <h2>Mode</h2>
        <div className={styles.sandboxGroup} role="group" aria-label="Mode">
          {(["settled", "transition"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={styles.sandboxBtn}
              data-qa={`m54-mode-${id}`}
              data-active={props.playMode === id ? "true" : "false"}
              aria-pressed={props.playMode === id}
              onClick={() => props.onMode(id)}
            >
              {id}
            </button>
          ))}
        </div>
      </div>
      {props.onNamespace ? (
        <Group
          label="Aggregate"
          value={props.namespace ?? "candidate"}
          ids={["candidate", "frozen"] as const}
          names={{ candidate: "M5.5 candidate", frozen: "frozen baseline" }}
          qa="m55-namespace"
          onChange={props.onNamespace}
        />
      ) : null}
    </aside>
  );
}
