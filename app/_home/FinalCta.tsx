import {
  Action,
  Copy,
  Display,
  Eyebrow,
  Section,
  TextLink,
} from "../_design-system/components";
import styles from "./home.module.css";

export function FinalCta() {
  return (
    <Section aria-labelledby="final-cta-title" className={styles.finalCta}>
      <div className={styles.finalCtaGrid}>
        <div>
          <Eyebrow>Следующий шаг</Eyebrow>
          <Display as="h2" id="final-cta-title" size="lg">
            Есть тема, аудитория и срок? Этого достаточно, чтобы начать.
          </Display>
          <Copy variant="body-large">
            На первой встрече уточним задачу, границы и подходящий формат — без
            длинной формы и обещаний до брифа.
          </Copy>
        </div>
        <div className={styles.finalCtaActions}>
          <Action href="/contact" variant="primary">
            Обсудить задачу
          </Action>
          <TextLink href="/procurement">Информация для закупок</TextLink>
        </div>
      </div>
    </Section>
  );
}
