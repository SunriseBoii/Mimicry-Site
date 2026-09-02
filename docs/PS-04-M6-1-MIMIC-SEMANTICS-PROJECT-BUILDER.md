# PS-04.M6.1 — семантика Mimic для главы «Собрать проект»

Дата исследования: 2026-09-02  
Статус документа: **RESEARCH COMPLETE / PROPOSED SEMANTIC CONTRACT**  
Назначение: входной контракт для реализации PS-04.M6.1 после завершения и human PASS этапа PS-04.M6.0.

Этот документ определяет, **что означает состояние Mimic** на экранах `03.1`, `03.2`, `03.3`, `03.3A` и `03.3B`. Он не является production approval, deploy approval или разрешением менять утверждённый M5.5 payload.

---

## 1. Решение в одном абзаце

В главе «Собрать проект» Mimic не должен буквально изображать «изменения», «обучение», «культуру» или выбранную кнопку. Он показывает, насколько клиентский запрос уже собран:

```text
03.1 — потенциальная система до определения состава
03.2 — выбранные компетенции собираются в равноправную композицию
03.3 — подтверждённая композиция получает направленность к запуску
```

Итоговая формула:

```text
MASTER → GATHER(selected competencies) → DRIVE(confirmed competencies)
```

При выборе одной компетенции используется её утверждённый `SINGLE`, потому что одну компетенцию невозможно честно показать как «сборку нескольких потоков».

---

## 2. Основание исследования

Контракт собран по следующим зафиксированным материалам проекта:

- `mimicry-homepage-topology-checkpoint-2026-08-29.md`;
- `mimicry_positioning_visual_field_2026-07-31.md`;
- `mimicry_site_ia_prototype_spec_2026-07-31.md`;
- `mimicry_photonic_skin_ps02_5_spec_2026-08-03.md`;
- `PS-03-M3-1-FINAL-REPORT.md`;
- фактический M5.5 promoted manifest на 154 endpoint-state;
- M5.6 route evidence для `03.1 → 03.2`, Event+Video и production binding.

Жёсткие исходные решения:

- одна homepage и один persistent Mimic;
- один Canvas, один actor, один draw в settled actor-state;
- `03.1 → 03.2 → 03.3` — динамически раскрываемый горизонтальный блок;
- задачи не получают competency colors;
- состав выбирается из семи компетенций;
- `03.3A` и `03.3B` — временные состояния поверх Brief, а не отдельные route screens;
- разблокировка `03.2` и `03.3` в сессии монотонна;
- M5.5 payload, persistent identity, camera, framing и палитра остаются frozen до отдельного promotion;
- M6.1 не решает материал светлой темы, rapid-scroll scheduler или очистку остаточных точек.

---

## 3. Главное смысловое разделение

В конструкторе есть три независимые оси. Их нельзя смешивать.

| Ось | Что описывает | Влияет на геометрию | Влияет на цвет |
|---|---|---:|---:|
| `task` | Клиентская ситуация и текст будущего брифа | Нет напрямую | Нет |
| `phase` | Степень сборки запроса: potential / gather / drive | Да | Нет напрямую |
| `competencies` | Фактический состав проекта | Да | Да, строго выбранными цветами |

### Почему задача не равна morph-mode

Назначать четыре задачи непосредственно на `FOCUS`, `GATHER` или `DRIVE` не следует:

1. Одна клиентская ситуация почти всегда содержит все три шага — понять смысл, собрать участие и довести до действия.
2. Такое назначение ложно упростило бы, например, обучение до одного `FOCUS` или одного `DRIVE`.
3. Две разные задачи неизбежно получили бы один morph-mode и казались бы искусственно одинаковыми.
4. Задачи не имеют собственных цветов и не должны создавать скрытую вторую таксономию.
5. Формула бренда `смысл → участие → запуск` лучше описывает последовательность самого конструктора, а не четыре типа клиента.

Следовательно:

```text
task определяет содержание запроса;
phase определяет композиционное намерение Mimic;
competencies определяют видимые предметные вклады и палитру.
```

---

## 4. Канонические task IDs

