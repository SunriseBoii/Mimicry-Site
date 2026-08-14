# PS-03.M3.1 — Complex Composition & Presentation Lock

Статус checkpoint: **MACHINE PASS / HUMAN REVIEW REQUIRED**. Автоматическое утверждение M3.1 не выставлялось.

## 1. Исходный git status и обнаруженные пользовательские изменения

До начала работ ветка была `master`, а рабочее дерево уже содержало следующие пользовательские/untracked материалы M4:

```text
?? app/visual-lab/photonic-skin-m4/
?? design/photonic-skin/ps-03-m4.zip
?? design/photonic-skin/ps-03-m4/
?? public/photonic-skin/ps-03-m4/
?? tests/photonic-m4-runtime.test.ts
```

Эти пути сохранены и не перезаписывались. Все новые материалы созданы в отдельных `ps-03-m3-1`, `photonic-skin-m3-1` и `photonic-m31.test.ts` путях. Commit и deploy не выполнялись.

## 2. Фактический inventory M3

Манифест содержит ровно **154 endpoint-состояния**.

| Срез | Фактические значения |
|---|---|
| Роли | MASTER 1; SINGLE 7; COMPLEX 144; BRAND_WIDE 2 |
| Режимы | MASTER 1; SINGLE 7; FOCUS 134; GATHER 6; DRIVE 6 |
| Cardinality | 0: 1; 1: 7; 2: 24; 3: 39; 4: 40; 5: 27; 6: 14; 7: 2 |
| FOCUS COMPLEX | card 2: 22; 3: 37; 4: 38; 5: 25; 6: 12 |
| GATHER COMPLEX | по 1 состоянию для card 2–6; BRAND_WIDE card 7: 1 |
| DRIVE COMPLEX | по 1 состоянию для card 2–6; BRAND_WIDE card 7: 1 |

Все 154 semantic state ID сохранены. Старое M3 содержало 127 canonical combinations и 18 transition-записей; M3.1 публикует статические endpoint-данные и не компилирует новые transitions.

## 3. Что было заморожено без изменений

- MASTER и все 7 SINGLE, итого **8 state buffers**, скопированы побайтно.
- Identity space сохранён: `16,384` persistent ID, stride `40`, версия `ps03m3-identity-v1`.
- Identity origin SHA-256: `be43f82dd46fb7f0327aacc62d30980c9a32c215eeedf9c1b6a872ccf3cddda6`.
- M3 fingerprint сохранён как baseline: `81bbfbdf1c2d1f26340bcd1318620d5ad9975a2c830ca3ed8552f026d488351f`.
- M3 manifest SHA-256: `35e60cf93875df95021249cc26ef3bdcbae6bcb03eac4af650660537858bcda8`.
- M4 продолжает ссылаться на свой прежний frozen M3 snapshot; `stateBuffersCopiedIntoM4=false`, пересборки M4 не было.
- Frozen M4 deterministic aggregate: `28d53102494bef0602df3f0b0afe99deeaa9f135140990876919416e419e7450`.

## 4. Подтверждённая причина master-core

Причина воспроизведена в старом M3 builder. При cardinality `>=4` источником автоматически становился MASTER, после чего solver добавлял его первый компонент в нуле как `assemblyRole=anchor`. Доля вычислялась как `min(0.46, 0.18 × (source_count − 3))`: 18% для четырёх, 36% для пяти и 46% для шести/семи компетенций.

Это была техническая эвристика, а не утверждённая часть концепции. M3.1 multi-state solver собирает только assembly-emblems участвующих компетенций. Итог: **0 `master-core` в 146 COMPLEX/BRAND_WIDE component maps**.

## 5. Источники endpoint micro-particles

Финальный exact depth/component-ID прогон отделил реальные endpoint-дефекты от других источников:

