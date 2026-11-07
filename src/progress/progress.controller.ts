import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthErrorDto } from '../auth/auth.dto';
import type { AuthUser } from '../auth/token-verifier';
import { ProfileNotFoundDto } from '../me/me.dto';
import {
  AttemptDetailDto,
  AttemptHistoryPageDto,
  attemptHistoryQuerySchema,
  AttemptNotFoundDto,
  DailyProgressDto,
  dailyProgressQuerySchema,
  ProgressDto,
} from './progress.dto';
import { ProgressService } from './progress.service';

function parseQuery<T extends z.ZodTypeAny>(schema: T, query: unknown): z.output<T> {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestException(
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }
  return parsed.data as z.output<T>;
}

@ApiTags('progress')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: AuthErrorDto, description: 'Missing, invalid or expired token' })
@ApiForbiddenResponse({ type: ProfileNotFoundDto, description: 'POST /me was never called' })
@Controller('me')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  /** Progress per scenario and totals. Group scenarios into sections on the frontend. */
  @Get('progress')
  @ApiOkResponse({ type: ProgressDto })
  getProgress(@CurrentUser() user: AuthUser): Promise<ProgressDto> {
    return this.progress.getProgress(user);
  }

  /** Attempts per day for the score chart: only days with attempts, oldest first. */
  @Get('progress/daily')
  @ApiQuery({ name: 'days', required: false, type: Number, description: '1-365, default 30' })
  @ApiQuery({
    name: 'tz',
    required: false,
    type: String,
    description: 'IANA time zone, e.g. Europe/Warsaw; default UTC',
  })
  @ApiOkResponse({ type: [DailyProgressDto] })
  @ApiBadRequestResponse({ description: 'Invalid days or tz' })
  getDaily(@CurrentUser() user: AuthUser, @Query() query: unknown): Promise<DailyProgressDto[]> {
    return this.progress.getDaily(user, parseQuery(dailyProgressQuerySchema, query));
  }

  /** Attempt history, newest first. Open one with GET /me/attempts/:id for the full feedback. */
  @Get('attempts')
  @ApiQuery({ name: 'scenarioId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '1-100, default 20' })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: '`nextCursor` of the previous page',
  })
  @ApiOkResponse({ type: AttemptHistoryPageDto })
  @ApiBadRequestResponse({ description: 'Invalid limit or cursor' })
  listAttempts(
    @CurrentUser() user: AuthUser,
    @Query() query: unknown,
  ): Promise<AttemptHistoryPageDto> {
    return this.progress.listAttempts(user, parseQuery(attemptHistoryQuerySchema, query));
  }

  /** One attempt with its word-by-word feedback. */
  @Get('attempts/:id')
  @ApiOkResponse({ type: AttemptDetailDto })
  @ApiNotFoundResponse({ type: AttemptNotFoundDto, description: 'No such attempt of this user' })
  getAttempt(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<AttemptDetailDto> {
    return this.progress.getAttempt(user, id);
  }
}
