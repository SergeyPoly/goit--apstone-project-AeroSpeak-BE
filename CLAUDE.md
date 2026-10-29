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
- **This repo is the single source of scenarios.** The frontend reads them through
  `GET /packs` and `GET /scenarios/:id`. Frontend-only data stays in the frontend repo:
  `sections.json` (grouping of packs) and ATC audio in `public/audio/atc/`.
  A step's optional `visual` is UI metadata (drill text or circuit diagram) and never
  affects scoring. `atcAudio` must be `/audio/atc/<scenarioId>/<stepId>.mp3`.

## Architecture

```
src/
  config/      env validation (zod); app does not start with missing variables
  health/      GET /health: SELECT 1, used for Render health check and warm-up
  prisma/      PrismaService (global)
  scenarios/   content loader + zod schemas, GET /packs, GET /scenarios/:id
  scoring/     spoken-form expander, word aligner, scorer: PURE TypeScript, no Nest imports
  stt/         abstract SttProvider + DeepgramSttProvider (REST, keyterms)
  guests/      POST /guests: anonymous guest id (practice without signup)
  attempts/    POST /attempts (multipart audio): STT -> scoring -> save -> feedback
content/
  packs.json              practice packs
  scenarios/<pack>/*.json one file per scenario, named 01-..., 02-... (= display order)
  aerodromes.md           aerodrome facts used in scenarios, with open questions
prisma/schema.prisma      Guest, User, Attempt
```

### Scoring engine (`src/scoring`)

Scoring grades ICAO phraseology word by word (like ArSim: each word is recognized or not).

- `expandToSpoken()` turns a written accepted variant into the words a pilot says:
  "QNH 998" -> "qnh niner niner eight", "SP-TFA" / "EPPO" / "information L" -> NATO words,
  "2500 feet" -> "two thousand fife hundred feet", "FL 065" -> "flight level zero six fife".
  Number rules follow UK CAA CAP 413 (Radiotelephony Manual, ed. 23) chapter 2, 2.11-2.15:
  every digit separately (headings, QNH, distances: 10 -> "one zero"); whole hundreds and
  thousands for altitude, height, visibility ("two thousand fife hundred"); FL100/200/300
  as "one hundred"; frequencies with all six figures, four when the last two are zeros
  (122.500 -> "one two two decimal fife"). Squawk and QNH in whole thousands accept both
  "seven thousand" and "seven zero zero zero". Team rule: a flight level is always written
  and said with three digits (FL 065, "zero six fife"); `content.spec.ts` checks it.
  Content keeps written values.
- `tokenizeTranscript()` keeps the STT words as heard (no digits, no letter groups), so
  "a" is not "alpha". It only joins bare letters into a known abbreviation
  ("q n h" -> "qnh", list in `vocabulary.ts`) and keeps digits written by STT as one
  token that matches a whole number by value.
- `compareWords()`: correct, almost or wrong. Forms STT can't tell apart are correct
  ("three"/"tree", "five"/"fife", Deepgram experiment Oct 2026). Non-standard forms STT
  does keep apart are almost ("nine" for "niner", "point" for "decimal"). One radio word
  for another is wrong; regular words and accents get fuzzy matching.
- `alignWords()` aligns each spoken form with the transcript in order. A wrong word
  that STT itself was unsure about (word confidence < 0.5) is "unclear" (almost).
- `checkOrder()` (`order.ts`) picks the order rule by step type. Readbacks (`pilot_readback`,
  and drills with a `callsign` element such as "Wilco, SP-TFA"): the callsign goes at the
  start or at the end, never in the middle; the read-back items may come in any order.
  Calls the pilot starts (`pilot_request`, `self_announce`, `atc_instruction`): the content
  element order (station, callsign, position, request, information). The result goes to
  the API as `order` (rule, out-of-order element ids, message, points lost).
- `scoreTransmission()`: 90% share of recognized words weighted by element, 10% order.
  STT confidence is never part of the score. A critical element with a missing word is
  missed and caps the score at 59 (display 3, not a success). Display mapping 0-100 -> 1-6
  per spec 11.1.
- Keep this module free of NestJS and third-party imports so it stays easy to test.
  Add a test case for every new expansion or comparison rule.
- STT keyterms (`attempts/keyterms.ts`) never contain digits or written codes:
  "118.505" or "QNH 1013" as a keyterm makes Deepgram write digits or cardinals.

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

1. Frontend: show the word-by-word result (`elements[].words`) in the feedback dialog.
2. Auth (email, Google, Apple) and moving guest progress to the account.
3. PostHog analytics, Sentry.
