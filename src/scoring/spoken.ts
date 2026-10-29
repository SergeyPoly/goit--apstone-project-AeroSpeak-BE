/**
 * Expander: turns a written accepted variant into the words a pilot says in
 * ICAO phraseology. Content keeps written values, scoring compares spoken words:
 *   "QNH 998"            -> "qnh niner niner eight"
 *   "SP-TFA"             -> "sierra papa tango foxtrot alpha"
 *   "information L"      -> "information lima"
 *   "2500 feet"          -> "two thousand fife hundred feet"
 *   "flight level 65"    -> "flight level zero six fife"
 *   "squawk 7000"        -> "squawk seven zero zero zero" | "squawk seven thousand"
 *   "122.500"            -> "one two two decimal fife zero zero" | "... decimal fife"
 *
 * A variant can have several spoken forms, so the result is a list of alternatives.
 * Each word made from a number remembers the number (`group`): STT sometimes writes
 * digits ("118.505"), and then the whole group is compared by value.
 */
import {
  AIRCRAFT_MAKERS,
  CARDINAL_UNITS,
  ICAO_DIGITS,
  NATO_ALPHABET,
  PHRASE_REWRITES,
  SPOKEN_ABBREVIATIONS,
  foldDiacritics,
} from './vocabulary';

export interface SpokenWord {
  word: string;
  /** Set on words that came from a written number. */
  group?: { id: number; value: string; size: number };
}

/** More alternatives than this per variant are cut (several numbers multiply). */
const MAX_ALTERNATIVES = 16;

const CARDINAL_UNDER_20 = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const CARDINAL_TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

const digitWords = (digits: string) => [...digits].map((d) => ICAO_DIGITS[Number(d)]);

/** 0..99 as an ordinary cardinal: 72 -> "seventy two". */
function cardinal(n: number): string[] {
  if (n < 20) return [CARDINAL_UNDER_20[n]];
  const tens = CARDINAL_TENS[Math.floor(n / 10)];
  return n % 10 === 0 ? [tens] : [tens, CARDINAL_UNDER_20[n % 10]];
}

/** Whole thousands: 3 -> "tree", 10 -> "one zero" (each digit of 10 and above). */
const thousandsWords = (k: number) => digitWords(String(k));

/** Altitude and height: whole hundreds and thousands are said as such (2500 -> two thousand fife hundred). */
function altitudeWords(digits: string): string[] {
  const n = Number(digits);
  if (n > 0 && n % 1000 === 0) return [...thousandsWords(n / 1000), 'thousand'];
  if (n > 0 && n % 100 === 0) {
    const k = Math.floor(n / 1000);
    const hundreds = (n % 1000) / 100;
    return [...(k > 0 ? [...thousandsWords(k), 'thousand'] : []), ICAO_DIGITS[hundreds], 'hundred'];
  }
  return digitWords(digits);
}

/** Frequencies: every digit, trailing zeros may be dropped (122.500 -> 122.5). */
function frequencyForms(value: string): string[][] {
  const [whole, fraction] = value.split('.');
  const trimmed = fraction.replace(/0+$/, '') || '0';
  const forms = [fraction, trimmed].map((f) => [...digitWords(whole), 'decimal', ...digitWords(f)]);
  return dedupe(forms);
}

/**
 * Spoken forms of one written number. The context words decide the rule,
 * the first form is the one shown as the expected answer.
 */
