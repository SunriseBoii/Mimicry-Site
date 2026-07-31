import Link from "./link";
import {
  ModuleChips,
  PageCta,
  ProcessSteps,
  SectionHeading,
  Shell,
  solutions,
} from "./components";

type HomeProps = {
  searchParams?: Promise<{ hero?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = (await searchParams) ?? {};
  const variant = params.hero === "b" ? "b" : "a";
  const hero =
    variant === "a"
      ? {
          eyebrow: "Агентство корпоративных коммуникаций",
          title: "Собираем важные темы в проекты, которые сотрудники понимают и в которых участвуют.",
          text: "Коммуникационная логика, контент, дизайн, события, обучение, игры и digital — в одной системе от брифа до запуска.",
          primary: "Обсудить задачу",
          secondary: "Посмотреть структуру кейса",
        }
      : {
          eyebrow: "Спецпроекты для сотрудников",
          title: "Важную корпоративную тему мало объявить. Превращаем её в маршрут: смысл → участие → запуск.",
          text: "Разбираем контекст и аудитории, проектируем участие, собираем нужные форматы и доводим проект до реального контакта с сотрудниками.",
          primary: "Разобрать задачу",
          secondary: "Как устроен проект",
        };

  return (
    <Shell>
      <section className="hero" id="hero">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">{hero.eyebrow}</span>
            <h1>{hero.title}</h1>
            <p className="hero-copy">{hero.text}</p>
            <div className="hero-actions">
              <Link className="button" href="/contact">{hero.primary} →</Link>
              <Link className="text-link" href={variant === "a" ? "/cases/change-project" : "#process"}>
                {hero.secondary}
              </Link>
            </div>
          </div>

          <aside>
            <div className="hero-aside">
              <div className="hero-aside-title">Когда мы нужны</div>
              <div className="situation-list">
                {solutions.map((item) => (
                  <Link href={item.href} key={item.href}>
                    <span>{item.label}</span><span aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="hero-test-switch">
              <p><strong>Внутренний тест:</strong> два объяснения одной стратегии</p>
              <div className="switch-links">
                <Link className={variant === "a" ? "active" : ""} href="/?hero=a#hero">A · через результат</Link>
                <Link className={variant === "b" ? "active" : ""} href="/?hero=b#hero">B · через проблему</Link>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="proof-strip" aria-label="Основания доверия">
        <div className="container proof-grid">
          <div>
            <strong>9 направлений</strong>
            <p>Зафиксированы в карте компетенций 2026. Состав команды нужно актуализировать.</p>
          </div>
          <div>
            <strong>Смысл + production + PM</strong>
            <p>Контент, дизайн, event, игры, video, digital и физические носители.</p>
          </div>
          <div>
            <strong>От брифа до запуска</strong>
            <p>Операционное обещание в согласованном scope, без гарантии бизнес-метрик.</p>
          </div>
          <div className="proof-gap">
            <strong>[Логотипы / отзыв]</strong>
            <p>Добавить только после разрешения и проверки публичного права.</p>
          </div>
        </div>
      </section>

      <section className="section" id="cases">
        <div className="container">
          <SectionHeading
            eyebrow="Сначала доказательства"
            title="Кейсы должны отвечать на вопрос «что изменилось и что делала Mimicry»"
            text="В доступных материалах есть концепции и макеты, но пока нет трёх полностью подтверждённых публичных кейсов. Карточки ниже показывают нужную структуру, а не выдают предположения за факты."
          />
          <div className="case-grid">
            <Link className="case-card" href="/cases/change-project">
              <div className="case-media">[Документальное фото / фрагмент материалов после разрешения]</div>
              <div className="case-body">
                <span className="tag">Изменения</span>
                <h3>[Запуск стратегии или ценностей]</h3>
                <p>Нужны: клиентский контекст, аудитории, роль Mimicry, следующий шаг и непосредственный результат.</p>
                <span className="text-link">Открыть шаблон кейса →</span>
              </div>
            </Link>
            <Link className="case-card" href="/cases/change-project">
              <div className="case-media">[Игровые материалы / кадр пилота / отзыв ведущего]</div>
              <div className="case-body">
                <span className="tag">Обучение</span>
                <h3>[Кастомная игра или симуляция]</h3>
                <p>Нужны: рабочее поведение, методология, пилот, роль ведущего и follow-up.</p>
                <span className="text-link">Открыть шаблон кейса →</span>
              </div>
            </Link>
            <Link className="case-card" href="/cases/change-project">
              <div className="case-media">[Фото события / пространство / участие людей]</div>
              <div className="case-body">
                <span className="tag">Event</span>
                <h3>[Событие с деловой функцией]</h3>
                <p>X5 Tech можно рассматривать только после подтверждения реализации и права публикации.</p>
                <span className="text-link">Открыть шаблон кейса →</span>
              </div>
            </Link>
          </div>
          <p style={{ marginTop: 24 }}><Link className="text-link" href="/cases">Смотреть карту кейсов и статусы контента →</Link></p>
        </div>
      </section>

      <section className="section">
        <div className="container problem-grid">
          <blockquote>Важную тему можно разослать. Но сообщение ещё не становится общим пониманием и действием.</blockquote>
          <aside>
            <span className="eyebrow">Задача Mimicry</span>
            <p>Связать контекст, участие и нужные форматы в один проект — так, чтобы смысл не потерялся между носителями и подрядчиками.</p>
            <Link className="text-link" href="/about">Как мы работаем →</Link>
          </aside>
        </div>
      </section>

      <section className="section" id="solutions">
        <div className="container">
          <SectionHeading
            eyebrow="Решения по ситуации"
            title="Не выбирайте услугу до того, как определена задача"
            text="Четыре маршрута используют одну систему работы, но отличаются контекстом, доказательствами и рисками."
          />
          <div className="solution-grid">
            <Link className="solution-card" href="/solutions/change">
              <span className="code">01</span><h3>Изменения</h3>
              <p>Запуск стратегии, ценностей или сложной темы для разных групп сотрудников.</p><b>Подробнее →</b>
            </Link>
            <Link className="solution-card" href="/solutions/event">
              <span className="code">02</span><h3>События</h3>
              <p>Корпоративное событие, где программа и production работают на деловую функцию.</p><b>Подробнее →</b>
            </Link>
            <Link className="solution-card" href="/solutions/learning">
              <span className="code">03</span><h3>Обучение</h3>
              <p>Игра, симуляция или квест вокруг конкретной рабочей ситуации и поведения.</p><b>Подробнее →</b>
            </Link>
            <Link className="solution-card" href="/solutions/hr-brand">
              <span className="code">04</span><h3>HR-brand</h3>
              <p>Активация готового EVP через контент, onboarding, события, digital и носители.</p><b>Подробнее →</b>
            </Link>
          </div>
        </div>
      </section>

      <section className="section" id="process">
        <div className="container">
          <SectionHeading
            eyebrow="Одна система"
            title="Смысл → участие → запуск"
            text="Широта Mimicry объясняется не списком производств, а последовательностью: что бы мы ни создавали, формат подчинён задаче и аудитории."
          />
          <ProcessSteps />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading
            eyebrow="Модули и точки входа"
            title="Можно начать с одного носителя — и не потерять общую логику"
            text="Каждый модуль можно заказать отдельно, встроить в решение или развить в следующий проект. В первом слое сайта они не конкурируют с четырьмя ситуациями."
          />
          <ModuleChips />
          <div className="bridge" style={{ marginTop: 24 }}>
            <h2>Пример перехода: welcome-pack → onboarding → HR-brand-активация</h2>
            <p>Продуктовый лендинг сохраняет узкое предложение, но объясняет, когда физический набор становится частью более широкой коммуникации.</p>
            <Link className="text-link" href="/products/welcome-pack">Открыть product landing →</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container trust-grid">
          <div>
            <SectionHeading
              eyebrow="Управляемость"
              title="Креативный проект должен быть понятен по ролям, срокам и границам"
            />
            <ul className="check-list">
              <li>Определяем задачу, аудитории и непосредственный результат.</li>
              <li>Фиксируем scope, роли Mimicry, клиента и партнёров.</li>
              <li>Показываем этапы, точки согласования и правила изменений.</li>
              <li>Заранее называем, где нужен методолог, интегратор или крупный production-партнёр.</li>
            </ul>
          </div>
          <div className="placeholder">
            <span className="placeholder-label">Контентный долг до запуска</span>
            <strong>Нужны process proof и procurement pack</strong>
            <p>Роли, SLA ответа, resource plan, правила изменения scope, реквизиты, референсы, политика данных и ответственный контакт.</p>
            <p><Link className="text-link" href="/procurement">Открыть страницу закупок →</Link></p>
          </div>
        </div>
      </section>

      <PageCta />
    </Shell>
  );
}
