# PS-03.M4 — Universal Transition Compiler & Runtime Motion Closure

## Статус

```text
machine-valid: true
visually reviewed by model: true
requires human approval to close PS-03
```

Этот отчёт фиксирует проверяемый результат этапа, но не заменяет human approval и не объявляет художественное закрытие PS-03. M4 оценивает только геометрию движения в изолированном Lab; цвет, материал и production-composition относятся к PS-04.

## Frozen baseline и границы изменений

Работа начата с чистого `master` на commit `7090093`. До первой правки подтверждены:

- PS-03.M2: `470/470` checks;
- PS-03.M3: `683/683` checks;
- JavaScript/TypeScript baseline: `15/15` tests;
- 154 M3 states, 18 proof-v1 routes, `N=16384`, state stride 40 bytes;
- identity-space `ps03m3-identity-v1` (dotted spelling из prompt считается только документальным alias);
- identity fingerprint `81bbfbdf1c2d1f26340bcd1318620d5ad9975a2c830ca3ed8552f026d488351f`;
- M3 deterministic aggregate `28d53102494bef0602df3f0b0afe99deeaa9f135140990876919416e419e7450`;
- M3 manifest SHA-256 `35e60cf…` (полное значение сохраняется в input-guard report).

Frozen Git objects:

| Область | Git object |
| --- | --- |
| `design/photonic-skin/ps-03-m2` | `8644e8eecdaf90e63c53632958634afe068254ab` |
| `design/photonic-skin/ps-03-m3` | `cd9d3716b16c5b44e5093f940cc0ab0d2ffbcf9d` |
| `public/photonic-skin/ps-03-m3` | `7f95fe8988b3d9875d3e13ae1a10eda0d161c0ef` |
| `app/visual-lab/photonic-skin-m3` | `b2dbd053f812e433b2830a637b25bc98d2dbd5ed` |
| `app/page.tsx` | `f2b1b08b22737e886acd407f10b2b7eeb9d8492c` |

Изменения ограничены четырьмя M4-only областями:

- `design/photonic-skin/ps-03-m4` — contracts, compiler/evaluator, build/QA, отчёты, renders и approval pack;
- `public/photonic-skin/ps-03-m4` — только runtime exports текущего deterministic build;
- `app/visual-lab/photonic-skin-m4` — изолированный WebGL2 Lab;
- `tests/photonic-m4-runtime.test.ts` — M4 runtime tests.

M1/M2/M3, production homepage и package configuration не изменяются.

## Что закрывает M4

M3 transition-v1 доказывал persistent identity и воспроизводимый endpoint morph, но использовал фиксированную ось, `min(sourceGroup,targetGroup)`, один глобальный quintic morph и симметричный route hump. На сложных переходах source silhouette быстро терялся, midpoint превращался в почти сферическое неструктурированное облако, target читался поздно, а split/merge выглядел как перераспределение без управляемого neck.

M4 заменяет это universal, target-agnostic программой `global → group → local → reserve`: направление выводится из endpoint geometry, macro routes строятся по `(source shell/group, target shell/group)`, local skin переходит узкой пространственной полосой, reserve перемещается конечным depth-route, а split/merge использует реальные bridge IDs. В compiler/evaluator запрещены ветви по имени state или пары и запрещена pair-specific identity permutation.

## Contracts и бинарный формат

### MotionProfileDefinition

Profile `directed-plastic-release@2.1.0` задаёт trigger/timing variants, семь фаз, actor pose, group coherence, route field, split/merge, reserve, protected features, orientation, scale, settle, retarget, LOD, reduced motion, validation и provenance. Все численные окна и пороги входят в canonical profile hash.

Фазы: `anticipation → release → regroup → reveal → approach → settle → idle-handoff`. Базовые desktop/mobile durations: route/QA `0.98/0.78 s`, preview `0.42/0.36 s`; geometry-risk extension ограничена hard caps `1.35/1.10 s`. Scroll остаётся scrub-driven и не добавляет anticipation.

