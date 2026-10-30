import { Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { AuthUser } from '../auth/token-verifier';
import { PrismaService } from '../prisma/prisma.service';
import type { MeDto, RegisterInput } from './me.dto';

function toDto(user: User): MeDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    termsAcceptedAt: user.termsAcceptedAt,
    voiceConsentAt: user.voiceConsentAt,
    createdAt: user.createdAt,
  };
}

/** The signed-in user's profile, keyed by the Firebase uid. */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Finishes registration. Idempotent: repeating it keeps the first acceptance time. */
  async register(authUser: AuthUser, input: RegisterInput): Promise<MeDto> {
    const fromToken = { email: authUser.email, emailVerified: authUser.emailVerified };
    let user = await this.prisma.user.upsert({
      where: { firebaseUid: authUser.uid },
      create: {
        firebaseUid: authUser.uid,
        ...fromToken,
        name: input.name ?? authUser.name,
        termsAcceptedAt: new Date(),
      },
      update: { ...fromToken, ...(input.name && { name: input.name }) },
    });
    if (!user.termsAcceptedAt) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { termsAcceptedAt: new Date() },
      });
    }
    return toDto(user);
  }

  /** Returns the profile and refreshes email data that changed in Firebase. */
  async get(authUser: AuthUser): Promise<MeDto> {
    let user = await this.findOrThrow(authUser);
    if (user.email !== authUser.email || user.emailVerified !== authUser.emailVerified) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { email: authUser.email, emailVerified: authUser.emailVerified },
      });
    }
    return toDto(user);
  }

  /** Records consent to voice processing; keeps the first consent time. */
  async giveVoiceConsent(authUser: AuthUser): Promise<MeDto> {
    let user = await this.findOrThrow(authUser);
    if (!user.voiceConsentAt) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { voiceConsentAt: new Date() },
      });
    }
    return toDto(user);
  }

  /** Deletes the profile and, by cascade, its attempts. Safe to repeat. */
  async delete(authUser: AuthUser): Promise<void> {
    await this.prisma.user.deleteMany({ where: { firebaseUid: authUser.uid } });
  }

  private async findOrThrow(authUser: AuthUser): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { firebaseUid: authUser.uid } });
    if (!user) {
      throw new NotFoundException({
        code: 'profile_not_found',
        message: 'Registration is not finished: call POST /me first',
      });
    }
    return user;
  }
}
