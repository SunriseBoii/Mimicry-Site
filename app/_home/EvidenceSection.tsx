import {
  Copy,
  Heading,
  Label,
  Section,
  TextLink,
} from "../_design-system/components";
import { evidenceItems, proofItems } from "./home-data";
import { HomeSectionIntro } from "./HomeSectionIntro";
import styles from "./home.module.css";

export function ProofStrip() {
  return (
    <Section
      aria-labelledby="proof-title"
      className={styles.proofSection}
      surface="surface"
    >
      <h2 className={styles.visuallyHidden} id="proof-title">
        Основания доверия
      </h2>
      <div className={styles.proofGrid}>
        {proofItems.map((item) => (
          <article className={styles.proofItem} key={item.title}>
            {"status" in item ? (
              <Label className={styles.proofStatus} variant="status">
                {item.status}
              </Label>
            ) : null}
            <strong>{item.title}</strong>
            <Copy variant="small">{item.text}</Copy>
          </article>
        ))}
      </div>
    </Section>
  );
}

export function EvidenceSection() {
  return (
    <Section
      aria-labelledby="evidence-title"
      className={styles.evidenceSection}
      id="cases"
      surface="evidence"
    >
      <HomeSectionIntro
        eyebrow="Сначала доказательства"
        id="evidence-title"
        text="В доступных материалах есть концепции и макеты, но пока нет трёх полностью подтверждённых публичных кейсов. Статусы ниже показывают нужную структуру и не выдают предположения за факты."
        title="Кейсы должны отвечать на вопрос «что изменилось и что делала Mimicry»"
      />

      <div className={styles.evidenceGrid}>
        {evidenceItems.map((item) => (
          <article className={styles.evidenceCard} key={item.code}>
            <div className={styles.evidenceMeta}>
              <Label variant="evidence">{item.code}</Label>
              <Label variant="status">{item.status}</Label>
            </div>
            <Copy className={styles.evidenceSituation} variant="mono">
              {item.situation}
            </Copy>
            <Heading as="h3" level={3}>
              {item.title}
            </Heading>
            <Copy>{item.text}</Copy>
            <TextLink directional href="/cases/change-project">
              Открыть структуру кейса
            </TextLink>
          </article>
        ))}
      </div>

      <TextLink className={styles.sectionLink} directional href="/cases">
        Смотреть карту кейсов и статусы контента
      </TextLink>
    </Section>
  );
}
