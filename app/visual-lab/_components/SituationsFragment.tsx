import { sampleContent } from "../_data/sampleContent";
import styles from "../_styles/visual-lab.module.css";

export function SituationsFragment() {
  return (
    <section className={styles.situationsFragment} data-visual-part="situations">
      <header className={styles.sectionHeader}>
        <p className={styles.monoLabel}>Клиентские ситуации / 01—04</p>
        <h2>Когда мы нужны</h2>
      </header>
      <ol className={styles.situationGrid}>
        {sampleContent.situations.map((situation, index) => (
          <li data-visual-part="situation" key={situation.name}>
            <article>
              <span className={styles.situationIndex}>0{index + 1}</span>
              <h3>{situation.name}</h3>
              <p>{situation.description}</p>
              <span className={styles.situationStatus}>Ситуация · маршрут</span>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
