import { alignWords, type Alignment, type AlignmentIssues } from './align';
import { expandToSpoken, type SpokenWord } from './spoken';
import type { HeardWord } from './transcript';
import type { ElementResult, ElementStatus, RequiredElement, WordResult } from './types';
import { NON_STANDARD_FORMS } from './vocabulary';

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

/** What to say instead, when the element was understood but not said the standard way. */
function hintFor({ nonStandard, omitted, unexpected }: AlignmentIssues): string | undefined {
  const hints = [
    ...(unexpected.includes('to')
      ? ['"to" before a number or "altitude" is an error (AIP Polska GEN 1.7): leave it out.']
      : []),
    ...nonStandard.map((form) => `Say "${form}": that is the standard form.`),
    ...omitted.map((word) => `Say "${word}" too.`),
  ];
  return hints.length ? hints.join(' ') : undefined;
}

/** Understood but non-standard phraseology: each one costs score points (see score.ts). */
function countIssues(issues: AlignmentIssues, words: WordResult[]): number {
  const plainForms = words.filter(
    (w) => w.status === 'almost' && w.heard && NON_STANDARD_FORMS.get(w.expected) === w.heard,
  );
  return issues.nonStandard.length + issues.omitted.length + plainForms.length;
}

/**
 * Finds the accepted variant (and spoken form) the pilot said best and grades it.
 * A critical element with any missing word is missed: "QNH 1013" with a wrong digit
 * is a wrong QNH. Non-standard forms ("nine" for "niner") only make it partial.
 * `claimed` are the heard words this element recognized; see `alignWords` for `blocked`.
 *
 * When a step has several elements and none of this element's words was recognized,
 * the pilot simply left it out: the words are missing, with no "heard instead" and no
 * credit for unclear words (they would be random neighbours like "at"). A one-element
 * drill keeps them: there "a" really is the answer given for "alpha".
 */
export function matchElement(
  element: RequiredElement,
  heard: HeardWord[],
  critical: boolean,
  blocked: ReadonlySet<number> = new Set(),
  soleElement = true,
): { result: ElementResult; claimed: number[] } {
  let best: { alignment: Alignment; ratio: number } | null = null;

  for (const variant of element.acceptedVariants) {
    for (const form of spokenForms(variant)) {
      const alignment = alignWords(form, heard, blocked);
      const ratio = alignment.credit / form.length;
      if (!best || ratio > best.ratio) best = { alignment, ratio };
    }
  }

  const alignment = best?.alignment;
  const leftOut = !soleElement && (alignment?.claimed.length ?? 0) === 0;
  const ratio = leftOut ? 0 : (best?.ratio ?? 0);
  const words = leftOut
    ? (alignment?.words ?? []).map(({ expected }) => ({ expected, status: 'missing' as const }))
    : (alignment?.words ?? []);
  const anyMissing = words.some((w) => w.status === 'missing');
  const issues = leftOut ? undefined : alignment?.issues;
  const hint = issues && hintFor(issues);
  // "climbing TO 2000 feet": an error, not a style issue (AIP Polska GEN 1.7).
  const toError = issues?.unexpected.includes('to') ?? false;

  let status: ElementStatus;
  if (toError) status = 'missed';
  else if (words.length > 0 && words.every((w) => w.status === 'correct') && !hint)
    status = 'matched';
  else if (ratio > 0 && (critical ? !anyMissing : ratio >= PARTIAL_RATIO)) status = 'partial';
  else status = 'missed';

  const result: ElementResult = {
    id: element.id,
    label: element.label,
    status,
    critical,
    similarity: toError ? 0 : Math.round(Math.min(1, ratio) * 100) / 100,
    words,
    ...(hint ? { hint } : {}),
    ...(issues && status === 'partial' ? { issues: countIssues(issues, words) } : {}),
    ...(status !== 'missed' && alignment?.heardText !== undefined
      ? { matchedText: alignment.heardText, position: alignment.start }
      : {}),
  };
  return { result, claimed: alignment?.claimed ?? [] };
}
