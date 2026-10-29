export interface SttRequest {
  audio: Buffer;
  mimeType: string;
  /** Domain terms to boost for this step (callsign, runway, station, ...). */
  keyterms: string[];
}

export interface SttResult {
  transcript: string;
  /** 0..1, if the provider reports it. */
  confidence?: number;
  /** Recognized words with their 0..1 confidence, if the provider reports them. */
  words?: Array<{ word: string; confidence: number }>;
  provider: string;
}

/**
 * Speech-to-text abstraction. Providers are swappable by configuration, which
 * also makes it easy to compare them for the thesis experiments.
 */
export abstract class SttProvider {
  abstract readonly name: string;
  abstract transcribe(request: SttRequest): Promise<SttResult>;
}

/** Thrown when the provider is unavailable or times out. Not the user's fault. */
export class SttUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SttUnavailableError';
  }
}
