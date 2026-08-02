import {
  Copy,
  Heading,
  Label,
  Section,
  TextLink,
} from "../_design-system/components";
import { CompetenceMotif } from "../_brand/CompetenceMotif";
import { ProjectRail } from "../_brand/ProjectRail";
import type { CompetenceId } from "../_brand/color-system";
import { assemblySteps, capabilities } from "./home-data";
import { HomeSectionIntro } from "./HomeSectionIntro";
import styles from "./home.module.css";

export function CapabilitiesSection() {
  return (
    <Section
      aria-labelledby="capabilities-title"
      className={styles.capabilitiesSection}
      id="capabilities"
      surface="surface"
    >
      <HomeSectionIntro
        eyebrow="Модули и точки входа"
        id="capabilities-title"
        text="Каждый модуль можно заказать отдельно, встроить в решение или развить в следующий проект. В первом слое сайта они не конкурируют с четырьмя ситуациями."
        title="Можно начать с одного носителя — и не потерять общую логику"
      />

      <ol className={styles.assemblyRoute} aria-label="Как собирается проект">
        {assemblySteps.map((step, index) => (
          <li key={step}>
            <span className={styles.assemblyNode} aria-hidden="true" />
            <Label>0{index + 1}</Label>
            <strong>{step}</strong>
          </li>
        ))}
      </ol>

      <ul className={styles.capabilityGrid}>
        {capabilities.map((capability) => (
          <li data-competence={capability.id} key={capability.code}>
            <a className={styles.capabilityItem} href={capability.href}>
              <span className={styles.capabilityIdentity}>
                <CompetenceMotif
                  competence={capability.id as CompetenceId}
                  label={`Мотив компетенции «${capability.title}»`}
                />
                <Label>MODULE / {capability.code}</Label>
              </span>
              <ProjectRail
                competencies={[capability.id as CompetenceId]}
                showLegend={false}
              />
              <Heading as="h3" level={3}>
                {capability.title}
              </Heading>
              <span className={styles.capabilityLinkText}>
                Смотреть компетенцию <span aria-hidden="true">→</span>
              </span>
            </a>
          </li>
        ))}
      </ul>

      <aside className={styles.productBridge}>
        <div>
          <Label variant="process">Cross-sell / реальный маршрут</Label>
          <Heading as="h3" level={3}>
            Пример перехода: welcome-pack → onboarding → HR-brand-активация
          </Heading>
          <Copy>
            Продуктовый лендинг сохраняет узкое предложение, но объясняет,
            когда физический набор становится частью более широкой коммуникации.
          </Copy>
        </div>
        <TextLink directional href="/products/welcome-pack">
          Открыть product landing
        </TextLink>
      </aside>
    </Section>
  );
}
