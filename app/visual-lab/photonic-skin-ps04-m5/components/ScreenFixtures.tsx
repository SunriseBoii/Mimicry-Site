"use client";

import type { ReactNode } from "react";
import type { CompetenceId } from "../../../_brand/color-system";
import { competenceOrder } from "../../../_brand/color-system";
import { COMPETENCE_LABELS, TASK_OPTIONS, type TaskId } from "../build-flow";
import { chapterNodes, type ScreenNodeId } from "../topology";
import styles from "../ps04m5.module.css";

const CASES = [
  { title: "Онбординг сети", note: "Как новым людям объяснить, как здесь устроены правила." },
  { title: "Смена платформы", note: "Зачем меняется инструмент и что это даёт командам." },
  { title: "Собрать лидеров", note: "Один маршрут для людей, которые должны тянуть изменения." },
];

function Copy({
  id,
  kicker,
  heading,
  children,
  place,
}: {
  id: string;
  kicker: string;
  heading: string;
  children: ReactNode;
  place: "left" | "right" | "none";
}) {
  return (
    <article>
      <div className={styles.copy} data-place={place}>
        <p className={styles.kicker}>{kicker}</p>
        <h2 id={id}>{heading}</h2>
        {children}
      </div>
    </article>
  );
}

function CaseCarousel({ prefix }: { prefix: string }) {
  return (
    <div className={styles.carousel} data-qa={`${prefix}-carousel`} aria-label="Примеры кейсов">
      {CASES.map((item) => (
        <article key={item.title} className={styles.card}>
          <strong>{item.title}</strong>
          <p className={styles.lede}>{item.note}</p>
        </article>
      ))}
    </div>
  );
}

export function HeroScreen({ onBuild, onCompetence }: { onBuild: () => void; onCompetence: () => void }) {
  return (
    <section id="screen-01" className={styles.screen} data-place="right" data-node="01" aria-labelledby="heading-01">
      <Copy id="heading-01" kicker="Mimicry group" heading="Спецпроекты, которые помогают компаниям говорить с людьми" place="right">
        <p className={styles.lede}>Прототип композиции: один actor на весь маршрут, два равноправных входа.</p>
        <div className={styles.actions}>
          <button type="button" onClick={onBuild}>Собрать проект</button>
          <button type="button" onClick={onCompetence}>Подключить компетенцию</button>
        </div>
      </Copy>
    </section>
  );
}

export function AboutScreen() {
  return (
    <section id="screen-02" className={styles.screen} data-place="right" data-node="02" aria-labelledby="heading-02">
      <Copy id="heading-02" kicker="О нас" heading="Мы собираем коммуникацию как систему" place="right">
        <p className={styles.lede}>Это рыба: смысл сохранён, тексты не являются финальным бренд-копирайтом.</p>
      </Copy>
    </section>
  );
}

