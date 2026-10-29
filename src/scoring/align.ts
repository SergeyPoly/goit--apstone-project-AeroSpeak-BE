/**
 * Aligns the spoken words of one accepted variant with the transcript, in order.
 * Semi-global alignment: the variant must be covered word by word, the transcript
 * may have anything before and after it. Every expected word ends up correct,
 * almost or missing, like in ArSim where each word is either recognized or not.
 *
 * Heard words that another element of the step recognized are `blocked`: they can't
 * stand in for a missing word ("heard 'information'" for a skipped "apron" when
 * "information" belongs to "information Kilo"), neither as wrong nor as unclear.
 */
import { compareWords, sameNumber } from './compare';
import type { SpokenWord } from './spoken';
import type { HeardWord } from './transcript';
import type { WordResult } from './types';
import { EQUIVALENTS, ICAO_DIGITS, NON_STANDARD_FORMS, RADIO_WORDS } from './vocabulary';

/** Credit for a word that is understandable but not standard phraseology. */
export const ALMOST_CREDIT = 0.7;
/** Credit for a wrong word that STT itself was unsure about: we can't tell, so half. */
export const UNCLEAR_CREDIT = 0.5;
/** A heard word below this confidence is "unclear" rather than wrong. */
export const UNCLEAR_CONFIDENCE = 0.5;
/** Extra words inside the matched span ("hold short OF runway") cost a little. */
const EXTRA_WORD_PENALTY = 0.05;
/** "to" right before a number ("climbing TO 2000 feet") is non-standard (AIP Polska GEN 1.7). */
const TO_BEFORE_NUMBER_PENALTY = 1 - ALMOST_CREDIT;
/** A number must be said exactly: an extra word inside it is nearly a wrong number. */
const INSIDE_NUMBER_PENALTY = 0.5;
/** Digits right after a number that ends the variant belong to it ("decimal niner ZERO ZERO"). */
const TRAILING_DIGIT_PENALTY = 1;

/** Words that can only be digits; "for", "to" and "too" are ordinary words too. */
const DIGIT_WORDS = new Set<string>(
  ICAO_DIGITS.flatMap((d) => [
    d,
    ...(EQUIVALENTS.get(d) ?? []),
    NON_STANDARD_FORMS.get(d) ?? d,
  ]).filter((w) => !['for', 'to', 'too'].includes(w)),
);
const isDigit = (word: HeardWord) => word.numeral !== undefined || DIGIT_WORDS.has(word.word);

/**
 * How many digits follow heard index `j` when the variant ends with a number.
 * Digits another element recognized ("Cessna 172, 10 miles") are not counted.
 */
function trailingDigits(
  expected: SpokenWord[],
  heard: HeardWord[],
  j: number,
  blocked: ReadonlySet<number>,
): number {
  if (expected.at(-1)?.group === undefined) return 0;
  let k = j;
  while (k < heard.length && isDigit(heard[k]) && !blocked.has(k)) k += 1;
  return k - j;
}
/** Prefers "heard X in place of Y" over "Y missing" when both score the same, for feedback. */
const PAIR_TIE_BREAK = 1e-6;

export interface Alignment {
  words: WordResult[];
  /** Sum of word credits, 0..words.length. */
  credit: number;
  /** Index of the first heard word used, for the order check. */
  start?: number;
  /** Heard words of the matched span. */
  heardText?: string;
  /** Indices of heard words this variant recognized (correct or almost). */
  claimed: number[];
  /** Non-standard things said, for the hint. */
  issues: AlignmentIssues;
}

export interface AlignmentIssues {
  /** Standard forms of numbers said in a non-standard way ("squawk seven thousand"). */
  nonStandard: string[];
  /** Optional standard words left out ("altitude"). */
  omitted: string[];
  /** Words said that should not be there ("to" before a number). */
  unexpected: string[];
}

type Move = 'start' | 'miss' | 'extra' | 'pair' | 'group';

function pairResult(
  expected: SpokenWord,
  heard: HeardWord,
): { result: WordResult; credit: number; recognized: boolean } {
  const match = compareWords(expected.word, heard.word);
  if (expected.nonStandard && match !== 'wrong') {
    // "seven zero zero zero" for squawk 7000: understood, but not the standard form.
    return {
      result: { expected: expected.word, heard: heard.word, status: 'almost' },
      credit: ALMOST_CREDIT,
      recognized: true,
    };
  }
  if (match === 'correct') {
    return {
      result: { expected: expected.word, heard: heard.word, status: 'correct' },
      credit: 1,
      recognized: true,
    };
  }
  if (match === 'almost') {
    return {
      result: { expected: expected.word, heard: heard.word, status: 'almost' },
      credit: ALMOST_CREDIT,
      recognized: true,
    };
  }
  // A bare letter or another radio word is a clear answer, just a wrong one ("a" for "alpha").
  const otherRadioWord = RADIO_WORDS.has(heard.word) || /^[a-z]$/.test(heard.word);
  if (!otherRadioWord && heard.confidence !== undefined && heard.confidence < UNCLEAR_CONFIDENCE) {
    return {
      result: { expected: expected.word, heard: heard.word, status: 'almost', unclear: true },
      credit: UNCLEAR_CREDIT,
      recognized: false,
    };
  }
  return {
    result: { expected: expected.word, heard: heard.word, status: 'missing' },
    credit: 0,
    recognized: false,
  };
}

