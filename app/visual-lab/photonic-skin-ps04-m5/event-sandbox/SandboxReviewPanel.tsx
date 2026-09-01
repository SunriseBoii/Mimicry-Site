"use client";

import type { KeyboardEvent } from "react";
import {
  PRIMARY_EVENT_VARIANTS,
  REJECTED_EVENT_VARIANTS,
  SANDBOX_THEMES,
  SANDBOX_VIEWS,
  VARIANT_META,
  VIEW_LABELS,
  type EventVariantId,
  type SandboxPlayMode,
  type SandboxThemeId,
  type SandboxViewId,
} from "./sandbox-query";
import { loadingLabel, type SandboxLoadStatus } from "./sandbox-load-gate";
import styles from "./event-sandbox.module.css";

const COMPONENT_LEGEND = [
  { name: "сцена", swatch: "#6e7c80" },
  { name: "арка/платформа", swatch: "#8a9aa0" },
  { name: "центральная фигура", swatch: "#f0c14b" },
  { name: "левая фигура", swatch: "#7eb8da" },
  { name: "правая фигура", swatch: "#e07a5f" },
] as const;

export function SandboxReviewPanel(props: {
  mode: "lab" | "preview";
  requestedVariant: EventVariantId;
  displayedVariant: EventVariantId | null;
  loadStatus: SandboxLoadStatus;
  bufferHash: string | null;
  view: SandboxViewId;
  theme: SandboxThemeId;
  labels: boolean;
  playMode: SandboxPlayMode;
  n: number;
  activeCount: number;
  figureRightActive: number;
  lodPrefix: string;
  onVariant: (id: EventVariantId) => void;
  onView: (id: SandboxViewId) => void;
  onTheme: (id: SandboxThemeId) => void;
  onLabels: (value: boolean) => void;
  onMode: (value: SandboxPlayMode) => void;
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

  if (props.mode === "preview") {
    return (
      <aside className={styles.sandboxPreviewBadge} data-qa="m52-preview-badge">
        <div className={styles.sandboxPreviewName}>{displayedMeta?.hudName ?? requestedMeta.hudName}</div>
        <div className={styles.sandboxMuted}>{statusText}</div>
        {props.onOpenLab ? (
          <button type="button" className={styles.sandboxBtn} onClick={props.onOpenLab}>Полная review-панель</button>
        ) : null}
      </aside>
    );
  }

  const onVariantKey = (event: KeyboardEvent<HTMLDivElement>, ids: readonly EventVariantId[]) => {
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
    <aside className={styles.sandboxPanel} data-qa="m52-review-panel">
      <div className={styles.sandboxHud} data-qa="m52-hud">
        <div className={styles.sandboxKicker}>PS‑04.M5.2.R1 EVENT SANDBOX</div>
        <div><strong>Displayed:</strong> {displayedMeta?.hudName ?? "—"}</div>
        <div><strong>Status:</strong> <span aria-live="polite">{statusText}</span></div>
        <div><strong>Decision:</strong> {displayedMeta?.decision ?? requestedMeta.decision}</div>
        <div><strong>View:</strong> {props.view}</div>
        <div><strong>Theme:</strong> {props.theme}</div>
        <div><strong>Material:</strong> {props.labels ? "debug" : "final"}</div>
        <div><strong>Mode:</strong> {props.playMode}</div>
        <div className={styles.sandboxMuted}>Requested: {requestedMeta.hudName}</div>
        <div className={styles.sandboxMuted}>Hash: {props.bufferHash ?? "—"}</div>
        <div className={styles.sandboxMuted}>N {props.n} · active {props.activeCount} · figure-right {props.figureRightActive} · LOD {props.lodPrefix}</div>
        <div className={styles.sandboxMuted}>Source candidate: {displayed ?? "pending"} · owner: A selected, canonical pending</div>
      </div>

      <section className={styles.sandboxSection}>
        <h2>Вариант Event</h2>
        <div
          className={styles.sandboxGroup}
          role="group"
          aria-label="Основной вариант Event"
          onKeyDown={(event) => onVariantKey(event, PRIMARY_EVENT_VARIANTS)}
        >
          {PRIMARY_EVENT_VARIANTS.map((id) => (
            <VariantButton
              key={id}
              id={id}
              requested={props.requestedVariant}
              displayed={displayed}
              onSelect={props.onVariant}
            />
          ))}
        </div>
        <details className={styles.sandboxRejected} data-qa="m52-rejected-variants">
          <summary>Отклонённые варианты (frozen evidence)</summary>
          <div
            className={styles.sandboxGroup}
            role="group"
            aria-label="Отклонённые варианты Event"
            onKeyDown={(event) => onVariantKey(event, REJECTED_EVENT_VARIANTS)}
          >
            {REJECTED_EVENT_VARIANTS.map((id) => (
              <VariantButton
                key={id}
                id={id}
                requested={props.requestedVariant}
                displayed={displayed}
                onSelect={props.onVariant}
              />
            ))}
          </div>
        </details>
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
              data-qa={`m52-view-${id}`}
              onClick={() => props.onView(id)}
            >
              {VIEW_LABELS[id]}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.sandboxSection}>
        <h2>Вид</h2>
        <div className={styles.sandboxGroup} role="radiogroup" aria-label="Вид материала">
          <button type="button" className={styles.sandboxBtn} role="radio" aria-checked={!props.labels} data-active={!props.labels} data-qa="m52-material-final" onClick={() => props.onLabels(false)}>Итоговый материал</button>
          <button type="button" className={styles.sandboxBtn} role="radio" aria-checked={props.labels} data-active={props.labels} data-qa="m52-material-debug" onClick={() => props.onLabels(true)}>Диагностические цвета компонентов</button>
        </div>
        {props.labels ? (
          <ul className={styles.sandboxLegend} data-qa="m52-component-legend">
            {COMPONENT_LEGEND.map((item) => (
              <li key={item.name}><span style={{ background: item.swatch }} />{item.name}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className={styles.sandboxSection}>
        <h2>Режим</h2>
        <div className={styles.sandboxGroup} role="radiogroup" aria-label="Режим">
          <button type="button" className={styles.sandboxBtn} role="radio" aria-checked={props.playMode === "settled"} data-active={props.playMode === "settled"} data-qa="m52-mode-settled" onClick={() => props.onMode("settled")}>Статичное состояние</button>
          <button type="button" className={styles.sandboxBtn} role="radio" aria-checked={props.playMode === "transition"} data-active={props.playMode === "transition"} data-qa="m52-mode-transition" onClick={() => props.onMode("transition")}>Переход Design → Event → Games</button>
        </div>
      </section>

      <section className={styles.sandboxSection}>
        <h2>Тема</h2>
        <div className={styles.sandboxGroup} role="radiogroup" aria-label="Тема">
          {SANDBOX_THEMES.map((id) => (
            <button key={id} type="button" className={styles.sandboxBtn} role="radio" aria-checked={props.theme === id} data-active={props.theme === id} data-qa={`m52-theme-${id}`} onClick={() => props.onTheme(id)}>
              {id === "light" ? "Светлая" : "Тёмная"}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

function VariantButton(props: {
  id: EventVariantId;
  requested: EventVariantId;
  displayed: EventVariantId | null;
  onSelect: (id: EventVariantId) => void;
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
      data-rejected={meta.rejected}
      data-qa={`m52-variant-${props.id}`}
      onClick={() => props.onSelect(props.id)}
    >
      <span>{meta.title}</span>
      {shown ? <em>Сейчас показан</em> : null}
    </button>
  );
}
