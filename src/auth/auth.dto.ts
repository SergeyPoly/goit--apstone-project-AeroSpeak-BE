import { ApiProperty } from '@nestjs/swagger';

/** Error body for 401 responses of protected routes. */
export class AuthErrorDto {
  @ApiProperty({
    enum: ['unauthorized', 'token_expired'],
    description: 'token_expired: refresh the ID token with getIdToken(true) and retry once',
  })
  code: 'unauthorized' | 'token_expired';
  @ApiProperty() message: string;
}
