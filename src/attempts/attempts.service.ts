import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { GuestsService } from '../guests/guests.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { scoreTransmission } from '../scoring';
import { SttProvider, SttUnavailableError, type SttResult } from '../stt/stt.provider';
import type { AttemptResultDto, CreateAttemptInput } from './attempts.dto';
import { keytermsForStep } from './keyterms';

@Injectable()
export class AttemptsService {
  private readonly logger = new Logger(AttemptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scenarios: ScenariosService,
    private readonly guests: GuestsService,
    private readonly stt: SttProvider,
  ) {}

  /**
   * Full practice loop for one transmission:
   * audio -> STT -> word-by-word scoring -> save result -> feedback.
   * The audio buffer is only held in memory for the STT call and never stored.
   */
  async create(
    input: CreateAttemptInput,
    audio: { buffer: Buffer; mimeType: string },
  ): Promise<AttemptResultDto> {
    const startedAt = Date.now();
    await this.guests.assertExists(input.guestId);
    const { scenario, step } = this.scenarios.getStep(input.scenarioId, input.stepId);

    let stt: SttResult;
    try {
      stt = await this.stt.transcribe({
        audio: audio.buffer,
        mimeType: audio.mimeType,
        keyterms: keytermsForStep(step),
      });
    } catch (error) {
      if (error instanceof SttUnavailableError) {
        this.logger.warn(`STT failed: ${error.message}`);
        // Not the user's fault: the frontend shows "try again" without a score.
        throw new ServiceUnavailableException({
          code: 'stt_failed',
          message: 'Speech recognition is unavailable, please try again',
        });
      }
      throw error;
    }

    const result = scoreTransmission(step, {
      transcript: stt.transcript,
      words: stt.words,
    });
    const feedbackProcessingMs = Date.now() - startedAt;

    const attempt = await this.prisma.attempt.create({
      data: {
        guestId: input.guestId,
        packId: scenario.packId,
        scenarioId: scenario.id,
        stepId: step.id,
        transcript: stt.transcript,
        sttConfidence: stt.confidence ?? null,
        score: result.score,
        displayScore: result.displayScore,
        success: result.success,
        missedCritical: result.missedCritical,
        elements: result.elements as unknown as Prisma.InputJsonValue,
        processingMs: feedbackProcessingMs,
      },
      select: { id: true },
    });

    return {
      attemptId: attempt.id,
      transcript: stt.transcript,
      expectedPilotResponse: step.expectedPilotResponse,
      score: result.score,
      displayScore: result.displayScore,
      success: result.success,
      elements: result.elements.map(({ position: _position, ...element }) => element),
      missedCritical: result.missedCritical,
      orderCorrect: result.orderCorrect,
      ...(result.order ? { order: result.order } : {}),
      tip: result.tip,
      feedbackProcessingMs,
    };
  }
}
