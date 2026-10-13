import { Module } from '@nestjs/common';
import { DeepgramSttProvider } from './deepgram.provider';
import { SttProvider } from './stt.provider';

/**
 * Binds the abstract SttProvider to a concrete implementation.
 * To compare providers, add another class and switch it here (or by env).
 */
@Module({
  providers: [{ provide: SttProvider, useClass: DeepgramSttProvider }],
  exports: [SttProvider],
})
export class SttModule {}