- `event:figure-left`: при плотном перекрытии в side/top оставлял 1–2 px. Частицы остаются в buffer, но необязательный подкомпонент отсутствует во всех presentation profiles; сцена, портал и другие фигуры сохраняют Event-emblem.
- `event:figure-right`: один 1 px случай в `DRIVE + alternate + mobile390`. Применено общее правило `DRIVE/mobile390`, а не state-specific координатный override. FOCUS/GATHER mobile и DRIVE desktop сохраняют компонент.
- Reserve/subsurface исключены как причина: их status не active, neutral endpoint их не показывает.
- M4 echo/runtime particles не входят в M3.1 и не менялись.
- `master-core` исключён по component maps и не является источником остаточной пыли.

Component indices, sample particle IDs, причины и исправления записаны в `reports/ps03m31-micro-particle-sources.json`. Финальный результат: **0 endpointDust failures** в 1,232 state-view.

## 6. Архитектура presentation descriptors

Создан строгий descriptor contract для 7 компетенций. Каждый descriptor содержит:

- ссылку на утверждённый SINGLE и полный `assemblyEmblem`;
- rigid component groups;
- semantic pivot/up/forward и canonical Euler;
- allowed tilt/scale, depth budget, flatness и aspect ratio;
- калибровку projected area по canonical/alternate;
- минимальные footprint-пороги;
- protected recognizability features;
- profile component policy для desktop, mobile390, 180 и 96;
- запрещённые ориентации и `reflectionAllowed=false`.

Schema: `schemas/presentation-descriptor.schema.json`. Данные: `descriptors/presentation-descriptors.json`.

## 7. Assembly-emblem каждой компетенции

| Компетенция | Assembly-emblem |
|---|---|
| Content | `book-body` |
| Design | `palette-board`, `brush-upper`, `brush-lower` |
| Digital | `laptop-base`, `laptop-screen`, `smartphone` |
| Event | `stage-deck`, `portal-arch`, `figure-left`, `figure-centre`, `figure-right` |
| Games | `gamepad`, `queen` |
| Merch | `tee`, `thermos`, `open-box` |
| Video | `camera`, `clapperboard` |

Полная исходная эмблема участвует в geometry buffer. Presentation profile может скрыть только заранее описанный необязательный подкомпонент по правилу «читаемый или полностью отсутствующий».

## 8. Новая логика FOCUS

FOCUS больше не использует кольцо. Lead располагается как главный left/central accent, supports — в организованной сетке без перекрытия лидера. Массы вычисляются из descriptor projected-area calibration. Для каждого состояния solver детерминированно калибрует общий `focus_area_target`; координаты отдельных state вручную не задаются.

Порог production QA: lead visibility ≥85%, support visibility ≥60%, visible lead area / largest support area = `1.4…2.2`. Все **134 FOCUS endpoint**, **536 production state-view** и **2,016 owner rows** прошли отдельный probe.

В фактическом frozen inventory FOCUS lead присутствуют для Content, Design, Digital, Event, Games и Merch; старого Video-lead semantic ID нет. Для проверки седьмого возможного lead создан **QA-only Video solver probe** из реальных source buffers. Он дал canonical/alternate ratios `1.69/1.84`, показан на board 04 и намеренно не добавлен в 154-state manifest.

## 9. Новая логика GATHER

GATHER строит равноправную сбалансированную сетку assembly-emblems с единым presentation anchor. Нет центральной сферы и визуально привилегированной компетенции. Проверены все **6 фактических GATHER состояния**: complex cardinality 2–6 и BRAND_WIDE cardinality 7. Production visibility threshold для каждого owner: ≥72%.

## 10. Новая логика DRIVE

DRIVE формирует направленную последовательность по стабильному порядку компетенций; размер и шаг дают читаемую траекторию без круговой раскладки. Проверены все **6 фактических DRIVE состояния**: complex cardinality 2–6 и BRAND_WIDE cardinality 7. Production visibility threshold: ≥68%. Mobile390 использует rule-based упрощение необязательной правой Event-фигуры.

## 11. Camera/presentation contract

