import Link from "../link";
import { Breadcrumbs, SectionHeading, Shell } from "../components";

export default function ContactPage() {
  return (
    <Shell>
      <Breadcrumbs items={[{ label: "Контакты" }]} />
      <section className="page-hero">
        <div className="container"><span className="eyebrow">Короткий старт</span><h1>Расскажите тему, аудиторию и срок. Формат определим после задачи.</h1><p>Рабочая версия формы должна отправлять данные в выбранный канал и CRM. В low-fi-прототипе отправка намеренно отключена.</p></div>
      </section>
      <section className="section">
        <div className="container contact-grid">
          <div>
            <SectionHeading eyebrow="Прямой контакт" title="Один понятный вход" />
            <div className="contact-card"><span className="micro-label">Нужно заполнить</span><strong>[Общий email]</strong><strong>[Телефон / Telegram]</strong><p>[Время ответа и ответственный]</p></div>
            <p>Для закупочных документов — отдельный маршрут.</p>
            <Link className="text-link" href="/procurement">Информация для закупок →</Link>
          </div>
          <form className="prototype-form">
            <div className="form-note"><strong>Прототип:</strong> поля проверяют объём и порядок. Данные не отправляются и не сохраняются.</div>
            <div className="field"><label htmlFor="task">Что нужно запустить?</label><select id="task" defaultValue=""><option value="" disabled>Выберите ситуацию</option><option>Изменение / внутренняя коммуникация</option><option>Событие</option><option>Игра / обучение</option><option>HR-brand-активация</option><option>Отдельный модуль</option></select></div>
            <div className="field"><label htmlFor="context">Коротко о теме и аудитории</label><textarea id="context" placeholder="Что происходит, для кого и какой следующий шаг нужен?" /></div>
            <div className="two-column">
              <div className="field"><label htmlFor="deadline">Срок / дата</label><input id="deadline" placeholder="Например: запуск в октябре" /></div>
              <div className="field"><label htmlFor="contact">Как связаться</label><input id="contact" placeholder="Рабочий email или телефон" /></div>
            </div>
            <button className="button" type="button" aria-describedby="prototype-submit-note">Отправить после подключения формы</button>
            <small id="prototype-submit-note">На этапе разработки: success state, privacy consent, anti-spam, routing и аналитика `brief_submit`.</small>
          </form>
        </div>
      </section>
    </Shell>
  );
}