### TransitionRequest

Request требует ровно один источник: `sourceStateId` или descriptor `sourceSnapshot`; также содержит target, identity-space, profile, trigger, viewport, direction intent (`auto` или explicit vec3), deterministic seed, optional duration override, probe prefix и reduced-motion flag. Canonical request bytes и SHA-256 являются частью provenance.

### TransitionProgram

Program содержит header, routing graph, bridge tracks, два little-endian raw buffers, byte-layout, полный hash chain и provenance. Header фиксирует source/target/profile/trigger/viewport/seed/count/duration, phase policy, activation policy, settle и actor track. Self-transition с равными endpoint record hashes компилируется в настоящий no-op с нулевыми group/per-ID buffers.

| Buffer | Stride | Основные поля |
| --- | ---: | --- |
| Frozen M3 state input | 40 B | position, orientation, normal, scale, status/context |
| M4 group track | 64 B | centers, route control, direction, release/reveal/bridge windows, macros, flags, count |
| M4 per-ID | 32 B | local endpoints, residual, depth, activation window, scale bias, group index, flags, phase offset |

Полный per-ID buffer при `N=16384` занимает `524288 B`; group buffer добавляет `64 × groupCount B`, metadata — canonical JSON. Exact размеры и payload totals берутся из финального manifest/build-performance report.

## Motion semantics

Compiler группирует persistent IDs лексикографически по source/target macro pair, вычисляет weighted centers (active и protected mass), geometry-derived principal axis, spatial group order и bounded route controls. Relation — `preserve`, `regroup`, `split` или `merge`; она определяется только topology/shell counts и macro IDs.

Local handoff имеет span `0.38` и width `0.12`. Для каждого ID `localStart/localEnd` выводятся из packed group windows и `phaseOffset`; quintic C2 alpha смешивает group center и local skin, а compact `64u³(1-u)³` включает route/residual только внутри handoff. Вне окна source/target geometry удерживается точно; endpoint bits восстанавливаются без дрейфа.

Bridge выбирает стабильное bounded subset непомеченных protected IDs (`≤8%`, `≤96` на group). В окне `[0.30,0.72]` transverse local offset относительно directed group axis сокращается до thickness `0.72`, axial extent сохраняется; scale pulse не превышает `3.5%`. Это конечная трубчатая neck geometry, а не opacity mask или отдельные частицы.

Emergence/immersion используют реальные position/scale/activation channels: coherent spatial order смешивает projection и deterministic hash; depth идёт вдоль interpolated normal, scale не падает ниже geometric policy minimum. Protected feature/silhouette IDs получают delayed release, advanced reveal и reduced route amplitude.

Orientation — normalized shortest-path quaternion slerp в тех же local windows; normal выводится transported orientation. Scale — endpoint-exact quintic с bridge pulse и snapshot scale-velocity basis. Actor pose отделён от camera: bounded geometry actor translation/rotation обнуляется на endpoints; camera presets фиксированы и free orbit в M4 отсутствует.

Transient snapshot сохраняет position, velocity, normal, orientation, scale, scaleVelocity, status, component, shell, transitionGroup, flags, reserveDepth, activation, bridge, role и actorPose. Retarget использует quintic Hermite initial-velocity basis; evaluated instantaneous context имеет приоритет, а latest generation защищает от устаревшего load.

Reduced motion устанавливает target geometry на следующем render step, без anticipation/inertia/split animation/idle. LOD — строгий persistent-ID prefix из `[512,1024,2048,4096,8192,12288,16384]`: ID не перенумеровываются, group phase и motion semantics не перекомпилируются по LOD.

## Runtime

