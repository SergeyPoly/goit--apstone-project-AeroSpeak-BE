import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthErrorDto } from '../auth/auth.dto';
import type { AuthUser } from '../auth/token-verifier';
import { MeDto, ProfileNotFoundDto, RegisterDto, registerSchema } from './me.dto';
import { MeService } from './me.service';

@ApiTags('me')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: AuthErrorDto, description: 'Missing, invalid or expired token' })
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  /** Finishes registration after Firebase sign-up: accepts the terms, creates the profile. */
  @Post()
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiBody({ type: RegisterDto })
  @ApiOkResponse({ type: MeDto })
  @ApiBadRequestResponse({ description: 'acceptTerms is not true or name is invalid' })
  @ApiTooManyRequestsResponse()
  register(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<MeDto> {
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      );
    }
    return this.me.register(user, parsed.data);
  }

  @Get()
  @ApiOkResponse({ type: MeDto })
  @ApiNotFoundResponse({ type: ProfileNotFoundDto, description: 'POST /me was never called' })
  get(@CurrentUser() user: AuthUser): Promise<MeDto> {
    return this.me.get(user);
  }

  /** Called by the consent dialog shown before the first recording. */
  @Post('voice-consent')
  @HttpCode(200)
  @ApiOkResponse({ type: MeDto })
  @ApiNotFoundResponse({ type: ProfileNotFoundDto, description: 'POST /me was never called' })
  giveVoiceConsent(@CurrentUser() user: AuthUser): Promise<MeDto> {
    return this.me.giveVoiceConsent(user);
  }

  /**
   * Deletes the profile and all attempts. The frontend then deletes the Firebase
   * account itself with deleteUser(auth.currentUser).
   */
  @Delete()
  @HttpCode(204)
  @ApiNoContentResponse()
  async delete(@CurrentUser() user: AuthUser): Promise<void> {
    await this.me.delete(user);
  }
}