export function BuildChapter({
  unlocked,
  taskId,
  competencies,
  briefText,
  error,
  onTask,
  onToggle,
  onConfirm,
  onBrief,
  onSend,
}: {
  unlocked: { competencies: boolean; brief: boolean };
  taskId: TaskId | null;
  competencies: CompetenceId[];
  briefText: string;
  error: string | null;
  onTask: (id: TaskId) => void;
  onToggle: (id: CompetenceId) => void;
  onConfirm: () => void;
  onBrief: (value: string) => void;
  onSend: () => void;
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
      aria-label="Собрать проект"
      style={{ ["--m4-ch-03-count" as string]: String(nodes.length) }}
    >
      <div className={styles.track}>
        <div className={styles.panels}>
          {nodes.map((node) => (
            <div key={node.id} id={`screen-${node.id}`} className={styles.panel} data-place="right" data-node={node.id}>
              {node.id === "03.1" ? (
                <Copy id="heading-03.1" kicker={node.kicker} heading={node.heading} place="right">
                  <p className={styles.lede}>Задачи не получают цветов компетенций.</p>
                  <div className={styles.choices}>
                    {TASK_OPTIONS.map((task) => (
                      <button key={task.id} type="button" data-qa={`task-${task.id}`} data-selected={taskId === task.id} onClick={() => onTask(task.id)}>
                        {task.label}
                      </button>
                    ))}
                  </div>
                </Copy>
              ) : null}
              {node.id === "03.2" ? (
                <Copy id="heading-03.2" kicker={node.kicker} heading={node.heading} place="right">
                  <p className={styles.lede}>Можно выбрать несколько. Пустой набор подтвердить нельзя.</p>
                  <div className={styles.choices}>
                    {competenceOrder.map((id) => (
                      <button key={id} type="button" data-qa={`competence-${id}`} data-selected={competencies.includes(id)} onClick={() => onToggle(id)}>
                        {COMPETENCE_LABELS[id]}
                      </button>
                    ))}
                  </div>
                  <button type="button" className={styles.confirm} data-qa="confirm-competencies" onClick={onConfirm}>Подтвердить набор</button>
                  {error ? <p className={styles.error} role="alert">{error}</p> : null}
                </Copy>
              ) : null}
              {node.id === "03.3" ? (
                <Copy id="heading-03.3" kicker={node.kicker} heading={node.heading} place="right">
                  <p className={styles.lede}>Черновик собирается локально. Это не AI и не финальный текст.</p>
                  <label>
                    <span className={styles.kicker}>Редактируемый бриф</span>
                    <textarea className={styles.brief} value={briefText} onChange={(event) => onBrief(event.target.value)} />
                  </label>
                  <button type="button" className={styles.send} data-qa="send-brief" onClick={onSend}>Отправить</button>
                </Copy>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CasesScreen() {
  return (
    <section id="screen-04" className={styles.screen} data-place="right" data-node="04" aria-labelledby="heading-04">
      <Copy id="heading-04" kicker="Кейсы" heading="Спецпроекты, которые уже работали" place="right">
        <p className={styles.lede}>Внутренняя карусель не создаёт новый узел графа.</p>
        <CaseCarousel prefix="cases" />
      </Copy>
    </section>
  );
}

export function CompetenceChapter() {
  const nodes = chapterNodes("05");
  return (
    <section className={styles.chapter} data-chapter="05" aria-label="Компетенции" style={{ ["--m4-ch-05-count" as string]: "7" }}>
      <div className={styles.track}>
        <div className={styles.panels}>
          {nodes.map((node) => (
            <div key={node.id} id={`screen-${node.id}`} className={styles.panel} data-place="left" data-node={node.id}>
              <Copy id={`heading-${node.id}`} kicker={node.kicker} heading={node.heading} place="left">
                <p className={styles.lede}>Actor слева, материал справа. Карточки кейсов остаются вложенным контентом.</p>
                <CaseCarousel prefix={node.id} />
              </Copy>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function StudioChapter() {
  const copy: Record<ScreenNodeId, string> = {
    "01": "", "02": "", "03.1": "", "03.2": "", "03.3": "", "04": "",
    "05.1": "", "05.2": "", "05.3": "", "05.4": "", "05.5": "", "05.6": "", "05.7": "",
    "06.1": "Люди, которые собирают спецпроект от смысла до запуска.",
    "06.2": "Партнёры, с которыми мы собираем производство и запуск.",
    "06.3": "Компании, которые доверяют нам сложные внутренние запуски.",
    "07": "", "08": "",
  };
  return (
    <section className={styles.chapter} data-chapter="06" aria-label="Студия" style={{ ["--m4-ch-06-count" as string]: "3" }}>
      <div className={styles.track}>
        <div className={styles.panels}>
          {chapterNodes("06").map((node) => (
            <div key={node.id} id={`screen-${node.id}`} className={styles.panel} data-place="right" data-node={node.id}>
              <Copy id={`heading-${node.id}`} kicker={node.kicker} heading={node.heading} place="right">
                <p className={styles.lede}>{copy[node.id]}</p>
              </Copy>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContactScreen() {
  return (
    <section id="screen-07" className={styles.screen} data-place="right" data-node="07" aria-labelledby="heading-07">
      <Copy id="heading-07" kicker="Контакт" heading="Связаться с нами" place="right">
        <p className={styles.lede}>Отдельная заявка на этом экране не отправляется. Форма брифа живёт на 03.3.</p>
      </Copy>
    </section>
  );
}

export function FooterScreen() {
  return (
    <footer id="screen-08" className={styles.screen} data-place="none" data-node="08" aria-labelledby="heading-08">
      <Copy id="heading-08" kicker="Футер" heading="Mimicry group" place="none">
        <div className={styles.footerGrid}>
          <p className={styles.lede}>© Mimicry group</p>
        </div>
      </Copy>
    </footer>
  );
}
