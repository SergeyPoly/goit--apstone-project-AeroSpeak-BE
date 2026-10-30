import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  acceptTerms: z.literal(true),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export class RegisterDto {
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 80,
    description: 'Display name; defaults to the name from the ID token (Google sign-in)',
  })
  name?: string;
  @ApiProperty({ enum: [true], description: 'Must be true: the user accepted the terms' })
  acceptTerms: true;
}

export class MeDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: String, nullable: true }) email: string | null;
  @ApiProperty({ type: String, nullable: true }) name: string | null;
  @ApiProperty() emailVerified: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  termsAcceptedAt: Date | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Set by POST /me/voice-consent before the first recording',
  })
  voiceConsentAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class ProfileNotFoundDto {
  @ApiProperty({ enum: ['profile_not_found'] }) code: 'profile_not_found';
  @ApiProperty() message: string;
}
