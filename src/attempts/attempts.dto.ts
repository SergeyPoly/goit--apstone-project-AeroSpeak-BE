import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const createAttemptSchema = z.object({
  guestId: z.string().uuid(),
  scenarioId: z.string().min(1),
  stepId: z.string().min(1),
});

export type CreateAttemptInput = z.infer<typeof createAttemptSchema>;

/** Multipart body, documented for Swagger. */
export class CreateAttemptDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'Recorded pilot transmission' })
  audio: unknown;

  @ApiProperty({ format: 'uuid' }) guestId: string;
  @ApiProperty() scenarioId: string;
  @ApiProperty() stepId: string;
}

export class ElementResultDto {
  @ApiProperty() id: string;
  @ApiProperty() label: string;
  @ApiProperty({ enum: ['matched', 'partial', 'missed'] }) status: 'matched' | 'partial' | 'missed';
  @ApiProperty() critical: boolean;
  @ApiProperty({ minimum: 0, maximum: 1 }) similarity: number;
  @ApiPropertyOptional() matchedText?: string;
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
  @ApiProperty() tip: string;
  @ApiProperty({ description: 'Time from receiving the audio to the result' })
  feedbackProcessingMs: number;
}
