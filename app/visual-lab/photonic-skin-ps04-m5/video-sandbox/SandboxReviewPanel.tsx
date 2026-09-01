"use client";

import type { KeyboardEvent } from "react";
import {
  CAMERA_VIDEO_VARIANTS,
  COMBO_BEFORE_VIDEO_VARIANTS,
  COMBO_VIDEO_VARIANTS,
  HISTORICAL_VIDEO_VARIANTS,
  ISOLATE_LABELS,
  SANDBOX_ISOLATES,
  SANDBOX_THEMES,
  SANDBOX_VIEWS,
  VARIANT_META,
  VIEW_LABELS,
  clapperOpenLabel,
  compositionYawLabel,
  hingeStatusLabel,
  type SandboxIsolateId,
  type SandboxPlayMode,
  type SandboxThemeId,
  type SandboxViewId,
  type VideoVariantId,
} from "./sandbox-query";
import { loadingLabel, type SandboxLoadStatus } from "./sandbox-load-gate";
import styles from "./video-sandbox.module.css";

const COMPONENT_LEGEND = [
  { name: "корпус камеры", swatch: "#6e7c80" },
  { name: "объектив", swatch: "#7eb8da" },
  { name: "верх / viewfinder", swatch: "#f0c14b" },
  { name: "задний блок", swatch: "#c4b5a5" },
  { name: "доска хлопушки", swatch: "#e07a5f" },
  { name: "фиксированная планка", swatch: "#9bbf8a" },
  { name: "поднятый брусок", swatch: "#d4a5c9" },
] as const;

