# AeroSpeak — бекенд

API вебзастосунку AeroSpeak для тренування англомовної авіаційної радіотелефонії
(VFR, фразеологія ICAO/EASA). Користувач слухає диспетчера, відповідає голосом і
отримує автоматичну оцінку з поясненням помилок.

**Стек:** NestJS 11, TypeScript, PostgreSQL (Neon) + Prisma, Deepgram (STT), zod, Swagger.
Деплой — Render (Frankfurt), фронтенд — окремий репозиторій на Vercel.

Ключові архітектурні рішення описані в [`CLAUDE.md`](./CLAUDE.md).

## Перший запуск

1. Встановити залежності точно за `package-lock.json` (заодно згенерується Prisma Client):

   ```bash
   npm ci
   ```

2. Скопіювати `.env.example` у `.env` і заповнити:
   - `DATABASE_URL` і `DIRECT_URL` — рядки підключення з Neon (pooled і direct);
   - `DEEPGRAM_API_KEY` — ключ із консолі Deepgram.

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

## API

| Метод | Шлях | Опис |
| --- | --- | --- |
| `GET` | `/health` | Стан сервісу й бази; прогрів перед демонстрацією |
| `POST` | `/guests` | Створити гостя (практика без реєстрації) |
| `GET` | `/packs` | Practice Packs зі списком сценаріїв |
| `GET` | `/scenarios/:id` | Повний сценарій із кроками |
| `POST` | `/attempts` | Запис відповіді (multipart: `audio`, `guestId`, `scenarioId`, `stepId`) → оцінка |

## Сценарії

Сценарії зберігаються як JSON у `content/scenarios/<pack>/<scenario>.json` і
перевіряються під час старту. Тест `content.spec.ts` перевіряє, що очікувана
відповідь кожного кроку отримує 100 балів — якщо варіанти елементів не збігаються
з фразою, тест упаде.

## Деплой

`render.yaml` описує сервіс на Render (Blueprint). У панелі Render потрібно один раз
ввести секрети: `DATABASE_URL`, `DIRECT_URL`, `DEEPGRAM_API_KEY`, `CORS_ORIGINS`.
Безкоштовний сервіс засинає після 15 хвилин без запитів — перед демонстрацією
відкрийте `/health`.
