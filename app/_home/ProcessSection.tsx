import {
  RouteMarker,
  Section,
} from "../_design-system/components";
import { processSteps } from "./home-data";
import { HomeSectionIntro } from "./HomeSectionIntro";
import styles from "./home.module.css";

export function ProcessSection() {
  const steps = processSteps.map(({ description, label, state }) => ({
    description,
    label,
    state,
  }));

  return (
    <Section aria-labelledby="process-title" id="process">
      <HomeSectionIntro
        eyebrow="Одна система"
        id="process-title"
        text="Широта Mimicry объясняется не списком производств, а последовательностью: что бы мы ни создавали, формат подчинён задаче и аудитории."
        title="Смысл → участие → запуск"
      />
      <div className={styles.processMarker}>
        <RouteMarker
          ariaLabel="Метод работы: смысл, участие, запуск"
          steps={steps}
        />
      </div>
      <dl className={styles.processOutcomes}>
        {processSteps.map((step) => (
          <div key={step.label}>
            <dt>{step.label}</dt>
            <dd>{step.outcome}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
