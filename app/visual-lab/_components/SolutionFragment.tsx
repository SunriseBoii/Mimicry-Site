import { sampleContent } from "../_data/sampleContent";
import styles from "../_styles/visual-lab.module.css";

export function SolutionFragment() {
  const { solution } = sampleContent;

  return (
    <section
      className={styles.solutionFragment}
      data-visual-part="solution"
      id="solution-fragment"
    >
      <header className={styles.solutionHeader}>
        <p className={styles.monoLabel}>Решение / процесс / scope</p>
        <h2>{solution.title}</h2>
      </header>

      <ol className={styles.processList}>
        {solution.steps.map((step, index) => (
          <li data-visual-part="process-step" key={step}>
            <span className={styles.processNode} aria-hidden="true" />
            <span className={styles.processIndex}>0{index + 1}</span>
            <p>{step}</p>
            <span className={styles.processStatus}>
              {index === 0 ? "Вход" : index === 1 ? "Участие" : "Запуск"}
            </span>
          </li>
        ))}
      </ol>

      <aside className={styles.boundaryNote}>
        <span>SCOPE / BOUNDARY</span>
        <p>{solution.boundary}</p>
      </aside>
    </section>
  );
}
