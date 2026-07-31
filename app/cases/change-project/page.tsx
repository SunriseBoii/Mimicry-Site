import Link from "../../link";
import { Breadcrumbs, PageCta, Placeholder, SectionHeading, Shell } from "../../components";

export default function CaseTemplatePage() {
  return (
    <Shell>
      <Breadcrumbs items={[{ label: "Кейсы", href: "/cases" }, { label: "Шаблон кейса изменений" }]} />
      <section className="page-hero">
        <div className="container page-hero-grid">
          <div>
            <span className="eyebrow">Кейс · [отрасль / NDA]</span>
            <h1>[Как важная тема стала понятным маршрутом для сотрудников]</h1>
            <p>[Одно предложение: исходная ситуация → роль Mimicry → наблюдаемый результат. Заполняется только подтверждёнными фактами.]</p>
            <div className="case-title-meta"><span className="tag">Изменения</span><span className="tag tag-muted">[Срок]</span><span className="tag tag-muted">[Аудитория]</span></div>
          </div>
          <Placeholder title="[Ключевой результат]">
            <p>Цифра, действие или завершённый запуск + источник данных. Не использовать «рост вовлечённости» без измерения.</p>
          </Placeholder>
        </div>
      </section>

      <section className="section">
        <div className="container two-column">
          <div>
            <SectionHeading eyebrow="01 · Ситуация" title="Что происходило в компании" />
            <p>[Контекст, почему тема стала важной, какие группы затрагивала и что было поставлено на срок.]</p>
          </div>
          <div>
            <SectionHeading eyebrow="02 · Задача" title="Что требовалось изменить в понимании или действии" />
            <p>[Не перечень носителей, а конкретный коммуникационный результат и следующий шаг сотрудников.]</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="03 · Роли" title="Честно разделяем вклад Mimicry, клиента и партнёров" />
          <div className="role-table">
            <div className="role-row"><div>Mimicry</div><div>[Коммуникационная логика / концепция / механика / дизайн / production / PM — отметить фактическое.]</div></div>
            <div className="role-row"><div>Команда клиента</div><div>[Стратегические вводные, эксперты, согласования, каналы, площадка.]</div></div>
            <div className="role-row"><div>Партнёры</div><div>[Методолог, интегратор, подрядчик площадки, печать и т. п.]</div></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="04 · Решение" title="От смысла к участию и запуску" />
          <div className="three-column">
            <article className="info-card"><span className="micro-label">Смысл</span><h3>[Сообщения и аудитории]</h3><p>Что должны были понять разные группы и как это было связано с бизнес-контекстом.</p></article>
            <article className="info-card"><span className="micro-label">Участие</span><h3>[Механика]</h3><p>Что сотрудники делали, обсуждали, пробовали или создавали вместе.</p></article>
            <article className="info-card"><span className="micro-label">Запуск</span><h3>[Форматы и production]</h3><p>Какие материалы произведены, в каких каналах и в какой последовательности.</p></article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="05 · Материалы" title="Показываем проект в реальности" text="Документальная фотография и финальные outputs важнее мокапов. Концепт-арт должен быть явно подписан как концепт." />
          <div className="gallery-grid">
            <Placeholder title="[Главное документальное фото]" />
            <Placeholder title="[Фрагмент материала]" />
            <Placeholder title="[Люди в действии]" />
            <Placeholder title="[Backstage / production]" />
            <Placeholder title="[Digital / physical output]" />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="06 · Результат" title="Наблюдаемый эффект и источник каждой цифры" />
          <div className="metrics-grid">
            <div className="metric"><span>01</span>[Охват / количество участников]</div>
            <div className="metric"><span>02</span>[Выполнение механики / шага]</div>
            <div className="metric"><span>03</span>[Срок / объём материалов]</div>
            <div className="metric"><span>04</span>[Оценка клиента / продолжение]</div>
          </div>
          <div className="quote-placeholder" style={{ marginTop: 26 }}>“[Подтверждённая цитата заказчика]”<br/><small>[Имя, должность, компания, разрешение]</small></div>
        </div>
      </section>

      <section className="section">
        <div className="container bridge">
          <h2>Похожая задача: коммуникационный запуск изменений</h2>
          <p>Из кейса пользователь переходит не в общий каталог, а в решение, которое объясняет fit, состав и ограничения.</p>
          <Link className="text-link" href="/solutions/change">Открыть решение →</Link>
        </div>
      </section>
      <PageCta title="Обсудить похожую задачу" />
    </Shell>
  );
}
