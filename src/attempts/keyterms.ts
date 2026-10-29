import { spokenForms, type ScoringStep } from '../scoring';
import { NATO_ALPHABET, SPOKEN_ABBREVIATIONS } from '../scoring/vocabulary';

/** ICAO forms STT keeps when prompted (Deepgram experiment: "minor" -> "niner"). */
const ICAO_NUMBER_TERMS = new Set(['niner', 'decimal', 'tree', 'fife']);
const NATO_WORDS = new Set(Object.values(NATO_ALPHABET));

/**
 * Builds STT keyterms for a step.
 *
 * - Short distinctive phrases (names, NATO words) from the accepted variants, but never
 *   ones with digits or codes: a keyterm like "118.505" or "QNH 1013" makes Deepgram
 *   write digits or cardinals ("ten thirteen"), "SP-TFA" could come back as letters.
 * - The ICAO number words, NATO words and abbreviations the step's spoken forms use.
 */
export function keytermsForStep(step: ScoringStep, limit = 50): string[] {
  const variants = step.requiredElements.flatMap((element) => element.acceptedVariants);

  const phrases = variants.filter((term) => {
    const words = term.trim().split(/\s+/);
    const spokenAsWritten = words.every(
      (w) => /[a-z]/.test(w) || SPOKEN_ABBREVIATIONS.has(w.toLowerCase()),
    );
    return words.length <= 6 && /[A-Z]/.test(term) && !/\d/.test(term) && spokenAsWritten;
  });

  const words = variants.flatMap((variant) =>
    spokenForms(variant)
      .flat()
      .map((w) => w.word),
  );
  const radioWords = words.filter((w) => ICAO_NUMBER_TERMS.has(w) || NATO_WORDS.has(w));
  const abbreviations = words
    .filter((w) => SPOKEN_ABBREVIATIONS.has(w))
    .map((w) => w.toUpperCase());

  return [...new Set([...phrases, ...abbreviations, ...radioWords])].slice(0, limit);
}
