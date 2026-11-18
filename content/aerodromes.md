# Aerodrome facts used in scenarios

Scenarios use only the facts below. Items marked **unverified** are placeholders that must
be checked against the current Polish AIP (or provided by the team) before release.
The values scenarios are rendered with live in `aircraft.json`, `weather.json` and
`aerodromes/<ICAO>.json`; this file records where they come from. After a fact changes,
update the JSON file and run `npm test` (every variant of every scenario is checked).

As of 2026-10-29 (VFR points and FIS frequencies from the AIP charts the team provided).

## Aircraft

The fleet in `aircraft.json`. Registrations are examples for training, not checked against
the Polish or German register.

| Registration | Type |
| --- | --- |
| SP-TFA (default) | Cessna 172 |
| SP-KTN | Tecnam P2008 |
| D-EPCH | Piper PA-28 Cherokee |
| D-EMOY | Mooney M20 |

## Weather presets

Four presets (wind, QNH, ATIS letter) in `weather.json`, shared by all aerodromes; every
preset is a variant of each scenario with `"weather": true`. The runway in use is the one
most into the wind: 270° 10 kt QNH 1013 Kilo and 250° 12 kt QNH 1008 Lima give EPPO 28 /
EPPI 21; 090° 8 kt QNH 1021 Mike and 060° 14 kt QNH 1016 November give EPPO 10 / EPPI 03. Tower gives the wind with take-off,
landing and touch-and-go clearances; Piła Radio gives it with the airfield information.

## EPPO — Poznań-Ławica (controlled)

