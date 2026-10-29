import { alignWords, type Alignment } from './align';
import { expandToSpoken, type SpokenWord } from './spoken';
import type { HeardWord } from './transcript';
import type { ElementResult, ElementStatus, RequiredElement } from './types';

/** A non-critical element with at least this share of credit gets partial status. */
export const PARTIAL_RATIO = 0.5;

const spokenCache = new Map<string, SpokenWord[][]>();

/** Spoken forms of a variant; content is static, so they are computed once. */
export function spokenForms(variant: string): SpokenWord[][] {
  let forms = spokenCache.get(variant);
  if (!forms) {
    forms = expandToSpoken(variant);
    spokenCache.set(variant, forms);
  }
  return forms;
}

/**
 * Finds the accepted variant (and spoken form) the pilot said best and grades it.
 * A critical element with any missing word is missed: "QNH 1013" with a wrong digit
 * is a wrong QNH. Non-standard forms ("nine" for "niner") only make it partial.
 */
export function matchElement(
  element: RequiredElement,
  heard: HeardWord[],
  critical: boolean,
): ElementResult {
  let best: { alignment: Alignment; ratio: number } | null = null;

  for (const variant of element.acceptedVariants) {
    for (const form of spokenForms(variant)) {
      const alignment = alignWords(form, heard);
      const ratio = alignment.credit / form.length;
      if (!best || ratio > best.ratio) best = { alignment, ratio };
    }
  }

  const alignment = best?.alignment;
  const ratio = best?.ratio ?? 0;
  const words = alignment?.words ?? [];
  const anyMissing = words.some((w) => w.status === 'missing');

  let status: ElementStatus;
  if (words.length > 0 && words.every((w) => w.status === 'correct')) status = 'matched';
  else if (ratio > 0 && (critical ? !anyMissing : ratio >= PARTIAL_RATIO)) status = 'partial';
  else status = 'missed';

  return {
    id: element.id,
    label: element.label,
    status,
    critical,
    similarity: Math.round(Math.min(1, ratio) * 100) / 100,
    words,
    ...(status !== 'missed' && alignment?.heardText !== undefined
      ? { matchedText: alignment.heardText, position: alignment.start }
      : {}),
  };
}
