import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { toElementDtos, type OrderFeedbackDto } from '../attempts/attempts.dto';
import type { AuthUser } from '../auth/token-verifier';
import { PrismaService } from '../prisma/prisma.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import type { ElementResult } from '../scoring';
import { buildDailyProgress, buildProgress, dailyWindowStart } from './progress';
import type {
  AttemptDetailDto,
  AttemptHistoryPageDto,
  AttemptHistoryQuery,
  DailyProgressDto,
  DailyProgressQuery,
  ProgressDto,
} from './progress.dto';

const uuid = z.string().uuid();

/** Progress and attempt history of the signed-in user, read from saved attempts. */
@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scenarios: ScenariosService,
  ) {}

  async getProgress(authUser: AuthUser): Promise<ProgressDto> {
    const userId = await this.profileId(authUser);
    const attempts = await this.prisma.attempt.findMany({
      where: { userId },
      select: {
        scenarioId: true,
        stepId: true,
        sessionId: true,
        score: true,
        success: true,
        createdAt: true,
      },
    });
    const catalogue = this.scenarios.listScenarios().map((scenario) => ({
      id: scenario.id,
      packId: scenario.packId,
      stepIds: scenario.steps.map((step) => step.id),
    }));
    return buildProgress(attempts, catalogue, new Date());
  }

  async getDaily(authUser: AuthUser, query: DailyProgressQuery): Promise<DailyProgressDto[]> {
    const userId = await this.profileId(authUser);
    const now = new Date();
    const attempts = await this.prisma.attempt.findMany({
      where: { userId, createdAt: { gte: dailyWindowStart(query.days, now) } },
      select: { score: true, success: true, createdAt: true },
    });
    return buildDailyProgress(attempts, { days: query.days, timeZone: query.tz, now });
  }

  async listAttempts(
    authUser: AuthUser,
    query: AttemptHistoryQuery,
  ): Promise<AttemptHistoryPageDto> {
    const userId = await this.profileId(authUser);
    const where = { userId, ...(query.scenarioId && { scenarioId: query.scenarioId }) };

    if (query.cursor) {
      // Prisma starts from any row with this id, so the cursor must be from this list.
      const cursorRow = await this.prisma.attempt.findFirst({
        where: { ...where, id: query.cursor },
        select: { id: true },
      });
      if (!cursorRow) {
        throw new BadRequestException({
          code: 'invalid_cursor',
          message: 'cursor is not an attempt of this list',
        });
      }
    }

    // One row more than the page shows whether there is a next page.
    const rows = await this.prisma.attempt.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      select: {
        id: true,
        createdAt: true,
        scenarioId: true,
        stepId: true,
        sessionId: true,
        transcript: true,
        score: true,
        displayScore: true,
        success: true,
        missedCritical: true,
      },
    });
    const items = rows.slice(0, query.limit);
    return {
      items,
      nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async getAttempt(authUser: AuthUser, id: string): Promise<AttemptDetailDto> {
    const userId = await this.profileId(authUser);
    // The id column is a uuid: anything else cannot exist and would be a database error.
    const attempt = uuid.safeParse(id).success
      ? await this.prisma.attempt.findFirst({ where: { id, userId } })
      : null;
    if (!attempt) {
      // The same answer for someone else's attempt: never reveal that it exists.
      throw new NotFoundException({ code: 'attempt_not_found', message: 'Attempt not found' });
    }

    const order = attempt.order as unknown as OrderFeedbackDto | null;
    return {
      attemptId: attempt.id,
      createdAt: attempt.createdAt,
      scenarioId: attempt.scenarioId,
      stepId: attempt.stepId,
      sessionId: attempt.sessionId,
      transcript: attempt.transcript,
      score: attempt.score,
      displayScore: attempt.displayScore,
      success: attempt.success,
      elements: toElementDtos(attempt.elements as unknown as ElementResult[]),
      missedCritical: attempt.missedCritical,
      feedbackProcessingMs: attempt.processingMs,
      ...(attempt.expectedPilotResponse !== null && {
        expectedPilotResponse: attempt.expectedPilotResponse,
      }),
      // `tip` is always saved now, so without it the order result is unknown, not "no order".
      ...(attempt.tip !== null && { tip: attempt.tip, orderCorrect: order?.correct ?? true }),
      ...(order && { order }),
    };
  }

  private async profileId(authUser: AuthUser): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid: authUser.uid },
      select: { id: true },
    });
    if (!user) {
      throw new ForbiddenException({
        code: 'profile_not_found',
        message: 'Registration is not finished: call POST /me first',
      });
    }
    return user.id;
  }
}