export function SandboxReviewPanel(props: {
  mode: "lab" | "preview";
  requestedVariant: VideoVariantId;
  displayedVariant: VideoVariantId | null;
  loadStatus: SandboxLoadStatus;
  bufferHash: string | null;
  view: SandboxViewId;
  theme: SandboxThemeId;
  labels: boolean;
  playMode: SandboxPlayMode;
  isolate: SandboxIsolateId;
  n: number;
  activeCount: number;
  cameraActive: number;
  clapperActive: number;
  hingedBarActive: number;
  lodPrefix: string;
  onVariant: (id: VideoVariantId) => void;
  onView: (id: SandboxViewId) => void;
  onTheme: (id: SandboxThemeId) => void;
  onLabels: (value: boolean) => void;
  onMode: (value: SandboxPlayMode) => void;
  onIsolate: (value: SandboxIsolateId) => void;
  onOpenLab?: () => void;
}) {
  const displayed = props.displayedVariant;
  const displayedMeta = displayed ? VARIANT_META[displayed] : null;
  const requestedMeta = VARIANT_META[props.requestedVariant];
  const statusText = props.loadStatus === "loading"
    ? loadingLabel(requestedMeta.loadingName)
    : props.loadStatus === "error"
      ? "Ошибка загрузки"
      : "ready";
  const yawSource = displayed ?? props.requestedVariant;
  const yaw = compositionYawLabel(yawSource);
  const openAngle = clapperOpenLabel(yawSource);
  const hinge = hingeStatusLabel(yawSource);

  if (props.mode === "preview") {
    return (
      <aside className={styles.sandboxPreviewBadge} data-qa="m53-preview-badge">
        <div className={styles.sandboxPreviewName}>{displayedMeta?.hudName ?? requestedMeta.hudName}</div>
        <div className={styles.sandboxMuted}>{statusText}</div>
        {props.onOpenLab ? (
          <button type="button" className={styles.sandboxBtn} onClick={props.onOpenLab}>Полная review-панель</button>
        ) : null}
      </aside>
    );
  }

  const onVariantKey = (event: KeyboardEvent<HTMLDivElement>, ids: readonly VideoVariantId[]) => {
    const index = ids.indexOf(props.requestedVariant);
    if (index < 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      props.onVariant(ids[(index + 1) % ids.length]);
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      props.onVariant(ids[(index - 1 + ids.length) % ids.length]);
    }
  };

  return (
    <aside className={styles.sandboxPanel} data-qa="m53-review-panel">
      <div className={styles.sandboxHud} data-qa="m53-hud">
        <div className={styles.sandboxKicker}>PS‑04.M5.3.R1 VIDEO SANDBOX</div>
        <div><strong>Displayed:</strong> {displayedMeta?.hudName ?? "—"}</div>
        <div><strong>Status:</strong> <span aria-live="polite">{statusText}</span></div>
        <div><strong>Decision:</strong> {displayedMeta?.decision ?? requestedMeta.decision}</div>
        <div><strong>View:</strong> {props.view}</div>
        <div><strong>Theme:</strong> {props.theme}</div>
        <div><strong>Material:</strong> {props.labels ? "component diagnostic" : "final"}</div>
        <div><strong>Mode:</strong> {props.playMode}</div>
        <div><strong>Composition yaw:</strong> {yaw}</div>
        <div><strong>Clapper open angle:</strong> {openAngle}</div>
        <div><strong>Hinge:</strong> {hinge}</div>
        <div className={styles.sandboxMuted}>Requested: {requestedMeta.hudName}</div>
        <div className={styles.sandboxMuted}>Hash: {props.bufferHash ?? "—"}</div>
        <div className={styles.sandboxMuted}>N {props.n} · active {props.activeCount} · camera {props.cameraActive} · clapper {props.clapperActive} · bar {props.hingedBarActive} · LOD {props.lodPrefix}</div>
        <div className={styles.sandboxMuted}>Isolate: {ISOLATE_LABELS[props.isolate]} · not a separate actor</div>
      </div>

      <section className={styles.sandboxSection}>
        <h2>R1 — соединённый шарнир</h2>
        <div className={styles.sandboxGroup} role="group" aria-label="R1 — соединённый шарнир" onKeyDown={(event) => onVariantKey(event, COMBO_VIDEO_VARIANTS)}>
          {COMBO_VIDEO_VARIANTS.map((id) => (
            <VariantButton key={id} id={id} requested={props.requestedVariant} displayed={displayed} onSelect={props.onVariant} />
          ))}
        </div>
      </section>

      <section className={styles.sandboxSection}>
        <h2>M5.3 — брусок отделён</h2>
        <div className={styles.sandboxGroup} role="group" aria-label="M5.3 — брусок отделён" onKeyDown={(event) => onVariantKey(event, COMBO_BEFORE_VIDEO_VARIANTS)}>
          {COMBO_BEFORE_VIDEO_VARIANTS.map((id) => (
            <VariantButton key={id} id={id} requested={props.requestedVariant} displayed={displayed} onSelect={props.onVariant} />
          ))}
        </div>
      </section>

      <section className={styles.sandboxSection}>
        <h2>Только камера</h2>
        <div className={styles.sandboxGroup} role="group" aria-label="Только камера" onKeyDown={(event) => onVariantKey(event, CAMERA_VIDEO_VARIANTS)}>
          {CAMERA_VIDEO_VARIANTS.map((id) => (
            <VariantButton key={id} id={id} requested={props.requestedVariant} displayed={displayed} onSelect={props.onVariant} />
          ))}
        </div>
      </section>

      <section className={styles.sandboxSection}>
        <h2>Исторический референс</h2>
        <div className={styles.sandboxGroup} role="group" aria-label="Исходный Video" onKeyDown={(event) => onVariantKey(event, HISTORICAL_VIDEO_VARIANTS)}>
          {HISTORICAL_VIDEO_VARIANTS.map((id) => (
            <VariantButton key={id} id={id} requested={props.requestedVariant} displayed={displayed} onSelect={props.onVariant} />
          ))}
        </div>
      </section>

      <section className={styles.sandboxSection}>
        <h2>Ракурс</h2>
        <div className={styles.sandboxGroup} role="radiogroup" aria-label="Ракурс">
          {SANDBOX_VIEWS.map((id) => (
            <button
              key={id}
              type="button"
              className={styles.sandboxBtn}
              role="radio"
              aria-checked={props.view === id}
              data-active={props.view === id}
              data-qa={`m53-view-${id}`}
              onClick={() => props.onView(id)}
            >
              {VIEW_LABELS[id]}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.sandboxSection}>
        <h2>Изоляция (диагностика)</h2>
        <div className={styles.sandboxGroup} role="radiogroup" aria-label="Изоляция компонента">
          {SANDBOX_ISOLATES.map((id) => (
            <button
              key={id}
              type="button"
              className={styles.sandboxBtn}
              role="radio"
              aria-checked={props.isolate === id}
              data-active={props.isolate === id}
              data-qa={`m53-isolate-${id}`}
              onClick={() => props.onIsolate(id)}
            >
              {ISOLATE_LABELS[id]}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.sandboxSection}>
        <h2>Вид</h2>
        <div className={styles.sandboxGroup} role="radiogroup" aria-label="Вид материала">
          <button type="button" className={styles.sandboxBtn} role="radio" aria-checked={!props.labels} data-active={!props.labels} data-qa="m53-material-final" onClick={() => props.onLabels(false)}>Итоговый материал</button>
          <button type="button" className={styles.sandboxBtn} role="radio" aria-checked={props.labels} data-active={props.labels} data-qa="m53-material-debug" onClick={() => props.onLabels(true)}>Диагностические цвета компонентов</button>
        </div>
        {props.labels ? (
          <ul className={styles.sandboxLegend} data-qa="m53-component-legend">
            {COMPONENT_LEGEND.map((item) => (
              <li key={item.name}><span style={{ background: item.swatch }} />{item.name}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className={styles.sandboxSection}>
        <h2>Режим</h2>
        <div className={styles.sandboxGroup} role="radiogroup" aria-label="Режим">
          <button type="button" className={styles.sandboxBtn} role="radio" aria-checked={props.playMode === "settled"} data-active={props.playMode === "settled"} data-qa="m53-mode-settled" onClick={() => props.onMode("settled")}>Статичное состояние</button>
          <button type="button" className={styles.sandboxBtn} role="radio" aria-checked={props.playMode === "transition"} data-active={props.playMode === "transition"} data-qa="m53-mode-transition" onClick={() => props.onMode("transition")}>Переход Video → Digital</button>
        </div>
      </section>

      <section className={styles.sandboxSection}>
        <h2>Тема</h2>
        <div className={styles.sandboxGroup} role="radiogroup" aria-label="Тема">
          {SANDBOX_THEMES.map((id) => (
            <button key={id} type="button" className={styles.sandboxBtn} role="radio" aria-checked={props.theme === id} data-active={props.theme === id} data-qa={`m53-theme-${id}`} onClick={() => props.onTheme(id)}>
              {id === "light" ? "Светлая" : "Тёмная"}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

function VariantButton(props: {
  id: VideoVariantId;
  requested: VideoVariantId;
  displayed: VideoVariantId | null;
  onSelect: (id: VideoVariantId) => void;
}) {
  const meta = VARIANT_META[props.id];
  const pressed = props.requested === props.id;
  const shown = props.displayed === props.id;
  return (
    <button
      type="button"
      className={styles.sandboxBtn}
      aria-pressed={pressed}
      data-active={pressed}
      data-displayed={shown}
      data-qa={`m53-variant-${props.id}`}
      onClick={() => props.onSelect(props.id)}
    >
      <span>{meta.title}</span>
      {shown ? <em>Сейчас показан</em> : null}
    </button>
  );
}
