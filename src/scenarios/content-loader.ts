import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  packsFileSchema,
  scenarioSchema,
  type PracticePack,
  type Scenario,
} from './scenario.schema';

export interface Content {
  packs: PracticePack[];
  scenarios: Scenario[];
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

/**
 * Reads and validates /content: packs.json plus every scenarios/**.json file.
 * Collects all problems and throws one error listing them, so a content
 * author sees every mistake at once.
 */
export function loadContent(contentDir: string): Content {
  const errors: string[] = [];

  const packsResult = packsFileSchema.safeParse(
    JSON.parse(readFileSync(join(contentDir, 'packs.json'), 'utf8')),
  );
  if (!packsResult.success) {
    errors.push(
      ...packsResult.error.issues.map((i) => `packs.json ${i.path.join('.')}: ${i.message}`),
    );
  }
  const packs = packsResult.success ? packsResult.data : [];
  const packIds = new Set(packs.map((p) => p.id));

  const scenarios: Scenario[] = [];
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

    const result = scenarioSchema.safeParse(raw);
    if (!result.success) {
      errors.push(...result.error.issues.map((i) => `${name} ${i.path.join('.')}: ${i.message}`));
      continue;
    }

    const scenario = result.data;
    if (seenIds.has(scenario.id)) errors.push(`${name}: duplicate scenario id "${scenario.id}"`);
    if (!packIds.has(scenario.packId)) errors.push(`${name}: unknown packId "${scenario.packId}"`);
    seenIds.add(scenario.id);
    scenarios.push(scenario);
    sourceFiles.set(scenario.id, name);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid scenario content:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  return { packs: [...packs].sort((a, b) => a.order - b.order), scenarios, sourceFiles };
}
