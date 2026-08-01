import {
  Copy,
  Eyebrow,
  Heading,
  Label,
  Section,
  TextLink,
} from "../_design-system/components";
import { situations } from "./home-data";
import { HomeSectionIntro } from "./HomeSectionIntro";
import styles from "./home.module.css";

export function ProblemSection() {
  return (
    <Section aria-labelledby="problem-title">
      <div className={styles.problemGrid}>
        <Heading className={styles.problemStatement} id="problem-title" level={2}>
          Важную тему можно разослать. Но сообщение ещё не становится общим
          пониманием и действием.
        </Heading>
        <aside className={styles.problemAside}>
          <Eyebrow>Задача Mimicry</Eyebrow>
          <Copy variant="body-large">
            Связать контекст, участие и нужные форматы в один проект — так,
            чтобы смысл не потерялся между носителями и подрядчиками.
          </Copy>
          <TextLink directional href="/about">
            Как мы работаем
          </TextLink>
        </aside>
      </div>
    </Section>
  );
}

export function SolutionsSection() {
  return (
    <Section
      aria-labelledby="solutions-title"
      className={styles.solutionsSection}
      id="solutions"
      surface="surface"
    >
      <HomeSectionIntro
        eyebrow="Решения по ситуации"
        id="solutions-title"
        text="Четыре маршрута используют одну систему работы, но отличаются контекстом, доказательствами и рисками."
        title="Не выбирайте услугу до того, как определена задача"
      />

      <nav aria-label="Решения по клиентской ситуации">
        <ol className={styles.solutionGrid}>
          {situations.map((situation) => (
            <li key={situation.href}>
              <a href={situation.href}>
                <Label>{situation.code}</Label>
                <Heading as="h3" level={3}>
                  {situation.label}
                </Heading>
                <Copy>{situation.description}</Copy>
                <strong className={styles.solutionLinkText}>
                  Подробнее <span aria-hidden="true">→</span>
                </strong>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </Section>
  );
}