Камера фиксирована и не анимируется:

- canonical: `[5.6, -6.4, 4.1]`;
- alternate 3/4: `[2.8, -7.8, 4.6]`;
- diagnostic side: `[8.8, 0.0, 1.4]`;
- diagnostic top: `[0.01, -0.01, 9.4]`;
- FOV: `33°`.

Alternate остаётся в той же front-family и не является 180° оборотом canonical. Для каждого endpoint вычисляется semantic presentation anchor и единый scale через binary search с target NDC half-span `0.80` по всем четырём камерам. Reflection, camera motion, settle, Play/Reverse и M4 runtime в Lab отсутствуют.

## 12. Desktop/mobile и screen-space метрики

Проверены профили: desktop `512×512`, mobile390 `390×390`, silhouette `180×180` и `96×96`. Safe margin: 6% desktop и 5% для остальных. Для каждого профиля применяются descriptor component simplifications и minimum projected footprint.

Итог exact raster QA: 154 states × 8 cases = **1,232 state-view**, **4,528 owner rows**, **10,200 component rows**, clipping `0`, safe-margin failures `0`, visibility failures `0`, footprint failures `0`, dust failures `0`.

Browser regression подтвердил: desktop Canvas `512×512`; при реальном 390px resize mobile Canvas `374.7×374.7`, без horizontal overflow; narrow split — два квадратных Canvas около `295×295`; silhouette Canvas — точно `180×180` и `96×96`.

## 13. State IDs, versioning и hashes

- State version: `3.1.0`.
- Builder: `ps03m31-presentation-builder-v1`.
- M3.1 deterministic fingerprint: `21a78652d529eb0b1d34765aad42f0ae8379aa3f7fb9d3ec5af698548464d6e5`.
- Descriptor hash: `b6e38914b4cec8577d8842d49690a7941a1a4978ab7624308882780290d8b952`.
- Старые semantic IDs сохранены и явно связаны в `state-mapping.json` как M3 → M3.1.
- 146 multi-state получили честно пересчитанные definition/content hashes.
- 8 frozen buffers сохранили старые content hashes.

SINGLE hashes: Content `ea5d20…`, Design `3ecb1f…`, Digital `22492a…`, Event `ca3b14…`, Games `521ecf…`, Merch `de23b1…`, Video `3e7862…`.

Повторная генерация проверена: fingerprint before/after совпал, **154/154 definition/content/file hashes стабильны**.

## 14. Machine QA с точными результатами

| Проверка | Результат |
|---|---|
| Full screen/depth QA | PASS: 154/154 states, 1,232/1,232 views, 0 failures |
| FOCUS production probe | PASS: 134/134 states, 536 views |
| Semantic axes | PASS: 154 state definitions |
| SINGLE geometry preservation | PASS: 7/7 hashes |
| Multi-state master-core | PASS: 0/146 |
| Determinism rebuild | PASS: 154/154 stable |
| Python contracts | PASS: 8/8 |
| TypeScript/integration suite | PASS: 34/34 |
| Typecheck | PASS |
| ESLint | PASS |
| Next production build | PASS; `/visual-lab/photonic-skin-m3-1` prerendered |
| Render pipeline | PASS: 18 boards, 189 cached real-buffer projections |
| Browser regression | PASS after fixes; final console errors: 0 |
| Blender/headless | NOT RUN: Blender executable отсутствует в окружении |

Blender не подменялся мокапом. Геометрический screen QA и boards созданы детерминированным component-ID/nearest-depth point-splat renderer непосредственно из опубликованных `.state.bin`.

## 15. Visual QA и выполненные циклы исправлений

Созданы и визуально просмотрены 18 boards. Выполнены следующие исправительные циклы:

