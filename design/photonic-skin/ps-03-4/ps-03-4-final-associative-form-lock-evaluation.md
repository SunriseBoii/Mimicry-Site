# PS-03.4 — Final Associative Form Lock / D-R2

Дата production pass: 2026-08-03  
Blender: 4.5.3 LTS  
Направление: только `D`  
Итоговый статус: **TECHNICALLY VALID BEST-EFFORT / NOT LOCKED**

## 1. Краткий результат

Создана отдельная D-R2 production-система с 21 candidate state, пятью содержательными refinement-циклами, семью обновлёнными `SINGLE`, authoring/production `.blend`, отдельным GLB, D-only Blender-рендерами и полным техническим validation. Технический контракт пройден: endpoints, 66/66 direct pairs, четыре retarget-цепочки, 72/72 additive states, Blender reimport и Three.js r185.

Безымянный visual gate не пройден. Ни один target не достиг одновременно `90/100` и object readability `22/25`; `CONTENT / DIGITAL / GAMES` недостаточно различимы в 96 px. Поэтому формы не объявляются финально locked или утверждёнными пользователем.

## 2. Только направление D

В PS-03.4 не создавались и не использовались новые формы направления A, A→D boards или гибрид A/D. Визуальная работа велась только по линии `PS-03.3 D-R1 → PS-03.4 D-R2`.

## 3. Изученные обязательные источники

- `docs/mimicry_photonic_skin_object_associative_research_2026-08-03.md`;
- `docs/mimicry_photonic_skin_ps02_5_spec_2026-08-03.md` в части topology, runtime, motion-state и единого актёра;
- итоговый отчёт, два `.blend`, GLB, восемь обязательных JSON-протоколов и четыре production-скрипта PS-03.3;
- все 22 пути доказательных материалов, прямо указанные отчётом PS-03.3;
- 209 PNG PS-03.3 открыты и проверены на читаемость; 11 JSON корректно разобраны.

## 4. Разрешение hash-конфликта

Исходное ТЗ содержало устаревший `MASTER position hash` `2cd522cd…fc89bd8`. Пользователь подтвердил канонический фактический baseline PS-03.3:

`54af439e6a4ce68f87fcfa20f8ef3d9c124aa62b416d8c29569fd37a18c55469`.

Hash пересчитан непосредственно из production `.blend` PS-03.3 сериализацией `x,y,z` с восемью знаками после запятой и `;` между вершинами. Получено точное значение `54af…5469` для 8 322 вершин. Разрешение конфликта записано в manifest, technical validation и checksum-протокол.

## 5. Почему D-R1 не достиг предметной читаемости

D-R1 сохранял единый живой Mimic Core, но предметные cues были вторичны относительно общего blob-силуэта. `CONTENT` уходил в shell/chair/mouth, `DESIGN` — в bowl/drapery, `EVENT` — в volcano/mushroom/flower, `GAMES` оставался generic field, `VIDEO` напоминал car/capsule, `DIGITAL` терял routes/nodes, `MERCH` — wrap/overlap. В 96 px различия ridge-пластики исчезали быстрее, чем распределение массы.

## 6. Что сохранено неизменным

Координатно идентичны PS-03.3:

- `MASTER`;
- `BRAND_WIDE`;
- `COMPLEX_FOCUS`;
- `COMPLEX_GATHER`;
- `COMPLEX_DRIVE`;
- `TRANSITION_TENSION`.

Также сохранены 8 322 authoring-вершины, 8 480 faces, 16 800 edges, 16 640 triangles, vertex order, topology, connectivity, UV, mask membership, 2 526 mask faces и target order.

## 7. Candidate-authoring и refinement

Для каждого SINGLE созданы три реально различающихся coordinate states:

1. `v1` — archetypal silhouette;
2. `v2` — mass distribution и constructive cue;
3. `final D-R2` — medium plasticity, photonic ridge и endpoint-safe refinement.

Итого `7 × 3 = 21` candidate states. Они сохранены в authoring workbench и `renders/candidates/`, но отсутствуют в production GLB.

Проведены пять содержательных циклов:

1. macro-profile и candidate amplitude;
2. отказ от общей D-R1 body-normalization, сохранявшей blob;
3. непрерывные folio/palette/roof/board/screen/substrate/wrap surface architectures;
4. устранение foldover, local collapse и mask-area отклонений;
5. финальный canonical/top/side/96 px gate и минимальный additive-envelope запас.

## 8. Финальные candidates и причины выбора

`final D-R2` выбран у всех семи targets как наиболее технически устойчивый вариант с максимальной предметной дистанцией от D-R1. Более сильные surface варианты давали более буквальные признаки, но создавали normal inversion, collapse или self-intersections и были отвергнуты. Выбор является техническим best-effort, не visual lock.

## 9. Разбор семи SINGLE

