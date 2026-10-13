import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response DTOs. They exist for the OpenAPI schema (the frontend generates its
 * types from /api-json); the data itself comes from validated JSON content.
 */

export class BriefingItemDto {
  @ApiProperty() label: string;
  @ApiProperty() value: string;
}

export class PhraseologyNoteDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() shortExplanation: string;
  @ApiProperty() example: string;
  @ApiPropertyOptional() whyItMatters?: string;
}

export class RequiredElementDto {
  @ApiProperty() id: string;
  @ApiProperty() label: string;
  @ApiProperty({ type: [String] }) acceptedVariants: string[];
  @ApiProperty() weight: number;
  @ApiPropertyOptional() critical?: boolean;
}

export class ScenarioStepDto {
  @ApiProperty() id: string;
  @ApiProperty({
    enum: ['basic_drill', 'pilot_request', 'atc_instruction', 'pilot_readback', 'self_announce'],
  })
  type: 'basic_drill' | 'pilot_request' | 'atc_instruction' | 'pilot_readback' | 'self_announce';
  @ApiProperty({ enum: ['pilot', 'atc'] }) speaker: 'pilot' | 'atc';
  @ApiProperty() prompt: string;
  @ApiPropertyOptional() atcText?: string;
  @ApiPropertyOptional({ description: 'Path of the ATC audio file in the frontend public folder' })
  atcAudio?: string;
  @ApiProperty() expectedPilotResponse: string;
  @ApiProperty({ type: [RequiredElementDto] }) requiredElements: RequiredElementDto[];
  @ApiPropertyOptional({ type: [String] }) criticalElements?: string[];
  @ApiPropertyOptional() phraseologyReferenceId?: string;
}

export class ScenarioSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() packId: string;
  @ApiProperty({ enum: ['easy', 'medium', 'hard'] }) difficulty: 'easy' | 'medium' | 'hard';
  @ApiProperty() estimatedDurationSec: number;
  @ApiProperty() objective: string;
  @ApiProperty() stepCount: number;
}

export class ScenarioDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() packId: string;
  @ApiProperty({ enum: ['easy', 'medium', 'hard'] }) difficulty: 'easy' | 'medium' | 'hard';
  @ApiProperty() estimatedDurationSec: number;
  @ApiProperty() objective: string;
  @ApiPropertyOptional({ type: [BriefingItemDto] }) briefing?: BriefingItemDto[];
  @ApiPropertyOptional({ type: PhraseologyNoteDto }) phraseologyNote?: PhraseologyNoteDto;
  @ApiProperty({ type: [ScenarioStepDto] }) steps: ScenarioStepDto[];
}

export class PracticePackDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() order: number;
  @ApiPropertyOptional() recommendedForBeginners?: boolean;
  @ApiProperty({ type: [ScenarioSummaryDto] }) scenarios: ScenarioSummaryDto[];
}
