import {
  Action,
  Copy,
  Heading,
  Label,
  Section,
  TextLink,
} from "../_design-system/components";
import { operations, procurementStatuses } from "./home-data";
import { HomeSectionIntro } from "./HomeSectionIntro";
import styles from "./home.module.css";

export function OperationsSection() {
  return (
    <Section aria-labelledby="operations-title">
      <div className={styles.operationsGrid}>
        <div>
          <HomeSectionIntro
            eyebrow="Управляемость"
            id="operations-title"
            title="Креативный проект должен быть понятен по ролям, срокам и границам"
          />
          <ul className={styles.operationsList}>
            {operations.map((item) => (
              <li key={item}>
                <span aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <aside className={styles.contentDebt}>
          <Label variant="status">Контентный долг до запуска</Label>
          <Heading as="h3" level={3}>
            Нужны process proof и procurement pack
          </Heading>
          <Copy>
            Роли, SLA ответа, resource plan, правила изменения scope,
            реквизиты, референсы, политика данных и ответственный контакт.
          </Copy>
          <TextLink directional href="/procurement">
            Открыть страницу закупок
          </TextLink>
        </aside>
      </div>
    </Section>
  );
}

export function ProcurementSection() {
  return (
    <Section
      aria-labelledby="procurement-title"
      className={styles.procurementSection}
      surface="indigo"
    >
      <div className={styles.procurementGrid}>
        <div className={styles.procurementCopy}>
          <Label>Shortlist и аккредитация</Label>
          <Heading id="procurement-title" level={2}>
            Понятный предмет закупки, роли и документы — без поиска по
            презентациям.
          </Heading>
          <Copy variant="body-large">
            Страница для закупок помогает сравнить scope, проверить поставщика
            и быстро получить недостающий пакет у одного ответственного контакта.
          </Copy>
          <Action href="/procurement" variant="primary">
            Информация для закупок
          </Action>
        </div>

        <dl className={styles.procurementStatus}>
          {procurementStatuses.map(([name, status]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{status}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
