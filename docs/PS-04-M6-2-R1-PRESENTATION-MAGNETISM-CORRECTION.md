# PS-04.M6.2-R1 — восстановление live-семантики, scroll-coupled placement и усиленный magnetism

Дата: 2026-09-02  
Статус: **HUMAN CORRECTION DIRECTIVE / READY FOR IMPLEMENTATION**

Основание: human review этапа PS-04.M6.2. Machine-пакет M6.2 утверждал корректную работу explicit competency clicks на settled `03.2`, однако фактическая проверка владельца выявила обратное. Поэтому PS-04.M6.2 **не получает HUMAN PASS и не коммитится**. Исправление выполняется как `PS-04.M6.2-R1` поверх незакоммиченного working tree M6.2 с baseline M6.1 checkpoint `c29e143580947fdf3f3f4121271a10805d4c5498`.

Этот документ не разрешает push, deploy, изменение production `/`, закрытие PS-04 или начало следующего M6-подэтапа.

---

## 1. Решение

M6.2-R1 должен разделить runtime не на два, а на три независимых канала:

| Канал | Владелец | Когда обновляется |
|---|---|---|
| Navigation / magnetism | scroll controller | Непрерывно во время scroll и magnetic settle |
| Presentation placement | scroll position + screen anchors | Непрерывно и обратимо вместе со страницей |
| Semantic Mimic endpoint | actor coordinator | Route: только после magnetized settle. In-screen action: сразу на settled host |

Ключевая формула:

```text
положение Mimic следует странице;
геометрия и palette следуют смыслу;
scroll-кандидат не становится semantic target до settle;
явный выбор компетенции на settled 03.2 является semantic action, а не route change.
```

Это сохраняет удачную плавность M6.2, но устраняет запоздалую боковую «догрузку» Mimic после фиксации экрана.

---

## 2. Human verdict по M6.2

Формальный статус:

```text
PS-04.M6.2 — HUMAN FAIL / CORRECTION REQUIRED
correctionTarget = PS-04.M6.2-R1
```

Причина — нарушен обязательный M6.1 contract:

```text
03.2 + 0 selected → MASTER
03.2 + 1 selected → exact SINGLE
03.2 + 2–7 selected → exact GATHER(draft selected set)
```

Кнопки компетенций на уже settled `03.2` обязаны менять Mimic до confirm. Route magnetism gate не должен блокировать это действие.

Не создавать checkpoint M6.2 до HUMAN PASS исправленного R1.

---

## 3. Исправление `03.2`

### 3.1. Два источника semantic request

Каждый actor request должен иметь типизированный source:

```ts
type ActorRequestSource =
  | { kind: 'route-settle'; nodeId: string; magneticSettleRevision: number }
  | { kind: 'in-screen-action'; hostNodeId: string; interactionRevision: number };
```

Политика:

- `route-settle` проходит через M6.2 settle gate и one-slot latest-settled queue;
- `in-screen-action` не требует новой `magneticSettleRevision`, если `hostNodeId === magnetizedSettledNodeId`;
- explicit action использует существующий authoritative coordinator и M5.6 latest-target protection;
- route-кандидаты по-прежнему не создают actor requests;
- telemetry обязана различать route и interaction requests.

### 3.2. Draft / confirmed остаются раздельными

- На `03.2` endpoint вычисляется из текущего **draft** selected set после каждого toggle.
- `confirm` фиксирует confirmed set.
- На `03.3`, `03.3A`, `03.3B` используется confirmed SINGLE/DRIVE.
- Возврат к `03.2` и правка draft помечают brief `stale`, но не переписывают confirmed endpoint для `03.3` до нового confirm.
- Никаких nearest-prefix, FOCUS, BRAND_WIDE substitution или runtime overlay.

### 3.3. Browser proof

Обязательная запись одного непрерывного сценария:

```text
settle 03.2
0 → MASTER
Content → single-content
+ Event → exact GATHER(content,event)
+ Video → exact GATHER(content,event,video)
- Event → exact GATHER(content,video)
confirm
03.3 → exact DRIVE(content,video)
```

Для каждого шага зафиксировать endpoint ID, state hash, palette mask, request source и отсутствие overlays.

---

## 4. About обязан оставаться BRAND_WIDE

На settled About node `02`:

```text
geometry = brand-wide-gather-content-design-digital-event-games-merch-video
competencies = all seven
family = BRAND_WIDE
framing = 1.24 desktop / cap 1.18 mobile
slot = frozen About slot
```

Проверять exact promoted state hash по M5.5 hash map. Node `03.1` может использовать ту же geometry с zoom `1.0`; это не разрешает подменять About другим endpoint.

Обязательны прямой вход, обратный вход, reload lab route и повторный вход после builder.

---

## 5. Scroll-coupled presentation placement

### 5.1. Что меняется

