export function DoubleEntry() {
  return (
    <section data-double-entry aria-labelledby="photonic-double-entry-title">
      <div data-double-entry-heading>
        <span>02 / DOUBLE ENTRY</span>
        <h2 id="photonic-double-entry-title">Что вам нужно сейчас?</h2>
      </div>

      <nav aria-label="Две точки входа в проект Mimicry">
        <a id="project-route" href="#project-route" data-entry-card>
          <span data-entry-index>01</span>
          <strong>Собрать проект целиком</strong>
          <span data-entry-flow>
            задача сотрудников → контекст → формат → состав компетенций → кейсы
          </span>
          <span data-entry-arrow aria-hidden="true">↗</span>
        </a>
        <a id="competence-route" href="#competence-route" data-entry-card>
          <span data-entry-index>02</span>
          <strong>Подключить отдельную компетенцию</strong>
          <span data-entry-flow>
            компетенция → форматы и контексты → кейсы → дополнение компетенциями
          </span>
          <span data-entry-arrow aria-hidden="true">↗</span>
        </a>
      </nav>
    </section>
  );
}