| Target | Намеренное поле | Крупный признак | Ближайший ошибочный образ | Gate |
|---|---|---|---|---|
| `CONTENT` | Editorial Folio | два связанных верхних поля и центральный fold | shell / chair / mouth | NOT LOCKED |
| `DESIGN` | Forming Palette | широкая рабочая зона, узкая сторона и counter-torsion | bowl / shell / drapery | NOT LOCKED |
| `EVENT` | Gathering Canopy | смещённый apex и широкие roof planes | volcano / mushroom / flower | NOT LOCKED |
| `GAMES` | Decision Field | общий вход, три расходящихся routes и decision zones | generic field / controller / crown | NOT LOCKED |
| `VIDEO` | Frame Sweep | мягко-прямоугольная поверхность и один temporal edge | car / capsule / airfoil | NOT LOCKED |
| `DIGITAL` | Routing Substrate | Y-convergence, два широких nodes и output shoulder | generic relief / alien hardware | NOT LOCKED |
| `MERCH` | Wrapped Parcel | soft block core и непрерывный diagonal overlap | capsule / stone / case | NOT LOCKED |

## 10. CONTENT / DIGITAL / GAMES

Геометрическая грамматика разведена:

- `CONTENT` — two-field fold;
- `DIGITAL` — convergence в output shoulder;
- `GAMES` — divergence от одного entry к нескольким решениям.

В neutral top view routes различимы, но black 96 px silhouettes остаются слишком близкими. Обязательное условие уверенного разделения не выполнено.

## 11. Контроль DESIGN / EVENT / VIDEO / MERCH

- `DESIGN`: стал площе и асимметричнее D-R1, но palette-field без подписи слаб.
- `EVENT`: радиальная flower/volcano-логика снижена, но canopy roofline недостаточно доминирует.
- `VIDEO`: soft rectangle заметно сильнее отделён от D-R1; это наиболее читаемый D-R2 endpoint, но риск capsule остаётся.
- `MERCH`: масса стала блоковой, overlap существует в surface flow, но 96 px теряет wrap.

## 12. Безымянный visual gate

Файл: `renders/ps03-4_d_only_unlabelled_lock_board.png`.

Случайный фиксированный порядок, только номера `01–07`, одинаковые camera/material/light/exposure/orientation, neutral render + 180 px + 96 px. Answer key вынесен отдельно. Внутренний просмотр показал, что правильные поля нельзя надёжно восстановить без подписей. Gate: **fail / NOT LOCKED**.

## 13. Оценки

| Target | Echo /25 | DNA /20 | Distinct /15 | Morph /15 | B2B /10 | Mobile /10 | Safe /5 | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| CONTENT | 18 | 19 | 13 | 14 | 9 | 8 | 4 | **85** |
| DESIGN | 15 | 19 | 13 | 14 | 9 | 7 | 4 | **81** |
| EVENT | 15 | 19 | 13 | 14 | 9 | 7 | 3 | **80** |
| GAMES | 14 | 19 | 13 | 14 | 9 | 7 | 4 | **80** |
| VIDEO | 19 | 19 | 14 | 14 | 9 | 8 | 4 | **87** |
| DIGITAL | 16 | 19 | 14 | 14 | 9 | 7 | 4 | **83** |
| MERCH | 17 | 19 | 13 | 14 | 9 | 7 | 4 | **83** |

Ни один target не прошёл пороги `90/100` и readability `22/25`.

## 14. Mobile 390

Созданы отдельные 390×844 crops всех 12 terminal states без дополнительных mobile shape keys. Framing наследует baseline PS-03.3. Mobile board существует и технически корректен; visual readability остаётся ниже lock threshold.

## 15. Endpoint validation

Технический итог: `pass` для `MASTER` и всех 11 terminal states.

- vertices `8 322`;
- faces `8 480`;
- edges `16 800`;
- triangles `16 640`;
- connected components `1`;
- boundary/non-manifold edges `0`;
- degenerate triangles `0`;
- inverted/folded faces `0`;
- non-adjacent self-intersections `0`;
- finite coordinates `true`;
- connectivity hash `8883e7698bbd3a6aafef5a4a8a4ea5f04ee96d7ad7cc41cee841a94986e1e462`;
- UV hash `c5eff463ac2b978f0470e1fef6fffc4eb5a01fe06f66262b3effba5518e67683`;
- mask hash `67c2dd582fcbdb25d9905b98357340c7313292bfb20db6fdd5675e88d1f71c58`.

## 16. Все 66 direct pairs

Итог: `66/66 pass`. Каждая пара проверена по 11 состояниям; 18 risk/automatic pairs — по 45 состояниям. Non-MASTER interpolation использует веса `1-t` и `t`, без возврата через MASTER. Self-intersection, normal inversion, collapse, degenerate и bbox failures в финальном прогоне отсутствуют.

Обязательные 11 associative risk pairs включены, включая `CONTENT↔DIGITAL`, `CONTENT↔GAMES`, `DESIGN↔MERCH`, `EVENT↔GAMES`, `EVENT↔COMPLEX_GATHER`, `VIDEO↔COMPLEX_DRIVE`, `DIGITAL↔COMPLEX_FOCUS`, `BRAND_WIDE↔MERCH`, `DESIGN↔EVENT`, `GAMES↔DIGITAL`, `VIDEO↔MERCH`.

## 17. Retarget

Итог: `4/4 chain pass`; switching `25%`, `50%`, `75%`; current blended snapshot сохраняется как новый source; coordinate jump на switch равен нулю.

