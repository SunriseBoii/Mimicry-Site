import Link from "../link";
import { SiteShell } from "../_site/SiteShell";
import { Breadcrumbs, ModuleChips, PageCta, ProcessSteps, SectionHeading } from "../components";

export default function AboutPage() {
  return (
    <SiteShell>
      <Breadcrumbs items={[{ label: "О компании" }]} />
      <section className="page-hero">
        <div className="container page-hero-grid">
          <div>
            <span className="eyebrow">Mimicry group</span>
            <h1>Режиссируем и производим корпоративное действие.</h1>
            <p>Находим коммуникационную логику, собираем подходящие форматы и доводим замысел до реального контакта с сотрудниками — в согласованных границах проекта.</p>
          </div>
          <aside className="outcome-box"><span className="micro-label">Brand Core</span><strong>Смысл, участие, запуск.</strong></aside>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="Принципы" title="Собранная творческая работа без обещаний «сделать всё»" />
          <div className="three-column">
            <article className="info-card"><h3>Сначала задача</h3><p>Аудитория и следующий шаг определяются раньше формата.</p></article>
            <article className="info-card"><h3>Участие проектируется</h3><p>Не используем «вовлечение» как магическое слово без действия.</p></article>
            <article className="info-card"><h3>Границы названы</h3><p>Где нужен методолог, консультант, интегратор или production-партнёр — говорим заранее.</p></article>
          </div>
        </div>
      </section>

      <section className="section"><div className="container"><SectionHeading eyebrow="Способ" title="Одна система работы" /><ProcessSteps /></div></section>
      <section className="section"><div className="container"><SectionHeading eyebrow="Производственный контур" title="Модули подключаются под задачу" /><ModuleChips /></div></section>

      <section className="section">
        <div className="container trust-grid">
          <div><SectionHeading eyebrow="Команда" title="Показывать нужно роли и ответственность, а не только число людей" /><p>В карте 2026 зафиксированы 19 участников и 9 направлений. До публикации нужно актуализировать, кто находится в постоянном ядре, кто партнёр и кто несёт старшую ответственность по каждому типу проекта.</p></div>
          <div className="placeholder"><span className="placeholder-label">До публичного запуска</span><strong>[Роли, имена, фото, зона ответственности]</strong><p>Change/контент · Event · Learning/методология · Design · Digital · PM/account.</p></div>
        </div>
      </section>

      <section className="section">
        <div className="container warning-box"><h3>Что не обещаем</h3><ul><li>глубокий HR- и change-консалтинг без профильного эксперта;</li><li>enterprise-разработку и ИБ без интегратора;</li><li>любой масштаб event без capability check;</li><li>рост удержания, производительности или культуры одной активностью.</li></ul><p><Link className="text-link" href="/procurement">Процесс и закупочная информация →</Link></p></div>
      </section>
      <PageCta />
    </SiteShell>
  );
}