Lab `/visual-lab/photonic-skin-m4` использует WebGL2/GLSL3 instancing и один основной skin draw. M3 comparison shader воспроизводит frozen neutral M3-v1 geometry независимо от M4. Source/target states и programs загружаются on demand с AbortController, generation/race gate и bounded LRU (`states=4`, `programs=6`); статические buffers/textures не загружаются каждый frame. Metadata, state records, group/per-ID buffers и aggregate manifest проверяются по SHA-256; integrity/parse/server errors fail closed.

Precompiled approval programs и arbitrary-pair on-demand compile выдают один и тот же Python/TS byte contract. Это подтверждено exact metadata, raw group/per-ID buffers и полным hash-chain для approval artifact и четырёх произвольных route/mobile/reduced/no-op fixtures. Старый независимый compiler сохранён только как явно обозначенный diagnostic fallback с `machineValid=false`; нормальный on-demand path использует exact compiler и имеет `machineValid=true`.

GPU evaluator использует ровно 16 vertex samplers: 8 endpoint, 4 per-ID и 4 group/program textures. Transform-feedback parity probe сравнивает position, orientation, normal, scale, activation, bridge, groupPhase, actor pose и finite-difference velocity на dynamic golden grid, включая phase boundaries `±ε`; отчёт хранит max и p95.

Финальный strengthened WebGL2 probe реально измерен в Chrome 151 / Windows 10 x64, DPR 1.5, ANGLE D3D11 Intel Iris Xe `0xA7A0`, 16 vertex/32 combined texture units. Он выполнил 552 evaluations (46 times × 12 persistent IDs, включая boundaries `±ε`) и дал `valid=true`: max/p95 position `1.7822e-6 / 3.0786e-7`, velocity `7.3266e-3 / 1.5005e-3`, orientation `4.7432e-6 / 2.3783e-7`, normal `8.8529e-6 / 5.1776e-7`, scale `5.1491e-8 / 2.5e-8`, bridge `2.1925e-7 / 0`, groupPhase `8.0362e-7 / 1.7989e-7`, actorPose `5.1569e-7 / 4.0079e-8`. WebGL context loss/restore также измерен как `restored`.

## Machine QA и visual QA

Risk suite содержит 35 directed full-N programs (`≥32`) и 26 coverage categories. Selection использует только measured state metrics: topology, shell/active/reserve delta, aspect/surface change, focus/gather/drive, single/complex/brand/master и reverse families. All-pair probe покрывает все `154 × 153 = 23,562` направленные пары на deterministic nested 512-ID prefix и phase-aware grid; 154 self-transitions проверяются отдельно.

Численные step/rotation/acceleration метрики нормализуются к declared 60 Hz reference и реальной duration; raw irregular-grid jumps сохраняются только как diagnostics. Piecewise C1/C2 проверяется на фактических packed local/activation/bridge/settle/actor boundaries для deterministic 512 IDs и каждого group representative. Silhouette policy использует fixed endpoint-derived bins без border clamping, сообщает out-of-bounds, raw и significant components/orphan ratio и не ослабляется по имени пары.

Final counts, worst pairs, aggregate hashes, browser metrics и две deterministic-build fingerprints заполняются только из последнего clean cycle:

```text
FINAL_CLEAN_QA: machine-valid; 74/74 pass, 0 fail, 0 not measured; full-N 35/35
FINAL_ALL_PAIR_AGGREGATE: 23,562/23,562 directed pairs, 0 failures; empty-failure SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
FINAL_BROWSER_PARITY: Python/TS 552 evaluations plus exact raw-buffer/hash parity; Python/GPU 552 evaluations at 46 times, valid=true, max position 1.782240676873048e-6
FINAL_DETERMINISM_1: 8ebb908374f02801f0b837e2c827a018f12ebbeb8761bbd7d1f9ea5c402497c9
FINAL_DETERMINISM_2: 8ebb908374f02801f0b837e2c827a018f12ebbeb8761bbd7d1f9ea5c402497c9; 220/220 files byte-identical by path/size/SHA-256
FINAL_TEST_COUNTS: M2 470/470; M3 683/683; M4 core 11/11; M4 acceptance 786/786; TypeScript 29/29; typecheck/lint/production build pass
```

