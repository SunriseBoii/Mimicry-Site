import Link from "../link";
import { SiteShell } from "../_site/SiteShell";
import { Breadcrumbs, PageCta, SectionHeading } from "../components";

const rows = [
  ["Карточка компании и реквизиты", "Подготовить", "Публично или по запросу — решить с юристом"],
  ["Типовой договор / NDA", "Подготовить", "По запросу"],
  ["Референсы клиентов", "Собрать", "Только с разрешением"],
  ["Resource plan и старшие роли", "Актуализировать", "Для capability check"],
  ["Правила изменения scope", "Зафиксировать", "В КП и договоре"],
  ["Политика обработки данных", "Критично", "До запуска формы"],
  ["ИБ / интеграции digital", "Описать процесс оценки", "Проектно-зависимо"],
];

export default function ProcurementPage() {
  return (
    <SiteShell>
      <Breadcrumbs items={[{ label: "Закупкам" }]} />
      <section className="page-hero">
        <div className="container page-hero-grid">
          <div><span className="eyebrow">Shortlist и аккредитация</span><h1>Понятный предмет закупки, роли и документы — без поиска по презентациям.</h1><p>Эта страница помогает сравнить scope, проверить поставщика и быстро получить недостающий пакет у одного ответственного контакта.</p></div>
          <aside className="outcome-box"><span className="micro-label">Предмет</span><strong>Корпоративные коммуникационные спецпроекты: концепция, материалы, production и проектное управление в согласованном объёме.</strong></aside>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="Документы" title="Статус минимального procurement pack" text="Прототип не создаёт несуществующие файлы и не показывает фиктивные ссылки на скачивание." />
          <table className="status-table"><thead><tr><th>Материал</th><th>Статус</th><th>Доступ</th></tr></thead><tbody>{rows.map(([name,status,access]) => <tr key={name}><td>{name}</td><td className="status-missing">{status}</td><td>{access}</td></tr>)}</tbody></table>
        </div>
      </section>

      <section className="section">
        <div className="container two-column">
          <div><SectionHeading eyebrow="Capability check" title="Что проверить до тендера" /><ol className="number-list"><li>Задача, аудитория, дата и география.</li><li>Роль Mimicry и границы production.</li><li>Партнёры, резерв и старшие ответственные.</li><li>ИБ, данные, интеграции и разрешения.</li><li>Смета, допработы и точки согласования.</li></ol></div>
          <div className="placeholder"><span className="placeholder-label">Контакт для закупок</span><strong>[ФИО / роль / общий email / телефон]</strong><p>Нужен ответственный, который может выдать документы и согласовать capability check.</p><p><Link className="text-link" href="/contact">Перейти к контактам →</Link></p></div>
        </div>
      </section>

      <section className="section"><div className="container faq-list"><SectionHeading eyebrow="FAQ" title="Вопросы, которые должны закрываться до созвона" /><details><summary>Работаете ли вы по NDA?</summary><p>[Подтвердить юридический процесс и типовой документ.]</p></details><details><summary>Кто отвечает за подрядчиков и изменения сметы?</summary><p>В рабочей версии страницы нужен конкретный процесс, матрица ответственности и правила change request.</p></details><details><summary>Как оценивается digital и ИБ?</summary><p>После сценария и состава данных; сложные интеграции требуют отдельного технического и партнёрского контура.</p></details></div></section>
      <PageCta title="Запросить procurement pack" text="После подготовки документов этот CTA должен вести к отдельному ответственному контакту и фиксироваться в CRM." />
    </SiteShell>
  );
}
