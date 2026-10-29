/**
 * ICAO radiotelephony vocabulary used by the expander and the word comparer.
 * Plain data, no logic.
 */

/**
 * ICAO digit words (Annex 10 Vol. II 5.2.1.4, CAP 413 table 3). Shown to the user as
 * the expected word; "wun", "too", "fower", "ait" are accepted as equivalents.
 */
export const ICAO_DIGITS = [
  'zero',
  'one',
  'two',
  'tree',
  'four',
  'fife',
  'six',
  'seven',
  'eight',
  'niner',
] as const;

export const NATO_ALPHABET: Record<string, string> = {
  a: 'alpha',
  b: 'bravo',
  c: 'charlie',
  d: 'delta',
  e: 'echo',
  f: 'foxtrot',
  g: 'golf',
  h: 'hotel',
  i: 'india',
  j: 'juliett',
  k: 'kilo',
  l: 'lima',
  m: 'mike',
  n: 'november',
  o: 'oscar',
  p: 'papa',
  q: 'quebec',
  r: 'romeo',
  s: 'sierra',
  t: 'tango',
  u: 'uniform',
  v: 'victor',
  w: 'whiskey',
  x: 'xray',
  y: 'yankee',
  z: 'zulu',
};

/**
 * Abbreviations that are spoken as letters ("Q N H"), not spelled with the NATO
 * alphabet. Anything else in capitals (EPPO, SP-TFA) is spelled.
 */
export const SPOKEN_ABBREVIATIONS = new Set([
  'atis',
  'atz',
  'ctr',
  'dme',
  'fis',
  'ga',
  'gps',
  'ifr',
  'ils',
  'ndb',
  'qfe',
  'qnh',
  'rnav',
  'tma',
  'vfr',
  'vor',
]);

/**
 * Words that sound the same as their ICAO form in speech recognition: STT writes
 * "three" for a well-spoken "tree" and "five" for "fife" (Deepgram experiment,
 * October 2026), so these can't be told apart and count as correct.
 */
const EQUIVALENT_GROUPS = [
  ['tree', 'three'],
  ['fife', 'five'],
  ['four', 'fower', 'for'],
  ['one', 'wun'],
  ['two', 'too', 'to'],
  ['eight', 'ait'],
  ['thousand', 'tousand'],
  ['alpha', 'alfa'],
  ['juliett', 'juliet'],
  ['whiskey', 'whisky'],
];

export const EQUIVALENTS = new Map<string, Set<string>>(
  EQUIVALENT_GROUPS.flatMap((group) => group.map((word) => [word, new Set(group)] as const)),
);

/**
 * Non-ICAO forms that STT does tell apart from the ICAO one: understandable, but
 * not standard phraseology. Expected word -> plain word.
 */
export const NON_STANDARD_FORMS = new Map<string, string>([
  ['niner', 'nine'],
  ['decimal', 'point'],
]);

const CARDINAL_WORDS = [
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
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
  'hundred',
  'thousand',
];

/**
 * Number and spelling words. One of these is never fuzzy-matched against another:
 * "seven" is not a typo of "eleven", "eight" is not "a".
 */
export const RADIO_WORDS = new Set<string>([
  ...ICAO_DIGITS,
  ...Object.values(NATO_ALPHABET),
  ...EQUIVALENT_GROUPS.flat(),
  ...NON_STANDARD_FORMS.values(),
  ...CARDINAL_WORDS,
  'decimal',
]);

/** Words before a number that name an aircraft type: "Cessna 172". */
export const AIRCRAFT_MAKERS = new Set(['airbus', 'boeing', 'cessna', 'diamond', 'piper', 'robin']);

/** Multi-word phrases joined into one token on both sides. Order matters. */
export const PHRASE_REWRITES: Array<[RegExp, string]> = [
  [/\bx[\s-]ray\b/g, 'xray'],
  [/\btake[\s-]off\b/g, 'takeoff'],
  [/\bread[\s-]back\b/g, 'readback'],
  [/\bback[\s-]track(ing)?\b/g, 'backtrack$1'],
  [/\bgo[\s-]around\b/g, 'goaround'],
  [/\btouch[\s-]and[\s-]go\b/g, 'touchandgo'],
  [/\bfull[\s-]stop\b/g, 'fullstop'],
];

const CHAR_REPLACEMENTS: Record<string, string> = {
  ł: 'l',
  ø: 'o',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  đ: 'd',
  ı: 'i',
};

/** Drops diacritics ("Piła" -> "Pila") without changing case. */
export function foldDiacritics(text: string): string {
  return text
    .replace(/[łŁøØßæÆœŒđĐı]/g, (ch) => {
      const lower = CHAR_REPLACEMENTS[ch.toLowerCase()] ?? ch;
      return ch === ch.toLowerCase() ? lower : lower.toUpperCase();
    })
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

export function applyPhraseRewrites(lowercase: string): string {
  let s = lowercase;
  for (const [pattern, replacement] of PHRASE_REWRITES) s = s.replace(pattern, replacement);
  return s;
}
