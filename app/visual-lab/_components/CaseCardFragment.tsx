import { sampleContent } from "../_data/sampleContent";
import styles from "../_styles/visual-lab.module.css";

export function CaseCardFragment() {
  const caseStudy = sampleContent.caseStudy;

  return (
    <section className={styles.caseFragment} data-visual-part="case">
      <header className={styles.sectionHeader}>
        <p className={styles.monoLabel}>Case lead / proof required</p>
        <h2>Проверка кейса без готового фото</h2>
      </header>

      <article className={styles.caseCard} data-visual-part="case-card">
        <div className={styles.caseMedia} data-visual-part="case-media">
          <div className={styles.contactSheet} aria-hidden="true">
            {caseStudy.sequence.map((stage, index) => (
              <span key={stage} data-sequence={index + 1}>
                <b>0{index + 1}</b>
                {stage}
              </span>
            ))}
          </div>
          <p>{caseStudy.media}</p>
          <span className={styles.permissionStatus}>
            PERMISSION STATUS / НЕ ПОДТВЕРЖДЕНО
          </span>
        </div>

        <div className={styles.caseContent}>
          <p className={styles.caseTag}>{caseStudy.tag}</p>
          <h3>{caseStudy.title}</h3>
          <dl className={styles.caseFacts}>
            <div>
              <dt>ROLE / MIMICRY</dt>
              <dd>{caseStudy.role}</dd>
            </div>
            <div>
              <dt>RESULT / SOURCE REQUIRED</dt>
              <dd>{caseStudy.result}</dd>
            </div>
          </dl>
          <a className={styles.caseLink} href="#solution-fragment">
            Перейти к решению <span aria-hidden="true">→</span>
          </a>
        </div>
      </article>
    </section>
  );
}
