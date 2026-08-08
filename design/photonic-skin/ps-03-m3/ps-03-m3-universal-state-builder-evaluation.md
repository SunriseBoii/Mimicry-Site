# PS-03.M3 — Universal State Builder evaluation

Дата: 2026-08-08  
Статус этапа: **machine-valid; visually reviewed by model; новые COMPLEX / BRAND_WIDE и motion требуют human approval**.  
Production integration, commit и deploy не выполнялись.

Основные источники истины:

- `exports/ps03m3-manifest.json` — агрегированный runtime-контракт;
- `reports/ps03m3-gate-a.json` — Gate A по всем бюджетам и 127 сочетаниям;
- `reports/ps03m3-qa-summary.json` — агрегированный QA;
- `reports/ps03m3-correspondence-metrics.json` — correspondence-метрики;
- `reports/ps03m3-browser-performance.json` — фактический browser benchmark и отдельно оценки;
- `reports/ps03m3-determinism.json` — двойная чистая сборка;
- `reports/ps03m3-render-evidence.json` — Blender evidence manifest.

## Итог по 46 пунктам

### 1. Подтверждённый baseline PS-03.M2

Подтверждены восемь `TargetDefinition` версии `1.0.0`: `sphere-master`, `content-open-book`, `design-palette-brushes`, `digital-laptop-phone`, `event-stage-figures`, `games-gamepad-queen`, `merch-tee-thermos-box`, `video-camera-clapperboard`. M2 content hash: `4a345c4ea1b75d250b1ef8bf0a01ab634721e92ebaa8d2e26349598ec51a74cd`; build-config hash: `01eed79e908212cc3dfb76eb1628dc66288fd158302e756cd580a07e32dac4a6`; `V₀ = 4.185075142010032`; cap размера элемента — `1.15`. M2 находится в отдельном commit `7917552` и повторно прошёл 470/470 проверок.

### 2. Добавленные и изменённые файлы

Новый этап изолирован в `design/photonic-skin/ps-03-m3/`: две JSON Schema, contracts, State Builder, Transition Compiler, build/determinism/render/board scripts, tests, resolved definitions, exports, reports и renders. Web runtime изолирован в `public/photonic-skin/ps-03-m3/`. Browser lab добавлен только в `app/visual-lab/photonic-skin-m3/`. Полный перечень generated states/transitions хранится в manifest, а не дублируется здесь.

### 3. Неизменность исходных targets

Да. Файлы PS-03.M2 не менялись и не перегенерировались. Все восемь source-definition hashes сверяются с frozen M2 manifest при каждой сборке и в offline QA.

### 4. Граница цвета, текстур и material

Подтверждена. Новые color tokens, текстуры, maps и production material/shader не создавались. Blender использует один нейтральный технический material; browser использует нейтральный режим и debug-colors только для component/shell/zone/identity/reserve/trajectory QA.

### 5. Архитектура `StateDefinition`

`schemas/state-definition.schema.json` версионирует роль state, source targets и их hashes, component selections, mass/minimum-mass, assembly role, transforms, composition mode, normalization, surface envelope, identity, LOD, reserve, transition affordances, validation и provenance. Resolved definitions сохраняются в `states/resolved/`.

### 6. Universal State Builder

Builder читает только декларативные M2 definitions/meshes/attributes. Он выбирает компоненты по semantic/assembly policy, распределяет массу с ограничением minimum thickness, применяет общие FOCUS/GATHER/DRIVE poses, защищённое contact occlusion, density-aware low-discrepancy sampling, fixed-stride packing и machine QA. Предметные имена не управляют алгоритмом.

### 7. MASTER и семь SINGLE

MASTER и семь SINGLE собраны тем же контрактом. Для них включён `source-preserving`: scale/pose исходной human-approved композиции не переосмысляются. Shells выводятся универсально из M2 `connectivityRole` и `parentComponentId`: SINGLE shell counts равны 1/3/2/1/2/3/2 для Content/Design/Digital/Event/Games/Merch/Video.

### 8. FOCUS / GATHER / DRIVE

- FOCUS сохраняет полный focus target только для допустимого низкокардинального случая; остальные источники дают primary/echo components.
- GATHER размещает компоненты компактно вокруг общего центра.
- DRIVE использует направленную ось и детерминированную последовательность poses.
- Для cardinality ≥4 добавляется нейтральный core через тот же mass-allocation contract.

### 9. BRAND_WIDE

Все семь компетенций собираются как единый compact state с нейтральным core и предметными primary echoes, а не как семь полных моделей рядом. Экспортированы GATHER и DRIVE варианты; канонический BRAND_WIDE — GATHER.

