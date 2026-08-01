import styles from "../_styles/visual-lab.module.css";
import {
  HeroCopy,
  HeroRoute,
  HeroSituationSelector,
} from "./HeroFragment";

export function MobileHeroFragment() {
  return (
    <div className={styles.mobileViewport}>
      <section className={styles.heroFragment} data-visual-part="mobile-hero">
        <div className={styles.heroLayout}>
          <HeroCopy />
          <HeroRoute />
        </div>
        <HeroSituationSelector />
      </section>
    </div>
  );
}
