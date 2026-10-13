import { normalize, tokenize } from './normalize';
import type { ElementResult, ElementStatus, RequiredElement } from './types';

/** Element similarity at or above this counts as a full match. */
export const MATCH_THRESHOLD = 0.85;
/** A word counts as found if its similarity to a transcript word reaches this (STT typos). */
export const TOKEN_THRESHOLD = 0.75;
/** A non-critical element with at least this share of its words found gets partial credit. */
export const PARTIAL_FOUND_RATIO = 0.75;

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

const isNumeric = (token: string) => /^\d+(\.\d+)?$/.test(token);

function tokenSimilarity(a: string, b: string): number {
  // Numbers must match exactly: "1016" vs "1015" is a different QNH.
  if (isNumeric(a) || isNumeric(b)) return a === b ? 1 : 0;
  return similarity(a, b);
}

interface Candidate {
  /** Mean word similarity, 0..1. */
  similarity: number;
  /** Number of variant words not found in the window. */
  missing: number;
  start: number;
  text: string;
}

/**
 * Aligns variant words to a transcript window in order. Each variant word is
 * matched to the next window word that is similar enough; a word with no such
 * match counts as missing. This separates an STT typo ("sptfe" for "sptfa",
 * partial credit) from a different word ("holding point" for "holding short",
 * which is wrong).
 */
function alignWindow(variantTokens: string[], window: string[]): { mean: number; missing: number } {
  let cursor = 0;
  let total = 0;
  let missing = 0;

  for (const vt of variantTokens) {
    let found = -1;
    let foundSim = 0;
    for (let k = cursor; k < window.length; k += 1) {
      const sim = tokenSimilarity(vt, window[k]);
      if (sim >= TOKEN_THRESHOLD) {
        found = k;
        foundSim = sim;
        break;
      }
    }
    if (found === -1) {
      missing += 1;
    } else {
      total += foundSim;
      cursor = found + 1;
    }
  }

  // Extra words inside the window (e.g. "hold short OF runway") cost a little.
  const extra = Math.max(0, window.length - (variantTokens.length - missing));
  const mean = total / variantTokens.length - extra * 0.02;
  return { mean: Math.max(0, mean), missing };
}

function isBetter(a: Candidate, b: Candidate | null): boolean {
  if (!b) return true;
  if (a.missing !== b.missing) return a.missing < b.missing;
  return a.similarity > b.similarity;
}

/** Finds the best match of one normalized variant inside the transcript tokens. */
function bestWindow(variantTokens: string[], transcriptTokens: string[]): Candidate | null {
  if (variantTokens.length === 0 || transcriptTokens.length === 0) return null;

  let best: Candidate | null = null;
  const n = variantTokens.length;
  const sizes = [n, n + 1, n + 2, n - 1].filter((size) => size >= 1 && size <= transcriptTokens.length);

  for (const size of sizes) {
    for (let start = 0; start + size <= transcriptTokens.length; start += 1) {
      const window = transcriptTokens.slice(start, start + size);
      const { mean, missing } = alignWindow(variantTokens, window);
      const candidate = { similarity: mean, missing, start, text: window.join(' ') };
      if (isBetter(candidate, best)) best = candidate;
    }
  }
  return best;
}

export function matchElement(
  element: RequiredElement,
  transcriptTokens: string[],
  critical: boolean,
): ElementResult {
  let best: Candidate | null = null;
  let bestTokenCount = 1;

  for (const variant of element.acceptedVariants) {
    const variantTokens = tokenize(normalize(variant));
    const candidate = bestWindow(variantTokens, transcriptTokens);
    if (candidate && isBetter(candidate, best)) {
      best = candidate;
      bestTokenCount = variantTokens.length;
    }
  }

  let status: ElementStatus = 'missed';
  if (best) {
    const foundRatio = 1 - best.missing / bestTokenCount;
    if (best.missing === 0) {
      status = best.similarity >= MATCH_THRESHOLD ? 'matched' : 'partial';
    } else if (!critical && foundRatio >= PARTIAL_FOUND_RATIO) {
      status = 'partial';
    }
  }

  const sim = best?.similarity ?? 0;
  return {
    id: element.id,
    label: element.label,
    status,
    critical,
    similarity: Math.round(sim * 100) / 100,
    ...(status !== 'missed' && best ? { matchedText: best.text, position: best.start } : {}),
  };
}
