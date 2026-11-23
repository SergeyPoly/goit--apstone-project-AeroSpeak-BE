import { spokenForms, type ScoringStep, type SpokenWord } from '../scoring';
import { NATO_ALPHABET, SPOKEN_ABBREVIATIONS } from '../scoring/vocabulary';

/** ICAO forms STT keeps when prompted (Deepgram experiment: "minor" -> "niner"). */
const ICAO_NUMBER_TERMS = new Set(['niner', 'decimal', 'tree', 'fife']);
const NATO_WORDS = new Set(Object.values(NATO_ALPHABET));

/**
 * Keyterms for a variant with a number: the whole variant in spoken words and the
 * number in chunks split at "decimal" ("qnh one zero two one", "one two four",
 * "one four zero").
 *
 * Without them Deepgram groups quickly spoken digits into cardinals: "one zero two one"
 * came back as "ten twenty one", "one two four" as "one hundred twenty four". With them
 * it kept the digits in all 32 test recordings (one human voice, three TTS voices), and
 * it still kept the pilot's wrong digits and a real "ten twenty one" in 6 deliberately
 * wrong ones (experiment of November 2026). Only the phrase and the chunks together
 * fixed the frequency; either alone did not.
 */
function numberTerms(form: SpokenWord[]): string[] {
  const numberWords = form.filter((w) => w.group).map((w) => w.word);
  if (numberWords.length === 0) return [];
  const phrase = form.map((w) => w.word).join(' ');
  const chunks = numberWords.join(' ').split(' decimal ');
  return [phrase, ...chunks];
}

/**
 * Builds STT keyterms for a step.
 *
 * - Numbers in spoken words first (see `numberTerms`), so the limit never cuts them.
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

  // The standard spoken form of each variant: how the pilot should say it.
  const numbers = variants.flatMap((variant) => numberTerms(spokenForms(variant)[0] ?? []));

  const words = variants.flatMap((variant) =>
    spokenForms(variant)
      .flat()
      .map((w) => w.word),
  );
  const radioWords = words.filter((w) => ICAO_NUMBER_TERMS.has(w) || NATO_WORDS.has(w));
  const abbreviations = words
    .filter((w) => SPOKEN_ABBREVIATIONS.has(w))
    .map((w) => w.toUpperCase());

  return [...new Set([...numbers, ...phrases, ...abbreviations, ...radioWords])].slice(0, limit);
}
