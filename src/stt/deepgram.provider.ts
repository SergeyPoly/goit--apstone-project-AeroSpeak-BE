import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { SttProvider, SttRequest, SttResult, SttUnavailableError } from './stt.provider';

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen';
const TIMEOUT_MS = 8000;
/** Deepgram limits the number of keyterms per request. */
const MAX_KEYTERMS = 50;

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string; confidence?: number }>;
    }>;
  };
}

/**
 * Deepgram pre-recorded transcription over the REST API (no SDK needed).
 * Keyterm prompting boosts recall of the step's callsign, runway, station names, etc.
 * Audio is sent from memory and never written to disk.
 */
@Injectable()
export class DeepgramSttProvider extends SttProvider {
  readonly name = 'deepgram';

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
  }

  async transcribe({ audio, mimeType, keyterms }: SttRequest): Promise<SttResult> {
    const params = new URLSearchParams({
      model: this.config.get('DEEPGRAM_MODEL', { infer: true }),
      language: 'en',
      // Keep raw words: our own normalizer handles numbers and letters.
      smart_format: 'false',
      punctuate: 'false',
    });
    for (const term of [...new Set(keyterms)].slice(0, MAX_KEYTERMS)) {
      params.append('keyterm', term);
    }

    let response: Response;
    try {
      response = await fetch(`${DEEPGRAM_URL}?${params.toString()}`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.config.get('DEEPGRAM_API_KEY', { infer: true })}`,
          'Content-Type': mimeType,
        },
        body: new Uint8Array(audio),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new SttUnavailableError('Deepgram request failed or timed out', { cause: error });
    }

    if (!response.ok) {
      throw new SttUnavailableError(`Deepgram responded with ${response.status}`);
    }

    const body = (await response.json()) as DeepgramResponse;
    const alternative = body.results?.channels?.[0]?.alternatives?.[0];
    return {
      transcript: alternative?.transcript ?? '',
      confidence: alternative?.confidence,
      provider: this.name,
    };
  }
}
