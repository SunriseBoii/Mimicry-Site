export const homeHero = {
  eyebrow: "Агентство корпоративных коммуникаций",
  title:
    "Собираем важные темы в проекты, которые сотрудники понимают и в которых участвуют.",
  text: "Коммуникационная логика, контент, дизайн, события, обучение, игры и digital — в одной системе от брифа до запуска.",
  primary: "Обсудить задачу",
  secondary: "Посмотреть структуру кейса",
} as const;

export const situations = [
  {
    code: "01",
    href: "/solutions/change",
    label: "Изменения",
    description:
      "Запуск стратегии, ценностей или сложной темы для разных групп сотрудников.",
  },
  {
    code: "02",
    href: "/solutions/event",
    label: "События",
    description:
      "Корпоративное событие, где программа и production работают на деловую функцию.",
  },
  {
    code: "03",
    href: "/solutions/learning",
    label: "Обучение",
    description:
      "Игра, симуляция или квест вокруг конкретной рабочей ситуации и поведения.",
  },
  {
    code: "04",
    href: "/solutions/hr-brand",
    label: "HR-brand",
    description:
      "Активация готового EVP через контент, onboarding, события, digital и носители.",
  },
] as const;

export const processSteps = [
  {
    label: "Смысл",
    description:
      "Разбираем тему, контекст, аудитории и следующий шаг. Только потом выбираем формат.",
    outcome: "Выход: рамка задачи, сообщения, критерии результата.",
    state: "complete" as const,
  },
  {
    label: "Участие",
    description:
      "Проектируем, что люди должны увидеть, понять, попробовать или сделать вместе.",
    outcome: "Выход: сценарий участия, механика, путь аудитории.",
    state: "current" as const,
  },
  {
    label: "Запуск",
    description:
      "Собираем контент, дизайн и production, ведём сроки и доводим проект до контакта с аудиторией.",
    outcome: "Выход: материалы, проведение, непосредственные метрики.",
    state: "upcoming" as const,
  },
] as const;

export const proofItems = [
  {
    title: "9 направлений",
    text: "Зафиксированы в карте компетенций 2026. Состав команды нужно актуализировать.",
  },
  {
    title: "Смысл + production + PM",
    text: "Контент, дизайн, event, игры, video, digital и физические носители.",
  },
  {
    title: "От брифа до запуска",
    text: "Операционное обещание в согласованном scope, без гарантии бизнес-метрик.",
  },
  {
    title: "[Логотипы / отзыв]",
    text: "Добавить только после разрешения и проверки публичного права.",
    status: "Требуется подтверждение",
  },
] as const;

export const evidenceItems = [
  {
    code: "CASE / 01",
    situation: "Изменения · [Клиент / отрасль / NDA]",
    title: "[Запуск стратегии или ценностей]",
    text: "Нужны: клиентский контекст, аудитории, роль Mimicry, следующий шаг и непосредственный результат.",
    status: "Факты и право публикации не подтверждены",
  },
  {
    code: "CASE / 02",
    situation: "Обучение · [Клиент / отрасль / NDA]",
    title: "[Кастомная игра или симуляция]",
    text: "Нужны: рабочее поведение, методология, пилот, роль ведущего и follow-up.",
    status: "Публичный проект требуется собрать",
  },
  {
    code: "CASE / 03",
    situation: "Event · [Клиент / отрасль / NDA]",
    title: "[Событие с деловой функцией]",
    text: "X5 Tech можно рассматривать только после подтверждения реализации и права публикации.",
    status: "Концепт не равен реализованному кейсу",
  },
] as const;

export const capabilities = [
  { code: "01", id: "content", title: "Контент", href: "/capabilities/content" },
  { code: "02", id: "design", title: "Дизайн", href: "/capabilities/design" },
  { code: "03", id: "event", title: "Event", href: "/capabilities/event" },
  { code: "04", id: "games", title: "Игры", href: "/capabilities/games" },
  { code: "05", id: "video", title: "Видео", href: "/capabilities/video" },
  { code: "06", id: "digital", title: "Digital", href: "/capabilities/digital" },
  {
    code: "07",
    id: "merch",
    title: "Мерч",
    href: "/capabilities/merch",
  },
] as const;

export const assemblySteps = [
  "Задача и аудитория",
  "Коммуникационная логика",
  "Нужные форматы",
  "Запуск",
] as const;

export const operations = [
  "Определяем задачу, аудитории и непосредственный результат.",
  "Фиксируем scope, роли Mimicry, клиента и партнёров.",
  "Показываем этапы, точки согласования и правила изменений.",
  "Заранее называем, где нужен методолог, интегратор или крупный production-партнёр.",
] as const;

export const procurementStatuses = [
  ["Карточка компании и реквизиты", "Подготовить"],
  ["Референсы клиентов", "Собрать с разрешением"],
  ["Политика обработки данных", "Критично до запуска формы"],
] as const;