### 10. Все 127 сочетаний

Да: 7 SINGLE + 119 COMPLEX + 1 BRAND_WIDE. Вместе с MASTER и дополнительными репрезентативными FOCUS/GATHER/DRIVE вариантами runtime manifest содержит 154 states.

### 11. Relaxation

Ни одно из 127 канонических состояний не потребовало relaxation: `relaxed = 0`. Все проходят volume, envelope, thickness, component и coverage policies при N=16384.

### 12. Surface / aspect / thickness / shells

Normalized volume error для gated states — 0 в принятой mass-модели. Максимальный area ratio — `2.611266` у `single-digital`; максимальный aspect ratio — `5.830396` у `complex-focus-digital-merch-focus-digital`; минимальная толщина — ровно `4.0` modules у семикомпонентного FOCUS; максимум shells/components в gated composition — 8. Frozen surface envelope — `2.645`.

### 13. Coverage по бюджетам

| N | Coverage range | Worst p95 nearest | Worst max nearest | Worst required scale | Coverage failures |
|---:|---:|---:|---:|---:|---:|
| 8,192 | 0.4052–0.8000 | 0.06454 | 0.08542 | 1.61594 | 127 |
| 12,288 | 0.6078–0.8000 | 0.05270 | 0.06975 | 1.31941 | 116 |
| 16,384 | 0.8000 | 0.04564 | 0.06040 | 1.14264 | 0 |
| 24,576 | 0.8000 | 0.03726 | 0.04932 | 0.93296 | 0 |
| 32,768 | 0.8000 | 0.03227 | 0.04271 | 0.80797 | 0 |

### 14. Выбранный N

Заморожено `N = 16,384`, identity-space version `ps03m3.identity.v1`. Это первый бюджет, который проходит все 127 canonical combinations и MASTER без превышения cap 1.15.

### 15. Почему меньшие N отклонены

8,192 не проходит coverage для всех 127 combination states; 12,288 — для 116. Thin/silhouette и surface-envelope failures при этом отсутствуют: blocker именно coverage/required scale. 24,576 и 32,768 проходят, но не минимальны.

### 16. Surface envelope

Зафиксирован maximum `2.645 × Sphere area`, preferred hypothesis `2.60`. Фактический максимум `2.611266`; cap не расширялся.

### 17. Реально измеренный browser performance

Codex in-app Chromium, Windows, WebGL2, Next dev server; это не hardware-independent обещание:

| Instances | Scenario | Median / p95 | FPS | Draw calls | Triangles | Runtime data estimate |
|---:|---|---:|---:|---:|---:|---:|
| 8,192 | MASTER→SINGLE static | 6.1 / 6.7 ms | 158 | 1 | 65,536 | 2.38 MiB |
| 12,288 | complex debug | 6.1 / 6.6 ms | 163 | 1 | 98,304 | 2.69 MiB |
| 16,384 | real 1→3-shell split, t=0.308 | 6.1 / 8.0 ms | 155 | 1 | 131,072 | 3.00 MiB |

Pair load observed: 11–41 ms; two packed state files: 1.25 MiB. 24k/32k не рендерились, потому что Gate заморозил identity-space на 16k; их padded runtime estimates — 5.375/6.0 MiB. Реальный GPU peak memory API недоступен. После initial texture upload per-frame state-buffer upload равен нулю; меняются uniforms. Long-task/dropped-frame instrumentation отдельно не подключался. В консоли нет ошибок; остаётся одно повторяющееся dependency warning о deprecated `THREE.Clock`.

### 18. Пространство постоянных IDs

ID строго `0…16383`, без пропусков и перенумерации. Каждый state содержит 16,384 records фиксированного stride 40 bytes: position, packed normal, packed quaternion, scale, reserve depth, component, shell, status, flags, density, transition group и LOD priority.

### 19. Canonical MASTER assignment

Canonical origins — equal-area Fibonacci distribution на unit sphere. Identity origin blob имеет собственный SHA-256 и версию; destination assignment каждого state строится независимо от пары перехода.

### 20. Распределение по shells/components/zones

Component quotas выводятся из exposed area × surface importance с минимальным quota. Shell graph выводится из declarative connectivity parent chain. Feature/silhouette/density flags наследуются из M2 vertex attributes; защищённый prefix удерживает доступные feature/silhouette zones уже на LOD 512.

### 21. Active / reserve / subsurface / bridge

