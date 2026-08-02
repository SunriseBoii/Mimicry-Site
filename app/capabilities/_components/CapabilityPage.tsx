import Link from "../../link";
import { CompetenceMotif } from "../../_brand/CompetenceMotif";
import { ProjectRail } from "../../_brand/ProjectRail";
import { SiteShell } from "../../_site/SiteShell";
import { Breadcrumbs, PageCta, SectionHeading } from "../../components";
import type { CapabilityPageData } from "../capability-data";
import styles from "./capability.module.css";

export function CapabilityPage({ data }: { data: CapabilityPageData }) {
  return (
    <SiteShell>
      <Breadcrumbs items={[{ label: "Компетенции" }, { label: data.label }]} />
      <div
        className={styles.scope}
        data-color-scope="competence"
        data-competence={data.id}
        data-intensity="standard"
      >
        <section className={`page-hero ${styles.hero}`}>
          <div className="container page-hero-grid">
            <div>
              <span className="eyebrow">Компетенция · самостоятельный вход и модуль</span>
              <h1>
                <span className={styles.accentTitle}>{data.accentLead}</span>{" "}
                {data.title}
              </h1>
              <p>{data.intro}</p>
              <div className="hero-actions">
                <Link className="button button-accent" href="/contact">
                  Показать задачу →
                </Link>
                <Link className="text-link" href="#outputs">
                  Посмотреть состав
                </Link>
              </div>
            </div>
            <aside className={styles.fact}>
              <CompetenceMotif
                competence={data.id}
                label={`Геометрический мотив компетенции «${data.label}»`}
              />
              <span className="micro-label">Цветной факт</span>
              <strong>{data.fact}</strong>
              <p>{data.factLabel}</p>
              <ProjectRail competencies={[data.id]} showLegend={false} />
            </aside>
          </div>
        </section>

        <section className="section" id="outputs">
          <div className="container">
            <SectionHeading
              eyebrow="Что делаем"
              title="Один локальный цветовой scope — несколько нейтральных outputs"
            />
            <div className="four-column">
              {data.outputs.map((item, index) => (
                <article className={`info-card ${styles.outputCard}`} key={item}>
                  <span className="micro-label">0{index + 1}</span>
                  <h3>{item}</h3>
                  <p>Конкретный состав и границы фиксируются после задачи и аудитории.</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container two-column">
            <div className={styles.tintSurface}>
              <SectionHeading eyebrow="Отдельно" title="Узкий заказ" />
              <p>
                Фиксируем конкретные deliverables, роли, сроки и точки согласования
                как самостоятельный scope.
              </p>
            </div>
            <div className={styles.neutralSurface}>
              <SectionHeading eyebrow="В системе" title="Часть спецпроекта" />
              <p>
                Компетенция получает lead или support-роль и показывается в
                составе проекта вместе с подписью и мотивом.
              </p>
              <Link className="text-link" href="/_brand/color-lab#projects">
                Проверить комплексный состав
              </Link>
            </div>
          </div>
        </section>
      </div>
      <PageCta />
    </SiteShell>
  );
}
