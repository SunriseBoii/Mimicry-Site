# PS-04.M5.3.R1 — Clapperboard Anatomy and Hinge Contract

## 0. Document status

```text
documentId: PS04-M53R1-CLAPPERBOARD-ANATOMY
version: 1.0.0
status: OWNER-DIRECTED SOURCE OF TRUTH
language: Russian with stable English component identifiers
scope: clapperboard geometry and its visual/mechanical readability only
chosenOpenAngle: 30 degrees
```

Этот документ предназначен для чтения и анализа AI-агентом перед доработкой предметного состояния `Video` в Photonic Skin — Mimic Core.

Он описывает, **как должна быть устроена и выглядеть кинохлопушка**, и является нормативным source of truth для этапа `PS-04.M5.3.R1`.

Документ не выбирает финальный yaw всей композиции Video, не меняет камеру сайта, не утверждает canonical Video и не описывает framing.

---

## 1. Краткое определение предмета

Кинохлопушка — это **единый механически связанный предмет**, состоящий из:

1. прямоугольной информационной доски (`slate-board`);
2. неподвижной узкой верхней рейки (`slate-fixed-rail`), соединённой с доской;
3. подвижного ударного бруска (`slate-hinged-bar`);
4. видимого углового шарнира (`slate-hinge`), который соединяет неподвижную рейку и корневой конец подвижного бруска.

Подвижный брусок поднят над неподвижной рейкой на **30°**. Он не висит отдельно и не парит над доской. Его корневой конец физически входит в шарнир, а клиновидный просвет между рейкой и бруском начинается непосредственно после шарнира и постепенно увеличивается к свободному концу.

Ключевой визуальный образ:

```text
одна доска
+ узкая рейка вдоль её верхнего края
+ узкий подвижный брусок, раскрытый на 30°
+ общий шарнир в верхнем углу
= кинохлопушка
```

---

## 2. Почему текущая M5.3-геометрия неверна

На review-кадрах M5.3 подвижный брусок выглядит отдельным горизонтальным островом над доской. Между ним и доской нет читаемого механического контакта.

Основные ошибки:

- брусок смещён целиком в пространство до поворота;
- он повёрнут вокруг собственного центра, а не вокруг шарнира;
- использована неверная или визуально неверно выраженная ось вращения;
- корневой конец бруска не совпадает с центром шарнира;
- маленький выступ на доске существует отдельно, но не связывает детали;
- просвет одинаково воспринимается вдоль всего бруска вместо клина, сходящегося к нулю у pivot;
- в silhouette хлопушка распадается на два объекта.

Наличие metadata `parentComponentId`, `connectivityRole: attached` или `attachmentBlend` само по себе не является доказательством соединения. Пространственная геометрия обязана показывать реальный контакт.

---

## 3. Нормативная анатомия

### 3.1. Slate board

`slate-board` — основная прямоугольная доска с немного скруглёнными углами.

Требования:

- альбомная ориентация: ширина больше высоты;
- рекомендуемое отношение `width : height = 1.45–1.70`;
- небольшая, но видимая толщина;
- доска является единой массой, а не рамкой и не двумя створками;
- верхняя грань доски образует опору для fixed rail;
- узнаваемость не зависит от текста, полос или цветовых зон.

Нормализованные пропорции при `boardWidth = 1.0`:

```text
boardHeight:    0.59–0.69
boardThickness: 0.06–0.11
cornerRadius:   0.025–0.055
```

### 3.2. Fixed rail

`slate-fixed-rail` — узкая неподвижная рейка вдоль верхнего края доски.

Требования:

- длина примерно равна ширине доски;
- высота значительно меньше высоты доски;
- рейка пространственно пересекается или плотно соприкасается с верхней частью доски;
- рейка не является второй «страницей»;
- у hinge-side край рейки формирует основание шарнира.

Рекомендуемые пропорции:

```text
railLength:    0.94–1.02 × boardWidth
railHeight:    0.12–0.18 × boardHeight
railThickness: примерно boardThickness
```

### 3.3. Hinged bar

`slate-hinged-bar` — узкий подвижный ударный брусок.

Требования:

- длина сопоставима с fixed rail;
- брусок существенно уже доски по высоте;
- его корневой конец находится внутри hinge envelope;
- свободный конец поднят;
- брусок является одной цельной вытянутой массой;
- брусок не должен напоминать отдельную полку, крышку, вторую доску или страницу книги.

Рекомендуемые пропорции:

```text
barLength:    0.92–1.00 × boardWidth
barHeight:    0.12–0.18 × boardHeight
barThickness: 0.85–1.20 × railThickness
```

### 3.4. Hinge

`slate-hinge` — обязательный геометрический узел в одном верхнем углу доски.

