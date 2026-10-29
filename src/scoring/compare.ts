/**
 * Word comparer: is the heard word the expected one?
 *
 *   correct  same word, or a form STT can't tell apart ("three" for "tree")
 *   almost   understandable but not standard ("nine" for "niner", "point" for "decimal"),
 *            or close enough to be an accent or an STT slip ("fifa" for "fife")
 *   wrong    anything else, including one radio word for another ("a" for "alpha",
 *            "five" for "four")
 */
import { EQUIVALENTS, NON_STANDARD_FORMS, RADIO_WORDS } from './vocabulary';

export type WordMatch = 'correct' | 'almost' | 'wrong';

/** Regular words at or above this similarity are typos and count as correct. */
export const TYPO_SIMILARITY = 0.85;
/** At or above this a word is "almost" (accent, STT slip). */
export const ALMOST_SIMILARITY = 0.75;
/** Shorter words are compared exactly: "via" vs "fire" is not a typo. */
const MIN_FUZZY_LENGTH = 4;

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export function compareWords(expected: string, heard: string): WordMatch {
  if (expected === heard) return 'correct';
  if (EQUIVALENTS.get(expected)?.has(heard)) return 'correct';
  if (NON_STANDARD_FORMS.get(expected) === heard) return 'almost';

  // A different radio word is a different value, never a typo.
  if (RADIO_WORDS.has(heard)) return 'wrong';
  if (Math.min(expected.length, heard.length) < MIN_FUZZY_LENGTH) return 'wrong';

  const sim = similarity(expected, heard);
  if (sim >= TYPO_SIMILARITY && !RADIO_WORDS.has(expected)) return 'correct';
  if (sim >= ALMOST_SIMILARITY) return 'almost';
  return 'wrong';
}

/** Numbers written by STT are compared by value: "065" = "65", "122.50" = "122.5". */
export function sameNumber(a: string, b: string): boolean {
  return Number(a) === Number(b);
}