function numberForms(value: string, prev: string[], next: string | undefined): string[][] {
  if (value.includes('.')) return frequencyForms(value);

  const n = Number(value);
  const last = prev.at(-1);
  const roundHundreds = n > 0 && n % 100 === 0;

  if (next === 'feet' || next === 'ft') return [altitudeWords(value)];
  if (last === 'level') {
    // FL below 100 keeps the leading zero: FL 65 -> zero six fife.
    const padded = value.padStart(3, '0');
    return roundHundreds
      ? [digitWords(padded), [...digitWords(String(n / 100)), 'hundred']]
      : [digitWords(padded)];
  }
  if (last === 'heading') {
    const padded = value.padStart(3, '0');
    return roundHundreds
      ? [digitWords(padded), [...digitWords(String(n / 100)), 'hundred']]
      : [digitWords(padded)];
  }
  if (last === 'squawk' && n > 0 && n % 1000 === 0) {
    return [digitWords(value), [...digitWords(String(n / 1000)), 'thousand']];
  }
  if (last && AIRCRAFT_MAKERS.has(last)) {
    // Cessna 172: "one seven two" or "one seventy two".
    if (value.length === 3)
      return [digitWords(value), [ICAO_DIGITS[Number(value[0])], ...cardinal(n % 100)]];
    return [digitWords(value)];
  }
  if (next && CARDINAL_UNITS.has(next) && n < 100) return dedupe([digitWords(value), cardinal(n)]);
  return [digitWords(value)];
}

function dedupe(forms: string[][]): string[][] {
  const seen = new Set<string>();
  return forms.filter((f) => {
    const key = f.join(' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const spell = (letters: string) => [...letters.toLowerCase()].map((ch) => NATO_ALPHABET[ch]);

/** Splits a written variant into tokens, keeping numbers, registrations and case. */
function writtenTokens(variant: string): string[] {
  let rewritten = foldDiacritics(variant);
  for (const [pattern, replacement] of PHRASE_REWRITES) {
    rewritten = rewritten.replace(new RegExp(pattern.source, 'gi'), replacement);
  }
  return rewritten
    .replace(/(\d),(\d)/g, '$1$2')
    .split(/[\s,;:!?()"“”]+/)
    .map((t) => t.replace(/^[.'’]+|[.'’]+$/g, ''))
    .filter(Boolean);
}

/** Written abbreviations that are said as words: "FL 65" -> "flight level zero six fife". */
const WRITTEN_WORDS: Record<string, string[]> = {
  FL: ['flight', 'level'],
  HDG: ['heading'],
  RWY: ['runway'],
};

/** Lowercase spoken words of the written tokens before a number, for the context rules. */
const contextWords = (tokens: string[]) =>
  tokens.flatMap((t) => WRITTEN_WORDS[t] ?? [t.toLowerCase()]);

const REGISTRATION = /^[A-Z]{1,2}-[A-Z]{2,4}$/;
const NUMBER = /^\d+(\.\d+)?$/;

/** All spoken forms of a written variant. */
export function expandToSpoken(variant: string): SpokenWord[][] {
  const tokens = writtenTokens(variant);
  let alternatives: SpokenWord[][] = [[]];
  let groupId = 0;

  tokens.forEach((token, index) => {
    const lower = token.toLowerCase();
    let options: SpokenWord[][];

    if (NUMBER.test(token)) {
      const prev = contextWords(tokens.slice(0, index));
      const next = tokens[index + 1]?.toLowerCase();
      const group = { id: groupId++, value: token };
      options = numberForms(token, prev, next).map((words) =>
        words.map((word) => ({ word, group: { ...group, size: words.length } })),
      );
    } else if (WRITTEN_WORDS[token]) {
      options = [WRITTEN_WORDS[token].map((word) => ({ word }))];
    } else if (REGISTRATION.test(token)) {
      options = [spell(token.replace('-', '')).map((word) => ({ word }))];
    } else if (/^[A-Z]{2,}$/.test(token) && !SPOKEN_ABBREVIATIONS.has(lower)) {
      // ICAO location indicators and other codes are spelled: EPPO -> echo papa papa oscar.
      options = [spell(token).map((word) => ({ word }))];
    } else if (/^[A-Z]$/.test(token)) {
      options = [[{ word: NATO_ALPHABET[lower] }]];
    } else {
      const words = lower.split(/[-.'’]+/).filter((w) => /^[a-z0-9]+$/.test(w));
      options = [words.map((word) => ({ word }))];
    }

    alternatives = alternatives
      .flatMap((prefix) => options.map((option) => [...prefix, ...option]))
      .slice(0, MAX_ALTERNATIVES);
  });

  return alternatives.filter((a) => a.length > 0);
}
