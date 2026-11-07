import {
  buildDailyProgress,
  buildProgress,
  dailyWindowStart,
  isValidTimeZone,
  MAX_RUN_SCORES,
  runScore,
  type CatalogueScenario,
  type ProgressAttempt,
} from './progress';

const NOW = new Date('2026-11-07T12:00:00Z');
const catalogue: CatalogueScenario[] = [
  { id: 'first', packId: 'pack-a', stepIds: ['s1', 's2'] },
  { id: 'second', packId: 'pack-b', stepIds: ['s1'] },
  { id: 'never-played', packId: 'pack-b', stepIds: ['s1'] },
];

let minute = 0;
const attempt = (overrides: Partial<ProgressAttempt>): ProgressAttempt => ({
  scenarioId: 'first',
  stepId: 's1',
  sessionId: 'run-1',
  score: 80,
  success: true,
  createdAt: new Date(Date.UTC(2026, 10, 1, 8, minute++)),
  ...overrides,
});

const scenarioOf = (attempts: ProgressAttempt[], id = 'first') =>
  buildProgress(attempts, catalogue, NOW).scenarios.find((s) => s.scenarioId === id);

describe('runScore', () => {
  it('takes the mean of the best per step, a missing step counts as 0', () => {
    const best = new Map([
      ['s1', 90],
      ['s2', 61],
    ]);
    expect(runScore(['s1', 's2', 's3'], best)).toBe(50);
  });
});

describe('buildProgress', () => {
  it('uses the best attempt of each step in a completed run', () => {
    const scenario = scenarioOf([
      attempt({ stepId: 's1', score: 40 }),
      attempt({ stepId: 's1', score: 90 }),
      attempt({ stepId: 's1', score: 60 }),
      attempt({ stepId: 's2', score: 70 }),
    ]);
    expect(scenario).toMatchObject({
      packId: 'pack-a',
      runs: 1,
      bestScore: 80,
      lastScore: 80,
      scores: [80],
      stepAttempts: 4,
    });
  });

  it('ignores an incomplete run for scores but counts its attempts', () => {
    const last = new Date('2026-11-02T10:00:00Z');
    const scenario = scenarioOf([attempt({ stepId: 's1', score: 100, createdAt: last })]);
    expect(scenario).toMatchObject({
      runs: 0,
      bestScore: null,
      lastScore: null,
      scores: [],
      stepAttempts: 1,
      lastPlayedAt: last,
    });
  });

  it('does not join steps of different runs into one', () => {
    const scenario = scenarioOf([
      attempt({ sessionId: 'run-1', stepId: 's1' }),
      attempt({ sessionId: 'run-2', stepId: 's2' }),
    ]);
    expect(scenario?.runs).toBe(0);
  });

  it('orders runs by their last attempt, not by the first', () => {
    const at = (day: number) => new Date(Date.UTC(2026, 10, day));
    const scenario = scenarioOf([
      attempt({ sessionId: 'early-start', stepId: 's1', score: 50, createdAt: at(1) }),
      attempt({ sessionId: 'early-start', stepId: 's2', score: 50, createdAt: at(4) }),
      attempt({ sessionId: 'late-start', stepId: 's1', score: 90, createdAt: at(2) }),
      attempt({ sessionId: 'late-start', stepId: 's2', score: 90, createdAt: at(3) }),
    ]);
    expect(scenario).toMatchObject({ scores: [90, 50], lastScore: 50, bestScore: 90 });
  });

  it('keeps the last scores, oldest first, and the best of all runs', () => {
    const attempts = Array.from({ length: MAX_RUN_SCORES + 5 }, (_, index) =>
      attempt({
        scenarioId: 'second',
        sessionId: `run-${index}`,
        score: index === 0 ? 100 : index,
      }),
    );
    const scenario = scenarioOf(attempts, 'second');
    expect(scenario?.runs).toBe(MAX_RUN_SCORES + 5);
    expect(scenario?.scores).toHaveLength(MAX_RUN_SCORES);
    expect(scenario?.scores[0]).toBe(5);
    expect(scenario?.lastScore).toBe(MAX_RUN_SCORES + 4);
    expect(scenario?.bestScore).toBe(100);
  });

  it('counts attempts without a run id only in the totals', () => {
    const { totals, scenarios } = buildProgress(
      [
        attempt({ sessionId: null, stepId: 's1' }),
        attempt({ sessionId: null, stepId: 's2', success: false }),
      ],
      catalogue,
      NOW,
    );
    expect(totals).toMatchObject({ attempts: 2, successfulPhrases: 1, practicedScenarios: 0 });
    expect(scenarios[0]).toMatchObject({ runs: 0, bestScore: null, stepAttempts: 2 });
  });

  it('skips attempts of a removed scenario or step', () => {
    const { totals, scenarios } = buildProgress(
      [attempt({ scenarioId: 'removed' }), attempt({ stepId: 'removed' })],
      catalogue,
      NOW,
    );
    expect(scenarios).toEqual([]);
    expect(totals.attempts).toBe(0);
  });

  it('adds up the totals, the last 7 days are a rolling window', () => {
    const second = { scenarioId: 'second' };
    const { totals, scenarios } = buildProgress(
      [
        attempt({ ...second, createdAt: new Date('2026-11-07T11:00:00Z') }),
        attempt({ ...second, sessionId: 'old', createdAt: new Date('2026-10-31T11:59:00Z') }),
        attempt({ ...second, success: false, createdAt: new Date('2026-11-07T10:00:00Z') }),
        attempt({ stepId: 's1', createdAt: new Date('2026-11-06T10:00:00Z') }),
      ],
      catalogue,
      NOW,
    );
    expect(totals).toEqual({
      practicedScenarios: 1,
      totalScenarios: 3,
      attempts: 4,
      successfulPhrases: 3,
      successfulPhrasesLast7Days: 2,
    });
    expect(scenarios.map((s) => s.scenarioId)).toEqual(['first', 'second']);
  });
});