## 18. Additive

`TRANSITION_TENSION` координатно идентичен PS-03.3. Итог: `72/72 pass`, включая 24 runtime states при `0.04/0.06`.

Первый прогон выявил только два пограничных bbox failures при `0.06` у VIDEO/DIGITAL (`Y fill = 0.8788`). SINGLE endpoints получили минимальный запас `0.88 → 0.89`; additive target не менялся; полный validation пересчитан.

## 19. Photonic mask

Face set неизменен: `2 526`, hash прежний. Terminal physical-area ratio:

- min `32.2249%`;
- max `35.5814%`;
- mean `34.2065%`.

Все endpoints находятся в target range `32–36%`.

## 20. Blender reimport

Итог: `pass`.

- one actor mesh;
- indexed surface;
- runtime vertices `8 692` после UV/normal splits;
- triangles `16 640`;
- 12 relative morph targets, имена и order exact;
- UV, `_PHOTONIC_MASK`, `_PHOTONIC_SLOT` присутствуют;
- one-hot bounds pass.

Runtime vertex count совпадает с PS-03.3.

## 21. Three.js r185

Итог: `pass`, revision `185`.

- GLTFLoader success;
- one indexed mesh;
- 8 692 runtime vertices;
- 16 640 triangles;
- 12-entry `morphTargetDictionary`, order exact;
- all one-hot states pass;
- all 66 direct pairs pass;
- four retarget chains pass;
- 72 additive samples pass;
- bounds/finite/NaN pass.

## 22. GLB

Файл: `exports/photonic-skin-c-r1-d-r2-final-morph-system.glb`  
Размер: `3 112 112` bytes (`≈2.97 MiB`)  
SHA-256: `da8fb91ec88301e06ece3cd511e3a0de0dfa317807995d1573fe12767cca2fef`.

Структура: `Scene → MimicCoreRoot → MimicCoreMesh`, один indexed primitive, neutral PBR, POSITION/NORMAL/TANGENT/TEXCOORD_0, два custom attributes и 12 relative morph targets. Нет cameras, lights, candidates, diagnostics или animations. Небольшая разница размера относительно PS-03.3 объясняется новыми SINGLE position/normal morph deltas при неизменном runtime vertex count.

## 23. Checksums PS-03.3

До и после проверены все `228` файлов PS-03.3. Полные snapshots идентичны: `unchanged = true`. PS-03.3 не открывался на запись, не пересобирался и не изменялся.

## 24. Остаточные визуальные риски

Главный blocker — macro-silhouette семи состояний остаётся недостаточно предметным, особенно в 96 px. Local routes/folds видны в top/neutral, но не становятся независимым семантическим кодом. Усиление признаков в текущем pass упиралось в foldover/self-intersection/local-collapse до достижения требуемой читаемости.

Технически безопасное продолжение потребует нового визуального authoring pass с более радикальным перераспределением ring cross-sections или пересмотра ограничения canonical fill; это отдельное решение, а не скрытая корректировка готового lock.

## 25. Воспроизведение в Windows PowerShell

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --python 'design\photonic-skin\ps-03-4\scripts\build_ps03_4.py'

& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --python 'design\photonic-skin\ps-03-4\scripts\validate_ps03_4.py'

node 'design\photonic-skin\ps-03-4\scripts\validate_ps03_4_runtime.mjs'

& 'C:\Users\MSI_NB\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' 'design\photonic-skin\ps-03-4\scripts\compose_ps03_4.py'
```

## 26. Главные артефакты

- `blender/ps-03-4-d-r2-authoring-workbench.blend`;
- `blender/photonic-skin-c-r1-d-r2-final-morph-system.blend`;
- `exports/photonic-skin-c-r1-d-r2-final-morph-system.glb`;
- `exports/ps03-4-target-manifest.json`;
- `exports/ps03-4-association-evaluation.json`;
- `exports/ps03-4-technical-validation.json`;
- `exports/ps03-4-pairwise-validation.json`;
- `exports/ps03-4-retarget-validation.json`;
- `exports/ps03-4-additive-validation.json`;
- `exports/ps03-4-glb-reimport-validation.json`;
- `exports/ps03-4-three-runtime-validation.json`;
- `exports/ps03-4-composition-metadata.json`;
- `exports/ps03-4-ps03-3-checksums.json`;
- семь обязательных D-only boards и candidate boards.

## 27. Что проверять пользователю

Сначала открыть только `renders/ps03-4_d_only_unlabelled_lock_board.png`, не открывая answer key, и записать первое предметное впечатление для номеров `01–07`. Затем открыть `renders/ps03-4_d_only_answer_key_board.png` и сравнить ответы.

Для формального закрытия PS-03 пользователь должен явно подтвердить, что все семь номеров без подписи дают правильные предметные поля. Текущий внутренний gate такого подтверждения не рекомендует.

## 28. Однозначный статус PS-03

Техническая production-часть D-R2 воспроизводима и полностью прошла validation. Финальный associative form lock не достигнут. PS-03 остаётся **не закрытым**, PS-04 начинать преждевременно.
