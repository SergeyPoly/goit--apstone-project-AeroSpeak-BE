import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const createAttemptSchema = z.object({
  scenarioId: z.string().min(1),
  stepId: z.string().min(1),
});

export type CreateAttemptInput = z.infer<typeof createAttemptSchema>;

/** Multipart body, documented for Swagger. */
export class CreateAttemptDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'Recorded pilot transmission' })
  audio: unknown;

  @ApiProperty() scenarioId: string;
  @ApiProperty() stepId: string;
}

export class WordResultDto {
  @ApiProperty({ description: 'Expected word in ICAO form, e.g. "tree", "niner", "alpha"' })
  expected: string;
  @ApiPropertyOptional({ description: 'What STT heard in its place' }) heard?: string;
  @ApiProperty({
    enum: ['correct', 'almost', 'missing'],
    description: 'almost without `heard`: an optional standard word was left out ("altitude")',
  })
  status: 'correct' | 'almost' | 'missing';
  @ApiPropertyOptional({ description: 'STT was unsure about the heard word' }) unclear?: boolean;
}

export class ElementResultDto {
  @ApiProperty() id: string;
  @ApiProperty() label: string;
  @ApiProperty({ enum: ['matched', 'partial', 'missed'] }) status: 'matched' | 'partial' | 'missed';
  @ApiProperty() critical: boolean;
  @ApiProperty({ minimum: 0, maximum: 1 }) similarity: number;
  @ApiPropertyOptional() matchedText?: string;
  @ApiProperty({ type: [WordResultDto], description: 'Word by word result in ICAO spoken form' })
  words: WordResultDto[];
  @ApiPropertyOptional({
    description:
      'Understood but not standard: what to say instead, e.g. \'Say "seven thousand": that is the standard form.\'',
  })
  hint?: string;
}

export class OrderFeedbackDto {
  @ApiProperty({
    enum: ['call', 'readback'],
    description:
      'call: elements in the standard order (station, callsign, position, request, information); ' +
      'readback: callsign at the start or at the end',
  })
  rule: 'call' | 'readback';
  @ApiProperty({ description: 'The elements were said in an acceptable order' }) correct: boolean;
  @ApiProperty({ type: [String], description: 'Ids of elements said in the wrong place' })
  outOfOrder: string[];
  @ApiPropertyOptional({ description: 'What to fix, when the order is wrong' }) message?: string;
  @ApiProperty({ minimum: 0, maximum: 10, description: 'Score points lost for the order' })
  lostPoints: number;
}

export class AttemptResultDto {
  @ApiProperty({ format: 'uuid' }) attemptId: string;
  @ApiProperty({ description: 'Recognized transcript as returned by STT' }) transcript: string;
  @ApiProperty() expectedPilotResponse: string;
  @ApiProperty({ minimum: 0, maximum: 100 }) score: number;
  @ApiProperty({ minimum: 1, maximum: 6 }) displayScore: number;
  @ApiProperty({ description: 'displayScore >= 4' }) success: boolean;
  @ApiProperty({ type: [ElementResultDto] }) elements: ElementResultDto[];
  @ApiProperty({ type: [String] }) missedCritical: string[];
  @ApiProperty() orderCorrect: boolean;
  @ApiPropertyOptional({
    type: OrderFeedbackDto,
    description: 'Order check; absent when there is nothing to compare',
  })
  order?: OrderFeedbackDto;
  @ApiProperty() tip: string;
  @ApiProperty({ description: 'Time from receiving the audio to the result' })
  feedbackProcessingMs: number;
}

export class AttemptForbiddenDto {
  @ApiProperty({
    enum: ['profile_not_found', 'terms_not_accepted'],
    description: 'Registration is not finished: show the terms step and call POST /me',
  })
  code: 'profile_not_found' | 'terms_not_accepted';
  @ApiProperty() message: string;
}