Active records лежат на exposed source triangles. Остальные IDs детерминированно упаковываются в конечные уникальные canonical subsurface positions с reserve depth 0.16–0.32. Переходы active↔reserve имеют физическую route и scale activation; opacity/fade не является основой emergence/immersion. Bridge intent представлен transition groups и split/merge flags, отдельные готовые модели не появляются.

### 22. Вложенные LOD

Уровни: 512, 1024, 2048, 4096, 8192, 12288, 16384. Каждый — строгий prefix тех же ID; перенумерации нет. Low-discrepancy ordering исправлен после vision review, поэтому ранние prefixes покрывают всю поверхность, а не непрерывную полосу.

### 23. Correspondence algorithm

Каждый state независимо сортирует deterministic area samples по защищённому zone priority и low-discrepancy order, затем сопоставляет их canonical ID. Pair-specific permutations отсутствуют. Отчёт содержит travel, component reassignment, anchor counts, local-neighborhood distortion, edge-reversal crossing proxy и construction projection error.

### 24. Масштабирование correspondence

Алгоритм O(N) по packing/sampling и использует фиксированные typed records; transition compile также O(N). При N=16384 один state — 0.625 MiB, один transition — 0.34375 MiB. Все 154 state buffers занимают 96.25 MiB; 18 transition buffers — 6.1875 MiB, но browser грузит только нужную пару.

### 25. Duplicates / quotas / anchors

Duplicate active destination samples: 0 во всех states. Quota violations: 0. Feature/silhouette anchors сохраняются; минимальные non-MASTER counts — 2509/2581. Worst travel p95/max от MASTER — 3.4949/4.4936. Worst local-neighbour log-distortion p95 — 5.2275, edge-reversal proxy — 1105/2048; это не collision count, но честно отмечено как риск визуально сложных дальних morphs и причина обязательного human motion review. Surface projection construction error — 0.

### 26. `TransitionDefinition`

`schemas/transition-definition.schema.json` версионирует endpoints и hashes, duration, motion/phase profiles, primary axis, component routing, split/merge, reserve transport, continuity, validation и provenance.

### 27. Universal Transition Compiler

Compiler принимает любую пару valid fixed-stride states, не знает имён targets и строит route, phase, activation window, group и flags на каждый ID. Browser для произвольной пары воспроизводит ту же universal route formula; 18 QA-пар дополнительно имеют compiled 22-byte records.

### 28. Trajectories / orientations / scales

Position использует C2 quintic smoothstep плюс C2 route hump. Route выводится из delta, average source/target normals и canonical transition group. Packed endpoint orientations хранятся в states; browser ориентирует instances по фактическим source/target normals. Scale интерполируется quintic и умножается на geometric emergence/immersion activation window.

### 29. Split и merge

Shell membership выводится из connectivity contract. Фактически проверены `single-content → single-design` (1→3 shells) и reverse 3→1; shell-change IDs получают split/merge flag и coherent transition group. Self-transition подмена была обнаружена на visual QA и устранена.

### 30. Emergence и immersion

Emerging IDs идут из finite subsurface reserve к поверхности в окне 0.18–0.72 с phase offset; immersing IDs уходят обратно до 0.82. Worst tested emergence/immersion counts — 9981/8642. Browser не скрывает transport status-порогом: radius растёт/сжимается геометрически.

### 31. Endpoint / continuity / collision / clumping

По 18 transitions: max t0/t1 error `0`; max endpoint speed `6.48e-7`; max endpoint acceleration `0.03885`; max sampled-step fraction `0.36645`; worst collision proxy pairs among 2048 — `2`; minimum clumping ratio to tightest endpoint — `1.59478`. Все policy checks проходят.

### 32. Фактически проверенные transitions

7 MASTER→SINGLE, 3 topology-diverse SINGLE→SINGLE, MASTER→COMPLEX, SINGLE→COMPLEX, COMPLEX focus swap, COMPLEX→BRAND_WIDE, BRAND_WIDE→MASTER, real split, real merge и reserve-emergence. Reverse endpoint consistency проверена для каждого compiled transition; reverse control проверен в lab.

### 33. Renders / boards / strips / videos

`renders/` содержит 273 Blender frames: MASTER/SINGLE/mode/camera overview, 127 canonical family frames и 18×7 transition frames (t=0/.1/.25/.5/.75/.9/1). Сформированы 7 cardinality boards, 18 transition boards, overview/camera/worst-case boards и browser screenshots. Видео не кодировалось: deterministic raw frames оставлены источником истины, media encoding исключён из deterministic contract.

### 34. Просмотр vision-инструментом