1. FOCUS area calibration закрыла production lead ratios для 134 состояний.
2. Первый полный прогон нашёл 10 `figure-left` dust cases; profile policy устранила их.
3. Остался один `figure-right` mobile DRIVE case; mode/profile rule устранил его без ослабления порогов.
4. Попытка скрыть компонент глобально на mobile ухудшила два FOCUS ratios; правило было сужено до DRIVE, после чего full QA прошёл без ошибок.
5. Browser QA обнаружил зарезервированное GLSL-имя `active`; shader исправлен, WebGL geometry появилась.
6. Browser QA выявил несоответствие portrait Canvas квадратному camera contract; presentation transform перенесён непосредственно в state texture, а Canvas profiles зафиксированы квадратными.
7. Узкий split сначала наследовал desktop aspect из-за CSS specificity; исправлен до двух квадратных responsive panes.

Финально проверены canonical, alternate, side, top, desktop, mobile390, 180, 96, neutral, components, safe, orientation, silhouette, single/split comparison, resize и отсутствие горизонтального overflow. Человеческая эстетическая оценка не выставлялась.

## 16. Все созданные артефакты и путь к Lab

- Lab: `/visual-lab/photonic-skin-m3-1`.
- UI source: `app/visual-lab/photonic-skin-m3-1/`.
- Published manifest/buffers/QA: `public/photonic-skin/ps-03-m3-1/`.
- Descriptor schema/data: `design/photonic-skin/ps-03-m3-1/schemas/` и `descriptors/`.
- Builder, validator, renderer, determinism: `design/photonic-skin/ps-03-m3-1/scripts/`.
- Versioned exports, mappings, resolved states: `exports/` и `states/`.
- 18 boards и selected state renders: `renders/`.
- Full QA, focus probe, determinism, micro-particle и render inventories: `reports/`.
- Python tests: `design/photonic-skin/ps-03-m3-1/tests/test_ps03m31.py`.
- TypeScript tests: `tests/photonic-m31.test.ts`.

Ключевые boards: `board-baseline-vs-m31.png`, `board-single-emblems.png`, `board-focus-cardinality.png`, `board-focus-leads.png`, `board-gather.png`, `board-drive.png`, `board-brand-wide.png`, `board-all-multi-canonical.png`, `board-risk-suite.png`, `board-production-views.png`, `board-diagnostic-views.png`, `board-mobile390.png`, `board-silhouettes.png`, `board-component-id.png`, `board-safe-frame-occlusion.png`, `board-master-core-absence.png`, `board-endpoint-dust.png`, `board-state-inventory.png`.

## 17. Ограничения, human-review checklist и подтверждение границ этапа

Ограничения:

- Blender/headless validation не выполнен, потому что Blender не установлен.
- Фактический 154-state manifest не содержит Video-lead FOCUS ID; седьмой lead проверен отдельным непубликуемым solver probe.
- Machine PASS не означает human approval. M3.1 остаётся `requires-human-approval`.

Как открыть:

1. В корне проекта запустить `npm.cmd run dev`.
2. Открыть `http://localhost:3000/visual-lab/photonic-skin-m3-1`.
3. Последовательно проверить M3/M3.1 split, все mode/cardinality/lead фильтры, четыре камеры и четыре viewport profile.

Human reviewer должен ответить на все вопросы:

1. Исчезла ли центральная MASTER-сфера из COMPLEX/BRAND_WIDE?
2. Читается ли каждая участвующая компетенция?
3. Отличаются ли FOCUS, GATHER и DRIVE без объяснения?
4. Является ли lead очевидным в FOCUS?
5. Выглядит ли GATHER равноправной сборкой?
6. Читается ли направление в DRIVE?
7. Нет ли перевёрнутых предметов и странных осей?
8. Работают ли canonical и alternate 3/4?
9. Приемлемы ли mobile 390, 180 и 96?
10. Исчезли ли endpoint-точки и пыль?
11. Можно ли заморозить M3.1 endpoints для пересборки M4.1?

**M4.1 не начинался. PS-04 не начинался. M4 transitions не перекомпилировались. Commit не создавался. Deploy не выполнялся.**
