/**
 * Expander: turns a written accepted variant into the words a pilot says in
 * ICAO phraseology. Content keeps written values, scoring compares spoken words.
 *
 * Source of truth for Polish aerodromes: ICAO Doc 9432 (Polish ULC edition) with the
 * AIP Polska GEN 1.7 differences (its appendix 1). Number rules, Doc 9432 2.4:
 *   "QNH 998"            -> "qnh niner niner eight"       every digit (2.4.2)
 *   "heading 300"        -> "heading tree zero zero"
 *   "10 miles"           -> "one zero miles"
 *   "FL 95"              -> "flight level niner fife"
 *   "flight level 100"   -> "flight level one hundred"    | digits: non-standard (2.4.3)
 *   "2500 feet"          -> "two thousand fife hundred feet"  whole hundreds/thousands (2.4.3)
 *   "squawk 7000"        -> "squawk seven thousand"       | digits: non-standard (2.4.3, appendix 1)
 *   "QNH 1000"           -> "qnh one thousand"            | digits: non-standard
 *   "118.125"            -> "one one eight decimal one two fife"   six digits (2.4.4)
 *   "122.500"            -> "one two two decimal fife"    | six digits: non-standard
 *   "SP-TFA"             -> "sierra papa tango foxtrot alpha"      (2.3)
 *   "information L"      -> "information lima"
 *
 * Words in square brackets are standard but optional for understanding:
 * "[altitude] 2000 feet". Leaving one out is "almost", not a miss.
 *
 * A variant can have several spoken forms, so the result is a list of alternatives.
 * Non-standard forms are kept to recognize them and mark them "almost".
 * Each word made from a number remembers the number (`group`): STT sometimes writes
 * digits ("118.505"), and then the whole group is compared by value.
 */
import {
  AIRCRAFT_MAKERS,
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
  /** Standard but optional for understanding ("[altitude]"): leaving it out is "almost". */
  optional?: boolean;
  /** Set on words of a non-standard number form: the standard form to say instead. */
  nonStandard?: string;
}

