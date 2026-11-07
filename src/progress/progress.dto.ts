import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { z } from 'zod';
import { AttemptResultDto, OrderFeedbackDto } from '../attempts/attempts.dto';
import { isValidTimeZone } from './progress';

export const attemptHistoryQuerySchema = z.object({
  scenarioId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export type AttemptHistoryQuery = z.infer<typeof attemptHistoryQuerySchema>;

export const dailyProgressQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  tz: z.string().min(1).refine(isValidTimeZone, 'unknown time zone').default('UTC'),
});

export type DailyProgressQuery = z.infer<typeof dailyProgressQuerySchema>;

export class ProgressTotalsDto {
  @ApiProperty({ description: 'Scenarios with a completed run' }) practicedScenarios: number;
  @ApiProperty({ description: 'All scenarios in the content' }) totalScenarios: number;
  @ApiProperty() attempts: number;
  @ApiProperty({ description: 'Attempts with success = true' }) successfulPhrases: number;
  @ApiProperty({ description: 'Successful phrases in the last 7 x 24 hours' })
  successfulPhrasesLast7Days: number;
}

export class ScenarioProgressDto {
  @ApiProperty() scenarioId: string;
  @ApiProperty() packId: string;
  @ApiProperty({ description: 'Completed runs' }) runs: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 100,
    description: 'Null until the first completed run',
  })
  bestScore: number | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 100 })
  lastScore: number | null;
  @ApiProperty({ type: [Number], description: 'Last 20 completed run scores, oldest first' })
  scores: number[];
  @ApiProperty({ type: String, format: 'date-time', description: 'Last attempt of any kind' })
  lastPlayedAt: Date;
  @ApiProperty({ description: 'All attempts in the scenario, finished runs or not' })
  stepAttempts: number;
}

export class ProgressDto {
  @ApiProperty({ type: ProgressTotalsDto }) totals: ProgressTotalsDto;
  @ApiProperty({
    type: [ScenarioProgressDto],
    description: 'Scenarios with at least one attempt, in content order',
  })
  scenarios: ScenarioProgressDto[];
}

export class DailyProgressDto {
  @ApiProperty({ format: 'date', description: 'Calendar day in the requested zone' })
  date: string;
  @ApiProperty() attempts: number;
  @ApiProperty() successful: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) averageScore: number;
}

export class AttemptHistoryItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ description: 'May no longer exist in the content' }) scenarioId: string;
  @ApiProperty({ description: 'May no longer exist in the content' }) stepId: string;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Null on attempts made before runs',
  })
  sessionId: string | null;
  @ApiProperty() transcript: string;
  @ApiProperty({ minimum: 0, maximum: 100 }) score: number;
  @ApiProperty({ minimum: 1, maximum: 6 }) displayScore: number;
  @ApiProperty() success: boolean;
  @ApiProperty({ type: [String] }) missedCritical: string[];
}

export class AttemptHistoryPageDto {
  @ApiProperty({ type: [AttemptHistoryItemDto], description: 'Newest first' })
  items: AttemptHistoryItemDto[];
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Pass as `cursor` for the next page; null on the last page',
  })
  nextCursor: string | null;
}

/**
 * The result of POST /attempts as it was saved. The optional fields are missing on
 * attempts saved before they were stored; `order` also when there was nothing to compare.
 */
export class AttemptDetailDto extends OmitType(AttemptResultDto, [
  'expectedPilotResponse',
  'orderCorrect',
  'order',
  'tip',
] as const) {
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty() scenarioId: string;
  @ApiProperty() stepId: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) sessionId: string | null;
  @ApiPropertyOptional() expectedPilotResponse?: string;
  @ApiPropertyOptional() orderCorrect?: boolean;
  @ApiPropertyOptional({ type: OrderFeedbackDto }) order?: OrderFeedbackDto;
  @ApiPropertyOptional() tip?: string;
}

export class AttemptNotFoundDto {
  @ApiProperty({ enum: ['attempt_not_found'] }) code: 'attempt_not_found';
  @ApiProperty() message: string;
}
