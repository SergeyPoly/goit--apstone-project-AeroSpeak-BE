import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { resolve } from 'node:path';
import { loadContent } from './content-loader';
import type { PracticePack, Scenario, ScenarioStep } from './scenario.schema';

export const CONTENT_DIR = resolve(process.cwd(), 'content');

@Injectable()
export class ScenariosService implements OnModuleInit {
  private readonly logger = new Logger(ScenariosService.name);
  private packs: PracticePack[] = [];
  private scenarios = new Map<string, Scenario>();

  onModuleInit() {
    const content = loadContent(CONTENT_DIR);
    this.packs = content.packs;
    this.scenarios = new Map(content.scenarios.map((s) => [s.id, s]));
    this.logger.log(`Loaded ${this.packs.length} packs and ${this.scenarios.size} scenarios`);
  }

  listPacks(): Array<PracticePack & { scenarios: Scenario[] }> {
    const all = [...this.scenarios.values()];
    return this.packs.map((pack) => ({
      ...pack,
      scenarios: all.filter((s) => s.packId === pack.id),
    }));
  }

  getScenario(id: string): Scenario {
    const scenario = this.scenarios.get(id);
    if (!scenario) throw new NotFoundException(`Scenario "${id}" not found`);
    return scenario;
  }

  getStep(scenarioId: string, stepId: string): { scenario: Scenario; step: ScenarioStep } {
    const scenario = this.getScenario(scenarioId);
    const step = scenario.steps.find((s) => s.id === stepId);
    if (!step) throw new NotFoundException(`Step "${stepId}" not found in "${scenarioId}"`);
    return { scenario, step };
  }
}