Он может быть представлен коротким цилиндром, capsule/knuckle или компактным smooth-union узлом, но обязан:

- пересекаться с fixed rail;
- пересекаться с корневым концом hinged bar;
- находиться на hinge-side, а не в центре доски;
- иметь достаточно частиц и толщины для чтения на 180 px;
- не выглядеть декоративным штырём, не связанным с бруском;
- не становиться третьим отдельным island.

Допустимый hinge-side: левый верхний угол в локальной системе доски. Если композиция требует зеркального варианта, допускается правый угол, но все формулы и визуальные проверки должны быть зеркально согласованы.

---

## 4. Локальная система координат хлопушки

Сначала конструкция собирается в **локальной системе доски**, и только после этого вся хлопушка получает transform внутри композиции Video.

Определения:

```text
u = локальная горизонтальная ось вдоль ширины доски и брусков
v = локальная вертикальная ось доски
n = локальная нормаль к плоскости доски
```

Для текущей ориентации authoring pipeline ожидается примерно:

```text
u ≈ local +X
v ≈ local +Z
n ≈ local ±Y
```

Точная ось после `canonicalTransform` должна вычисляться матрицей, а не подменяться world-axis.

Шарнир расположен в точке `H` около верхнего hinge-side угла.

Ось вращения подвижного бруска проходит через `H` вдоль `n`, то есть **перпендикулярно плоскости доски**. Брусок вращается в плоскости `u–v`.

Запрещено вращать брусок вокруг его длинной оси `u`: это лишь перекручивает толщину и не поднимает свободный конец.

---

## 5. Pivot-aware construction

Подвижный брусок должен строиться от шарнира, а не через произвольный `translate` его центра.

### 5.1. Закрытое направление

В закрытом состоянии направление бруска:

```text
d0 = +u
```

### 5.2. Открытое направление

Выбранный угол раскрытия:

```text
alpha = 30 degrees
```

Открытое направление:

```text
d = rotate(d0, axis=n, pivot=H, angle=signedAlpha)
```

Знак `signedAlpha` выбирается так, чтобы:

```text
dot(d, v) > 0
```

То есть свободный конец обязан подниматься в локальном направлении `+v`.

### 5.3. Центр и концы бруска

Пусть:

```text
L = полная длина бруска
overlap = 0.035–0.065 × L
```

Тогда:

```text
barCenter = H + d × (L / 2 - overlap)
barRoot   = barCenter - d × L / 2
barTip    = barCenter + d × L / 2
```

Обязательные условия:

```text
distance(barRoot, H) <= overlap + numericTolerance
barTipHeight > barRootHeight
barTipHeight - barRootHeight ≈ L × sin(30°)
```

Небольшое проникновение `barRoot` в hinge допустимо и желательно: оно гарантирует механическую связность в частичной/чешуйчатой геометрии.

Нельзя сначала выставить центр бруска далеко от доски, а затем вращать его вокруг собственного центра.

---

## 6. Визуальная топология

Правильная хлопушка должна одновременно выполнять два условия:

### 6.1. Один связанный предмет

```text
board ↔ fixed rail ↔ hinge ↔ hinged bar
```

В области шарнира нет видимого разрыва.

### 6.2. Открытый клин

После hinge между fixed rail и hinged bar появляется triangular wedge:

- у шарнира зазор равен нулю или почти нулю;
- по мере движения к свободному концу зазор плавно увеличивается;
- свободный конец не касается fixed rail;
- открытый просвет остаётся видимым в canonical и alternate view.

Связность у шарнира и просвет вдоль остальной длины не противоречат друг другу.

---

## 7. Photonic Skin implementation contract

Все части хлопушки остаются частями одного Mimic actor.

Запрещено создавать отдельный runtime Mesh для бруска или шарнира.

Сохраняются:

```text
1 Canvas
1 actor
1 InstancedMesh
1 RawShaderMaterial
1 OctahedronGeometry
1 draw call
N = 16384
persistent IDs
LOD-prefix contract
```

Допускаются отдельные semantic component IDs:

```text
slate-board
slate-fixed-rail
slate-hinge
slate-hinged-bar
```

Если `slate-hinge` остаётся частью `slate-fixed-rail`, authoring и reports всё равно должны выделять отдельную hinge mask для проверки.

Для каждого компонента обязательны непустые `visibleProfiles`:

```text
desktop
mobile390
silhouette180
silhouette96
```

Нельзя доказывать связность только через offline `force_visible`.

Чешуйки в hinge/root area должны иметь сопоставимый projected footprint с board/rail. Шарнир не должен состоять из редких точек.

---

## 8. Геометрические machine gates

### 8.1. Pivot proof

Сохранить численное доказательство:

