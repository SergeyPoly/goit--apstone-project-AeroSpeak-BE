/**
 * Transcript normalizer.
 *
 * Brings STT output and expected phrases to one canonical form so they can be
 * compared token by token:
 *   "Runway two one"                    -> "runway 21"
 *   "one two one decimal eight"         -> "121.8"
 *   "one one eight decimal three five zero" -> "118.35" (trailing zeros dropped)
 *   "two thousand five hundred feet"    -> "2500 feet"
 *   "Sierra Papa Tango Foxtrot Alpha"   -> "sptfa"
 *   "SP-TFA"                            -> "sptfa"
 *
 * The same function is applied to accepted variants, so variants may be
 * written in any of these forms.
 */

const DIGIT_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  wun: 1,
  two: 2,
  three: 3,
  tree: 3,
  four: 4,
  fower: 4,
  five: 5,
  fife: 5,
  six: 6,
  seven: 7,
  eight: 8,
  ait: 8,
  nine: 9,
  niner: 9,
};

const TEEN_AND_TENS_WORDS: Record<string, number> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const MULTIPLIER_WORDS: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
};

const DECIMAL_WORDS = new Set(['decimal', 'point', 'dayseemal']);

const NATO_ALPHABET: Record<string, string> = {
  alpha: 'a',
  alfa: 'a',
  bravo: 'b',
  charlie: 'c',
  delta: 'd',
  echo: 'e',
  foxtrot: 'f',
  golf: 'g',
  hotel: 'h',
  india: 'i',
  juliett: 'j',
  juliet: 'j',
  kilo: 'k',
  lima: 'l',
  mike: 'm',
  november: 'n',
  oscar: 'o',
  papa: 'p',
  quebec: 'q',
  romeo: 'r',
  sierra: 's',
  tango: 't',
  uniform: 'u',
  victor: 'v',
  whiskey: 'w',
  whisky: 'w',
  xray: 'x',
  yankee: 'y',
  zulu: 'z',
};

/** Multi-word phrases rewritten before tokenizing. Order matters. */
const PHRASE_REWRITES: Array<[RegExp, string]> = [
  [/\bx[\s-]ray\b/g, 'xray'],
  [/\btake[\s-]off\b/g, 'takeoff'],
  [/\bread[\s-]back\b/g, 'readback'],
  [/\bback[\s-]track(ing)?\b/g, 'backtrack$1'],
  [/\bgo[\s-]around\b/g, 'goaround'],
  [/\btouch[\s-]and[\s-]go\b/g, 'touchandgo'],
  [/\bfull[\s-]stop\b/g, 'fullstop'],
];

type NumberToken =
  | { kind: 'digit'; value: number }
  | { kind: 'tens'; value: number }
  | { kind: 'mult'; value: number }
  | { kind: 'decimal' };

function classifyNumberToken(token: string): NumberToken | null {
  if (/^\d$/.test(token)) return { kind: 'digit', value: Number(token) };
  if (token in DIGIT_WORDS) return { kind: 'digit', value: DIGIT_WORDS[token] };
  if (token in TEEN_AND_TENS_WORDS) {
    return { kind: 'tens', value: TEEN_AND_TENS_WORDS[token] };
  }
  if (token in MULTIPLIER_WORDS) {
    return { kind: 'mult', value: MULTIPLIER_WORDS[token] };
  }
  if (DECIMAL_WORDS.has(token)) return { kind: 'decimal' };
  return null;
}

/**
 * Converts a run of number tokens (no decimal marker) to a digit string.
 * Pure digit runs are read digit by digit ("two one" -> "21", ICAO style);
 * runs with tens or multipliers are read as cardinals
 * ("twenty one" -> "21", "two thousand five hundred" -> "2500").
 */
function numberRunToString(run: NumberToken[]): string {
  const isDigitByDigit = run.every((t) => t.kind === 'digit');
  if (isDigitByDigit) {
    return run.map((t) => (t as { value: number }).value).join('');
  }

  let total = 0;
  let current = 0;
  for (const token of run) {
    if (token.kind === 'digit' || token.kind === 'tens') {
      current += token.value;
    } else if (token.kind === 'mult') {
      if (token.value === 1000) {
        total += (current || 1) * 1000;
        current = 0;
      } else {
        current = (current || 1) * token.value;
      }
    }
  }
  return String(total + current);
}

