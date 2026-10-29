import { matchElement } from './match';
import { checkOrder } from './order';
import { tokenizeTranscript } from './transcript';
import type { ElementResult, OrderFeedback, ScoreInput, ScoreResult, ScoringStep } from './types';
import { NON_STANDARD_FORMS } from './vocabulary';

/**
 * Score = share of recognized words, weighted by element (ArSim-like: each word is
 * recognized or not), plus a small part for keeping the standard order (order.ts).
 * STT confidence is not part of the score: it depends on the microphone and noise,
 * not on the pilot. It only marks unclear words.
 */
const WEIGHTS = { words: 90, order: 10 };

/**
 * Each non-standard but understood item (squawk "seven zero zero zero", no "altitude",
 * "nine" for "niner") costs at least this many points, however small its element is.
 */
export const NON_STANDARD_PENALTY = 5;

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

function buildTip(results: ElementResult[], order: OrderFeedback | null): string {
  const criticalMiss = results.find((r) => r.critical && r.status === 'missed');
  if (criticalMiss?.hint) return `${criticalMiss.label}: ${criticalMiss.hint}`;
  if (criticalMiss) {
    return `You missed "${criticalMiss.label}". This is a safety-critical element and must be included.`;
  }
  const miss = results.find((r) => r.status === 'missed');
  if (miss?.hint) return `${miss.label}: ${miss.hint}`;
  if (miss) return `Include "${miss.label}" in your transmission.`;
  const hinted = results.find((r) => r.hint);
  if (hinted?.hint) return `${hinted.label}: ${hinted.hint}`;

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
  if (order && !order.correct) return order.message ?? 'Keep the standard order.';
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
  const orderCheck = checkOrder(step, elements);
  const components = [
    { value: weightedCredit(elements, weights), weight: WEIGHTS.words },
    { value: orderCheck?.value ?? null, weight: WEIGHTS.order },
  ].filter((c): c is { value: number; weight: number } => c.value !== null);

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  let score = (components.reduce((sum, c) => sum + c.value * c.weight, 0) / totalWeight) * 100;

  // Without any recognized element the transmission gets no credit for order.
  if (elements.every((r) => r.status === 'missed')) score = 0;

  const issues = elements.reduce((sum, r) => sum + (r.issues ?? 0), 0);
  score = Math.min(score, 100 - NON_STANDARD_PENALTY * issues);

  const missedCritical = elements
    .filter((r) => r.critical && r.status === 'missed')
    .map((r) => r.id);
  if (missedCritical.length > 0) score = Math.min(score, CRITICAL_MISS_CAP);

  const order: OrderFeedback | null = orderCheck && {
    rule: orderCheck.rule,
    correct: orderCheck.outOfOrder.length === 0,
    outOfOrder: orderCheck.outOfOrder,
    ...(orderCheck.message ? { message: orderCheck.message } : {}),
    lostPoints: Math.round(((1 - orderCheck.value) * WEIGHTS.order * 100) / totalWeight),
  };

  score = Math.round(score);
  const displayScore = toDisplayScore(score);
  const orderCorrect = order === null || order.correct;

  return {
    score,
    displayScore,
    success: displayScore >= SUCCESS_DISPLAY_SCORE,
    normalizedTranscript: heard.map((w) => w.word).join(' '),
    elements,
    missedCritical,
    orderCorrect,
    order,
    tip: buildTip(elements, order),
  };
}
