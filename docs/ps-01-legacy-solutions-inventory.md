# PS-01 — отголоски старой структуры «Решения»

Дата проверки: 2 августа 2026 года. Этот inventory не является заданием на удаление кода в PS-01.

## Production-код

- `app/_site/site-data.ts` — `solutionLinks` с четырьмя пунктами «Изменения / События / Обучение / HR-brand»; пункт «Решения» остаётся в основной навигации.
- `app/_home/home-data.ts` — четыре старых ситуационных маршрута и ссылки `/solutions/*`.
- `app/_home/HomeHero.tsx` — hero ведёт якорем к `#solutions`.
- `app/_home/HomeNarrative.tsx` — `SolutionsSection`, заголовок «Решения по ситуации» и навигация по четырём ситуациям.
- `app/page.tsx` — `SolutionsSection` по-прежнему включён в production-главную.
- `app/solutions/[slug]/page.tsx` и `app/components.tsx` — production-шаблон, навигация и данные четырёх старых solution pages.
- `app/contact/page.tsx` — select формы использует старые ситуации как варианты верхнего уровня.
- `app/cases/change-project/page.tsx` — кейс ведёт в `/solutions/change` и использует «Изменения» как верхнеуровневый маршрут.
- `app/products/welcome-pack/page.tsx` — cross-sell ведёт в `/solutions/hr-brand`.
- `app/_home/CapabilitiesSection.tsx` и `app/capabilities/capability-data.ts` — отдельные текстовые cross-sell-упоминания HR-brand.

## Внутренние прототипы и документация

- `app/visual-lab/` — предыдущий visual-lab использует четыре клиентские ситуации как fixture. Это не production-навигация, но fixture уже расходится с новой структурой двойного входа.
- `README.md` описывает `app/solutions/[slug]` как шаблон четырёх решений.
- `docs/mimicry_site_ia_prototype_spec_2026-07-31.md` и `docs/mimicry-visual-system-spec-2026-07-31.md` фиксируют предыдущую IA; более новые v0.2/v0.5 документы её переопределяют.

## Граница PS-01

Photonic Skin Lab не импортирует эти данные, не показывает четыре старых «Решения» и не добавляет их в собственную семантику. Перенос production-сайта на двойной вход остаётся отдельным этапом внедрения после PS-01.

