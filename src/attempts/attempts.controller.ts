import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthErrorDto } from '../auth/auth.dto';
import type { AuthUser } from '../auth/token-verifier';
import {
  AttemptForbiddenDto,
  AttemptResultDto,
  CreateAttemptDto,
  createAttemptSchema,
} from './attempts.dto';
import { AttemptsService } from './attempts.service';

/** Radio calls are short; 2 MB is far more than a 30-second compressed recording. */
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
/** Chrome records webm/opus, Safari records mp4/aac. */
const ALLOWED_AUDIO_TYPES = /^audio\/(webm|mp4|x-m4a|aac|mpeg|ogg|wav|x-wav)(;.*)?$/;

@ApiTags('attempts')
@ApiBearerAuth()
@Controller('attempts')
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Post()
  // Every attempt costs an STT call, so it has a stricter limit than other routes.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateAttemptDto })
  @ApiCreatedResponse({ type: AttemptResultDto })
  @ApiBadRequestResponse({ description: 'Missing or invalid audio or fields' })
  @ApiUnauthorizedResponse({ type: AuthErrorDto, description: 'Missing, invalid or expired token' })
  @ApiForbiddenResponse({ type: AttemptForbiddenDto })
  @ApiServiceUnavailableResponse({ description: 'STT provider failed; retry without penalty' })
  @ApiTooManyRequestsResponse()
  create(
    @CurrentUser() user: AuthUser,
    @UploadedFile() audio: Express.Multer.File | undefined,
    @Body() body: unknown,
  ): Promise<AttemptResultDto> {
    if (!audio || audio.size === 0) throw new BadRequestException('audio file is required');
    if (!ALLOWED_AUDIO_TYPES.test(audio.mimetype)) {
      throw new BadRequestException(`unsupported audio type ${audio.mimetype}`);
    }

    const parsed = createAttemptSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      );
    }

    return this.attempts.create(user, parsed.data, {
      buffer: audio.buffer,
      mimeType: audio.mimetype,
    });
  }
}
