# PS-03.M4.1 — final endpoint rebase handoff

**Итоговый статус: `MACHINE PASS / HUMAN REVIEW REQUIRED`.**

Дата проверки: 2026-08-12. Этап доведён до human-review checkpoint. M4.1 не утверждён человеком, PS-03 не закрыт и переход к PS-04 заблокирован до явного решения пользователя.

## 1. Исходное состояние репозитория

На старте ветка была `master`. Tracked-файлы не имели изменений, но рабочее дерево уже содержало пользовательские untracked-артефакты предыдущих этапов: маршруты, design/public-экспорты и тесты M3.1, M3.1R и старого M4. Они не удалялись, не перемещались и не принимались за изменения M4.1. Реализация M4.1 создана только в новых изолированных путях `ps-03-m4-1`, маршруте Lab M4.1 и отдельном runtime-тесте. Commit не создавался.

## 2. Старый M4 baseline и назначение hash

Старый M4 сохранён как исторический read-only baseline:

- manifest aggregate `8ebb908374f02801f0b837e2c827a018f12ebbeb8761bbd7d1f9ea5c402497c9` — агрегат программ и экспортируемого контракта старого M4;
- build-config `5f91904f…` — замыкание версии схем, профиля, compiler/evaluator и build inputs старого M4;
- motion-profile `8497c32a…` — содержимое старого motion profile;
- frozen endpoint fingerprint `81bbfbdf…` — endpoint-библиотека, к которой был привязан старый M4 до rebase;
- полный guard дерева старого M4 `640e2fb5…`, 1 176 файлов — доказательство отсутствия изменений baseline во время M4.1.

Старый M4 доступен в comparison mode Lab и на отдельном approval board `24-old-m4-vs-m41.png`; его файлы не использовались как новые endpoints.

## 3. Frozen M3.1R

Единственный endpoint source of truth M4.1:

- stage `PS-03.M3.1R`;
- state version `3.1.1`;
- 154 states;
- deterministic fingerprint `0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2`;
- manifest SHA-256 `530ca41e0faecf291ea9f674a7e383ae8739af0bddad578a765a7c264129ea82`;
- identity count 16 384, stride 40;
- full frozen-tree guard `a5004157…`, 491 файл;
- machine approval M3.1R: 0 failures;
- относительно M3.1: 83 Event-состояния изменены в R-патче, 71 non-Event состояние байт-в-байт идентично.

M4.1 build отвергает stale fingerprint, manifest SHA, state hash, state inventory или identity layout. Frozen M3.1R cameras также сохранены: canonical `[2.8,-7.8,4.6]`, alternate `[5.6,-6.4,4.1]`, side `[8.8,0,1.4]`, top `[0.01,-0.01,9.4]`, FOV 33°.

## 4. Архитектура rebase M4 → M4.1

M4.1 не копирует endpoint buffers и не модифицирует M3.1R. Слой состоит из:

1. immutable M3.1R adapter с fingerprint/hash guards;
2. `TransitionRequest` contract;
3. deterministic compiler v2.1, который строит group tracks и per-ID tracks для конкретной пары;
4. evaluator с exact endpoint branches, directed group transport, finite bridge/reserve, settle и retarget snapshots;
5. on-demand browser loader с bounded LRU;
6. isolated Visual Lab и offline/browser evidence;
7. provenance guards для M3.1R, старого M4 и production homepage.

Persistent IDs не перенумеровываются. LOD — только префикс той же identity space. Pair-specific permutation и all-pair матрица запрещены.

## 5. Новый motion profile

- profile name `directed-plastic-release`;
- profile version `2.2.0`;
- schema/compiler family `2.1`;
- SHA-256 `f2f25cb2dd6bddc422f0a6d8961fe677ce0f92e10607fecf8692567b8903f381`;
- build-config hash `d31e66da04589c9a19b7fcbea3fa309199939d918d19c664cecf8c87e4e9f781`.

Profile задаёт directed release/reveal, finite bridge window, reserve immersion/emergence, one-shot settle, desktop/mobile timing, reduced-motion и QA policy. Python и TypeScript используют одну каноническую hash-нормализацию; path-sensitive integer и unit-vector metadata нормализованы без изменения runtime-значений.

## 6. Programs и state/hash closure

Собрано 35 approval programs полного N=16 384. Для каждого manifest связывает:

- program ID и content hash;
- source/target state ID и state hash;
- endpoint fingerprint и manifest SHA M3.1R;
- build-config, profile, schema и byte-layout versions;
- group/per-ID buffers и их SHA-256;
- artifact ID и provenance.

Program-cache key включает program aggregate, build config, endpoint fingerprint, profile hash и artifact ID. Два полных rebuild после фиксации compiler inputs дали одинаковый aggregate:

`a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361`

Финальный manifest SHA-256 после двух одинаковых deterministic-finalize запусков:

`d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441`

Deterministic artifact count — 120; public sync — 112 файлов.

## 7. Endpoint exactness

Exact endpoint contract проверяет 10 raw полей: `position`, `normal`, `orientation`, `scale`, `status`, `flags`, `component`, `shell`, `transitionGroup`, `reserveDepth`.

- 23 562 направленные non-self пары: t=0 exact — 23 562/23 562; t=1 exact — 23 562/23 562;
- 154 self-перехода: 154/154 exact no-op;
- prefix probe: 512 persistent IDs для всех пар;
- full-N endpoint validation: 35/35 programs при N=16 384;
- stale endpoint rejection и state/hash compatibility: PASS.

Evaluator имеет явные exact branches на t=0 и t=1. Ни reserve, ни bridge, ни settle, ни промежуточная ориентация не могут протечь в frozen endpoint frame.

## 8. Reserve corrections

Reserve стал конечным транспортным состоянием, а не opacity-only или случайным облаком:

- activation задаётся per-ID глубиной и согласованным пространственным порядком;
- immersion/emergence проверяются на coherence;
- reserve routes конечны;
- endpoint reserve/bridge contribution равен нулю;
- clumping/collision/silhouette policies проверяются на полном N;
- LOD сохраняет те же persistent IDs и motion semantics.

Проверки `reserve_routes_finite`, `no_visible_reserve_clump`, `immersion_order_spatially_coherent`, `emergence_order_spatially_coherent` и endpoint cleanup входят в 78/78 PASS.

## 9. Bridge corrections

Bridge ограничен коротким phase window и связан с macro-group route. Он имеет конечную геометрию, ненулевую длительность, контролируемую release/reveal staging и гарантированно исчезает к endpoint. `bridge_geometry_finite`, `bridge_timing_valid`, `bridge_count_returns_to_zero_at_endpoint` — PASS на 35 full-N programs и pair probes. Dense промежуточные bridge-кадры остаются намеренно particulate; их эстетическая убедительность вынесена в human review.

## 10. Endpoint micro-particles

Техническая endpoint-пыль устранена не визуальной маской, а exact state handoff. В t=0/t=1 возвращаются исходные raw M3.1R поля, reserve/bridge contribution отсутствует, scale/status/orientation совпадают. Offline boards 21/22 и browser reduced/static кадры подтверждают чистые endpoints и отсутствие residual particles после settle.

## 11. Settle и static idle

Settle — one-shot участок в конце перехода. После границы settle playhead доходит до 1.0, runtime не продолжает residual animation и не держит отдельный idle clock. Кадры t=1, idle +250 ms и idle +1000 ms идентичны. Reduced motion сразу выдаёт статичный t=1. Browser проверка `oneShotSettlesToStaticIdle=true`.

## 12. Timing policy и durations

- desktop base duration 0.98 s, hard cap 1.35 s;
- mobile base duration 0.78 s, hard cap 1.10 s;
- фактический диапазон 35 desktop full-N programs: 1.007792–1.180000 s;
- median: 1.091047 s;
- settle window: `[0.86, 1.00]` нормализованного playhead;
- reduced motion: статичный endpoint, без autoplay.

Timing зависит от измеряемого route risk, но остаётся bounded profile policy. Phase-boundary continuity проверена до/на/после границ.

## 13. Retarget и race protection

Retarget компилируется из transient snapshot текущего persistent-ID состояния. На interruption 25/50/75% максимальная position discontinuity около `6.28e-16`; orientation, scale и velocity discontinuity — 0 в отчёте. Async loading защищён monotonic request token: stale completion не может заменить более новый target. Rapid A→B→C→D прошёл runtime test и browser probe; финальная пара соответствует последнему request. Program/state LRU не растут без границ.

## 14. Production scroll policy

В production semantics scroll не меняет playhead: измерено `productionScrollChangesPlayhead=false`. Scroll scrub разрешён только явным Lab toggle; измеренный Lab scroll изменил playhead до 0.195. M4.1 не импортирован в homepage и не добавлен в пользовательскую навигацию.

## 15. Scrub/playhead correction

Canvas получает один parent `performance.now()` RAF clock. Autoplay, slider drag, reverse, scroll scrub и retarget используют один playhead state machine, а не конкурирующие clocks. Ref и drag-state отделены от React render path. Scrub history-independent и deterministic; drag завершает handoff без скачка, reverse достигает exact endpoints, hidden-tab resume ограничивает elapsed step.

## 16. Responsive Lab

Canvas размерится через `ResizeObserver` без reload и без пересоздания state/program buffers. Измерено:

- desktop CSS 874×398, drawing buffer 1311×597 при DPR 1.5;
- mobile viewport 390: Canvas 373×679;
- embedded 180: 178×179;
- embedded 96: 94×95;
- reduced-motion mobile: статичен на t=1;
- LOD 512 и 16 384 дали одинаковую позицию выбранного persistent ID `[-0.522,0.808,-0.272]`.

## 17. UI control hierarchy

Lab разделяет четыре независимых уровня:

1. algorithm: play/pause, progress, reverse, retarget, route;
2. comparison: M4.1, frozen endpoint/M3.1R, previous M4, side-by-side;
3. device/presentation: desktop/mobile/reduced, LOD и viewport frame;
4. debug: neutral, groups, reserve, features, silhouette и camera preset.

Side-by-side создаёт два Canvas; previous-M4 iframe загружается отдельно. Production homepage и navigation не менялись.

## 18. All-pair QA

Pair probe: 23 562/23 562 directed non-self pairs PASS, 0 failures, 512-ID prefix, exact t0/t1 по 10 endpoint fields. Self probe: 154/154 no-op PASS. Общий endpoint contract включает 23 716 парных/self случаев без отказов. Forbidden target-branch audit: 4 core files, 0 problems.

## 19. Full-N risk suite

35/35 selected risk programs проверены на N=16 384. Для каждого выполнено 59 именованных checks: 2 065/2 065 program-check executions PASS, 0 failures. Покрытие включает master↔single, topology-diverse single↔single, single↔complex, split/merge, focus swap, GATHER↔DRIVE, BRAND_WIDE, Event, reserve-heavy, max shell delta, reverse, screen silhouettes и phase boundaries.

Top-level QA: 78 required, 78 passed, 0 failed, 0 not measured. Статус отчёта `machine-valid`.

## 20. Python / TypeScript / GPU parity

- Python core tests: 11/11 PASS;
- focused TypeScript runtime tests: 14/14 PASS;
- Python↔TypeScript compiler parity: exact по metadata, request hash, group/per-ID bytes и hash, content hash, endpoint fingerprint; 4 arbitrary fixtures PASS;
- CPU golden: 552 evaluations (46 times × 12 IDs), max position error `4.98e-8`;
- WebGL2 transform-feedback: 552 evaluations PASS;
- GPU max/p95 position error `1.210158e-6 / 2.613152e-7`;
- velocity `0.00755759 / 0.00128388`;
- orientation `3.3087e-6 / 2.3729e-7`;
- normal `8.21305e-6 / 4.9319e-7`;
- scale `6.88374e-7 / 2.5e-8`;
- bridge error `0 / 0`.

GPU deviations остаются в заданной float32/runtime policy; parity report — PASS.

## 21. Browser QA

Проверка выполнена на production build в Chrome 151 / Windows, DPR 1.5, WebGL2, Intel Iris Xe через ANGLE D3D11. Измерено:

- context restore: PASS;
- hidden-tab resume: PASS;
- rapid retarget/stale request: PASS;
- reverse/scrub/retarget continuity: PASS;
- production scroll isolation и Lab scroll scrub: PASS;
- responsive Canvas, reduced motion, LOD semantics: PASS;
- previous M4 и side-by-side comparison: PASS;
- console errors: 0;
- console warnings: 4 одинаковых deprecation warnings `THREE.Clock` из bundled Three/Fiber, application errors отсутствуют.

Typecheck, targeted ESLint (0 errors, 0 warnings) и Next production build прошли. Route `/visual-lab/photonic-skin-m4-1` prerendered.

## 22. Performance и readiness

Offline build:

- wall time 271.661 s;
- 35 compiles: median 18.185 ms, p95 25.157 ms, max 36.905 ms;
- manifest 69 854 bytes;
- 35 per-ID buffers: 18 350 080 bytes total, 524 288 bytes/program, stride 32;
- 35 group buffers: 43 456 bytes total, 64–9 216 bytes/program, stride 64;
- approval program assets: 18 863 938 bytes;
- runtime fixture/layout assets: 11 894 730 bytes.

Browser:

- first load 162 ms;
- measured compile 148.4 ms;
- frame median 6.1 ms, p95 7.0 ms, reported 165 FPS;
- 1 main draw, 131 072 triangles, texture estimate 4 MiB;
- GPU reported 32 GiB device memory, 16 vertex / 32 combined texture units;
- state LRU limit 4, program LRU limit 6;
- buffers загружаются on demand и не перезагружаются каждый frame;
- resize не сбрасывает program/state caches;
- slider updates идут через refs/imperative Canvas path;
- rapid requests не накапливаются благодаря latest-token guard.

Cached-load wall time отдельно от browser cache telemetry не измерялся и не засчитывается как PASS; наличие cache hit path и bounded eviction покрыто runtime test.

## 23. Visual QA и циклы исправлений