| UI-текст | Стабильный ID | Смысл для брифа |
|---|---|---|
| Объяснить изменения. | `explain_changes` | Сделать тему понятной и связать её со следующим шагом |
| Вовлечь и объединить. | `engage_and_unite` | Создать общее поле участия и совместного действия |
| Обучить и помочь освоить новое. | `learn_and_practice` | Перевести информацию в освоение и применение |
| Познакомить с компанией и культурой. | `company_and_culture` | Дать контекст, принадлежность и понятный вход в культуру |

Правила:

- task ID входит в brief model и аналитику;
- task ID не выбирает competency color;
- task ID не выбирает `SINGLE`;
- task ID не меняет geometry resolver при неизменных `screen + competency set`;
- порядок и формулировки могут позже уточняться как copy, но стабильные IDs должны сохраниться либо мигрироваться явно.

---

## 5. Семантика по экранам

| Экран / состояние | Семантический смысл | Settled geometry | Palette |
|---|---|---|---|
| `03.1`, задача не выбрана | Потенциал до конкретного запроса | `master-neutral` | Все 7 frozen colors |
| `03.1`, задача выбрана | Запрос сфокусирован текстом, но состав ещё неизвестен | Всё ещё `master-neutral` | Без изменений |
| `03.2`, выбрано 0 компетенций | Открыто поле возможного состава | `master-neutral` | Все 7 colors; не считать их выбранными |
| `03.2`, выбрана 1 компетенция `c` | Один самостоятельный модуль | `single-{c}` | Только цвет `c` |
| `03.2`, выбрано 2–7 компетенций `S` | Равноправная сборка выбранных модулей | `complex-gather-{S}` | Только цвета `S` |
| `03.3`, подтверждена 1 компетенция `c` | Зафиксированный single-модуль | `single-{c}` | Только цвет `c` |
| `03.3`, подтверждено 2–7 компетенций `S` | Собранная система готова двигаться к запуску | `complex-drive-{S}` | Только цвета `S` |
| `03.3A`, контактная форма | Контактный слой поверх подтверждённого решения | Сохраняется endpoint `03.3` | Без изменений |
| `03.3B`, успех | Заявка принята; конфигурация не исчезает | Сохраняется endpoint `03.3` | Без MASTER/all-seven flash |

### Почему `03.1` остаётся MASTER после выбора задачи

Выбранная задача ещё не сообщает, какие компетенции войдут в проект. Полный `FOCUS`-endpoint до выбора состава либо выдумал бы невыбранные предметные вклады, либо потребовал бы абстрактную форму, отсутствующую в утверждённом registry. `MASTER` здесь честно означает «потенциал уже направлен задачей, но ещё не собран в состав».

Разрешён короткий DOM/material acknowledgement выбора, но он:

- не меняет semantic state ID;
- не назначает задаче цвет;
- не меняет camera, framing, slot или model scale;
- не запускает демонстрационный morph.

---

## 6. Канонический resolver

```ts
type TaskId =
  | 'explain_changes'
  | 'engage_and_unite'
  | 'learn_and_practice'
  | 'company_and_culture'

type BuilderScreen = '03.1' | '03.2' | '03.3' | '03.3A' | '03.3B'

type Competency =
  | 'content'
  | 'design'
  | 'digital'
  | 'event'
  | 'games'
  | 'merch'
  | 'video'

function resolveBuilderState(input: {
  screen: BuilderScreen
  draftCompetencies: Competency[]
  confirmedCompetencies: Competency[] | null
}): string {
  if (input.screen === '03.1') return 'master-neutral'

  const source = input.screen === '03.2'
    ? input.draftCompetencies
    : input.confirmedCompetencies ?? []

  const S = canonicalizeCompetencySet(source)

  if (S.length === 0) return 'master-neutral'
  if (S.length === 1) return `single-${S[0]}`

  if (input.screen === '03.2') {
    return `complex-gather-${S.join('-')}`
  }

  return `complex-drive-${S.join('-')}`
}
```

`canonicalizeCompetencySet` обязан:

- удалить дубликаты;
- не зависеть от последовательности кликов;
- использовать frozen canonical state order:

```text
content → design → digital → event → games → merch → video
```

UI-порядок кнопок не обязан совпадать с техническим порядком state ID и не должен из-за этого меняться.

### Детерминизм

