import { Label } from "../_design-system/components";
import { situations } from "./home-data";
import styles from "./home.module.css";

export function SituationRoutes() {
  return (
    <nav aria-labelledby="hero-situations-title" className={styles.situationRoutes}>
      <div className={styles.situationRoutesHeading}>
        <Label id="hero-situations-title">Когда мы нужны / 01—04</Label>
        <span>Выберите ситуацию</span>
      </div>
      <ol>
        {situations.map((situation) => (
          <li key={situation.href}>
            <a href={situation.href}>
              <Label>{situation.code}</Label>
              <strong>{situation.label}</strong>
              <span className={styles.situationRouteHint}>Открыть решение</span>
              <span aria-hidden="true">→</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
