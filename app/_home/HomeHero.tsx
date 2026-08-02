import {
  Action,
  Copy,
  Display,
  Eyebrow,
  Grid,
  Label,
  Section,
} from "../_design-system/components";
import { ProjectRail } from "../_brand/ProjectRail";
import { homeHero, processSteps } from "./home-data";
import { SituationRoutes } from "./SituationRoutes";
import styles from "./home.module.css";

export function HomeHero() {
  return (
    <Section aria-labelledby="home-title" className={styles.hero}>
      <Grid className={styles.heroGrid}>
        <div className={styles.heroCopy}>
          <Eyebrow>{homeHero.eyebrow}</Eyebrow>
          <Display as="h1" className={styles.heroTitle} id="home-title">
            {homeHero.title}
          </Display>
          <Copy className={styles.heroLead} variant="lead">
            {homeHero.text}
          </Copy>
          <div className={styles.heroActions}>
            <Action href="/contact" variant="primary">
              {homeHero.primary}
            </Action>
            <Action
              arrow
              href="/cases/change-project"
              variant="secondary"
            >
              {homeHero.secondary}
            </Action>
          </div>
        </div>

        <aside className={styles.heroRoute} aria-label="Маршрут проекта">
          <Label variant="process">Спецпроекты для сотрудников</Label>
          <ol>
            {processSteps.map((step, index) => (
              <li key={step.label}>
                <span className={styles.heroRouteNode} aria-hidden="true" />
                <span>0{index + 1}</span>
                <strong>{step.label}</strong>
              </li>
            ))}
          </ol>
          <Copy variant="small">
            Формат выбирается после задачи и аудитории.
          </Copy>
          <div className={styles.heroProjectTrajectory}>
            <ProjectRail
              competencies={["content", "design", "event", "digital", "merch"]}
              label="управляемый пример комплексного состава"
              lead="content"
              showLegend={false}
            />
          </div>
        </aside>
      </Grid>

      <nav className={styles.entryModes} aria-label="Два входа в работу с Mimicry">
        <a href="#solutions">
          <Label>Вход / 01</Label>
          <strong>Собрать проект целиком</strong>
          <span>От задачи и контекста — к составу и запуску</span>
        </a>
        <a href="#capabilities">
          <Label>Вход / 02</Label>
          <strong>Подключить отдельную компетенцию</strong>
          <span>Семь подписанных модулей — без восьмого цвета</span>
        </a>
      </nav>

      <SituationRoutes />
    </Section>
  );
}
