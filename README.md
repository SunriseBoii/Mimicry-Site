# Mimicry group website — local starter

Локальная версия кликабельного low-fidelity-прототипа сайта Mimicry group.
Проект отвязан от ChatGPT Sites и работает как обычное приложение Next.js.

## Требования

- Node.js 20.9 или новее
- npm

## Запуск на Windows

Откройте PowerShell в папке проекта и выполните:

```powershell
npm install
npm run dev
```

Затем откройте <http://localhost:3000>.

Если PowerShell блокирует системный `npm.ps1` своей Execution Policy, используйте Windows-исполняемый файл npm без изменения политики:

```powershell
npm.cmd install
npm.cmd run dev
```

Для остальных команд ниже при той же ошибке также замените `npm` на `npm.cmd`.

## Технические проверки

```powershell
npm run typecheck
npm run lint
npm run build
```

Автоматические тесты пока не настроены: скрипта `test` и файлов тестов в прототипе нет.

## Проверка production-сборки

```powershell
npm run build
npm run start
```

## Где находится сайт

- `app/page.tsx` — главная страница;
- `app/globals.css` — вся low-fidelity визуальная система;
- `app/components.tsx` — общие компоненты и данные решений;
- `app/solutions/[slug]/page.tsx` — шаблон четырёх страниц решений;
- `app/cases/` — реестр и шаблон кейса;
- `app/products/welcome-pack/` — продуктовый лендинг;
- `app/capabilities/merch/` — страница компетенции;
- `app/about/`, `app/procurement/`, `app/contact/` — служебные страницы;
- `docs/` — архитектурная и контентная спецификация.

## Важно

Это структурный прототип v0.1, а не финальный дизайн. Заглушки кейсов,
логотипов, отзывов, метрик, фотографий и закупочных документов намеренные:
их нельзя заменять вымышленными доказательствами.

Форма контакта пока не отправляет данные. До её подключения потребуются
рабочий канал обращения и политика обработки персональных данных.