```text
hingePoint
rotationAxis
signedOpenAngle
barRoot
barCenter
barTip
rootToHingeDistance
tipRise
expectedTipRise
pivotError
```

### 8.2. Connectivity proof

Для clapper-only cloud проверить:

- board касается fixed rail;
- fixed rail касается hinge;
- hinge касается bar root;
- нет remote islands;
- moving bar не является отдельной connected component;
- hinge и bar присутствуют на каждом LOD prefix.

Рекомендуемый критерий spatial contact:

```text
minimumDistance(barRootCloud, hingeCloud)
  <= 1.25 × medianNearestNeighbourSpacingInHinge
```

Проверить также voxel/SDF overlap до sampling.

### 8.3. Screen-space proof

В canonical и alternate final-material render:

- clapper assembly воспринимается одним предметом;
- hinge contact имеет ненулевое pixel overlap/adjacency;
- hinged bar не образует отдельный silhouette island;
- wedge после hinge остаётся открытым;
- barTip находится выше barRoot;
- bar не выглядит горизонтально парящим.

На 180 px хлопушка должна оставаться одной основной connected silhouette. На 96 px допускается упрощение hinge, но бар не должен превращаться в отдельный остров.

---

## 9. Визуальные anti-patterns — автоматический FAIL

Любой из следующих признаков означает FAIL:

- брусок полностью отделён от доски;
- между hinge и bar root виден чёрный зазор;
- брусок параллелен верхней рейке при заявленном open state;
- брусок повёрнут вокруг собственного центра;
- брусок повёрнут вокруг длинной оси;
- маленький hinge-штырь остаётся на доске отдельно от бруска;
- хлопушка состоит из двух silhouette islands;
- брусок напоминает парящую полку;
- доска и брусок выглядят как две равные страницы книги;
- клиновидный просвет начинается уже у шарнира с большим разрывом;
- связь существует только в diagnostic colors, но исчезает в final material;
- связность появляется только после искусственной dilation/morphological closing;
- component присутствует offline, но схлопнут packed activation в браузере.

---

## 10. Human-review target

Владелец должен увидеть без подписи:

> Прямоугольную кинохлопушку, у которой узкий верхний ударный брусок прикреплён шарниром в верхнем углу и немного поднят перед хлопком.

Желаемое ощущение:

- один компактный предмет;
- понятная механика раскрытия;
- угол небольшой, а не театрально распахнутый;
- брусок готов опуститься на fixed rail;
- форма работает без текста и цветных диагональных полос.

Выбранный угол `30°` является целевым для R1. Не создавать новую yaw/open-angle матрицу без отдельной директивы владельца.

---

## 11. Обязательные evidence renders

Для R1 необходимы одинаковые camera/scale/crop:

1. M5.3 original combo-30 — current detached bar.
2. M5.3.R1 combo-30 — corrected hinge.
3. Clapper-only canonical final material.
4. Clapper-only alternate final material.
5. Clapper-only side view.
6. Hinge close-up final material.
7. Hinge close-up diagnostic colors.
8. Closed-position ghost/reference overlay, только как диагностика кинематики.
9. Silhouette 180 px.
10. Silhouette 96 px.
11. LOD 512…16384.
12. Full camera + clapper composition Light/Dark.

Основное принятие выполняется по `settled + final material`, не по component colors.

---

## 12. Compact machine-readable contract

```yaml
object: clapperboard
stage: PS-04.M5.3.R1
openAngleDegrees: 30
assembly:
  connected: true
  chain:
    - slate-board
    - slate-fixed-rail
    - slate-hinge
    - slate-hinged-bar
localAxes:
  width: u
  vertical: v
  boardNormal: n
hinge:
  location: upper hinge-side corner
  axis: n
  intersectsFixedRail: true
  intersectsBarRoot: true
movingBar:
  rotatesAround: hinge pivot
  rotationPlane: u-v
  freeEndDirection: upward along +v
  detachedIslandAllowed: false
wedge:
  gapAtHinge: approximately zero
  gapTowardTip: monotonically increasing
runtime:
  extraMeshAllowed: false
  oneActor: true
  oneDraw: true
acceptance:
  canonicalConnected: true
  alternateConnected: true
  silhouette180Connected: true
  silhouette96DetachedBar: false
  resemblesBook: false
  resemblesFloatingShelf: false
```

---

## 13. Reference anatomy

Использовать только общую предметную анатомию, не копируя конкретный промышленный дизайн:

- Denecke TS-C product family: https://www.denecke.com/Products/products.html
- Ambient LockitSlate Take 2: https://ambient.de/en/products/acn-ls2-lockitslate-take-2-timecodeklappe

Устойчивая схема реальных хлопушек: основная slate-доска, неподвижная верхняя часть и подвижный узкий clapper stick, механически соединённый шарниром у одного края.