Сейчас `slot` входит в actor endpoint и начинает заметно перемещаться только вместе с semantic morph после settle. Поэтому Cases → Content и Merch → следующий screen выглядят как поздняя прогрузка положения.

В R1 presentation placement не должен ждать actor request.

На каждом tick scroll controller вычисляет:

```text
presentationSourceNodeId
presentationTargetNodeId
routeSegmentProgress ∈ [0, 1]
displayedPlacement = interpolate(sourceSlot, targetSlot, c2Window(routeSegmentProgress))
```

`routeSegmentProgress` выводится из фактического scroll position между соседними layout anchors, а не из таймера actor transition и не из дискретного `observedNodeId`.

### 5.2. Инварианты

- Использовать frozen X/Y slot endpoints и существующий spatial/C2 path.
- Не менять camera pose, FOV, geometry scale или framing profile.
- Placement update не создаёт asset request, compile, actor request или очередь.
- Geometry, palette и semantic state сохраняют последний committed endpoint до magnetized settle.
- При rapid scroll placement напрямую следует текущему route segment; crossed placement states не проигрываются позднее.
- Reverse scroll является точным обратным отображением.
- После settle Mimic уже находится в destination slot; semantic morph не должен повторно двигать его по X/Y.
- In-screen competency changes на `03.2` меняют форму, но не slot.
- Один Canvas, один actor, один InstancedMesh, один material/program/draw сохраняются.

### 5.3. Footer

Не расширять R1 на новую visibility choreography. Сохранить M6.2 contract: Footer становится no-draw только после settle `08`. До этого presentation placement использует последний валидный actor slot; никакой второй actor и никакой opacity overlay не создаются.

### 5.4. Обязательные browser transitions

- Cases → Content → Design и обратно;
- Digital → Video → Merch → Team и обратно;
- Hero → About;
- быстрый пролёт через несколько экранов с неизменной geometry, но scroll-coupled placement;
- `03.1 → 03.2`, competency toggles, `03.2 → 03.3`;
- Footer entry/exit;
- mobile и reduced motion.

---

## 6. Усиленный magnetism

### 6.1. Цель

Magnetism должен:

- захватывать ближайший screen с большего расстояния после окончания намеренного input;
- становиться сильнее по мере приближения к anchor;
- не бороться с активным wheel/trackpad/touch;
- позволять быстро пропускать промежуточные screens;
- не менять semantic request policy M6.2.

### 6.2. Рекомендуемая модель

Оставить authority в существующем scroll controller. Ввести отдельные capture и final-settle thresholds:

```ts
captureRadiusPx = viewportHeight * profile.captureRadiusVh;
proximity = clamp(1 - distanceToAnchorPx / captureRadiusPx, 0, 1);
magneticStrength = smoothstep(0, 1, proximity);
```

Стартовая review-калибровка:

```text
desktop / precision pointer captureRadiusVh = 0.56
mobile / touch captureRadiusVh = 0.42
capture allowed only after gestureActive=false
capture allowed only below a separate capture velocity threshold
final settle keeps existing 2 px floor and 0.02 vh/s verification
```

Это стартовый `R1_STRONG_BALANCED` profile, а не production approval. Значения должны быть versioned и показаны рядом с `M6_2_CURRENT` в review route.

Притяжение реализовать time-correct monotonic damping в существующем rAF/tick:

```text
weak at capture boundary
continuously stronger near anchor
no overshoot
exact anchor commit within noopDistancePx
cancel on fresh input within next controller tick
```

Не добавлять второй free-running clock, scroll-linked semantic timeline или обязательную остановку на каждом промежуточном screen. Destination lock сохраняется до нового явного input; hysteresis предотвращает флап между соседними anchors.

### 6.3. Проверяемые свойства

- `magneticStrength(distance)` монотонно возрастает при уменьшении distance.
- Захват с 45–50% viewport distance проходит в desktop profile.
- Активный fast scroll не перехватывается.
- Повторный input сразу отменяет magnetic motion.
- Graph click, keyboard, wheel, trackpad и touch сходятся к одному settle predicate.
- `requestsToCrossedNodes = 0` и `routeCompileLiveRetargetCount = 0` сохраняются.

---

## 7. Anime.js: решение

Anime.js — это JavaScript animation engine/library, не application framework. Текущая документация предлагает:

- `onScroll()` / ScrollObserver для синхронизации animation/timeline со scroll;
- scroll progress и velocity;
- spring/custom easing;
- React `createScope()` + `revert()` для cleanup;
- с v4.5 — Three.js adapter, включая Object3D, uniforms и InstancedMesh.

Для M6.2-R1 **не устанавливать Anime.js**.

Причины:

