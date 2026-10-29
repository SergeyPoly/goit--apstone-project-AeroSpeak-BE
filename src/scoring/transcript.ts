/**
 * Transcript tokenizer. It keeps the words as heard:
 * "three" stays "three" and "a" stays "a", so the comparer can tell ICAO
 * phraseology from plain English.
 *
 * Two things are joined: bare letters that form a spoken abbreviation
 * ("q n h" -> "qnh") and the phrases in PHRASE_REWRITES ("take off" -> "takeoff").
 * Digits written by STT ("118.505") stay one token with a `numeral` value.
 */
import { SPOKEN_ABBREVIATIONS, applyPhraseRewrites, foldDiacritics } from './vocabulary';

export interface HeardWord {
  word: string;
  /** Set when STT wrote digits instead of words. */
  numeral?: string;
  /** STT confidence of the word this token came from, 0..1. */
  confidence?: number;
}

export interface SttWord {
  word: string;
  confidence: number;
}

const NUMERAL = /^\d+(\.\d+)?$/;

function splitWord(raw: string): string[] {
  const s = foldDiacritics(raw.toLowerCase()).replace(/(\d),(\d)/g, '$1$2');
  return s
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/** Joins runs of single letters where they spell a known abbreviation, longest first. */
function joinAbbreviations(words: HeardWord[]): HeardWord[] {
  const out: HeardWord[] = [];
  let i = 0;
  while (i < words.length) {
    let joined: HeardWord | null = null;
    let end = i;
    while (end < words.length && /^[a-z]$/.test(words[end].word)) end += 1;
    for (let j = end; j > i + 1; j -= 1) {
      const letters = words.slice(i, j);
      const text = letters.map((w) => w.word).join('');
      if (SPOKEN_ABBREVIATIONS.has(text)) {
        const confidences = letters.map((w) => w.confidence).filter((c) => c !== undefined);
        joined = {
          word: text,
          ...(confidences.length ? { confidence: Math.min(...confidences) } : {}),
        };
        out.push(joined);
        i = j;
        break;
      }
    }
    if (!joined) {
      out.push(words[i]);
      i += 1;
    }
  }
  return out;
}

/**
 * Tokenizes STT output. With `sttWords` the per-word confidences are kept;
 * otherwise the plain transcript is used.
 */
export function tokenizeTranscript(transcript: string, sttWords?: SttWord[]): HeardWord[] {
  const source: SttWord[] | Array<{ word: string; confidence?: number }> =
    sttWords && sttWords.length > 0 ? sttWords : [{ word: transcript }];

  const words: HeardWord[] = [];
  for (const { word, confidence } of source) {
    // Phrase rewrites work inside one STT word only; across words they run below.
    for (const token of splitWord(word)) {
      words.push({
        word: token,
        ...(NUMERAL.test(token) ? { numeral: token } : {}),
        ...(confidence !== undefined ? { confidence } : {}),
      });
    }
  }

  return mergePhrases(joinAbbreviations(words));
}

/** Applies PHRASE_REWRITES across tokens, keeping the lowest confidence of the merged words. */
function mergePhrases(words: HeardWord[]): HeardWord[] {
  const out: HeardWord[] = [];
  for (let i = 0; i < words.length; i += 1) {
    let merged = false;
    for (const size of [3, 2]) {
      const slice = words.slice(i, i + size);
      if (slice.length < size || slice.some((w) => w.numeral)) continue;
      const text = slice.map((w) => w.word).join(' ');
      const rewritten = applyPhraseRewrites(text);
      if (rewritten !== text && !rewritten.includes(' ')) {
        const confidences = slice.map((w) => w.confidence).filter((c) => c !== undefined);
        out.push({
          word: rewritten,
          ...(confidences.length ? { confidence: Math.min(...confidences) } : {}),
        });
        i += size - 1;
        merged = true;
        break;
      }
    }
    if (!merged) out.push(words[i]);
  }
  return out;
}