Одинаковые `screen + competency set` всегда дают один и тот же state ID и hash независимо от:

- порядка выбора кнопок;
- переходов назад/вперёд;
- mouse / keyboard / touch;
- Light / Dark;
- viewport и DPR;
- reload после восстановления session state.

---

## 7. Draft и confirmed — разные состояния данных

Конструктор должен хранить две версии конфигурации:

```ts
draft = {
  taskId,
  competencies,
  revision
}

confirmed = {
  taskId,
  competencies,
  resolvedStateId,
  stateHash,
  revision
}
```

Правила:

1. `03.2` всегда показывает `draft`.
2. Подтверждение на `03.2` атомарно копирует `draft` в `confirmed`, генерирует Brief и открывает `03.3`.
3. `03.3`, `03.3A` и `03.3B` всегда показывают `confirmed`.
4. Если пользователь вернулся и изменил draft, старый Brief становится `stale`, но подтверждённая конфигурация не меняется до нового confirm.
5. Редактирование текста Brief не меняет geometry, palette или state hash.
6. Повторный confirm создаёт новую revision без MASTER flash.
7. Смена задачи может сохранять выбранные компетенции как draft, но должна пометить Brief как `stale`.

Это исключает ситуацию, когда незавершённый клик в `03.2` незаметно меняет уже сформированный Brief в `03.3`.

---

## 8. Hover, focus и touch

### Task controls на `03.1`

- hover/focus показывается средствами DOM;
- Mimic не получает task-specific geometry или color;
- task preview не публикует route target;
- click/Enter/Space подтверждает task и разблокирует `03.2`;
- на touch нет искусственного hover.

### Competency controls на `03.2`

До click допустим только ephemeral preview:

```text
target = single-{hovered competency}
geometry influence <= 12%
palette preview intensity <= 35%
rotation bias <= 1°
position / scale / camera / framing unchanged
```

Keyboard focus получает тот же preview. На touch выбор сразу становится draft selection. Preview:

- не изменяет draft;
- не изменяет confirmed;
- не остаётся после blur/pointerleave;
- не может заменить подтверждённый state;
- не создаёт новый geometry ID в settled HUD.

### Selection commit

Click/Enter/Space меняет draft и переводит Mimic в новый exact endpoint. Это осознанное действие внутри уже settled screen, а не реакция на промежуточный scroll.

---

## 9. Цветовой контракт

Frozen competency colors:

| Competency | Hex |
|---|---|
| Content | `#4C7AFF` |
| Design | `#9E64EE` |
| Event | `#F86927` |
| Games | `#76A713` |
| Video | `#E34992` |
| Digital | `#009FAC` |
| Merch | `#D5A200` |

Правила:

- задача никогда не получает собственный цвет;
- `MASTER` сохраняет все семь frozen anchors;
- `SINGLE(c)` показывает только цвет `c`;
- `GATHER(S)` и `DRIVE(S)` показывают только выбранные colors `S`;
- пустые anchors остаются нейтральными;
- выбранные цвета не смешиваются в новый hue;
- порядок выбора не переставляет competency ownership;
- Light / Dark меняют material response, но не semantic palette membership;
- `03.3A/B` не дают success-green, all-seven flash или смену geometry через Mimic.

---

## 10. Критический результат аудита 154-state inventory

Текущий promoted registry нельзя молча использовать как полное множество состояний конструктора.

Фактическое покрытие M5.5:

- `MASTER`: 1;
- `SINGLE`: 7;
- `FOCUS`: exact combinations cardinality 2–6, но с ограниченным lead inventory; full-set FOCUS отсутствует;
- `GATHER`: только пять complex prefix-set для cardinality 2–6 и один `BRAND_WIDE` all-seven;
- `DRIVE`: только пять complex prefix-set для cardinality 2–6 и один `BRAND_WIDE` all-seven.

UI разрешает любое непустое подмножество семи компетенций:

```text
2^7 - 1 = 127 selections
7 SINGLE selections
120 multi-competency selections
```

Для главы нужны exact project states:

```text
120 GATHER endpoints
120 DRIVE endpoints
```

В текущем registry существуют только по 5 project-complex endpoint каждого режима. `BRAND_WIDE` all-seven нельзя без явного контракта выдавать за project-complex state.

