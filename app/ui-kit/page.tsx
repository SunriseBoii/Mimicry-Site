import {
  Action,
  Copy,
  Display,
  Eyebrow,
  Grid,
  Heading,
  Label,
  RouteMarker,
  Section,
  TextLink,
} from "../_design-system/components";
import { DesignSystemTheme } from "../_design-system/theme/Theme";
import styles from "./ui-kit.module.css";

const routeSteps = [
  {
    label: "Смысл",
    description: "Разбираем тему, контекст и аудитории.",
    state: "complete" as const,
  },
  {
    label: "Участие",
    description: "Проектируем понимание и следующий шаг.",
    state: "current" as const,
  },
  {
    label: "Запуск",
    description: "Собираем форматы и доводим до запуска.",
    state: "upcoming" as const,
  },
];

const tokens = [
  { label: "Background", swatch: styles.backgroundSwatch },
  { label: "Surface", swatch: styles.surfaceSwatch },
  { label: "Text", swatch: styles.textSwatch },
  { label: "Direction", swatch: styles.actionSwatch },
  { label: "Signal", swatch: styles.signalSwatch },
  { label: "Evidence", swatch: styles.evidenceSwatch },
];

export default function UiKitPage() {
  return (
    <DesignSystemTheme as="main">
      <Section id="overview">
        <div className={styles.heroContent}>
          <Eyebrow>Mimicry group · production foundation</Eyebrow>
          <Display as="h1">Смысл → участие → запуск.</Display>
          <Copy variant="lead">
            Служебная страница для проверки утверждённой production-системы
            «Редакционный вектор» на реальной ширине экрана.
          </Copy>
          <div className={styles.heroActions}>
            <Action href="#actions" variant="primary">
              Проверить действия
            </Action>
            <Action href="#route-marker" variant="secondary" arrow>
              Проверить маршрут
            </Action>
          </div>
        </div>
      </Section>

      <Section surface="surface" id="tokens-grid">
        <div className={styles.sectionHeading}>
          <Eyebrow>Основание / tokens + grid</Eyebrow>
          <Heading level={2}>Семантические роли и адаптивная сетка</Heading>
          <Copy variant="body-large">
            Цвета, интервалы, типографика и движение берутся из общего scoped-набора
            переменных. Сетка меняется с 4 на 8 и 12 колонок.
          </Copy>
        </div>

        <Grid>
          {tokens.map((token) => (
            <div className={styles.tokenCard} key={token.label}>
              <span
                className={[styles.swatch, token.swatch].join(" ")}
                aria-hidden="true"
              />
              <span className={styles.tokenName}>{token.label}</span>
            </div>
          ))}
        </Grid>

        <Grid className={styles.gridDemo} aria-label="Адаптивная сетка">
          {Array.from({ length: 12 }, (_, index) => (
            <div className={styles.gridCell} key={index}>
              {String(index + 1).padStart(2, "0")}
            </div>
          ))}
        </Grid>
      </Section>

      <Section id="typography">
        <div className={styles.sectionHeading}>
          <Eyebrow>Typography / Onest + IBM Plex Mono</Eyebrow>
          <Heading level={2}>Типографическая шкала</Heading>
          <Copy>
            IBM Plex Mono используется только для labels, стадий и проверяемых
            служебных данных.
          </Copy>
        </div>

        <div className={styles.typeList}>
          <div className={styles.typeSpecimen}>
            <span className={styles.typeName}>display-xl</span>
            <Display>Направленное действие</Display>
          </div>
          <div className={styles.typeSpecimen}>
            <span className={styles.typeName}>display-lg</span>
            <Display size="lg">Корпоративные коммуникации</Display>
          </div>
          <div className={styles.typeSpecimen}>
            <span className={styles.typeName}>heading-1 style</span>
            <Heading as="p" level={1}>Важную тему мало объявить</Heading>
          </div>
          <div className={styles.typeSpecimen}>
            <span className={styles.typeName}>heading-2</span>
            <Heading as="p" level={2}>Проектируем участие</Heading>
          </div>
          <div className={styles.typeSpecimen}>
            <span className={styles.typeName}>heading-3</span>
            <Heading as="p" level={3}>Доводим до запуска</Heading>
          </div>
          <div className={styles.typeSpecimen}>
            <span className={styles.typeName}>lead</span>
            <Copy variant="lead">
              Разбираем контекст и аудитории, проектируем участие и собираем
              нужные форматы.
            </Copy>
          </div>
          <div className={styles.typeSpecimen}>
            <span className={styles.typeName}>body-large / body / small</span>
            <Copy variant="body-large">
              Крупный основной текст для процесса и вводного описания.
            </Copy>
            <Copy>Стандартный основной текст для интерфейса и редакционных блоков.</Copy>
            <Copy variant="small">Служебное пояснение без уменьшения основного текста.</Copy>
          </div>
          <div className={styles.typeSpecimen}>
            <span className={styles.typeName}>mono-label</span>
            <Copy variant="mono">ROUTE / 01—03 · STATUS / READY</Copy>
          </div>
        </div>
      </Section>

      <Section surface="surface" id="actions">
        <div className={styles.sectionHeading}>
          <Eyebrow>Actions / native semantics</Eyebrow>
          <Heading level={2}>Кнопки и текстовые ссылки</Heading>
          <Copy>
            Наведите указатель, нажмите или пройдите элементы клавишей Tab, чтобы
            проверить hover, active и focus-visible. Disabled показан постоянно.
          </Copy>
        </div>

        <div className={styles.actionGrid}>
          <article className={styles.stateGroup}>
            <Heading level={3}>Anchor actions</Heading>
            <div className={styles.actionRow}>
              <Action href="#overview" variant="primary">Primary action</Action>
              <Action href="#tokens-grid" variant="secondary" arrow>
                Secondary action
              </Action>
              <Action href="#route-marker" variant="directional">
                Directional action
              </Action>
            </div>
            <Copy className={styles.stateHint} variant="small">
              Переходы ведут к реальным разделам этой служебной страницы.
            </Copy>
          </article>

          <article className={styles.stateGroup}>
            <Heading level={3}>Native buttons</Heading>
            <div className={styles.actionRow}>
              <Action variant="primary">Button</Action>
              <Action variant="secondary" arrow>Secondary</Action>
              <Action variant="primary" disabled>Disabled</Action>
            </div>
            <Copy className={styles.stateHint} variant="small">
              Disabled использует native-атрибут и отдельные цвет, границу и cursor.
            </Copy>
          </article>

          <article className={styles.stateGroup}>
            <Heading level={3}>Text links</Heading>
            <div className={styles.linkRow}>
              <TextLink href="#typography">Обычная ссылка</TextLink>
              <TextLink href="#route-marker" directional>
                Направленная ссылка
              </TextLink>
            </div>
          </article>

          <article className={styles.stateGroup}>
            <Heading level={3}>Labels</Heading>
            <div className={styles.labelRow}>
              <Label>DEFAULT / 01</Label>
              <Label variant="evidence">EVIDENCE / REQUIRED</Label>
              <Label variant="process">PROCESS / УЧАСТИЕ</Label>
              <Label variant="status">STATUS / ГОТОВО</Label>
            </div>
          </article>
        </div>
      </Section>

      <Section surface="indigo" id="indigo-surface">
        <div className={styles.surfaceContent}>
          <div className={styles.sectionHeading}>
            <Eyebrow>Direction surface</Eyebrow>
            <Heading level={2}>Indigo отмечает направление и действие</Heading>
            <Copy variant="body-large">
              Контрастные состояния сохраняют текстовую метку, границу и видимый
              lime focus halo.
            </Copy>
          </div>
          <div className={styles.actionRow}>
            <Action href="#overview" variant="primary">Primary</Action>
            <Action href="#actions" variant="secondary" arrow>Secondary</Action>
            <TextLink href="#route-marker" directional>К маршруту</TextLink>
          </div>
        </div>
      </Section>

      <Section surface="evidence" id="evidence-surface">
        <div className={styles.surfaceContent}>
          <div className={styles.sectionHeading}>
            <Eyebrow>Evidence surface</Eyebrow>
            <Heading level={2}>Тёмная поверхность выделяет проверяемое доказательство</Heading>
            <Copy variant="body-large">
              Здесь нет вымышленных клиентов, метрик или отзывов — только служебные
              статусы и нейтральные подписи.
            </Copy>
          </div>
          <div className={styles.labelRow}>
            <Label variant="evidence">PERMISSION / REQUIRED</Label>
            <Label variant="status">SOURCE / НЕ ДОБАВЛЕН</Label>
          </div>
          <div className={styles.actionRow}>
            <Action href="#overview" variant="primary">Вернуться к началу</Action>
            <Action href="#actions" variant="secondary" arrow>Проверить состояния</Action>
            <TextLink href="#route-marker" directional>Следующий раздел</TextLink>
          </div>
        </div>
      </Section>

      <Section id="route-marker">
        <div className={styles.sectionHeading}>
          <Eyebrow>Functional route / 01—03</Eyebrow>
          <Heading level={2}>Базовый process marker</Heading>
          <Copy>
            Линия и узлы декоративны; порядок, названия и состояния этапов остаются
            доступны как текст упорядоченного списка.
          </Copy>
        </div>
        <RouteMarker ariaLabel="Процесс: смысл, участие, запуск" steps={routeSteps} />
      </Section>
    </DesignSystemTheme>
  );
}
