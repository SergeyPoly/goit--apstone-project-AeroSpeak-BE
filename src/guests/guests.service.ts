import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GuestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(): Promise<{ guestId: string }> {
    const guest = await this.prisma.guest.create({ data: {} });
    return { guestId: guest.id };
  }

  /** Throws if the guest id is malformed or unknown. */
  async assertExists(guestId: string): Promise<void> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guestId);
    const guest = isUuid
      ? await this.prisma.guest.findUnique({ where: { id: guestId }, select: { id: true } })
      : null;
    if (!guest) throw new UnauthorizedException('Unknown guest id');
  }
}
