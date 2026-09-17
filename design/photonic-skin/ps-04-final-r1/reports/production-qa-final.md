# PS-04 final R1 — независимая проверка production `/`

Дата: 2026-09-16. Среда: локальная production сборка на `http://localhost:3000`, headless Microsoft Edge, 1440×900; для touch использован CDP `Input.dispatchTouchEvent`.

## Итог

- Маршрутный прогон: **18/18** с обычным движением и **18/18** с reduced motion. Проверены формы и GPU endpoints на 03.1–03.3, компетенциях, 06.1–06.3 и остальных узлах; ошибок браузера нет. Доказательства: [route-audit-motion.json](route-audit-motion.json), [route-audit.json](route-audit.json).
- Отдельный прогон graph, hash, Back/Forward, wheel +750, touch overshoot и rapid Arrow reverse завершился с `failures=[]`, `errors=[]`. Конечные экран, hash, semantic target и GPU endpoint согласованы и сохранялись после ожидания 3–5 с. Доказательство: [production-experience-audit.json](production-experience-audit.json).
- Cold `/#screen-03.2` корректно приводит к 03.1 / MASTER; cold `/#screen-05.3` остаётся на 05.3 / single-event. Keyboard Arrow, Home, End и Back/Forward прошли в обоих режимах движения.
- Явная цель, выбранная пока manifest ещё грузится, заменяет cold destination: `/#screen-05.3` → ранняя команда 05.4 завершилась `#screen-05.4` / single-games / GPU single-games, без preboot actor request. [early-navigation-boot-audit.json](early-navigation-boot-audit.json).

## Cold Event: найденный и исправленный P1

До исправления машина settle успевала принять временную 01 при `scrollY=0` **до загрузки boot manifest**. В трассе на 409 мс появился `route-settle` request 01; только на 558 мс активировались boot Event и `scrollY=5402`. Поздний bind программы `single-event-to-master-neutral` выводил на экран розовую MASTER сферу поверх текста Event минимум на 400 мс. [Трасса до исправления](cold-entry-before-fix.json), [видимая неправильная форма](cold-entry-frames/frame-01-11ms.png).

Текущая защита не публикует `settle.tick` до готовности boot source. Ранняя явная навигация во время загрузки меняет boot destination. Нейтральный poster скрывается после GPU ACK ожидаемого целевого endpoint с завершённой геометрией. В двух независимых cold запусках нет preboot actor request, poster ушёл только при `single-event-to-single-event`, и на первых видимых кадрах показана Event форма. [Запуск 1](cold-entry-after-fix-run1.json), [запуск 2](cold-entry-after-fix-run2.json), [первый видимый Event](cold-entry-frames/frame-01-37ms.png).

## Граница измерений

В этой headless среде раскрытие poster на cold Event произошло через ~5,1–5,2 с от начала документа. Это заметная задержка первого GPU кадра в тестовой среде; она требует замера на целевых устройствах до заявления о выполнении бюджета startup. Покадровая проверка доказала правильность первой формы, а не выполнение бюджета времени.

Оценки `firstChangedPixelMs` в [production-experience-audit.json](production-experience-audit.json) основаны на дискретных Playwright screenshots и являются верхними границами. Они не подтверждают p95 ≤150 мс: для graph/hash встречаются 258–428 мс от начала действия. Отсутствующие значения означают, что выбранный порог изменения изображения не был достигнут в окне выборки; semantic/GPU timing записан отдельно. Эти цифры нельзя выдавать за точный пользовательский latency на desktop/mobile.

Визуальная приёмка формы Event, светлой/тёмной темы и движения владельцем проекта остаётся отдельным gate PS-04. Этот отчёт фиксирует машинную проверку production кандидата.
