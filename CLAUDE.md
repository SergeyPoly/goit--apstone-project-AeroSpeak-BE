# AeroSpeak backend: notes for Claude and the team

AeroSpeak is a web app for practicing VFR radio phraseology in English (ICAO/EASA,
European market). The user hears a scripted ATC instruction, answers by voice and
gets instant feedback: score, transcript, matched/missed elements, tip, retry.
This repo is the NestJS backend. The React frontend lives in a separate repo.

## Scope decisions (do not undo without the team)

- **Training mode only.** Scripted scenarios with rule-based scoring.
  There is **no LLM / AI ATC dialogue, no WebSockets, no Redis** in the MVP.
- **Two repositories.** The API contract is shared via OpenAPI:
  Swagger UI at `/docs`, JSON schema at `/api-json`. The frontend generates its
  types from it, so every response needs decorated DTO classes (`@ApiProperty`).
- **Scoring lives only on the backend.** The frontend just displays the result.
- **Pilot audio is never stored** (GDPR). It is held in memory for the STT call,
  then dropped. Only transcript and scoring result go to the database.
- **Scenarios are JSON files in `/content`**, not in the database. They are validated
  with zod at startup; invalid content stops the app. `content.spec.ts` checks that
  every step's `expectedPilotResponse` scores 100.

## Architecture

```
src/
  config/      env validation (zod); app does not start with missing variables
  health/      GET /health: SELECT 1, used for Render health check and warm-up
  prisma/      PrismaService (global)
  scenarios/   content loader + zod schemas, GET /packs, GET /scenarios/:id
  scoring/     normalizer, matcher, scorer: PURE TypeScript, no Nest imports
  stt/         abstract SttProvider + DeepgramSttProvider (REST, keyterms)
  guests/      POST /guests: anonymous guest id (practice without signup)
  attempts/    POST /attempts (multipart audio): STT -> scoring -> save -> feedback
content/
  packs.json              practice packs
  scenarios/<pack>/*.json one file per scenario
prisma/schema.prisma      Guest, User, Attempt
```

### Scoring engine (`src/scoring`)

- `normalize()` brings transcript and accepted variants to one form:
  spoken numbers to digits ("two one" -> "21", "one two one decimal niner" -> "121.9",
  trailing zeros dropped), ICAO pronunciation (niner, tree, fife), NATO alphabet and
  registrations to letter groups ("Sierra Papa Tango Foxtrot Alpha" / "SP-TFA" -> "sptfa").
- `matchElement()` aligns each variant word to the transcript. Numbers must match exactly.
  A typo-level difference gives `partial`, a different word gives `missed`.
  Critical elements are never `partial` when a word is missing.
- `scoreTransmission()` weights per spec 11.3 (elements 50 / critical 30 / order 10 /
  confidence 10; drills 70 / 20 / 10). A missed critical element caps the score at 59
  (display 3, not a success). Display mapping 0-100 -> 1-6 per spec 11.1.
- Keep this module free of NestJS and third-party imports so it stays easy to test.
  Add a test case for every new normalization rule.

## Conventions

- TypeScript strict, ESLint + Prettier (`npm run lint`, `npm run format`).
- Validate request input with zod (`safeParse` in the controller) and keep
  Swagger DTO classes next to it in `*.dto.ts`.
- Errors that are not the user's fault (STT down) return 503 with `code: 'stt_failed'`;
  the frontend shows "try again" without a score.
- English in code and API messages; team docs are in Ukrainian.

## Infrastructure

- Backend: Render web service, Frankfurt, free plan (`render.yaml`). It sleeps after
  15 min idle, so warm it up with `GET /health` before a demo.
- Database: Neon PostgreSQL, free plan. `DATABASE_URL` = pooled string (app),
  `DIRECT_URL` = direct string (migrations). Neon also sleeps; `/health` wakes it.
- Frontend: Vercel. Allow its domain in `CORS_ORIGINS`, previews via `CORS_ORIGIN_REGEX`.
- Migrations run on start (`prisma migrate deploy`), as the free plan has no pre-deploy step.
- Rate limits (`@nestjs/throttler`) are per client IP. Render's proxy sits in front of the
  app, so `TRUST_PROXY_HOPS=1` makes Express read the client IP from `X-Forwarded-For`.
  Never set `trust proxy` to `true`: clients could spoof the header and skip the limits.

## Commands

```bash
npm install                       # also runs prisma generate
npx prisma migrate dev --name x   # create a migration (needs DIRECT_URL)
npm run start:dev                 # http://localhost:3000/docs
npm test                          # unit tests (scoring, content)
npm run lint && npm run typecheck && npm run build
```

## Next steps (Trello board "AeroSpeak MVP")

1. Record 10-15 real test phrases and check Deepgram output with and without keyterms.
2. Move the remaining 18-22 scenarios from the spec into `/content`.
3. Auth (email, Google, Apple) and moving guest progress to the account.
4. Rate limits, PostHog analytics, Sentry.
