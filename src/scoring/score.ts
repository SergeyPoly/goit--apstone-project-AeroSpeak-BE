import { matchElement } from './match';
import { normalize, tokenize } from './normalize';
import type { ElementResult, ScoreInput, ScoreResult, ScoringStep } from './types';

/**
 * Component weights from the spec (section 11.3).
 *
 * Scenario steps: required elements 50%, critical elements 30%,
 * order 10%, STT confidence 10%.
 * Basic phraseology drills: elements 70%, order 20%, STT confidence 10%.
 *
 * When a component does not apply (no critical elements, no confidence
 * value, fewer than two matched elements for order) its weight is
 * redistributed proportionally over the remaining components.
 */
const SCENARIO_WEIGHTS = { elements: 50, critical: 30, order: 10, confidence: 10 };
const DRILL_WEIGHTS = { elements: 70, critical: 0, order: 20, confidence: 10 };

/** A missed critical element caps the score just below "success" (display 4). */
export const CRITICAL_MISS_CAP = 59;
export const SUCCESS_DISPLAY_SCORE = 4;

const CREDIT = { matched: 1, partial: 0.5, missed: 0 } as const;

export function toDisplayScore(score: number): number {
  if (score >= 90) return 6;
  if (score >= 75) return 5;
  if (score >= 60) return 4;
  if (score >= 45) return 3;
  if (score >= 30) return 2;
  return 1;
}

function weightedCredit(results: ElementResult[], weights: Map<string, number>): number | null {
  const total = results.reduce((sum, r) => sum + (weights.get(r.id) ?? 0), 0);
  if (total === 0) return null;
  const earned = results.reduce((sum, r) => sum + (weights.get(r.id) ?? 0) * CREDIT[r.status], 0);
  return earned / total;
}

/** Length of the longest increasing subsequence, O(n^2) is fine for a handful of elements. */
function longestIncreasingRun(values: number[]): number {
  const lengths = values.map(() => 1);
  for (let i = 1; i < values.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (values[j] < values[i]) lengths[i] = Math.max(lengths[i], lengths[j] + 1);
    }
  }
  return lengths.length ? Math.max(...lengths) : 0;
}

/** Share of found elements spoken in the expected order, or null if fewer than two were found. */
function orderScore(results: ElementResult[]): number | null {
  const positions = results.filter((r) => r.position !== undefined).map((r) => r.position as number);
  if (positions.length < 2) return null;
  return longestIncreasingRun(positions) / positions.length;
}

function buildTip(results: ElementResult[], orderCorrect: boolean): string {
  const criticalMiss = results.find((r) => r.critical && r.status === 'missed');
  if (criticalMiss) {
    return `You missed "${criticalMiss.label}". This is a safety-critical element and must be included.`;
  }
  const miss = results.find((r) => r.status === 'missed');
  if (miss) return `Include "${miss.label}" in your transmission.`;
  const partial = results.find((r) => r.status === 'partial');
  if (partial) return `Check "${partial.label}": it was close, but not exact.`;
  if (!orderCorrect) return 'All elements are there. Try to keep the standard order.';
  return 'Good transmission. All required elements are present.';
}

export function scoreTransmission(step: ScoringStep, input: ScoreInput): ScoreResult {
  const normalizedTranscript = normalize(input.transcript);
  const tokens = tokenize(normalizedTranscript);
  const criticalIds = new Set([
    ...(step.criticalElements ?? []),
    ...step.requiredElements.filter((e) => e.critical).map((e) => e.id),
  ]);

  const elements = step.requiredElements.map((element) =>
    matchElement(element, tokens, criticalIds.has(element.id)),
  );

  const weights = new Map(step.requiredElements.map((e) => [e.id, e.weight]));
  const componentWeights = step.type === 'basic_drill' ? DRILL_WEIGHTS : SCENARIO_WEIGHTS;

  const order = orderScore(elements);
  const components: Array<{ value: number | null; weight: number }> = [
    { value: weightedCredit(elements, weights), weight: componentWeights.elements },
    {
      value: weightedCredit(
        elements.filter((r) => r.critical),
        weights,
      ),
      weight: componentWeights.critical,
    },
    { value: order, weight: componentWeights.order },
    {
      value:
        input.confidence === undefined ? null : Math.min(1, Math.max(0, input.confidence)),
      weight: componentWeights.confidence,
    },
  ];

  const applicable = components.filter((c) => c.value !== null && c.weight > 0);
  const totalWeight = applicable.reduce((sum, c) => sum + c.weight, 0);
  let score =
    totalWeight === 0
      ? 0
      : (applicable.reduce((sum, c) => sum + (c.value as number) * c.weight, 0) / totalWeight) *
        100;

  // Without any recognized element the transmission gets no credit for order or clarity.
  if (elements.every((r) => r.status === 'missed')) score = 0;

  const missedCritical = elements.filter((r) => r.critical && r.status === 'missed').map((r) => r.id);
  if (missedCritical.length > 0) score = Math.min(score, CRITICAL_MISS_CAP);

  score = Math.round(score);
  const displayScore = toDisplayScore(score);
  const orderCorrect = order === null || order === 1;

  return {
    score,
    displayScore,
    success: displayScore >= SUCCESS_DISPLAY_SCORE,
    normalizedTranscript,
    elements,
    missedCritical,
    orderCorrect,
    tip: buildTip(elements, orderCorrect),
  };
}