describe('buildDailyProgress', () => {
  const daily = (createdAt: string, score = 80, success = true) => ({
    createdAt: new Date(createdAt),
    score,
    success,
  });

  it('groups attempts by day, oldest first, with rounded averages', () => {
    const days = buildDailyProgress(
      [
        daily('2026-11-07T09:00:00Z', 81),
        daily('2026-11-05T09:00:00Z', 50, false),
        daily('2026-11-07T10:00:00Z', 90, false),
      ],
      { days: 30, timeZone: 'UTC', now: NOW },
    );
    expect(days).toEqual([
      { date: '2026-11-05', attempts: 1, successful: 0, averageScore: 50 },
      { date: '2026-11-07', attempts: 2, successful: 1, averageScore: 86 },
    ]);
  });

  it('uses the day of the requested zone, not the UTC day', () => {
    const attempts = [daily('2026-11-06T23:30:00Z')];
    const dateIn = (timeZone: string) =>
      buildDailyProgress(attempts, { days: 30, timeZone, now: NOW })[0].date;
    expect(dateIn('UTC')).toBe('2026-11-06');
    expect(dateIn('Europe/Warsaw')).toBe('2026-11-07');
    expect(dateIn('America/New_York')).toBe('2026-11-06');
  });

  it('keeps the last calendar days, today included', () => {
    const days = buildDailyProgress(
      [
        daily('2026-11-05T22:59:00Z'), // Nov 5 in Warsaw: out
        daily('2026-11-05T23:00:00Z'), // Nov 6 in Warsaw: first day
        daily('2026-11-07T11:00:00Z'),
      ],
      { days: 2, timeZone: 'Europe/Warsaw', now: NOW },
    );
    expect(days.map((d) => d.date)).toEqual(['2026-11-06', '2026-11-07']);
  });

  it('is not shifted by a daylight saving change', () => {
    const now = new Date('2026-10-26T12:00:00Z'); // Warsaw moved its clock on Oct 25
    const days = buildDailyProgress([daily('2026-10-24T22:30:00Z')], {
      days: 2,
      timeZone: 'Europe/Warsaw',
      now,
    });
    expect(days.map((d) => d.date)).toEqual(['2026-10-25']);
  });

  it('loads from early enough for the far ends of the zones', () => {
    const now = new Date('2026-11-06T23:00:00Z');
    // Nov 7 13:00 at UTC+14: the 2-day window starts on Nov 6 00:00 there.
    expect(dailyWindowStart(2, now).getTime()).toBeLessThan(Date.UTC(2026, 10, 5, 10));
    // Nov 6 11:00 at UTC-12: the 2-day window starts on Nov 5 00:00 there.
    expect(dailyWindowStart(2, now).getTime()).toBeLessThan(Date.UTC(2026, 10, 5, 12));
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones and rejects anything else', () => {
    expect(isValidTimeZone('Europe/Warsaw')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
