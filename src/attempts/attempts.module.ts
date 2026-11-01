import { Module } from '@nestjs/common';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { SttModule } from '../stt/stt.module';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';

@Module({
  imports: [ScenariosModule, SttModule],
  controllers: [AttemptsController],
  providers: [AttemptsService],
})
export class AttemptsModule {}