Следовательно, M6.1 должен закрыть:

```text
115 новых semantic IDs GATHER
115 новых semantic IDs DRIVE
= 230 новых project-complex definitions
```

Из них:

- 228 требуют exact selected-set authoring для отсутствующих combinations cardinality 2–6;
- два all-seven project-complex definitions могут повторно использовать проверенную geometry соответствующего `BRAND_WIDE GATHER/DRIVE` только если component, palette, role и presentation contracts подтверждены; иначе они также пересобираются.

### Запрещённые fallback

Нельзя:

- подставлять ближайший prefix-set;
- добавлять не выбранные пользователем компетенции;
- молча заменять `GATHER` или `DRIVE` на `FOCUS`;
- использовать click order как скрытый state selector;
- применять runtime Event/Video overlays;
- показывать all-seven `BRAND_WIDE` для произвольного selected set;
- считать neutral palette равнозначной отсутствующему geometry endpoint.

Если exact state отсутствует, machine verdict M6.1 должен быть `FAIL / STATE COVERAGE INCOMPLETE`.

---

## 11. Рекомендуемая authoring-архитектура M6.1

### Delta, а не копия M5.5

Создать отдельный versioned delta namespace:

```text
public/photonic-skin/ps-04-m6-1/
design/photonic-skin/ps-04-m6-1/
```

Он должен содержать:

- 230 новых project-complex definitions;
- только необходимые новые buffers;
- mapping на frozen `master-neutral` и 7 `single-*` из M5.5;
- builder resolver manifest;
- hashes, component maps, identity/LOD proof;
- versioned test/evidence reports.

Не создавать вторую полную копию M5.5 payload, если delta manifest может безопасно ссылаться на immutable M5.5 assets.

### Offline deterministic build

Использовать frozen M3.1/M5.5 assembly descriptors и donors:

```text
selected competency emblems
+ exact selected set
+ GATHER or DRIVE solver
+ M5.5 Event/Video donors
+ frozen identity/LOD/palette contracts
→ exact builder endpoint
```

Требования:

- authoring offline, не runtime overlay;
- один deterministic result на set/mode;
- Event = `EVENT_A_R2`;
- Video = `VIDEO_COMBO_40_R1`;
- unaffected competency emblems не заменяются;
- persistent IDs не перенумеровываются;
- N = 16384, stride = 40;
- все 7 LOD prefixes сохраняются;
- один actor / one InstancedMesh / one material / one program / one draw;
- camera, FOV, presentation slot и M5.5 framing не меняются.

### Изолированный review route

Рекомендуемые routes:

```text
/visual-lab/photonic-skin-ps04-m6/project-builder-semantics
/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/review
```

Чистый route показывает настоящий block 03 без HUD. Review route может показывать task, phase, draft, confirmed, resolved state ID/hash, palette mask и source namespace.

Production `/` в M6.1 не менять.

---

## 12. Motion boundary

M6.1 определяет **целевые semantic endpoints**, но не переписывает scroll scheduler.

В M6.1:

- используются существующие M5.1 coordinator/clock и reduced-motion semantics;
- `PALETTE_DELAY_FRACTION`, C2 curves и camera/framing остаются frozen;
- route morph не запускается из task hover;
- competency click может менять endpoint, потому что это явное действие на settled `03.2`;
- `03.3A/B` не запускают новый morph;
- retarget не вставляет MASTER между текущим и новым target.

Правило «трансформация только после устойчивой фиксации на screen» и поведение незавершённой трансформации при быстром scroll относятся к отдельному motion/optimization этапу. M6.1 не должен преждевременно выбирать его архитектуру.

---

## 13. Accessibility и reduced motion

- Semantic content полностью присутствует в DOM; Mimic не является единственным носителем смысла.
- Task и competency controls доступны с keyboard.
- `aria-pressed` отражает competency draft selection.
- `aria-current` и graph unlock сохраняют topology contract.
- Reduced motion: target geometry публикуется атомарно, palette crossfade остаётся в frozen допустимом режиме.
- Static mode: hover/focus не меняет 3D; используются DOM states.
- На touch отсутствует fake hover.
- Brief и contact form работают при WebGL fallback.

