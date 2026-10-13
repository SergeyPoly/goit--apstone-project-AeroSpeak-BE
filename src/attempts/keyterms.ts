import type { ScoringStep } from '../scoring';

/**
 * Builds STT keyterms for a step from its accepted variants.
 * Short multi-word phrases work best for keyterm prompting, so long phrases
 * are skipped and only the distinctive ones (with names, letters or numbers) kept.
 */
export function keytermsForStep(step: ScoringStep, limit = 50): string[] {
  const terms = step.requiredElements.flatMap((element) => element.acceptedVariants);
  const distinctive = terms.filter((term) => {
    const words = term.trim().split(/\s+/);
    return words.length <= 6 && /[A-Z0-9]/.test(term);
  });
  return [...new Set(distinctive)].slice(0, limit);
}
