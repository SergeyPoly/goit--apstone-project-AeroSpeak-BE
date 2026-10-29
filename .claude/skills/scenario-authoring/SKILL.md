---
name: scenario-authoring
description: Write or edit AeroSpeak practice scenarios in content/. Use when adding a scenario or pack, adding or fixing steps, required/critical elements, accepted variants, briefing, phraseology notes or step visuals.
---

# Authoring AeroSpeak scenarios

Scenarios live in `content/scenarios/<packId>/NN-<name>.json`, packs in `content/packs.json`.
The schema is `src/scenarios/scenario.schema.ts`; the app refuses to start with invalid content.
The `NN-` prefix (`01-`, `02-`, ...) is the order users see inside a pack.

## Fixed world

- Aircraft: `SP-TFA`, Cessna 172, spoken "Sierra Papa Tango Foxtrot Alpha".
  After first contact ATC may abbreviate to `SP-FA` ("Sierra Foxtrot Alpha") — accept both
  in callsign variants once the abbreviation is used.
- Controlled: `EPPO` Poznań-Ławica. Uncontrolled: `EPPI` Piła.
- Aerodrome facts (runways, taxiways, frequencies, reporting points) come only from
  `content/aerodromes.md`. If a fact you need is not there, stop and ask the user —
  never invent frequencies or taxiways.

## Rules for each step

1. `prompt` tells the pilot the situation and what to say, without giving the phrase.
2. `atcText` is required for `pilot_readback` and `atc_instruction` steps; set `atcAudio`
   to `/audio/atc/<scenarioId>/<stepId>.mp3` (the audio file is made in the frontend repo,
   see below).
3. `expectedPilotResponse` follows ICAO order: readbacks put the callsign last;
   initial calls start with station, then callsign.
4. `requiredElements` cover every safety item of the phrase; weights sum to 100.
   Mark `critical: true` and list in `criticalElements`: runway, hold short, cleared
   for take-off / to land, frequency, QNH, squawk, altitude, reporting point, and the
   callsign in a readback.
5. `acceptedVariants` hold realistic alternatives a pilot may say ("hold short runway 29",
   "holding short runway 29"). Write values as on paper: digits (`QNH 1013`, `118.505`,
   `2500 feet`, `FL 065`), registrations (`SP-TFA`), NATO words for letters
   (`information Lima`, `via Bravo`; never a bare letter). `src/scoring/spoken.ts` turns
   them into ICAO speech ("qnh one zero one tree"); check its tests for the rules
   (altitudes, flight levels, squawk, headings, frequencies).
6. Every `expectedPilotResponse`, said in ICAO phraseology, must score 100 against its own
   elements: each element needs a variant contained in the expected phrase. Drill responses
   are written as spoken ("Flight level zero six fife.").
7. Optional `visual` is UI metadata and never affects scoring. Drills get
   `{ "kind": "text", "text": "RWY 28", "caption": "optional" }` so the practice screen shows
   the item. Circuit steps get
   `{ "kind": "pattern", "side": "left|right", "position": "upwind|crosswind|downwind|base|final", "runway": "21" }`.
   Steps without `visual` show the aerodrome chart from the "Airport" briefing value.

## Phraseology rules

Source of truth for Polish aerodromes: ICAO Doc 9432 (Polish ULC edition) with the Polish
differences of its appendix 1 (AIP Polska GEN 1.7). UK CAA CAP 413 only for UK aerodromes.

- Numbers as in Doc 9432 2.4 (see `src/scoring/spoken.ts`): flight levels without a leading
  zero (`FL 65`), squawk 7000 / QNH 1000 as "seven thousand" / "one thousand".
- ATC: the first transmission of each unit in a scenario has the station after the
  callsign ("SP-TFA, Poznań Tower, ..."); later ones may omit it (Doc 9432 2.7.1.2).
- Altitude: ALTITUDE before the value and no "to" before a number: "climb altitude
  4500 feet", "not above altitude 1500 feet", "altitude 2000 feet" in position reports.
  In variants write it as optional, `"not above [altitude] 1500 feet"`: leaving it out is
  "almost", not a miss. `content.spec.ts` rejects "to" + number.
- Words in `[brackets]` are standard but optional; use them only for words whose absence
  does not change the meaning.
- Initial calls: station, callsign, position, request, ATIS letter ("... request start-up,
  information Kilo"). No aircraft type. To FIS: no "request flight information service".
- Positions over VFR reporting points from `content/aerodromes.md` ("overhead Kilo",
  "approaching Delta"); a distance ("5 miles north") only where no point exists.
- Changing frequency on your own: "changing to (unit) (frequency)".
- A readback ends with the callsign (start or end is accepted by scoring).
- Time drills: the minutes alone are standard (Doc 9432 2.5.1); accept the full time too.
- Briefing: add "Wind" matching the runway in use (and the ATC wind in the scenario).

## Per scenario

- `briefing`: Airport, ATC unit / frequency, Callsign, Aircraft, Position, ATIS/QNH,
  Runway, Intention — what applies.
- `phraseologyNote`: one concept the scenario teaches, with an example and why it matters.
- 2–5 steps that tell a short story in order (request → instruction → readback → report).

## After editing

Run `npm test`. `content.spec.ts` checks every step: the expected response scores 100,
`atcAudio` follows the path convention, visuals survive loading, the file sits in its
pack folder. Fix every failure before finishing.

## Frontend follow-ups (repo `pilotocheg/aerospeak-app`)

Tell the user which of these the change needs; they are done in the frontend repo:

- **New pack:** add it to exactly one section in `src/shared/content/sections.json`.
- **New or changed `atcText`:** generate the audio with the frontend `atc-audio` skill
  (`npm run audio:atc`). Before this backend change is deployed, run the backend locally
  and point the frontend at it with `VITE_API_URL=http://localhost:3000`.
- `npm run content:check` in the frontend then confirms sections and audio files.