| Item | Value | Status |
| --- | --- | --- |
| Runway | 10/28, 2504 × 50 m | [learn-atc](https://www.learn-atc.com/tools/aerodrome/EPPO) |
| Runway in use in scenarios | 28 | assumption (westerly wind) |
| Weather | presets from `weather.json` | examples, all favour runway 28 |
| Poznań Delivery | 121.805 | [learn-atc](https://www.learn-atc.com/tools/aerodrome/EPPO), [PLVACC](https://plvacc.pl/pilots/airports/EPPO) |
| Poznań Ground | 124.140 | [PLVACC](https://plvacc.pl/pilots/airports/EPPO) |
| Poznań Tower | 119.980 | [learn-atc](https://www.learn-atc.com/tools/aerodrome/EPPO), [PLVACC](https://plvacc.pl/pilots/airports/EPPO) |
| Poznań Approach | 128.925 | [learn-atc](https://www.learn-atc.com/tools/aerodrome/EPPO) |
| ATIS | 124.705 | [learn-atc](https://www.learn-atc.com/tools/aerodrome/EPPO) |
| Transition altitude | 6500 ft | [PLVACC](https://plvacc.pl/pilots/airports/EPPO) |
| GA parking | "general aviation apron" | **unverified** name; the chart puts it on the south-east apron (by H1/H2), a guess |
| Taxiways | Alpha (apron ↔ holding point runway 28, runway exit) | **conflict**, see below |
| Taxiways in OSM | A, B, D1, D2, F, G, H1, H2, L, N1, N2, R, S, T, W, Y | [OSM](https://www.openstreetmap.org/copyright) (ODbL), not checked against the AIP |
| VFR points (CTR) | see "EPPO VFR points" below | AIP AD 2 EPPO 13-1 (06 AUG 2026) |
| Arrival from / departure to Piła in scenarios | via DELTA, report VICTOR | chart routes DELTA → VICTOR → HOTEL |
| Pattern | right-hand circuit runway 28 | **unverified** |

## EPPI — Piła (uncontrolled, A/G radio)

| Item | Value | Status |
| --- | --- | --- |
| Station | Piła Radio, 122.405 | [dlapilota.pl](https://dlapilota.pl/wiadomosci/aeroklub-ziemi-pilskiej/od-nowego-roku-nowa-czestotliwosc-operacyjna-na-ladowisku-pila-ep) |
| Runway | 03/21 concrete, 2400 × 60 m | [Aeroklub Ziemi Pilskiej](https://www.azp.pila.pl/lotnisko/) |
| Runway in use in scenarios | 21 | assumption |
| Weather | presets from `weather.json` | examples, all favour runway 21 |
| Runway in OSM | tagged `21R/03L`, which hints at a parallel strip (03R/21L, likely grass) that OSM does not map | **check**; scenarios say plain 03/21 |
| Taxiways | not named in scenarios ("apron", "holding point runway 21"); OSM has no taxiway refs | **unverified** |
| Taxi route | OSM shows a parallel taxiway from the aprons to the runway 21 threshold | see conflicts below |
| Pattern | right-hand circuit runway 21 | team (2026-10-29) |
| VFR points | ZULU (north-west), DELTA (north-east), KILO (south-west) | AIP VFR AD 4 EPPI 4-1 (16 APR 2026) |
| Arrival from / departure to Poznań in scenarios | via KILO | KILO is on the Poznań side |
| FIS | north of the line through the airfield: Gdańsk Information 125.275; south: Poznań Information 126.300 | AIP VFR AD 4 EPPI 4-1 |

## Routes by direction

Each aerodrome JSON has `arrivals` and `departures` keyed by north, east, south, west. A
scenario names the other aerodrome (`from` / `to`), and the direction comes from the
aerodrome positions: Piła is north of Poznań. Only the directions of the planned network
are filled in:

```
EDAH - - - EPPI
 |          |
EDAV ----- EPPO
```

EPPO: north (EPPI) and west (EDAV); EPPI: south (EPPO) and west (EDAH).

| Aerodrome | Direction | Arrival: entry, report | Departure: exit | Source |
| --- | --- | --- | --- | --- |
| EPPO | north | DELTA, VICTOR | DELTA | AIP AD 2 EPPO 13-1 route DELTA → VICTOR → HOTEL |
| EPPO | west | X-RAY, JULIETT | X-RAY | route X-RAY → JULIETT → INDIA |
| EPPI | south | KILO | KILO | AIP VFR AD 4 EPPI 4-1 |
| EPPI | west | ZULU | ZULU | |

The CTR entry altitude (1500 feet) is **unverified** for every EPPO route but north. The turn
after take-off towards each exit point is set per runway (`departureTurn`) from the chart
geometry; check it against the AIP.

## Runways 10 (EPPO) and 03 (EPPI)

Added 2026-11-17 for easterly wind. **All unverified**, taken from the OSM chart in the
frontend, not from the AIP:

- EPPO 10: left-hand circuit (keeps the circuit north of the runway, like right-hand 28), taxi
  to holding point via Delta 2 (taxiway at the runway 10 threshold in OSM), vacate right via
  Bravo, taxi in via Bravo.
- EPPI 03: left-hand circuit (keeps the circuit north-west of the runway, away from the town,
  like right-hand 21).

## EPPO VFR points

From AIP AD 2 EPPO 13-1 "VFR arrival and departure routes" (06 AUG 2026). VICTOR, HOTEL,
GOLF, JULIETT, INDIA and FOXTROT are reported only when POZNAŃ TWR asks for it.

| Point | Where | Description |
| --- | --- | --- |
| DELTA | north-west, CTR boundary | ring road flyover above the railway |
| VICTOR | north-west, inside the CTR | NE end of Kierskie Lake |
| HOTEL | north-west, near the aerodrome | hotel on the south end of Kierskie Lake |
| QUEBEC | north-east | Owińska, spatial orientation park |
| YANKEE | north | Narutowicz flyover |
| TANGO | north-east | Koziegłowy sewage treatment plant |
| GOLF | north-east of the aerodrome | pale green warehouse |
| X-RAY | west | north end of Niepruszewskie Lake |
| JULIETT | west | road junction Poznań-Ławica |
| INDIA | west of the aerodrome | aviation radar |
| FOXTROT | south-east of the aerodrome | football stadium |
| UNIFORM | south | causeway by Nowakowskiego pond |
| MIKE | south | Mosina |
| ROMEO | south-east | roundabout near Żerniki |
| KILO | south-east | Kleszczewo warehouses |
| ECHO | south-east | Kijewo, flyover over railway crossing |
| ZULU | south-east | Zaniemyśl |

## Charts

The practice screen draws simplified charts from OpenStreetMap data (© OpenStreetMap
contributors, ODbL), fetched 2026-10-18, in `src/entities/aerodrome/model/charts/`.
OSM does not map EPPO's main apron as an area (only its stands as points), so the chart
shows the apron fragments it does have. The aircraft spots for each "Position" value are
placed by hand and are **unverified**. Positions outside the chart (for example "10 miles
north" or "Delta") are shown as "off chart". The generator scripts are not in the repo;
re-fetch from the OSM API (bbox `16.78,52.405,16.86,52.44` and `16.68,53.15,16.75,53.195`).

Which chart a step shows depends on where the aircraft is: on the ground, no `visual`
(ground chart); in, joining or leaving the circuit, `pattern`; in the aerodrome airspace,
`airspace` with a VFR point and `inbound` / `outbound` (simplified VFR operations chart, redrawn
from AIP AD 2 EPPO 13-1 and AIP VFR AD 4 EPPI 4-1). EPPO points use the AIP coordinates;
EPPI has no coordinate table, so its points are read off the chart grid (± a few hundred metres).
En route charts are not drawn yet.

## Scenario text that conflicts with OSM

- **EPPO `lnd-ctrl-vacate-taxi`** (fixed 2026-10-18): was "vacate left via Alpha", but in OSM
  Alpha is at the runway 28 threshold where the landing roll starts. Changed to "vacate left via
  Bravo" (a mid-runway exit on the south side in OSM); still to check against the AIP.
- **EPPO `ground-ctrl-taxi-clearance` / `dep-ctrl-ready-take-off`**: "taxi to holding point
  runway 28 via Alpha" fits OSM (Alpha joins the runway 28 threshold), but the route from
  the GA apron probably also uses H1 or H2. Fine for practice; check the AIP.
- **EPPI `ground-unc-backtrack`**: entering runway 21 and backtracking. OSM shows a parallel
  taxiway up to the runway 21 threshold, so a backtrack would only be needed when entering
  mid-runway. Acceptable as a practice case; confirm local procedure.

## En route

| Item | Value | Status |
| --- | --- | --- |
| FIS | Poznań Information 126.300 | AIP VFR AD 4 EPPI 4-1, AD 2 EPPO 13-1 |
| Reporting point | Oborniki (town between Piła and Poznań) | **unverified** as a VFR point |
| VFR squawk assigned by FIS | 5201 | example value |
