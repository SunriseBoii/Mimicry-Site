# PS-05.R1 — выбор задач и переходы

2026-09-24. Три дефекта воспроизведены и исправлены на основном `/`. Это результат проверки агентом, не HUMAN PASS владельца. По уточнению владельца «стрелки» в этом проходе означают клавиши ←/→/↑/↓.

## Актуальный просмотр и состояние

- Сайт: [http://127.0.0.1:3001/](http://127.0.0.1:3001/). Production server оставлен запущенным.
- Сборка: `W191Kvrm0Ls3y10cyjb_B`; её ID подтверждён в реально обслуживаемом HTML — [served-build.json](../design/photonic-skin/ps-05-r1/2026-09-24/served-build.json).
- База: `master`, `c339450363eb06f4363e33d2d4f639f32c5a28ff`. На старте уже были незакоммиченные изменения PS-05; они сохранены. R1 также не закоммичен. Push, публикация и отправка настоящих заявок не выполнялись.
- Среда: Windows, Node 24.17.0, Next 16.2.6, Microsoft Edge 153.0.4234.48 / Playwright Core, отдельные чистые browser contexts.
- Основные доказательства получены без review-флагов, fixtures, принудительных кликов, изменения store или снятия `inert` через инструментацию.

Команды из корня репозитория; повторный `start` нужен только после остановки текущего сервера:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3001
```

Новые evidence находятся в `design/photonic-skin/ps-05-r1/2026-09-24/`. Старые PS-05 evidence, отчёт и PS-04 goldens не перезаписывались.

## FIX-02 — карточки задач

**Воспроизведение.** Baseline build `N1biz5JfCxnIM8YB6OqxZ`, обычный `http://127.0.0.1:3001/`, viewport 1840×944, desktop, light, normal motion. Wheel на 946 px до 02, затем на 942 px до CSS-начала 03.1: `scrollY=1888`. Карточки полностью видны, но active остаётся 02, а 03.1 имеет `inert=true`. Все четыре координатных клика не меняют radio; `elementFromPoint` возвращает контейнер панелей вместо содержимого inert-карточки. [Исходная запись](../design/photonic-skin/ps-05-r1/2026-09-24/baseline-repro/before-fixes.webm), [trace](../design/photonic-skin/ps-05-r1/2026-09-24/baseline-repro/trace.json), [кадр](../design/photonic-skin/ps-05-r1/2026-09-24/baseline-repro/after-clicks.png).

**Причина.** В `ScrollCompositionController.applyScroll` CSS-начало секции и anchor `restoreScrollY` различались на 2 px. Это зона, где magnetism уже ничего не делает, но условие `atAnchor` ещё не снимает гистерезис предыдущего экрана. Accessibility lifecycle правильно применял `inert` к ошибочно неактивному 03.1. Перекрытие Canvas и обработчик карточки не были причиной.

**Исправление.** PS-05 включает `setCssAnchorAlignment(true)`: `atAnchor` учитывает весь магнитный no-op интервал вокруг anchor. Активный экран и интерактивность согласованы при естественной остановке колеса. Значение по умолчанию сохраняет прежний PS-04 контракт. `inert` неактивных экранов, блокировка будущих шагов и native radio сохранены.

**Проверка.** Повторены точные wheel-дельты, затем обычные координатные клики по тексту, свободной области и маркеру каждой из четырёх карточек. Выбирается ровно одна задача; кнопка продолжения открывает 03.2. Входы через Hero CTA, клавиши, граф и reload 03.1 также проходят. Проверены Tab, Space, стрелки radio-группы, Enter, 03.1 → 03.2 → 03.3, ручной бриф, возврат и повторное подтверждение. [Запись конструктора](../design/photonic-skin/ps-05-r1/2026-09-24/final-build/builder.webm), [итоговый manifest](../design/photonic-skin/ps-05-r1/2026-09-24/final-build/manifest.json). Регрессионный тест точной пары scroll samples сначала воспроизвёл отказ, после исправления проходит.

**Пробел старой проверки.** Старый `scripts/ps05-browser-qa.mjs` попадал на экраны программно/через ссылки и использовал `.check()` / `.setChecked()` после ожидания. Он не проверял CSS-остановку реального wheel и немедленный координатный клик по видимой карточке. Применение `force` в старом QA не установлено и не утверждается.

## FIX-01 — fade при wheel

**Воспроизведение.** Тот же baseline, `/`, 1840×944, light, normal. На wheel-переходе 04 → 05.1 родительские секции перемещались, но видимый уходящий текст сохранял opacity 1. [Baseline trace](../design/photonic-skin/ps-05-r1/2026-09-24/baseline/trace.json).

**Причина.** Уходящий fade запускался из программного `navigate`, приходящий — эффектом смены active в `Experience.tsx`. Native scroll двигал родителя, обходя этот путь; единого источника видимого прогресса для copy не было.

**Исправление.** `app/_ps05/motion.ts` содержит `Ps05Motion` и `scrollCopyOpacity`. На wheel прозрачность целого текстового блока определяется фактическим положением секции по соответствующей оси. Пространственное движение уже выполняет native-родитель, поэтому второе полное смещение дочернего текста не добавляется. В reading layout opacity меняется при реальном входе/выходе copy через края viewport; длинное читаемое содержание имеет непрозрачное плато.

Программные переходы используют тот же существующий runtime-clock, направление и конечное состояние; исходящий слой — краткоживущий inert-снимок текста без ID/name/data-qa и pointer events. При развороте сохраняется фактически видимый слой, вместо создания новой непрозрачной копии. Снимки удаляются при завершении/cleanup. Canvas не копируется. Reduced motion убирает дополнительный пространственный эффект и fade.

**Проверка.** Оба направления вертикальных переходов, открытый горизонтальный 03.1 ↔ 03.2, две границы FIX-03, клавиши, граф, развороты. Для 04 → 05.1 при wheel получены 40 выборок видимого уходящего и 36 приходящего блока с промежуточной эффективной opacity; для обратного перехода — 37/28. Для 05.7 → 06.1 — 40/37, обратно — 41/27. Эффективная opacity учитывает всех предков и положение блока в viewport, а не только собственный стиль. Конечные значения равны 1. Длинная секция 1440×900 сохраняет opacity 1 при чтении. [Измерения](../design/photonic-skin/ps-05-r1/2026-09-24/final-build/measurements.json), [wheel 04 ↔ 05.1](../design/photonic-skin/ps-05-r1/2026-09-24/clips-final/wheel-cases-content.webm), [wheel 05.7 ↔ 06.1](../design/photonic-skin/ps-05-r1/2026-09-24/clips-final/wheel-merch-team.webm).

**Пробел старой проверки.** Старые сценарии не содержали реального wheel с проверкой промежуточной прозрачности обоих видимых блоков. Ожидание settled и конечные screenshots не обнаруживали этот дефект.

## FIX-03 — непрерывное внешнее размещение Мимика

**Воспроизведение.** Baseline, обычный `/`, 1840×944, desktop/light/normal. При клике графа 04 → 05.1 выборки внешнего X содержали только 1490.4 и 386.4; после «Мерч» фактический следующий экран — 06.1, переход 05.7 → 06.1 содержал только 386.4 и 1490.4. Wheel давал промежуточные позиции. Baseline-запись непосредственно фиксирует граф и wheel; общий путь клавиш установлен по коду `navigate`, итоговые клавиши отдельно проверены в браузере.

**Причина.** Программный переход PS-05 мгновенно менял native scroll через `auto`. Scroll-coupled composition сразу читал конечное внешнее размещение. Плавная смена внутреннего состояния actor не обеспечивала плавность его положения на экране.

**Исправление.** `PlacementTransition` в `motion.ts` интерполирует только внешние center/size за 420 ms с smoothstep. Начало — последнее реально отображённое placement, конец считывается из текущей композиции каждый кадр. Новая команда начинает переход от текущего положения; wheel и resize не завершают его в устаревшей точке. Адаптер подключён к имеющемуся runtime-clock в `MagnetizedSettleLab.tsx`; `subscribeFrame` будит его при native scroll. Дополнительного scroll engine или независимого RAF для каждого ввода нет.

Конечные стороны сохранены: 04 и 06.1 — X=1490.4; 05.1 и 05.7 — X=386.4 при ширине 1840. Geometry, material, shaders, калибровка камеры, семантический resolver и frozen assets в R1 не менялись. DOM identity единственного Canvas сохраняется.

**Проверка.** Число различных промежуточных X, округлённых до пикселя, вне конечных позиций; light, desktop, normal:

| Переход | Wheel | Клавиши | Граф |
|---|---:|---:|---:|
| 04 → 05.1 | 18 | 61 | 60 |
| 05.1 → 04 | 15 | 64 | 64 |
| 05.7 → 06.1 | 17 | 64 | 64 |
| 06.1 → 05.7 | 18 | 63 | 64, эквивалент ArrowUp |

Из 06.1 узел графа 05.7 находится вне viewport. Согласно разрешённому заданием fallback использована доступная клавиша ↑; скрытый узел не включался и не нажимался принудительно. Это отмечено в manifest и подписях кадров.

Отсутствие начального скачка проверено первым sample в unit-тесте и browser-выборками с учётом elapsed time: скорость сопоставлена с максимумом smoothstep `1.5 / 420 ms`, с допуском на порядок двух RAF-наблюдателей. Фиксированный произвольный порог px/frame не использовался. Проверены те же переходы в dark, новая команда графа во время перехода, разворот клавишами, wheel во время программного перехода, resize в reading и обратно, reduced motion. [Запись прерываний](../design/photonic-skin/ps-05-r1/2026-09-24/final-build/interruption.webm).

**Пробел старой проверки.** Старый QA проверял endpoint после ожидания; выборок промежуточного внешнего placement и проверки первого кадра не было. Равенство target/resolved после завершения ничего не говорило о скачке между ними.

## Дополнительные найденные регрессии

- **Scroll chaining брифа.** Прокрутка длинного textarea на его границе меняла фон с scrollY 3778 до 6618. Узкое `overscroll-behavior: contain` для textarea удерживает фон на 3778 при внутреннем scrollTop 820; wheel над модальным диалогом тоже не перелистывает фон.
- **Resize после открытия шагов.** Порядок window-listeners менялся при обновлении builder unlock: controller измерял reading anchors до применения reading CSS. Sticky-секции имели одинаковый top, выбранный 05.1 заменялся на 05.7. `prepareLayout` теперь вызывается внутри controller.resize до измерения; отдельный конкурирующий PS-05 resize listener убран. Добавлен регрессионный тест и реальный resize во время placement в обе стороны.
- **Поздний bootstrap 3D.** При быстром переходе в 03.2 до загрузки ресурсов bootstrap сверял адрес с INITIAL unlock и возвращал 03.1. PS-05 проверяет live `controller.getUnlock()`, прежний PS-04 путь сохранён. В отдельном опыте задержаны только сетевые 3D-ресурсы на 3500 ms, состояние UI не подменялось: [до](../design/photonic-skin/ps-05-r1/2026-09-24/cold-entry-before-slow/manifest.json) — 03.2 → 03.1; [после](../design/photonic-skin/ps-05-r1/2026-09-24/cold-entry-after/manifest.json) — 03.2 остаётся интерактивным, выбранная задача сохранена. [Запись после исправления](../design/photonic-skin/ps-05-r1/2026-09-24/cold-entry-after/cold-entry.webm).

## Итоговая проверка

| Проверка | Результат |
|---|---|
| `npm.cmd test` | 440/440, включая четыре новых содержательных R1 tests |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | 0 ошибок, 16 прежних предупреждений в PS-04 sandbox/evidence scripts |
| `npm.cmd run build` | PASS; build ID выше |
| `git diff --check` | PASS |
| Основной browser QA, final-build | 113 записанных checks, errors=[] |
| Дополнительный QA, regressions-final-build | 10 записанных checks, errors=[]; та же последняя сборка |
| Шесть отдельных клипов, clips-final | Обе границы и оба направления, errors=[]; та же сборка |
| Cold entry после исправления | 03.2 до и после загрузки 3D, inert=false |

Основная матрица: 1840×944 desktop, 1440×900 с reading mode из-за семи выбранных компетенций и раскрытых примеров, 1280×720 reading, 390×844 reading. Проверены light/dark и отдельный reduced 1840×944. Normal фиксирует `prefers-reduced-motion=false` и пользовательское reduced=false. Системное предпочтение reduced эмулировалось browser context; пользовательская кнопка проверена отдельно. Настройки Windows не менялись.

MASTER для задачи/пустого состава, SINGLE для одной, GATHER для draft Event+Video, DRIVE после подтверждения, draft/confirmed и ручной бриф проверены. Проверены один Canvas, отсутствие actor на футере, фокус внутри диалога, Escape и возврат фокуса. A/B проверены отдельно с локальной review-fixture, поскольку основной сайт не содержит опубликованных кейсов; fixture не является доказательством трёх исправлений.

Headless-проход дополнен видимым Codex browser: фактический CSS viewport 507×617, reading; Hero CTA → «Вовлечь и объединить» → Event → 03.3. Видимый проход выполнен на промежуточной сборке до дополнительных textarea/resize/cold-boot исправлений; полная автоматическая матрица и короткие клипы — на окончательной сборке.

Логи: [tests](../design/photonic-skin/ps-05-r1/2026-09-24/tests-final.log), [typecheck](../design/photonic-skin/ps-05-r1/2026-09-24/typecheck-final.log), [lint](../design/photonic-skin/ps-05-r1/2026-09-24/lint-final.log), [build](../design/photonic-skin/ps-05-r1/2026-09-24/build-final.log). [Дополнительный manifest](../design/photonic-skin/ps-05-r1/2026-09-24/regressions-final-build/manifest.json).

Промежуточные диагностические run-папки сохранены. Их остановки не выдаются за успешную приёмку: среди них исходный отказ карточек, выявленные resize/cold-boot дефекты, уточнение селектора раскрытых примеров и ожидания actor resource вместо offscreen framebuffer на mobile. Намеренная остановка `Cards-only diagnostic completed` в baseline не является runtime-ошибкой сайта.

## Короткие записи и просмотр кадров

| Действие | Запись |
|---|---|
| Кликабельный конструктор | [builder.webm](../design/photonic-skin/ps-05-r1/2026-09-24/final-build/builder.webm) |
| Wheel, Кейсы ↔ Контент | [wheel-cases-content.webm](../design/photonic-skin/ps-05-r1/2026-09-24/clips-final/wheel-cases-content.webm) |
| Клавиши, Кейсы ↔ Контент | [keyboard-cases-content.webm](../design/photonic-skin/ps-05-r1/2026-09-24/clips-final/keyboard-cases-content.webm) |
| Граф, Кейсы ↔ Контент | [graph-cases-content.webm](../design/photonic-skin/ps-05-r1/2026-09-24/clips-final/graph-cases-content.webm) |
| Wheel, Мерч ↔ Команда | [wheel-merch-team.webm](../design/photonic-skin/ps-05-r1/2026-09-24/clips-final/wheel-merch-team.webm) |
| Клавиши, Мерч ↔ Команда | [keyboard-merch-team.webm](../design/photonic-skin/ps-05-r1/2026-09-24/clips-final/keyboard-merch-team.webm) |
| Граф вперёд, ↑ обратно, Мерч ↔ Команда | [graph-merch-team.webm](../design/photonic-skin/ps-05-r1/2026-09-24/clips-final/graph-merch-team.webm) |
| Прерывание перехода | [interruption.webm](../design/photonic-skin/ps-05-r1/2026-09-24/final-build/interruption.webm) |

[Manifest отдельных клипов](../design/photonic-skin/ps-05-r1/2026-09-24/clips-final/manifest.json) содержит build/commit+dirty, URL, браузер, размер, тему, motion, реальные способы ввода, конечные layout mode и перечень кадров. В одноимённых папках находятся `forward-timeline.png` и `reverse-timeline.png`. Агент просмотрел все 12 последовательностей промежуточных кадров, а также извлечённые из записей кадры конструктора и прерываний. Видны промежуточные позиции actor и прозрачности текста; конечные блоки читаемы.

Подписи `capture start +…s` указывают начало запроса screenshot, не точное время экспозиции. Для временных выводов использованы RAF samples из основного manifest. Обрезанные builder/interruption клипы захватывают небольшой соседний контекст; отдельные шесть клипов однозначно соответствуют подписанным действиям.

## Изменённые области и ограничения

R1 изменяет `app/_ps05/motion.ts`, `Experience.tsx`, `ps05.module.css`, PS-04 M5 `scroll-controller.ts` и PS-04 M6 `magnetized-settle/MagnetizedSettleLab.tsx`. Добавлены `tests/ps05-r1.test.ts`, отдельные `scripts/ps05-r1-*.mjs`, новый worklog, этот отчёт и evidence. Остальные изменения в git status относятся к ранее реализованному PS-05. Новых runtime dependencies нет, визуальная переработка не проводилась.

Реальные телефон/трекпад, Safari и Firefox в этом проходе не проверялись. Проверка mobile — размер viewport в Edge, не реальное устройство. Обратный узел графа 06.1 → 05.7 недоступен для обычного клика в текущей композиции, поэтому проверен разрешённый эквивалент ↑. Эти ограничения не скрыты за общим PASS.

Методика опирается на обычные [Playwright actionability checks](https://playwright.dev/docs/actionability), ожидание реального стабильного состояния после [mouse.wheel](https://playwright.dev/docs/api/class-mouse#mouse-wheel) и фактическую семантику [HTML inert](https://html.spec.whatwg.org/multipage/interaction.html#the-inert-attribute).
