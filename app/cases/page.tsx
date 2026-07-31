import Link from "../link";
import { Breadcrumbs, PageCta, SectionHeading, Shell } from "../components";

export default function CasesPage() {
  return (
    <Shell>
      <Breadcrumbs items={[{ label: "Кейсы" }]} />
      <section className="page-hero">
        <div className="container page-hero-grid">
          <div>
            <span className="eyebrow">Proof system</span>
            <h1>Кейсы: не галерея красивых носителей, а доказательство роли и результата.</h1>
            <p>На первом запуске нужны минимум три кейса: изменения/внутриком, обучение/игра и event. Ниже — карта готовности, а не выдуманное портфолио.</p>
          </div>
          <aside className="outcome-box"><span className="micro-label">Правило публикации</span><strong>Нет подтверждения реализации или разрешения — нет публичного кейса.</strong></aside>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="Статус" title="Что можно превратить в кейсы после проверки" />
          <table className="status-table">
            <thead><tr><th>Материал</th><th>Что есть</th><th>Что отсутствует</th><th>Статус</th></tr></thead>
            <tbody>
              <tr><td>X5 Tech</td><td>Концепции ДР и Family Day; макеты игры, стикеров, фотозоны, навигации, капкейков</td><td>Факт реализации, финальные материалы, результат, отзыв, разрешение бренда</td><td className="status-missing">Проверить</td></tr>
              <tr><td>Learning / game</td><td>Компетенции, продуктовая формулировка, механики</td><td>Конкретный клиент, пилот, методология, результат, follow-up</td><td className="status-missing">Запросить</td></tr>
              <tr><td>Change / internal comms</td><td>Стратегический fit и процессная модель</td><td>Публичный проект с ролью и измеримым результатом</td><td className="status-missing">Критический пробел</td></tr>
              <tr><td>SFA / GEO</td><td>Коммерческая и аналитическая презентация; proof-примеры</td><td>Роль Mimicry, статус клиента, права, связь с мастер-позиционированием</td><td className="status-missing">Не использовать без сверки</td></tr>
            </tbody>
          </table>
          <p style={{ marginTop: 24 }}><Link className="button" href="/cases/change-project">Открыть шаблон отдельного кейса →</Link></p>
        </div>
      </section>
      <PageCta title="Соберите факты до визуального дизайна кейсов" text="Сильная сетка и фотография не заменят роль Mimicry, наблюдаемый результат и разрешение клиента." />
    </Shell>
  );
}
