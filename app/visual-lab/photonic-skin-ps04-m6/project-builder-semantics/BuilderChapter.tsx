"use client";

import type { CompetenceId } from "../../../_brand/color-system";
import { competenceOrder } from "../../../_brand/color-system";
import { chapterNodes } from "../../photonic-skin-ps04-m5/topology";
import styles from "../../photonic-skin-ps04-m5/ps04m5.module.css";
import {
  BUILDER_TASK_OPTIONS,
  COMPETENCE_LABELS,
  type BuilderTaskId,
} from "./builder-flow";

export function BuilderChapter({
  unlocked,
  taskId,
  competencies,
  briefText,
  briefStale,
  error,
  onTask,
  onToggle,
  onConfirm,
  onBrief,
  onSend,
  onCompetencyPreview,
}: {
  unlocked: { competencies: boolean; brief: boolean };
  taskId: BuilderTaskId | null;
  competencies: CompetenceId[];
  briefText: string;
  briefStale: boolean;
  error: string | null;
  onTask: (id: BuilderTaskId) => void;
  onToggle: (id: CompetenceId) => void;
  onConfirm: () => void;
  onBrief: (value: string) => void;
  onSend: () => void;
  onCompetencyPreview: (id: CompetenceId | null, pointerType: "mouse" | "pen" | "touch" | "keyboard" | null) => void;
}) {
  const nodes = chapterNodes("03").filter((node) => {
    if (node.id === "03.2") return unlocked.competencies;
    if (node.id === "03.3") return unlocked.brief;
    return true;
  });
  return (
    <section
      className={styles.chapter}
      data-chapter="03"
      data-builder="m61"
      aria-label="Собрать проект"
      style={{ ["--m4-ch-03-count" as string]: String(nodes.length) }}
    >
      <div className={styles.track}>
        <div className={styles.panels}>
          {nodes.map((node) => (
            <div key={node.id} id={`screen-${node.id}`} className={styles.panel} data-place="right" data-node={node.id}>
              {node.id === "03.1" ? (
                <article>
                  <div className={styles.copy} data-place="right">
                    <p className={styles.kicker}>{node.kicker}</p>
                    <h2 id="heading-03.1">{node.heading}</h2>
                    <p className={styles.lede}>Задачи не получают цветов компетенций и не меняют геометрию Mimic.</p>
                    <div className={styles.choices} role="group" aria-label="Задача проекта">
                      {BUILDER_TASK_OPTIONS.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          data-qa={`task-${task.id}`}
                          data-selected={taskId === task.id}
                          aria-pressed={taskId === task.id}
                          onClick={() => onTask(task.id)}
                        >
                          {task.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
              ) : null}
              {node.id === "03.2" ? (
                <article>
                  <div className={styles.copy} data-place="right">
                    <p className={styles.kicker}>{node.kicker}</p>
                    <h2 id="heading-03.2">{node.heading}</h2>
                    <p className={styles.lede}>Можно выбрать несколько. Пустой набор подтвердить нельзя.</p>
                    <div className={styles.choices} role="group" aria-label="Компетенции проекта">
                      {competenceOrder.map((id) => (
                        <button
                          key={id}
                          type="button"
                          data-qa={`competence-${id}`}
                          data-competency-id={id}
                          data-selected={competencies.includes(id)}
                          aria-pressed={competencies.includes(id)}
                          onClick={() => onToggle(id)}
                          onPointerEnter={(event) => {
                            const kind = event.pointerType === "touch" || event.pointerType === "pen" || event.pointerType === "mouse"
                              ? event.pointerType
                              : "mouse";
                            onCompetencyPreview(id, kind);
                          }}
                          onPointerLeave={() => onCompetencyPreview(null, null)}
                          onFocus={() => onCompetencyPreview(id, "keyboard")}
                          onBlur={() => onCompetencyPreview(null, null)}
                        >
                          {COMPETENCE_LABELS[id]}
                        </button>
                      ))}
                    </div>
                    <button type="button" className={styles.confirm} data-qa="confirm-competencies" onClick={onConfirm}>Подтвердить набор</button>
                    {error ? <p className={styles.error} role="alert">{error}</p> : null}
                  </div>
                </article>
              ) : null}
              {node.id === "03.3" ? (
                <article>
                  <div className={styles.copy} data-place="right">
                    <p className={styles.kicker}>{node.kicker}</p>
                    <h2 id="heading-03.3">{node.heading}</h2>
                    <p className={styles.lede}>Черновик собирается локально. Редактирование текста не меняет Mimic.</p>
                    <label>
                      <span className={styles.kicker}>Редактируемый бриф{briefStale ? " · устарел" : ""}</span>
                      <textarea
                        className={styles.brief}
                        data-stale={briefStale ? "true" : "false"}
                        value={briefText}
                        onChange={(event) => onBrief(event.target.value)}
                      />
                    </label>
                    <button type="button" className={styles.send} data-qa="send-brief" onClick={onSend}>Отправить</button>
                  </div>
                </article>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
