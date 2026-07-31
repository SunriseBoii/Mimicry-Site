import Link from "../../link";
import { Breadcrumbs, PageCta, Placeholder, SectionHeading, Shell } from "../../components";

export default function WelcomePackPage() {
  return (
    <Shell>
      <Breadcrumbs items={[{ label: "Продукты" }, { label: "Welcome-pack" }]} />
      <section className="page-hero">
        <div className="container page-hero-grid">
          <div>
            <span className="eyebrow">Продуктовый вход · мерч + onboarding</span>
            <h1>Welcome-pack, который продолжает знакомство с компанией.</h1>
            <p>Собираем идею, тексты, дизайн, упаковку и носители в один набор. Можно сделать отдельно — или встроить в onboarding и HR-brand-активацию.</p>
            <div className="hero-actions"><Link className="button" href="/contact">Обсудить набор →</Link><Link className="text-link" href="#master-brand">Как это связано с Mimicry</Link></div>
          </div>
          <Placeholder title="[Фото реализованного набора]">
            <p>Нужны: реальные предметы, упаковка, тираж, сроки и право показа бренда.</p>
          </Placeholder>
        </div>
      </section>

      <section className="proof-strip">
        <div className="container proof-grid">
          <div><strong>Идея</strong><p>Набор связан с ролью сотрудника и моментом onboarding.</p></div>
          <div><strong>Система</strong><p>Тексты, дизайн, упаковка и предметы говорят на одном языке.</p></div>
          <div><strong>Производство</strong><p>Тираж, образцы, печать и логистика фиксируются в scope.</p></div>
          <div className="proof-gap"><strong>[Кейс / срок]</strong><p>Добавить после проверки конкретного проекта.</p></div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="Три сценария покупки" title="Начать можно узко — продолжить по логике задачи" />
          <div className="product-tiers">
            <article><span className="micro-label">01 · отдельно</span><h3>Welcome-pack</h3><ul><li>идея и состав</li><li>тексты и дизайн</li><li>упаковка и производство</li><li>логистика по согласованию</li></ul></article>
            <article><span className="micro-label">02 · внутри решения</span><h3>Onboarding-сценарий</h3><ul><li>путь нового сотрудника</li><li>контент и задания</li><li>digital-точка входа</li><li>набор как физическое продолжение</li></ul></article>
            <article><span className="micro-label">03 · следующий масштаб</span><h3>HR-brand-активация</h3><ul><li>кампания вокруг EVP</li><li>событие или серия точек опыта</li><li>контент, digital и мерч</li><li>единый запуск</li></ul></article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container two-column">
          <div>
            <SectionHeading eyebrow="Что нужно на старте" title="Не длинный бриф, а четыре вводные" />
            <ol className="number-list"><li>Кому и в какой момент вручается набор.</li><li>Какую мысль он должен продолжить.</li><li>Тираж, география и желаемый срок.</li><li>Что уже определено по бренду и закупке.</li></ol>
          </div>
          <div className="warning-box"><h3>Что нельзя обещать до оценки</h3><ul><li>точную цену без состава и тиража;</li><li>срок без образцов и проверки производства;</li><li>любую доставку и персонализацию без логистического контура;</li><li>публичный кейс без разрешения клиента.</li></ul></div>
        </div>
      </section>

      <section className="section" id="master-brand">
        <div className="container bridge">
          <span className="eyebrow">Переход к мастер-бренду</span>
          <h2>Mimicry создаёт не только мерч. Мы собираем спецпроекты для сотрудников.</h2>
          <p>Если набор связан с onboarding, EVP, событием или внутренней кампанией, его можно встроить в общую коммуникационную логику — от смысла до запуска.</p>
          <p><Link className="text-link" href="/solutions/hr-brand">Смотреть HR-brand-активацию →</Link> · <Link className="text-link" href="/">Кто такая Mimicry →</Link></p>
        </div>
      </section>

      <section className="section">
        <div className="container faq-list">
          <SectionHeading eyebrow="FAQ для поиска и продажи" title="Короткие ответы без выдуманных условий" />
          <details><summary>Какой минимальный тираж?</summary><p>[Запросить у команды и производственных партнёров. В прототипе число не придумывается.]</p></details>
          <details><summary>Сколько занимает разработка?</summary><p>Срок зависит от состава, образцов, тиража и логистики. На рабочей странице нужен проверенный диапазон и критический путь.</p></details>
          <details><summary>Можно ли сделать только дизайн?</summary><p>Да, если границы ответственности за производство и тестовые образцы зафиксированы заранее.</p></details>
        </div>
      </section>
      <PageCta title="Обсудить welcome-pack или onboarding" text="Для старта нужны аудитория, момент вручения, тираж и срок. Остальной scope соберём после короткого разговора." />
    </Shell>
  );
}
