# AeroSpeak — бекенд

API вебзастосунку AeroSpeak для тренування англомовної авіаційної радіотелефонії
(VFR, фразеологія ICAO/EASA). Користувач слухає диспетчера, відповідає голосом і
отримує автоматичну оцінку з поясненням помилок.

**Стек:** NestJS 11, TypeScript, PostgreSQL (Neon) + Prisma, Firebase Authentication, Deepgram (STT), zod, Swagger.
Деплой — Render (Frankfurt), фронтенд — окремий репозиторій на Vercel.

Ключові архітектурні рішення описані в [`CLAUDE.md`](./CLAUDE.md).

## Перший запуск

1. Встановити залежності точно за `package-lock.json` (заодно згенерується Prisma Client):

   ```bash
   npm ci
   ```

2. Скопіювати `.env.example` у `.env` і заповнити:
   - `DATABASE_URL` і `DIRECT_URL` — рядки підключення з Neon (pooled і direct);
   - `DEEPGRAM_API_KEY` — ключ із консолі Deepgram;
   - `FIREBASE_PROJECT_ID` — id проєкту Firebase (не секрет);
   - `FIREBASE_WEB_API_KEY` — необовʼязково, лише для `npm run dev:token` (Firebase console → Project settings).

3. Застосувати наявні міграції до своєї бази (якщо база вже актуальна, команда нічого не змінить):

   ```bash
   npx prisma migrate deploy
   ```

4. Запустити:

   ```bash
   npm run start:dev
   ```

   Swagger UI: http://localhost:3000/docs, OpenAPI-схема: http://localhost:3000/api-json.

## Скрипти

| Команда | Що робить |
| --- | --- |
| `npm run start:dev` | Запуск із перезавантаженням |
| `npm test` | Unit-тести (рушій оцінювання, валідація контенту) |
| `npm run lint` / `npm run typecheck` | ESLint / перевірка типів |
| `npm run build` | Збірка в `dist/` |
| `npx prisma migrate dev --name <назва>` | Нова міграція |
| `npm run dev:token -- <email> <пароль>` | ID token тестового користувача Firebase для кнопки Authorize у `/docs` |

## API

| Метод | Шлях | Опис |
| --- | --- | --- |
| `GET` | `/health` | Стан сервісу й бази; прогрів перед демонстрацією |
| `GET` | `/packs` | Practice Packs зі списком сценаріїв |
| `GET` | `/scenarios/:id` | Повний сценарій із кроками |
| `POST` | `/me` | Завершити реєстрацію: `{ name?, acceptTerms: true }` 🔒 |
| `GET` | `/me` | Профіль; 404 `profile_not_found`, якщо `POST /me` ще не було 🔒 |
| `POST` | `/me/voice-consent` | Згода на обробку голосу перед першим записом 🔒 |
| `DELETE` | `/me` | Видалити профіль і всі спроби 🔒 |
| `POST` | `/attempts` | Запис відповіді (multipart: `audio`, `scenarioId`, `stepId`) → оцінка 🔒 |

🔒 — потрібен заголовок `Authorization: Bearer <Firebase ID token>`. Фронтенд входить через
Firebase JS SDK і передає ID token; бекенд лише перевіряє його й не зберігає паролів.
Коди помилок: 401 `unauthorized` / `token_expired`, 403 `profile_not_found` /
`terms_not_accepted` (для `POST /attempts`), 404 `profile_not_found` (для `GET /me`).

## Сценарії

Сценарії зберігаються як JSON у `content/scenarios/<pack>/<scenario>.json` і
перевіряються під час старту. Тест `content.spec.ts` перевіряє, що очікувана
відповідь кожного кроку отримує 100 балів — якщо варіанти елементів не збігаються
з фразою, тест упаде.

Цей репозиторій — єдине джерело сценаріїв: фронтенд отримує їх через `GET /packs` і
`GET /scenarios/:id`. Файли називаються `01-...`, `02-...`, і цей порядок бачить
користувач. Поле кроку `visual` — метадані для інтерфейсу (текст для дрилу або схема
кола), на оцінку не впливає. Аудіо диспетчера лежить у фронтенді в
`public/audio/atc/<scenarioId>/<stepId>.mp3`, а групування паків у секції — у
`content/sections.json` фронтенду. Факти про аеродроми — у
[`content/aerodromes.md`](./content/aerodromes.md).

## Деплой

`render.yaml` описує сервіс на Render (Blueprint). У панелі Render потрібно один раз
ввести секрети: `DATABASE_URL`, `DIRECT_URL`, `DEEPGRAM_API_KEY`, `CORS_ORIGINS`.
Безкоштовний сервіс засинає після 15 хвилин без запитів — перед демонстрацією
відкрийте `/health`.
