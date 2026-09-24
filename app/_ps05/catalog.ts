import { competenceOrder, competenceMeta, type CompetenceId } from '../_brand/color-system';
import type { BuilderTaskId } from '../visual-lab/photonic-skin-ps04-m6/project-builder-semantics/builder-ids';

export type WorkExample = { id: string; title: string; result: string; contexts: readonly BuilderTaskId[] };
export type Capability = { id: CompetenceId; name: string; result: string; thesis: string; phrase: string; color: string; status: 'editorial-draft'; examples: WorkExample[] };
const allTasks: BuilderTaskId[] = ['explain_changes', 'engage_and_unite', 'learn_and_practice', 'company_and_culture'];
function capability(id: CompetenceId, result: string, thesis: string, phrase: string, examples: [string, string][]): Capability {
  return { id, name: competenceMeta[id].label, result, thesis, phrase, color: `var(--competence-${id})`, status: 'editorial-draft', examples: examples.map(([title, result], i) => ({ id: `${id}-${i + 1}`, title, result, contexts: allTasks })) };
}
export const CAPABILITIES: Record<CompetenceId, Capability> = {
  content: capability('content', 'Находим слова для сложных тем.', 'Тексты и редакционные форматы', 'тексты и редакционные материалы', [
    ['Тексты кампании', 'Связывают сообщения в последовательный рассказ.'], ['Статьи и интервью', 'Объясняют тему через факты и голоса людей.'], ['Сценарии', 'Дают содержательную основу выступлению или ролику.'], ['Рассылки и коммуникации', 'Помогают донести сообщение до нужной аудитории.'], ['Инструкции и гайды', 'Превращают сложную информацию в понятные шаги.'],
  ]),
  design: capability('design', 'Делаем идею узнаваемой.', 'Визуальная система и носители', 'визуальную систему и оформление материалов', [
    ['Ключевой образ', 'Задаёт визуальный язык проекта.'], ['Оформление кампании', 'Объединяет разные точки контакта.'], ['Презентации', 'Выстраивают аргументы в ясную визуальную историю.'], ['Навигация', 'Помогает ориентироваться в пространстве и информации.'], ['Печатные и digital-материалы', 'Адаптируют визуальную идею к нужным носителям.'],
  ]),
  event: capability('event', 'Создаём опыт, который объединяет.', 'Организация мероприятия', 'концепцию и организацию мероприятия', [
    ['Концепция и программа', 'Связывают цель события с опытом участников.'], ['Координация подготовки', 'Собирает участников производства вокруг общего плана.'], ['Формат события', 'Определяет, как люди встречаются и взаимодействуют.'], ['Активности участников', 'Дают возможность включиться в происходящее.'], ['Коммуникация события', 'Поддерживает контакт до, во время и после встречи.'],
  ]),
  games: capability('games', 'Обучаем через игру и действие.', 'Игровые механики и форматы', 'игровые механики и задания', [
    ['Квиз или квест', 'Вовлекает в исследование темы через задания.'], ['Настольная игра', 'Создаёт пространство для совместного опыта.'], ['Обучающая игра', 'Позволяет попробовать знания на практике.'], ['Командные задания', 'Помогают действовать сообща.'], ['Сценарии вовлечения', 'Дают понятную цель и обратную связь участникам.'],
  ]),
  video: capability('video', 'Рассказываем истории в движении.', 'Съёмка и видеоконтент', 'съёмку и видеоматериалы', [
    ['Съёмка', 'Собирает визуальный материал для истории проекта.'], ['Интервью', 'Даёт слово людям, связанным с темой.'], ['Монтаж', 'Выстраивает материал в понятную историю.'], ['Анимация', 'Помогает показать идеи и процессы.'], ['Видео события', 'Сохраняет и развивает содержание мероприятия, если оно входит в задачу.'],
  ]),
  digital: capability('digital', 'Соединяем людей в цифровой среде.', 'Сайты и интерактивные решения', 'сайт или интерактивное digital-решение', [
    ['Лендинг или сайт', 'Собирает информацию и следующий шаг в одном месте.'], ['Digital-активация', 'Вовлекает аудиторию в цифровой опыт.'], ['Интерактивный формат', 'Позволяет исследовать содержание через действие.'], ['Проектное веб-приложение', 'Поддерживает конкретный сценарий взаимодействия.'], ['Регистрация на событие', 'Помогает организовать участие, когда задача связана с мероприятием.'],
  ]),
  merch: capability('merch', 'Передаём идею через предметы.', 'Подарки и брендированные наборы', 'подарки и брендированные наборы', [
    ['Подарки', 'Передают идею проекта через предметы.'], ['Welcome pack', 'Помогает познакомиться с компанией.'], ['Брендированные предметы', 'Продолжают коммуникацию в повседневной жизни.'], ['Упаковка', 'Объединяет предметы и первое впечатление.'], ['Наборы участников', 'Поддерживают опыт мероприятия, когда это часть задачи.'],
  ]),
};
export const TASKS: Record<BuilderTaskId, { title: string; description: string; goal: string; examples: string[] }> = {
  explain_changes: { title: 'Объяснить изменения', description: 'Помочь разобраться в новом процессе, продукте или правилах.', goal: 'Хотим объяснить изменения и помочь разобраться в новом.', examples: ['Разобраться в новом', 'Объяснить простым языком', 'Помочь применить изменения'] },
  engage_and_unite: { title: 'Вовлечь и объединить', description: 'Дать людям общий опыт и повод участвовать.', goal: 'Хотим вовлечь и объединить аудиторию проекта.', examples: ['Общий опыт', 'Участие в событии', 'Совместная активность'] },
  learn_and_practice: { title: 'Обучить и помочь освоить новое', description: 'Превратить информацию в понятную практику.', goal: 'Хотим помочь освоить новое и применить знания на практике.', examples: ['Понятный материал', 'Практическое задание', 'Закрепление навыка'] },
  company_and_culture: { title: 'Познакомить с компанией и культурой', description: 'Показать, как устроена компания и что её объединяет.', goal: 'Хотим познакомить людей с компанией и её культурой.', examples: ['Знакомство с компанией', 'Истории команды', 'Материалы для адаптации'] },
};
export const COMBINATION_RULES: { id: string; requires: CompetenceId[]; contexts: readonly BuilderTaskId[]; priority: number; text: string }[] = [
  { id: 'event-video', requires: ['event', 'video'], contexts: allTasks, priority: 1, text: 'Видеоматериалы могут продолжить историю мероприятия.' },
  { id: 'event-digital', requires: ['event', 'digital'], contexts: allTasks, priority: 2, text: 'Цифровая часть может поддержать регистрацию или взаимодействие вокруг события.' },
  { id: 'event-merch', requires: ['event', 'merch'], contexts: allTasks, priority: 3, text: 'Подарки можно связать с опытом участников события.' },
  { id: 'content-design', requires: ['content', 'design'], contexts: allTasks, priority: 4, text: 'Содержание и визуальный язык объединим в согласованные коммуникационные материалы.' },
  { id: 'games-digital', requires: ['games', 'digital'], contexts: allTasks, priority: 5, text: 'Игровую механику можно раскрыть в интерактивном формате.' },
  { id: 'video-digital', requires: ['video', 'digital'], contexts: allTasks, priority: 6, text: 'Видеоконтент может стать частью сайта или интерактивного проекта.' },
];
export const orderedCapabilities = (ids: readonly CompetenceId[]) => competenceOrder.filter(id => ids.includes(id));
export const briefBasis = (task: BuilderTaskId, ids: readonly CompetenceId[]) => `${task}:${orderedCapabilities(ids).join(',')}`;
export function generateBrief(task: BuilderTaskId, ids: readonly CompetenceId[]) {
  const selected = orderedCapabilities(ids);
  if (!selected.length) throw new Error('Brief requires a non-empty competency set');
  const rules = COMBINATION_RULES.filter(rule => rule.contexts.includes(task) && rule.requires.every(id => selected.includes(id))).sort((a,b) => a.priority-b.priority).slice(0, 2);
  const phrases = selected.map(id => CAPABILITIES[id].phrase);
  const directions = phrases.length === 1 ? phrases[0] : `${phrases.slice(0,-1).join(', ')}, а также ${phrases.at(-1)}`;
  return { text: `${TASKS[task].goal} Предварительно рассматриваем ${directions}.\n\n${rules.map(rule=>rule.text).join(' ')}${rules.length ? ' ' : ''}Конкретные форматы и объём работ уточним при обсуждении.`, basis: briefBasis(task, selected), competencies: selected, ruleIds: rules.map(rule=>rule.id) };
}
