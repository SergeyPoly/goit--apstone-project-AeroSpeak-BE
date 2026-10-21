# Aerodrome facts used in scenarios

Scenarios use only the facts below. Items marked **unverified** are placeholders that must
be checked against the current Polish AIP (or provided by the team) before release.
After a fact changes, update the scenarios that use it and run `npm test`.

As of 2026-10-18.

## Aircraft

| Item | Value |
| --- | --- |
| Registration | SP-TFA (Sierra Papa Tango Foxtrot Alpha) |
| Type | Cessna 172 |

## EPPO — Poznań-Ławica (controlled)

| Item | Value | Status |
| --- | --- | --- |
| Runway | 10/28, 2504 × 50 m | [learn-atc](https://www.learn-atc.com/tools/aerodrome/EPPO) |
| Runway in use in scenarios | 28 | assumption (westerly wind) |
| Poznań Delivery | 121.805 | [learn-atc](https://www.learn-atc.com/tools/aerodrome/EPPO), [PLVACC](https://plvacc.pl/pilots/airports/EPPO) |
| Poznań Ground | 124.140 | [PLVACC](https://plvacc.pl/pilots/airports/EPPO) |
| Poznań Tower | 119.980 | [learn-atc](https://www.learn-atc.com/tools/aerodrome/EPPO), [PLVACC](https://plvacc.pl/pilots/airports/EPPO) |
| Poznań Approach | 128.925 | [learn-atc](https://www.learn-atc.com/tools/aerodrome/EPPO) |
| ATIS | 124.705 | [learn-atc](https://www.learn-atc.com/tools/aerodrome/EPPO) |
| Transition altitude | 6500 ft | [PLVACC](https://plvacc.pl/pilots/airports/EPPO) |
| GA parking | "general aviation apron" | **unverified** name; the chart puts it on the south-east apron (by H1/H2), a guess |
| Taxiways | Alpha (apron ↔ holding point runway 28, runway exit) | **conflict**, see below |
| Taxiways in OSM | A, B, D1, D2, F, G, H1, H2, L, N1, N2, R, S, T, W, Y | [OSM](https://www.openstreetmap.org/copyright) (ODbL), not checked against the AIP |
| CTR entry/exit points | November (north), Whiskey (west) | **unverified** |
| Pattern | right-hand circuit runway 28 | **unverified** |

## EPPI — Piła (uncontrolled, A/G radio)

| Item | Value | Status |
| --- | --- | --- |
| Station | Piła Radio, 122.405 | [dlapilota.pl](https://dlapilota.pl/wiadomosci/aeroklub-ziemi-pilskiej/od-nowego-roku-nowa-czestotliwosc-operacyjna-na-ladowisku-pila-ep) |
| Runway | 03/21 concrete, 2400 × 60 m | [Aeroklub Ziemi Pilskiej](https://www.azp.pila.pl/lotnisko/) |
| Runway in use in scenarios | 21 | assumption |
| Runway in OSM | tagged `21R/03L`, which hints at a parallel strip (03R/21L, likely grass) that OSM does not map | **check**; scenarios say plain 03/21 |
| Taxiways | not named in scenarios ("apron", "holding point runway 21"); OSM has no taxiway refs | **unverified** |
| Taxi route | OSM shows a parallel taxiway from the aprons to the runway 21 threshold | see conflicts below |
| Pattern | circuit side not specified in scenarios | **unverified** |

## Charts

The practice screen draws simplified charts from OpenStreetMap data (© OpenStreetMap
contributors, ODbL), fetched 2026-10-18, in `src/entities/aerodrome/model/charts/`.
OSM does not map EPPO's main apron as an area (only its stands as points), so the chart
shows the apron fragments it does have. The aircraft spots for each "Position" value are
placed by hand and are **unverified**. Positions outside the chart (for example "10 miles
north" or "November") are shown as "off chart". The generator scripts are not in the repo;
re-fetch from the OSM API (bbox `16.78,52.405,16.86,52.44` and `16.68,53.15,16.75,53.195`).

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
| FIS | Poznań Information | **unverified** name, frequency not used |
| Reporting point | Oborniki (town between Piła and Poznań) | **unverified** as a VFR point |
| VFR squawk assigned by FIS | 5201 | example value |