Offline renderer создаёт geometry-only source frames во всех mandated times и boundaries, 12 approval boards, dense worst cases, silhouettes, group/bridge debug, selected-ID trails, M3-vs-M4 и all-35 contact sheet. MP4 не заявляется, если ffmpeg недоступен; deterministic frame sequences являются заменой, а отсутствие видео явно отмечается. Финальный visual evidence становится valid только после открытия всех boards/screenshots vision-инструментом уже на последнем aggregate hash.

## Ответы на 58 обязательных вопросов

1. Baseline M1/M2/M3 подтверждён frozen hashes, counts и M3 identity/aggregate, приведёнными выше.
2. Добавлены только четыре перечисленные M4-only области; точный inventory фиксирует final manifest.
3. M2/M3 inputs/hashes не должны измениться; финальный guard сравнивает те же Git objects и M3 content hashes до/после.
4. M4 закрывает M3 cloud/spherical midpoint, поздний target read, fixed-axis route и отсутствие настоящего split/merge neck.
5. `MotionProfileDefinition` — versioned declarative policy всех geometry/timing/runtime аспектов с canonical hash.
6. `TransitionRequest` — exact-one source state/snapshot, target, profile/trigger/viewport/direction/seed и optional overrides.
7. `TransitionProgram` — header + routing/bridge graph + 64 B group + 32 B per-ID buffers + hash chain/provenance.
8. Snapshot сохраняет все geometry, derivative, role/context и actor channels, перечисленные в Motion semantics.
9. Иерархия: actor/global pose → macro group route → per-ID local skin/residual → reserve depth/activation.
10. Group routing выводится из lexicographic source/target shell/group pairs, weighted centers и geometry axis.
11. Фазы перекрываются declaratively; реальное движение определяется packed per-group/per-ID C2 windows, а global phase — inspector label.
12. Timing reconciles PS-02.5 980/780 ms с geometry-risk extension M3, сохраняя hard caps 1.35/1.10 s.
13. Simple/complex/mobile exact durations берутся из final risk report; policy formula описана выше.
14. Split/merge — fan-out/fan-in routing relations плюс bounded real bridge-ID subsets; identity не remap-ится.
15. Bridge/neck — finite C2 transverse contraction до 0.72 толщины с сохранённой axial geometry и exact endpoints.
16. Reserve emergence/immersion — finite normal-depth route, spatial ordering, geometric scale и continuous activation.
17. Feature/silhouette flags задерживают source release, ускоряют target reveal и уменьшают route amplitude.
18. Position — group center/local/residual/depth/settle/actor composition; velocity — seconds-normalized derivative и Hermite carry.
19. Orientation — shortest normalized slerp; normal — transported quaternion basis; endpoints exact.
20. Scale — endpoint quintic + bounded bridge pulse + retarget scale-velocity carry, без opacity masking.
21. Actor pose — отдельный geometry transform; camera motion не участвует в transition program.
22. Target-/pair-specific name branches и per-pair permutations запрещены и проходят AST/source audit.
23. Выполняются ровно 23,562 directed non-self probes.
24. Выполняются 154 self-transitions; каждый обязан быть no-op.
25. Full-N suite: 35 programs, 26 risk categories, selection только по measured state metrics.
26. Worst pairs перечисляет final pair/full-N report; отчёт не скрывает failures.
27. M3/M4 spherical collapse и source/target likeness сравниваются на одинаковых non-MASTER pairs; final means — из clean report.
28. Crossing/collision/clumping сохраняются как aggregate и top worst cases; exact values — из clean report.
29. Group coherence измеряется neighbour distortion, route progression, graph fan-in/out, protected/reverse behavior.
30. Screen/silhouette измеряет expansion, three fixed projections, raw/significant components, orphan и OOB ratios.
31. Reverse — отдельная обратная compile request и descending history сравнение endpoint/all-channel semantics.
32. Scrub — history-independent evaluation одного `t`; повторный `t` обязан быть bit-deterministic.
33. Retarget 25/50/75 проверяет position/velocity/orientation/scale/actor/role continuity из snapshot.
34. Rapid A→B→C→D создаёт последовательные snapshots; load race отдельно защищён generation gate/abort.
35. Reduced motion статичен после первого step и отключает animation channels, но сохраняет exact target.
36. LOD сохраняет исходный persistent-ID prefix и проверяется на независимых sliced inputs, без self-compare.
37. Python/TS parity требует decoded channel errors и raw hashes; Python/GPU — TF max/p95 на boundaries. Final scope: 552 CPU и 552 GPU evaluations, 46 times, 12 persistent IDs; exact arbitrary compiler fixtures покрывают route, mobile/scroll, reduced и no-op.
38. Layout и nominal program size приведены в Contracts; exact byte totals — final manifest.
39. Network/cache/load фиксирует state/program payload bytes, hits/misses, load/compile/upload; значения, не измеренные в browser, не подменяются estimate.
40. Browser performance считается измеренной только для реально запущенных scenarios/environment; targets 60/30 FPS не выдаются за факты.
41. Mobile hardware FPS/video encode и любые недоступные counters остаются `not measured` или explicit estimate.
42. Required named machine checks и их pass/fail/not-measured публикует `ps03m4-qa-summary.json`.
43. Exact final counts: M2 470/470, M3 683/683, M4 core 11/11, M4 acceptance 786/786, TypeScript 29/29; lint, typecheck и production build прошли.
44. Два clean builds считаются совпавшими только при равном aggregate и file-hash closure.
45. Frozen M3 hashes проверяются до и после обоих builds.
46. Lint/typecheck/tests/production build должны пройти; предупреждения не скрываются.
47. Production homepage сохраняет исходный Git object и не импортирует M4.
48. Создаются 12 approval boards, all-35 sheet, diagnostics, browser screenshots и deterministic frames; video — только если реально создано.
49. Vision review открывает все 12 boards, all-35, worst/silhouette/bridge/trails, M3-vs-M4 и browser desktop/mobile/reduced screenshots.
50. Найденные visual failures и generic fixes перечисляются в final visual evidence с hashes итераций.
51. Machine-valid только transitions/scenarios, для которых все mandatory checks measured и pass; fallback subset не может расширять утверждение.
52. Visually reviewed — только final-hash approval pack, фактически открытый model vision.
53. Human должен утвердить directed handoff, silhouette/topology read, neck, reserve и допустимые composition trade-offs.
54. Motion compiler не исправляет плохую endpoint composition, semantic grouping, typography/color/material или content hierarchy.
55. Риски: human taste, unmeasured physical mobile devices, future state distributions и production integration PS-04.
56. После human approval PS-03 можно закрыть технически; artistic closure от имени пользователя не заявляется.
57. Geometry/motion contract можно freeze для PS-04 только после final machine-valid + human approval.
58. Минимальный следующий шаг — открыть approval pack, записать human decision и затем интегрировать неизменённый M4 contract в PS-04 material/composition.

## Evidence index

- `reports/ps03m4-input-guards.json`
- `reports/ps03m4-risk-suite.json`
- `reports/ps03m4-pair-probe-summary.json`
- `reports/ps03m4-self-transition-qa.json`
- `reports/ps03m4-full-n-qa.json`
- `reports/ps03m4-browser-runtime-qa.json`
- `reports/ps03m4-build-performance.json`
- `reports/ps03m4-qa-summary.json`
- `reports/ps03m4-visual-evidence.json`
- `exports/ps03m4-manifest.json`
- `renders/approval-pack/`

Final clean cycle завершён: machine QA и model visual review прошли. PS-03 остаётся открытым до явного human approval; этот отчёт не заявляет художественное закрытие.
