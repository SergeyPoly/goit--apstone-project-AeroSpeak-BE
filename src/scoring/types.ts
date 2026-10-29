/**
 * Scoring engine types.
 *
 * The scoring module is plain TypeScript with no NestJS or third-party
 * dependencies, so it can be unit-tested in isolation and reused elsewhere.
 */

export type StepType =
  'basic_drill' | 'pilot_request' | 'atc_instruction' | 'pilot_readback' | 'self_announce';

export interface RequiredElement {
  id: string;
  label: string;
  /** Accepted phrasings, written as on paper ("QNH 1013"); expanded to ICAO speech for scoring. */
  acceptedVariants: string[];
  /** Relative weight inside the step. Weights do not have to sum to 100. */
  weight: number;
  /** Safety-critical element: missing it caps the score below "success". */
  critical?: boolean;
}

export interface ScoringStep {
  type: StepType;
  expectedPilotResponse: string;
  /** Elements in the order they are expected to be spoken. */
  requiredElements: RequiredElement[];
  /** Ids of critical elements (alternative to `critical: true` on the element). */
  criticalElements?: string[];
}

export interface ScoreInput {
  transcript: string;
  /**
   * Per-word STT output with confidences. When given, a wrong word that STT was
   * unsure about is marked "unclear" instead of wrong. It never adds to the score.
   */
  words?: Array<{ word: string; confidence: number }>;
}

export type ElementStatus = 'matched' | 'partial' | 'missed';

/**
 * One expected spoken word: correct, almost (non-standard form, accent or
 * unclear audio) or missing (not said, or a different word was heard).
 */
export type WordStatus = 'correct' | 'almost' | 'missing';

export interface WordResult {
  /** Expected word in ICAO form ("tree", "niner", "alpha"). */
  expected: string;
  /** What STT heard in its place, if anything. */
  heard?: string;
  status: WordStatus;
  /** STT was unsure about the heard word (low confidence). */
  unclear?: boolean;
}

export interface ElementResult {
  id: string;
  label: string;
  status: ElementStatus;
  critical: boolean;
  /** 0..1 share of the element's words recognized (almost counts partly). */
  similarity: number;
  /** Fragment of the transcript that matched, if any. */
  matchedText?: string;
  /** Word by word result for the best matching accepted variant. */
  words: WordResult[];
  /** Token index where the match starts, used for the order check. */
  position?: number;
}

export interface ScoreResult {
  /** Internal score, 0..100. */
  score: number;
  /** AeroSpeak display score, 1..6. */
  displayScore: number;
  /** displayScore >= 4. */
  success: boolean;
  /** Transcript tokens as compared: lowercase, abbreviations joined. */
  normalizedTranscript: string;
  elements: ElementResult[];
  missedCritical: string[];
  orderCorrect: boolean;
  tip: string;
}
