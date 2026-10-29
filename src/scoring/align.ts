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
import { RADIO_WORDS } from './vocabulary';

/** Credit for a word that is understandable but not standard phraseology. */
export const ALMOST_CREDIT = 0.7;
/** Credit for a wrong word that STT itself was unsure about: we can't tell, so half. */
export const UNCLEAR_CREDIT = 0.5;
/** A heard word below this confidence is "unclear" rather than wrong. */
export const UNCLEAR_CONFIDENCE = 0.5;
/** Extra words inside the matched span ("hold short OF runway") cost a little. */
const EXTRA_WORD_PENALTY = 0.05;
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
}

type Move = 'start' | 'miss' | 'extra' | 'pair' | 'group';

function pairResult(
  expected: SpokenWord,
  heard: HeardWord,
): { result: WordResult; credit: number; recognized: boolean } {
  const match = compareWords(expected.word, heard.word);
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
      if (i < n) relax(i + 1, j, v, { i, j, move: 'miss' });
      if (i > 0 && i < n && j < m) relax(i, j + 1, v - EXTRA_WORD_PENALTY, { i, j, move: 'extra' });
    }
  }

  // Anything after the variant is free too.
  let endJ = 0;
  for (let j = 1; j <= m; j += 1) if (score[n][j] > score[n][endJ]) endJ = j;

  const words = new Array<WordResult>(n);
  const used: number[] = [];
  const claimed: number[] = [];
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
    } else if (from.move === 'group') {
      for (let k = from.i; k < i; k += 1) {
        words[k] = { expected: expected[k].word, heard: heard[from.j].word, status: 'correct' };
      }
      used.push(from.j);
      claimed.push(from.j);
    } else if (from.move === 'miss') {
      words[from.i] = { expected: expected[from.i].word, status: 'missing' };
    }
    i = from.i;
    j = from.j;
  }
  for (let k = 0; k < n; k += 1) words[k] ??= { expected: expected[k].word, status: 'missing' };

  const credit = Math.max(0, Math.round(score[n][endJ] * 1000) / 1000);
  if (used.length === 0) return { words, credit, claimed };
  const start = Math.min(...used);
  const end = Math.max(...used);
  return {
    words,
    credit,
    start,
    claimed,
    heardText: heard
      .slice(start, end + 1)
      .map((w) => w.word)
      .join(' '),
  };
}
