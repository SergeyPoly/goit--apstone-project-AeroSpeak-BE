import { createHash } from 'node:crypto';
import { NATO_ALPHABET } from '../scoring/vocabulary';
import type {
  Aerodrome,
  Aircraft,
  Direction,
  Runway,
  ScenarioVariants,
  Weather,
} from './variant.schema';

/**
 * Scenario variants: one scenario file is a template rendered for every combination of
 * aerodrome, weather and aircraft it allows. Pure functions, no Nest imports.
 *
 * Placeholders look like `{{runway}}`. A variable is a string or a list of accepted
 * spellings (["Poznań Tower", "Poznan Tower"]): free text uses the first one, and an item of
 * a string array (acceptedVariants) expands into one item per spelling.
 */

export type VariableValue = string | string[];
export type Variables = Record<string, VariableValue>;

export interface VariantContext {
  /** Where the scenario takes place. */
  aerodrome?: Aerodrome;
  /** Arrival scenarios: where the flight comes from. */
  from?: Aerodrome;
  /** Departure scenarios: where the flight goes to. */
  to?: Aerodrome;
  weather?: Weather;
  runway?: Runway;
  aircraft?: Aircraft;
}

export interface VariantData {
  aerodromes: Map<string, Aerodrome>;
  aircraft: Aircraft[];
  weather: Weather[];
}

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Smallest angle between two directions, 0-180 degrees. */
export function angleBetween(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** The runway in use is the one most into the wind. */
export function activeRunway(aerodrome: Aerodrome, weather: Weather): Runway {
  return [...aerodrome.runways].sort(
    (a, b) =>
      angleBetween(a.heading, weather.wind.direction) -
      angleBetween(b.heading, weather.wind.direction),
  )[0];
}

/** Initial great-circle bearing from one position to another, 0-360 degrees true. */
export function bearing(from: Aerodrome['position'], to: Aerodrome['position']): number {
  const rad = Math.PI / 180;
  const dLon = (to.lon - from.lon) * rad;
  const y = Math.sin(dLon) * Math.cos(to.lat * rad);
  const x =
    Math.cos(from.lat * rad) * Math.sin(to.lat * rad) -
    Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos(dLon);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** The cardinal direction of another aerodrome: EPPI is north of EPPO. */
export function directionTo(from: Aerodrome, to: Aerodrome): Direction {
  const directions: Direction[] = ['north', 'east', 'south', 'west'];
  return directions[Math.round(bearing(from.position, to.position) / 90) % 4];
}

/** "SP-TFA" -> "Sierra Papa Tango Foxtrot Alpha". */
export function spellRegistration(registration: string): string {
  return [...registration.replace(/[^a-z]/gi, '').toLowerCase()]
    .map((letter) => {
      const word = NATO_ALPHABET[letter];
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

const pad3 = (direction: number) => String(direction).padStart(3, '0');

/**
 * Every combination a scenario allows: aerodrome x origin x destination x weather x aircraft,
 * the first one is the default. The runway in use follows the wind; without weather it is the
 * first runway.
 */
export function variantContexts(
  variants: ScenarioVariants,
  data: VariantData,
  max = Infinity,
): VariantContext[] {
  const aerodromeList = (icaos?: string[]): Array<Aerodrome | undefined> =>
    icaos
      ? icaos.map((icao) => {
          const aerodrome = data.aerodromes.get(icao);
          if (!aerodrome) throw new Error(`unknown aerodrome "${icao}"`);
          return aerodrome;
        })
      : [undefined];
  const aerodromes = aerodromeList(variants.aerodromes);
  const origins = aerodromeList(variants.from);
  const destinations = aerodromeList(variants.to);
  const weathers: Array<Weather | undefined> = variants.weather ? data.weather : [undefined];
  const aircraft: Array<Aircraft | undefined> = variants.aircraft ? data.aircraft : [undefined];

  let contexts: VariantContext[] = [];
  for (const aerodrome of aerodromes) {
    for (const from of origins) {
      for (const to of destinations) {
        if (aerodrome && (from === aerodrome || to === aerodrome)) continue;
        for (const weather of weathers) {
          const runway = aerodrome
            ? weather
              ? activeRunway(aerodrome, weather)
              : aerodrome.runways[0]
            : undefined;
          for (const a of aircraft) {
            contexts.push({ aerodrome, from, to, weather, runway, aircraft: a });
          }
        }
      }
    }
  }
  const sizes = [aerodromes, origins, destinations, weathers, aircraft].map((d) => d.length);
  contexts = spreadSample(contexts, sizes, max);
  return contexts;
}

/**
 * Picks `max` items of a cartesian product so that every value of every dimension comes up
 * as evenly as possible: the step moves every dimension by one (mixed-radix "1111"), so the
 * picks run along the diagonals. The first item (the default variant) is always kept.
 */
export function spreadSample<T>(items: T[], sizes: number[], max: number): T[] {
  if (items.length <= max) return items;
  let step = 0;
  for (let d = 0, inner = 1; d < sizes.length; d++) {
    step += inner;
    inner *= sizes[sizes.length - 1 - d];
  }
  const picked = new Set<number>();
  for (let k = 0; picked.size < max; k++) {
    let index = (k * step) % items.length;
    while (picked.has(index)) index = (index + 1) % items.length;
    picked.add(index);
  }
  return [...picked].map((i) => items[i]);
}

/** Short id of a variant, e.g. "EPPO.w2.sp-tfa"; empty for a scenario without variants. */
export function variantKey(context: VariantContext): string {
  return [
    context.aerodrome?.icao,
    context.from && `from-${context.from.icao}`,
    context.to && `to-${context.to.icao}`,
    context.weather?.id,
    context.aircraft?.id,
  ]
    .filter(Boolean)
    .join('.');
}

export function buildVariables(context: VariantContext): Variables {
  const vars: Variables = {};
  const { aerodrome, from, to, weather, runway, aircraft } = context;

  if (aircraft) {
    vars.callsign = [aircraft.registration, spellRegistration(aircraft.registration)];
    vars.aircraft = aircraft.type;
  }
  if (aerodrome) {
    vars.icao = aerodrome.icao;
    vars.airport = `${aerodrome.icao} ${aerodrome.name}`;
    vars.city = aerodrome.city;
    vars['chart.source'] = aerodrome.chart.source;
    vars['chart.section'] = aerodrome.chart.section;
    vars['chart.url'] = aerodrome.chart.url;
    for (const [role, station] of Object.entries(aerodrome.stations)) {
      vars[role] = station.name;
      vars[`${role}.freq`] = station.frequency;
    }
  }
  if (aerodrome && from) {
    const direction = directionTo(aerodrome, from);
    const route = aerodrome.arrivals[direction];
    if (!route) throw new Error(`${aerodrome.icao} has no arrival from the ${direction}`);
    vars['arrival.from'] = from.city;
    vars['arrival.direction'] = direction;
    addRoute(vars, aerodrome, 'arrival', route);
  }
  if (aerodrome && to) {
    const direction = directionTo(aerodrome, to);
    const route = aerodrome.departures[direction];
    if (!route) throw new Error(`${aerodrome.icao} has no departure to the ${direction}`);
    vars['departure.to'] = to.city;
    vars['departure.direction'] = direction;
    addRoute(vars, aerodrome, 'departure', route);
    const turn = runway?.departureTurn?.[direction];
    if (turn) vars['runway.departureTurn'] = turn;
  }
  if (runway) {
    vars.runway = runway.designator;
    vars['runway.circuit'] = runway.circuit;
    for (const key of ['taxiRoute', 'vacateSide', 'vacateVia', 'taxiInRoute'] as const) {
      const value = runway[key];
      if (value) vars[`runway.${key}`] = value;
    }
  }
  if (weather) {
    const { direction, speed } = weather.wind;
    vars.wind = `${pad3(direction)} degrees ${speed} knots`;
    vars['wind.brief'] = `${pad3(direction)}° ${speed} kt`;
    vars.qnh = String(weather.qnh);
    if (weather.atis) vars.atis = weather.atis;
  }
  return vars;
}

/** Route fields as `{{arrival.entry}}`; a VFR point also gives `{{arrival.entry.location}}`. */
function addRoute(
  vars: Variables,
  aerodrome: Aerodrome,
  prefix: 'arrival' | 'departure',
  route: Record<string, string | number | undefined>,
) {
  for (const [field, value] of Object.entries(route)) {
    if (value === undefined) continue;
    vars[`${prefix}.${field}`] = String(value);
    const point = aerodrome.vfrPoints.find((p) => p.name === value);
    if (point) vars[`${prefix}.${field}.location`] = point.location;
  }
}

function lookup(vars: Variables, name: string): VariableValue {
  const value = vars[name];
  if (value === undefined) throw new Error(`unknown placeholder {{${name}}}`);
  return value;
}

/** Free text: every placeholder gets the first spelling. */
export function renderText(text: string, vars: Variables): string {
  return text.replace(PLACEHOLDER, (_, name: string) => {
    const value = lookup(vars, name);
    return Array.isArray(value) ? value[0] : value;
  });
}

/** One item of a string list: one result per combination of spellings, duplicates removed. */
export function renderAlternatives(text: string, vars: Variables): string[] {
  let results = [''];
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    const literal = text.slice(last, match.index);
    const value = lookup(vars, match[1]);
    const spellings = Array.isArray(value) ? value : [value];
    results = results.flatMap((prefix) => spellings.map((s) => prefix + literal + s));
    last = (match.index ?? 0) + match[0].length;
  }
  return [...new Set(results.map((r) => r + text.slice(last)))];
}

/** Lists whose items expand into one item per spelling. */
const ALTERNATIVE_LISTS = new Set(['acceptedVariants']);

/** Renders every string of a JSON value; `acceptedVariants` lists expand alternative spellings. */
export function renderTemplate(value: unknown, vars: Variables, key?: string): unknown {
  if (typeof value === 'string') return renderText(value, vars);
  if (Array.isArray(value)) {
    if (key && ALTERNATIVE_LISTS.has(key)) {
      return [...new Set(value.flatMap((item: string) => renderAlternatives(item, vars)))];
    }
    return value.map((item) => renderTemplate(item, vars));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, item]) => [k, renderTemplate(item, vars, k)]),
    );
  }
  return value;
}

/**
 * ATC's answer to a readback that missed a critical element (ICAO Doc 9432: NEGATIVE, then
 * the correct version): "SP-TFA, Poznań Ground, taxi to …" -> "SP-TFA, negative, I say again,
 * taxi to …". The station name is left out, as in any later transmission. Undefined when the
 * text does not start with the callsign.
 */
export function correctionText(
  atcText: string,
  callsign: string,
  stations: string[],
): string | undefined {
  const prefix = `${callsign}, `;
  if (!atcText.startsWith(prefix)) return undefined;
  let instruction = atcText.slice(prefix.length);
  const station = stations.find((name) => instruction.startsWith(`${name}, `));
  if (station) instruction = instruction.slice(station.length + 2);
  return `${callsign}, negative, I say again, ${instruction}`;
}

/** The frontend serves ATC audio from public/audio/atc/<hash of the text>.mp3. */
export function atcAudioPath(atcText: string): string {
  const hash = createHash('sha256').update(atcText).digest('hex').slice(0, 16);
  return `/audio/atc/${hash}.mp3`;
}
