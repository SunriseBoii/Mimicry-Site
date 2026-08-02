"use client";

import { useState } from "react";
import tokens from "../../_design-system/theme/tokens.module.css";
import { CompetenceMotif } from "../CompetenceMotif";
import { ProjectRail } from "../ProjectRail";
import {
  competenceMeta,
  competenceOrder,
  type ColorIntensity,
  type CompetenceId,
} from "../color-system";
import styles from "./color-lab.module.css";

const intensityLabels: Record<ColorIntensity, string> = {
  calm: "Calm · 0–6%",
  standard: "Standard · 6–14%",
  expressive: "Expressive · 15–35%",
};

function ThemeSpecimen({
  competence,
  intensity,
  theme,
}: {
  competence: CompetenceId;
  intensity: ColorIntensity;
  theme: "light" | "dark";
}) {
  return (
    <section
      className={`${tokens.tokens} ${styles.specimen}`}
      data-competence={competence}
      data-intensity={intensity}
      data-theme={theme}
    >
      <div className={styles.specimenHeader}>
        <span>{theme === "light" ? "Light" : "Dark"}</span>
        <span>{intensityLabels[intensity]}</span>
      </div>
      <div className={styles.corePlane}>
        <span>CORE · только короткая графическая зона</span>
      </div>
      <div className={styles.specimenBody}>
        <span className={styles.eyebrow}>
          {competenceMeta[competence].label} · {competenceMeta[competence].motif}
        </span>
        <h2>
          Нейтральный заголовок и <span>короткий цветной фрагмент</span>
        </h2>
        <p>
          Body-текст остаётся нейтральным. Цвет обозначает компетенцию, но не
          заменяет название, мотив или позицию в композиции.
        </p>
        <a href="#projects">Accent link с underline</a>

        <div className={styles.sampleGrid}>
          <article className={styles.tintCard}>
            <CompetenceMotif competence={competence} label="Геометрический мотив" />
            <span>Цветной факт</span>
            <strong>07 / 07</strong>
            <p>Локальная tint-surface и competence border.</p>
          </article>
          <article className={styles.neutralCard}>
            <span>Neutral card</span>
            <strong>Доказательства остаются нейтральными</strong>
            <p>Surface и необходимая граница используют semantic roles.</p>
          </article>
        </div>

        <div className={styles.stateGrid} aria-label="Состояния компонентов">
          <button className={styles.accentButton} type="button">Default</button>
          <button className={styles.accentButton} data-state="hover" type="button">Hover</button>
          <button className={styles.accentButton} data-state="active" type="button">Active</button>
          <button className={styles.accentButton} disabled type="button">Disabled</button>
          <button className={styles.focusSample} type="button">Focus</button>
          <button aria-pressed="true" className={styles.selectedSample} type="button">
            <span aria-hidden="true">✓</span> Selected
          </button>
        </div>
      </div>
    </section>
  );
}

export function ColorLab() {
  const [competence, setCompetence] = useState<CompetenceId>("content");
  const [intensity, setIntensity] = useState<ColorIntensity>("standard");

  return (
    <div className={styles.lab} data-intensity={intensity}>
      <header className={styles.labHeader}>
        <span className={styles.kicker}>Внутренняя диагностика · noindex</span>
        <h1>Color lab v0.2</h1>
        <p>
          Проверка primitive → semantic → component на реальных компонентах,
          в двух темах и трёх бюджетах цветной площади.
        </p>
      </header>

      <section className={styles.controls} aria-labelledby="lab-controls-title">
        <h2 id="lab-controls-title">Параметры диагностического шаблона</h2>
        <div className={styles.controlGroup}>
          <span>Компетенция</span>
          <div className={styles.competenceControls}>
            {competenceOrder.map((item) => (
              <button
                aria-pressed={competence === item}
                data-competence={item}
                key={item}
                onClick={() => setCompetence(item)}
                type="button"
              >
                <CompetenceMotif competence={item} />
                <span>{competenceMeta[item].label}</span>
                {competence === item ? <b aria-hidden="true">✓</b> : null}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.controlGroup}>
          <span>Интенсивность</span>
          <div className={styles.intensityControls}>
            {(Object.keys(intensityLabels) as ColorIntensity[]).map((item) => (
              <button
                aria-pressed={intensity === item}
                key={item}
                onClick={() => setIntensity(item)}
                type="button"
              >
                {intensityLabels[item]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.themeComparison} aria-labelledby="themes-title">
        <h2 id="themes-title">Light / Dark</h2>
        <div>
          <ThemeSpecimen competence={competence} intensity={intensity} theme="light" />
          <ThemeSpecimen competence={competence} intensity={intensity} theme="dark" />
        </div>
      </section>

      <section className={styles.allCompetences} aria-labelledby="competences-title">
        <h2 id="competences-title">Семь компетенций: цвет + подпись + мотив</h2>
        <div>
          {competenceOrder.map((item) => (
            <article data-competence={item} key={item}>
              <CompetenceMotif competence={item} label={competenceMeta[item].motif} />
              <span>{competenceMeta[item].code}</span>
              <strong>{competenceMeta[item].label}</strong>
              <div className={styles.roleSwatches} aria-label="Core, text, surface, border">
                <i data-role="core" />
                <i data-role="text" />
                <i data-role="surface" />
                <i data-role="border" />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.projects} id="projects" aria-labelledby="projects-title">
        <h2 id="projects-title">Project scope: 2, 3 и 5 компетенций</h2>
        <div className={styles.projectExamples}>
          <article>
            <span>2 · lead 58 / support 42</span>
            <ProjectRail competencies={["content", "event"]} lead="content" />
          </article>
          <article>
            <span>3 · lead 50 / support 25 / 25</span>
            <ProjectRail competencies={["design", "games", "merch"]} lead="design" />
          </article>
          <article>
            <span>5 · сегменты с neutral seam</span>
            <ProjectRail
              competencies={["content", "design", "event", "video", "digital"]}
              lead="content"
            />
          </article>
          <article className={styles.compactProject}>
            <span>Формат &lt; 96 px</span>
            <div>
              <ProjectRail
                competencies={["content", "design", "event", "video", "digital"]}
                lead="content"
                showLegend={false}
              />
            </div>
          </article>
        </div>
      </section>

      <section className={styles.viewportExamples} aria-labelledby="viewports-title">
        <h2 id="viewports-title">Desktop / mobile fragments</h2>
        <div className={styles.desktopFrame}>
          <span>Desktop · fluid container</span>
          <div className={styles.frameGrid}>
            <strong>От важной темы</strong>
            <p>к общему действию</p>
            <ProjectRail competencies={["content", "event"]} lead="content" />
          </div>
        </div>
        <div className={styles.mobileFrame}>
          <span>Mobile · 390 px</span>
          <div className={styles.mobileFrameBody}>
            <strong>Смысл → участие → запуск</strong>
            <p>Нейтральный текст и компактный состав проекта.</p>
            <ProjectRail competencies={["content", "event"]} lead="content" />
          </div>
        </div>
      </section>
    </div>
  );
}