Просмотрены composition, singles, camera, worst-case, cardinality 2/4, BRAND_WIDE→MASTER, real split/merge boards и финальные browser neutral/shell-debug screenshots. По результатам исправлены LOD spatial coverage, board labels, real shell graph, split/merge pair и browser route/reserve geometry.

### 35. Machine-valid

Machine-valid: все 154 states, все 127 canonical combinations, identity/correspondence records и все 18 QA transitions. Это означает прохождение зафиксированных schema/numeric/policy checks, а не художественное утверждение.

### 36. Visually reviewed by model

Model-reviewed: MASTER/SINGLE neutral previews, FOCUS/GATHER/DRIVE overview, representative family pages, worst cases, BRAND_WIDE→MASTER, split/merge strips и browser shell-debug. 127 individual frames доступны на boards; каждое художественное решение отдельно пользователем не утверждалось.

### 37. Требует human approval

Все новые COMPLEX/BRAND_WIDE композиции, FOCUS hierarchy, directed DRIVE характер, split/merge staging, reserve emergence timing и общая motion пластика. Исходные восемь M2 target-форм остаются human-approved.

### 38. Target-specific branches

В core pipeline отсутствуют. AST-проверка сканирует `contracts.py`, `state_builder.py`, `transition_compiler.py`, `build_ps03m3.py` на targetId/competencyId/componentId/stateId/zoneId в алгоритмических conditions. Имена встречаются только в definitions, manifests, tests и render selection/evidence.

### 39. Детерминированные hashes

Да. Две полные `--clean` сборки: 351 deterministic files, `differingFiles = []`; оба aggregate SHA-256 равны `28d53102494bef0602df3f0b0afe99deeaa9f135140990876919416e419e7450`. Runtime fingerprint обеих сборок: `81bbfbdf1c2d1f26340bcd1318620d5ad9975a2c830ca3ed8552f026d488351f`.

### 40. Тесты с точными количествами

- PS-03.M3 offline QA: 683/683.
- Repository JS/TS tests: 15/15.
- Blender 4.5.3 headless: 273 evidence frames, 0 render failures.
- Browser smoke/interaction: ready state, source/target, FOCUS/GATHER, play/pause, reverse control, 8k/12k/16k LOD, shell/component debug, cameras, 180/96/mobile profiles и reduced-motion.

### 41. Regression PS-03.M2

Да: 470/470 после финальных изменений M3.

### 42. Lint / typecheck / production build

`npm run lint` — pass, 0 warnings/errors проекта; `npm run typecheck` — pass; `npm test` — 15/15; `npm run build` — pass. Новый route `/visual-lab/photonic-skin-m3` prerendered как static page.

### 43. Production main unchanged

Да. Git blob hash `app/page.tsx` остаётся `f2b1b08b22737e886acd407f10b2b7eeb9d8492c`; тест проверяет его автоматически. Production homepage и существующие M2/Photonic Skin routes не интегрировались с M3.

### 44. Ограничения и риски

- 24k/32k имеют аналитические Gate/data estimates, но не фактический browser FPS.
- Browser benchmark выполнен на dev server и одной локальной browser/GPU конфигурации; mobile hardware не измерялся.
- Peak GPU memory, update bandwidth через GPU API, long tasks и p5 FPS не доступны текущей телеметрии.
- High edge-reversal proxy у дальних correspondence указывает на потенциально визуально busy morph, хотя collision/clumping QA проходит.
- Новые композиции и timing не human-approved.
- Остаётся dependency warning `THREE.Clock`; runtime errors отсутствуют.
- Видео не экспортировано; frame strips являются проверяемыми исходниками.

### 45. Готовность к PS-04

Да как инженерная geometry/motion основа: contracts, fixed identity, target-agnostic correspondence, reserve transport, LOD, web buffers, lab и QA завершены. Переход к PS-04 должен быть условным на human review новых composition/motion boards; цвет/material не должен компенсировать непринятый силуэт или движение.

### 46. Минимальный следующий шаг

Провести один human-review проход по `board-compositions.png`, `board-worst-cases.png`, `family-boards/`, ключевым `transition-boards/` и browser split screenshot. Зафиксировать accept/refine только для composition hierarchy и motion timing; после принятия можно начинать PS-04 color/material contract поверх неизменного identity/runtime формата.

## Финальный критерий

Один набор из 16,384 постоянных элементов детерминированно образует MASTER, семь утверждённых SINGLE и универсально собранные COMPLEX/BRAND_WIDE states, а также непрерывно переходит между ними без pair-specific перестановок, frozen topology, предметных веток в core pipeline и преждевременной работы над PS-04.
