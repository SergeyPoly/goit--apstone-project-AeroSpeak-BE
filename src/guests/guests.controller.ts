import { Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/auth.decorators';
import { GuestsService } from './guests.service';

class GuestDto {
  @ApiProperty({ format: 'uuid' })
  guestId: string;
}

// Guest mode is removed once the frontend signs in with Firebase (auth PR 2).
@Public()
@ApiTags('guests')
@Controller('guests')
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}

  /** Creates an anonymous guest so practice works without registration. */
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiCreatedResponse({ type: GuestDto })
  create(): Promise<GuestDto> {
    return this.guests.create();
  }
}