---

## 14. Обязательная test matrix

### Resolver

Проверить:

- 4 task IDs;
- empty set;
- все 7 singleton sets;
- все 120 multi-competency sets;
- `03.2` = GATHER для каждого multi-set;
- `03.3/03.3A/03.3B` = DRIVE для каждого confirmed multi-set;
- одинаковый результат для всех permutations одного set;
- task не меняет geometry ID или palette при том же screen/set;
- draft не протекает в confirmed до confirm.

### Asset integrity

- 230/230 required new definitions существуют;
- exact selected competencies = component owners endpoint;
- no unselected owners;
- Event/Video donor hashes exact;
- all values finite;
- persistent identity, stride и LOD preserved;
- palette mask exact;
- M5.5 payload hashes unchanged;
- no overlays/runtime rotations;
- deterministic rebuild hashes stable.

### Runtime

- one Canvas, one actor, one draw settled;
- no third geometry during transition;
- no MASTER/all-seven flash on confirm, reverse, contact or success;
- Back/Forward, reload, resize, DPR, context restore;
- Light/Dark;
- keyboard and touch;
- reduced/static;
- responsive 1920×1080, 1440×900, 1280×720, 390×844;
- production `/` остаётся неизменным и не запрашивает M6.1 namespace.

### Human boards

Минимум:

1. `03.1` before/after task selection;
2. `03.2` empty / one / two / four / seven competencies;
3. один и тот же set в GATHER и DRIVE;
4. representative sets без Content/Design;
5. Event+Video;
6. Games+Merch+Video;
7. all seven;
8. Light/Dark;
9. desktop/mobile;
10. reverse and edit-after-confirm.

---

## 15. Human review questions

Владелец должен проверить:

1. Считывается ли `03.1` как потенциал до сборки, а не как случайный предмет?
2. Не создают ли четыре задачи ложные отдельные цвета или literal icons?
3. Выглядит ли `03.2 GATHER` как равноправная сборка только выбранных компетенций?
4. Читается ли одна выбранная компетенция как самостоятельный `SINGLE`?
5. Отличается ли `03.3 DRIVE` от `03.2 GATHER` как «собрано и направлено к запуску»?
6. Не появляются ли невыбранные предметы в arbitrary combinations?
7. Сохраняются ли Event A-R2 и Video combo-40-r1 в complex states?
8. Не меняет ли редактирование Brief композицию Mimic?
9. Корректно ли разделены draft и confirmed при возврате назад?
10. Нет ли MASTER flash при повторном confirm?
11. Работает ли тот же смысл на mobile и в reduced motion?
12. Остался ли production `/` неизменным на этапе review?

---

## 16. Что не входит в M6.1

- материал чешуек в Light theme;
- новый rapid-scroll scheduler;
- правило «дотрансформироваться или удержать состояние»;
- исправление точек/пыли в Video, Games и Merch SINGLE;
- редизайн структуры, текстов и UX всей homepage;
- backend отправки Brief;
- production swap, deploy или закрытие PS-04.

---

## 17. Критерий завершения M6.1

Machine status может быть только:

```text
PS-04.M6.1 — MACHINE PASS /
HUMAN PROJECT-BUILDER SEMANTICS REVIEW REQUIRED
```

Он допустим, только если:

- resolver покрывает все 127 non-empty competency selections;
- ни один unsupported set не получает fallback;
- GATHER/DRIVE semantic difference видима и проверена;
- draft/confirmed contract работает;
- M5.5 и M6.0 baseline не изменены вне разрешённого isolated delta;
- production `/` не переключён на M6.1;
- push/deploy не выполнялись.

Human PASS M6.1 разрешает перейти к отдельному M6.2, но сам по себе не является production или deploy approval.

---

## 18. Финальная формула

```text
Задача отвечает: «зачем нужен проект?»
Компетенции отвечают: «из чего он собирается?»
Фаза отвечает: «насколько он уже готов?»

03.1 MASTER = потенциал
03.2 GATHER = сборка
03.3 DRIVE = запуск
```

Mimic остаётся не каталогом иконок, а единым живым индикатором того, как разрозненный запрос превращается в собранный проект.