/** One spoken form of a number; a non-standard one is recognized but marked "almost". */
interface NumberForm {
  words: string[];
  nonStandard?: boolean;
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

/** Whole thousands: 3 -> "tree", 12 -> "one two" (each digit, Doc 9432 2.4.3). */
const thousandsWords = (k: number) => digitWords(String(k));

/**
 * Altitude, cloud base, visibility (Doc 9432 2.4.3): whole hundreds and thousands are
 * said as such (2500 -> two thousand fife hundred, 12000 -> one two thousand),
 * other values digit by digit.
 */
function hundredsThousandsWords(digits: string): string[] {
  const n = Number(digits);
  if (n > 0 && n % 1000 === 0) return [...thousandsWords(n / 1000), 'thousand'];
  if (n > 0 && n % 100 === 0) {
    const k = Math.floor(n / 1000);
    const hundreds = (n % 1000) / 100;
    return [...(k > 0 ? [...thousandsWords(k), 'thousand'] : []), ICAO_DIGITS[hundreds], 'hundred'];
  }
  return digitWords(digits);
}

/**
 * Frequencies (Doc 9432 2.4.4): all six digits; when the fifth and sixth are both
 * zero, only the first four (122.500 -> "one two two decimal fife"). Six digits
 * there are non-standard.
 */
function frequencyForms(value: string): NumberForm[] {
  const [whole, fraction] = value.split('.');
  const say = (f: string) => [...digitWords(whole), 'decimal', ...digitWords(f)];
  if (fraction.length === 3 && fraction.endsWith('00')) {
    return [{ words: say(fraction[0]) }, { words: say(fraction), nonStandard: true }];
  }
  return [{ words: say(fraction) }];
}

/** Units of altitude, cloud base and visibility: Doc 9432 2.4.3 applies to them. */
const HUNDREDS_THOUSANDS_UNITS = new Set(['feet', 'ft', 'metres', 'meters', 'm']);

/** "seven thousand" is the standard form, "seven zero zero zero" a non-standard one. */
const wholeForms = (standard: string[], digits: string): NumberForm[] => [
  { words: standard },
  { words: digitWords(digits), nonStandard: true },
];

/**
 * Spoken forms of one written number. The context words decide the rule,
 * the first form is the standard one shown as the expected answer.
 */
function numberForms(value: string, prev: string[], next: string | undefined): NumberForm[] {
  if (value.includes('.')) return frequencyForms(value);

  const n = Number(value);
  const last = prev.at(-1);

  if (next && HUNDREDS_THOUSANDS_UNITS.has(next)) return [{ words: hundredsThousandsWords(value) }];
  if (last === 'level') {
    // FL 95 -> "niner fife", FL100 -> "one hundred" (Doc 9432 2.4.2, 2.4.3).
    if (n > 0 && n % 100 === 0)
      return wholeForms([...digitWords(String(n / 100)), 'hundred'], String(n));
    return [{ words: digitWords(String(n)) }];
  }
  if (last === 'heading') return [{ words: digitWords(value.padStart(3, '0')) }];
  if ((last === 'squawk' || last === 'qnh' || last === 'qfe') && n > 0 && n % 1000 === 0) {
    // Squawk 7000 -> "seven thousand", QNH 1000 -> "one thousand" (2.4.3, appendix 1).
    return wholeForms([...digitWords(String(n / 1000)), 'thousand'], value);
  }
  if (last && AIRCRAFT_MAKERS.has(last)) {
    // An aircraft type is a name, not a number value: "one seven two" or "one seventy two".
    if (value.length === 3) {
      return [
        { words: digitWords(value) },
        { words: [ICAO_DIGITS[Number(value[0])], ...cardinal(n % 100)] },
      ];
    }
    return [{ words: digitWords(value) }];
  }
  // Everything else digit by digit, including distances: 10 -> "one zero".
  return [{ words: digitWords(value) }];
}

const spell = (letters: string) => [...letters.toLowerCase()].map((ch) => NATO_ALPHABET[ch]);

interface WrittenToken {
  text: string;
  /** Inside square brackets: "[altitude] 2000 feet". */
  optional: boolean;
}

/** Splits a written variant into tokens, keeping numbers, registrations, case and [optional] words. */
function writtenTokens(variant: string): WrittenToken[] {
  let rewritten = foldDiacritics(variant);
  for (const [pattern, replacement] of PHRASE_REWRITES) {
    rewritten = rewritten.replace(new RegExp(pattern.source, 'gi'), replacement);
  }
  let inBrackets = false;
  return rewritten
    .replace(/(\d),(\d)/g, '$1$2')
    .split(/[\s,;:!?()"“”]+/)
    .flatMap((raw) => {
      const opens = raw.startsWith('[');
      const closes = raw.endsWith(']');
      if (opens) inBrackets = true;
      const optional = inBrackets;
      if (closes) inBrackets = false;
      const text = raw.replace(/^\[|\]$/g, '').replace(/^[.'’]+|[.'’]+$/g, '');
      return text ? [{ text, optional }] : [];
    });
}

/** Written abbreviations that are said as words: "FL 95" -> "flight level niner fife". */
const WRITTEN_WORDS: Record<string, string[]> = {
  FL: ['flight', 'level'],
  HDG: ['heading'],
  RWY: ['runway'],
};

/** Lowercase spoken words of the written tokens before a number, for the context rules. */
const contextWords = (tokens: WrittenToken[]) =>
  tokens.flatMap((t) => WRITTEN_WORDS[t.text] ?? [t.text.toLowerCase()]);

const REGISTRATION = /^[A-Z]{1,2}-[A-Z]{2,4}$/;
const NUMBER = /^\d+(\.\d+)?$/;

/** All spoken forms of a written variant. */
export function expandToSpoken(variant: string): SpokenWord[][] {
  const tokens = writtenTokens(variant);
  let alternatives: SpokenWord[][] = [[]];
  let groupId = 0;

  tokens.forEach(({ text: token, optional }, index) => {
    const lower = token.toLowerCase();
    let options: SpokenWord[][];

    if (NUMBER.test(token)) {
      const prev = contextWords(tokens.slice(0, index));
      const next = tokens[index + 1]?.text.toLowerCase();
      const group = { id: groupId++, value: token };
      const forms = numberForms(token, prev, next);
      const standard = forms[0].words.join(' ');
      options = forms.map(({ words, nonStandard }) =>
        words.map((word) => ({
          word,
          group: { ...group, size: words.length },
          ...(nonStandard ? { nonStandard: standard } : {}),
        })),
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
    if (optional) options = options.map((option) => option.map((w) => ({ ...w, optional: true })));

    alternatives = alternatives
      .flatMap((prefix) => options.map((option) => [...prefix, ...option]))
      .slice(0, MAX_ALTERNATIVES);
  });

  return alternatives.filter((a) => a.length > 0);
}
