/**
 * Scoring engine types.
 *
 * The scoring module is plain TypeScript with no NestJS or third-party
 * dependencies, so it can be unit-tested in isolation and reused elsewhere.
 */

export type StepType =
  | 'basic_drill'
  | 'pilot_request'
  | 'atc_instruction'
  | 'pilot_readback'
  | 'self_announce';

export interface RequiredElement {
  id: string;
  label: string;
  /** Accepted phrasings. They are normalized the same way as the transcript. */
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
  /** STT confidence in the 0..1 range, used as a clarity proxy. */
  confidence?: number;
}

export type ElementStatus = 'matched' | 'partial' | 'missed';

export interface ElementResult {
  id: string;
  label: string;
  status: ElementStatus;
  critical: boolean;
  /** 0..1 similarity of the best match found in the transcript. */
  similarity: number;
  /** Fragment of the normalized transcript that matched, if any. */
  matchedText?: string;
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
  normalizedTranscript: string;
  elements: ElementResult[];
  missedCritical: string[];
  orderCorrect: boolean;
  tip: string;
}
