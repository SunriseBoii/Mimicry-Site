import { sampleContent } from "../_data/sampleContent";
import styles from "../_styles/visual-lab.module.css";

export function HeroCopy() {
  const { hero } = sampleContent;
  const [statement, routeText] = hero.title.split(": ");
  const routeSteps = routeText.split(" → ");

  return (
    <div className={styles.heroCopy}>
      <p className={styles.monoLabel}>{hero.eyebrow}</p>
      <h2>
        <span className={styles.heroTitleStatement}>{statement}: </span>
        <span
          className={styles.heroTitleRoute}
          data-visual-part="hero-title-route"
        >
          {routeSteps.map((step, index) => (
            <span key={step}>
              <span
                className={styles.heroTitleStep}
                data-visual-part="hero-title-step"
              >
                {step}
                {index < routeSteps.length - 1 ? (
                  <>
                    {" "}
                    <span className={styles.heroTitleArrow}>→</span>
                  </>
                ) : null}
              </span>
              {index < routeSteps.length - 1 ? " " : null}
            </span>
          ))}
        </span>
      </h2>
      <p className={styles.heroLead}>{hero.lead}</p>
      <div className={styles.ctaRow}>
        <a className={styles.primaryCta} href="#lab-notice">
          {hero.primaryCta} <span aria-hidden="true">→</span>
        </a>
        <a className={styles.secondaryCta} href="#solution-fragment">
          {hero.secondaryCta} <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  );
}

export function HeroRoute() {
  return (
    <div className={styles.heroRoute}>
      <p className={styles.monoLabel}>Маршрут / 01—03</p>
      <ol className={styles.routeStages}>
        {sampleContent.routeStages.map((stage, index) => (
          <li key={stage}>
            <span className={styles.routeNode} aria-hidden="true" />
            <span className={styles.routeIndex}>0{index + 1}</span>
            <strong>{stage}</strong>
          </li>
        ))}
      </ol>
      <div className={styles.heroMediaSlot} aria-label="Незаполненный слот документального материала">
        <span className={styles.mediaSlotCaption}>
          <span className={styles.mediaSlotStatus}>DOCUMENTARY SLOT / NO ASSET</span>
          <span className={styles.mediaSlotMessage}>Материал не добавлен</span>
        </span>
      </div>
    </div>
  );
}

export function HeroSituationSelector() {
  return (
    <nav className={styles.heroSelector} aria-label="Клиентские ситуации">
      <p className={styles.monoLabel}>Когда мы нужны / 01—04</p>
      <ol>
        {sampleContent.situations.map((situation, index) => (
          <li key={situation.name}>
            <a href="#solution-fragment">
              <span className={styles.selectorIndex}>0{index + 1}</span>
              <span>{situation.name}</span>
              <span className={styles.selectorState}>Открыть маршрут</span>
              <span aria-hidden="true">→</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function HeroFragment() {
  return (
    <section className={styles.heroFragment} data-visual-part="hero">
      <div className={styles.heroLayout}>
        <HeroCopy />
        <HeroRoute />
      </div>
      <HeroSituationSelector />
    </section>
  );
}
