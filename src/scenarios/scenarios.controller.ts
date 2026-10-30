import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.decorators';
import { PracticePackDto, ScenarioDto } from './scenarios.dto';
import { ScenariosService } from './scenarios.service';

@Public()
@ApiTags('scenarios')
@Controller()
export class ScenariosController {
  constructor(private readonly scenarios: ScenariosService) {}

  @Get('packs')
  @ApiOkResponse({ type: [PracticePackDto] })
  listPacks(): PracticePackDto[] {
    return this.scenarios.listPacks().map(({ scenarios, ...pack }) => ({
      ...pack,
      scenarios: scenarios.map((s) => ({
        id: s.id,
        title: s.title,
        packId: s.packId,
        difficulty: s.difficulty,
        estimatedDurationSec: s.estimatedDurationSec,
        objective: s.objective,
        stepCount: s.steps.length,
      })),
    }));
  }

  @Get('scenarios/:id')
  @ApiOkResponse({ type: ScenarioDto })
  @ApiNotFoundResponse()
  getScenario(@Param('id') id: string): ScenarioDto {
    return this.scenarios.getScenario(id);
  }
}
