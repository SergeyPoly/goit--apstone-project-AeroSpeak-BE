import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';
import {
  packsFileSchema,
  scenarioSchema,
  type PracticePack,
  type Scenario,
} from './scenario.schema';
import {
  aerodromeSchema,
  aircraftSchema,
  scenarioVariantsSchema,
  weatherFileSchema,
  type Aerodrome,
} from './variant.schema';
import {
  angleBetween,
  atcAudioPath,
  buildVariables,
  renderTemplate,
  variantContexts,
  variantKey,
  type VariantData,
} from './variants';

/** Every rendering of one scenario file, keyed by variant key; the first key is the default. */
export interface ScenarioVariantSet {
  keys: string[];
  byKey: Map<string, Scenario>;
}

export interface Content {
  packs: PracticePack[];
  /** Each scenario in its default variant, in content order. */
  scenarios: Scenario[];
  variants: Map<string, ScenarioVariantSet>;
  aerodromes: Map<string, Aerodrome>;
  /** Scenario id -> file path relative to the content dir, with "/" separators. */
  sourceFiles: Map<string, string>;
}

function listJsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listJsonFiles(path);
    return name.endsWith('.json') ? [path] : [];
  });
}

function issuesOf(name: string, error: z.ZodError): string[] {
  return error.issues.map((i) => `${name} ${i.path.join('.')}: ${i.message}`);
}

/** Fleet, weather presets and aerodromes the scenario templates are rendered with. */
function loadVariantData(contentDir: string, errors: string[]): VariantData {
  const aircraft = z
    .array(aircraftSchema)
    .min(1)
    .safeParse(readJson(join(contentDir, 'aircraft.json')));
  if (!aircraft.success) errors.push(...issuesOf('aircraft.json', aircraft.error));
  const weather = weatherFileSchema.safeParse(readJson(join(contentDir, 'weather.json')));
  if (!weather.success) errors.push(...issuesOf('weather.json', weather.error));
  const presets = weather.success ? weather.data : [];

  const aerodromes = new Map<string, Aerodrome>();
  for (const file of listJsonFiles(join(contentDir, 'aerodromes')).sort()) {
    const name = relative(contentDir, file).split(sep).join('/');
    const result = aerodromeSchema.safeParse(readJson(file));
    if (!result.success) {
      errors.push(...issuesOf(name, result.error));
      continue;
    }
    const aerodrome = result.data;
    if (!name.endsWith(`/${aerodrome.icao}.json`))
      errors.push(`${name}: file name must be ${aerodrome.icao}.json`);
    // Every weather preset is used at every aerodrome: some runway must face the wind.
    for (const preset of presets) {
      const into = aerodrome.runways.some(
        (r) => angleBetween(r.heading, preset.wind.direction) < 90,
      );
      if (!into) errors.push(`${name}: weather ${preset.id} is a tailwind on every runway`);
    }
    aerodromes.set(aerodrome.icao, aerodrome);
  }
  return { aerodromes, aircraft: aircraft.success ? aircraft.data : [], weather: presets };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * How many variants a scenario serves at most. Every combination is rendered and validated,
 * but only a spread sample is served: each one needs its own ATC audio.
 */
export const MAX_VARIANTS = 8;

/**
 * Renders a scenario file for every variant it allows (see variants.ts) and validates each one.
 * The ATC audio path is derived from the rendered ATC text.
 */
function renderScenario(raw: unknown, name: string, data: VariantData, errors: string[]) {
  const { variants: variantsField, ...template } = (raw ?? {}) as Record<string, unknown>;
  const variants = scenarioVariantsSchema.safeParse(variantsField ?? {});
  if (!variants.success) {
    errors.push(...issuesOf(`${name} variants`, variants.error));
    return undefined;
  }

  const set: ScenarioVariantSet = { keys: [], byKey: new Map() };
  let contexts;
  try {
    contexts = variantContexts(variants.data, data);
  } catch (error) {
    errors.push(`${name} variants: ${(error as Error).message}`);
    return undefined;
  }
  const served = new Set(
    variantContexts(variants.data, data, MAX_VARIANTS).map((context) => variantKey(context)),
  );
  for (const context of contexts) {
    const key = variantKey(context);
    const label = key ? `${name} [${key}]` : name;
    let rendered: unknown;
    try {
      rendered = renderTemplate(template, buildVariables(context));
    } catch (error) {
      errors.push(`${label}: ${(error as Error).message}`);
      return undefined;
    }
    const result = scenarioSchema.safeParse(rendered);
    if (!result.success) {
      errors.push(...issuesOf(label, result.error));
      return undefined;
    }
    const scenario = result.data;
    for (const step of scenario.steps) {
      if (step.atcAudio)
        errors.push(`${label} ${step.id}: atcAudio is derived from atcText, remove it`);
      if (step.atcText) step.atcAudio = atcAudioPath(step.atcText);
    }
    if (!served.has(key)) continue;
    set.keys.push(key);
    set.byKey.set(key, scenario);
  }
  return set;
}

/**
 * Reads and validates /content: packs.json plus every scenarios/**.json file.
 * Collects all problems and throws one error listing them, so a content
 * author sees every mistake at once.
 */
export function loadContent(contentDir: string): Content {
  const errors: string[] = [];

  const packsResult = packsFileSchema.safeParse(readJson(join(contentDir, 'packs.json')));
  if (!packsResult.success) {
    errors.push(
      ...packsResult.error.issues.map((i) => `packs.json ${i.path.join('.')}: ${i.message}`),
    );
  }
  const packs = packsResult.success ? packsResult.data : [];
  const packIds = new Set(packs.map((p) => p.id));

  const variantData = loadVariantData(contentDir, errors);
  const scenarios: Scenario[] = [];
  const variants = new Map<string, ScenarioVariantSet>();
  const seenIds = new Set<string>();
  const sourceFiles = new Map<string, string>();

  // readdir order is not alphabetical on Linux; files are named 01-..., 02-... and that
  // path order is the scenario order the frontend shows.
  for (const file of listJsonFiles(join(contentDir, 'scenarios')).sort()) {
    const name = relative(contentDir, file).split(sep).join('/');
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      errors.push(`${name}: invalid JSON (${(error as Error).message})`);
      continue;
    }

    const set = renderScenario(raw, name, variantData, errors);
    if (!set) continue;

    const scenario = set.byKey.get(set.keys[0]) as Scenario;
    if (seenIds.has(scenario.id)) errors.push(`${name}: duplicate scenario id "${scenario.id}"`);
    if (!packIds.has(scenario.packId)) errors.push(`${name}: unknown packId "${scenario.packId}"`);
    seenIds.add(scenario.id);
    scenarios.push(scenario);
    variants.set(scenario.id, set);
    sourceFiles.set(scenario.id, name);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid scenario content:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  return {
    packs: [...packs].sort((a, b) => a.order - b.order),
    scenarios,
    variants,
    aerodromes: variantData.aerodromes,
    sourceFiles,
  };
}