const startsGroup = (words: SpokenWord[], i: number) =>
  words[i].group !== undefined && (i === 0 || words[i - 1].group?.id !== words[i].group?.id);

const insideGroup = (words: SpokenWord[], i: number) =>
  i > 0 && words[i].group !== undefined && words[i - 1].group?.id === words[i].group?.id;

/** What an extra heard word before expected word `i` costs. */
/** "to" before these is as non-standard as before the number itself: "climb TO altitude 2000 feet". */
const LEVEL_WORDS = new Set(['altitude', 'height', 'flight']);

function extraPenalty(expected: SpokenWord[], i: number, heard: HeardWord): number {
  const beforeLevel = startsGroup(expected, i) || LEVEL_WORDS.has(expected[i].word);
  if (heard.word === 'to' && beforeLevel) return TO_BEFORE_NUMBER_PENALTY;
  if (insideGroup(expected, i)) return INSIDE_NUMBER_PENALTY;
  return EXTRA_WORD_PENALTY;
}

/** Leaving out an optional standard word ("[altitude]") is almost, not a miss. */
const missCredit = (word: SpokenWord) => (word.optional ? ALMOST_CREDIT : 0);

export function alignWords(
  expected: SpokenWord[],
  heard: HeardWord[],
  blocked: ReadonlySet<number> = new Set(),
): Alignment {
  const n = expected.length;
  const m = heard.length;
  const score: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(-Infinity),
  );
  type Step = { i: number; j: number; move: Move } | null;
  const back: Step[][] = Array.from({ length: n + 1 }, () => new Array<Step>(m + 1).fill(null));

  const relax = (
    i: number,
    j: number,
    value: number,
    from: { i: number; j: number; move: Move },
  ) => {
    if (value > score[i][j]) {
      score[i][j] = value;
      back[i][j] = from;
    }
  };

  // Anything before the variant is free.
  for (let j = 0; j <= m; j += 1) relax(0, j, 0, { i: 0, j, move: 'start' });

  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= m; j += 1) {
      const v = score[i][j];
      if (v === -Infinity) continue;
      if (i < n && j < m) {
        const group = expected[i].group;
        const numeral = heard[j].numeral;
        if (group && numeral && startsGroup(expected, i) && sameNumber(group.value, numeral)) {
          relax(i + group.size, j + 1, v + group.size, { i, j, move: 'group' });
        }
        const pair = pairResult(expected[i], heard[j]);
        if (pair.recognized || !blocked.has(j)) {
          relax(i + 1, j + 1, v + pair.credit + PAIR_TIE_BREAK, { i, j, move: 'pair' });
        }
      }
      if (i < n) relax(i + 1, j, v + missCredit(expected[i]), { i, j, move: 'miss' });
      if (i > 0 && i < n && j < m) {
        relax(i, j + 1, v - extraPenalty(expected, i, heard[j]), { i, j, move: 'extra' });
      }
    }
  }

  // Anything after the variant is free too, except digits that continue its last number.
  const endScore = (j: number) =>
    score[n][j] - TRAILING_DIGIT_PENALTY * trailingDigits(expected, heard, j, blocked);
  let endJ = 0;
  for (let j = 1; j <= m; j += 1) if (endScore(j) > endScore(endJ)) endJ = j;

  const words = new Array<WordResult>(n);
  const used: number[] = [];
  const claimed: number[] = [];
  const issues: AlignmentIssues = { nonStandard: [], omitted: [], unexpected: [] };
  let i = n;
  let j = endJ;
  while (i > 0) {
    const from = back[i][j];
    if (!from || from.move === 'start') break;
    if (from.move === 'pair') {
      const { result, credit, recognized } = pairResult(expected[from.i], heard[from.j]);
      words[from.i] = result;
      if (credit > 0) used.push(from.j);
      if (recognized) claimed.push(from.j);
      const standard = expected[from.i].nonStandard;
      if (standard && recognized && !issues.nonStandard.includes(standard)) {
        issues.nonStandard.unshift(standard);
      }
    } else if (from.move === 'group') {
      for (let k = from.i; k < i; k += 1) {
        words[k] = { expected: expected[k].word, heard: heard[from.j].word, status: 'correct' };
      }
      used.push(from.j);
      claimed.push(from.j);
    } else if (from.move === 'miss') {
      const word = expected[from.i];
      words[from.i] = { expected: word.word, status: word.optional ? 'almost' : 'missing' };
      if (word.optional) issues.omitted.unshift(word.word);
    } else if (
      from.move === 'extra' &&
      extraPenalty(expected, from.i, heard[from.j]) === TO_BEFORE_NUMBER_PENALTY
    ) {
      issues.unexpected.unshift(heard[from.j].word);
    }
    i = from.i;
    j = from.j;
  }
  for (let k = 0; k < n; k += 1) words[k] ??= { expected: expected[k].word, status: 'missing' };

  const credit = Math.max(0, Math.round(endScore(endJ) * 1000) / 1000);
  if (used.length === 0) return { words, credit, claimed, issues };
  const start = Math.min(...used);
  const end = Math.max(...used);
  return {
    words,
    credit,
    start,
    claimed,
    issues,
    heardText: heard
      .slice(start, end + 1)
      .map((w) => w.word)
      .join(' '),
  };
}