1. Ошибка `03.2` — ошибка ownership/request routing; tween library её не исправляет.
2. У проекта уже есть authoritative scroll controller, `PhotonicMotionSession.tick(dt)` и actor coordinator. Anime.js `onScroll` и собственный engine создадут второго наблюдателя/clock и размоют settle authority.
3. Scroll-coupled placement проще и детерминированнее вычислять чистой функцией от реального scroll position в существующем tick.
4. Three.js adapter здесь не нужен: geometry morph уже выполняется shader/runtime pipeline. Adapter затрагивает Object3D, materials, uniforms и InstancedMesh, а официальная документация отдельно предупреждает о single-Three-instance, shared-material и per-instance proxy caveats.
5. R1 обязан минимально исправить regression, не менять animation stack и dependency surface.

Anime.js разумно оценить в PS-05 отдельным spike для DOM UX/UI: микроинтеракции, timelines, typographic motion, non-critical scroll reveals. Не связывать первый spike с Mimic geometry, palette или settle authority. Принимать dependency только после bundle/performance/reduced-motion/cleanup comparison с Web Animations API и существующими utilities.

Официальные источники:

- [Anime.js onScroll](https://animejs.com/documentation/events/onscroll)
- [ScrollObserver properties](https://animejs.com/documentation/events/onscroll/scrollobserver-properties/)
- [React integration and scoped cleanup](https://animejs.com/documentation/getting-started/using-with-react)
- [Spring easing](https://animejs.com/documentation/easings/spring/)
- [Module imports and tree shaking](https://animejs.com/documentation/getting-started/module-imports)
- [Three.js adapter](https://animejs.com/documentation/adapters/threejs-adapter)
- [Three.js adapter gotchas](https://animejs.com/documentation/adapters/threejs-adapter/threejs-adapter-common-gotchas)

---

## 8. Hard gates R1

```text
03.2 explicit toggles produce exact M6.1 endpoints = PASS
03.2 request source = in-screen-action
About 02 exact BRAND_WIDE all-seven = PASS
requestsToCrossedNodes = 0
routeCompileLiveRetargetCount = 0
maxRouteActorQueueDepth <= 1
staleQueuedTransitionStarts = 0
runningMorphInterruptedByScroll = 0
placementActorRequestCount = 0
placementCompileCount = 0
placementQueueDepth = 0
postSettlePlacementDeltaPx <= 1 CSS px
placement endpoint identity at every settled node = exact
magneticStrengthMonotonic = true
magneticCancelOnFreshInput = next controller tick
MASTER flash = 0
palette lead = 0
center dwell = 0
third geometry = false
empty actor frame = 0
one Canvas / actor / InstancedMesh / material / program / draw
Footer settled = 0 draw
production / unchanged
Anime.js dependency added = false
```

---

## 9. Tests and evidence

Создать:

```text
design/photonic-skin/ps-04-m6-2-r1/
├── reports/
│   ├── approval-report.md
│   ├── human-review.md
│   ├── m62-human-failure-record.md
│   ├── request-source-validation.json
│   ├── builder-live-semantics.json
│   ├── about-brand-wide.json
│   ├── placement-coupling.json
│   ├── magnetism-profile.json
│   ├── rapid-scroll-regression.json
│   ├── transition-regression.json
│   ├── performance.json
│   └── production-isolation.json
├── renders/
│   ├── boards/
│   └── browser/video/
└── manifest.json
```

Review routes:

```text
/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1
/visual-lab/photonic-skin-ps04-m6/magnetized-settle-r1/review
```

HUD минимум:

```text
observedNodeId
snapCandidateNodeId
magneticDestinationNodeId
magnetizedSettledNodeId
actorCommittedNodeId
actorRequestSource
presentationSourceNodeId
presentationTargetNodeId
routeSegmentProgress
displayedPlacement
distanceToAnchorPx
captureRadiusPx
magneticStrength
geometryId / stateHash / paletteMask
queuedActorNodeId
```

Обязательные WebM:

```text
builder-live-selection.webm
cases-content-placement.webm
merch-team-placement.webm
rapid-placement-stable-geometry.webm
strong-magnetism-wheel.webm
strong-magnetism-touch.webm
reduced-motion.webm
```

Node/Python tests, `tsc --noEmit`, ESLint затронутых файлов, production build, browser smoke и production isolation обязательны. Старые M6.1 и M6.2 tests не ослаблять; неверный machine assertion M6.2 заменить реальным browser proof, а не удалить gate.

---

## 10. Process boundary

До начала R1:

```text
M6.2 HUMAN PASS не записывать
M6.2 checkpoint не создавать
baseline остаётся c29e143 (M6.1 HUMAN PASS)
R1 продолжает текущий uncommitted M6.2 working tree
```

После machine gates:

```text
PS-04.M6.2-R1 — MACHINE PASS /
HUMAN LIVE-SEMANTICS, PLACEMENT AND MAGNETISM REVIEW REQUIRED
```

Оставить M6.2-R1 uncommitted. Не выполнять push/deploy. Не менять production `/`. Не начинать следующий M6-подэтап.

Human PASS R1 утверждает исправленный M6.2 motion contract, но не является production или deploy approval.

