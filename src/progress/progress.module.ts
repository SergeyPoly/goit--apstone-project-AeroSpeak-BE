import { Module } from '@nestjs/common';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
  imports: [ScenariosModule],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