Финальный offline render: 933 deterministic PNG, 31 approval boards, все просмотрены vision после последнего renderer pass. В пакет явно входят все запрошенные темы: Old M4 vs M4.1, exact source/target, single↔single, single↔complex, focus, GATHER→DRIVE, DRIVE→GATHER, BRAND_WIDE, max shell delta, split/merge, reserve, endpoint cleanliness, Event, retarget 25/50/75, rapid A→B→C→D, desktop/mobile, cameras, silhouettes, debug, browser screenshots, settle и all-risk contact sheet.

Исправленные циклы:

1. canonical Python/TS hashing — устранено расхождение int/bool и unit-vector metadata; rebuild/parity повторены;
2. perspective evidence — точки за камерой исключены, offscreen raster bounded; evidence перерендерен;
3. rapid transient visualizer — snapshot debug binding возвращён в полное 16 384-ID пространство; renderer и весь пакет повторены;
4. browser frame timing — итоговый runtime report обновлён после фактического замера и screenshots пересобраны в approval board.

Видео не создано: `ffmpeg` не найден. Source of truth — deterministic PNG frame sequences. Оставшийся human-review риск: плотные промежуточные finite-bridge участки визуально particulate; endpoint и idle чистые, но характер bridge должен утвердить человек.

## 24. Новый aggregate fingerprint

Финальный M4.1 aggregate:

`a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361`

Он стабилен в двух полных rebuild. Manifest SHA после deterministic QA finalization стабилен в двух finalize запусках: `d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441`.

## 25. Пути

- Lab source: `app/visual-lab/photonic-skin-m4-1/`;
- Lab URL после `npm run dev`: `http://localhost:3000/visual-lab/photonic-skin-m4-1`;
- design manifest: `design/photonic-skin/ps-03-m4-1/exports/ps03m41-manifest.json`;
- public manifest: `public/photonic-skin/ps-03-m4-1/manifest.json`;
- profile: `design/photonic-skin/ps-03-m4-1/motion-profiles/directed-plastic-release.profile.json`;
- QA summary: `design/photonic-skin/ps-03-m4-1/reports/ps03m41-qa-summary.json`;
- browser report: `design/photonic-skin/ps-03-m4-1/reports/ps03m41-browser-runtime-qa.json`;
- visual report: `design/photonic-skin/ps-03-m4-1/reports/ps03m41-visual-evidence.json`;
- approval boards: `design/photonic-skin/ps-03-m4-1/renders/approval-pack/`;
- deterministic source frames: `design/photonic-skin/ps-03-m4-1/renders/source-frames/`;
- browser screenshots: `design/photonic-skin/ps-03-m4-1/renders/browser/`;
- tests: `design/photonic-skin/ps-03-m4-1/tests/` и `tests/photonic-m41-runtime.test.ts`.

## 26. Ограничения

- Human approval отсутствует; machine PASS не закрывает PS-03.
- Dense bridge/plastic release должен быть оценён эстетически на desktop и mobile.
- ffmpeg отсутствует, поэтому видео нет.
- Browser cached-load wall time и JS heap delta не сняты отдельными числовыми probes; они не заявлены как измеренные PASS.
- Четыре bundled Three/Fiber deprecation warning не влияют на runtime, но остаются в browser log.
- Реализация намеренно изолирована от production homepage; readiness не равна integration approval.

## 27. Human-review checklist

Открыть `/visual-lab/photonic-skin-m4-1`, затем проверить:

1. Начинаются и заканчиваются ли переходы в утверждённых M3.1R states?
2. Не возвращаются ли прежние композиции и master-core?
3. Сохранился ли принятый язык движения M4?
4. Исчезли ли endpoint-пыль и точки?
5. Не выглядит ли reserve случайным облаком?
6. Выглядит ли bridge как короткая связующая шейка?
7. Успокаивается ли объект один раз и затем полностью останавливается?
8. Сохраняется ли исправленный Event?
9. Плавно ли работает Play?
10. Плавно и детерминированно ли работает Scrub?
11. Корректен ли Reverse?
12. Корректны ли retarget 25/50/75?
13. Не ломается ли rapid A→B→C→D?
14. Восстанавливается ли Lab после resize без reload?
15. Понятно ли разделены algorithm, comparison, device и debug?
16. Приемлемы ли desktop/mobile timing?
17. Можно ли заморозить весь PS-03 для перехода к PS-04?

До положительного ответа PS-03 остаётся незакрытым.

## 28. Явные подтверждения

```text
M3.1R не изменялся.
Старый M4 сохранён.
PS-04 не начинался.
Production-сайт не интегрировался.
Commit не создавался.
Deploy не выполнялся.
```

**MACHINE PASS / HUMAN REVIEW REQUIRED**
