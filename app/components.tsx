import Link from "./link";
import type { ReactNode } from "react";
import { solutionLinks } from "./_site/site-data";
import { ProjectRail } from "./_brand/ProjectRail";

export const solutions = solutionLinks;

export const modules = [
  "Контент",
  "Дизайн",
  "Event",
  "Игры",
  "Видео",
  "Digital",
  "Мерч",
];

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav className="breadcrumbs container" aria-label="Хлебные крошки">
      <Link href="/">Главная</Link>
      {items.map((item) => (
        <span key={item.label}>
          <span aria-hidden="true">/</span>{" "}
          {item.href ? <Link href={item.href}>{item.label}</Link> : <b>{item.label}</b>}
        </span>
      ))}
    </nav>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text?: string;
}) {
  return (
    <div className="section-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {text ? <p>{text}</p> : null}
    </div>
  );
}

export function Placeholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="placeholder">
      <span className="placeholder-label">Нужен подтверждённый контент</span>
      <strong>{title}</strong>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export function SolutionNav({ active }: { active?: string }) {
  return (
    <div className="solution-nav" aria-label="Другие решения">
      {solutions.map((item) => (
        <Link
          aria-current={active === item.label ? "page" : undefined}
          className={active === item.label ? "active" : ""}
          href={item.href}
          key={item.href}
        >
          <span>{item.code}</span>
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export function ProcessSteps() {
  return (
    <div className="process-grid">
      <article>
        <span className="step-number">01</span>
        <h3>Смысл</h3>
        <p>Разбираем тему, контекст, аудитории и следующий шаг. Только потом выбираем формат.</p>
        <small>Выход: рамка задачи, сообщения, критерии результата.</small>
      </article>
      <article>
        <span className="step-number">02</span>
        <h3>Участие</h3>
        <p>Проектируем, что люди должны увидеть, понять, попробовать или сделать вместе.</p>
        <small>Выход: сценарий участия, механика, путь аудитории.</small>
      </article>
      <article>
        <span className="step-number">03</span>
        <h3>Запуск</h3>
        <p>Собираем контент, дизайн и production, ведём сроки и доводим проект до контакта с аудиторией.</p>
        <small>Выход: материалы, проведение, непосредственные метрики.</small>
      </article>
    </div>
  );
}

export function ModuleChips() {
  return (
    <div className="module-composition">
      <div className="project-composition-demo">
        <span className="micro-label">Пример сборки · не фиксированный состав решения</span>
        <ProjectRail
          competencies={["content", "design", "digital"]}
          label="Контент как lead, дизайн и digital как support"
          lead="content"
        />
      </div>
      <div className="chip-grid">
        {modules.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

export function PageCta({
  title = "Есть тема, аудитория и срок? Этого достаточно, чтобы начать.",
  text = "На первой встрече уточним задачу, границы и подходящий формат — без длинной формы и обещаний до брифа.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <section className="cta-band" data-color-scope="neutral">
      <div className="container cta-grid">
        <div>
          <span className="eyebrow">Следующий шаг</span>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
        <div className="cta-actions">
          <Link className="button" href="/contact">Обсудить задачу →</Link>
          <Link className="text-link" href="/procurement">Информация для закупок</Link>
        </div>
      </div>
    </section>
  );
}

export type SolutionPageData = {
  key: string;
  name: string;
  eyebrow: string;
  title: string;
  intro: string;
  outcome: string;
  when: string[];
  includes: Array<{ title: string; text: string }>;
  metrics: string[];
  limits: string[];
  cta: string;
};

export const solutionData: Record<string, SolutionPageData> = {
  change: {
    key: "change",
    name: "Изменения",
    eyebrow: "Решение 01 · внутренние коммуникации",
    title: "Помогаем важному изменению стать понятным маршрутом для сотрудников.",
    intro:
      "Когда стратегия, ценности или новый способ работы уже определены, собираем вокруг темы сообщения, участие и материалы — и доводим коммуникацию до запуска.",
    outcome: "Люди видят контекст, понимают, что относится к ним, и знают следующий шаг.",
    when: [
      "Запускается стратегия, ценности или изменение процесса.",
      "Одну тему нужно объяснить разным группам сотрудников.",
      "Каналы, событие и носители распадаются на отдельные активности.",
      "Внутренней команде не хватает ресурса на сборку и production.",
    ],
    includes: [
      { title: "Контекст и аудитории", text: "Фиксируем, что меняется, для кого и какое действие требуется." },
      { title: "Коммуникационная логика", text: "Собираем сообщения, последовательность и роль каждого канала." },
      { title: "Механика участия", text: "Проектируем событие, обсуждение, игру или другой способ включиться." },
      { title: "Материалы и запуск", text: "Производим нужные форматы и ведём реализацию в согласованных границах." },
    ],
    metrics: ["охват нужной аудитории", "понимание ключевого сообщения", "доля выполнивших следующий шаг", "качество запуска и соблюдение scope"],
    limits: ["Не разрабатываем HR-стратегию или организационный change с нуля.", "Не обещаем изменение культуры одной кампанией.", "Для глубокой диагностики подключается профильный консультант."],
    cta: "Обсудить коммуникационный запуск",
  },
  event: {
    key: "event",
    name: "События",
    eyebrow: "Решение 02 · event",
    title: "Событие, у которого есть деловая функция — не только программа.",
    intro:
      "Собираем концепцию, сценарий участия, визуальную систему, активности и production вокруг одной задачи компании.",
    outcome: "Участники понимают общую тему, включаются в нужный формат и уносят понятное продолжение после события.",
    when: ["Есть дата и бизнес-тема, но пока нет общей логики.", "Нужно связать несколько площадок или аудиторий.", "Нужны механики, digital, мерч и контент до/после.", "Важно снять с команды координацию подрядчиков и материалов."],
    includes: [
      { title: "Деловая функция", text: "Определяем, что должно измениться в понимании или взаимодействии." },
      { title: "Концепция и сценарий", text: "Связываем идею, программу, пространство и точки участия." },
      { title: "Production", text: "Собираем визуалы, активности, подрядчиков, материалы и документы." },
      { title: "Продолжение", text: "Проектируем контент и следующий шаг после события." },
    ],
    metrics: ["регистрация и фактическое участие", "завершение механики", "обратная связь по задаче", "сроки и изменения бюджета"],
    limits: ["Масштаб и география подтверждаются capability check.", "Крупный федеральный production может требовать партнёра.", "ИБ и персональные данные digital-механик оцениваются отдельно."],
    cta: "Проверить задачу и масштаб",
  },
  learning: {
    key: "learning",
    name: "Обучение",
    eyebrow: "Решение 03 · L&D",
    title: "Проектируем игру или симуляцию вокруг рабочего поведения, а не развлечения.",
    intro:
      "Переводим рабочую ситуацию в опыт, где участники пробуют решение, обсуждают последствия и получают продолжение после сессии.",
    outcome: "Участники не только слышат материал, а применяют модель действия в безопасной ситуации.",
    when: ["Нужно отработать конкретное решение или взаимодействие.", "Лекции не дают достаточной практики.", "Тема сложная, но её нельзя упростить до квиза.", "Нужен пилот перед серией когорт."],
    includes: [
      { title: "Рабочая ситуация", text: "Определяем поведение и критерии хорошего решения." },
      { title: "Методология", text: "Согласуем роль предметного эксперта и способ проверки переноса." },
      { title: "Механика", text: "Создаём сценарий, правила, материалы и роль ведущего." },
      { title: "Пилот и follow-up", text: "Проверяем формат и планируем продолжение в работе." },
    ],
    metrics: ["завершение сценария", "качество решений в игре", "обратная связь ведущего", "follow-up и применение в работе"],
    limits: ["Без методолога нельзя обещать перенос навыка.", "Пилот обязателен для сложной кастомной механики.", "Игра не заменяет системную программу развития."],
    cta: "Обсудить пилот",
  },
  "hr-brand": {
    key: "hr-brand",
    name: "HR-brand",
    eyebrow: "Решение 04 · активация",
    title: "Превращаем готовую HR-стратегию в конкретные точки опыта сотрудников.",
    intro:
      "Собираем кампанию, onboarding, событие, контент, digital или мерч вокруг уже определённого EVP и реального контекста компании.",
    outcome: "Стратегическая идея становится видимой в материалах, действиях и точках контакта с сотрудниками.",
    when: ["EVP или ценности уже определены, но не активированы.", "Нужен onboarding или внутренняя кампания.", "Есть много носителей, но нет единого сценария.", "Нужно связать внутренние и внешние материалы без разрыва."],
    includes: [
      { title: "Входные данные", text: "Проверяем EVP, аудитории, ограничения и реальные точки опыта." },
      { title: "Идея активации", text: "Собираем тему в понятный сценарий и систему сообщений." },
      { title: "Точки контакта", text: "Производим контент, дизайн, событие, digital и физические носители." },
      { title: "Запуск", text: "Координируем материалы и проверяем непосредственную реакцию аудитории." },
    ],
    metrics: ["охват целевых групп", "использование материалов", "участие в активации", "понимание ключевой идеи"],
    limits: ["Не заявляем разработку EVP с нуля без партнёра.", "Не обещаем влияние на удержание одной активацией.", "Внешний consumer-маркетинг оценивается отдельно."],
    cta: "Обсудить активацию",
  },
};
