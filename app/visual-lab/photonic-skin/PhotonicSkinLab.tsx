"use client";

import { useEffect, useMemo, useState } from "react";
import { competenceMeta } from "../../_brand/color-system";
import { VisualActor } from "../../_visual-actor/VisualActor";
import type { MotionMode, VisualTheme } from "../../_visual-actor/types";
import {
  PHOTONIC_ACTIVE_ZONE_RATIO,
  getTransitionPolicy,
  resolvePhotonicPresentation,
} from "../../_visual-actor/visual-actor-state";
import { DoubleEntry } from "./DoubleEntry";
import {
  LAB_STATE_OPTIONS,
  type InitialLabSettings,
  type LabStateId,
  type PreviewMode,
} from "./lab-config";
import styles from "./photonic-skin.module.css";

const MOTION_OPTIONS: readonly { value: MotionMode; label: string }[] = [
  { value: "full", label: "Full" },
  { value: "reduced", label: "Reduced" },
  { value: "static", label: "Static" },
];

const THEME_OPTIONS: readonly { value: VisualTheme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const PREVIEW_OPTIONS: readonly { value: PreviewMode; label: string }[] = [
  { value: "desktop", label: "Desktop" },
  { value: "mobile", label: "Mobile 390" },
];

function ControlButtons<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className={styles.controlGroup}>
      <legend>{legend}</legend>
      <div className={styles.controlButtons}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            data-selected={value === option.value ? "true" : "false"}
            onClick={() => onChange(option.value)}
          >
            <span aria-hidden="true">{value === option.value ? "●" : "○"}</span>
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function useSystemReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function PhotonicSkinLab({
  initialSettings,
}: {
  initialSettings: InitialLabSettings;
}) {
  const [stateId, setStateId] = useState<LabStateId>(initialSettings.stateId);
  const [theme, setTheme] = useState<VisualTheme>(initialSettings.theme);
  const [motionMode, setMotionMode] = useState<MotionMode>(
    initialSettings.motionMode,
  );
  const [previewMode, setPreviewMode] = useState<PreviewMode>(
    initialSettings.previewMode,
  );
  const systemReducedMotion = useSystemReducedMotion();
  const activeOption =
    LAB_STATE_OPTIONS.find((option) => option.id === stateId) ??
    LAB_STATE_OPTIONS[0];
  const presentation = useMemo(
    () => resolvePhotonicPresentation(activeOption.state),
    [activeOption],
  );
  const policy = getTransitionPolicy(motionMode, systemReducedMotion);
  const competenceLabels = presentation.competences.map(
    (competence) => competenceMeta[competence].label,
  );

  useEffect(() => {
    const query = new URLSearchParams({
      state: stateId,
      theme,
      motion: motionMode,
      preview: previewMode,
    });
    window.history.replaceState(null, "", `?${query.toString()}`);
  }, [motionMode, previewMode, stateId, theme]);

  return (
    <main
      className={styles.lab}
      data-theme={theme}
      data-preview={previewMode}
      data-motion={policy.effectiveMode}
    >
      <header className={styles.labHeader}>
        <a href="#photonic-main" className={styles.wordmark}>
          MIMICRY <span>GROUP</span>
        </a>
        <div className={styles.headerMeta}>
          <span>PS-01</span>
          <span>PHOTONIC SKIN LAB</span>
          <span>INTERNAL / NOINDEX</span>
        </div>
      </header>

      <div className={styles.previewShell}>
        <section className={styles.hero} id="photonic-main" aria-labelledby="photonic-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Агентство корпоративных коммуникаций</p>
            <h1 id="photonic-title">
              Спецпроекты для сотрудников, которые переводят важную тему в общее действие.
            </h1>
            <p className={styles.lead}>
              Соединяем смысл, участие и запуск в одной управляемой системе —
              от задачи до работающего формата.
            </p>

            <section className={styles.stateReadout} aria-live="polite" aria-atomic="true">
              <div>
                <span>Состояние</span>
                <strong>{activeOption.label}</strong>
              </div>
              <div>
                <span>Компетенции</span>
                <strong>{competenceLabels.join(" · ")}</strong>
              </div>
              <div>
                <span>Motion</span>
                <strong>
                  {policy.effectiveMode}
                  {systemReducedMotion && motionMode === "full" ? " / system override" : ""}
                </strong>
              </div>
            </section>
          </div>

          <div className={styles.visualStage}>
            <div className={styles.visualStageTopline}>
              <span>01 / VISUAL ACTOR</span>
              <span>FORM ← MEANING / COLOR ← COMPETENCES</span>
            </div>
            <VisualActor
              state={activeOption.state}
              theme={theme}
              motionMode={motionMode}
              className={styles.actor}
            />
            <div className={styles.prototypeBadge}>
              <strong>PROTOTYPE GEOMETRY — NOT FINAL ART</strong>
              <span>Single continuous shell / {presentation.morph}</span>
            </div>
            <div className={styles.coverageMeter}>
              <span>Neutral surface</span>
              <div aria-hidden="true"><i /></div>
              <b>{Math.round((1 - PHOTONIC_ACTIVE_ZONE_RATIO) * 100)}%</b>
            </div>
          </div>

          <div className={styles.doubleEntryWrap}>
            <DoubleEntry />
          </div>

          <aside className={styles.controls} aria-label="Управление Photonic Skin Lab">
            <div className={styles.controlsIntro}>
              <span>LAB CONTROLS</span>
              <p>
                Детерминированный кадр: выберите Static. Настройки отражаются в URL.
              </p>
            </div>
            <ControlButtons
              legend="State"
              options={LAB_STATE_OPTIONS.map(({ id, label }) => ({ value: id, label }))}
              value={stateId}
              onChange={setStateId}
            />
            <ControlButtons
              legend="Theme"
              options={THEME_OPTIONS}
              value={theme}
              onChange={setTheme}
            />
            <ControlButtons
              legend="Motion"
              options={MOTION_OPTIONS}
              value={motionMode}
              onChange={setMotionMode}
            />
            <ControlButtons
              legend="Preview"
              options={PREVIEW_OPTIONS}
              value={previewMode}
              onChange={setPreviewMode}
            />
          </aside>
        </section>
      </div>

      <footer className={styles.labFooter}>
        <span>PS-01 / ENGINEERING CHECKPOINT</span>
        <span>NO EMISSIVE · NO BLOOM · NO CURSOR TRACKING</span>
      </footer>
    </main>
  );
}

