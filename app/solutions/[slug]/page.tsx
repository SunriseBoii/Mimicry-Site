import Link from "../../link";
import { notFound } from "next/navigation";
import { SiteShell } from "../../_site/SiteShell";
import {
  Breadcrumbs,
  ModuleChips,
  PageCta,
  Placeholder,
  ProcessSteps,
  SectionHeading,
  SolutionNav,
  solutionData,
} from "../../components";

export function generateStaticParams() {
  return Object.keys(solutionData).map((slug) => ({ slug }));
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = solutionData[slug];
  if (!data) notFound();

  return (
    <SiteShell>
      <Breadcrumbs items={[{ label: "Решения", href: "/#solutions" }, { label: data.name }]} />
      <section className="page-hero">
        <div className="container page-hero-grid">
          <div>
            <span className="eyebrow">{data.eyebrow}</span>
            <h1>{data.title}</h1>
            <p>{data.intro}</p>
            <div className="hero-actions">
              <Link className="button" href="/contact">{data.cta} →</Link>
              <Link className="text-link" href="/cases/change-project">Посмотреть структуру кейса</Link>
            </div>
          </div>
          <aside className="outcome-box">
            <span className="micro-label">Непосредственный результат</span>
            <strong>{data.outcome}</strong>
          </aside>
        </div>
      </section>

      <section className="section-tight">
        <div className="container"><SolutionNav active={data.name} /></div>
      </section>

      <section className="section">
        <div className="container two-column">
          <SectionHeading eyebrow="Когда это нужно" title="Ситуации, в которых появляется бюджет и дедлайн" />
          <ol className="number-list">
            {data.when.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading
            eyebrow="Релевантный proof"
            title="Кейс должен стоять до полного состава решения"
            text="В публичной версии здесь нужен один подтверждённый кейс именно этой ситуации — с ролью Mimicry, результатом и исходными материалами."
          />
          <Placeholder title={`[Кейс: ${data.name.toLowerCase()} · клиент / отрасль / результат]`}>
            <p>Запросить: контекст, аудитории, срок, состав работ, что делал клиент/партнёры, непосредственные метрики, отзыв и право публикации.</p>
            <p><Link className="text-link" href="/cases/change-project">Открыть полный шаблон кейса →</Link></p>
          </Placeholder>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="Что входит" title="Состав решения определяется задачей, а не фиксированным пакетом" />
          <div className="four-column">
            {data.includes.map((item, index) => (
              <article className="info-card" key={item.title}>
                <span className="micro-label">0{index + 1}</span>
                <h3>{item.title}</h3><p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="Как работаем" title="Смысл → участие → запуск" />
          <ProcessSteps />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="Модули" title="Подключаем только те форматы, которые нужны маршруту" />
          <ModuleChips />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="Измерение" title="Фиксируем непосредственный эффект, а не присваиваем бизнес-результат" />
          <div className="metrics-grid">
            {data.metrics.map((metric, index) => <div className="metric" key={metric}><span>0{index + 1}</span>{metric}</div>)}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container warning-box">
          <h3>Границы решения</h3>
          <ul>{data.limits.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </section>

      <PageCta title={data.cta} text="Для capability check достаточно описать тему, аудиторию, срок и то, что уже определено внутри компании." />
    </SiteShell>
  );
}