function stripTrailingDecimalZeros(value: string): string {
  if (!value.includes('.')) return value;
  const [intPart, fracPart] = value.split('.');
  const trimmed = fracPart.replace(/0+$/, '');
  return trimmed.length > 0 ? `${intPart}.${trimmed}` : `${intPart}.0`;
}

/**
 * Collapses runs of spoken or single-digit tokens into numbers.
 * A decimal marker joins the integer and fraction parts.
 */
function collapseNumbers(tokens: string[]): string[] {
  const out: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const first = classifyNumberToken(tokens[i]);
    if (!first || first.kind === 'decimal' || first.kind === 'mult') {
      out.push(tokens[i]);
      i += 1;
      continue;
    }

    const intRun: NumberToken[] = [];
    while (i < tokens.length) {
      const t = classifyNumberToken(tokens[i]);
      if (!t || t.kind === 'decimal') break;
      intRun.push(t);
      i += 1;
    }

    let value = numberRunToString(intRun);

    const marker = i < tokens.length ? classifyNumberToken(tokens[i]) : null;
    const afterMarker =
      i + 1 < tokens.length ? classifyNumberToken(tokens[i + 1]) : null;
    if (marker?.kind === 'decimal' && afterMarker && afterMarker.kind !== 'mult') {
      i += 1;
      const fracRun: NumberToken[] = [];
      while (i < tokens.length) {
        const t = classifyNumberToken(tokens[i]);
        if (!t || t.kind === 'decimal' || t.kind === 'mult') break;
        fracRun.push(t);
        i += 1;
      }
      value = `${value}.${numberRunToString(fracRun)}`;
    }

    out.push(stripTrailingDecimalZeros(value));
  }

  return out;
}

/**
 * Collapses NATO alphabet words and single letters into letter groups:
 * "sierra papa tango" -> "spt", "s p t f a" -> "sptfa",
 * "information bravo" -> "information b".
 */
function collapseLetters(tokens: string[]): string[] {
  const out: string[] = [];
  let buffer = '';

  for (const token of tokens) {
    const letter = NATO_ALPHABET[token] ?? (/^[a-z]$/.test(token) ? token : null);
    if (letter) {
      buffer += letter;
      continue;
    }
    if (buffer) {
      out.push(buffer);
      buffer = '';
    }
    out.push(token);
  }
  if (buffer) out.push(buffer);

  return out;
}

const CHAR_REPLACEMENTS: Record<string, string> = {
  ł: 'l',
  ø: 'o',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  đ: 'd',
  ı: 'i',
};

export function normalize(text: string): string {
  let s = text
    .toLowerCase()
    .replace(/[\u0142\u00f8\u00df\u00e6\u0153\u0111\u0131]/g, (ch) => CHAR_REPLACEMENTS[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

  for (const [pattern, replacement] of PHRASE_REWRITES) {
    s = s.replace(pattern, replacement);
  }

  // Join hyphenated registrations: "sp-tfa" -> "sptfa", "d-eabc" -> "deabc".
  // Only short prefixes, so ordinary hyphenated words are split instead.
  s = s.replace(/\b([a-z]{1,2})-(?=[a-z]{3,4}\b)/g, '$1');

  // Keep a dot only between digits (decimal point), drop other punctuation.
  s = s.replace(/(\d)\.(\d)/g, '$1\u0000$2');
  s = s.replace(/[^a-z0-9\u0000\s]/g, ' ');
  s = s.replace(/\u0000/g, '.');

  const tokens = s.split(/\s+/).filter(Boolean);

  const withNumbers = collapseNumbers(tokens).map(stripTrailingDecimalZeros);
  const withLetters = collapseLetters(withNumbers);

  return withLetters.join(' ');
}

export function tokenize(normalized: string): string[] {
  return normalized.split(' ').filter(Boolean);
}
