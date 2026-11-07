/**
 * Progress calculation: pure TypeScript, no Nest or Prisma imports (same rule as src/scoring).
 *
 * A run is one pass through a scenario: the attempts that share a sessionId. Only completed
 * runs count, as the frontend records only finished scenarios. Sections stay on the frontend.
 */

/** How many run scores are kept per scenario for the trend. */
export const MAX_RUN_SCORES = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ProgressAttempt {
  scenarioId: string;
  stepId: string;
  /** Null on attempts made before runs existed: they count only in the totals. */
  sessionId: string | null;
  score: number;
  success: boolean;
  createdAt: Date;
}

export interface CatalogueScenario {
  id: string;
  packId: string;
  /** In content order. */
  stepIds: string[];
}

export interface ScenarioProgress {
  scenarioId: string;
  packId: string;
  /** Completed runs. */
  runs: number;
  bestScore: number | null;
  lastScore: number | null;
  /** Last completed run scores, oldest first. */
  scores: number[];
  /** Last attempt of any kind. */
  lastPlayedAt: Date;
  /** All attempts in the scenario, in any run or none. */
  stepAttempts: number;
}

export interface ProgressTotals {
  practicedScenarios: number;
  totalScenarios: number;
  attempts: number;
  successfulPhrases: number;
  successfulPhrasesLast7Days: number;
}

export interface Progress {
  totals: ProgressTotals;
  scenarios: ScenarioProgress[];
}

export interface DailyAttempt {
  score: number;
  success: boolean;
  createdAt: Date;
}

export interface DailyProgress {
  /** Calendar day in the requested time zone, YYYY-MM-DD. */
  date: string;
  attempts: number;
  successful: number;
  averageScore: number;
}

interface Run {
  bestByStep: Map<string, number>;
  lastAt: Date;
}

/** Mean over all steps of the best score per step; a step without attempts counts as 0. */
export function runScore(stepIds: string[], bestByStep: ReadonlyMap<string, number>): number {
  const total = stepIds.reduce((sum, stepId) => sum + (bestByStep.get(stepId) ?? 0), 0);
  return Math.round(total / Math.max(1, stepIds.length));
}

function completedRunScores(scenario: CatalogueScenario, runs: Iterable<Run>): number[] {
  return [...runs]
    .filter((run) => scenario.stepIds.every((stepId) => run.bestByStep.has(stepId)))
    .sort((a, b) => a.lastAt.getTime() - b.lastAt.getTime())
    .map((run) => runScore(scenario.stepIds, run.bestByStep));
}

function scenarioProgress(
  scenario: CatalogueScenario,
  attempts: ProgressAttempt[],
): ScenarioProgress {
  const runs = new Map<string, Run>();
  for (const attempt of attempts) {
    if (!attempt.sessionId) continue;
    let run = runs.get(attempt.sessionId);
    if (!run) {
      run = { bestByStep: new Map(), lastAt: attempt.createdAt };
      runs.set(attempt.sessionId, run);
    }
    const best = run.bestByStep.get(attempt.stepId) ?? 0;
    run.bestByStep.set(attempt.stepId, Math.max(best, attempt.score));
    if (attempt.createdAt > run.lastAt) run.lastAt = attempt.createdAt;
  }

  const scores = completedRunScores(scenario, runs.values());
  return {
    scenarioId: scenario.id,
    packId: scenario.packId,
    runs: scores.length,
    bestScore: scores.length ? Math.max(...scores) : null,
    lastScore: scores.at(-1) ?? null,
    scores: scores.slice(-MAX_RUN_SCORES),
    lastPlayedAt: new Date(Math.max(...attempts.map((a) => a.createdAt.getTime()))),
    stepAttempts: attempts.length,
  };
}

/**
 * Per-scenario progress and totals. Attempts whose scenario or step is no longer in the
 * content are skipped. Scenarios come in content order, only those with an attempt.
 */
export function buildProgress(
  attempts: ProgressAttempt[],
  catalogue: CatalogueScenario[],
  now: Date,
): Progress {
  const stepsByScenario = new Map(catalogue.map((s) => [s.id, new Set(s.stepIds)]));
  const byScenario = new Map<string, ProgressAttempt[]>();
  for (const attempt of attempts) {
    if (!stepsByScenario.get(attempt.scenarioId)?.has(attempt.stepId)) continue;
    const list = byScenario.get(attempt.scenarioId);
    if (list) list.push(attempt);
    else byScenario.set(attempt.scenarioId, [attempt]);
  }

  const scenarios = catalogue.flatMap((scenario) => {
    const scenarioAttempts = byScenario.get(scenario.id);
    return scenarioAttempts ? [scenarioProgress(scenario, scenarioAttempts)] : [];
  });

  const known = [...byScenario.values()].flat();
  const successful = known.filter((a) => a.success);
  const weekAgo = now.getTime() - 7 * DAY_MS;

  return {
    totals: {
      practicedScenarios: scenarios.filter((s) => s.runs > 0).length,
      totalScenarios: catalogue.length,
      attempts: known.length,
      successfulPhrases: successful.length,
      successfulPhrasesLast7Days: successful.filter((a) => a.createdAt.getTime() >= weekAgo).length,
    },
    scenarios,
  };
}

/** True for a zone that Intl accepts, e.g. "Europe/Warsaw". */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function dateKeyFormatter(timeZone: string): (date: Date) => string {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return (date) => {
    const parts = Object.fromEntries(format.formatToParts(date).map((p) => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
}

/**
 * The earliest moment an attempt of the last `days` calendar days can have, in any zone.
 * Callers load from here; `buildDailyProgress` then cuts at the exact local day.
 */
export function dailyWindowStart(days: number, now: Date): Date {
  return new Date(now.getTime() - (days + 1) * DAY_MS);
}

/**
 * Attempts per calendar day in `timeZone`, oldest first, only days with attempts.
 * The window is the last `days` calendar days, today included. Days are counted on the
 * calendar, so a daylight saving change does not shift them.
 */
export function buildDailyProgress(
  attempts: DailyAttempt[],
  options: { days: number; timeZone: string; now: Date },
): DailyProgress[] {
  const dateKey = dateKeyFormatter(options.timeZone);
  const today = new Date(`${dateKey(options.now)}T00:00:00Z`);
  const firstDay = new Date(today.getTime() - (options.days - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10);

  const byDay = new Map<string, { attempts: number; successful: number; scoreSum: number }>();
  for (const attempt of attempts) {
    const date = dateKey(attempt.createdAt);
    if (date < firstDay) continue;
    const day = byDay.get(date) ?? { attempts: 0, successful: 0, scoreSum: 0 };
    day.attempts++;
    day.scoreSum += attempt.score;
    if (attempt.success) day.successful++;
    byDay.set(date, day);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({
      date,
      attempts: day.attempts,
      successful: day.successful,
      averageScore: Math.round(day.scoreSum / day.attempts),
    }));
}
