import { matchElement } from './match';
import { tokenizeTranscript } from './transcript';
import type { ElementResult, ScoreInput, ScoreResult, ScoringStep } from './types';
import { NON_STANDARD_FORMS } from './vocabulary';

/**
 * Score = share of recognized words, weighted by element (ArSim-like: each word is
 * recognized or not), plus a small part for keeping the standard order.
 * STT confidence is not part of the score: it depends on the microphone and noise,
 * not on the pilot. It only marks unclear words.
 */
const WEIGHTS = { words: 90, order: 10 };

/** A missed critical element caps the score just below "success" (display 4). */
export const CRITICAL_MISS_CAP = 59;
export const SUCCESS_DISPLAY_SCORE = 4;

export function toDisplayScore(score: number): number {
  if (score >= 90) return 6;
  if (score >= 75) return 5;
  if (score >= 60) return 4;
  if (score >= 45) return 3;
  if (score >= 30) return 2;
  return 1;
}

function weightedCredit(results: ElementResult[], weights: Map<string, number>): number {
  const total = results.reduce((sum, r) => sum + (weights.get(r.id) ?? 0), 0);
  if (total === 0) return 0;
  const earned = results.reduce((sum, r) => sum + (weights.get(r.id) ?? 0) * r.similarity, 0);
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
  const positions = results
    .filter((r) => r.position !== undefined)
    .map((r) => r.position as number);
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

  const words = results.flatMap((r) => r.words.map((w) => ({ ...w, label: r.label })));
  const nonStandard = words.find(
    (w) => w.status === 'almost' && !w.unclear && NON_STANDARD_FORMS.get(w.expected) === w.heard,
  );
  if (nonStandard)
    return `Say "${nonStandard.expected}", not "${nonStandard.heard}": use the ICAO form.`;
  const wrongWord = words.find(
    (w) => w.status === 'missing' || (w.status === 'almost' && !w.unclear),
  );
  if (wrongWord) {
    return wrongWord.heard
      ? `Check "${wrongWord.label}": say "${wrongWord.expected}" (we heard "${wrongWord.heard}").`
      : `Check "${wrongWord.label}": you left out "${wrongWord.expected}".`;
  }
  const unclear = words.find((w) => w.unclear);
  if (unclear)
    return `We could not hear "${unclear.expected}" clearly. Speak a little slower and closer to the mic.`;
  if (!orderCorrect) return 'All elements are there. Try to keep the standard order.';
  return 'Good transmission. All required elements are present.';
}

export function scoreTransmission(step: ScoringStep, input: ScoreInput): ScoreResult {
  const heard = tokenizeTranscript(input.transcript, input.words);
  const criticalIds = new Set([
    ...(step.criticalElements ?? []),
    ...step.requiredElements.filter((e) => e.critical).map((e) => e.id),
  ]);

  // Two passes: first find which heard words each element recognized, then match
  // again so that no element shows another element's word as "heard instead".
  const isCritical = (id: string) => criticalIds.has(id);
  const sole = step.requiredElements.length === 1;
  const firstPass = step.requiredElements.map((e) =>
    matchElement(e, heard, isCritical(e.id), new Set(), sole),
  );
  const elements = step.requiredElements.map((element, index) => {
    const blocked = new Set(firstPass.flatMap((m, other) => (other === index ? [] : m.claimed)));
    return matchElement(element, heard, isCritical(element.id), blocked, sole).result;
  });

  const weights = new Map(step.requiredElements.map((e) => [e.id, e.weight]));
  const order = orderScore(elements);
  const components = [
    { value: weightedCredit(elements, weights), weight: WEIGHTS.words },
    { value: order, weight: WEIGHTS.order },
  ].filter((c): c is { value: number; weight: number } => c.value !== null);

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  let score = (components.reduce((sum, c) => sum + c.value * c.weight, 0) / totalWeight) * 100;

  // Without any recognized element the transmission gets no credit for order.
  if (elements.every((r) => r.status === 'missed')) score = 0;

  const missedCritical = elements
    .filter((r) => r.critical && r.status === 'missed')
    .map((r) => r.id);
  if (missedCritical.length > 0) score = Math.min(score, CRITICAL_MISS_CAP);

  score = Math.round(score);
  const displayScore = toDisplayScore(score);
  const orderCorrect = order === null || order === 1;

  return {
    score,
    displayScore,
    success: displayScore >= SUCCESS_DISPLAY_SCORE,
    normalizedTranscript: heard.map((w) => w.word).join(' '),
    elements,
    missedCritical,
    orderCorrect,
    tip: buildTip(elements, orderCorrect),
  };
}
