import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
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
        variantCount: this.scenarios.variantKeys(s.id).length,
      })),
    }));
  }

  @Get('scenarios/:id/variants')
  @ApiOkResponse({
    type: [ScenarioDto],
    description: 'Every variant of a scenario, the default first: for content scripts (ATC audio)',
  })
  @ApiNotFoundResponse({ description: 'Unknown scenario' })
  listVariants(@Param('id') id: string): ScenarioDto[] {
    return this.scenarios.variantKeys(id).map((key) => this.scenarios.getScenario(id, key));
  }

  @Get('scenarios/:id')
  @ApiQuery({
    name: 'variant',
    required: false,
    description: 'Variant key from `variants`; the default variant when absent',
  })
  @ApiOkResponse({ type: ScenarioDto })
  @ApiNotFoundResponse({ description: 'Unknown scenario or variant' })
  getScenario(@Param('id') id: string, @Query('variant') variant?: string): ScenarioDto {
    return this.scenarios.getScenario(id, variant || undefined);
  }
}
