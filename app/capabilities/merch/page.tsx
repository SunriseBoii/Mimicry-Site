import Link from "../../link";
import { Breadcrumbs, PageCta, Placeholder, SectionHeading, Shell } from "../../components";

export default function MerchCapabilityPage() {
  return (
    <Shell>
      <Breadcrumbs items={[{ label: "Компетенции" }, { label: "Мерч и физические носители" }]} />
      <section className="page-hero">
        <div className="container page-hero-grid">
          <div>
            <span className="eyebrow">Компетенция · самостоятельный вход и модуль</span>
            <h1>Мерч делает коммуникационную идею физической — если не существует отдельно от неё.</h1>
            <p>Разрабатываем welcome-паки, подарки, event-наборы, упаковку и печатные носители. Можем выполнить отдельную задачу или встроить её в onboarding, событие и HR-brand.</p>
            <div className="hero-actions"><Link className="button" href="/contact">Показать задачу →</Link><Link className="text-link" href="/products/welcome-pack">Открыть продуктовый лендинг</Link></div>
          </div>
          <Placeholder title="[Портфолио из 6–8 реализованных предметов]" />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="Что делаем" title="Конкретные outputs без претензии на мастер-категорию" />
          <div className="four-column">
            <article className="info-card"><h3>Welcome-pack</h3><p>Идея, состав, тексты, дизайн, упаковка.</p></article>
            <article className="info-card"><h3>Event-merch</h3><p>Носители, связанные со сценарием события.</p></article>
            <article className="info-card"><h3>Подарки</h3><p>Сезонные и тематические наборы под аудиторию.</p></article>
            <article className="info-card"><h3>Печать</h3><p>Материалы кампании, навигация, упаковка, контроль макетов.</p></article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container two-column">
          <div><SectionHeading eyebrow="Отдельно" title="Узкий заказ" /><p>Если нужна конкретная партия или дизайн, фиксируем deliverables, образцы, производство и логистику как самостоятельный scope.</p></div>
          <div><SectionHeading eyebrow="В системе" title="Часть спецпроекта" /><p>Если предмет связан с onboarding, EVP или event, начинаем с роли носителя в общем сценарии, а не с каталога сувениров.</p></div>
        </div>
      </section>
      <PageCta title="Начать с мерча — и не потерять общую задачу" />
    </Shell>
  );
}
